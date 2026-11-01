# admin

**Owner:** _(name)_ · **Pages:** `admin`, `admin-login` (both `data-page="admin"`) · **Diagrams:** DFD Process 9, Sequence_Job_Posting_Moderation, Activity_Admin_Job_Moderation

This module does **not** use `main.ts` or the `FeatureModule` hooks. Each page loads its own entry:

| File | What it does |
|---|---|
| `admin.ts` | entry for `pages/admin/`: overview, job queue, users, reports, audit log |
| `adminLogin.ts` | entry for `pages/admin-login/` |
| `adminSession.ts` | sessionStorage session (`internships:admin-session`, expires) |
| `admin.css` | admin styles, linked from both admin pages |

**Storage:** owns `admin:v1` (localStorage) and the admin session (sessionStorage); reads `reports` written by `core/report.ts` (community, messages).

**Watch out**
- No site header, footer or generic controls run here. Anything shared you need, import from `core/` directly.
- Escape all user-submitted text with `esc()` (`core/ui/actions.ts`); `npm run test:admin` includes an XSS check.
- Demo credentials: `admin@example.com` / `AdminDemo2026!`.
