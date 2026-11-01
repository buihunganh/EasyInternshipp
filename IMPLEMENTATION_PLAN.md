# EasyInternshipp — Implementation Plan (frontend ↔ Supabase backend)

> Goal: turn the current localStorage demo into the real platform described in `diagrams/`,
> with every business rule enforced by the database and verified by automated tests.
>
> Status at the time of writing (2026-10-31): the backend schema is done and deployed
> (`backend/supabase/migrations/2026103100000{1..8}`). The frontend still uses localStorage only.

## Progress (updated 2026-11-01)

| Phase | Status | Notes |
|---|---|---|
| P0 Setup | ✅ Done | Auth settings pushed from `backend/supabase/config.toml` (min password 8, redirect URLs). **No test project** (decision: PGlite for DB tests, E2E against dev with throwaway accounts). Vietnamese e-mail templates still to do in the dashboard. |
| P1 Backend & tests | ✅ Done | Migrations `…09_ui_alignment`, `…10_search_jobs_filters` pushed to dev. `npm run test:db` (PGlite, 75 checks). `npm run db:types`. `npm run db:seed` (idempotent demo data). `reset-test-db.mjs` skipped (no test project). |
| P2 Frontend foundation | ✅ Done | `core/supabase.ts`, `session.ts`, `errors.ts`, `format.ts`, `render.ts`, `accountApi.ts`; role-aware guards; demo session, banner and `adminSession.ts` removed; ids in URLs. |
| P3 Accounts & roles | ✅ Done | Real register/login/logout, forgot + `/pages/reset-password/`, pending officers, admin-only admin login, account menu on real data. `frontend/tests/e2e/accounts.e2e.mjs`. |
| P4 Public discovery | ✅ Done | Home via `search_jobs` (filters, chips, sort, pagination), job detail `?id=`, company `?id=`, save, follow, guest report. Minimal real apply dialog (CV + screening answers); the full P6 modal is still to do. `discovery.e2e.mjs`. |
| P5 Employer onboarding & moderation | ✅ Done | `/pages/company-settings/`, real post-job (drafts, skills, questions, submit, edit, rejection reason, live-edit warning), employer dashboard (status, counts, pause/resume/close/duplicate/delete), admin queues (companies, jobs, accounts, reports, audit). `posting.e2e.mjs`. |
| P6 Student profile, CV, applying | ✅ Done | Migration `…11_applications_links` (notification links → `/pages/applications/?id=`). Profile on real data (edit, avatar, skills, verification request, discoverable, completeness), CV builder saving typed `CvContent` (several CVs, default, public link `/pages/cv/?slug=`, PDF upload, local draft), full apply dialog, My Applications (timeline, interview RSVP, offer accept/decline, withdraw), saved jobs, job alerts. `npm run test:db` 86 checks; `apply.e2e.mjs`. Core fix: generic button fallback only touches design-HTML buttons. |
| P7 – P14 | ⏳ Not started | Candidates board, messages, community and university pages still run on local demo data. |

Demo accounts (all with password `Demo@2026`): `admin@`, `employer@`, `hr.vng@`, `design@`, `newco@`, `officer@`, `student@demo.internships.io`.

---

## 1. How to read this plan

- **Phases** (§6) are done in order. Each phase ends with a working site, green `npm run build`,
  and passing tests for the business rules it covers.
- **Business rules** (§7) have IDs (`BR-xx`). Every phase lists the rules it must satisfy, and
  every rule maps to a database test (`T-DB`) and/or an end-to-end test (`T-E2E`).
- **Decisions** (§2) are recommended defaults. Change them before the phase that depends on them.
- **Milestones** (§11): M1 accounts and browsing → M2 full hiring loop → M3 all actors → M4 production.

---

## 2. Decisions (recommended defaults)

| ID | Decision | Default | Needed by |
|---|---|---|---|
| D1 | Keep the offline localStorage demo as a fallback? | **No.** Replace it; keeping both doubles every feature | P2 |
| D2 | Demo data for presentations | **Yes.** `backend/scripts/seed-demo.mjs` creates one account per role, a verified company, jobs, applications | P1 |
| D3 | Test database | **A second free Supabase project** used only by tests (Docker is not installed) | P1 |
| D4 | Hosting for the static site | **Vercel** (any static host works: Netlify, Cloudflare Pages) | P14 |
| D5 | Transactional e-mail (status updates, job alerts) | **Resend** through Supabase Edge Functions; in-app notifications work without it | P12 |
| D6 | Posting quotas ("Còn 18/25 tin đăng") | **Show the count only, don't enforce.** Pricing is not defined in the diagrams | P5 |
| D7 | "Tìm kiếm Ứng viên" (talent search) | **Opt-in.** Students choose to be discoverable; only verified companies can search | P1, P7 |
| D8 | Assumed rules from the schema work | Confirm: live-job edits need re-approval; knockout answers flag but don't auto-reject; students can only message companies they applied to; reviews only from hired interns; unanswered offers count as declined | P5–P9 |

---

## 3. Target architecture

