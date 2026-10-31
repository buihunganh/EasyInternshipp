-- =============================================================================
-- EasyInternshipp — 04: business workflows as RPCs (supabase.rpc('<name>', {...}))
--
-- Every status change in the diagrams goes through one of these functions, so
-- validation, notifications and audit logging happen in exactly one place.
-- Clients cannot write status columns directly (see column grants in 05).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
create or replace function public.ensure_skill(p_name text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(p_name);
  v_slug text := private.slugify(replace(replace(trim(p_name), '#', '-sharp'), '+', '-plus'));
  v_id   integer;
begin
  perform private.require_user();
  perform private.assert(char_length(v_name) between 1 and 60 and v_slug <> '', 'Tên kỹ năng không hợp lệ');
  insert into public.skills (name, slug) values (v_name, v_slug)
  on conflict (slug) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.skills where slug = v_slug;
  end if;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Companies & accounts (UC-01, UC-03, process 9.3/9.4)
-- -----------------------------------------------------------------------------
create or replace function public.create_company(
  p_name text,
  p_tax_code text default null,
  p_industry_id integer default null,
  p_city text default null,
  p_address text default null,
  p_website text default null,
  p_company_size text default null,
  p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_id   uuid := gen_random_uuid();
begin
  perform private.assert(private.current_user_role() = 'employer', 'Chỉ tài khoản nhà tuyển dụng mới tạo được công ty', '42501');
  insert into public.companies (id, name, slug, tax_code, industry_id, city, address, website, company_size, description, created_by)
  values (v_id, trim(p_name), concat_ws('-', nullif(private.slugify(p_name), ''), substr(v_id::text, 1, 6)),
          nullif(trim(p_tax_code), ''), p_industry_id, p_city, p_address, p_website, p_company_size, p_description, v_user);
  insert into public.company_members (company_id, user_id, member_role) values (v_id, v_user, 'owner');
  perform private.log_audit('company.create', 'companies', v_id::text);
  return v_id;
end;
$$;

create or replace function public.add_company_member(
  p_company uuid, p_email text, p_role public.company_member_role default 'recruiter')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  perform private.require_user();
  perform private.assert(private.is_company_manager(p_company), 'Chỉ quản lý công ty mới thêm được thành viên', '42501');
  select id into v_member from public.profiles
  where lower(email) = lower(trim(p_email)) and role = 'employer' and status = 'active';
  perform private.assert(v_member is not null, 'Không tìm thấy tài khoản nhà tuyển dụng với email này', 'P0002');
  insert into public.company_members (company_id, user_id, member_role) values (p_company, v_member, p_role)
  on conflict (company_id, user_id) do update set member_role = excluded.member_role;
  perform private.notify(v_member, 'account', 'Bạn đã được thêm vào nhóm tuyển dụng',
    (select name from public.companies where id = p_company), '/pages/employer/');
  perform private.log_audit('company.add_member', 'company_members', p_company::text, null,
    jsonb_build_object('user_id', v_member, 'role', p_role));
  return v_member;
end;
$$;

create or replace function public.submit_company_verification(p_company uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_company_manager(p_company), 'Chỉ quản lý công ty mới gửi được hồ sơ thẩm định', '42501');
  perform private.assert(exists (select 1 from public.companies where id = p_company and tax_code is not null),
    'Vui lòng nhập mã số thuế trước khi gửi thẩm định');
  perform private.assert(exists (select 1 from public.company_documents where company_id = p_company and status = 'pending'),
    'Vui lòng tải lên giấy phép kinh doanh (GPKD) trước khi gửi thẩm định');
  update public.companies set verification_status = 'pending', verification_note = null
  where id = p_company and verification_status in ('unverified', 'rejected', 'revoked');
  perform private.assert(found, 'Công ty đã được xác thực hoặc đang chờ thẩm định');
  perform private.log_audit('company.submit_verification', 'companies', p_company::text);
end;
$$;

create or replace function public.review_company_verification(
  p_company uuid, p_decision public.verify_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên mới thẩm định được doanh nghiệp', '42501');
  perform private.assert(p_decision in ('verified', 'rejected', 'revoked'), 'Quyết định phải là verified, rejected hoặc revoked');
  perform private.assert(p_decision = 'verified' or nullif(trim(p_note), '') is not null, 'Vui lòng nhập lý do');

  update public.companies
  set verification_status = p_decision,
      verification_note   = p_note,
      verified_at         = case when p_decision = 'verified' then now() end,
      verified_by         = (select auth.uid())
  where id = p_company
  returning name into v_name;
  perform private.assert(v_name is not null, 'Không tìm thấy công ty', 'P0002');

  update public.company_documents
  set status = case when p_decision = 'verified' then 'verified'::public.verify_status else 'rejected'::public.verify_status end,
      reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = p_note
  where company_id = p_company and status = 'pending';

  if p_decision = 'revoked' then  -- live jobs go offline until the company is verified again
    update public.jobs set status = 'paused' where company_id = p_company and status = 'active';
  end if;

  perform private.notify_company(p_company, 'company_verification',
    case p_decision when 'verified' then 'Doanh nghiệp đã được xác thực (tích xanh)'
                    when 'rejected' then 'Hồ sơ thẩm định doanh nghiệp bị từ chối'
                    else 'Huy hiệu xác thực doanh nghiệp đã bị thu hồi' end,
    p_note, '/pages/company/');
  perform private.log_audit('company.' || p_decision, 'companies', p_company::text, p_note);
end;
$$;

create or replace function public.set_user_status(
  p_user uuid, p_status public.account_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := private.require_user();
begin
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên mới thay đổi được trạng thái tài khoản', '42501');
  perform private.assert(p_user <> v_admin, 'Không thể tự thay đổi trạng thái tài khoản của mình');
  perform private.assert(p_status = 'active' or nullif(trim(p_reason), '') is not null, 'Vui lòng nhập lý do');
  perform private.assert(not exists (select 1 from public.profiles where id = p_user and role = 'admin'),
    'Không thể khóa tài khoản quản trị viên khác qua API', '42501');
  update public.profiles set status = p_status, status_reason = p_reason where id = p_user;
  perform private.assert(found, 'Không tìm thấy tài khoản', 'P0002');
  perform private.notify(p_user, 'account',
    case p_status when 'active' then 'Tài khoản của bạn đã được kích hoạt'
                  when 'suspended' then 'Tài khoản của bạn đã bị tạm khóa'
                  else 'Trạng thái tài khoản đã thay đổi' end, p_reason, '/');
  perform private.log_audit('user.' || p_status, 'profiles', p_user::text, p_reason);
end;
$$;

-- -----------------------------------------------------------------------------
-- Job lifecycle (Activity_Employer_Recruitment, Sequence_Job_Posting_Moderation)
--   draft → pending_approval → active | rejected ;  active ↔ paused → closed ; → expired (cron)
-- -----------------------------------------------------------------------------
create or replace function public.submit_job(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  perform private.require_user();
  select * into v_job from public.jobs where id = p_job for update;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin tuyển dụng', 'P0002');
  perform private.assert(private.is_company_member(v_job.company_id), 'Bạn không thuộc công ty đăng tin này', '42501');
  perform private.assert(v_job.status in ('draft', 'rejected'), 'Chỉ tin nháp hoặc tin bị từ chối mới gửi duyệt được');
  perform private.assert(exists (select 1 from public.companies where id = v_job.company_id and verification_status = 'verified'),
    'Doanh nghiệp cần được thẩm định GPKD & MST trước khi đăng tin');
  perform private.assert(char_length(v_job.description) >= 50, 'Mô tả công việc quá ngắn (tối thiểu 50 ký tự)');
  perform private.assert(v_job.deadline is null or v_job.deadline > now(), 'Hạn nộp hồ sơ phải ở tương lai');
  update public.jobs set status = 'pending_approval', submitted_at = now(), rejection_reason = null where id = p_job;
  perform private.log_audit('job.submit', 'jobs', p_job::text);
end;
$$;

create or replace function public.moderate_job(p_job uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên mới duyệt được tin', '42501');
  select * into v_job from public.jobs where id = p_job for update;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin tuyển dụng', 'P0002');
  perform private.assert(v_job.status = 'pending_approval', 'Tin này không ở trạng thái chờ duyệt');

  if p_approve then
    perform private.assert(v_job.deadline is null or v_job.deadline > now(),
      'Hạn nộp đã qua, yêu cầu nhà tuyển dụng cập nhật trước khi duyệt');
    update public.jobs
    set status = 'active',
        published_at = coalesce(published_at, now()),
        rejection_reason = null,
        deadline = coalesce(deadline, now() + make_interval(days => (private.setting('job_default_duration_days', '30'::jsonb))::text::int))
    where id = p_job;
  else
    perform private.assert(nullif(trim(p_reason), '') is not null, 'Vui lòng nhập lý do từ chối');
    update public.jobs set status = 'rejected', rejection_reason = p_reason where id = p_job;
  end if;

  perform private.notify_company(v_job.company_id, 'job_moderated',
    format(case when p_approve then 'Tin "%s" đã được duyệt và xuất bản' else 'Tin "%s" bị từ chối' end, v_job.title),
    p_reason, '/pages/employer/', jsonb_build_object('job_id', p_job, 'approved', p_approve));
  perform private.log_audit(case when p_approve then 'job.approve' else 'job.reject' end, 'jobs', p_job::text, p_reason);
end;
$$;

create or replace function public.change_job_status(p_job uuid, p_status public.job_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  perform private.require_user();
  select * into v_job from public.jobs where id = p_job for update;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin tuyển dụng', 'P0002');
  perform private.assert(private.is_company_member(v_job.company_id), 'Bạn không thuộc công ty đăng tin này', '42501');
  perform private.assert(
    (v_job.status = 'active'           and p_status in ('paused', 'closed')) or
    (v_job.status = 'paused'           and p_status in ('active', 'closed')) or
    (v_job.status = 'pending_approval' and p_status = 'draft') or
    (v_job.status in ('draft', 'rejected') and p_status = 'closed'),
    format('Không thể chuyển tin từ %s sang %s', v_job.status, p_status));
  if p_status = 'active' then
    perform private.assert(exists (select 1 from public.companies where id = v_job.company_id and verification_status = 'verified'),
      'Doanh nghiệp cần được xác thực để mở lại tin');
    perform private.assert(v_job.deadline is null or v_job.deadline > now(), 'Hạn nộp đã qua, vui lòng gia hạn trước khi mở lại');
  end if;
  update public.jobs
  set status = p_status,
      closed_at = case when p_status = 'closed' then now() else closed_at end
  where id = p_job;
  perform private.log_audit('job.' || p_status, 'jobs', p_job::text);
end;
$$;

-- Emergency take-down of a live job by an admin ("Khóa / Gỡ bỏ tin vi phạm khẩn cấp")
create or replace function public.admin_close_job(p_job uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên mới gỡ được tin', '42501');
  perform private.assert(nullif(trim(p_reason), '') is not null, 'Vui lòng nhập lý do');
  update public.jobs set status = 'closed', closed_at = now(), rejection_reason = p_reason
  where id = p_job and status <> 'closed'
  returning * into v_job;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin hoặc tin đã đóng', 'P0002');
  perform private.notify_company(v_job.company_id, 'job_moderated',
    format('Tin "%s" đã bị gỡ bởi quản trị viên', v_job.title), p_reason, '/pages/employer/');
  perform private.log_audit('job.takedown', 'jobs', p_job::text, p_reason);
end;
$$;

-- University officers approve MoU-exclusive postings for their students
create or replace function public.review_exclusive_job(p_job uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_job public.jobs;
begin
  perform private.require_user();
  select * into v_job from public.jobs where id = p_job for update;
  perform private.assert(v_job.id is not null, 'Không tìm thấy tin tuyển dụng', 'P0002');
  perform private.assert(v_job.university_id is not null and v_job.university_id = private.officer_university_id(),
    'Tin này không dành riêng cho trường của bạn', '42501');
  perform private.assert(p_approve or nullif(trim(p_note), '') is not null, 'Vui lòng nhập lý do từ chối');
  update public.jobs
  set university_approval = case when p_approve then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
      university_note = p_note
  where id = p_job;
  perform private.notify_company(v_job.company_id, 'job_moderated',
    format(case when p_approve then 'Trường đã duyệt tin "%s"' else 'Trường từ chối tin "%s"' end, v_job.title),
    p_note, '/pages/employer/');
  perform private.log_audit(case when p_approve then 'job.university_approve' else 'job.university_reject' end,
    'jobs', p_job::text, p_note);
end;
$$;

create or replace function public.record_job_view(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if not exists (select 1 from public.jobs where id = p_job and status = 'active') then
    return;
  end if;
  if v_user is not null and exists (select 1 from public.job_views
                                    where job_id = p_job and viewer_id = v_user
                                      and viewed_at > now() - interval '30 minutes') then
    return;  -- de-duplicate refreshes
  end if;
  insert into public.job_views (job_id, viewer_id) values (p_job, v_user);
  update public.jobs set view_count = view_count + 1 where id = p_job;
end;
$$;

-- "% Match": weighted share of the job's skills the signed-in student has (required skills count double)
create or replace function public.job_match_score(p_job uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select case when sum(case when js.is_required then 2 else 1 end) is null then null
              else round(100.0 * sum(case when ss.skill_id is null then 0 when js.is_required then 2 else 1 end)
                         / sum(case when js.is_required then 2 else 1 end))::smallint end
  from public.job_skills js
  left join public.student_skills ss on ss.skill_id = js.skill_id and ss.student_id = (select auth.uid())
  where js.job_id = p_job
$$;

-- Job search (SECURITY INVOKER: RLS decides which jobs the caller may see)
create or replace function public.search_jobs(
  p_query text default null,
  p_city text default null,
  p_industry_id integer default null,
  p_work_type public.work_type default null,
  p_min_stipend integer default null,
  p_sort text default 'relevance',      -- relevance | newest | stipend | match
  p_limit integer default 20,
  p_offset integer default 0)
returns table (
  id uuid, company_id uuid, company_name text, company_logo_path text, company_verified boolean,
  title text, city text, work_type public.work_type, schedule public.work_schedule,
  stipend_min integer, stipend_max integer, stipend_negotiable boolean,
  deadline timestamptz, published_at timestamptz, application_count integer,
  is_exclusive boolean, match_score smallint, rank real, total_count bigint)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_query), '') is null then null
                else websearch_to_tsquery('simple'::regconfig, private.unaccent_immutable(trim(p_query))) end as tsq
  ),
  hits as (
    select j.*, c.name as c_name, c.logo_path as c_logo, (c.verification_status = 'verified') as c_verified,
           public.job_match_score(j.id) as m_score,
           case when q.tsq is null then 0 else ts_rank(j.search, q.tsq) end as r
    from public.jobs j
    join public.companies c on c.id = j.company_id
    cross join q
    where j.status = 'active'
      and (j.deadline is null or j.deadline > now())
      and (q.tsq is null or j.search @@ q.tsq or j.title ilike '%' || trim(p_query) || '%')
      and (p_city is null or private.unaccent_immutable(coalesce(j.city, '')) ilike '%' || private.unaccent_immutable(p_city) || '%')
      and (p_industry_id is null or j.industry_id = p_industry_id)
      and (p_work_type is null or j.work_type = p_work_type)
      and (p_min_stipend is null or coalesce(j.stipend_max, j.stipend_min, 0) >= p_min_stipend)
  )
  select h.id, h.company_id, h.c_name, h.c_logo, h.c_verified, h.title, h.city, h.work_type, h.schedule,
         h.stipend_min, h.stipend_max, h.stipend_negotiable, h.deadline, h.published_at, h.application_count,
         h.university_id is not null, h.m_score, h.r, count(*) over ()
  from hits h
  order by
    case when p_sort = 'stipend' then coalesce(h.stipend_max, h.stipend_min, 0) end desc nulls last,
    case when p_sort = 'match' then h.m_score end desc nulls last,
    case when p_sort = 'relevance' then h.r end desc nulls last,
    h.published_at desc nulls last
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- -----------------------------------------------------------------------------
-- Applications (Activity_Candidate_Apply, Sequence_Candidate_Apply, DFD 4.x)
-- -----------------------------------------------------------------------------
-- p_answers: [{"question_id": "<uuid>", "answer": "..."}]
create or replace function public.apply_to_job(
  p_job uuid, p_cv uuid default null, p_cover_letter text default null, p_answers jsonb default '[]'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user     uuid := private.require_user();
  v_job      public.jobs;
  v_cv       public.cvs;
  v_app      uuid := gen_random_uuid();
  v_q        record;
  v_answer   text;
  v_passed   boolean;
  v_knockout boolean;
  v_rows     jsonb := '[]'::jsonb;
begin
  perform private.assert(private.current_user_role() = 'student', 'Chỉ tài khoản sinh viên mới ứng tuyển được', '42501');

  select * into v_job from public.jobs where id = p_job;
  perform private.assert(v_job.id is not null and v_job.status = 'active', 'Tin tuyển dụng không còn nhận hồ sơ');
  perform private.assert(v_job.deadline is null or v_job.deadline > now(), 'Tin đã hết hạn nộp');
  if v_job.university_id is not null then
    perform private.assert(v_job.university_approval = 'approved' and private.is_verified_student_of(v_job.university_id),
      'Tin này chỉ dành cho sinh viên đã xác thực của trường đối tác', '42501');
  end if;
  perform private.assert(not exists (select 1 from public.applications where job_id = p_job and student_id = v_user),
    'Bạn đã nộp đơn cho vị trí này, vui lòng theo dõi tiến độ');

  select * into v_cv from public.cvs
  where student_id = v_user and (p_cv is null or id = p_cv)
  order by (id = p_cv) desc nulls last, is_default desc, updated_at desc
  limit 1;
  perform private.assert(v_cv.id is not null, 'Bạn cần tạo hoặc tải lên CV trước khi ứng tuyển');
  perform private.assert(p_cv is null or v_cv.id = p_cv, 'CV không hợp lệ');

  -- Screening / knockout questions
  for v_q in
    select q.id, q.question, q.kind, q.is_required, q.is_knockout, k.ideal_answer
    from public.screening_questions q
    left join public.screening_question_keys k on k.question_id = q.id
    where q.job_id = p_job
    order by q.position
  loop
    select nullif(trim(e ->> 'answer'), '') into v_answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where e ->> 'question_id' = v_q.id::text
    limit 1;

    if v_answer is null then
      perform private.assert(not v_q.is_required, format('Vui lòng trả lời câu hỏi: %s', v_q.question));
      continue;
    end if;

    v_passed := case when v_q.kind = 'short_text' or v_q.ideal_answer is null then null
                     else lower(trim(v_answer)) = lower(trim(v_q.ideal_answer)) end;
    if v_q.is_knockout then
      v_knockout := coalesce(v_knockout, true) and coalesce(v_passed, true);
    end if;
    v_rows := v_rows || jsonb_build_object('question_id', v_q.id, 'answer', v_answer, 'passed', v_passed);
  end loop;

  insert into public.applications (id, job_id, student_id, cv_id, cv_snapshot, cv_file_path, cover_letter, knockout_passed)
  values (v_app, p_job, v_user, v_cv.id, v_cv.content, v_cv.file_path, nullif(trim(p_cover_letter), ''), v_knockout);

  insert into public.application_answers (application_id, question_id, answer, passed)
  select v_app, r.question_id, r.answer, r.passed
  from jsonb_to_recordset(v_rows) as r(question_id uuid, answer text, passed boolean);

  return v_app;
end;
$$;

create or replace function public.mark_application_viewed(p_application uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_status public.application_status;
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(private.application_company_id(p_application)),
    'Bạn không có quyền xem hồ sơ này', '42501');
  select status into v_status from public.applications where id = p_application for update;
  if v_status = 'applied' then
    update public.applications set status = 'cv_viewed' where id = p_application;
  else
    update public.applications set viewed_at = coalesce(viewed_at, now()) where id = p_application;
  end if;
end;
$$;

-- Employer-side status changes that need no extra data (interview / offer have their own RPCs)
create or replace function public.update_application_status(
  p_application uuid, p_status public.application_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(private.application_company_id(p_application)),
    'Bạn không có quyền xử lý hồ sơ này', '42501');
  perform private.assert(p_status in ('cv_viewed', 'shortlisted', 'rejected'),
    'Dùng schedule_interview / send_offer cho các vòng phỏng vấn và offer');
  perform private.assert(p_status <> 'rejected' or nullif(trim(p_note), '') is not null, 'Vui lòng nhập lý do từ chối');

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.applications
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then p_note else rejection_reason end
  where id = p_application;

  if p_status = 'rejected' then
    update public.interviews set status = 'cancelled' where application_id = p_application and status = 'scheduled';
    update public.offers set status = 'withdrawn' where application_id = p_application and status = 'sent';
  end if;
end;
$$;

create or replace function public.move_application_stage(p_application uuid, p_stage uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(private.application_company_id(p_application)),
    'Bạn không có quyền xử lý hồ sơ này', '42501');
  update public.applications a set stage_id = p_stage
  where a.id = p_application
    and exists (select 1 from public.pipeline_stages s where s.id = p_stage and s.job_id = a.job_id);
  perform private.assert(found, 'Cột pipeline không thuộc tin tuyển dụng này');
end;
$$;

create or replace function public.withdraw_application(p_application uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
begin
  perform private.assert(exists (select 1 from public.applications where id = p_application and student_id = v_user),
    'Không tìm thấy đơn ứng tuyển', 'P0002');
  perform set_config('app.status_note', coalesce(p_reason, ''), true);
  update public.applications set status = 'withdrawn', withdrawal_reason = p_reason where id = p_application;
  update public.interviews set status = 'cancelled' where application_id = p_application and status = 'scheduled';
end;
$$;

-- One conversation per (student, company); recruiters involved are added as participants
create or replace function private.ensure_conversation(p_student uuid, p_company uuid, p_application uuid, p_recruiter uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conversation uuid;
begin
  select c.id into v_conversation
  from public.conversations c
  where c.company_id = p_company
    and exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.user_id = p_student)
  order by c.last_message_at desc nulls last
  limit 1;

  if v_conversation is null then
    insert into public.conversations (company_id, application_id, created_by)
    values (p_company, p_application, (select auth.uid()))
    returning id into v_conversation;
  elsif p_application is not null then
    update public.conversations set application_id = p_application where id = v_conversation;
  end if;

  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation, p_student), (v_conversation, p_recruiter)
  on conflict do nothing;
  return v_conversation;
end;
$$;

create or replace function public.schedule_interview(
  p_application uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer default 45,
  p_mode public.interview_mode default 'online',
  p_meeting_url text default null,
  p_location text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user         uuid := private.require_user();
  v_app          public.applications;
  v_job          public.jobs;
  v_round        smallint;
  v_id           uuid;
  v_conversation uuid;
  v_card         jsonb;
begin
  select * into v_app from public.applications where id = p_application for update;
  perform private.assert(v_app.id is not null, 'Không tìm thấy đơn ứng tuyển', 'P0002');
  select * into v_job from public.jobs where id = v_app.job_id;
  perform private.assert(private.is_company_member(v_job.company_id), 'Bạn không có quyền xử lý hồ sơ này', '42501');
  perform private.assert(v_app.status in ('applied', 'cv_viewed', 'shortlisted', 'interviewing'),
    'Không thể lên lịch phỏng vấn ở trạng thái hiện tại của hồ sơ');
  perform private.assert(p_scheduled_at > now(), 'Thời gian phỏng vấn phải ở tương lai');
  perform private.assert(p_mode <> 'online' or nullif(trim(p_meeting_url), '') is not null, 'Phỏng vấn trực tuyến cần link phòng họp');
  perform private.assert(p_mode <> 'onsite' or nullif(trim(p_location), '') is not null, 'Phỏng vấn trực tiếp cần địa điểm');

  select coalesce(max(round), 0) + 1 into v_round from public.interviews where application_id = p_application;
  insert into public.interviews (application_id, round, scheduled_at, duration_minutes, mode, meeting_url, location, created_by)
  values (p_application, v_round, p_scheduled_at, p_duration_minutes, p_mode, p_meeting_url, p_location, v_user)
  returning id into v_id;

  if v_app.status <> 'interviewing' then
    perform set_config('app.status_note', format('Phỏng vấn vòng %s', v_round), true);
    update public.applications set status = 'interviewing' where id = p_application;
  end if;

  -- Interview card in the chat thread (Sequence_Direct_Messaging step 15–16)
  v_card := jsonb_build_object('interview_id', v_id, 'round', v_round, 'scheduled_at', p_scheduled_at,
                               'duration_minutes', p_duration_minutes, 'mode', p_mode,
                               'meeting_url', p_meeting_url, 'location', p_location);
  v_conversation := private.ensure_conversation(v_app.student_id, v_job.company_id, p_application, v_user);
  insert into public.messages (conversation_id, sender_id, kind, body, metadata)
  values (v_conversation, v_user, 'interview_invite', format('Lời mời phỏng vấn vòng %s — %s', v_round, v_job.title), v_card);

  perform private.notify(v_app.student_id, 'interview_invite', format('Lời mời phỏng vấn: %s', v_job.title),
    to_char(p_scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
    '/pages/messages/?conversation=' || v_conversation, v_card);
  return v_id;
end;
$$;

create or replace function public.respond_interview(
  p_interview uuid, p_rsvp public.rsvp_status, p_note text default null, p_proposed_at timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_row  record;
begin
  select i.*, a.student_id, j.company_id, j.title into v_row
  from public.interviews i
  join public.applications a on a.id = i.application_id
  join public.jobs j on j.id = a.job_id
  where i.id = p_interview
  for update of i;
  perform private.assert(v_row.id is not null and v_row.student_id = v_user, 'Không tìm thấy lịch phỏng vấn', 'P0002');
  perform private.assert(v_row.status = 'scheduled' and v_row.scheduled_at > now(), 'Lịch phỏng vấn không còn hiệu lực');
  perform private.assert(p_rsvp in ('accepted', 'reschedule_requested', 'declined'), 'Phản hồi không hợp lệ');
  perform private.assert(p_rsvp <> 'reschedule_requested' or p_proposed_at > now(), 'Vui lòng đề xuất thời gian mới ở tương lai');

  update public.interviews
  set rsvp = p_rsvp, rsvp_note = p_note,
      proposed_at = case when p_rsvp = 'reschedule_requested' then p_proposed_at end
  where id = p_interview;

  perform private.notify_company(v_row.company_id, 'interview_rsvp',
    case p_rsvp when 'accepted' then 'Ứng viên đã xác nhận lịch phỏng vấn'
                when 'declined' then 'Ứng viên từ chối lịch phỏng vấn'
                else 'Ứng viên đề xuất dời lịch phỏng vấn' end,
    coalesce(p_note, v_row.title), '/pages/candidates/?application=' || v_row.application_id,
    jsonb_build_object('interview_id', p_interview, 'rsvp', p_rsvp, 'proposed_at', p_proposed_at));
end;
$$;

-- Employer reschedules / completes / cancels an interview
create or replace function public.update_interview(
  p_interview uuid,
  p_status public.interview_status default null,
  p_scheduled_at timestamptz default null,
  p_meeting_url text default null,
  p_location text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
begin
  perform private.require_user();
  select i.*, a.student_id, j.company_id, j.title into v_row
  from public.interviews i
  join public.applications a on a.id = i.application_id
  join public.jobs j on j.id = a.job_id
  where i.id = p_interview
  for update of i;
  perform private.assert(v_row.id is not null, 'Không tìm thấy lịch phỏng vấn', 'P0002');
  perform private.assert(private.is_company_member(v_row.company_id), 'Bạn không có quyền xử lý lịch này', '42501');

  if p_scheduled_at is not null then
    perform private.assert(p_scheduled_at > now(), 'Thời gian phỏng vấn phải ở tương lai');
    update public.interviews
    set scheduled_at = p_scheduled_at, status = 'scheduled', rsvp = 'pending', proposed_at = null,
        meeting_url = coalesce(p_meeting_url, meeting_url), location = coalesce(p_location, location)
    where id = p_interview;
    perform private.notify(v_row.student_id, 'interview_invite', format('Lịch phỏng vấn đã thay đổi: %s', v_row.title),
      to_char(p_scheduled_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'), '/pages/messages/',
      jsonb_build_object('interview_id', p_interview));
  elsif p_status is not null then
    update public.interviews set status = p_status where id = p_interview;
    if p_status = 'cancelled' then
      perform private.notify(v_row.student_id, 'interview_invite', format('Lịch phỏng vấn đã bị hủy: %s', v_row.title),
        null, '/pages/messages/', jsonb_build_object('interview_id', p_interview));
    end if;
  end if;
end;
$$;

create or replace function public.send_offer(
  p_application uuid,
  p_start_date date,
  p_expires_at timestamptz,
  p_stipend_amount integer default null,
  p_end_date date default null,
  p_terms text default null,
  p_letter_path text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_app  public.applications;
  v_id   uuid;
begin
  select * into v_app from public.applications where id = p_application for update;
  perform private.assert(v_app.id is not null, 'Không tìm thấy đơn ứng tuyển', 'P0002');
  perform private.assert(private.is_company_member(private.application_company_id(p_application)),
    'Bạn không có quyền xử lý hồ sơ này', '42501');
  perform private.assert(v_app.status in ('shortlisted', 'interviewing'), 'Chỉ gửi offer cho ứng viên đã qua sàng lọc hoặc phỏng vấn');
  perform private.assert(p_expires_at > now(), 'Hạn phản hồi offer phải ở tương lai');
  perform private.assert(p_start_date >= current_date, 'Ngày bắt đầu không hợp lệ');

  insert into public.offers (application_id, stipend_amount, start_date, end_date, expires_at, terms, letter_path, created_by)
  values (p_application, p_stipend_amount, p_start_date, p_end_date, p_expires_at, p_terms, p_letter_path, v_user)
  returning id into v_id;

  perform set_config('app.status_note', 'Đã gửi offer', true);
  update public.applications set status = 'offered' where id = p_application;
  return v_id;
end;
$$;

create or replace function public.respond_offer(p_offer uuid, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user  uuid := private.require_user();
  v_offer public.offers;
begin
  select o.* into v_offer
  from public.offers o join public.applications a on a.id = o.application_id
  where o.id = p_offer and a.student_id = v_user
  for update of o;
  perform private.assert(v_offer.id is not null, 'Không tìm thấy offer', 'P0002');
  perform private.assert(v_offer.status = 'sent', 'Offer này không còn chờ phản hồi');
  perform private.assert(v_offer.expires_at > now(), 'Offer đã hết hạn phản hồi');
  perform private.assert(p_accept or nullif(trim(p_note), '') is not null, 'Vui lòng cho biết lý do từ chối');

  update public.offers
  set status = case when p_accept then 'accepted'::public.offer_status else 'declined'::public.offer_status end,
      response_note = p_note, responded_at = now()
  where id = p_offer;

  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.applications
  set status = case when p_accept then 'hired'::public.application_status else 'offer_declined'::public.application_status end
  where id = v_offer.application_id;
end;
$$;

create or replace function public.withdraw_offer(p_offer uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_offer public.offers;
begin
  perform private.require_user();
  perform private.assert(nullif(trim(p_reason), '') is not null, 'Vui lòng nhập lý do');
  select * into v_offer from public.offers where id = p_offer for update;
  perform private.assert(v_offer.id is not null, 'Không tìm thấy offer', 'P0002');
  perform private.assert(private.is_company_member(private.application_company_id(v_offer.application_id)),
    'Bạn không có quyền xử lý offer này', '42501');
  perform private.assert(v_offer.status = 'sent', 'Chỉ rút được offer đang chờ phản hồi');
  update public.offers set status = 'withdrawn', response_note = p_reason where id = p_offer;
  perform set_config('app.status_note', p_reason, true);
  update public.applications set status = 'rejected', rejection_reason = p_reason where id = v_offer.application_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Messaging (Sequence_Direct_Messaging)
--   Recruiters (verified company) may contact any student; students may contact
--   recruiters of companies they applied to. Messages are then sent with plain
--   inserts into public.messages (RLS-checked).
-- -----------------------------------------------------------------------------
create or replace function public.start_conversation(p_with_user uuid, p_company uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user    uuid := private.require_user();
  v_role    public.user_role := private.current_user_role();
  v_company uuid;
  v_app     uuid;
begin
  if v_role = 'employer' then
    v_company := coalesce(p_company, (select company_id from public.company_members where user_id = v_user order by created_at limit 1));
    perform private.assert(private.is_company_member(v_company), 'Bạn không thuộc công ty này', '42501');
    perform private.assert(exists (select 1 from public.companies where id = v_company and verification_status = 'verified'),
      'Doanh nghiệp cần được xác thực trước khi nhắn tin cho sinh viên');
    perform private.assert(exists (select 1 from public.profiles where id = p_with_user and role = 'student' and status = 'active'),
      'Không tìm thấy sinh viên', 'P0002');
    select a.id into v_app from public.applications a join public.jobs j on j.id = a.job_id
    where a.student_id = p_with_user and j.company_id = v_company order by a.applied_at desc limit 1;
    return private.ensure_conversation(p_with_user, v_company, v_app, v_user);
  elsif v_role = 'student' then
    select j.company_id, a.id into v_company, v_app
    from public.applications a
    join public.jobs j on j.id = a.job_id
    join public.company_members m on m.company_id = j.company_id and m.user_id = p_with_user
    where a.student_id = v_user and (p_company is null or j.company_id = p_company)
    order by a.applied_at desc
    limit 1;
    perform private.assert(v_company is not null, 'Bạn chỉ có thể nhắn tin cho nhà tuyển dụng của công ty bạn đã ứng tuyển', '42501');
    return private.ensure_conversation(v_user, v_company, v_app, p_with_user);
  end if;
  raise exception using message = 'Vai trò của bạn không dùng được tính năng nhắn tin', errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
-- Trust & safety (process 9.4)
-- -----------------------------------------------------------------------------
create or replace function public.resolve_report(
  p_report uuid, p_status public.report_status, p_note text default null, p_action text default 'none')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_report public.reports;
  v_user   uuid;
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên mới xử lý được báo cáo', '42501');
  perform private.assert(p_status in ('in_review', 'resolved', 'dismissed'), 'Trạng thái không hợp lệ');
  perform private.assert(p_action in ('none', 'hide_content', 'close_job', 'suspend_user'), 'Hành động không hợp lệ');
  perform private.assert(p_status = 'in_review' or nullif(trim(p_note), '') is not null, 'Vui lòng ghi kết quả xử lý');
  perform private.assert(p_action = 'none' or p_status = 'resolved', 'Chỉ áp dụng biện pháp khi báo cáo được xác nhận (resolved)');

  select * into v_report from public.reports where id = p_report for update;
  perform private.assert(v_report.id is not null, 'Không tìm thấy báo cáo', 'P0002');

  if p_action = 'hide_content' then
    case v_report.target_type
      when 'post'    then update public.posts set status = 'hidden' where id = v_report.target_id;
      when 'comment' then update public.post_comments set status = 'hidden' where id = v_report.target_id;
      when 'message' then update public.messages set deleted_at = now() where id = v_report.target_id;
      else perform private.assert(false, 'Chỉ ẩn được bài viết, bình luận hoặc tin nhắn');
    end case;
  elsif p_action = 'close_job' then
    perform private.assert(v_report.target_type = 'job', 'Báo cáo này không nhắm vào tin tuyển dụng');
    perform public.admin_close_job(v_report.target_id, p_note);
  elsif p_action = 'suspend_user' then
    v_user := case v_report.target_type
                when 'user'    then v_report.target_id
                when 'post'    then (select author_id from public.posts where id = v_report.target_id)
                when 'comment' then (select author_id from public.post_comments where id = v_report.target_id)
                when 'message' then (select sender_id from public.messages where id = v_report.target_id)
              end;
    perform private.assert(v_user is not null, 'Không xác định được tài khoản vi phạm');
    perform public.set_user_status(v_user, 'suspended', p_note);
  end if;

  update public.reports
  set status = p_status, handled_by = (select auth.uid()), resolution_note = p_note, action_taken = p_action,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() end
  where id = p_report
     or (p_status = 'resolved' and p_action <> 'none'  -- close duplicate reports on the same target
         and target_type = v_report.target_type and target_id = v_report.target_id and status in ('open', 'in_review'));

  perform private.notify(v_report.reporter_id, 'report_update', 'Báo cáo của bạn đã được xử lý',
    case when p_status = 'in_review' then 'Ban quản trị đang xem xét' else p_note end, null,
    jsonb_build_object('report_id', p_report, 'status', p_status));
  perform private.log_audit('report.' || p_status, 'reports', p_report::text, p_note, jsonb_build_object('action', p_action));
end;
$$;

-- -----------------------------------------------------------------------------
-- University portal (UseCase_University, DFD 8.4)
-- -----------------------------------------------------------------------------
create or replace function public.request_student_verification()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
begin
  update public.student_profiles
  set verification_status = 'pending', verification_note = null
  where user_id = v_user and university_id is not null and student_code is not null
    and verification_status in ('unverified', 'rejected', 'revoked');
  perform private.assert(found, 'Vui lòng chọn trường và nhập MSSV trước (hoặc hồ sơ đã được xác thực)');
end;
$$;

create or replace function public.verify_student(p_student uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_officer uuid := private.require_user();
begin
  perform private.assert(private.officer_can_view_student(p_student), 'Sinh viên không thuộc trường của bạn', '42501');
  perform private.assert(p_approve or nullif(trim(p_note), '') is not null, 'Vui lòng nhập lý do');
  update public.student_profiles
  set verification_status = case when p_approve then 'verified'::public.verify_status else 'rejected'::public.verify_status end,
      verification_note = p_note,
      verified_by = case when p_approve then v_officer end,
      verified_at = case when p_approve then now() end
  where user_id = p_student and verification_status in ('pending', 'verified', 'unverified');
  perform private.assert(found, 'Hồ sơ sinh viên không ở trạng thái có thể xác thực');
  perform private.notify(p_student, 'student_verification',
    case when p_approve then 'Tài khoản sinh viên đã được nhà trường xác thực' else 'Nhà trường chưa xác thực được thông tin sinh viên' end,
    p_note, '/pages/profile/');
  perform private.log_audit(case when p_approve then 'student.verify' else 'student.reject' end, 'student_profiles', p_student::text, p_note);
end;
$$;

create or replace function public.submit_internship_report(p_application uuid, p_summary text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.require_user();
  v_uni  uuid;
  v_id   uuid;
begin
  perform private.assert(exists (select 1 from public.applications where id = p_application and student_id = v_user and status = 'hired'),
    'Chỉ nộp báo cáo cho vị trí bạn đã nhận việc', 'P0002');
  select university_id into v_uni from public.student_profiles where user_id = v_user and verification_status = 'verified';
  perform private.assert(v_uni is not null, 'Tài khoản cần được nhà trường xác thực trước khi nộp báo cáo thực tập');
  perform private.assert(nullif(trim(p_summary), '') is not null, 'Vui lòng nhập nội dung báo cáo');

  insert into public.internship_reports (application_id, student_id, university_id, student_summary, status)
  values (p_application, v_user, v_uni, p_summary, 'submitted')
  on conflict (application_id) do update
    set student_summary = excluded.student_summary, university_id = excluded.university_id,
        status = 'submitted', review_note = null
    where public.internship_reports.status in ('draft', 'rejected')
  returning id into v_id;
  perform private.assert(v_id is not null, 'Báo cáo đã được gửi hoặc đã chứng thực');
  return v_id;
end;
$$;

create or replace function public.rate_intern(p_application uuid, p_rating integer, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
  v_id      uuid;
begin
  perform private.require_user();
  perform private.assert(private.is_company_member(private.application_company_id(p_application)),
    'Bạn không có quyền đánh giá thực tập sinh này', '42501');
  select student_id into v_student from public.applications where id = p_application and status = 'hired';
  perform private.assert(v_student is not null, 'Chỉ đánh giá được thực tập sinh đã nhận việc');
  perform private.assert(p_rating between 1 and 5, 'Điểm đánh giá từ 1 đến 5');

  insert into public.internship_reports (application_id, student_id, university_id, employer_rating, employer_comment)
  values (p_application, v_student, (select university_id from public.student_profiles where user_id = v_student), p_rating, p_comment)
  on conflict (application_id) do update
    set employer_rating = excluded.employer_rating, employer_comment = excluded.employer_comment
    where public.internship_reports.status <> 'certified'
  returning id into v_id;
  perform private.assert(v_id is not null, 'Báo cáo đã được chứng thực, không thể sửa đánh giá');
end;
$$;

create or replace function public.certify_internship_report(p_report uuid, p_approve boolean, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_officer uuid := private.require_user();
  v_report  public.internship_reports;
  v_code    text;
begin
  select * into v_report from public.internship_reports where id = p_report for update;
  perform private.assert(v_report.id is not null, 'Không tìm thấy báo cáo', 'P0002');
  perform private.assert(v_report.university_id = private.officer_university_id(), 'Báo cáo không thuộc trường của bạn', '42501');
  perform private.assert(v_report.status = 'submitted', 'Báo cáo không ở trạng thái chờ chứng thực');
  perform private.assert(not p_approve or v_report.employer_rating is not null, 'Chưa có đánh giá từ doanh nghiệp');
  perform private.assert(p_approve or nullif(trim(p_note), '') is not null, 'Vui lòng nhập lý do');

  if p_approve then
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    update public.internship_reports
    set status = 'certified', certified_by = v_officer, certified_at = now(), verification_code = v_code, review_note = p_note
    where id = p_report;
  else
    update public.internship_reports set status = 'rejected', review_note = p_note where id = p_report;
  end if;

  perform private.notify(v_report.student_id, 'student_verification',
    case when p_approve then 'Báo cáo thực tập đã được nhà trường chứng thực' else 'Báo cáo thực tập cần chỉnh sửa' end,
    p_note, '/pages/profile/');
  perform private.log_audit(case when p_approve then 'internship_report.certify' else 'internship_report.reject' end,
    'internship_reports', p_report::text, p_note);
  return v_code;
end;
$$;

-- Public QR verification of a certified internship report (callable by anyone)
create or replace function public.verify_internship_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'student_name', p.full_name, 'student_code', s.student_code, 'university', u.name,
           'company', c.name, 'job_title', j.title, 'hired_at', a.hired_at,
           'employer_rating', r.employer_rating, 'certified_at', r.certified_at)
  from public.internship_reports r
  join public.applications a on a.id = r.application_id
  join public.jobs j on j.id = a.job_id
  join public.companies c on c.id = j.company_id
  join public.profiles p on p.id = r.student_id
  left join public.student_profiles s on s.user_id = r.student_id
  left join public.universities u on u.id = r.university_id
  where r.verification_code = upper(trim(p_code)) and r.status = 'certified'
$$;

-- -----------------------------------------------------------------------------
-- Career fairs (DFD 8.3)
-- -----------------------------------------------------------------------------
create or replace function public.register_for_event(p_event uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := private.require_user();
  v_event  public.events;
  v_ticket text;
begin
  perform private.assert(private.current_user_role() = 'student', 'Chỉ sinh viên mới đăng ký tham gia được', '42501');
  select * into v_event from public.events where id = p_event for update;
  perform private.assert(v_event.id is not null and v_event.status = 'published' and v_event.ends_at > now(),
    'Sự kiện không mở đăng ký');
  select ticket_code into v_ticket from public.event_registrations where event_id = p_event and student_id = v_user;
  if v_ticket is not null then
    return v_ticket;
  end if;
  perform private.assert(v_event.capacity is null
    or (select count(*) from public.event_registrations where event_id = p_event) < v_event.capacity, 'Sự kiện đã đủ chỗ');
  insert into public.event_registrations (event_id, student_id) values (p_event, v_user) returning ticket_code into v_ticket;
  perform private.notify(v_user, 'event', format('Đăng ký thành công: %s', v_event.title),
    'Mã vé: ' || v_ticket, '/pages/university/', jsonb_build_object('event_id', p_event, 'ticket_code', v_ticket));
  return v_ticket;
end;
$$;

create or replace function public.check_in_event(p_event uuid, p_ticket_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_event_organizer(p_event), 'Bạn không phải đơn vị tổ chức sự kiện', '42501');
  update public.event_registrations set checked_in_at = coalesce(checked_in_at, now())
  where event_id = p_event and ticket_code = upper(trim(p_ticket_code));
  perform private.assert(found, 'Mã vé không hợp lệ', 'P0002');
end;
$$;

create or replace function public.review_event_booth(p_booth uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_booth public.event_booths;
begin
  perform private.require_user();
  select * into v_booth from public.event_booths where id = p_booth for update;
  perform private.assert(v_booth.id is not null, 'Không tìm thấy gian hàng', 'P0002');
  perform private.assert(private.is_event_organizer(v_booth.event_id), 'Bạn không phải đơn vị tổ chức sự kiện', '42501');
  update public.event_booths
  set status = case when p_approve then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
      note = p_note, reviewed_by = (select auth.uid())
  where id = p_booth;
  perform private.notify_company(v_booth.company_id, 'event',
    case when p_approve then 'Gian hàng Career Fair đã được duyệt' else 'Gian hàng Career Fair bị từ chối' end,
    p_note, '/pages/university/', jsonb_build_object('event_id', v_booth.event_id));
  perform private.log_audit(case when p_approve then 'event_booth.approve' else 'event_booth.reject' end,
    'event_booths', p_booth::text, p_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin live overview (process 9.1). Historical trends come from the warehouse (07).
-- -----------------------------------------------------------------------------
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform private.assert(private.is_admin(), 'Chỉ quản trị viên', '42501');
  return jsonb_build_object(
    'users_by_role',      (select coalesce(jsonb_object_agg(role, n), '{}'::jsonb)
                           from (select role, count(*) n from public.profiles group by role) x),
    'jobs_pending',       (select count(*) from public.jobs where status = 'pending_approval'),
    'jobs_active',        (select count(*) from public.jobs where status = 'active'),
    'companies_pending',  (select count(*) from public.companies where verification_status = 'pending'),
    'reports_open',       (select count(*) from public.reports where status in ('open', 'in_review')),
    'officers_pending',   (select count(*) from public.profiles where role = 'university_officer' and status = 'pending_verification'),
    'applications_today', (select count(*) from public.applications where applied_at >= date_trunc('day', now())),
    'hires_this_month',   (select count(*) from public.applications where hired_at >= date_trunc('month', now()))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Job alerts (DFD 8.2) — called by a scheduled Edge Function with the service role
-- -----------------------------------------------------------------------------
create or replace function public.job_alert_matches(p_alert uuid)
returns setof public.jobs language sql stable security definer set search_path = '' as $$
  select j.*
  from public.job_alerts a
  join public.jobs j on j.status = 'active'
   and j.university_id is null
   and j.published_at > coalesce(a.last_sent_at, now() - interval '1 day')
  where a.id = p_alert and a.is_active
    and (a.keywords is null
         or j.search @@ websearch_to_tsquery('simple'::regconfig, private.unaccent_immutable(a.keywords)))
    and (a.city is null or private.unaccent_immutable(coalesce(j.city, '')) ilike '%' || private.unaccent_immutable(a.city) || '%')
    and (a.industry_id is null or j.industry_id = a.industry_id)
    and (a.work_type is null or j.work_type = a.work_type)
    and (a.min_stipend is null or coalesce(j.stipend_max, j.stipend_min, 0) >= a.min_stipend)
  order by j.published_at desc
  limit 50
$$;

revoke execute on function public.job_alert_matches(uuid) from public, anon, authenticated;
grant execute on function public.job_alert_matches(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Scheduled maintenance (wired to pg_cron in 08)
-- -----------------------------------------------------------------------------
create or replace function private.expire_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update public.jobs set status = 'expired', closed_at = now()
  where status in ('active', 'paused') and deadline is not null and deadline < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.expire_offers()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_offer record;
  v_count integer := 0;
begin
  for v_offer in
    select id, application_id from public.offers where status = 'sent' and expires_at < now() for update skip locked
  loop
    update public.offers set status = 'expired' where id = v_offer.id;
    perform set_config('app.status_note', 'Offer hết hạn phản hồi', true);
    update public.applications set status = 'offer_declined' where id = v_offer.application_id and status = 'offered';
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.purge_old_notifications()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from public.notifications where read_at is not null and created_at < now() - interval '180 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
