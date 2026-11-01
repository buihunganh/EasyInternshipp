// Home page: the job list comes from search_jobs (keyword, city, industry, stipend, work type,
// schedule, quick chips, sort, pagination). Cards are clones of the design's first card.
import { isSignedIn, requireSignIn } from '../../core/auth';
import { jobHref, label } from '../../core/navigation';
import { bind } from '../../core/ui/actions';
import { currentRole } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { savedJobIds, setJobSaved } from '../../core/accountApi';
import { showError } from '../../core/errors';
import { formatStipend, relativeTime, workTypeLabel } from '../../core/format';
import { showState } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { createJobAlert, listIndustries, searchJobs, type JobHit } from './api';
import { toast } from '../../core/ui/feedback';

const PAGE_SIZE = 5;

/** Replace an element's text while keeping its icon ligature span. */
export function setIconText(el: Element | null | undefined, text: string) {
  if (!el) return;
  const icon = el.querySelector('.material-symbols-outlined');
  el.replaceChildren(...(icon ? [icon, document.createTextNode(` ${text}`)] : [document.createTextNode(text)]));
}

type Chip = '' | 'urgent' | 'salary' | 'school' | 'graduate' | 'remote';

export async function setupJobs() {
  const articles = [...document.querySelectorAll<HTMLElement>('main article')];
  const host = articles[0]?.parentElement;
  if (!host) return;
  const template = articles[0].cloneNode(true) as HTMLElement;
  template.querySelector(':scope > .absolute')?.remove();   // the static "Nổi bật" ribbon
  const chipTemplate = template.querySelector<HTMLElement>('.border-t span');
  const perkTemplate = [...template.querySelectorAll<HTMLElement>('.border-t span')].find(s => s.classList.contains('bg-surface-container')) ?? chipTemplate;
  articles.forEach(a => a.remove());
  const list = document.createElement('div');
  list.className = 'flex flex-col gap-md';
  list.id = 'job-results';
  host.prepend(list);

  const form = document.querySelector<HTMLFormElement>('form')!;
  const [keyword, city] = [...form.querySelectorAll<HTMLInputElement>('input')];
  const selects = [...document.querySelectorAll<HTMLSelectElement>('select')];
  const industry = selects[0], sort = selects[1];
  const checks = [...document.querySelectorAll<HTMLInputElement>('aside input[type=checkbox]')];
  const checkFor = (re: RegExp) => checks.find(c => re.test(c.closest('label')?.textContent || c.parentElement?.textContent || ''));
  const filters = {
    graduate: checkFor(/tốt nghiệp/i), part: checkFor(/Bán thời gian|Part-time/i), full: checkFor(/Toàn thời gian|Full-time/i),
    onsite: checkFor(/On-site|Tại văn phòng/i), hybrid: checkFor(/Hybrid/i), remote: checkFor(/Remote|Từ xa/i),
  };
  const range = document.querySelector<HTMLInputElement>('input[type=range]');
  const count = document.querySelector('main h2 span') ?? document.querySelector('h2 span');
  const pageButtons = [...document.querySelectorAll<HTMLButtonElement>('main button')].filter(b => /^\d+$/.test(label(b)) || /chevron_(left|right)/.test(b.textContent || ''));
  const prev = pageButtons.find(b => /chevron_left/.test(b.textContent || ''));
  const next = pageButtons.find(b => /chevron_right/.test(b.textContent || ''));
  const numberTemplate = pageButtons.find(b => /^\d+$/.test(label(b)))?.cloneNode(true) as HTMLButtonElement | undefined;
  const pager = prev?.parentElement;
  pageButtons.filter(b => b !== prev && b !== next).forEach(b => b.remove());
  pager?.querySelectorAll('span:not(.material-symbols-outlined)').forEach(s => { if (s.textContent?.trim() === '...') s.remove(); });
  const quickButtons = [...document.querySelectorAll<HTMLButtonElement>('section button')].filter(b => b.type !== 'submit' || !b.form);

  // Industries from the database
  try {
    const industries = await listIndustries();
    industry.replaceChildren(new Option('Tất cả chuyên ngành', ''), ...industries.map(i => new Option(i.name, String(i.id))));
  } catch (error) { showError(error); }
  sort.replaceChildren(...[['relevance', currentRole() === 'student' ? 'Phù hợp nhất với bạn' : 'Liên quan nhất'], ['newest', 'Mới nhất'], ['stipend', 'Phụ cấp (Cao đến thấp)'], ['views', 'Được xem nhiều nhất']]
    .map(([v, t]) => new Option(t, v)));
  checks.forEach(c => { c.checked = false; });
  if (range) { range.min = '0'; range.max = '20'; range.value = '0'; range.setAttribute('aria-label', 'Phụ cấp tối thiểu (triệu đồng)'); }

  // Restore from the URL (?q=&city=&industry=)
  const params = new URLSearchParams(location.search);
  if (keyword) keyword.value = params.get('q') ?? '';
  if (city) city.value = params.get('city') ?? '';
  industry.value = params.get('industry') ?? '';

  let chip: Chip = '';
  let page = 1;
  let saved = new Set<string>();
  let token = 0;

  function args() {
    const workTypes = [filters.onsite?.checked && 'onsite', filters.hybrid?.checked && 'hybrid', filters.remote?.checked && 'remote', chip === 'remote' && 'remote', chip === 'remote' && 'hybrid'].filter(Boolean) as ('onsite' | 'hybrid' | 'remote')[];
    const schedules = [filters.part?.checked && 'part_time', filters.full?.checked && 'full_time'].filter(Boolean) as ('part_time' | 'full_time')[];
    const minStipend = Math.max(Number(range?.value || 0), chip === 'salary' ? 8 : 0) * 1_000_000;
    const sortValue = sort.value === 'relevance' && currentRole() === 'student' && !keyword?.value.trim() ? 'match' : sort.value;
    return {
      p_query: keyword?.value.trim() || undefined, p_city: city?.value.trim() || undefined,
      p_industry_id: industry.value ? Number(industry.value) : undefined,
      p_min_stipend: minStipend || undefined, p_sort: sortValue,
      p_work_types: workTypes.length ? [...new Set(workTypes)] : undefined,
      p_schedules: schedules.length ? schedules : undefined,
      p_urgent: chip === 'urgent' || undefined,
      p_final_year: chip === 'graduate' || filters.graduate?.checked || undefined,
      p_university_codes: chip === 'school' ? ['HCMUT', 'HUST', 'UIT', 'HCMUS', 'DUT'] : undefined,
      p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE,
    };
  }

  function fillCard(job: JobHit) {
    const card = template.cloneNode(true) as HTMLElement;
    card.dataset.jobId = job.id;
    card.dataset.demoClick = 'job';
    const img = card.querySelector('img');
    if (img) { img.src = publicUrl('company-assets', job.company_logo_path) || initialsAvatar(job.company_name); img.alt = job.company_name; }
    const title = card.querySelector('h3')!;
    title.textContent = job.title;
    const meta = card.querySelector('h3')!.parentElement!.nextElementSibling!;
    const spans = [...meta.children] as HTMLElement[];
    if (spans[0]) spans[0].textContent = job.company_name + (job.company_verified ? ' ✓' : '');
    setIconText(spans[2], `${job.city ?? 'Toàn quốc'} · ${workTypeLabel[job.work_type] ?? job.work_type}`);
    setIconText(spans[4], formatStipend(job.stipend_min, job.stipend_max));
    const excerpt = card.querySelector('p');
    if (excerpt) excerpt.textContent = job.excerpt;
    const tags = card.querySelector('.border-t');
    if (tags && chipTemplate) {
      const posted = tags.lastElementChild!.cloneNode(true) as HTMLElement;
      posted.textContent = `Đăng ${relativeTime(job.published_at)}`;
      const chips: HTMLElement[] = [];
      const add = (text: string, base: HTMLElement) => { const c = base.cloneNode(true) as HTMLElement; c.textContent = text; chips.push(c); };
      if (job.match_score != null && currentRole() === 'student') add(`${job.match_score}% phù hợp`, chipTemplate);
      if (job.is_exclusive) add('Dành riêng cho trường', perkTemplate!);
      if (job.deadline && new Date(job.deadline).getTime() - Date.now() < 7 * 86400000) add('🔥 Tuyển gấp', perkTemplate!);
      job.skills.slice(0, 3).forEach(s => add(s, chipTemplate));
      (job.perks ?? []).slice(0, 2).forEach(p => add(p, perkTemplate!));
      tags.replaceChildren(...chips, posted);
    }
    const save = card.querySelector<HTMLButtonElement>('button[title="Lưu công việc"]');
    if (save) {
      const renderSave = () => {
        const active = saved.has(job.id);
        save.setAttribute('aria-pressed', String(active));
        save.setAttribute('aria-label', active ? `Bỏ lưu ${job.title}` : `Lưu ${job.title}`);
        save.querySelector('span')!.textContent = active ? 'bookmark' : 'bookmark_border';
      };
      bind(save, async () => {
        if (!requireSignIn()) return;
        if (currentRole() !== 'student') return;
        const next = !saved.has(job.id);
        try { await setJobSaved(job.id, next); next ? saved.add(job.id) : saved.delete(job.id); renderSave(); }
        catch (error) { showError(error); }
      });
      renderSave();
    }
    const open = () => location.assign(jobHref(job.id));
    title.tabIndex = 0; title.setAttribute('role', 'link');
    title.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    bind(card, open);
    return card;
  }

  function renderPager(total: number) {
    if (!pager || !numberTemplate) return;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pager.querySelectorAll('[data-page-number]').forEach(b => b.remove());
    const first = Math.max(1, Math.min(page - 2, pages - 4));
    for (let n = first; n <= Math.min(pages, first + 4); n++) {
      const b = numberTemplate.cloneNode(true) as HTMLButtonElement;
      b.textContent = String(n); b.dataset.pageNumber = String(n);
      b.setAttribute('aria-current', n === page ? 'page' : 'false');
      b.classList.toggle('demo-selected', n === page);
      b.setAttribute('aria-label', `Trang ${n}`);
      bind(b, () => { page = n; void render(true); });
      next ? pager.insertBefore(b, next) : pager.append(b);
    }
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= pages;
    pager.hidden = total <= PAGE_SIZE;
  }

  async function render(scroll = false) {
    const mine = ++token;
    showState(list, 'loading');
    try {
      const rows = await searchJobs(args());
      if (mine !== token) return;
      const total = Number(rows[0]?.total_count ?? 0);
      if (count) count.textContent = total.toLocaleString('vi-VN');
      if (!rows.length) showState(list, 'empty', 'Không có vị trí phù hợp. Hãy thay đổi hoặc thiết lập lại bộ lọc.');
      else list.replaceChildren(...rows.map(fillCard));
      renderPager(total);
      const caption = range?.previousElementSibling?.lastElementChild;
      if (caption) caption.textContent = `Từ ${range!.value} triệu / tháng`;
      const url = new URL(location.href);
      for (const [k, v] of [['q', keyword?.value.trim()], ['city', city?.value.trim()], ['industry', industry.value]] as const) v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
      history.replaceState(null, '', url);
      if (scroll) document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      if (mine !== token) return;
      showState(list, 'error', undefined, () => void render());
      showError(error);
    }
  }

  const restart = () => { page = 1; void render(); };
  form.addEventListener('submit', e => { e.preventDefault(); restart(); });
  [...checks, industry, sort].forEach(el => el.addEventListener('change', restart));
  let debounce = 0;
  range?.addEventListener('input', () => { clearTimeout(debounce); debounce = window.setTimeout(restart, 300); });
  quickButtons.forEach(b => bind(b, () => {
    const text = label(b);
    chip = /Tuyển gấp/.test(text) ? 'urgent' : /Remote/.test(text) ? 'remote' : /Phụ cấp/.test(text) ? 'salary' : /ĐHQG/.test(text) ? 'school' : /tốt nghiệp/.test(text) ? 'graduate' : '';
    quickButtons.forEach(x => { x.setAttribute('aria-pressed', String(x === b)); x.classList.toggle('demo-selected', x === b); });
    restart();
  }));
  bind([...document.querySelectorAll('button')].find(b => label(b) === 'Thiết lập lại'), () => {
    if (keyword) keyword.value = ''; if (city) city.value = '';
    checks.forEach(c => { c.checked = false; }); industry.value = ''; if (range) range.value = '0'; chip = '';
    quickButtons.forEach(b => { b.classList.remove('demo-selected'); b.setAttribute('aria-pressed', 'false'); });
    restart();
  });
  if (prev) bind(prev, () => { if (page > 1) { page--; void render(true); } });
  if (next) bind(next, () => { page++; void render(true); });
  bind(document.querySelector('button[title="Chế độ danh sách"]'), () => document.querySelector('main')?.classList.toggle('demo-compact'));

  // "Nhận tin việc làm mới": a real job alert built from the current search (managed on My Applications)
  const alertButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => /Bật thông báo ngay/.test(label(b)));
  if (alertButton) {
    const email = alertButton.parentElement?.querySelector<HTMLInputElement>('input');
    if (email) email.hidden = true;   // notifications go to the account's own e-mail and bell
    bind(alertButton, async () => {
      if (!requireSignIn()) return;
      if (currentRole() !== 'student') { toast('Thông báo việc làm dành cho tài khoản sinh viên.'); return; }
      const q = keyword?.value.trim() || null, c = city?.value.trim() || null;
      const industryName = industry.selectedIndex > 0 ? industry.selectedOptions[0].text : '';
      try {
        await createJobAlert({ name: [q, c, industryName].filter(Boolean).join(' · ') || 'Tất cả việc làm mới', keywords: q, city: c, industry_id: industry.value ? Number(industry.value) : null });
        toast('Đã bật thông báo việc làm theo bộ lọc hiện tại. Quản lý trong "Đơn ứng tuyển" → Thông báo việc làm.');
      } catch (error) { showError(error); }
    });
  }

  if (isSignedIn() && currentRole() === 'student') saved = await savedJobIds().catch(() => new Set<string>());
  window.addEventListener('saved-jobs-changed', e => {
    const { jobId, saved: on } = (e as CustomEvent<{ jobId: string; saved: boolean }>).detail;
    on ? saved.add(jobId) : saved.delete(jobId);
  });
  await render();
}