```
 Browser (Vite multi-page app, vanilla TypeScript, existing HTML/Tailwind design)
 ├─ frontend/pages/*/index.html ─ src/main.ts ─ src/modules/*   (UI behaviour, rendering)
 │                                       │
 │                                       ▼
 │                                    modules/<name>/api.ts   (ONLY place that calls Supabase)
 │                                       │  supabase-js v2 (typed with database.types.ts)
 ▼                                       ▼
 Supabase project
 ├─ Auth            sign-up / login / password reset (role passed as user metadata)
 ├─ PostgREST       tables guarded by RLS + column grants; workflows as RPCs (public.*)
 ├─ Realtime        messages, notifications
 ├─ Storage         8 buckets, folder-based policies
 ├─ pg_cron         job/offer expiry, nightly warehouse refresh
 ├─ Edge Functions  e-mail notifications, job-alert digests (P12)
 └─ analytics.*     star schema + KPI views, read through get_* RPCs / BI role
```

**Rules of the architecture**
1. The database is the source of truth for permissions and business rules. The UI only *hides*
   actions a user can't take; it never *grants* them.
2. Every status change goes through an RPC (`submit_job`, `apply_to_job`, `send_offer`…).
   Direct table writes are only for owner-editable content (profile fields, CV content, posts…).
3. Only each module's `api.ts` imports the Supabase client (`core/supabase.ts`). Pages and features call typed API functions.
4. No `service_role` key in the frontend, ever. CI fails if the built bundle contains it (P14).

---

## 4. Environments & configuration

| Environment | Supabase project | Used by | Keys stored in |
|---|---|---|---|
| Development | current project (already migrated) | `npm run dev` | `.env.local` (anon key) |
| Test | new project (D3), same migrations | `npm run test:e2e`, seed scripts | `.env.test.local` (URL, anon key, service key) |
| Production | new project at launch (P14) | deployed site | hosting provider env vars |

All `.env*.local` files are git-ignored (already configured). Commit only `.env.example`.

**Supabase dashboard settings (each project)**
- Auth → Providers → Email: minimum password length **8** (Sequence_User_Authentication).
  Confirm e-mail: off for dev/test, on for production.
- Auth → URL configuration: Site URL + redirect URLs `…/pages/login/`, `…/pages/reset-password/`.
- Auth → Email templates: translate confirmation, recovery, and invite e-mails to Vietnamese.
- Auth → SMTP: set a custom SMTP sender (Resend) before production. The built-in sender has a
  very low hourly limit and is meant for testing only.
- Database → Extensions: `pg_cron` on (re-run migration 08 if it was skipped), `pg_net` for P12.
- Data API → Exposed schemas: `public` only.

---

## 5. Gap analysis (what the current UI needs that doesn't exist yet)

### 5.1 Schema additions → migration `20261101000009_ui_alignment.sql` (Phase 1)

| UI element | Page | Change |
|---|---|---|
| Department, headcount | post-job (`#department`, `#headcount`) | `jobs.department text` (headcount = existing `openings`) |
| "Trình độ sinh viên ưu tiên" | post-job | `jobs.target_study_years smallint[]` (e.g. `{3,4}`) |
| "Chuyên ngành đào tạo mục tiêu" | post-job | `jobs.target_majors text[]` |
| "Các đặc quyền" checkboxes | post-job | `jobs.perks text[]` |
| Office, mentors, culture sections, "Thành lập" | company | `companies.profile jsonb` (typed in TS as `CompanyProfile`) |
| "AI Top Matching" / "% Match" on applicants | employer, candidates | RPC `application_match_scores(p_job)` → match % per applicant (reuses job_skills × student_skills) |
| "Tìm kiếm Ứng viên" (D7) | employer | `student_profiles.is_discoverable boolean default false` + RPC `search_candidates(...)` for verified companies, returning non-contact fields only |
| Profile completeness meter | profile | computed in UI; no schema change |
| Duplicate job ("Sao chép tin") | employer | RPC `duplicate_job(p_job)` → new draft copying skills + questions + keys |
| Interview list "Lịch phỏng vấn hôm nay" | employer | RPC `company_interviews(p_from, p_to)` (joins applications/jobs/profiles under RLS) |
| Student code at sign-up | register | no change (metadata `student_code` already supported); add the field to the form |

Each addition gets DB tests in the same phase. Regenerate `database.types.ts` after pushing.

### 5.2 New pages

| Route | Who | Purpose |
|---|---|---|
| `/pages/applications/` | student | My applications: status timeline, interview RSVP, offer accept/decline, withdraw |
| `/pages/notifications/` | signed-in | Full notification list (the header bell shows the latest 10) |
| `/pages/company-settings/` | employer (manager) | Create/edit company, upload GPKD/MST documents, submit verification, team members |
| `/pages/reset-password/` | public | Set a new password after the recovery e-mail link |
| `/pages/cv/` | public | Public CV by `?slug=` (shared link) |
| `/pages/verify/` | public | Internship certificate check by `?code=` (QR target) |
| `/pages/university-portal/` | university officer | Student verification, exclusive jobs, internship reports, events, inquiries, placement KPIs |

Every new page follows the checklist in `CLAUDE.md` ("Adding a page"): routes, design manifest,
`privatePages`, `safeReturnPath`, and workspace footer. New pages have no generated Tailwind file, so they
use classes that already exist in a reused generated stylesheet or hand-written CSS in
`frontend/src/modules/<module>/<page>.css` built on `tokens.css`.

### 5.3 Existing pages: data source after the change

