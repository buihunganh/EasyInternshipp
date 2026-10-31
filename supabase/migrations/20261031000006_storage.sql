-- =============================================================================
-- EasyInternshipp — 06: Supabase Storage buckets & object policies
--
-- Path convention: the FIRST folder of every object key identifies the owner,
-- and policies check it with storage.foldername(name)[1].
--
--   bucket               public  first folder        used by
--   avatars              yes     <user_id>           profiles.avatar_path
--   company-assets       yes     <company_id>        companies.logo_path / cover_path, universities/<id> (admin)
--   post-attachments     yes     <user_id>           posts.attachment_path (shared documents / exam files)
--   cvs                  no      <student_id>        cvs.file_path, applications.cv_file_path
--   company-documents    no      <company_id>        company_documents.file_path (GPKD, MST)
--   message-attachments  no      <conversation_id>   messages.attachment_path
--   offer-letters        no      <application_id>    offers.letter_path
--   internship-reports   no      <student_id>        internship_reports.file_path
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',             'avatars',             true,   2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('company-assets',      'company-assets',      true,   5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('post-attachments',    'post-attachments',    true,  10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('cvs',                 'cvs',                 false,  5242880, array['application/pdf', 'application/msword',
                                                                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('company-documents',   'company-documents',   false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('message-attachments', 'message-attachments', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
                                                                       'application/msword', 'text/plain', 'application/zip',
                                                                       'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('offer-letters',       'offer-letters',       false,  5242880, array['application/pdf']),
  ('internship-reports',  'internship-reports',  false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.object_owner_folder(p_name text)
returns text language sql stable set search_path = '' as $$
  select (storage.foldername(p_name))[1]
$$;

create or replace function private.can_read_cv_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.object_owner_folder(p_name) = (select auth.uid())::text
      or private.is_admin()
      or exists (select 1 from public.cvs where file_path = p_name and is_public)
      or exists (select 1 from public.applications a
                 join public.jobs j on j.id = a.job_id
                 where a.cv_file_path = p_name and private.is_company_member(j.company_id))
$$;

grant execute on function private.object_owner_folder(text), private.can_read_cv_object(text)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Public buckets: anyone can download through the public URL; writes are scoped.
-- -----------------------------------------------------------------------------
create policy "ei: users manage own avatar" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and private.object_owner_folder(name) = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and private.object_owner_folder(name) = (select auth.uid())::text);

create policy "ei: managers manage company assets" on storage.objects for all to authenticated
  using (bucket_id = 'company-assets'
         and (private.is_company_manager(private.try_uuid(private.object_owner_folder(name))) or private.is_admin()))
  with check (bucket_id = 'company-assets'
              and (private.is_company_manager(private.try_uuid(private.object_owner_folder(name))) or private.is_admin()));

create policy "ei: users manage own post attachments" on storage.objects for all to authenticated
  using (bucket_id = 'post-attachments' and private.object_owner_folder(name) = (select auth.uid())::text)
  with check (bucket_id = 'post-attachments' and private.object_owner_folder(name) = (select auth.uid())::text
              and private.is_active_user());

-- -----------------------------------------------------------------------------
-- CVs: owner writes; owner, hiring companies of submitted applications, public
-- CVs and admins can read.
-- -----------------------------------------------------------------------------
create policy "ei: read cv files" on storage.objects for select to anon, authenticated
  using (bucket_id = 'cvs' and private.can_read_cv_object(name));

create policy "ei: students upload cv files" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and private.object_owner_folder(name) = (select auth.uid())::text);

create policy "ei: students update cv files" on storage.objects for update to authenticated
  using (bucket_id = 'cvs' and private.object_owner_folder(name) = (select auth.uid())::text)
  with check (bucket_id = 'cvs' and private.object_owner_folder(name) = (select auth.uid())::text);

-- Files referenced by a submitted application are frozen so employers always see what was sent
create policy "ei: students delete unused cv files" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and private.object_owner_folder(name) = (select auth.uid())::text
         and not exists (select 1 from public.applications a where a.cv_file_path = name));

-- -----------------------------------------------------------------------------
-- Company verification documents (GPKD / MST)
-- -----------------------------------------------------------------------------
create policy "ei: managers and admins read company documents" on storage.objects for select to authenticated
  using (bucket_id = 'company-documents'
         and (private.is_company_manager(private.try_uuid(private.object_owner_folder(name))) or private.is_admin()));

create policy "ei: managers upload company documents" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-documents'
              and private.is_company_manager(private.try_uuid(private.object_owner_folder(name))));

create policy "ei: managers delete company documents" on storage.objects for delete to authenticated
  using (bucket_id = 'company-documents'
         and private.is_company_manager(private.try_uuid(private.object_owner_folder(name))));

-- -----------------------------------------------------------------------------
-- Chat attachments: participants of the conversation only
-- -----------------------------------------------------------------------------
create policy "ei: participants read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'message-attachments'
         and private.is_conversation_participant(private.try_uuid(private.object_owner_folder(name))));

create policy "ei: participants upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'message-attachments'
              and private.is_conversation_participant(private.try_uuid(private.object_owner_folder(name)))
              and private.is_active_user());

-- -----------------------------------------------------------------------------
-- Offer letters: hiring company uploads; candidate, company and admins read
-- -----------------------------------------------------------------------------
create policy "ei: read offer letters" on storage.objects for select to authenticated
  using (bucket_id = 'offer-letters'
         and private.can_view_application(private.try_uuid(private.object_owner_folder(name))));

create policy "ei: companies upload offer letters" on storage.objects for insert to authenticated
  with check (bucket_id = 'offer-letters'
              and private.is_company_member(private.application_company_id(private.try_uuid(private.object_owner_folder(name)))));

-- -----------------------------------------------------------------------------
-- Internship reports: student and their university officers
-- -----------------------------------------------------------------------------
create policy "ei: read internship reports" on storage.objects for select to authenticated
  using (bucket_id = 'internship-reports'
         and (private.object_owner_folder(name) = (select auth.uid())::text
              or private.officer_can_view_student(private.try_uuid(private.object_owner_folder(name)))
              or private.is_admin()));

create policy "ei: upload internship reports" on storage.objects for insert to authenticated
  with check (bucket_id = 'internship-reports'
              and (private.object_owner_folder(name) = (select auth.uid())::text
                   or private.officer_can_view_student(private.try_uuid(private.object_owner_folder(name)))));
