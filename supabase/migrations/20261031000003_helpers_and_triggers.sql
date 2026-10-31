-- =============================================================================
-- EasyInternshipp — 03: helper functions, auth hooks, business-rule triggers
-- All functions here live in the non-exposed `private` schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Column defaults that capture the acting user (RLS policies then verify them)
-- -----------------------------------------------------------------------------
alter table public.jobs                    alter column created_by   set default auth.uid();
alter table public.company_documents       alter column submitted_by set default auth.uid();
alter table public.university_partnerships alter column created_by   set default auth.uid();
alter table public.cvs                     alter column student_id   set default auth.uid();
alter table public.student_skills          alter column student_id   set default auth.uid();
alter table public.saved_jobs              alter column student_id   set default auth.uid();
alter table public.company_follows         alter column student_id   set default auth.uid();
alter table public.job_alerts              alter column student_id   set default auth.uid();
alter table public.evaluations             alter column evaluator_id set default auth.uid();
alter table public.messages                alter column sender_id    set default auth.uid();
alter table public.posts                   alter column author_id    set default auth.uid();
alter table public.post_comments           alter column author_id    set default auth.uid();
alter table public.post_likes              alter column user_id      set default auth.uid();
alter table public.post_bookmarks          alter column user_id      set default auth.uid();
alter table public.reports                 alter column reporter_id  set default auth.uid();
alter table public.events                  alter column created_by   set default auth.uid();

-- -----------------------------------------------------------------------------
-- Generic utilities
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'student_profiles', 'companies', 'university_partnerships', 'cvs', 'jobs',
    'applications', 'interviews', 'evaluations', 'offers', 'posts', 'post_comments',
    'notification_preferences', 'job_alerts', 'events', 'internship_reports', 'platform_settings'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;

-- Raise a client-facing error when a condition is not met.
-- errcode 42501 → HTTP 401/403 through PostgREST, P0001 → 400.
create or replace function private.assert(p_condition boolean, p_message text, p_errcode text default 'P0001')
returns void language plpgsql set search_path = '' as $$
begin
  if p_condition is not true then
    raise exception using message = p_message, errcode = p_errcode;
  end if;
end;
$$;

create or replace function private.setting(p_key text, p_default jsonb)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.platform_settings where key = p_key), p_default)
$$;

create or replace function private.request_ip()
returns inet language plpgsql stable set search_path = '' as $$
declare
  v_ip text;
begin
  v_ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  return nullif(trim(v_ip), '')::inet;
exception when others then
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Authorization helpers used by RLS policies and RPCs.
-- SECURITY DEFINER so they can read membership tables without recursive RLS.
-- A suspended / pending account is treated as having no role.
-- -----------------------------------------------------------------------------
create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'active')
$$;

create or replace function private.current_user_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and status = 'active'
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                 where id = (select auth.uid()) and role = 'admin' and status = 'active')
$$;

create or replace function private.is_company_member(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = p_company and m.user_id = (select auth.uid()) and p.status = 'active'
  )
$$;

create or replace function private.is_company_manager(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = p_company and m.user_id = (select auth.uid())
      and m.member_role in ('owner', 'admin') and p.status = 'active'
  )
$$;

create or replace function private.officer_university_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select o.university_id
  from public.university_officers o
  join public.profiles p on p.id = o.user_id
  where o.user_id = (select auth.uid()) and p.status = 'active' and p.role = 'university_officer'
$$;

create or replace function private.is_verified_student_of(p_university uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_profiles s
    join public.profiles p on p.id = s.user_id
    where s.user_id = (select auth.uid()) and s.university_id = p_university
      and s.verification_status = 'verified' and p.status = 'active'
  )
$$;

