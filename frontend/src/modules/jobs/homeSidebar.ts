// Home page side widgets on real data: the signed-in student's profile card (hidden for other roles),
// featured companies (most open jobs) with follow buttons, upcoming published events.
import { currentRole } from '../../core/session';
import { studentSummary } from '../../core/accountApi';
import { profileCompleteness } from '../../core/profileCompleteness';
import { publicUrl } from '../../core/supabase';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { companyHref, routes } from '../../core/navigation';
import { requireSignIn } from '../../core/auth';
import { bind } from '../../core/ui/actions';
import { toast } from '../../core/ui/feedback';
import { showError } from '../../core/errors';
import { formatDateTime } from '../../core/format';
import { featuredCompanies, followedCompanyIds, setFollowing, upcomingEvents } from './api';

export async function setupProfileCard() {
  const card = document.querySelector<HTMLElement>('aside.home-filters > [data-auth-only]');
  if (!card) return;
  if (currentRole() !== 'student') { card.remove(); return; }   // the card is about a student profile
  card.hidden = true;
  let summary: Awaited<ReturnType<typeof studentSummary>>;
  try { summary = await studentSummary(); }
  catch { card.remove(); return; }   // a side widget: never block the job list
  const { profile, student: s } = summary;
  const name = profile.full_name || profile.email || 'Sinh viên';
  const uni = s?.university as { name?: string; short_name?: string } | null;

  const [, identity, stats] = [...card.children] as HTMLElement[];
  const img = identity?.querySelector('img');
  if (img) { img.src = publicUrl('avatars', profile.avatar_path) || initialsAvatar(name); img.alt = name; }
  const [h3, line1, line2] = [identity?.querySelector('h3'), ...(identity?.querySelectorAll('p') ?? [])];
  if (h3) h3.textContent = name;
  if (line1) line1.textContent = [s?.major, s?.graduation_year ? `Tốt nghiệp ${s.graduation_year}` : ''].filter(Boolean).join(' • ') || 'Chưa cập nhật chuyên ngành';
  if (line2) line2.textContent = [uni?.name || 'Chưa chọn trường', s?.gpa != null ? `(GPA ${s.gpa}/4.0)` : ''].filter(Boolean).join(' ');

  const rows = [...(stats?.children ?? [])] as HTMLElement[];
  const value = (row: HTMLElement | undefined, text: string) => { const v = row?.lastElementChild; if (v) v.textContent = text; };
  value(rows[0], `${summary.applicationCount} việc`);
  value(rows[1], `${summary.savedCount} việc`);
  const meter = profileCompleteness({ avatar_path: profile.avatar_path, student: s, skillCount: summary.skillCount, hasCv: summary.cvCount > 0 });
  const meterRow = rows[2];
  const percent = meterRow?.firstElementChild?.lastElementChild;
  if (percent) percent.textContent = `${meter.percent}%`;
  const bar = meterRow?.querySelector<HTMLElement>('[style*="width"]');
  if (bar) bar.style.width = `${meter.percent}%`;
  const link = card.querySelector<HTMLAnchorElement>(':scope > a');
  if (link) link.href = routes.profile;
  card.hidden = false;
}

/** Section boxes of the right-hand column, found by their heading text. */
function discoveryBox(heading: RegExp) {
  return [...document.querySelectorAll<HTMLElement>('aside.home-discovery > div')].find(d => heading.test(d.firstElementChild?.textContent || ''));
}

function emptyLine(host: HTMLElement, text: string) {
  const p = document.createElement('p');
  p.className = 'text-[12px] text-on-surface-variant';
  p.textContent = text;
  host.replaceChildren(p);
}

export async function setupFeaturedCompanies() {
  const box = discoveryBox(/Doanh nghiệp nổi bật/);
  const list = box?.children[1] as HTMLElement | undefined;
  const template = list?.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
  if (!box || !list || !template) return;
  const all = box.querySelector<HTMLAnchorElement>(':scope > div:first-child a');
  if (all) all.hidden = true;   // there is no company directory page yet
  list.replaceChildren();
  let companies: Awaited<ReturnType<typeof featuredCompanies>>, followed: Set<string>;
  try { [companies, followed] = await Promise.all([featuredCompanies(), followedCompanyIds()]); }
  catch { box.hidden = true; return; }
  if (!companies.length) { emptyLine(list, 'Chưa có doanh nghiệp đang tuyển.'); return; }
  const canFollow = currentRole() === 'student' || currentRole() === null;   // follows belong to students
  list.replaceChildren(...companies.map(c => {
    const row = template.cloneNode(true) as HTMLElement;
    const left = row.firstElementChild as HTMLElement;
    const link = document.createElement('a');
    link.className = left.className; link.href = companyHref(c.id);
    link.append(...left.childNodes); left.replaceWith(link);
    const img = link.querySelector('img');
    if (img) { img.src = publicUrl('company-assets', c.logo_path) || initialsAvatar(c.name); img.alt = c.name; }
    const [name, count] = [...link.querySelectorAll('p')];
    if (name) name.textContent = c.name;
    if (count) count.textContent = `${c.open_jobs} vị trí tuyển`;
    const follow = row.querySelector<HTMLButtonElement>('button');
    if (follow) {
      if (!canFollow) follow.remove();
      else {
        let on = followed.has(c.id);
        const paint = () => { follow.textContent = on ? 'Đang theo dõi' : '+ Theo dõi'; follow.setAttribute('aria-pressed', String(on)); };
        paint();
        bind(follow, async () => {
          if (!requireSignIn()) return;
          try { await setFollowing(c.id, !on); on = !on; paint(); toast(on ? `Đã theo dõi ${c.name}` : `Đã bỏ theo dõi ${c.name}`); }
          catch (error) { showError(error); }
        });
      }
    }
    return row;
  }));
}

export async function setupUpcomingEvents() {
  const box = discoveryBox(/Sự kiện tuyển dụng/);
  const list = box?.children[1] as HTMLElement | undefined;
  const templates = [...(list?.children ?? [])].map(e => e.cloneNode(true) as HTMLElement);
  if (!box || !list || !templates.length) return;
  list.replaceChildren();
  let events: Awaited<ReturnType<typeof upcomingEvents>>;
  try { events = await upcomingEvents(); }
  catch { box.hidden = true; return; }
  if (!events.length) { emptyLine(list, 'Chưa có sự kiện sắp tới.'); return; }
  list.replaceChildren(...events.map((e, i) => {
    const item = templates[i % templates.length].cloneNode(true) as HTMLElement;
    const [title, meta] = [...item.querySelectorAll('p')];
    const uni = e.university as { name?: string; short_name?: string } | null;
    if (title) title.textContent = e.title;
    if (meta) meta.textContent = [formatDateTime(e.starts_at), e.is_virtual ? 'Trực tuyến' : e.location, uni?.short_name || uni?.name].filter(Boolean).join(' • ');
    return item;
  }));
}

/** The mini footer's copyright year. */
export function setupMiniFooter() {
  const copy = [...document.querySelectorAll('aside.home-discovery > div:last-child p')].find(p => /©/.test(p.textContent || ''));
  if (copy) copy.textContent = copy.textContent!.replace(/© \d{4}/, `© ${new Date().getFullYear()}`);
}
