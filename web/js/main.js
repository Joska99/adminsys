import { $, SNAP, SELECTED, UI, agents, syncAgentFilter, goTab, setSnap, esc, sortRows, markUpdated, LAST_UPDATE } from "./core.js";
import { renderOverview } from "./render-overview.js";
import { renderAgents, renderProfiles, renderTasks, renderSchedule, renderSessions, renderLogs } from "./render-tabs.js";

function renderAll() {
  $("agentcount").textContent = (SNAP.agent_count || 0) + " agents";
  const pc = (SNAP.agents || []).reduce((n, a) => n + (((a.profiles || {}).profiles || []).length), 0);
  $("profilecount").textContent = pc + " profiles";
  const av = document.getElementById("appver"); if (av) av.textContent = SNAP.version || "dev";
  renderOverview(); renderAgents(); renderProfiles(); renderTasks(); renderSchedule(); renderSessions(); renderLogs();
}


let LAST_SIG = "";
function applySnapshot(data) {
  setSnap(data || { agents: [] });
  markUpdated();                  // even when data is unchanged: proves polling is alive
  syncAgentFilter();
  const sig = JSON.stringify(SNAP.agents);
  if (sig === LAST_SIG) return;   // no data change -> keep DOM + interaction state
  LAST_SIG = sig;
  renderAll();
}

// "updated Xs ago" ticker — runs every second, independent of data-change renders
setInterval(() => {
  const el = $("live-ago");
  if (!el || !LAST_UPDATE) return;
  const s = Math.round((Date.now() - LAST_UPDATE) / 1000);
  el.textContent = s + "s ago";
  el.classList.toggle("stale", s > 30);   // SSE/poll stalled if no update >30s
}, 1000);


document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) goTab(g.dataset.goto);
});

$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tabbtn"); if (!btn) return;
  document.querySelectorAll(".tabbtn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  $("tab-" + btn.dataset.tab).classList.add("active");
});
$("agentdd-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  $("agentdd-panel").hidden = !$("agentdd-panel").hidden;
});
$("agentdd-panel").addEventListener("click", (e) => {
  const c = e.target.closest("[data-agent]");
  if (!c) return;
  const v = c.dataset.agent;
  if (v === "*") SELECTED.clear();
  else if (SELECTED.has(v)) SELECTED.delete(v);
  else SELECTED.add(v);
  syncAgentFilter();
  renderAll();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#agentdd")) $("agentdd-panel").hidden = true;
});

/* delegated interactions (survive re-renders) */
document.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (th) {
    const st = th.dataset.table === "task" ? UI.taskSort : UI.schedSort;
    const key = th.dataset.key;
    if (st.key === key) st.dir = -st.dir; else { st.key = key; st.dir = 1; }
    if (th.dataset.table === "task") renderTasks(); else renderSchedule();
    return;
  }
  const chip = e.target.closest(".chip[data-taskstatus]");
  if (chip) { UI.taskStatus = chip.dataset.taskstatus; renderTasks(); return; }
  const lf = e.target.closest("[data-logfilter]");
  if (lf) {
    if (lf.dataset.logfilter === "err") UI.logErr = !UI.logErr;
    else UI.logWarn = !UI.logWarn;
    renderLogs();
    return;
  }
});
/* track which skill panels are open */
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d.tagName === "DETAILS" && d.classList && d.classList.contains("skills") && d.dataset.agent) {
    if (d.open) UI.openSkills.add(d.dataset.agent); else UI.openSkills.delete(d.dataset.agent);
  }
}, true);
/* density toggle */
/* overview card filters */
$("f-active").addEventListener("click", () => {
  UI.fActive = !UI.fActive;
  $("f-active").classList.toggle("on", UI.fActive);
  renderAll();
});
$("f-stopped").addEventListener("click", () => {
  UI.fStopped = !UI.fStopped;
  $("f-stopped").classList.toggle("on", UI.fStopped);
  renderAll();
});
$("f-clear").addEventListener("click", () => {
  UI.fActive = false;
  UI.fStopped = false;
  $("f-active").classList.remove("on");
  $("f-stopped").classList.remove("on");
  renderAll();
});

/* dark / light theme toggle (persisted; initial class set inline in <head>) */
const themeBtn = $("theme-toggle");
function syncThemeLabel() {
  if (themeBtn) themeBtn.textContent =
    document.documentElement.classList.contains("dark") ? "light" : "dark";
}
syncThemeLabel();
if (themeBtn) themeBtn.addEventListener("click", () => {
  const dark = document.documentElement.classList.toggle("dark");
  try { localStorage.theme = dark ? "dark" : "light"; } catch (e) {}
  syncThemeLabel();
});

/* jump-to-top button — appears after scrolling down */
const toTop = $("to-top");
if (toTop) {
  const onScroll = () => toTop.classList.toggle("show", window.scrollY > 300);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* clock + live countdown refresh on Schedule tab */
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
setInterval(() => {
  if ($("tab-schedule").classList.contains("active")) renderSchedule();
}, 15000);

/* live data: SSE with snapshot fallback */
function startSSE() {
  try {
    const es = new EventSource("/events");
    es.onmessage = (ev) => { try { applySnapshot(JSON.parse(ev.data)); } catch (e) {} };
    es.onerror = () => { $("livedot").style.setProperty("--dot-c", "var(--red)"); };
    es.onopen = () => { $("livedot").style.setProperty("--dot-c", "var(--green)"); };
  } catch (e) { pollFallback(); }
}
function pollFallback() {
  fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
  setInterval(() => fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {}), 8000);
}
fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
startSSE();
