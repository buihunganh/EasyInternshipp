// Job detail (?id=<uuid>): JD, company block, skills, deadline, view count, similar jobs,
// apply / save / report.
import { requireSignIn } from '../../core/auth';
import { companyHref, jobHref, label, routes } from '../../core/navigation';
import { bind } from '../../core/ui/actions';
import { registerApply } from '../../core/forms';
import { reportContent } from '../../core/report';
import { currentRole } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { savedJobIds, setJobSaved } from '../../core/accountApi';
import { showError } from '../../core/errors';
import { formatDate, formatStipend, relativeTime, scheduleLabel, workTypeLabel } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { isRecruiterWorkspace } from '../../core/workspace';
import { getJob, hasApplied, matchScore, recordView, searchJobs, type JobDetail } from './api';
import { openApplyDialog } from './applyDialog';
import { deadlineClock, setIconText } from './jobSearch';
import { renderRailFooter } from '../../core/layout/siteFooter';

const sectionByHeading = (re: RegExp) =>
  [...document.querySelectorAll<HTMLElement>('main section')].find(s => re.test(s.querySelector('h2')?.textContent || ''));

/** "Address, city" without repeating the city when the address (e.g. "…, Quận 7, TP.HCM") already contains it. */
function addressLine(address?: string | null, city?: string | null) {
  const street = address?.trim() ?? '';
  const place = city?.trim() ?? '';
  const flat = (value: string) => value.toLowerCase().replace(/\s+/g, '');
  if (street && place && flat(street).includes(flat(place))) return street;
  return [street, place].filter(Boolean).join(', ');
}

/** Text of an element without its (hidden) Material Symbols ligature. */
function textOnly(node: HTMLElement) {
  return [...node.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join('').trim();
}

function notFound(main: HTMLElement) {
  main.replaceChildren(el('div', { className: 'ei-page ei-page-narrow' },
    stateBlock('empty', 'Tin tuyển dụng không tồn tại, đã đóng hoặc bạn không có quyền xem.'),
    el('a', { className: 'ei-button ei-button-primary', href: routes.jobs }, 'Xem các vị trí đang tuyển')));
  document.title = 'Không tìm thấy tin tuyển dụng | Internships.io';
}

function fillHeader(job: JobDetail) {
  const h1 = document.querySelector('main h1')!;
  h1.textContent = job.title;
  document.title = `${job.title} | Internships.io`;
  const company = job.company;
  const headerImg = document.querySelector<HTMLImageElement>('.jobs-topcard__logo');
  if (headerImg && company) { headerImg.src = publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name); headerImg.alt = company.name; }
  const meta = h1.nextElementSibling;
  meta?.querySelectorAll('.jobs-topcard__sep').forEach(sep => sep.remove());   // the dot separators come from CSS
  const metaSpans = meta ? ([...meta.children] as HTMLElement[]).filter(s => s.querySelector('.material-symbols-outlined')) : [];
  setIconText(metaSpans[0], (company?.name ?? '') + (company?.verification_status === 'verified' ? ' ✓' : ''));
  setIconText(metaSpans[1], addressLine(job.address, job.city) || 'Toàn quốc');
  setIconText(metaSpans[2], `${scheduleLabel[job.schedule] ?? job.schedule} · ${workTypeLabel[job.work_type] ?? job.work_type}`);
  metaSpans.forEach(s => { s.hidden = !textOnly(s); });   // no dangling dot for an empty item
  const badges = meta?.nextElementSibling;
  if (badges) {
    const [posted, stipend] = [...badges.children] as HTMLElement[];
    if (posted) posted.textContent = job.published_at ? `Đăng ${relativeTime(job.published_at)}` : 'Mới đăng';
    setIconText(stipend, `${formatStipend(job.stipend_min, job.stipend_max)}/tháng`);
    if (currentRole() === 'student') {
      matchScore(job.id).then(score => {
        if (score == null || !posted) return;
        const chip = posted.cloneNode(true) as HTMLElement;
        chip.className = 'ui-chip ui-chip--success';
        chip.textContent = `${score}% phù hợp với hồ sơ của bạn`;
        badges.append(chip);
      }).catch(() => {});
    }
    const clock = deadlineClock(job.deadline);
    if (clock) badges.append(clock);
  }
}

