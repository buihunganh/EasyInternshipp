# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internships.io is an interactive demo of a Vietnamese internship platform for students, recruiters, universities, and admins. The repo has two parts:

- `frontend/` is the Vite app. All of its "persistence" is still browser `localStorage`/`sessionStorage`.
- `backend/supabase/` holds the Supabase schema (migrations, RLS, RPCs, storage, analytics). The frontend doesn't call it yet; `IMPLEMENTATION_PLAN.md` is the roadmap for wiring them together.

The UI copy is in Vietnamese, and the code and tests match on Vietnamese text, so keep labels exact when you edit them. Team ownership is in `README.md`; the parallel-work rules (shared files, storage-key/CSS/id prefixes, migrations, conflict recipes) are in `CONTRIBUTING.md`, and each `frontend/src/modules/<name>/README.md` lists that module's pages, files and storage keys. Keep those files current when you change a module.

## Commands

Run everything from the repo root (one `package.json`, one `node_modules`).

```bash
npm run dev        # Vite dev server for frontend/ on http://127.0.0.1:5173 (the tests expect this exact host/port)
npm run build      # tsc -p frontend type-check, then vite build to frontend/dist/
npm run preview    # serve the production build
npm run db:push    # npx supabase --workdir backend db push (also db:new, db:migrations, db:link)
```

No linter is configured. `npm run build` is the type-check gate (`strict` TS, `frontend/src/**/*.ts` only). The Supabase CLI isn't a dependency; the `db:*` scripts use `npx supabase --workdir backend`. The project link state lives in `backend/supabase/.temp/` (gitignored).

### Tests

The tests are standalone Node scripts in `frontend/tests/` that drive Chromium through the `@playwright/test` library. They don't use the Playwright test runner, so `npx playwright test` won't find them. **Start `npm run dev` first**, because every script hits a running server. If Chromium is missing, run `npx playwright install chromium`.

| Command | Script | Covers |
|---|---|---|
| `npm test` | `smoke-test.mjs` | Every page in `frontend/src/design-manifest.json`: HTTP 200, `data-page`, broken images, mobile overflow, basic persistence |
| `npm run test:account` | `account-test.mjs` | Account menu, preferences, saved jobs, logout, contextual menus |
| `npm run test:demo` | `demo-test.mjs` | End-to-end demo flows (register, apply, CV, post job, pipeline, messages, community) |
| `npm run test:admin` | `admin-test.mjs` | Admin login and moderation, including an HTML-escaping (XSS) check |
| `npm run test:design` | `design-system-test.mjs` | Token colors and radius on every page, no horizontal overflow at 390px |
| `npm run test:buttons` | `button-audit.mjs` | Clicks every visible non-header/footer button on every page and fails on runtime errors |

- To run one test, run its script: `node frontend/tests/demo-test.mjs`.
- `APP_URL` overrides the base URL in the smoke, admin, demo, and button-audit scripts. The account and design-system scripts hardcode `127.0.0.1:5173`.
- `AUDIT_PAGE=<slug> node frontend/tests/button-audit.mjs` audits only one page.
- Screenshots and `report.json` go to `test-results/` in the current directory, which is gitignored.
- Tests seed state directly, e.g. `localStorage['internships:demo-session'] = {"role":"student"}`.

## Architecture

**Vite multi-page app, no framework.** The Vite root is `frontend/`. `frontend/vite.config.js` turns `index.html` plus every `pages/<name>/index.html` into a Rollup input, so a new directory under `frontend/pages/` is picked up automatically. Each page's `<body data-page="<slug>">` drives behavior. The home page's slug is `jobs`. Paths below are relative to `frontend/src/`.

**Core vs modules.**
- `core/` is shared by every page: `auth.ts`, `navigation.ts`, `storage.ts`, `workspace.ts`, `forms.ts` (saveForm/restoreForm/apply), `report.ts`, `models.ts` (data shapes shared across modules), `module.ts` (the `FeatureModule` contract), `ui/` (`feedback.ts`, `menu.ts`, `actions.ts`), `layout/` (header, footer, recruiter sidebar, account menu, workflow), and `demo/demoShell.ts` (demo banner and the generic button fallback).
- `modules/<name>/` holds one feature area each: `accounts`, `jobs`, `profile-cv`, `recruiting`, `messages`, `community`, `university`, `admin`. Each one except `admin` exports a `FeatureModule` from `index.ts` with its `pages` and optional hooks.
- **Dependency rule:** a module imports only from `core/` and from its own folder, never from another module. Shared things move into `core/`.

