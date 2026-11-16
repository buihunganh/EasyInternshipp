# Internships.io: hệ thiết kế "Giấy & Mực"

The design spec every UI change follows. The structure comes from LinkedIn: a quiet global nav, a warm canvas,
white hairline cards, a 3-column shell, pill buttons and dense lists. About 20% is ours, so the product
doesn't read as a LinkedIn clone or as generic AI output (see "Signature" below).

Authority: `tokens.css` holds the values. This file says how to use them. If a page needs a value that isn't
a token, add a token here and in `tokens.css` first (shared-file change: ask the team lead).

## 1. Principles

1. **Content first, chrome last.** Cards are white rectangles with a 1px hairline. No gradients, glass, blobs
   or colored shadows. Hierarchy comes from type and spacing.
2. **One accent.** `--ui-primary` (đỏ son / vermilion lacquer) appears at most twice per viewport: usually the main CTA plus the
   active state or one link cluster. Everything else is neutral.
3. **Lists, not card piles.** Repeating items (jobs, applicants, notifications, conversations) are rows inside
   one card, separated by hairlines, not one boxed card per item.
4. **Every screen answers "what do I do next?"** One primary button per view. Secondary actions are outline
   pills, tertiary actions are text or icon buttons.
5. **Vietnamese first.** Diacritics stack (ố, ặ, ữ), so headings never go below `line-height: 1.25`, and
   ALL CAPS is avoided (Vietnamese caps with diacritics crowd).

## 2. Tokens (see `tokens.css`)

| Group | Token | Value | Use |
|---|---|---|---|
| Canvas | `--ui-page` | `#f4f2ee` | body background (warm paper) |
| | `--ui-surface` | `#ffffff` | cards, header, dialogs |
| | `--ui-subtle` | `#f8f7f5` | row hover, inset blocks |
| | `--ui-sunken` | `#eeebe5` | search field, progress tracks, skeletons |
| Lines | `--ui-border` | `#e3e0da` | hairlines, card ring |
| | `--ui-border-strong` | `#c4bfb6` | input and outline-pill borders |
| Text | `--ui-text` | `#1c1f23` | body and headings (mực đen) |
| | `--ui-muted` | `#5b6168` | secondary text (≥4.5:1 on white and on page) |
| | `--ui-faint` | `#6f757c` | timestamps and meta only, ≥12px |
| Accent | `--ui-primary` | `#b93b1d` | primary CTA, active state, brand mark (đỏ son) |
| | `--ui-primary-hover` | `#9e3016` | |
| | `--ui-primary-pressed` | `#832610` | |
| | `--ui-primary-soft` | `#faebe5` | selected row, active nav background |
| Signal | `--ui-signal` | `#a35f00` | **only** for "đang tìm thực tập", deadline ≤3 days and "Tuyển gấp" (vàng nghệ) |
| | `--ui-signal-soft` | `#fdf0d9` | |
| Semantic | `--ui-success` / `-soft` | `#1d7348` / `#e4f3ea` | |
| | `--ui-warning` / `-soft` | `#8a5a00` / `#fff3d6` | |
| | `--ui-danger` / `-soft` | `#9f1c24` / `#faeae8` | wine/ruby red for destructive actions |
| Ink | `--ui-ink` | `#1c1f23` | selected filter pill, toast background |

Radius: `--ui-radius-control: 6px` (inputs, selects, search), `--ui-radius-pill: 999px` (every button and
chip), `--ui-radius-card: 10px`, `--ui-radius-media: 6px` (company logos, thumbnails). Avatars are circles.

Elevation: `--ui-shadow-card: 0 0 0 1px var(--ui-border)` (cards use a ring, not a drop shadow),
`--ui-shadow-raised` (hover on interactive cards), `--ui-shadow-overlay` (menus, dialogs, toasts).

Spacing: 4px grid: `--ui-space-1..8` = 4, 8, 12, 16, 20, 24, 32, 48.

Layout: `--ui-header-h: 56px`, `--ui-shell-max: 1128px`, `--ui-rail-left: 225px`, `--ui-rail-right: 300px`,
`--ui-gutter: 24px`.

