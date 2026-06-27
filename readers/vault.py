"""Vault-status reader: how many entries the agent's local vault/ holds and
whether auth is locked. Security posture only — never reads secret contents.
"""

import os


def read(agent_path):
    vdir = os.path.join(agent_path, "vault")
    if not os.path.isdir(vdir):
        return {"available": False}
    entries = 0
    for _root, _dirs, files in os.walk(vdir):
        entries += len(files)
    return {
        "available": True,
        "entries": entries,
        "locked": os.path.isfile(os.path.join(agent_path, "auth.lock")),
    }
