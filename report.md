# ADMIN.SYS — Design / UI / UX Review — 2026-07-02

Full design review of the mission-control dashboard (`web/index.html`, `styles.css`, `js/*`), run against the taste-skill redesign audit (typography · color · layout · states · content · components · icons · code quality · omissions) plus current dashboard-design best practice research (sources at the bottom).

**Verdict:** this is a genuinely good piece of interface work — far above the "generic AI dashboard" baseline the audit exists to catch. The AXIS neo-brutalist theme is committed and consistent (hard borders, offset shadows, one accent, zero border-radius everywhere); the interaction layer is unusually complete for a stdlib side project (SSE with polling fallback, stale/connection banners, keyboard tab navigation, `aria-*` throughout, skip-link, `prefers-reduced-motion`, skeleton first-paint, empty states on every table, persisted filters/tab/theme). Nothing here needs a redesign. The findings below are polish: a real accessibility gap (contrast), a few information-hierarchy issues on the Overview, and small consistency/code items.

Legend: 🔴 fix (real usability/a11y cost) · 🟠 should (noticeable quality gain) · 🟡 nice-to-have · 🟢 strength worth keeping.

---

## 1. What's already strong (keep, don't touch)

- 🟢 **Committed visual identity.** One accent (`--safety #FF3E00`), one gray family (warm, consistent in dark mode), `--radius: 0` enforced globally, shadow language (`Npx Npx 0 var(--ink)`) used for hover/press/health uniformly. The press interaction (`shadow collapses + translate(3px,3px)`) is exactly the kind of physical feedback the audit asks for.
- 🟢 **Health-by-shadow-color** on agent cards is a distinctive, learnable encoding — and it's correctly *redundant* (state pill text carries the same info), so it isn't color-only communication.
- 🟢 **States done right:** skeleton sweep on first paint, `.empty` copy on every table, red/yellow banners with pixel icons, SSE `connbanner` for down/stale, frozen live-dot when the stream dies, per-bar sparkline tooltips with day labels.
- 🟢 **A11y skeleton in place:** `role=tablist/tab/tabpanel` + arrow/Home/End keys, `aria-sort` on sortable headers, `aria-live=polite` status, `aria-expanded` dropdowns + Esc, `:focus-visible` ring, skip-link, `role=img` + label on sparklines, reduced-motion kill-switch.
- 🟢 **Custom pixel-icon set** (32-grid, fill-based, consistent) instead of default Lucide — real differentiation, matches the industrial theme.
- 🟢 **Typography details:** `tabular-nums` on all KPI numbers, `text-wrap: balance` on display text, negative tracking on the wordmark, mono reserved for data cells.
- 🟢 **Honest, quiet copy:** "✓ all systems nominal", "no task runs", "connection lost · reconnecting…" — no "Oops!", no exclamation marks, sentence case throughout.

---

## 2. 🔴 Accessibility — contrast failures (the one real gap)

Computed WCAG ratios for the light theme (`#FFFFFF` / `#F2F0EF` grounds):

| Use | Colors | Ratio | AA needs | Verdict |
|---|---|---|---|---|
| Orange links/summaries (`.loglinks a`, `.costmeta summary`, `details.skills summary`, `.filteractive`) at 0.66–0.78rem | `#FF3E00` on white | **3.5:1** | 4.5:1 | ❌ fail |
| White-on-orange fills (`.cardbtn:hover`, `.chip.active`, `.filterbtn.on`, `.sysblock-title`, connbanner text) | `#FFF` on `#FF3E00` | **3.5:1** | 4.5:1 | ❌ fail |
| Green status text in pills/tables (`.ok`, `.b-ok`) at 0.7rem | `#1FA84E` on white | **3.1:1** | 4.5:1 | ❌ fail |
| Yellow/amber warnings (`.warn`) | `#C77B00` on white | **4.0:1** | 4.5:1 | ❌ borderline |
| Muted text | `#666` on `#F2F0EF` | 5.1:1 | 4.5:1 | ✅ |
| Dark theme status colors on `#1C1A14` | — | ≥5:1 | — | ✅ (dark mode is fine) |

This matters here precisely because status color IS the product — ok/warn/bad text is the primary information channel of a monitoring tool. Fixes that keep the palette's character:

1. **Text-on-white status colors:** darken the *text* variants only — e.g. green `#157A39`, orange text `#D63200`, amber `#9A5F00`, teal `#0B7186`. Keep the current brighter values for fills/swatches/borders (3:1 UI-component threshold — those pass). Two-tier tokens: `--green` (graphics) + `--green-text`.
2. **Ink-on-orange instead of white-on-orange:** black text on `#FF3E00` = 5.9:1 ✅ and is *more* neo-brutalist, not less. Swap `--accent-ink` to `#000` for `.sysblock-title`, `.chip.active`, `.filterbtn.on`, `.cardbtn:hover`.
3. Orange **link** text (`.loglinks a`): underline already present (good — not color-only); darken to `#D63200` and they pass.

