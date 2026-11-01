// Page access: signed-in checks, role-based page guards, and the post-login redirect allowlist (BR-06).
import { currentRole, currentProfile, roleHome, type Role } from './session';
import { toast } from './ui/feedback';

/** Pages that need a signed-in, active account, and which roles may open them. */
const pageRoles: Record<string, Role[]> = {
  messages: ['student', 'employer'],
  profile: ['student'],
  'cv-builder': ['student'],
  applications: ['student'],
  employer: ['employer'],
  candidates: ['employer'],
  'post-job': ['employer'],
  'company-settings': ['employer'],
};
export const privatePages = Object.keys(pageRoles);

/** Signed in with an active account (suspended / pending accounts count as signed out, BR-03). */
export function isSignedIn() {
  return currentRole() !== null;
}

export function safeReturnPath(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !/^\/(?:pages\/(?:messages|profile|cv-builder|applications|employer|candidates|post-job|company-settings|job-detail|company|community|university|cv)\/)?$/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function requireSignIn(next = location.pathname + location.search + location.hash) {
  if (isSignedIn()) return true;
  location.assign('/pages/login/?next=' + encodeURIComponent(safeReturnPath(next) || '/'));
  return false;
}

const FLASH_KEY = 'internships:flash';
/** Show a toast on the next page (used across redirects). */
export function flash(message: string) { sessionStorage.setItem(FLASH_KEY, message); }
function showFlash() {
  const message = sessionStorage.getItem(FLASH_KEY);
  if (message) { sessionStorage.removeItem(FLASH_KEY); toast(message); }
}

/** Returns false when the page must not render (the browser is being redirected). */
export function setupAccess(page: string) {
  showFlash();
  document.querySelectorAll<HTMLElement>('[data-auth-only]').forEach(element => { element.hidden = !isSignedIn(); });
  const allowed = pageRoles[page];
  if (allowed) {
    if (!isSignedIn()) {
      document.body.hidden = true;
      if (currentProfile()) flash(currentProfile()!.status === 'pending_verification'
        ? 'Tài khoản đang chờ quản trị viên kích hoạt.'
        : 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
      requireSignIn();
      return false;
    }
    if (!allowed.includes(currentRole()!)) {
      document.body.hidden = true;
      flash('Trang này dành cho tài khoản khác vai trò của bạn.');
      location.replace(roleHome(currentRole()));
      return false;
    }
  }
  document.addEventListener('click', event => {
    if (isSignedIn()) return;
    const control = (event.target as Element).closest<HTMLElement>('a,button');
    if (!control || control.closest('dialog')) return;
    const clone = control.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.material-symbols-outlined').forEach(icon=>icon.remove());
    const text = clone.textContent?.trim() || '';
    const icon = control.querySelector('.material-symbols-outlined')?.textContent?.trim() || '';
    const url = control instanceof HTMLAnchorElement ? new URL(control.href) : null;
    const privateLink = url?.origin === location.origin && privatePages.some(slug=>url.pathname === `/pages/${slug}/`);
    const applications = /đơn ứng tuyển/i.test(text);
    const privateAction = /^(ứng tuyển ngay|nộp đơn ứng tuyển|lưu công việc|đăng bài|chia sẻ kinh nghiệm|theo dõi)/i.test(text) || control.title === 'Lưu công việc' || ['bookmark','bookmark_border','thumb_up'].includes(icon);
    if (!privateLink && !applications && !privateAction) return;
    event.preventDefault(); event.stopImmediatePropagation();
    requireSignIn(applications ? '/pages/applications/' : privateLink ? url!.pathname+url!.search+url!.hash : location.pathname+location.search);
  }, true);
  return true;
}
