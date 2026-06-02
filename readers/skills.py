"""Skills reader: the agent's active skill set.

Reads ``<agent>/.skills_prompt_snapshot.json`` (the skills injected into the
agent's prompt). Returns a total and a per-category grouping of skill names.
"""

import json
import os


def read(agent_path):
    path = os.path.join(agent_path, ".skills_prompt_snapshot.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return {"available": False}
    except (OSError, ValueError) as exc:
        return {"available": False, "error": str(exc)}

    raw = data.get("skills")
    if not isinstance(raw, list):
        return {"available": False}

    by_category = {}
    seen = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("skill_name") or item.get("frontmatter_name")
        if not name or name in seen:
            continue
        seen.add(name)
        cat = item.get("category") or "other"
        by_category.setdefault(cat, []).append(name)

    for names in by_category.values():
        names.sort()

    categories = sorted(
        ({"name": c, "count": len(n)} for c, n in by_category.items()),
        key=lambda x: (-x["count"], x["name"]),
    )

    return {
        "available": True,
        "total": len(seen),
        "categories": categories,
        "by_category": by_category,
        "used": (used := _used(agent_path)),
        "top_used": used[:10],
    }


def _used(agent_path):
    """All used skills (use_count > 0) sorted by count, from skills/.usage.json."""
    path = os.path.join(agent_path, "skills", ".usage.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            usage = json.load(fh)
    except (OSError, ValueError):
        return []
    if not isinstance(usage, dict):
        return []
    items = []
    for name, info in usage.items():
        if not isinstance(info, dict):
            continue
        count = info.get("use_count") or 0
        if count:
            items.append({
                "name": name,
                "count": count,
                "state": info.get("state"),
                "last_used": info.get("last_used_at"),
            })
    items.sort(key=lambda x: -x["count"])
    return items
