// Real Supabase sessions for the page-level test scripts (smoke, design, buttons, account, demo, admin).
// A session is injected into localStorage under supabase-js's key, so pages load already signed in.
// Scripts that click or save things use throwaway accounts (removed by cleanup()), never the demo ones.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from '../../backend/scripts/env.mjs';
import { DEMO_PASSWORD, cleanup, createUser, service } from './e2e/helpers.mjs';

const env = loadEnv();
export const STORAGE_KEY = `sb-${new URL(env.url).hostname.split('.')[0]}-auth-token`;
export { cleanup };

function client() {
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Sign in and return the value supabase-js stores in localStorage. */
export async function sessionFor(email, password = DEMO_PASSWORD) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message} (run npm run db:seed first?)`);
  return JSON.stringify(data.session);
}

/** Seeded demo account: 'student' | 'employer' | 'admin' (read-only use only). */
export const demoSession = role => sessionFor(`${role}@demo.internships.io`);

/** A throwaway student (deleted by cleanup()). */
export async function throwawayStudent() {
  const user = await createUser({ role: 'student', full_name: 'Kiểm Thử Tự Động' });
  return sessionFor(user.email);
}

/** A throwaway employer with its own verified company and no jobs (deleted by cleanup()). */
export async function throwawayEmployer() {
  const user = await createUser({ role: 'employer', full_name: 'Nhà Tuyển Dụng Kiểm Thử' });
  const c = client();
  await c.auth.signInWithPassword({ email: user.email, password: DEMO_PASSWORD });
  const { data: companyId, error } = await c.rpc('create_company', { p_name: `Công ty Kiểm Thử ${Date.now() % 1e6}`, p_city: 'TP. Hồ Chí Minh' });
  if (error) throw error;
  await service.from('companies').update({ verification_status: 'verified', verified_at: new Date().toISOString() }).eq('id', companyId);
  return sessionFor(user.email);
}

/** Which kind of account a page needs. */
export const guestPages = ['login', 'register', 'reset-password', 'admin-login'];
export function roleFor(slug) {
  if (guestPages.includes(slug)) return null;
  if (['employer', 'candidates', 'post-job', 'company-settings'].includes(slug)) return 'employer';
  if (slug === 'admin') return 'admin';
  return 'student';
}

/** Put `session` (or nothing, for a guest) into the page's localStorage. The page must be on the app origin. */
export async function setSession(page, session) {
  await page.evaluate(([key, value]) => {
    Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k));
    if (value) localStorage.setItem(key, value);
  }, [STORAGE_KEY, session]);
}

/** Wait until main.ts / admin.ts finished enhancing the page. */
export async function ready(page, timeout = 20000) {
  await page.waitForSelector('body[data-ready="true"]', { timeout });
}
