// Shared helpers for the end-to-end checks that run against the dev Supabase project.
// Throwaway accounts use unique e-mails (e2e-<id>@demo.internships.io) and are deleted in cleanup().
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../../../backend/scripts/env.mjs';

export const APP = process.env.APP_URL || 'http://127.0.0.1:5173';
export const DEMO_PASSWORD = 'Demo@2026';
export const demo = local => `${local}@demo.internships.io`;

const env = loadEnv();
export const service = env.serviceKey
  ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const created = [];

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@demo.internships.io`;
}

/** Track an account created through the UI so cleanup() removes it. */
export function track(email) { created.push(email); }

/** Create a confirmed throwaway user with the service key. Returns { id, email, password }. */
export async function createUser(metadata = {}, email = uniqueEmail()) {
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for this test');
  const { data, error } = await service.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: metadata });
  if (error) throw error;
  created.push(email);
  return { id: data.user.id, email, password: DEMO_PASSWORD };
}

/** A signed-in supabase-js client for an existing account. */
export async function clientFor(email, password = DEMO_PASSWORD) {
  const client = createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

export async function cleanup() {
  if (!service) return;
  for (const email of created.splice(0)) {
    for (let page = 1; page < 20; page++) {
      const { data } = await service.auth.admin.listUsers({ page, perPage: 200 });
      const user = data?.users.find(u => u.email === email);
      if (user) {
        // Companies created by throwaway employers are removed with them
        const { data: memberships } = await service.from('company_members').select('company_id').eq('user_id', user.id).eq('member_role', 'owner');
        for (const m of memberships ?? []) await service.from('companies').delete().eq('id', m.company_id);
        await service.auth.admin.deleteUser(user.id);
        break;
      }
      if (!data || data.users.length < 200) break;
    }
  }
}

/** Wait until main.ts (or admin.ts) has finished enhancing the page. */
export async function ready(page) {
  await page.waitForSelector('body[data-ready="true"]', { timeout: 20000 });
}

/** Log in through the real login page. */
export async function login(page, email, password = DEMO_PASSWORD, next = '') {
  await page.goto(`${APP}/pages/login/${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await ready(page);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([page.waitForURL(url => !url.pathname.startsWith('/pages/login/'), { timeout: 20000 }), page.click('form button[type=submit]')]);
  await ready(page);
}

export async function logout(page) {
  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k)));
}

/** Collect uncaught page errors so a check can assert there were none. */
export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}
