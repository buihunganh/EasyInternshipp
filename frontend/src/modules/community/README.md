# community

**Owner:** _(name)_ · **Pages:** `community` · **Diagrams:** DFD Process 7

| File | What it does |
|---|---|
| `index.ts` | `setup` → post menus; `controls` → `setupCommunity` |
| `community.ts` | compose posts, comments, likes, saves, filters, rail footer |
| `postMenus.ts` | "…" menu per post: save, copy link, hide, report |
| `community.css` | styles for 3-col LinkedIn feed shell, composer, posts, rails |

**Storage:** owns `demo:posts`, `demo:comments:*`, `demo:like:*`, `demo:save-post:*`, `saved-post:*`; reports go through `core/report.ts` into `reports` (read by admin).

**Watch out**
- The admin panel imports `reports`. Don't change the report shape without telling the admin owner (core PR to `core/report.ts`).
- Guests are redirected to login when they like or post (labels checked in `core/auth.ts`).
- The left-rail profile card is the shared `core/layout/profileCard.ts` (same card as the job list, every role); `.community-profile-card` is only its host. Change the card there, not here.
- Layout kept deliberately quiet: one-row composer (the post type is a select in the "Viết bài" dialog), one scrollable row of filter pills, a single "Lối tắt" card (university network, mentors, saved documents), one-row mentors. The HCMUT hub banner and the hashtag card were removed.
- Mobile order is set by class (`.community-left-rail`), not `:first-child`: `<main>` starts with the sr-only `<h1>`.
