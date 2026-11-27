-- =============================================================================
-- EasyInternshipp — 12: e-mail automation (Phase 12, decision D5)
--
-- * notifications INSERT → Edge Function `notify-email` (checks notification_preferences,
--   sends through Resend). Only the notification id is posted; the function reloads the row
--   with the service role, so nothing in the request body is trusted.
-- * Daily 08:00 (Vietnam) → Edge Function `job-alerts` (job_alert_matches digest per alert).
--
-- Both calls go through pg_net and read two Vault secrets. Until they exist (and on databases
-- without Vault / pg_net, such as the PGlite tests) the hooks do nothing:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'ei_functions_url');
--   select vault.create_secret('<random string, same as EI_WEBHOOK_SECRET>',     'ei_webhook_secret');
-- An e-mail problem never blocks the notification insert (errors become warnings).
-- =============================================================================

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net is not available (%). E-mail hooks stay inactive.', sqlerrm;
end;
$$;

/** POST `body` to <ei_functions_url>/<fn> with the shared secret; no-op when not configured. */
create or replace function private.call_edge_function(p_function text, p_body jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_url    text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then
    return false;
  end if;
  execute $q$select max(decrypted_secret) filter (where name = 'ei_functions_url'),
                    max(decrypted_secret) filter (where name = 'ei_webhook_secret')
             from vault.decrypted_secrets where name in ('ei_functions_url', 'ei_webhook_secret')$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using rtrim(v_url, '/') || '/' || p_function, p_body,
          jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  return true;
exception when others then
  raise warning 'Edge Function % not called: %', p_function, sqlerrm;
  return false;
end;
$$;

revoke execute on function private.call_edge_function(text, jsonb) from public, anon, authenticated;

create or replace function private.notifications_email_hook()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- System notices stay in-app only, so no request is made for them
  if new.type <> 'system' then
    perform private.call_edge_function('notify-email', jsonb_build_object('notification_id', new.id));
  end if;
  return new;
exception when others then
  raise warning 'notification e-mail hook skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notifications_email_hook on public.notifications;
create trigger notifications_email_hook after insert on public.notifications
  for each row execute function private.notifications_email_hook();

-- Daily job-alert digest (01:00 UTC = 08:00 Vietnam)
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron is not available. ei-job-alerts was not scheduled.';
    return;
  end if;
  perform cron.schedule('ei-job-alerts', '0 1 * * *', $job$select private.call_edge_function('job-alerts')$job$);
exception when others then
  raise notice 'ei-job-alerts was not scheduled: %', sqlerrm;
end;
$$;
