// Admin console (Phase 5 core): overview, company verification, job moderation, accounts,
// reports and the audit log, all on live data through the admin RPCs.
import { currentProfile, currentRole, initSession, signOut } from '../../core/session';
import { dialog, toast } from '../../core/ui/feedback';
import { esc } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import { formatDateTime, formatStipend, jobStatusLabel, verifyStatusLabel, workTypeLabel } from '../../core/format';
import * as api from './api';
import '../../styles/platform.css';

type Tab = 'overview' | 'companies' | 'jobs' | 'users' | 'reports' | 'audit';
const titles: Record<Tab, string> = {
  overview: 'Tổng quan hệ thống', companies: 'Thẩm định doanh nghiệp', jobs: 'Duyệt tin tuyển dụng',
  users: 'Quản lý tài khoản', reports: 'Báo cáo vi phạm', audit: 'Nhật ký thao tác',
};
const descriptions: Record<Tab, string> = {
  overview: 'Những việc cần xử lý trên nền tảng.',
  companies: 'Kiểm tra mã số thuế và giấy phép kinh doanh trước khi cấp tích xanh.',
  jobs: 'Kiểm tra nội dung trước khi cho phép tin xuất hiện.',
  users: 'Kích hoạt cán bộ nhà trường, tạm khóa tài khoản vi phạm.',
  reports: 'Xem phản ánh, ghi nhận kết quả xác minh và xử lý.',
  audit: 'Mọi quyết định quản trị kèm người thực hiện và lý do.',
};
const statusFilters: Partial<Record<Tab, [string, string][]>> = {
  companies: [['pending', 'Chờ thẩm định'], ['verified', 'Đã xác thực'], ['rejected', 'Bị từ chối'], ['revoked', 'Đã thu hồi'], ['unverified', 'Chưa gửi hồ sơ']],
  jobs: [['pending_approval', 'Chờ duyệt'], ['active', 'Đang tuyển'], ['rejected', 'Bị từ chối'], ['paused', 'Tạm dừng'], ['closed', 'Đã đóng'], ['expired', 'Hết hạn']],
  users: [['pending_verification', 'Chờ kích hoạt'], ['active', 'Hoạt động'], ['suspended', 'Tạm khóa']],
  reports: [['open', 'Chờ xử lý'], ['in_review', 'Đang xem xét'], ['resolved', 'Đã xử lý'], ['dismissed', 'Không vi phạm']],
};
const defaultFilter: Partial<Record<Tab, string>> = { companies: 'pending', jobs: 'pending_approval', users: '', reports: 'open' };
const roleNames: Record<string, string> = { student: 'Sinh viên', employer: 'Nhà tuyển dụng', university_officer: 'Cán bộ nhà trường', admin: 'Quản trị viên' };
const accountStatus: Record<string, string> = { active: 'Hoạt động', pending_verification: 'Chờ kích hoạt', suspended: 'Tạm khóa', deactivated: 'Ngừng hoạt động' };
const reportStatus: Record<string, string> = { open: 'Chờ xử lý', in_review: 'Đang xem xét', resolved: 'Đã xử lý', dismissed: 'Không vi phạm' };
const reportReason: Record<string, string> = { scam_fee: 'Thu phí / lừa đảo', fake_job: 'Tin giả', harassment: 'Quấy rối', spam: 'Spam', misinformation: 'Sai sự thật', inappropriate: 'Không phù hợp', other: 'Khác' };
const tabs = Object.keys(titles) as Tab[];

const panel = document.getElementById('admin-panel')!;
const search = document.getElementById('admin-search') as HTMLInputElement;
const filter = document.getElementById('admin-filter') as HTMLSelectElement;
const count = document.getElementById('admin-count')!;
let tab: Tab = 'overview';
let rows: Record<string, unknown>[] = [];
let loadToken = 0;

