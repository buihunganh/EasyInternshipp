-- =============================================================================
-- EasyInternshipp — 05: Row Level Security, privileges, public views, realtime
--
-- Model:
--   * RLS is enabled on every public table.
--   * Table privileges are reset, then granted per table. Sensitive columns
--     (status, counters, verification fields) are NOT writable by API roles;
--     they only change through the SECURITY DEFINER RPCs in 04.
--   * anon = guest (Khách vãng lai), authenticated = any signed-in user; the
--     user's business role comes from public.profiles.role.
-- =============================================================================

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Reference data: universities, industries, skills
-- -----------------------------------------------------------------------------
grant select on public.universities, public.industries, public.skills to anon, authenticated;
grant insert, update, delete on public.universities, public.industries, public.skills to authenticated;

create policy "Reference data is public" on public.universities for select to anon, authenticated using (true);
create policy "Reference data is public" on public.industries   for select to anon, authenticated using (true);
create policy "Reference data is public" on public.skills       for select to anon, authenticated using (true);

create policy "Admins manage universities" on public.universities for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage industries" on public.industries for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "Admins manage skills" on public.skills for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path, last_seen_at) on public.profiles to authenticated;

create policy "Profiles visible to self and related users" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.can_view_profile(id));
create policy "Users update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.student_profiles to authenticated;
grant update (university_id, student_code, major, gpa, graduation_year, headline, bio, city, links, is_looking_for_job)
  on public.student_profiles to authenticated;

create policy "Student profile visibility" on public.student_profiles for select to authenticated
  using (private.can_view_student(user_id));
create policy "Students update own profile" on public.student_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.student_skills to authenticated;
create policy "Student skills visibility" on public.student_skills for select to authenticated
  using (private.can_view_student(student_id));
create policy "Students manage own skills" on public.student_skills for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

grant select, insert, update, delete on public.university_officers to authenticated;
create policy "Officer visibility" on public.university_officers for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin() or university_id = private.officer_university_id());
create policy "Admins manage officers" on public.university_officers for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- -----------------------------------------------------------------------------
-- Companies
-- -----------------------------------------------------------------------------
grant select on public.companies to anon, authenticated;
grant update (name, tax_code, industry_id, website, address, city, logo_path, cover_path, description, company_size, founded_year)
  on public.companies to authenticated;
grant delete on public.companies to authenticated;

create policy "Company pages are public" on public.companies for select to anon, authenticated using (true);
create policy "Managers update their company" on public.companies for update to authenticated
  using (private.is_company_manager(id)) with check (private.is_company_manager(id));
create policy "Admins delete companies" on public.companies for delete to authenticated using (private.is_admin());

grant select, delete on public.company_members to authenticated;
grant update (member_role, position_title, department) on public.company_members to authenticated;

create policy "Members see their team" on public.company_members for select to authenticated
  using (private.is_company_member(company_id) or private.is_admin());
create policy "Managers update members" on public.company_members for update to authenticated
  using (private.is_company_manager(company_id)) with check (private.is_company_manager(company_id));
create policy "Managers remove members, members can leave" on public.company_members for delete to authenticated
  using (private.is_company_manager(company_id) or user_id = (select auth.uid()));

grant select, delete on public.company_documents to authenticated;
grant insert (company_id, doc_type, file_path) on public.company_documents to authenticated;

create policy "Managers and admins see documents" on public.company_documents for select to authenticated
  using (private.is_company_manager(company_id) or private.is_admin());
create policy "Managers upload documents" on public.company_documents for insert to authenticated
  with check (private.is_company_manager(company_id) and submitted_by = (select auth.uid()));
create policy "Managers delete pending documents" on public.company_documents for delete to authenticated
  using (private.is_company_manager(company_id) and status = 'pending');

grant select, insert, delete on public.company_follows to authenticated;
create policy "Users see own follows" on public.company_follows for select to authenticated
  using (student_id = (select auth.uid()));
