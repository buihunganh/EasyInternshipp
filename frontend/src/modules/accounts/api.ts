import { supabase } from '../../core/supabase';
import { toAppError, unwrap } from '../../core/errors';
import type { Role } from '../../core/session';

export async function listUniversities() {
  return unwrap(await supabase.from('universities').select('id, name, short_name').order('name'));
}

export interface SignUpInput {
  email: string; password: string; role: Exclude<Role, 'admin'>;
  full_name: string; phone?: string; university_id?: string | null; student_code?: string | null;
}

/** Returns true when a session was created right away (e-mail confirmation off). */
export async function signUp(input: SignUpInput) {
  const { email, password, ...data } = input;
  const { data: result, error } = await supabase.auth.signUp({
    email, password,
    options: { data, emailRedirectTo: `${location.origin}/pages/login/` },
  });
  if (error) throw toAppError(error);
  // Supabase returns a user with no identities when the e-mail is already registered
  if (result.user && result.user.identities?.length === 0) throw toAppError({ message: 'User already registered' });
  return Boolean(result.session);
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/pages/reset-password/` });
  if (error) throw toAppError(error);
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error);
}

export async function employerHasCompany() {
  const { count } = await supabase.from('company_members').select('company_id', { count: 'exact', head: true });
  return (count ?? 0) > 0;
}
