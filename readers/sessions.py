"""Sessions reader: counts <agent>/sessions/*.jsonl and summarizes recent ones.

Session files are named ``YYYYMMDD_HHMMSS_<hash>.jsonl``. The started time is
parsed from the filename; message count is the line count minus the
``session_meta`` header line.
"""

import datetime
import glob
import os

RECENT = 15
DAYS = 7


def _started_at(filename):
    base = os.path.basename(filename)
    parts = base.split("_")
    if len(parts) >= 2 and len(parts[0]) == 8 and len(parts[1]) == 6:
        d, t = parts[0], parts[1]
        return "{}-{}-{}T{}:{}:{}".format(
            d[0:4], d[4:6], d[6:8], t[0:2], t[2:4], t[4:6]
        )
    return None


def _count_lines(path):
    try:
        with open(path, "rb") as fh:
            n = sum(1 for _ in fh)
        return max(n - 1, 0)  # drop session_meta header
    except OSError:
        return None


def read(agent_path):
    sessions_dir = os.path.join(agent_path, "sessions")
    if not os.path.isdir(sessions_dir):
        return {"available": False}

    try:
        files = sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl")))
    except OSError as exc:
        return {"available": False, "error": str(exc)}

    recent = []
    for path in files[-RECENT:][::-1]:
        recent.append({
            "id": os.path.basename(path).rsplit(".", 1)[0],
            "started_at": _started_at(path),
            "messages": _count_lines(path),
        })

    return {
        "available": True,
        "total": len(files),
        "recent": recent,
        "daily7": _daily7(files),
    }


def _daily7(files):
    """Counts per day for the last DAYS days (oldest -> newest), from the
    YYYYMMDD filename prefix."""
    today = datetime.datetime.now(datetime.timezone.utc).date()
    window = [today - datetime.timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
    counts = {d.isoformat(): 0 for d in window}
    for path in files:
        prefix = os.path.basename(path)[:8]
        try:
            d = datetime.date(int(prefix[0:4]), int(prefix[4:6]), int(prefix[6:8]))
        except ValueError:
            continue
        key = d.isoformat()
        if key in counts:
            counts[key] += 1
    return [{"date": d.isoformat(), "count": counts[d.isoformat()]} for d in window]
