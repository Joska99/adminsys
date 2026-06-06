"""Gateway status reader: parses <agent>/gateway_state.json (main profile)."""

import json
import os


def read(agent_path):
    """Return gateway state, platform connections, active agents, updated_at."""
    path = os.path.join(agent_path, "gateway_state.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return {"available": False}
    except (OSError, ValueError) as exc:
        return {"available": False, "error": str(exc)}

    platforms = {}
    for name, info in (data.get("platforms") or {}).items():
        if isinstance(info, dict):
            platforms[name] = {
                "state": info.get("state"),
                "error_message": info.get("error_message"),
                "updated_at": info.get("updated_at"),
            }

    return {
        "available": True,
        "gateway_state": data.get("gateway_state"),
        "active_agents": data.get("active_agents"),
        "platforms": platforms,
        "exit_reason": data.get("exit_reason"),
        "updated_at": data.get("updated_at"),
        "pid": data.get("pid"),
    }
