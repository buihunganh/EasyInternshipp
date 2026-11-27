# community

**Owner:** _(name)_ · **Pages:** `community` · **Diagrams:** DFD Process 7

| File | What it does |
|---|---|
| `index.ts` | `controls` → `setupCommunity` |
| `api.ts` | `post_feed` (pages of 10; filters latest / top / question / review / document / saved, `?tag=`), viewer state (own, liked, saved), posts CRUD, `post-attachments` upload, likes, bookmarks, `comment_feed` + comments, reviewable companies, upcoming events |
| `community.ts` | feed rendering, composer dialog (type, review company + rating, title, body, tags, PDF/image attachment, anonymous), comment thread dialog, "…" menu (copy link, edit/delete own, hide, report), filters, events rail, rail footer |
| `community.css` | 3-col shell, composer, posts, comment thread, events rail |

**Data:** Supabase only (no localStorage). Business rules enforced by the database:
- BR-35 anonymous posts/comments: the `post_feed` / `comment_feed` views return `author_name = 'Ẩn danh'` and no `author_id`; the `posts` table's RLS hides anonymous rows from everyone but the author and admins.
- BR-36 company reviews only from hired interns (`posts_before_insert` trigger). The composer only offers "Review công ty" when `reviewableCompanies()` is non-empty.
- BR-37 reports (guests too) go to `reports` through `core/report.ts` with `target_type` `post` / `comment`.
- `like_count` / `comment_count` are kept by triggers; the UI updates them optimistically.

**Links:** `?post=<id>` pins a post at the top (share links), `?tag=<tag>` filters by tag.

**Watch out**
- The left-rail profile card is the shared `core/layout/profileCard.ts`; `.community-profile-card` is only its host.
- The right rail's "Thành viên tích cực" ranks named authors of the last 30 days (`topAuthors()`); anonymous posts never count.
- Mobile order is set by class (`.community-left-rail`), not `:first-child`: `<main>` starts with the sr-only `<h1>`.
