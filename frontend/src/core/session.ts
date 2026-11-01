// Auth session + the signed-in user's profile, restored once per page load (initSession).
import type { Session } from '@supabase/supabase-js';
import { supabase, type Enums } from './supabase';

export type Role = Enums<'user_role'>;
export interface Profile {
  id: string;
  role: Role;
  status: Enums<'account_status'>;
  full_name: string;
  email: string | null;
  avatar_path: string | null;
}

let session: Session | null = null;
let profile: Profile | null = null;
let ready: Promise<void> | null = null;

async function loadProfile(userId: string) {
  const { data } = await supabase.from('profiles')
    .select('id, role, status, full_name, email, avatar_path').eq('id', userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

/** Restore the session from storage and load the profile. Safe to call more than once. */
export function initSession() {
  ready ??= (async () => {
    const { data } = await supabase.auth.getSession();
    session = data.session;
    profile = session ? await loadProfile(session.user.id) : null;
  })();
  return ready;
}

/** Reload the profile (after editing name/avatar, or a status change). */
export async function refreshProfile() {
  const { data } = await supabase.auth.getSession();
  session = data.session;
  profile = session ? await loadProfile(session.user.id) : null;
  return profile;
}

export const currentSession = () => session;
export const currentProfile = () => profile;
/** The business role, only for active accounts (suspended / pending accounts have none, BR-03). */
export const currentRole = (): Role | null => (profile?.status === 'active' ? profile.role : null);
export const isActive = () => currentRole() !== null;

export function onAuthChange(callback: (event: string) => void) {
  const { data } = supabase.auth.onAuthStateChange(event => callback(event));
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  await supabase.auth.signOut();
  session = null;
  profile = null;
}

/** Where each role lands after signing in (and when it opens a page meant for another role). */
export function roleHome(role: Role | null) {
  switch (role) {
    case 'employer': return '/pages/employer/';
    case 'university_officer': return '/pages/university/';
    case 'admin': return '/pages/admin/';
    default: return '/';
  }
}

export const roleLabel: Record<Role, string> = {
  student: 'Sinh viên', employer: 'Nhà tuyển dụng', university_officer: 'Cán bộ nhà trường', admin: 'Quản trị viên',
};
