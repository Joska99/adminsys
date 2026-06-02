"""Memory reader: <agent>/memories/MEMORY.md and USER.md content (truncated)."""

import os

LIMIT = 6000


def _read(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(LIMIT + 1)
    except OSError:
        return None
    if len(text) > LIMIT:
        return text[:LIMIT] + "\n…(truncated)"
    return text


def read(agent_path):
    mem = _read(os.path.join(agent_path, "memories", "MEMORY.md"))
    usr = _read(os.path.join(agent_path, "memories", "USER.md"))
    if mem is None and usr is None:
        return {"available": False}
    return {"available": True, "memory": mem, "user": usr}
