// Community feed (DFD process 7) on real data: post_feed, comments, likes, bookmarks, reports.
import { dialog, toast } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { isSignedIn, requireSignIn } from '../../core/auth';
import { bind, compose, schedule } from '../../core/ui/actions';
import { attachMenu, type MenuItem } from '../../core/ui/menu';
import { renderRailFooter } from '../../core/layout/siteFooter';
import { currentProfile, currentRole } from '../../core/session';
import { studentSummary } from '../../core/accountApi';
import { renderProfileCard } from '../../core/layout/profileCard';
import { publicUrl } from '../../core/supabase';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { el, esc, showState } from '../../core/render';
import { showError, toAppError } from '../../core/errors';
import { formatDateTime, relativeTime } from '../../core/format';
import { reportContent } from '../../core/report';
import * as api from './api';
import type { FeedFilter, FeedPost, PostType } from './api';

const typeLabel: Record<PostType, string> = {
  experience: 'Chia sẻ kinh nghiệm', question: 'Hỏi đáp', review: 'Review công ty', document: 'Tài liệu',
};
const BODY_PREVIEW = 600;
const MAX_FILE = 10 * 1024 * 1024;

/** Left-rail profile card (shared with the job list) and the composer avatar. */
export async function setupCommunityProfile() {
  const card = document.querySelector<HTMLElement>('.community-profile-card');
  const composerAvatar = document.querySelector<HTMLImageElement>('.community-composer__avatar');
  const profile = currentProfile();
  const name = profile?.full_name || profile?.email || 'Bạn';
  if (composerAvatar) { composerAvatar.src = publicUrl('avatars', profile?.avatar_path) || initialsAvatar(name); composerAvatar.alt = name; }
  if (card) await renderProfileCard(card);
  // The shortcut row names the student's own university community
  if (currentRole() === 'student') {
    const uni = (await studentSummary().catch(() => null))?.student?.university as { name?: string; short_name?: string } | null | undefined;
    const network = document.querySelector<HTMLElement>('.community-network-name');
    if (network && (uni?.short_name || uni?.name)) network.textContent = `Cộng đồng ${uni.short_name || uni.name}`;   // short name keeps the row on one line
  }
}

