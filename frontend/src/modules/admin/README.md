# admin

**Owner:** _(name)_ · **Pages:** `admin`, `admin-login` (both `data-page="admin"`) · **Diagrams:** DFD Process 9, Sequence_Job_Posting_Moderation, Activity_Admin_Job_Moderation

This module does **not** use `main.ts` or the `FeatureModule` hooks. Each page loads its own entry:

| File | What it does |
|---|---|
| `admin.ts` | entry for `pages/admin/`: overview, company verification, job moderation, accounts (officer activation, suspend), reports, audit log |
| `adminLogin.ts` | entry for `pages/admin-login/`: Supabase login that rejects non-admin roles |
| `api.ts` | `admin_overview`, `review_company_verification` (+ signed URLs for documents), `moderate_job`, `admin_close_job`, `set_user_status`, `resolve_report`, audit log |
| `admin.css` | admin styles, linked from both admin pages |

**Data:** the admin's own Supabase session (role `admin`). Every action goes through an RPC that writes `audit_logs` with the reason (BR-38).

**Watch out**
- Rejecting, revoking, suspending and taking down need a reason (enforced by the RPCs too).
- Escape all user-submitted text with `esc()` (`core/ui/actions.ts`).
- Make an admin: sign up, then `update public.profiles set role = 'admin' where email = '…'` (or `npm run db:seed` for `admin@demo.internships.io`).
- Analytics dashboards and settings come in Phase 11.
