// Admin overview ("Tổng quan"): what needs a decision now, platform health, 14-day activity, recent admin actions.
// Order follows the moderator's day: queues first (with their SLA), context after.
import * as api from './api';
import { esc } from '../../core/ui/actions';
import { formatDate } from '../../core/format';
import { auditTable, formatAuditAction, reportReason, reportTarget, roleNames } from './labels';

type QueueTab = 'companies' | 'jobs' | 'users' | 'reports';
type Item = { tab: QueueTab; title: string; sub: string; since: string };

/** Target handling time per queue, in minutes (jobs: 60, the same promise as the "Quá hạn 60 phút" chip in the jobs tab). */
const SLA: Record<QueueTab, number> = { jobs: 60, reports: 24 * 60, companies: 48 * 60, users: 48 * 60 };
const QUEUES: { tab: QueueTab; label: string; unit: string; kind: string; countKey: keyof api.Overview }[] = [
  { tab: 'companies', label: 'Doanh nghiệp chờ thẩm định', unit: 'hồ sơ', kind: 'Thẩm định', countKey: 'companies_pending' },
  { tab: 'jobs', label: 'Tin chờ duyệt', unit: 'tin', kind: 'Duyệt tin', countKey: 'jobs_pending' },
  { tab: 'users', label: 'Cán bộ chờ kích hoạt', unit: 'tài khoản', kind: 'Kích hoạt', countKey: 'officers_pending' },
  { tab: 'reports', label: 'Báo cáo cần xử lý', unit: 'báo cáo', kind: 'Báo cáo', countKey: 'reports_open' },
];
const DAYS = 14;

const minutesSince = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
const isOverdue = (i: Item) => minutesSince(i.since) > SLA[i.tab];
/** "12 phút" / "5 giờ" / "3 ngày": how long an item has waited. */
function waited(iso: string) {
  const min = Math.round(minutesSince(iso));
  if (min < 60) return `${min} phút`;
  const hours = Math.round(min / 60);
  return hours < 48 ? `${hours} giờ` : `${Math.round(hours / 24)} ngày`;
}

async function loadQueues(): Promise<Item[]> {
  const [jobs, companies, users, reports] = await Promise.all([
    api.listJobs('pending_approval'), api.listCompanies('pending'), api.listUsers({ status: 'pending_verification' }), api.listReports('open'),
  ]);
  const now = new Date().toISOString();
  return [
    ...jobs.map(j => ({ tab: 'jobs' as const, title: j.title, sub: j.company?.name ?? '', since: j.submitted_at ?? now })),
    ...companies.map(c => {
      // The newest uploaded document marks when the file was (re)submitted for review
      const sent = (c.documents ?? []).map(d => d.created_at).sort().pop();
      return { tab: 'companies' as const, title: c.name, sub: `MST ${c.tax_code ?? '—'}${c.city ? ` · ${c.city}` : ''}`, since: sent ?? c.created_at };
    }),
    ...users.map(u => ({ tab: 'users' as const, title: u.full_name || u.email || '(chưa đặt tên)', sub: `${roleNames[u.role] ?? u.role}${u.email ? ` · ${u.email}` : ''}`, since: u.created_at })),
    ...reports.map(r => ({ tab: 'reports' as const, title: reportReason[r.reason] ?? r.reason, sub: `${reportTarget[r.target_type] ?? r.target_type}${r.details ? ` · ${r.details}` : ''}`, since: r.created_at })),
  ];
}

