import { supabase, signedUrl, type Database, type Enums } from '../../core/supabase';
import { toAppError, unwrap } from '../../core/errors';
import { currentSession } from '../../core/session';

const uid = () => currentSession()?.user.id ?? '';
async function rpc(name: keyof Database['public']['Functions'], args: Record<string, unknown>) {
  const { error } = await supabase.rpc(name as never, args as never);
  if (error) throw toAppError(error);
}

const applicationSelect = `id, status, applied_at, viewed_at, status_changed_at, rejection_reason, withdrawal_reason, cover_letter, knockout_passed,
  job:jobs(id, title, city, status, company:companies(id, name, logo_path)),
  interviews(id, round, scheduled_at, duration_minutes, mode, meeting_url, location, status, rsvp, rsvp_note, proposed_at),
  offers(id, stipend_amount, currency, start_date, end_date, expires_at, terms, letter_path, status, response_note, sent_at),
  answers:application_answers(answer, question:screening_questions(question, position))`;

export async function listApplications() {
  return unwrap(await supabase.from('applications').select(applicationSelect).eq('student_id', uid()).order('applied_at', { ascending: false }));
}
export type MyApplication = Awaited<ReturnType<typeof listApplications>>[number];

export async function statusHistory(applicationId: string) {
  return unwrap(await supabase.from('application_status_history').select('id, from_status, to_status, note, changed_at')
    .eq('application_id', applicationId).order('changed_at'));
}

export const withdraw = (id: string, reason: string) => rpc('withdraw_application', { p_application: id, p_reason: reason || null });
export const respondInterview = (id: string, rsvp: Enums<'rsvp_status'>, note: string | null, proposedAt: string | null) =>
  rpc('respond_interview', { p_interview: id, p_rsvp: rsvp, p_note: note, p_proposed_at: proposedAt });
export const respondOffer = (id: string, accept: boolean, note: string | null) => rpc('respond_offer', { p_offer: id, p_accept: accept, p_note: note });
export const offerLetterUrl = (path: string) => signedUrl('offer-letters', path);

// --- Job alerts ---------------------------------------------------------------------
export async function listAlerts() {
  return unwrap(await supabase.from('job_alerts').select('id, name, keywords, city, industry_id, work_type, min_stipend, frequency, is_active, last_sent_at, created_at')
    .order('created_at', { ascending: false }));
}
export type JobAlert = Awaited<ReturnType<typeof listAlerts>>[number];
type AlertFields = Pick<Database['public']['Tables']['job_alerts']['Insert'], 'name' | 'keywords' | 'city' | 'industry_id' | 'work_type' | 'min_stipend' | 'frequency'>;

// student_id comes from its column default (auth.uid()); clients may not write it
export async function createAlert(fields: AlertFields) { unwrap(await supabase.from('job_alerts').insert(fields)); }
export async function setAlertActive(id: string, active: boolean) { unwrap(await supabase.from('job_alerts').update({ is_active: active }).eq('id', id)); }
export async function deleteAlert(id: string) { unwrap(await supabase.from('job_alerts').delete().eq('id', id)); }
export async function listIndustries() { return unwrap(await supabase.from('industries').select('id, name').order('name')); }
