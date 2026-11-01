import { supabase, signedUrl, type Database, type Tables } from '../../core/supabase';
import { toAppError, unwrap, unwrapMaybe } from '../../core/errors';
import { currentSession } from '../../core/session';
import type { CvContent } from '../../core/models';

const uid = () => currentSession()?.user.id ?? '';

// --- Profile -----------------------------------------------------------------------
export async function getMyProfile() {
  const profile = unwrap(await supabase.from('profiles').select('id, full_name, email, phone, avatar_path').eq('id', uid()).single());
  const student = unwrapMaybe(await supabase.from('student_profiles')
    .select('*, university:universities(id, name, short_name)').eq('user_id', uid()).maybeSingle());
  const skills = unwrap(await supabase.from('student_skills').select('level, skill:skills(id, name)').eq('student_id', uid()));
  return { profile, student, skills: skills.map(s => s.skill).filter(Boolean) as { id: number; name: string }[] };
}
export type MyProfile = Awaited<ReturnType<typeof getMyProfile>>;

export async function listUniversities() {
  return unwrap(await supabase.from('universities').select('id, name, short_name').order('name'));
}

type StudentUpdate = Database['public']['Tables']['student_profiles']['Update'];
export async function updateProfile(profile: { full_name?: string; phone?: string | null }, student: StudentUpdate) {
  if (Object.keys(profile).length) unwrap(await supabase.from('profiles').update(profile).eq('id', uid()));
  if (Object.keys(student).length) unwrap(await supabase.from('student_profiles').update(student).eq('user_id', uid()));
}

export async function addSkill(name: string) {
  const { data: id, error } = await supabase.rpc('ensure_skill', { p_name: name });
  if (error) throw toAppError(error);
  unwrap(await supabase.from('student_skills').upsert({ student_id: uid(), skill_id: id as number }, { onConflict: 'student_id,skill_id', ignoreDuplicates: true }));
}
export async function removeSkill(skillId: number) {
  unwrap(await supabase.from('student_skills').delete().eq('student_id', uid()).eq('skill_id', skillId));
}

/** Upload a new avatar to avatars/<uid>/ and point the profile at it. Returns the path. */
export async function uploadAvatar(file: File) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${uid()}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw toAppError(error);
  unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid()));
  return path;
}

export async function requestVerification() {
  const { error } = await supabase.rpc('request_student_verification');
  if (error) throw toAppError(error);
}

export async function recentApplications(limit = 3) {
  const { data, count, error } = await supabase.from('applications')
    .select('id, status, applied_at, viewed_at, job:jobs(title, company:companies(name))', { count: 'exact' })
    .eq('student_id', uid()).order('applied_at', { ascending: false }).limit(limit);
  if (error) throw toAppError(error);
  return { rows: data ?? [], total: count ?? 0 };
}

// --- CVs ------------------------------------------------------------------------------
export type CvRow = Pick<Tables<'cvs'>, 'id' | 'title' | 'source' | 'template' | 'file_path' | 'is_default' | 'is_public' | 'public_slug' | 'updated_at'> & { content: CvContent | Record<string, never> };

const cvColumns = 'id, title, source, template, content, file_path, is_default, is_public, public_slug, updated_at';

export async function myCvs() {
  return unwrap(await supabase.from('cvs').select(cvColumns).eq('student_id', uid())
    .order('is_default', { ascending: false }).order('updated_at', { ascending: false })) as unknown as CvRow[];
}

export async function saveCv(id: string | null, title: string, content: CvContent, makeDefault = false) {
  const row = { title: title.trim() || 'CV của tôi', template: content.theme, content: content as unknown as Tables<'cvs'>['content'] };
  if (id) return unwrap(await supabase.from('cvs').update(row).eq('id', id).select(cvColumns).single()) as unknown as CvRow;
  return unwrap(await supabase.from('cvs').insert({ ...row, is_default: makeDefault }).select(cvColumns).single()) as unknown as CvRow;
}

export async function setCvFlags(id: string, flags: { is_default?: boolean; is_public?: boolean; title?: string; file_path?: string }) {
  return unwrap(await supabase.from('cvs').update(flags).eq('id', id).select(cvColumns).single()) as unknown as CvRow;
}

export async function deleteCv(id: string) {
  unwrap(await supabase.from('cvs').delete().eq('id', id));
}

/** Attach a PDF to a CV (cvs/<uid>/...). Files already sent with an application stay frozen (BR-45). */
export async function uploadCvFile(id: string, file: File) {
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-');
  const path = `${uid()}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('cvs').upload(path, file, { contentType: file.type });
  if (error) throw toAppError(error);
  return setCvFlags(id, { file_path: path });
}

export const cvFileUrl = (path: string) => signedUrl('cvs', path);

export async function publicCv(slug: string) {
  return unwrapMaybe(await supabase.from('cvs').select('title, content, file_path, updated_at').eq('public_slug', slug).eq('is_public', true).maybeSingle());
}