| Page | Reads | Writes / actions |
|---|---|---|
| `/` jobs | `search_jobs`, industries, saved_jobs | save/unsave, record view, report job |
| job-detail | jobs (+company, skills, questions), `job_match_score`, similar jobs | apply (modal), save, report, follow company |
| company | companies (+profile), open jobs, `company_ratings`, reviews | follow, apply, report |
| login / register | universities | `auth.signUp` (role metadata), `auth.signInWithPassword`, reset e-mail |
| profile | profiles, student_profiles, default CV, skills | edit fields, avatar upload, request verification, discoverability |
| cv-builder | cvs | save content, upload PDF, set default/public, print |
| messages | conversations, participants, messages (realtime) | send text/file, mute/archive, report message |
| employer | own jobs + counts, `company_interviews`, `application_match_scores`, partnerships | submit / pause / resume / close / duplicate / delete-draft jobs |
| candidates | pipeline_stages, applications (+answers, history, evaluations, interviews, offers) | move stage, view, shortlist/reject, interview, scorecard, offer, CSV, message |
| post-job | job draft, skills, questions | insert/update draft, skills, questions + keys, `submit_job` |
| community | `post_feed`, `comment_feed`, likes/bookmarks | post (incl. anonymous/review), comment, like, bookmark, report |
| university | universities, partnerships (active), published events | partner inquiry, event registration |
| admin / admin-login | `admin_overview`, queues, users, reports, audit, KPIs | moderate, verify, suspend, resolve, settings |

---

## 6. Phases

Size estimates are for one developer working full time, in days.

### Phase 0 — Setup & decisions (0.5 d)
- Confirm decisions D1–D8.
- Create the **test** Supabase project and run `supabase db push` against it (link, push, then relink dev).
- Configure the Auth settings from §4 on both projects.
- Branch strategy: one branch per phase (`feat/p3-accounts`…), pull request into `main`, CI must be green.

**Done when:** both projects are migrated and seeded, and the Auth settings are applied.

### Phase 1 — Backend completion & test infrastructure (3 d)
1. Write migration `…000009_ui_alignment.sql` (§5.1) and push it to dev and test.
2. Move the PGlite harness into the repo: `backend/supabase/tests/db.test.mjs`, `npm run test:db`
   (devDependency `@electric-sql/pglite`). Extend it for every new RPC/column.
3. `npx supabase gen types typescript --project-id <dev-ref> > frontend/src/core/database.types.ts`
   and add `npm run db:types`.
4. `backend/scripts/seed-demo.mjs` (D2): uses the service key from `.env.local` / `.env.test.local` to create
   users with `auth.admin.createUser` (metadata carries the role), then **signs in as each user and
   calls the real RPCs** (create company → admin verifies → post job → admin approves → apply…).
   The seed therefore doubles as a smoke test of the workflows. Idempotent (skips existing e-mails).
   Demo accounts: `student@demo…`, `employer@demo…`, `officer@demo…`, `admin@demo…`.
5. `backend/scripts/reset-test-db.mjs`: wipes the test project (`supabase db reset --linked` against the
   test project, then seed), used before full E2E runs.

**Rules:** all BR covered by `T-DB` (§7) pass in `npm run test:db`.
**Done when:** `npm run test:db` and `node backend/scripts/seed-demo.mjs` succeed against the test project.

### Phase 2 — Frontend foundation (3 d)
Files:
```
frontend/src/core/supabase.ts       createClient<Database>(import.meta.env.VITE_SUPABASE_URL, …ANON_KEY)
frontend/src/core/database.types.ts generated
frontend/src/core/session.ts        getSession(), currentProfile() {id, role, status, full_name, avatar},
                                    onAuthChange(), cached per page load
frontend/src/core/errors.ts         AppError; maps PostgREST/Postgres codes: 42501 → "Bạn không có quyền…",
                                    P0001/P0002 → database message as-is (already Vietnamese), network → retry toast
frontend/src/core/format.ts         vi-VN dates (Asia/Ho_Chi_Minh), VND currency, relative time
frontend/src/core/render.ts         cloneTemplate(el), renderList(container, template, items, fill),
                                    loading / empty / error states (consistent across pages)
frontend/src/modules/<name>/api.ts  one per module (accounts, profile-cv, jobs, applications, recruiting,
                                    messages, community, notifications, university, admin); new modules as needed
frontend/src/vite-env.d.ts          ImportMetaEnv typing
.env.example
```
Changes:
- `main.ts`: `await initSession()` before `setupAccess(page)` (the session is restored from storage
  asynchronously), then run page setup.
- `core/auth.ts`: `isSignedIn()`, `currentRole()` from session. Page guards become role-aware:
  employer pages → employer, `/pages/applications/` → student, portal → university officer,
  admin → admin. Wrong role → redirect to that role's home with a toast.
- Remove the demo layer: `demo-session`, "Đổi vai trò", "Hoạt động demo", the demo notice bar, and
  `adminSession.ts`. `core/storage.ts` stays for UI-only preferences.
- `navigation.ts`: links to jobs, companies, and applications use ids (`?id=`), not titles.
- Install `@supabase/supabase-js`.

**Rules:** BR-03, BR-06.
**Done when:** the site builds, pages load with real sessions, signed-out users are redirected from
private pages, and nothing reads `internships:demo-session`.

### Phase 3 — Accounts & roles (3 d)
- **Register:** the role selector maps to metadata `role` ∈ {student, employer, university_officer};
  the university `<select>` is filled from `universities`; add an optional MSSV field for students; password ≥ 8
  with the existing strength meter and confirm-match check. Officers see "Tài khoản chờ quản trị viên kích hoạt".
