// Admin console (Phase 5 core): overview, company verification, job moderation, accounts,
// reports and the audit log, all on live data through the admin RPCs.
import { currentProfile, currentRole, initSession, signOut } from '../../core/session';
import { dialog, toast } from '../../core/ui/feedback';
import { csv, esc } from '../../core/ui/actions';
import { renderAnalytics, renderSettings } from './analytics';
import { showError } from '../../core/errors';
import { formatDate, formatDateTime, formatStipend, jobStatusLabel, relativeTime, verifyStatusLabel, workTypeLabel } from '../../core/format';
import { companyHref, jobHref } from '../../core/navigation';
import * as api from './api';
import { auditTable, formatAuditAction, reportReason, reportTarget, roleNames } from './labels';
import { renderOverview } from './overview';
import '../../styles/platform.css';

type Tab = 'overview' | 'companies' | 'jobs' | 'users' | 'reports' | 'audit' | 'analytics' | 'settings';
const titles: Record<Tab, string> = {
  overview: 'Tổng quan hệ thống', companies: 'Thẩm định doanh nghiệp', jobs: 'Duyệt tin tuyển dụng',
  users: 'Quản lý tài khoản', reports: 'Báo cáo vi phạm', audit: 'Nhật ký thao tác',
  analytics: 'Phân tích nền tảng', settings: 'Cài đặt nền tảng',
};
/** Tabs that render their own panel (no search / filters / pager). */
const panelTabs: Tab[] = ['overview', 'analytics', 'settings'];
const descriptions: Record<Tab, string> = {
  overview: 'Những việc cần xử lý trên nền tảng.',
  companies: 'Kiểm tra mã số thuế và giấy phép kinh doanh trước khi cấp tích xanh.',
  jobs: 'Kiểm tra nội dung trước khi cho phép tin xuất hiện.',
  users: 'Kích hoạt cán bộ nhà trường, tạm khóa tài khoản vi phạm.',
  reports: 'Xem phản ánh, ghi nhận kết quả xác minh và xử lý.',
  audit: 'Mọi quyết định quản trị kèm người thực hiện và lý do.',
  analytics: 'Chỉ số tăng trưởng, tuyển dụng và kiểm duyệt theo ngày và theo tháng.',
  settings: 'Tham số vận hành dùng chung (thời hạn tin, cột Kanban mặc định, gói tin).',
};
const statusFilters: Partial<Record<Tab, [string, string][]>> = {
  companies: [['pending', 'Chờ thẩm định'], ['verified', 'Đã xác thực'], ['rejected', 'Bị từ chối'], ['revoked', 'Đã thu hồi'], ['unverified', 'Chưa gửi hồ sơ']],
  jobs: [['pending_approval', 'Chờ duyệt'], ['active', 'Đang tuyển'], ['rejected', 'Bị từ chối'], ['paused', 'Tạm dừng'], ['closed', 'Đã đóng'], ['expired', 'Hết hạn']],
  users: [['pending_verification', 'Chờ kích hoạt'], ['active', 'Hoạt động'], ['suspended', 'Tạm khóa']],
  reports: [['open', 'Chờ xử lý'], ['in_review', 'Đang xem xét'], ['resolved', 'Đã xử lý'], ['dismissed', 'Không vi phạm']],
  audit: [['job', 'Tin tuyển dụng'], ['company', 'Doanh nghiệp'], ['user', 'Tài khoản'], ['report', 'Báo cáo']],
};
const defaultFilter: Partial<Record<Tab, string>> = { companies: 'pending', jobs: 'pending_approval', users: '', reports: 'open' };
const accountStatus: Record<string, string> = { active: 'Hoạt động', pending_verification: 'Chờ kích hoạt', suspended: 'Tạm khóa', deactivated: 'Ngừng hoạt động' };
const reportStatus: Record<string, string> = { open: 'Chờ xử lý', in_review: 'Đang xem xét', resolved: 'Đã xử lý', dismissed: 'Không vi phạm' };

