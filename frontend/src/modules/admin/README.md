# admin

**Owner:** _(name)_ · **Pages:** `admin`, `admin-login` (both `data-page="admin"`) · **Diagrams:** DFD Process 9, Sequence_Job_Posting_Moderation, Activity_Admin_Job_Moderation

This module does **not** use `main.ts` or the `FeatureModule` hooks. Each page loads its own entry:

| File | What it does |
|---|---|
| `admin.ts` | entry for `pages/admin/`: overview, company verification, job moderation (oldest-first queue, 60m overdue chip, detail dialog with approve/reject CTAs), accounts (role filter select `#admin-role`, registration date), reports (target names with links, duplicate count chip), audit log (Vietnamese action mapping, resolved target names, group filter pills) |
| `adminLogin.ts` | entry for `pages/admin-login/`: Supabase login that rejects non-admin roles |
| `overview.ts` | the "Tổng quan" tab: KPI strip (`#admin-stats`, 4 queue tiles with the oldest wait and how many are past their SLA), "Cần xử lý trước" (all queues merged, ranked by how far past SLA), "Sức khỏe nền tảng" (figures + users by role), 14-day small-multiple column charts with hover/focus tooltips and a table view, recent admin actions |
| `labels.ts` | Vietnamese labels shared by `admin.ts` and `overview.ts` (roles, audit actions/tables, report reasons/targets) |
| `api.ts` | `admin_overview`, `review_company_verification` (+ signed URLs for documents), `moderate_job`, `admin_close_job`, `set_user_status`, `resolve_report`, `listAudit`, `resolveTargetNames` (batched name resolution for jobs, companies, profiles) |
| `admin.css` | admin styles (tokens only), linked from both admin pages. Same look as the recruiter workspace: 72px rail sidebar, 56px top bar with icon-over-label shortcuts, stat strip, and on list tabs one card holding the status pills, search, table and pager. Mobile (<=767px): 6 scrollable nav items, card-based table rows without horizontal overflow at 390px |

**Data:** the admin's own Supabase session (role `admin`). Every action goes through an RPC that writes `audit_logs` with the reason (BR-38).

**Watch out**
- Lists are paginated client-side, 15 rows per page (`PAGE_SIZE` in `admin.ts`), after the search filter; the API still caps each list at 200–300 rows. Changing tab, status pill, role filter or search goes back to page 1; an action keeps the current page.
- The status filter is the pill group `#admin-filters` (`button[data-status]`, pressed = `aria-pressed="true"`), not a `<select>`; `admin-test.mjs` clicks it. Tab audit includes group pills (`job`, `company`, `user`, `report`).
- Tab users has client-side role filter `<select id="admin-role">` beside search, hidden on other tabs.
- Rejecting, revoking, suspending and taking down need a reason (enforced by the RPCs too).
- Escape all user-submitted text with `esc()` (`core/ui/actions.ts`).
- Make an admin: sign up, then `update public.profiles set role = 'admin' where email = '…'` (or `npm run db:seed` for `admin@demo.internships.io`).
- Analytics dashboards and settings come in Phase 11.
- Queue SLAs live in `SLA` (`overview.ts`): tin 60 phút, báo cáo 24 giờ, doanh nghiệp và cán bộ 48 giờ. Keep the jobs value in step with the "Quá hạn 60 phút" chip in the jobs tab.
- Overview charts follow the dataviz rules: one series per chart (small multiples, never two y-axes), past days in `--ui-border-strong`, today in `--ui-ink`, bars ≤ 24px with a square base; `activitySince()` reads `applications.applied_at`, `profiles.created_at` and `job.approve` audit rows for the last 14 days and counts per local day.
