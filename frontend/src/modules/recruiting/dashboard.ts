// Employer dashboard (Phase 5, updated Phase 7): own jobs with status, counts and lifecycle actions; KPI tiles;
// today's interviews; AI top matching candidates; talent search dialog.
import { flash } from '../../core/auth';
import { label, routes, jobHref } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, csv, value } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import { formatDateTime, formatStipend, jobStatusLabel, relativeTime, verifyStatusLabel, workTypeLabel } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { publicUrl } from '../../core/supabase';
import {
  applicationStats, changeJobStatus, companyJobs, deleteDraft, duplicateJob, myCompany,
  searchCandidates, startConversation, submitJob, todayInterviews,
  type DashboardJob, type MyCompany,
} from './api';

type Stat = { job_id: string; status: string; applied_at: string };
const iconText = (el: Element | null | undefined, text: string) => {
  if (!el) return;
  const icon = el.querySelector('.material-symbols-outlined');
  el.replaceChildren(...(icon ? [icon, document.createTextNode(` ${text}`)] : [document.createTextNode(text)]));
};

function renderHeader(company: MyCompany) {
  const h1 = document.querySelector('main h1');
  if (h1) h1.textContent = `Trung tâm Tuyển dụng ${company.name}`;
  const eyebrow = h1?.previousElementSibling;
  if (eyebrow) iconText(eyebrow, `Doanh nghiệp: ${verifyStatusLabel[company.verification_status]}`);
  const intro = h1?.nextElementSibling;
  if (company.verification_status !== 'verified' && intro) {
    const text = company.verification_status === 'pending'
      ? 'Hồ sơ doanh nghiệp đang chờ quản trị viên thẩm định. Bạn có thể soạn tin nháp; tin chỉ được gửi duyệt sau khi doanh nghiệp được xác thực.'
      : `Doanh nghiệp chưa được xác thực${company.verification_note ? ` (${company.verification_note})` : ''}. Hoàn thiện mã số thuế và giấy phép kinh doanh để bắt đầu đăng tin.`;
    intro.after(el('div', { className: 'ei-banner ei-banner-warning', role: 'status', style: 'margin-top:12px' } as never,
      el('span', {}, text, ' ', el('a', { href: routes['company-settings'] }, 'Mở hồ sơ doanh nghiệp →'))));
  }
}

function renderKpis(jobs: DashboardJob[], stats: Stat[], interviewsToday: number) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const active = jobs.filter(j => j.status === 'active').length;
  const newToday = stats.filter(s => new Date(s.applied_at) >= today).length;
  const interviewing = stats.filter(s => s.status === 'interviewing').length;
  const offered = stats.filter(s => s.status === 'offered').length;
  const hired = stats.filter(s => s.status === 'hired').length;
  const tiles: [string, string, string][] = [
    [String(active), 'vị trí mở', `${jobs.filter(j => j.status === 'pending_approval').length} tin chờ duyệt`],
    [String(stats.length), 'hồ sơ', `+${newToday} hồ sơ mới hôm nay`],
    [String(interviewing), 'ứng viên', `${interviewsToday} ca phỏng vấn hôm nay`],
    [String(offered + hired), 'ứng viên', `${hired} ứng viên đã chấp thuận`],
  ];
  const kpiCards = [...document.querySelectorAll('main section')][0]?.querySelectorAll(':scope > div:last-child > div') ?? [];
  [...kpiCards].forEach((card, i) => {
    const [value, unit, foot] = tiles[i] ?? [];
    const rows = [...card.children];
    const numbers = rows[1]?.children;
    if (numbers?.length) { numbers[0].textContent = value; if (numbers[1]) numbers[1].textContent = unit; }
    const footText = rows[2]?.querySelector('span:not(.material-symbols-outlined)');
    if (footText) footText.textContent = foot;
  });
}

const statusFilters: [string, string, (j: DashboardJob) => boolean][] = [
  ['all', 'Tất cả', () => true],
  ['active', 'Đang nhận đơn', j => j.status === 'active'],
  ['pending_approval', 'Chờ duyệt', j => j.status === 'pending_approval'],
  ['paused', 'Tạm dừng', j => j.status === 'paused'],
  ['draft', 'Bản nháp', j => j.status === 'draft' || j.status === 'rejected'],
  ['closed', 'Đã đóng', j => j.status === 'closed' || j.status === 'expired'],
];

