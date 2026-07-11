# ADMIN.SYS — TODO

_Updated 2026-07-04. Review + fix log: [`report.md`](./report.md) (§8 fix table, §9 feature log)._

## Open

- [ ] **Commit** — everything since the 07-02 design pass is uncommitted (`git diff`): design fixes + icons.js + openOv + sessions/tasks/cron/boards features + flat-view board merge + tests.
- [ ] Intermediate header breakpoint (~1100px control wrap) — report §5, last open design item.
- [ ] Self-host fonts (JetBrains Mono / Space Grotesk currently from Google CDN) — report §4.
- [ ] Profile buttons on Sessions default to `main` — consider defaulting to `all` like Cron/Tasks if that reads better in daily use.

## Done (2026-07-02 → 04)

- Design-review fix list §8: all P1/P2/P3 applied except header breakpoint (contrast text-tiers, accent-ink, tbl-wrap, icon map, KPI groups, onboarding empty state, …); KPI trim reverted on request — all 12 boxes kept.
- Feature batch (§9): Overview details persistence · Sessions per-profile + `/api/session` transcripts · `/api/task` card review · Cron profile filters · multi-board kanban (default + named boards, KPI aggregates).
- Suite: unit + render smoke + **34 Playwright**, green.
- **07-04 header chip (deployed)**: active-filter chip moved left of the "filters" label, absolutely anchored (zero-size `.fa-anchor`) — appearing/clearing no longer re-wraps the flex header or shifts the buttons; e2e no-shift regression test added (suite 36).
- **07-04 health banner (deployed)**: red line + crashed tasks · logs-link removed (plain status line) · new yellow fleet-wide blocked-tasks line · KPI-matching icons (cron/fails/alert) on the failure entries. Agent-card banners aligned: crashed-task counter = per-agent `by_status.crashed` (was stale failed-runs heuristic) w/ fails icon, cron icon on cron-failed entry, blocked wording matched to the box.
- **07-04 agent-card polish (deployed)**: cron-jobs stat de-linked · session split gains `tui` (kanban · cron · discord · tui) · model pill = `provider:model` (reader parses `model.provider`; live-updating — SSE re-reads config each tick, verified showing `moa:gemma4e4b-moa`) · spend&tokens always open (details→div) · TOP SKILLS/TOP TOOLS sections always open. Suite now 35 e2e.
- **07-04 live-update bug fixed + deployed**: "running tasks" KPI / failure line / recent-runs box froze once tasks moved to board `a1k0` — legacy flat `kanban.tasks`/`runs` = first board only. Reader now merges all boards (board-tagged, newest first, capped 50/25). 53 unit + 34 e2e green; container rebuilt (deploy item closed), live snapshot verified showing a1k0 runs on top.
