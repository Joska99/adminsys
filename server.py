"""Hermes Mission Control -- read-only dashboard server.

Python standard library only. Serves index.html, a JSON snapshot of every
discovered agent, and an SSE stream that re-pushes the snapshot every few
seconds. No write/control endpoints.
"""

import datetime
import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from readers import (
    discovery, gateway, kanban, cron, sessions, profiles, skills,
    logs, memory, soul, channels, tokens, tools, disk, vault,
)

DATA_ROOT = os.environ.get("DATA_ROOT", "/data")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "1999"))
SSE_INTERVAL = int(os.environ.get("SSE_INTERVAL", "5"))
APP_VERSION = os.environ.get("APP_VERSION", "dev")


def _load_dashboard_urls():
    """DASHBOARD_URLS env: JSON map {agent_name: url} -> the agent's Hermes
    native dashboard. Deployment config (host ports live in the gateway compose,
    not in the agent data). Only http(s) URLs are kept, to keep the link safe."""
    try:
        raw = json.loads(os.environ.get("DASHBOARD_URLS", "{}"))
    except ValueError:
        return {}
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items()
            if isinstance(v, str) and v.startswith(("http://", "https://"))}


DASHBOARD_URLS = _load_dashboard_urls()

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, "web")          # browser-served files (html/css/js)
INDEX_PATH = os.path.join(WEB, "index.html")

# Whitelisted static assets (exact route -> content type). Avoids path traversal.
STATIC_FILES = {
    "/styles.css": "text/css; charset=utf-8",
}


def _safe(reader, agent_path):
    """Run a reader, never let it raise into snapshot assembly."""
    try:
        return reader.read(agent_path)
    except Exception as exc:  # defensive: one source must not break the rest
        return {"available": False, "error": "{}: {}".format(type(exc).__name__, exc)}


