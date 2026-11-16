// Employer dashboard (Phase 5, updated Phase 7): own jobs with status, counts and lifecycle actions; KPI tiles;
// today's interviews; AI top matching candidates; talent search dialog.
import { flash } from '../../core/auth';
import { label, routes, jobHref } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, csv, esc, value } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import { formatDateTime, formatStipend, jobStatusLabel, relativeTime, scheduleLabel, verifyStatusLabel, workTypeLabel } from '../../core/format';
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
  const h1 = document.getElementById('employer-title');
  if (h1) h1.textContent = `Trung tâm Tuyển dụng ${company.name}`;
  const eyebrow = document.getElementById('employer-eyebrow');
  if (eyebrow) {
    eyebrow.textContent = '';
    eyebrow.append(el('span', { className: `ei-chip ei-chip-${company.verification_status}` }, `Doanh nghiệp: ${verifyStatusLabel[company.verification_status]}`));
  }
  const intro = document.getElementById('employer-intro');
  if (company.verification_status !== 'verified' && intro) {
    const text = company.verification_status === 'pending'
      ? 'Hồ sơ doanh nghiệp đang chờ quản trị viên thẩm định. Bạn có thể soạn tin nháp; tin chỉ được gửi duyệt sau khi doanh nghiệp được xác thực.'
      : `Doanh nghiệp chưa được xác thực${company.verification_note ? ` (${company.verification_note})` : ''}. Hoàn thiện mã số thuế và giấy phép kinh doanh để bắt đầu đăng tin.`;
    intro.after(el('div', { className: 'ei-banner ei-banner-warning rc-banner', role: 'status' },
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
  document.querySelectorAll('#employer-stats .rc-stat').forEach((card, i) => {
    const [value, unit, foot] = tiles[i] ?? [];
    const number = card.querySelector('.rc-stat__value strong');
    const unitEl = card.querySelector('.rc-stat__value span');
    const footEl = card.querySelector('.rc-stat__foot');
    if (number) number.textContent = value;
    if (unitEl) unitEl.textContent = unit;
    if (footEl) footEl.textContent = foot;
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

/** "Còn N ngày" clock (signal colour at 3 days or fewer). */
function deadlineCell(job: DashboardJob) {
  if (!job.deadline || ['draft', 'rejected', 'closed', 'expired'].includes(job.status)) return el('span', { className: 'ui-deadline' }, '—');
  const days = Math.ceil((new Date(job.deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return el('span', { className: 'ui-deadline' }, 'Đã hết hạn');
  return el('span', { className: `ui-deadline${days <= 3 ? ' is-soon' : ''}` }, days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`);
}

export async function setupDashboard() {
  const company = await myCompany().catch(error => { showError(error); return null; });
  if (!company) { flash('Hãy tạo hồ sơ doanh nghiệp trước khi đăng tin.'); location.replace(routes['company-settings']); return; }
  renderHeader(company);

  // Header actions
  document.querySelectorAll<HTMLButtonElement>('.rc-actions button').forEach(b => {
    const text = label(b);
    if (/^Đăng tin tuyển dụng$/.test(text)) bind(b, () => location.assign(routes['post-job']));
    if (/Tìm kiếm hồ sơ sinh viên/.test(text)) bind(b, () => openTalentSearch(company.id));
  });

  const jobSection = document.getElementById('employer-jobs')!;
  const list = document.getElementById('employer-job-list')!;
  const tabBar = document.getElementById('employer-tabs')!;
  const search = jobSection.querySelector<HTMLInputElement>('input');
  const department = jobSection.querySelector<HTMLSelectElement>('select');
  const exportButton = jobSection.querySelector<HTMLButtonElement>('.rc-jobs__head button');
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
      const tab = el('button', { type: 'button', className: 'ui-pill' }, el('span', {}, name), el('span', { className: 'rc-count' }, String(jobs.filter(test).length)));
      tab.setAttribute('aria-pressed', String(key === filter));
      bind(tab, () => { filter = key; render(); });
      return tab;
    }));
  }

  function card(job: DashboardJob) {
    const jobStats = stats.filter(s => s.job_id === job.id);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const fresh = jobStats.filter(s => new Date(s.applied_at) >= today).length;
    const cell = (name: string, ...content: (Node | string)[]) => el('div', { className: 'rc-cell' }, el('span', { className: 'rc-cell__label' }, name), ...content);
    const line1 = [job.department || 'Chưa chọn phòng ban', job.city ?? job.address ?? 'Chưa có địa chỉ', workTypeLabel[job.work_type] ?? scheduleLabel[job.work_type] ?? (job.work_type ? String(job.work_type).replace(/_/g, ' ') : '')].filter(Boolean).join(' · ');
    const line2 = [
      `${formatStipend(job.stipend_min, job.stipend_max)}/tháng`,
      job.openings != null ? `Cần tuyển: ${job.openings} SV` : '',
      job.published_at ? `Đăng ${relativeTime(job.published_at)}` : `Tạo ${relativeTime(job.created_at)}`,
    ].filter(Boolean).join(' · ');
    const link = el('a', { className: 'rc-job__link' }, 'Xem Pipeline ATS') as HTMLAnchorElement;
    if (job.status === 'active' || (job.application_count ?? 0) > 0) { link.href = `${routes.candidates}?job=${job.id}`; link.dataset.appControl = 'pipeline'; }
    else { link.href = jobHref(job.id); link.dataset.appControl = 'preview'; link.textContent = 'Xem trước tin'; }
    const c = el('div', { className: 'ui-row rc-job' },
      el('div', { className: 'ui-row__body rc-job__main' },
        el('h3', { className: 'ui-row__title' }, job.title),
        el('p', { className: 'rc-meta rc-meta--1' }, line1),
        el('p', { className: 'rc-meta rc-meta--2' }, line2),
        link),
      el('div', { className: 'rc-cell rc-cell--status' }, el('span', { className: `ei-chip ei-chip-${job.status}` }, jobStatusLabel[job.status] ?? job.status)),
      cell('Tổng hồ sơ nộp', el('strong', {}, String(job.application_count ?? 0)), fresh ? el('small', {}, ` (+${fresh} mới)`) : ''),
      cell('Lượt xem tin', el('strong', {}, String(job.view_count ?? 0))),
      cell('Đang phỏng vấn', el('strong', {}, String(jobStats.filter(s => s.status === 'interviewing').length))),
      cell('Hạn nộp', deadlineCell(job)));
    c.dataset.jobId = job.id;
    if (job.status === 'rejected' && job.rejection_reason) {
      c.querySelector('.rc-job__main')!.append(el('div', { className: 'ei-banner ei-banner-danger rc-banner' }, `Lý do từ chối: ${job.rejection_reason}`));
    }

    const make = (icon: string, title: string, run: () => void) => {
      const b = el('button', { type: 'button', className: 'ui-btn ui-btn--icon ui-btn--sm', title }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, icon)) as HTMLButtonElement;
      b.setAttribute('aria-label', `${title}: ${job.title}`);
      bind(b, run); return b;
    };
    const act = (fn: () => Promise<unknown>, done: string) => async () => { try { await fn(); toast(done); await load(); } catch (error) { showError(error); } };
    const buttons: HTMLButtonElement[] = [make('content_copy', 'Sao chép tin', act(() => duplicateJob(job.id), 'Đã tạo bản sao ở dạng nháp.'))];
    if (job.status === 'active') buttons.push(make('pause_circle', 'Tạm dừng nhận đơn', act(() => changeJobStatus(job.id, 'paused'), 'Đã tạm dừng nhận đơn.')));
    if (job.status === 'paused') buttons.push(make('play_circle', 'Mở lại nhận đơn', act(() => changeJobStatus(job.id, 'active'), 'Đã mở lại nhận đơn.')));
    if (['draft', 'rejected'].includes(job.status)) buttons.push(make('send', 'Gửi duyệt', act(() => submitJob(job.id), 'Đã gửi tin để quản trị viên duyệt.')));
    if (job.status === 'pending_approval') buttons.push(make('undo', 'Rút về bản nháp', act(() => changeJobStatus(job.id, 'draft'), 'Đã rút tin về bản nháp.')));
    if (!['closed', 'expired'].includes(job.status)) buttons.push(make('edit', 'Chỉnh sửa chi tiết', () => location.assign(`${routes['post-job']}?id=${job.id}`)));
    if (['active', 'paused', 'rejected'].includes(job.status)) buttons.push(make('cancel', 'Đóng tin', () => dialog('Đóng tin tuyển dụng', `<p>Đóng <strong>${esc(job.title)}</strong>? Tin sẽ ngừng nhận hồ sơ và không thể mở lại.</p>`, 'Đóng tin', act(() => changeJobStatus(job.id, 'closed'), 'Đã đóng tin.'))));
    if (job.status === 'draft') buttons.push(make('delete', 'Xóa bản nháp', () => dialog('Xóa bản nháp', '<p>Bản nháp sẽ bị xóa vĩnh viễn.</p>', 'Xóa', act(() => deleteDraft(job.id), 'Đã xóa bản nháp.'))));
    c.append(el('div', { className: 'ui-row__actions rc-job__actions' }, ...buttons));
    return c;
  }

  function render() {
    renderTabs();
    const query = (search?.value || '').trim().toLocaleLowerCase('vi');
    const test = statusFilters.find(([key]) => key === filter)![2];
    const visible = jobs.filter(test).filter(j => (!department?.value || j.department === department.value) && (!query || `${j.title} ${j.department ?? ''}`.toLocaleLowerCase('vi').includes(query)));
    if (!jobs.length) {
      list.replaceChildren(el('div', { className: 'ui-empty' }, el('p', {}, 'Bạn chưa có tin tuyển dụng nào.'), el('a', { className: 'ui-btn ui-btn--primary', href: routes['post-job'] }, 'Đăng tin đầu tiên')));
      return;
    }
    list.replaceChildren(...(visible.length ? visible.map(card) : [stateBlock('empty', 'Không có tin nào khớp bộ lọc.')]));
  }

  function renderInterviews(rows: Awaited<ReturnType<typeof todayInterviews>>) {
    const cardBox = document.getElementById('employer-interviews');
    if (!cardBox) return;
    const count = cardBox.querySelector('.ui-chip');
    if (count) count.textContent = `${rows.length} ca`;
    const listBox = cardBox.querySelector('.rc-side-list')!;
    cardBox.classList.toggle('rc-side--empty', !rows.length);
    if (!rows.length) listBox.replaceChildren(el('p', { className: 'ei-muted rc-side-note' }, 'Hôm nay không có lịch phỏng vấn.'));
    else listBox.replaceChildren(...rows.map(r => {
      const mode = r.mode === 'online' ? 'Phỏng vấn trực tuyến' : r.mode === 'onsite' ? (r.location ?? 'Tại văn phòng') : 'Qua điện thoại';
      const a = el('a', { className: 'ui-link' }) as HTMLAnchorElement;
      if (r.meeting_url) { a.href = r.meeting_url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Vào phòng họp'; }
      else { a.href = `${routes.candidates}?application=${r.application_id}`; a.textContent = 'Chi tiết'; }
      a.dataset.appControl = 'interview';
      return el('div', { className: 'rc-side-item' },
        el('div', { className: 'rc-side-item__top' }, el('strong', {}, r.candidate_name), el('span', { className: 'ui-chip ui-chip--neutral' }, `Vòng ${r.round}`)),
        el('p', { className: 'ui-meta' }, el('span', {}, formatDateTime(r.scheduled_at).split(' ')[0]), el('span', {}, r.job_title)),
        el('div', { className: 'rc-side-item__foot' }, el('span', { className: 'ui-meta' }, mode), a));
    }));
    const all = cardBox.querySelector<HTMLButtonElement>('.ui-card__footer button');
    if (all) bind(all, () => location.assign(routes.candidates));
  }

  async function renderTalentMatching(companyId: string) {
    const matchCard = document.getElementById('employer-matching');
    if (!matchCard) return;
    // Only verified companies can search candidates
    if (company!.verification_status !== 'verified') { matchCard.hidden = true; return; }
    try {
      const candidates = await searchCandidates({ limit: 3 });
      const listBox = matchCard.querySelector('.rc-side-list')!;
      matchCard.hidden = false;
      if (!candidates.length) {
        listBox.replaceChildren(el('div', { className: 'ui-empty rc-empty' }, el('span', { className: 'ui-empty__icon' }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'person_search')), el('p', {}, 'Chưa có ứng viên mới bật chế độ tìm việc.')));
        return;
      }
      listBox.replaceChildren(...candidates.map(c => {
        const message = el('button', { type: 'button', className: 'ui-btn ui-btn--neutral ui-btn--sm ui-btn--block' }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'send'), 'Nhắn tin cho ứng viên');
        bind(message, async () => {
          try {
            const convId = await startConversation(c.user_id, companyId);
            location.assign(`${routes.messages}?workspace=employer&conversation=${convId}`);
          } catch (err) { showError(err); }
        });
        return el('div', { className: 'rc-side-item' },
          el('div', { className: 'rc-person' },
            el('img', { className: 'ui-avatar', src: publicUrl('avatars', c.avatar_path) || initialsAvatar(c.full_name || 'SV'), alt: c.full_name || 'SV' }),
            el('div', { className: 'rc-person__body' },
              el('strong', {}, c.full_name || 'Sinh viên'),
              el('p', { className: 'ui-meta' }, el('span', {}, c.major || 'Chuyên ngành'), c.university_name ? el('span', {}, c.university_name) : null)),
            el('span', { className: 'ui-chip ui-chip--neutral' }, c.is_verified ? 'Đã xác thực' : 'Sẵn sàng')),
          el('div', { className: 'ui-pills' }, ...(c.skills || []).slice(0, 3).map(sk => el('span', { className: 'ui-chip ui-chip--neutral' }, sk))),
          message);
      }));
    } catch {
      matchCard.hidden = true;
    }
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
            const card = el('div', { className: 'ui-row rc-hit' },
              el('div', { className: 'rc-person' },
                el('img', {
                  className: 'ui-avatar',
                  src: publicUrl('avatars', student.avatar_path) || initialsAvatar(student.full_name || 'SV'),
                  alt: student.full_name || 'SV'
                }),
                el('div', { className: 'rc-person__body' },
                  el('strong', {}, student.full_name || 'Sinh viên'),
                  el('p', { className: 'ui-meta' }, el('span', {}, student.major || 'Chuyên ngành'), student.university_name ? el('span', {}, student.university_name) : null),
                  el('div', { className: 'ui-pills' }, ...(student.skills || []).slice(0, 3).map(sk => el('span', { className: 'ui-chip ui-chip--neutral' }, sk)))
                )
              ),
              el('button', {
                type: 'button',
                className: 'ui-btn ui-btn--neutral ui-btn--sm',
              }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'chat'), 'Nhắn tin')
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
  if (exportButton) bind(exportButton, () => csv(`tin-tuyen-dung-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Vị trí', 'Trạng thái', 'Phòng ban', 'Số lượng', 'Hồ sơ', 'Lượt xem', 'Ngày đăng'],
    ...jobs.map(j => [j.title, jobStatusLabel[j.status] ?? j.status, j.department ?? '', String(j.openings ?? 0), String(j.application_count ?? 0), String(j.view_count ?? 0), j.published_at ? j.published_at.slice(0, 10) : '']),
  ]));
  await load();
}