/** KPI row: one tile per queue; the value is the RPC count, the foot says how old the oldest item is and how many are overdue. */
function renderTiles(stats: HTMLElement, o: api.Overview | null, items: Item[]) {
  stats.innerHTML = QUEUES.map(q => {
    const mine = items.filter(i => i.tab === q.tab);
    const count = o ? Number(o[q.countKey]) : mine.length;
    const oldest = mine.map(i => i.since).sort()[0];
    const late = mine.filter(isOverdue).length;
    const foot = !count
      ? `<span class="admin-stat__foot admin-stat__foot--done"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Đã xử lý hết</span>`
      : `<span class="admin-stat__foot admin-stat__foot--meta">${oldest ? `Lâu nhất: chờ ${esc(waited(oldest))}` : 'Xem danh sách'}</span>${late ? `<span class="ei-chip ei-chip-pending admin-stat__late"><span class="material-symbols-outlined" aria-hidden="true">schedule</span>${late} quá hạn</span>` : ''}`;
    return `<a class="admin-stat" href="#${q.tab}"><span class="admin-stat__label">${q.label}</span><span class="admin-stat__value"><strong>${count}</strong><span>${q.unit}</span></span><span class="admin-stat__feet">${foot}</span></a>`;
  }).join('');
}

/** The most urgent items across every queue, ranked by how far past their SLA they are. */
function priorityQueue(items: Item[]) {
  const ranked = [...items].sort((a, b) => minutesSince(b.since) / SLA[b.tab] - minutesSince(a.since) / SLA[a.tab]).slice(0, 6);
  const kind = (tab: QueueTab) => QUEUES.find(q => q.tab === tab)!.kind;
  const body = ranked.length
    ? `<ul class="admin-ov-queue">${ranked.map(i => {
        const late = isOverdue(i);
        return `<li class="admin-ov-queue__row">
          <span class="ei-chip admin-ov-queue__kind">${kind(i.tab)}</span>
          <span class="admin-ov-queue__body"><strong>${esc(i.title)}</strong><small>${esc(i.sub)}</small></span>
          <span class="admin-ov-queue__wait${late ? ' is-late' : ''}">${late ? '<span class="material-symbols-outlined" aria-hidden="true">schedule</span>' : ''}Chờ ${esc(waited(i.since))}${late ? '<span class="sr-only"> (quá hạn)</span>' : ''}</span>
          <a class="ui-btn ui-btn--neutral ui-btn--sm" href="#${i.tab}">Xử lý</a>
        </li>`;
      }).join('')}</ul>`
    : `<div class="admin-ov-clear"><span class="material-symbols-outlined" aria-hidden="true">task_alt</span><p><strong>Không còn việc tồn đọng</strong><br>Mọi hàng đợi đều đã được xử lý.</p></div>`;
  const total = items.length;
  return `<section class="ui-card admin-ov-card" aria-labelledby="ov-queue">
    <div class="admin-ov-card__head"><h2 class="admin-ov-title" id="ov-queue">Cần xử lý trước</h2><span class="admin-ov-note">${total ? `${Math.min(6, total)} / ${total} việc · xếp theo mức quá hạn` : ''}</span></div>
    ${body}</section>`;
}

function health(o: api.Overview | null) {
  const roles = Object.entries(o?.users_by_role ?? {}).sort((a, b) => b[1] - a[1]);
  const totalUsers = roles.reduce((s, [, n]) => s + n, 0);
  const max = Math.max(1, ...roles.map(([, n]) => n));
  return `<section class="ui-card admin-ov-card" aria-labelledby="ov-health">
    <h2 class="admin-ov-title" id="ov-health">Sức khỏe nền tảng</h2>
    <dl class="admin-ov-figures">
      <div><dt>Tin đang tuyển</dt><dd>${o?.jobs_active ?? 0}</dd></div>
      <div><dt>Đơn ứng tuyển hôm nay</dt><dd>${o?.applications_today ?? 0}</dd></div>
      <div><dt>Tuyển thành công tháng này</dt><dd>${o?.hires_this_month ?? 0}</dd></div>
    </dl>
    <h3 class="admin-ov-subtitle">Người dùng <span>${totalUsers}</span></h3>
    <ul class="admin-ov-meters">${roles.map(([role, n]) =>
      `<li><span class="admin-ov-meters__name">${esc(roleNames[role] ?? role)}</span><span class="admin-ov-meters__track" aria-hidden="true"><span style="width:${(n / max) * 100}%"></span></span><span class="admin-ov-meters__value">${n}</span></li>`).join('')}</ul>
  </section>`;
}

