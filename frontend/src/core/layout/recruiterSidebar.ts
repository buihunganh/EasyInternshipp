import { isRecruiterWorkspace } from '../workspace';
const items = [
  ['employer', 'dashboard', 'Tổng quan', '/pages/employer/'],
  ['candidates', 'view_kanban', 'Quản lý ứng viên', '/pages/candidates/'],
  ['post-job', 'post_add', 'Đăng tin tuyển dụng', '/pages/post-job/'],
  ['messages', 'chat', 'Tin nhắn', '/pages/messages/'],
];

export function renderRecruiterSidebar(page: string) {
  if (!isRecruiterWorkspace() || !['employer', 'candidates', 'post-job', 'messages'].includes(page)) return;
  let sidebar = document.querySelector('body > aside');
  if (!sidebar) {
    sidebar = document.createElement('aside');
    document.body.prepend(sidebar);
    const shell = document.querySelector('main')?.parentElement;
    if (shell && shell !== document.body) shell.classList.add('pl-64');
  }
  document.body.classList.add('recruiter-workspace');

  sidebar.className = 'recruiter-sidebar';
  sidebar.id = 'recruiter-sidebar';
  sidebar.setAttribute('aria-label', 'Không gian nhà tuyển dụng');
  sidebar.innerHTML = `
    <div>
      <a class="recruiter-brand" href="/pages/employer/" aria-label="Internships.io — Tổng quan tuyển dụng">
        <img src="/assets/images/a06f0f33c8f6a3ab.png" alt="" width="32" height="32">
        <span><strong>Internships.io</strong><small>Recruiter Hub</small></span>
      </a>
      <p class="recruiter-nav-label">Tuyển dụng & nhân sự</p>
      <nav id="recruiter-navigation" aria-label="Điều hướng tuyển dụng">
        ${items.map(([key, icon, name, href]) => `<a href="${href}" aria-label="${name}" title="${name}" ${key === page ? 'aria-current="page"' : ''}><span class="material-symbols-outlined" aria-hidden="true">${icon}</span><span>${name}</span></a>`).join('')}
      </nav>
    </div>
    `;
  document.body.classList.add('recruiter-sidebar-collapsed');
}