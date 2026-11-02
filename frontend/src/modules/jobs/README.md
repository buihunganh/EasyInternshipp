# jobs

**Owner:** _(name)_ · **Pages:** `jobs` (home, `/`), `job-detail` (`?id=`), `company` (`?id=`) · **Diagrams:** DFD Process 3, Activity_Candidate_Apply

| File | What it does |
|---|---|
| `index.ts` | `setup` → job search on `jobs`; `controls` → job detail / company page (awaited) |
| `api.ts` | `searchJobs` (RPC `search_jobs`), `getJob`, `recordView`, `matchScore`, `getCompany`, ratings/reviews, follow, `myCvs`, `applyToJob` |
| `jobSearch.ts` | home list: filters, quick chips, sort, pagination (`total_count`), save; cards cloned from the design's first card; URL keeps `?q=&city=&industry=` |
| `homeSidebar.ts` | home side widgets on real data: the student's profile card (counts, completeness from `core/profileCompleteness.ts`; removed for other roles), featured companies (most open jobs, follow), upcoming published events, mini-footer year |
| `jobDetail.ts` | job page: header, description, requirements + skills, perks, deadline, company widget, similar jobs, save, guest report, view count |
| `companyPage.ts` | company page: profile (`companies.profile`, type `CompanyProfile` in `core/models.ts`), real stats, open jobs, reviews, mentors, similar companies, follow, report |
| `applyDialog.ts` | minimal apply: CV picker, cover letter, screening questions → `apply_to_job` (full modal in Phase 6) |

**Data:** `jobs`, `companies`, `job_skills`, `screening_questions` (RLS: guests see only active, unexpired jobs), `saved_jobs` and `company_follows` (student), `reports` (guests allowed), `company_ratings` / `post_feed` views.

**Watch out**
- `search_jobs` is defined in migration `…10`; changing its arguments means dropping and recreating it (one function name only).
- `job-detail` / `company` also render in the recruiter workspace (`?workspace=employer`); `core/layout/workflow.ts` swaps the apply button there.
- The apply action is registered with `registerApply()` so core's generic "Ứng tuyển ngay" handling opens this dialog.
