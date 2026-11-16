// Home page: the job list comes from search_jobs (keyword, city, industry, stipend, work type,
// schedule, quick chips, sort, pagination). Rows are clones of the design's first `article.jobs-row`
// (one card, hairline rows: logo, title link, company, place, meta, deadline clock, save).
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
const DAY = 86_400_000;

/** Replace an element's text while keeping its icon ligature span. */
export function setIconText(el: Element | null | undefined, text: string) {
  if (!el) return;
  const icon = el.querySelector('.material-symbols-outlined');
  el.replaceChildren(...(icon ? [icon, document.createTextNode(` ${text}`)] : [document.createTextNode(text)]));
}

/** The deadline clock (DESIGN.md §6): "Còn N ngày", signal colour at ≤3 days. Null when there is no future deadline. */
export function deadlineClock(deadline: string | null | undefined) {
  if (!deadline) return null;
  const end = new Date(deadline); end.setHours(23, 59, 59, 999);
  const days = Math.floor((end.getTime() - Date.now()) / DAY);
  if (days < 0) return null;
  const clock = document.createElement('span');
  clock.className = `ui-deadline${days <= 3 ? ' is-soon' : ''}`;
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = 'schedule';
  clock.append(icon, days === 0 ? 'Hạn chót hôm nay' : `Còn ${days} ngày`);
  return clock;
}

/** Skeleton rows shaped like job rows (logo square, title bar, two text lines) while a list loads. */
export function skeletonRows(count = 3) {
  return Array.from({ length: count }, () => {
    const row = document.createElement('div');
    row.className = 'jobs-skeleton-row'; row.setAttribute('aria-hidden', 'true');
    row.innerHTML = '<span class="ui-skeleton ui-skeleton--logo"></span><span class="jobs-skeleton-row__body"><span class="ui-skeleton ui-skeleton--title"></span><span class="ui-skeleton ui-skeleton--text" style="width:40%"></span><span class="ui-skeleton ui-skeleton--text" style="width:65%"></span></span>';
    return row;
  });
}

type Chip = '' | 'urgent' | 'salary' | 'school' | 'graduate' | 'remote';