export async function setupDashboard() {
  const company = await myCompany().catch(error => { showError(error); return null; });
  if (!company) { flash('Hãy tạo hồ sơ doanh nghiệp trước khi đăng tin.'); location.replace(routes['company-settings']); return; }
  renderHeader(company);

  // Header actions
  document.querySelectorAll<HTMLButtonElement>('main section button').forEach(b => {
    const text = label(b);
    if (/^Đăng tin tuyển dụng$/.test(text)) bind(b, () => location.assign(routes['post-job']));
    if (/Tìm kiếm hồ sơ sinh viên/.test(text)) bind(b, () => openTalentSearch(company.id));
  });

  const jobSection = document.querySelectorAll('main section')[1] as HTMLElement;
  const toolbar = jobSection.firstElementChild as HTMLElement;
  const list = toolbar.nextElementSibling as HTMLElement;
  const template = list.firstElementChild!.cloneNode(true) as HTMLElement;
  const tabBar = toolbar.querySelector('button')!.parentElement as HTMLElement;
  const activeTab = tabBar.children[0].cloneNode(true) as HTMLButtonElement;
  const idleTab = (tabBar.children[1] ?? tabBar.children[0]).cloneNode(true) as HTMLButtonElement;
  const search = toolbar.querySelector<HTMLInputElement>('input');
  const department = toolbar.querySelector<HTMLSelectElement>('select');
  const toolButtons = [...toolbar.querySelectorAll<HTMLButtonElement>(':scope > div:first-child > div:last-child button')];
  toolButtons.filter(b => /Đồng bộ/.test(label(b))).forEach(b => { b.hidden = true; });
  let filter = 'all';

  let jobs: DashboardJob[] = [];
  let stats: Stat[] = [];

  async function load() {
    list.replaceChildren(stateBlock('loading'));
    try {
      jobs = await companyJobs(company!.id);
      stats = await applicationStats(jobs.map(j => j.id));
      const interviews = await todayInterviews(company!.id).catch(() => []);
      renderKpis(jobs, stats, interviews.length);
      renderInterviews(interviews);
      void renderTalentMatching(company!.id);
      if (department) {
        const departments = [...new Set(jobs.map(j => j.department).filter(Boolean))] as string[];
        const current = department.value;
        department.replaceChildren(new Option('Tất cả phòng ban', ''), ...departments.map(d => new Option(`${d} (${jobs.filter(j => j.department === d).length})`, d)));
        department.value = departments.includes(current) ? current : '';
      }
      render();
    } catch (error) {
      list.replaceChildren(stateBlock('error', undefined, () => void load()));
      showError(error);
    }
  }

  function renderTabs() {
    tabBar.replaceChildren(...statusFilters.map(([key, name, test]) => {
      const tab = (key === filter ? activeTab : idleTab).cloneNode(true) as HTMLButtonElement;
      const [text, count] = [...tab.querySelectorAll('span')];
      if (text) text.textContent = name;
      if (count) count.textContent = String(jobs.filter(test).length);
      tab.setAttribute('aria-pressed', String(key === filter));
      bind(tab, () => { filter = key; render(); });
      return tab;
    }));
  }

  function card(job: DashboardJob) {
    const c = template.cloneNode(true) as HTMLElement;
    c.dataset.jobId = job.id;
    const tags = c.querySelector('h2')?.previousElementSibling;
    const [status, dept, posted] = tags ? [...tags.children] as HTMLElement[] : [];
    if (status) status.replaceChildren(el('span', { className: `ei-chip ei-chip-${job.status}` }, jobStatusLabel[job.status] ?? job.status));
    if (dept) dept.textContent = job.department || 'Chưa chọn phòng ban';
    iconText(posted, job.published_at ? `Đăng ${relativeTime(job.published_at)}` : `Tạo ${relativeTime(job.created_at)}`);
    c.querySelector('h2')!.textContent = job.title;
    const meta = c.querySelector('h2')?.nextElementSibling;
    const [loc, pay, heads] = meta ? [...meta.children] as HTMLElement[] : [];
    iconText(loc, `${job.city ?? job.address ?? 'Chưa có địa chỉ'} · ${workTypeLabel[job.work_type] ?? job.work_type}`);
    iconText(pay, `${formatStipend(job.stipend_min, job.stipend_max)}/tháng`);
    iconText(heads, `Cần tuyển: ${job.openings} SV`);
    if (job.status === 'rejected' && job.rejection_reason) {
      meta?.after(el('div', { className: 'ei-banner ei-banner-danger', style: 'margin-top:8px' } as never, `Lý do từ chối: ${job.rejection_reason}`));
    }

    const actionsBox = c.querySelector('button[title="Sao chép tin"]')?.parentElement as HTMLElement | null;
    const iconTemplate = actionsBox?.firstElementChild as HTMLButtonElement | null;
    if (actionsBox && iconTemplate) {
      const make = (icon: string, title: string, run: () => void) => {
        const b = iconTemplate.cloneNode(true) as HTMLButtonElement;
        b.title = title; b.setAttribute('aria-label', `${title}: ${job.title}`);
        b.querySelector('.material-symbols-outlined')!.textContent = icon;
        bind(b, run); return b;
      };
      const act = (fn: () => Promise<unknown>, done: string) => async () => { try { await fn(); toast(done); await load(); } catch (error) { showError(error); } };
      const buttons: HTMLButtonElement[] = [make('content_copy', 'Sao chép tin', act(() => duplicateJob(job.id), 'Đã tạo bản sao ở dạng nháp.'))];
      if (job.status === 'active') buttons.push(make('pause_circle', 'Tạm dừng nhận đơn', act(() => changeJobStatus(job.id, 'paused'), 'Đã tạm dừng nhận đơn.')));
      if (job.status === 'paused') buttons.push(make('play_circle', 'Mở lại nhận đơn', act(() => changeJobStatus(job.id, 'active'), 'Đã mở lại nhận đơn.')));
      if (['draft', 'rejected'].includes(job.status)) buttons.push(make('send', 'Gửi duyệt', act(() => submitJob(job.id), 'Đã gửi tin để quản trị viên duyệt.')));
      if (job.status === 'pending_approval') buttons.push(make('undo', 'Rút về bản nháp', act(() => changeJobStatus(job.id, 'draft'), 'Đã rút tin về bản nháp.')));
      if (!['closed', 'expired'].includes(job.status)) buttons.push(make('edit', 'Chỉnh sửa chi tiết', () => location.assign(`${routes['post-job']}?id=${job.id}`)));
      if (['active', 'paused', 'rejected'].includes(job.status)) buttons.push(make('cancel', 'Đóng tin', () => dialog('Đóng tin tuyển dụng', `<p>Đóng <strong>${job.title.replace(/[<&>]/g, '')}</strong>? Tin sẽ ngừng nhận hồ sơ và không thể mở lại.</p>`, 'Đóng tin', act(() => changeJobStatus(job.id, 'closed'), 'Đã đóng tin.'))));
      if (job.status === 'draft') buttons.push(make('delete', 'Xóa bản nháp', () => dialog('Xóa bản nháp', '<p>Bản nháp sẽ bị xóa vĩnh viễn.</p>', 'Xóa', act(() => deleteDraft(job.id), 'Đã xóa bản nháp.'))));
      actionsBox.replaceChildren(...buttons);
    }

    const metrics = c.lastElementChild as HTMLElement;
    const cells = [...metrics.children] as HTMLElement[];
    const jobStats = stats.filter(s => s.job_id === job.id);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const values: [string, string, string][] = [
      ['Tổng hồ sơ nộp', String(job.application_count), `(+${jobStats.filter(s => new Date(s.applied_at) >= today).length} mới)`],
      ['Lượt xem tin', String(job.view_count), 'lượt'],
      ['Đang phỏng vấn', String(jobStats.filter(s => s.status === 'interviewing').length), 'ứng viên'],
    ];
    values.forEach(([title, value, unit], i) => {
      const cell = cells[i]; if (!cell) return;
      const [t, v] = [...cell.children] as HTMLElement[];
      if (t) t.textContent = title;
      if (v) v.replaceChildren(document.createTextNode(`${value} `), el('span', {}, unit));
    });
    const link = cells[3]?.querySelector('a');
    if (link) {
      if (job.status === 'active' || job.application_count > 0) { link.href = `${routes.candidates}?job=${job.id}`; link.dataset.appControl = 'pipeline'; }
      else { link.href = jobHref(job.id); link.dataset.appControl = 'preview'; link.querySelector('span')!.textContent = 'Xem trước tin'; }
    }
    return c;
  }

  function render() {
    renderTabs();
    const query = (search?.value || '').trim().toLocaleLowerCase('vi');
    const test = statusFilters.find(([key]) => key === filter)![2];
    const visible = jobs.filter(test).filter(j => (!department?.value || j.department === department.value) && (!query || `${j.title} ${j.department ?? ''}`.toLocaleLowerCase('vi').includes(query)));
    if (!jobs.length) {
      list.replaceChildren(el('div', { className: 'app-state' }, el('p', {}, 'Bạn chưa có tin tuyển dụng nào.'), el('a', { className: 'ei-button ei-button-primary', href: routes['post-job'] }, 'Đăng tin đầu tiên')));
      return;
    }
    list.replaceChildren(...(visible.length ? visible.map(card) : [stateBlock('empty', 'Không có tin nào khớp bộ lọc.')]));
  }

  function renderInterviews(rows: Awaited<ReturnType<typeof todayInterviews>>) {
    const aside = document.querySelector('main aside');
    const cardBox = aside?.firstElementChild as HTMLElement | null;
    if (!cardBox) return;
    const count = cardBox.querySelector(':scope > div:first-child > span');
    if (count) count.textContent = `${rows.length} ca`;
    const listBox = cardBox.children[1] as HTMLElement;
    const item = listBox?.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!listBox || !item) return;
    if (!rows.length) { listBox.replaceChildren(el('p', { className: 'ei-muted', style: 'padding:8px 0' } as never, 'Hôm nay không có lịch phỏng vấn.')); }
    else listBox.replaceChildren(...rows.map(r => {
      const it = item.cloneNode(true) as HTMLElement;
      const spans = it.querySelectorAll('div > div > span');
      if (spans[0]) spans[0].textContent = formatDateTime(r.scheduled_at).split(' ')[0];
      if (spans[1]) spans[1].textContent = r.candidate_name;
      const badge = it.querySelector(':scope > div > span'); if (badge) badge.textContent = `Vòng ${r.round}`;
      iconText(it.querySelector('p'), r.job_title);
      const foot = it.lastElementChild as HTMLElement;
      iconText(foot.querySelector('span'), r.mode === 'online' ? 'Phỏng vấn trực tuyến' : r.mode === 'onsite' ? (r.location ?? 'Tại văn phòng') : 'Qua điện thoại');
      const a = foot.querySelector('a');
      if (a) { if (r.meeting_url) { a.href = r.meeting_url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Vào phòng họp'; } else { a.href = `${routes.candidates}?application=${r.application_id}`; a.textContent = 'Chi tiết'; } a.dataset.appControl = 'interview'; }
      return it;
    }));
    const all = cardBox.querySelector<HTMLButtonElement>(':scope > button');
    if (all) bind(all, () => location.assign(routes.candidates));
  }

  async function renderTalentMatching(companyId: string) {
    const aside = document.querySelector('main aside');
    const matchCard = aside?.children[1] as HTMLElement | null;
    if (!matchCard) return;

    // Only verified companies can search candidates
    if (company!.verification_status !== 'verified') {
      matchCard.hidden = true;
      return;
    }
    matchCard.hidden = false;

    try {
      const candidates = await searchCandidates({ limit: 3 });
      const listBox = matchCard.querySelector('.space-y-3') as HTMLElement | null;
      if (!listBox) return;
      if (!candidates.length) {
        listBox.replaceChildren(el('p', { className: 'ei-muted text-label-sm' }, 'Chưa có ứng viên mới bật chế độ tìm việc.'));
        return;
      }
      listBox.replaceChildren(...candidates.map(c => {
        const item = el('div', { className: 'p-4 rounded-xl bg-surface-container-low flex flex-col gap-3' },
          el('div', { className: 'flex items-start gap-3' },
            el('img', {
              className: 'w-11 h-11 rounded-full object-cover shrink-0 shadow-sm',
              src: publicUrl('avatars', c.avatar_path) || initialsAvatar(c.full_name || 'SV'),
              alt: c.full_name || 'SV'
            }),
            el('div', { className: 'min-w-0 flex-1' },
              el('div', { className: 'flex items-center justify-between' },
                el('h4', { className: 'font-label-md text-label-md text-on-surface font-bold truncate' }, c.full_name || 'Sinh viên'),
                el('span', { className: 'px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container font-label-sm text-label-sm font-bold' },
                  c.is_verified ? 'Đã xác thực' : 'Sẵn sàng')
              ),
              el('p', { className: 'font-body-sm text-body-sm text-on-surface-variant truncate' }, `${c.major || 'Chuyên ngành'} • ${c.university_name || ''}`)
            )
          ),
          el('div', { className: 'flex flex-wrap gap-1.5' },
            ...(c.skills || []).slice(0, 3).map(sk => el('span', { className: 'px-2 py-0.5 bg-surface-container-highest text-on-surface-variant rounded font-label-sm text-label-sm' }, sk))
          ),
          el('button', {
            type: 'button',
            className: 'w-full py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md hover:bg-primary-dim transition-colors flex items-center justify-center gap-1.5 shadow-sm',
          }, el('span', { className: 'material-symbols-outlined text-[18px]' }, 'send'), 'Nhắn tin cho ứng viên')
        );
        const contactBtn = item.querySelector('button');
        if (contactBtn) {
          bind(contactBtn, async () => {
            try {
              const convId = await startConversation(c.user_id, companyId);
              location.assign(`${routes.messages}?workspace=employer&conversation=${convId}`);
            } catch (err) { showError(err); }
          });
        }
        return item;
      }));
    } catch {
      matchCard.hidden = true;
    }
    // University portal card (Phase 10) is hidden for now
    const uniCard = aside?.children[2] as HTMLElement | null;
    if (uniCard) uniCard.hidden = true;
  }

  function openTalentSearch(companyId: string) {
    dialog('Tìm kiếm hồ sơ sinh viên', `
      <div class="flex flex-col gap-sm">
        <label>Từ khóa (Tên, chuyên ngành, kỹ năng...)
          <input type="text" name="query" placeholder="vd: React, NodeJS, Bách Khoa...">
        </label>
        <div class="grid grid-cols-2 gap-sm">
          <label>Tỉnh / Thành phố
            <input type="text" name="city" placeholder="vd: TP. Hồ Chí Minh">
          </label>
          <label>Năm tốt nghiệp
            <input type="number" name="grad_year" placeholder="vd: 2025">
          </label>
        </div>
      </div>
      <div id="dashboard-talent-results" style="margin-top:16px; max-height:280px; overflow-y:auto;">
        <p class="ei-muted">Nhập từ khóa và bấm Tìm kiếm để khám phá ứng viên đã bật chế độ tìm việc.</p>
      </div>
    `, 'Tìm kiếm', async form => {
      const resultsEl = document.getElementById('dashboard-talent-results');
      if (!resultsEl) return;
      resultsEl.innerHTML = '<p class="ei-muted">Đang tìm kiếm...</p>';
      const q = value(form, 'query');
      const cty = value(form, 'city');
      const yr = Number(value(form, 'grad_year')) || undefined;

      try {
        const hits = await searchCandidates({ query: q, city: cty, graduationYear: yr, limit: 15 });
        if (!hits.length) {
          resultsEl.innerHTML = '<p class="ei-muted">Không tìm thấy sinh viên nào phù hợp.</p>';
          return;
        }
        resultsEl.replaceChildren(
          ...hits.map(student => {
            const card = el('div', { className: 'p-sm bg-surface-container-low rounded-xl mb-2 flex items-center justify-between' },
              el('div', { className: 'flex items-center gap-sm' },
                el('img', {
                  className: 'w-10 h-10 rounded-full object-cover',
                  src: publicUrl('avatars', student.avatar_path) || initialsAvatar(student.full_name || 'SV'),
                  alt: student.full_name || 'SV'
                }),
                el('div', {},
                  el('strong', { className: 'font-label-md text-on-surface' }, student.full_name || 'Sinh viên'),
                  el('p', { className: 'font-body-sm text-on-surface-variant' }, `${student.major || 'Chuyên ngành'} • ${student.university_name || ''}`),
                  el('div', { className: 'flex gap-1 mt-0.5' }, ...(student.skills || []).slice(0, 3).map(sk => el('span', { className: 'ei-chip ei-chip-draft', style: 'font-size:10px' } as never, sk)))
                )
              ),
              el('button', {
                type: 'button',
                className: 'px-sm py-1 rounded bg-primary text-on-primary font-label-sm text-[12px] flex items-center gap-1',
              }, el('span', { className: 'material-symbols-outlined text-[16px]' }, 'chat'), 'Nhắn tin')
            );
            const chatBtn = card.querySelector('button');
            if (chatBtn) {
              chatBtn.addEventListener('click', async () => {
                try {
                  const convId = await startConversation(student.user_id, companyId);
                  location.assign(`${routes.messages}?workspace=employer&conversation=${convId}`);
                } catch (err) { showError(err); }
              });
            }
            return card;
          })
        );
      } catch (err) { showError(err, resultsEl); }
    });
  }

  search?.addEventListener('input', render);
  department?.addEventListener('change', render);
  toolButtons.filter(b => /Xuất Excel/.test(label(b))).forEach(b => bind(b, () => csv(`tin-tuyen-dung-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Vị trí', 'Trạng thái', 'Phòng ban', 'Số lượng', 'Hồ sơ', 'Lượt xem', 'Ngày đăng'],
    ...jobs.map(j => [j.title, jobStatusLabel[j.status] ?? j.status, j.department ?? '', String(j.openings), String(j.application_count), String(j.view_count), j.published_at ? j.published_at.slice(0, 10) : '']),
  ])));
  await load();
}
