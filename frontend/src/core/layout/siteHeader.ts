import { isSignedIn } from '../auth';
import { currentProfile, currentRole, roleLabel } from '../session';
import { publicUrl } from '../supabase';
import { esc } from '../ui/actions';
import { isRecruiterWorkspace, workspaceHref } from '../workspace';

export function renderSiteHeader(page: string) {
  if (['login', 'register'].includes(page)) return;
  const header = document.querySelector('header');
  if (!header) return;
  const recruiter = isRecruiterWorkspace();
  const guest = !isSignedIn();
  const current = ['job-detail', 'company'].includes(page) ? 'jobs' : page;
  const items = recruiter
    ? [['employer', 'dashboard', 'Tổng quan', '/pages/employer/'], ['candidates', 'group', 'Ứng viên', '/pages/candidates/'], ['messages', 'chat', 'Tin nhắn', workspaceHref('/pages/messages/')]]
    : currentRole() === 'university_officer' || currentRole() === 'admin'
    ? [['jobs', 'work', 'Việc làm', '/'], ['community', 'forum', 'Cộng đồng', '/pages/community/']]
    : [['jobs', 'work', 'Việc làm', '/'], ['applications', 'send', 'Đơn ứng tuyển', '/pages/applications/'], ['messages', 'chat', 'Tin nhắn', '/pages/messages/'], ['community', 'forum', 'Cộng đồng', '/pages/community/']];
  const profile = currentProfile();
  const name = profile?.full_name || profile?.email || '';
  const subtitle = profile ? roleLabel[profile.role] : '';
  const avatar = publicUrl('avatars', profile?.avatar_path) || initialsAvatar(name);
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
        <img src="${esc(avatar)}" alt="${esc(name)}" width="34" height="34">
        <span class="site-header-account-text"><strong>${esc(name)}</strong><small>${esc(subtitle)}</small></span>
        <span class="material-symbols-outlined site-header-chevron" aria-hidden="true">expand_more</span>
      </button>
    `}</div>`;
}

/** SVG data-URL with the user's initials, used until they upload an avatar. */
export function initialsAvatar(name: string) {
  const initials = name.trim().split(/\s+/).slice(-2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#e8edf8"/><text x="50%" y="54%" font-family="Inter,Arial" font-size="24" font-weight="700" fill="#3f5baa" text-anchor="middle" dominant-baseline="middle">${initials.replace(/[<&>]/g, '')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
