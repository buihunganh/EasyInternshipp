// CV builder (Phase 6): the design's editor + live A4 preview, saved as typed CvContent in cvs.content.
// Several CVs per student (?id=), default CV, public link (/pages/cv/?slug=), PDF upload (cvs/<uid>/),
// browser print. Unsaved edits are kept as a local draft per CV and offered back on return.
import { dialog, toast } from '../../core/ui/feedback';
import { label, routes } from '../../core/navigation';
import { safeReturnPath } from '../../core/auth';
import { read, write } from '../../core/storage';
import { bind, button, esc, field, share, upload, value } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import { formatDateTime } from '../../core/format';
import { publicUrl } from '../../core/supabase';
import { el } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import type { CvContent } from '../../core/models';
import { cvFileUrl, deleteCv, getMyProfile, myCvs, saveCv, setCvFlags, uploadAvatar, uploadCvFile, type CvRow } from './api';

type Extra = { id: string; kind: string; title: string; detail: string };
const colors: Record<string, string> = { 'Modern Blue': '#3f5baa', Teal: '#087f76', 'Navy Emerald': '#193a51', Charcoal: '#30343b' };

export async function setupCvBuilder() {
  const sheet = document.getElementById('a4-cv-sheet')!;
  const main = document.querySelector('main')!;
  const inputEl = (name: string) => document.getElementById('input-' + name) as HTMLInputElement | HTMLTextAreaElement | null;
  const input = (name: string) => inputEl(name)?.value || '';
  const sections = [...document.querySelectorAll<HTMLElement>('main h2')].map(h => h.closest<HTMLElement>('div.p-6')).filter((x): x is HTMLElement => !!x);
  const projectSection = sections.find(s => /Dự án thực tế/.test(s.querySelector('h2')?.textContent || ''))!;
  const skillsSection = sections.find(s => /Kỹ năng kỹ thuật/.test(s.querySelector('h2')?.textContent || ''))!;
  const schoolSection = sections.find(s => s.querySelector('#input-school'))!;
  const awardSection = sections.find(s => /Hoạt động ngoại khóa/.test(s.querySelector('h2')?.textContent || ''))!;
  const project = projectSection.querySelector<HTMLElement>('.bg-surface-container-low.rounded-xl');
  if (project) project.dataset.demoProject = 'true';
  const editorFields = () => [...main.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([data-cv-toolbar]),textarea')].filter(e => e.type !== 'file' && e.type !== 'checkbox');
  const fieldKey = (e: Element, i: number) => e.id || `field-${i}`;

  // --- Load CVs and the profile ------------------------------------------------------------
  let cvs: CvRow[] = [];
  let me: Awaited<ReturnType<typeof getMyProfile>> | null = null;
  try { [cvs, me] = await Promise.all([myCvs(), getMyProfile()]); } catch (error) { showError(error); }
  const requested = new URLSearchParams(location.search).get('id');
  let current: CvRow | null = (requested === 'new' ? null : cvs.find(c => c.id === requested) ?? cvs[0]) ?? null;
  const stored = (current?.content ?? {}) as Partial<CvContent>;

  // --- Builder state (replaces the old demo:* localStorage keys) ------------------------------
  let extras: Extra[] = stored.editor?.extras ?? [];
  let removed: string[] = stored.editor?.removed ?? [];
  let theme: CvContent['theme'] = stored.theme ?? 'modern';
  let color = stored.color ?? '#3f5baa';
  // No photo yet → initials, never the design's sample portrait
  const DEFAULT_AVATAR = initialsAvatar(stored.personal?.name || me?.profile.full_name || 'CV');
  let avatar = stored.avatar || publicUrl('avatars', me?.profile.avatar_path) || DEFAULT_AVATAR;
  let zoom = 100;
  let dirty = false;

  // Fill the editor. A CV saved by this builder restores its exact editor state. Otherwise (a new CV, or one
  // created elsewhere with only structured content) the form starts from that content and the profile,
  // never from the design's sample person.
  const fields = editorFields();
  const fresh = !stored.editor?.fields;   // the sample tags / certificates in the markup get dropped below
  if (!fresh) {
    fields.forEach((e, i) => { const v = stored.editor!.fields[fieldKey(e, i)]; if (v !== undefined) e.value = v; });
  } else {
    fields.forEach(e => { e.value = ''; });
    const p = me?.profile, s = me?.student;
    const sp = stored.personal, edu = stored.education?.[0], pj = stored.projects?.[0];
    const links = (s?.links ?? {}) as Record<string, string>;
    const set = (name: string, v: string | null | undefined) => { const e = inputEl(name); if (e) e.value = v ?? ''; };
    set('fullname', sp?.name || p?.full_name); set('email', sp?.email || p?.email); set('phone', sp?.phone || p?.phone);
    set('title', sp?.title || s?.headline); set('location', sp?.location || s?.city);
    set('github', sp?.github || links.github); set('linkedin', sp?.linkedin || links.linkedin);
    set('summary', stored.summary || s?.bio);
    set('school', edu?.school || (s?.university as { name?: string } | null)?.name); set('major', edu?.major || s?.major);
    set('gpa', edu?.gpa || (s?.gpa ? `${s.gpa} / 4.0` : '')); set('courses', edu?.courses);
    const period = schoolSection.querySelectorAll('input')[2]; if (period) period.value = edu?.period ?? '';
    const pf = [...projectSection.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')];
    if (pj) { [pj.title, pj.stack, pj.link, pj.description].forEach((v, i) => { if (pf[i]) pf[i].value = v ?? ''; }); }
    removed = pj ? ['awards'] : ['project', 'awards'];
    const skills = stored.skills?.length ? stored.skills : (me?.skills ?? []).map(sk => sk.name);
    extras = [
      ...(stored.education ?? []).slice(1).map(e => ({ id: crypto.randomUUID(), kind: 'school', title: e.school, detail: e.major })),
      ...(stored.projects ?? []).slice(1).map(x => ({ id: crypto.randomUUID(), kind: 'project', title: x.title, detail: x.description })),
      ...skills.map(name => ({ id: crypto.randomUUID(), kind: 'skill', title: name, detail: '' })),
      ...(stored.activities ?? []).map(a => ({ id: crypto.randomUUID(), kind: 'award', title: a.title, detail: a.detail })),
    ];
  }

  // --- Preview (same markup and styles as the design export) ------------------------------------
  const extrasHTML = (kind: string) => extras.filter(x => x.kind === kind).map(x => `<div class="demo-cv-entry"><strong>${esc(x.title)}</strong>${x.detail ? `<p>${esc(x.detail)}</p>` : ''}</div>`).join('');
  const skillTags = () => [...skillsSection.querySelectorAll('span')].filter(s => s.isConnected && s.querySelector('button') && s.querySelector('.material-symbols-outlined')?.textContent === 'close').map(s => label(s));
  const certificates = () => [...skillsSection.querySelectorAll<HTMLElement>('.grid > div')].filter(e => e.isConnected).map(e => e.querySelector('h4,p,span')?.textContent?.trim() || '').filter(Boolean);
  const awards = () => removed.includes('awards') ? [] : [...awardSection.querySelectorAll(':scope>div:last-of-type>div')].filter(e => !e.classList.contains('demo-cv-extra-editor')).map(e => e.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
  const projectFields = () => [...projectSection.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea')];

  // --- Design badges that must reflect the real CV, not the sample one ----------------------------
  const textSpan = (re: RegExp) => [...main.querySelectorAll<HTMLElement>('span')].find(sp => re.test(sp.textContent?.trim() || ''));
  textSpan(/^sync\s*Đã đồng bộ tự động/)?.remove();   // the toolbar status shows the real save state
  const meterValue = textSpan(/^Độ hoàn thiện CV:$/)?.nextElementSibling as HTMLElement | null | undefined;
  const meterBar = main.querySelector<HTMLElement>('div[class*="w-[85%]"]');
  meterBar?.classList.remove('w-[85%]');
  const hintRow = textSpan(/Thông tin chuẩn xác/)?.parentElement;
  const [infoHint, projectHint, nextHint] = [...(hintRow?.children ?? [])] as HTMLElement[];
  const doneBadge = textSpan(/^check\s*Hoàn thành$/);
  const verifiedBadge = textSpan(/^school\s*ĐHBK đã duyệt$/);
  if (verifiedBadge) {
    const uni = me?.student?.university as { short_name?: string; name?: string } | null | undefined;
    const ok = me?.student?.verification_status === 'verified';
    verifiedBadge.hidden = !ok;
    if (ok) verifiedBadge.lastChild!.textContent = ` ${uni?.short_name || 'Trường'} đã xác thực`;
  }
  const summaryInput = inputEl('summary') as HTMLTextAreaElement | null;
  if (summaryInput) summaryInput.maxLength = 500;
  const summaryCounter = summaryInput?.nextElementSibling as HTMLElement | null | undefined;
  const setHint = (hint: HTMLElement | undefined, text: string) => { if (!hint) return; const last = [...hint.childNodes].reverse().find(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()); if (last) last.textContent = ` ${text} `; };

  function renderMeter() {
    const pf = projectFields();
    const projects = (removed.includes('project') || !pf[0]?.value ? 0 : 1) + extras.filter(x => x.kind === 'project').length;
    const skills = skillTags().length + extras.filter(x => x.kind === 'skill').length;
    const personal = ['fullname', 'title', 'email', 'phone', 'location'].every(n => input(n).trim());
    const checks: [boolean, string][] = [
      [personal, 'Điền đủ thông tin liên hệ'], [!!(input('github') || input('linkedin')), 'Thêm GitHub/LinkedIn'],
      [input('summary').trim().length >= 50, 'Viết tóm tắt bản thân'], [!!input('school') && !!input('major'), 'Thêm học vấn'],
      [projects > 0, 'Thêm dự án'], [skills >= 3, 'Thêm ít nhất 3 kỹ năng'], [avatar !== DEFAULT_AVATAR, 'Thêm ảnh chân dung'],
    ];
    const percent = Math.round(100 * checks.filter(c => c[0]).length / checks.length);
    if (meterValue) meterValue.textContent = `${percent}%`;
    if (meterBar) meterBar.style.width = `${percent}%`;
    setHint(infoHint, personal ? 'Thông tin liên hệ đầy đủ' : 'Thiếu thông tin liên hệ');
    setHint(projectHint, `${projects} dự án`);
    const next = checks.find(c => !c[0]);
    setHint(nextHint, next ? `Gợi ý: ${next[1]} (+${100 - percent}%)` : 'CV đã đầy đủ');
    if (doneBadge) doneBadge.hidden = !personal;
    if (summaryCounter && summaryInput) summaryCounter.textContent = `${summaryInput.value.length} / 500 ký tự`;
  }

  function sync() {
    renderMeter();
    const pf = projectFields();
    const projectHidden = removed.includes('project');
    if (project) project.hidden = projectHidden;
    sheet.style.setProperty('--cv-accent', color); sheet.dataset.template = theme;
    sheet.innerHTML = `<div class="demo-cv-header"><div><h3 id="preview-name">${esc(input('fullname').toUpperCase())}</h3><p id="preview-target">${esc(input('title'))}</p><p><span id="preview-email">${esc(input('email'))}</span> · <span id="preview-phone">${esc(input('phone'))}</span></p><p id="preview-location">${esc(input('location'))}</p><p id="preview-links">${esc([input('github'), input('linkedin')].filter(Boolean).join(' · '))}</p></div><img src="${esc(avatar)}" alt="Ảnh CV" width="64" height="64"></div>
    <section><h4>Mục tiêu nghề nghiệp</h4><p id="preview-summary">${esc(input('summary'))}</p></section>
    <section><h4>Học vấn</h4><strong>${esc(input('school'))}</strong><p>${esc(schoolSection.querySelectorAll('input')[2]?.value || '')}</p><p>${esc(input('major'))}${input('gpa') ? ` · GPA: ${esc(input('gpa'))}` : ''}</p><p>${esc(input('courses'))}</p>${extrasHTML('school')}</section>
    <section><h4>Dự án</h4>${projectHidden ? '' : `<strong>${esc(pf[0]?.value || '')}</strong><p>${esc(pf[1]?.value || '')}</p><p>${esc(pf[2]?.value || '')}</p><p class="demo-prewrap">${esc(pf[3]?.value || '')}</p>`}${extrasHTML('project')}</section>
    <section><h4>Kỹ năng & chứng chỉ</h4><p>${esc(skillTags().join(' · '))}</p>${extrasHTML('skill')}<p>${esc(certificates().join(' · '))}</p></section>
    <section><h4>Hoạt động & giải thưởng</h4>${awards().map(a => `<p>${esc(a)}</p>`).join('')}${extrasHTML('award')}</section>`;
  }

  /** Typed content saved to cvs.content (and frozen into applications.cv_snapshot on apply). */
  function collect(): CvContent {
    const pf = projectFields();
    const projectHidden = removed.includes('project');
    const values: Record<string, string> = {};
    editorFields().forEach((e, i) => { values[fieldKey(e, i)] = e.value; });
    return {
      version: 1,
      personal: { name: input('fullname'), title: input('title'), email: input('email'), phone: input('phone'), location: input('location'), github: input('github'), linkedin: input('linkedin') },
      summary: input('summary'),
      education: [
        ...(input('school') ? [{ school: input('school'), major: input('major'), period: schoolSection.querySelectorAll('input')[2]?.value || '', gpa: input('gpa'), courses: input('courses') }] : []),
        ...extras.filter(x => x.kind === 'school').map(x => ({ school: x.title, major: x.detail, period: '', gpa: '', courses: '' })),
      ],
      projects: [
        ...(!projectHidden && pf[0]?.value ? [{ title: pf[0].value, stack: pf[1]?.value || '', link: pf[2]?.value || '', description: pf[3]?.value || '' }] : []),
        ...extras.filter(x => x.kind === 'project').map(x => ({ title: x.title, stack: '', link: '', description: x.detail })),
      ],
      skills: [...skillTags(), ...extras.filter(x => x.kind === 'skill').map(x => x.title), ...certificates()],
      activities: [...awards().map(a => ({ title: a, detail: '' })), ...extras.filter(x => x.kind === 'award').map(x => ({ title: x.title, detail: x.detail }))],
      theme, color, avatar: avatar === DEFAULT_AVATAR ? undefined : avatar,
      editor: { fields: values, extras, removed },
    };
  }

  // --- Local draft for unsaved edits ---------------------------------------------------------------
  const draftKey = `cv-draft:${current?.id ?? 'new'}`;
  let draftTimer = 0;
  function changed() {
    dirty = true;
    sync();
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => { try { write(draftKey, { at: new Date().toISOString(), content: collect() }); } catch { /* storage full: drafts are best effort */ } }, 500);
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // --- Existing editor controls ------------------------------------------------------------------
  function renderExtras() {
    document.querySelectorAll('.demo-cv-extra-editor').forEach(e => e.remove());
    const places: Record<string, HTMLElement | undefined> = { school: schoolSection, project: projectSection, skill: skillsSection, award: awardSection };
    extras.forEach(x => {
      const row = el('div', { className: 'demo-card demo-cv-extra-editor' }, el('strong', {}, x.title), x.detail ? el('p', {}, x.detail) : null);
      row.append(button('Sửa', () => edit(x.kind, x)), button('Xóa', () => { extras = extras.filter(e => e.id !== x.id); renderExtras(); changed(); }));
      places[x.kind]?.append(row);
    });
  }
  function edit(kind: string, entry?: Extra) {
    const names: Record<string, string> = { school: 'trường học', project: 'dự án', skill: 'kỹ năng', award: 'hoạt động / giải thưởng' };
    dialog((entry ? 'Sửa ' : 'Thêm ') + names[kind], field('title', 'Tên', entry?.title || '') + `<label>Mô tả<textarea name="detail">${esc(entry?.detail || '')}</textarea></label>`, 'Lưu', form => {
      const item = { id: entry?.id || crypto.randomUUID(), kind, title: value(form, 'title'), detail: value(form, 'detail') };
      extras = extras.filter(x => x.id !== item.id); extras.push(item); renderExtras(); changed();
    });
  }
  if (removed.includes('awards')) awardSection.querySelectorAll(':scope>div:last-of-type>div').forEach(e => e.remove());
  main.addEventListener('input', e => { if (!(e.target as HTMLElement).closest('[data-cv-toolbar-box]')) changed(); });

  document.querySelectorAll<HTMLButtonElement>('main button').forEach((b, index) => {
    const text = label(b), icon = b.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if (/Thêm trường/.test(text)) bind(b, () => edit('school'));
    else if (/Thêm dự án/.test(text)) bind(b, () => edit('project'));
    else if (/Thêm kỹ năng/.test(text)) bind(b, () => edit('skill'));
    else if (/Thêm mục/.test(text)) bind(b, () => edit('award'));
    else if (/Hiện đại|Tối giản|Kỹ thuật/.test(text)) {
      const value: CvContent['theme'] = /Tối giản/.test(text) ? 'minimal' : /Kỹ thuật/.test(text) ? 'tech' : 'modern';
      // The design styles the active theme with these classes; move them instead of adding a highlight class
      const pick = (chosen: HTMLButtonElement) => chosen.parentElement?.querySelectorAll('button').forEach(x => {
        const on = x === chosen;
        ['bg-primary', 'text-on-primary', 'shadow-sm'].forEach(c => x.classList.toggle(c, on));
        x.setAttribute('aria-pressed', String(on));
      });
      if (value === theme) pick(b);
      bind(b, () => { theme = value; pick(b); changed(); });
    }
    else if (colors[b.title]) bind(b, () => { color = colors[b.title]; changed(); });
    else if (icon === 'zoom_in' || icon === 'zoom_out') bind(b, () => { zoom = Math.max(70, Math.min(130, zoom + (icon === 'zoom_in' ? 10 : -10))); sheet.style.fontSize = 14 * zoom / 100 + 'px'; const t = b.parentElement?.querySelector('span:not(.material-symbols-outlined)'); if (t) t.textContent = zoom + '%'; });
    else if (icon === 'close') {
      const key = 'tag-' + index;
      if (removed.includes(key) || fresh) { b.parentElement?.remove(); if (!removed.includes(key)) removed.push(key); }
      else bind(b, () => { b.parentElement?.remove(); removed.push(key); changed(); });
    }
    else if (icon === 'delete') {
      const isProject = !!project?.contains(b);
      const key = isProject ? 'project' : 'certificate-' + index;
      const card = b.closest<HTMLElement>('div.p-3');
      if (!isProject && (removed.includes(key) || fresh)) { card?.remove(); if (!removed.includes(key)) removed.push(key); }
      else bind(b, () => dialog('Xóa mục khỏi CV?', '<p>Bạn có thể thêm lại mục này bằng nút Thêm.</p>', 'Xóa', () => { if (!isProject) card?.remove(); removed.push(key); changed(); }));
    }
    else if (icon === 'edit') bind(b, () => { const target = projectFields()[0]; if (removed.includes('project')) { removed = removed.filter(r => r !== 'project'); changed(); } target?.focus(); target?.select(); });
    else if (icon === 'photo_camera') bind(b, () => upload('Đổi ảnh CV', 'image/png,image/jpeg,image/webp', async file => {
      if (file.size > 2 * 1024 * 1024 || !/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Chọn ảnh PNG, JPG hoặc WebP dưới 2 MB.'); return; }
      try { avatar = publicUrl('avatars', await uploadAvatar(file)); (document.getElementById('cv-avatar-preview') as HTMLImageElement).src = avatar; changed(); toast('Đã cập nhật ảnh (dùng cho hồ sơ và CV).'); }
      catch (error) { showError(error); }
    }));
    else if (b.id === 'ai-summary-btn') bind(b, () => { (inputEl('summary') as HTMLTextAreaElement).value = `Tôi là ${input('fullname')}, theo học ${input('major')} tại ${input('school')}. Mong muốn ứng tuyển ${input('title')}, vận dụng kiến thức qua dự án thực tế, học hỏi từ mentor và đóng góp vào sản phẩm của đội ngũ.`; changed(); toast('Đã áp dụng gợi ý mẫu để bạn chỉnh sửa.'); });
    else if (/Lưu &/.test(text)) bind(b, () => void save());
    else if (/Tải PDF/.test(text)) bind(b, () => window.print());
    else if (/Xuất liên kết/.test(text)) bind(b, () => void shareLink());
  });
  (document.getElementById('cv-avatar-preview') as HTMLImageElement | null)?.setAttribute('src', avatar);

  // --- Toolbar: CV picker, title, default, public link, PDF upload, delete -----------------------------
  const picker = el('select', { 'aria-label': 'Chọn CV', 'data-cv-toolbar': 'true' } as never);
  picker.append(...cvs.map(c => new Option(`${c.title}${c.is_default ? ' (mặc định)' : ''}`, c.id)), new Option('+ Tạo CV mới', 'new'));
  picker.value = current?.id ?? 'new';
  const titleInput = el('input', { 'aria-label': 'Tên CV', value: current?.title ?? (cvs.length ? `CV ${cvs.length + 1}` : 'CV của tôi'), maxLength: 120, 'data-cv-toolbar': 'true' } as never) as HTMLInputElement;
  const status = el('span', { className: 'ei-muted', role: 'status' });
  const defaultBtn = el('button', { type: 'button', className: 'ei-button' }, 'Đặt làm mặc định');
  const publicBox = el('input', { type: 'checkbox', 'data-cv-toolbar': 'true' } as never) as HTMLInputElement;
  const publicLabel = el('label', { className: 'ei-button' }, publicBox, ' Công khai');
  const copyBtn = el('button', { type: 'button', className: 'ei-button' }, 'Sao chép liên kết');
  const fileInput = el('input', { type: 'file', accept: 'application/pdf', hidden: true, 'data-cv-toolbar': 'true' } as never) as HTMLInputElement;
  const fileLabel = el('label', { className: 'ei-button' }, fileInput, 'Tải PDF lên');
  const fileLink = el('button', { type: 'button', className: 'ei-button' }, 'Mở PDF đã tải');
  const deleteBtn = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Xóa CV');
  const toolbar = el('div', { className: 'ei-card cv-toolbar', 'data-cv-toolbar-box': 'true', 'aria-label': 'Quản lý CV' } as never,
    el('div', { className: 'ei-actions' }, picker, titleInput, status),
    el('div', { className: 'ei-actions' }, defaultBtn, publicLabel, copyBtn, fileLabel, fileLink, deleteBtn));
  main.prepend(toolbar);

  function renderToolbar() {
    const exists = !!current;
    defaultBtn.textContent = current?.is_default ? '✓ CV mặc định' : 'Đặt làm mặc định';
    defaultBtn.disabled = !exists || !!current?.is_default;
    publicBox.checked = !!current?.is_public; publicBox.disabled = !exists;
    copyBtn.hidden = !current?.is_public;
    fileLabel.hidden = !exists; fileLink.hidden = !current?.file_path; deleteBtn.hidden = !exists;
    status.textContent = exists ? `Đã lưu ${formatDateTime(current!.updated_at)}` : 'CV mới — chưa lưu';
  }
  const replaceCurrent = (row: CvRow) => {
    if (row.is_default) cvs.forEach(c => { c.is_default = c.id === row.id; });
    cvs = [row, ...cvs.filter(c => c.id !== row.id)];
    current = row;
    picker.replaceChildren(...cvs.map(c => new Option(`${c.title}${c.is_default ? ' (mặc định)' : ''}`, c.id)), new Option('+ Tạo CV mới', 'new'));
    picker.value = row.id;
    renderToolbar();
  };

  async function save() {
    try {
      const row = await saveCv(current?.id ?? null, titleInput.value, collect(), cvs.length === 0);
      const wasNew = !current;
      replaceCurrent(row);
      dirty = false;
      localStorage.removeItem(`internships:${draftKey}`);
      if (wasNew) { localStorage.removeItem('internships:cv-draft:new'); const url = new URL(location.href); url.searchParams.set('id', row.id); history.replaceState(null, '', url); }
      toast(wasNew ? 'Đã tạo CV.' : 'Đã lưu CV.');
      // Came here from the apply dialog: offer to go back to the job
      const back = safeReturnPath(new URLSearchParams(location.search).get('return'));
      if (back) dialog('Đã lưu CV', '<p>Quay lại tin tuyển dụng để nộp đơn với CV này?</p>', 'Quay lại ứng tuyển', () => location.assign(back));
      return row;
    } catch (error) { showError(error); return null; }
  }
  async function shareLink() {
    if (!current || dirty) { const row = await save(); if (!row) return; }
    if (!current!.is_public) {
      dialog('Bật liên kết công khai?', '<p>Bất kỳ ai có liên kết đều xem được CV này (không cần đăng nhập). Bạn có thể tắt bất cứ lúc nào.</p>', 'Bật và chia sẻ', async () => {
        try { replaceCurrent(await setCvFlags(current!.id, { is_public: true })); share('Chia sẻ CV', `${location.origin}${routes.cv}?slug=${current!.public_slug}`); }
        catch (error) { showError(error); }
      });
      return;
    }
    share('Chia sẻ CV', `${location.origin}${routes.cv}?slug=${current!.public_slug}`);
  }

  picker.addEventListener('change', () => {
    const go = () => location.assign(`${location.pathname}?id=${picker.value}`);
    if (dirty) dialog('Bỏ thay đổi chưa lưu?', '<p>Bản nháp vẫn được giữ trên trình duyệt này.</p>', 'Chuyển CV', go);
    else go();
  });
  titleInput.addEventListener('change', async () => { if (current) { try { replaceCurrent(await setCvFlags(current.id, { title: titleInput.value.trim() || 'CV của tôi' })); toast('Đã đổi tên CV.'); } catch (error) { showError(error); } } });
  defaultBtn.addEventListener('click', async () => { if (current) { try { replaceCurrent(await setCvFlags(current.id, { is_default: true })); toast('Đã đặt làm CV mặc định khi ứng tuyển.'); } catch (error) { showError(error); } } });
  publicBox.addEventListener('change', async () => {
    if (!current) return;
    try { replaceCurrent(await setCvFlags(current.id, { is_public: publicBox.checked })); toast(publicBox.checked ? 'CV đã công khai qua liên kết.' : 'Đã tắt liên kết công khai.'); }
    catch (error) { showError(error); publicBox.checked = !publicBox.checked; }
  });
  copyBtn.addEventListener('click', () => void shareLink());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; if (!file || !current) return;
    if (file.type !== 'application/pdf' || file.size > 5 * 1024 * 1024) { toast('Chọn tệp PDF dưới 5 MB.'); return; }
    try { replaceCurrent(await uploadCvFile(current.id, file)); toast('Đã đính kèm tệp PDF vào CV.'); } catch (error) { showError(error); }
    fileInput.value = '';
  });
  fileLink.addEventListener('click', async () => { if (current?.file_path) { try { window.open(await cvFileUrl(current.file_path), '_blank', 'noopener'); } catch (error) { showError(error); } } });
  deleteBtn.addEventListener('click', () => dialog('Xóa CV?', `<p>Xóa <strong>${esc(current?.title ?? '')}</strong>? Các đơn đã nộp vẫn giữ bản CV lúc nộp.</p>`, 'Xóa CV', async () => {
    try { await deleteCv(current!.id); dirty = false; location.assign(location.pathname); } catch (error) { showError(error); }
  }));

  // --- Print ---------------------------------------------------------------------------------------------
  window.addEventListener('beforeprint', () => { document.getElementById('demo-print-region')?.remove(); const print = el('div', { id: 'demo-print-region' }); print.append(sheet.cloneNode(true)); document.body.append(print); });
  window.addEventListener('afterprint', () => document.getElementById('demo-print-region')?.remove());

  renderExtras(); sync(); renderToolbar();

  // Offer an unsaved local draft that is newer than the saved CV
  const draft = read<{ at: string; content: CvContent } | null>(draftKey, null);
  if (draft && (!current || draft.at > current.updated_at) && draft.content.editor) {
    dialog('Khôi phục bản nháp?', `<p>Có thay đổi chưa lưu từ ${esc(formatDateTime(draft.at))}.</p>`, 'Khôi phục', () => {
      const d = draft.content;
      editorFields().forEach((e, i) => { const v = d.editor!.fields[fieldKey(e, i)]; if (v !== undefined) e.value = v; });
      extras = d.editor!.extras; removed = d.editor!.removed; theme = d.theme; color = d.color; avatar = d.avatar || avatar;
      renderExtras(); changed();
    });
  }
  if (new URLSearchParams(location.search).has('print')) dialog('CV đã sẵn sàng', '<p>Chọn In / Lưu PDF để mở hộp thoại in của trình duyệt.</p>', 'In / Lưu PDF', () => window.print());
}
