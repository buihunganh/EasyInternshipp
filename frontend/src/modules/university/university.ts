// Public university page (/pages/university/?id=): identity, live stats, published events (register / booth
// request), active MoU partners, and the partner inquiry form (partner_inquiries).
import { dialog, toast } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { bind } from '../../core/ui/actions';
import { renderRailFooter } from '../../core/layout/siteFooter';
import { requireSignIn } from '../../core/auth';
import { currentProfile, currentRole } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { el, esc, showState } from '../../core/render';
import { showError, toAppError } from '../../core/errors';
import { formatDateTime } from '../../core/format';
import * as api from './api';

/** Inline style for el(): the DOM accepts a string for `style` (it sets cssText). */
const css = (text: string) => ({ style: text }) as Record<string, unknown>;

const HCMUT_DOMAIN = 'hcmut.edu.vn';   // the design's showcase content (faculties, map, salary widget) is HCMUT's

async function pickUniversity(): Promise<api.University | null> {
  const id = new URLSearchParams(location.search).get('id');
  if (id) return api.getUniversity(id);
  const role = currentRole();
  const own = role === 'university_officer' ? (await api.myOfficerUniversity().catch(() => null))?.university_id
    : role === 'student' ? await api.myStudentUniversity().catch(() => null) : null;
  if (own) return api.getUniversity(own);
  const all = await api.listUniversities();
  return all.find(u => u.email_domain === HCMUT_DOMAIN) ?? all[0] ?? null;
}

