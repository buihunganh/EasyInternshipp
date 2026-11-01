# recruiting

**Owner:** _(name)_ · **Pages:** `employer`, `post-job` (`?id=` to edit), `company-settings`, `candidates` (all employer-only, recruiter workspace) · **Diagrams:** DFD Processes 3 & 5, Sequence_Employer_Recruitment_ATS, Activity_Employer_Recruitment

| File | What it does |
|---|---|
| `index.ts` | `shortcuts`; `controls` → dashboard / posting / company settings / candidates |
| `api.ts` | company (create, update, logo/cover, documents, verification, members), jobs (list, stats, lifecycle RPCs, save, skills, questions), today's interviews |
| `dashboard.ts` | employer dashboard: KPIs, status tabs, job cards with pause / resume / close / duplicate / delete / submit, CSV export, today's interviews |
| `posting.ts` | post-job form → draft insert/update, `ensure_skill` skills, screening questions + answer keys, `submit_job`, rejection reason, live-edit warning, live preview, quality score |
| `companySettings.ts` + `company-settings.css` | create/edit company, page content (`companies.profile`), GPKD upload + `submit_company_verification`, team members |
| `pipeline.ts` + `candidates.css` | candidate board — **still demo data** (Phase 7) |
| `shortcuts.ts` | "Xem CV" preview, "Chat 1-1", applicant links |

**Data:** `companies`, `company_members`, `company_documents` (+ storage `company-documents/<company_id>/`, `company-assets/<company_id>/`), `jobs`, `job_skills`, `screening_questions` / `screening_question_keys`, `applications` (counts), RPC `company_interviews`.

**Watch out**
- Only verified companies can submit jobs (BR-08). Unverified employers can still save drafts.
- Editing title / description / benefits / stipend of a live job sends it back to moderation (BR-16, database trigger).
- Screening questions are replaced on save only while the job has no applications (answers would be lost otherwise).
- Post-job maps the design's controls to columns: work mode → `work_type` + `schedule`, department → `department` + `industry_id`, student years → `target_study_years` (5 = recently graduated). The "partner university" block is hidden until Phase 10.
