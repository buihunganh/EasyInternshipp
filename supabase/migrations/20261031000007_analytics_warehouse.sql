-- =============================================================================
-- EasyInternshipp — 07: analytics schema (data warehouse layer)
--
-- Star schema built from the operational tables:
--   dimensions : dim_date, dim_university, dim_company, dim_job, dim_student
--   facts      : fact_applications, fact_application_events, fact_job_activity_daily,
--                fact_signups, fact_reports, fact_admin_actions, fact_messages_daily,
--                fact_community_daily, fact_event_participation
--   KPI views  : kpi_platform_daily, kpi_company_funnel, kpi_job_funnel,
--                kpi_university_placement, kpi_moderation_monthly
--
-- * Facts/dimensions are materialized views refreshed by analytics.refresh_all()
--   (scheduled nightly by pg_cron in 08).
-- * Dates are bucketed in Vietnam time (Asia/Ho_Chi_Minh).
-- * No names, e-mails or phone numbers are copied into the warehouse; people are
--   referenced only by id (pseudonymous).
-- * The schema is not exposed to anon/authenticated. Dashboards read it through
--   the get_* RPCs at the bottom; BI tools connect with the analytics_reader role.
-- =============================================================================

create or replace function analytics.date_key(p_ts timestamptz)
returns integer language sql immutable parallel safe set search_path = '' as $$
  select (extract(year from d) * 10000 + extract(month from d) * 100 + extract(day from d))::integer
  from (select (p_ts at time zone 'Asia/Ho_Chi_Minh')::date as d) x
$$;

-- -----------------------------------------------------------------------------
-- Dimensions
-- -----------------------------------------------------------------------------
create table analytics.dim_date (
  date_key       integer primary key,
  date           date not null unique,
  day            smallint not null,
  month          smallint not null,
  quarter        smallint not null,
  year           smallint not null,
  iso_week       smallint not null,
  day_of_week    smallint not null,   -- 1 = Monday … 7 = Sunday
  is_weekend     boolean not null,
  month_start    date not null,
  academic_year  text not null,       -- Vietnamese academic year starts in September: '2026-2027'
  semester       text not null        -- HK1 (Sep–Jan), HK2 (Feb–Jun), HK3 (summer, Jul–Aug)
);

insert into analytics.dim_date
select (extract(year from d) * 10000 + extract(month from d) * 100 + extract(day from d))::integer,
       d::date,
       extract(day from d), extract(month from d), extract(quarter from d), extract(year from d),
       extract(week from d), extract(isodow from d), extract(isodow from d) in (6, 7),
       date_trunc('month', d)::date,
       case when extract(month from d) >= 9
            then extract(year from d)::int || '-' || (extract(year from d)::int + 1)
            else (extract(year from d)::int - 1) || '-' || extract(year from d)::int end,
       case when extract(month from d) in (9, 10, 11, 12, 1) then 'HK1'
            when extract(month from d) between 2 and 6 then 'HK2'
            else 'HK3' end
from generate_series(date '2024-01-01', date '2035-12-31', interval '1 day') as g(d);

create materialized view analytics.dim_university as
  select u.id as university_id, u.name, u.short_name, u.city
  from public.universities u;
create unique index on analytics.dim_university (university_id);

create materialized view analytics.dim_company as
  select c.id as company_id, c.name, i.name as industry, c.city, c.company_size,
         c.verification_status, c.follower_count,
         analytics.date_key(c.created_at)  as created_date_key,
         analytics.date_key(c.verified_at) as verified_date_key,
         (select count(*) from public.company_members m where m.company_id = c.id) as member_count
  from public.companies c
  left join public.industries i on i.id = c.industry_id;
create unique index on analytics.dim_company (company_id);

