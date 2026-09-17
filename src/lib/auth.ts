import { read } from './storage';

const roles = ['student', 'candidate', 'recruiter', 'employer', 'university'];
const privatePages = ['messages', 'profile', 'cv-builder', 'employer', 'candidates', 'post-job'];
export function isSignedIn() {
  return roles.includes(read<{role?:string}|null>('demo-session', null)?.role || '');
}
export function safeReturnPath(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !/^\/(?:pages\/(?:messages|profile|cv-builder|employer|candidates|post-job|job-detail|company|community|university)\/)?$/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
export function requireSignIn(next = location.pathname + location.search + location.hash) {
  if (isSignedIn()) return true;
  location.assign('/pages/login/?next=' + encodeURIComponent(safeReturnPath(next) || '/'));
  return false;
}
export function setupAccess(page:string) {
  document.querySelectorAll<HTMLElement>('[data-auth-only]').forEach(element => { element.hidden = !isSignedIn(); });
  if (privatePages.includes(page) && !isSignedIn()) {
    document.body.hidden = true;
    requireSignIn();
    return false;
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
    requireSignIn(applications ? '/?view=applications' : privateLink ? url!.pathname+url!.search+url!.hash : location.pathname+location.search);
  }, true);
  return true;
}
