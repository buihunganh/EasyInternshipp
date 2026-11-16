// Home page side widgets on real data: the signed-in student's profile card (hidden for other roles),
// featured companies (most open jobs) with follow buttons, upcoming published events.
import { currentRole } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { renderProfileCard } from '../../core/layout/profileCard';
import { renderRailFooter } from '../../core/layout/siteFooter';
import { companyHref } from '../../core/navigation';
import { requireSignIn } from '../../core/auth';
import { bind } from '../../core/ui/actions';
import { toast } from '../../core/ui/feedback';
import { showError } from '../../core/errors';
import { formatDateTime } from '../../core/format';
import { featuredCompanies, followedCompanyIds, setFollowing, upcomingEvents } from './api';

/** Student profile card on the job list (shared component, same as the community page). */
export async function setupProfileCard() {
  const card = document.querySelector<HTMLElement>('aside.home-filters > [data-auth-only]');
  if (card) await renderProfileCard(card, { roles: ['student'] });   // the job list card is about a student profile
}

/** Section boxes of the right-hand column, found by their heading text. */
function discoveryBox(heading: RegExp) {
  return [...document.querySelectorAll<HTMLElement>('aside.home-discovery > div')].find(d => heading.test(d.firstElementChild?.textContent || ''));
}

function emptyLine(host: HTMLElement, text: string) {
  const p = document.createElement('p');
  p.className = 'jobs-rail-empty';
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
  if (!events.length) { box.hidden = true; return; }   // an empty card is noise: hide the whole "Sự kiện tuyển dụng sắp tới" box
  list.replaceChildren(...events.map((e, i) => {
    const item = templates[i % templates.length].cloneNode(true) as HTMLElement;
    const [title, meta] = [...item.querySelectorAll('p')];
    const uni = e.university as { name?: string; short_name?: string } | null;
    if (title) title.textContent = e.title;
    if (meta) meta.textContent = [formatDateTime(e.starts_at), e.is_virtual ? 'Trực tuyến' : e.location, uni?.short_name || uni?.name].filter(Boolean).join(' • ');
    return item;
  }));
}

/** LinkedIn-style footer links at the bottom of the right rail (hides the page footer on wide screens). */
export function setupRailFooter() {
  // "Cẩm nang & Công cụ thi tuyển" (interview practice, verified skill badges) has no feature behind it yet.
  const careerPrep = discoveryBox(/Cẩm nang/);
  if (careerPrep) careerPrep.hidden = true;
  const rail = document.querySelector<HTMLElement>('aside.home-discovery');
  if (rail) renderRailFooter(rail);
}
