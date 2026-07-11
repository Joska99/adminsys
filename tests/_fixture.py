"""Build a throwaway DATA_ROOT with fixture agents for the reader/server tests.

No binary fixtures are committed: sqlite DBs and json/log files are generated
at test time into a tempdir. Mirrors a real Hermes data home closely enough to
exercise every reader, including a sub-profile under profiles/.
"""

import json
import os
import sqlite3
import tempfile

# a future + a past ISO timestamp, so relTime / next_run assertions are stable
FUTURE = "2099-01-01T00:00:00+00:00"
PAST = "2000-01-01T00:00:00+00:00"


def _w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def _json(path, obj):
    _w(path, json.dumps(obj))


def _kanban_db(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE tasks (id TEXT, title TEXT, status TEXT)")
    conn.execute("CREATE TABLE task_runs (id TEXT, task_id TEXT, profile TEXT, "
                 "status TEXT, outcome TEXT, summary TEXT, started_at TEXT, "
                 "ended_at TEXT, error TEXT)")
    conn.execute("INSERT INTO tasks VALUES ('t1','build','in_progress')")
    conn.executemany(
        "INSERT INTO task_runs VALUES (?,?,?,?,?,?,?,?,?)",
        [
            ("r1", "t1", "main", "running", "", "doing it", "2026-06-01T10:00:00", None, None),
            ("r2", "t1", "main", "failed", "bad", "broke", "2026-06-02T10:00:00", "2026-06-02T10:01:00", "boom"),
        ],
    )
    # card-detail tables (subset of the real schema) for the /api/task view
    conn.execute("CREATE TABLE task_comments (id INTEGER, task_id TEXT, author TEXT, "
                 "body TEXT, created_at TEXT)")
    conn.execute("INSERT INTO task_comments VALUES (1,'t1','default','created: build',"
                 "'2026-06-01T09:59:00')")
    conn.execute("CREATE TABLE task_events (id INTEGER, task_id TEXT, run_id TEXT, "
                 "kind TEXT, payload TEXT, created_at TEXT)")
    conn.execute("INSERT INTO task_events VALUES (1,'t1','r1','claimed',"
                 "'{\"lock\":\"x\"}','2026-06-01T10:00:00')")
    conn.commit()
    conn.close()


def _board_db(path):
    """Named-board kanban.db (kanban/boards/<slug>/) with one done task."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE tasks (id TEXT, title TEXT, status TEXT)")
    conn.execute("CREATE TABLE task_runs (id TEXT, task_id TEXT, profile TEXT, "
                 "status TEXT, outcome TEXT, summary TEXT, started_at TEXT, "
                 "ended_at TEXT, error TEXT)")
    conn.execute("INSERT INTO tasks VALUES ('t2','render set','done')")
    conn.execute("INSERT INTO task_runs VALUES ('r3','t2','cg','done','ok',"
                 "'rendered','2026-06-03T10:00:00','2026-06-03T10:05:00',NULL)")
    conn.commit()
    conn.close()


def _response_db(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE responses (id INTEGER, data TEXT)")
    payload = {"model": "m1", "usage": {"input_tokens": 10, "output_tokens": 5}}
    conn.execute("INSERT INTO responses VALUES (1, ?)", (json.dumps(payload),))
    conn.commit()
    conn.close()


def _state_db(path):
    """Minimal modern-Hermes state.db: sessions + messages (transcript source)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE sessions (id TEXT, started_at INTEGER, message_count INTEGER, "
        "title TEXT, model TEXT, source TEXT, ended_at INTEGER, "
        "estimated_cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER)")
    conn.execute(
        "CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, "
        "content TEXT, tool_name TEXT, timestamp INTEGER)")
    conn.execute(
        "INSERT INTO sessions VALUES ('20260603_120000_ccc', 1780500000, 2, "
        "'beta test session', 'beta-model', 'cron', 1780500100, 0.01, 100, 50)")
    conn.executemany(
        "INSERT INTO messages (session_id, role, content, tool_name, timestamp) "
        "VALUES (?,?,?,?,?)",
        [
            ("20260603_120000_ccc", "user", "hello beta", None, 1780500000),
            ("20260603_120000_ccc", "assistant", "beta says hi", None, 1780500050),
        ])
    conn.commit()
    conn.close()


def build(root):
    """Populate `root` with agents: alpha (rich, +sub-profile beta) and empty."""
    a = os.path.join(root, "alpha")

    _json(os.path.join(a, "gateway_state.json"), {
        "gateway_state": "running", "active_agents": 1,
        "platforms": {"discord": {"state": "connected"}},
        "exit_reason": None, "updated_at": FUTURE, "pid": 123,
    })
    _w(os.path.join(a, "config.yaml"),
       "model:\n  default: test-model\n  provider: test-prov\n")

    _kanban_db(os.path.join(a, "kanban.db"))
    # named board a1k0 (kanban/boards/<slug>/) + the active-board marker
    _board_db(os.path.join(a, "kanban", "boards", "a1k0", "kanban.db"))
    _json(os.path.join(a, "kanban", "boards", "a1k0", "board.json"),
          {"slug": "a1k0", "name": "A1k0", "icon": "🧚", "archived": False})
    _w(os.path.join(a, "kanban", "current"), "a1k0")
    _response_db(os.path.join(a, "response_store.db"))

    _json(os.path.join(a, "cron", "jobs.json"), {"jobs": [{
        "id": "job1", "name": "daily", "schedule_display": "every day",
        "skill": "digest", "model": "m", "enabled": True,
        "next_run_at": FUTURE, "last_status": "done",
    }], "updated_at": PAST})
    _w(os.path.join(a, "cron", "output", "job1", "2026-06-01_10-00-00.md"), "run report")

    # sessions: 3-line file -> 2 msgs, 2-line file -> 1 msg
    _w(os.path.join(a, "sessions", "20260601_100000_aaa.jsonl"), "meta\nx\ny\n")
    _w(os.path.join(a, "sessions", "20260602_110000_bbb.jsonl"), "meta\nx\n")

    _json(os.path.join(a, "skills", ".usage.json"), {
        "gen": {"use_count": 5, "last_used_at": PAST, "state": "active"},
        "unused": {"use_count": 0},
    })
    _json(os.path.join(a, ".skills_prompt_snapshot.json"), {"skills": [
        {"skill_name": "gen", "category": "core"},
        {"skill_name": "two", "category": "core"},
    ]})

    _w(os.path.join(a, "logs", "errors.log"),
       "2026 ERROR boom\n2026 WARNING heads up\nplain info line\n")
    _w(os.path.join(a, "memories", "MEMORY.md"), "remember this")
    _w(os.path.join(a, "vault", "secret1"), "x")   # 1 vault entry (content irrelevant)
    _w(os.path.join(a, "auth.lock"), "")           # auth locked

    _json(os.path.join(a, "channel_directory.json"), {"platforms": {"discord": [
        {"type": "channel", "name": "general", "id": "1"},
        {"type": "dm", "name": "bob", "id": "2"},
        {"type": "thread", "name": "t", "id": "3"},
    ]}, "updated_at": PAST})

    # sub-profile beta: own config/gateway/channels/cron, description + a skill
    b = os.path.join(a, "profiles", "beta")
    _w(os.path.join(b, "config.yaml"), "model:\n  default: beta-model\n")
    _w(os.path.join(b, "profile.yaml"),
       'description: "Beta sub-profile for tests"\ndescription_auto: false\n')
    _w(os.path.join(b, "SOUL.md"), "# Beta\n\nBeta persona soul text.")
    _w(os.path.join(b, "AGENTS.md"), "# Beta agents\n\nBeta agents instructions.")
    _json(os.path.join(b, "gateway_state.json"), {"gateway_state": "stopped"})
    _json(os.path.join(b, "channel_directory.json"), {"platforms": {"discord": [
        {"type": "channel", "name": "news", "id": "9"},
    ]}})
    _json(os.path.join(b, "cron", "jobs.json"), {"jobs": [{"id": "job2", "name": "hourly"}]})
    _w(os.path.join(b, "skills", "research", "demo", "SKILL.md"), "---\nname: demo\n---\n")
    # worker-side skill usage — the reader must merge this with the root file
    _json(os.path.join(b, "skills", ".usage.json"), {
        "gen": {"use_count": 3, "last_used_at": FUTURE, "state": "active"},
        "reply": {"use_count": 2, "last_used_at": PAST},
    })
    _state_db(os.path.join(b, "state.db"))   # modern sessions backend + transcript

    # a plain folder with no hermes files (discovered, all readers unavailable)
    os.makedirs(os.path.join(root, "empty"), exist_ok=True)
    # a hidden folder that discovery must ignore
    os.makedirs(os.path.join(root, ".hidden"), exist_ok=True)
    return root


def make_root():
    """Create a tempdir DATA_ROOT, populate it, return its path."""
    root = tempfile.mkdtemp(prefix="admsys-fix-")
    return build(root)
