import { adminSessionKey, hasAdminSession } from '../lib/adminSession';
if (hasAdminSession()) location.replace('/pages/admin/');
const form = document.getElementById('admin-login-form') as HTMLFormElement;
const email = document.getElementById('admin-email') as HTMLInputElement;
const password = document.getElementById('admin-password') as HTMLInputElement;
const error = document.getElementById('admin-login-error')!;
const toggle = document.getElementById('admin-show-password')!;
toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  toggle.setAttribute('aria-label', visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.querySelector('span')!.textContent = visible ? 'visibility_off' : 'visibility';
});
form.addEventListener('input', () => { error.hidden = true; });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (email.value.trim().toLowerCase() !== 'admin@example.com' || password.value !== 'AdminDemo2026!') {
    error.textContent = 'Thông tin chưa đúng. Hãy dùng tài khoản trải nghiệm bên dưới.'; error.hidden = false; return;
  }
  try {
    sessionStorage.setItem(adminSessionKey, JSON.stringify({role:'admin-demo', expiresAt:Date.now()+8*60*60*1000}));
    password.value = '';
    location.replace('/pages/admin/');
  } catch {
    error.textContent = 'Không thể lưu phiên đăng nhập. Vui lòng cho phép lưu trữ phiên trong trình duyệt.'; error.hidden = false;
  }
});
