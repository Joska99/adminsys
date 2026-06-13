"""Sessions reader.

Modern Hermes stores sessions in ``<agent>/state.db`` (table ``sessions`` +
``messages``); older agents wrote one ``<agent>/sessions/*.jsonl`` per session.
This reader prefers ``state.db`` and falls back to the legacy ``.jsonl`` layout,
so a dashboard never freezes when an agent migrates from files to SQLite.

Output shape (both backends): ``{available, total, recent:[{id, started_at,
messages, ...}], daily7:[{date, count}]}``.
"""

import datetime
import glob
import os
import sqlite3

RECENT = 15
DAYS = 7


# ── state.db backend (current Hermes) ───────────────────────────────────────

def _iso(ts):
    """Unix seconds -> tz-aware ISO 'YYYY-MM-DDTHH:MM:SS+00:00' (UTC). None-safe.
    The +00:00 matters: without it the browser parses the string as LOCAL time,
    so a recent session shows hours off (by the viewer's UTC offset)."""
    if not isinstance(ts, (int, float)):
        return None
    return datetime.datetime.fromtimestamp(
        ts, datetime.timezone.utc).isoformat(timespec="seconds")


def _connect_ro(db_path):
    """Open read-only. state.db is WAL; on a read-only bind mount a plain
    ``mode=ro`` open can fail (needs to write -shm), so fall back to
    ``immutable=1`` which reads the main file only. Returns a connection or
    raises the last error."""
    last = None
    for uri in ("file:{}?mode=ro".format(db_path),
                "file:{}?immutable=1".format(db_path)):
        try:
            con = sqlite3.connect(uri, uri=True, timeout=2)
            con.execute("SELECT 1 FROM sessions LIMIT 1")  # force a real read
            return con
        except sqlite3.Error as exc:
            last = exc
    raise last if last else sqlite3.Error("cannot open sessions")


def _has_sessions_table(db_path):
    try:
        con = sqlite3.connect("file:{}?mode=ro".format(db_path), uri=True, timeout=2)
    except sqlite3.Error:
        try:
            con = sqlite3.connect("file:{}?immutable=1".format(db_path), uri=True, timeout=2)
        except sqlite3.Error:
            return False
    try:
        row = con.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'"
        ).fetchone()
        return row is not None
    except sqlite3.Error:
        return False
    finally:
        con.close()