create policy "Users follow companies" on public.company_follows for insert to authenticated
  with check (student_id = (select auth.uid()) and private.is_active_user());
create policy "Users unfollow companies" on public.company_follows for delete to authenticated
  using (student_id = (select auth.uid()));

grant select on public.university_partnerships to anon, authenticated;
grant insert (university_id, company_id, status, starts_on, ends_on, document_path, note),
      update (status, starts_on, ends_on, document_path, note),
      delete on public.university_partnerships to authenticated;

create policy "Active partnerships are public" on public.university_partnerships for select to anon, authenticated
  using (status = 'active' or university_id = private.officer_university_id()
         or private.is_company_member(company_id) or private.is_admin());
create policy "Officers manage their partnerships" on public.university_partnerships for all to authenticated
  using (university_id = private.officer_university_id() or private.is_admin())
  with check (university_id = private.officer_university_id() or private.is_admin());

-- -----------------------------------------------------------------------------
-- CVs
-- -----------------------------------------------------------------------------
grant select on public.cvs to anon, authenticated;
grant insert (title, source, template, content, file_path, is_default, is_public),
      update (title, source, template, content, file_path, is_default, is_public),
      delete on public.cvs to authenticated;

create policy "CV visibility" on public.cvs for select to anon, authenticated
  using (is_public or student_id = (select auth.uid()) or private.is_admin() or private.company_can_view_cv(id));
create policy "Students create CVs" on public.cvs for insert to authenticated
  with check (student_id = (select auth.uid()) and private.current_user_role() = 'student');
create policy "Students update own CVs" on public.cvs for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy "Students delete own CVs" on public.cvs for delete to authenticated
  using (student_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Jobs
-- -----------------------------------------------------------------------------
grant select on public.jobs to anon, authenticated;
grant insert (company_id, title, description, requirements, benefits, industry_id, city, address, work_type, schedule,
              duration_months, openings, stipend_min, stipend_max, stipend_currency, stipend_negotiable, deadline, university_id),
      update (title, description, requirements, benefits, industry_id, city, address, work_type, schedule,
              duration_months, openings, stipend_min, stipend_max, stipend_currency, stipend_negotiable, deadline, university_id),
      delete on public.jobs to authenticated;

create policy "Job visibility" on public.jobs for select to anon, authenticated
  using (
    (status = 'active' and (university_id is null
                            or (university_approval = 'approved' and private.is_verified_student_of(university_id))))
    or private.is_company_member(company_id)
    or private.is_admin()
    or (university_id is not null and university_id = private.officer_university_id())
    or private.has_applied(id)
  );
create policy "Recruiters create jobs" on public.jobs for insert to authenticated
  with check (private.is_company_member(company_id) and created_by = (select auth.uid()));
create policy "Recruiters update their jobs" on public.jobs for update to authenticated
  using (private.is_company_member(company_id)) with check (private.is_company_member(company_id));
create policy "Recruiters delete draft jobs" on public.jobs for delete to authenticated
  using (private.is_company_member(company_id) and status = 'draft');

grant select on public.job_skills, public.screening_questions to anon, authenticated;
grant insert, update, delete on public.job_skills, public.screening_questions to authenticated;

create policy "Job skills follow job visibility" on public.job_skills for select to anon, authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));
create policy "Recruiters manage job skills" on public.job_skills for all to authenticated
  using (private.is_company_member(private.job_company_id(job_id)))
  with check (private.is_company_member(private.job_company_id(job_id)));

create policy "Questions follow job visibility" on public.screening_questions for select to anon, authenticated
  using (exists (select 1 from public.jobs j where j.id = job_id));
create policy "Recruiters manage questions" on public.screening_questions for all to authenticated
  using (private.is_company_member(private.job_company_id(job_id)))
  with check (private.is_company_member(private.job_company_id(job_id)));

