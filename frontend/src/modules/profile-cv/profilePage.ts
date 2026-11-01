// Student profile (Phase 6): profiles + student_profiles + skills + the default CV (projects, activities),
// avatar upload, edit dialog, verification request with status badge, talent-search opt-in,
// completeness meter, recent applications.
import { dialog, toast } from '../../core/ui/feedback';
import { label, routes } from '../../core/navigation';
import { bind, esc, share, upload } from '../../core/ui/actions';
import { refreshProfile } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { showError } from '../../core/errors';
import { formatDate, relativeTime } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import type { CvContent } from '../../core/models';
import {
  addSkill, cvFileUrl, getMyProfile, listUniversities, myCvs, recentApplications, removeSkill, requestVerification,
  updateProfile, uploadAvatar, type CvRow, type MyProfile,
} from './api';

const appStatus: Record<string, string> = {
  applied: 'Đã nộp đơn', cv_viewed: 'NTD đã xem CV', shortlisted: 'Qua vòng hồ sơ', interviewing: 'Mời phỏng vấn',
  offered: 'Nhận offer', hired: 'Đã nhận việc', rejected: 'Không phù hợp', withdrawn: 'Đã rút đơn', offer_declined: 'Từ chối offer',
};
const byHeading = (re: RegExp) => [...document.querySelectorAll<HTMLElement>('main section')].find(s => re.test(s.querySelector('h2')?.textContent || ''));
const setIconText = (node: Element | null | undefined, text: string) => {
  if (!node) return;
  const icon = node.querySelector('.material-symbols-outlined');
  node.replaceChildren(...(icon ? [icon, document.createTextNode(` ${text}`)] : [document.createTextNode(text)]));
};

