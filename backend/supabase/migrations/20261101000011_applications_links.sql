-- =============================================================================
-- EasyInternshipp — 11: My Applications page (Phase 6)
-- Application notifications for students now open /pages/applications/?id=<application>
-- (previously a profile tab that never existed). Same function body as migration 03 otherwise.
-- =============================================================================

create or replace function private.applications_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_job     record;
  v_note    text := nullif(current_setting('app.status_note', true), '');
  v_student text := '/pages/applications/?id=' || new.id;
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