function fillSections(job: JobDetail) {
  const about = sectionByHeading(/Giới thiệu về công việc|Về Vị Trí/i);
  const aboutText = about?.querySelector('p');
  if (aboutText) { aboutText.textContent = job.description; aboutText.style.whiteSpace = 'pre-line'; }

  // Bullet lines in the description become the responsibilities list
  const duties = sectionByHeading(/Trách Nhiệm/i);
  const bullets = job.description.split(/\n/).map(l => l.trim()).filter(l => /^[-•*]\s+/.test(l)).map(l => l.replace(/^[-•*]\s+/, ''));
  if (duties) {
    const ul = duties.querySelector('ul');
    const item = ul?.querySelector('li');
    if (ul && item && bullets.length) {
      ul.replaceChildren(...bullets.map(text => { const li = item.cloneNode(true) as HTMLElement; li.lastElementChild!.textContent = text; return li; }));
    } else { duties.hidden = true; (duties.nextElementSibling as HTMLElement | null)?.setAttribute('hidden', ''); }
  }

  const requirements = sectionByHeading(/Yêu Cầu/i);
  if (requirements) {
    const blocks = [...requirements.querySelectorAll<HTMLElement>('h3')].map(h => h.parentElement!);
    const education = blocks[0]?.querySelector('p');
    const target = [
      job.target_study_years?.length ? `Sinh viên năm ${job.target_study_years.join(', ')}` : '',
      job.target_majors?.length ? `ngành ${job.target_majors.join(', ')}` : '',
    ].filter(Boolean).join(' — ');
    if (education) { education.textContent = [target, job.requirements].filter(Boolean).join('\n') || 'Không yêu cầu cụ thể.'; education.style.whiteSpace = 'pre-line'; }
    const chips = blocks[1]?.querySelector('div');
    const chip = chips?.firstElementChild;
    const skills = (job.skills ?? []).map(s => s.skill?.name).filter(Boolean) as string[];
    if (chips && chip) {
      if (skills.length) chips.replaceChildren(...skills.map(name => { const c = chip.cloneNode(true) as HTMLElement; c.textContent = name; return c; }));
      else blocks[1].hidden = true;
    }
    const soft = requirements.querySelector<HTMLElement>(':scope > p');
    if (soft) soft.hidden = true;
  }

  const benefits = sectionByHeading(/Quyền Lợi/i);
  if (benefits) {
    const grid = benefits.querySelector('h2')?.nextElementSibling as HTMLElement | null;
    const card = grid?.firstElementChild as HTMLElement | null;
    const perks = job.perks ?? [];
    if (grid && card && perks.length) {
      grid.replaceChildren(...perks.map(text => {
        const c = card.cloneNode(true) as HTMLElement;
        c.querySelector('h4')!.textContent = text;
        const p = c.querySelector('p'); if (p) p.remove();
        c.querySelector('.material-symbols-outlined')!.textContent = 'redeem';
        return c;
      }));
    } else if (grid) grid.hidden = true;
    if (job.benefits) benefits.append(el('p', { className: 'jobs-jd__body', style: 'white-space:pre-line' } as never, job.benefits));
    if (!perks.length && !job.benefits) { benefits.hidden = true; (benefits.previousElementSibling as HTMLElement | null)?.setAttribute('hidden', ''); }
  }

  const deadline = [...document.querySelectorAll('main p')].find(p => /Hạn chót ứng tuyển/.test(p.textContent || ''));
  if (deadline) deadline.textContent = job.deadline ? `Hạn chót ứng tuyển: ${formatDate(job.deadline)}` : 'Đang nhận hồ sơ';
}

