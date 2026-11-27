// Phase 12: the e-mail hooks must never break the workflows that create notifications, and must stay
// inactive (no request) until the Vault secrets exist.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });

describe('e-mail automation (D5)', () => {
  it('the notifications trigger is installed', async () => {
    const rows = await db.sql(`select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'notifications_email_hook'`);
    assert.equal(rows.length, 1);
  });

  it('without Vault / pg_net the hook is a no-op and the notification is still created', async () => {
    const user = await db.createUser({ full_name: 'Sinh viên' });
    await db.sql(`insert into public.notifications (user_id, type, title) values ($1, 'application_status', 'Hồ sơ đã được xem')`, [user]);
    const [{ n }] = await db.sql(`select count(*)::int as n from public.notifications where user_id = $1`, [user]);
    assert.equal(n, 1);
    const [{ called }] = await db.sql(`select private.call_edge_function('notify-email', '{}'::jsonb) as called`);
    assert.equal(called, false);
  });

  it('clients cannot call the edge-function helper', async () => {
    const user = await db.createUser();
    await assert.rejects(db.q(user, `select private.call_edge_function('job-alerts')`), /permission denied/);
  });
});
