# community

**Owner:** _(name)_ · **Pages:** `community` · **Diagrams:** DFD Process 7

| File | What it does |
|---|---|
| `index.ts` | `setup` → post menus; `controls` → `setupCommunity` |
| `community.ts` | compose posts, comments, likes, saves, filters |
| `postMenus.ts` | "…" menu per post: save, copy link, hide, report |

**Storage:** owns `demo:posts`, `demo:comments:*`, `demo:like:*`, `demo:save-post:*`, `saved-post:*`; reports go through `core/report.ts` into `reports` (read by admin).

**Watch out**
- The admin panel imports `reports`. Don't change the report shape without telling the admin owner (core PR to `core/report.ts`).
- Guests are redirected to login when they like or post (labels checked in `core/auth.ts`).
