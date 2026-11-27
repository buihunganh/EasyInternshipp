// University data (UseCase_University, DFD 8.3 / 8.4). Officers act through RPCs that check
// officer_university_id() and write audit logs; the public page reads only public rows.
import { supabase, type Database, type Enums } from '../../core/supabase';
import { toAppError, unwrap, unwrapMaybe } from '../../core/errors';
import { currentSession } from '../../core/session';

const uid = () => currentSession()?.user.id ?? '';
async function rpc<T = unknown>(name: keyof Database['public']['Functions'], args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw toAppError(error);
  return data as T;
}

// --- Public page --------------------------------------------------------------------------
export async function listUniversities() {
  return unwrap(await supabase.from('universities').select('id, name, short_name, city, email_domain, website, logo_path').order('name'));
}
export async function getUniversity(id: string) {
  return unwrapMaybe(await supabase.from('universities').select('id, name, short_name, city, email_domain, website, logo_path').eq('id', id).maybeSingle());
}
export type University = NonNullable<Awaited<ReturnType<typeof getUniversity>>>;

/** Active MoU partners (public), with each company's open job count. */
export async function activePartners(universityId: string) {
  const rows = unwrap(await supabase.from('university_partnerships')
    .select('id, starts_on, ends_on, company:companies(id, name, logo_path, city, verification_status)')
    .eq('university_id', universityId).eq('status', 'active'));
  const companies = rows.map(r => r.company).filter((c): c is NonNullable<typeof c> => !!c);
  const counts = new Map<string, number>();
  if (companies.length) {
    const jobs = unwrap(await supabase.from('jobs').select('company_id').eq('status', 'active').in('company_id', companies.map(c => c.id)));
    for (const j of jobs) counts.set(j.company_id, (counts.get(j.company_id) ?? 0) + 1);
  }
  return companies.map(c => ({ ...c, openJobs: counts.get(c.id) ?? 0 }));
}

const eventColumns = 'id, title, description, organizer_university_id, starts_at, ends_at, location, is_virtual, capacity, status, cover_path, created_at';
export async function universityEvents(universityId: string, upcomingOnly = true) {
  let q = supabase.from('events').select(eventColumns).eq('organizer_university_id', universityId).in('status', ['published', 'completed']);
  if (upcomingOnly) q = q.gt('ends_at', new Date().toISOString());
  return unwrap(await q.order('starts_at').limit(20));
}
export type EventRow = Awaited<ReturnType<typeof universityEvents>>[number];

/** The signed-in student's tickets for these events. */
export async function myRegistrations(eventIds: string[]) {
  if (!uid() || !eventIds.length) return new Map<string, { ticket_code: string; checked_in_at: string | null }>();
  const rows = unwrap(await supabase.from('event_registrations').select('event_id, ticket_code, checked_in_at')
    .eq('student_id', uid()).in('event_id', eventIds));
  return new Map(rows.map(r => [r.event_id, { ticket_code: r.ticket_code, checked_in_at: r.checked_in_at }]));
}
export const registerForEvent = (eventId: string) => rpc<string>('register_for_event', { p_event: eventId });
export async function cancelRegistration(eventId: string) {
  unwrap(await supabase.from('event_registrations').delete().eq('event_id', eventId).eq('student_id', uid()));
}

/** Booths the signed-in employer's companies requested (status per event). */
export async function myBooths(eventIds: string[]) {
  if (!uid() || !eventIds.length) return new Map<string, Enums<'approval_status'>>();
  const rows = unwrap(await supabase.from('event_booths').select('event_id, status, company_id').in('event_id', eventIds));
  return new Map(rows.map(r => [r.event_id, r.status]));
}
export async function requestBooth(eventId: string, companyId: string, note: string | null) {
  unwrap(await supabase.from('event_booths').insert({ event_id: eventId, company_id: companyId, note }));
}
/** Companies the signed-in employer manages (owner/admin), for booth requests. */
export async function managedCompanies() {
  const rows = unwrap(await supabase.from('company_members').select('member_role, company:companies(id, name, verification_status)')
    .eq('user_id', uid()).in('member_role', ['owner', 'admin']));
  return rows.map(r => r.company).filter((c): c is NonNullable<typeof c> => !!c);
}

