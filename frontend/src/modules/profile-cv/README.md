# profile-cv

**Owner:** _(name)_ · **Pages:** `profile`, `cv-builder` (both login-gated) · **Diagrams:** DFD Process 2

| File | What it does |
|---|---|
| `index.ts` | `forms` → CV preview then restore saved draft; `controls` → `setupCV` |
| `cv.ts` | CV builder and profile actions: themes, colours, sections, avatar, upload, share |
| `cvPreview.ts` | mirrors contact inputs into the live CV preview |

**Storage:** owns `demo:cv-color`, `demo:cv-extras`, `demo:cv-preview`, `demo:cv-removed`, `demo:cv-theme`, `demo:avatar`; drafts saved by core under `form:cv-builder`.

**Watch out**
- `setupCvPreview()` must run before `restoreForm()` so restored values reach the preview. Keep that order in `index.ts`.
- Both pages use the workspace footer (`core/layout/siteFooter.ts` → `workspacePages`).
- New keys: use the `profile-cv:` prefix.