const postLink = (id: string) => `${location.origin}/pages/community/?post=${encodeURIComponent(id)}`;
const avatarFor = (name: string, path: string | null) => publicUrl('avatars', path) || initialsAvatar(name);
const parseTags = (text: string) => [...new Set(text.split(/[,#\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8).map(t => t.slice(0, 30));
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
const fileName = (path: string) => path.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '');
const isImage = (path: string) => /\.(png|jpe?g|webp)$/i.test(path);

export function setupCommunity() {
  const rightRail = document.getElementById('community-right-rail');
  if (rightRail) renderRailFooter(rightRail);
  setupCommunityProfile().catch(err => console.error('setupCommunityProfile error:', err));

  const feed = document.getElementById('community-feed')!;
  const more = document.getElementById('community-more') as HTMLButtonElement;
  const tagBar = document.getElementById('community-tag-filter')!;
  const params = new URLSearchParams(location.search);
  let filter: FeedFilter = 'latest';
  let tag: string | null = params.get('tag');
  let page = 0;
  let loading = false;
  let viewer = { own: new Set<string>(), liked: new Set<string>(), saved: new Set<string>() };

  // --- Feed ---------------------------------------------------------------------------------
  async function load(reset: boolean) {
    if (loading) return;
    loading = true;
    if (reset) { page = 0; showState(feed, 'loading', 'Đang tải bài viết...'); }
    feed.setAttribute('aria-busy', 'true');
    more.disabled = true;
    try {
      const pinnedId = reset ? params.get('post') : null;
      params.delete('post');   // a shared link pins its post once, not on every filter change
      const [posts, pinned] = await Promise.all([api.listFeed(filter, page, tag), pinnedId ? api.getPost(pinnedId).catch(() => null) : null]);
      const list = pinned ? [pinned, ...posts.filter(p => p.id !== pinned.id)] : posts;
      const state = await api.viewerState(list.map(p => p.id!));
      if (reset) {
        viewer = state;
        feed.replaceChildren();
      } else {
        state.own.forEach(id => viewer.own.add(id)); state.liked.forEach(id => viewer.liked.add(id)); state.saved.forEach(id => viewer.saved.add(id));
      }
      if (reset && !list.length) showState(feed, 'empty', emptyText());
      for (const post of list) feed.append(postCard(post, pinned?.id === post.id));
      more.hidden = posts.length < api.PAGE_SIZE;
      page++;
      if (pinned && reset) feed.firstElementChild?.scrollIntoView({ block: 'start' });
    } catch (error) {
      if (reset) showState(feed, 'error', toAppError(error).message, () => load(true));
      else showError(error);
    } finally {
      loading = false; more.disabled = false; feed.setAttribute('aria-busy', 'false');
    }
  }

  function emptyText() {
    if (filter === 'saved') return 'Bạn chưa lưu bài viết nào.';
    if (tag) return `Chưa có bài viết nào gắn thẻ #${tag}.`;
    return isSignedIn() ? 'Chưa có bài viết nào. Hãy là người đầu tiên chia sẻ kinh nghiệm!' : 'Chưa có bài viết nào. Đăng nhập để chia sẻ kinh nghiệm đầu tiên.';
  }

  function setTag(next: string | null) {
    tag = next;
    const url = new URL(location.href);
    if (tag) url.searchParams.set('tag', tag); else url.searchParams.delete('tag');
    url.searchParams.delete('post'); params.delete('post');
    history.replaceState(null, '', url);
    tagBar.hidden = !tag;
    tagBar.replaceChildren();
    if (tag) {
      const clear = el('button', { type: 'button', className: 'community-tag-filter__clear', 'aria-label': 'Bỏ lọc thẻ' }, '×');
      clear.addEventListener('click', () => setTag(null));
      tagBar.append(`Đang lọc theo thẻ #${tag} `, clear);
    }
    load(true);
  }

  function postCard(post: FeedPost, pinned = false) {
    const id = post.id!;
    const name = post.author_name || 'Thành viên';
    const own = viewer.own.has(id);
    const card = el('article', { className: `ui-card community-post${pinned ? ' community-post--pinned' : ''}`, id: `post-${id}` });
    card.dataset.postId = id;

    // Author row
    const avatar = post.is_anonymous
      ? el('div', { className: 'community-post__avatar community-post__avatar--anon', 'aria-hidden': 'true' }, el('span', { className: 'material-symbols-outlined' }, 'person'))
      : el('img', { className: 'community-post__avatar', src: avatarFor(name, post.author_avatar_path), alt: '' });
    const subtitle = [typeLabel[post.type!], relativeTime(post.created_at)].filter(Boolean).join(' • ');
    const time = el('p', { className: 'community-post__subtitle', title: formatDateTime(post.created_at) }, subtitle);
    const heading = el('div', { className: 'flex items-center gap-xs' }, el('h2', { className: 'community-post__name' }, name));
    if (own) heading.append(el('span', { className: 'community-post__badge' }, post.is_anonymous ? 'Bài của bạn (ẩn danh)' : 'Bài của bạn'));
    const moreBtn = el('button', { className: 'community-post__more-btn', type: 'button', 'aria-label': 'Tùy chọn bài viết' },
      el('span', { className: 'material-symbols-outlined text-[20px]', 'aria-hidden': 'true' }, 'more_horiz'));
    card.append(el('div', { className: 'community-post__author' },
      el('div', { className: 'community-post__author-info' }, avatar, el('div', {}, heading, time)), moreBtn));
    attachMenu(moreBtn, () => menuItems(post));

    // Body
    const body = el('div', { className: 'community-post__body' });
    if (post.type === 'review' && post.company_id) {
      body.append(el('p', { className: 'community-review' },
        el('a', { href: `/pages/company/?id=${encodeURIComponent(post.company_id)}`, className: 'ui-link' }, post.company_name || 'Công ty'),
        el('span', { className: 'community-review__stars', 'aria-label': `${post.rating}/5 sao` }, stars(post.rating || 0))));
    }
    if (post.title) body.append(el('h3', { className: 'community-post__title' }, post.title));
    const text = post.body || '';
    const p = el('p', { className: 'community-post__text' }, text.length > BODY_PREVIEW ? text.slice(0, BODY_PREVIEW).trimEnd() + '…' : text);
    body.append(p);
    if (text.length > BODY_PREVIEW) {
      const expand = el('button', { type: 'button', className: 'community-post__expand' }, 'Xem thêm');
      expand.addEventListener('click', () => { p.textContent = text; expand.remove(); });
      body.append(expand);
    }
    if (post.tags?.length) {
      const tags = el('div', { className: 'community-post__tags' });
      for (const t of post.tags) {
        const chip = el('button', { type: 'button', className: 'ui-chip ui-chip--neutral community-post__tag' }, `#${t}`);
        chip.addEventListener('click', () => setTag(t));
        tags.append(chip);
      }
      body.append(tags);
    }
    card.append(body);

    // Attachment
    if (post.attachment_path) {
      const url = publicUrl('post-attachments', post.attachment_path);
      if (isImage(post.attachment_path)) {
        card.append(el('div', { className: 'community-post__media' }, el('img', { src: url, alt: `Ảnh đính kèm: ${fileName(post.attachment_path)}`, loading: 'lazy' })));
      } else {
        card.append(el('a', { className: 'community-attachment', href: url, target: '_blank', rel: 'noopener' },
          el('span', { className: 'flex items-center gap-sm min-w-0' },
            el('span', { className: 'community-attachment__icon material-symbols-outlined', 'aria-hidden': 'true' }, 'picture_as_pdf'),
            el('span', { className: 'truncate' }, fileName(post.attachment_path))),
          el('span', { className: 'community-attachment__open' }, el('span', { className: 'material-symbols-outlined text-[18px]', 'aria-hidden': 'true' }, 'download'), 'Tải về')));
      }
    }

    // Counts + actions
    const likes = el('span', {}, `${post.like_count ?? 0} lượt thích`);
    const comments = el('button', { type: 'button', className: 'community-post__count-link' }, `${post.comment_count ?? 0} bình luận`);
    comments.addEventListener('click', () => openComments(post, comments));
    card.append(el('div', { className: 'community-post__counts' }, likes, comments));

    const likeBtn = action('thumb_up', viewer.liked.has(id) ? 'Đã thích' : 'Thích', viewer.liked.has(id));
    const commentBtn = action('chat_bubble', 'Bình luận');
    const saveBtn = action('bookmark', viewer.saved.has(id) ? 'Đã lưu' : 'Lưu', viewer.saved.has(id));
    const shareBtn = action('share', 'Chia sẻ');
    card.append(el('div', { className: 'community-post__action-bar' }, likeBtn, commentBtn, saveBtn, shareBtn));

    likeBtn.addEventListener('click', async () => {
      if (!requireSignIn()) return;
      const on = !viewer.liked.has(id);
      likeBtn.disabled = true;
      try {
        await api.setLike(id, on);
        on ? viewer.liked.add(id) : viewer.liked.delete(id);
        post.like_count = Math.max(0, (post.like_count ?? 0) + (on ? 1 : -1));
        likes.textContent = `${post.like_count} lượt thích`;
        setAction(likeBtn, on ? 'Đã thích' : 'Thích', on);
      } catch (error) { showError(error); } finally { likeBtn.disabled = false; }
    });
    commentBtn.addEventListener('click', () => openComments(post, comments));
    saveBtn.addEventListener('click', async () => {
      if (!requireSignIn()) return;
      const on = !viewer.saved.has(id);
      saveBtn.disabled = true;
      try {
        await api.setBookmark(id, on);
        on ? viewer.saved.add(id) : viewer.saved.delete(id);
        setAction(saveBtn, on ? 'Đã lưu' : 'Lưu', on);
        toast(on ? 'Đã lưu bài viết.' : 'Đã bỏ lưu bài viết.');
        if (!on && filter === 'saved') card.remove();
      } catch (error) { showError(error); } finally { saveBtn.disabled = false; }
    });
    shareBtn.addEventListener('click', () => copyLink(id));
    return card;
  }

  function action(icon: string, text: string, pressed?: boolean) {
    const b = el('button', { type: 'button', className: 'community-post__action' },
      el('span', { className: 'material-symbols-outlined text-[18px]', 'aria-hidden': 'true' }, icon), el('span', {}, text));
    b.dataset.appControl = 'community';
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    return b;
  }
  function setAction(b: HTMLButtonElement, text: string, pressed: boolean) {
    b.lastElementChild!.textContent = text;
    b.setAttribute('aria-pressed', String(pressed));
  }

  function copyLink(id: string) {
    const url = postLink(id);
    if (navigator.share) { navigator.share({ title: 'Bài viết cộng đồng Internships.io', url }).catch(() => undefined); return; }
    navigator.clipboard?.writeText(url).then(() => toast('Đã sao chép liên kết bài viết.')).catch(() => toast(url));
  }

  function menuItems(post: FeedPost): MenuItem[] {
    const id = post.id!;
    const items: MenuItem[] = [{ label: 'Sao chép liên kết', icon: 'link', action: () => navigator.clipboard?.writeText(postLink(id)).then(() => toast('Đã sao chép liên kết.')).catch(() => toast(postLink(id))) }];
    if (viewer.own.has(id)) {
      items.push({ label: 'Sửa bài viết', icon: 'edit', action: () => openComposer(post) });
      items.push({ label: 'Xóa bài viết', icon: 'delete', danger: true, divider: true, action: () => confirmDelete(post) });
    } else {
      items.push({ label: 'Ẩn bài viết', icon: 'visibility_off', action: () => hideCard(id) });
      items.push({ label: 'Báo cáo bài viết', icon: 'flag', danger: true, divider: true, action: () => reportContent(post.title || 'Bài viết cộng đồng', { type: 'post', id }) });
    }
    return items;
  }

  function hideCard(id: string) {
    const card = document.getElementById(`post-${id}`);
    if (!card) return;
    const undo = el('button', { type: 'button' }, 'Hoàn tác');
    const notice = el('div', { className: 'app-hidden-post' }, el('span', {}, 'Đã ẩn bài viết.'), undo);
    undo.addEventListener('click', () => { card.hidden = false; notice.remove(); });
    card.before(notice); card.hidden = true;
  }

  function confirmDelete(post: FeedPost) {
    dialog('Xóa bài viết?', '<p>Bài viết, bình luận và lượt thích sẽ bị xóa vĩnh viễn.</p>', 'Xóa bài viết', async () => {
      await api.deletePost(post.id!);
      if (post.attachment_path) await api.removeAttachment(post.attachment_path);
      document.getElementById(`post-${post.id}`)?.remove();
      if (!feed.querySelector('article')) showState(feed, 'empty', emptyText());
      toast('Đã xóa bài viết.');
    }, { keepOpen: true });
  }

  // --- Composer -----------------------------------------------------------------------------
  async function openComposer(post?: FeedPost, presetType: PostType = 'experience') {
    if (!requireSignIn()) return;
    const editing = !!post;
    const companies = editing ? [] : await api.reviewableCompanies().catch(() => []);
    const type = post?.type || presetType;
    const types = (Object.keys(typeLabel) as PostType[]).filter(t => t !== 'review' || companies.length || post?.type === 'review');
    const typeField = editing
      ? `<p class="app-muted">Loại bài viết: <strong>${esc(typeLabel[type])}</strong></p><input type="hidden" name="type" value="${type}">`
      : `<label>Loại bài viết<select name="type">${types.map(t => `<option value="${t}"${t === type ? ' selected' : ''}>${typeLabel[t]}</option>`).join('')}</select></label>`;
    const reviewFields = `<div data-review-fields>
      ${editing ? `<p class="app-muted">Công ty: <strong>${esc(post?.company_name || '')}</strong></p>`
        : `<label>Công ty bạn đã thực tập<select name="company">${companies.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>`}
      <label>Đánh giá<select name="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}"${(post?.rating ?? 5) === n ? ' selected' : ''}>${stars(n)} (${n}/5)</option>`).join('')}</select></label>
    </div>`;
    const reviewHint = !editing && !companies.length
      ? '<p class="app-muted community-composer__hint">Mục "Review công ty" chỉ mở cho thực tập sinh đã nhận việc tại công ty đó.</p>' : '';
    const content = `${typeField}${reviewHint}${reviewFields}
      <label>Tiêu đề (tùy chọn)<input name="title" maxlength="200" value="${esc(post?.title || '')}"></label>
      <label>Nội dung<textarea name="body" required maxlength="20000" rows="6" placeholder="Chia sẻ kinh nghiệm phỏng vấn, đặt câu hỏi hoặc giới thiệu tài liệu...">${esc(post?.body || '')}</textarea></label>
      <label>Thẻ (cách nhau bằng dấu phẩy)<input name="tags" maxlength="200" placeholder="phongvan, frontend, cv" value="${esc((post?.tags || []).join(', '))}"></label>
      <label>Đính kèm PDF hoặc ảnh (tối đa 10 MB)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
      ${post?.attachment_path ? `<label><input name="remove_file" type="checkbox"> Gỡ tệp đính kèm hiện tại (${esc(fileName(post.attachment_path))})</label>` : ''}
      <label><input name="anonymous" type="checkbox"${post?.is_anonymous ? ' checked' : ''}> Đăng ẩn danh (tên của bạn được ẩn với mọi người)</label>`;

    const modal = dialog(editing ? 'Sửa bài viết' : 'Viết bài', content, editing ? 'Lưu thay đổi' : 'Đăng bài', async form => {
      const get = (n: string) => form.elements.namedItem(n) as HTMLInputElement | null;
      const chosen = (get('type')!.value || 'experience') as PostType;
      const bodyText = get('body')!.value.trim();
      if (!bodyText) throw new Error('Vui lòng nhập nội dung bài viết.');
      const file = get('file')?.files?.[0];
      if (file && file.size > MAX_FILE) throw new Error('Tệp đính kèm tối đa 10 MB.');
      if (file && !/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)) throw new Error('Chỉ hỗ trợ tệp PDF, PNG, JPG hoặc WEBP.');
      if (chosen === 'document' && !file && !post?.attachment_path) throw new Error('Bài "Tài liệu" cần có tệp đính kèm.');
      let attachment = post?.attachment_path ?? null;
      if (get('remove_file')?.checked) attachment = null;
      if (file) attachment = await api.uploadAttachment(file);
      const fields = {
        title: get('title')!.value.trim() || null,
        body: bodyText,
        is_anonymous: get('anonymous')!.checked,
        tags: parseTags(get('tags')!.value),
        attachment_path: attachment,
        rating: chosen === 'review' ? Number(get('rating')!.value) : null,
      };
      try {
        if (editing) await api.updatePost(post!.id!, fields);
        else await api.createPost({ ...fields, type: chosen, company_id: chosen === 'review' ? get('company')!.value : null });
      } catch (error) {
        if (file && attachment) await api.removeAttachment(attachment);
        throw toAppError(error);
      }
      if (post?.attachment_path && post.attachment_path !== attachment) await api.removeAttachment(post.attachment_path);
      toast(editing ? 'Đã cập nhật bài viết.' : 'Đã đăng bài viết.');
      if (!editing) { selectFilter('latest'); tag = null; tagBar.hidden = true; }
      load(true);
    }, { keepOpen: true });

    const typeSelect = modal.querySelector<HTMLSelectElement>('select[name=type]');
    const reviewBox = modal.querySelector<HTMLElement>('[data-review-fields]')!;
    const sync = () => { reviewBox.hidden = (typeSelect?.value || type) !== 'review'; };
    typeSelect?.addEventListener('change', sync);
    sync();
  }

  // --- Comments -----------------------------------------------------------------------------
  async function openComments(post: FeedPost, counter: HTMLElement) {
    const id = post.id!;
    const form = isSignedIn()
      ? `<label>Bình luận của bạn<textarea name="comment" required maxlength="5000" rows="3"></textarea></label><label><input type="checkbox" name="anonymous"> Bình luận ẩn danh</label>`
      : '<p class="app-muted">Đăng nhập để tham gia bình luận.</p>';
    const modal = dialog(`Bình luận · ${post.title || typeLabel[post.type!]}`, `<div class="community-comments" aria-live="polite"></div>${form}`,
      isSignedIn() ? 'Gửi bình luận' : 'Đăng nhập', async f => {
        if (!requireSignIn()) return;
        const box = f.elements.namedItem('comment') as HTMLTextAreaElement;
        const anon = (f.elements.namedItem('anonymous') as HTMLInputElement).checked;
        if (!box.value.trim()) throw new Error('Vui lòng nhập bình luận.');
        await api.addComment(id, box.value.trim(), anon);
        box.value = '';
        await refresh();
        return false;   // keep the thread open
      }, { keepOpen: true });
    modal.classList.add('community-comments-dialog');
    const list = modal.querySelector<HTMLElement>('.community-comments')!;

    async function refresh() {
      showState(list, 'loading', 'Đang tải bình luận...');
      try {
        const { comments, own } = await api.listComments(id);
        post.comment_count = comments.length;
        counter.textContent = `${comments.length} bình luận`;
        if (!comments.length) { showState(list, 'empty', 'Chưa có bình luận nào.'); return; }
        list.replaceChildren(...comments.map(c => {
          const name = c.author_name || 'Thành viên';
          const row = el('div', { className: 'community-comment-inset' },
            el('div', { className: 'flex items-center justify-between' },
              el('span', { className: 'community-comment-inset__author' }, name + (own.has(c.id!) ? ' (bạn)' : '')),
              el('span', { className: 'community-comment-inset__detail', title: formatDateTime(c.created_at) }, relativeTime(c.created_at))),
            el('p', { className: 'community-comment-inset__body' }, c.body || ''));
          const tools = el('div', { className: 'community-comment-tools' });
          if (own.has(c.id!)) {
            const del = el('button', { type: 'button', className: 'community-comment-tool' }, 'Xóa');
            del.addEventListener('click', async () => {
              if (!confirm('Xóa bình luận này?')) return;
              try { await api.deleteComment(c.id!); await refresh(); } catch (error) { showError(error); }
            });
            tools.append(del);
          } else {
            const rep = el('button', { type: 'button', className: 'community-comment-tool' }, 'Báo cáo');
            rep.addEventListener('click', () => reportContent('Bình luận cộng đồng', { type: 'comment', id: c.id! }));
            tools.append(rep);
          }
          row.append(tools);
          return row;
        }));
      } catch (error) { showState(list, 'error', toAppError(error).message, refresh); }
    }
    refresh();
  }

  // --- Filters, composer triggers, rail -----------------------------------------------------
  const pills = [...document.querySelectorAll<HTMLButtonElement>('.community-filters [data-filter]')];
  function selectFilter(next: FeedFilter) {
    filter = next;
    pills.forEach(x => { const on = x.dataset.filter === next; x.classList.toggle('demo-selected', on); x.setAttribute('aria-pressed', String(on)); });
  }
  pills.forEach(b => bind(b, () => {
    const next = b.dataset.filter as FeedFilter;
    if (next === 'saved' && !requireSignIn()) return;
    selectFilter(next);
    load(true);
  }));
  bind(more, () => load(false));
  bind(document.querySelector('.community-composer__prompt'), () => openComposer());
  bind(document.getElementById('community-saved-link'), () => {
    selectFilter('saved'); load(true);
    feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Mentor widget is a static showcase (no mentor data in the schema yet)
  document.querySelectorAll<HTMLButtonElement>('#community-right-rail button').forEach(b => {
    const text = label(b);
    if (/Kết nối/.test(text)) bind(b, () => compose('Kết nối với mentor', 'mentor@example.com'));
    else if (/Mentoring/.test(text)) bind(b, () => schedule('Mentoring 30 phút'));
  });

  renderEvents();
  if (tag) setTag(tag); else load(true);
}

async function renderEvents() {
  const host = document.getElementById('community-events');
  if (!host) return;
  showState(host, 'loading', 'Đang tải sự kiện...');
  try {
    const events = await api.upcomingEvents();
    if (!events.length) { showState(host, 'empty', 'Chưa có sự kiện sắp diễn ra.'); return; }
    const dayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' });
    const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit' });
    const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    host.replaceChildren(...events.map(e => {
      const uni = e.university as { short_name: string | null; name: string } | null;
      const href = e.organizer_university_id ? `/pages/university/?id=${encodeURIComponent(e.organizer_university_id)}#event-${e.id}` : '/pages/university/';
      return el('a', { className: 'community-event', href },
        el('span', { className: 'community-event-date' }, el('span', { className: 'community-event-date__day' }, dayFmt.format(new Date(e.starts_at))), el('span', {}, dateFmt.format(new Date(e.starts_at)))),
        el('span', { className: 'flex flex-col min-w-0' },
          el('span', { className: 'community-event__title' }, e.title),
          el('span', { className: 'community-event__meta' }, `${timeFmt.format(new Date(e.starts_at))} • ${e.is_virtual ? 'Trực tuyến' : e.location || 'Đang cập nhật'}`),
          uni ? el('span', { className: 'community-event__org' }, uni.short_name || uni.name) : null));
    }));
  } catch (error) { showState(host, 'error', toAppError(error).message); }
}