create materialized view analytics.dim_job as
  select j.id as job_id, j.company_id, j.title, i.name as industry, j.city, j.work_type, j.schedule,
         j.duration_months, j.openings, j.stipend_min, j.stipend_max, j.status,
         (j.university_id is not null) as is_exclusive, j.university_id,
         analytics.date_key(j.created_at)   as created_date_key,
         analytics.date_key(j.submitted_at) as submitted_date_key,
         analytics.date_key(j.published_at) as published_date_key,
         analytics.date_key(j.closed_at)    as closed_date_key,
         j.deadline, j.view_count, j.application_count
  from public.jobs j
  left join public.industries i on i.id = j.industry_id;
create unique index on analytics.dim_job (job_id);
create index on analytics.dim_job (company_id);

create materialized view analytics.dim_student as
  select s.user_id as student_id, s.university_id, s.major, s.graduation_year, s.city,
         s.verification_status, p.status as account_status,
         analytics.date_key(p.created_at) as signup_date_key,
         (select count(*) from public.student_skills ss where ss.student_id = s.user_id) as skill_count
  from public.student_profiles s
  join public.profiles p on p.id = s.user_id;
create unique index on analytics.dim_student (student_id);
create index on analytics.dim_student (university_id);

-- -----------------------------------------------------------------------------
-- Facts
-- -----------------------------------------------------------------------------
-- One row per application with funnel milestones (accumulating snapshot)
create materialized view analytics.fact_applications as
  select a.id as application_id, a.job_id, j.company_id, a.student_id, s.university_id,
         analytics.date_key(a.applied_at) as applied_date_key,
         analytics.date_key(a.hired_at)   as hired_date_key,
         a.applied_at, a.status,
         (a.viewed_at is not null)                  as reached_cv_viewed,
         coalesce(h.reached_shortlist, false)       as reached_shortlist,
         coalesce(h.reached_interview, false)       as reached_interview,
         coalesce(h.reached_offer, false)           as reached_offer,
         (a.status = 'hired')                       as hired,
         (a.status = 'rejected')                    as rejected,
         (a.status = 'withdrawn')                   as withdrawn,
         (a.status = 'offer_declined')              as offer_declined,
         round((extract(epoch from (a.viewed_at - a.applied_at)) / 3600)::numeric, 2) as hours_to_first_view,
         round((extract(epoch from (a.hired_at - a.applied_at)) / 86400)::numeric, 2) as days_to_hire,
         coalesce(i.interview_count, 0)             as interview_count,
         e.avg_score,
         o.stipend_amount                           as offer_stipend,
         a.knockout_passed
  from public.applications a
  join public.jobs j on j.id = a.job_id
  left join public.student_profiles s on s.user_id = a.student_id
  left join lateral (
    select bool_or(to_status in ('shortlisted', 'interviewing', 'offered', 'hired', 'offer_declined')) as reached_shortlist,
           bool_or(to_status = 'interviewing')                                                          as reached_interview,
           bool_or(to_status in ('offered', 'hired', 'offer_declined'))                                  as reached_offer
    from public.application_status_history where application_id = a.id
  ) h on true
  left join lateral (
    select count(*) as interview_count from public.interviews where application_id = a.id and status <> 'cancelled'
  ) i on true
  left join lateral (
    select round(avg(score), 1) as avg_score from public.evaluations where application_id = a.id
  ) e on true
  left join lateral (
    select stipend_amount from public.offers where application_id = a.id order by sent_at desc limit 1
  ) o on true;
create unique index on analytics.fact_applications (application_id);
create index on analytics.fact_applications (company_id);
create index on analytics.fact_applications (university_id);
create index on analytics.fact_applications (applied_date_key);

-- One row per status transition (transaction fact) with time spent in the previous status
create materialized view analytics.fact_application_events as
  select h.id as event_id, h.application_id, a.job_id, j.company_id, h.from_status, h.to_status,
         analytics.date_key(h.changed_at) as date_key, h.changed_at,
         round((extract(epoch from (h.changed_at - lag(h.changed_at) over w)) / 3600)::numeric, 2) as hours_in_previous_status
  from public.application_status_history h
  join public.applications a on a.id = h.application_id
  join public.jobs j on j.id = a.job_id
  window w as (partition by h.application_id order by h.changed_at, h.id);
