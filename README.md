# Internships.io (EasyInternshipp)

A Vietnamese internship platform for students, recruiters, universities and admins.

```
EasyInternshipp/
├── frontend/                 Vite multi-page app (vanilla TypeScript)
│   ├── index.html            home page (data-page="jobs")
│   ├── pages/<slug>/         one folder per page (URL = /pages/<slug>/)
│   ├── public/               static assets (images, footer template)
│   ├── src/
│   │   ├── main.ts           bootstrap: renders the shell, runs each module's hooks
│   │   ├── core/             shared code every module may use (see below)
│   │   ├── modules/<name>/   one folder per feature module, each owned by one person
│   │   ├── styles/           global CSS (tokens, design system) + generated per-page Tailwind
│   │   └── design/           exported design scripts (generated, don't edit by hand)
│   ├── tests/                Playwright scripts (need `npm run dev` running)
│   └── scripts/              maintenance scripts (inject-footer)
├── backend/                  see backend/README.md
│   └── supabase/             Supabase project: config.toml, migrations/, seed.sql
├── diagrams/                 UML / DFD / use-case diagrams (draw.io)
└── IMPLEMENTATION_PLAN.md    roadmap: localStorage demo → Supabase
```

## Getting started

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # type-check + production build (the gate before every PR)
```

Tests run against the dev server, so start `npm run dev` first:

```bash
npm test             # smoke test, every page
npm run test:account # account menu, saved jobs, logout
npm run test:demo    # end-to-end flows
npm run test:admin   # admin moderation
npm run test:design  # design tokens, 390px overflow
npm run test:buttons # clicks every button, fails on runtime errors
```

Backend (Supabase CLI through `npx`, run from the repo root):

```bash
npm run db:new -- <name>   # new migration in backend/supabase/migrations/
npm run db:push            # apply pending migrations to the linked project
npm run db:migrations      # local vs remote migration status
npm run db:link -- --project-ref <ref>
```

## Modules and ownership

Each frontend module lives in `frontend/src/modules/<name>/` and owns its pages. Fill in the owner column.

| Module | Pages (`data-page`) | Covers | Diagrams | Owner |
|---|---|---|---|---|
| `accounts` | login, register | sign-in, sign-up, password reset | Process 1, Sequence_User_Authentication | |
| `profile-cv` | profile, cv-builder | student profile, CV builder | Process 2 | |
| `jobs` | jobs (home), job-detail, company | search, job detail, company page | Process 3, Activity_Candidate_Apply | |
| `recruiting` | employer, candidates, post-job | employer dashboard, ATS pipeline, posting jobs | Processes 3 & 5, Sequence_Employer_Recruitment_ATS | |
| `messages` | messages | conversations | Process 6, Sequence_Direct_Messaging | |
| `community` | community | posts, comments, reviews, reports | Process 7 | |
| `university` | university | partner universities, events, inquiries | UseCase_University | |
| `admin` | admin, admin-login | moderation, users, reports, audit | Process 9, Sequence_Job_Posting_Moderation | |
| `core` (shared) | all | header, footer, navigation, auth guard, dialogs, generic buttons | | whole team, reviewed by lead |
| `backend` | – | database schema, RLS, RPCs, storage, analytics | Class_Diagram, all DFDs | |

### What a module looks like

```
modules/recruiting/
├── index.ts         the module's public entry: a FeatureModule (pages + hooks)
├── pipeline.ts      employer dashboard + candidate board
├── posting.ts       post-job editor
├── shortcuts.ts     click shortcuts (Xem CV, Chat 1-1)
└── candidates.css   styles only this module uses
```

`index.ts` exports a `FeatureModule` (defined in `core/module.ts`):

```ts
export const recruiting: FeatureModule = {
  pages: ['employer', 'candidates', 'post-job'],
  shortcuts: setupRecruitingShortcuts,   // 1. capture-phase redirects
  forms: page => { ... },                // 2. form wiring, restore drafts
  setup: page => { ... },                // 3. main behaviour
  controls: page => { ... },             // 4. bind() buttons before core's generic fallback
};
```

`main.ts` runs each hook only on the module's own pages, in the order above. You normally
never edit `main.ts`; add behaviour inside your module's hooks.

### Rules that keep modules independent

**Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first PR.** It covers the git workflow, which files
are shared, storage-key and CSS prefixes, migrations, and how to resolve conflicts. In short:

1. A module imports from `core/` and from itself only, never from another module.
2. Shared-file changes (`core/`, global CSS, `main.ts`, `package.json`) go in their own small PR.
3. New storage keys, CSS classes, ids and migrations start with your module name.
4. Visible Vietnamese labels drive routing, so run `npm run test:buttons` after changing text.
5. Each module folder has a `README.md` (pages, files, storage keys). Keep yours current.

### Adding a page

1. `frontend/pages/<slug>/index.html` with `data-page="<slug>"`, the stylesheets, and `/src/main.ts`.
2. Add `<slug>` to your module's `pages` in `modules/<name>/index.ts`.
3. Add the route to `routes` in `core/navigation.ts` (and to `destination()` if text links should reach it).
4. Add it to `frontend/src/design-manifest.json` (drives the smoke and account tests).
5. Login-gated? Add to `privatePages` and, if it's a valid post-login redirect, the `safeReturnPath` regex in `core/auth.ts`.
6. Recruiter workspace page? Update `core/workspace.ts` and `workspacePages` in `core/layout/siteFooter.ts`.

### Adding a module

1. Create `frontend/src/modules/<name>/index.ts` exporting a `FeatureModule`.
2. Import it in `frontend/src/main.ts` and add it to the `modules` array.
3. Add a `README.md` in the module folder (copy another module's) and a row to the table above.

## Branches

One branch per task (`feat/<module>-<topic>`), rebased on `main` daily, small PRs, squash-merged.
Details in [CONTRIBUTING.md](CONTRIBUTING.md).
