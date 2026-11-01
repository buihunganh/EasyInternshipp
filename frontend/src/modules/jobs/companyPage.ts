// Company page (?id=<uuid>; employers without an id see their own company): profile, open jobs,
// rating and reviews, follow, report.
import { requireSignIn } from '../../core/auth';
import { companyHref, jobHref, label, routes } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, share } from '../../core/ui/actions';
import { reportContent } from '../../core/report';
import { currentRole } from '../../core/session';
import { publicUrl } from '../../core/supabase';
import { myCompanies, savedJobIds, setJobSaved } from '../../core/accountApi';
import { showError } from '../../core/errors';
import { formatDate, formatStipend, relativeTime, workTypeLabel } from '../../core/format';
import { el, stateBlock } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { companyRating, companyReviews, getCompany, isFollowing, searchJobs, setFollowing, similarCompanies, type CompanyDetail, type JobHit } from './api';
import { setIconText } from './jobSearch';
import type { CompanyProfile } from '../../core/models';


const byText = <T extends Element>(selector: string, re: RegExp, root: ParentNode = document) =>
  [...root.querySelectorAll<T>(selector)].find(e => re.test(e.textContent || ''));

function notFound() {
  const main = document.querySelector<HTMLElement>('main')!;
  main.replaceChildren(el('div', { className: 'ei-page ei-page-narrow' },
    stateBlock('empty', 'Không tìm thấy doanh nghiệp.'), el('a', { className: 'ei-button ei-button-primary', href: routes.jobs }, 'Xem việc làm')));
}