/** Profile completeness (client-side guidance only). */
export function completeness(me: MyProfile, cv: CvRow | undefined) {
  const s = me.student;
  const checks: [boolean, string][] = [
    [!!me.profile.avatar_path, 'Thêm ảnh đại diện'], [!!s?.headline, 'Thêm tiêu đề hồ sơ'], [(s?.bio ?? '').length >= 50, 'Viết giới thiệu bản thân (≥ 50 ký tự)'],
    [!!s?.university_id, 'Chọn trường'], [!!s?.student_code, 'Nhập MSSV'], [!!s?.major, 'Nhập chuyên ngành'], [s?.gpa != null, 'Nhập GPA'],
    [me.skills.length >= 3, 'Thêm ít nhất 3 kỹ năng'], [!!cv, 'Tạo CV'], [!!(s?.links as Record<string, string> | null)?.github || !!(s?.links as Record<string, string> | null)?.linkedin, 'Thêm liên kết GitHub/LinkedIn'],
    [s?.verification_status === 'verified', 'Xác thực tài khoản sinh viên'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round(100 * done / checks.length), next: checks.find(([ok]) => !ok)?.[1] ?? null };
}

export async function setupProfilePage() {
  let me: MyProfile, cvs: CvRow[];
  try { [me, cvs] = await Promise.all([getMyProfile(), myCvs()]); }
  catch (error) { showError(error); return; }
  const universities = await listUniversities().catch(() => []);

  // List templates from the design markup, captured on the first render (lists are replaced afterwards)
  let projectTemplate: HTMLElement | undefined, activityTemplate: HTMLElement | undefined, skillChip: HTMLElement | undefined, courseChip: HTMLElement | undefined;

  async function reload() { [me, cvs] = await Promise.all([getMyProfile(), myCvs()]); await refreshProfile(); render(); }

  function render() {
    const s = me.student;
    const cv = cvs.find(c => c.is_default) ?? cvs[0];
    const content = (cv?.content ?? {}) as Partial<CvContent>;
    const links = (s?.links ?? {}) as Record<string, string>;
    const uni = s?.university as { name?: string; short_name?: string } | null;

    // Header
    const h1 = document.querySelector('main h1')!;
    h1.textContent = me.profile.full_name || me.profile.email || 'Sinh viên';
    const badge = h1.nextElementSibling as HTMLElement | null;
    if (badge) { badge.lastChild!.textContent = s?.is_looking_for_job ? ' Đang sẵn sàng nhận thực tập' : ' Chưa tìm việc'; badge.hidden = !s?.is_looking_for_job; }
    const headline = h1.parentElement?.nextElementSibling as HTMLElement | null;
    if (headline) headline.textContent = s?.headline || 'Chưa có tiêu đề hồ sơ — bấm "Chỉnh sửa hồ sơ" để thêm';
    const facts = headline?.nextElementSibling;
    const factSpans = facts ? [...facts.children] as HTMLElement[] : [];
    setIconText(factSpans[0], [uni?.name, s?.major].filter(Boolean).join(' • ') || 'Chưa chọn trường');
    setIconText(factSpans[1], s?.gpa != null ? `GPA: ${s.gpa} / 4.0` : 'Chưa có GPA');
    setIconText(factSpans[2], s?.city || 'Chưa có địa điểm');
    const img = document.querySelector<HTMLImageElement>('main section img');
    if (img) { img.src = publicUrl('avatars', me.profile.avatar_path) || initialsAvatar(me.profile.full_name); img.alt = me.profile.full_name; }

    // Verification badge (top right of the cover)
    const verifiedText = [...document.querySelectorAll('main section span')].find(sp => /Tài khoản sinh viên|xác thực/i.test(sp.textContent || '') && sp.previousElementSibling?.textContent?.trim() === 'verified_user') as HTMLElement | undefined;
    const verifyBox = verifiedText?.parentElement as HTMLElement | undefined;
    if (verifyBox && verifiedText) {
      const text: Record<string, string> = {
        verified: 'Tài khoản sinh viên đã xác thực', pending: 'Đang chờ nhà trường xác thực', rejected: 'Xác thực bị từ chối — gửi lại',
        revoked: 'Xác thực đã bị thu hồi — gửi lại', unverified: 'Yêu cầu xác thực sinh viên',
      };
      const st = s?.verification_status ?? 'unverified';
      verifiedText.textContent = text[st];
      verifyBox.dataset.status = st;
      verifyBox.style.cursor = ['unverified', 'rejected', 'revoked'].includes(st) ? 'pointer' : 'default';
      verifyBox.title = st === 'rejected' && s?.verification_note ? `Lý do: ${s.verification_note}` : '';
    }

    // Contact links
    const linkRow = document.querySelector('main section a[href^="mailto:"]')?.parentElement as HTMLElement | null;
    if (linkRow) {
      const anchors = [...linkRow.querySelectorAll<HTMLAnchorElement>('a')];
      const setLink = (a: HTMLAnchorElement | undefined, text: string | undefined, href: string) => { if (!a) return; if (!text) { a.hidden = true; return; } a.hidden = false; a.href = href; a.lastElementChild!.textContent = text; };
      const url = (v: string) => (/^https?:\/\//.test(v) ? v : `https://${v}`);
      setLink(anchors[0], links.github, url(links.github || ''));
      setLink(anchors[1], links.linkedin, url(links.linkedin || ''));
      setLink(anchors[2], links.portfolio, url(links.portfolio || ''));
      setLink(anchors[3], me.profile.email ?? undefined, `mailto:${me.profile.email}`);
      const phone = linkRow.querySelector(':scope > span');
      if (phone) { (phone as HTMLElement).hidden = !me.profile.phone; phone.lastElementChild!.textContent = me.profile.phone ?? ''; }
    }

    // About
    const about = byHeading(/Giới thiệu bản thân/);
    if (about) {
      const ps = [...about.querySelectorAll<HTMLElement>(':scope > p')];
      ps.forEach((p, i) => { if (i > 0) p.remove(); });
      if (ps[0]) { ps[0].textContent = s?.bio || 'Bạn chưa viết giới thiệu. Hãy chia sẻ ngắn gọn về bản thân, thế mạnh và mục tiêu thực tập.'; ps[0].style.whiteSpace = 'pre-line'; }
      const tiles = [...about.querySelectorAll<HTMLElement>(':scope > div:last-child > div')];
      const values: [string, string][] = [[String(me.skills.length), 'Kỹ năng'], [s?.gpa != null ? String(s.gpa) : '—', 'Điểm trung bình (GPA)'], [String(cvs.length), 'CV đã tạo']];
      tiles.forEach((t, i) => { if (values[i] && t.children.length === 2) { t.children[0].textContent = values[i][0]; t.children[1].textContent = values[i][1]; } });
    }

    // Education
    const edu = byHeading(/Học vấn/);
    if (edu) {
      const card = edu.querySelector(':scope > div:last-child') as HTMLElement;
      const h3 = card?.querySelector('h3'); if (h3) h3.textContent = uni?.name || 'Chưa chọn trường';
      const period = h3?.nextElementSibling; if (period) period.textContent = s?.graduation_year ? `Tốt nghiệp ${s.graduation_year}` : '';
      const ps = card ? [...card.querySelectorAll(':scope > div:last-child > p')] : [];
      if (ps[0]) ps[0].textContent = s?.major ? `Chuyên ngành: ${s.major}` : 'Chưa nhập chuyên ngành';
      if (ps[1]) ps[1].textContent = [s?.student_code ? `MSSV: ${s.student_code}` : '', s?.gpa != null ? `Điểm tích lũy: ${s.gpa} / 4.0` : ''].filter(Boolean).join(' • ');
      const courses = content.education?.[0]?.courses?.split(',').map(c => c.trim()).filter(Boolean) ?? [];
      const chipBox = card?.querySelector('span + div') as HTMLElement | null;
      courseChip ??= chipBox?.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      const chip = courseChip;
      if (chipBox && chip) {
        if (courses.length) chipBox.replaceChildren(...courses.map(c => { const x = chip.cloneNode(true) as HTMLElement; x.textContent = c; return x; }));
        else (chipBox.parentElement as HTMLElement).hidden = true;
      }
    }

    // Projects & activities come from the default CV
    const projects = byHeading(/Dự án tiêu biểu/);
    if (projects) {
      const list = projects.querySelector(':scope > div:last-child') as HTMLElement;
      projectTemplate ??= list.querySelector('article')?.cloneNode(true) as HTMLElement | undefined;
      const template = projectTemplate;
      const items = content.projects ?? [];
      if (!items.length) list.replaceChildren(stateBlock('empty', 'Chưa có dự án. Thêm dự án trong CV để hiển thị tại đây.'));
      else if (template) list.replaceChildren(...items.map(pj => {
        const a = template.cloneNode(true) as HTMLElement;
        a.querySelector('img')?.closest('div')?.remove();
        a.querySelector('h3')!.textContent = pj.title;
        const date = a.querySelector('h3 + span'); if (date) date.textContent = '';
        const p = a.querySelector('p'); if (p) { p.textContent = pj.description; p.style.whiteSpace = 'pre-line'; }
        const tags = p?.nextElementSibling as HTMLElement | null; const tag = tags?.firstElementChild;
        if (tags && tag) tags.replaceChildren(...pj.stack.split(',').map(t => t.trim()).filter(Boolean).map(t => { const x = tag.cloneNode(true) as HTMLElement; x.textContent = t; return x; }));
        const linksBox = a.querySelector('a')?.parentElement;
        if (linksBox) { if (pj.link) { const first = linksBox.querySelector('a')!; first.href = /^https?:/.test(pj.link) ? pj.link : `https://${pj.link}`; first.target = '_blank'; first.rel = 'noopener noreferrer'; [...linksBox.querySelectorAll('a')].slice(1).forEach(x => x.remove()); } else linksBox.remove(); }
        return a;
      }));
    }
    const activities = byHeading(/Kinh nghiệm & Hoạt động/);
    if (activities) {
      const list = activities.querySelector(':scope > div:last-child') as HTMLElement;
      activityTemplate ??= list.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      const template = activityTemplate;
      const items = content.activities ?? [];
      if (!items.length) list.replaceChildren(stateBlock('empty', 'Chưa có hoạt động. Thêm hoạt động ngoại khóa hoặc giải thưởng trong CV.'));
      else if (template) list.replaceChildren(...items.map(item => {
        const row = template.cloneNode(true) as HTMLElement;
        row.querySelector('h3')!.textContent = item.title;
        const date = row.querySelector('h3 + span'); if (date) date.textContent = '';
        row.querySelectorAll('p, ul').forEach((x, i) => { if (i === 0) { x.textContent = item.detail; (x as HTMLElement).hidden = !item.detail; } else x.remove(); });
        return row;
      }));
    }

    // Skills
    const skills = byHeading(/Kỹ năng & Chứng chỉ/);
    if (skills) {
      const box = skills.querySelector(':scope > div:last-child > div:first-child > div') as HTMLElement | null;
      skillChip ??= box?.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
      const chip = skillChip;
      if (box && chip) {
        box.replaceChildren(...me.skills.map(sk => {
          const c = chip.cloneNode(true) as HTMLElement; c.textContent = sk.name;
          const x = el('button', { type: 'button', className: 'profile-skill-remove', 'aria-label': `Xóa kỹ năng ${sk.name}` }, '×');
          bind(x, async () => { try { await removeSkill(sk.id); await reload(); } catch (error) { showError(error); } });
          c.append(' ', x); return c;
        }));
        const add = el('button', { type: 'button', className: 'ei-button' }, '+ Thêm kỹ năng');
        bind(add, () => dialog('Thêm kỹ năng', '<label>Tên kỹ năng<input name="skill" required maxlength="60" placeholder="VD: React, SQL, Figma"></label>', 'Thêm', async form => {
          await addSkill((form.elements.namedItem('skill') as HTMLInputElement).value); await reload();
        }, { keepOpen: true }));
        box.append(add);
      }
      const certs = skills.querySelector(':scope > div:last-child > div:nth-child(2)') as HTMLElement | null;
      if (certs) certs.hidden = true;   // certificates live in the CV (skills section)
    }

    // Completeness
    const meter = completeness(me, cv);
    const aside = document.querySelector('main aside');
    const meterCard = aside?.firstElementChild as HTMLElement | null;
    if (meterCard) {
      const pct = meterCard.querySelector('h3 + span'); if (pct) pct.textContent = `${meter.percent}%`;
      const bar = meterCard.querySelector<HTMLElement>('[style*="width"]'); if (bar) bar.style.width = `${meter.percent}%`;
      const tip = meterCard.lastElementChild?.querySelector('span:last-child'); if (tip) tip.textContent = meter.next ? `Gợi ý: ${meter.next} để hoàn thiện hồ sơ.` : 'Hồ sơ của bạn đã hoàn thiện!';
    }

    // Attachment = default CV
    const attachment = document.getElementById('cv-attachment');
    if (attachment) {
      const updated = attachment.querySelector('h3 + span'); if (updated) updated.textContent = cv ? `Cập nhật ${relativeTime(cv.updated_at)}` : '';
      const name = attachment.querySelector('div > div:last-child > span:first-child');
      const meta = name?.nextElementSibling;
      if (name) name.textContent = cv ? `${cv.title}${cv.is_default ? ' (mặc định)' : ''}` : 'Bạn chưa có CV';
      if (meta) meta.textContent = cv ? `${cv.file_path ? 'Có tệp PDF đính kèm' : 'CV tạo trên Internships.io'}${cv.is_public ? ' • Công khai' : ''}` : 'Tạo CV để ứng tuyển nhanh hơn';
      const [preview, download] = [...attachment.querySelectorAll<HTMLButtonElement>('button')];
      if (preview) { preview.lastElementChild!.textContent = cv ? 'Mở CV' : 'Tạo CV'; bind(preview, () => location.assign(cv ? `${routes['cv-builder']}?id=${cv.id}` : `${routes['cv-builder']}?id=new`)); }
      if (download) {
        download.hidden = !cv;
        bind(download, async () => {
          if (!cv) return;
          if (cv.file_path) { try { window.open(await cvFileUrl(cv.file_path), '_blank', 'noopener'); } catch (error) { showError(error); } }
          else location.assign(`${routes['cv-builder']}?id=${cv.id}&print=1`);
        });
      }
    }
    // The "career preferences" card has no backing fields yet
    const prefs = [...(aside?.children ?? [])].find(c => /Nguyện vọng nghề nghiệp/.test(c.textContent || '')) as HTMLElement | undefined;
    if (prefs) prefs.hidden = true;
  }

  async function renderApplications() {
    const card = [...document.querySelectorAll('main aside > div')].find(c => /Ứng tuyển gần đây/.test(c.textContent || ''));
    if (!card) return;
    const all = card.querySelector<HTMLAnchorElement>('a');
    const list = card.lastElementChild as HTMLElement;
    const template = list.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    try {
      const { rows, total } = await recentApplications(3);
      if (all) { all.href = routes.applications; all.textContent = `Tất cả (${total})`; all.dataset.appControl = 'applications'; }
      if (!rows.length || !template) { list.replaceChildren(el('p', { className: 'ei-muted' }, 'Bạn chưa nộp đơn nào. ', el('a', { href: routes.jobs }, 'Tìm việc ngay'))); return; }
      list.replaceChildren(...rows.map(r => {
        const item = template.cloneNode(true) as HTMLElement;
        const job = r.job as { title?: string; company?: { name?: string } | null } | null;
        const h4 = item.querySelector('h4')!; h4.textContent = job?.title ?? 'Tin đã gỡ';
        const p = item.querySelector('p'); if (p) p.textContent = job?.company?.name ?? '';
        const date = item.querySelector('p + span'); if (date) date.textContent = `Nộp ngày ${formatDate(r.applied_at)}`;
        const chip = item.lastElementChild as HTMLElement; chip.textContent = appStatus[r.status] ?? r.status;
        item.style.cursor = 'pointer'; item.dataset.demoClick = 'application';
        bind(item, () => location.assign(`${routes.applications}?id=${r.id}`));
        return item;
      }));
    } catch (error) { showError(error, list); }
  }

  function editDialog() {
    const s = me.student;
    const links = (s?.links ?? {}) as Record<string, string>;
    const uniOptions = ['<option value="">Chưa chọn</option>', ...universities.map(u => `<option value="${u.id}"${u.id === s?.university_id ? ' selected' : ''}>${esc(u.name)}</option>`)].join('');
    const f = (name: string, title: string, val: unknown, extra = '') => `<label>${title}<input name="${name}" value="${esc(val == null ? '' : String(val))}" ${extra}></label>`;
    dialog('Chỉnh sửa hồ sơ', `
      ${f('full_name', 'Họ và tên', me.profile.full_name, 'required maxlength="120"')}
      ${f('headline', 'Tiêu đề hồ sơ', s?.headline, 'maxlength="160" placeholder="VD: Thực tập sinh Frontend / Sinh viên năm 3"')}
      <label>Giới thiệu bản thân<textarea name="bio" maxlength="3000">${esc(s?.bio ?? '')}</textarea></label>
      <label>Trường<select name="university_id">${uniOptions}</select></label>
      ${f('student_code', 'MSSV', s?.student_code, 'maxlength="30"')}
      ${f('major', 'Chuyên ngành', s?.major)}
      ${f('gpa', 'GPA (thang 4)', s?.gpa, 'type="number" step="0.01" min="0" max="4"')}
      ${f('graduation_year', 'Năm tốt nghiệp', s?.graduation_year, 'type="number" min="1990" max="2100"')}
      ${f('city', 'Tỉnh / thành phố', s?.city)}
      ${f('phone', 'Số điện thoại', me.profile.phone, 'type="tel"')}
      ${f('github', 'GitHub', links.github)} ${f('linkedin', 'LinkedIn', links.linkedin)} ${f('portfolio', 'Portfolio / Website', links.portfolio)}
      <label class="app-setting-row"><span><strong>Đang tìm cơ hội thực tập</strong></span><input type="checkbox" name="looking" ${s?.is_looking_for_job ? 'checked' : ''}></label>
      <label class="app-setting-row"><span><strong>Cho phép nhà tuyển dụng tìm thấy hồ sơ</strong><small>Doanh nghiệp đã xác thực có thể tìm và mời bạn ứng tuyển (không hiển thị email, số điện thoại).</small></span><input type="checkbox" name="discoverable" ${s?.is_discoverable ? 'checked' : ''}></label>
      <p class="app-muted">Đổi trường hoặc MSSV sẽ cần nhà trường xác thực lại.</p>`, 'Lưu hồ sơ', async form => {
      const v = (name: string) => ((form.elements.namedItem(name) as HTMLInputElement).value || '').trim();
      const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
      await updateProfile({ full_name: v('full_name'), phone: v('phone') || null }, {
        headline: v('headline') || null, bio: v('bio') || null, university_id: v('university_id') || null, student_code: v('student_code') || null,
        major: v('major') || null, gpa: v('gpa') ? Number(v('gpa')) : null, graduation_year: v('graduation_year') ? Number(v('graduation_year')) : null,
        city: v('city') || null, links: { github: v('github'), linkedin: v('linkedin'), portfolio: v('portfolio') },
        is_looking_for_job: checked('looking'), is_discoverable: checked('discoverable'),
      });
      await reload();
      toast('Đã lưu hồ sơ.');
    }, { keepOpen: true });
  }

  render();
  await renderApplications();

  // Actions
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    const text = label(b), icon = b.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if (b.dataset.appControl) return;
    if (/Chỉnh sửa hồ sơ|^Sửa$/.test(text) || (icon === 'edit' && !text)) bind(b, editDialog);
    else if (/Thêm dự án/.test(text)) bind(b, () => location.assign(routes['cv-builder']));
    else if (icon === 'photo_camera') bind(b, () => upload('Cập nhật ảnh hồ sơ', 'image/png,image/jpeg,image/webp', async file => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { toast('Chọn ảnh PNG, JPG hoặc WebP dưới 2 MB.'); return; }
      try { await uploadAvatar(file); await reload(); toast('Đã cập nhật ảnh hồ sơ.'); location.reload(); } catch (error) { showError(error); }
    }));
    else if (b.id === 'shareBtn') bind(b, () => {
      const cv = cvs.find(c => c.is_default && c.is_public) ?? cvs.find(c => c.is_public);
      if (cv) share('Chia sẻ CV công khai', `${location.origin}${routes.cv}?slug=${cv.public_slug}`);
      else dialog('Chưa có CV công khai', '<p>Hồ sơ cá nhân chỉ bạn và nhà tuyển dụng bạn ứng tuyển xem được. Để chia sẻ, hãy bật "Công khai" cho một CV.</p>', 'Mở trình tạo CV', () => location.assign(routes['cv-builder']));
    });
  });
  const download = document.querySelector<HTMLAnchorElement>('main a[href="#cv-attachment"]');
  if (download) bind(download, () => document.getElementById('cv-attachment')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));

  // Verification request
  const verifyBox = document.querySelector<HTMLElement>('main section [data-status]');
  if (verifyBox) verifyBox.dataset.demoClick = 'verify';
  if (verifyBox) bind(verifyBox, () => {
    const st = verifyBox.dataset.status;
    if (st === 'verified') { toast('Tài khoản đã được nhà trường xác thực.'); return; }
    if (st === 'pending') { toast('Yêu cầu đang chờ nhà trường xử lý.'); return; }
    dialog('Yêu cầu xác thực sinh viên', `<p>Nhà trường sẽ đối chiếu MSSV <strong>${esc(me.student?.student_code ?? '(chưa nhập)')}</strong> tại <strong>${esc((me.student?.university as { name?: string } | null)?.name ?? '(chưa chọn trường)')}</strong>.</p><p class="app-muted">Sinh viên đã xác thực mới xem được tin dành riêng cho trường và nộp báo cáo thực tập.</p>`, 'Gửi yêu cầu', async () => {
      await requestVerification(); await reload(); toast('Đã gửi yêu cầu xác thực đến nhà trường.');
    }, { keepOpen: true });
  });
}
