// Account-level data used by the shared header / account menu on every page.
import { supabase, type Tables } from './supabase';
import { unwrap } from './errors';
import { currentSession } from './session';

const uid = () => currentSession()?.user.id ?? '';

export type SavedJob = { job_id: string; created_at: string; job: { id: string; title: string; status: string; company: { name: string } | null } | null };

export async function listSavedJobs() {
  return unwrap(await supabase.from('saved_jobs')
    .select('job_id, created_at, job:jobs(id, title, status, company:companies(name))')
    .order('created_at', { ascending: false })) as unknown as SavedJob[];
}

export async function savedJobIds() {
  if (!uid()) return new Set<string>();
  return new Set(unwrap(await supabase.from('saved_jobs').select('job_id')).map(r => r.job_id));
}

export async function setJobSaved(jobId: string, saved: boolean) {
  if (saved) unwrap(await supabase.from('saved_jobs').upsert({ job_id: jobId, student_id: uid() }, { onConflict: 'student_id,job_id', ignoreDuplicates: true }));
  else unwrap(await supabase.from('saved_jobs').delete().eq('job_id', jobId).eq('student_id', uid()));
  window.dispatchEvent(new CustomEvent('saved-jobs-changed', { detail: { jobId, saved } }));
}

export type NotificationPrefs = Pick<Tables<'notification_preferences'>,
  'in_app' | 'email_application_updates' | 'email_messages' | 'email_job_alerts' | 'email_community'>;

export async function getNotificationPrefs() {
  return unwrap(await supabase.from('notification_preferences')
    .select('in_app, email_application_updates, email_messages, email_job_alerts, email_community').eq('user_id', uid()).single()) as NotificationPrefs;
}

export async function saveNotificationPrefs(prefs: NotificationPrefs) {
  unwrap(await supabase.from('notification_preferences').update(prefs).eq('user_id', uid()));
}

export async function latestNotifications(limit = 10) {
  return unwrap(await supabase.from('notifications').select('id, type, title, body, link, read_at, created_at')
    .order('created_at', { ascending: false }).limit(limit));
}

export async function markNotificationsRead(ids?: string[]) {
  let query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids) query = query.in('id', ids);
  unwrap(await query);
}

export async function unreadNotificationCount() {
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  return count ?? 0;
}

/** Companies the signed-in employer belongs to (first = default). */
export async function myCompanies() {
  if (!uid()) return [];
  return unwrap(await supabase.from('company_members')
    .select('member_role, company:companies(id, name, slug, logo_path, verification_status, verification_note)')
    .eq('user_id', uid()).order('created_at')) as unknown as {
      member_role: Tables<'company_members'>['member_role'];
      company: Pick<Tables<'companies'>, 'id' | 'name' | 'slug' | 'logo_path' | 'verification_status' | 'verification_note'>;
    }[];
}