create unique index on analytics.fact_application_events (event_id);
create index on analytics.fact_application_events (company_id, date_key);

-- Job engagement per day (periodic snapshot)
create materialized view analytics.fact_job_activity_daily as
  with v as (
    select job_id, analytics.date_key(viewed_at) as date_key, count(*) as views, count(distinct viewer_id) as unique_viewers
    from public.job_views group by 1, 2
  ), ap as (
    select job_id, analytics.date_key(applied_at) as date_key, count(*) as applications
    from public.applications group by 1, 2
  ), sv as (
    select job_id, analytics.date_key(created_at) as date_key, count(*) as saves
    from public.saved_jobs group by 1, 2
  ), keys as (
    select job_id, date_key from v union select job_id, date_key from ap union select job_id, date_key from sv
  )
  select k.job_id, k.date_key, j.company_id,
         coalesce(v.views, 0) as views, coalesce(v.unique_viewers, 0) as unique_viewers,
         coalesce(ap.applications, 0) as applications, coalesce(sv.saves, 0) as saves
  from keys k
  join public.jobs j on j.id = k.job_id
  left join v  on v.job_id  = k.job_id and v.date_key  = k.date_key
  left join ap on ap.job_id = k.job_id and ap.date_key = k.date_key
  left join sv on sv.job_id = k.job_id and sv.date_key = k.date_key;
create unique index on analytics.fact_job_activity_daily (job_id, date_key);
create index on analytics.fact_job_activity_daily (company_id, date_key);

create materialized view analytics.fact_signups as
  select p.id as user_id, p.role, p.status, analytics.date_key(p.created_at) as date_key, s.university_id
  from public.profiles p
  left join public.student_profiles s on s.user_id = p.id;
create unique index on analytics.fact_signups (user_id);
create index on analytics.fact_signups (date_key);

create materialized view analytics.fact_reports as
  select r.id as report_id, r.target_type, r.reason, r.status, r.action_taken,
         (r.reporter_id is null) as is_guest_report,
         analytics.date_key(r.created_at) as date_key, r.created_at,
         round((extract(epoch from (r.resolved_at - r.created_at)) / 3600)::numeric, 2) as hours_to_resolve
  from public.reports r;
create unique index on analytics.fact_reports (report_id);

-- Every audited admin / workflow action; job decisions carry their waiting time
create materialized view analytics.fact_admin_actions as
  select l.id as audit_id, l.action, l.target_table, l.target_id, l.actor_id, l.actor_role,
         analytics.date_key(l.created_at) as date_key, l.created_at,
         case when l.action in ('job.approve', 'job.reject') and j.submitted_at <= l.created_at
              then round((extract(epoch from (l.created_at - j.submitted_at)) / 3600)::numeric, 2) end as hours_waiting
  from public.audit_logs l
  left join public.jobs j on l.target_table = 'jobs' and j.id = private.try_uuid(l.target_id);
create unique index on analytics.fact_admin_actions (audit_id);
create index on analytics.fact_admin_actions (action, date_key);

create materialized view analytics.fact_messages_daily as
  select analytics.date_key(m.created_at) as date_key,
         coalesce(p.role::text, 'deleted') as sender_role,
         count(*) as messages,
         count(distinct m.conversation_id) as active_conversations
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  group by 1, 2;
create unique index on analytics.fact_messages_daily (date_key, sender_role);

create materialized view analytics.fact_community_daily as
  with x as (
    select analytics.date_key(created_at) as date_key, type::text as post_type, 1 as posts, 0 as comments, 0 as likes
    from public.posts
    union all
    select analytics.date_key(c.created_at), p.type::text, 0, 1, 0
    from public.post_comments c join public.posts p on p.id = c.post_id
    union all
    select analytics.date_key(l.created_at), p.type::text, 0, 0, 1
    from public.post_likes l join public.posts p on p.id = l.post_id
  )
  select date_key, post_type, sum(posts)::int as posts, sum(comments)::int as comments, sum(likes)::int as likes
  from x group by 1, 2;
