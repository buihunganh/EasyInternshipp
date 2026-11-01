// vi-VN formatting in the Asia/Ho_Chi_Minh time zone.
const TZ = 'Asia/Ho_Chi_Minh';

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function relativeTime(value: string | Date | null | undefined) {
  if (!value) return '';
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  return 'vừa xong';
}

export function formatVnd(amount: number | null | undefined) {
  if (amount == null) return '';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
}

/** "8 - 12 Triệu VNĐ", "Từ 8 Triệu VNĐ", "Thỏa thuận" — same wording as the design. */
export function formatStipend(min: number | null | undefined, max: number | null | undefined) {
  const m = (v: number) => (v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (min && max && min !== max) return `${m(min)} - ${m(max)} Triệu VNĐ`;
  if (min || max) return `${min && !max ? 'Từ ' : max && !min ? 'Đến ' : ''}${m((min || max)!)} Triệu VNĐ`;
  return 'Thỏa thuận';
}

export const workTypeLabel: Record<string, string> = { onsite: 'Tại văn phòng', hybrid: 'Hybrid', remote: '100% Từ xa (Remote)' };
export const scheduleLabel: Record<string, string> = { full_time: 'Toàn thời gian', part_time: 'Bán thời gian', flexible: 'Linh hoạt' };
export const jobStatusLabel: Record<string, string> = {
  draft: 'Bản nháp', pending_approval: 'Chờ duyệt', active: 'Đang tuyển', rejected: 'Bị từ chối',
  paused: 'Tạm dừng', closed: 'Đã đóng', expired: 'Hết hạn',
};
export const verifyStatusLabel: Record<string, string> = {
  unverified: 'Chưa xác thực', pending: 'Chờ thẩm định', verified: 'Đã xác thực', rejected: 'Bị từ chối', revoked: 'Đã thu hồi',
};

export const applicationStatusLabel: Record<string, string> = {
  applied: 'Mới nộp',
  cv_viewed: 'NTD đã xem CV',
  screening: 'Đang sàng lọc',
  shortlisted: 'Đã chọn lọc',
  interviewing: 'Đang phỏng vấn',
  offered: 'Đã gửi offer',
  hired: 'Đã nhận việc',
  rejected: 'Bị từ chối',
  withdrawn: 'Đã rút đơn',
  offer_declined: 'Từ chối offer',
};

export const rsvpStatusLabel: Record<string, string> = {
  pending: 'Chờ phản hồi',
  accepted: 'Đã xác nhận',
  declined: 'Đã từ chối',
  reschedule_requested: 'Đề xuất đổi giờ',
};

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
