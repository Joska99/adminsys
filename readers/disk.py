"""Disk-footprint reader: total size of an agent home + its biggest top-level
entries.

Walking the tree is slow on network/bind-mount filesystems (seconds per home),
so it must never block a request. read() returns the last cached value
instantly and refreshes in a background thread; the first call returns a
``computing`` placeholder until the first walk finishes.
"""

import os
import threading
import time

TOP = 8
TTL = 120                 # seconds a scan stays fresh
_CACHE = {}               # agent_path -> (expires_at, result)
_INFLIGHT = set()         # agent_paths currently being scanned
_LOCK = threading.Lock()


def _dir_size(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _entry_size(path):
    try:
        if os.path.islink(path):
            return 0
        if os.path.isfile(path):
            return os.path.getsize(path)
    except OSError:
        return 0
    return _dir_size(path)


def _scan(agent_path):
    """Synchronous walk -> footprint dict. Used by the bg worker and tests."""
    try:
        names = os.listdir(agent_path)
    except OSError as exc:
        return {"available": False, "error": str(exc)}
    items, total = [], 0
    for n in names:
        size = _entry_size(os.path.join(agent_path, n))
        total += size
        items.append({"name": n, "bytes": size})
    items.sort(key=lambda x: -x["bytes"])
    return {"available": True, "total_bytes": total, "items": items[:TOP]}


def _worker(agent_path):
    try:
        res = _scan(agent_path)
        _CACHE[agent_path] = (time.time() + TTL, res)
    finally:
        with _LOCK:
            _INFLIGHT.discard(agent_path)


def read(agent_path):
    now = time.time()
    cached = _CACHE.get(agent_path)
    if cached and cached[0] > now:
        return cached[1]
    # stale or missing -> refresh in the background, return last/placeholder now
    with _LOCK:
        if agent_path not in _INFLIGHT:
            _INFLIGHT.add(agent_path)
            threading.Thread(target=_worker, args=(agent_path,), daemon=True).start()
    if cached:
        return cached[1]   # serve stale while the refresh runs
    return {"available": True, "computing": True, "total_bytes": 0, "items": []}
