# messages

**Owner:** _(name)_ · **Pages:** `messages` (login-gated; student view, or recruiter view with `?workspace=employer`) · **Diagrams:** DFD Process 6, Sequence_Direct_Messaging

| File | What it does |
|---|---|
| `index.ts` | `setup` → `setupMessages` |
| `messages.ts` | conversation list, send messages and files, mute / archive / read state, conversation menu, report |

**Storage:** owns `demo:chat:*` (messages and per-conversation flags); writes `reports` (read by admin).

**Watch out**
- Core's "…" button handling skips this page on purpose (`prepareOptionButtons`). The conversation menu is yours.
- The same page serves students and recruiters. Check both: sign in as `student`, then as `recruiter`.