/** Local midnights of the last DAYS days, oldest first. */
function lastDays() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: DAYS }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - (DAYS - 1 - i)); return d; });
}
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function perDay(timestamps: string[], days: Date[]) {
  const index = new Map(days.map((d, i) => [dayKey(d), i]));
  const counts = days.map(() => 0);
  for (const t of timestamps) { const i = index.get(dayKey(new Date(t))); if (i != null) counts[i]++; }
  return counts;
}
const dayLabel = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * One single-series column chart (small multiple): emphasis form, past days in the recessive grey and today in ink.
 * Bars ≤ 24px with a 4px rounded top and a square base on one baseline; zero draws nothing. Each day is a focusable
 * band (hit target = the whole band) that drives the shared tooltip; values are also in the table view.
 */
function columnChart(id: string, title: string, values: number[], days: Date[]) {
  const W = 280, H = 72, band = W / values.length, barW = 12, max = Math.max(...values);
  const last7 = values.slice(-7).reduce((a, b) => a + b, 0), prev7 = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  const diff = last7 - prev7;
  const delta = diff === 0
    ? `<span class="admin-ov-delta">Không đổi so với 7 ngày trước</span>`
    : `<span class="admin-ov-delta ${diff > 0 ? 'is-up' : 'is-down'}"><span class="material-symbols-outlined" aria-hidden="true">${diff > 0 ? 'arrow_upward' : 'arrow_downward'}</span>${diff > 0 ? '+' : '−'}${Math.abs(diff)} so với 7 ngày trước</span>`;
  const bars = values.map((v, i) => {
    const x = i * band + (band - barW) / 2;
    const h = max ? (v / max) * (H - 4) : 0, y = H - h, r = Math.min(4, h);
    const bar = v ? `<path class="admin-ov-bar${i === values.length - 1 ? ' is-today' : ''}" d="M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${H}Z"/>` : '';
    const when = i === values.length - 1 ? 'Hôm nay' : dayLabel(days[i]);
    return `<g class="admin-ov-band" tabindex="0" role="img" aria-label="${when}: ${v}" data-tip-value="${v}" data-tip-label="${when}" data-x="${((i + 0.5) / values.length) * 100}"><rect class="admin-ov-hit" x="${i * band}" y="0" width="${band}" height="${H}"/>${bar}</g>`;
  }).join('');
  return `<section class="ui-card admin-ov-card admin-ov-trend" aria-labelledby="${id}">
    <h3 class="admin-ov-subtitle" id="${id}">${title}</h3>
    <p class="admin-ov-trend__total"><strong>${last7}</strong> <span>trong 7 ngày qua</span></p>
    ${delta}
    <div class="admin-ov-chart">
      <svg viewBox="0 0 ${W} ${H + 1}" role="group" aria-label="${title}, ${DAYS} ngày gần nhất">${bars}<line class="admin-ov-axis" x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}"/></svg>
      <div class="admin-ov-tip" role="status" hidden></div>
    </div>
    <div class="admin-ov-xaxis"><span>${dayLabel(days[0])}</span><span>Hôm nay</span></div>
  </section>`;
}

