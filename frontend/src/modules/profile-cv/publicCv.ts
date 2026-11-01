// /pages/cv/?slug=<public_slug>: a CV the student made public, readable by anyone (RLS: is_public).
import { routes } from '../../core/navigation';
import { bind, esc } from '../../core/ui/actions';
import { formatDate } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { showError } from '../../core/errors';
import type { CvContent } from '../../core/models';
import { cvFileUrl, publicCv } from './api';

/** The A4 sheet markup (same structure and styles as the builder's live preview). */
export function cvSheetHTML(c: CvContent) {
  const p = c.personal ?? ({} as CvContent['personal']);
  const entry = (title: string, lines: string[]) => `<div class="demo-cv-entry"><strong>${esc(title)}</strong>${lines.filter(Boolean).map(l => `<p class="demo-prewrap">${esc(l)}</p>`).join('')}</div>`;
  return `<div class="demo-cv-header"><div><h3>${esc((p.name || '').toUpperCase())}</h3><p>${esc(p.title || '')}</p>
      <p>${esc([p.email, p.phone].filter(Boolean).join(' · '))}</p><p>${esc(p.location || '')}</p><p>${esc([p.github, p.linkedin].filter(Boolean).join(' · '))}</p></div>
      ${c.avatar ? `<img src="${esc(c.avatar)}" alt="" width="64" height="64">` : ''}</div>
    ${c.summary ? `<section><h4>Mục tiêu nghề nghiệp</h4><p class="demo-prewrap">${esc(c.summary)}</p></section>` : ''}
    ${c.education?.length ? `<section><h4>Học vấn</h4>${c.education.map(e => entry(e.school, [e.period, [e.major, e.gpa ? `GPA: ${e.gpa}` : ''].filter(Boolean).join(' · '), e.courses])).join('')}</section>` : ''}
    ${c.projects?.length ? `<section><h4>Dự án</h4>${c.projects.map(pj => entry(pj.title, [pj.stack, pj.link, pj.description])).join('')}</section>` : ''}
    ${c.skills?.length ? `<section><h4>Kỹ năng & chứng chỉ</h4><p>${esc(c.skills.join(' · '))}</p></section>` : ''}
    ${c.activities?.length ? `<section><h4>Hoạt động & giải thưởng</h4>${c.activities.map(a => entry(a.title, [a.detail])).join('')}</section>` : ''}`;
}

export async function setupPublicCv() {
  const main = document.querySelector<HTMLElement>('main')!;
  const sheet = document.getElementById('a4-cv-sheet')!;
  const slug = new URLSearchParams(location.search).get('slug');
  const notFound = () => main.replaceChildren(el('div', { className: 'ei-page ei-page-narrow' },
    stateBlock('empty', 'CV không tồn tại hoặc chủ sở hữu đã tắt liên kết công khai.'), el('a', { className: 'ei-button ei-button-primary', href: routes.jobs }, 'Về trang chủ')));
  if (!slug) { notFound(); return; }
  let cv: Awaited<ReturnType<typeof publicCv>> = null;
  try { cv = await publicCv(slug); } catch (error) { showError(error); }
  if (!cv) { notFound(); return; }
  const content = cv.content as unknown as CvContent;
  document.title = `${content.personal?.name || cv.title} — CV | Internships.io`;
  document.getElementById('cv-title')!.textContent = content.personal?.name || cv.title;
  document.getElementById('cv-updated')!.textContent = `Cập nhật ${formatDate(cv.updated_at)}`;
  sheet.style.setProperty('--cv-accent', content.color || '#3f5baa');
  sheet.dataset.template = content.theme || 'modern';
  sheet.innerHTML = cvSheetHTML(content);
  bind(document.getElementById('cv-print'), () => window.print());
  const file = document.getElementById('cv-file') as HTMLButtonElement;
  if (cv.file_path) {
    file.hidden = false;
    bind(file, async () => { try { window.open(await cvFileUrl(cv!.file_path!), '_blank', 'noopener'); } catch (error) { showError(error); } });
  }
  window.addEventListener('beforeprint', () => { document.getElementById('demo-print-region')?.remove(); const region = el('div', { id: 'demo-print-region' }); region.append(sheet.cloneNode(true)); document.body.append(region); });
  window.addEventListener('afterprint', () => document.getElementById('demo-print-region')?.remove());
}
