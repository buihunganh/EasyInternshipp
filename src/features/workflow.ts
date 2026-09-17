import { isSignedIn } from '../lib/auth';
import { isRecruiterWorkspace, workspaceHref } from '../lib/workspace';
import { label, routes } from '../lib/navigation';
import { dialog } from '../components/feedback';

export function setupWorkflow(page: string) {
  const recruiter = isRecruiterWorkspace();
  if (recruiter) {

    if (page === 'job-detail') {
      document.querySelectorAll('button').forEach(button => {
        if (/Ứng tuyển ngay|Nộp đơn ứng tuyển/i.test(label(button))) {
          button.textContent = 'Quản lý ứng viên';
          button.dataset.appControl = 'manage-applicants';
          button.addEventListener('click', () => location.assign(routes.candidates));
        }
      });
    }
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
      if (a.origin === location.origin && a.getAttribute('href') !== '#') a.href = workspaceHref(a.href);
    });
    const footerHome = document.querySelector<HTMLAnchorElement>('.workspace-footer>a:first-child');
    if (footerHome) { footerHome.href = routes.employer; footerHome.setAttribute('aria-label', 'Tổng quan tuyển dụng'); }
  }
  if (['post-job', 'job-detail', 'company', 'cv-builder', 'profile'].includes(page)) {
    const trail = document.createElement('nav');
    trail.className = 'workflow-trail'; trail.setAttribute('aria-label', 'Điều hướng liên quan');
    const links = recruiter
      ? [['Tổng quan tuyển dụng', routes.employer], ['Quản lý ứng viên', routes.candidates], ['Tin nhắn', workspaceHref(routes.messages)]]
      : [['Tìm việc', routes.jobs], ['Hồ sơ cá nhân', routes.profile], ['Chỉnh sửa CV', routes['cv-builder']], ['Tin nhắn', routes.messages]];
    for (const [name, href] of links) {
      if (!isSignedIn() && [routes.profile, routes['cv-builder'], routes.messages].includes(href)) continue;
      if (new URL(href, location.origin).pathname === location.pathname) continue;
      const a = document.createElement('a'); a.href = href; a.textContent = name; trail.append(a);
    }
    document.querySelector('main')?.prepend(trail);
  }
  document.addEventListener('click', event => {
    const control = (event.target as Element).closest<HTMLElement>('button,a');
    if (!control || control.closest('[data-app-control],dialog')) return;
    const text = label(control);
    let href: string | undefined;
    if (page === 'candidates' && /Xem CV/.test(text)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const card = control.closest('.candidate-board>div>div');
      const name = card?.querySelector('.font-headline-md')?.textContent?.trim() || 'Ứng viên';
      const modal = dialog('Hồ sơ ứng viên', '<div class="candidate-profile-preview"></div><p class="app-muted">CV đính kèm chưa có tệp thật trong bản demo.</p>', 'Đóng');
      const preview = modal.querySelector('.candidate-profile-preview')!;
      const heading = document.createElement('h3'); heading.textContent = name;
      const info = document.createElement('p'); info.textContent = card?.querySelector('.font-headline-md')?.parentElement?.textContent?.trim() || '';
      preview.append(heading, info);
      return;
    }
    if (page === 'candidates' && /Chat 1-1/.test(text)) href = '/pages/messages/?workspace=employer&candidate=minh-thu';
    if (page === 'employer' && /ứng viên|hồ sơ/i.test(text) && !/công ty|doanh nghiệp/i.test(text)) href = routes.candidates;
    if (recruiter && /Hồ sơ công ty|Xem trang công ty/.test(text)) href = workspaceHref(routes.company);
    if (recruiter && control.closest('header') && /chat|forum/.test(control.querySelector('.material-symbols-outlined')?.textContent || '')) href = workspaceHref(routes.messages);
    if (recruiter && page === 'job-detail' && /Ứng tuyển ngay|Nộp đơn ứng tuyển/i.test(text)) href = routes.candidates;
    if (href) { event.preventDefault(); event.stopImmediatePropagation(); location.assign(href); }
  }, true);
}