export async function setupUniversityPage() {
  const rightRail = document.getElementById('university-right-rail');
  if (rightRail) renderRailFooter(rightRail);
  setupContactModal();

  let uni: api.University | null;
  try { uni = await pickUniversity(); } catch (error) { showError(error); return; }
  const main = document.querySelector('main');
  if (!uni) { if (main) showState(main, 'empty', 'Không tìm thấy trường đại học.'); return; }
  const university = uni;
  const isShowcase = university.email_domain === HCMUT_DOMAIN;
  document.querySelectorAll<HTMLElement>('[data-hcmut-only]').forEach(n => { n.hidden = !isShowcase; });
  renderIdentity(university, isShowcase);

  const officer = currentRole() === 'university_officer' ? await api.myOfficerUniversity().catch(() => null) : null;
  if (officer?.university_id === university.id) {
    const actions = document.getElementById('university-actions');
    actions?.prepend(el('a', { className: 'ui-btn ui-btn--primary', href: '/pages/university-portal/' },
      el('span', { className: 'material-symbols-outlined text-[20px]', 'aria-hidden': 'true' }, 'dashboard'), 'Mở cổng quản lý'));
  }

  const [partners, events] = await Promise.all([
    api.activePartners(university.id).catch(error => { showError(error); return []; }),
    api.universityEvents(university.id).catch(error => { showError(error); return []; }),
  ]);
  renderStats(partners, events);
  renderPartners(partners, university);
  await renderEvents(events, university, officer?.university_id === university.id);

  // Rail CTA and any "Gửi đề xuất" button open the inquiry modal
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    if (/Gửi đề xuất/.test(label(b))) bind(b, openContactModal);
  });
  if (location.hash.startsWith('#event-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });

  function openContactModal() {
    const modal = document.getElementById('contact-modal');
    if (!modal) return;
    modal.dataset.universityId = university.id;
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    const first = modal.querySelector<HTMLInputElement>('input[name=contact_name]');
    const profile = currentProfile();
    if (first && !first.value && profile?.full_name) first.value = profile.full_name;
    const email = modal.querySelector<HTMLInputElement>('input[name=email]');
    if (email && !email.value && profile?.email) email.value = profile.email;
    first?.focus();
  }
  bind(document.getElementById('btn-contact-career'), openContactModal);
}

function renderIdentity(u: api.University, showcase: boolean) {
  const name = u.short_name ? `${u.name} (${u.short_name})` : u.name;
  document.title = `${u.name} | Internships.io`;
  const h1 = document.getElementById('university-name');
  if (h1) h1.textContent = name;
  const tagline = document.getElementById('university-tagline');
  if (tagline && !showcase) tagline.textContent = `Cổng kết nối thực tập giữa ${u.short_name || u.name} và doanh nghiệp trên Internships.io`;
  const logo = document.getElementById('university-logo') as HTMLImageElement | null;
  if (logo) {
    logo.alt = `Logo ${u.name}`;
    const url = publicUrl('company-assets', u.logo_path);
    if (url) logo.src = url;
    else if (!showcase) logo.replaceWith(el('span', { className: 'university-logo__initials', 'aria-hidden': 'true' }, (u.short_name || u.name).slice(0, 5)));
  }
  const badges = document.getElementById('university-badges');
  if (badges) badges.replaceChildren(...[u.short_name, u.city].filter(Boolean).map(t => el('span', { className: 'ui-chip ui-chip--neutral' }, t!)),
    el('span', { className: 'ui-chip ui-chip--neutral' }, el('span', { className: 'material-symbols-outlined text-[14px]', 'aria-hidden': 'true' }, 'verified'), 'Trường liên kết Internships.io'));
  const meta = document.getElementById('university-meta');
  if (meta) {
    const item = (icon: string, child: Node | string) => el('div', { className: 'flex items-center gap-xs' }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, icon), child);
    const parts: Node[] = [];
    if (u.city) parts.push(item('location_on', u.city));
    const site = u.website || (u.email_domain ? `https://${u.email_domain}` : '');
    if (site) parts.push(item('language', el('a', { href: site, target: '_blank', rel: 'noopener' }, site.replace(/^https?:\/\//, '').replace(/\/$/, ''))));
    if (u.email_domain) parts.push(item('alternate_email', `Email sinh viên: @${u.email_domain}`));
    meta.replaceChildren(...parts.flatMap((p, i) => i ? [el('span', { className: 'university-meta__sep', 'aria-hidden': 'true' }, '•'), p] : [p]));
  }
}

function renderStats(partners: Awaited<ReturnType<typeof api.activePartners>>, events: api.EventRow[]) {
  const host = document.getElementById('university-stats');
  if (!host) return;
  const openJobs = partners.reduce((n, p) => n + p.openJobs, 0);
  const upcoming = events.filter(e => e.status === 'published').length;
  const stat = (label: string, icon: string, value: string, note: string) => el('div', { className: 'ui-card university-stat' },
    el('div', { className: 'flex items-center justify-between' }, el('span', { className: 'university-stat__label' }, label), el('span', { className: 'material-symbols-outlined', ...css('color:var(--ui-muted)'), 'aria-hidden': 'true' }, icon)),
    el('div', { className: 'university-stat__value' }, value), el('p', { className: 'university-stat__note', ...css('margin:0') }, note));
  host.replaceChildren(
    stat('Doanh nghiệp đối tác', 'domain', String(partners.length), 'Thỏa thuận hợp tác (MoU) đang hiệu lực'),
    stat('Vị trí đang tuyển', 'work', String(openJobs), 'Từ các doanh nghiệp đối tác của trường'),
    stat('Sự kiện sắp tới', 'event', String(upcoming), 'Ngày hội việc làm, hội thảo hướng nghiệp'));
}

function renderPartners(partners: Awaited<ReturnType<typeof api.activePartners>>, u: api.University) {
  const host = document.getElementById('university-partners');
  if (!host) return;
  const more = document.getElementById('university-partners-more')?.closest('a');
  if (more) more.href = '/';
  if (!partners.length) { showState(host, 'empty', `${u.short_name || u.name} chưa có doanh nghiệp đối tác trên Internships.io.`); return; }
  host.replaceChildren(...partners.map(p => {
    const logo = publicUrl('company-assets', p.logo_path);
    return el('a', { className: 'university-company university-partner', href: `/pages/company/?id=${encodeURIComponent(p.id)}` },
      el('div', { className: 'university-company__logo' }, logo ? el('img', { src: logo, alt: '', loading: 'lazy' }) : el('span', { className: 'university-partner__initial', 'aria-hidden': 'true' }, p.name.slice(0, 1))),
      el('h4', { className: 'university-partner__name' }, p.name),
      el('span', { className: 'ui-chip ui-chip--neutral', ...css('margin-top:var(--ui-space-2);font-size:11px') }, p.openJobs ? `${p.openJobs} vị trí mở` : 'Chưa có vị trí mở'));
  }));
}

async function renderEvents(events: api.EventRow[], u: api.University, isOrganizer: boolean) {
  const host = document.getElementById('university-events');
  const count = document.getElementById('university-events-count');
  if (!host) return;
  if (count) count.textContent = events.length ? `${events.length} sự kiện` : 'Chưa có sự kiện';
  if (!events.length) { showState(host, 'empty', `${u.short_name || u.name} chưa công bố sự kiện sắp tới.`); return; }
  const role = currentRole();
  const ids = events.map(e => e.id);
  const [tickets, booths, companies] = await Promise.all([
    role === 'student' ? api.myRegistrations(ids).catch(() => new Map()) : Promise.resolve(new Map()),
    role === 'employer' ? api.myBooths(ids).catch(() => new Map()) : Promise.resolve(new Map()),
    role === 'employer' ? api.managedCompanies().catch(() => []) : Promise.resolve([]),
  ]);
  const month = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric' });
  const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' });

  host.replaceChildren(...events.map(e => {
    const start = new Date(e.starts_at);
    const action = el('div', { className: 'university-event__actions' });
    const detail = el('button', { type: 'button', className: 'ui-btn ui-btn--tertiary ui-btn--sm' }, 'Xem chi tiết');
    detail.addEventListener('click', () => dialog(e.title, `<p class="app-muted">${esc(formatDateTime(e.starts_at))} → ${esc(formatDateTime(e.ends_at))}<br>${esc(e.is_virtual ? 'Trực tuyến' : e.location || 'Địa điểm đang cập nhật')}${e.capacity ? ` · ${e.capacity} chỗ` : ''}</p><p style="white-space:pre-wrap">${esc(e.description || 'Chưa có mô tả.')}</p>`, 'Đóng'));
    action.append(detail);
    const ended = e.status === 'completed' || new Date(e.ends_at) < new Date();

    if (isOrganizer) {
      action.prepend(el('a', { className: 'ui-btn ui-btn--secondary ui-btn--sm', href: '/pages/university-portal/#events' }, 'Quản lý'));
    } else if (role === 'employer') {
      const status = booths.get(e.id);
      if (status) action.prepend(el('span', { className: `ui-chip ${status === 'approved' ? 'ui-chip--success' : status === 'rejected' ? 'ui-chip--danger' : 'ui-chip--warning'}` },
        status === 'approved' ? 'Gian hàng đã duyệt' : status === 'rejected' ? 'Gian hàng bị từ chối' : 'Gian hàng chờ duyệt'));
      else if (!ended) {
        const b = el('button', { type: 'button', className: 'ui-btn ui-btn--secondary ui-btn--sm' }, 'Đăng ký gian hàng');
        b.addEventListener('click', () => requestBooth(e, companies, b));
        action.prepend(b);
      }
    } else if (!ended && role !== 'university_officer' && role !== 'admin') {
      const ticket = tickets.get(e.id);
      const register = el('button', { type: 'button', className: `ui-btn ${ticket ? 'ui-btn--neutral' : 'ui-btn--secondary'} ui-btn--sm` }, ticket ? `Vé: ${ticket.ticket_code}` : 'Đăng ký tham gia');
      register.addEventListener('click', () => ticket ? showTicket(e, ticket.ticket_code, ticket.checked_in_at) : registerEvent(e));
      action.prepend(register);
    }
    return el('div', { className: 'university-event', id: `event-${e.id}` },
      el('div', { className: 'flex items-start gap-md' },
        el('div', { className: 'university-event__date', ...css(ended ? 'background:var(--ui-muted)' : '') },
          el('span', { ...css('font-size:10px;text-transform:uppercase;color:var(--ui-on-accent)') }, `Th.${month.format(start)}`),
          el('span', { ...css('font-size:20px;line-height:1') }, day.format(start))),
        el('div', {},
          el('div', { className: 'flex items-center gap-xs', ...css('flex-wrap:wrap') },
            el('span', { className: 'ui-chip ui-chip--neutral' }, e.is_virtual ? 'Trực tuyến' : 'Trực tiếp'),
            e.capacity ? el('span', { ...css('font-size:var(--ui-text-xs);color:var(--ui-muted)') }, `Giới hạn ${e.capacity} người`) : null,
            ended ? el('span', { className: 'ui-chip ui-chip--neutral' }, 'Đã kết thúc') : null),
          el('h3', { ...css('margin:var(--ui-space-1) 0 0;font-size:var(--ui-text-md);font-weight:600;color:var(--ui-text)') }, e.title),
          el('p', { ...css('margin:2px 0 0;font-size:var(--ui-text-xs);color:var(--ui-muted)') }, `${formatDateTime(e.starts_at)} · ${e.is_virtual ? 'Trực tuyến' : e.location || 'Địa điểm đang cập nhật'}`))),
      action);
  }));

  function showTicket(e: api.EventRow, code: string, checkedIn: string | null) {
    const modal = dialog('Vé tham dự', `<p><strong>${esc(e.title)}</strong><br><span class="app-muted">${esc(formatDateTime(e.starts_at))}</span></p>
      <p class="university-ticket">${esc(code)}</p><p class="app-muted">${checkedIn ? `Đã điểm danh lúc ${esc(formatDateTime(checkedIn))}.` : 'Xuất trình mã vé này tại quầy điểm danh.'}</p>`,
      checkedIn ? 'Đóng' : 'Hủy đăng ký', checkedIn ? undefined : async () => {
        if (!confirm('Hủy đăng ký sự kiện này?')) return false;
        await api.cancelRegistration(e.id);
        toast('Đã hủy đăng ký.');
        await renderEvents(events, u, isOrganizer);
      }, { keepOpen: true });
    return modal;
  }
  async function registerEvent(e: api.EventRow) {
    if (!requireSignIn(`${location.pathname}${location.search}#event-${e.id}`)) return;
    try {
      const code = await api.registerForEvent(e.id);
      toast('Đăng ký thành công!');
      await renderEvents(events, u, isOrganizer);
      showTicket(e, code, null);
    } catch (error) { showError(error); }
  }
  function requestBooth(e: api.EventRow, list: Awaited<ReturnType<typeof api.managedCompanies>>, trigger: HTMLButtonElement) {
    const verified = list.filter(c => c.verification_status === 'verified');
    if (!verified.length) {
      dialog('Đăng ký gian hàng', '<p>Chỉ quản lý của doanh nghiệp <strong>đã xác thực</strong> mới đăng ký gian hàng được. Hoàn tất hồ sơ và xác thực doanh nghiệp tại trang "Hồ sơ doanh nghiệp".</p>', 'Đến hồ sơ doanh nghiệp', () => location.assign('/pages/company-settings/'));
      return;
    }
    dialog(`Đăng ký gian hàng · ${e.title}`, `<label>Doanh nghiệp<select name="company">${verified.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>
      <label>Ghi chú cho ban tổ chức (tùy chọn)<textarea name="note" rows="3" maxlength="1000" placeholder="Số người tham dự, nhu cầu thiết bị..."></textarea></label>`, 'Gửi đăng ký', async f => {
      const company = (f.elements.namedItem('company') as HTMLSelectElement).value;
      const note = (f.elements.namedItem('note') as HTMLTextAreaElement).value.trim() || null;
      await api.requestBooth(e.id, company, note);
      toast('Đã gửi đăng ký gian hàng. Nhà trường sẽ duyệt và thông báo cho bạn.');
      trigger.replaceWith(el('span', { className: 'ui-chip ui-chip--warning' }, 'Gian hàng chờ duyệt'));
    }, { keepOpen: true });
  }
}

/** The design's contact modal (#contact-modal), now saving to partner_inquiries. */
function setupContactModal() {
  const modal = document.getElementById('contact-modal');
  const form = document.getElementById('partner-inquiry-form') as HTMLFormElement | null;
  if (!modal || !form) return;
  modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Liên hệ hợp tác');
  const hide = () => { modal.style.display = 'none'; modal.classList.add('hidden'); document.getElementById('btn-contact-career')?.focus(); };
  bind(document.getElementById('close-modal'), hide);
  bind(document.getElementById('cancel-modal'), hide);
  modal.addEventListener('click', e => { if (e.target === modal) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.style.display !== 'none') hide(); });
  const error = el('p', { className: 'app-form-error', role: 'alert', hidden: true });
  form.prepend(error);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value.trim() || '';
    const submit = form.querySelector<HTMLButtonElement>('[type=submit]');
    error.hidden = true;
    if (!form.checkValidity()) { form.reportValidity(); return; }
    submit?.setAttribute('aria-busy', 'true'); if (submit) submit.disabled = true;
    try {
      await api.sendInquiry({ university_id: modal.dataset.universityId || '', contact_name: v('contact_name'), company_name: v('company_name') || null, email: v('email'), phone: null, message: v('message') || null });
      form.reset();
      hide();
      toast('Đã gửi yêu cầu hợp tác. Nhà trường sẽ liên hệ lại qua email.');
    } catch (err) {
      error.textContent = toAppError(err).message; error.hidden = false;
    } finally { submit?.removeAttribute('aria-busy'); if (submit) submit.disabled = false; }
  });
}
