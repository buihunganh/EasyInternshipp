// Post job (Phase 5): the design's form saves real drafts (+ department, target students, perks,
// skills via ensure_skill, screening questions + answer keys), "Lưu nháp" vs "Gửi duyệt" (submit_job),
// edit an existing job with ?id=, rejection reason, warning that live edits go back to review.
import { flash } from '../../core/auth';
import { label, routes, jobHref } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, button, esc, field, value } from '../../core/ui/actions';
import { showError, toAppError } from '../../core/errors';
import { formatStipend, jobStatusLabel, workTypeLabel } from '../../core/format';
import { el } from '../../core/render';
import { publicUrl } from '../../core/supabase';
import { initialsAvatar } from '../../core/layout/siteHeader';
import {
  getJobForEdit, listIndustries, myCompany, replaceQuestions, saveJob, submitJob, syncSkills,
  type EditableJob, type JobFields, type QuestionInput,
} from './api';

/** Work-mode radio → (work_type, schedule). */
const workModes: Record<string, Pick<JobFields, 'work_type' | 'schedule'>> = {
  hybrid: { work_type: 'hybrid', schedule: 'flexible' }, fulltime: { work_type: 'onsite', schedule: 'full_time' },
  parttime: { work_type: 'onsite', schedule: 'part_time' }, remote: { work_type: 'remote', schedule: 'flexible' },
};
/** Department option → industry slug (drives the home page industry filter and "similar jobs"). */
const departmentIndustry: Record<string, string> = {
  software: 'cong-nghe-thong-tin', uiux: 'thiet-ke', data: 'du-lieu', marketing: 'marketing', business: 'kinh-doanh', hr: 'nhan-su',
};
/** Student year checkboxes → target_study_years (5 = graduated less than a year ago). */
const yearValues: [RegExp, number][] = [[/Năm 3/, 3], [/Năm 4/, 4], [/Mới tốt nghiệp/, 5]];
const kindLabel: Record<string, string> = { yes_no: 'Có / Không', short_text: 'Trả lời ngắn', single_choice: 'Trắc nghiệm' };

const money = (text: string) => { const n = Number(text.replace(/\D/g, '')); return n > 0 ? n : null; };
const formatMoney = (n: number | null) => (n ? n.toLocaleString('vi-VN') : '');

