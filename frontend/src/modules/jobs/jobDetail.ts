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
import { setIconText } from './jobSearch';

const sectionByHeading = (re: RegExp) =>
  [...document.querySelectorAll<HTMLElement>('main section')].find(s => re.test(s.querySelector('h2')?.textContent || ''));

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
  const headerImg = h1.closest('div')?.parentElement?.querySelector('img');
  if (headerImg && company) { headerImg.src = publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name); headerImg.alt = company.name; }
  const meta = h1.nextElementSibling;
  const metaSpans = meta ? ([...meta.children] as HTMLElement[]).filter(s => s.querySelector('.material-symbols-outlined')) : [];
  setIconText(metaSpans[0], (company?.name ?? '') + (company?.verification_status === 'verified' ? ' ✓' : ''));
  setIconText(metaSpans[1], [job.address, job.city].filter(Boolean).join(', ') || 'Toàn quốc');
  setIconText(metaSpans[2], `${scheduleLabel[job.schedule] ?? job.schedule} · ${workTypeLabel[job.work_type] ?? job.work_type}`);
  const badges = meta?.nextElementSibling;
  if (badges) {
    const [posted, stipend] = [...badges.children] as HTMLElement[];
    if (posted) posted.textContent = job.published_at ? `Đăng ${relativeTime(job.published_at)}` : 'Mới đăng';
    setIconText(stipend, `${formatStipend(job.stipend_min, job.stipend_max)}/tháng`);
    if (currentRole() === 'student') {
      matchScore(job.id).then(score => {
        if (score == null || !posted) return;
        const chip = posted.cloneNode(true) as HTMLElement;
        chip.textContent = `${score}% phù hợp với hồ sơ của bạn`;
        badges.append(chip);
      }).catch(() => {});
    }
  }
}

function fillSections(job: JobDetail) {
  const about = sectionByHeading(/Về Vị Trí/i);
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
    if (job.benefits) benefits.append(el('p', { className: 'ei-muted', style: 'white-space:pre-line;margin-top:12px' } as never, job.benefits));
    if (!perks.length && !job.benefits) benefits.hidden = true;
  }

  const deadline = [...document.querySelectorAll('main p')].find(p => /Hạn chót ứng tuyển/.test(p.textContent || ''));
  if (deadline) deadline.textContent = job.deadline ? `Hạn chót ứng tuyển: ${formatDate(job.deadline)}` : 'Đang nhận hồ sơ';
}

function fillSidebar(job: JobDetail) {
  const company = job.company;
  const aside = document.querySelector('main aside');
  if (!aside || !company) return;
  const widget = aside.firstElementChild as HTMLElement;
  setIconText(widget.querySelector('h3'), `Về ${company.name}`);
  const logo = widget.querySelector('img');
  if (logo) { logo.src = publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name); logo.alt = company.name; }
  const description = widget.querySelector('p');
  if (description) description.textContent = company.description || 'Doanh nghiệp chưa cập nhật giới thiệu.';
  const link = widget.querySelector<HTMLAnchorElement>('a');
  if (link) { link.href = companyHref(company.id); link.dataset.appControl = 'company-link'; }
  const facts: Record<string, string> = {
    'Quy mô:': company.company_size ? `${company.company_size} nhân viên` : '—',
    'Lĩnh vực:': (company.industry as { name: string } | null)?.name ?? '—',
    'Thành lập:': company.founded_year ? String(company.founded_year) : '—',
  };
  widget.querySelectorAll('span').forEach(span => {
    const value = facts[span.textContent?.trim() || ''];
    if (value && span.nextElementSibling) span.nextElementSibling.textContent = value;
  });
  const address = [job.address, job.city].filter(Boolean).join(', ') || company.address || company.city || '';
  const map = aside.querySelector<HTMLElement>('[data-location]');
  if (map) map.dataset.location = address;
  const mapText = map?.parentElement?.querySelector(':scope > p');
  if (mapText) mapText.textContent = address || 'Doanh nghiệp chưa cập nhật địa chỉ.';
}

async function fillSimilar(job: JobDetail) {
  const heading = [...document.querySelectorAll('main aside h3')].find(h => /tương tự/i.test(h.textContent || ''));
  const box = heading?.nextElementSibling as HTMLElement | null;
  const template = box?.querySelector('a');
  if (!box || !template) return;
  const more = heading?.parentElement?.querySelector<HTMLButtonElement>(':scope > button');
  if (more) bind(more, () => location.assign(job.industry_id ? `/?industry=${job.industry_id}` : routes.jobs));
  try {
    const rows = await searchJobs({ p_industry_id: job.industry_id ?? undefined, p_exclude_job: job.id, p_limit: 3, p_sort: 'newest' });
    if (!rows.length) { box.replaceChildren(el('p', { className: 'ei-muted' }, 'Chưa có công việc tương tự.')); return; }
    box.replaceChildren(...rows.map(row => {
      const a = template.cloneNode(true) as HTMLAnchorElement;
      a.href = jobHref(row.id); a.dataset.appControl = 'similar-job';
      a.querySelector('h4')!.textContent = row.title;
      const spans = a.querySelectorAll('div span');
      if (spans[0]) spans[0].textContent = row.company_name;
      if (spans[2]) spans[2].textContent = row.work_type === 'remote' ? 'Remote' : row.city ?? '';
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
    const render = () => { save.setAttribute('aria-pressed', String(active)); save.querySelector('span')!.textContent = active ? 'bookmark' : 'bookmark_border'; };
    if (currentRole() === 'student') savedJobIds().then(ids => { active = ids.has(job.id); render(); }).catch(() => {});
    bind(save, async () => {
      if (!requireSignIn() || currentRole() !== 'student') return;
      try { await setJobSaved(job.id, !active); active = !active; render(); } catch (error) { showError(error); }
    });
  }

  // "Về Công Ty" tab → company page
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    if (/^Về Công Ty$/i.test(label(b)) && job.company) bind(b, () => location.assign(companyHref(job.company!.id)));
  });

  // Report (guests allowed, BR-37)
  const deadlineBox = [...document.querySelectorAll('main p')].find(p => /Hạn chót ứng tuyển|Đang nhận hồ sơ/.test(p.textContent || ''))?.closest('div')?.parentElement;
  const report = el('button', { type: 'button', className: 'ei-button', 'aria-label': 'Báo cáo tin tuyển dụng' }, 'Báo cáo tin tuyển dụng');
  bind(report, () => reportContent(job.title, { type: 'job', id: job.id }));
  deadlineBox?.after(el('div', { className: 'ei-actions', style: 'margin-top:12px' } as never, report));
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
  await fillSimilar(job);
  if (job.status === 'active') void recordView(job.id);
  else main.prepend(el('div', { className: 'ei-banner ei-banner-warning', style: 'margin:80px auto 0;max-width:1200px' } as never, 'Tin này không còn hiển thị công khai (trạng thái: ' + job.status + ').'));
}
