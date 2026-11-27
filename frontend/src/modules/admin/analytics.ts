// Admin "Phân tích" (Phase 11): platform KPIs (get_platform_kpis) and moderation KPIs (get_moderation_kpis)
// from the analytics warehouse, refreshed nightly. And "Cài đặt": platform_settings (admins only, RLS).
import * as api from './api';
import { esc } from '../../core/ui/actions';
import { csv } from '../../core/ui/actions';
import { toast } from '../../core/ui/feedback';
import { showError } from '../../core/errors';
import { formatDateTime } from '../../core/format';

const METRICS: [keyof api.PlatformDay, string][] = [
  ['new_students', 'Sinh viên mới'], ['new_employers', 'Nhà tuyển dụng mới'], ['jobs_published', 'Tin được xuất bản'],
  ['applications', 'Đơn ứng tuyển'], ['hires', 'Nhận việc'], ['job_views', 'Lượt xem tin'], ['reports', 'Báo cáo vi phạm'],
];
let range = 30;

const dayLabel = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: number) => v.toLocaleString('vi-VN');

/** One series per chart (small multiples): past days muted, last day emphasised, square bar base. */
function chart(id: string, title: string, days: string[], values: number[]) {
  const W = 280, H = 72, band = W / Math.max(1, values.length), barW = Math.max(1, Math.min(24, band * 0.7));
  const max = Math.max(...values, 0);
  const total = values.reduce((a, b) => a + b, 0);
  const bars = values.map((v, i) => {
    const x = i * band + (band - barW) / 2, h = max ? (v / max) * (H - 4) : 0, y = H - h, r = Math.min(3, h, barW / 2);
    const bar = v ? `<path class="admin-ov-bar${i === values.length - 1 ? ' is-today' : ''}" d="M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${H}Z"/>` : '';
    return `<g class="admin-ov-band" role="img" aria-label="${dayLabel(days[i])}: ${v}"><title>${dayLabel(days[i])}: ${fmt(v)}</title><rect class="admin-ov-hit" x="${i * band}" y="0" width="${band}" height="${H}"/>${bar}</g>`;
  }).join('');
  return `<section class="ui-card admin-ov-card admin-ov-trend" aria-labelledby="${id}">
    <h3 class="admin-ov-subtitle" id="${id}">${esc(title)}</h3>
    <p class="admin-ov-trend__total"><strong>${fmt(total)}</strong> <span>trong ${values.length} ngày</span></p>
    <div class="admin-ov-chart"><svg viewBox="0 0 ${W} ${H + 1}" role="group" aria-label="${esc(title)}, ${values.length} ngày">${bars}<line class="admin-ov-axis" x1="0" x2="${W}" y1="${H + 0.5}" y2="${H + 0.5}"/></svg></div>
    <div class="admin-ov-xaxis"><span>${days.length ? dayLabel(days[0]) : ''}</span><span>${days.length ? dayLabel(days[days.length - 1]) : ''}</span></div>
  </section>`;
}

