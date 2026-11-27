# university

**Owner:** _(name)_ · **Pages:** `university`, `university-portal`, `verify` · **Diagrams:** UseCase_University, DFD 8.3 / 8.4

| File | What it does |
|---|---|
| `index.ts` | `controls` → one setup per page |
| `api.ts` | universities, active partners (+ open job counts), events, registrations (`register_for_event`), booths, partner inquiries; officer portal queries and RPCs (`verify_student`, `review_exclusive_job`, `certify_internship_report`, `check_in_event`, `review_event_booth`, `get_university_placement`), events / partnerships CRUD; `verify_internship_certificate` |
| `university.ts` | public page `?id=` (defaults: officer's / student's university, else HCMUT): identity, live stats, events (student register + ticket, employer booth request, organizer link), partners grid, contact modal → `partner_inquiries` |
| `portal.ts` | officer portal, hash tabs: `#overview` (KPI tiles, funnel, to-do, warehouse table, CSV), `#students` (verify / reject / revoke, applications, CSV), `#jobs` (exclusive job approval), `#reports` (certify / request changes, CSV), `#events` (CRUD, publish / cancel, registrations + check-in by ticket, booth review), `#partners` (MoU CRUD), `#inquiries` (status) |
| `verify.ts` | `/pages/verify/?code=`: certificate lookup, QR code (`qrcode` package) pointing back to the page, print |
| `university.css` | public page styles |
| `portal.css` | portal (`up-`) and certificate (`verify-`) styles |

**Roles:** officers land on `/pages/university-portal/` (`roleHome`), which is limited to `university_officer` in `core/auth.ts`. Every officer write is scoped by RLS / RPC checks to `private.officer_university_id()`.

**Other modules' side of Phase 10:** students submit the internship report from My Applications (`applications` module, hired roles); employers request booths on this page and post exclusive jobs from post-job (`recruiting` module, partner universities from `university_partnerships`).

**Watch out**
- Sections marked `data-hcmut-only` (overview text, faculties, contact details, salary widget, campus map) are the design's HCMUT showcase; they are hidden for other universities. The schema has no fields for them yet.
- The contact modal markup (`#contact-modal`, `#btn-contact-career`, `#close-modal`, `#cancel-modal`) is kept from the design; `university.ts` now drives it (the design script was removed). Core's generic button handling still skips those ids.
- Placement KPIs come from the analytics warehouse (refreshed nightly); the portal shows live counts next to them.
- Partner inquiries cannot be deleted by clients (no delete grant); officers close them instead.