create unique index on analytics.fact_community_daily (date_key, post_type);

create materialized view analytics.fact_event_participation as
  select e.id as event_id, e.organizer_university_id, e.status, analytics.date_key(e.starts_at) as date_key,
         (select count(*) from public.event_registrations r where r.event_id = e.id) as registrations,
         (select count(*) from public.event_registrations r where r.event_id = e.id and r.checked_in_at is not null) as check_ins,
         (select count(*) from public.event_booths b where b.event_id = e.id and b.status = 'approved') as booths_approved
  from public.events e;
create unique index on analytics.fact_event_participation (event_id);

-- -----------------------------------------------------------------------------
-- KPI views (always current with the last refresh)
-- -----------------------------------------------------------------------------
create view analytics.kpi_platform_daily as
  with su as (
    select date_key,
           count(*) filter (where role = 'student')            as new_students,
           count(*) filter (where role = 'employer')           as new_employers,
           count(*) filter (where role = 'university_officer') as new_officers
    from analytics.fact_signups group by date_key
  ), jp as (
    select published_date_key as date_key, count(*) as jobs_published
    from analytics.dim_job where published_date_key is not null group by 1
  ), ap as (
    select applied_date_key as date_key, count(*) as applications from analytics.fact_applications group by 1
  ), hi as (
    select hired_date_key as date_key, count(*) as hires from analytics.fact_applications where hired group by 1
  ), rp as (
    select date_key, count(*) as reports from analytics.fact_reports group by 1
  ), jv as (
    select date_key, sum(views) as job_views from analytics.fact_job_activity_daily group by 1
  )
  select d.date_key, d.date, d.academic_year, d.semester,
         coalesce(su.new_students, 0)  as new_students,
         coalesce(su.new_employers, 0) as new_employers,
         coalesce(su.new_officers, 0)  as new_officers,
         coalesce(jp.jobs_published, 0) as jobs_published,
         coalesce(jv.job_views, 0)     as job_views,
         coalesce(ap.applications, 0)  as applications,
         coalesce(hi.hires, 0)         as hires,
         coalesce(rp.reports, 0)       as reports
  from analytics.dim_date d
  left join su using (date_key)
  left join jp using (date_key)
  left join ap using (date_key)
  left join hi using (date_key)
  left join rp using (date_key)
  left join jv using (date_key)
  where d.date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and d.date >= coalesce((select min(dd.date) from analytics.fact_signups s join analytics.dim_date dd on dd.date_key = s.date_key),
                           (now() at time zone 'Asia/Ho_Chi_Minh')::date);

create view analytics.kpi_job_funnel as
  select j.job_id, j.company_id, j.title, j.status, j.published_date_key, j.view_count,
         count(f.application_id)                            as applications,
         count(*) filter (where f.reached_cv_viewed)        as cv_viewed,
         count(*) filter (where f.reached_shortlist)        as shortlisted,
         count(*) filter (where f.reached_interview)        as interviewed,
         count(*) filter (where f.reached_offer)            as offered,
         count(*) filter (where f.hired)                    as hired,
         count(*) filter (where f.rejected)                 as rejected,
         count(*) filter (where f.withdrawn)                as withdrawn,
         round(count(f.application_id)::numeric / nullif(j.view_count, 0), 4)                as view_to_apply_rate,
         round(count(*) filter (where f.hired)::numeric / nullif(count(f.application_id), 0), 4) as hire_rate,
         round(avg(f.hours_to_first_view), 1)               as avg_hours_to_first_view,
         round(avg(f.days_to_hire), 1)                      as avg_days_to_hire,
         round(avg(f.avg_score), 1)                         as avg_score
  from analytics.dim_job j
  left join analytics.fact_applications f on f.job_id = j.job_id
  group by j.job_id, j.company_id, j.title, j.status, j.published_date_key, j.view_count;