grant select, insert, update, delete on public.screening_question_keys to authenticated;
create policy "Only recruiters see answer keys" on public.screening_question_keys for all to authenticated
  using (private.is_company_member(private.question_company_id(question_id)))
  with check (private.is_company_member(private.question_company_id(question_id)));

grant select, insert, delete on public.saved_jobs to authenticated;
create policy "Users manage saved jobs" on public.saved_jobs for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- job_views: written only by record_job_view(); no API privileges.

grant select, insert, update, delete on public.pipeline_stages to authenticated;
create policy "Recruiters manage pipeline" on public.pipeline_stages for all to authenticated
  using (private.is_company_member(private.job_company_id(job_id)))
  with check (private.is_company_member(private.job_company_id(job_id)));

-- -----------------------------------------------------------------------------
-- Applications & ATS (writes go through RPCs)
-- -----------------------------------------------------------------------------
grant select on public.applications, public.application_answers, public.application_status_history,
               public.interviews, public.offers to authenticated;

create policy "Application visibility" on public.applications for select to authenticated
  using (student_id = (select auth.uid())
         or private.is_company_member(private.job_company_id(job_id))
         or private.is_admin()
         or private.officer_can_view_student(student_id));
create policy "Answers follow application" on public.application_answers for select to authenticated
  using (private.can_view_application(application_id));
create policy "History follows application" on public.application_status_history for select to authenticated
  using (private.can_view_application(application_id));
create policy "Interviews follow application" on public.interviews for select to authenticated
  using (private.can_view_application(application_id));
create policy "Offers follow application" on public.offers for select to authenticated
  using (private.can_view_application(application_id));

-- Scorecards are internal to the hiring company
grant select, delete on public.evaluations to authenticated;
grant insert (application_id, interview_id, score, criteria, comment),
      update (score, criteria, comment) on public.evaluations to authenticated;
create policy "Recruiters see evaluations" on public.evaluations for select to authenticated
  using (private.is_company_member(private.application_company_id(application_id)) or private.is_admin());
create policy "Recruiters add evaluations" on public.evaluations for insert to authenticated
  with check (evaluator_id = (select auth.uid())
              and private.is_company_member(private.application_company_id(application_id)));
create policy "Evaluators edit own evaluations" on public.evaluations for update to authenticated
  using (evaluator_id = (select auth.uid())) with check (evaluator_id = (select auth.uid()));
create policy "Evaluators delete own evaluations" on public.evaluations for delete to authenticated
  using (evaluator_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Messaging (conversations are created by start_conversation / schedule_interview)
-- -----------------------------------------------------------------------------
grant select on public.conversations to authenticated;
create policy "Participants see conversations" on public.conversations for select to authenticated
  using (private.is_conversation_participant(id));

grant select on public.conversation_participants to authenticated;
grant update (last_read_at, is_muted, is_archived) on public.conversation_participants to authenticated;
create policy "Participants see each other" on public.conversation_participants for select to authenticated
  using (private.is_conversation_participant(conversation_id));
create policy "Users update own participation" on public.conversation_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.messages to authenticated;
grant insert (conversation_id, kind, body, attachment_path, attachment_name, attachment_size),
      update (body, deleted_at) on public.messages to authenticated;
create policy "Participants read messages" on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id));
create policy "Participants send messages" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and kind in ('text', 'file')
              and private.is_active_user() and private.is_conversation_participant(conversation_id));
create policy "Senders edit own messages" on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and kind in ('text', 'file'))
  with check (sender_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Community. Anonymous posts/comments are only exposed through post_feed /
-- comment_feed, which hide the author.
-- -----------------------------------------------------------------------------
grant select on public.posts, public.post_comments to anon, authenticated;
grant insert (type, title, body, is_anonymous, company_id, rating, tags, attachment_path),
      update (title, body, is_anonymous, tags, attachment_path, rating),
      delete on public.posts to authenticated;
grant insert (post_id, parent_id, body, is_anonymous),
      update (body),
      delete on public.post_comments to authenticated;

create policy "Public non-anonymous posts" on public.posts for select to anon, authenticated
  using ((status = 'published' and not is_anonymous) or author_id = (select auth.uid()) or private.is_admin());
create policy "Users create posts" on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_active_user());
create policy "Authors update posts" on public.posts for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Authors delete posts" on public.posts for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_admin());

