import { isSignedIn } from '../lib/auth';
import { isRecruiterWorkspace, workspaceHref } from '../lib/workspace';

export function renderSiteHeader(page: string) {
  if (['login', 'register'].includes(page)) return;
  const header = document.querySelector('header');
  if (!header) return;
  const recruiter = isRecruiterWorkspace();
  const guest = !isSignedIn();
  const current = ['job-detail', 'company'].includes(page) ? 'jobs' : page;
  const items = recruiter
    ? [['employer', 'dashboard', 'Tổng quan', '/pages/employer/'], ['candidates', 'group', 'Ứng viên', '/pages/candidates/'], ['messages', 'chat', 'Tin nhắn', workspaceHref('/pages/messages/')]]
    : [['jobs', 'work', 'Việc làm', '/'], ['applications', 'send', 'Đơn ứng tuyển', '#'], ['messages', 'chat', 'Tin nhắn', '/pages/messages/'], ['community', 'forum', 'Cộng đồng', '/pages/community/']];
  header.className = guest ? 'site-header site-header-guest' : 'site-header';
  header.setAttribute('aria-label', recruiter ? 'Không gian nhà tuyển dụng' : 'Điều hướng Internships.io');
  header.innerHTML = `
    <div class="site-header-start">
      <a class="site-header-brand" href="${recruiter ? '/pages/employer/' : '/'}" aria-label="${recruiter ? 'Tổng quan tuyển dụng' : 'Internships.io — Trang chủ'}">
        <span class="material-symbols-outlined" aria-hidden="true">school</span><span>Internships.io</span>
      </a>
      ${recruiter && document.querySelector('.recruiter-sidebar') ? '<span class="site-header-workspace">Không gian tuyển dụng</span>' : `<nav class="site-header-nav" aria-label="Điều hướng chính">${items.filter(([key]) => !guest || !['applications', 'messages'].includes(key)).map(([key, icon, name, href]) => `<a href="${href}" ${key === current ? 'aria-current="page"' : ''}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${name}</a>`).join('')}</nav>`}
    </div>
    <div class="site-header-actions">${guest ? '<a class="site-header-login" href="/pages/login/">Đăng nhập</a><a class="site-header-register bg-primary" href="/pages/register/">Đăng ký</a>' : `
      <button type="button" class="site-header-notifications" aria-label="Thông báo"><span class="material-symbols-outlined" aria-hidden="true">notifications</span></button>
      <button type="button" class="site-header-account" aria-label="Mở menu tài khoản">
        <img src="${recruiter ? '/assets/images/b9998a7b65909586.png' : '/assets/images/33290a779af11a09.png'}" alt="${recruiter ? 'Mai Phương' : 'Nguyễn Minh Thư'}" width="34" height="34">
        <span class="site-header-account-text"><strong>${recruiter ? 'Mai Phương' : 'Nguyễn Minh Thư'}</strong><small>${recruiter ? 'Nhà tuyển dụng' : 'ĐH Bách Khoa TP.HCM'}</small></span>
        <span class="material-symbols-outlined site-header-chevron" aria-hidden="true">expand_more</span>
      </button>
    `}</div>`;
}