- **Login:** `signInWithPassword`; redirect by role: student → `next` or `/`; employer → `/pages/employer/`
  (or `/pages/company-settings/` when they have no company yet); officer → portal; admin → `/pages/admin/`.
  Suspended or pending accounts get a clear message.
- **Forgot password:** `resetPasswordForEmail(redirectTo: /pages/reset-password/)` → new page calls `updateUser`.
- **Logout:** keep the existing confirm dialog and call `signOut()`; keep local UI drafts.
- **Account menu:** name/avatar from profile; "Việc làm đã lưu" reads `saved_jobs`; notification settings
  read/write `notification_preferences`.
- **Admin login page:** the same Supabase login, but it rejects non-admin roles.

**Rules:** BR-01, BR-02, BR-03, BR-04, BR-05, BR-06.
**Done when:** all four roles can register or log in, land on the right home, and are blocked from other roles' pages.

### Phase 4 — Public job discovery (3 d)
- Home: the job list comes from `search_jobs` (keyword, city, industry, stipend range, work type,
  quick chips, sort, pagination via `total_count`). Cards are cloned from the existing static card,
  so the design is unchanged. Each card shows "% Match" for signed-in students.
- Job detail `?id=`: JD, company block, skills, deadline, `record_job_view`, similar jobs (same industry),
  apply button (opens P6 modal; guests → login with `next`), save, report (guests allowed).
- Company page `?id=`: profile, open jobs, rating, reviews, follow (count from `follower_count`).
- Empty and error states on every list.

**Rules:** BR-17, BR-18, BR-37 (guest report).
**Done when:** a guest can find, filter, and open a job seeded in P1; drafts, pending, expired, and exclusive jobs never show.

> **Milestone M1:** accounts plus browsing on real data.

### Phase 5 — Employer onboarding, posting & admin moderation core (5 d)
The hiring loop can't start until an admin approves the company and the job, so the minimal admin
screens are built here.
- **Company settings (new page):** `create_company`, edit fields and `profile` sections, logo/cover upload
  (`company-assets/<company_id>/`), verification documents (`company-documents/<company_id>/`),
  `submit_company_verification`, status banner (unverified / pending / verified / rejected + note),
  team members (`add_company_member`, role change, remove).
- **Post job:** form → insert draft (+ department, target years/majors, perks, skills via `ensure_skill`,
  screening questions + answer keys), live preview, "Lưu nháp" vs "Gửi duyệt" (`submit_job`). Edit an
  existing job via `?id=`. Show the rejection reason on rejected jobs. Warn that editing a live job
  sends it back to review.
- **Employer dashboard:** own jobs with status chips and counts; actions `change_job_status`
  (pause/resume/close), `duplicate_job`, delete draft; the "x/y tin đăng hoạt động" counter (D6: count only).
- **Admin (core):** company verification queue (open documents with signed URLs → `review_company_verification`),
  job moderation queue (`moderate_job` with a required rejection reason), officer activation (`set_user_status`).

**Rules:** BR-07 … BR-16.
**Done when (T-E2E "posting"):** employer registers → creates company → uploads GPKD → admin verifies →
employer posts → admin approves → the job is visible to guests. A rejected job shows its reason, and an edit
moves it back to pending.

### Phase 6 — Student profile, CV, applying, My Applications (5 d)
- **Profile:** `student_profiles` fields, skills (`ensure_skill` + `student_skills`), avatar,
  discoverable toggle (D7), "Yêu cầu xác thực" (`request_student_verification`) with status badge,
  completeness meter.
- **CV builder:** typed `CvContent` (personal, summary, education, projects, skills, activities, theme,
  color) saved to `cvs.content`. Multiple CVs, set default, optional PDF upload to `cvs/<uid>/`,
  public link toggle → `/pages/cv/?slug=`. Keep the existing print/PDF flow. Unsaved edits stay as a local draft.
- **Apply modal:** CV picker (default preselected, "Tạo CV" shortcut), cover letter, screening questions
  rendered by kind (yes/no, short text, single choice), required markers, then `apply_to_job`. Database
  errors (duplicate, deadline, exclusive) shown inline.
- **My Applications (new page):** list with status chips and "NTD đã xem CV" badge; detail with
  timeline from `application_status_history`; interview cards (`respond_interview`: accept /
  propose new time / decline); offer card (`respond_offer`, decline requires a reason); `withdraw_application`
  while under review.
- **Saved jobs and job alerts:** saved list; job alert form (`job_alerts`).

**Rules:** BR-20 … BR-23, BR-25, BR-27 (student side), BR-45.
**Done when (T-E2E "apply"):** a student without a CV is asked to create one, applies with answers, a
second application is blocked, the application shows in My Applications, and withdrawal works while under review.

### Phase 7 — ATS pipeline, interviews, scorecards, offers (7 d)
- **Candidates page:** job selector; Kanban columns from `pipeline_stages` (rename/reorder/add/remove);
  cards from `applications` with name, match % (`application_match_scores`), knockout flag, score;
  move with `move_application_stage`; filters (status, knockout passed, score).
