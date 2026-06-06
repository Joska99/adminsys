"""Profiles reader: per-agent profiles, model, and channel bindings.

Lists ``<agent>/profiles/*`` subfolders. If none exist, the agent root itself
is treated as a single default profile. config.yaml is read with a tiny
tolerant scan (no PyYAML in the stdlib); only the default model is extracted.
"""

import glob
import json
import os


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
    try:
        return len(glob.glob(os.path.join(base_path, "sessions", "*.jsonl")))
    except OSError:
        return 0


def _profile(name, base_path):
    return {
        "name": name,
        "model": _model_from_config(os.path.join(base_path, "config.yaml")),
        "channels": _channels(base_path),
        "state": _gw_state(base_path),
        "sessions": _session_count(base_path),
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
