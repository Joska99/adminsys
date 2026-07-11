import { $, SNAP, SELECTED, UI, agents, syncAgentFilter, syncProfileFilter, goTab, setSnap, esc, sortRows, markUpdated, LAST_UPDATE, saveUI } from "./core.js";
import { renderOverview } from "./render-overview.js";
import { renderAgents, renderProfiles, renderTasks, renderSchedule, renderSessions, renderLogs } from "./render-tabs.js";

/* tab id -> render fn. */
const RENDER = {
  overview: renderOverview,
  agents: renderAgents, profiles: renderProfiles,
  schedule: renderSchedule, tasks: renderTasks,
  sessions: renderSessions, logs: renderLogs,
};
function activeTabName() {
  const b = document.querySelector(".tabbtn.active");
  return b ? b.dataset.tab : "overview";
}
let READY = false;   // hold the first-paint skeleton until a snapshot lands
function renderActive() {
  if (!READY) return;
  (RENDER[activeTabName()] || renderOverview)();
}

function renderAll() {
  $("agentcount").textContent = (SNAP.agent_count || 0) + " agents";
  const pc = (SNAP.agents || []).reduce((n, a) => n + (((a.profiles || {}).profiles || []).length), 0);
  $("profilecount").textContent = pc + " profiles";
  const av = document.getElementById("appver"); if (av) av.textContent = SNAP.version || "dev";
  updateFilterChip();
  renderActive();
}

// header chip: surfaces any active agent/state filter on every tab, with a clear ✕
function updateFilterChip() {
  const el = $("filteractive"); if (!el) return;
  const parts = [];
  if (SELECTED.size) parts.push(SELECTED.size === 1 ? [...SELECTED][0] : SELECTED.size + " agents");
  if (UI.fActive) parts.push("running");
  if (UI.fStopped) parts.push("stopped");
  if (!parts.length) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = `filtered: ${esc(parts.join(" · "))} <button class="fa-clear" type="button" title="clear filters" aria-label="clear filters">✕</button>`;
}


let LAST_SIG = "";
function applySnapshot(data) {
  setSnap(data || { agents: [] });
  markUpdated();                  // even when data is unchanged: proves polling is alive
  syncAgentFilter();
  syncProfileFilter();
  const sig = JSON.stringify(SNAP.agents);
  if (READY && sig === LAST_SIG) return;   // no data change -> keep DOM + interaction state
  LAST_SIG = sig;
  READY = true;
  renderAll();
}

// connection state -> sticky banner under the header + freeze the live-dot pulse
let CONN = "ok";   // "ok" | "down" | "stale"
function setConn(state) {
  const b = $("conn-banner"), dot = $("livedot");
  if (state === "ok") { if (b) b.hidden = true; if (dot) dot.classList.remove("dead"); return; }
  if (!b) return;
  b.hidden = false;
  b.className = "connbanner " + (state === "down" ? "down" : "stale");
  b.textContent = state === "down" ? "connection lost · reconnecting…" : "data may be stale · last update over 30s ago";
  if (dot && state === "down") dot.classList.add("dead");
}

// "updated Xs ago" ticker — runs every second, independent of data-change renders
setInterval(() => {
  const el = $("live-ago");
  if (!el || !LAST_UPDATE) return;
  const s = Math.round((Date.now() - LAST_UPDATE) / 1000);
  el.textContent = s + "s ago";
  const stale = s > 30;                    // SSE/poll stalled if no update >30s
  el.classList.toggle("stale", stale);
  if (CONN !== "down") setConn(stale ? "stale" : "ok");
}, 1000);


document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-goto]");
  if (g) goTab(g.dataset.goto);   // goTab -> .tabbtn click -> setTab (hash + render)
});

/* ---------- tab switching: hash-routed + ARIA + keyboard ---------- */
function activateTab(name) {
  if (!document.querySelector(`.tabbtn[data-tab="${name}"]`)) name = "overview";
  document.querySelectorAll(".tabbtn").forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + name));
  renderActive();
}
let HASH_LOCK = false;   // suppress the echo hashchange we trigger ourselves
function setTab(name) {
  activateTab(name);
  try { localStorage.setItem("adminsys.tab", activeTabName()); } catch (e) {}
  if (location.hash.slice(1) !== name) { HASH_LOCK = true; location.hash = name; }
}
window.addEventListener("hashchange", () => {
  if (HASH_LOCK) { HASH_LOCK = false; return; }   // our own write
  activateTab(location.hash.slice(1));
  try { localStorage.setItem("adminsys.tab", activeTabName()); } catch (e) {}
});
$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tabbtn"); if (!btn) return;
  setTab(btn.dataset.tab);
});
$("tabs").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  const tabs = [...document.querySelectorAll(".tabbtn")];
  let i = tabs.findIndex(b => b.classList.contains("active")); if (i < 0) i = 0;
  if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
  else if (e.key === "ArrowLeft") i = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === "Home") i = 0; else i = tabs.length - 1;
  setTab(tabs[i].dataset.tab);
  tabs[i].focus();
});

/* ---------- agent filter dropdown (aria-expanded + Esc to close) ---------- */
function setDD(open) {
  $("agentdd-panel").hidden = !open;
  $("agentdd-btn").setAttribute("aria-expanded", open ? "true" : "false");
}
$("agentdd-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  setDD($("agentdd-panel").hidden);
});
$("agentdd-panel").addEventListener("click", (e) => {
  const c = e.target.closest("[data-agent]");
  if (!c) return;
  const v = c.dataset.agent;
  if (v === "*") SELECTED.clear();
  else if (SELECTED.has(v)) SELECTED.delete(v);
  else SELECTED.add(v);
  syncAgentFilter();
  saveUI();
  renderAll();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#agentdd")) setDD(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("agentdd-panel").hidden) { setDD(false); $("agentdd-btn").focus(); }
});

