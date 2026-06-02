"""Tokens reader: aggregates token usage from <agent>/response_store.db.

Each `responses.data` row is a stored response payload that may carry a usage
block (input/output/total tokens) and a model. Aggregated into a total + a
per-model breakdown. Read-only sqlite; tolerant of empty/odd rows.
"""

import json
import os
import sqlite3


def _connect_ro(path):
    uri = "file:{}?mode=ro&immutable=1".format(path)
    return sqlite3.connect(uri, uri=True, timeout=2)


def _find(o, key, depth=0):
    """Depth-limited recursive search for the first value of `key`."""
    if depth > 5:
        return None
    if isinstance(o, dict):
        if key in o:
            return o[key]
        for v in o.values():
            r = _find(v, key, depth + 1)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o[:8]:
            r = _find(v, key, depth + 1)
            if r is not None:
                return r
    return None


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def read(agent_path):
    path = os.path.join(agent_path, "response_store.db")
    if not os.path.exists(path):
        return {"available": False}

    conn = None
    try:
        conn = _connect_ro(path)
        if not conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='responses'"
        ).fetchone():
            return {"available": False}

        total = 0
        calls = 0
        per_model = {}
        for (data,) in conn.execute("SELECT data FROM responses"):
            calls += 1
            try:
                d = json.loads(data)
            except (TypeError, ValueError):
                continue
            usage = _find(d, "usage") or {}
            it = _int(usage.get("input_tokens") or usage.get("prompt_tokens"))
            ot = _int(usage.get("output_tokens") or usage.get("completion_tokens"))
            tt = _int(usage.get("total_tokens")) or (it + ot)
            total += tt
            model = _find(d, "model") or "unknown"
            m = per_model.setdefault(model, {"tokens": 0, "calls": 0})
            m["tokens"] += tt
            m["calls"] += 1

        models = sorted(
            ({"model": k, "tokens": v["tokens"], "calls": v["calls"]}
             for k, v in per_model.items()),
            key=lambda x: -x["tokens"],
        )
        return {"available": True, "responses": calls, "total_tokens": total, "models": models}
    except sqlite3.Error as exc:
        return {"available": False, "error": str(exc)}
    finally:
        if conn is not None:
            conn.close()