create policy "Public non-anonymous comments" on public.post_comments for select to anon, authenticated
  using ((status = 'published' and not is_anonymous) or author_id = (select auth.uid()) or private.is_admin());
create policy "Users comment" on public.post_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_active_user()
              and private.post_accepts_comments(post_id));
create policy "Authors update comments" on public.post_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
create policy "Authors delete comments" on public.post_comments for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_admin());

grant select, insert, delete on public.post_likes, public.post_bookmarks to authenticated;
create policy "Users manage own likes" on public.post_likes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.is_active_user());
create policy "Users manage own bookmarks" on public.post_bookmarks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Trust & safety
-- -----------------------------------------------------------------------------
grant insert (target_type, target_id, reason, details) on public.reports to anon, authenticated;
grant select on public.reports to authenticated;

create policy "Guests can report" on public.reports for insert to anon
  with check (reporter_id is null);
create policy "Users can report" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "Reporters and admins see reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_admin());

grant select on public.audit_logs to authenticated;
create policy "Admins read audit log" on public.audit_logs for select to authenticated using (private.is_admin());

grant select, insert, update, delete on public.platform_settings to authenticated;
create policy "Admins manage settings" on public.platform_settings for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- -----------------------------------------------------------------------------
-- Notifications & alerts
-- -----------------------------------------------------------------------------
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "Users read own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users mark own notifications" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete own notifications" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.notification_preferences to authenticated;
grant update (in_app, email_application_updates, email_messages, email_job_alerts, email_community, email_marketing)
  on public.notification_preferences to authenticated;
create policy "Users read own preferences" on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update own preferences" on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, delete on public.job_alerts to authenticated;
grant insert (name, keywords, city, industry_id, work_type, min_stipend, frequency, is_active),
      update (name, keywords, city, industry_id, work_type, min_stipend, frequency, is_active) on public.job_alerts to authenticated;
create policy "Users manage own job alerts" on public.job_alerts for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Career fairs
-- -----------------------------------------------------------------------------
grant select on public.events to anon, authenticated;
grant insert (title, description, organizer_university_id, starts_at, ends_at, location, is_virtual, capacity, status, cover_path),
      update (title, description, starts_at, ends_at, location, is_virtual, capacity, status, cover_path),
      delete on public.events to authenticated;
create policy "Published events are public" on public.events for select to anon, authenticated
  using (status in ('published', 'completed') or private.is_admin()
         or (organizer_university_id is not null and organizer_university_id = private.officer_university_id()));
create policy "Organizers manage events" on public.events for all to authenticated
  using (private.is_admin() or (organizer_university_id is not null and organizer_university_id = private.officer_university_id()))
  with check (private.is_admin() or (organizer_university_id is not null and organizer_university_id = private.officer_university_id()));

grant select on public.event_booths to anon, authenticated;
grant insert (event_id, company_id, booth_label, note), delete on public.event_booths to authenticated;
create policy "Booth visibility" on public.event_booths for select to anon, authenticated
  using ((status = 'approved' and exists (select 1 from public.events e where e.id = event_id))
         or private.is_company_member(company_id) or private.is_event_organizer(event_id));
create policy "Companies request booths" on public.event_booths for insert to authenticated
  with check (private.is_company_manager(company_id)
              and exists (select 1 from public.companies c where c.id = company_id and c.verification_status = 'verified')
              and exists (select 1 from public.events e where e.id = event_id and e.status = 'published' and e.ends_at > now()));