def build_snapshot():
    agents = []
    for name, path in discovery.list_agents(DATA_ROOT):
        try:
            model = profiles.agent_default_model(path)
        except Exception:
            model = None
        agents.append({
            "name": name,
            "model": model,
            "dashboard_url": DASHBOARD_URLS.get(name),
            "gateway": _safe(gateway, path),
            "kanban": _safe(kanban, path),
            "cron": _safe(cron, path),
            "sessions": _safe(sessions, path),
            "profiles": _safe(profiles, path),
            "skills": _safe(skills, path),
            "logs": _safe(logs, path),
            "memory": _safe(memory, path),
            "soul": _safe(soul, path),
            "channels": _safe(channels, path),
            "tokens": _safe(tokens, path),
            "tools": _safe(tools, path),
            "disk": _safe(disk, path),
            "vault": _safe(vault, path),
        })
    return {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "version": APP_VERSION,
        "data_root": DATA_ROOT,
        "agent_count": len(agents),
        "agents": agents,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter logs
        pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        try:
            with open(path, "rb") as fh:
                body = fh.read()
        except OSError:
            self.send_error(404, "Not found")
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        try:
            while True:
                payload = json.dumps(build_snapshot())
                self.wfile.write(b"data: " + payload.encode("utf-8") + b"\n\n")
                self.wfile.flush()
                time.sleep(SSE_INTERVAL)
        except (BrokenPipeError, ConnectionResetError):
            return

    def _send_text(self, text, content_type="text/plain; charset=utf-8"):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _serve_session(self, query):
        """Read-only transcript of one session: state.db first, legacy
        sessions/<id>.jsonl as fallback (same precedence as the reader)."""
        q = parse_qs(query)
        agent = (q.get("agent") or [""])[0]
        profile = (q.get("profile") or ["main"])[0]
        sid = (q.get("id") or [""])[0]
        agents = dict(discovery.list_agents(DATA_ROOT))
        if agent not in agents or not re.match(r"^[A-Za-z0-9._-]+$", sid):
            self.send_error(404, "Not found")
            return
        base = agents[agent]
        if profile == "main":
            pass
        elif re.match(r"^[A-Za-z0-9._-]+$", profile):
            base = os.path.join(base, "profiles", profile)
        else:
            self.send_error(404, "Not found")
            return
        db_path = os.path.join(base, "state.db")
        if os.path.isfile(db_path):
            try:
                text = sessions.transcript(db_path, sid)
            except Exception:
                text = None
            if text is not None:
                self._send_text(text)
                return
        jsonl = os.path.join(base, "sessions", sid + ".jsonl")
        if os.path.isfile(jsonl):
            self._send_file(jsonl, "text/plain; charset=utf-8")
            return
        self.send_error(404, "Not found")

    def _serve_task(self, query):
        """Read-only dashboard-style card view of one kanban task."""
        q = parse_qs(query)
        agent = (q.get("agent") or [""])[0]
        tid = (q.get("id") or [""])[0]
        board = (q.get("board") or ["default"])[0]
        agents = dict(discovery.list_agents(DATA_ROOT))
        if (agent not in agents
                or not re.match(r"^[A-Za-z0-9._-]+$", tid)
                or not re.match(r"^[A-Za-z0-9._-]+$", board)):
            self.send_error(404, "Not found")
            return
        try:
            text = kanban.detail(agents[agent], tid, board=board)
        except Exception:
            text = None
        if text is None:
            self.send_error(404, "Not found")
            return
        self._send_text(text)

    def _serve_log(self, query):
        q = parse_qs(query)
        agent = (q.get("agent") or [""])[0]
        fname = (q.get("file") or ["errors.log"])[0]
        allowed = {"errors.log", "agent.log", "gateway.log"}
        agents = dict(discovery.list_agents(DATA_ROOT))
        if agent not in agents or fname not in allowed:
            self.send_error(404, "Not found")
            return
        self._send_file(os.path.join(agents[agent], "logs", fname),
                        "text/plain; charset=utf-8")

    def _serve_cron_run(self, query):
        q = parse_qs(query)
        agent = (q.get("agent") or [""])[0]
        profile = (q.get("profile") or ["main"])[0]
        job = (q.get("job") or [""])[0]
        fname = (q.get("file") or [""])[0]
        agents = dict(discovery.list_agents(DATA_ROOT))
        if (agent not in agents
                or not re.match(r"^[A-Za-z0-9_-]+$", job)
                or not re.match(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$", fname)):
            self.send_error(404, "Not found")
            return
        base = agents[agent]
        if profile == "main":
            cron_dir = os.path.join(base, "cron")
        elif re.match(r"^[A-Za-z0-9._-]+$", profile):
            cron_dir = os.path.join(base, "profiles", profile, "cron")
        else:
            self.send_error(404, "Not found")
            return
        path = os.path.join(cron_dir, "output", job, fname)
        if not os.path.isfile(path):
            self.send_error(404, "Not found")
            return
        self._send_file(path, "text/markdown; charset=utf-8")

    # whitelisted profile files: name -> (relative path, content type)
    PROFILE_FILES = {
        "config": ("config.yaml", "text/plain; charset=utf-8"),
        "profile": ("profile.yaml", "text/plain; charset=utf-8"),
        "soul": ("SOUL.md", "text/markdown; charset=utf-8"),
        "agents": ("AGENTS.md", "text/markdown; charset=utf-8"),
        "memory": (os.path.join("memories", "MEMORY.md"), "text/markdown; charset=utf-8"),
        "user": (os.path.join("memories", "USER.md"), "text/markdown; charset=utf-8"),
    }

    def _serve_file(self, query):
        q = parse_qs(query)
        agent = (q.get("agent") or [""])[0]
        profile = (q.get("profile") or ["main"])[0]
        name = (q.get("name") or [""])[0]
        agents = dict(discovery.list_agents(DATA_ROOT))
        if agent not in agents or name not in self.PROFILE_FILES:
            self.send_error(404, "Not found")
            return
        base = agents[agent]
        if profile == "main":
            pass
        elif re.match(r"^[A-Za-z0-9._-]+$", profile):
            base = os.path.join(base, "profiles", profile)
        else:
            self.send_error(404, "Not found")
            return
        rel, ctype = self.PROFILE_FILES[name]
        path = os.path.join(base, rel)
        if not os.path.isfile(path):
            self.send_error(404, "Not found")
            return
        self._send_file(path, ctype)

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path
        if route == "/":
            self._send_file(INDEX_PATH, "text/html; charset=utf-8")
        elif route == "/api/snapshot":
            self._send_json(build_snapshot())
        elif route == "/events":
            self._serve_sse()
        elif route == "/healthz":
            self._send_json({"ok": True})
        elif route == "/api/log":
            self._serve_log(parsed.query)
        elif route == "/api/cron-run":
            self._serve_cron_run(parsed.query)
        elif route == "/api/session":
            self._serve_session(parsed.query)
        elif route == "/api/task":
            self._serve_task(parsed.query)
        elif route == "/api/file":
            self._serve_file(parsed.query)
        elif route in STATIC_FILES:
            self._send_file(os.path.join(WEB, route.lstrip("/")), STATIC_FILES[route])
        elif route.startswith("/js/") and re.match(r"^[A-Za-z0-9_-]+\.js$", route[4:]):
            self._send_file(os.path.join(WEB, "js", route[4:]), "text/javascript; charset=utf-8")
        else:
            self.send_error(404, "Not found")


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Hermes Mission Control on http://{}:{}  (DATA_ROOT={})".format(
        HOST, PORT, DATA_ROOT))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
