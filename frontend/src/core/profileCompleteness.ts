// Student profile completeness (client-side guidance only). Shared by the profile page and the home page card.

export interface CompletenessInput {
  avatar_path: string | null;
  student: {
    headline: string | null; bio: string | null; university_id: string | null; student_code: string | null;
    major: string | null; gpa: number | null; links: unknown; verification_status: string;
  } | null;
  skillCount: number;
  hasCv: boolean;
}

export function profileCompleteness({ avatar_path, student: s, skillCount, hasCv }: CompletenessInput) {
  const links = (s?.links ?? {}) as Record<string, string>;
  const checks: [boolean, string][] = [
    [!!avatar_path, 'Thêm ảnh đại diện'], [!!s?.headline, 'Thêm tiêu đề hồ sơ'], [(s?.bio ?? '').length >= 50, 'Viết giới thiệu bản thân (≥ 50 ký tự)'],
    [!!s?.university_id, 'Chọn trường'], [!!s?.student_code, 'Nhập MSSV'], [!!s?.major, 'Nhập chuyên ngành'], [s?.gpa != null, 'Nhập GPA'],
    [skillCount >= 3, 'Thêm ít nhất 3 kỹ năng'], [hasCv, 'Tạo CV'], [!!links.github || !!links.linkedin, 'Thêm liên kết GitHub/LinkedIn'],
    [s?.verification_status === 'verified', 'Xác thực tài khoản sinh viên'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return { percent: Math.round(100 * done / checks.length), next: checks.find(([ok]) => !ok)?.[1] ?? null };
}