create or replace function private.job_company_id(p_job uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select company_id from public.jobs where id = p_job
$$;

create or replace function private.application_company_id(p_application uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select j.company_id from public.applications a join public.jobs j on j.id = a.job_id where a.id = p_application
$$;

create or replace function private.question_company_id(p_question uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select j.company_id from public.screening_questions q join public.jobs j on j.id = q.job_id where q.id = p_question
$$;

create or replace function private.has_applied(p_job uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.applications where job_id = p_job and student_id = (select auth.uid()))
$$;

-- University officers can see students linked to their university (to verify and monitor them)
create or replace function private.officer_can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_profiles s
    where s.user_id = p_student and s.university_id is not null
      and s.university_id = private.officer_university_id()
  )
$$;

create or replace function private.can_view_student(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_student = (select auth.uid())
      or private.is_admin()
      or private.officer_can_view_student(p_student)
      or exists (  -- recruiters see candidates who applied to their company
           select 1 from public.applications a
           join public.jobs j on j.id = a.job_id
           where a.student_id = p_student and private.is_company_member(j.company_id)
         )
$$;

create or replace function private.can_view_profile(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_view_student(p_user)
      or exists (  -- people you share a conversation with
           select 1 from public.conversation_participants me
           join public.conversation_participants other on other.conversation_id = me.conversation_id
           where me.user_id = (select auth.uid()) and other.user_id = p_user
         )
      or exists (  -- teammates in the same company
           select 1 from public.company_members me
           join public.company_members other on other.company_id = me.company_id
           where me.user_id = (select auth.uid()) and other.user_id = p_user
         )
$$;

create or replace function private.can_view_application(p_application uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = p_application
      and (a.student_id = (select auth.uid())
           or private.is_company_member(j.company_id)
           or private.is_admin()
           or private.officer_can_view_student(a.student_id))
  )
$$;

create or replace function private.company_can_view_cv(p_cv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.cv_id = p_cv and private.is_company_member(j.company_id)
  )
$$;

create or replace function private.is_conversation_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants
                 where conversation_id = p_conversation and user_id = (select auth.uid()))
$$;

create or replace function private.is_event_organizer(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event
      and (private.is_admin()
           or (e.organizer_university_id is not null and e.organizer_university_id = private.officer_university_id()))
  )
$$;

-- Anonymous posts are hidden from the base table, so comment policies check the post here
create or replace function private.post_accepts_comments(p_post uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts where id = p_post and status = 'published')
$$;

grant execute on function
  private.post_accepts_comments(uuid),
  private.is_active_user(), private.current_user_role(), private.is_admin(),
  private.is_company_member(uuid), private.is_company_manager(uuid), private.officer_university_id(),
  private.is_verified_student_of(uuid), private.job_company_id(uuid), private.application_company_id(uuid),
  private.question_company_id(uuid), private.has_applied(uuid), private.officer_can_view_student(uuid),
  private.can_view_student(uuid), private.can_view_profile(uuid), private.can_view_application(uuid),
  private.company_can_view_cv(uuid), private.is_conversation_participant(uuid), private.is_event_organizer(uuid)
to anon, authenticated, service_role;

-- Returns the caller's id, or fails when not signed in / not active.
create or replace function private.require_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  perform private.assert(v_user is not null, 'Bạn cần đăng nhập để thực hiện thao tác này', '42501');
  perform private.assert(private.is_active_user(), 'Tài khoản chưa được kích hoạt hoặc đã bị khóa', '42501');
  return v_user;
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit log & notifications
-- -----------------------------------------------------------------------------
create or replace function private.log_audit(
  p_action text, p_target_table text, p_target_id text,
  p_reason text default null, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, reason, metadata, ip_address)
  values ((select auth.uid()),
          (select role from public.profiles where id = (select auth.uid())),
          p_action, p_target_table, p_target_id, p_reason, coalesce(p_metadata, '{}'::jsonb), private.request_ip());
end;
$$;

create or replace function private.notify(
  p_user uuid, p_type public.notification_type, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then
    return;
  end if;
  -- Users who turned off in-app notifications still receive workflow-critical ones
  if p_type in ('message', 'job_alert', 'event', 'report_update', 'system')
     and exists (select 1 from public.notification_preferences where user_id = p_user and not in_app) then
    return;
  end if;
  insert into public.notifications (user_id, type, title, body, link, data)
  values (p_user, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb));
end;
$$;

create or replace function private.notify_company(
  p_company uuid, p_type public.notification_type, p_title text,
  p_body text default null, p_link text default null, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  for v_member in
    select m.user_id from public.company_members m
    join public.profiles p on p.id = m.user_id
    where m.company_id = p_company and p.status = 'active'
  loop
    perform private.notify(v_member, p_type, p_title, p_body, p_link, p_data);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Supabase Auth hook: create the profile rows when someone signs up.
-- Expected sign-up metadata (supabase.auth.signUp({ options: { data } })):
--   { role: 'student' | 'employer' | 'university_officer', full_name, phone,
--     university_id?, student_code?, major? }
-- 'admin' can never be self-assigned; officers start as pending_verification.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role   public.user_role;
  v_phone  text := nullif(trim(v_meta ->> 'phone'), '');
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  v_uni    uuid := private.try_uuid(v_meta ->> 'university_id');
begin
  v_role := case v_meta ->> 'role'
              when 'employer' then 'employer'::public.user_role
              when 'university_officer' then 'university_officer'::public.user_role
              else 'student'::public.user_role
            end;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ]{8,15}$' then
    v_phone := null;  -- never block sign-up on a malformed optional field
  end if;
  if v_uni is not null and not exists (select 1 from public.universities where id = v_uni) then
    v_uni := null;
  end if;

  insert into public.profiles (id, role, status, full_name, email, phone)
  values (
    new.id, v_role,
    case when v_role = 'university_officer' then 'pending_verification'::public.account_status
         else 'active'::public.account_status end,
    left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)), 120),
    new.email, v_phone
  );

  insert into public.notification_preferences (user_id) values (new.id);

  if v_role = 'student' then
    if v_uni is null and v_domain <> '' then  -- auto-link by university e-mail domain
      select id into v_uni from public.universities
      where email_domain is not null and (v_domain = email_domain or v_domain like '%.' || email_domain)
      limit 1;
    end if;
    insert into public.student_profiles (user_id, university_id, student_code, major)
    values (new.id, v_uni, nullif(trim(v_meta ->> 'student_code'), ''), nullif(trim(v_meta ->> 'major'), ''))
    on conflict (university_id, student_code) do nothing;
    if not found then  -- MSSV already claimed: keep the account, leave the code empty
      insert into public.student_profiles (user_id, university_id, major)
      values (new.id, v_uni, nullif(trim(v_meta ->> 'major'), ''));
    end if;
  elsif v_role = 'university_officer' and v_uni is not null then
    insert into public.university_officers (user_id, university_id, officer_code, department, title)
    values (new.id, v_uni, nullif(trim(v_meta ->> 'officer_code'), ''),
            nullif(trim(v_meta ->> 'department'), ''), nullif(trim(v_meta ->> 'title'), ''));
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Identity changes invalidate verification (student MSSV / company name & MST)
-- -----------------------------------------------------------------------------
create or replace function private.student_profiles_reset_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.university_id is distinct from old.university_id or new.student_code is distinct from old.student_code)
     and old.verification_status in ('pending', 'verified') then
    new.verification_status := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger reset_verification before update on public.student_profiles
  for each row execute function private.student_profiles_reset_verification();

