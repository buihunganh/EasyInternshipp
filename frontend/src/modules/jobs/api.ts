import { supabase, type Database } from '../../core/supabase';
import { toAppError, unwrap, unwrapMaybe } from '../../core/errors';
import { currentSession } from '../../core/session';

type SearchArgs = Database['public']['Functions']['search_jobs']['Args'];
export type JobHit = Database['public']['Functions']['search_jobs']['Returns'][number];

export async function searchJobs(args: SearchArgs) {
  return unwrap(await supabase.rpc('search_jobs', args)) as JobHit[];
}

export async function listIndustries() {
  return unwrap(await supabase.from('industries').select('id, name, slug').order('name'));
}

const jobSelect = `id, title, description, requirements, benefits, city, address, work_type, schedule, duration_months, openings,
  stipend_min, stipend_max, stipend_negotiable, deadline, status, published_at, industry_id, department, target_study_years,
  target_majors, perks, university_id, company_id,
  company:companies(id, name, logo_path, cover_path, verification_status, city, address, website, company_size, founded_year, description, industry:industries(name)),
  skills:job_skills(is_required, skill:skills(name)),
  questions:screening_questions(id, position, question, kind, options, is_required)`;

export async function getJob(id: string) {
  return unwrapMaybe(await supabase.from('jobs').select(jobSelect).eq('id', id).maybeSingle());
}
export type JobDetail = NonNullable<Awaited<ReturnType<typeof getJob>>>;

export async function recordView(id: string) {
  await supabase.rpc('record_job_view', { p_job: id });
}

export async function matchScore(id: string) {
  return unwrap(await supabase.rpc('job_match_score', { p_job: id })) as number | null;
}

export async function getCompany(id: string) {
  return unwrapMaybe(await supabase.from('companies')
    .select('id, name, slug, tax_code, city, address, website, company_size, founded_year, description, logo_path, cover_path, verification_status, follower_count, profile, industry_id, industry:industries(name)')
    .eq('id', id).maybeSingle());
}
export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompany>>>;

export async function companyRating(id: string) {
  return unwrapMaybe(await supabase.from('company_ratings').select('review_count, avg_rating').eq('company_id', id).maybeSingle());
}

export async function companyReviews(id: string) {
  return unwrap(await supabase.from('post_feed').select('id, title, body, rating, author_name, created_at')
    .eq('type', 'review').eq('company_id', id).order('created_at', { ascending: false }).limit(6));
}

/** Other verified companies in the same industry, with how many jobs they have open. */
export async function similarCompanies(company: CompanyDetail) {
  let query = supabase.from('companies').select('id, name, logo_path').eq('verification_status', 'verified').neq('id', company.id).limit(6);
  if (company.industry_id) query = query.eq('industry_id', company.industry_id);
  const companies = unwrap(await query);
  const counts = new Map<string, number>();
  if (companies.length) {
    const jobs = unwrap(await supabase.from('jobs').select('company_id').eq('status', 'active').in('company_id', companies.map(c => c.id)));
    for (const j of jobs) counts.set(j.company_id, (counts.get(j.company_id) ?? 0) + 1);
  }
  return companies.map(c => ({ ...c, open_jobs: counts.get(c.id) ?? 0 })).sort((a, b) => b.open_jobs - a.open_jobs).slice(0, 3);
}

export async function isFollowing(companyId: string) {
  if (!currentSession()) return false;
  const { count } = await supabase.from('company_follows').select('company_id', { count: 'exact', head: true }).eq('company_id', companyId);
  return (count ?? 0) > 0;
}

export async function setFollowing(companyId: string, follow: boolean) {
  const uid = currentSession()!.user.id;
  if (follow) unwrap(await supabase.from('company_follows').insert({ company_id: companyId, student_id: uid }));
  else unwrap(await supabase.from('company_follows').delete().eq('company_id', companyId).eq('student_id', uid));
}

// --- Applying (minimal: default CV + screening answers; the full modal comes in Phase 6) ---
export async function myCvs() {
  return unwrap(await supabase.from('cvs').select('id, title, is_default, updated_at').order('is_default', { ascending: false }).order('updated_at', { ascending: false }));
}

export async function hasApplied(jobId: string) {
  if (!currentSession()) return false;
  const { count } = await supabase.from('applications').select('id', { count: 'exact', head: true })
    .eq('job_id', jobId).eq('student_id', currentSession()!.user.id);
  return (count ?? 0) > 0;
}

export async function applyToJob(jobId: string, cvId: string, coverLetter: string, answers: { question_id: string; answer: string }[]) {
  const { data, error } = await supabase.rpc('apply_to_job', { p_job: jobId, p_cv: cvId, p_cover_letter: coverLetter || undefined, p_answers: answers });
  if (error) throw toAppError(error);
  return data as string;
}

/** Job alert from the home page's "Nhận tin việc làm mới" box, using the current search. */
export async function createJobAlert(fields: { name: string; keywords: string | null; city: string | null; industry_id: number | null }) {
  unwrap(await supabase.from('job_alerts').insert({ ...fields, frequency: 'daily' }));   // student_id defaults to auth.uid()
}

// --- Home page side widgets ------------------------------------------------------------------
/** Verified companies with the most open (active, unexpired) jobs. */
export async function featuredCompanies(limit = 3) {
  const today = new Date().toISOString().slice(0, 10);
  const jobs = unwrap(await supabase.from('jobs').select('company_id').eq('status', 'active')
    .or(`deadline.is.null,deadline.gte.${today}`).limit(1000));
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.company_id, (counts.get(j.company_id) ?? 0) + 1);
  const ids = [...counts.keys()];
  if (!ids.length) return [];
  const companies = unwrap(await supabase.from('companies').select('id, name, logo_path').eq('verification_status', 'verified').in('id', ids));
  return companies.map(c => ({ ...c, open_jobs: counts.get(c.id) ?? 0 })).sort((a, b) => b.open_jobs - a.open_jobs).slice(0, limit);
}

export async function followedCompanyIds() {
  if (!currentSession()) return new Set<string>();
  return new Set(unwrap(await supabase.from('company_follows').select('company_id')).map(r => r.company_id));
}

/** Next published events (career fairs, workshops), soonest first. */
export async function upcomingEvents(limit = 2) {
  return unwrap(await supabase.from('events').select('id, title, starts_at, location, is_virtual, university:organizer_university_id(name, short_name)')
    .eq('status', 'published').gte('ends_at', new Date().toISOString()).order('starts_at').limit(limit));
}