- **Applicant drawer:** opening it calls `mark_application_viewed`. It shows the CV snapshot plus file (signed URL),
  answers with pass/fail, status history, and these actions:
  shortlist / reject (reason required) via `update_application_status`;
  schedule / reschedule / cancel / complete interview (`schedule_interview`, `update_interview`), showing the candidate's
  RSVP or proposed time;
  scorecards (`evaluations` insert/update own; criteria form);
  send / withdraw offer (`send_offer`, `withdraw_offer`, optional letter upload to `offer-letters/<application_id>/`);
  "Nhắn tin" (`start_conversation`);
  for hired interns, `rate_intern`.
- **Export:** CSV of the current pipeline (name, stage, status, score, applied date).
- **Employer dashboard widgets:** today's interviews (`company_interviews`), top-matching applicants.
- **Talent search (D7):** `search_candidates` with filters; contacting a candidate starts a conversation.

**Rules:** BR-24 … BR-31.
**Done when (T-E2E "hiring loop"):** the full chain applied → CV viewed (the student sees the badge) → interview
(student accepts) → scorecard → offer → student accepts → hired, with notifications at each step, the
history matching, and the employer's view updated. Rejection with feedback and offer withdrawal paths pass too.

> **Milestone M2:** the core business (the recruitment loop across employer, admin, and student) works end to end on real data.

### Phase 8 — Messaging & notifications (4 d)
- **Messages page:** conversation list (participants via `public_profiles`, last message preview,
  unread = messages after `last_read_at`), thread view, send text, attach files
  (`message-attachments/<conversation_id>/`, signed URLs), interview invite cards with RSVP buttons
  for students, mute/archive (`conversation_participants`), report message, mobile conversation switcher.
  Realtime: subscribe to `messages` for open conversations; update `last_read_at` when viewing.
- **Notifications:** header bell (unread count, latest 10, mark read/all, click → `link`), realtime
  subscription on `notifications`, full list page, preferences in the account menu.

**Rules:** BR-32, BR-33, BR-34, BR-43.
**Done when:** two browsers (student and employer) exchange messages live, files open only for participants,
and each workflow step from P5–P7 produces the right notification.

### Phase 9 — Community (2 d)
- Feed from `post_feed` with the existing tabs (newest / alumni / by tag), pagination.
- Composer: post types (experience, anonymous question, document with attachment, company review with
  rating, only offered when the user was hired at that company); edit/delete own posts.
- Likes, bookmarks, comments (`comment_feed`, anonymous option), report post or comment.

**Rules:** BR-35, BR-36, BR-37.
**Done when:** an anonymous post never reveals its author (UI and API), a non-intern review is rejected,
and the like/comment counters are correct.

### Phase 10 — University: public page, officer portal, events, certificates (4 d)
- **Public university page `?id=`:** info, active partner companies, published events, register for an event
  (`register_for_event` → ticket code), partner inquiry form (`partner_inquiries`).
- **Officer portal (new page):** pending student verifications (`verify_student`), student list with
  application progress, exclusive job review (`review_exclusive_job`), internship reports
  (`certify_internship_report`), events CRUD + booth requests (`review_event_booth`) + check-in by ticket
  (`check_in_event`), partner inquiries (status), partnerships (MoU), placement KPIs
  (`get_university_placement`) with CSV export.
- **Student side:** submit internship report (`submit_internship_report`) from My Applications for hired roles.
- **Employer side:** request a career fair booth; post jobs exclusive to a partner university.
- **Certificate page `/pages/verify/?code=`:** `verify_internship_certificate`, printable, with a QR code
  (small `qrcode` package) on the student's certified report.

**Rules:** BR-17, BR-40, BR-41, BR-42.
**Done when (T-E2E "university"):** officer activated by admin → verifies student → approves exclusive job
(only verified students of that university see it) → hired student submits report → employer rates →
officer certifies → the public verify page shows the certificate.

> **Milestone M3:** all five actors (guest, student, employer, officer, admin) are fully functional.

### Phase 11 — Admin console complete & analytics dashboards (4 d)
- **Overview:** `admin_overview` cards plus links into each queue.
- **Jobs:** pending queue, live jobs with `admin_close_job` (reason required), filters/search.
- **Users:** search by role/status, suspend/activate (reason), officer activation.
- **Reports:** queue with target preview, `resolve_report` (none / hide content / close job / suspend user).
- **Audit log:** filter by actor, action, date; CSV export.
- **Events (platform-level)** and **settings** (`platform_settings`).
- **Analytics:** platform KPIs (`get_platform_kpis`), moderation KPIs (`get_moderation_kpis`), company
  funnel on the employer dashboard (`get_company_funnel`), shown as lightweight inline SVG charts (no
  chart library). Show "Cập nhật lúc …" from the last warehouse refresh.

**Rules:** BR-38, BR-39, BR-44.
**Done when:** every admin action is in the audit log with its reason, and the KPI numbers match a manual SQL count on seeded data.

### Phase 12 — E-mail & scheduled automation (2 d)
- Edge Function `notify-email`: Database Webhook on `notifications` INSERT → checks
  `notification_preferences` → sends via Resend (D5) for application/interview/offer/verification types.
- Edge Function `job-alerts`: daily via `pg_cron` + `pg_net` (template in migration 08) → for each active
  alert calls `job_alert_matches`, sends a digest, updates `last_sent_at`.
- Check `cron.job_run_details` for `ei-expire-jobs`, `ei-expire-offers`, `ei-refresh-analytics`.
- Vietnamese e-mail templates matching the site style.