def _read_db(db_path):
    con = _connect_ro(db_path)
    try:
        total = con.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

        recent = []
        cur = con.execute(
            "SELECT id, started_at, message_count, title, model, source, "
            "ended_at, estimated_cost_usd "
            "FROM sessions ORDER BY started_at DESC LIMIT ?", (RECENT,))
        for r in cur.fetchall():
            recent.append({
                "id": str(r[0]),
                "started_at": _iso(r[1]),
                "messages": r[2],
                "title": r[3],
                "model": r[4],
                "source": r[5],
                "ended_at": _iso(r[6]),
                "cost_usd": r[7],
            })

        # daily7: group by UTC day from the unix started_at, then map onto the
        # trailing 7-day window (oldest -> newest), zero-filling missing days.
        by_day = {}
        for d, c in con.execute(
            "SELECT date(started_at, 'unixepoch') AS d, COUNT(*) "
            "FROM sessions GROUP BY d"
        ).fetchall():
            if d:
                by_day[d] = c
        today = datetime.datetime.now(datetime.timezone.utc).date()
        window = [today - datetime.timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
        daily7 = [{"date": d.isoformat(), "count": by_day.get(d.isoformat(), 0)}
                  for d in window]

        # spend: estimated_cost_usd summed over the last 7d and all-time.
        cutoff = datetime.datetime.now(datetime.timezone.utc).timestamp() - DAYS * 86400
        cost_7d = con.execute(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM sessions WHERE started_at >= ?",
            (cutoff,)).fetchone()[0]
        cost_total = con.execute(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM sessions").fetchone()[0]
        cutoff_30 = datetime.datetime.now(datetime.timezone.utc).timestamp() - 30 * 86400
        cost_30d = con.execute(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM sessions WHERE started_at >= ?",
            (cutoff_30,)).fetchone()[0]
        tok_sum = ("SELECT COALESCE(SUM(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)),0) "
                   "FROM sessions")
        tokens_7d = con.execute(tok_sum + " WHERE started_at >= ?", (cutoff,)).fetchone()[0]
        tokens_30d = con.execute(tok_sum + " WHERE started_at >= ?", (cutoff_30,)).fetchone()[0]
        tokens_total = con.execute(tok_sum).fetchone()[0]

        # session count grouped by source (cron / discord / ...), lowercased keys
        by_source = {}
        for src, c in con.execute(
            "SELECT source, COUNT(*) FROM sessions GROUP BY source").fetchall():
            key = (src or "unknown").lower()
            by_source[key] = by_source.get(key, 0) + c   # merge case variants

        return {
            "available": True, "total": total, "recent": recent, "daily7": daily7,
            "last_active": recent[0]["started_at"] if recent else None,
            "cost_7d": cost_7d, "cost_30d": cost_30d, "cost_total": cost_total,
            "tokens_7d": tokens_7d, "tokens_30d": tokens_30d, "tokens_total": tokens_total,
            "by_source": by_source,
        }
    finally:
        con.close()


# ── legacy *.jsonl backend (older agents / test fixtures) ────────────────────

def _started_at(filename):
    base = os.path.basename(filename)
    parts = base.split("_")
    if len(parts) >= 2 and len(parts[0]) == 8 and len(parts[1]) == 6:
        d, t = parts[0], parts[1]
        return "{}-{}-{}T{}:{}:{}".format(
            d[0:4], d[4:6], d[6:8], t[0:2], t[2:4], t[4:6]
        )
    return None


def _count_lines(path):
    try:
        with open(path, "rb") as fh:
            n = sum(1 for _ in fh)
        return max(n - 1, 0)  # drop session_meta header
    except OSError:
        return None


def _read_jsonl(sessions_dir):
    try:
        files = sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl")))
    except OSError as exc:
        return {"available": False, "error": str(exc)}

    recent = []
    for path in files[-RECENT:][::-1]:
        recent.append({
            "id": os.path.basename(path).rsplit(".", 1)[0],
            "started_at": _started_at(path),
            "messages": _count_lines(path),
        })
    return {
        "available": True,
        "total": len(files),
        "recent": recent,
        "daily7": _daily7_jsonl(files),
        "last_active": recent[0]["started_at"] if recent else None,
        "cost_7d": 0, "cost_30d": 0, "cost_total": 0,    # only tracked in state.db
        "tokens_7d": 0, "tokens_30d": 0, "tokens_total": 0,
        "by_source": {},   # source not recorded in legacy jsonl
    }


def _daily7_jsonl(files):
    today = datetime.datetime.now(datetime.timezone.utc).date()
    window = [today - datetime.timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
    counts = {d.isoformat(): 0 for d in window}
    for path in files:
        prefix = os.path.basename(path)[:8]
        try:
            d = datetime.date(int(prefix[0:4]), int(prefix[4:6]), int(prefix[6:8]))
        except ValueError:
            continue
        key = d.isoformat()
        if key in counts:
            counts[key] += 1
    return [{"date": d.isoformat(), "count": counts[d.isoformat()]} for d in window]


# ── entry point ──────────────────────────────────────────────────────────────

def read(agent_path):
    """Prefer state.db (current), fall back to legacy sessions/*.jsonl."""
    db_path = os.path.join(agent_path, "state.db")
    if os.path.isfile(db_path) and _has_sessions_table(db_path):
        try:
            return _read_db(db_path)
        except sqlite3.Error as exc:
            # DB present but unreadable — surface rather than silently empty.
            return {"available": False, "error": "state.db: {}".format(exc)}

    sessions_dir = os.path.join(agent_path, "sessions")
    if os.path.isdir(sessions_dir):
        return _read_jsonl(sessions_dir)

    return {"available": False}