create or replace function private.companies_reset_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.name is distinct from old.name or new.tax_code is distinct from old.tax_code)
     and old.verification_status in ('pending', 'verified') then
    new.verification_status := 'unverified';
    new.verified_by := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger reset_verification before update on public.companies
  for each row execute function private.companies_reset_verification();

-- A company must always keep at least one owner
create or replace function private.company_members_keep_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.member_role = 'owner'
     and (tg_op = 'DELETE' or new.member_role <> 'owner')
     and not exists (select 1 from public.company_members
                     where company_id = old.company_id and member_role = 'owner' and user_id <> old.user_id)
     and exists (select 1 from public.companies where id = old.company_id) then
    raise exception using message = 'Công ty cần ít nhất một chủ sở hữu (owner)', errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger keep_owner before update or delete on public.company_members
  for each row execute function private.company_members_keep_owner();

create or replace function private.company_follows_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.companies
  set follower_count = greatest(follower_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
  where id = coalesce(new.company_id, old.company_id);
  return null;
end;
$$;

create trigger follower_count after insert or delete on public.company_follows
  for each row execute function private.company_follows_count();

-- Only one default CV per student: setting a new default clears the old one
create or replace function private.cvs_single_default()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_default then
    update public.cvs set is_default = false
    where student_id = new.student_id and id <> new.id and is_default;
  end if;
  if new.is_public and new.public_slug is null then
    new.public_slug := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  end if;
  return new;
end;
$$;

create trigger single_default before insert or update of is_default, is_public on public.cvs
  for each row execute function private.cvs_single_default();

-- -----------------------------------------------------------------------------
-- Jobs
-- -----------------------------------------------------------------------------
create or replace function private.jobs_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- University-exclusive postings need (re-)approval whenever the target university changes
  if new.university_id is null then
    new.university_approval := null;
  elsif tg_op = 'INSERT' then
    new.university_approval := 'pending';
  elsif new.university_id is distinct from old.university_id then
    new.university_approval := 'pending';
    new.university_note := null;
  end if;

  -- Material edits to a live posting send it back to moderation (prevents bait-and-switch)
  if tg_op = 'UPDATE' and old.status = 'active' and new.status = 'active' and (
       new.title        is distinct from old.title
    or new.description  is distinct from old.description
    or new.requirements is distinct from old.requirements
    or new.benefits     is distinct from old.benefits
    or new.stipend_min  is distinct from old.stipend_min
    or new.stipend_max  is distinct from old.stipend_max) then
    new.status := 'pending_approval';
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger jobs_before_write before insert or update on public.jobs
  for each row execute function private.jobs_before_write();

-- Every job gets its own Kanban columns (names configurable in platform_settings)
create or replace function private.jobs_create_pipeline()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pipeline_stages (job_id, name, position)
  select new.id, s.name, (s.ord - 1)::smallint
  from jsonb_array_elements_text(
         private.setting('default_pipeline_stages',
                         '["Ứng tuyển mới", "Sàng lọc CV", "Phỏng vấn", "Offer", "Đã tuyển"]'::jsonb)
       ) with ordinality as s(name, ord);
  return null;
end;
$$;

create trigger jobs_create_pipeline after insert on public.jobs
  for each row execute function private.jobs_create_pipeline();

-- -----------------------------------------------------------------------------
-- Applications: state machine, history, notifications, counters
-- -----------------------------------------------------------------------------
create or replace function private.application_transition_ok(p_from public.application_status, p_to public.application_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'applied'      then p_to in ('cv_viewed', 'shortlisted', 'interviewing', 'rejected', 'withdrawn')
    when 'cv_viewed'    then p_to in ('shortlisted', 'interviewing', 'rejected', 'withdrawn')
    when 'shortlisted'  then p_to in ('interviewing', 'offered', 'rejected', 'withdrawn')
    when 'interviewing' then p_to in ('offered', 'rejected', 'withdrawn')
    when 'offered'      then p_to in ('hired', 'offer_declined', 'rejected')
    else false            -- hired, rejected, withdrawn, offer_declined are terminal
  end
$$;

create or replace function private.applications_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.stage_id is null then
      select id into new.stage_id from public.pipeline_stages
      where job_id = new.job_id order by position limit 1;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if not private.application_transition_ok(old.status, new.status) then
      raise exception using
        message = format('Không thể chuyển trạng thái đơn từ %s sang %s', old.status, new.status),
        errcode = 'P0001';
    end if;
    new.status_changed_at := now();
    if new.status <> 'withdrawn' then
      new.viewed_at := coalesce(new.viewed_at, now());  -- any employer action implies the CV was seen
    end if;
    if new.status = 'hired' then
      new.hired_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_before_write before insert or update on public.applications
  for each row execute function private.applications_before_write();

create or replace function private.applications_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_job     record;
  v_note    text := nullif(current_setting('app.status_note', true), '');
  v_student text := '/pages/profile/?tab=applications&application=' || new.id;
  v_company text := '/pages/candidates/?application=' || new.id;
  v_data    jsonb := jsonb_build_object('application_id', new.id, 'job_id', new.job_id, 'status', new.status);
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.application_status_history (application_id, from_status, to_status, changed_by, note)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, (select auth.uid()), v_note);

  select j.title, j.company_id into v_job from public.jobs j where j.id = new.job_id;

  case new.status
    when 'applied' then
      perform private.notify_company(v_job.company_id, 'application_received',
        format('Ứng viên mới cho "%s"', v_job.title),
        (select full_name from public.profiles where id = new.student_id), v_company, v_data);
    when 'cv_viewed' then
      perform private.notify(new.student_id, 'cv_viewed', 'Nhà tuyển dụng đã xem CV của bạn',
        v_job.title, v_student, v_data);
    when 'shortlisted' then
      perform private.notify(new.student_id, 'application_status', 'Hồ sơ của bạn đã qua vòng sàng lọc',
        v_job.title, v_student, v_data);
    when 'rejected' then
      perform private.notify(new.student_id, 'application_status', format('Kết quả ứng tuyển "%s"', v_job.title),
        coalesce(new.rejection_reason, v_note), v_student, v_data);
    when 'offered' then
      perform private.notify(new.student_id, 'offer_received', 'Bạn nhận được thư mời nhận việc',
        v_job.title, v_student, v_data);
    when 'hired' then
      perform private.notify_company(v_job.company_id, 'offer_response', 'Ứng viên đã chấp nhận offer',
        v_job.title, v_company, v_data);
    when 'offer_declined' then
      perform private.notify_company(v_job.company_id, 'offer_response', 'Ứng viên đã từ chối offer',
        coalesce(v_note, v_job.title), v_company, v_data);
    when 'withdrawn' then
      perform private.notify_company(v_job.company_id, 'application_status', 'Ứng viên đã rút hồ sơ',
        coalesce(new.withdrawal_reason, v_job.title), v_company, v_data);
    else
      null;  -- 'interviewing' is notified by schedule_interview() with the meeting details
  end case;
  return null;
end;
$$;

create trigger applications_after_write after insert or update of status on public.applications
  for each row execute function private.applications_after_write();

create or replace function private.applications_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.jobs
  set application_count = greatest(application_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
  where id = coalesce(new.job_id, old.job_id);
  return null;
end;
$$;

create trigger applications_count after insert or delete on public.applications
  for each row execute function private.applications_count();

-- Application score = average of its scorecards
create or replace function private.evaluations_refresh_score()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_application uuid := coalesce(new.application_id, old.application_id);
begin
  update public.applications
  set score = (select round(avg(score))::smallint from public.evaluations where application_id = v_application)
  where id = v_application;
  return null;
end;
$$;

create trigger evaluations_refresh_score after insert or update of score or delete on public.evaluations
  for each row execute function private.evaluations_refresh_score();

-- -----------------------------------------------------------------------------
-- Messaging
-- -----------------------------------------------------------------------------
create or replace function private.messages_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_before_update before update on public.messages
  for each row execute function private.messages_before_update();

create or replace function private.messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
  v_sender    text;
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = left(coalesce(new.body, new.attachment_name, ''), 140)
  where id = new.conversation_id;

  update public.conversation_participants
  set last_read_at = new.created_at, is_archived = false
  where conversation_id = new.conversation_id and user_id = new.sender_id;

  if new.kind in ('text', 'file') then
    select full_name into v_sender from public.profiles where id = new.sender_id;
    for v_recipient in
      select cp.user_id from public.conversation_participants cp
      where cp.conversation_id = new.conversation_id
        and cp.user_id is distinct from new.sender_id and not cp.is_muted
        -- one unread "new message" notification per conversation is enough
        and not exists (select 1 from public.notifications n
                        where n.user_id = cp.user_id and n.type = 'message' and n.read_at is null
                          and n.data ->> 'conversation_id' = new.conversation_id::text)
    loop
      perform private.notify(v_recipient, 'message', coalesce('Tin nhắn mới từ ' || v_sender, 'Tin nhắn mới'),
        left(coalesce(new.body, new.attachment_name), 140), '/pages/messages/?conversation=' || new.conversation_id,
        jsonb_build_object('conversation_id', new.conversation_id));
    end loop;
  end if;
  return null;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.messages_after_insert();

-- -----------------------------------------------------------------------------
-- Community
-- -----------------------------------------------------------------------------
-- Company reviews are only accepted from people who actually interned there
create or replace function private.posts_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'review' and not exists (
       select 1 from public.applications a
       join public.jobs j on j.id = a.job_id
       where a.student_id = new.author_id and j.company_id = new.company_id and a.status = 'hired') then
    raise exception using message = 'Chỉ thực tập sinh đã nhận việc tại công ty mới có thể viết đánh giá', errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger posts_before_insert before insert on public.posts
  for each row execute function private.posts_before_insert();

create or replace function private.post_likes_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.posts
  set like_count = greatest(like_count + case when tg_op = 'INSERT' then 1 else -1 end, 0)
  where id = coalesce(new.post_id, old.post_id);
  return null;
end;
$$;

create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function private.post_likes_count();

create or replace function private.post_comments_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post uuid := coalesce(new.post_id, old.post_id);
begin
  update public.posts
  set comment_count = (select count(*) from public.post_comments where post_id = v_post and status = 'published')
  where id = v_post;
  return null;
end;
$$;

create trigger post_comments_count after insert or delete or update of status on public.post_comments
  for each row execute function private.post_comments_count();

-- -----------------------------------------------------------------------------
-- Reports: basic abuse protection (no duplicates, daily cap per user)
-- -----------------------------------------------------------------------------
create or replace function private.reports_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reporter_id is not null then
    if exists (select 1 from public.reports
               where reporter_id = new.reporter_id and target_type = new.target_type
                 and target_id = new.target_id and status in ('open', 'in_review')) then
      raise exception using message = 'Bạn đã báo cáo nội dung này, ban quản trị đang xử lý', errcode = 'P0001';
    end if;
    if (select count(*) from public.reports
        where reporter_id = new.reporter_id and created_at > now() - interval '1 day') >= 20 then
      raise exception using message = 'Bạn đã gửi quá nhiều báo cáo hôm nay', errcode = 'P0001';
    end if;
  end if;
  new.status := 'open';
  return new;
end;
$$;

create trigger reports_before_insert before insert on public.reports
  for each row execute function private.reports_before_insert();
