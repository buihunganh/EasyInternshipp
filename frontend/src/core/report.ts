import { dialog, toast } from './ui/feedback';
import { read, write } from './storage';
import { supabase, type Enums } from './supabase';
import { showError, unwrap } from './errors';

const reasons: [Enums<'report_reason'>, string][] = [
  ['scam_fee', 'Yêu cầu đóng phí / lừa đảo'], ['fake_job', 'Tin tuyển dụng giả'], ['misinformation', 'Thông tin sai lệch'],
  ['harassment', 'Quấy rối'], ['spam', 'Spam'], ['inappropriate', 'Nội dung không phù hợp'], ['other', 'Khác'],
];

export interface ReportTarget { type: Enums<'report_target'>; id: string }

/**
 * Report a piece of content. With a target (a real database row) the report goes to the admin queue;
 * guests may report too (BR-37). Without one (pages still on local demo data) it is kept in the browser.
 */
export function reportContent(context: string, target?: ReportTarget) {
  const reasonField = target
    ? `<label>Lý do<select name="kind" required>${reasons.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`
    : '';
  dialog('Báo cáo nội dung', `<p class="app-muted">Mô tả vấn đề bạn gặp với nội dung này. Ban quản trị sẽ xem xét trong thời gian sớm nhất.</p>${reasonField}<label>Chi tiết<textarea name="reason" ${target ? '' : 'required'} maxlength="2000" placeholder="Thông tin sai lệch, nội dung không phù hợp..."></textarea></label>`, 'Gửi báo cáo', async form => {
    const details = (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();
    if (!target) {
      const reports = read<{ context: string; reason: string }[]>('reports', []);
      reports.push({ context, reason: details }); write('reports', reports);
      toast('Đã lưu báo cáo.');
      return;
    }
    try {
      const reason = (form.elements.namedItem('kind') as HTMLSelectElement).value as Enums<'report_reason'>;
      // reporter_id comes from its column default (auth.uid(), null for guests)
      unwrap(await supabase.from('reports').insert({ target_type: target.type, target_id: target.id, reason, details: details || null }));
      toast('Đã gửi báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn.');
    } catch (error) { showError(error); }
  });
}
