// Apply modal (Phase 6): CV picker (default preselected, "Tạo CV" shortcut), cover letter, screening
// questions by kind with required markers, then apply_to_job. Database errors (duplicate, deadline,
// exclusive) are shown inside the dialog.
import { dialog, toast } from '../../core/ui/feedback';
import { esc } from '../../core/ui/actions';
import { currentRole } from '../../core/session';
import { routes } from '../../core/navigation';
import { showError } from '../../core/errors';
import { formatDate } from '../../core/format';
import { applyToJob, getJob, hasApplied, myCvs } from './api';

type Question = { id: string; position: number; question: string; kind: string; options: unknown; is_required: boolean };

function questionField(q: Question, index: number) {
  const required = q.is_required ? ' required' : '';
  const title = `${index + 1}. ${esc(q.question)}${q.is_required ? ' <span class="apply-required" aria-hidden="true">*</span>' : ' <small class="app-muted">(không bắt buộc)</small>'}`;
  if (q.kind === 'yes_no') {
    return `<fieldset class="apply-question"><legend>${title}</legend><label class="apply-choice"><input type="radio" name="q-${q.id}" value="yes"${required}> Có</label><label class="apply-choice"><input type="radio" name="q-${q.id}" value="no"> Không</label></fieldset>`;
  }
  if (q.kind === 'single_choice') {
    const options = Array.isArray(q.options) ? q.options.map(String) : [];
    return `<fieldset class="apply-question"><legend>${title}</legend>${options.map((o, i) => `<label class="apply-choice"><input type="radio" name="q-${q.id}" value="${esc(o)}"${i === 0 ? required : ''}> ${esc(o)}</label>`).join('')}</fieldset>`;
  }
  return `<label class="apply-question">${title}<textarea name="q-${q.id}" maxlength="2000"${required}></textarea></label>`;
}

/** Apply to a job with a CV, a cover letter and the screening answers (apply_to_job RPC). */
export async function openApplyDialog(jobId: string, onApplied?: () => void) {
  if (currentRole() !== 'student') { toast('Chỉ tài khoản sinh viên mới ứng tuyển được.'); return; }
  try {
    const [job, cvs, applied] = await Promise.all([getJob(jobId), myCvs(), hasApplied(jobId)]);
    if (!job) { toast('Tin tuyển dụng không còn nhận hồ sơ.'); return; }
    if (applied) {
      dialog('Bạn đã ứng tuyển vị trí này', '<p>Mỗi vị trí chỉ nộp một đơn. Theo dõi tiến độ trong "Đơn ứng tuyển".</p>', 'Xem đơn ứng tuyển', () => location.assign(routes.applications));
      return;
    }
    const back = encodeURIComponent(location.pathname + location.search);
    if (!cvs.length) {
      dialog('Bạn cần có CV trước khi ứng tuyển', '<p>Tạo CV trên Internships.io (hoặc đính kèm PDF có sẵn), sau đó quay lại để nộp đơn.</p>', 'Tạo CV ngay', () => location.assign(`${routes['cv-builder']}?id=new&return=${back}`));
      return;
    }
    const questions = ((job.questions ?? []) as Question[]).sort((a, b) => a.position - b.position);
    const cvOptions = cvs.map(cv => `<option value="${cv.id}"${cv.is_default ? ' selected' : ''}>${esc(cv.title)}${cv.is_default ? ' (mặc định)' : ''} · cập nhật ${formatDate(cv.updated_at)}</option>`).join('');
    const modal = dialog(`Ứng tuyển — ${job.title}`, `
      <p class="app-muted">${esc(job.company?.name ?? '')}${job.deadline ? ` · Hạn nộp ${formatDate(job.deadline)}` : ''}</p>
      <label>CV gửi kèm <span class="apply-required" aria-hidden="true">*</span><select name="cv" required>${cvOptions}<option value="__new">+ Tạo CV mới…</option></select></label>
      <p class="app-muted apply-cv-links"><a href="${routes['cv-builder']}" target="_blank" rel="noopener" data-cv-link>Xem / sửa CV đã chọn</a> · CV được lưu lại nguyên trạng tại thời điểm nộp.</p>
      <label>Thư giới thiệu<textarea name="letter" maxlength="5000" placeholder="Giới thiệu ngắn về bạn và lý do phù hợp với vị trí..."></textarea></label>
      ${questions.length ? `<h3>Câu hỏi sàng lọc</h3>${questions.map(questionField).join('')}` : ''}`, 'Nộp đơn ứng tuyển', async form => {
      const answers = questions.map(q => {
        const field = form.elements.namedItem(`q-${q.id}`) as RadioNodeList | HTMLTextAreaElement | null;
        return { question_id: q.id, answer: (field && 'value' in field ? field.value : '').trim() };
      }).filter(a => a.answer);
      await applyToJob(jobId, (form.elements.namedItem('cv') as HTMLSelectElement).value, (form.elements.namedItem('letter') as HTMLTextAreaElement).value.trim(), answers);
      toast('Đã nộp đơn ứng tuyển. Theo dõi tiến độ trong "Đơn ứng tuyển".');
      onApplied?.();
    }, { keepOpen: true });
    const select = modal.querySelector<HTMLSelectElement>('select[name=cv]')!;
    const link = modal.querySelector<HTMLAnchorElement>('[data-cv-link]')!;
    const syncLink = () => { link.href = `${routes['cv-builder']}?id=${select.value}`; };
    select.addEventListener('change', () => {
      if (select.value === '__new') { location.assign(`${routes['cv-builder']}?id=new&return=${back}`); return; }
      syncLink();
    });
    syncLink();
  } catch (error) { showError(error); }
}
