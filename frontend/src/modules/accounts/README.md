# accounts

**Owner:** _(name)_ · **Pages:** `login`, `register` · **Diagrams:** DFD Process 1, Sequence_User_Authentication

| File | What it does |
|---|---|
| `index.ts` | `forms` → `setupAuthForms`, `controls` → `setupAuthPage` |
| `authForms.ts` | form submit, `?next=` return path, role picker, password strength, forgot password, social sign-in |

**Storage:** writes `demo-session` (`{role}`), which `core/auth.ts` owns. Don't change its shape without a core PR.

**Watch out**
- `core/auth.ts` → `safeReturnPath()` decides where users go after signing in. New post-login destinations go in its regex (core PR).
- Pages `login` and `register` have no site header (`core/layout/siteHeader.ts` skips them).
- Shared HTML: `frontend/pages/login/index.html`, `frontend/pages/register/index.html`, design scripts `design/login-0.js`, `design/register-0.js` (generated, don't edit).
- Supabase phase: `api.ts` here wraps `auth.signUp` / `signInWithPassword` / password reset.
