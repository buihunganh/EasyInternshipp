import { supabase, signedUrl, type Database, type Enums, type Tables } from '../../core/supabase';
import { toAppError, unwrap, unwrapMaybe } from '../../core/errors';
import { currentSession } from '../../core/session';

const uid = () => currentSession()?.user.id ?? '';
async function rpc<T = unknown>(name: keyof Database['public']['Functions'], args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw toAppError(error);
  return data as T;
}

// --- Company ---------------------------------------------------------------------
export type MyCompany = Tables<'companies'> & { member_role: Enums<'company_member_role'> };

/** The employer's first company (with their role in it), or null when they have none yet. */
export async function myCompany(): Promise<MyCompany | null> {
  const row = unwrapMaybe(await supabase.from('company_members')
    .select('member_role, company:companies(*)').eq('user_id', uid()).order('created_at').limit(1).maybeSingle());
  if (!row?.company) return null;
  return { ...(row.company as Tables<'companies'>), member_role: row.member_role };
}

export async function listIndustries() {
  return unwrap(await supabase.from('industries').select('id, name, slug').order('name'));
}

export interface CompanyFields {
  name: string; tax_code: string | null; industry_id: number | null; city: string | null; address: string | null;
  website: string | null; company_size: string | null; description: string | null; founded_year: number | null;
}

export async function createCompany(fields: CompanyFields) {
  const id = await rpc<string>('create_company', {
    p_name: fields.name, p_tax_code: fields.tax_code, p_industry_id: fields.industry_id, p_city: fields.city,
    p_address: fields.address, p_website: fields.website, p_company_size: fields.company_size, p_description: fields.description,
  });
  if (fields.founded_year) unwrap(await supabase.from('companies').update({ founded_year: fields.founded_year }).eq('id', id));
  return id;
}

export async function updateCompany(id: string, fields: Partial<CompanyFields> & { profile?: Tables<'companies'>['profile']; logo_path?: string; cover_path?: string }) {
  unwrap(await supabase.from('companies').update(fields).eq('id', id));
}

export async function uploadCompanyAsset(companyId: string, kind: 'logo' | 'cover', file: File) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${companyId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('company-assets').upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw toAppError(error);
  await updateCompany(companyId, kind === 'logo' ? { logo_path: path } : { cover_path: path });
  return path;
}

export async function listDocuments(companyId: string) {
  return unwrap(await supabase.from('company_documents').select('id, doc_type, file_path, status, review_note, created_at')
    .eq('company_id', companyId).order('created_at', { ascending: false }));
}

