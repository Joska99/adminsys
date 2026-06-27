"""Unit tests for every reader. Pure stdlib (unittest), fixture-driven.

Run: python3 -m unittest tests.test_readers   (from the project root)
"""

import os
import shutil
import sqlite3
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import _fixture  # noqa: E402  (tests dir on path via discover)
from readers import (  # noqa: E402
    discovery, gateway, kanban, cron, sessions, profiles, skills,
    logs, memory, soul, channels, tokens, tools, disk, vault,
)


def _messages_db(path, tool_rows):
    """state.db with a minimal `messages` table. tool_rows: list of tool_name
    (use '' / None for non-tool messages)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE messages (id INTEGER, role TEXT, tool_name TEXT)")
    conn.executemany("INSERT INTO messages VALUES (?,?,?)",
                     [(i, "tool" if t else "assistant", t) for i, t in enumerate(tool_rows)])
    conn.commit()
    conn.close()


def _state_db(path, rows):
    """Write a minimal Hermes-style state.db `sessions` table.

    rows: list of (source, started_at_unix, input_tokens, output_tokens, cost).
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE sessions (id TEXT, started_at INTEGER, message_count INTEGER, "
        "title TEXT, model TEXT, source TEXT, ended_at INTEGER, "
        "estimated_cost_usd REAL, input_tokens INTEGER, output_tokens INTEGER)")
    conn.executemany(
        "INSERT INTO sessions (id, started_at, message_count, title, model, source, "
        "ended_at, estimated_cost_usd, input_tokens, output_tokens) "
        "VALUES (?,?,1,'t','m',?,?,?,?,?)",
        [(f"s{i}", r[1], r[0], None, r[4], r[2], r[3]) for i, r in enumerate(rows)],
    )
    conn.commit()
    conn.close()


class ReaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = _fixture.make_root()
        cls.alpha = os.path.join(cls.root, "alpha")
        cls.empty = os.path.join(cls.root, "empty")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.root, ignore_errors=True)

    def test_discovery_lists_visible_dirs_only(self):
        names = [n for n, _ in discovery.list_agents(self.root)]
        self.assertEqual(names, ["alpha", "empty"])  # .hidden excluded, sorted

    def test_discovery_missing_root(self):
        self.assertEqual(discovery.list_agents("/no/such/root"), [])

    def test_gateway_running(self):
        g = gateway.read(self.alpha)
        self.assertTrue(g["available"])
        self.assertEqual(g["gateway_state"], "running")
        self.assertEqual(g["active_agents"], 1)
        self.assertEqual(g["platforms"]["discord"]["state"], "connected")

    def test_gateway_unavailable(self):
        self.assertFalse(gateway.read(self.empty)["available"])

    def test_kanban_runs(self):
        k = kanban.read(self.alpha)
        self.assertTrue(k["available"])
        self.assertEqual(len(k["runs"]), 2)
        states = {r["status"] for r in k["runs"]}
        self.assertEqual(states, {"running", "failed"})
        failed = next(r for r in k["runs"] if r["status"] == "failed")
        self.assertEqual(failed["error"], "boom")
        self.assertEqual(len(k["tasks"]), 1)
        self.assertEqual(k["tasks_total"], 1)   # COUNT(*), not capped list len
        self.assertEqual(k["runs_total"], 2)

    def test_kanban_unavailable(self):
        self.assertFalse(kanban.read(self.empty)["available"])

    def test_cron_aggregates_main_and_subprofile(self):
        c = cron.read(self.alpha)
        self.assertTrue(c["available"])
        profs = sorted(j["profile"] for j in c["jobs"])
        self.assertEqual(profs, ["beta", "main"])  # job1 (main) + job2 (beta)
        job1 = next(j for j in c["jobs"] if j["id"] == "job1")
        self.assertEqual(job1["schedule"], "every day")
        self.assertEqual(job1["run_count"], 1)
        self.assertEqual(job1["runs"], ["2026-06-01_10-00-00.md"])
        self.assertEqual(c["failed"], 0)

    def test_sessions_main_only(self):
        s = sessions.read(self.alpha)
        self.assertTrue(s["available"])
        self.assertEqual(s["total"], 2)  # beta sessions/ is absent -> not counted
        # newest first
        self.assertEqual(s["recent"][0]["id"], "20260602_110000_bbb")
        self.assertEqual(s["recent"][0]["messages"], 1)
        self.assertEqual(s["recent"][1]["messages"], 2)
        self.assertEqual(len(s["daily7"]), 7)

    def test_profiles_per_profile_detail(self):
        p = profiles.read(self.alpha)
        self.assertTrue(p["available"])
        by = {pr["name"]: pr for pr in p["profiles"]}
        self.assertEqual(set(by), {"main", "beta"})
        self.assertEqual(by["main"]["model"], "test-model")
        self.assertEqual(by["main"]["state"], "running")
        self.assertEqual(by["main"]["sessions"], 2)
        self.assertEqual(len(by["main"]["channels"]["channels"]), 1)
        self.assertEqual(len(by["main"]["channels"]["dms"]), 1)
        self.assertEqual(by["main"]["channels"]["threads"], 1)
        self.assertEqual(by["beta"]["model"], "beta-model")
        self.assertEqual(by["beta"]["state"], "stopped")
        self.assertEqual(by["beta"]["sessions"], 0)
        self.assertEqual(by["beta"]["description"], "Beta sub-profile for tests")
        self.assertTrue(by["beta"]["has_soul"])
        self.assertFalse(by["main"]["has_soul"])  # root fixture has no SOUL.md
        self.assertTrue(by["beta"]["has_profile"])
        self.assertFalse(by["main"]["has_profile"])  # root has no profile.yaml
        self.assertEqual(by["beta"]["skills"]["count"], 1)
        self.assertEqual(by["beta"]["skills"]["categories"], [{"name": "research", "count": 1}])
        self.assertIsNone(by["main"]["description"])  # root has no profile.yaml

    def test_default_model_helper(self):
        self.assertEqual(profiles.agent_default_model(self.alpha), "test-model")

    def test_skills_used_and_total(self):
        sk = skills.read(self.alpha)
        self.assertTrue(sk["available"])
        self.assertEqual(sk["total"], 2)  # snapshot has gen + two
        used = {u["name"]: u for u in sk["used"]}
        self.assertIn("gen", used)
        self.assertNotIn("unused", used)  # use_count 0 dropped
        self.assertEqual(used["gen"]["count"], 5)
        self.assertLessEqual(len(sk["top_used"]), 10)

    def test_logs_levels(self):
        lg = logs.read(self.alpha)
        self.assertTrue(lg["available"])
        self.assertEqual(lg["errors"], 1)
        self.assertEqual(lg["warnings"], 1)
        self.assertEqual(lg["total"], 3)
        levels = {i["level"] for i in lg["issues"]}
        self.assertEqual(levels, {"error", "warn"})

    def test_memory(self):
        m = memory.read(self.alpha)
        self.assertTrue(m["available"])
        self.assertTrue(m["has_memory"])
        self.assertFalse(m["has_user"])  # fixture has MEMORY.md, no USER.md

    def test_channels_split(self):
        c = channels.read(self.alpha)
        self.assertTrue(c["available"])
        self.assertEqual(len(c["channels"]), 1)
        self.assertEqual(len(c["dms"]), 1)
        self.assertEqual(c["thread_count"], 1)

    def test_tokens(self):
        t = tokens.read(self.alpha)
        self.assertTrue(t["available"])
        self.assertEqual(t["responses"], 1)
        self.assertEqual(t["total_tokens"], 15)  # 10 + 5
        self.assertEqual(t["models"][0]["model"], "m1")

    def test_soul_preview(self):
        # soul reader runs on a profile root; beta has SOUL.md + AGENTS.md,
        # alpha root has neither
        so = soul.read(os.path.join(self.alpha, "profiles", "beta"))
        self.assertTrue(so["available"])
        self.assertTrue(so["has_soul"])
        self.assertTrue(so["preview"]["text"].startswith("# Beta"))
        self.assertFalse(so["preview"]["truncated"])  # short file
        self.assertTrue(so["has_agents"])
        self.assertTrue(so["agents_preview"]["text"].startswith("# Beta agents"))
        self.assertFalse(soul.read(self.alpha)["available"])  # no SOUL.md / AGENTS.md

    def test_memory_preview(self):
        m = memory.read(self.alpha)
        self.assertEqual(m["memory_preview"]["text"], "remember this")
        self.assertFalse(m["memory_preview"]["truncated"])
        self.assertIsNone(m["user_preview"])  # no USER.md

    def test_sessions_state_db_windows_and_source(self):
        now = int(time.time())
        old = now - 40 * 86400  # outside 30d / 7d windows
        d = tempfile.mkdtemp(prefix="admsys-sdb-")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        _state_db(os.path.join(d, "state.db"), [
            ("cron",    now - 3600, 100, 50, 1.0),   # recent
            ("Discord", now - 7200, 200, 100, 2.0),  # recent, mixed-case source
            ("discord", old,       1000, 0, 5.0),    # old
        ])
        s = sessions.read(d)
        self.assertTrue(s["available"])
        self.assertEqual(s["total"], 3)
        self.assertEqual(s["tokens_total"], 1450)             # 150+300+1000
        self.assertEqual(s["tokens_30d"], 450)                # recent two only
        self.assertEqual(s["tokens_7d"], 450)
        self.assertAlmostEqual(s["cost_total"], 8.0)
        self.assertAlmostEqual(s["cost_30d"], 3.0)
        self.assertAlmostEqual(s["cost_7d"], 3.0)
        self.assertEqual(s["by_source"], {"cron": 1, "discord": 2})  # lowercased

    def test_profiles_session_count_from_state_db(self):
        d = tempfile.mkdtemp(prefix="admsys-psdb-")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        _state_db(os.path.join(d, "state.db"), [
            ("cron", 1, 1, 1, 0.0), ("discord", 2, 1, 1, 0.0),
        ])
        p = profiles.read(d)
        main = next(pr for pr in p["profiles"] if pr["name"] == "main")
        self.assertEqual(main["sessions"], 2)  # counted from state.db, not jsonl

    def test_tools_usage(self):
        d = tempfile.mkdtemp(prefix="admsys-tools-")
        self.addCleanup(shutil.rmtree, d, ignore_errors=True)
        _messages_db(os.path.join(d, "state.db"),
                     ["terminal", "terminal", "search", "", None])
        t = tools.read(d)
        self.assertTrue(t["available"])
        self.assertEqual(t["total"], 3)        # 3 tool rows, 2 non-tool ignored
        self.assertEqual(t["distinct"], 2)
        self.assertEqual(t["top"][0], {"name": "terminal", "count": 2})

    def test_disk_footprint(self):
        d = disk._scan(self.alpha)          # synchronous scan (read() is async-cached)
        self.assertTrue(d["available"])
        self.assertGreater(d["total_bytes"], 0)
        self.assertTrue(d["items"])
        sizes = [it["bytes"] for it in d["items"]]
        self.assertEqual(sizes, sorted(sizes, reverse=True))   # biggest first

    def test_disk_read_nonblocking(self):
        # first read returns instantly with a computing placeholder (bg refresh)
        d = disk.read(self.alpha)
        self.assertTrue(d["available"])
        self.assertIn("total_bytes", d)

    def test_vault_status(self):
        v = vault.read(self.alpha)
        self.assertTrue(v["available"])
        self.assertEqual(v["entries"], 1)      # fixture wrote vault/secret1
        self.assertTrue(v["locked"])           # auth.lock present
        self.assertFalse(vault.read(self.empty)["available"])  # no vault/ dir

    def test_all_readers_failsoft_on_empty(self):
        for r in (gateway, kanban, cron, sessions, profiles, skills,
                  logs, memory, soul, channels, tokens, tools, disk, vault):
            out = r.read(self.empty)
            self.assertIn("available", out, r.__name__)
            # never raises, always returns a dict with an availability flag


if __name__ == "__main__":
    unittest.main()
