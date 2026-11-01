import { requireSignIn, isSignedIn } from './auth';
import { isRecruiterWorkspace, workspaceHref } from './workspace';
import { dialog } from './ui/feedback';
import { read } from './storage';

export const routes: Record<string, string> = {
  jobs: '/', community: '/pages/community/', login: '/pages/login/', register: '/pages/register/',
  messages: '/pages/messages/', employer: '/pages/employer/', candidates: '/pages/candidates/',
  'post-job': '/pages/post-job/', 'job-detail': '/pages/job-detail/', company: '/pages/company/',
  'cv-builder': '/pages/cv-builder/', profile: '/pages/profile/', university: '/pages/university/',
  'company-settings': '/pages/company-settings/', 'reset-password': '/pages/reset-password/',
  applications: '/pages/applications/', cv: '/pages/cv/', notifications: '/pages/notifications/'
};
/** Links to jobs and companies use ids (`?id=<uuid>`). */
export const jobHref = (id: string) => '/pages/job-detail/?id=' + encodeURIComponent(id);
export const companyHref = (id: string) => '/pages/company/?id=' + encodeURIComponent(id);
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
  if (/thông báo|tất cả thông báo/i.test(text)) return routes.notifications;
}
/** "Đơn ứng tuyển": the student's My Applications page. */
export function applications() {
  if (!requireSignIn(routes.applications)) return;
  location.assign(routes.applications);
}
export function setupNavigation() {
  document.querySelectorAll<HTMLAnchorElement>('a[href="#"]').forEach(a => {
    if(a.closest('header')&&a.querySelector('img')&&!/logo/i.test(a.querySelector('img')?.alt || ''))return;
    const text = label(a);
    if (/đơn ứng tuyển/i.test(text)) { a.addEventListener('click', e => {e.preventDefault(); applications();}); return; }
    const href = destination(text);
    if (href) a.href = workspaceHref(href);
    else a.addEventListener('click', e => {
      e.preventDefault();
      dialog('Đang phát triển', `<p>Tính năng "<strong>${text || 'Liên kết'}</strong>" đang được hoàn thiện theo lộ trình và sẽ sớm có mặt.</p>`, 'Đóng');
    });
  });
  document.querySelectorAll<HTMLAnchorElement>('header nav a, header .site-header-nav a').forEach(a => {
    const text = label(a);
    const href = destination(text);
    if (href) a.href = workspaceHref(href);
  });
  document.querySelectorAll<HTMLElement>('[data-action="link"]').forEach(el => {
    const href = el.dataset.href;
    if (href) el.addEventListener('click', () => { location.assign(workspaceHref(href)); });
  });
}
