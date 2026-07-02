"""Profiles reader: per-agent profiles, model, and channel bindings.

Lists ``<agent>/profiles/*`` subfolders. If none exist, the agent root itself
is treated as a single default profile. config.yaml is read with a tiny
tolerant scan (no PyYAML in the stdlib); only the default model is extracted.
"""

import glob
import json
import os
import re
import sqlite3

from . import (sessions as r_sessions, tools as r_tools, skills as r_skills,
               soul as r_soul, memory as r_memory, vault as r_vault,
               kanban as r_kanban, logs as r_logs)


def _model_from_config(config_path):
    """Pull model.default from a Hermes config.yaml without a YAML parser."""
    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return None

    in_model = False
    for raw in lines:
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        stripped = line.strip()
        if indent == 0:
            in_model = stripped.startswith("model:")
            # single-line form: "model: foo"
            if in_model and ":" in stripped:
                val = stripped.split(":", 1)[1].strip()
                if val:
                    return val
            continue
        if in_model and stripped.startswith("default:"):
            return stripped.split(":", 1)[1].strip() or None
    return None


def agent_default_model(agent_path):
    """Default model from the agent root config.yaml, or None."""
    return _model_from_config(os.path.join(agent_path, "config.yaml"))


def _channels(base_path):
    """Split channel_directory.json into channels, dms, and a thread count."""
    path = os.path.join(base_path, "channel_directory.json")
    empty = {"channels": [], "dms": [], "threads": 0}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return empty
    channels, dms, threads = [], [], 0
    for platform, items in (data.get("platforms") or {}).items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            t = (item.get("type") or "").lower()
            if t == "thread":
                threads += 1
                continue
            entry = {"platform": platform, "name": item.get("name"), "id": item.get("id")}
            (dms if t == "dm" else channels).append(entry)
    return {"channels": channels, "dms": dms, "threads": threads}


def _gw_state(base_path):
    """gateway_state from this profile's own gateway_state.json, or None."""
    try:
        with open(os.path.join(base_path, "gateway_state.json"), "r", encoding="utf-8") as fh:
            return json.load(fh).get("gateway_state")
    except (OSError, ValueError):
        return None


def _session_count(base_path):
    """Session count for one profile. Prefer state.db (current Hermes), fall
    back to legacy sessions/*.jsonl — same precedence as the sessions reader,
    so the per-profile count doesn't freeze when an agent migrates to SQLite."""
    db_path = os.path.join(base_path, "state.db")
    if os.path.isfile(db_path):
        for uri in ("file:{}?mode=ro".format(db_path),
                    "file:{}?immutable=1".format(db_path)):
            try:
                con = sqlite3.connect(uri, uri=True, timeout=2)
                try:
                    return con.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
                finally:
                    con.close()
            except sqlite3.Error:
                continue
    try:
        return len(glob.glob(os.path.join(base_path, "sessions", "*.jsonl")))
    except OSError:
        return 0


def _description(base_path):
    """`description` from this profile's profile.yaml (tolerant, no PyYAML)."""
    path = os.path.join(base_path, "profile.yaml")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return None
    m = re.search(r"^description:\s*(.*?)(?:^[A-Za-z0-9_]+:|\Z)", text, re.S | re.M)
    if not m:
        return None
    raw = m.group(1).strip()
    raw = re.sub(r"\\\s*\n\s*", "", raw)        # YAML line-continuations
    raw = re.sub(r"\s*\n\s*", " ", raw).strip()  # collapse wraps
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        raw = raw[1:-1]
    raw = re.sub(r"\\u([0-9a-fA-F]{4})", lambda x: chr(int(x.group(1), 16)), raw)
    raw = raw.replace('\\"', '"').replace("\\ ", " ").replace("\\\\", "\\")
    raw = re.sub(r"\s{2,}", " ", raw).strip()
    return raw or None


def _skills(base_path):
    """Per-profile skill inventory: total + per-category counts.

    Layout is skills/<category>/<skill>/SKILL.md.
    """
    sk_dir = os.path.join(base_path, "skills")
    cats, total = [], 0
    try:
        names = sorted(os.listdir(sk_dir))
    except OSError:
        return {"count": 0, "categories": []}
    for cat in names:
        cdir = os.path.join(sk_dir, cat)
        if not os.path.isdir(cdir) or cat.startswith("."):
            continue
        n = 0
        try:
            for s in os.listdir(cdir):
                if os.path.isfile(os.path.join(cdir, s, "SKILL.md")):
                    n += 1
        except OSError:
            continue
        if n:
            cats.append({"name": cat, "count": n})
            total += n
    cats.sort(key=lambda x: (-x["count"], x["name"]))
    return {"count": total, "categories": cats}


def _stats(s):
    """Per-profile session spend/token/source rollup from this profile's own
    state.db (the agent root counts as the 'main' profile). Trimmed to the few
    aggregate fields the dashboard sums across all profiles — the heavy `recent`
    list is dropped to keep the snapshot small. `s` is a sessions.read() dict."""
    return {
        "cost_7d": s.get("cost_7d", 0) or 0,
        "cost_30d": s.get("cost_30d", 0) or 0,
        "cost_total": s.get("cost_total", 0) or 0,
        "tokens_7d": s.get("tokens_7d", 0) or 0,
        "tokens_30d": s.get("tokens_30d", 0) or 0,
        "tokens_total": s.get("tokens_total", 0) or 0,
        "by_source": s.get("by_source", {}) or {},
        "daily7": s.get("daily7", []) or [],
    }


def _profile(name, base_path):
    sess = r_sessions.read(base_path) or {}
    return {
        "name": name,
        "model": _model_from_config(os.path.join(base_path, "config.yaml")),
        "description": _description(base_path),
        "has_profile": os.path.isfile(os.path.join(base_path, "profile.yaml")),
        "has_soul": os.path.isfile(os.path.join(base_path, "SOUL.md")),
        "channels": _channels(base_path),
        "state": _gw_state(base_path),
        "sessions": _session_count(base_path),
        "skills": _skills(base_path),
        "stats": _stats(sess),
        "tools_top": (r_tools.read(base_path) or {}).get("top", []) or [],
        "skills_used": (r_skills.read(base_path) or {}).get("top_used", []) or [],
        # full per-profile reads so the Agents tab can break every section down
        # by personality (profile); each reader degrades to {available:false}
        # when the profile lacks the underlying files.
        "soul": r_soul.read(base_path),
        "memory": r_memory.read(base_path),
        "tools": r_tools.read(base_path),
        "vault": r_vault.read(base_path),
        "kanban": r_kanban.read(base_path),
        "logs": r_logs.read(base_path),
        "recent_sessions": (sess.get("recent") or [])[:5],
    }


def read(agent_path):
    profiles_dir = os.path.join(agent_path, "profiles")
    # the agent's own root config is the "main" profile; profiles/* are sub-profiles
    profiles = [_profile("main", agent_path)]
    try:
        if os.path.isdir(profiles_dir):
            for name in sorted(os.listdir(profiles_dir)):
                sub = os.path.join(profiles_dir, name)
                if os.path.isdir(sub) and not name.startswith("."):
                    profiles.append(_profile(name, sub))
    except OSError as exc:
        return {"available": False, "error": str(exc)}

    return {"available": True, "profiles": profiles}