export async function renderAnalytics(panel: HTMLElement, alive: () => boolean) {
  const to = new Date(), from = new Date(Date.now() - (range - 1) * 86400000);
  const iso = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
  const [days, months] = await Promise.all([api.platformKpis(iso(from), iso(to)), api.moderationKpis(12)]);
  if (!alive()) return;
  const dates = days.map(d => d.date);
  const ranges = [7, 30, 90].map(r => `<button type="button" class="ui-pill" data-range="${r}" aria-pressed="${r === range}">${r} ngày</button>`).join('');
  const charts = METRICS.map(([key, label], i) => chart(`kpi-${i}`, label, dates, days.map(d => n(d[key])))).join('');
  const pct = (v: unknown) => v == null ? '—' : `${(Number(v) * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  const hours = (v: unknown) => v == null ? '—' : `${Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
  const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${mm}/${y}`; };
  const modTable = months.length ? `<div class="admin-table-wrap"><table class="admin-table admin-kpi-table">
    <thead><tr>${['Tháng', 'Duyệt tin', 'Từ chối', 'Tỷ lệ từ chối', 'Gỡ tin', 'Xác thực DN', 'Khóa TK', 'TG duyệt TB', 'Báo cáo mở', 'Đã đóng', 'Lừa phí', 'TG xử lý TB'].map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead>
    <tbody>${months.map(m => `<tr><th scope="row">${monthLabel(m.month)}</th><td>${n(m.jobs_approved)}</td><td>${n(m.jobs_rejected)}</td><td>${pct(m.job_reject_rate)}</td><td>${n(m.jobs_taken_down)}</td><td>${n(m.companies_verified)}</td><td>${n(m.users_suspended)}</td><td>${hours(m.avg_hours_to_job_decision)}</td><td>${n(m.reports_opened)}</td><td>${n(m.reports_closed)}</td><td>${n(m.scam_fee_reports)}</td><td>${hours(m.avg_hours_to_resolve)}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="admin-empty">Chưa có số liệu kiểm duyệt.</p>';

  panel.innerHTML = `<div class="admin-analytics">
    <div class="admin-analytics__bar"><div class="ui-pills" role="group" aria-label="Khoảng thời gian">${ranges}</div>
      <span class="admin-muted">Số liệu từ kho dữ liệu, cập nhật hằng đêm</span>
      <button type="button" class="ei-button" data-export="kpi">Xuất CSV</button></div>
    ${days.length ? `<div class="admin-ov-trends admin-analytics__grid">${charts}</div>` : '<p class="admin-empty">Kho dữ liệu chưa có số liệu cho khoảng thời gian này.</p>'}
    <section class="ui-card admin-ov-card"><h2 class="admin-ov-title">Kiểm duyệt theo tháng</h2>${modTable}</section>
  </div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-range]').forEach(b => b.addEventListener('click', () => {
    range = Number(b.dataset.range);
    panel.innerHTML = '<div class="app-state app-state-loading" role="status"><p>Đang tải dữ liệu...</p></div>';
    renderAnalytics(panel, alive).catch(error => showError(error));
  }));
  panel.querySelector('[data-export=kpi]')?.addEventListener('click', () => csv(`kpi-nen-tang-${iso(from)}_${iso(to)}.csv`, [
    ['Ngày', ...METRICS.map(([, l]) => l)], ...days.map(d => [d.date, ...METRICS.map(([k]) => String(n(d[k])))]),
    [], ['Tháng', 'Duyệt tin', 'Từ chối', 'Tỷ lệ từ chối', 'Gỡ tin', 'Xác thực DN', 'Khóa TK', 'TG duyệt TB (giờ)', 'Báo cáo mở', 'Đã đóng', 'Lừa phí', 'TG xử lý TB (giờ)'],
    ...months.map(m => [m.month, m.jobs_approved, m.jobs_rejected, m.job_reject_rate ?? '', m.jobs_taken_down, m.companies_verified, m.users_suspended, m.avg_hours_to_job_decision ?? '', m.reports_opened, m.reports_closed, m.scam_fee_reports, m.avg_hours_to_resolve ?? ''].map(v => String(v ?? ''))),
  ]));
}

const settingLabels: Record<string, string> = {
  job_default_duration_days: 'Số ngày tin mở mặc định (khi không đặt hạn)',
  offer_default_expiry_days: 'Số ngày phản hồi offer mặc định',
  default_pipeline_stages: 'Các cột Kanban mặc định cho tin mới',
  commission_rate: 'Tỷ lệ hoa hồng mỗi lượt tuyển thành công',
  posting_packages: 'Gói đăng tin',
};

export async function renderSettings(panel: HTMLElement, alive: () => boolean) {
  const rows = await api.listSettings();
  if (!alive()) return;
  panel.innerHTML = rows.length ? `<div class="admin-settings">${rows.map(s => `
    <form class="ui-card admin-setting" data-key="${esc(s.key)}">
      <div class="admin-setting__head"><label for="setting-${esc(s.key)}"><strong>${esc(settingLabels[s.key] ?? s.key)}</strong></label><code>${esc(s.key)}</code></div>
      ${s.description ? `<p class="admin-muted">${esc(s.description)}</p>` : ''}
      <textarea id="setting-${esc(s.key)}" name="value" rows="${Math.min(8, Math.max(2, JSON.stringify(s.value, null, 2).split('\n').length))}" spellcheck="false">${esc(JSON.stringify(s.value, null, 2))}</textarea>
      <p class="app-form-error" role="alert" hidden></p>
      <div class="admin-setting__foot"><small class="admin-muted">Cập nhật ${esc(formatDateTime(s.updated_at))}</small><button type="submit" class="ei-button ei-button-primary">Lưu</button></div>
    </form>`).join('')}</div>` : '<p class="admin-empty">Chưa có cấu hình nào.</p>';
  panel.querySelectorAll<HTMLFormElement>('form[data-key]').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const box = form.querySelector<HTMLElement>('.app-form-error')!;
    const text = (form.elements.namedItem('value') as HTMLTextAreaElement).value;
    let value: unknown;
    try { value = JSON.parse(text); } catch { box.textContent = 'Giá trị phải là JSON hợp lệ (số, chuỗi trong dấu ngoặc kép, mảng hoặc đối tượng).'; box.hidden = false; return; }
    box.hidden = true;
    try { await api.updateSetting(form.dataset.key!, value); toast('Đã lưu cấu hình.'); await renderSettings(panel, alive); }
    catch (error) { showError(error, box); }
  }));
}
