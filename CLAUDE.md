# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internships.io is a Vietnamese internship platform for students, recruiters, universities, and admins. The repo has two parts:

- `frontend/` is the Vite app. It talks to Supabase through `core/supabase.ts` (auth, data, storage).
- `backend/supabase/` holds the Supabase schema (migrations, RLS, RPCs, storage, analytics). Permissions and business rules live there; the UI only hides what a user can't do.

`IMPLEMENTATION_PLAN.md` tracks the migration from the old localStorage demo; its "Progress" table says which phases are live. Phases 0–6 are done: accounts, roles, job discovery, company settings, posting, employer dashboard, admin moderation, student profile, CV builder, applying and My Applications use real data. The candidates board, messages, community and university pages still run on local demo data (`core/storage.ts`, `core/ui/actions.ts` → `record()`).

Environment: `.env.local` at the repo root holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (bundled) and `SUPABASE_SERVICE_ROLE_KEY` (scripts and tests only; never prefix it with `VITE_`). See `.env.example`. Vite reads it via `envDir` in `frontend/vite.config.js`. Demo accounts from `npm run db:seed` all use the password `Demo@2026`: `admin@`, `employer@`, `hr.vng@`, `design@`, `newco@`, `officer@`, `student@demo.internships.io`.

The UI copy is in Vietnamese, and the code and tests match on Vietnamese text, so keep labels exact when you edit them. Team ownership is in `README.md`; the parallel-work rules (shared files, storage-key/CSS/id prefixes, migrations, conflict recipes) are in `CONTRIBUTING.md`, and each `frontend/src/modules/<name>/README.md` lists that module's pages, files and storage keys. Keep those files current when you change a module.

## Commands

Run everything from the repo root (one `package.json`, one `node_modules`).

```bash
npm run dev        # Vite dev server for frontend/ on http://127.0.0.1:5173 (the tests expect this exact host/port)
npm run build      # tsc -p frontend type-check, then vite build to frontend/dist/
npm run preview    # serve the production build
npm run test:db    # PGlite: every migration + seed in-process, business-rule tests (no network)
npm run db:push    # push new migrations to the linked dev project (also db:new, db:migrations, db:link)
npm run db:types   # regenerate frontend/src/core/database.types.ts from the dev project
npm run db:seed    # idempotent demo accounts, companies and jobs (needs SUPABASE_SERVICE_ROLE_KEY)
```

No linter is configured. `npm run build` is the type-check gate (`strict` TS, `frontend/src/**/*.ts` only). The Supabase CLI isn't a dependency; the `db:*` scripts use `npx supabase --workdir backend`. The project link state lives in `backend/supabase/.temp/` (gitignored). Schema change workflow: new migration → `npm run test:db` → `npm run db:push` → `npm run db:types` → fix type errors.