**Entry points.** All user-facing pages load `main.ts`. It runs core and module hooks in a fixed order: `setupAccess` → footer/sidebar/header → `setupNavigation` → `setupWorkflow` → modules' `shortcuts` → modules' `forms` → `setupGenericForms` → `setupAccount` → modules' `setup` → `prepareOptionButtons` → `setupDemoNotice` → modules' `controls` → `setupCommonControls` → `startActions`. `runPhase` calls a module's hook only when the current `data-page` is in its `pages`. The order matters: a module claims a button by `bind()`ing it in `controls`, and `setupCommonControls` skips anything already bound (`data-app-control`). The admin pages are separate. `pages/admin/` loads `modules/admin/admin.ts` and `pages/admin-login/` loads `modules/admin/adminLogin.ts`. Both use `data-page="admin"` and a `sessionStorage` session (`modules/admin/adminSession.ts`). Demo admin credentials are `admin@example.com` / `AdminDemo2026!`.

**The page HTML is exported static design markup, and TypeScript enhances it at runtime.**
- Tailwind is **precompiled per page** into `styles/generated/<page>.css`. There's no Tailwind or PostCSS config. A Tailwind class works on a page only if that page's generated CSS already contains it, so add new styling to the hand-written CSS instead.
- Each page links CSS in this order: `generated/<page>.css` → `app.css` → `tokens.css` → `design-system.css`, plus module CSS where needed (`modules/recruiting/candidates.css`, `modules/admin/admin.css`). `tokens.css` defines the `--ui-*` variables that new components should use. `design-system.css` overrides generated utilities scoped under `body[data-page]`. `test:design` asserts body background `rgb(246,248,251)`, text `rgb(36,49,87)`, and primary buttons `rgb(63,91,170)` with an 8px radius.
- `design/<page>-0.js` are the design export's vanilla page scripts. Markup uses `data-design-click="fn()"` attributes, and module `controls` hooks or `setupCommonControls` rebind some of them.
- The header (`core/layout/siteHeader.ts`), footer (`core/layout/siteFooter.ts`), recruiter sidebar, and mobile bottom nav are rendered or replaced at runtime. `siteFooter.ts` removes any static `<footer>` in the HTML, so edit footers there. `frontend/scripts/inject-footer.mjs` rewrites the static footers in all HTML files from `public/footer-template.html`.

**Much of the behavior is wired by matching visible text.** `setupNavigation()` (`core/navigation.ts`) rewrites every `a[href="#"]` by running its label through `destination()`, a list of Vietnamese regexes mapped to routes. Links with no match open a placeholder dialog. Modules and `setupCommonControls` also find buttons by label. Renaming visible text can silently change routing or break a feature.

**Demo action binding.** `core/ui/actions.ts` keeps a `WeakMap` of element → action. `bind(el, fn)` registers an action, and `startActions()` installs a **capture-phase** document click listener that calls `preventDefault` and `stopImmediatePropagation` before running it. A bound action therefore preempts every other handler on that element. The same file has shared helpers: `esc()` for HTML escaping (use it for any user-supplied data interpolated into `innerHTML`), `field()`, `record()`, `download()`, and others. `core/ui/feedback.ts` provides `dialog()` (a `<dialog>`-based form modal) and `toast()`.

**State.** `core/storage.ts` `read`/`write` namespace keys as `internships:<key>`. Examples: `demo-session` (role), `applications`, `form:<page>`, `demo:<group>`, `demo:jobs` (shape in `core/models.ts`), `reports`. The admin panel imports user-submitted `reports` (written by `core/report.ts`) from `localStorage`. Logout clears the session but keeps form data.

**Auth and roles** (`core/auth.ts`). Valid roles are `student`, `candidate`, `recruiter`, `employer`, and `university`. `privatePages` (messages, profile, cv-builder, employer, candidates, post-job) hide the body and redirect to `/pages/login/?next=…`. `safeReturnPath()` validates `next` against a **hard-coded pathname allowlist regex**. Guests who click gated controls are also intercepted. `core/workspace.ts` decides whether a page renders in the recruiter workspace: always for employer/candidates/post-job, and for messages/company/job-detail through `?workspace=employer` or a recruiter role. `workspaceHref()` carries that query param along.

**Backend.** `backend/supabase/migrations/` are timestamped SQL files applied in order. They're split by layer (types, tables, triggers, RPCs, RLS, storage, analytics, cron), not by module. Never edit a migration that has been pushed; add a new one with `npm run db:new -- <module>_<change>`.

### Adding a page

Update all of these:
1. Create `frontend/pages/<slug>/index.html` with `data-page="<slug>"`, its stylesheets, and `/src/main.ts`.
2. Add `<slug>` to the owning module's `pages` in `modules/<name>/index.ts`.
3. Add the route to `routes` in `core/navigation.ts`, and to `destination()` if text-based linking should reach it.
4. Add it to `frontend/src/design-manifest.json`, which drives the smoke and account tests.
5. If it should be login-gated, add it to `privatePages`. If it's a valid post-login redirect, add it to the `safeReturnPath` regex in `core/auth.ts`.
6. If it belongs to a workspace, update `core/workspace.ts` and the footer's `workspacePages` list in `core/layout/siteFooter.ts`.