Motion: `--ui-ease: cubic-bezier(.2,0,0,1)`, `--ui-fast: 120ms` (hover/press), `--ui-med: 180ms`
(menus/dialogs). Everything is off under `prefers-reduced-motion`.

## 3. Typography

Font: **Be Vietnam Pro** (built for Vietnamese diacritics), fallback
`-apple-system, "Segoe UI", Roboto, Arial, sans-serif`. One family, three weights: 400 read, 500 UI/labels,
600 headings and buttons. Never 700+ except a single number in a stat.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Page title (h1) | 24px / 1.3 | 600 | -0.01em |
| Section title (h2, card title) | 20px / 1.3 | 600 | 0 |
| Item title (h3, job title in list) | 16px / 1.35 | 600 | 0 |
| Body | 14px / 1.5 | 400 | 0 |
| Body large (job description, post text) | 15px / 1.6 | 400 | 0; max 68ch |
| Meta / caption | 12px / 1.4 | 400 | 0.01em |
| Label (eyebrow) | 12px / 1.4 | 600 | 0.02em, sentence case, no ALL CAPS |

At most 3 type sizes above the fold. Numbers in stats, deadlines and salaries use `font-variant-numeric:
tabular-nums`.

## 4. Shell and layout

- **Global nav** (56px, white, hairline bottom, sticky). Left: brand mark and a search field (`--ui-sunken`,
  280px, icon left, submits to `/?q=`). Right: nav items with a 24px icon over a 12px label. The active item
  has a filled icon and a 2px `--ui-text` bar under it. Notifications and the account button ("Tôi ▾" with a
  24px avatar) come last. For employers a vertical hairline separates "Không gian tuyển dụng". Guests see
  "Đăng ký" (tertiary) and "Đăng nhập" (outline pill).
- **Mobile (<768px)**: a 52px header (avatar, search, messages icon) and a 5-item bottom tab bar
  (icon + 11px label). Page content gets bottom padding so the bar never covers it.
- **Shell**: `max-width: var(--ui-shell-max)`, centered, `padding: 24px 16px`. Grids:
  `left 225 | main 1fr | right 300` (feed and jobs), `main 1fr | right 300` (detail pages), `left 225 | main`
  (settings, notifications). Gap 24px. Below 992px the right rail drops under main. Below 768px it's one column.
- **Footer**: no dark mega-footer. Public pages end with a centered, small muted link row plus copyright. Pages
  with a right rail repeat that block at the bottom of the rail (the LinkedIn pattern) and hide the page footer.

## 5. Components

| Component | Spec |
|---|---|
| Card | white, `--ui-radius-card`, `--ui-shadow-card`, padding 16px (lists) / 24px (forms). Header row: title 16–20px 600 plus icon actions on the right. |
| Button: primary | filled `--ui-primary`, white 600 text, pill, height 32 (sm) / 40 (md), padding 0 16px; hover `-hover`; active moves down 1px. |
| Button: secondary | transparent, 1px `--ui-primary` border, primary text; hover `--ui-primary-soft` plus inset 1px ring (looks 2px). |
| Button: tertiary | text `--ui-muted`, hover `--ui-subtle` bg and `--ui-text`. |
| Icon button | 40px circle, muted icon, hover `--ui-subtle`. |
| Filter pill | 32px, 1px `--ui-border-strong`, `--ui-text`. **Selected** = `--ui-ink` fill, white text (saves the accent). |
| Status chip | 22px, pill, 12px 600, semantic soft bg plus strong text. Never more than one per row. |
| Input / select | 40px, 1px `--ui-border-strong`, `--ui-radius-control`, label above (14px 500). Focus: 2px `--ui-primary` ring. Error: `--ui-danger` border plus message below. |
| Tabs | 14px 600 `--ui-muted`. Active: `--ui-text` plus 2px bar in `--ui-primary`. Count in a neutral chip. |
| List row | 12–16px padding, 48px logo square (`--ui-radius-media`) or avatar circle, title 16px 600 (link: `--ui-text`, hover `--ui-primary` + underline), 14px muted subtitle, 12px faint meta. Hairline between rows, hover `--ui-subtle`. |
| Empty state | 56px circle `--ui-sunken` with a muted icon, 16px 600 title, muted body, at most one CTA. |
| Loading | skeleton bars (`--ui-sunken`, 1.2s soft pulse) shaped like the content. Spinners only inside buttons. |
| Dialog | 552px max, radius 10, header (title 20px + close icon) / body / footer (right-aligned pills) separated by hairlines, `--ui-shadow-overlay`, scrim `rgb(0 0 0 / .45)`. |
| Toast | bottom-left, `--ui-ink` background, white text, radius 10, optional text action. |
| Menu | 288px, white, radius 10, overlay shadow. Items 40px, icon 20px muted. Destructive items in danger color. |

