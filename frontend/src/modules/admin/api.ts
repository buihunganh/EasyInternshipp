import { supabase, signedUrl, type Enums } from '../../core/supabase';
import { toAppError, unwrap } from '../../core/errors';

export type Overview = {
  users_by_role: Record<string, number>; jobs_pending: number; jobs_active: number; companies_pending: number;
  reports_open: number; officers_pending: number; applications_today: number; hires_this_month: number;
};

export async function overview() {
  return unwrap(await supabase.rpc('admin_overview')) as unknown as Overview;
}

// --- Companies -----------------------------------------------------------------
export async function listCompanies(status: Enums<'verify_status'> | '' = 'pending') {
  let query = supabase.from('companies')
    .select('id, name, tax_code, city, website, verification_status, verification_note, created_at, documents:company_documents(id, doc_type, file_path, status, created_at)')
    .order('updated_at', { ascending: false }).limit(200);
  if (status) query = query.eq('verification_status', status);
  return unwrap(await query);
}

export const documentUrl = (path: string) => signedUrl('company-documents', path);

export async function reviewCompany(company: string, decision: 'verified' | 'rejected' | 'revoked', note: string | null) {
  const { error } = await supabase.rpc('review_company_verification', { p_company: company, p_decision: decision, p_note: note ?? undefined });
  if (error) throw toAppError(error);
}

// --- Jobs ----------------------------------------------------------------------
export async function listJobs(status: Enums<'job_status'> | '' = 'pending_approval') {
  let query = supabase.from('jobs')
    .select('id, title, status, city, work_type, stipend_min, stipend_max, deadline, description, requirements, rejection_reason, submitted_at, published_at, company:companies(id, name, verification_status)')
    .order('submitted_at', { ascending: false, nullsFirst: false }).limit(200);
  query = status ? query.eq('status', status) : query.neq('status', 'draft');
  return unwrap(await query);
}

export async function moderateJob(job: string, approve: boolean, reason: string | null) {
  const { error } = await supabase.rpc('moderate_job', { p_job: job, p_approve: approve, p_reason: reason ?? undefined });
  if (error) throw toAppError(error);
}

export async function takeDownJob(job: string, reason: string) {
  const { error } = await supabase.rpc('admin_close_job', { p_job: job, p_reason: reason });
  if (error) throw toAppError(error);
}

// --- Users ---------------------------------------------------------------------
export async function listUsers(filter: { role?: string; status?: string }) {
  let query = supabase.from('profiles')
    .select('id, full_name, email, role, status, status_reason, created_at, officer:university_officers(university:universities(name))')
    .order('created_at', { ascending: false }).limit(300);
  if (filter.role) query = query.eq('role', filter.role as Enums<'user_role'>);
  if (filter.status) query = query.eq('status', filter.status as Enums<'account_status'>);
  return unwrap(await query);
}

export async function setUserStatus(user: string, status: Enums<'account_status'>, reason: string | null) {
  const { error } = await supabase.rpc('set_user_status', { p_user: user, p_status: status, p_reason: reason ?? undefined });
  if (error) throw toAppError(error);
}

// --- Reports & audit -----------------------------------------------------------
export async function listReports(status: Enums<'report_status'> | '' = 'open') {
  let query = supabase.from('reports').select('id, target_type, target_id, reason, details, status, resolution_note, action_taken, created_at')
    .order('created_at', { ascending: false }).limit(200);
  if (status) query = query.eq('status', status);
  return unwrap(await query);
}

export async function resolveReport(report: string, status: Enums<'report_status'>, note: string | null, action: string) {
  const { error } = await supabase.rpc('resolve_report', { p_report: report, p_status: status, p_note: note ?? undefined, p_action: action });
  if (error) throw toAppError(error);
}

export async function listAudit() {
  return unwrap(await supabase.from('audit_logs')
    .select('id, action, target_table, target_id, reason, created_at, actor_role, actor:profiles(full_name, email)')
    .order('created_at', { ascending: false }).limit(200));
}
