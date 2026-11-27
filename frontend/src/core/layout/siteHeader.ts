import { isSignedIn } from '../auth';
import { currentProfile, currentRole, roleLabel } from '../session';
import { publicUrl } from '../supabase';
import { esc } from '../ui/actions';
import { isRecruiterWorkspace, workspaceHref } from '../workspace';

type NavItem = [key: string, icon: string, label: string, href: string];

/**
 * Global nav (DESIGN.md §4): brand + search on the left, icon-over-label items on the right, then
 * notifications and the "Tôi ▾" account button. Below 768px a compact header plus a bottom tab bar.
 *
 * Test contract (keep): classes site-header, site-header-nav, site-header-notifications, site-header-account,
 * site-header-login, site-header-register; aria-labels "Thông báo" and "Mở menu tài khoản"; the account
 * button's textContent holds the full name and role label (visually hidden on desktop).
 * The search is a div[role=search], not a <form>, so core/forms.ts and page tests that read `form input`
 * never see it.
 */
export function renderSiteHeader(page: string) {
  if (['login', 'register'].includes(page)) return;
  const header = document.querySelector('header');
  if (!header) return;
  const recruiter = isRecruiterWorkspace();
  const guest = !isSignedIn();
  const role = currentRole();
  const current = ['job-detail', 'company'].includes(page) && !recruiter ? 'jobs' : page;
  const items: NavItem[] = recruiter
    ? [['employer', 'home', 'Tổng quan', '/pages/employer/'], ['candidates', 'group', 'Ứng viên', '/pages/candidates/'], ['messages', 'chat', 'Tin nhắn', workspaceHref('/pages/messages/')]]
    : role === 'university_officer' || role === 'admin' || role === 'employer'
    ? [['jobs', 'work', 'Việc làm', '/'], ['community', 'forum', 'Cộng đồng', '/pages/community/'], ...(role === 'employer' ? [['messages', 'chat', 'Tin nhắn', '/pages/messages/'] as NavItem] : []), ...(role === 'university_officer' ? [['university-portal', 'school', 'Cổng nhà trường', '/pages/university-portal/'] as NavItem] : []),...(role === 'admin' ? [['admin', 'admin_panel_settings', 'Bảng quản trị', '/pages/admin/'] as NavItem] : [])]
    : [['jobs', 'work', 'Việc làm', '/'], ['applications', 'send', 'Đơn ứng tuyển', '/pages/applications/'], ['messages', 'chat', 'Tin nhắn', '/pages/messages/'], ['community', 'forum', 'Cộng đồng', '/pages/community/']];
  const visible = items.filter(([key]) => !guest || !['applications', 'messages'].includes(key));
  const profile = currentProfile();
  const name = profile?.full_name || profile?.email || '';
  const subtitle = profile ? roleLabel[profile.role] : '';
  const avatar = publicUrl('avatars', profile?.avatar_path) || initialsAvatar(name);
  const query = page === 'jobs' ? new URLSearchParams(location.search).get('q') ?? '' : '';
  const link = ([key, icon, label, href]: NavItem) =>
    `<a class="site-header-link" href="${href}" ${key === current ? 'aria-current="page"' : ''}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span class="site-header-label">${label}</span></a>`;
  const workspace = role === 'employer' || recruiter
    ? `<span class="site-header-divider" aria-hidden="true"></span>${recruiter
      ? '<span class="site-header-workspace"><span class="material-symbols-outlined" aria-hidden="true">apps</span><span class="site-header-label">Không gian tuyển dụng</span></span>'
      : '<a class="site-header-link site-header-workspace" href="/pages/employer/"><span class="material-symbols-outlined" aria-hidden="true">apps</span><span class="site-header-label">Không gian tuyển dụng</span></a>'}`
    : '';

  header.className = `site-header${guest ? ' site-header-guest' : ''}${recruiter ? ' site-header-recruiter' : ''}`;
  header.setAttribute('aria-label', recruiter ? 'Không gian nhà tuyển dụng' : 'Điều hướng Internships.io');
  header.innerHTML = `
    <div class="site-header-inner">
      <div class="site-header-start">
        <a class="site-header-brand" href="${recruiter ? '/pages/employer/' : '/'}" aria-label="${recruiter ? 'Tổng quan tuyển dụng' : 'Internships.io — Trang chủ'}">
          <span class="site-header-mark" aria-hidden="true">i</span><span class="site-header-wordmark">Internships.io</span>
        </a>
        ${recruiter ? '' : `<div class="site-header-search" role="search">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input type="search" name="q" id="site-search" value="${esc(query)}" placeholder="Tìm việc làm, công ty" aria-label="Tìm kiếm việc làm" autocomplete="off" enterkeyhint="search">
        </div>`}
      </div>
      <div class="site-header-actions">
        <nav class="site-header-nav" aria-label="Điều hướng chính">${visible.map(link).join('')}</nav>
        ${guest ? `
          <a class="site-header-register" href="/pages/register/">Đăng ký</a>
          <a class="site-header-login" href="/pages/login/">Đăng nhập</a>` : `
          <a class="site-header-mobile-link" href="${workspaceHref('/pages/messages/')}" aria-label="Tin nhắn"><span class="material-symbols-outlined" aria-hidden="true">chat</span></a>
          <button type="button" class="site-header-notifications site-header-link" aria-label="Thông báo"><span class="material-symbols-outlined" aria-hidden="true">notifications</span><span class="site-header-label" aria-hidden="true">Thông báo</span></button>
          <button type="button" class="site-header-account site-header-link" aria-label="Mở menu tài khoản">
            <img src="${esc(avatar)}" alt="${esc(name)}" width="24" height="24">
            <span class="site-header-label site-header-me" aria-hidden="true">Tôi<span class="material-symbols-outlined site-header-chevron">arrow_drop_down</span></span>
            <span class="site-header-account-text"><strong>${esc(name)}</strong><small>${esc(subtitle)}</small></span>
          </button>
          ${workspace}`}
      </div>
    </div>`;

  const search = header.querySelector<HTMLInputElement>('#site-search');
  search?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    const q = search.value.trim();
    location.assign(q ? `/?q=${encodeURIComponent(q)}` : '/');
  });
  renderMobileTabs(current, guest, recruiter, role);
}