One more color-adjacent item: 🟡 `.connbanner.stale` is white-on-`#C77B00` (≈2.6:1) — worst text in the app, on the banner whose whole job is being read. Ink text there too.

---

## 3. 🟠 Overview information hierarchy

The Overview is the "7±2 things" screen, and it currently shows ~11 KPI boxes + a stat row repeated inside every agent card + channels + two top-10 sections. Research consensus (and the audit's "lead with one big thing"): a monitoring landing screen should answer *"is anything wrong?"* first — which your `health` banner already does — then show *few* numbers.

- **KPI redundancy:** `agents`, `cron jobs`, `sessions`, `tasks`, `running` appear in the KPI boxes **and again** in every agent card's stat row, on the same screen. For a 1–4 agent fleet the per-card stat row carries almost all the value; consider trimming the "fleet" KPI row to the four that aggregate meaningfully (`agents`, `tokens 7d`, `spend 7d`, + one health count) or making the KPI row a single compact `accent-band` strip.
- **"AGENTS" section brief says "N cron jobs"** (`render-overview.js:299`) — a copy/paste mismatch; the brief under the AGENTS heading should describe agents ("N shown · M down"), the cron count belongs to the Cron tab/KPI.
- **CHANNELS / TOP SKILLS / TOP TOOLS on Overview** duplicate the Agents tab's deeper versions. Cheap win: move them behind the `midline` as collapsed `<details>` sections (you already have the pattern in `.costmeta`/`.legend`), or drop CHANNELS from Overview entirely — it's static config, not "what's happening now" data.
- 🟡 The **legend** explaining the core encoding ("card shadow color = agent health") is collapsed at the bottom of the sidebar. First-run users won't find it. Consider `open` by default on first visit (one localStorage flag), collapsed after.

---

## 4. 🟠 Typography

- **`Share Tech Mono` is a single-weight (400) font used as the body face.** All body-level hierarchy is currently carried by size/caps/color alone; the audit specifically flags two-weight interfaces. JetBrains Mono (already loaded at 400/500/600/700) is the more legible mono at 0.7rem sizes; consider: JetBrains Mono for all body/data (it's already on data cells), keep Share Tech Mono only as a display/flavor face (logo, section titles) — or drop it and save a font download.
- **Sub-0.7rem text is widespread:** `.cl-rgb 0.55rem`, `.spark-days 0.52rem`, `.cdate 0.58rem`, `.ch-brief 0.6rem`, `.disc-lbl 0.62rem`, `.kpi-grouplbl 0.62rem`, KPI/label tier 0.66rem — all uppercase + letter-spaced, in mono. Below ~11px, uppercase mono is measurably hard to read. Floor labels at 0.66rem/11px and drop the decorative sub-0.6rem tiers.
- **ALL-CAPS everywhere** (audit item): tab buttons, every label, section heads, buttons, banners. It's on-theme, but when *everything* is caps, caps stop signaling hierarchy. Cheap contrast: keep caps for section heads + tab nav, switch table `th` and `.proflabel` to lowercase (the terminal aesthetic reads lowercase as natively as caps — your own `.legend` and header labels are already lowercase).
- 🟡 `@import` Google Fonts in CSS is render-blocking and an external dependency for an offline-ish LAN tool; `display=swap` is set (good). Either self-host the two families (fits "no external deps" ethos of the project) or move to `<link rel="preconnect">` + `<link rel="stylesheet">` in the head.

---

## 5. 🟡 Layout & responsiveness

- **Tables have no horizontal-scroll wrapper.** The Cron table is 10 columns; on <900px it will force page-level horizontal scroll (the audit's "wide content must scroll in its own container"). Wrap tables in a `.tbl-wrap { overflow-x:auto }` (one class, applied in the shared render helpers).
- **Mobile breakpoint is a single 760px step.** The header control row (filters + two dropdowns + theme + separators) wraps into a messy multi-line strip well above 760px (~1100px with the sidebar). Consider an intermediate step that collapses `filters/agents/profile` labels (the `.hlabel`s + `.hsep`s) and keeps just the controls.
- **`.stat` row uses `flex-wrap:nowrap`** with 5 items in a card that can shrink to 26rem — numbers with 4+ digits will collide before the card wraps. `flex-wrap:wrap` or `grid-template-columns:repeat(auto-fit,minmax(3.5rem,1fr))` is safer.
- 🟢 Everything else checks out: `100dvh` (not `100vh`), max-width 1600 container, auto-fill grids, sticky sidebar/header done correctly, z-index scale sane (39/40/50/60/100).

---

## 6. 🟡 Components, content, code quality

- **Duplicated inline SVG blobs:** the cron pixel icon is pasted twice verbatim (KPI `cron jobs` + `failed crons`, ~1.4 KB each), agents/profiles/sessions icons are one-off inline strings in template literals. Move all icons to a single `icons.js` map (`ICON.cron`, `ICON.agents`…) — smaller bundle, one edit point, and `render-overview.js` becomes readable.
- **`assets/` appears orphaned:** `Android.svg`, `Close-Book-Bookmark.svg`, `Hourglass.svg`, `Live-Status.svg`, `Pencil.svg` — nothing in `web/` references them. Delete or wire up.
- **Inline styles in JS renderers:** `style="grid-column:1/-1"` repeated ~8× across render functions — make it a `.span-all` class (audit: styling belongs in the stylesheet). The dynamic `style="height:…%"`/`width:…%` bars are fine.
- **Theme toggle label:** button statically says "dark" (`index.html:68`); if it doesn't swap to "light" when dark mode is on (check `main.js:264`), it reads as current-state instead of action — swap text on toggle, and consider honoring `prefers-color-scheme` as the default before localStorage is set (audit: system preference detection).
- **Tables a11y polish:** add `scope="col"` to `th` (or `<caption class="sr-only">`) — cheap screen-reader win on a table-heavy UI.
- 🟡 `.health.clickable:hover { filter:brightness(1.1) }` is nearly invisible on the light theme's tinted backgrounds — use the established shadow/offset hover language instead (consistency beats a new hover mechanic).
- 🟡 Empty first-run state: "No agents discovered under /data." is honest but a dead end — the audit asks for a composed getting-started state. One line more: *"mount an agent home into the container: `-v ~/.hermes:/data/my-agent:ro`"* turns it into onboarding.
- 🟢 Content passes otherwise: no lorem, no fake round numbers (real data), no AI-cliché copy, realistic empty/error strings, unique per-concept icons.

---

## 7. Research notes (what current best practice says, applied here)

- **Lead with one thing.** Monitoring dashboards should answer "anything wrong?" in <5s — your health banner does this; the KPI-grid trim (§3) is the remaining step. Progressive disclosure ("show what matters now, hide what doesn't") is the 2026 consensus pattern — you already use `<details>` for cost/skills/legend; extend it to the Overview's secondary sections.
- **7±2 elements per view;** pair color with icons/labels/text, never color alone (your pills do this; the contrast fixes in §2 complete it).
- **Keyboard + screen-reader support** is table stakes for admin tooling — you're ahead of most; `scope`/caption + the contrast tokens close it out.
- **Consistency of card/spacing/chart language** ranks above novelty — your single shadow/border/accent system is exactly this; resist adding new hover mechanics (§6 brightness item).

Sources: [UXPin — Dashboard Design Principles (2026)](https://www.uxpin.com/studio/blog/dashboard-design-principles/) · [DesignRush — 9 Dashboard Design Principles for 2026](https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles) · [Fuselab — Dashboard Design Trends 2026](https://fuselabcreative.com/top-dashboard-design-trends-2025/) · [Think.Design — Dashboard Do's and Don'ts 2026](https://think.design/blog/dashboard-design-in-2026-dos-and-donts/) · [AufaitUX — 30 Dashboard Design Principles](https://www.aufaitux.com/blog/dashboard-design-principles/) · taste-skill `redesign-skill` audit checklist (local).

---

## 8. Prioritized fix list

> **✅ APPLIED 2026-07-02** — full status per finding:
>
> | Finding | State |
> |---|---|
> | §2 contrast: text-tier status tokens (`--*-text`), ink-on-orange (`--accent-ink #000`), banner text | ✅ all applied; dark theme overrides to bright |
> | §3 AGENTS section brief ("N cron jobs" copy bug) | ✅ now "N shown · M down" |
> | §3 collapse Overview CHANNELS / TOP SKILLS / TOP TOOLS | ✅ `<details class="ovd">`, ▸/▾ marker |
> | §3 KPI row trim 12 → 8 | ✅ applied, then **↩ REVERTED same day — operator wants all 12 boxes**; restored via `icons.js` map |
> | §3 legend discoverability | ✅ auto-opens first visit only (localStorage flag) |
> | §4 single-weight body font | ✅ Share Tech Mono dropped → JetBrains Mono body (one less download) |
> | §4 sub-0.66rem label tier | ✅ floored at 0.66rem (spark days, briefs, group labels, tooltips…) |
> | §4 all-caps flattening | ✅ `th` + `.proflabel` → lowercase |
> | §4 `@import` fonts | ◐ family trimmed; still `@import` (self-host / `<link>` swap = open) |
> | §5 tables scroll containment | ✅ all 14 tables in `.tbl-wrap` |
> | §5 `.stat` nowrap collision | ✅ wraps |
> | §5 intermediate header breakpoint (~1100px control wrap) | ⬜ open |
> | §6 duplicate inline SVGs | ✅ new `web/js/icons.js` map (12 icons, single source) |
> | §6 orphaned `assets/` | ✅ kept — README documents them as design sources (report correction) |
> | §6 inline `grid-column` styles | ✅ `.span-all` class (6 swaps) |
> | §6 theme toggle label | ✅ already synced via `syncThemeLabel()` (report correction) |
> | §6 `prefers-color-scheme` default | ✅ honored before localStorage |
> | §6 `scope="col"` on table headers | ✅ everywhere incl. sortable helpers |
> | §6 `.health` hover mechanic | ✅ brightness filter → theme offset-shadow |
> | §6 first-run empty state | ✅ mount-command onboarding hint |
>
> Tests updated with the code (KPI expectations follow the 12-box layout; stale
> clickable-count 4 → real 5). Suite green: **44 unit + render smoke + 30 Playwright**.
> Changes uncommitted — review with `git diff`.

**P1 — accessibility (small CSS-only diff):**
1. Add darkened text-tier status tokens (`--green-text #157A39`, `--red-text` ok as-is `#E2231A`≈4.6 ✅, `--yellow-text #9A5F00`, `--teal-text #0B7186`, orange text/links `#D63200`); apply to `.ok/.warn/.bad/.cyan`, `.loglinks a`, summaries.
2. `--accent-ink: #000` — ink text on all safety-orange fills (incl. both connbanner variants).

**P2 — hierarchy & robustness:**
3. Fix "AGENTS … N cron jobs" section brief (`render-overview.js:299`).
4. Trim/merge the Overview KPI row; collapse or drop Overview CHANNELS / TOP-10 sections behind `<details>`.
5. `.tbl-wrap { overflow-x:auto }` around all tables; `.stat` → wrap/auto-fit grid.

**P3 — polish:**
6. Icon map module; kill duplicate SVG strings; delete or wire orphaned `assets/`.
7. Body font decision (JetBrains-only vs Share Tech display-only); label floor 0.66rem; lowercase `th`/`.proflabel`.
8. Theme toggle label swap + `prefers-color-scheme` default; `scope="col"`; `.span-all` class; getting-started empty state; legend open on first run.

**Explicitly keep:** the neo-brutalist system, shadow-health encoding, pixel icons, press physics, current copy voice. The theme is the product's personality — every fix above works *inside* it.

---

## 9. Feature work log (post-review, 2026-07-03 → 04)

Features added after the design pass — same suite discipline (every item landed with tests; current suite: **unit + render smoke + 34 Playwright**, all green):

| Feature | What shipped |
|---|---|
| Overview `<details>` state loss (UX bug) | sections + per-card cost details snapped shut on every re-render/refresh; now tracked in `UI.openOv` (persisted, same pattern as `openSkills`) |
| Sessions per profile | per-agent profile buttons (`main · N`, … + `all`), per-profile recent-15 lists w/ `source` column; card total = sum across profiles |
| Session transcripts | `/api/session?agent=&profile=&id=` — plain-text transcript from the profile's `state.db` `messages` (legacy `sessions/*.jsonl` fallback); every session id links `↗` |
| Task card review | `/api/task?agent=&board=&id=` — dashboard-style card dump (description · result · comments · events · runs), schema-tolerant; task ids in runs tables link `↗` |
| Cron per profile | per-agent profile filter buttons on the Cron panel (default **all** — the table mixes profiles); honors the global profile dropdown |
| **Multi-board kanban** | boards discovered from root `kanban.db` + `kanban/boards/<slug>/kanban.db` + `board.json` (title/icon) + `kanban/current`; Tasks tab gets board buttons (`all boards · default · 🧚 A1k0 ●`), per-board runs tables, board-scoped card links; **Overview KPIs (kanban/blocked) now aggregate all boards** — named-board tasks were previously invisible |

| **Flat-view board merge (live-update bug, 07-04)** | "running tasks" KPI / red failure line / recent-runs rows froze when work moved to board `a1k0`: legacy flat `kanban.tasks`/`runs` exposed the first (default) board only. Reader now merges all boards into the flat view (entries tagged `board`, sorted newest-first, capped 50 tasks / 25 runs). Verified live post-rebuild: a1k0 runs on top of the snapshot |

All read-only, stdlib-only, regex-whitelisted endpoints (traversal cases tested). **Deployed 2026-07-04** (`docker compose up -d --build`); changes still uncommitted.