**Database tests** (`backend/supabase/tests/`): `harness.mjs` boots PGlite with a small Supabase shim (roles, `auth.users`/`auth.uid()`, `storage.objects`, Supabase's default grants) and runs every migration. Helpers: `db.as(userId, fn)`, `db.q(userId, sql)`, `db.rpc(userId, name, args)` (null user = guest), `createUser`, `makeAdmin`, `verifiedCompany`, `activeJob`, `studentWithCv`. Add tests for every new RPC/column in the same PR.

### Tests

The browser tests are standalone Node scripts in `frontend/tests/` that drive Chromium through the `@playwright/test` library. They don't use the Playwright test runner, so `npx playwright test` won't find them. **Start `npm run dev` first**, because every script hits a running server, and **run `npm run db:seed` once** (they use the demo accounts and need `SUPABASE_SERVICE_ROLE_KEY`). If Chromium is missing, run `npx playwright install chromium`. They run against the dev Supabase project; anything they create uses throwaway `e2e-…@demo.internships.io` accounts that are deleted at the end.

| Command | Script | Covers |
|---|---|---|
| `npm run test:e2e` | `e2e/accounts.e2e.mjs`, `e2e/discovery.e2e.mjs`, `e2e/posting.e2e.mjs`, `e2e/apply.e2e.mjs` | Real-data flows: sign-up/login/guards/logout/admin login; search, filters, job and company pages, save, report; company → GPKD → verify → post → reject → resubmit → approve → apply, dashboard actions, live edit re-moderation; no-CV student → CV → apply → My Applications (RSVP, offer, withdraw), profile, public CV, job alerts |
| `npm test` | `smoke-test.mjs` | Every page in `frontend/src/design-manifest.json` as the right role: HTTP 200, `data-page`, broken images, mobile overflow, a few interactions |
| `npm run test:account` | `account-test.mjs` | Account menu on every signed-in page, notification preferences, saved jobs, logout, contextual menus |
| `npm run test:demo` | `demo-test.mjs` | Pages still on demo data: CV builder, candidate board, messages, community, university contact |
| `npm run test:admin` | `admin-test.mjs` | Real admin console: login rules, tabs, filters, HTML escaping (XSS) of reports, audit, mobile |
| `npm run test:design` | `design-system-test.mjs` | Token colors and radius on every page, no horizontal overflow at 390px |
| `npm run test:buttons` | `button-audit.mjs` | Clicks every visible non-header/footer button on every page (throwaway accounts) and fails on runtime errors |

- To run one test, run its script: `node frontend/tests/e2e/posting.e2e.mjs`.
- Sessions: `tests/session.mjs` signs in and injects the real Supabase session (`setSession(page, await demoSession('student'))`, `throwawayStudent()`, `throwawayEmployer()`, `roleFor(slug)`); `tests/e2e/helpers.mjs` has `login()`, `createUser()`, `service` (service-role client) and `cleanup()`. Wait for `body[data-ready="true"]` (`ready(page)`) before asserting.
- Never let a test change the seeded demo data (pause/close/duplicate jobs, preferences): use throwaway accounts.
- `APP_URL` overrides the base URL in the smoke, admin, demo, button-audit and e2e scripts. `AUDIT_PAGE=<slug> node frontend/tests/button-audit.mjs` audits only one page.
- Screenshots and `report.json` go to `test-results/` in the current directory, which is gitignored.

## Architecture

**Vite multi-page app, no framework.** The Vite root is `frontend/`. `frontend/vite.config.js` turns `index.html` plus every `pages/<name>/index.html` into a Rollup input, so a new directory under `frontend/pages/` is picked up automatically. Each page's `<body data-page="<slug>">` drives behavior. The home page's slug is `jobs`. Paths below are relative to `frontend/src/`.

**Core vs modules.**
- `core/` is shared by every page: `supabase.ts` (the one client, `publicUrl`/`signedUrl`, `Tables`/`Enums` types), `database.types.ts` (generated, never edit), `session.ts` (session + profile, `currentRole()`, `roleHome()`), `auth.ts` (guards), `errors.ts` (`unwrap`, `showError`, Vietnamese messages), `format.ts` (vi-VN dates, VND, status labels), `render.ts` (`cloneTemplate`, `stateBlock`, `el`), `accountApi.ts` (saved jobs, notifications, preferences), `navigation.ts`, `storage.ts`, `workspace.ts`, `forms.ts` (saveForm/restoreForm, `registerApply`), `report.ts` (reports to the DB), `models.ts`, `module.ts`, `ui/`, `layout/`, and `demo/demoShell.ts` (the generic button fallback).
- `modules/<name>/` holds one feature area each: `accounts`, `jobs`, `profile-cv`, `applications`, `recruiting`, `messages`, `community`, `university`, `admin`. Each one except `admin` exports a `FeatureModule` from `index.ts` with its `pages` and optional (possibly async) hooks. **Data access lives in the module's `api.ts`**; only `api.ts` files (plus `core/session.ts`, `core/accountApi.ts`, `core/report.ts`) import the Supabase client.
- Pages without a generated Tailwind file (company-settings, reset-password, applications, cv) use the shared `styles/platform.css` components (`ei-card`, `ei-field`, `ei-button`, `ei-chip`, `ei-banner`, `app-state`), loaded on every page by `main.ts`.
- **Dependency rule:** a module imports only from `core/` and from its own folder, never from another module. Shared things move into `core/`.

**Entry points.** All user-facing pages load `main.ts`. It awaits `initSession()`, then runs core and module hooks in a fixed order (each phase awaited): `setupAccess` → footer/sidebar/header → `setupNavigation` → `setupWorkflow` → modules' `shortcuts` → modules' `forms` → `setupGenericForms` → `setupAccount` → modules' `setup` → `prepareOptionButtons` → `markDecorativeIcons` → modules' `controls` → `setupCommonControls` → `startActions`, then sets `body[data-ready="true"]` (tests wait for it). `runPhase` calls a module's hook only when the current `data-page` is in its `pages`. The order matters: a module claims a button by `bind()`ing it in `controls`, and `setupCommonControls` skips anything already bound (`data-app-control`) and only touches buttons from the page's design HTML (marked `data-design-button` before modules run), so buttons modules create never get the generic fallback. For dialogs whose action can fail, pass `{ keepOpen: true }` to `dialog()`: errors thrown by the action show inside the dialog. The admin pages are separate. `pages/admin/` loads `modules/admin/admin.ts` and `pages/admin-login/` loads `modules/admin/adminLogin.ts`. Both use `data-page="admin"` and the normal Supabase session; only accounts with the `admin` role get in (`admin@demo.internships.io` / `Demo@2026` after seeding).

**The page HTML is exported static design markup, and TypeScript enhances it at runtime.**
- Tailwind is **precompiled per page** into `styles/generated/<page>.css`. There's no Tailwind or PostCSS config. A Tailwind class works on a page only if that page's generated CSS already contains it, so add new styling to the hand-written CSS instead.
- Each page links CSS in this order: `generated/<page>.css` → `app.css` → `tokens.css` → `design-system.css`, plus module CSS where needed (`modules/recruiting/candidates.css`, `modules/admin/admin.css`). `tokens.css` defines the `--ui-*` variables that new components should use. `design-system.css` overrides generated utilities scoped under `body[data-page]`. `test:design` asserts body background `rgb(246,248,251)`, text `rgb(36,49,87)`, and primary buttons `rgb(63,91,170)` with an 8px radius.
- `design/<page>-0.js` are the design export's vanilla page scripts. Markup uses `data-design-click="fn()"` attributes, and module `controls` hooks or `setupCommonControls` rebind some of them.
- The header (`core/layout/siteHeader.ts`), footer (`core/layout/siteFooter.ts`), recruiter sidebar, and mobile bottom nav are rendered or replaced at runtime. `siteFooter.ts` removes any static `<footer>` in the HTML, so edit footers there. `frontend/scripts/inject-footer.mjs` rewrites the static footers in all HTML files from `public/footer-template.html`.

**Much of the behavior is wired by matching visible text.** `setupNavigation()` (`core/navigation.ts`) rewrites every `a[href="#"]` by running its label through `destination()`, a list of Vietnamese regexes mapped to routes. Links with no match open a placeholder dialog. Modules and `setupCommonControls` also find buttons by label. Renaming visible text can silently change routing or break a feature.

**Demo action binding.** `core/ui/actions.ts` keeps a `WeakMap` of element → action. `bind(el, fn)` registers an action, and `startActions()` installs a **capture-phase** document click listener that calls `preventDefault` and `stopImmediatePropagation` before running it. A bound action therefore preempts every other handler on that element. The same file has shared helpers: `esc()` for HTML escaping (use it for any user-supplied data interpolated into `innerHTML`), `field()`, `record()`, `download()`, and others. `core/ui/feedback.ts` provides `dialog()` (a `<dialog>`-based form modal) and `toast()`.

**State.** Real data is in Supabase. `core/storage.ts` `read`/`write` (keys `internships:<key>`) remain for UI preferences, drafts (`form:<page>`) and the pages not migrated yet (`demo:<group>`). `core/report.ts` writes to the `reports` table when given a real target, and the admin console reads it from there. Logout (`signOut()`) keeps local drafts.

**Auth and roles** (`core/auth.ts`, `core/session.ts`). Roles come from `profiles.role`: `student`, `employer`, `university_officer`, `admin`; suspended or pending accounts have no role (BR-03). `pageRoles` maps private pages to allowed roles (profile/cv-builder/applications → student; employer/candidates/post-job/company-settings → employer; messages → both). Signed-out users are sent to `/pages/login/?next=…`; a wrong role is redirected to `roleHome()` with a flash message. `safeReturnPath()` validates `next` against a **hard-coded pathname allowlist regex**. Guests who click gated controls are also intercepted. `core/workspace.ts` decides whether a page renders in the recruiter workspace: always for employer/candidates/post-job/company-settings, and for messages/company/job-detail through `?workspace=employer` or the employer role. Links to jobs and companies use ids: `jobHref(id)`, `companyHref(id)` (`?id=<uuid>`). `workspaceHref()` carries that query param along.

**Backend.** `backend/supabase/migrations/` are timestamped SQL files applied in order. They're split by layer (types, tables, triggers, RPCs, RLS, storage, analytics, cron), not by module. Never edit a migration that has been pushed; add a new one with `npm run db:new -- <module>_<change>`.

### Adding a page

Update all of these:
1. Create `frontend/pages/<slug>/index.html` with `data-page="<slug>"`, its stylesheets, and `/src/main.ts`.
2. Add `<slug>` to the owning module's `pages` in `modules/<name>/index.ts`.
3. Add the route to `routes` in `core/navigation.ts`, and to `destination()` if text-based linking should reach it.
4. Add it to `frontend/src/design-manifest.json`, which drives the smoke and account tests.
5. If it should be login-gated, add it to `privatePages`. If it's a valid post-login redirect, add it to the `safeReturnPath` regex in `core/auth.ts`.
6. If it belongs to a workspace, update `core/workspace.ts` and the footer's `workspacePages` list in `core/layout/siteFooter.ts`.
