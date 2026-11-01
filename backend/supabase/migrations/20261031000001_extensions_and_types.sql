-- =============================================================================
-- EasyInternshipp (Internships.io) — 01: extensions, schemas, enum types
-- Source of truth: diagrams/ (Class, DFD L1/L2, Activity, Sequence diagrams)
--
-- Schemas
--   public    → application tables, exposed through the Supabase Data API (RLS on)
--   private   → helper/trigger functions, never exposed through the API
--   analytics → data-warehouse layer (star schema), not exposed to anon/authenticated
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

create schema if not exists private;
create schema if not exists analytics;

-- RLS policies call private.* helpers as the requesting role, so the API roles
-- need USAGE on the schema (it is still not exposed via PostgREST).
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges in schema private revoke execute on functions from public;

revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to service_role;

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------
create type public.user_role           as enum ('student', 'employer', 'university_officer', 'admin');
create type public.account_status      as enum ('active', 'pending_verification', 'suspended', 'deactivated');
create type public.verify_status       as enum ('unverified', 'pending', 'verified', 'rejected', 'revoked');
create type public.company_member_role as enum ('owner', 'admin', 'recruiter');
create type public.approval_status     as enum ('pending', 'approved', 'rejected');
create type public.partnership_status  as enum ('pending', 'active', 'expired', 'terminated');

create type public.work_type     as enum ('onsite', 'hybrid', 'remote');
create type public.work_schedule as enum ('full_time', 'part_time', 'flexible');
-- Job lifecycle (Activity_Employer_Recruitment + Sequence_Job_Posting_Moderation)
create type public.job_status    as enum ('draft', 'pending_approval', 'active', 'rejected', 'paused', 'closed', 'expired');
create type public.question_kind as enum ('yes_no', 'short_text', 'single_choice');

-- Canonical application lifecycle (unifies applied/Submitted/INTERVIEWING naming
-- used across the diagrams). Kanban columns are separate: pipeline_stages.
create type public.application_status as enum (
  'applied', 'cv_viewed', 'shortlisted', 'interviewing', 'offered',
  'hired', 'rejected', 'withdrawn', 'offer_declined'
);
create type public.interview_mode   as enum ('online', 'onsite', 'phone');
create type public.interview_status as enum ('scheduled', 'completed', 'cancelled', 'no_show');
create type public.rsvp_status      as enum ('pending', 'accepted', 'reschedule_requested', 'declined');
create type public.offer_status     as enum ('sent', 'accepted', 'declined', 'expired', 'withdrawn');

create type public.cv_source     as enum ('builder', 'upload');
create type public.message_kind  as enum ('text', 'file', 'interview_invite', 'system');
create type public.post_type     as enum ('experience', 'question', 'review', 'document');
create type public.content_status as enum ('published', 'hidden', 'removed');

create type public.report_target as enum ('job', 'company', 'user', 'post', 'comment', 'message');
create type public.report_reason as enum ('scam_fee', 'fake_job', 'harassment', 'spam', 'misinformation', 'inappropriate', 'other');
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');

create type public.notification_type as enum (
  'application_received', 'application_status', 'cv_viewed', 'interview_invite', 'interview_rsvp',
  'offer_received', 'offer_response', 'job_moderated', 'company_verification', 'student_verification',
  'message', 'report_update', 'job_alert', 'event', 'account', 'system'
);
create type public.alert_frequency  as enum ('instant', 'daily', 'weekly');
create type public.event_status     as enum ('draft', 'published', 'cancelled', 'completed');
create type public.cert_status      as enum ('draft', 'submitted', 'certified', 'rejected');
create type public.inquiry_status   as enum ('new', 'contacted', 'closed');

-- -----------------------------------------------------------------------------
-- Text helpers needed by generated columns (must exist before tables)
-- -----------------------------------------------------------------------------
-- unaccent() is STABLE; this wrapper pins the dictionary so it can be IMMUTABLE
-- and used in generated tsvector columns. Handles Vietnamese diacritics (đ → d).
create or replace function private.unaccent_immutable(p_text text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_text)
$$;

create or replace function private.slugify(p_text text)
returns text
language sql immutable parallel safe strict
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(private.unaccent_immutable(p_text)), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql immutable parallel safe
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.unaccent_immutable(text), private.slugify(text), private.try_uuid(text)
  to anon, authenticated, service_role;
