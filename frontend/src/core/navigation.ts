import { requireSignIn, isSignedIn } from './auth';
import { isRecruiterWorkspace, workspaceHref } from './workspace';
import { dialog } from './ui/feedback';
import { read } from './storage';

export const routes: Record<string, string> = {
  jobs: '/', community: '/pages/community/', login: '/pages/login/', register: '/pages/register/',
  messages: '/pages/messages/', employer: '/pages/employer/', candidates: '/pages/candidates/',
  'post-job': '/pages/post-job/', 'job-detail': '/pages/job-detail/', company: '/pages/company/',
  'cv-builder': '/pages/cv-builder/', profile: '/pages/profile/', university: '/pages/university/'
};
export const jobHref = (title: string) => '/pages/job-detail/?job=' + encodeURIComponent(title);
export function label(el: Element) {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('.material-symbols-outlined').forEach(i => i.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}
export function destination(text: string): string | undefined {
  if (/dành cho doanh nghiệp|tin đã đăng/i.test(text)) return routes.employer;
  if (/liên kết trường đại học/i.test(text)) return routes.university;
  if (/đăng ký|tạo tài khoản/i.test(text)) return routes.register;
  if (/đăng nhập/i.test(text)) return routes.login;
  if (/đăng tin|tạo tin tuyển/i.test(text)) return routes['post-job'];
  if (/tin nhắn|chat 1-1/i.test(text)) return routes.messages;
  if (/cộng đồng|bảng tin/i.test(text)) return routes.community;
  if (/chỉnh sửa hồ sơ|tạo.*cv|hoàn thiện.*cv|cập nhật cv/i.test(text)) return routes['cv-builder'];
  if (/hồ sơ cá nhân|hồ sơ của tôi|^hồ sơ$|minh thư/i.test(text)) return routes.profile;
  if (/quản lý ứng viên|pipeline|ứng viên mới/i.test(text)) return routes.candidates;
  if (/quản lý tuyển dụng|tổng quan|dashboard/i.test(text)) return routes.employer;
  if (/hồ sơ công ty|trang tuyển dụng công ty|technova|về công ty/i.test(text)) return routes.company;
  if (/bách khoa|hcmut|cổng đối tác trường/i.test(text)) return routes.university;
  if (/internships.io|^việc làm$|tìm việc|tất cả việc làm/i.test(text)) return routes.jobs;
  if (/intern|chi tiết công việc|xem chi tiết/i.test(text)) return routes['job-detail'];
}
export function applications() {
  if (!requireSignIn('/?view=applications')) return;
  const saved = read<string[]>('applications', []);
  dialog('Đơn ứng tuyển', '<p id="application-list"></p>', 'Đóng');
  document.getElementById('application-list')!.textContent = saved.length ? saved.join(' • ') : 'Chưa có đơn ứng tuyển trong bản demo. Hãy chọn một việc làm và nộp hồ sơ.';
}
export function setupNavigation() {
  document.querySelectorAll<HTMLAnchorElement>('a[href="#"]').forEach(a => {
    if(a.closest('header')&&a.querySelector('img')&&!/logo/i.test(a.querySelector('img')?.alt || ''))return;
    const text = label(a);
    if (/đơn ứng tuyển/i.test(text)) { a.addEventListener('click', e => {e.preventDefault(); applications();}); return; }
    const href = destination(text);
    if (href) a.href = workspaceHref(href);
    else a.addEventListener('click', e => {e.preventDefault(); dialog(text || 'Thông tin', '<p>Nội dung này đang chờ kết nối dữ liệu từ hệ thống.</p>', 'Đóng');});
  });
  document.querySelectorAll<HTMLElement>('header img').forEach(img => {
    if(!/logo/i.test(img.getAttribute('alt') || ''))return;
    const target = img.closest<HTMLElement>('.cursor-pointer') || img;
    target.style.cursor = 'pointer';
    target.addEventListener('click', () => location.assign('/'));
  });
  const mobile = document.createElement('nav'); mobile.className = 'app-mobile-nav'; mobile.setAttribute('aria-label','Điều hướng trên điện thoại');
  const items = isRecruiterWorkspace()
    ? [['employer','dashboard','Tổng quan'],['candidates','group','Ứng viên'],['post-job','add_circle','Đăng tin'],['messages','chat','Tin nhắn']]
    : [['jobs','work','Việc làm'],['community','forum','Cộng đồng'],['messages','chat','Tin nhắn'],['profile','person','Hồ sơ']];
  mobile.innerHTML = items.filter(([key]) => isSignedIn() || !['messages', 'profile'].includes(key)).map(([key,icon,name])=>`<a href="${workspaceHref(routes[key])}" ${key === document.body.dataset.page ? 'aria-current="page"' : ''}><span class="material-symbols-outlined">${icon}</span>${name}</a>`).join('');
  document.body.append(mobile);
  if (isSignedIn() && new URLSearchParams(location.search).get('view') === 'applications') applications();
}
