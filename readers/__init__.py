"""Reader package for Hermes Mission Control.

Each reader exposes a pure ``read(agent_path)`` function that takes an agent's
data folder and returns a plain dict. Every reader guards its own work in
try/except so a single failing source never crashes the snapshot.
"""

from . import (
    discovery, gateway, kanban, cron, sessions, profiles, skills,
    logs, memory, soul, channels, tokens, tools, disk, vault,
)

__all__ = [
    "discovery", "gateway", "kanban", "cron", "sessions", "profiles", "skills",
    "logs", "memory", "soul", "channels", "tokens", "tools", "disk", "vault",
]