/** Company card at the top of the right rail (logo, verified name, facts, open roles, link to the company page). */
async function companyCard(job: JobDetail) {
  const company = job.company;
  // The right rail (the main column has its own "Về công ty" aside further down)
  const rail = document.querySelector<HTMLElement>('.jobs-detail-rail');
  if (!company || !rail || rail.querySelector('.jobs-company-card')) return;
  const industry = (company.industry as { name: string } | null)?.name;
  const facts = [
    industry && ['category', industry],
    company.company_size && ['groups', `${company.company_size} nhân viên`],
    company.founded_year && ['history_edu', `Thành lập ${company.founded_year}`],
    company.city && ['location_on', company.city],
  ].filter(Boolean) as [string, string][];
  const open = el('span', { className: 'jobs-company-card__open' });
  const card = el('section', { className: 'ui-card jobs-company-card', 'aria-label': `Về ${company.name}` },
    el('div', { className: 'jobs-company-card__head' },
      el('img', { className: 'ui-logo', src: publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name), alt: '', width: 48, height: 48 }),
      el('div', { className: 'jobs-company-card__name' },
        el('a', { href: companyHref(company.id) }, company.name),
        company.verification_status === 'verified' ? el('span', { className: 'ui-chip ui-chip--success' }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'verified'), 'Đã xác thực') : null)),
    company.description ? el('p', { className: 'jobs-company-card__about' }, company.description) : null,
    facts.length ? el('ul', { className: 'jobs-company-card__facts' }, ...facts.map(([icon, text]) =>
      el('li', {}, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, icon), text))) : null,
    open,
    el('a', { className: 'ui-btn ui-btn--neutral ui-btn--sm ui-btn--block', href: companyHref(company.id) }, 'Xem trang công ty'));
  rail.prepend(card);
  try {
    const rows = await searchJobs({ p_company_id: company.id, p_limit: 50 });
    open.textContent = rows.length ? `${rows.length} vị trí đang tuyển` : '';
  } catch { open.remove(); }
}

function fillSidebar(job: JobDetail) {
  void companyCard(job);
  const company = job.company;
  const widget = document.querySelector<HTMLElement>('.jobs-about');
  if (!widget || !company) return;
  setIconText(widget.querySelector('h3'), `Về ${company.name}`);
  const logo = widget.querySelector('img');
  if (logo) { logo.src = publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name); logo.alt = company.name; }
  const description = widget.querySelector('.jobs-about__text');
  if (description) description.textContent = company.description || 'Doanh nghiệp chưa cập nhật giới thiệu.';
  const link = widget.querySelector<HTMLAnchorElement>('a');
  if (link) { link.href = companyHref(company.id); link.dataset.appControl = 'company-link'; }
  const facts: Record<string, string> = {
    'Quy mô:': company.company_size ? `${company.company_size} nhân viên` : '—',
    'Lĩnh vực:': (company.industry as { name: string } | null)?.name ?? '—',
    'Thành lập:': company.founded_year ? String(company.founded_year) : '—',
  };
  widget.querySelectorAll('dt').forEach(term => {
    const value = facts[term.textContent?.trim() || ''];
    if (value && term.nextElementSibling) term.nextElementSibling.textContent = value;
  });
  const address = addressLine(job.address, job.city) || addressLine(company.address, company.city) || '';
  const map = document.querySelector<HTMLElement>('main [data-location]');
  if (map) { map.dataset.location = address; map.hidden = true; }   // no grey map placeholder: the link below replaces it
  const mapText = map?.parentElement?.querySelector(':scope > p');
  if (mapText) {
    mapText.textContent = address || 'Doanh nghiệp chưa cập nhật địa chỉ.';
    if (address) mapText.after(el('a', {
      className: 'jobs-location__link',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      target: '_blank', rel: 'noopener',
    }, 'Mở trong Google Maps'));
  }
}

async function fillSimilar(job: JobDetail) {
  const heading = [...document.querySelectorAll('main aside h3')].find(h => /tương tự/i.test(h.textContent || ''));
  const box = heading?.nextElementSibling as HTMLElement | null;
  const template = box?.querySelector('a');
  if (!box || !template) return;
  const more = heading?.parentElement?.querySelector<HTMLButtonElement>('.ui-card__footer button');
  if (more) bind(more, () => location.assign(job.industry_id ? `/?industry=${job.industry_id}` : routes.jobs));
  try {
    let rows = await searchJobs({ p_industry_id: job.industry_id ?? undefined, p_exclude_job: job.id, p_limit: 3, p_sort: 'newest' });
    // Nothing else in this field yet: show the newest other openings rather than an empty card
    if (!rows.length && job.industry_id) rows = await searchJobs({ p_exclude_job: job.id, p_limit: 3, p_sort: 'newest' });
    if (!rows.length) { box.replaceChildren(el('p', { className: 'ei-muted' }, 'Chưa có công việc tương tự.')); return; }
    box.replaceChildren(...rows.map(row => {
      const a = template.cloneNode(true) as HTMLAnchorElement;
      a.href = jobHref(row.id); a.dataset.appControl = 'similar-job';
      a.querySelector('h4')!.textContent = row.title;
      const spans = a.querySelectorAll('.ui-meta span');
      if (spans[0]) spans[0].textContent = row.company_name;
      if (spans[1]) spans[1].textContent = row.work_type === 'remote' ? 'Remote' : row.city ?? 'Toàn quốc';
      return a;
    }));
  } catch { box.replaceChildren(el('p', { className: 'ei-muted' }, 'Không tải được công việc tương tự.')); }
}

