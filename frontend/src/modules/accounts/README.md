# accounts

**Owner:** _(name)_ · **Pages:** `login`, `register`, `reset-password` · **Diagrams:** DFD Process 1, Sequence_User_Authentication

| File | What it does |
|---|---|
| `index.ts` | `forms` → auth forms / reset password, `controls` → `setupAuthPage` |
| `api.ts` | `signUp` (role in metadata), `signIn`, `sendPasswordReset`, `updatePassword`, `listUniversities`, `employerHasCompany` |
| `authForms.ts` | register (role buttons → `student` / `employer` / `university_officer`, universities from the DB, optional MSSV), login with status checks, `?next=` redirect, forgot password, social sign-in placeholders, reset-password page |
| `accounts.css` | styles for minimal auth header, paper canvas, centered auth cards, role switcher, fields |

**Data:** Supabase Auth. The `on_auth_user_created` trigger creates `profiles` (+ `student_profiles` / `university_officers`). Officers start `pending_verification` until an admin activates them.

**Watch out**
- After login: employers without a company go to `/pages/company-settings/`; `next` is used only if it passes `safeReturnPath()` and the role may open it.
- Pending or suspended accounts are signed out again with a clear message (BR-02, BR-03).
- Social buttons (Google / GitHub / SSO) carry a "Sắp ra mắt" badge and `aria-disabled="true"` (dimmed, `cursor: not-allowed`); no provider is configured, so a click opens the "sẽ sớm được hỗ trợ" dialog.
- Supabase Auth settings (password length, redirect URLs) live in `backend/supabase/config.toml` → `npx supabase --workdir backend config push`.
- Login has no "remember me" control (the checkbox was removed); the password visibility buttons are handled in `setupAuthPage`, which keeps the icon and `aria-label` in sync ("Hiện mật khẩu" / "Ẩn mật khẩu").
