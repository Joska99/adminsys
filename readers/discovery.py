"""Agent discovery: every immediate subfolder of DATA_ROOT is one agent."""

import os


def list_agents(data_root):
    """Return a sorted list of (name, path) for each subfolder of data_root.

    A subfolder is an agent's Hermes data home, mounted read-only. The folder
    name is the agent name; no name-pattern matching is applied.
    """
    agents = []
    try:
        for name in sorted(os.listdir(data_root)):
            path = os.path.join(data_root, name)
            if os.path.isdir(path) and not name.startswith("."):
                agents.append((name, path))
    except FileNotFoundError:
        return []
    except OSError:
        return []
    return agents
