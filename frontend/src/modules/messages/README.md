# messages

**Owner:** _(name)_ · **Pages:** `messages` (login-gated; student view, or recruiter view with `?workspace=employer`) · **Diagrams:** DFD Process 6, Sequence_Direct_Messaging

| File | What it does |
|---|---|
| `index.ts` | `setup` → `setupMessages` |
| `messages.css` | page styles (prefix `msg-`): one flush card = list / thread / context panel; scoped over the design's Tailwind classes; mobile list → thread switch via `.msg-show-thread` on `.msg-grid` |
| `messages.ts` | conversation list, send messages and files, mute / archive / read state, conversation menu, report |

**Storage:** owns `demo:chat:*` (messages and per-conversation flags); writes `reports` (read by admin).

**Watch out**
- Core's "…" button handling skips this page on purpose (`prepareOptionButtons`). The conversation menu is yours.
- The same page serves students and recruiters. Check both: sign in as `student`, then as `recruiter`.
- `messages.ts` still finds the design markup structurally (`aside:first-child`, `section.children[1]`, `rightAside.children[n]`, `.overflow-y-auto.space-y-md`, `input[placeholder^="Nhập tin nhắn"]`). Add classes to those elements, never move or reorder them. The composer stays an `<input>` (tests fill it) and its toolbar buttons are found by icon name.
- Conversation rows, message bubbles, the interview ticket and the context cards are generated in `messages.ts` with `msg-*` classes; the RSVP texts and `.app-rsvp-*`, `.app-file-download`, `.app-view-*-btn`, `.app-upload-doc-btn`, `#conversation-status` are used by e2e tests.
- The composer (`.msg-composer` and `.msg-field`) is hidden until a conversation is open (`showThreadChrome`). Students don't get the "<>" (`code`) button and see a link to `/pages/applications/` when the list is empty.
- Mobile: the list is shown first; opening a conversation adds `.msg-show-thread`, and the back button (`.msg-back`) removes it. The context panel shows only at >=1280px.
