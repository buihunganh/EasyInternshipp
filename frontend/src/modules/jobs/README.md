# jobs

**Owner:** _(name)_ · **Pages:** `jobs` (home, `/`), `job-detail` (`?id=`), `company` (`?id=`) · **Diagrams:** DFD Process 3, Activity_Candidate_Apply

| File | What it does |
|---|---|
| `index.ts` | `setup` → job search on `jobs`; `controls` → job detail / company page (awaited) |
| `api.ts` | `searchJobs` (RPC `search_jobs`), `getJob`, `recordView`, `matchScore`, `getCompany`, ratings/reviews, follow, `myCvs`, `applyToJob` |
| `jobSearch.ts` | home list: filters, quick pills, sort, pagination (`total_count`), save; rows cloned from the first `article.jobs-row`; skeleton rows while loading; mobile "Bộ lọc" toggle; URL keeps `?q=&city=&industry=`. Match score shows from 30 (`--mid` grey 30–69, green ≥70). Exports `setIconText`, `deadlineClock` ("Còn N ngày", `.is-soon` at ≤3 days) and `skeletonRows` |
| `homeSidebar.ts` | home side widgets on real data: the student's profile card (shared `renderProfileCard` from `core/layout/profileCard.ts`, the same card as the community page; removed for other roles), featured companies (most open jobs, follow), upcoming published events (the card is hidden when there are none), `renderRailFooter` on the right rail |
| `jobDetail.ts` | job page: header (single dot separators, address/city de-duplicated), description, requirements + skills, perks, deadline, company widget, location card with an "Mở trong Google Maps" link, similar jobs, save, guest report, view count |
| `companyPage.ts` | company page: profile (`companies.profile`, type `CompanyProfile` in `core/models.ts`), real stats, open jobs, reviews, mentors, similar companies, follow, report |
| `jobs.css` | page styles for all three pages (prefix `jobs-`), linked after `design-system.css`; built on the shared `ui-*` classes |
| `applyDialog.ts` | minimal apply: CV picker, cover letter, screening questions → `apply_to_job` (full modal in Phase 6) |

**Data:** `jobs`, `companies`, `job_skills`, `screening_questions` (RLS: guests see only active, unexpired jobs), `saved_jobs` and `company_follows` (student), `reports` (guests allowed), `company_ratings` / `post_feed` views.

**Layout ("Giấy & Mực")**: home = `.jobs-home` grid (search card on top of the middle column; left rail filters, right rail discovery; one column <768px with filters behind the "Bộ lọc" pill). Job detail and company = `<main>` wrapping `.ui-shell--main-right`; core's workflow trail is prepended into `<main>` above the shell.

**Watch out**
- Test contracts: `#job-results article h3` (title text), `main h2 span` (count), `form input` / `form button[type=submit]` (first form = search), `section button` (quick pills; text matched by regex in `jobSearch.ts`), `aside label … input` (filters), `button[title="Lưu công việc"]`; job detail `main h1`, `main button` "Ứng Tuyển Ngay", `main aside a` "Xem hồ sơ công ty" (the about-company card is an `<aside>` in the main column); company `main h1`, `#jobs-section h3`.
- `search_jobs` is defined in migration `…10`; changing its arguments means dropping and recreating it (one function name only).
- `job-detail` / `company` also render in the recruiter workspace (`?workspace=employer`); `core/layout/workflow.ts` swaps the apply button there.
- The apply action is registered with `registerApply()` so core's generic "Ứng tuyển ngay" handling opens this dialog.
- Home extras: the empty search state keeps the design sentence and adds "Xóa từ khóa và bộ lọc" (the same reset as "Thiết lập lại") plus "Thử tìm:" chips (Frontend / Marketing / Data); the fake "Cẩm nang & Công cụ thi tuyển" rail card is hidden in `homeSidebar.ts` because its links have no feature.
- `myCvs()` filters by `student_id`: the `cvs` RLS policy also returns other students' **public** CVs, so never rely on RLS alone for "my …" lists.
