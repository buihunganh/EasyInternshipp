// University officer portal (/pages/university-portal/): UseCase_University, DFD 8.3 / 8.4.
// Every officer action goes through an RPC or RLS policy scoped to the officer's own university.
import { dialog, toast } from '../../core/ui/feedback';
import { csv } from '../../core/ui/actions';
import { el, esc, showState } from '../../core/render';
import { showError, toAppError } from '../../core/errors';
import { applicationStatusLabel, formatDate, formatDateTime, formatStipend, formatVnd, jobStatusLabel, localDateTimeInput, verifyStatusLabel } from '../../core/format';
import { currentProfile } from '../../core/session';
import * as api from './api';

/** Inline style for el(): the DOM accepts a string for `style` (it sets cssText). */
const css = (text: string) => ({ style: text }) as Record<string, unknown>;

type Tab = 'overview' | 'students' | 'jobs' | 'reports' | 'events' | 'partners' | 'inquiries';
const TABS: Tab[] = ['overview', 'students', 'jobs', 'reports', 'events', 'partners', 'inquiries'];

const approvalLabel: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };
const certLabel: Record<string, string> = { draft: 'Nháp', submitted: 'Chờ chứng thực', certified: 'Đã chứng thực', rejected: 'Cần chỉnh sửa' };
const eventStatusLabel: Record<string, string> = { draft: 'Bản nháp', published: 'Đã công bố', cancelled: 'Đã hủy', completed: 'Đã kết thúc' };
const partnershipLabel: Record<string, string> = { pending: 'Đang đàm phán', active: 'Đang hiệu lực', expired: 'Hết hạn', terminated: 'Đã chấm dứt' };
const inquiryLabel: Record<string, string> = { new: 'Mới', contacted: 'Đã liên hệ', closed: 'Đã đóng' };
const tone = (s: string | null | undefined) =>
  ['verified', 'approved', 'certified', 'active', 'published', 'hired', 'closed_ok'].includes(s || '') ? 'ui-chip--success'
    : ['pending', 'submitted', 'new', 'pending_approval'].includes(s || '') ? 'ui-chip--warning'
    : ['rejected', 'revoked', 'cancelled', 'terminated', 'expired'].includes(s || '') ? 'ui-chip--danger' : 'ui-chip--neutral';
