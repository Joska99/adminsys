"""Skills reader: the agent's active skill set.

Reads ``<agent>/.skills_prompt_snapshot.json`` (the skills injected into the
agent's prompt). Returns a total and a per-category grouping of skill names.
"""

import json
import os


def read(agent_path):
    # prompt-injected skill set (may be absent on some agents)
    by_category = {}
    seen = set()
    have_snapshot = False
    path = os.path.join(agent_path, ".skills_prompt_snapshot.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        raw = data.get("skills")
        if isinstance(raw, list):
            have_snapshot = True
            for item in raw:
                if not isinstance(item, dict):
                    continue
                name = item.get("skill_name") or item.get("frontmatter_name")
                if not name or name in seen:
                    continue
                seen.add(name)
                cat = item.get("category") or "other"
                by_category.setdefault(cat, []).append(name)
    except (OSError, ValueError):
        pass

    for names in by_category.values():
        names.sort()
    categories = sorted(
        ({"name": c, "count": len(n)} for c, n in by_category.items()),
        key=lambda x: (-x["count"], x["name"]),
    )

    # actual usage (skills/.usage.json) — present even when the snapshot isn't
    used = _used(agent_path)
    if not have_snapshot and not used:
        return {"available": False}

    return {
        "available": True,
        "total": len(seen) if have_snapshot else len(used),
        "categories": categories,
        "by_category": by_category,
        "used": used,
        "top_used": used[:10],
    }


def _used(agent_path):
    """All used skills (use_count > 0) sorted by count, from skills/.usage.json.

    Reads ONLY this path's own usage file — profiles.py calls this once per
    profile (agent root = main, profiles/<p> = workers), so every block shows
    that profile's usage and nothing else."""
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