function fillHero(company: CompanyDetail, profile: CompanyProfile, jobs: JobHit[], rating: { review_count: number | null; avg_rating: number | null } | null) {
  const h1 = document.querySelector('main h1')!;
  h1.textContent = company.name;
  document.title = `${company.name} | Internships.io`;
  const verified = company.verification_status === 'verified';
  const tier = h1.nextElementSibling as HTMLElement | null;
  if (tier) { tier.textContent = verified ? 'Đã xác thực' : 'Chưa xác thực'; }
  const banner = byText<HTMLElement>('main span', /Đối tác Tuyển dụng Xác thực/);
  if (banner && !verified) banner.parentElement!.hidden = true;
  const cover = document.querySelector<HTMLElement>('main [data-alt^="Modern open-concept"]');
  if (cover && company.cover_path) cover.style.backgroundImage = `url('${publicUrl('company-assets', company.cover_path)}')`;
  const logo = document.querySelector<HTMLElement>('main [data-alt^="Minimalist abstract tech company logo"]');
  if (logo) logo.style.backgroundImage = `url("${publicUrl('company-assets', company.logo_path) || initialsAvatar(company.name)}")`;
  const tagline = h1.parentElement?.nextElementSibling as HTMLElement | null;
  if (tagline) tagline.textContent = profile.tagline || (company.description ?? '').split(/(?<=\.)\s/)[0] || '';
  const metaRow = tagline?.nextElementSibling;
  if (metaRow) {
    const metaSpan = (icon: string) => [...metaRow.querySelectorAll<HTMLElement>(':scope > span')].find(s => s.querySelector('.material-symbols-outlined')?.textContent?.trim() === icon);
    setIconText(metaSpan('location_on'), company.address || company.city || '—');
    setIconText(metaSpan('group'), company.company_size ? `${company.company_size} nhân viên` : 'Chưa cập nhật quy mô');
    setIconText(metaSpan('laptop_mac'), (company.industry as { name: string } | null)?.name ?? 'Chưa cập nhật lĩnh vực');
    const founded = metaSpan('calendar_today');
    if (company.founded_year) setIconText(founded, `Thành lập ${company.founded_year}`); else if (founded) founded.hidden = true;
    const site = metaRow.querySelector<HTMLAnchorElement>('a');
    if (site) {
      if (company.website) { site.href = company.website; setIconText(site, company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')); site.rel = 'noopener noreferrer'; }
      else site.hidden = true;
    }
  }
  // Stats tiles: real numbers instead of the design's sample figures
  const stipends = jobs.flatMap(j => [j.stipend_min, j.stipend_max]).filter((v): v is number => !!v);
  const tiles: [string, string, string][] = [
    ['school', String(jobs.length), 'Vị trí thực tập đang mở'],
    ['workspace_premium', String(company.follower_count), 'Người theo dõi'],
    ['payments', stipends.length ? `${Math.min(...stipends) / 1e6} - ${Math.max(...stipends) / 1e6} tr` : '—', 'Trợ cấp thực tập hàng tháng'],
    ['star', rating?.review_count ? `${rating.avg_rating} / 5.0` : '—', `Đánh giá từ thực tập sinh (${rating?.review_count ?? 0} lượt)`],
  ];
  for (const [icon, value, caption] of tiles) {
    const iconEl = [...document.querySelectorAll('main .material-symbols-outlined')].find(i => i.textContent?.trim() === icon && i.closest('div')?.nextElementSibling?.children.length === 2);
    const text = iconEl?.closest('div')?.nextElementSibling;
    if (text?.children.length === 2) { text.children[0].textContent = value; text.children[1].textContent = caption; }
  }
  const jobsTab = document.querySelector('#tab-jobs span:last-child');
  if (jobsTab) jobsTab.textContent = String(jobs.length);
}

function fillOverview(company: CompanyDetail, profile: CompanyProfile) {
  const overview = document.getElementById('content-overview');
  if (!overview) return;
  const [intro, program] = [...overview.querySelectorAll<HTMLElement>(':scope > section')];
  if (intro) {
    setIconText(intro.querySelector('h2'), `Giới thiệu về ${company.name}`);
    const founded = intro.querySelector('h2')?.nextElementSibling as HTMLElement | null;
    if (founded) { founded.textContent = company.founded_year ? `Thành lập ${company.founded_year}` : ''; founded.hidden = !company.founded_year; }
    const p = intro.querySelector(':scope > p');
    if (p) { p.textContent = company.description || 'Doanh nghiệp chưa cập nhật giới thiệu.'; (p as HTMLElement).style.whiteSpace = 'pre-line'; }
    const cards = [...intro.querySelectorAll<HTMLElement>(':scope > div:last-child > div')];
    const values = [profile.mission, profile.vision];
    cards.forEach((card, i) => { const p2 = card.querySelector('p'); if (values[i] && p2) p2.textContent = values[i]!; else card.hidden = true; });
  }
  if (program) {
    const highlights = profile.culture ?? [];
    if (!profile.program?.title && !highlights.length) { program.hidden = true; return; }
    setIconText(program.querySelector('h2'), profile.program?.title || 'Chương trình thực tập');
    const p = program.querySelector(':scope > p');
    if (p) p.textContent = profile.program?.description || '';
    const grid = program.querySelector(':scope > p + div') as HTMLElement | null;
    const card = grid?.firstElementChild as HTMLElement | null;
    if (grid && card) {
      if (highlights.length) grid.replaceChildren(...highlights.map(text => {
        const c = card.cloneNode(true) as HTMLElement; c.querySelector('h4')!.textContent = text; c.querySelector('p')?.remove(); return c;
      }));
      else grid.hidden = true;
    }
    const photos = byText<HTMLElement>('h3', /Môi trường làm việc/, program)?.parentElement;
    if (photos) photos.hidden = true;   // office photos are not part of the profile yet
  }
}

function fillJobs(jobs: JobHit[], saved: Set<string>) {
  const section = document.getElementById('jobs-section');
  if (!section) return;
  const header = section.firstElementChild as HTMLElement;
  const counter = header.querySelector(':scope > span');
  if (counter) counter.textContent = `${jobs.length} vị trí đang mở`;
  const sub = header.querySelector('p');
  if (sub) sub.textContent = 'Cập nhật trực tiếp từ các tin đã được duyệt.';
  const list = header.nextElementSibling as HTMLElement;
  const template = list?.firstElementChild as HTMLElement | null;
  if (!list || !template) return;
  if (!jobs.length) { list.replaceChildren(stateBlock('empty', 'Doanh nghiệp chưa có vị trí nào đang tuyển.')); return; }
  list.replaceChildren(...jobs.map(job => {
    const card = template.cloneNode(true) as HTMLElement;
    const tags = card.querySelector('h3')?.previousElementSibling;
    if (tags) {
      const [first, second, third] = [...tags.children] as HTMLElement[];
      if (first) first.textContent = job.skills[0] ?? workTypeLabel[job.work_type];
      if (second) second.textContent = workTypeLabel[job.work_type] ?? job.work_type;
      if (third) setIconText(third, 'Đang nhận hồ sơ');
    }
    card.querySelector('h3')!.textContent = job.title;
    const meta = card.querySelector('h3')?.nextElementSibling;
    const spans = meta ? [...meta.children] as HTMLElement[] : [];
    setIconText(spans[0], formatStipend(job.stipend_min, job.stipend_max));
    setIconText(spans[1], `${job.city ?? 'Toàn quốc'} · ${workTypeLabel[job.work_type] ?? job.work_type}`);
    setIconText(spans[2], job.deadline ? `Hạn nộp: ${formatDate(job.deadline)}` : `Đăng ${relativeTime(job.published_at)}`);
    const p = card.querySelector('p');
    if (p) p.textContent = job.excerpt;
    const apply = card.querySelector<HTMLButtonElement>('button[data-design-click]');
    if (apply) { apply.removeAttribute('data-design-click'); apply.textContent = 'Xem & ứng tuyển'; bind(apply, () => location.assign(jobHref(job.id))); }
    const save = card.querySelector<HTMLButtonElement>('button[title="Lưu tin"]');
    if (save) {
      const render = () => { save.setAttribute('aria-pressed', String(saved.has(job.id))); save.setAttribute('aria-label', saved.has(job.id) ? 'Bỏ lưu tin' : 'Lưu tin'); };
      bind(save, async () => {
        if (!requireSignIn() || currentRole() !== 'student') return;
        const next = !saved.has(job.id);
        try { await setJobSaved(job.id, next); next ? saved.add(job.id) : saved.delete(job.id); render(); toast(next ? 'Đã lưu tin.' : 'Đã bỏ lưu tin.'); }
        catch (error) { showError(error); }
      });
      render();
    }
    return card;
  }));
}

function fillReviews(reviews: Awaited<ReturnType<typeof companyReviews>>, rating: { review_count: number | null; avg_rating: number | null } | null) {
  const section = byText<HTMLElement>('main section h2', /Đánh giá từ Thực tập sinh/)?.closest('section');
  if (!section) return;
  const score = section.querySelector('h2')?.nextElementSibling?.firstElementChild;
  if (score) score.textContent = rating?.avg_rating ? String(rating.avg_rating) : '—';
  const list = section.querySelector('h2')?.parentElement?.nextElementSibling as HTMLElement | null;
  const template = list?.firstElementChild as HTMLElement | null;
  if (!list || !template) return;
  if (!reviews.length) { list.replaceChildren(stateBlock('empty', 'Chưa có đánh giá. Chỉ thực tập sinh đã nhận việc tại công ty mới có thể viết đánh giá.')); return; }
  list.replaceChildren(...reviews.map(r => {
    const card = template.cloneNode(true) as HTMLElement;
    const name = r.author_name ?? 'Ẩn danh';
    const avatar = card.querySelector('div > div > div');
    if (avatar) avatar.textContent = name.split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
    const info = avatar?.nextElementSibling;
    if (info?.children.length) { info.children[0].textContent = name; if (info.children[1]) info.children[1].textContent = r.title || relativeTime(r.created_at); }
    const stars = [...card.querySelectorAll<HTMLElement>('.material-symbols-outlined')].filter(s => s.textContent?.trim() === 'star');
    stars.forEach((s, i) => { s.style.opacity = i < (r.rating ?? 0) ? '1' : '0.25'; });
    const p = card.querySelector('p');
    if (p) p.textContent = `"${r.body}"`;
    return card;
  }));
}

async function fillSidebar(company: CompanyDetail, profile: CompanyProfile) {
  const office = byText<HTMLElement>('main h3', /Văn phòng/)?.parentElement;
  if (office) {
    const address = company.address || company.city || 'Chưa cập nhật địa chỉ';
    const map = office.querySelector<HTMLElement>('[data-location]');
    if (map) { map.dataset.location = address; setIconText(map.querySelector('div'), profile.office || address); }
    const rows = [...office.querySelectorAll<HTMLElement>(':scope > div:not([data-location]) > div')];
    const set = (row: HTMLElement | undefined, strong: string, value: string | null | undefined, href?: string) => {
      if (!row) return;
      if (!value) { row.hidden = true; return; }
      const box = row.querySelector('div')!;
      box.replaceChildren(el('strong', {}, strong + ' '), href ? el('a', { href }, value) : value);
    };
    set(rows[0], 'Địa chỉ:', address);
    set(rows[1], 'Phụ trách tuyển sinh viên:', profile.hr_email, profile.hr_email ? `mailto:${profile.hr_email}` : undefined);
    set(rows[2], 'Hotline Nhân sự:', profile.hotline);
    const mail = office.querySelector<HTMLAnchorElement>(':scope > a');
    if (mail) { if (profile.hr_email) mail.href = `mailto:${profile.hr_email}?subject=[Internships.io] Liên hệ tư vấn thực tập`; else mail.hidden = true; }
  }
  const mentorsBox = byText<HTMLElement>('main h3', /Đội ngũ Tech Mentors/)?.parentElement?.parentElement;
  if (mentorsBox) {
    const mentors = profile.mentors ?? [];
    const list = mentorsBox.lastElementChild as HTMLElement;
    const template = list.firstElementChild as HTMLElement | null;
    if (!mentors.length || !template) mentorsBox.hidden = true;
    else list.replaceChildren(...mentors.map(m => {
      const card = template.cloneNode(true) as HTMLElement;
      const photo = card.querySelector<HTMLElement>('[data-alt]');
      if (photo) photo.style.backgroundImage = `url("${initialsAvatar(m.name)}")`;
      card.querySelector('h4')!.textContent = m.name;
      const p = card.querySelector('p'); if (p) p.textContent = m.title ?? '';
      const tag = card.querySelector('h4 ~ div span'); if (tag) { tag.textContent = m.expertise ?? ''; (tag as HTMLElement).hidden = !m.expertise; }
      return card;
    }));
  }
  const peersBox = byText<HTMLElement>('main h3', /Doanh nghiệp cùng ngành/)?.parentElement;
  if (peersBox) {
    const list = peersBox.querySelector(':scope > div') as HTMLElement | null;
    const template = list?.querySelector('a');
    if (!list || !template) return;
    try {
      const peers = await similarCompanies(company);
      if (!peers.length) { peersBox.hidden = true; return; }
      list.replaceChildren(...peers.map(peer => {
        const a = template.cloneNode(true) as HTMLAnchorElement;
        a.href = companyHref(peer.id); a.dataset.appControl = 'peer-company';
        const badge = a.querySelector('div > div');
        if (badge) badge.textContent = peer.name.split(/\s+/)[0].slice(0, 4).toUpperCase();
        const info = badge?.nextElementSibling;
        if (info?.children.length === 2) { info.children[0].textContent = peer.name; info.children[1].textContent = `${peer.open_jobs} vị trí thực tập mở`; }
        return a;
      }));
    } catch { peersBox.hidden = true; }
  }
}

function wireActions(company: CompanyDetail) {
  const follow = document.getElementById('btn-follow') as HTMLButtonElement | null;
  const followText = document.getElementById('txt-follow');
  let following = false;
  const render = () => {
    if (followText) followText.textContent = following ? 'Đang theo dõi' : 'Theo dõi công ty';
    follow?.querySelector('.material-symbols-outlined')?.replaceChildren(following ? 'check' : 'add');
    follow?.setAttribute('aria-pressed', String(following));
  };
  if (follow) {
    follow.removeAttribute('data-design-click');
    if (currentRole() === 'employer' || currentRole() === 'admin') follow.hidden = true;
    isFollowing(company.id).then(v => { following = v; render(); }).catch(() => {});
    bind(follow, async () => {
      if (!requireSignIn()) return;
      try { await setFollowing(company.id, !following); following = !following; render(); toast(following ? `Đã theo dõi ${company.name}.` : 'Đã bỏ theo dõi.'); }
      catch (error) { showError(error); }
    });
  }
  const shareButton = document.querySelector<HTMLButtonElement>('main button[data-design-click="shareProfile()"]');
  if (shareButton) {
    shareButton.removeAttribute('data-design-click');
    bind(shareButton, () => share('Chia sẻ trang công ty', location.origin + companyHref(company.id)));
    const report = el('button', { type: 'button', className: shareButton.className, 'aria-label': 'Báo cáo doanh nghiệp' }, el('span', { className: 'material-symbols-outlined', 'aria-hidden': 'true' }, 'flag'), ' Báo cáo');
    bind(report, () => reportContent(company.name, { type: 'company', id: company.id }));
    shareButton.after(report);
  }
  // Tabs scroll to their section (design's switchTab expects the static sample layout)
  document.querySelectorAll<HTMLButtonElement>('[data-design-click^="switchTab"]').forEach(b => bind(b, () => {
    document.querySelectorAll('[data-design-click^="switchTab"]').forEach(x => { x.classList.remove('bg-primary', 'text-on-primary'); x.setAttribute('aria-selected', String(x === b)); });
    b.classList.add('bg-primary', 'text-on-primary');
    const id = b.id.replace('tab-', '');
    const target = id === 'jobs' ? document.getElementById('jobs-section')
      : id === 'reviews' ? byText<HTMLElement>('main section h2', /Đánh giá/)?.closest('section')
      : id === 'benefits' ? document.querySelector('#content-overview > section:nth-of-type(2)')
      : document.getElementById('content-overview');
    if (target && !(target as HTMLElement).hidden) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else dialog(label(b), '<p>Doanh nghiệp chưa cập nhật nội dung này.</p>', 'Đóng');
  }));
  document.getElementById('application-dialog')?.remove();   // replaced by the job detail page's apply flow
}

export async function setupCompanyPage() {
  let id = new URLSearchParams(location.search).get('id');
  if (!id && currentRole() === 'employer') id = (await myCompanies().catch(() => []))[0]?.company.id ?? null;
  if (!id) { notFound(); return; }
  let company: CompanyDetail | null = null;
  try { company = await getCompany(id); } catch (error) { showError(error); }
  if (!company) { notFound(); return; }
  const profile = (company.profile ?? {}) as CompanyProfile;
  const [jobs, rating, reviews, saved] = await Promise.all([
    searchJobs({ p_company_id: company.id, p_limit: 50, p_sort: 'newest' }).catch(() => [] as JobHit[]),
    companyRating(company.id).catch(() => null),
    companyReviews(company.id).catch(() => []),
    currentRole() === 'student' ? savedJobIds().catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
  ]);
  fillHero(company, profile, jobs, rating);
  fillOverview(company, profile);
  fillJobs(jobs, saved);
  fillReviews(reviews, rating);
  wireActions(company);
  await fillSidebar(company, profile);
}
