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
│   ├── profiles.py      # profiles/* + config.yaml -> default model
│   ├── skills.py        # skills/.usage.json -> used + top-10 by use_count
│   ├── logs.py          # logs/*.log -> error/warn issues + counts
│   ├── memory.py        # memories/MEMORY.md + USER.md
│   ├── channels.py      # channel_directory.json -> channels / dms / threads
│   └── tokens.py        # response_store.db -> token usage
├── js/                  # ES modules, native import/export (no build step)
│   ├── core.js          # state (SNAP/SELECTED/UI), helpers, filters, exports
│   ├── render-overview.js
│   ├── render-tabs.js   # agents / tasks / schedule / sessions / logs renderers
│   └── main.js          # entry: renderAll, applySnapshot, event wiring, SSE
├── index.html           # single page, loads js/main.js as <script type="module">
├── styles.css           # AXIS light neo-brutalist theme
├── Dockerfile           # python:3-slim, no extra deps
├── docker-compose.yaml  # mounts /data :ro, maps 127.0.0.1:1999
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
| Reader | Source in agent folder | Shows |
| --- | --- | --- |
| `gateway` | `gateway_state.json` | gateway running/stopped, platform connection state, active agents, uptime |
| `kanban` | `kanban.db` (ro sqlite) | task runs: status, outcome, summary, timing, error |
| `cron` | `cron/jobs.json` (main + `profiles/*/cron`), `cron/output/<job>/*.md` | scheduled jobs, schedule→plain English, failed count, run history per job |
| `sessions` | `sessions/*.jsonl` | recent sessions + total count |
| `profiles` | `profiles/*`, `config.yaml` | default model, channel bindings |
| `skills` | `skills/.usage.json` | skills with `use_count > 0`, top 10 used |
| `logs` | `logs/errors.log`, `agent.log`, `gateway.log` | error/warn issues, tagged + counted |
| `memory` | `memories/MEMORY.md`, `USER.md` | memory snapshot |
| `channels` | `channel_directory.json` | channels / dms / threads by type |
| `tokens` | `response_store.db` (ro sqlite) | token usage |

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

Single page, vanilla JS split into native ES modules (no bundler — server sets `text/javascript` and the browser resolves `import`). State object survives re-renders; SSE client diffs the snapshot and skips render when unchanged.

Header: `#_ADMIN.SYS` brand, **filters** (running / stopped), **agents** multi-select dropdown (default `all`).

Tabs (sidebar): **Overview**, **Agents**, **Cron**, **Tasks**, **Sessions**, **Logs**.

- **Overview** — per-agent cards (gateway status, cron/task/session counts, top skills, tokens), global KPI boxes, incidents.
- **Agents** — per agent: model, profiles, channels, memory.
- **Cron** — scheduled jobs, plain-English schedule, run history → open a past run report.
- **Tasks** — kanban task runs by status.
- **Sessions** — recent sessions + total.
- **Logs** — error/warn issues, per-level filter, open full log.

---

## 6. Docker

- `Dockerfile`: `python:3-slim`, copies `server.py index.html styles.css`, `js/`, `readers/`. No `pip install`. `CMD python server.py`.
- `docker-compose.yaml`:
  - maps `127.0.0.1:1999:1999` (localhost only on host).
  - mounts each agent home into `/data/<name>` as `:ro` (added one by one as agents onboard).
  - env: `DATA_ROOT=/data`, `PORT=1999`, `SSE_INTERVAL=5`, `APP_VERSION`.

```bash
docker compose up -d --build
# open http://127.0.0.1:1999
```

---

## 7. Out of scope (v1)

- No control / write actions (start/stop agents, edit tasks, send messages).
- No auth (localhost-only bind; add reverse-proxy/password later).
- No multi-host; single host, local bind mounts.
- File-only — no live gateway API polling (hermes-workspace does this; here everything comes from files on disk).
