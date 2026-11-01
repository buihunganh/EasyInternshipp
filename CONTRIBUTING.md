# Working on modules in parallel

How the team works on separate modules at the same time so that merging into `main` is painless.
Read [README.md](README.md) first for the folder layout and the module list.

**The short version**

1. Work only inside your module folder. Changes to shared files go in their own small PR.
2. Sync with `main` every day (`git pull --rebase origin main`), not once at the end.
3. Use your module's prefix for storage keys, CSS classes, element ids and migration names.
4. Before opening a PR: rebase, `npm run build`, run the tests, and look at your own diff.
5. Keep PRs small and merge them within a day or two. Long-lived branches cause most conflicts.

---

## 1. One-time setup (each teammate)

```bash
git config pull.rebase true        # `git pull` rebases instead of creating merge commits
git config rerere.enabled true     # git remembers how you resolved a conflict and reuses it
git config core.autocrlf true      # Windows. On macOS/Linux use: git config core.autocrlf input
npm install
npx playwright install chromium    # for the tests
```

Turn off "format on save" for files you don't own, or limit your editor's formatter to your module
folder. Re-indenting someone else's file rewrites every line and guarantees a conflict.

## 2. What you can edit

| Area | Who edits it | How |
|---|---|---|
| `frontend/src/modules/<your-module>/**` | You | Freely |
| Your pages: `frontend/pages/<your-page>/index.html` | You | Freely, but keep visible labels exact (see §5.4) |
| `frontend/src/core/**` | Anyone, carefully | Separate small PR, reviewed by one other person (§4) |
| `frontend/src/main.ts` | Only when adding a module | Add one import line and one array line |
| `frontend/src/styles/*.css` (`app.css`, `tokens.css`, `design-system.css`, `demo.css`) | Anyone, carefully | Separate PR. Put module styles in your module folder instead (§5.2) |
| `frontend/src/styles/generated/**`, `frontend/src/design/**` | Nobody | Generated design export. Never edit by hand |
| `frontend/src/design-manifest.json` | When adding a page | One line per page, add at the end |
| `frontend/tests/**` | Anyone | Add new checks at the end of a script, or in a new script |
| `backend/supabase/migrations/**` | Anyone | Only add new files, never edit existing ones (§6) |
| `package.json`, `package-lock.json` | Tell the team first | §7 |
| Another module's folder | Its owner | Ask them, or open a PR and have them review it |

## 3. Daily git workflow

### Branches

```
main                          always green: builds and passes tests
feat/<module>-<topic>         your work, e.g. feat/recruiting-offers, feat/community-comments
fix/<module>-<topic>          bug fixes
core/<topic>                  changes to shared code, e.g. core/route-applications
```

One branch per task. Branch from an up-to-date `main`:

```bash
git switch main && git pull
git switch -c feat/jobs-filters
```

### Commits

Start every commit message with the module so history is easy to scan:

```
jobs: add salary filter
recruiting: move candidate to interview stage
core: add applications route
backend: recruiting_offer_expiry migration
```

Commit only your own files. Check with `git status` before `git add`, and never use `git add -A`
blindly. Stray changes to shared files sneak in that way.

### Stay in sync every day

```bash
git fetch origin
git rebase origin/main     # replay your commits on top of the latest main
```

If you already pushed your branch, push again with `git push --force-with-lease` after a rebase. Never
use plain `--force`, and never rebase `main` itself.

Small, daily rebases mean small conflicts you understand. One big rebase after two weeks means
conflicts in code you've forgotten.

### Pull requests

- Aim for under ~400 changed lines. Split big features: data first, then UI, then polish.
- The PR title uses the same prefix as commits: `recruiting: interview scheduling`.
- In the description, list any shared file you touched and why.
- Use **Squash and merge**, so each PR becomes one commit on `main`.
- Delete the branch after merging.

## 4. Changing shared code (`core/`) safely

Every page imports `core/`, so a core change can break modules you've never seen.

1. **Separate PR.** Don't mix a core change into a feature PR. Open `core/<topic>`, get it merged,
   then rebase your feature branch on it.
