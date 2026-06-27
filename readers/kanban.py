"""Kanban reader: read-only view of <agent>/kanban.db.

Reads the `tasks` board and recent `task_runs`. Columns are introspected with
PRAGMA so the reader tolerates schema changes across Hermes versions.
"""

import os
import sqlite3

RECENT_RUNS = 25
RECENT_TASKS = 50


def _connect_ro(path):
    # immutable=1 avoids touching -wal/-shm on a read-only mount.
    uri = "file:{}?mode=ro&immutable=1".format(path)
    return sqlite3.connect(uri, uri=True, timeout=2)


def _table_exists(conn, name):
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    )
    return cur.fetchone() is not None


def _rows(conn, sql, params=()):
    cur = conn.execute(sql, params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def read(agent_path):
    path = os.path.join(agent_path, "kanban.db")
    if not os.path.exists(path):
        return {"available": False}

    conn = None
    try:
        conn = _connect_ro(path)
        out = {"available": True, "tasks": [], "runs": [],
               "tasks_total": 0, "runs_total": 0}

        if _table_exists(conn, "tasks"):
            out["tasks_total"] = conn.execute(
                "SELECT COUNT(*) FROM tasks").fetchone()[0]
            # task counts by status (lowercased) — drives the blocked-tasks KPI
            by_status = {}
            for st, c in conn.execute(
                    "SELECT status, COUNT(*) FROM tasks GROUP BY status"):
                by_status[(st or "unknown").lower()] = c
            out["by_status"] = by_status
            out["blocked"] = by_status.get("blocked", 0)
            out["crashed"] = by_status.get("crashed", 0)
            out["tasks"] = _rows(
                conn,
                "SELECT * FROM tasks ORDER BY rowid DESC LIMIT ?",
                (RECENT_TASKS,),
            )
        if _table_exists(conn, "task_runs"):
            out["runs_total"] = conn.execute(
                "SELECT COUNT(*) FROM task_runs").fetchone()[0]
            out["runs"] = _rows(
                conn,
                "SELECT id, task_id, profile, status, outcome, summary, "
                "started_at, ended_at, error FROM task_runs "
                "ORDER BY started_at DESC LIMIT ?",
                (RECENT_RUNS,),
            )
        return out
    except sqlite3.Error as exc:
        return {"available": False, "error": str(exc)}
    finally:
        if conn is not None:
            conn.close()