export async function uploadDocument(companyId: string, docType: string, file: File) {
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
  const path = `${companyId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('company-documents').upload(path, file, { contentType: file.type });
  if (error) throw toAppError(error);
  unwrap(await supabase.from('company_documents').insert({ company_id: companyId, doc_type: docType, file_path: path }));
}

export async function deleteDocument(id: string, path: string) {
  unwrap(await supabase.from('company_documents').delete().eq('id', id));
  await supabase.storage.from('company-documents').remove([path]);
}

export const documentUrl = (path: string) => signedUrl('company-documents', path);
export const submitVerification = (companyId: string) => rpc('submit_company_verification', { p_company: companyId });

export async function listMembers(companyId: string) {
  return unwrap(await supabase.from('company_members')
    .select('user_id, member_role, position_title, created_at, profile:profiles(full_name, email)')
    .eq('company_id', companyId).order('created_at'));
}
export const addMember = (companyId: string, email: string, role: Enums<'company_member_role'>) =>
  rpc<string>('add_company_member', { p_company: companyId, p_email: email, p_role: role });
export async function setMemberRole(companyId: string, userId: string, role: Enums<'company_member_role'>) {
  unwrap(await supabase.from('company_members').update({ member_role: role }).eq('company_id', companyId).eq('user_id', userId));
}
export async function removeMember(companyId: string, userId: string) {
  unwrap(await supabase.from('company_members').delete().eq('company_id', companyId).eq('user_id', userId));
}

// --- Jobs --------------------------------------------------------------------------
const dashboardJob = 'id, title, status, department, city, address, work_type, stipend_min, stipend_max, openings, application_count, view_count, published_at, created_at, submitted_at, rejection_reason, deadline';

export async function companyJobs(companyId: string) {
  return unwrap(await supabase.from('jobs').select(dashboardJob).eq('company_id', companyId).order('created_at', { ascending: false }));
}
export type DashboardJob = Awaited<ReturnType<typeof companyJobs>>[number];

export async function applicationStats(jobIds: string[]) {
  if (!jobIds.length) return [];
  return unwrap(await supabase.from('applications').select('job_id, status, applied_at').in('job_id', jobIds));
}

export async function todayInterviews(companyId: string) {
  return rpc<Database['public']['Functions']['company_interviews']['Returns']>('company_interviews', { p_company: companyId });
}

export const changeJobStatus = (id: string, status: Enums<'job_status'>) => rpc('change_job_status', { p_job: id, p_status: status });
export const duplicateJob = (id: string) => rpc<string>('duplicate_job', { p_job: id });
export const submitJob = (id: string) => rpc('submit_job', { p_job: id });
export async function deleteDraft(id: string) { unwrap(await supabase.from('jobs').delete().eq('id', id)); }

export async function getJobForEdit(id: string) {
  return unwrapMaybe(await supabase.from('jobs').select(`*, skills:job_skills(is_required, skill:skills(id, name)),
    questions:screening_questions(id, position, question, kind, options, is_required, is_knockout, key:screening_question_keys(ideal_answer))`).eq('id', id).maybeSingle());
}
export type EditableJob = NonNullable<Awaited<ReturnType<typeof getJobForEdit>>>;

export type JobFields = Pick<Database['public']['Tables']['jobs']['Insert'],
  'title' | 'description' | 'department' | 'openings' | 'work_type' | 'schedule' | 'address' | 'city' | 'target_study_years' |
  'target_majors' | 'perks' | 'stipend_min' | 'stipend_max' | 'stipend_negotiable' | 'deadline' | 'industry_id'>;

export async function saveJob(companyId: string, jobId: string | null, fields: JobFields) {
  if (jobId) { unwrap(await supabase.from('jobs').update(fields).eq('id', jobId)); return jobId; }
  return unwrap(await supabase.from('jobs').insert({ ...fields, company_id: companyId }).select('id').single()).id;
}

/** Make the job's skills exactly `names` (creating unknown skills with ensure_skill). */
export async function syncSkills(jobId: string, names: string[]) {
  const ids = [...new Set(await Promise.all(names.map(name => rpc<number>('ensure_skill', { p_name: name }))))];
  const existing = unwrap(await supabase.from('job_skills').select('skill_id').eq('job_id', jobId)).map(r => r.skill_id);
  const remove = existing.filter(id => !ids.includes(id));
  if (remove.length) unwrap(await supabase.from('job_skills').delete().eq('job_id', jobId).in('skill_id', remove));
  const add = ids.filter(id => !existing.includes(id));
  if (add.length) unwrap(await supabase.from('job_skills').insert(add.map(skill_id => ({ job_id: jobId, skill_id }))));
}

export interface QuestionInput { question: string; kind: Enums<'question_kind'>; options: string[]; is_required: boolean; is_knockout: boolean; ideal_answer: string }

/** Replace the screening questions (only while the job has no applications, so answers are never lost). */
export async function replaceQuestions(jobId: string, questions: QuestionInput[]) {
  unwrap(await supabase.from('screening_questions').delete().eq('job_id', jobId));
  for (const [position, q] of questions.entries()) {
    const row = unwrap(await supabase.from('screening_questions').insert({
      job_id: jobId, position, question: q.question, kind: q.kind, options: q.options, is_required: q.is_required, is_knockout: q.is_knockout,
    }).select('id').single());
    if (q.ideal_answer.trim()) unwrap(await supabase.from('screening_question_keys').insert({ question_id: row.id, ideal_answer: q.ideal_answer.trim() }));
  }
}