create view analytics.kpi_company_funnel as
  select c.company_id, c.name, c.verification_status,
         (select count(*) from analytics.dim_job j where j.company_id = c.company_id)                          as jobs_total,
         (select count(*) from analytics.dim_job j where j.company_id = c.company_id and j.status = 'active') as jobs_active,
         count(f.application_id)                            as applications,
         count(*) filter (where f.reached_cv_viewed)        as cv_viewed,
         count(*) filter (where f.reached_shortlist)        as shortlisted,
         count(*) filter (where f.reached_interview)        as interviewed,
         count(*) filter (where f.reached_offer)            as offered,
         count(*) filter (where f.hired)                    as hired,
         round(count(*) filter (where f.reached_cv_viewed)::numeric / nullif(count(f.application_id), 0), 4) as cv_view_rate,
         round(count(*) filter (where f.hired)::numeric / nullif(count(*) filter (where f.reached_offer), 0), 4) as offer_acceptance_rate,
         round(avg(f.hours_to_first_view), 1)               as avg_hours_to_first_view,
         round(avg(f.days_to_hire), 1)                      as avg_days_to_hire
  from analytics.dim_company c
  left join analytics.fact_applications f on f.company_id = c.company_id
  group by c.company_id, c.name, c.verification_status;

-- Placement statistics per university and academic year (Ministry of Education reporting)
create view analytics.kpi_university_placement as
  with roster as (
    select university_id,
           count(*)                                                as registered_students,
           count(*) filter (where verification_status = 'verified') as verified_students
    from analytics.dim_student where university_id is not null group by university_id
  ), activity as (
    select f.university_id, d.academic_year,
           count(distinct f.student_id)                                    as students_applied,
           count(distinct f.student_id) filter (where f.reached_interview) as students_interviewed,
           count(distinct f.student_id) filter (where f.reached_offer)     as students_offered,
           count(distinct f.student_id) filter (where f.hired)             as students_hired,
           round(avg(f.offer_stipend) filter (where f.hired))              as avg_hired_stipend,
           round(avg(f.days_to_hire), 1)                                   as avg_days_to_hire
    from analytics.fact_applications f
    join analytics.dim_date d on d.date_key = f.applied_date_key
    where f.university_id is not null
    group by f.university_id, d.academic_year
  )
  select u.university_id, u.name as university, a.academic_year,
         coalesce(r.registered_students, 0) as registered_students,
         coalesce(r.verified_students, 0)   as verified_students,
         a.students_applied, a.students_interviewed, a.students_offered, a.students_hired,
         round(a.students_hired::numeric / nullif(a.students_applied, 0), 4) as placement_rate,
         a.avg_hired_stipend, a.avg_days_to_hire
  from activity a
  join analytics.dim_university u on u.university_id = a.university_id
  left join roster r on r.university_id = a.university_id;

create view analytics.kpi_moderation_monthly as
  with acts as (
    select date_trunc('month', created_at at time zone 'Asia/Ho_Chi_Minh')::date as month,
           count(*) filter (where action = 'job.approve')    as jobs_approved,
           count(*) filter (where action = 'job.reject')     as jobs_rejected,
           count(*) filter (where action = 'job.takedown')   as jobs_taken_down,
           count(*) filter (where action = 'company.verified') as companies_verified,
           count(*) filter (where action = 'user.suspended') as users_suspended,
           round(avg(hours_waiting), 1)                      as avg_hours_to_job_decision
    from analytics.fact_admin_actions group by 1
  ), rep as (
    select date_trunc('month', created_at at time zone 'Asia/Ho_Chi_Minh')::date as month,
           count(*)                                              as reports_opened,
           count(*) filter (where status in ('resolved', 'dismissed')) as reports_closed,
           count(*) filter (where reason = 'scam_fee')           as scam_fee_reports,
           round(avg(hours_to_resolve), 1)                       as avg_hours_to_resolve
    from analytics.fact_reports group by 1
  )
  select coalesce(a.month, r.month) as month,
         coalesce(a.jobs_approved, 0) as jobs_approved, coalesce(a.jobs_rejected, 0) as jobs_rejected,
         round(coalesce(a.jobs_rejected, 0)::numeric / nullif(coalesce(a.jobs_approved, 0) + coalesce(a.jobs_rejected, 0), 0), 4) as job_reject_rate,
         coalesce(a.jobs_taken_down, 0) as jobs_taken_down, coalesce(a.companies_verified, 0) as companies_verified,
         coalesce(a.users_suspended, 0) as users_suspended, a.avg_hours_to_job_decision,
         coalesce(r.reports_opened, 0) as reports_opened, coalesce(r.reports_closed, 0) as reports_closed,
         coalesce(r.scam_fee_reports, 0) as scam_fee_reports, r.avg_hours_to_resolve
  from acts a
  full join rep r on r.month = a.month;

