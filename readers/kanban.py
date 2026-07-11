"""Kanban reader: read-only view of <agent>/kanban.db.

Reads the `tasks` board and recent `task_runs`. Columns are introspected with
PRAGMA so the reader tolerates schema changes across Hermes versions.
"""

import datetime
import json
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


def _read_board_db(path):
    """One board's kanban.db -> tasks/runs/status counts, or None on error."""
    conn = None
    try:
        conn = _connect_ro(path)
        out = {"available": True, "tasks": [], "runs": [],
               "tasks_total": 0, "runs_total": 0,
               "by_status": {}, "blocked": 0, "crashed": 0}

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


def board_db_path(agent_path, board=None):
    """Resolve a board name to its kanban.db path. None/'' /'default' -> the
    agent-root db; anything else -> kanban/boards/<slug>/kanban.db."""
    if not board or board == "default":
        return os.path.join(agent_path, "kanban.db")
    return os.path.join(agent_path, "kanban", "boards", board, "kanban.db")


def _board_meta(boards_dir, slug):
    """Display name/icon from board.json (tolerant)."""
    try:
        with open(os.path.join(boards_dir, slug, "board.json"), encoding="utf-8") as fh:
            meta = json.load(fh)
        return {"title": meta.get("name") or slug, "icon": meta.get("icon") or "",
                "archived": bool(meta.get("archived"))}
    except (OSError, ValueError):
        return {"title": slug, "icon": "", "archived": False}


def read(agent_path):
    """Default board (agent-root kanban.db) + named boards under
    kanban/boards/<slug>/. Top-level fields aggregate ALL boards (KPIs);
    `boards` carries the per-board breakdown; `current` = active board slug."""
    default_path = os.path.join(agent_path, "kanban.db")
    boards = []
    if os.path.exists(default_path):
        b = _read_board_db(default_path)
        if b.get("available"):
            b.update({"name": "default", "title": "default", "icon": "", "archived": False})
            boards.append(b)
        else:
            return b   # db present but unreadable — surface the error
    boards_dir = os.path.join(agent_path, "kanban", "boards")
    try:
        slugs = sorted(os.listdir(boards_dir)) if os.path.isdir(boards_dir) else []
    except OSError:
        slugs = []
    for slug in slugs:
        db = board_db_path(agent_path, slug)
        if not os.path.isfile(db):
            continue
        b = _read_board_db(db)
        if not b.get("available"):
            continue
        b["name"] = slug
        b.update(_board_meta(boards_dir, slug))
        boards.append(b)

    if not boards:
        return {"available": False}

    current = None
    try:
        with open(os.path.join(agent_path, "kanban", "current"), encoding="utf-8") as fh:
            current = fh.read().strip() or None
    except OSError:
        pass

    by_status = {}
    for b in boards:
        for st, c in (b.get("by_status") or {}).items():
            by_status[st] = by_status.get(st, 0) + c

    # flat view = merged across boards, newest first — the overview KPIs
    # (running tasks, failure line, recent runs) read these; first-board-only
    # here froze the "running" box whenever work landed on a named board
    tasks, runs = [], []
    for b in boards:
        for t in b["tasks"]:
            tasks.append(dict(t, board=b["name"]))
        for r in b["runs"]:
            runs.append(dict(r, board=b["name"]))
    tasks.sort(key=lambda t: t.get("updated_at") or t.get("created_at") or 0, reverse=True)
    runs.sort(key=lambda r: r.get("started_at") or 0, reverse=True)

    return {
        "available": True,
        "boards": boards,
        "current": current,
        # aggregates across boards — the overview KPIs read these
        "tasks_total": sum(b["tasks_total"] for b in boards),
        "runs_total": sum(b["runs_total"] for b in boards),
        "by_status": by_status,
        "blocked": sum(b["blocked"] for b in boards),
        "crashed": sum(b["crashed"] for b in boards),
        "tasks": tasks[:50], "runs": runs[:25],
    }


def _ts(v):
    """Render a timestamp that may be unix seconds or already a string."""
    if isinstance(v, (int, float)) and v > 0:
        return datetime.datetime.fromtimestamp(
            v, datetime.timezone.utc).isoformat(timespec="seconds")
    return str(v) if v else "?"


def detail(agent_path, task_id, board=None):
    """Plain-text dashboard-style card view of one task: header + body +
    comments + events + runs. Returns None when the id is unknown; tolerates
    missing tables/columns (fixture DBs and older Hermes schemas)."""
    path = board_db_path(agent_path, board)
    if not os.path.exists(path):
        return None
    conn = _connect_ro(path)
    try:
        rows = _rows(conn, "SELECT * FROM tasks WHERE id = ?", (task_id,))
        if not rows:
            return None
        t = rows[0]
        g = t.get
        out = [
            "task {}  [{}]".format(t.get("id"), g("status") or "?"),
            "title:    {}".format(g("title") or "-"),
            "assignee: {}   skills: {}".format(g("assignee") or "-", g("skills") or "-"),
            "created:  {}   started: {}   completed: {}".format(
                _ts(g("created_at")), _ts(g("started_at")), _ts(g("completed_at"))),
            "=" * 72,
            "",
            "## Description",
            g("body") or "(empty)",
            "",
        ]
        if g("result"):
            out += ["## Result", str(g("result")), ""]
        if g("last_failure_error"):
            out += ["## Last failure", str(g("last_failure_error")), ""]

        if _table_exists(conn, "task_comments"):
            comments = _rows(conn, "SELECT * FROM task_comments WHERE task_id = ? "
                                   "ORDER BY id", (task_id,))
            out.append("## Comments ({})".format(len(comments)))
            for c in comments:
                out.append("[{}] {}: {}".format(
                    _ts(c.get("created_at")), c.get("author") or "?", c.get("body") or ""))
            out.append("")

        if _table_exists(conn, "task_events"):
            events = _rows(conn, "SELECT * FROM task_events WHERE task_id = ? "
                                 "ORDER BY id", (task_id,))
            out.append("## Events ({})".format(len(events)))
            for e in events:
                line = "[{}] {}".format(_ts(e.get("created_at")), e.get("kind") or "?")
                if e.get("payload"):
                    line += "  {}".format(str(e["payload"])[:300])
                out.append(line)
            out.append("")

        if _table_exists(conn, "task_runs"):
            runs = _rows(conn, "SELECT * FROM task_runs WHERE task_id = ? "
                               "ORDER BY started_at", (task_id,))
            out.append("## Runs ({})".format(len(runs)))
            for r in runs:
                out.append("[{} -> {}] {} @{}  outcome: {}  {}".format(
                    _ts(r.get("started_at")), _ts(r.get("ended_at")),
                    r.get("status") or "?", r.get("profile") or "?",
                    r.get("outcome") or "-", (r.get("summary") or "")[:200]))
                if r.get("error"):
                    out.append("    error: {}".format(str(r["error"])[:300]))
            out.append("")
        return "\n".join(out)
    except sqlite3.Error:
        return None
    finally:
        conn.close()
