-- =============================================================================
-- EasyInternshipp — 09: fields and read models the existing pages need
-- (IMPLEMENTATION_PLAN §5.1). Additive only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- post-job: department, target students, perks (headcount = existing jobs.openings)
-- -----------------------------------------------------------------------------
alter table public.jobs
  add column department         text check (char_length(department) <= 120),
  add column target_study_years smallint[] not null default '{}'
                                check (target_study_years <@ '{1,2,3,4,5,6}'::smallint[]),
  add column target_majors      text[] not null default '{}' check (cardinality(target_majors) <= 20),
  add column perks              text[] not null default '{}' check (cardinality(perks) <= 30);

grant insert (department, target_study_years, target_majors, perks),
      update (department, target_study_years, target_majors, perks) on public.jobs to authenticated;

-- -----------------------------------------------------------------------------
-- company page: office, mentors, culture… (typed in the frontend as CompanyProfile)
-- -----------------------------------------------------------------------------
alter table public.companies
  add column profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object');
grant update (profile) on public.companies to authenticated;

-- -----------------------------------------------------------------------------
-- Talent search is opt-in (decision D7)
-- -----------------------------------------------------------------------------
alter table public.student_profiles
  add column is_discoverable boolean not null default false;
grant update (is_discoverable) on public.student_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- "% Match" per applicant: same weighting as job_match_score (required skills count double)
-- -----------------------------------------------------------------------------
create or replace function public.application_match_scores(p_job uuid)
returns table (application_id uuid, match_score smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(private.job_company_id(p_job)) or private.is_admin(),
    'Bạn không có quyền xem ứng viên của tin này', '42501');
  return query
    select a.id,
           case when w.total is null then null
                else round(100.0 * coalesce(m.got, 0) / w.total)::smallint end
    from public.applications a
    cross join (select sum(case when js.is_required then 2 else 1 end) as total
                from public.job_skills js where js.job_id = p_job) w
    left join lateral (
      select sum(case when js.is_required then 2 else 1 end) as got
      from public.job_skills js
      join public.student_skills ss on ss.skill_id = js.skill_id and ss.student_id = a.student_id
      where js.job_id = p_job) m on true
    where a.job_id = p_job;
end;
$$;

-- -----------------------------------------------------------------------------
-- "Tìm kiếm Ứng viên": verified companies search students who opted in.
-- Returns no contact details; recruiters reach out through start_conversation().
-- -----------------------------------------------------------------------------
create or replace function public.search_candidates(
  p_query           text default null,
  p_skill_ids       integer[] default null,
  p_university_id   uuid default null,
  p_city            text default null,
  p_graduation_year integer default null,
  p_limit           integer default 20,
  p_offset          integer default 0)
