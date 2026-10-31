# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internships.io is a frontend-only interactive demo of a Vietnamese internship platform for students, recruiters, universities, and admins. There's no backend: all "persistence" is browser `localStorage`/`sessionStorage`. The UI copy is in Vietnamese, and the code and tests match on Vietnamese text, so keep labels exact when you edit them.

## Commands

```bash
npm run dev        # Vite dev server on http://127.0.0.1:5173 (the tests expect this exact host/port)
npm run build      # tsc --noEmit type-check, then vite build to dist/
npm run preview    # serve the production build
```

No linter is configured. `npm run build` is the type-check gate (`strict` TS, `src/**/*.ts` only).

### Tests

The tests are standalone Node scripts that drive Chromium through the `@playwright/test` library. They don't use the Playwright test runner, so `npx playwright test` won't find them. **Start `npm run dev` first**, because every script hits a running server. If Chromium is missing, run `npx playwright install chromium`.

| Command | Script | Covers |
|---|---|---|
| `npm test` | `scripts/smoke-test.mjs` | Every page in `src/design-manifest.json`: HTTP 200, `data-page`, broken images, mobile overflow, basic persistence |
| `npm run test:account` | `scripts/account-test.mjs` | Account menu, preferences, saved jobs, logout, contextual menus |
| `npm run test:demo` | `scripts/demo-test.mjs` | End-to-end demo flows (register, apply, CV, post job, pipeline, messages, community) |
| `npm run test:admin` | `scripts/admin-test.mjs` | Admin login and moderation, including an HTML-escaping (XSS) check |
| `npm run test:design` | `scripts/design-system-test.mjs` | Token colors and radius on every page, no horizontal overflow at 390px |
| (no npm alias) | `node scripts/button-audit.mjs` | Clicks every visible non-header/footer button on every page and fails on runtime errors |

- To run one test, run its script: `node scripts/demo-test.mjs`.
- `APP_URL` overrides the base URL in the smoke, admin, demo, and button-audit scripts. The account and design-system scripts hardcode `127.0.0.1:5173`.
- `AUDIT_PAGE=<slug> node scripts/button-audit.mjs` audits only one page.
- Screenshots and `report.json` go to `test-results/`, which is gitignored.
- Tests seed state directly, e.g. `localStorage['internships:demo-session'] = {"role":"student"}`.

## Architecture

**Vite multi-page app, no framework.** `vite.config.js` turns `index.html` plus every `pages/<name>/index.html` into a Rollup input, so a new directory under `pages/` is picked up automatically. Each page's `<body data-page="<slug>">` drives behavior. The home page's slug is `jobs`.

**Entry points.** All user-facing pages load `src/main.ts`. It reads `document.body.dataset.page` and calls the `setup*`/`render*` functions in a fixed order: access check → footer/sidebar/header → navigation → workflow/forms/account → page-specific features → `setupDemo` → `startActions`. The admin pages are separate. `pages/admin/` loads `src/features/admin.ts` and `pages/admin-login/` loads `src/features/adminLogin.ts`. Both use `data-page="admin"` and a `sessionStorage` session (`src/lib/adminSession.ts`). Demo admin credentials are `admin@example.com` / `AdminDemo2026!`.

**The page HTML is exported static design markup, and TypeScript enhances it at runtime.**
- Tailwind is **precompiled per page** into `src/styles/generated/<page>.css`. There's no Tailwind or PostCSS config. A Tailwind class works on a page only if that page's generated CSS already contains it, so add new styling to the hand-written CSS instead.
- Each page links CSS in this order: `generated/<page>.css` → `app.css` → `tokens.css` → `design-system.css`. `tokens.css` defines the `--ui-*` variables that new components should use. `design-system.css` overrides generated utilities scoped under `body[data-page]`. `test:design` asserts body background `rgb(246,248,251)`, text `rgb(36,49,87)`, and primary buttons `rgb(63,91,170)` with an 8px radius.
- `src/features/design/<page>-0.js` are the design export's vanilla page scripts. Markup uses `data-design-click="fn()"` attributes, and `src/features/demo.ts` rebinds some of them.
- The header (`siteHeader.ts`), footer (`siteFooter.ts`), recruiter sidebar, and mobile bottom nav are rendered or replaced at runtime. `siteFooter.ts` removes any static `<footer>` in the HTML, so edit footers there. `scripts/inject-footer.mjs` rewrites the static footers in all HTML files from `public/footer-template.html`.

**Much of the behavior is wired by matching visible text.** `setupNavigation()` (`src/lib/navigation.ts`) rewrites every `a[href="#"]` by running its label through `destination()`, a list of Vietnamese regexes mapped to routes. Links with no match open a placeholder dialog. Demo features also find buttons by label. Renaming visible text can silently change routing or break a feature.

**Demo action binding.** `src/features/demo/ui.ts` keeps a `WeakMap` of element → action. `bind(el, fn)` registers an action, and `startActions()` installs a **capture-phase** document click listener that calls `preventDefault` and `stopImmediatePropagation` before running it. A bound action therefore preempts every other handler on that element. The same file has shared helpers: `esc()` for HTML escaping (use it for any user-supplied data interpolated into `innerHTML`), `field()`, `record()`, `download()`, and others. `src/components/feedback.ts` provides `dialog()` (a `<dialog>`-based form modal) and `toast()`.

**State.** `src/lib/storage.ts` `read`/`write` namespace keys as `internships:<key>`. Examples: `demo-session` (role), `applications`, `form:<page>`, `demo:<group>`, `reports`. The admin panel imports user-submitted community `reports` from `localStorage`. Logout clears the session but keeps form data.

**Auth and roles** (`src/lib/auth.ts`). Valid roles are `student`, `candidate`, `recruiter`, `employer`, and `university`. `privatePages` (messages, profile, cv-builder, employer, candidates, post-job) hide the body and redirect to `/pages/login/?next=…`. `safeReturnPath()` validates `next` against a **hard-coded pathname allowlist regex**. Guests who click gated controls are also intercepted. `src/lib/workspace.ts` decides whether a page renders in the recruiter workspace: always for employer/candidates/post-job, and for messages/company/job-detail through `?workspace=employer` or a recruiter role. `workspaceHref()` carries that query param along.

### Adding a page

Update all of these:
1. Create `pages/<slug>/index.html` with `data-page="<slug>"`, its stylesheets, and `/src/main.ts`.
2. Add the route to `routes` in `src/lib/navigation.ts`, and to `destination()` if text-based linking should reach it.
3. Add it to `src/design-manifest.json`, which drives the smoke and account tests.
4. If it should be login-gated, add it to `privatePages`. If it's a valid post-login redirect, add it to the `safeReturnPath` regex in `src/lib/auth.ts`.
5. If it belongs to a workspace, update `src/lib/workspace.ts` and the footer's `workspacePages` list.
