"""Memory reader: which of <agent>/memories/{MEMORY.md,USER.md} exist.

A short preview (first lines) of each file is embedded so the UI can show it
inline; the full file is still available on demand via /api/file.
"""

import os

PREVIEW_CHARS = 600   # cap embedded preview so the snapshot stays small


def _preview(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(PREVIEW_CHARS + 1)
    except OSError:
        return None
    truncated = len(text) > PREVIEW_CHARS
    return {"text": text[:PREVIEW_CHARS], "truncated": truncated}


def read(agent_path):
    md = os.path.join(agent_path, "memories")
    mem_path = os.path.join(md, "MEMORY.md")
    user_path = os.path.join(md, "USER.md")
    has_memory = os.path.isfile(mem_path)
    has_user = os.path.isfile(user_path)
    if not has_memory and not has_user:
        return {"available": False}
    return {
        "available": True,
        "has_memory": has_memory,
        "has_user": has_user,
        "memory_preview": _preview(mem_path) if has_memory else None,
        "user_preview": _preview(user_path) if has_user else None,
    }