/* ---------- global profile selector: set the shown profile for every card ---------- */
function setProfDD(open) {
  $("profdd-panel").hidden = !open;
  $("profdd-btn").setAttribute("aria-expanded", open ? "true" : "false");
}
$("profdd-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  setProfDD($("profdd-panel").hidden);
});
$("profdd-panel").addEventListener("click", (e) => {
  const c = e.target.closest("[data-pg]");
  if (!c) return;
  const v = c.dataset.pg;
  UI.profGlobal = v === "" ? null : v;
  UI.profSel = {};                 // global is authoritative — drop per-card overrides
  saveUI();
  syncProfileFilter();
  setProfDD(false);
  renderAll();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#profdd")) setProfDD(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("profdd-panel").hidden) { setProfDD(false); $("profdd-btn").focus(); }
});

/* delegated interactions (survive re-renders) */
document.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (th) {
    const st = th.dataset.table === "task" ? UI.taskSort : UI.schedSort;
    const key = th.dataset.key;
    if (st.key === key) st.dir = -st.dir; else { st.key = key; st.dir = 1; }
    saveUI();
    if (th.dataset.table === "task") renderTasks(); else renderSchedule();
    return;
  }
  const chip = e.target.closest(".chip[data-taskstatus]");
  if (chip) { UI.taskStatus = chip.dataset.taskstatus; saveUI(); renderTasks(); return; }
  const fac = e.target.closest(".fa-clear");
  if (fac) {
    SELECTED.clear(); UI.fActive = false; UI.fStopped = false;
    $("f-active").classList.remove("on"); $("f-stopped").classList.remove("on");
    syncAgentFilter(); saveUI(); renderAll();
    return;
  }
  const pb = e.target.closest(".profbtn");
  if (pb) {
    const card = pb.closest("[data-card]");
    if (card) {
      UI.profSel[card.dataset.card] = pb.dataset.prof; saveUI();
      (RENDER[activeTabName()] || renderAgents)();   // .profbtn lives on Overview + Agents
    }
    return;
  }
  const lf = e.target.closest("[data-logfilter]");
  if (lf) {
    if (lf.dataset.logfilter === "err") UI.logErr = !UI.logErr;
    else UI.logWarn = !UI.logWarn;
    saveUI();
    renderLogs();
    return;
  }
});
/* keyboard-activate sortable headers (they are <th>, not <button>) */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const th = e.target.closest && e.target.closest("th.sortable");
  if (th) { e.preventDefault(); th.click(); }
});
/* track which skill panels are open */
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (d.tagName !== "DETAILS") return;
  if (d.classList && d.classList.contains("skills") && d.dataset.agent) {
    if (d.open) UI.openSkills.add(d.dataset.agent); else UI.openSkills.delete(d.dataset.agent);
    saveUI();
  } else if (d.dataset && d.dataset.ov) {   // overview sections + per-card cost details
    if (d.open) UI.openOv.add(d.dataset.ov); else UI.openOv.delete(d.dataset.ov);
    saveUI();
  }
}, true);
/* density toggle */
/* overview card filters */
$("f-active").addEventListener("click", () => {
  UI.fActive = !UI.fActive;
  $("f-active").classList.toggle("on", UI.fActive);
  saveUI();
  renderAll();
});
$("f-stopped").addEventListener("click", () => {
  UI.fStopped = !UI.fStopped;
  $("f-stopped").classList.toggle("on", UI.fStopped);
  saveUI();
  renderAll();
});
$("f-clear").addEventListener("click", () => {
  UI.fActive = false;
  UI.fStopped = false;
  $("f-active").classList.remove("on");
  $("f-stopped").classList.remove("on");
  saveUI();
  renderAll();
});
/* reflect persisted filter state on the buttons at load */
$("f-active").classList.toggle("on", UI.fActive);
$("f-stopped").classList.toggle("on", UI.fStopped);

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

/* open the sidebar legend on the first visit so the shadow-color encoding is
   discoverable; collapsed on every visit after (one-shot localStorage flag) */
try {
  if (!localStorage.getItem("adminsys.legendSeen")) {
    const lg = document.querySelector(".legend");
    if (lg) lg.open = true;
    localStorage.setItem("adminsys.legendSeen", "1");
  }
} catch (e) {}

/* restore the last tab: URL hash wins, else last-used, else overview */
(function initTab() {
  let name = location.hash.slice(1);
  if (!document.querySelector(`.tabbtn[data-tab="${name}"]`)) {
    try { name = localStorage.getItem("adminsys.tab") || "overview"; } catch (e) { name = "overview"; }
  }
  setTab(name);
})();

/* live data: SSE with snapshot fallback */
function startSSE() {
  try {
    const es = new EventSource("/events");
    es.onmessage = (ev) => { CONN = "ok"; setConn("ok"); try { applySnapshot(JSON.parse(ev.data)); } catch (e) {} };
    es.onerror = () => { CONN = "down"; $("livedot").style.setProperty("--dot-c", "var(--red)"); setConn("down"); };
    es.onopen = () => { CONN = "ok"; $("livedot").style.setProperty("--dot-c", "var(--green)"); setConn("ok"); };
  } catch (e) { pollFallback(); }
}
function pollFallback() {
  fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
  setInterval(() => fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {}), 8000);
}
fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
startSSE();
