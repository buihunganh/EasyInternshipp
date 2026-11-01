# applications

**Owner:** _(name)_ · **Pages:** `applications` (student-only; `?id=<application>` opens one, `?tab=saved|alerts`) · **Diagrams:** DFD Level 2 Application, Activity_Candidate_Apply, Sequence_Candidate_Apply

| File | What it does |
|---|---|
| `index.ts` | `controls` → `setupApplicationsPage` |
| `api.ts` | my applications (+ job, company, interviews, offers, answers), status history, `withdraw_application`, `respond_interview`, `respond_offer`, offer letter signed URL, job alerts CRUD |
| `applicationsPage.ts` | tabs: applications (status chips, "NTD đã xem CV", timeline, interview RSVP, offer accept/decline, withdraw while under review), saved jobs, job alerts |
| `applications.css` | page layout, application status chip colours |

**Data:** `applications`, `application_status_history`, `interviews`, `offers`, `application_answers` (RLS: the student sees their own), `saved_jobs` (via `core/accountApi.ts`), `job_alerts` (`student_id` comes from its column default; don't send it).

**Watch out**
- The apply dialog itself lives in the jobs module (`jobs/applyDialog.ts`).
- Notification links for students point here (migration `…11_applications_links`).
- Withdrawal is only allowed before an offer (BR-27); the button is shown only for `applied`, `cv_viewed`, `shortlisted`, `interviewing`.
- Submitting an internship report for hired roles is Phase 10.