export async function sendInquiry(fields: { university_id: string; contact_name: string; company_name: string | null; email: string; phone: string | null; message: string | null }) {
  unwrap(await supabase.from('partner_inquiries').insert(fields));
}

/** The officer's own university (null for everyone else). */
export async function myOfficerUniversity() {
  if (!uid()) return null;
  return unwrapMaybe(await supabase.from('university_officers').select('university_id, department, title, university:universities(id, name, short_name)')
    .eq('user_id', uid()).maybeSingle());
}
/** The signed-in student's university id (for the default public page). */
export async function myStudentUniversity() {
  if (!uid()) return null;
  return unwrapMaybe(await supabase.from('student_profiles').select('university_id').eq('user_id', uid()).maybeSingle())?.university_id ?? null;
}

// --- Officer portal -----------------------------------------------------------------------
export interface Placement {
  academic_year: string; registered_students: number; verified_students: number; students_applied: number;
  students_interviewed: number; students_offered: number; students_hired: number; placement_rate: number | null;
  avg_days_to_hire: number | null; avg_hired_stipend: number | null;
}
export const placement = () => rpc<Placement[]>('get_university_placement', {});

/** Students linked to the officer's university, with their application statuses. */
export async function listStudents(universityId: string) {
  const students = unwrap(await supabase.from('student_profiles')
    .select('user_id, student_code, major, gpa, graduation_year, verification_status, verification_note, verified_at, is_looking_for_job, profile:profiles!student_profiles_user_id_fkey(full_name, email, phone, avatar_path, status)')
    .eq('university_id', universityId).order('verification_status'));
  const ids = students.map(s => s.user_id);
  const apps = ids.length ? unwrap(await supabase.from('applications')
    .select('id, student_id, status, applied_at, hired_at, job:jobs(title, company:companies(name))').in('student_id', ids).order('applied_at', { ascending: false })) : [];
  const byStudent = new Map<string, typeof apps>();
  for (const a of apps) byStudent.set(a.student_id, [...(byStudent.get(a.student_id) ?? []), a]);
  return students.map(s => ({ ...s, applications: byStudent.get(s.user_id) ?? [] }));
}
export type PortalStudent = Awaited<ReturnType<typeof listStudents>>[number];
export const verifyStudent = (id: string, approve: boolean, note: string | null) => rpc('verify_student', { p_student: id, p_approve: approve, p_note: note });

/** Jobs posted exclusively for the officer's students. */
export async function exclusiveJobs(universityId: string) {
  return unwrap(await supabase.from('jobs')
    .select('id, title, status, university_approval, university_note, city, work_type, stipend_min, stipend_max, deadline, created_at, company:companies(id, name)')
    .eq('university_id', universityId).order('created_at', { ascending: false }));
}
export const reviewExclusiveJob = (id: string, approve: boolean, note: string | null) => rpc('review_exclusive_job', { p_job: id, p_approve: approve, p_note: note });

export async function internshipReports(universityId: string) {
  return unwrap(await supabase.from('internship_reports')
    .select('id, status, student_summary, employer_rating, employer_comment, review_note, certified_at, verification_code, created_at, updated_at, student_id, application:applications(id, hired_at, job:jobs(title, company:companies(name)))')
    .eq('university_id', universityId).order('updated_at', { ascending: false }));
}
export type ReportRow = Awaited<ReturnType<typeof internshipReports>>[number];
export const certifyReport = (id: string, approve: boolean, note: string | null) => rpc<string | null>('certify_internship_report', { p_report: id, p_approve: approve, p_note: note });

