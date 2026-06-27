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


def build(root):
    """Populate `root` with agents: alpha (rich, +sub-profile beta) and empty."""
    a = os.path.join(root, "alpha")

    _json(os.path.join(a, "gateway_state.json"), {
        "gateway_state": "running", "active_agents": 1,
        "platforms": {"discord": {"state": "connected"}},
        "exit_reason": None, "updated_at": FUTURE, "pid": 123,
    })
    _w(os.path.join(a, "config.yaml"), "model:\n  default: test-model\n")

    _kanban_db(os.path.join(a, "kanban.db"))
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

    # a plain folder with no hermes files (discovered, all readers unavailable)
    os.makedirs(os.path.join(root, "empty"), exist_ok=True)
    # a hidden folder that discovery must ignore
    os.makedirs(os.path.join(root, ".hidden"), exist_ok=True)
    return root


def make_root():
    """Create a tempdir DATA_ROOT, populate it, return its path."""
    root = tempfile.mkdtemp(prefix="admsys-fix-")
    return build(root)