export async function setupJobs() {
  const articles = [...document.querySelectorAll<HTMLElement>('main article')];
  const host = articles[0]?.parentElement;
  if (!host) return;
  const template = articles[0].cloneNode(true) as HTMLElement;
  articles.forEach(a => a.remove());
  const list = document.createElement('div');
  list.className = 'ui-list';
  list.id = 'job-results';
  list.setAttribute('aria-live', 'polite');
  host.prepend(list);

  // Mobile (<768px): the filter cards collapse behind a "Bộ lọc" pill
  const filterToggle = document.querySelector<HTMLButtonElement>('.jobs-filter-toggle');
  bind(filterToggle, () => {
    const open = filterToggle!.getAttribute('aria-expanded') !== 'true';
    filterToggle!.setAttribute('aria-expanded', String(open));
    filterToggle!.closest('aside')?.classList.toggle('is-open', open);
  });

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
    const link = title.querySelector('a');
    if (link) { link.textContent = job.title; link.href = jobHref(job.id); }
    else title.textContent = job.title;
    const company = card.querySelector('.jobs-row__company');
    if (company) company.textContent = job.company_name + (job.company_verified ? ' ✓' : '');
    const place = card.querySelector('.jobs-row__place');
    if (place) place.textContent = `${job.city ?? 'Toàn quốc'} · ${workTypeLabel[job.work_type] ?? job.work_type}`;
    const meta = card.querySelector('.jobs-row__meta');
    if (meta) {
      const item = (text: string, className = '') => { const s = document.createElement('span'); s.textContent = text; if (className) s.className = className; return s; };
      // Match score: hidden below 30, neutral 30–69, success green from 70 (0% is not a selling point)
      const score = job.match_score;
      const match = score == null || score < 30 ? null
        : item(`${score}% phù hợp`, score >= 70 ? 'jobs-row__match' : 'jobs-row__match jobs-row__match--mid');
      meta.replaceChildren(
        item(formatStipend(job.stipend_min, job.stipend_max), 'jobs-row__stipend'),
        ...(match && currentRole() === 'student' ? [match] : []),
        item(`Đăng ${relativeTime(job.published_at)}`),
      );
    }
    const foot = card.querySelector('.jobs-row__foot');
    if (foot) {
      const chip = (text: string, variant: string) => { const c = document.createElement('span'); c.className = `ui-chip ${variant}`; c.textContent = text; return c; };
      const clock = deadlineClock(job.deadline);
      // "Tuyển gấp" only for 4–7 days left: at ≤3 days the signal-coloured clock already says it (one urgency marker per row)
      const urgent = !!job.deadline && new Date(job.deadline).getTime() - Date.now() < 7 * DAY && !clock?.classList.contains('is-soon');
      const parts: HTMLElement[] = [];
      if (urgent) parts.push(chip('Tuyển gấp', 'ui-chip--signal'));
      else if (job.is_exclusive) parts.push(chip('Dành riêng cho trường', 'ui-chip--neutral'));
      if (clock) parts.push(clock);
      if (job.skills.length) { const s = document.createElement('span'); s.className = 'jobs-row__skills'; s.textContent = job.skills.slice(0, 3).join(' · '); parts.push(s); }
      foot.replaceChildren(...parts);
      (foot as HTMLElement).hidden = !parts.length;
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
    // The title is a real link; a click anywhere else on the row opens the job too
    bind(card, () => location.assign(jobHref(job.id)));
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
    list.setAttribute('aria-busy', 'true');
    list.replaceChildren(...skeletonRows(3));
    try {
      const rows = await searchJobs(args());
      if (mine !== token) return;
      list.removeAttribute('aria-busy');
      const total = Number(rows[0]?.total_count ?? 0);
      if (count) count.textContent = total.toLocaleString('vi-VN');
      if (!rows.length) {
        showState(list, 'empty', 'Không có vị trí phù hợp. Hãy thay đổi hoặc thiết lập lại bộ lọc.');
        const block = list.firstElementChild;
        if (block instanceof HTMLElement) emptyHelp(block);
      } else list.replaceChildren(...rows.map(fillCard));
      renderPager(total);
      const caption = range?.previousElementSibling?.lastElementChild;
      if (caption) caption.textContent = `Từ ${range!.value} triệu / tháng`;
      const url = new URL(location.href);
      for (const [k, v] of [['q', keyword?.value.trim()], ['city', city?.value.trim()], ['industry', industry.value]] as const) v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
      history.replaceState(null, '', url);
      if (scroll) document.querySelector('main')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      if (mine !== token) return;
      list.removeAttribute('aria-busy');
      showState(list, 'error', undefined, () => void render());
      showError(error);
    }
  }

  const restart = () => { page = 1; void render(); };

  /** "Thiết lập lại": clear the keyword, city and every filter, then re-run the search. */
  function resetFilters() {
    if (keyword) keyword.value = ''; if (city) city.value = '';
    checks.forEach(c => { c.checked = false; }); industry.value = ''; if (range) range.value = '0'; chip = '';
    quickButtons.forEach(b => { const all = /^Tất cả$/.test(label(b)); b.classList.remove('demo-selected'); b.setAttribute('aria-pressed', String(all)); });
    restart();
  }

  /** Empty-state help: a reset button and three suggested searches (buttons, not links). */
  function emptyHelp(host: HTMLElement) {
    const actions = document.createElement('div');
    actions.className = 'jobs-empty-actions';
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'ui-btn ui-btn--neutral ui-btn--sm'; reset.textContent = 'Xóa từ khóa và bộ lọc';
    bind(reset, resetFilters);
    const suggest = document.createElement('div');
    suggest.className = 'jobs-empty-suggest';
    const hint = document.createElement('span');
    hint.className = 'jobs-empty-suggest__label'; hint.textContent = 'Thử tìm:';
    const pills = document.createElement('div');
    pills.className = 'ui-pills';
    ['Frontend', 'Marketing', 'Data'].forEach(term => {
      const pill = document.createElement('button');
      pill.type = 'button'; pill.className = 'ui-pill'; pill.textContent = term;
      bind(pill, () => { if (keyword) keyword.value = term; restart(); });   // same as the "Tìm kiếm" submit
      pills.append(pill);
    });
    suggest.append(hint, pills);
    actions.append(reset, suggest);
    host.append(actions);
  }

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
  bind([...document.querySelectorAll('button')].find(b => label(b) === 'Thiết lập lại'), resetFilters);
  if (prev) bind(prev, () => { if (page > 1) { page--; void render(true); } });
  if (next) bind(next, () => { page++; void render(true); });
  const compact = document.querySelector<HTMLButtonElement>('button[title="Chế độ danh sách"]');
  bind(compact, () => compact!.setAttribute('aria-pressed', String(list.classList.toggle('jobs-compact'))));

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
