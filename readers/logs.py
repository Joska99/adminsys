"""Logs reader: error/warning counts + recent tail from <agent>/logs/errors.log."""

import os

LIMIT = 150  # most recent ERROR/WARNING lines to keep


def _level(line):
    if " ERROR" in line or "CRITICAL" in line or "Traceback" in line:
        return "error"
    if " WARNING" in line:
        return "warn"
    return None


def read(agent_path):
    path = os.path.join(agent_path, "logs", "errors.log")
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().splitlines()
    except FileNotFoundError:
        return {"available": False}
    except OSError as exc:
        return {"available": False, "error": str(exc)}

    issues = []
    errors = warnings = 0
    for l in lines:
        lvl = _level(l)
        if lvl == "error":
            errors += 1
        elif lvl == "warn":
            warnings += 1
        else:
            continue
        issues.append({"level": lvl, "text": l})

    return {
        "available": True,
        "total": len(lines),
        "errors": errors,
        "warnings": warnings,
        "issues": issues[-LIMIT:],
    }
