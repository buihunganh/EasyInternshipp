# jobs

**Owner:** _(name)_ · **Pages:** `jobs` (home, `/`), `job-detail`, `company` · **Diagrams:** DFD Process 3, Activity_Candidate_Apply

| File | What it does |
|---|---|
| `index.ts` | `setup` → job search on `jobs`; `controls` → job-detail title, company tabs |
| `jobSearch.ts` | filters, quick filters, sort, pagination, save job, lists jobs posted on post-job |
| `jobDetail.ts` | shows the job from `?job=<title>` |
| `companyPage.ts` | company page tabs (About / Jobs / Benefits / Reviews) |

**Storage:** reads `demo:jobs` (owned by recruiting, shape in `core/models.ts`); reads/writes `saved-jobs` (shared with core's bookmark button and the account menu).

**Uses from core:** `jobHref()` in `core/navigation.ts`, `apply()` in `core/forms.ts` (the "Ứng tuyển ngay" dialog is bound by core's generic controls).

**Watch out**
- `job-detail` and `company` also render in the recruiter workspace (`?workspace=employer`); `core/layout/workflow.ts` swaps "Ứng tuyển ngay" for "Quản lý ứng viên" there.
- The home page HTML is `frontend/index.html` (not under `pages/`).