async function recent() {
  const rows = (await api.listAudit()).slice(0, 6);
  const names = await api.resolveTargetNames(rows.map(a => ({ target_table: a.target_table, target_id: a.target_id })));
  const items = rows.map(a => {
    const actor = a.actor as { full_name?: string; email?: string } | null;
    const target = (a.target_id && names.get(a.target_id)) || `${auditTable[a.target_table] ?? a.target_table} (đã xóa)`;
    return `<li><span class="admin-ov-recent__what"><strong>${esc(formatAuditAction(a.action))}</strong> · ${esc(target)}</span><small>${esc(actor?.full_name || actor?.email || 'Hệ thống')} · ${esc(formatDate(a.created_at))} ${esc(new Date(a.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }))}</small></li>`;
  }).join('');
  return `<section class="ui-card admin-ov-card" aria-labelledby="ov-recent">
    <div class="admin-ov-card__head"><h2 class="admin-ov-title" id="ov-recent">Hoạt động quản trị gần đây</h2><a class="admin-ov-link" href="#audit">Xem nhật ký →</a></div>
    ${items ? `<ul class="admin-ov-recent">${items}</ul>` : '<p class="admin-ov-note">Chưa có thao tác nào.</p>'}</section>`;
}

function bindTooltips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.admin-ov-chart').forEach(chart => {
    const tip = chart.querySelector<HTMLElement>('.admin-ov-tip')!;
    const show = (band: Element) => {
      const value = document.createElement('strong'); value.textContent = band.getAttribute('data-tip-value') ?? '';
      const label = document.createElement('span'); label.textContent = band.getAttribute('data-tip-label') ?? '';
      tip.replaceChildren(value, label);
      tip.style.left = `${band.getAttribute('data-x')}%`;
      tip.hidden = false;
    };
    chart.querySelectorAll('.admin-ov-band').forEach(band => {
      band.addEventListener('pointerenter', () => show(band));
      band.addEventListener('focus', () => show(band));
    });
    chart.addEventListener('pointerleave', () => { tip.hidden = true; });
    chart.addEventListener('focusout', () => { tip.hidden = true; });
  });
}

/** Render the whole overview into the KPI strip and the panel. Returns the RPC overview (or null). */
export async function renderOverview(stats: HTMLElement, panel: HTMLElement, isCurrent: () => boolean) {
  const days = lastDays();
  const [o, items, activity, recentHtml] = await Promise.all([
    api.overview().catch(() => null),
    loadQueues().catch(() => [] as Item[]),
    api.activitySince(days[0].toISOString()).catch(() => null),
    recent().catch(() => '<section class="ui-card admin-ov-card"><p class="admin-ov-note">Không tải được nhật ký.</p></section>'),
  ]);
  if (!isCurrent()) return o;
  renderTiles(stats, o, items);
  const series = activity ? {
    applications: perDay(activity.applications, days), signups: perDay(activity.signups, days), approvals: perDay(activity.approvals, days),
  } : null;
  const table = series ? `<details class="admin-ov-table"><summary>Xem số liệu dạng bảng</summary><div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th scope="col">Ngày</th><th scope="col">Đơn ứng tuyển</th><th scope="col">Tài khoản mới</th><th scope="col">Tin được duyệt</th></tr></thead>
    <tbody>${days.map((d, i) => `<tr><td>${dayLabel(d)}</td><td>${series.applications[i]}</td><td>${series.signups[i]}</td><td>${series.approvals[i]}</td></tr>`).reverse().join('')}</tbody></table></div></details>` : '';
  panel.innerHTML = `<div class="admin-ov">
    <div class="admin-ov__grid">${priorityQueue(items)}${health(o)}</div>
    <div class="admin-ov__section-head"><h2 class="admin-ov-title">Hoạt động ${DAYS} ngày qua</h2><span class="admin-ov-note">Cột đậm là hôm nay</span></div>
    ${series ? `<div class="admin-ov__trends">
      ${columnChart('ov-apps', 'Đơn ứng tuyển', series.applications, days)}
      ${columnChart('ov-signups', 'Tài khoản mới', series.signups, days)}
      ${columnChart('ov-approvals', 'Tin được duyệt', series.approvals, days)}
    </div>${table}` : '<p class="admin-ov-note">Không tải được số liệu hoạt động.</p>'}
    ${recentHtml}
  </div>`;
  bindTooltips(panel);
  return o;
}