const chip = (status: string | null | undefined, labels: Record<string, string>) => el('span', { className: `ui-chip ${tone(status)}` }, labels[status || ''] || status || '—');
const btn = (text: string, kind: 'primary' | 'neutral' | 'danger' | 'tertiary', onClick: () => void, icon?: string) => {
  const b = el('button', { type: 'button', className: `ui-btn ui-btn--${kind} ui-btn--sm` }, icon ? el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, icon) : null, text);
  b.dataset.appControl = 'portal';
  b.addEventListener('click', onClick);
  return b;
};
const pct = (v: number | null | undefined) => v == null ? '—' : `${(Number(v) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replaceAll('đ', 'd');

/** Dialog asking for a note; resolves with the note, or null when cancelled. */
function askNote(title: string, confirm: string, required: boolean, hint = ''): Promise<string | null> {
  return new Promise(resolve => {
    let done = false;
    const modal = dialog(title, `${hint ? `<p class="app-muted">${esc(hint)}</p>` : ''}<label>${required ? 'Lý do (bắt buộc)' : 'Ghi chú (tùy chọn)'}<textarea name="note" rows="3" maxlength="1000" ${required ? 'required' : ''}></textarea></label>`, confirm, f => {
      const note = (f.elements.namedItem('note') as HTMLTextAreaElement).value.trim();
      if (required && !note) throw new Error('Vui lòng nhập lý do.');
      done = true; resolve(note);
    }, { keepOpen: true });
    modal.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

export async function setupUniversityPortal() {
  const panel = document.getElementById('up-panel')!;
  const nav = document.getElementById('up-nav')!;
  showState(panel, 'loading', 'Đang tải cổng quản lý...');

  let mine: Awaited<ReturnType<typeof api.myOfficerUniversity>>;
  try { mine = await api.myOfficerUniversity(); } catch (error) { showState(panel, 'error', toAppError(error).message, () => location.reload()); return; }
  if (!mine) {
    showState(panel, 'error', 'Tài khoản chưa được gắn với trường nào. Vui lòng liên hệ quản trị viên Internships.io.');
    return;
  }
  const uniId = mine.university_id;
  const uni = mine.university as { id: string; name: string; short_name: string | null } | null;
  document.getElementById('up-university')!.textContent = uni?.name || 'Trường của bạn';
  document.getElementById('up-officer')!.textContent = [currentProfile()?.full_name, mine.title, mine.department].filter(Boolean).join(' · ');
  (document.getElementById('up-public-link') as HTMLAnchorElement).href = `/pages/university/?id=${encodeURIComponent(uniId)}`;
  document.title = `Cổng quản lý ${uni?.short_name || ''} | Internships.io`.replace('  ', ' ');

  const setCount = (key: string, n: number) => {
    const badge = nav.querySelector<HTMLElement>(`[data-count="${key}"]`);
    if (badge) { badge.textContent = n ? String(n) : ''; badge.hidden = !n; badge.setAttribute('aria-label', `${n} mục cần xử lý`); }
  };
  async function refreshCounts() {
    const [students, jobs, reports, events, inquiries] = await Promise.allSettled([
      api.listStudents(uniId), api.exclusiveJobs(uniId), api.internshipReports(uniId), api.officerEvents(uniId), api.inquiries(uniId)]);
    if (students.status === 'fulfilled') setCount('students', students.value.filter(s => s.verification_status === 'pending').length);
    if (jobs.status === 'fulfilled') setCount('jobs', jobs.value.filter(j => j.university_approval === 'pending' && j.status !== 'draft').length);
    if (reports.status === 'fulfilled') setCount('reports', reports.value.filter(r => r.status === 'submitted').length);
    if (events.status === 'fulfilled') setCount('events', events.value.reduce((n, e) => n + (e.event_booths ?? []).filter(b => b.status === 'pending').length, 0));
    if (inquiries.status === 'fulfilled') setCount('inquiries', inquiries.value.filter(i => i.status === 'new').length);
  }

  const current = (): Tab => { const h = location.hash.slice(1) as Tab; return TABS.includes(h) ? h : 'overview'; };
  async function show() {
    const tab = current();
    nav.querySelectorAll<HTMLAnchorElement>('a[data-tab]').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    panel.setAttribute('aria-busy', 'true');
    showState(panel, 'loading');
    try {
      await renderers[tab]();
    } catch (error) {
      showState(panel, 'error', toAppError(error).message, show);
    } finally { panel.setAttribute('aria-busy', 'false'); }
  }
  const reload = () => { refreshCounts().catch(() => undefined); return show(); };

  const head = (title: string, subtitle: string, ...actions: (Node | null)[]) =>
    el('div', { className: 'up-head' }, el('div', {}, el('h2', {}, title), el('p', { className: 'up-muted' }, subtitle)), el('div', { className: 'up-actions' }, ...actions));
  function pills<T extends string>(options: [T, string][], active: T, onPick: (v: T) => void) {
    const box = el('div', { className: 'ui-pills', role: 'group', 'aria-label': 'Lọc' });
    for (const [v, text] of options) {
      const p = el('button', { type: 'button', className: 'ui-pill', 'aria-pressed': String(v === active) }, text);
      p.dataset.appControl = 'portal';
      p.addEventListener('click', () => onPick(v));
      box.append(p);
    }
    return box;
  }

  // --- Overview ---------------------------------------------------------------------------
  async function overview() {
    const [rows, students, jobs, reports, events, inquiries] = await Promise.all([
      api.placement().catch(() => [] as api.Placement[]), api.listStudents(uniId), api.exclusiveJobs(uniId),
      api.internshipReports(uniId), api.officerEvents(uniId), api.inquiries(uniId)]);
    const k = rows[0];
    // Live counts (the placement warehouse refreshes nightly)
    const live = {
      registered: students.length,
      verified: students.filter(s => s.verification_status === 'verified').length,
      applied: students.filter(s => s.applications.length).length,
      interviewed: students.filter(s => s.applications.some(a => ['interviewing', 'offered', 'hired', 'offer_declined'].includes(a.status))).length,
      offered: students.filter(s => s.applications.some(a => ['offered', 'hired', 'offer_declined'].includes(a.status))).length,
      hired: students.filter(s => s.applications.some(a => a.status === 'hired')).length,
    };
    const stat = (label: string, value: string, note: string) => el('div', { className: 'up-stat' }, el('span', { className: 'up-stat__label' }, label), el('strong', { className: 'up-stat__value' }, value), el('span', { className: 'up-stat__note' }, note));
    const stats = el('div', { className: 'up-stats' },
      stat('Sinh viên trên nền tảng', String(live.registered), `${live.verified} đã xác thực`),
      stat('Đã ứng tuyển', String(live.applied), live.registered ? `${Math.round(live.applied / live.registered * 100)}% sinh viên` : '—'),
      stat('Nhận việc thực tập', String(live.hired), live.applied ? `${Math.round(live.hired / live.applied * 100)}% người ứng tuyển` : '—'),
      stat('Báo cáo đã chứng thực', String(reports.filter(r => r.status === 'certified').length), `${reports.filter(r => r.status === 'submitted').length} chờ chứng thực`));

    // Funnel: one series, bars share one scale
    const steps: [string, number][] = [['Đăng ký', live.registered], ['Xác thực', live.verified], ['Ứng tuyển', live.applied], ['Phỏng vấn', live.interviewed], ['Nhận offer', live.offered], ['Nhận việc', live.hired]];
    const max = Math.max(1, ...steps.map(s => s[1]));
    const funnel = el('div', { className: 'up-funnel', role: 'table', 'aria-label': 'Phễu thực tập của sinh viên' },
      ...steps.map(([label, n]) => el('div', { className: 'up-funnel__row', role: 'row' },
        el('span', { className: 'up-funnel__label', role: 'rowheader' }, label),
        el('span', { className: 'up-funnel__track', role: 'cell' }, el('span', { className: 'up-funnel__bar', ...css(`width:${Math.max(n ? 2 : 0, n / max * 100)}%`) })),
        el('span', { className: 'up-funnel__value', role: 'cell' }, String(n)))));

    const todo: [Tab, string, number][] = [
      ['students', 'Sinh viên chờ xác thực', students.filter(s => s.verification_status === 'pending').length],
      ['jobs', 'Tin độc quyền chờ duyệt', jobs.filter(j => j.university_approval === 'pending' && j.status !== 'draft').length],
      ['reports', 'Báo cáo thực tập chờ chứng thực', reports.filter(r => r.status === 'submitted').length],
      ['events', 'Gian hàng sự kiện chờ duyệt', events.reduce((n, e) => n + (e.event_booths ?? []).filter(b => b.status === 'pending').length, 0)],
      ['inquiries', 'Liên hệ hợp tác mới', inquiries.filter(i => i.status === 'new').length],
    ];
    const todoList = el('ul', { className: 'ui-list up-todo' }, ...todo.map(([tab, label, n]) => el('li', {},
      el('a', { href: `#${tab}` }, el('span', {}, label), el('span', { className: `ui-chip ${n ? 'ui-chip--warning' : 'ui-chip--neutral'}` }, String(n))))));

    const yearTable = rows.length ? el('table', { className: 'up-table' },
      el('caption', {}, 'Báo cáo theo năm học (kho dữ liệu, cập nhật hằng đêm)'),
      el('thead', {}, el('tr', {}, ...['Năm học', 'Đăng ký', 'Xác thực', 'Ứng tuyển', 'Phỏng vấn', 'Offer', 'Nhận việc', 'Tỷ lệ', 'Ngày TB', 'Phụ cấp TB'].map(h => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, ...rows.map(r => el('tr', {}, el('th', { scope: 'row' }, r.academic_year),
        ...[r.registered_students, r.verified_students, r.students_applied, r.students_interviewed, r.students_offered, r.students_hired].map(v => el('td', {}, String(v ?? 0))),
        el('td', {}, pct(r.placement_rate)), el('td', {}, r.avg_days_to_hire == null ? '—' : String(Math.round(Number(r.avg_days_to_hire)))),
        el('td', {}, r.avg_hired_stipend == null ? '—' : formatVnd(Number(r.avg_hired_stipend))))))) : el('p', { className: 'up-muted' }, 'Chưa có số liệu kho dữ liệu cho năm học nào.');

    const exportBtn = btn('Xuất CSV', 'neutral', () => {
      csv(`bao-cao-thuc-tap-${uni?.short_name || 'truong'}.csv`, [
        ['Năm học', 'Sinh viên đăng ký', 'Đã xác thực', 'Đã ứng tuyển', 'Phỏng vấn', 'Nhận offer', 'Nhận việc', 'Tỷ lệ nhận việc', 'Số ngày TB đến khi nhận việc', 'Phụ cấp TB (VND)'],
        ...rows.map(r => [r.academic_year, r.registered_students, r.verified_students, r.students_applied, r.students_interviewed, r.students_offered, r.students_hired,
          r.placement_rate == null ? '' : String(r.placement_rate), r.avg_days_to_hire ?? '', r.avg_hired_stipend ?? ''].map(String)),
        [], ['Số liệu trực tiếp', new Date().toISOString().slice(0, 10)],
        ...steps.map(([l, n]) => [l, String(n)]),
      ]);
    }, 'download');
    panel.replaceChildren(
      head('Tổng quan thực tập', k ? `Năm học ${k.academic_year} · số liệu trực tiếp và báo cáo kho dữ liệu` : 'Số liệu trực tiếp của sinh viên trường bạn', exportBtn),
      stats,
      el('div', { className: 'up-grid' },
        el('section', { className: 'up-box' }, el('h3', {}, 'Phễu thực tập'), funnel),
        el('section', { className: 'up-box' }, el('h3', {}, 'Cần xử lý'), todoList)),
      el('section', { className: 'up-box up-scroll' }, yearTable));
  }

  // --- Students ---------------------------------------------------------------------------
  let studentFilter: 'pending' | 'verified' | 'other' | 'all' = 'pending';
  let studentQuery = '';
  async function students() {
    const list = await api.listStudents(uniId);
    const draw = () => {
      const q = norm(studentQuery);
      const rows = list.filter(s => (studentFilter === 'all' || (studentFilter === 'other' ? !['pending', 'verified'].includes(s.verification_status) : s.verification_status === studentFilter))
        && (!q || norm(`${s.profile?.full_name} ${s.profile?.email} ${s.student_code} ${s.major}`).includes(q)));
      body.replaceChildren(...(rows.length ? rows.map(studentRow) : [el('p', { className: 'up-empty' }, 'Không có sinh viên phù hợp.')]));
    };
    const search = el('input', { type: 'search', className: 'up-search', placeholder: 'Tìm tên, email, MSSV, ngành...', value: studentQuery, 'aria-label': 'Tìm sinh viên' });
    search.addEventListener('input', () => { studentQuery = search.value; draw(); });
    const exportBtn = btn('Xuất CSV', 'neutral', () => csv(`sinh-vien-${uni?.short_name || 'truong'}.csv`, [
      ['Họ tên', 'Email', 'MSSV', 'Ngành', 'GPA', 'Năm tốt nghiệp', 'Xác thực', 'Số đơn', 'Trạng thái gần nhất', 'Nhận việc tại'],
      ...list.map(s => {
        const hired = s.applications.find(a => a.status === 'hired');
        const hiredJob = hired?.job as { title: string; company: { name: string } | null } | null | undefined;
        return [s.profile?.full_name || '', s.profile?.email || '', s.student_code || '', s.major || '', s.gpa == null ? '' : String(s.gpa), s.graduation_year == null ? '' : String(s.graduation_year),
          verifyStatusLabel[s.verification_status] || s.verification_status, String(s.applications.length),
          s.applications[0] ? applicationStatusLabel[s.applications[0].status] || s.applications[0].status : '', hiredJob ? `${hiredJob.title} – ${hiredJob.company?.name || ''}` : ''];
      })]), 'download');
    const body = el('div', { className: 'up-rows' });
    const counts = (f: string) => list.filter(s => f === 'all' || (f === 'other' ? !['pending', 'verified'].includes(s.verification_status) : s.verification_status === f)).length;
    panel.replaceChildren(
      head('Sinh viên', 'Xác thực tài khoản sinh viên (MSSV) và theo dõi tiến độ ứng tuyển', exportBtn),
      el('div', { className: 'up-toolbar' }, pills([['pending', `Chờ xác thực (${counts('pending')})`], ['verified', `Đã xác thực (${counts('verified')})`], ['other', `Khác (${counts('other')})`], ['all', `Tất cả (${counts('all')})`]], studentFilter, v => { studentFilter = v; students(); }), search),
      body);
    draw();
  }
  function studentRow(s: api.PortalStudent) {
    const name = s.profile?.full_name || s.profile?.email || 'Sinh viên';
    const latest = s.applications[0];
    const hired = s.applications.find(a => a.status === 'hired');
    const hiredJob = hired?.job as { title: string; company: { name: string } | null } | null | undefined;
    const progress = !s.applications.length ? 'Chưa ứng tuyển'
      : hired ? `Nhận việc: ${hiredJob?.title || ''} – ${hiredJob?.company?.name || ''}`
      : `${s.applications.length} đơn · gần nhất: ${applicationStatusLabel[latest.status] || latest.status}`;
    const actions = el('div', { className: 'up-actions' });
    const decide = async (approve: boolean) => {
      const note = await askNote(approve ? `Xác thực ${name}` : `Từ chối xác thực ${name}`, approve ? 'Xác thực' : 'Từ chối', !approve,
        approve ? `MSSV ${s.student_code || '—'} · ${s.major || ''}` : 'Sinh viên sẽ nhận thông báo kèm lý do.');
      if (note === null) return;
      try { await api.verifyStudent(s.user_id, approve, note || null); toast(approve ? 'Đã xác thực sinh viên.' : 'Đã từ chối xác thực.'); reload(); } catch (error) { showError(error); }
    };
    if (s.verification_status === 'pending') actions.append(btn('Xác thực', 'primary', () => decide(true), 'verified'), btn('Từ chối', 'danger', () => decide(false)));
    else if (s.verification_status === 'verified') actions.append(btn('Thu hồi', 'tertiary', () => decide(false)));
    else if (s.verification_status === 'unverified') actions.append(btn('Xác thực', 'neutral', () => decide(true)));
    actions.append(btn('Chi tiết', 'tertiary', () => studentDetail(s)));
    return el('article', { className: 'up-row' },
      el('div', { className: 'up-row__main' },
        el('div', { className: 'up-row__title' }, el('strong', {}, name), chip(s.verification_status, verifyStatusLabel)),
        el('p', { className: 'up-row__meta' }, [s.student_code && `MSSV ${s.student_code}`, s.major, s.graduation_year && `Tốt nghiệp ${s.graduation_year}`, s.gpa != null && `GPA ${s.gpa}`].filter(Boolean).join(' · ')),
        el('p', { className: 'up-row__meta' }, progress),
        s.verification_note ? el('p', { className: 'up-row__note' }, `Ghi chú: ${s.verification_note}`) : null),
      actions);
  }
  function studentDetail(s: api.PortalStudent) {
    const apps = s.applications.map(a => {
      const job = a.job as { title: string; company: { name: string } | null } | null;
      return `<li><strong>${esc(job?.title || 'Tin tuyển dụng')}</strong> – ${esc(job?.company?.name || '')}<br><span class="app-muted">${esc(applicationStatusLabel[a.status] || a.status)} · nộp ${esc(formatDate(a.applied_at))}</span></li>`;
    }).join('');
    dialog(s.profile?.full_name || 'Sinh viên', `<p>${esc(s.profile?.email || '')}${s.profile?.phone ? ' · ' + esc(s.profile.phone) : ''}</p>
      <p class="app-muted">MSSV ${esc(s.student_code || '—')} · ${esc(s.major || '')} · ${esc(verifyStatusLabel[s.verification_status] || '')}${s.verified_at ? ' ngày ' + esc(formatDate(s.verified_at)) : ''}</p>
      <h3>Đơn ứng tuyển (${s.applications.length})</h3>${apps ? `<ul class="up-dialog-list">${apps}</ul>` : '<p class="app-muted">Chưa ứng tuyển vị trí nào.</p>'}`, 'Đóng');
  }

  // --- Exclusive jobs ---------------------------------------------------------------------
  async function jobs() {
    const list = (await api.exclusiveJobs(uniId)).filter(j => j.status !== 'draft');
    const rows = list.map(j => {
      const company = j.company as { id: string; name: string } | null;
      const actions = el('div', { className: 'up-actions' });
      const decide = async (approve: boolean) => {
        const note = await askNote(approve ? 'Duyệt tin độc quyền' : 'Từ chối tin độc quyền', approve ? 'Duyệt tin' : 'Từ chối', !approve,
          approve ? 'Chỉ sinh viên đã xác thực của trường mới thấy và ứng tuyển được tin này.' : 'Doanh nghiệp sẽ nhận thông báo kèm lý do.');
        if (note === null) return;
        try { await api.reviewExclusiveJob(j.id, approve, note || null); toast(approve ? 'Đã duyệt tin.' : 'Đã từ chối tin.'); reload(); } catch (error) { showError(error); }
      };
      if (j.university_approval !== 'approved') actions.append(btn('Duyệt', 'primary', () => decide(true), 'check'));
      if (j.university_approval !== 'rejected') actions.append(btn(j.university_approval === 'approved' ? 'Thu hồi duyệt' : 'Từ chối', j.university_approval === 'approved' ? 'tertiary' : 'danger', () => decide(false)));
      actions.append(el('a', { className: 'ui-btn ui-btn--tertiary ui-btn--sm', href: `/pages/job-detail/?id=${encodeURIComponent(j.id)}`, target: '_blank', rel: 'noopener' }, 'Xem tin'));
      return el('article', { className: 'up-row' },
        el('div', { className: 'up-row__main' },
          el('div', { className: 'up-row__title' }, el('strong', {}, j.title), chip(j.university_approval, approvalLabel), el('span', { className: 'ui-chip ui-chip--neutral' }, jobStatusLabel[j.status] || j.status)),
          el('p', { className: 'up-row__meta' }, [company?.name, j.city, formatStipend(j.stipend_min, j.stipend_max), j.deadline && `Hạn ${formatDate(j.deadline)}`].filter(Boolean).join(' · ')),
          j.university_note ? el('p', { className: 'up-row__note' }, `Ghi chú: ${j.university_note}`) : null),
        actions);
    });
    panel.replaceChildren(head('Tin tuyển dụng độc quyền', 'Doanh nghiệp đối tác đăng tin chỉ dành cho sinh viên trường bạn; tin hiển thị khi cả quản trị viên và nhà trường đã duyệt'),
      el('div', { className: 'up-rows' }, ...(rows.length ? rows : [el('p', { className: 'up-empty' }, 'Chưa có tin độc quyền nào gửi tới trường.')])));
  }

  // --- Internship reports -----------------------------------------------------------------
  let reportFilter: 'submitted' | 'certified' | 'rejected' | 'all' = 'submitted';
  async function reports() {
    const list = await api.internshipReports(uniId);
    const names = await api.profileNames(list.map(r => r.student_id));
    const shown = list.filter(r => reportFilter === 'all' ? r.status !== 'draft' : r.status === reportFilter);
    const rows = shown.map(r => {
      const app = r.application as { id: string; hired_at: string | null; job: { title: string; company: { name: string } | null } | null } | null;
      const actions = el('div', { className: 'up-actions' });
      if (r.status === 'submitted') {
        const certify = btn('Chứng thực', 'primary', async () => {
          const note = await askNote('Chứng thực báo cáo thực tập', 'Chứng thực', false, 'Hệ thống tạo mã chứng nhận để tra cứu công khai tại /pages/verify/.');
          if (note === null) return;
          try { const code = await api.certifyReport(r.id, true, note || null); toast(`Đã chứng thực. Mã chứng nhận: ${code}`); reload(); } catch (error) { showError(error); }
        }, 'workspace_premium');
        if (r.employer_rating == null) { certify.disabled = true; certify.title = 'Chờ doanh nghiệp đánh giá thực tập sinh'; }
        actions.append(certify, btn('Yêu cầu chỉnh sửa', 'danger', async () => {
          const note = await askNote('Yêu cầu chỉnh sửa báo cáo', 'Gửi yêu cầu', true);
          if (note === null) return;
          try { await api.certifyReport(r.id, false, note); toast('Đã gửi yêu cầu chỉnh sửa.'); reload(); } catch (error) { showError(error); }
        }));
      }
      if (r.status === 'certified' && r.verification_code) {
        actions.append(el('a', { className: 'ui-btn ui-btn--neutral ui-btn--sm', href: `/pages/verify/?code=${encodeURIComponent(r.verification_code)}`, target: '_blank', rel: 'noopener' }, 'Xem chứng nhận'));
      }
      const summary = el('p', { className: 'up-row__summary' }, r.student_summary || '(Chưa có nội dung)');
      return el('article', { className: 'up-row' },
        el('div', { className: 'up-row__main' },
          el('div', { className: 'up-row__title' }, el('strong', {}, names.get(r.student_id) || 'Sinh viên'), chip(r.status, certLabel)),
          el('p', { className: 'up-row__meta' }, [app?.job?.title, app?.job?.company?.name, app?.hired_at && `nhận việc ${formatDate(app.hired_at)}`].filter(Boolean).join(' · ')),
          el('p', { className: 'up-row__meta' }, r.employer_rating == null ? 'Doanh nghiệp chưa đánh giá' : `Doanh nghiệp đánh giá: ${'★'.repeat(r.employer_rating)}${'☆'.repeat(5 - r.employer_rating)}${r.employer_comment ? ` – “${r.employer_comment}”` : ''}`),
          summary,
          r.verification_code ? el('p', { className: 'up-row__meta' }, `Mã chứng nhận: ${r.verification_code} · ${formatDate(r.certified_at)}`) : null,
          r.review_note ? el('p', { className: 'up-row__note' }, `Ghi chú: ${r.review_note}`) : null),
        actions);
    });
    const c = (f: string) => list.filter(r => f === 'all' ? r.status !== 'draft' : r.status === f).length;
    panel.replaceChildren(head('Báo cáo thực tập', 'Sinh viên nộp báo cáo sau khi nhận việc, doanh nghiệp đánh giá, nhà trường chứng thực',
      btn('Xuất CSV', 'neutral', () => csv(`bao-cao-thuc-tap-${uni?.short_name || 'truong'}.csv`, [
        ['Sinh viên', 'Vị trí', 'Doanh nghiệp', 'Trạng thái', 'Đánh giá DN', 'Mã chứng nhận', 'Ngày chứng thực'],
        ...list.filter(r => r.status !== 'draft').map(r => {
          const app = r.application as { job: { title: string; company: { name: string } | null } | null } | null;
          return [names.get(r.student_id) || '', app?.job?.title || '', app?.job?.company?.name || '', certLabel[r.status] || r.status, r.employer_rating == null ? '' : String(r.employer_rating), r.verification_code || '', r.certified_at ? formatDate(r.certified_at) : ''];
        })]), 'download')),
      el('div', { className: 'up-toolbar' }, pills([['submitted', `Chờ chứng thực (${c('submitted')})`], ['certified', `Đã chứng thực (${c('certified')})`], ['rejected', `Cần chỉnh sửa (${c('rejected')})`], ['all', `Tất cả (${c('all')})`]], reportFilter, v => { reportFilter = v; reports(); })),
      el('div', { className: 'up-rows' }, ...(rows.length ? rows : [el('p', { className: 'up-empty' }, 'Không có báo cáo nào.')])));
  }

  // --- Events -----------------------------------------------------------------------------
  async function events() {
    const list = await api.officerEvents(uniId);
    const rows = list.map(e => {
      const regCount = (e.event_registrations as unknown as { count: number }[] | null)?.[0]?.count ?? 0;
      const booths = e.event_booths ?? [];
      const pendingBooths = booths.filter(b => b.status === 'pending').length;
      const actions = el('div', { className: 'up-actions' },
        btn(`Người đăng ký (${regCount})`, 'neutral', () => registrations(e), 'how_to_reg'),
        btn(`Gian hàng (${booths.length})${pendingBooths ? ` · ${pendingBooths} chờ duyệt` : ''}`, pendingBooths ? 'primary' : 'neutral', () => boothDialog(e), 'storefront'),
        btn('Sửa', 'tertiary', () => eventForm(e)));
      if (e.status === 'draft') actions.append(btn('Công bố', 'primary', () => setEventStatus(e, 'published')));
      if (e.status === 'published') actions.append(btn('Hủy sự kiện', 'danger', () => setEventStatus(e, 'cancelled')));
      if (e.status === 'published' && new Date(e.ends_at) < new Date()) actions.append(btn('Đánh dấu đã kết thúc', 'tertiary', () => setEventStatus(e, 'completed')));
      if (e.status === 'draft' || e.status === 'cancelled') actions.append(btn('Xóa', 'tertiary', () => dialog('Xóa sự kiện?', `<p>Xóa vĩnh viễn "${esc(e.title)}" cùng danh sách đăng ký và gian hàng.</p>`, 'Xóa', async () => {
        await api.deleteEvent(e.id); toast('Đã xóa sự kiện.'); reload();
      }, { keepOpen: true })));
      return el('article', { className: 'up-row', id: `event-${e.id}` },
        el('div', { className: 'up-row__main' },
          el('div', { className: 'up-row__title' }, el('strong', {}, e.title), chip(e.status, eventStatusLabel)),
          el('p', { className: 'up-row__meta' }, `${formatDateTime(e.starts_at)} → ${formatDateTime(e.ends_at)} · ${e.is_virtual ? 'Trực tuyến' : e.location || 'Chưa có địa điểm'}${e.capacity ? ` · ${regCount}/${e.capacity} chỗ` : ` · ${regCount} người đăng ký`}`),
          e.description ? el('p', { className: 'up-row__summary' }, e.description) : null),
        actions);
    });
    panel.replaceChildren(head('Sự kiện & Career Fair', 'Tạo sự kiện, duyệt gian hàng doanh nghiệp và điểm danh sinh viên bằng mã vé', btn('Tạo sự kiện', 'primary', () => eventForm(), 'add')),
      el('div', { className: 'up-rows' }, ...(rows.length ? rows : [el('p', { className: 'up-empty' }, 'Chưa có sự kiện nào. Bấm "Tạo sự kiện" để bắt đầu.')])));
  }
  async function setEventStatus(e: api.OfficerEvent, status: 'published' | 'cancelled' | 'completed') {
    const ask = status === 'cancelled' ? confirm(`Hủy sự kiện "${e.title}"? Sinh viên đã đăng ký sẽ thấy trạng thái hủy.`) : true;
    if (!ask) return;
    try { await api.updateEvent(e.id, { status }); toast(status === 'published' ? 'Đã công bố sự kiện.' : status === 'cancelled' ? 'Đã hủy sự kiện.' : 'Đã cập nhật trạng thái.'); reload(); } catch (error) { showError(error); }
  }
  function eventForm(e?: api.OfficerEvent) {
    const nextWeek = (h: number, m: number) => { const d = new Date(Date.now() + 7 * 86400000); d.setHours(h, m, 0, 0); return d; };
    const start = localDateTimeInput(e ? e.starts_at : nextWeek(8, 30));
    const end = localDateTimeInput(e ? e.ends_at : nextWeek(16, 30));
    dialog(e ? 'Sửa sự kiện' : 'Tạo sự kiện', `
      <label>Tên sự kiện<input name="title" required minlength="3" maxlength="200" value="${esc(e?.title || '')}"></label>
      <label>Mô tả<textarea name="description" rows="4" maxlength="5000">${esc(e?.description || '')}</textarea></label>
      <div class="up-form-2"><label>Bắt đầu<input name="starts_at" type="datetime-local" required value="${start}"></label>
      <label>Kết thúc<input name="ends_at" type="datetime-local" required value="${end}"></label></div>
      <label>Địa điểm<input name="location" maxlength="300" value="${esc(e?.location || '')}" placeholder="Hội trường A5, cơ sở 1"></label>
      <div class="up-form-2"><label>Số chỗ tối đa (để trống = không giới hạn)<input name="capacity" type="number" min="1" value="${e?.capacity ?? ''}"></label>
      <label>Trạng thái<select name="status">${(['draft', 'published'] as const).concat(e && !['draft', 'published'].includes(e.status) ? [e.status as 'draft'] : []).map(s => `<option value="${s}"${(e?.status || 'draft') === s ? ' selected' : ''}>${eventStatusLabel[s]}</option>`).join('')}</select></label></div>
      <label><input name="is_virtual" type="checkbox"${e?.is_virtual ? ' checked' : ''}> Sự kiện trực tuyến</label>`,
    e ? 'Lưu thay đổi' : 'Tạo sự kiện', async f => {
      const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value.trim();
      const startsAt = new Date(v('starts_at')), endsAt = new Date(v('ends_at'));
      if (!(endsAt > startsAt)) throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.');
      const fields: api.EventFields = {
        title: v('title'), description: v('description') || null, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
        location: v('location') || null, capacity: v('capacity') ? Number(v('capacity')) : null,
        is_virtual: (f.elements.namedItem('is_virtual') as HTMLInputElement).checked, status: v('status') as api.EventFields['status'],
      };
      if (e) await api.updateEvent(e.id, fields); else await api.createEvent(uniId, fields);
      toast(e ? 'Đã cập nhật sự kiện.' : 'Đã tạo sự kiện.');
      reload();
    }, { keepOpen: true });
  }
  async function registrations(e: api.OfficerEvent) {
    const modal = dialog(`Người đăng ký · ${e.title}`, `<label>Điểm danh bằng mã vé<input name="code" placeholder="VD: 3F9A1C0B2D" autocomplete="off" required></label><div class="up-reg-list" aria-live="polite"></div>`, 'Điểm danh', async f => {
      const input = f.elements.namedItem('code') as HTMLInputElement;
      await api.checkIn(e.id, input.value);
      toast('Đã điểm danh.'); input.value = '';
      await fill();
      return false;
    }, { keepOpen: true });
    const box = modal.querySelector<HTMLElement>('.up-reg-list')!;
    async function fill() {
      showState(box, 'loading');
      try {
        const regs = await api.eventRegistrations(e.id);
        if (!regs.length) { showState(box, 'empty', 'Chưa có sinh viên đăng ký.'); return; }
        const exp = el('button', { type: 'button', className: 'ui-btn ui-btn--tertiary ui-btn--sm' }, 'Xuất CSV danh sách');
        exp.addEventListener('click', () => csv(`dang-ky-${e.id.slice(0, 8)}.csv`, [['Họ tên', 'Mã vé', 'Đăng ký lúc', 'Điểm danh lúc'], ...regs.map(r => [r.name, r.ticket_code, formatDateTime(r.created_at), r.checked_in_at ? formatDateTime(r.checked_in_at) : ''])]));
        box.replaceChildren(el('p', { className: 'app-muted' }, `${regs.length} đăng ký · ${regs.filter(r => r.checked_in_at).length} đã điểm danh`), exp,
          el('ul', { className: 'up-dialog-list' }, ...regs.map(r => el('li', {}, el('strong', {}, r.name), ` · ${r.ticket_code} · `,
            r.checked_in_at ? el('span', { className: 'ui-chip ui-chip--success' }, `Đã điểm danh ${formatDateTime(r.checked_in_at)}`) : el('span', { className: 'ui-chip ui-chip--neutral' }, 'Chưa điểm danh')))));
      } catch (error) { showState(box, 'error', toAppError(error).message); }
    }
    fill();
  }
  function boothDialog(e: api.OfficerEvent) {
    const booths = e.event_booths ?? [];
    const modal = dialog(`Gian hàng · ${e.title}`, booths.length ? '<ul class="up-dialog-list up-booths"></ul>' : '<p class="app-muted">Chưa có doanh nghiệp nào đăng ký gian hàng.</p>', 'Đóng');
    const list = modal.querySelector('.up-booths');
    for (const b of booths) {
      const company = b.company as { id: string; name: string } | null;
      const li = el('li', {}, el('strong', {}, company?.name || 'Doanh nghiệp'), ' ', chip(b.status, approvalLabel), b.note ? el('p', { className: 'app-muted' }, b.note) : null);
      if (b.status === 'pending') {
        const row = el('div', { className: 'up-actions' },
          btn('Duyệt', 'primary', async () => { const note = await askNote('Duyệt gian hàng', 'Duyệt', false); if (note === null) return; try { await api.reviewBooth(b.id, true, note || null); toast('Đã duyệt gian hàng.'); modal.close(); reload(); } catch (error) { showError(error); } }),
          btn('Từ chối', 'danger', async () => { const note = await askNote('Từ chối gian hàng', 'Từ chối', true); if (note === null) return; try { await api.reviewBooth(b.id, false, note); toast('Đã từ chối gian hàng.'); modal.close(); reload(); } catch (error) { showError(error); } }));
        li.append(row);
      }
      list?.append(li);
    }
  }

  // --- Partnerships -----------------------------------------------------------------------
  async function partners() {
    const list = await api.partnerships(uniId);
    const rows = list.map(p => {
      const company = p.company as { id: string; name: string } | null;
      return el('article', { className: 'up-row' },
        el('div', { className: 'up-row__main' },
          el('div', { className: 'up-row__title' }, el('a', { href: `/pages/company/?id=${encodeURIComponent(company?.id || '')}`, className: 'ui-link' }, company?.name || 'Doanh nghiệp'), chip(p.status, partnershipLabel)),
          el('p', { className: 'up-row__meta' }, [p.starts_on && `Từ ${formatDate(p.starts_on)}`, p.ends_on && `đến ${formatDate(p.ends_on)}`].filter(Boolean).join(' ') || 'Chưa có thời hạn'),
          p.note ? el('p', { className: 'up-row__note' }, p.note) : null),
        el('div', { className: 'up-actions' },
          btn('Sửa', 'tertiary', () => partnerForm(p)),
          btn('Xóa', 'tertiary', () => dialog('Xóa thỏa thuận hợp tác?', `<p>Xóa MoU với ${esc(company?.name || '')}. Doanh nghiệp sẽ không còn đăng tin độc quyền cho trường.</p>`, 'Xóa', async () => {
            await api.deletePartnership(p.id); toast('Đã xóa.'); reload();
          }, { keepOpen: true }))));
    });
    panel.replaceChildren(head('Đối tác doanh nghiệp (MoU)', 'Doanh nghiệp có thỏa thuận đang hiệu lực được hiển thị trên trang trường và đăng tin độc quyền cho sinh viên', btn('Thêm đối tác', 'primary', () => partnerForm(), 'add')),
      el('div', { className: 'up-rows' }, ...(rows.length ? rows : [el('p', { className: 'up-empty' }, 'Chưa có đối tác nào.')])));
  }
  function partnerForm(p?: Awaited<ReturnType<typeof api.partnerships>>[number]) {
    const company = p?.company as { id: string; name: string } | null | undefined;
    const modal = dialog(p ? `Sửa MoU · ${company?.name}` : 'Thêm đối tác', `
      ${p ? '' : `<label>Tìm doanh nghiệp<input name="q" type="search" placeholder="Nhập tên doanh nghiệp" autocomplete="off"></label>
      <label>Doanh nghiệp<select name="company" required><option value="">— Chọn doanh nghiệp —</option></select></label>`}
      <label>Trạng thái<select name="status">${Object.entries(partnershipLabel).map(([v, t]) => `<option value="${v}"${(p?.status || 'active') === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="up-form-2"><label>Ngày hiệu lực<input name="starts_on" type="date" value="${p?.starts_on || ''}"></label>
      <label>Ngày hết hạn<input name="ends_on" type="date" value="${p?.ends_on || ''}"></label></div>
      <label>Ghi chú<textarea name="note" rows="3" maxlength="2000">${esc(p?.note || '')}</textarea></label>`,
    p ? 'Lưu' : 'Thêm đối tác', async f => {
      const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | null)?.value.trim() || '';
      const fields = { status: v('status') as 'active', starts_on: v('starts_on') || null, ends_on: v('ends_on') || null, note: v('note') || null };
      if (fields.starts_on && fields.ends_on && fields.ends_on < fields.starts_on) throw new Error('Ngày hết hạn phải sau ngày hiệu lực.');
      if (p) await api.updatePartnership(p.id, fields);
      else {
        if (!v('company')) throw new Error('Vui lòng chọn doanh nghiệp.');
        await api.createPartnership(uniId, v('company'), fields);
      }
      toast(p ? 'Đã cập nhật đối tác.' : 'Đã thêm đối tác.');
      reload();
    }, { keepOpen: true });
    const q = modal.querySelector<HTMLInputElement>('input[name=q]');
    const select = modal.querySelector<HTMLSelectElement>('select[name=company]');
    if (q && select) {
      let timer = 0;
      const search = async () => {
        try {
          const found = await api.searchCompanies(q.value.trim());
          select.replaceChildren(el('option', { value: '' }, found.length ? '— Chọn doanh nghiệp —' : 'Không tìm thấy doanh nghiệp'),
            ...found.map(c => el('option', { value: c.id }, `${c.name}${c.city ? ` (${c.city})` : ''}${c.verification_status === 'verified' ? ' ✓' : ''}`)));
        } catch (error) { showError(error); }
      };
      q.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(search, 250); });
      search();
    }
  }

  // --- Inquiries --------------------------------------------------------------------------
  async function inquiries() {
    const list = await api.inquiries(uniId);
    const rows = list.map(i => {
      const status = el('select', { className: 'up-select', 'aria-label': 'Trạng thái liên hệ' }, ...Object.entries(inquiryLabel).map(([v, t]) => el('option', { value: v, selected: v === i.status }, t)));
      status.addEventListener('change', async () => {
        try { await api.setInquiryStatus(i.id, status.value as 'new'); toast('Đã cập nhật trạng thái.'); refreshCounts().catch(() => undefined); } catch (error) { showError(error); status.value = i.status; }
      });
      return el('article', { className: 'up-row' },
        el('div', { className: 'up-row__main' },
          el('div', { className: 'up-row__title' }, el('strong', {}, i.contact_name), i.company_name ? el('span', { className: 'up-muted' }, `· ${i.company_name}`) : null, chip(i.status, inquiryLabel)),
          el('p', { className: 'up-row__meta' }, [i.email, i.phone, formatDateTime(i.created_at)].filter(Boolean).join(' · ')),
          i.message ? el('p', { className: 'up-row__summary' }, i.message) : null),
        el('div', { className: 'up-actions' }, el('a', { className: 'ui-btn ui-btn--neutral ui-btn--sm', href: `mailto:${i.email}?subject=${encodeURIComponent(`Phản hồi hợp tác – ${uni?.short_name || uni?.name || ''}`)}` }, 'Trả lời email'), status));
    });
    panel.replaceChildren(head('Liên hệ hợp tác', 'Yêu cầu gửi từ nút "Liên hệ" trên trang trường công khai'),
      el('div', { className: 'up-rows' }, ...(rows.length ? rows : [el('p', { className: 'up-empty' }, 'Chưa có yêu cầu liên hệ nào.')])));
  }

  const renderers: Record<Tab, () => Promise<void>> = { overview, students, jobs, reports, events, partners, inquiries };
  window.addEventListener('hashchange', show);
  refreshCounts().catch(() => undefined);
  await show();
}