export async function setupPosting() {
  const company = await myCompany().catch(error => { showError(error); return null; });
  if (!company) { flash('Hãy tạo hồ sơ doanh nghiệp trước khi đăng tin.'); location.replace(routes['company-settings']); return; }
  const industries = await listIndustries().catch(() => []);

  const form = document.querySelector<HTMLFormElement>('#jobForm')!;
  form.noValidate = true;
  const title = document.querySelector<HTMLInputElement>('#job-title')!;
  title.required = true; title.maxLength = 200; title.minLength = 3;
  const department = document.querySelector<HTMLSelectElement>('#department')!;
  const headcount = document.querySelector<HTMLInputElement>('#headcount')!;
  const address = document.querySelector<HTMLInputElement>('#location')!;
  const salaryMin = document.querySelector<HTMLInputElement>('#salary-min')!;
  const salaryMax = document.querySelector<HTMLInputElement>('#salary-max')!;
  const editor = document.querySelector<HTMLElement>('div.min-h-\\[220px\\]')!;
  editor.contentEditable = 'true'; editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-label', 'Mô tả công việc'); editor.setAttribute('aria-multiline', 'true');
  const preview = document.querySelector<HTMLElement>('.post-job-preview');
  const status = [...document.querySelectorAll<HTMLElement>('main span')].find(s => /Bản nháp tự lưu/.test(s.textContent || ''));
  const byLabel = (re: RegExp) => [...form.querySelectorAll('label')].find(l => re.test(l.textContent || ''));
  const yearBoxes = [...(byLabel(/Trình độ sinh viên/)?.nextElementSibling?.querySelectorAll<HTMLInputElement>('input[type=checkbox]') ?? [])];
  const majorsHost = byLabel(/Chuyên ngành đào tạo/)?.nextElementSibling as HTMLElement;
  const addMajorButton = [...majorsHost.querySelectorAll('button')].find(b => /Thêm chuyên ngành/.test(label(b)))!;
  const tagTemplate = majorsHost.querySelector('span')!.cloneNode(true) as HTMLElement;
  const perkBoxes = [...(byLabel(/Các đặc quyền/)?.nextElementSibling?.querySelectorAll<HTMLInputElement>('input[type=checkbox]') ?? [])];
  const paid = [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(c => /có lương/i.test(c.closest('div')?.parentElement?.textContent || ''))!;
  const skillInput = form.querySelector<HTMLInputElement>('input[placeholder^="+ Thêm"]')!;
  const skillsHost = skillInput.parentElement!;
  const questionHeader = [...form.querySelectorAll('h2')].find(h => /Câu hỏi sàng lọc/.test(h.textContent || ''))!.closest('div')!.parentElement!.parentElement!;
  const questionList = questionHeader.nextElementSibling as HTMLElement;
  const questionTemplate = questionList.firstElementChild!.cloneNode(true) as HTMLElement;

  // Exclusive / partner-university posting arrives with the university portal (Phase 10)
  const universityBlock = [...form.querySelectorAll('label')].find(l => /Cổng thông tin trường/.test(l.textContent || ''))?.closest('div')?.parentElement as HTMLElement | undefined;
  if (universityBlock) universityBlock.hidden = true;

  // Deadline (optional; empty = 30 days after approval, BR-15)
  const deadlineField = el('label', { className: 'ei-field', htmlFor: 'deadline' }, 'Hạn nhận hồ sơ',
    el('input', { id: 'deadline', type: 'date', min: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }),
    el('small', {}, 'Để trống: tin mở 30 ngày kể từ khi được duyệt.'));
  address.closest('div')!.parentElement!.after(deadlineField);
  const deadline = deadlineField.querySelector('input')!;

  // --- Tags (majors, skills) -------------------------------------------------------
  const tagTexts = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(':scope > span')].map(s => s.firstChild?.textContent?.trim() || '').filter(Boolean);
  function addTag(host: HTMLElement, text: string, before: Element | null) {
    if (!text || tagTexts(host).some(t => t.toLowerCase() === text.toLowerCase())) return;
    const tag = tagTemplate.cloneNode(true) as HTMLElement;
    tag.firstChild!.textContent = ` ${text} `;
    const close = tag.querySelector('button')!;
    close.setAttribute('aria-label', `Xóa ${text}`);
    bind(close, () => { tag.remove(); refresh(); });
    host.insertBefore(tag, before);
    refresh();
  }
  const setTags = (host: HTMLElement, texts: string[], before: Element | null) => { host.querySelectorAll(':scope > span').forEach(s => s.remove()); texts.forEach(t => addTag(host, t, before)); };
  bind(addMajorButton, () => dialog('Thêm chuyên ngành', field('tag', 'Tên chuyên ngành'), 'Thêm', f => addTag(majorsHost, value(f, 'tag'), addMajorButton)));
  skillInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTag(skillsHost, skillInput.value.trim(), skillInput);
    skillInput.value = '';
  });

  // --- Questions ---------------------------------------------------------------------
  let questions: QuestionInput[] = [];
  let questionsLocked = false;
  function renderQuestions() {
    if (!questions.length) {
      questionList.replaceChildren(el('p', { className: 'ei-muted' }, questionsLocked ? 'Tin đã có hồ sơ ứng tuyển nên không thể thay đổi câu hỏi sàng lọc.' : 'Chưa có câu hỏi sàng lọc. Bấm "Thêm câu hỏi" để lọc nhanh ứng viên.'));
      return;
    }
    questionList.replaceChildren(...questions.map((q, i) => {
      const card = questionTemplate.cloneNode(true) as HTMLElement;
      const [head, text, answer] = [...card.children] as HTMLElement[];
      const [name, kind] = [...head.children] as HTMLElement[];
      name.textContent = `Câu hỏi ${i + 1}${q.is_knockout ? ' · Loại trực tiếp' : ''}${q.is_required ? '' : ' · Không bắt buộc'}`;
      if (kind) kind.textContent = kindLabel[q.kind];
      text.textContent = q.question + (q.options.length ? ` (${q.options.join(' / ')})` : '');
      if (answer) answer.textContent = q.ideal_answer ? `Đáp án yêu cầu: ${q.kind === 'yes_no' ? (q.ideal_answer === 'yes' ? 'Có' : 'Không') : q.ideal_answer}` : '';
      if (!questionsLocked) {
        const remove = button('Xóa câu hỏi', () => { questions.splice(i, 1); renderQuestions(); refresh(); });
        remove.className = 'ei-button ei-button-danger'; remove.style.marginTop = '8px';
        card.append(remove);
      }
      return card;
    }));
  }
  function questionDialog() {
    if (questionsLocked) { toast('Tin đã có hồ sơ ứng tuyển nên không thể thay đổi câu hỏi sàng lọc.'); return; }
    dialog('Thêm câu hỏi sàng lọc', `${field('question', 'Câu hỏi')}
      <label>Loại câu hỏi<select name="kind"><option value="yes_no">Có / Không</option><option value="single_choice">Trắc nghiệm (một đáp án)</option><option value="short_text">Trả lời ngắn</option></select></label>
      <label>Các lựa chọn (trắc nghiệm, cách nhau bởi dấu phẩy)<input name="options" placeholder="VD: 2 buổi, 3 buổi, 4 buổi"></label>
      <label>Đáp án yêu cầu (không bắt buộc; Có/Không: nhập "yes" hoặc "no")<input name="ideal" placeholder="VD: yes"></label>
      <label class="app-setting-row"><span>Bắt buộc trả lời</span><input type="checkbox" name="required" checked></label>
      <label class="app-setting-row"><span>Loại trực tiếp nếu trả lời sai (knockout)</span><input type="checkbox" name="knockout"></label>`, 'Thêm câu hỏi', f => {
      const kind = (f.elements.namedItem('kind') as HTMLSelectElement).value as QuestionInput['kind'];
      const options = value(f, 'options').split(',').map(o => o.trim()).filter(Boolean);
      let ideal = value(f, 'ideal');
      if (kind === 'yes_no' && ideal) ideal = /^(c[oó]|yes|y)$/i.test(ideal) ? 'yes' : 'no';
      if (kind === 'single_choice' && options.length < 2) { toast('Câu hỏi trắc nghiệm cần ít nhất 2 lựa chọn.'); return; }
      questions.push({ question: value(f, 'question'), kind, options: kind === 'single_choice' ? options : [], ideal_answer: kind === 'short_text' ? '' : ideal,
        is_required: (f.elements.namedItem('required') as HTMLInputElement).checked, is_knockout: (f.elements.namedItem('knockout') as HTMLInputElement).checked });
      renderQuestions(); refresh();
    });
  }

  // --- Load / collect -----------------------------------------------------------------
  let jobId = new URLSearchParams(location.search).get('id');
  let job: EditableJob | null = null;

  function fill(j: EditableJob) {
    title.value = j.title;
    const deptOption = [...department.options].find(o => o.text === j.department || o.value === j.department);
    if (deptOption) department.value = deptOption.value;
    headcount.value = String(j.openings);
    const mode = Object.entries(workModes).find(([, m]) => m.work_type === j.work_type && m.schedule === j.schedule)?.[0]
      ?? (j.work_type === 'remote' ? 'remote' : j.work_type === 'hybrid' ? 'hybrid' : j.schedule === 'part_time' ? 'parttime' : 'fulltime');
    form.querySelectorAll<HTMLInputElement>('input[name=work_mode]').forEach(r => { r.checked = r.value === mode; });
    address.value = j.address ?? j.city ?? '';
    deadline.value = j.deadline ? j.deadline.slice(0, 10) : '';
    yearBoxes.forEach(box => { const year = yearValues.find(([re]) => re.test(box.closest('label')?.textContent || ''))?.[1]; box.checked = !!year && j.target_study_years.includes(year); });
    setTags(majorsHost, j.target_majors, addMajorButton);
    paid.checked = !!(j.stipend_min || j.stipend_max);
    salaryMin.value = formatMoney(j.stipend_min); salaryMax.value = formatMoney(j.stipend_max);
    perkBoxes.forEach(box => { box.checked = j.perks.includes(box.closest('label')?.querySelector('span:last-child')?.textContent?.trim() || ''); });
    editor.innerText = j.description;
    setTags(skillsHost, (j.skills ?? []).map(s => s.skill?.name ?? '').filter(Boolean), skillInput);
    questions = [...(j.questions ?? [])].sort((a, b) => a.position - b.position).map(q => ({
      question: q.question, kind: q.kind, options: Array.isArray(q.options) ? q.options.map(String) : [], is_required: q.is_required, is_knockout: q.is_knockout,
      ideal_answer: (Array.isArray(q.key) ? q.key[0]?.ideal_answer : (q.key as { ideal_answer?: string } | null)?.ideal_answer) ?? '',
    }));
    questionsLocked = j.application_count > 0;
  }

  function collect(): JobFields {
    const mode = form.querySelector<HTMLInputElement>('input[name=work_mode]:checked')?.value ?? 'hybrid';
    const addr = address.value.trim();
    const deptText = department.selectedOptions[0]?.text.trim() || null;
    const industrySlug = departmentIndustry[department.value];
    return {
      title: title.value.trim(), description: editor.innerText.trim(), department: deptText,
      openings: Math.max(1, Math.min(50, Number(headcount.value) || 1)), ...workModes[mode],
      address: addr || null, city: addr ? addr.split(',').pop()!.trim() : null,
      target_study_years: yearBoxes.filter(b => b.checked).map(b => yearValues.find(([re]) => re.test(b.closest('label')?.textContent || ''))?.[1]).filter((y): y is number => !!y),
      target_majors: tagTexts(majorsHost), perks: perkBoxes.filter(b => b.checked).map(b => b.closest('label')?.querySelector('span:last-child')?.textContent?.trim() || '').filter(Boolean),
      stipend_min: paid.checked ? money(salaryMin.value) : null, stipend_max: paid.checked ? money(salaryMax.value) : null,
      stipend_negotiable: !paid.checked, deadline: deadline.value ? new Date(`${deadline.value}T23:59:00+07:00`).toISOString() : null,
      industry_id: industries.find(i => i.slug === industrySlug)?.id ?? null,
    };
  }

  // --- Live preview & quality score ---------------------------------------------------------
  function refresh() {
    const f = collect();
    const counter = document.getElementById('title-counter');
    if (counter) counter.textContent = `${f.title.length} / 200 ký tự`;
    if (preview) {
      // aside > widget 1 > [header row, simulated job card]
      const card = preview.firstElementChild?.children[1] as HTMLElement | undefined;
      if (card) {
        const logo = card.querySelector('img');
        if (logo) { logo.src = publicUrl('company-assets', company!.logo_path) || initialsAvatar(company!.name); logo.alt = company!.name; }
        const companyName = card.querySelector('img + div p');
        if (companyName) companyName.textContent = company!.name;
        const companyNote = companyName?.nextElementSibling as HTMLElement | null;   // "Doanh nghiệp đối tác trường học"
        if (companyNote) { const icon = companyNote.firstElementChild; companyNote.replaceChildren(...(icon ? [icon] : []), ` ${company!.verification_status === 'verified' ? 'Doanh nghiệp đã xác thực' : 'Doanh nghiệp chưa xác thực'}`); }
        const urgent = card.firstElementChild?.lastElementChild as HTMLElement | null;   // "Tuyển gấp" badge: no such field
        if (urgent && urgent.tagName === 'SPAN') urgent.hidden = true;
        const h3 = card.querySelector('h3'); if (h3) h3.textContent = f.title || 'Tên vị trí tuyển dụng';
        const salary = h3?.nextElementSibling?.children;
        if (salary?.length) { salary[0].textContent = f.stipend_min || f.stipend_max ? `${formatStipend(f.stipend_min, f.stipend_max)} / tháng` : 'Thỏa thuận'; if (salary[1]) salary[1].textContent = workTypeLabel[f.work_type ?? 'onsite']; }
        const badges = h3?.nextElementSibling?.nextElementSibling as HTMLElement | null;
        const badge = badges?.firstElementChild;
        if (badges && badge) badges.replaceChildren(...(f.perks ?? []).slice(0, 3).map(p => { const b = badge.cloneNode(true) as HTMLElement; b.textContent = p; return b; }));
        const locSpan = [...card.querySelectorAll('span')].find(s => s.querySelector('.material-symbols-outlined')?.textContent?.trim() === 'location_on');
        if (locSpan) { const icon = locSpan.firstElementChild!; locSpan.replaceChildren(icon, ` ${f.city ?? 'Chưa có địa chỉ'}`); }
      }
    }
    // Quality score (client-side guidance only)
    const checks: [boolean, string][] = [
      [f.title.length >= 10, 'Chức danh rõ ràng (từ 10 ký tự)'],
      [(f.description ?? '').length >= 50, 'Mô tả công việc đủ chi tiết (từ 50 ký tự)'],
      [!!(f.stipend_min || f.stipend_max), 'Có khoảng phụ cấp thực tập rõ ràng'],
      [tagTexts(skillsHost).length > 0, 'Đã thêm kỹ năng chuyên môn yêu cầu'],
      [(f.perks ?? []).length > 0, 'Đã chọn đặc quyền cho thực tập sinh'],
      [questions.length > 0, 'Có câu hỏi sàng lọc ứng viên'],
      [!!f.address, 'Có địa chỉ làm việc thực tế'],
    ];
    const done = checks.filter(c => c[0]).length;
    const score = Math.round(100 * done / checks.length);
    const gauge = [...document.querySelectorAll('aside svg + span')].find(Boolean) as HTMLElement | undefined;
    if (gauge) gauge.firstChild!.textContent = String(score);
    document.querySelectorAll<SVGPathElement>('aside svg path[stroke-dasharray]').forEach(p => p.setAttribute('stroke-dasharray', `${score}, 100`));
    const scoreWidget = preview?.children[1] as HTMLElement | undefined;
    if (scoreWidget) {
      const rank = scoreWidget.firstElementChild?.lastElementChild as HTMLElement | null;
      if (rank) rank.textContent = score >= 85 ? 'Hạng Tốt' : score >= 55 ? 'Hạng Khá' : 'Cần bổ sung';
      const summary = scoreWidget.children[1]?.lastElementChild?.children;
      if (summary?.length === 2) {
        summary[0].textContent = done === checks.length ? 'Tin đã sẵn sàng hút ứng viên' : `Còn ${checks.length - done} mục nên bổ sung`;
        summary[1].textContent = 'Gợi ý tham khảo, không ảnh hưởng đến kiểm duyệt';
      }
      const tips = scoreWidget.children[2] as HTMLElement | undefined;
      const tipTemplate = tips?.firstElementChild as HTMLElement | null;
      if (tips && tipTemplate) tips.replaceChildren(...checks.map(([ok, text]) => {
        const row = tipTemplate.cloneNode(true) as HTMLElement;
        const [icon, label] = [...row.children] as HTMLElement[];
        icon.textContent = ok ? 'check_circle' : 'radio_button_unchecked';
        icon.classList.toggle('text-tertiary', ok); icon.classList.toggle('text-on-surface-variant', !ok);
        row.classList.toggle('text-on-surface', ok); row.classList.toggle('text-on-surface-variant', !ok);
        label.textContent = text;
        return row;
      }));
    }
  }

  // --- Save / submit ------------------------------------------------------------------------
  function validate(f: JobFields, forSubmit: boolean) {
    if (f.title.length < 3) { title.focus(); throw toAppError({ code: 'P0001', message: 'Vui lòng nhập chức danh tuyển dụng (tối thiểu 3 ký tự).' }); }
    if (f.stipend_min && f.stipend_max && f.stipend_max < f.stipend_min) throw toAppError({ code: 'P0001', message: 'Mức phụ cấp tối đa phải lớn hơn hoặc bằng mức tối thiểu.' });
    if (forSubmit && (f.description ?? "").length < 50) { editor.focus(); throw toAppError({ code: 'P0001', message: 'Mô tả công việc quá ngắn (tối thiểu 50 ký tự).' }); }
  }

  let saving = false;
  async function save(submit: boolean) {
    if (saving) return;
    saving = true;
    try {
      const f = collect();
      validate(f, submit);
      const wasActive = job?.status === 'active';
      const submitting = submit && (!job || ['draft', 'rejected'].includes(job.status));
      jobId = await saveJob(company!.id, jobId, f);
      await syncSkills(jobId, tagTexts(skillsHost));
      if (!questionsLocked) await replaceQuestions(jobId, questions);
      if (submitting) await submitJob(jobId);
      history.replaceState(null, '', `${location.pathname}?id=${jobId}`);
      job = await getJobForEdit(jobId);
      if (job) { renderBanner(job); fill(job); renderQuestions(); refresh(); }
      if (status) status.textContent = `Đã lưu lúc ${new Date().toLocaleTimeString('vi-VN')} · ${jobStatusLabel[job?.status ?? 'draft']}`;
      if (submitting) {
        dialog('Đã gửi tin để duyệt', `<p><strong>${esc(f.title)}</strong> đang chờ quản trị viên kiểm duyệt. Bạn sẽ nhận được thông báo khi tin được xuất bản.</p>`, 'Về trang quản lý tin', () => location.assign(routes.employer));
      } else if (wasActive && job?.status === 'pending_approval') {
        toast('Đã lưu. Tin được gửi duyệt lại do có thay đổi nội dung quan trọng.');
      } else toast(submit ? 'Đã cập nhật tin tuyển dụng.' : 'Đã lưu bản nháp.');
    } catch (error) {
      showError(error);
    } finally { saving = false; }
  }

  // --- Status banner (rejected reason, live-edit warning) -------------------------------------
  function renderBanner(j: EditableJob) {
    document.getElementById('post-job-banner')?.remove();
    const messages: Record<string, [string, string]> = {
      rejected: ['ei-banner-danger', `Tin bị từ chối: ${j.rejection_reason ?? 'không có lý do'}. Chỉnh sửa rồi bấm "Đăng tin tuyển dụng ngay" để gửi duyệt lại.`],
      active: ['ei-banner-warning', 'Tin đang hiển thị. Thay đổi tiêu đề, mô tả, quyền lợi hoặc mức phụ cấp sẽ đưa tin về trạng thái chờ duyệt.'],
      pending_approval: ['ei-banner', 'Tin đang chờ quản trị viên duyệt. Bạn vẫn có thể chỉnh sửa nội dung.'],
      paused: ['ei-banner', 'Tin đang tạm dừng nhận đơn. Mở lại từ trang quản lý tin.'],
      closed: ['ei-banner-danger', 'Tin đã đóng và không thể mở lại. Hãy sao chép tin để đăng vị trí mới.'],
      expired: ['ei-banner-danger', 'Tin đã hết hạn. Hãy sao chép tin để đăng lại.'],
    };
    const message = messages[j.status];
    const h1 = document.querySelector('main h1');
    if (h1) h1.textContent = j.status === 'draft' ? 'Chỉnh sửa bản nháp tin tuyển dụng' : `Chỉnh sửa tin: ${j.title}`;
    if (!message) return;
    const banner = el('div', { id: 'post-job-banner', className: `ei-banner ${message[0]}`, role: 'status', style: 'margin:12px 0' } as never, message[1]);
    if (j.status === 'active') banner.append(' ', el('a', { href: jobHref(j.id) }, 'Xem tin →'));
    document.querySelector('main section')?.append(banner);
    const submitButton = form.querySelector<HTMLButtonElement>('button[type=submit] span');
    if (submitButton) submitButton.textContent = ['draft', 'rejected'].includes(j.status) ? 'Đăng tin tuyển dụng ngay' : 'Lưu thay đổi';
  }

  if (jobId) {
    try { job = await getJobForEdit(jobId); } catch (error) { showError(error); }
    if (!job) { flash('Không tìm thấy tin tuyển dụng.'); location.replace(routes.employer); return; }
    fill(job); renderBanner(job);
  } else {
    // A fresh form instead of the design's sample content
    title.value = ''; address.value = company.address ?? ''; headcount.value = '1'; editor.innerText = '';
    salaryMin.value = ''; salaryMax.value = ''; perkBoxes.forEach(b => { b.checked = false; }); yearBoxes.forEach(b => { b.checked = false; });
    setTags(majorsHost, [], addMajorButton); setTags(skillsHost, [], skillInput);
    if (status) status.textContent = 'Chưa lưu';
    if (company.verification_status !== 'verified') {
      document.querySelector('main section')?.append(el('div', { className: 'ei-banner ei-banner-warning', role: 'status', style: 'margin:12px 0' } as never,
        'Doanh nghiệp chưa được xác thực: bạn có thể lưu bản nháp, nhưng chỉ gửi duyệt được sau khi được cấp tích xanh. ', el('a', { href: routes['company-settings'] }, 'Hoàn thiện hồ sơ →')));
    }
  }
  renderQuestions();
  refresh();
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  editor.addEventListener('input', refresh);
  salaryMin.addEventListener('blur', () => { salaryMin.value = formatMoney(money(salaryMin.value)); });
  salaryMax.addEventListener('blur', () => { salaryMax.value = formatMoney(money(salaryMax.value)); });
  form.addEventListener('submit', e => { e.preventDefault(); void save(true); });

  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    const text = label(b), icon = b.querySelector('.material-symbols-outlined')?.textContent?.trim() || b.textContent?.trim() || '';
    if (b.type === 'submit') return;
    if (/Lưu.*nháp/.test(text)) bind(b, () => void save(false));
    else if (/Xem trước/.test(text)) bind(b, () => dialog('Xem trước tin tuyển dụng', `<h3>${esc(title.value || 'Tên vị trí')}</h3><p class="app-muted">${esc(company!.name)} · ${esc(collect().city ?? '')}</p><p class="demo-prewrap">${esc(editor.innerText)}</p>`, 'Đóng'));
    else if (/Tiếp tục sang/.test(text)) bind(b, () => form.querySelectorAll('h2')[3]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    else if (/Hủy bỏ/.test(text)) bind(b, () => dialog('Hủy thay đổi?', '<p>Các thay đổi chưa lưu sẽ bị bỏ.</p>', 'Hủy thay đổi', () => location.assign(jobId ? `${location.pathname}?id=${jobId}` : routes.employer)));
    else if (/Thêm câu hỏi/.test(text)) bind(b, questionDialog);
    else if (/Khung chuẩn|Đồ án tốt nghiệp|Chuyển đổi ngành/.test(text)) bind(b, () => {
      editor.innerText = `📌 Trách nhiệm công việc chính:\n- Tham gia phát triển sản phẩm cùng mentor\n- Thực hành dự án thực tế và báo cáo tiến độ hằng tuần\n\n🎯 Yêu cầu năng lực ứng viên:\n- Nền tảng kiến thức chuyên ngành vững\n- Tinh thần ham học hỏi, chủ động\n\n(${text})`;
      refresh();
    });
    else if (icon && (/format_/.test(icon) || ['link', 'code'].includes(icon))) {
      b.addEventListener('mousedown', e => e.preventDefault());
      const commands: Record<string, string> = { format_bold: 'bold', format_italic: 'italic', format_underlined: 'underline', format_list_bulleted: 'insertUnorderedList', format_list_numbered: 'insertOrderedList' };
      bind(b, () => { editor.focus(); if (commands[icon]) document.execCommand(commands[icon]); });
    }
  });
}