2. **Add, don't change.** Add a new function or an optional parameter instead of changing an existing
   signature. If you must change behaviour, search for every caller first:
   `grep -rn "functionName" frontend/src`.
3. **Append to lists.** Most conflicts in core happen in lists everyone edits. Add new entries **on their
   own line at the end** of the list:

   | File | List | Notes |
   |---|---|---|
   | `core/navigation.ts` | `routes` | one key per route |
   | `core/navigation.ts` | `destination()` | **order matters**: the first matching regex wins. Put specific patterns before general ones and test the labels you care about |
   | `core/auth.ts` | `privatePages` and the `safeReturnPath` regex | the regex is one line; coordinate if two people add pages the same week |
   | `core/workspace.ts` | recruiter pages | |
   | `core/layout/siteFooter.ts` | `workspacePages` | |
   | `core/models.ts` | shared types | one type per block |
   | `src/main.ts` | `modules` array and imports | one per line |
   | `design-manifest.json` | pages | one line per page |

4. **Shared types go in `core/models.ts`.** If your module needs another module's data shape, move the
   type there in a core PR. Don't import from the other module.
5. **Run all the tests.** A core PR runs the full suite (§8), not only your pages' tests.

## 5. Conflicts git can't see

These merge cleanly in git and then break at runtime. They're the important ones.

### 5.1 Storage keys

All data lives in `localStorage` under `internships:<key>` (`core/storage.ts`). Two modules writing the
same key silently overwrite each other.

- **New keys must start with your module name:** `recruiting:offers`, `community:drafts`.
- Existing keys keep their names. If you need a key another module owns, agree with its owner and
  move the shape (and a read/write helper, if useful) into `core/models.ts`, as was done for `demo:jobs`.

Current keys and their owners:

| Key(s) | Owner | Also used by |
|---|---|---|
| `demo-session` | core (`auth.ts`) | accounts writes it on sign-in |
| `applications`, `application-details` | core (`forms.ts` → `apply()`) | account menu |
| `saved-jobs` | core (generic bookmark), account menu | jobs |
| `form:<page>` | core (`saveForm` / `restoreForm`) | |
| `reports` | core (`report.ts`) | admin reads; messages and community write |
| `notification-settings`, `job-alert` | core | |
| `demo:outbox`, `demo:appointments`, `demo:inquiries`, `demo:offers` | core (`ui/actions.ts` → `record()`) | university, recruiting |
| `demo:jobs` (shape in `core/models.ts`) | recruiting | jobs |
| `demo:editing-job`, `demo:job-description`, `demo:pipeline`, `demo:stages` | recruiting | |
| `demo:cv-*`, `demo:avatar` | profile-cv | |
| `demo:chat:*` | messages | |
| `demo:posts`, `demo:comments:*`, `demo:like:*`, `demo:save-post:*`, `saved-post:*` | community | |
| `admin:v1` (sessionStorage `internships:admin-session`) | admin | |

Update this table in the same PR when you add a key.

### 5.2 CSS

- Styles only your pages use go in **your module folder** (for example `modules/recruiting/candidates.css`),
  linked from your page's HTML after `design-system.css`:
  ```html
  <link rel="stylesheet" href="/src/modules/<module>/<file>.css">
  ```
  Don't `import` CSS from a module's TypeScript. `main.ts` imports every module, so that CSS would load on
  every page.
- **Prefix new class names** with your module: `.recruiting-offer-card`, `.community-composer`.
  An unprefixed `.card` or `.badge` will collide with someone else's eventually.
- Use the `--ui-*` variables from `styles/tokens.css` for colours, radius and spacing. Don't hard-code values.
- Tailwind classes only work if they're already in `styles/generated/<page>.css`. Don't add new ones.
- `npm run test:design` checks body colours, primary buttons and 390px overflow on every page.

### 5.3 Element ids and dialogs

Ids have to be unique per page. Elements you create at runtime (dialogs, menus, toasts) share the page
with core's elements. Prefix new ids: `recruiting-offer-dialog`. Use `dialog()` and `toast()` from
`core/ui/feedback.ts` instead of building your own modal.

### 5.4 Visible labels drive behaviour