Icons: Material Symbols Outlined, 20px in rows and buttons, 24px in the nav. The active nav item uses
`font-variation-settings: 'FILL' 1`. Icons are `currentColor`.

## 6. Signature (the ~20% that's ours)

1. **Be Vietnam Pro** throughout. It reads as a Vietnamese product at first glance.
2. **Warm paper canvas** (`#f4f2ee`) with **ink** selected states (`--ui-ink` filter pills, ink toasts),
   instead of turning everything blue.
3. **"Thẻ sinh viên" top card** on the student profile: a flat đỏ son (vermilion) cover band with the university name
   set small and tracked on it (like a lanyard card), an 152px avatar overlapping the band, then name /
   headline / school · khóa / city. If the student is looking for an internship, the avatar gets a 4px
   `--ui-signal` ring and an "Đang tìm thực tập" chip.
4. **Deadline clock**: every job shows "Còn N ngày" in tabular numbers. At ≤3 days it switches to
   `--ui-signal`. This is the only urgency marker. No flames, no emoji.
5. **Press feedback**: buttons move 1px down on `:active`; cards with a link raise to `--ui-shadow-raised`
   on hover.

## 7. Banned (anti-AI-slop checklist; reviewers reject these)

- Emoji as icons or decoration (🔥 💼 🎓 ⭐ ✨ 🚀 …). Use Material Symbols or nothing.
- Gradients of any kind (hero, buttons, cards, avatars), `backdrop-filter` glass, decorative blobs, rings or waves.
- Cards with a colored left border, colored drop shadows, `rounded-2xl`+ on cards.
- More than one filled primary button per view. More than two accent uses per viewport.
- Invented metrics in new copy ("1,200+ doanh nghiệp", "+40%"). Existing copy is left alone unless the lead
  approves its removal (tests match on text).
- ALL CAPS labels, centered body paragraphs longer than 2 lines, `text-align: justify`.
- Raw hex or rgb values outside `tokens.css`. Every color is a `var(--ui-*)`.
- Tailwind default indigo/violet (`#6366f1`, `#4f46e5`, `#7c3aed`, …).

## 8. Engineering rules (from CLAUDE.md / CONTRIBUTING.md)

- **Never change existing visible Vietnamese text, `aria-label`s, ids, `data-*` attributes, or classes that
  TS or tests reference.** Navigation and tests match on text. Before removing or renaming anything, grep
  `frontend/src` and `frontend/tests` for its text, class and id. If it's referenced, keep it and restyle it,
  or hide it with CSS.
- Tailwind is precompiled per page: you can't add new utility classes. New styling goes in the module CSS
  (`modules/<module>/<module>.css`, linked after `design-system.css`) with module-prefixed class names.
- Load order: `platform.css` (the `ui-` classes) is imported by `main.ts`, so it lands *after* the page's
  `<link>` stylesheets. A module rule that overrides a `ui-` rule must win on specificity, not order: prefix it
  with `body` (or `body[data-page=…]`).
- User data interpolated into `innerHTML` goes through `esc()`.
- 390px wide: no horizontal overflow. Touch targets ≥40px on mobile.
- `npm run build` must pass. Run the test scripts that cover your pages when `.env.local` is available.