returns table (
  user_id uuid, full_name text, avatar_path text, university_id uuid, university_name text,
  major text, graduation_year smallint, headline text, city text, is_verified boolean,
  skills text[], skill_matches integer, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
begin
  perform private.assert(exists (
      select 1 from public.company_members m
      join public.companies c on c.id = m.company_id
      where m.user_id = v_user and c.verification_status = 'verified'),
    'Chỉ doanh nghiệp đã xác thực mới tìm kiếm được ứng viên', '42501');
  return query
    with hits as (
      select s.user_id as uid, p.full_name as fname, p.avatar_path as avatar, s.university_id as uni_id,
             u.name as uni_name, s.major as maj, s.graduation_year as grad, s.headline as head, s.city as cty,
             (s.verification_status = 'verified') as verified,
             coalesce((select array_agg(sk.name order by sk.name) from public.student_skills x
                       join public.skills sk on sk.id = x.skill_id where x.student_id = s.user_id), '{}') as sk_names,
             (select count(*)::int from public.student_skills x
              where x.student_id = s.user_id and x.skill_id = any (coalesce(p_skill_ids, '{}'))) as matches
      from public.student_profiles s
      join public.profiles p on p.id = s.user_id and p.status = 'active' and p.role = 'student'
      left join public.universities u on u.id = s.university_id
      where s.is_discoverable
        and (p_university_id is null or s.university_id = p_university_id)
        and (p_graduation_year is null or s.graduation_year = p_graduation_year)
        and (p_city is null or private.unaccent_immutable(coalesce(s.city, '')) ilike '%' || private.unaccent_immutable(p_city) || '%')
        and (nullif(trim(p_query), '') is null
             or private.unaccent_immutable(concat_ws(' ', p.full_name, s.major, s.headline, s.bio))
                ilike '%' || private.unaccent_immutable(trim(p_query)) || '%')
    )
    select h.uid, h.fname, h.avatar, h.uni_id, h.uni_name, h.maj, h.grad, h.head, h.cty, h.verified,
           h.sk_names, h.matches, count(*) over ()
    from hits h
    where p_skill_ids is null or cardinality(p_skill_ids) = 0 or h.matches > 0
    order by h.matches desc, h.verified desc, h.fname
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- "Sao chép tin": copy a job (skills, screening questions and answer keys) as a new draft
-- -----------------------------------------------------------------------------
create or replace function public.duplicate_job(p_job uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_job  public.jobs;
  v_id   uuid := gen_random_uuid();
  v_q    record;
  v_new  uuid;
begin
  select * into v_job from public.jobs where id = p_job;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin tuyển dụng', 'P0002');
  perform private.assert(private.is_company_member(v_job.company_id), 'Bạn không thuộc công ty đăng tin này', '42501');

  insert into public.jobs (id, company_id, created_by, title, description, requirements, benefits, industry_id, city, address,
                           work_type, schedule, duration_months, openings, stipend_min, stipend_max, stipend_currency,
                           stipend_negotiable, deadline, university_id, department, target_study_years, target_majors, perks)
  values (v_id, v_job.company_id, v_user, left(v_job.title, 189) || ' (bản sao)', v_job.description, v_job.requirements,
          v_job.benefits, v_job.industry_id, v_job.city, v_job.address, v_job.work_type, v_job.schedule, v_job.duration_months,
          v_job.openings, v_job.stipend_min, v_job.stipend_max, v_job.stipend_currency, v_job.stipend_negotiable,
          case when v_job.deadline > now() then v_job.deadline end, v_job.university_id, v_job.department,
          v_job.target_study_years, v_job.target_majors, v_job.perks);

  insert into public.job_skills (job_id, skill_id, is_required)
  select v_id, skill_id, is_required from public.job_skills where job_id = p_job;

  for v_q in
    select q.*, k.ideal_answer from public.screening_questions q
    left join public.screening_question_keys k on k.question_id = q.id
    where q.job_id = p_job order by q.position
  loop
    insert into public.screening_questions (job_id, position, question, kind, options, is_required, is_knockout)
    values (v_id, v_q.position, v_q.question, v_q.kind, v_q.options, v_q.is_required, v_q.is_knockout)
    returning id into v_new;
    if v_q.ideal_answer is not null then
      insert into public.screening_question_keys (question_id, ideal_answer) values (v_new, v_q.ideal_answer);
    end if;
  end loop;

  perform private.log_audit('job.duplicate', 'jobs', v_id::text, null, jsonb_build_object('source_job', p_job));
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- "Lịch phỏng vấn hôm nay": interviews across the caller's companies in a time window
-- -----------------------------------------------------------------------------
create or replace function public.company_interviews(
  p_from timestamptz default date_trunc('day', now()),
  p_to   timestamptz default date_trunc('day', now()) + interval '1 day',
  p_company uuid default null)
returns table (
  interview_id uuid, application_id uuid, job_id uuid, job_title text, company_id uuid,
  candidate_id uuid, candidate_name text, candidate_avatar_path text, round smallint,
  scheduled_at timestamptz, duration_minutes smallint, mode public.interview_mode,
  meeting_url text, location text, status public.interview_status, rsvp public.rsvp_status, proposed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
begin
  return query
    select i.id, a.id, j.id, j.title, j.company_id, a.student_id, p.full_name, p.avatar_path, i.round,
           i.scheduled_at, i.duration_minutes, i.mode, i.meeting_url, i.location, i.status, i.rsvp, i.proposed_at
    from public.interviews i
    join public.applications a on a.id = i.application_id
    join public.jobs j on j.id = a.job_id
    join public.company_members m on m.company_id = j.company_id and m.user_id = v_user
    join public.profiles p on p.id = a.student_id
    where i.scheduled_at >= p_from and i.scheduled_at < p_to
      and (p_company is null or j.company_id = p_company)
      and private.is_company_member(j.company_id)
    order by i.scheduled_at;
end;
$$;

revoke execute on function public.application_match_scores(uuid),
  public.search_candidates(text, integer[], uuid, text, integer, integer, integer),
  public.duplicate_job(uuid),
  public.company_interviews(timestamptz, timestamptz, uuid)
from public, anon;
grant execute on function public.application_match_scores(uuid),
  public.search_candidates(text, integer[], uuid, text, integer, integer, integer),
  public.duplicate_job(uuid),
  public.company_interviews(timestamptz, timestamptz, uuid)
to authenticated, service_role;