-- -----------------------------------------------------------------------------
-- Refresh
-- -----------------------------------------------------------------------------
create table analytics.refresh_log (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text
);

create or replace function analytics.refresh_all()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_log bigint;
  v_mv  text;
begin
  insert into analytics.refresh_log default values returning id into v_log;
  foreach v_mv in array array[
    'dim_university', 'dim_company', 'dim_job', 'dim_student',
    'fact_applications', 'fact_application_events', 'fact_job_activity_daily', 'fact_signups',
    'fact_reports', 'fact_admin_actions', 'fact_messages_daily', 'fact_community_daily', 'fact_event_participation'
  ] loop
    execute format('refresh materialized view concurrently analytics.%I', v_mv);
  end loop;
  update analytics.refresh_log set finished_at = now() where id = v_log;
end;
$$;

-- -----------------------------------------------------------------------------
-- Access
-- -----------------------------------------------------------------------------
revoke all on all tables in schema analytics from public, anon, authenticated;
revoke all on all functions in schema analytics from public, anon, authenticated;
grant select on all tables in schema analytics to service_role;
grant execute on function analytics.refresh_all() to service_role;

-- Read-only role for BI tools (Metabase, Looker Studio, Power BI…).
-- Create a login for it with:  create user bi_user with password '...' in role analytics_reader;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader nologin;
  end if;
end;
$$;
grant usage on schema analytics to analytics_reader;
grant select on all tables in schema analytics to analytics_reader;
alter default privileges in schema analytics grant select on tables to analytics_reader;

-- -----------------------------------------------------------------------------
-- Dashboard RPCs (return JSON so the analytics schema stays private)
-- -----------------------------------------------------------------------------
create or replace function public.get_platform_kpis(
  p_from date default (current_date - 30), p_to date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên', '42501');
  return (select coalesce(jsonb_agg(to_jsonb(k) order by k.date), '[]'::jsonb)
          from analytics.kpi_platform_daily k where k.date between p_from and p_to);
end;
$$;

create or replace function public.get_company_funnel(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(p_company) or private.is_admin(), 'Bạn không thuộc công ty này', '42501');
  return jsonb_build_object(
    'company', (select to_jsonb(c) from analytics.kpi_company_funnel c where c.company_id = p_company),
    'jobs',    (select coalesce(jsonb_agg(to_jsonb(j) order by j.published_date_key desc nulls last), '[]'::jsonb)
                from analytics.kpi_job_funnel j where j.company_id = p_company),
    'refreshed_at', (select max(finished_at) from analytics.refresh_log));
end;
$$;

create or replace function public.get_university_placement(p_university uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_university uuid := coalesce(p_university, private.officer_university_id());
begin
  perform private.require_user();
  perform private.assert(v_university is not null
                         and (v_university = private.officer_university_id() or private.is_admin()),
                         'Bạn không có quyền xem báo cáo của trường này', '42501');
  return (select coalesce(jsonb_agg(to_jsonb(k) order by k.academic_year desc), '[]'::jsonb)
          from analytics.kpi_university_placement k where k.university_id = v_university);
end;
$$;

create or replace function public.get_moderation_kpis(p_months integer default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên', '42501');
  return (select coalesce(jsonb_agg(to_jsonb(k) order by k.month desc), '[]'::jsonb)
          from analytics.kpi_moderation_monthly k
          where k.month >= (date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1))::date);
end;
$$;
