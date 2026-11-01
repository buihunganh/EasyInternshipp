# university

**Owner:** _(name)_ · **Pages:** `university` · **Diagrams:** UseCase_University

| File | What it does |
|---|---|
| `index.ts` | `controls` → `setupUniversityPage` |
| `university.ts` | partner inquiry modal, event registration, event details |

**Storage:** writes `demo:inquiries` through core's `record()` (shown in the demo banner's "Hoạt động demo").

**Watch out**
- The contact modal (`#contact-modal`) and its buttons `#btn-contact-career`, `#close-modal`, `#cancel-modal` are driven by the generated design script `design/university-0.js`. Core's generic button handling skips those ids (`nativeIds` in `core/demo/demoShell.ts`); keep the ids if you change the markup.
- The planned university portal (`/pages/university-portal/`, see IMPLEMENTATION_PLAN §5.2) belongs here: add the slug to `pages` in `index.ts`.
- New keys: use the `university:` prefix.