const tabs = Object.keys(titles) as Tab[];

const panel = document.getElementById('admin-panel')!;
const search = document.getElementById('admin-search') as HTMLInputElement;
const roleSelect = document.getElementById('admin-role') as HTMLSelectElement | null;
const filters = document.getElementById('admin-filters')!;
const count = document.getElementById('admin-count')!;
const pager = document.getElementById('admin-pager')!;
const pagerTop = document.getElementById('admin-pager-top')!;
const board = document.getElementById('admin-board')!;
const PAGE_SIZE = 15;
let tab: Tab = 'overview';
let status = '';
let pageNo = 1;
let rows: Record<string, unknown>[] = [];
let targetNames = new Map<string, string>();
let auditView: Audit[] = [];
let loadToken = 0;

const chip = (status: string, text: string) => `<span class="ei-chip ei-chip-${esc(status)}">${esc(text)}</span>`;
const table = (headings: string[], body: string) =>
  `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headings.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const button = (id: string, action: string, text: string) => `<button type="button" data-id="${esc(id)}" data-action="${action}">${text}</button>`;
const empty = (text = 'Không có mục nào cần xử lý.') => `<p class="admin-empty">${text}</p>`;

/** Status filter pills ("Tất cả" + the tab's statuses); the pressed one is the active filter. */
function renderFilters() {
  const options: [string, string][] = [['', 'Tất cả'], ...(statusFilters[tab] ?? [])];
  filters.hidden = !statusFilters[tab];
  filters.innerHTML = options.map(([value, text]) =>
    `<button type="button" class="ui-pill" data-status="${value}" aria-pressed="${value === status}">${esc(text)}</button>`).join('');
}

/** Clamp the current page to `list` and return that page's slice. */
function paginate<T>(list: T[]) {
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  pageNo = Math.min(Math.max(1, pageNo), pages);
  return list.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
}

/** Pager under the table: "Hiển thị 16–30 trên 42" and prev / numbered / next buttons (1 … 4 5 6 … 14). */
function renderPager(total: number) {
  const pages = Math.ceil(total / PAGE_SIZE);
  pager.hidden = pagerTop.hidden = pages <= 1;
  if (pages <= 1) { pager.innerHTML = pagerTop.innerHTML = ''; return; }
  // Compact copy above the table, so paging is visible without scrolling to the bottom.
  pagerTop.innerHTML = `<button type="button" data-page="${pageNo - 1}" aria-label="Trang trước (đầu bảng)"${pageNo === 1 ? ' disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>
    <span>Trang <strong>${pageNo}</strong>/${pages}</span>
    <button type="button" data-page="${pageNo + 1}" aria-label="Trang sau (đầu bảng)"${pageNo === pages ? ' disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>`;
  const shown = [...new Set([1, pageNo - 1, pageNo, pageNo + 1, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const numbers = shown.map((n, i) => `${i && n - shown[i - 1] > 1 ? '<span class="admin-pager__gap" aria-hidden="true">…</span>' : ''}<button type="button" class="admin-pager__page" data-page="${n}" aria-label="Trang ${n}"${n === pageNo ? ' aria-current="page"' : ''}>${n}</button>`).join('');
  const from = (pageNo - 1) * PAGE_SIZE + 1;
  pager.innerHTML = `<p class="admin-pager__info">Hiển thị <strong>${from}–${Math.min(pageNo * PAGE_SIZE, total)}</strong> trên <strong>${total}</strong></p>
    <div class="admin-pager__pages">
      <button type="button" class="admin-pager__step" data-page="${pageNo - 1}" aria-label="Trang trước"${pageNo === 1 ? ' disabled' : ''}><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span><span>Trước</span></button>
      ${numbers}
      <button type="button" class="admin-pager__step" data-page="${pageNo + 1}" aria-label="Trang sau"${pageNo === pages ? ' disabled' : ''}><span>Sau</span><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>
    </div>`;
}

/** The KPI strip only shows on the overview, which rebuilds it on every visit (overview.ts); list-tab actions need no refresh here. */
async function renderStats() {
  if (tab === 'overview') await load();
}

async function chooseTab() {
  const hash = location.hash.slice(1) as Tab;
  tab = tabs.includes(hash) ? hash : 'overview';
  search.value = '';
  status = defaultFilter[tab] ?? '';
  pageNo = 1;
  targetNames.clear();
  const isUsers = tab === 'users';
  if (roleSelect) {
    roleSelect.hidden = !isUsers;
    if (!isUsers) roleSelect.value = '';
  }
  renderFilters();
  document.getElementById('admin-title')!.textContent = titles[tab];
  document.getElementById('admin-description')!.textContent = descriptions[tab];
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(link => link.dataset.tab === tab ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current'));
  document.getElementById('admin-toolbar')!.hidden = panelTabs.includes(tab);
  document.getElementById('admin-stats')!.hidden = tab !== 'overview';
  document.getElementById('admin-refresh')!.hidden = tab !== 'overview';
  board.classList.toggle('is-list', !panelTabs.includes(tab));
  await load();
}

async function load() {
  const token = ++loadToken;
  panel.innerHTML = '<div class="app-state app-state-loading" role="status"><p>Đang tải dữ liệu...</p></div>';
  pager.hidden = pagerTop.hidden = true;
  try {
    if (tab === 'overview') {
      await renderOverview(document.getElementById('admin-stats')!, panel, () => token === loadToken);
      if (token !== loadToken) return;
      const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      document.getElementById('admin-description')!.textContent = `${descriptions.overview} Cập nhật lúc ${time}.`;
      return;
    }
    if (tab === 'analytics') { await renderAnalytics(panel, () => token === loadToken); return; }
    if (tab === 'settings') { await renderSettings(panel, () => token === loadToken); return; }
    if (tab === 'companies') rows = await api.listCompanies(status as never);
    else if (tab === 'jobs') rows = await api.listJobs(status as never);
    else if (tab === 'users') rows = await api.listUsers({ status: status || undefined });
    else if (tab === 'reports') {
      rows = await api.listReports(status as never);
      if (token !== loadToken) return;
      const targets = (rows as Report[]).map(r => ({ target_type: r.target_type, target_id: r.target_id }));
      targetNames = await api.resolveTargetNames(targets);
    } else {
      rows = await api.listAudit();
      if (token !== loadToken) return;
      const targets = (rows as Audit[]).map(a => ({ target_table: a.target_table, target_id: a.target_id }));
      targetNames = await api.resolveTargetNames(targets);
    }
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
  let total = 0;
  if (tab === 'companies') {
    const list = (rows as Company[]).filter(c => matches([c.name, c.tax_code, c.city]));
    count.textContent = `${list.length} doanh nghiệp`;
    total = list.length;
    panel.innerHTML = list.length ? table(['Doanh nghiệp', 'Trạng thái', 'Thao tác'], paginate(list).map(c => {
      const docs = (c.documents ?? []).length;
      const actions = [button(c.id, 'company-docs', `Giấy tờ (${docs})`)];
      if (c.verification_status === 'pending') actions.push(button(c.id, 'company-verify', 'Xác thực'), button(c.id, 'company-reject', 'Từ chối'));
      if (c.verification_status === 'verified') actions.push(button(c.id, 'company-revoke', 'Thu hồi'));
      return `<tr><td><strong>${esc(c.name)}</strong><small>MST: ${esc(c.tax_code ?? '—')} · ${esc(c.city ?? '')} · gửi lúc ${esc(formatDateTime(c.created_at))}</small>${c.verification_note ? `<small>Ghi chú: ${esc(c.verification_note)}</small>` : ''}</td>
        <td>${chip(c.verification_status, verifyStatusLabel[c.verification_status] ?? c.verification_status)}</td><td><div class="admin-actions">${actions.join('')}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'jobs') {
    let list = (rows as Job[]).filter(j => matches([j.title, j.company?.name, j.city]));
    if (status === 'pending_approval') {
      list = [...list].sort((a, b) => {
        const tA = a.submitted_at ? new Date(a.submitted_at).getTime() : Infinity;
        const tB = b.submitted_at ? new Date(b.submitted_at).getTime() : Infinity;
        return tA - tB;
      });
    }
    count.textContent = `${list.length} tin`;
    total = list.length;
    panel.innerHTML = list.length ? table(['Tin tuyển dụng', 'Trạng thái', 'Thao tác'], paginate(list).map(j => {
      const actions = [button(j.id, 'job-view', 'Chi tiết')];
      if (j.status === 'pending_approval') actions.push(button(j.id, 'job-approve', 'Duyệt'), button(j.id, 'job-reject', 'Từ chối'));
      if (['active', 'paused'].includes(j.status)) actions.push(button(j.id, 'job-takedown', 'Gỡ tin'));
      const isOverdue = j.status === 'pending_approval' && j.submitted_at && (Date.now() - new Date(j.submitted_at).getTime() > 60 * 60 * 1000);
      const overdueChip = isOverdue ? ` <span class="ei-chip ei-chip-pending">Quá hạn 60 phút</span>` : '';
      const submittedRel = j.submitted_at ? ` · gửi ${esc(relativeTime(j.submitted_at))}` : '';
      return `<tr><td><strong>${esc(j.title)}</strong>${overdueChip}<small>${esc(j.company?.name ?? '')} · ${esc(j.city ?? '')} · ${esc(formatStipend(j.stipend_min, j.stipend_max))}${submittedRel}</small>${j.rejection_reason ? `<small>Lý do: ${esc(j.rejection_reason)}</small>` : ''}</td>
        <td>${chip(j.status, jobStatusLabel[j.status] ?? j.status)}</td><td><div class="admin-actions">${actions.join('')}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'users') {
    const me = currentProfile()?.id;
    const selectedRole = roleSelect?.value || '';
    const list = (rows as User[]).filter(u => {
      if (selectedRole && u.role !== selectedRole) return false;
      return matches([u.full_name, u.email, roleNames[u.role]]);
    });
    count.textContent = `${list.length} tài khoản`;
    total = list.length;
    panel.innerHTML = list.length ? table(['Tài khoản', 'Trạng thái', 'Thao tác'], paginate(list).map(u => {
      const officer = (Array.isArray(u.officer) ? u.officer[0] : u.officer) as { university?: { name: string } | null } | null;
      const actions: string[] = [];
      if (u.role !== 'admin' && u.id !== me) {
        if (u.status !== 'active') actions.push(button(u.id, 'user-activate', u.status === 'pending_verification' ? 'Kích hoạt' : 'Mở khóa'));
        if (u.status === 'active') actions.push(button(u.id, 'user-suspend', 'Tạm khóa'));
      }
      const regDate = u.created_at ? ` · đăng ký ${esc(formatDate(u.created_at))}` : '';
      return `<tr><td><strong>${esc(u.full_name || '(chưa đặt tên)')}</strong><small>${esc(roleNames[u.role] ?? u.role)} · ${esc(u.email ?? '')}${officer?.university ? ` · ${esc(officer.university.name)}` : ''}${regDate}</small>${u.status_reason ? `<small>Lý do: ${esc(u.status_reason)}</small>` : ''}</td>
        <td>${chip(u.status === 'pending_verification' ? 'pending' : u.status, accountStatus[u.status] ?? u.status)}</td><td><div class="admin-actions">${actions.join('') || '—'}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'reports') {
    const list = (rows as Report[]).filter(r => {
      const targetName = r.target_id ? (targetNames.get(r.target_id) || '') : '';
      return matches([r.details, reportReason[r.reason], r.target_type, r.target_id, targetName]);
    });
    count.textContent = `${list.length} báo cáo`;
    total = list.length;
    const targetCounts = new Map<string, number>();
    for (const r of rows as Report[]) {
      if (r.target_id) {
        targetCounts.set(r.target_id, (targetCounts.get(r.target_id) || 0) + 1);
      }
    }
    panel.innerHTML = list.length ? table(['Báo cáo', 'Trạng thái', 'Thao tác'], paginate(list).map(r => {
      const actions = ['open', 'in_review'].includes(r.status)
        ? [button(r.id, 'report-review', 'Đang xem xét'), button(r.id, 'report-resolve', 'Xử lý vi phạm'), button(r.id, 'report-dismiss', 'Không vi phạm')] : [];
      const targetName = (r.target_id ? targetNames.get(r.target_id) : null) || r.target_id;
      const numReports = r.target_id ? (targetCounts.get(r.target_id) || 0) : 0;
      const countChip = numReports > 1 ? ` <span class="ei-chip ei-chip-pending">${numReports} báo cáo</span>` : '';
      let targetHtml = '';
      if (r.target_type === 'job' && r.target_id) {
        targetHtml = `<a href="${esc(jobHref(r.target_id))}" target="_blank" rel="noopener" title="${esc(r.target_id)}"><strong>${esc(targetName)}</strong></a>`;
      } else if (r.target_type === 'company' && r.target_id) {
        targetHtml = `<a href="${esc(companyHref(r.target_id))}" target="_blank" rel="noopener" title="${esc(r.target_id)}"><strong>${esc(targetName)}</strong></a>`;
      } else {
        targetHtml = `<strong title="${esc(r.target_id)}">${esc(targetName)}</strong>`;
      }
      return `<tr><td><strong>${esc(reportReason[r.reason] ?? r.reason)} · ${esc(reportTarget[r.target_type] ?? r.target_type)}</strong><small>${esc(r.details ?? '')}</small><small>${targetHtml}${countChip} · ${esc(formatDateTime(r.created_at))}</small>${r.resolution_note ? `<small>Kết quả: ${esc(r.resolution_note)}</small>` : ''}</td>
        <td>${chip(r.status === 'open' ? 'pending' : r.status === 'resolved' ? 'active' : r.status, reportStatus[r.status] ?? r.status)}</td><td><div class="admin-actions">${actions.join('') || '—'}</div></td></tr>`;
    }).join('')) : empty();
  } else if (tab === 'audit') {
    const list = (rows as Audit[]).filter(a => {
      if (status && !a.action.startsWith(status + '.')) return false;
      const actionText = formatAuditAction(a.action);
      const targetName = a.target_id ? (targetNames.get(a.target_id) || '') : '';
      const actor = a.actor as { full_name?: string; email?: string } | null;
      return matches([a.action, actionText, a.target_table, a.target_id, targetName, a.reason, actor?.full_name, actor?.email]);
    });
    // listAudit() is capped at 200 rows: say so instead of presenting the cap as the total
    count.textContent = rows.length >= 200 ? `${list.length} thao tác (trong 200 gần nhất)` : `${list.length} thao tác`;
    total = list.length;
    auditView = list;
    panel.innerHTML = (list.length ? `<div class="admin-export"><button type="button" class="ei-button" data-export="audit"><span class="material-symbols-outlined" aria-hidden="true">download</span>Xuất CSV (${list.length})</button></div>` : '') + (list.length ? table(['Thời gian', 'Thao tác', 'Đối tượng', 'Lý do'], paginate(list).map(a => {
      const actor = a.actor as { full_name?: string; email?: string } | null;
      const actorName = actor?.full_name || actor?.email || 'Hệ thống';
      const actionText = formatAuditAction(a.action);
      const targetName = a.target_id ? targetNames.get(a.target_id) : null;
      let targetCellContent = '';
      if (targetName) {
        targetCellContent = `<strong>${esc(targetName)}</strong><small>${esc(a.target_table)}</small>`;
      } else {
        // Not found: the row was deleted since (e.g. a test company), or it is a table without a name lookup
        const kind = auditTable[a.target_table] ?? a.target_table;
        targetCellContent = a.target_id && auditTable[a.target_table]
          ? `${esc(kind)} <span class="admin-muted">(đã xóa)</span><small>${esc(a.target_id)}</small>`
          : `${esc(kind)}${a.target_id ? `<small>${esc(a.target_id)}</small>` : ''}`;
      }
      const titleAttr = a.target_id ? ` title="${esc(a.target_id)}"` : '';
      const reasonText = a.reason?.trim() ? esc(a.reason) : '—';
      return `<tr><td>${esc(formatDateTime(a.created_at))}<small>${esc(actorName)}</small></td><td>${esc(actionText)}</td><td${titleAttr}>${targetCellContent}</td><td>${reasonText}</td></tr>`;
    }).join('')) : empty('Chưa có thao tác nào.'));
  }
  renderPager(total);
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
  if ((event.target as Element).closest('button[data-export=audit]')) {
    csv(`nhat-ky-quan-tri-${new Date().toISOString().slice(0, 10)}.csv`, api.auditCsvRows(auditView, targetNames, formatAuditAction));
    return;
  }
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
    const compStatus = job.company?.verification_status ? (verifyStatusLabel[job.company.verification_status] ?? job.company.verification_status) : 'Chưa xác thực';
    const submittedAtStr = job.submitted_at ? formatDateTime(job.submitted_at) : '—';
    const content = `<p><strong>Doanh nghiệp:</strong> ${esc(job.company?.name ?? '—')} (${esc(compStatus)}) · <strong>Gửi duyệt:</strong> ${esc(submittedAtStr)}</p>
      <p class="admin-detail">${esc(job.city ?? '')} · ${esc(workTypeLabel[job.work_type] ?? job.work_type)} · ${esc(formatStipend(job.stipend_min, job.stipend_max))}</p>
      <p><strong>Hạn nộp:</strong> ${esc(formatDateTime(job.deadline) || 'mặc định 30 ngày sau khi duyệt')}</p>
      <h3>Mô tả</h3><p class="admin-detail">${esc(job.description)}</p>
      ${job.requirements ? `<h3>Yêu cầu</h3><p class="admin-detail">${esc(job.requirements)}</p>` : ''}
      ${job.status === 'pending_approval' ? `<div style="margin-top:var(--ui-space-4)"><button type="button" class="ei-button ei-button-danger" id="dialog-job-reject">Từ chối tin</button></div>` : ''}`;

    if (job.status === 'pending_approval') {
      const modal = dialog(job.title, content, 'Duyệt tin', async () => {
        try {
          await api.moderateJob(id, true, null);
          toast('Đã duyệt và xuất bản tin.');
          await renderStats();
          await load();
        } catch (error) {
          showError(error);
        }
      });
      modal.querySelector('#dialog-job-reject')?.addEventListener('click', () => {
        modal.close();
        confirmWithReason('Từ chối tin', String(job.title), reason => api.moderateJob(id, false, reason));
      });
    } else {
      dialog(job.title, content, 'Đóng');
    }
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

search.addEventListener('input', () => { if (tab !== 'overview') { pageNo = 1; render(); } });
roleSelect?.addEventListener('change', () => { if (tab === 'users') { pageNo = 1; render(); } });
filters.addEventListener('click', event => {
  const pill = (event.target as Element).closest<HTMLButtonElement>('button[data-status]');
  if (!pill || pill.dataset.status === status) return;
  status = pill.dataset.status!;
  pageNo = 1;
  renderFilters();
  if (tab === 'audit') {
    render();
  } else {
    void load();
  }
});
[pager, pagerTop].forEach(nav => nav.addEventListener('click', event => {
  const step = (event.target as Element).closest<HTMLButtonElement>('button[data-page]');
  if (!step || step.disabled) return;
  pageNo = Number(step.dataset.page);
  render();
  if (board.getBoundingClientRect().top < 0) board.scrollIntoView({ block: 'start' });
}));
window.addEventListener('hashchange', () => { void chooseTab(); });
document.getElementById('admin-refresh')!.addEventListener('click', () => { void load(); });
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