function wireActions(job: JobDetail) {
  const applyButtons = [...document.querySelectorAll<HTMLButtonElement>('main button')].filter(b => /Ứng tuyển ngay|Nộp đơn ứng tuyển/i.test(label(b)) && !b.dataset.appControl);
  const markApplied = () => applyButtons.forEach(b => { b.disabled = true; const span = b.querySelector('span:not(.material-symbols-outlined)') ?? b; span.textContent = 'Đã ứng tuyển'; });
  if (!isRecruiterWorkspace()) {
    applyButtons.forEach(b => bind(b, () => { if (requireSignIn()) void openApplyDialog(job.id, markApplied); }));
    if (currentRole() === 'student') hasApplied(job.id).then(applied => { if (applied) markApplied(); }).catch(() => {});
  }
  registerApply(() => void openApplyDialog(job.id, markApplied));

  const save = document.querySelector<HTMLButtonElement>('main button[aria-label="Lưu công việc"]');
  if (save) {
    let active = false;
    const text = save.querySelector('.jobs-topcard__save-text');
    const render = () => {
      save.setAttribute('aria-pressed', String(active));
      save.querySelector('span')!.textContent = active ? 'bookmark' : 'bookmark_border';
      if (text) text.textContent = active ? 'Đã lưu' : 'Lưu';
    };
    if (currentRole() === 'student') savedJobIds().then(ids => { active = ids.has(job.id); render(); }).catch(() => {});
    bind(save, async () => {
      if (!requireSignIn() || currentRole() !== 'student') return;
      try { await setJobSaved(job.id, !active); active = !active; render(); } catch (error) { showError(error); }
    });
  }

  // Tabs: "Chi Tiết Công Việc" is the page itself (scroll to the description), "Về Công Ty" → company page
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    if (/^Về Công Ty$/i.test(label(b)) && job.company) bind(b, () => location.assign(companyHref(job.company!.id)));
    else if (/^Chi Tiết Công Việc$/i.test(label(b))) bind(b, () => document.querySelector('.jobs-jd')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  // Report (guests allowed, BR-37)
  const deadlineBox = [...document.querySelectorAll('main p')].find(p => /Hạn chót ứng tuyển|Đang nhận hồ sơ/.test(p.textContent || ''))?.closest('div')?.parentElement;
  const report = el('button', { type: 'button', className: 'ui-btn ui-btn--tertiary ui-btn--sm', 'aria-label': 'Báo cáo tin tuyển dụng' },
    el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'flag'), 'Báo cáo tin tuyển dụng');
  bind(report, () => reportContent(job.title, { type: 'job', id: job.id }));
  deadlineBox?.after(el('div', { className: 'jobs-jd__report' }, report));
}

export async function setupJobDetail() {
  const main = document.querySelector<HTMLElement>('main')!;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { notFound(main); return; }
  let job: JobDetail | null = null;
  try { job = await getJob(id); } catch (error) { showError(error); }
  if (!job) { notFound(main); return; }
  fillHeader(job);
  fillSections(job);
  fillSidebar(job);
  wireActions(job);
  const rail = document.querySelector<HTMLElement>('.jobs-detail-rail');
  if (rail) renderRailFooter(rail);
  await fillSimilar(job);
  if (job.status === 'active') void recordView(job.id);
  else (main.querySelector('.ui-main') ?? main).prepend(el('div', { className: 'ei-banner ei-banner-warning' }, 'Tin này không còn hiển thị công khai (trạng thái: ' + job.status + ').'));
}
