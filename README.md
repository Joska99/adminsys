# Hermes Mission Control

Read-only **admission center / mission control dashboard** for my Hermes agents. Shows live status and activity pulled straight from each agent's data folder. No control actions in v1 — display only.

Built DevOps-style: Docker container, Python **stdlib only** (no pip, no npm), modular reader-per-source layout so panels are easy to maintain and extend later.

- **Port:** 1999
- **Mode:** read-only (no writes to agent data, no control endpoints)
- **Stack:** Python 3 standard library only (`http.server`, `json`, `sqlite3`, `glob`, `pathlib`, `os`)
- **Reference designs:** [outsourc-e/hermes-workspace](https://github.com/outsourc-e/hermes-workspace) (UI ideas), [komputermechanic hermes-dashboard guide](https://komputermechanic.com/tutorials/hermes-dashboard) (backend/data patterns, glassmorphism UI)

---

## 1. How agents are discovered

I mount each agent's home into the container's `/data` folder one by one, read-only. **Every immediate subfolder of `/data` is treated as one agent.** No name pattern matching — folder name = agent name.

```
/data/
├── hermes-cc/        -> agent "hermes-cc"
├── hermes-news/      -> agent "hermes-news"
└── <whatever>/       -> agent "<whatever>"
```

`readers/discovery.py` lists immediate subdirectories of `DATA_ROOT` (default `/data`) and returns the agent list. Each agent folder is a Hermes data home and may contain: `gateway_state.json`, `kanban.db`, `cron/jobs.json`, `sessions/*.jsonl`, `profiles/*`, `config.yaml`, `channel_directory.json`, `logs/`, `memories/`.

All access is read-only:
- The bind mount is `:ro` (container cannot write agent data).
- SQLite is opened via read-only URI: `file:<path>?mode=ro&immutable=1`.

---

## 2. Project layout

```
_Agent_Mission_Control/
├── server.py            # ThreadingHTTPServer: routing, SSE, snapshot assembly
├── readers/
│   ├── __init__.py
│   ├── discovery.py     # list /data subfolders -> agents
│   ├── gateway.py       # gateway_state.json -> status dict
│   ├── kanban.py        # kanban.db -> task runs / events / comments (ro sqlite)
│   ├── cron.py          # cron/jobs.json -> jobs + schedule->plain english
│   ├── sessions.py      # sessions/*.jsonl -> recent list + total count
│   └── profiles.py      # profiles/* + config.yaml + channel_directory.json
├── index.html           # single-page UI, vanilla JS, SSE client
├── Dockerfile           # python:3-slim, no extra deps
├── docker-compose.yaml  # mounts /data :ro, maps 127.0.0.1:1999
└── README.md            # this spec
```

**Design rule:** each reader is a pure function `read(agent_path) -> dict`, wrapped in its own try/except. One reader failing returns `{"error": "..."}` and never crashes the server. Adding a panel = adding a reader file + a UI tab. Each reader is independently testable.

---

## 3. Readers → snapshot

`server.py` assembles a snapshot by calling every reader for every discovered agent:

```jsonc
{
  "generated_at": "<iso8601>",
  "agents": [
    {
      "name": "hermes-cc",
      "gateway":  { "gateway_state": "running|stopped", "platforms": {...}, "active_agents": 0, "uptime": "..." },
      "tasks":    [ { "task_id", "profile", "status", "outcome", "summary", "started_at", "ended_at", "error" } ],
      "cron":     [ { "id", "name", "schedule_human", "skill", "model" } ],
      "sessions": { "total": 123, "recent": [ { "id", "started_at", "messages" } ] },
      "profiles": [ { "name", "model", "channel_binding" } ]
    }
  ]
}
```

### Source mapping
| Reader | Source file(s) in agent folder | Shows |
| --- | --- | --- |
| `gateway` | `gateway_state.json` | gateway running/stopped, discord/api connection state, active agents, uptime |
| `kanban` | `kanban.db` → `task_runs`, `task_events`, `task_comments` | agent task execution: status (running/done/blocked/crashed/timed_out/failed), outcome, summary, timing, error |
| `cron` | `cron/jobs.json` | scheduled jobs: name, prompt/skill, model, schedule converted to plain English |
| `sessions` | `sessions/*.jsonl` | recent sessions + **total session count** |
| `profiles` | `profiles/*`, `config.yaml`, `channel_directory.json` | per-agent profiles, model, channel bindings |

---

## 4. Endpoints (all GET — read-only)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/` | `index.html` |
| GET | `/api/snapshot` | full snapshot JSON |
| GET | `/events` | SSE stream, re-pushes snapshot every 5s |
| GET | `/healthz` | liveness `{"ok": true}` |

No POST / PUT / DELETE. No board CRUD. (The earlier draft of this README had a writable task board — removed; v1 is strictly read-only.)

---

## 5. UI (`index.html`)

Single page, vanilla JS, SSE client, glassmorphism dark theme (per komputermechanic guide). Header has an **agent switcher** for multi-agent view.

Tabs:
1. **Overview** — every agent's gateway status + global totals (active agents, total sessions, running tasks).
2. **Agents** — per agent: profiles, model, channel bindings (from `profiles` reader).
3. **Tasks** — kanban task runs grouped by status, read-only.
4. **Schedule** — cron jobs with plain-English schedule.
5. **Sessions** — recent sessions + total count (optionally a logs tail later).

---

## 6. Docker

- `Dockerfile`: `python:3-slim`, copy app, `CMD python server.py`. No `pip install`.
- Server binds `0.0.0.0:1999` inside the container.
- `docker-compose.yaml`:
  - maps `127.0.0.1:1999:1999` (localhost only on host).
  - mounts each agent home into `/data/<name>` as `:ro` (added one by one as agents are onboarded).
  - sets `DATA_ROOT=/data`.

---

## 7. Out of scope (v1)

- No control / write actions (start/stop agents, edit tasks, send messages).
- No auth (localhost-only bind for now; add password/reverse-proxy later).
- No log aggregation beyond a simple tail (sessions/logs panel may grow later).
- No multi-host; single host, local bind mounts.

## 8. Build order

1. `discovery.py` + `server.py` skeleton (`/`, `/healthz`, empty `/api/snapshot`).
2. `gateway.py` reader + Overview tab.
3. `kanban.py` + Tasks tab.
4. `cron.py` + Schedule tab.
5. `sessions.py` + Sessions tab + totals.
6. `profiles.py` + Agents tab.
7. `/events` SSE + 5s refresh.
8. `Dockerfile` + `docker-compose.yaml`, verify container serves and reads a mounted agent `:ro`.


# ideas

  │                             Data                             │   On disk?    │                                          Notes                                          │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ gateway state, platforms                                     │ ✅            │ already have                                                                            │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ kanban tasks + runs (outcome/error/timing)                   │ ✅            │ have tasks; can show more                                                               │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ cron jobs + failures (last_status/last_error)                │ ✅            │ easy to flag                                                                            │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ sessions (count, files)                                      │ ✅            │ have                                                                                    │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ profiles, skills, model, config.yaml                         │ ✅            │ have                                                                                    │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ logs/errors (errors.log = 973 lines, agent.log, gateway.log) │ ✅ done           │ not used yet — high value                                                               │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ memory (memories/MEMORY.md, USER.md)                         │ ✅ done         │ not used                                                                                │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ channels (channel_directory.json)                            │ ✅ done           │ discord channels                                                                        │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ achievements (plugins/hermes-achievements)                   │ ✅            │ unlock count                                                                            │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ discord threads (discord_threads.json)                       │ ✅            │                                                                                         │
  ├──────────────────────────────────────────────────────────────┼───────────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
  │ tokens / cost / per-model                                    │ ⚠️             │ NOT in session files — lives in response_store.db responses.data (parseable, more work) │