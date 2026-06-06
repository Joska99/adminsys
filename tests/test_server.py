"""Server/API tests. Spawns the real Handler in-process on an ephemeral port
against a fixture DATA_ROOT, then drives it with http.client (which sends raw
paths, so path-traversal attempts reach the server unnormalized).

Run: python3 -m unittest tests.test_server
"""

import http.client
import json
import os
import shutil
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import _fixture  # noqa: E402
import server    # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = _fixture.make_root()
        server.DATA_ROOT = cls.root  # readers + endpoints read this global
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.t = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.t.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        shutil.rmtree(cls.root, ignore_errors=True)

    def get(self, path):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request("GET", path)  # raw path, not normalized
        resp = conn.getresponse()
        body = resp.read()
        ct = resp.getheader("Content-Type")
        conn.close()
        return resp.status, ct, body

    # ---- happy paths ----
    def test_healthz(self):
        status, ct, body = self.get("/healthz")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])

    def test_snapshot_shape(self):
        status, ct, body = self.get("/api/snapshot")
        self.assertEqual(status, 200)
        self.assertIn("application/json", ct)
        d = json.loads(body)
        self.assertEqual(d["agent_count"], 2)
        names = sorted(a["name"] for a in d["agents"])
        self.assertEqual(names, ["alpha", "empty"])
        alpha = next(a for a in d["agents"] if a["name"] == "alpha")
        for key in ("gateway", "kanban", "cron", "sessions", "profiles",
                    "skills", "logs", "memory", "channels", "tokens"):
            self.assertIn(key, alpha)

    def test_index_serves_module(self):
        status, ct, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn("text/html", ct)
        self.assertIn(b'type="module" src="/js/main.js"', body)

    def test_js_module_content_type(self):
        status, ct, body = self.get("/js/core.js")
        self.assertEqual(status, 200)
        self.assertIn("text/javascript", ct)
        self.assertIn(b"export", body)

    def test_styles_css(self):
        status, ct, _ = self.get("/styles.css")
        self.assertEqual(status, 200)
        self.assertIn("text/css", ct)

    def test_log_whitelisted(self):
        status, ct, body = self.get("/api/log?agent=alpha&file=errors.log")
        self.assertEqual(status, 200)
        self.assertIn(b"ERROR boom", body)

    def test_cron_run_valid(self):
        status, ct, body = self.get(
            "/api/cron-run?agent=alpha&profile=main&job=job1&file=2026-06-01_10-00-00.md")
        self.assertEqual(status, 200)
        self.assertIn(b"run report", body)

    # ---- security / 404s ----
    def test_js_path_traversal_blocked(self):
        status, _, _ = self.get("/js/../server.py")
        self.assertEqual(status, 404)

    def test_log_non_whitelisted_file_blocked(self):
        status, _, _ = self.get("/api/log?agent=alpha&file=/etc/passwd")
        self.assertEqual(status, 404)

    def test_log_unknown_agent_blocked(self):
        status, _, _ = self.get("/api/log?agent=nope&file=errors.log")
        self.assertEqual(status, 404)

    def test_cron_run_bad_filename_blocked(self):
        status, _, _ = self.get(
            "/api/cron-run?agent=alpha&profile=main&job=job1&file=../../config.yaml")
        self.assertEqual(status, 404)

    def test_cron_run_bad_job_blocked(self):
        status, _, _ = self.get(
            "/api/cron-run?agent=alpha&profile=main&job=../x&file=2026-06-01_10-00-00.md")
        self.assertEqual(status, 404)

    def test_unknown_route(self):
        status, _, _ = self.get("/nope")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
