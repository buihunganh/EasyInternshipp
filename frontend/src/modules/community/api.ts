// Community data (DFD process 7): post_feed / comment_feed views hide anonymous authors (BR-35),
// the posts_before_insert trigger only accepts company reviews from hired interns (BR-36).
import { supabase, type Enums, type Views } from '../../core/supabase';
import { unwrap } from '../../core/errors';
import { currentSession } from '../../core/session';

const uid = () => currentSession()?.user.id ?? '';
export const PAGE_SIZE = 10;

export type FeedPost = Views<'post_feed'>;
export type FeedComment = Views<'comment_feed'>;
export type PostType = Enums<'post_type'>;
export type FeedFilter = 'latest' | 'top' | 'question' | 'review' | 'document' | 'saved';

const feedColumns = 'id, type, title, body, tags, attachment_path, like_count, comment_count, is_anonymous, author_id, author_name, author_avatar_path, company_id, company_name, rating, created_at, updated_at';

/** One page of the feed. `saved` lists the signed-in user's bookmarks. */
export async function listFeed(filter: FeedFilter, page: number, tag?: string | null): Promise<FeedPost[]> {
  const from = page * PAGE_SIZE, to = from + PAGE_SIZE - 1;
  if (filter === 'saved') {
    const marks = unwrap(await supabase.from('post_bookmarks').select('post_id, created_at')
      .order('created_at', { ascending: false }).range(from, to));
    if (!marks.length) return [];
    const posts = unwrap(await supabase.from('post_feed').select(feedColumns).in('id', marks.map(m => m.post_id)));
    const order = new Map(marks.map((m, i) => [m.post_id, i]));
    return posts.sort((a, b) => (order.get(a.id!) ?? 0) - (order.get(b.id!) ?? 0));
  }
  let query = supabase.from('post_feed').select(feedColumns);
  if (filter === 'question' || filter === 'review' || filter === 'document') query = query.eq('type', filter);
  if (tag) query = query.contains('tags', [tag]);
  query = filter === 'top'
    ? query.order('like_count', { ascending: false }).order('comment_count', { ascending: false }).order('created_at', { ascending: false })
    : query.order('created_at', { ascending: false });
  return unwrap(await query.range(from, to));
}

export async function getPost(id: string) {
  return unwrap(await supabase.from('post_feed').select(feedColumns).eq('id', id).maybeSingle());
}

/** Which of these posts the signed-in user wrote (anonymous ones included: RLS shows authors their own rows), liked or saved. */
export async function viewerState(postIds: string[]) {
  const me = uid();
  if (!me || !postIds.length) return { own: new Set<string>(), liked: new Set<string>(), saved: new Set<string>() };
  const [own, liked, saved] = await Promise.all([
    supabase.from('posts').select('id').eq('author_id', me).in('id', postIds),
    supabase.from('post_likes').select('post_id').eq('user_id', me).in('post_id', postIds),
    supabase.from('post_bookmarks').select('post_id').eq('user_id', me).in('post_id', postIds),
  ]);
  return {
    own: new Set(unwrap(own).map(r => r.id)),
    liked: new Set(unwrap(liked).map(r => r.post_id)),
    saved: new Set(unwrap(saved).map(r => r.post_id)),
  };
}

export interface PostFields {
  type: PostType;
  title: string | null;
  body: string;
  is_anonymous: boolean;
  tags: string[];
  company_id?: string | null;
  rating?: number | null;
  attachment_path?: string | null;
}

// author_id comes from its column default (auth.uid())
export async function createPost(fields: PostFields) {
  return unwrap(await supabase.from('posts').insert(fields).select('id').single()).id;
}

/** Type and company are fixed after posting (not in the update grant). */
export async function updatePost(id: string, fields: Omit<PostFields, 'type' | 'company_id'>) {
  unwrap(await supabase.from('posts').update(fields).eq('id', id));
}

export async function deletePost(id: string) { unwrap(await supabase.from('posts').delete().eq('id', id)); }

export async function uploadAttachment(file: File) {
  const safe = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80);
  const path = `${uid()}/${crypto.randomUUID()}-${safe}`;
  unwrap(await supabase.storage.from('post-attachments').upload(path, file, { contentType: file.type, upsert: false }));
  return path;
}

export async function removeAttachment(path: string) {
  await supabase.storage.from('post-attachments').remove([path]);
}

export async function setLike(postId: string, on: boolean) {
  if (on) unwrap(await supabase.from('post_likes').insert({ post_id: postId, user_id: uid() }));
  else unwrap(await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid()));
}

export async function setBookmark(postId: string, on: boolean) {
  if (on) unwrap(await supabase.from('post_bookmarks').insert({ post_id: postId, user_id: uid() }));
  else unwrap(await supabase.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', uid()));
}

export async function listComments(postId: string) {
  const comments = unwrap(await supabase.from('comment_feed')
    .select('id, post_id, parent_id, body, is_anonymous, author_id, author_name, author_avatar_path, created_at, updated_at')
    .eq('post_id', postId).order('created_at'));
  const me = uid();
  const own = me && comments.length
    ? new Set(unwrap(await supabase.from('post_comments').select('id').eq('author_id', me).eq('post_id', postId)).map(r => r.id))
    : new Set<string>();
  return { comments, own };
}

export async function addComment(postId: string, body: string, anonymous: boolean, parentId?: string | null) {
  unwrap(await supabase.from('post_comments').insert({ post_id: postId, body, is_anonymous: anonymous, parent_id: parentId || null }));
}

export async function deleteComment(id: string) { unwrap(await supabase.from('post_comments').delete().eq('id', id)); }

/** Companies where the student was hired: the only ones they may review (BR-36). */
export async function reviewableCompanies() {
  const me = uid();
  if (!me) return [];
  const rows = unwrap(await supabase.from('applications').select('job:jobs(company:companies(id, name))')
    .eq('student_id', me).eq('status', 'hired'));
  const map = new Map<string, string>();
  for (const row of rows) {
    const company = (row.job as { company: { id: string; name: string } | null } | null)?.company;
    if (company) map.set(company.id, company.name);
  }
  return [...map].map(([id, name]) => ({ id, name }));
}

/** Most active named authors over the last `days` (anonymous posts never count: post_feed hides their author). */
export async function topAuthors(days = 30, limit = 4) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = unwrap(await supabase.from('post_feed').select('author_id, author_name, author_avatar_path, like_count')
    .not('author_id', 'is', null).gte('created_at', since).limit(500));
  const by = new Map<string, { id: string; name: string; avatar: string | null; posts: number; likes: number }>();
  for (const r of rows) {
    const cur = by.get(r.author_id!) ?? { id: r.author_id!, name: r.author_name || 'Thành viên', avatar: r.author_avatar_path, posts: 0, likes: 0 };
    cur.posts++; cur.likes += r.like_count ?? 0;
    by.set(r.author_id!, cur);
  }
  return [...by.values()].sort((a, b) => b.posts - a.posts || b.likes - a.likes).slice(0, limit);
}

/** Published events that have not ended yet (right rail). */
export async function upcomingEvents(limit = 3) {
  return unwrap(await supabase.from('events')
    .select('id, title, starts_at, ends_at, location, is_virtual, organizer_university_id, university:universities(short_name, name)')
    .eq('status', 'published').gt('ends_at', new Date().toISOString())
    .order('starts_at').limit(limit));
}
