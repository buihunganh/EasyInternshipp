# info

**Owner:** _(name)_ · **Pages:** `about`, `help`, `terms`, `privacy`

Static reading pages linked from the shared footer (`core/layout/siteFooter.ts`) and from the register / login pages
(`core/navigation.ts` `destination()` maps "Hỗ trợ sinh viên", "Điều khoản…", "Chính sách quyền riêng tư", "Về chúng tôi").

| File | What it does |
|---|---|
| `index.ts` | opens a deep-linked FAQ item |
| `info.css` | long-form layout: hero, sections, FAQ (`<details>`), table of contents |

**Watch out**
- The content is in the page HTML. The support address `hotro@internships.io` and the response times on help / privacy are
  placeholders for the operator to confirm; the terms and privacy text describe how the platform actually works
  (no fees for candidates, moderation SLAs from `admin/overview.ts`, 180-day notification purge from migration 08) and
  should be reviewed before launch.
