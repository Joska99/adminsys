# ADMIN.SYS — Hermes Mission Control

Read-only **mission control dashboard** for my Hermes agents. Shows status and activity pulled straight from each agent's data folder. No control actions — display only.

Built DevOps-style: Docker container, Python **stdlib only** (no pip, no npm), modular reader-per-source layout so panels are easy to maintain and extend.

- **Port:** 1999
- **Mode:** read-only (no writes to agent data, no control endpoints)
- **Stack:** Python 3 standard library only (`http.server`, `json`, `sqlite3`, `glob`, `os`, `re`) + vanilla ES-module JS frontend (no bundler)
- **Theme:** AXIS industrial — light neo-brutalist (thick borders, hard offset shadows, orange `#FF3E00` accent)
- **Reference designs:** [outsourc-e/hermes-workspace](https://github.com/outsourc-e/hermes-workspace) (live data + UI ideas), komputermechanic hermes-dashboard guide (backend/data patterns)

---

## 1. How agents are discovered

Each agent's home is bind-mounted into the container at `/data/<name>` read-only. **Every immediate subfolder of `/data` is one agent.** No name pattern matching — folder name = agent name. New agents auto-discovered on next snapshot.

```
/data/
├── hermes-cc/        -> agent "hermes-cc"
├── hermes-news/      -> agent "hermes-news"
└── <whatever>/       -> agent "<whatever>"
```

`readers/discovery.py` lists immediate subdirectories of `DATA_ROOT` (default `/data`) and returns the agent list.

All access read-only:
- Bind mount is `:ro` (container cannot write agent data).
- SQLite opened via read-only URI: `file:<path>?mode=ro&immutable=1`.

---

## 2. Project layout

Python backend lives at the root; everything served to the browser lives under `web/`.

```
.
├── server.py            # ThreadingHTTPServer: routing, SSE, snapshot assembly, static serving
├── readers/             # one pure reader per data source
│   ├── __init__.py
│   ├── discovery.py     # list /data subfolders -> agents
│   ├── gateway.py       # gateway_state.json -> status dict
│   ├── kanban.py        # kanban.db -> task runs / events (ro sqlite)
│   ├── cron.py          # cron/jobs.json (main + sub-profiles) + run history
│   ├── sessions.py      # sessions/*.jsonl -> recent list + total count
│   ├── profiles.py      # profiles/* + config.yaml + per-profile state/sessions
│   ├── skills.py        # skills/.usage.json -> used + top-10 by use_count
│   ├── logs.py          # logs/*.log -> error/warn issues + counts
│   ├── memory.py        # memories/MEMORY.md + USER.md
│   ├── channels.py      # channel_directory.json -> channels / dms / threads
│   └── tokens.py        # response_store.db -> token usage
├── web/                 # everything the browser loads (served by server.py)
│   ├── index.html       # single page, loads js/main.js as <script type="module">
│   ├── styles.css       # AXIS light neo-brutalist theme
│   └── js/              # ES modules, native import/export (no build step)
│       ├── core.js          # state (SNAP/SELECTED/UI), helpers, filters, exports
│       ├── render-overview.js
│       ├── render-tabs.js   # agents / profiles / tasks / schedule / sessions / logs
│       └── main.js          # entry: renderAll, applySnapshot, event wiring, SSE
├── tests/               # run.sh (py|render|e2e), fixtures, unit + e2e (e2e/)
├── assets/              # design source icons (svg) — not served at runtime
├── Dockerfile           # python:3-slim app image, no extra deps
├── Dockerfile.test      # test image (python + node + playwright/chromium)
├── docker-compose.yaml  # mounts /data :ro, maps 127.0.0.1:1999
├── Makefile             # spins up containers (test / run); tests run via tests/run.sh
└── README.md            # this file
```

**Design rule:** each reader is a pure function `read(agent_path) -> dict`, wrapped by `_safe()` in `server.py` in its own try/except. One reader failing returns `{"available": false, "error": "..."}` and never crashes the server. Adding a panel = adding a reader file + a render function. Each reader independently testable.

---

## 3. Readers → snapshot

`server.py` `build_snapshot()` calls every reader for every discovered agent:

```jsonc
{
  "generated_at": "<iso8601>",
  "version": "1.0.0",
  "data_root": "/data",
  "agent_count": 2,
  "agents": [
    {
      "name": "hermes-cc",
      "model": "claude-...",          // default model from profiles/config
      "gateway":  { ... },
      "kanban":   { ... },
      "cron":     { ... },            // jobs + failed count + per-job run history
      "sessions": { ... },            // recent + total
      "profiles": { ... },
      "skills":   { ... },            // used + top_used (10)
      "logs":     { ... },            // issues (err/warn) + counts
      "memory":   { ... },
      "channels": { ... },            // channels / dms / threads
      "tokens":   { ... }
    }
  ]
}
```

### Source mapping
| Reader | Source in agent folder | Shows | Scope |
| --- | --- | --- | --- |
| `gateway` | `gateway_state.json` | gateway running/stopped, platform connection state, active agents | main |
| `kanban` | `kanban.db` (ro sqlite) | task runs: status, outcome, summary, timing, error | main |
| `cron` | `cron/jobs.json` (main + `profiles/*/cron`), `cron/output/<job>/*.md` | scheduled jobs, schedule→plain English, failed count, run history per job | **main + sub-profiles** |
| `sessions` | `sessions/*.jsonl` | recent sessions + total count | main |
| `profiles` | `profiles/*` + each profile's `config.yaml`, `gateway_state.json`, `channel_directory.json`, `sessions/` | per profile: model, **state (running/stopped)**, **session count**, channel/dm/thread bindings | main + sub-profiles |
| `skills` | `skills/.usage.json`, `.skills_prompt_snapshot.json` | skills with `use_count > 0`, top 10 used, category counts | main |
| `logs` | `logs/errors.log`, `agent.log`, `gateway.log` | error/warn issues, tagged + counted | main |
| `memory` | `memories/MEMORY.md`, `USER.md` | memory snapshot | main |
| `channels` | `channel_directory.json` | channels / dms / threads by type | main |
| `tokens` | `response_store.db` (ro sqlite) | token usage (total + per-model) | main |

**Profiles are independent agent instances.** Root = the `main` profile; each `profiles/<name>/` is a full Hermes home with its own gateway/cron/sessions. Only `cron` aggregates across all profiles; the other readers reflect `main`. Per-profile detail (state, model, bindings, sessions) lives in the **Profiles** tab + the overview PROFILES section.

---

## 4. Endpoints (all GET — read-only)

| Path | Returns |
| --- | --- |
| `/` | `index.html` |
| `/api/snapshot` | full snapshot JSON |
| `/events` | SSE stream, re-pushes snapshot every `SSE_INTERVAL`s (default 5) |
| `/healthz` | liveness `{"ok": true}` |
| `/api/log?agent=&file=` | raw log tail; `file` whitelisted to `errors.log`/`agent.log`/`gateway.log` |
| `/api/cron-run?agent=&profile=&job=&file=` | one cron run report (`cron/output/<job>/<ts>.md`) |
| `/styles.css` | stylesheet (whitelisted) |
| `/js/<name>.js` | ES modules (regex-validated name, no path traversal) |

No POST / PUT / DELETE. All agent/job/file params regex-validated against the discovered agent set to block path traversal.

---

## 5. UI

Single page, vanilla JS split into native ES modules (no bundler — server sets `text/javascript` and the browser resolves `import`). State (`SNAP`/`SELECTED`/`UI` in `core.js`) survives re-renders; the SSE client diffs the snapshot and skips render when unchanged.

**Header:** `#_ADMIN.SYS` brand · `|` · live-feed dot + `N agents` / `N profiles` badges · **filters** (`running` / `stopped` / `clear`) · **agents** multi-select dropdown (default `all`).

- **Filters & dropdown are global** — applied by `agents()` in `core.js`, so they affect **every tab**, not just Overview. `clear` resets running/stopped (leaves the dropdown selection).
- **Live-feed dot** pulses green; turns **red** on SSE disconnect (fill + pulse share one `--dot-c` var).

**Tabs (sidebar):** Overview · Agents · **Profiles** · Cron · Tasks · Sessions · Logs.

- **Overview**
  - **KPI boxes** (7): agents, profiles, active agents, running tasks, total sessions, total crons, failed crons. The four that are **buttons** (agents, profiles, total sessions, total crons) carry a corner **link badge** and jump to their tab; the rest are plain.
  - **Agent cards** — per agent (main profile): gateway state + `main` badge + model, platform pills, session/active/cron/skill/profile stats, 7-day session sparkline, skill categories. Card shadow is colored by health (green = running, red = stopped/failed, yellow = unknown). Cards do **not** jump.
  - **Sections** (non-clickable): **PROFILES** (per-profile table: agent · profile · model · state · cron · channels · sessions), **CRON** (next 5 jobs), **TOP SKILLS** (top-10 by use per agent), **TOKENS**, **INCIDENTS (LOGS)** (errors · cron failures · exits).
- **Agents** — per agent: profiles table (name/model), skills-usage table, MEMORY (MEMORY.md / USER.md).
- **Profiles** — per agent, one block per profile: name + model + its channel/dm/thread bindings.
- **Cron** — scheduled jobs (sortable), plain-English schedule, run-history `<details>` → open a past run report (`/api/cron-run`).
- **Tasks** — kanban task runs, status filter chips, sortable columns.
- **Sessions** — recent sessions + total per agent.
- **Logs** — error/warn issues, per-level filter chips, open-full links (`/api/log`).

**Theme:** AXIS industrial light neo-brutalist — thick black borders, hard offset shadows (no blur), orange `#FF3E00` accent; buttons share a press effect (shadow collapses + `translate(3px,3px)` on `:active`).

---

## 6. Docker

- `Dockerfile`: `python:3-slim`, copies `server.py`, `web/`, `readers/`. No `pip install`. `CMD python server.py`.
- `docker-compose.yaml`:
  - maps `127.0.0.1:1999:1999` (localhost only on host).
  - mounts each agent home into `/data/<name>` as `:ro` (added one by one as agents onboard).
  - env: `DATA_ROOT=/data`, `PORT=1999`, `SSE_INTERVAL=5`, `APP_VERSION`.

```bash
docker compose up -d --build
# open http://127.0.0.1:1999
```

`make` is for spinning up containers (it never runs tests itself):

```
make           # = make test: build the test image + run the whole suite in a container
make run       # rebuild the app image + run it (compose, foreground, :1999)
make run-bg    # same, detached
make stop      # docker compose down
make help
```

---

## 7. Tests

Three tiers. Tiers 1–2 are pip/npm-free; tier 3 (browser) needs node + playwright/chromium (isolated under `tests/e2e/`, never touching the app's zero-dep core). Tests run via a plain script, **no make**:

```
bash tests/run.sh                       # all tiers
bash tests/run.sh py                    # python reader + server unittest
bash tests/run.sh render                # node DOM-shim render smoke
bash tests/run.sh e2e                   # playwright browser tests (all specs)
bash tests/run.sh e2e custom_ui.spec.js # one spec (extra args forwarded to playwright)
bash tests/run.sh e2e -g custom_ui_test # by test-name grep
```

| Tier | What | File(s) | Catches |
| --- | --- | --- | --- |
| **1. readers + server** | `python3 -m unittest` against a generated fixture `DATA_ROOT` | `tests/test_readers.py`, `tests/test_server.py`, `tests/_fixture.py` | parsing/aggregation, fail-soft, endpoint routing + **path-traversal** security |
| **2. render smoke** | real ES modules loaded under a fake DOM, assert produced HTML per tab/section | `tests/test_render.mjs`, `tests/dom_shim.mjs` | module-load failures, render crashes |
| **3. browser e2e** | Playwright + chromium drives the live server against the fixture | `tests/e2e/*.spec.js` | real clicks, tab/filter **state**, computed CSS (shadows/colors), press/hover/pulse |

e2e specs: `ui.spec.js` (core flows), `interactions.spec.js` (Tasks/Cron/Sessions/Logs), `visual.spec.js` (layout + colors + KPI link badges), `custom_ui.spec.js` (`custom_ui_test` — filters + dropdown on every tab, filter-button style/hover/press consistency).

**In a container** (no host setup — the test image bundles python + node + chromium):

```bash
docker run --rm adminsys-test                                         # all tiers
docker run --rm adminsys-test bash tests/run.sh e2e custom_ui.spec.js # one spec
```

The e2e harness builds the same fixture (`tests/e2e/build_fixture.py`) and launches the real `server.py` on `:1996` inside the container. `Dockerfile.test` orders layers so editing source never re-runs npm install or the chromium download.

---

## 8. Out of scope (v1)

- No control / write actions (start/stop agents, edit tasks, send messages).
- No auth (localhost-only bind; add reverse-proxy/password later).
- No multi-host; single host, local bind mounts.
- File-only — no live gateway API polling (hermes-workspace does this; here everything comes from files on disk).
