-- =============================================================================
-- EasyInternshipp — 08: scheduled jobs (pg_cron)
-- Enable "pg_cron" in Dashboard → Database → Extensions if this migration logs a
-- notice. Times are UTC (Vietnam = UTC+7).
-- =============================================================================

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron is not available (%). Scheduled jobs were not created.', sqlerrm;
    return;
  end;

  -- Close postings whose deadline has passed
  perform cron.schedule('ei-expire-jobs', '*/15 * * * *', 'select private.expire_jobs()');
  -- Offers not answered before expires_at count as declined
  perform cron.schedule('ei-expire-offers', '*/15 * * * *', 'select private.expire_offers()');
  -- Rebuild the warehouse every night at 02:00 Vietnam time
  perform cron.schedule('ei-refresh-analytics', '0 19 * * *', 'select analytics.refresh_all()');
  -- Housekeeping: drop read notifications older than 180 days (Sundays 03:00 VN)
  perform cron.schedule('ei-purge-notifications', '0 20 * * 0', 'select private.purge_old_notifications()');
end;
$$;

-- Job alert e-mails (DFD 8.2) need an Edge Function that calls
-- public.job_alert_matches(alert_id) with the service role and sends the e-mail.
-- Schedule it with pg_net once the function is deployed, e.g.:
--   select cron.schedule('ei-job-alerts', '0 1 * * *', $$
--     select net.http_post(
--       url     := 'https://<project-ref>.supabase.co/functions/v1/job-alerts',
--       headers := jsonb_build_object('Authorization', 'Bearer ' || '<service-role-key from Vault>')
--     ) $$);
