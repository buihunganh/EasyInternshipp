// The signed-in user's profile card, shared by every page that shows one (home job list, community)
// so they look and read the same. Styles: `.ui-profile-card*` in styles/platform.css.
import { currentProfile, currentRole } from '../session';
import { myCompanies, studentSummary } from '../accountApi';
import { profileCompleteness } from '../profileCompleteness';
import { publicUrl } from '../supabase';
import { routes } from '../navigation';
import { el } from '../render';
import { initialsAvatar } from './siteHeader';

type Stat = [label: string, value: string];
type CardData = {
  role: string; name: string; verified?: boolean; avatar: string; avatarAlt: string;
  lines: (string | Node)[]; stats: Stat[]; meter?: number; link: { href: string; text: string };
};

// Next to the name: a verified student (school) or a verified company (GPKD)
const verifiedIcon = () => el('span', { className: 'material-symbols-outlined ui-profile-card__verified', role: 'img', 'aria-label': 'Đã xác minh', title: 'Đã xác minh' }, 'verified');

async function studentData(fallbackName: string): Promise<CardData> {
  const summary = await studentSummary();
  const { profile, student: s } = summary;
  const name = profile.full_name || profile.email || fallbackName;
  const uni = s?.university as { name?: string; short_name?: string } | null;
  const meter = profileCompleteness({ avatar_path: profile.avatar_path, student: s, skillCount: summary.skillCount, hasCv: summary.cvCount > 0 });
  return {
    role: 'Sinh viên', name, verified: s?.verification_status === 'verified', avatar: publicUrl('avatars', profile.avatar_path) || initialsAvatar(name), avatarAlt: name,
    lines: [
      [s?.major, s?.graduation_year ? `Tốt nghiệp ${s.graduation_year}` : ''].filter(Boolean).join(' • ') || 'Chưa cập nhật chuyên ngành',
      [uni?.name || 'Chưa chọn trường', s?.gpa != null ? `(GPA ${s.gpa}/4.0)` : ''].filter(Boolean).join(' '),
    ],
    stats: [['Đơn ứng tuyển', `${summary.applicationCount} việc`], ['Việc làm đã lưu', `${summary.savedCount} việc`]],
    meter: meter.percent,
    link: { href: routes.profile, text: 'Xem hồ sơ cá nhân' },
  };
}

async function employerData(name: string): Promise<CardData> {
  const company = (await myCompanies().catch(() => []))[0]?.company;
  const coName = company?.name || 'Chưa tạo doanh nghiệp';
  const logo = company?.logo_path ? publicUrl('company-assets', company.logo_path) : '';
  return {
    role: 'Nhà tuyển dụng', name, verified: company?.verification_status === 'verified', avatar: logo || initialsAvatar(company?.name || name), avatarAlt: company?.name || name,
    lines: [coName, 'Nhà tuyển dụng'],
    stats: [], link: { href: routes.employer, text: 'Vào không gian tuyển dụng' },
  };
}

function render(card: HTMLElement, d: CardData) {
  const stats = d.stats.map(([label, value]) => el('div', { className: 'ui-profile-card__stat' }, el('span', {}, label), el('span', {}, value)));
  if (d.meter != null) {
    const bar = el('div', { className: 'ui-profile-card__bar' }); bar.style.width = `${d.meter}%`;
    stats.push(el('div', { className: 'ui-profile-card__meter' },
      el('div', { className: 'ui-profile-card__stat' }, el('span', {}, 'Độ hoàn thiện hồ sơ'), el('span', {}, `${d.meter}%`)),
      el('div', { className: 'ui-profile-card__track', role: 'progressbar', 'aria-valuenow': d.meter, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Độ hoàn thiện hồ sơ' }, bar)));
  }
  card.classList.add('ui-card', 'ui-card--flush', 'ui-profile-card');
  const parts: Node[] = [
    el('div', { className: 'ui-profile-card__cover' }, el('span', { className: 'ui-profile-card__role' }, d.role)),
    el('div', { className: 'ui-profile-card__identity' },
      el('img', { className: 'ui-avatar ui-avatar--lg ui-profile-card__avatar', src: d.avatar, alt: d.avatarAlt }),
      el('h2', { className: 'ui-profile-card__name' }, d.name, d.verified ? ' ' : null, d.verified ? verifiedIcon() : null),
      ...d.lines.map(line => el('p', { className: 'ui-profile-card__line' }, line))),
  ];
  if (stats.length) parts.push(el('div', { className: 'ui-profile-card__stats' }, ...stats));
  parts.push(el('a', { className: 'ui-profile-card__link', href: d.link.href }, d.link.text));
  card.replaceChildren(...parts);
}

/**
 * Fill `card` (an empty or design placeholder element) with the signed-in user's card and reveal it.
 * `roles` limits who gets one; anyone else (and guests) gets it removed. Returns the avatar shown, or null.
 * Never throws: it is a side widget and must not block the page.
 */
export async function renderProfileCard(card: HTMLElement, { roles }: { roles?: string[] } = {}) {
  const role = currentRole();
  if (!role || (roles && !roles.includes(role))) { card.remove(); return null; }
  card.hidden = true;
  const name = currentProfile()?.full_name || currentProfile()?.email || 'Người dùng';
  let data: CardData;
  try {
    if (role === 'student') data = await studentData(name);
    else if (role === 'employer') data = await employerData(name);
    else data = {
      role: role === 'admin' ? 'Quản trị viên' : 'Cán bộ nhà trường', name, avatar: publicUrl('avatars', currentProfile()?.avatar_path) || initialsAvatar(name), avatarAlt: name,
      lines: [role === 'admin' ? 'Ban quản trị Internships.io' : 'Cán bộ hợp tác doanh nghiệp'], stats: [],
      link: role === 'admin' ? { href: '/pages/admin/', text: 'Bảng điều khiển quản trị' } : { href: routes['university-portal'], text: 'Cổng quản lý nhà trường' },
    };
  } catch { card.remove(); return null; }
  render(card, data);
  card.hidden = false;
  return data.avatar;
}