**Rules:** BR-19, BR-30, BR-43 (e-mail channel).
**Done when:** a status change e-mails the candidate only when their preference allows it, and expired jobs/offers flip automatically on the test project.

### Phase 13 — QA hardening (4 d, plus tests written in every phase)
- Complete the E2E suite (§8) and run it against a freshly reset test project.
- Security:
  - Supabase Security Advisor clean, apart from the 4 documented views.
  - Built bundle contains no `service_role` key.
  - Manual "try to break it" pass: direct REST calls with another user's token, for each table.
- Performance: Supabase Performance Advisor; check slow queries for `search_jobs`, feed, Kanban;
  add indexes if needed.
- Accessibility and responsive checks: keep the existing `test:design` assertions (tokens, 390px no-overflow).
- UAT: run the per-actor scripts in §8.4 with a real person per role.

### Phase 14 — Deployment & CI (2 d)
- **GitHub Actions:** on every pull request, `npm ci` → `npm run build` → `npm run test:db`; E2E on demand / nightly using
  test-project secrets.
- **Production Supabase project:** `supabase db push`, seed reference data only (no demo accounts), Auth
  settings with e-mail confirmation and custom SMTP, first admin via SQL.
- **Static hosting (D4):** `npm run build` → `dist/`; env vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`;
  every `pages/*/` route works as a static path (Vite multi-page output).
- **Operations:** backups (paid plan for daily backups), Supabase usage alerts. Note that free projects pause after a period of
  inactivity.
- Update `CLAUDE.md` with the new architecture (api layer, session, env, test commands).

> **Milestone M4:** production launch.

---

## 7. Business rules traceability

Enforcement layer: **DB** = constraint/trigger, **RPC** = workflow function, **RLS** = row/column
security, **UI** = client-side guidance only. Tests: `T-DB` = `backend/supabase/tests/db.test.mjs`,
`T-E2E` = Playwright spec name.

| ID | Rule | Source diagram | Enforced in | Tests | Phase |
|---|---|---|---|---|---|
| BR-01 | Self sign-up as student, employer, or officer; `admin` can never be self-assigned | UseCase_TongQuat UC-01 | DB trigger | T-DB ✔, T-E2E accounts | P3 |
| BR-02 | Officers start `pending_verification` until an admin activates them | UseCase_University | DB trigger, RPC `set_user_status` | T-DB ✔, T-E2E university | P3 |
| BR-03 | Suspended or pending accounts lose all access immediately | UseCase_Admin | RLS helpers (`status='active'`) | T-DB, T-E2E admin | P2 |
| BR-04 | Students are linked to their university by e-mail domain | UseCase_University | DB trigger | T-DB ✔ | P3 |
| BR-05 | Password ≥ 8 characters | Sequence_User_Authentication | Auth setting + UI | T-E2E accounts | P3 |
| BR-06 | Post-login redirect only to allow-listed internal paths | Sequence_User_Authentication | UI (`safeReturnPath`) | T-E2E accounts | P2 |
| BR-07 | Verification needs a tax code and at least one GPKD document | Activity_Employer_Recruitment | RPC | T-DB, T-E2E posting | P5 |
| BR-08 | Only verified companies post, reopen jobs, message students, book booths | Sequence_Job_Posting_Moderation | RPC + RLS | T-DB ✔, T-E2E posting | P5 |
| BR-09 | Changing company name or tax code (or student MSSV) resets verification | — (integrity) | DB trigger | T-DB | P5 |
| BR-10 | Revoking verification pauses all live jobs | UseCase_Admin | RPC | T-DB | P5 |
| BR-11 | A company always keeps an owner | — | DB trigger | T-DB | P5 |
| BR-12 | Job lifecycle draft → pending → active/rejected → paused/closed/expired | Activity_Employer_Recruitment | RPC + column grants | T-DB ✔, T-E2E posting | P5 |
| BR-13 | Rejecting a job needs a reason; the employer is notified | Activity_Admin_Job_Moderation | RPC | T-DB, T-E2E posting | P5 |
| BR-14 | Description ≥ 50 characters, deadline in the future, at submission | Sequence_Job_Posting_Moderation | RPC | T-DB | P5 |
| BR-15 | No deadline given → 30 days from approval (setting) | — | RPC | T-DB ✔ | P5 |
| BR-16 | Material edits to a live job send it back to moderation | D8 | DB trigger | T-DB ✔, T-E2E posting | P5 |
| BR-17 | Exclusive jobs are visible only to verified students of that university, after university approval | UC-08 | RLS + RPC | T-DB ✔, T-E2E university | P4/P10 |
| BR-18 | Guests see only active, unexpired jobs | Activity_Candidate_Apply | RLS + `search_jobs` | T-DB ✔, T-E2E discovery | P4 |
| BR-19 | Jobs past their deadline expire automatically | — | pg_cron `expire_jobs` | T-DB ✔ | P12 |
| BR-20 | Only signed-in students apply, to active jobs before the deadline | Activity_Candidate_Apply | RPC | T-DB ✔, T-E2E apply | P6 |
| BR-21 | One application per student per job | Sequence_Candidate_Apply | DB unique + RPC | T-DB ✔, T-E2E apply | P6 |
| BR-22 | A CV is required; the CV snapshot/file is frozen at submission | Activity_Candidate_Apply | RPC + storage policy | T-DB ✔ | P6 |
| BR-23 | Required screening answers; knockout graded; answer keys never visible to candidates | UseCase_Employer | RPC + RLS | T-DB ✔, T-E2E apply | P6 |
| BR-24 | Application state machine; hired/rejected/withdrawn/offer_declined are final | Activity_Employer_Recruitment | DB trigger | T-DB ✔ | P7 |
| BR-25 | The first employer view sets "NTD đã xem CV" and notifies the student | Sequence_Employer_Recruitment_ATS | RPC + trigger | T-DB ✔, T-E2E hiring | P7 |
| BR-26 | Rejection requires a reason, shown to the candidate | Activity_Employer_Recruitment | RPC | T-DB, T-E2E hiring | P7 |
| BR-27 | Withdrawal only while under review (before an offer) | Activity_Candidate_Apply | DB trigger | T-DB ✔, T-E2E apply | P6 |
| BR-28 | Interview in the future; online needs a link; RSVP accept/reschedule/decline; reschedule needs a proposed time | Sequence_Employer_Recruitment_ATS | RPC | T-DB ✔, T-E2E hiring | P7 |
| BR-29 | Offer only after shortlist/interview; one open offer; decline needs a reason; accept → hired | Sequence_Employer_Recruitment_ATS | RPC + unique index | T-DB ✔, T-E2E hiring | P7 |
| BR-30 | An unanswered offer past `expires_at` → offer_declined | D8 | pg_cron `expire_offers` | T-DB ✔ | P12 |
| BR-31 | Scorecards are private to the hiring company; the score is their average | UseCase_Employer | RLS + trigger | T-DB ✔ | P7 |
| BR-32 | Students message only companies they applied to; verified companies may initiate; one thread per student–company | Sequence_Direct_Messaging, D8 | RPC + RLS | T-DB ✔, T-E2E messaging | P8 |
| BR-33 | Scheduling an interview posts an invite card in the chat | Sequence_Direct_Messaging | RPC | T-DB ✔ | P8 |
| BR-34 | Mute/archive is per participant; muted users get no message notifications | DFD 6.4 | RLS + trigger | T-DB, T-E2E messaging | P8 |
| BR-35 | Anonymous posts and comments never expose the author | DFD 7.2 | RLS + views | T-DB ✔, T-E2E community | P9 |
| BR-36 | Company reviews only from interns hired there | UC-09, D8 | DB trigger | T-DB ✔ | P9 |
| BR-37 | Guests can report; duplicate open reports blocked; ≤ 20 reports/day per user | DFD 3.5/7.4 | RLS + trigger | T-DB ✔ | P4/P9 |
| BR-38 | Every admin action is audited with actor, reason, IP | Activity_Admin_Job_Moderation | RPC (`log_audit`) | T-DB ✔, T-E2E admin | P11 |
| BR-39 | Resolving a report can hide content, close a job, or suspend a user, and closes duplicates | DFD 9.4 | RPC | T-DB ✔, T-E2E admin | P11 |
| BR-40 | Officers verify and monitor only their own university's students | UseCase_University | RPC + RLS | T-DB ✔, T-E2E university | P10 |
| BR-41 | Internship report: hired + verified student; employer rating before certification; public QR verification | DFD 8.4 | RPC | T-DB ✔, T-E2E university | P10 |
| BR-42 | Event registration respects capacity and published status; booths need a verified company + organizer approval | DFD 8.3 | RPC + RLS | T-DB ✔ | P10 |
| BR-43 | Each workflow step notifies the right party; preferences respected (in-app and e-mail) | DFD 8.1 | triggers + RPC + Edge Function | T-DB ✔, T-E2E | P8/P12 |
| BR-44 | KPIs are visible only within scope (company → own, officer → own university, admin → all) | — | RPC | T-DB ✔ | P11 |
| BR-45 | File access follows folder ownership; submitted CV files cannot be deleted | — | Storage policies | T-DB ✔ | P6 |

✔ = already covered by the current PGlite test run (89 checks). The others are added in their phase.

---

## 8. Test strategy

### 8.1 Layers
| Layer | Tool | Runs | Purpose |
|---|---|---|---|
| Database | PGlite harness `npm run test:db` | every pull request (fast, no network) | Business rules, RLS, state machines, RPC validation |
| Type safety | `tsc` via `npm run build` | every pull request | Frontend ↔ schema contract (generated types) |
| End-to-end | Playwright Test runner (`@playwright/test` is already a devDependency) | per phase locally; nightly / on demand in CI | Real browser + test Supabase project, cross-actor flows |
| Design | existing `test:design`, adapted | pull request | Tokens, 390px no-overflow, no runtime errors |
| Manual UAT | scripts in §8.4 | each milestone | Real users per role |

### 8.2 E2E structure
```
playwright.config.ts            webServer: npm run dev; baseURL http://127.0.0.1:5173
tests/e2e/
  helpers/env.ts                loads .env.test.local
  helpers/factory.ts            service-role client: createUser(role), verifiedCompany(), activeJob(),
                                hiredApplication()… built by calling the real RPCs as those users
  helpers/login.ts              logs in through the UI or injects a session
  accounts.spec.ts              BR-01..06
  discovery.spec.ts             BR-17, 18, 37
  posting.spec.ts               BR-07..16
  apply.spec.ts                 BR-20..23, 27
  hiring-loop.spec.ts           BR-24..31  (the M2 gate)
  messaging.spec.ts             BR-32..34, 43
  community.spec.ts             BR-35..37
  university.spec.ts            BR-17, 40..42
  admin.spec.ts                 BR-03, 38, 39, 44
  permissions.spec.ts           direct REST calls with other users' tokens must fail (all tables)
  design.spec.ts                adapted from frontend/tests/design-system-test.mjs
```
Each test creates its own users with unique e-mails, so tests are independent and can run in parallel.
The old `frontend/tests/*-test.mjs` are deleted as their spec replacements land.

### 8.3 Golden path (must stay green from M2 onward)
1. Employer signs up → creates a company → uploads GPKD → submits verification.
2. Admin verifies the company → employer posts a job with a knockout question → submits.
3. Admin approves → a guest finds it via search.
4. A student signs up (school e-mail → auto-linked) → builds a CV → applies with answers.
5. Employer opens the applicant (the student sees "NTD đã xem CV") → schedules an interview (card in chat).
6. Student accepts the RSVP → employer adds a scorecard → sends an offer → student accepts → **hired**.
7. Officer verifies the student → student submits the internship report → employer rates →
   officer certifies → a guest opens `/pages/verify/?code=…` and sees the certificate.
8. Admin sees every step in the audit log; the KPIs after `analytics.refresh_all()` show 1 hire.

### 8.4 UAT checklists (one person per role, at each milestone)
- **Guest:** browse/search/filter, job and company pages, community feed, report a job, register.
- **Student:** profile, verification request, CV (create, print, share), apply, track, respond to an interview
  and an offer, withdraw another application, chat, community post (anonymous + review), event ticket,
  internship report.
- **Employer:** company setup and verification, team member, post/edit/pause/close/duplicate a job, Kanban,
  interview, scorecard, offer, CSV, chat, booth request, exclusive job, rate an intern, dashboard KPIs.
- **Officer:** verify students, review an exclusive job, certify a report, run an event with check-in,
  handle an inquiry, export placement statistics.
- **Admin:** verify a company, moderate jobs, take down a live job, suspend/activate users, activate an officer,
  resolve reports with each action, audit log, settings, KPIs.

---

## 9. Frontend conventions (apply in every phase)

- **Data access:** only `modules/<name>/api.ts` imports `supabase` (through `core/supabase.ts`). API functions return typed results or throw `AppError`.
- **Errors:** `try { … } catch (e) { showError(e) }`, where `showError` uses `errors.ts` → toast/inline message.
- **Rendering:** user content goes through `textContent` or `esc()`; never interpolate raw strings into
  `innerHTML`. Lists use `cloneTemplate` from existing markup to keep the generated Tailwind classes.
- **Ids in URLs:** `?id=<uuid>` for jobs, companies, applications; `?slug=` for public CVs; `?code=` for certificates.
- **Files:** upload to the bucket/folder convention in migration 06; private files open through signed URLs
  (60 minutes).
- **Realtime:** subscribe per page and unsubscribe on `pagehide`.
- **Formatting:** `Intl` with `vi-VN`, time zone `Asia/Ho_Chi_Minh`, VND currency.
- **Text-based navigation:** `destination()` in `navigation.ts` still maps Vietnamese link labels; keep labels
  stable or update the regexes together.
- **Schema changes:** new migration → `npm run test:db` → push dev and test → `npm run db:types` → fix type errors.

---

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Generated Tailwind is per page; new markup may use classes that don't exist | Broken styling | Clone existing elements; new styles in hand-written CSS on tokens; `test:design` |
| Behaviour wired to visible Vietnamese text | Silent routing breaks when copy changes | Ids in URLs; keep `destination()` regexes in sync; E2E covers navigation |
| Default Supabase e-mail sender rate limit | Sign-ups/resets fail in demos | Custom SMTP (Resend) before UAT with real users |
| Free-tier project pausing / limits | Demo outage | Keep the project active before demos, or use a paid plan for production |
| Seeded static HTML content removed | Empty-looking pages | `seed-demo.mjs` + designed empty states |
| RLS gaps found late | Data leaks | `permissions.spec.ts` + PGlite RLS tests per phase; Security Advisor each milestone |
| Schema drift between dev, test, and prod | Runtime errors | Migrations only via CLI; `db:types` + build in CI |

---

## 11. Milestones & effort

| Milestone | Phases | Outcome | Estimate |
|---|---|---|---|
| M1 | P0–P4 | Real accounts for 4 roles, public job discovery on live data | ~12.5 d |
| M2 | P5–P7 | Full recruitment loop employer ↔ admin ↔ student, golden path green | ~17 d |
| M3 | P8–P10 | Messaging, notifications, community, university portal, certificates | ~10 d |
| M4 | P11–P14 | Admin console + analytics, e-mails, QA, CI, production | ~12 d |
| **Total** | | | **≈ 50 developer-days** (one developer; parallelises across 2–3 people after P2) |

Parallel tracks after P2: (A) student-facing pages, (B) employer + admin, (C) messaging/community/university.

---

## 12. Out of scope (later versions)

- Payments for posting packages and commission (settings placeholders only).
- Built-in video calls (interviews use meeting links).
- ML-based matching beyond skill overlap.
- Mobile apps; multi-language UI.
- Importing data from the current localStorage demo (demo data is disposable).