const chip = (status: string, text: string) => `<span class="ei-chip ei-chip-${esc(status)}">${esc(text)}</span>`;
const table = (headings: string[], body: string) =>
  `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const button = (id: string, action: string, text: string) => `<button type="button" data-id="${esc(id)}" data-action="${action}">${text}</button>`;
const empty = (text = 'Không có mục nào cần xử lý.') => `<p class="admin-empty">${text}</p>`;

async function renderStats() {
  try {
    const o = await api.overview();
    const stats: [string, number, Tab][] = [
      ['Doanh nghiệp chờ thẩm định', o.companies_pending, 'companies'], ['Tin chờ duyệt', o.jobs_pending, 'jobs'],
      ['Cán bộ chờ kích hoạt', o.officers_pending, 'users'], ['Báo cáo cần xử lý', o.reports_open, 'reports'],
    ];
    document.getElementById('admin-stats')!.innerHTML = stats.map(([name, n, target]) =>
      `<a class="admin-stat" href="#${target}"><span>${name}</span><strong>${n}</strong><span>Xem danh sách →</span></a>`).join('');
    return o;
  } catch (error) { showError(error); return null; }
}

async function chooseTab() {
  const hash = location.hash.slice(1) as Tab;
  tab = tabs.includes(hash) ? hash : 'overview';
  search.value = '';
  filter.replaceChildren(new Option('Tất cả trạng thái', ''), ...(statusFilters[tab] ?? []).map(([v, t]) => new Option(t, v)));
  filter.value = defaultFilter[tab] ?? '';
  document.getElementById('admin-title')!.textContent = titles[tab];
  document.getElementById('admin-description')!.textContent = descriptions[tab];
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(link => link.dataset.tab === tab ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
  document.getElementById('admin-toolbar')!.hidden = tab === 'overview';
  filter.parentElement!.hidden = !statusFilters[tab];
  await load();
}

async function load() {
  const token = ++loadToken;
  panel.innerHTML = '<div class="app-state app-state-loading" role="status"><p>Đang tải dữ liệu...</p></div>';
  try {
    if (tab === 'overview') {
      const o = await renderStats();
      if (token !== loadToken) return;
      const users = o ? Object.entries(o.users_by_role).map(([r, n]) => `${roleNames[r] ?? r}: <strong>${n}</strong>`).join(' · ') : '';
      panel.innerHTML = `<div class="admin-overview">
        <article><h2>Kiểm duyệt nội dung</h2><p>Tin đang tuyển: <strong>${o?.jobs_active ?? 0}</strong>. Kiểm tra công ty, mô tả, phụ cấp và yêu cầu ứng viên trước khi duyệt tin.</p><a href="#jobs">Mở hàng đợi duyệt tin →</a></article>
        <article><h2>Thẩm định doanh nghiệp</h2><p>Xem giấy phép kinh doanh (GPKD) và mã số thuế trước khi cấp tích xanh.</p><a href="#companies">Mở hàng đợi thẩm định →</a></article>
        <article><h2>Hoạt động hôm nay</h2><p>Đơn ứng tuyển hôm nay: <strong>${o?.applications_today ?? 0}</strong> · Tuyển thành công tháng này: <strong>${o?.hires_this_month ?? 0}</strong></p><p>${users}</p></article>
      </div>`;
      return;
    }
    const status = filter.value;
    if (tab === 'companies') rows = await api.listCompanies(status as never);
    else if (tab === 'jobs') rows = await api.listJobs(status as never);
    else if (tab === 'users') rows = await api.listUsers({ status: status || undefined });
    else if (tab === 'reports') rows = await api.listReports(status as never);
    else rows = await api.listAudit();
    if (token !== loadToken) return;
    render();
  } catch (error) {
    if (token !== loadToken) return;
    panel.innerHTML = '';
    panel.append(Object.assign(document.createElement('div'), { className: 'app-state app-state-error' }));
    showError(error, panel.firstElementChild as HTMLElement);
  }
}

function matches(values: unknown[]) {
  const query = search.value.trim().toLocaleLowerCase('vi');
  return !query || values.join(' ').toLocaleLowerCase('vi').includes(query);
}

type Company = Awaited<ReturnType<typeof api.listCompanies>>[number];
type Job = Awaited<ReturnType<typeof api.listJobs>>[number];
type User = Awaited<ReturnType<typeof api.listUsers>>[number];
type Report = Awaited<ReturnType<typeof api.listReports>>[number];
type Audit = Awaited<ReturnType<typeof api.listAudit>>[number];

function render() {
  if (tab === 'companies') {
    const list = (rows as Company[]).filter(c => matches([c.name, c.tax_code, c.city]));
    count.textContent = `${list.length} doanh nghiệp`;
    panel.innerHTML = list.length ? table(['Doanh nghiệp', 'Trạng thái', 'Thao tác'], list.map(c => {
      const docs = (c.documents ?? []).length;
      const actions = [button(c.id, 'company-docs', `Giấy tờ (${docs})`)];
      if (c.verification_status === 'pending') actions.push(button(c.id, 'company-verify', 'Xác thực'), button(c.id, 'company-reject', 'Từ chối'));
      if (c.verification_status === 'verified') actions.push(button(c.id, 'company-revoke', 'Thu hồi'));
      return `<tr><td><strong>${esc(c.name)}</strong><small>MST: ${esc(c.tax_code ?? '—')} · ${esc(c.city ?? '')} · gửi lúc ${esc(formatDateTime(c.created_at))}</small>${c.verification_note ? `<small>Ghi chú: ${esc(c.verification_note)}</small>` : ''}</td>
        <td>${chip(c.verification_status, verifyStatusLabel[c.verification_status] ?? c.verification_status)}</td><td><div class="admin-actions">${actions.join('')}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'jobs') {
    const list = (rows as Job[]).filter(j => matches([j.title, j.company?.name, j.city]));
    count.textContent = `${list.length} tin`;
    panel.innerHTML = list.length ? table(['Tin tuyển dụng', 'Trạng thái', 'Thao tác'], list.map(j => {
      const actions = [button(j.id, 'job-view', 'Chi tiết')];
      if (j.status === 'pending_approval') actions.push(button(j.id, 'job-approve', 'Duyệt'), button(j.id, 'job-reject', 'Từ chối'));
      if (['active', 'paused'].includes(j.status)) actions.push(button(j.id, 'job-takedown', 'Gỡ tin'));
      return `<tr><td><strong>${esc(j.title)}</strong><small>${esc(j.company?.name ?? '')} · ${esc(j.city ?? '')} · ${esc(formatStipend(j.stipend_min, j.stipend_max))}</small>${j.rejection_reason ? `<small>Lý do: ${esc(j.rejection_reason)}</small>` : ''}</td>
        <td>${chip(j.status, jobStatusLabel[j.status] ?? j.status)}</td><td><div class="admin-actions">${actions.join('')}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'users') {
    const me = currentProfile()?.id;
    const list = (rows as User[]).filter(u => matches([u.full_name, u.email, roleNames[u.role]]));
    count.textContent = `${list.length} tài khoản`;
    panel.innerHTML = list.length ? table(['Tài khoản', 'Trạng thái', 'Thao tác'], list.map(u => {
      const officer = (Array.isArray(u.officer) ? u.officer[0] : u.officer) as { university?: { name: string } | null } | null;
      const actions: string[] = [];
      if (u.role !== 'admin' && u.id !== me) {
        if (u.status !== 'active') actions.push(button(u.id, 'user-activate', u.status === 'pending_verification' ? 'Kích hoạt' : 'Mở khóa'));
        if (u.status === 'active') actions.push(button(u.id, 'user-suspend', 'Tạm khóa'));
      }
      return `<tr><td><strong>${esc(u.full_name || '(chưa đặt tên)')}</strong><small>${esc(roleNames[u.role] ?? u.role)} · ${esc(u.email ?? '')}${officer?.university ? ` · ${esc(officer.university.name)}` : ''}</small>${u.status_reason ? `<small>Lý do: ${esc(u.status_reason)}</small>` : ''}</td>
        <td>${chip(u.status === 'pending_verification' ? 'pending' : u.status, accountStatus[u.status] ?? u.status)}</td><td><div class="admin-actions">${actions.join('') || '—'}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'reports') {
    const list = (rows as Report[]).filter(r => matches([r.details, reportReason[r.reason], r.target_type]));
    count.textContent = `${list.length} báo cáo`;
    panel.innerHTML = list.length ? table(['Báo cáo', 'Trạng thái', 'Thao tác'], list.map(r => {
      const actions = ['open', 'in_review'].includes(r.status)
        ? [button(r.id, 'report-review', 'Đang xem xét'), button(r.id, 'report-resolve', 'Xử lý vi phạm'), button(r.id, 'report-dismiss', 'Không vi phạm')] : [];
      return `<tr><td><strong>${esc(reportReason[r.reason] ?? r.reason)} · ${esc(r.target_type)}</strong><small>${esc(r.details ?? '')}</small><small>Đối tượng: ${esc(r.target_id)} · ${esc(formatDateTime(r.created_at))}</small>${r.resolution_note ? `<small>Kết quả: ${esc(r.resolution_note)}</small>` : ''}</td>
        <td>${chip(r.status === 'open' ? 'pending' : r.status === 'resolved' ? 'active' : r.status, reportStatus[r.status] ?? r.status)}</td><td><div class="admin-actions">${actions.join('') || '—'}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'audit') {
    const list = (rows as Audit[]).filter(a => matches([a.action, a.target_table, a.reason, (a.actor as { full_name?: string } | null)?.full_name]));
    count.textContent = `${list.length} thao tác`;
    panel.innerHTML = list.length ? table(['Thời gian', 'Thao tác', 'Đối tượng', 'Lý do'], list.map(a => {
      const actor = a.actor as { full_name?: string; email?: string } | null;
      return `<tr><td>${esc(formatDateTime(a.created_at))}<small>${esc(actor?.full_name || actor?.email || 'Hệ thống')}</small></td><td>${esc(a.action)}</td><td>${esc(a.target_table)}<small>${esc(a.target_id ?? '')}</small></td><td>${esc(a.reason ?? '')}</td></tr>`;
    }).join('')) : empty('Chưa có thao tác nào.');
  }
}

/** Ask for a reason (required unless `optional`), then run `fn`. */
function confirmWithReason(title: string, subject: string, fn: (reason: string) => Promise<void>, { optional = false, extra = '' } = {}) {
  dialog(title, `<p><strong>${esc(subject)}</strong></p>${extra}<label>${optional ? 'Ghi chú (không bắt buộc)' : 'Lý do / kết quả xác minh'}<textarea name="reason" ${optional ? '' : 'required'} maxlength="1000" placeholder="Ghi rõ lý do để lưu vào nhật ký..."></textarea></label>`, 'Xác nhận', async form => {
    const reason = (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();
    if (!optional && !reason) { toast('Vui lòng nhập lý do cụ thể.'); return; }
    try { await fn(reason); toast('Đã lưu quyết định.'); await renderStats(); await load(); }
    catch (error) { showError(error); }
  });
}

panel.addEventListener('click', async event => {
  const target = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if (!target) return;
  const id = target.dataset.id!;
  const action = target.dataset.action!;
  const row = rows.find(r => r.id === id) as Record<string, unknown> | undefined;
  if (!row) return;
  if (action === 'company-docs') {
    const company = row as unknown as Company;
    const docs = company.documents ?? [];
    const modal = dialog(`Giấy tờ — ${company.name}`, docs.length ? `<ul class="ei-list">${docs.map(d => `<li class="ei-row"><span><strong>${esc(d.doc_type === 'business_license' ? 'Giấy phép kinh doanh' : d.doc_type)}</strong><small class="ei-muted"> · ${esc(formatDateTime(d.created_at))}</small></span><button type="button" class="ei-button" data-path="${esc(d.file_path)}">Mở tệp</button></li>`).join('')}</ul>` : '<p>Doanh nghiệp chưa tải lên giấy tờ.</p>', 'Đóng');
    modal.querySelectorAll<HTMLButtonElement>('[data-path]').forEach(b => b.addEventListener('click', async () => {
      try { window.open(await api.documentUrl(b.dataset.path!), '_blank', 'noopener'); } catch (error) { showError(error); }
    }));
    return;
  }
  if (action === 'company-verify') {
    dialog('Xác thực doanh nghiệp', `<p>Cấp tích xanh cho <strong>${esc(String(row.name))}</strong> (MST ${esc(String(row.tax_code ?? '—'))})?</p>`, 'Xác thực', async () => {
      try { await api.reviewCompany(id, 'verified', null); toast('Đã xác thực doanh nghiệp.'); await renderStats(); await load(); } catch (error) { showError(error); }
    });
    return;
  }
  if (action === 'company-reject') return confirmWithReason('Từ chối hồ sơ thẩm định', String(row.name), reason => api.reviewCompany(id, 'rejected', reason));
  if (action === 'company-revoke') return confirmWithReason('Thu hồi tích xanh', `${row.name} — các tin đang tuyển sẽ bị tạm dừng`, reason => api.reviewCompany(id, 'revoked', reason));
  if (action === 'job-view') {
    const job = row as unknown as Job;
    dialog(job.title, `<p class="admin-detail"><strong>${esc(job.company?.name ?? '')}</strong>${job.company?.verification_status === 'verified' ? ' ✓' : ''} · ${esc(job.city ?? '')} · ${esc(workTypeLabel[job.work_type] ?? job.work_type)} · ${esc(formatStipend(job.stipend_min, job.stipend_max))}</p><p>Hạn nộp: ${esc(formatDateTime(job.deadline) || 'mặc định 30 ngày sau khi duyệt')}</p><h3>Mô tả</h3><p class="admin-detail">${esc(job.description)}</p>${job.requirements ? `<h3>Yêu cầu</h3><p class="admin-detail">${esc(job.requirements)}</p>` : ''}`, 'Đóng');
    return;
  }
  if (action === 'job-approve') {
    dialog('Duyệt tin', `<p>Xuất bản <strong>${esc(String(row.title))}</strong>?</p>`, 'Duyệt tin', async () => {
      try { await api.moderateJob(id, true, null); toast('Đã duyệt và xuất bản tin.'); await renderStats(); await load(); } catch (error) { showError(error); }
    });
    return;
  }
  if (action === 'job-reject') return confirmWithReason('Từ chối tin', String(row.title), reason => api.moderateJob(id, false, reason));
  if (action === 'job-takedown') return confirmWithReason('Gỡ tin vi phạm', String(row.title), reason => api.takeDownJob(id, reason));
  if (action === 'user-activate') return confirmWithReason(row.status === 'pending_verification' ? 'Kích hoạt tài khoản' : 'Mở khóa tài khoản', String(row.full_name || row.email), reason => api.setUserStatus(id, 'active', reason || null), { optional: true });
  if (action === 'user-suspend') return confirmWithReason('Tạm khóa tài khoản', String(row.full_name || row.email), reason => api.setUserStatus(id, 'suspended', reason));
  if (action === 'report-review') { try { await api.resolveReport(id, 'in_review', null, 'none'); toast('Đã chuyển sang đang xem xét.'); await load(); } catch (error) { showError(error); } return; }
  if (action === 'report-dismiss') return confirmWithReason('Không vi phạm', 'Đóng báo cáo, không áp dụng biện pháp', reason => api.resolveReport(id, 'dismissed', reason, 'none'));
  if (action === 'report-resolve') {
    const options = [['none', 'Chỉ ghi nhận'], ['hide_content', 'Ẩn nội dung'], ['close_job', 'Đóng tin tuyển dụng'], ['suspend_user', 'Tạm khóa tài khoản vi phạm']];
    const extra = `<label>Biện pháp<select name="action">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
    dialog('Xử lý vi phạm', `<p><strong>${esc(reportReason[String(row.reason)] ?? '')} · ${esc(String(row.target_type))}</strong></p>${extra}<label>Kết quả xác minh<textarea name="reason" required maxlength="1000"></textarea></label>`, 'Xác nhận', async form => {
      const reason = (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();
      const measure = (form.elements.namedItem('action') as HTMLSelectElement).value;
      if (!reason) { toast('Vui lòng nhập kết quả xác minh.'); return; }
      try { await api.resolveReport(id, 'resolved', reason, measure); toast('Đã xử lý báo cáo.'); await renderStats(); await load(); } catch (error) { showError(error); }
    });
  }
});

search.addEventListener('input', () => { if (tab !== 'overview') render(); });
filter.addEventListener('change', () => { void load(); });
window.addEventListener('hashchange', () => { void chooseTab(); });
document.getElementById('exit-admin')!.addEventListener('click', async () => {
  await signOut();
  location.replace('/pages/admin-login/');
});

async function main() {
  await initSession();
  if (currentRole() !== 'admin') { location.replace('/pages/admin-login/'); return; }
  const profile = currentProfile()!;
  document.getElementById('admin-name')!.textContent = profile.full_name || 'Quản trị viên';
  document.getElementById('admin-email-label')!.textContent = profile.email ?? '';
  document.getElementById('admin-initials')!.textContent = (profile.full_name || 'AD').split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
  document.getElementById('admin-app')!.hidden = false;
  await renderStats();
  await chooseTab();
  document.body.dataset.ready = 'true';
}
void main();
