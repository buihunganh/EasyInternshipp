import { dialog } from '../ui/feedback';

/** Footer links shared by the page footer and the right-rail footer. `null` = page not built yet. */
const footerLinks: [label: string, href: string | null][] = [
  ['Về chúng tôi', '/pages/about/'],
  ['Trợ giúp', '/pages/help/'],
  ['Điều khoản', '/pages/terms/'],
  ['Quyền riêng tư', '/pages/privacy/'],
  ['Dành cho nhà tuyển dụng', '/pages/register/'],
  ['Đối tác nhà trường', '/pages/university/'],
  ['Cộng đồng', '/pages/community/'],
  ['Quản trị hệ thống', '/pages/admin-login/'],
];

const workspacePages = ['candidates', 'employer', 'post-job', 'company-settings', 'messages', 'cv-builder', 'profile', 'applications', 'notifications', 'reset-password'];

function linkRow(className: string) {
  const nav = document.createElement('nav');
  nav.className = className;
  nav.setAttribute('aria-label', 'Liên kết chân trang');
  for (const [label, href] of footerLinks) {
    const a = document.createElement('a');
    a.textContent = label;
    a.href = href ?? '#';
    if (!href) {
      a.dataset.footerPending = '';
      // Registered before core/navigation.ts so its generic "#" handling never runs on these links
      a.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        dialog(label, `<p>Trang "${label}" đang được hoàn thiện và sẽ sớm có mặt.</p>`, 'Đóng');
      });
    }
    nav.append(a);
  }
  return nav;
}

function copyright() {
  const p = document.createElement('p');
  p.className = 'site-footer-copy';
  p.innerHTML = `<span class="site-footer-brand" aria-hidden="true">i</span><span>Internships.io © ${new Date().getFullYear()}</span>`;
  return p;
}

/**
 * Page footer. Public pages: a centred, small muted link row plus copyright (no dark mega-footer).
 * Task pages (workspacePages) keep the slim `.workspace-footer` bar.
 */
export function renderSiteFooter() {
  document.querySelectorAll('body > footer, footer.internships-footer, footer.itviec-footer, footer.workspace-footer, footer.site-footer').forEach(footer => footer.remove());
  const footer = document.createElement('footer');
  if (workspacePages.includes(document.body.dataset.page || '')) {
    footer.className = 'workspace-footer';
    footer.innerHTML = `<a href="/" aria-label="Internships.io — Trang chủ">Internships.io</a><span>© ${new Date().getFullYear()} Internships.io</span><a href="/pages/help/#lien-he">Liên hệ hỗ trợ</a>`;
  } else {
    footer.className = 'site-footer';
    footer.append(linkRow('site-footer-links'), copyright());
  }
  document.body.append(footer);
}

/**
 * Right-rail footer (LinkedIn pattern): the same links, compact, at the bottom of a page's right rail.
 * On ≥992px the page footer is hidden while a rail footer exists; below that the rail footer hides instead.
 * Phase 2 pages call this from their module once the rail is in the DOM: `renderRailFooter(railElement)`.
 */
export function renderRailFooter(container: HTMLElement) {
  container.querySelector(':scope > .rail-footer')?.remove();
  const block = document.createElement('div');
  block.className = 'rail-footer';
  block.append(linkRow('rail-footer-links'), copyright());
  container.append(block);
  document.body.classList.add('has-rail-footer');
  return block;
}
