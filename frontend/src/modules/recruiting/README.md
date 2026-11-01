# recruiting

**Owner:** _(name)_ · **Pages:** `employer`, `candidates`, `post-job` (all login-gated, recruiter workspace) · **Diagrams:** DFD Processes 3 & 5, Sequence_Employer_Recruitment_ATS, Activity_Employer_Recruitment

| File | What it does |
|---|---|
| `index.ts` | `shortcuts`, `forms` (restore post-job draft), `controls` (pipeline or posting) |
| `pipeline.ts` | employer dashboard (job list, statuses) and candidate board (stages, evaluate, interview, offer, CSV) |
| `posting.ts` | post-job editor: save draft, publish, edit |
| `shortcuts.ts` | "Xem CV" preview, "Chat 1-1", applicant links on the dashboard |
| `candidates.css` | candidate board styles, linked from `pages/candidates/index.html` |

**Storage:** owns `demo:jobs` (shape `DemoJob` in `core/models.ts`, also read by jobs), `demo:editing-job`, `demo:job-description`, `demo:pipeline`, `demo:stages`; writes `demo:offers`, `demo:appointments`, `demo:outbox` through core's `record()`.

**Watch out**
- Changing `DemoJob` changes the jobs module too: do it in a core PR and tell the jobs owner.
- The recruiter sidebar and workspace links live in core (`core/layout/recruiterSidebar.ts`, `core/workspace.ts`).
- `messages`, `company` and `job-detail` can also open in the recruiter workspace, but other modules own them.