create policy "Companies cancel pending booths" on public.event_booths for delete to authenticated
  using (private.is_company_manager(company_id) and status = 'pending');

grant select, delete on public.event_registrations to authenticated;
create policy "Registration visibility" on public.event_registrations for select to authenticated
  using (student_id = (select auth.uid()) or private.is_event_organizer(event_id));
create policy "Students cancel registration" on public.event_registrations for delete to authenticated
  using (student_id = (select auth.uid()) and checked_in_at is null);

-- -----------------------------------------------------------------------------
-- University portal
-- -----------------------------------------------------------------------------
grant select on public.internship_reports to authenticated;
create policy "Internship report visibility" on public.internship_reports for select to authenticated
  using (student_id = (select auth.uid()) or private.is_admin()
         or (university_id is not null and university_id = private.officer_university_id())
         or private.is_company_member(private.application_company_id(application_id)));

grant insert (university_id, contact_name, company_name, email, phone, message) on public.partner_inquiries to anon, authenticated;
grant select, update (status) on public.partner_inquiries to authenticated;
create policy "Anyone can send a partner inquiry" on public.partner_inquiries for insert to anon, authenticated
  with check (status = 'new');
create policy "Officers handle their inquiries" on public.partner_inquiries for select to authenticated
  using (university_id = private.officer_university_id() or private.is_admin());
create policy "Officers update their inquiries" on public.partner_inquiries for update to authenticated
  using (university_id = private.officer_university_id() or private.is_admin())
  with check (university_id = private.officer_university_id() or private.is_admin());

-- -----------------------------------------------------------------------------
-- Public read models. These views intentionally run with the owner's rights
-- (security_invoker = false) to expose a safe column subset of RLS-protected
-- tables. Supabase's linter flags them as "security definer views": that is expected.
-- -----------------------------------------------------------------------------
create view public.public_profiles with (security_invoker = false) as
  select p.id, p.full_name, p.avatar_path, p.role
  from public.profiles p
  where p.status = 'active';

create view public.post_feed with (security_invoker = false) as
  select p.id, p.type, p.title, p.body, p.tags, p.attachment_path, p.like_count, p.comment_count,
         p.is_anonymous,
         case when p.is_anonymous then null else p.author_id end         as author_id,
         case when p.is_anonymous then 'Ẩn danh' else a.full_name end    as author_name,
         case when p.is_anonymous then null else a.avatar_path end       as author_avatar_path,
         p.company_id, c.name as company_name, p.rating, p.created_at, p.updated_at
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.companies c on c.id = p.company_id
  where p.status = 'published';

create view public.comment_feed with (security_invoker = false) as
  select cm.id, cm.post_id, cm.parent_id, cm.body, cm.is_anonymous,
         case when cm.is_anonymous then null else cm.author_id end      as author_id,
         case when cm.is_anonymous then 'Ẩn danh' else a.full_name end  as author_name,
         case when cm.is_anonymous then null else a.avatar_path end     as author_avatar_path,
         cm.created_at, cm.updated_at
  from public.post_comments cm
  join public.profiles a on a.id = cm.author_id
  join public.posts p on p.id = cm.post_id and p.status = 'published'
  where cm.status = 'published';

create view public.company_ratings with (security_invoker = false) as
  select company_id, count(*) as review_count, round(avg(rating), 2) as avg_rating
  from public.posts
  where type = 'review' and status = 'published'
  group by company_id;

-- Supabase's default privileges grant ALL on new public objects to anon/authenticated.
-- These views run with owner rights (and public_profiles is auto-updatable), so reset
-- them to read-only explicitly.
revoke all on public.public_profiles, public.post_feed, public.comment_feed, public.company_ratings
  from public, anon, authenticated;
grant select on public.public_profiles to authenticated;
grant select on public.post_feed, public.comment_feed, public.company_ratings to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime: chat bubbles and the notification bell update live (RLS still applies)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications, public.conversation_participants;
  end if;
end;
$$;
