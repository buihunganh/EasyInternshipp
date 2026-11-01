# accounts

**Owner:** _(name)_ · **Pages:** `login`, `register`, `reset-password` · **Diagrams:** DFD Process 1, Sequence_User_Authentication

| File | What it does |
|---|---|
| `index.ts` | `forms` → auth forms / reset password, `controls` → `setupAuthPage` |
| `api.ts` | `signUp` (role in metadata), `signIn`, `sendPasswordReset`, `updatePassword`, `listUniversities`, `employerHasCompany` |
| `authForms.ts` | register (role buttons → `student` / `employer` / `university_officer`, universities from the DB, optional MSSV), login with status checks, `?next=` redirect, forgot password, social sign-in placeholders, reset-password page |

**Data:** Supabase Auth. The `on_auth_user_created` trigger creates `profiles` (+ `student_profiles` / `university_officers`). Officers start `pending_verification` until an admin activates them.

**Watch out**
- After login: employers without a company go to `/pages/company-settings/`; `next` is used only if it passes `safeReturnPath()` and the role may open it.
- Pending or suspended accounts are signed out again with a clear message (BR-02, BR-03).
- Social buttons (Google / GitHub / SSO) show "sẽ sớm được hỗ trợ"; no provider is configured.
- Supabase Auth settings (password length, redirect URLs) live in `backend/supabase/config.toml` → `npx supabase --workdir backend config push`.
