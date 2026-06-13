"""Soul reader: the main agent's <agent>/SOUL.md persona file.

A short preview (first chars) is embedded so the UI can show it inline; the
full file is available on demand via /api/file (name=soul). Main profile only.
"""

import os

PREVIEW_CHARS = 600   # cap embedded preview so the snapshot stays small


def read(agent_path):
    path = os.path.join(agent_path, "SOUL.md")
    if not os.path.isfile(path):
        return {"available": False}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(PREVIEW_CHARS + 1)
    except OSError as exc:
        return {"available": False, "error": str(exc)}
    truncated = len(text) > PREVIEW_CHARS
    return {"available": True, "preview": {"text": text[:PREVIEW_CHARS], "truncated": truncated}}