/** Bottom tab bar for <768px (CSS hides it on larger screens). */
function renderMobileTabs(current: string, guest: boolean, recruiter: boolean, role: string | null) {
  document.querySelector('.app-mobile-nav')?.remove();
  const tabs: NavItem[] = recruiter
    ? [['employer', 'home', 'Tổng quan', '/pages/employer/'], ['candidates', 'group', 'Ứng viên', '/pages/candidates/'], ['post-job', 'add_box', 'Đăng tin', '/pages/post-job/'], ['messages', 'chat', 'Tin nhắn', workspaceHref('/pages/messages/')], ['company-settings', 'business', 'Công ty', '/pages/company-settings/']]
    : guest
    ? [['jobs', 'work', 'Việc làm', '/'], ['community', 'forum', 'Cộng đồng', '/pages/community/'], ['login', 'login', 'Đăng nhập', '/pages/login/']]
    : role === 'student'
    ? [['jobs', 'work', 'Việc làm', '/'], ['community', 'forum', 'Cộng đồng', '/pages/community/'], ['applications', 'send', 'Ứng tuyển', '/pages/applications/'], ['notifications', 'notifications', 'Thông báo', '/pages/notifications/'], ['profile', 'person', 'Hồ sơ', '/pages/profile/']]
    : [['jobs', 'work', 'Việc làm', '/'], ['community', 'forum', 'Cộng đồng', '/pages/community/'], ['messages', 'chat', 'Tin nhắn', '/pages/messages/'], ['notifications', 'notifications', 'Thông báo', '/pages/notifications/']];
  const nav = document.createElement('nav');
  nav.className = 'app-mobile-nav';
  nav.setAttribute('aria-label', 'Điều hướng nhanh');
  nav.innerHTML = tabs.map(([key, icon, label, href]) =>
    `<a href="${href}" ${key === current ? 'aria-current="page"' : ''}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('');
  document.body.append(nav);
  document.body.classList.add('has-mobile-nav');
}

/** SVG data-URL with the user's initials, used until they upload an avatar. (Data URLs can't read CSS
 *  variables, so the two colours mirror --ui-primary-soft / --ui-primary.) */
export function initialsAvatar(name: string) {
  const initials = name.trim().split(/\s+/).slice(-2).map(w => w[0] || '').join('').toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="32" fill="#faebe5"/><text x="50%" y="54%" font-family="Be Vietnam Pro,Arial" font-size="24" font-weight="600" fill="#b93b1d" text-anchor="middle" dominant-baseline="middle">${initials.replace(/[<&>]/g, '')}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
