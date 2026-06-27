"""Soul reader: the main agent's persona files — <agent>/SOUL.md and
<agent>/AGENTS.md.

A short preview (first chars) of each is embedded so the UI can show it inline;
the full files are available on demand via /api/file (name=soul / name=agents).
Main profile only.
"""

import os

PREVIEW_CHARS = 600   # cap embedded preview so the snapshot stays small


def _preview(path):
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(PREVIEW_CHARS + 1)
    except OSError:
        return None
    return {"text": text[:PREVIEW_CHARS], "truncated": len(text) > PREVIEW_CHARS}


def read(agent_path):
    soul = _preview(os.path.join(agent_path, "SOUL.md"))
    agents = _preview(os.path.join(agent_path, "AGENTS.md"))
    if soul is None and agents is None:
        return {"available": False}
    return {
        "available": True,
        "preview": soul,                 # SOUL.md
        "has_soul": soul is not None,
        "agents_preview": agents,        # AGENTS.md
        "has_agents": agents is not None,
    }
