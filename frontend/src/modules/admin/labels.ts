// Vietnamese labels shared by the admin console tabs and the overview.
import { jobStatusLabel } from '../../core/format';

export const roleNames: Record<string, string> = { student: 'Sinh viên', employer: 'Nhà tuyển dụng', university_officer: 'Cán bộ nhà trường', admin: 'Quản trị viên' };
export const auditTable: Record<string, string> = { jobs: 'Tin tuyển dụng', companies: 'Doanh nghiệp', profiles: 'Tài khoản' };
export const auditActionLabels: Record<string, string> = {
  'job.approve': 'Duyệt tin',
  'job.reject': 'Từ chối tin',
  'job.submit': 'Gửi duyệt tin',
  'job.takedown': 'Gỡ tin vi phạm',
  'job.duplicate': 'Nhân bản tin',
  'job.university_approve': 'Trường duyệt tin',
  'job.university_reject': 'Trường từ chối tin',
  'company.create': 'Tạo doanh nghiệp',
  'company.add_member': 'Thêm thành viên doanh nghiệp',
  'company.submit_verification': 'Gửi hồ sơ thẩm định',
  'company.verified': 'Xác thực doanh nghiệp',
  'user.suspended': 'Tạm khóa tài khoản',
};

export function formatAuditAction(action: string): string {
  if (auditActionLabels[action]) return auditActionLabels[action];
  if (action.startsWith('job.')) {
    const status = action.slice(4);
    if (jobStatusLabel[status]) return `Tin chuyển sang "${jobStatusLabel[status]}"`;
  }
  return action;
}
export const reportReason: Record<string, string> = { scam_fee: 'Thu phí / lừa đảo', fake_job: 'Tin giả', harassment: 'Quấy rối', spam: 'Spam', misinformation: 'Sai sự thật', inappropriate: 'Không phù hợp', other: 'Khác' };
export const reportTarget: Record<string, string> = { job: 'Tin tuyển dụng', company: 'Doanh nghiệp', user: 'Tài khoản', post: 'Bài viết', comment: 'Bình luận', message: 'Tin nhắn' };
