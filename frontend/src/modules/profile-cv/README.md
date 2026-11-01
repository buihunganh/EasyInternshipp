# profile-cv

**Owner:** _(name)_ · **Pages:** `profile`, `cv-builder` (student-only), `cv` (public, `?slug=`) · **Diagrams:** DFD Process 2

| File | What it does |
|---|---|
| `index.ts` | `controls` → profile page / CV builder / public CV (awaited) |
| `api.ts` | profile + student profile + skills, avatar upload, verification request, recent applications, CVs (list, save, default, public, PDF upload, delete), public CV by slug |
| `profilePage.ts` | profile: header, contact links, about, education, projects & activities (from the default CV), skills (add/remove), completeness meter, default CV attachment, recent applications, edit dialog, verification request |
| `cvBuilder.ts` | the design's editor + live A4 preview saved as typed `CvContent` (`core/models.ts`) in `cvs.content`; toolbar for several CVs (`?id=`, `?id=new`), default, public link, PDF upload, delete; local draft per CV; `?return=` goes back to the job after creating a CV |
| `publicCv.ts` | `/pages/cv/?slug=`: renders a public CV (`cvSheetHTML`) and prints it |
| `profile-cv.css` | public CV page, builder toolbar, profile skill chips |

**Data:** `profiles`, `student_profiles` (incl. `is_discoverable`), `student_skills` (+ `ensure_skill`), `cvs`; storage `avatars/<uid>/`, `cvs/<uid>/`. Applying freezes `cvs.content` into `applications.cv_snapshot`, which recruiters read in Phase 7, so keep `CvContent` backward compatible.

**Storage (browser):** `internships:cv-draft:<cvId>` (or `:new`) holds unsaved CV edits.

**Watch out**
- A CV saved by the builder keeps its raw editor state in `content.editor`. CVs without it (seeded or new) are filled from the structured fields and the profile, and the design's sample tags / certificates are dropped.
- Removed sample items are remembered by button index (`tag-<n>`, `certificate-<n>`): don't insert buttons into the builder's `<main>` before `setupCvBuilder` runs.
- Changing university or MSSV resets verification (database trigger).
