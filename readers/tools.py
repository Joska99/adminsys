"""Tool-usage reader: runtime tool calls from state.db messages.

Counts messages whose `tool_name` is set (tool-result rows) and ranks the most
used tools. Reads ONLY the given path's own state.db — profiles.py calls this
once per profile (agent root = main, profiles/<p> = workers), so every block
shows that profile's usage and nothing else. Read-only.
"""

import os
import sqlite3

TOP = 10


def _connect_ro(db_path):
    last = None
    for uri in ("file:{}?mode=ro".format(db_path),
                "file:{}?immutable=1".format(db_path)):
        try:
            con = sqlite3.connect(uri, uri=True, timeout=2)
            con.execute("SELECT 1 FROM messages LIMIT 1")
            return con
        except sqlite3.Error as exc:
            last = exc
    raise last if last else sqlite3.Error("cannot open messages")


def read(agent_path):
    db_path = os.path.join(agent_path, "state.db")
    if not os.path.isfile(db_path):
        return {"available": False}
    try:
        con = _connect_ro(db_path)
    except sqlite3.Error as exc:
        return {"available": False, "error": str(exc)}
    try:
        rows = con.execute(
            "SELECT tool_name, COUNT(*) AS c FROM messages "
            "WHERE tool_name IS NOT NULL AND tool_name != '' "
            "GROUP BY tool_name ORDER BY c DESC").fetchall()
        return {
            "available": True,
            "total": sum(r[1] for r in rows),
            "distinct": len(rows),
            "top": [{"name": r[0], "count": r[1]} for r in rows[:TOP]],
        }
    except sqlite3.Error as exc:
        return {"available": False, "error": str(exc)}
    finally:
        con.close()