Many buttons and links are wired by their **Vietnamese text**, not by an id:

- `core/navigation.ts` → `destination()` maps link labels to pages.
- `core/demo/demoShell.ts` → `setupCommonControls()` gives unbound buttons a behaviour based on their label or icon.
- `core/auth.ts` blocks guests based on labels such as "Ứng tuyển ngay" and "Theo dõi".

So renaming "Quản lý ứng viên" to "Ứng viên" in your HTML can change where a link goes, on your page or
on others. After changing any visible text, run `npm run test:buttons` (or
`AUDIT_PAGE=<slug> node frontend/tests/button-audit.mjs` for one page).

### 5.5 Claiming a button

To give a button your own behaviour, `bind()` it (from `core/ui/actions.ts`) in your module's **`controls`**
hook. Core's generic fallback runs after `controls` and skips anything already bound. Don't add a raw
`addEventListener('click')` to a button that core may also bind: `bind()` actions run in a capture-phase
listener that stops other handlers.

### 5.6 Global listeners

Listeners on `document` or `window` run on every page where your hook runs. `runPhase` only calls your
hooks on your own `pages`, so keep listeners inside hooks, never at the top level of a module file.

## 6. Backend migrations

Migrations are timestamped files applied in order (`backend/supabase/migrations/`). Rules:

1. **Never edit a migration that has been pushed** to any Supabase project. Fix it with a new migration.
2. **Create files with the CLI** so the timestamp is right, named with your module:
   ```bash
   npm run db:new -- recruiting_offer_expiry
   ```
3. **One change per migration.** It's easier to review and to order.
4. **Two branches with migrations.** Whoever merges second checks that their migration's timestamp is later
   than the newest one on `main`. If it isn't, rename the file (`git mv`) to a newer timestamp before
   merging. Also check you don't both `alter` the same table or redefine the same function. If you do, the
   second migration must build on the first.
5. **Only push to the shared dev project from `main`**, after the PR merges. Test on a branch against the
   test project or locally.
6. **Generated types** (`frontend/src/core/database.types.ts`, once it exists): never hand-merge it. On a
   conflict, take either side, then regenerate it from the merged schema and commit the result.

## 7. Dependencies (`package.json`, `package-lock.json`)

- Ask in the team chat before adding a dependency. Most features don't need one.
- Install with `npm install <pkg>` so the lockfile updates. Never edit the lockfile by hand.
- **Lockfile conflict:** don't merge it line by line. Resolve `package.json` by hand (keep both sides'
  dependencies), then rebuild the lockfile from `main`'s copy:
  ```bash
  git checkout origin/main -- package-lock.json   # start from main's lockfile
  npm install                                     # adds your dependencies on top
  git add package.json package-lock.json
  ```

## 8. Before opening a PR

```bash
git fetch origin && git rebase origin/main
npm run build                      # type-check + build: must pass
npm run dev                        # in another terminal; the tests need it
npm test                           # smoke, every page
npm run test:buttons               # if you changed any button, link or label
npm run test:demo                  # if your module has a flow there (apply, CV, post job, pipeline, messages, community)
npm run test:account               # if you touched the header, account menu or saved jobs
npm run test:design                # if you changed CSS
npm run test:admin                 # admin module
git diff origin/main --stat        # only files you meant to change?
```

Changed `core/`? Run every test above.

Checklist:

- [ ] Only my module's files changed, or shared files are listed in the PR description
- [ ] New storage keys, CSS classes and ids use my module prefix, and §5.1 is updated
- [ ] No imports from another module: `grep -rnE "from '../[a-z-]+['/]" frontend/src/modules/<mine>` prints nothing
- [ ] My module's `README.md` is up to date (pages, files, keys)
- [ ] Visible labels unchanged, or `test:buttons` passes
- [ ] Migrations are new files only, named `<module>_…`

## 9. Resolving a conflict

```bash
git rebase origin/main
# CONFLICT in some/file.ts
git status                         # lists the conflicted files
# edit the file and keep both sides where both make sense
git add some/file.ts
git rebase --continue              # or `git rebase --abort` to go back and ask for help
```

Recipes for the files that conflict most:

| File | Resolution |
|---|---|
| A list in core (`routes`, `privatePages`, `modules`, manifest) | Keep **both** entries. Make sure commas are right |
| `destination()` in `core/navigation.ts` | Keep both regexes and think about order (first match wins) |
| The `safeReturnPath` regex | Combine both page names into the one alternation |
| `package-lock.json` | Don't hand-merge. Regenerate it (§7) |
| `database.types.ts` | Don't hand-merge. Regenerate it (§6) |
| Generated CSS or design scripts | Take `main`'s version. Nobody should have edited them |
| Another module's file | Stop and ask its owner |
| Migration with the same timestamp or table | Rename yours to a later timestamp and rebase your SQL on theirs |

After resolving: `npm run build` and the relevant tests again before pushing.

## 10. Branches started before the module refactor

If your branch was cut from `main` before the `frontend/` / `backend/` reorganisation, git follows most
renames during a rebase on its own. Files that were **split** need manual porting. Old → new:

| Old path | New path |
|---|---|
| `index.html`, `pages/`, `public/`, `vite.config.js`, `tsconfig.json` | `frontend/…` (same names) |
| `scripts/*-test.mjs`, `scripts/button-audit.mjs` | `frontend/tests/` |
| `scripts/inject-footer.mjs` | `frontend/scripts/inject-footer.mjs` |
| `supabase/` | `backend/supabase/` |
| `src/lib/auth.ts`, `navigation.ts`, `storage.ts`, `workspace.ts` | `frontend/src/core/` |
| `src/lib/adminSession.ts`, `src/features/admin.ts`, `adminLogin.ts`, `src/styles/admin.css` | `frontend/src/modules/admin/` |
| `src/components/feedback.ts`, `menu.ts` | `frontend/src/core/ui/` |
| `src/components/siteHeader.ts`, `siteFooter.ts`, `recruiterSidebar.ts` | `frontend/src/core/layout/` |
| `src/features/account.ts` | `frontend/src/core/layout/accountMenu.ts` |
| `src/features/demo/ui.ts` | `frontend/src/core/ui/actions.ts` |
| `src/features/jobs.ts` | `frontend/src/modules/jobs/jobSearch.ts` (`jobHref` → `core/navigation.ts`) |
| `src/features/messages.ts` | `frontend/src/modules/messages/messages.ts` |
| `src/features/demo/cv.ts` | `frontend/src/modules/profile-cv/cv.ts` |
| `src/features/demo/posting.ts` | `frontend/src/modules/recruiting/posting.ts` (`DemoJob` → `core/models.ts`) |
| `src/features/demo/recruiting.ts` | `frontend/src/modules/recruiting/pipeline.ts` |
| `src/features/demo/community.ts` | `frontend/src/modules/community/community.ts` |
| `src/styles/candidates.css` | `frontend/src/modules/recruiting/candidates.css` |
| `src/features/design/` | `frontend/src/design/` |
| **Split** `src/features/demo.ts` | banner + generic buttons → `core/demo/demoShell.ts`; login/register → `modules/accounts/authForms.ts`; university → `modules/university/university.ts`; company tabs → `modules/jobs/companyPage.ts`; job-detail title → `modules/jobs/jobDetail.ts` |
| **Split** `src/features/forms.ts` | `saveForm`, `restoreForm`, `apply`, generic submit → `core/forms.ts`; login/register → `modules/accounts/authForms.ts`; CV preview → `modules/profile-cv/cvPreview.ts` |
| **Split** `src/features/workflow.ts` | recruiter links and trail → `core/layout/workflow.ts`; candidates/employer shortcuts → `modules/recruiting/shortcuts.ts` |
| **Split** `src/features/options.ts` | community post menu → `modules/community/postMenus.ts`; report dialog → `core/report.ts` |

Easiest path for an old branch: create a fresh branch from the current `main`, then re-apply your changes
file by file using this table. To see what you changed in an old file:

```bash
git diff $(git merge-base origin/main your-branch) your-branch -- src/features/demo.ts
```

Then fix the imports (`'../lib/storage'` → `'../../core/storage'`) and run `npm run build`.
