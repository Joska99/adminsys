"""Channels reader: <agent>/channel_directory.json split into channels / dms /
thread count. The directory is an unpruned cache, so entries may be stale;
`updated_at` shows when it was last synced.
"""

import json
import os


def read(agent_path):
    path = os.path.join(agent_path, "channel_directory.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return {"available": False}
    except (OSError, ValueError) as exc:
        return {"available": False, "error": str(exc)}

    channels, dms, threads = [], [], []
    for platform, items in (data.get("platforms") or {}).items():
        if not isinstance(items, list):
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            t = (it.get("type") or "").lower()
            if t == "thread":
                threads.append(it.get("name") or it.get("id") or "thread")
                continue
            entry = {
                "platform": platform,
                "name": it.get("name"),
                "id": it.get("id"),
                "guild": it.get("guild"),
            }
            (dms if t == "dm" else channels).append(entry)

    return {
        "available": True,
        "channels": channels,
        "dms": dms,
        "threads": threads,
        "thread_count": len(threads),
        "updated_at": data.get("updated_at"),
    }