/** Names for a set of profile ids (officers may read their students' profiles). */
export async function profileNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', [...new Set(ids)]));
  return new Map(rows.map(r => [r.id, r.full_name || r.email || 'Sinh viên']));
}

// Events (officer CRUD; RLS: organizer_university_id = officer's university)
export async function officerEvents(universityId: string) {
  return unwrap(await supabase.from('events').select(`${eventColumns}, event_booths(id, status, booth_label, note, company:companies(id, name)), event_registrations(count)`)
    .eq('organizer_university_id', universityId).order('starts_at', { ascending: false }));
}
export type OfficerEvent = Awaited<ReturnType<typeof officerEvents>>[number];
export type EventFields = Pick<Database['public']['Tables']['events']['Insert'], 'title' | 'description' | 'starts_at' | 'ends_at' | 'location' | 'is_virtual' | 'capacity' | 'status'>;
export async function createEvent(universityId: string, fields: EventFields) {
  unwrap(await supabase.from('events').insert({ ...fields, organizer_university_id: universityId }));
}
export async function updateEvent(id: string, fields: Partial<EventFields>) { unwrap(await supabase.from('events').update(fields).eq('id', id)); }
export async function deleteEvent(id: string) { unwrap(await supabase.from('events').delete().eq('id', id)); }
export async function eventRegistrations(eventId: string) {
  const rows = unwrap(await supabase.from('event_registrations').select('student_id, ticket_code, checked_in_at, created_at').eq('event_id', eventId).order('created_at'));
  const names = await profileNames(rows.map(r => r.student_id));
  return rows.map(r => ({ ...r, name: names.get(r.student_id) ?? 'Sinh viên' }));
}
export const checkIn = (eventId: string, code: string) => rpc('check_in_event', { p_event: eventId, p_ticket_code: code });
export const reviewBooth = (id: string, approve: boolean, note: string | null) => rpc('review_event_booth', { p_booth: id, p_approve: approve, p_note: note });

// Partner inquiries
export async function inquiries(universityId: string) {
  return unwrap(await supabase.from('partner_inquiries').select('id, contact_name, company_name, email, phone, message, status, created_at')
    .eq('university_id', universityId).order('created_at', { ascending: false }));
}
export async function setInquiryStatus(id: string, status: Enums<'inquiry_status'>) {
  unwrap(await supabase.from('partner_inquiries').update({ status }).eq('id', id));
}

// Partnerships (MoU)
export async function partnerships(universityId: string) {
  return unwrap(await supabase.from('university_partnerships').select('id, status, starts_on, ends_on, note, document_path, created_at, company:companies(id, name)')
    .eq('university_id', universityId).order('created_at', { ascending: false }));
}
export async function searchCompanies(term: string) {
  let q = supabase.from('companies').select('id, name, city, verification_status').order('name').limit(20);
  if (term) q = q.ilike('name', `%${term.replace(/[%_,()]/g, ' ')}%`);
  return unwrap(await q);
}
type PartnershipFields = { status: Enums<'partnership_status'>; starts_on: string | null; ends_on: string | null; note: string | null };
export async function createPartnership(universityId: string, companyId: string, fields: PartnershipFields) {
  unwrap(await supabase.from('university_partnerships').insert({ university_id: universityId, company_id: companyId, ...fields }));
}
export async function updatePartnership(id: string, fields: PartnershipFields) { unwrap(await supabase.from('university_partnerships').update(fields).eq('id', id)); }
export async function deletePartnership(id: string) { unwrap(await supabase.from('university_partnerships').delete().eq('id', id)); }

// --- Certificates -------------------------------------------------------------------------
export interface Certificate {
  student_name: string; student_code: string | null; university: string | null; company: string; job_title: string;
  hired_at: string | null; employer_rating: number | null; certified_at: string;
}
export const verifyCertificate = (code: string) => rpc<Certificate | null>('verify_internship_certificate', { p_code: code });
