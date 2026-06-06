/* Render smoke test: loads the real ES modules with a fake DOM, feeds a
   snapshot, and asserts the produced HTML. Catches module-load failures and
   render crashes (the blank-page class of bug) without a browser.

   Run: node tests/test_render.mjs   (from the project root) */

import { els } from "./dom_shim.mjs";

const core = await import("../web/js/core.js");
const ov = await import("../web/js/render-overview.js");
const tb = await import("../web/js/render-tabs.js");

let fails = 0;

const SNAP = {
  agent_count: 1, version: "test",
  agents: [{
    name: "alpha", model: "test-model",
    gateway: { available: true, gateway_state: "running", active_agents: 1,
               platforms: { discord: { state: "connected" } } },
    kanban: { available: true, runs: [
      { task_id: "t1aaaaaaaa", status: "running", outcome: "", summary: "go", started_at: "2026-06-01T10:00:00", error: "" },
    ], tasks: [] },
    cron: { available: true, failed: 0, jobs: [
      { profile: "main", id: "job1", name: "daily", schedule: "every day", skill: "x", model: "m", enabled: true, next_run_at: "2099-01-01T00:00:00Z", last_status: "done", run_count: 1, runs: ["2026-06-01_10-00-00.md"] },
      { profile: "beta", id: "job2", name: "hourly", schedule: "", skill: "", model: "", enabled: false, next_run_at: null, last_status: null, run_count: 0, runs: [] },
    ] },
    sessions: { available: true, total: 2, recent: [
      { id: "20260602_110000_bbb", started_at: "2026-06-02T11:00:00", messages: 1 },
    ], daily7: [] },
    profiles: { available: true, profiles: [
      { name: "main", model: "test-model", state: "running", sessions: 2,
        channels: { channels: [{ platform: "discord", name: "general", id: "1" }], dms: [{ name: "bob" }], threads: 1 } },
      { name: "beta", model: "beta-model", state: "stopped", sessions: 0,
        channels: { channels: [{ platform: "discord", name: "news", id: "9" }], dms: [], threads: 0 } },
    ] },
    skills: { available: true, total: 2, by_category: { core: ["gen", "two"] },
              used: [{ name: "gen", count: 5, last_used: null }], top_used: [{ name: "gen", count: 5 }] },
    logs: { available: true, total: 3, errors: 1, warnings: 1,
            issues: [{ level: "error", text: "boom" }, { level: "warn", text: "heads up" }] },
    memory: { available: true, memory: "remember this", user: null },
    channels: { available: true, channels: [{ platform: "discord", name: "general", id: "1" }], dms: [], threads: [], thread_count: 0 },
    tokens: { available: true, responses: 1, total_tokens: 15, models: [{ model: "m1", tokens: 15 }] },
  }],
};

core.setSnap(SNAP);

// render a tab, assert each listed section, print ONE summary line per tab.
function tab(name, render, id, sections) {
  const bad = [];
  try {
    render();
    const html = els[id].innerHTML;
    for (const [needle, label] of sections) {
      if (!html.includes(needle)) bad.push(label);
    }
  } catch (e) {
    bad.push("threw: " + e.message);
  }
  const total = sections.length;
  if (bad.length === 0) {
    console.log(`  ok   ${name.padEnd(9)} ${total}/${total} sections`);
  } else {
    fails += bad.length;
    console.log(`  FAIL ${name.padEnd(9)} ${total - bad.length}/${total} sections — missing: ${bad.join(", ")}`);
  }
}

// ---- OVERVIEW ----
tab("overview", ov.renderOverview, "tab-overview", [
  ["SYSTEM OVERVIEW", "header"],
  // KPI boxes
  [">agents<", "KPI: agents"],
  [">profiles<", "KPI: profiles"],
  ["active agents", "KPI: active agents"],
  ["running tasks", "KPI: running tasks"],
  ["total sessions", "KPI: total sessions"],
  ["total crons", "KPI: total crons"],
  ["failed crons", "KPI: failed crons"],
  // sections
  ["AGENTS", "AGENTS section"],
  ["PROFILES", "PROFILES section"],
  ["CRON", "CRON (next 5) section"],
  ["TOP SKILLS", "TOP SKILLS section"],
  ["TOKENS", "TOKENS section"],
  ["INCIDENTS", "INCIDENTS section"],
  // card content
  ["alpha", "agent card name"],
  [">main<", "card main badge"],
  ["test-model", "card model pill"],
  ['data-goto="profiles"', "profiles KPI box links to Profiles tab"],
  ["beta", "PROFILES row shows sub-profile beta"],
]);

// ---- AGENTS ----
tab("agents", tb.renderAgents, "tab-agents", [
  ["profile", "profiles table header"],
  ["beta-model", "profiles table sub-profile row"],
  ["SKILLS USAGE", "SKILLS USAGE section"],
  ["gen", "skills usage row"],
  ["MEMORY", "MEMORY section"],
  ["remember this", "memory content"],
]);

// ---- PROFILES ----
tab("profiles", tb.renderProfiles, "tab-profiles", [
  ["alpha", "agent panel"],
  ["profiles", "profile count pill"],
  ["test-model", "main profile model"],
  ["beta-model", "sub-profile model"],
  ["channels", "bindings table channels col"],
  ["general", "main profile channel"],
  ["news", "sub-profile channel"],
]);

// ---- TASKS ----
tab("tasks", tb.renderTasks, "tab-tasks", [
  ["chips", "status filter chips"],
  [">all<", "all chip"],
  [">running<", "running status chip"],
  ["task", "runs table header"],
  ["go", "task run summary"],
]);

// ---- CRON / SCHEDULE ----
tab("schedule", tb.renderSchedule, "tab-schedule", [
  ["cron jobs", "per-agent cron heading"],
  ["daily", "main cron job row"],
  ["hourly", "sub-profile cron job row"],
  ["every day", "schedule display"],
  ["1 runs", "run history details"],
]);

// ---- SESSIONS ----
tab("sessions", tb.renderSessions, "tab-sessions", [
  ["2 total", "total sessions pill"],
  ["20260602_110000_bbb", "session id row"],
  ["session", "sessions table header"],
]);

// ---- LOGS ----
tab("logs", tb.renderLogs, "tab-logs", [
  ["errors", "errors filter chip"],
  ["warnings", "warnings filter chip"],
  ["1 err", "error count pill"],
  ["1 warn", "warning count pill"],
  ["boom", "error logline"],
  ["heads up", "warning logline"],
  ["errors.log", "open full log link"],
]);

console.log(fails ? `\nrender smoke FAILED (${fails})` : "\nrender smoke OK");
process.exit(fails ? 1 : 0);
