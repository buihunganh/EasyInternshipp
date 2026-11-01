// Admin sign-in: the same Supabase login, but only accounts with the admin role get in.
import { supabase } from '../../core/supabase';
import { currentRole, initSession, refreshProfile, signOut } from '../../core/session';
import { toAppError } from '../../core/errors';
import '../../styles/platform.css';

const form = document.getElementById('admin-login-form') as HTMLFormElement;
const email = document.getElementById('admin-email') as HTMLInputElement;
const password = document.getElementById('admin-password') as HTMLInputElement;
const error = document.getElementById('admin-login-error')!;
const toggle = document.getElementById('admin-show-password')!;
const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');

function showError(message: string) { error.textContent = message; error.hidden = false; }

toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  toggle.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.querySelector('span')!.textContent = visible ? 'visibility_off' : 'visibility';
});
form.addEventListener('input', () => { error.hidden = true; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (submit) submit.disabled = true;
  try {
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (authError) throw toAppError(authError);
    await refreshProfile();
    if (currentRole() !== 'admin') {
      await signOut();
      showError('Tài khoản này không có quyền quản trị.');
      return;
    }
    password.value = '';
    location.replace('/pages/admin/');
  } catch (e) {
    showError(toAppError(e).message);
  } finally {
    if (submit) submit.disabled = false;
  }
});

initSession().then(() => { if (currentRole() === 'admin') location.replace('/pages/admin/'); });
