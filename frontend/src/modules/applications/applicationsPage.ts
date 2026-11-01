// My Applications (Phase 6): status chips + "NTD đã xem CV" badge, timeline from application_status_history,
// interview RSVP (accept / propose new time / decline), offer accept / decline (reason required),
// withdraw while under review. Plus saved jobs and job alerts tabs. ?id=<application> opens one.
import { dialog, toast } from '../../core/ui/feedback';
import { bind } from '../../core/ui/actions';
import { companyHref, jobHref, routes } from '../../core/navigation';
import { listSavedJobs, setJobSaved } from '../../core/accountApi';
import { showError } from '../../core/errors';
import { formatDate, formatDateTime, formatVnd, relativeTime, workTypeLabel } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import {
  createAlert, deleteAlert, listAlerts, listApplications, listIndustries, offerLetterUrl, respondInterview, respondOffer,
  setAlertActive, statusHistory, withdraw, type MyApplication,
} from './api';

export const applicationStatusLabel: Record<string, string> = {
  applied: 'Đã nộp đơn', cv_viewed: 'NTD đã xem CV', shortlisted: 'Qua vòng hồ sơ', interviewing: 'Đang phỏng vấn',
  offered: 'Có thư mời nhận việc', hired: 'Đã nhận việc', rejected: 'Không phù hợp', withdrawn: 'Đã rút đơn', offer_declined: 'Đã từ chối offer',
};
const underReview = ['applied', 'cv_viewed', 'shortlisted', 'interviewing'];
const closed = ['hired', 'rejected', 'withdrawn', 'offer_declined'];
const rsvpLabel: Record<string, string> = { pending: 'Chờ bạn xác nhận', accepted: 'Bạn đã xác nhận', reschedule_requested: 'Bạn đã đề xuất đổi lịch', declined: 'Bạn đã từ chối' };
const modeLabel: Record<string, string> = { online: 'Trực tuyến', onsite: 'Tại văn phòng', phone: 'Qua điện thoại' };
const chip = (status: string, text: string) => el('span', { className: `ei-chip ei-chip-${status}` }, text);
const localInputValue = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export async function setupApplicationsPage() {
  const list = document.getElementById('application-list')!;
  const filter = document.getElementById('app-filter') as HTMLSelectElement;
  const openId = new URLSearchParams(location.search).get('id');
  let apps: MyApplication[] = [];
  const opened = new Set<string>(openId ? [openId] : []);

  // --- Tabs -------------------------------------------------------------------------------
  const tabs = ['applications', 'saved', 'alerts'];
  function selectTab(name: string) {
    for (const t of tabs) {
      document.getElementById(`tab-${t}`)!.setAttribute('aria-selected', String(t === name));
      document.getElementById(`panel-${t}`)!.hidden = t !== name;
    }
    const url = new URL(location.href);
    name === 'applications' ? url.searchParams.delete('tab') : url.searchParams.set('tab', name);
    history.replaceState(null, '', url);
  }
  tabs.forEach(t => bind(document.getElementById(`tab-${t}`), () => selectTab(t)));

  // --- Applications ---------------------------------------------------------------------------
  async function load() {
    list.replaceChildren(stateBlock('loading'));
    try { apps = await listApplications(); render(); }
    catch (error) { list.replaceChildren(stateBlock('error', undefined, () => void load())); showError(error); }
  }

  function render() {
    document.getElementById('count-applications')!.textContent = String(apps.length);
    const f = filter.value;
    const visible = apps.filter(a => !f || (f === 'active' ? underReview.includes(a.status) : f === 'closed' ? closed.includes(a.status) : a.status === f));
    if (!apps.length) {
      list.replaceChildren(el('li', { className: 'app-state' }, el('p', {}, 'Bạn chưa nộp đơn ứng tuyển nào.'), el('a', { className: 'ei-button ei-button-primary', href: routes.jobs }, 'Tìm việc ngay')));
      return;
    }
    list.replaceChildren(...(visible.length ? visible.map(item) : [stateBlock('empty', 'Không có đơn nào ở trạng thái này.')]));
  }

  function item(app: MyApplication) {
    const job = app.job as { id: string; title: string; city: string | null; status: string; company: { id: string; name: string } | null } | null;
    const interviews = [...(app.interviews ?? [])].sort((a, b) => b.round - a.round);
    const offers = [...(app.offers ?? [])].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
    const badges = el('div', { className: 'apps-badges' }, chip(app.status, applicationStatusLabel[app.status] ?? app.status));
    if (app.viewed_at && app.status !== 'cv_viewed') badges.append(chip('cv_viewed', 'NTD đã xem CV'));
    const pendingInterview = interviews.find(i => i.status === 'scheduled' && i.rsvp === 'pending' && new Date(i.scheduled_at) > new Date());
    if (pendingInterview) badges.append(chip('interviewing', 'Cần xác nhận lịch phỏng vấn'));
    if (offers.some(o => o.status === 'sent')) badges.append(chip('offered', 'Thư mời chờ phản hồi'));

    const toggle = el('button', { type: 'button', className: 'ei-button', 'aria-expanded': String(opened.has(app.id)) }, opened.has(app.id) ? 'Thu gọn' : 'Xem chi tiết');
    const head = el('div', { className: 'apps-item-head' },
      el('div', {},
        el('h3', {}, job ? el('a', { href: jobHref(job.id) }, job.title) : 'Tin tuyển dụng đã gỡ'),
        el('p', { className: 'ei-muted' }, job?.company ? el('a', { href: companyHref(job.company.id) }, job.company.name) : '', ` · Nộp ${formatDate(app.applied_at)} · cập nhật ${relativeTime(app.status_changed_at)}`)),
      el('div', { className: 'apps-badges' }, badges, toggle));
    const detail = el('div', { className: 'apps-detail', hidden: !opened.has(app.id) });
    const li = el('li', { className: 'apps-item', id: `application-${app.id}`, 'data-application-id': app.id } as never, head, detail);
    bind(toggle, () => {
      const open = detail.hidden;
      detail.hidden = !open; toggle.textContent = open ? 'Thu gọn' : 'Xem chi tiết'; toggle.setAttribute('aria-expanded', String(open));
      if (open) { opened.add(app.id); void fillDetail(app, detail); } else opened.delete(app.id);
    });
    if (opened.has(app.id)) void fillDetail(app, detail);
    return li;
  }

  async function fillDetail(app: MyApplication, box: HTMLElement) {
    box.replaceChildren(stateBlock('loading'));
    const parts: HTMLElement[] = [];
    if (app.status === 'rejected' && app.rejection_reason) parts.push(el('div', { className: 'ei-banner ei-banner-danger' }, `Phản hồi từ nhà tuyển dụng: ${app.rejection_reason}`));
    if (app.status === 'withdrawn' && app.withdrawal_reason) parts.push(el('p', { className: 'ei-muted' }, `Lý do rút đơn: ${app.withdrawal_reason}`));

    // Offers
    for (const offer of (app.offers ?? []).filter(o => o.status === 'sent' || o.status === 'accepted' || o.status === 'declined')) {
      const offerBox = el('div', { className: 'apps-box apps-box-offer' }, el('h4', {}, 'Thư mời nhận việc'),
        el('p', {}, [offer.stipend_amount ? `Phụ cấp ${formatVnd(offer.stipend_amount)}/tháng` : 'Phụ cấp theo thỏa thuận', `Bắt đầu ${formatDate(offer.start_date)}`, offer.end_date ? `đến ${formatDate(offer.end_date)}` : ''].filter(Boolean).join(' · ')),
        offer.terms ? el('p', { className: 'demo-prewrap' }, offer.terms) : '',
        el('p', { className: 'ei-muted' }, offer.status === 'sent' ? `Hạn phản hồi: ${formatDateTime(offer.expires_at)}` : offer.status === 'accepted' ? 'Bạn đã chấp nhận thư mời.' : `Bạn đã từ chối${offer.response_note ? `: ${offer.response_note}` : ''}.`));
      const actions = el('div', { className: 'ei-actions' });
      if (offer.letter_path) {
        const letter = el('button', { type: 'button', className: 'ei-button' }, 'Xem thư mời (PDF)');
        bind(letter, async () => { try { window.open(await offerLetterUrl(offer.letter_path!), '_blank', 'noopener'); } catch (error) { showError(error); } });
        actions.append(letter);
      }
      if (offer.status === 'sent' && new Date(offer.expires_at) > new Date()) {
        const accept = el('button', { type: 'button', className: 'ei-button ei-button-primary' }, 'Chấp nhận offer');
        const decline = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Từ chối');
        bind(accept, () => dialog('Chấp nhận thư mời?', '<p>Đơn ứng tuyển sẽ chuyển sang "Đã nhận việc". Các nhà tuyển dụng khác không bị ảnh hưởng.</p>', 'Chấp nhận', async () => {
          await respondOffer(offer.id, true, null); toast('Chúc mừng! Bạn đã nhận việc.'); await load();
        }, { keepOpen: true }));
        bind(decline, () => dialog('Từ chối thư mời', '<label>Lý do (bắt buộc)<textarea name="reason" required maxlength="1000"></textarea></label>', 'Từ chối offer', async form => {
          await respondOffer(offer.id, false, (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim()); toast('Đã gửi phản hồi từ chối.'); await load();
        }, { keepOpen: true }));
        actions.append(accept, decline);
      }
      if (actions.childElementCount) offerBox.append(actions);
      parts.push(offerBox);
    }

    // Interviews
    for (const iv of [...(app.interviews ?? [])].sort((a, b) => b.round - a.round)) {
      const upcoming = iv.status === 'scheduled' && new Date(iv.scheduled_at) > new Date();
      const ivBox = el('div', { className: 'apps-box' }, el('h4', {}, `Phỏng vấn vòng ${iv.round}`),
        el('p', {}, `${formatDateTime(iv.scheduled_at)} · ${iv.duration_minutes} phút · ${modeLabel[iv.mode] ?? iv.mode}`),
        iv.mode === 'online' && iv.meeting_url ? el('p', {}, el('a', { href: iv.meeting_url, target: '_blank', rel: 'noopener noreferrer' }, 'Link phòng họp')) : iv.location ? el('p', {}, `Địa điểm: ${iv.location}`) : '',
        el('p', { className: 'ei-muted' }, iv.status !== 'scheduled' ? ({ completed: 'Đã phỏng vấn', cancelled: 'Đã hủy', no_show: 'Vắng mặt' } as Record<string, string>)[iv.status] ?? iv.status
          : `${rsvpLabel[iv.rsvp] ?? iv.rsvp}${iv.proposed_at ? ` · đề xuất ${formatDateTime(iv.proposed_at)}` : ''}${iv.rsvp_note ? ` · "${iv.rsvp_note}"` : ''}`));
      if (upcoming && iv.rsvp !== 'declined') {
        const accept = el('button', { type: 'button', className: 'ei-button ei-button-primary' }, 'Xác nhận tham gia');
        const propose = el('button', { type: 'button', className: 'ei-button' }, 'Đề xuất giờ khác');
        const decline = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Từ chối');
        bind(accept, async () => { try { await respondInterview(iv.id, 'accepted', null, null); toast('Đã xác nhận lịch phỏng vấn.'); await load(); } catch (error) { showError(error); } });
        bind(propose, () => dialog('Đề xuất thời gian khác', `<label>Thời gian đề xuất<input type="datetime-local" name="when" required min="${localInputValue(new Date(Date.now() + 3600000))}"></label><label>Ghi chú<textarea name="note" maxlength="500" placeholder="VD: Em có lịch thi buổi sáng"></textarea></label>`, 'Gửi đề xuất', async form => {
          const when = (form.elements.namedItem('when') as HTMLInputElement).value;
          await respondInterview(iv.id, 'reschedule_requested', (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim() || null, when ? new Date(when).toISOString() : null);
          toast('Đã gửi đề xuất đổi lịch.'); await load();
        }, { keepOpen: true }));
        bind(decline, () => dialog('Từ chối lịch phỏng vấn', '<label>Lý do<textarea name="note" maxlength="500"></textarea></label>', 'Từ chối', async form => {
          await respondInterview(iv.id, 'declined', (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim() || null, null); toast('Đã từ chối lịch phỏng vấn.'); await load();
        }, { keepOpen: true }));
        ivBox.append(el('div', { className: 'ei-actions' }, ...(iv.rsvp === 'accepted' ? [propose, decline] : [accept, propose, decline])));
      }
      parts.push(ivBox);
    }

    // Timeline
    try {
      const history = await statusHistory(app.id);
      parts.push(el('div', {}, el('h4', {}, 'Tiến trình'), el('ol', { className: 'apps-timeline' }, ...history.map(h =>
        el('li', {}, applicationStatusLabel[h.to_status] ?? h.to_status, h.note ? ` — ${h.note}` : '', el('small', {}, formatDateTime(h.changed_at)))))));
    } catch (error) { showError(error); }

    // Submitted answers
    const answers = [...((app.answers ?? []) as { answer: string; question: { question: string; position: number } | null }[])].sort((a, b) => (a.question?.position ?? 0) - (b.question?.position ?? 0));
    if (answers.length) parts.push(el('div', {}, el('h4', {}, 'Câu trả lời sàng lọc'), ...answers.map(a => el('p', {}, el('strong', {}, `${a.question?.question ?? ''}: `), a.answer === 'yes' ? 'Có' : a.answer === 'no' ? 'Không' : a.answer))));
    if (app.cover_letter) parts.push(el('div', {}, el('h4', {}, 'Thư giới thiệu'), el('p', { className: 'demo-prewrap' }, app.cover_letter)));

    // Withdraw (only while under review, BR-27)
    if (underReview.includes(app.status)) {
      const button = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Rút đơn ứng tuyển');
      bind(button, () => dialog('Rút đơn ứng tuyển?', '<p>Nhà tuyển dụng sẽ được thông báo. Bạn không thể nộp lại cho vị trí này.</p><label>Lý do (không bắt buộc)<textarea name="reason" maxlength="1000"></textarea></label>', 'Rút đơn', async form => {
        await withdraw(app.id, (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim()); toast('Đã rút đơn ứng tuyển.'); await load();
      }, { keepOpen: true }));
      parts.push(el('div', { className: 'ei-actions' }, button));
    }
    box.replaceChildren(...parts);
  }

  filter.addEventListener('change', render);

  // --- Saved jobs -----------------------------------------------------------------------------
  async function loadSaved() {
    const box = document.getElementById('saved-list')!;
    try {
      const saved = await listSavedJobs();
      document.getElementById('count-saved')!.textContent = String(saved.length);
      if (!saved.length) { box.replaceChildren(el('li', { className: 'app-state' }, el('p', {}, 'Chưa có việc làm đã lưu.'), el('a', { className: 'ei-button', href: routes.jobs }, 'Khám phá việc làm'))); return; }
      box.replaceChildren(...saved.map(s => {
        const remove = el('button', { type: 'button', className: 'ei-button' }, 'Bỏ lưu');
        bind(remove, async () => { try { await setJobSaved(s.job_id, false); await loadSaved(); } catch (error) { showError(error); } });
        const active = s.job?.status === 'active';
        return el('li', { className: 'ei-row' },
          el('span', {}, el('a', { href: jobHref(s.job_id) }, el('strong', {}, s.job?.title ?? 'Tin đã gỡ')), el('br'), el('small', { className: 'ei-muted' }, `${s.job?.company?.name ?? ''} · lưu ${relativeTime(s.created_at)}${active ? '' : ' · không còn nhận hồ sơ'}`)),
          remove);
      }));
    } catch (error) { showError(error, box); }
  }

  // --- Job alerts -----------------------------------------------------------------------------
  const industries = await listIndustries().catch(() => []);
  (document.getElementById('alert-industry') as HTMLSelectElement).append(...industries.map(i => new Option(i.name, String(i.id))));
  async function loadAlerts() {
    const box = document.getElementById('alert-list')!;
    try {
      const alerts = await listAlerts();
      document.getElementById('count-alerts')!.textContent = String(alerts.length);
      if (!alerts.length) { box.replaceChildren(el('li', { className: 'ei-muted' }, 'Chưa có thông báo việc làm.')); return; }
      box.replaceChildren(...alerts.map(a => {
        const toggle = el('button', { type: 'button', className: 'ei-button' }, a.is_active ? 'Tạm dừng' : 'Bật lại');
        const remove = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Xóa');
        bind(toggle, async () => { try { await setAlertActive(a.id, !a.is_active); await loadAlerts(); } catch (error) { showError(error); } });
        bind(remove, async () => { try { await deleteAlert(a.id); await loadAlerts(); } catch (error) { showError(error); } });
        const criteria = [a.keywords, a.city, industries.find(i => i.id === a.industry_id)?.name, a.work_type ? workTypeLabel[a.work_type] : '', a.min_stipend ? `từ ${a.min_stipend / 1e6} triệu` : ''].filter(Boolean).join(' · ') || 'Mọi tin mới';
        return el('li', { className: 'ei-row' },
          el('span', {}, el('strong', {}, a.name), ' ', chip(a.is_active ? 'active' : 'paused', a.is_active ? 'Đang bật' : 'Tạm dừng'), el('br'),
            el('small', { className: 'ei-muted' }, `${criteria} · ${({ daily: 'hằng ngày', weekly: 'hằng tuần', instant: 'ngay khi có tin' } as Record<string, string>)[a.frequency]}`)),
          el('span', { className: 'ei-actions' }, toggle, remove));
      }));
    } catch (error) { showError(error, box); }
  }
  const alertForm = document.getElementById('alert-form') as HTMLFormElement;
  alertForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!alertForm.reportValidity()) return;
    const v = (name: string) => ((alertForm.elements.namedItem(name) as HTMLInputElement).value || '').trim();
    try {
      await createAlert({
        name: v('name'), keywords: v('keywords') || null, city: v('city') || null, industry_id: v('industry_id') ? Number(v('industry_id')) : null,
        work_type: (v('work_type') || null) as never, min_stipend: v('min_stipend') ? Math.round(Number(v('min_stipend')) * 1e6) : null, frequency: v('frequency') as never,
      });
      alertForm.reset(); toast('Đã tạo thông báo việc làm.'); await loadAlerts();
    } catch (error) { showError(error); }
  });

  selectTab(new URLSearchParams(location.search).get('tab') ?? 'applications');
  await Promise.all([load(), loadSaved(), loadAlerts()]);
  if (openId) document.getElementById(`application-${openId}`)?.scrollIntoView({ block: 'center' });

}
