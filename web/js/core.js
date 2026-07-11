export let SNAP = { agents: [] };
export const SELECTED = new Set();   // empty = all agents


/* ---------- UI state (survives 5s SSE re-renders) ---------- */
export const UI = {
  fActive: false,
  fStopped: false,
  fCron: false,
  logErr: true,
  logWarn: true,
  taskStatus: "",
  taskSort: { key: "started_at", dir: -1 },
  schedSort: { key: "next_run_at", dir: 1 },
  openSkills: new Set(),
  openOv: new Set(),  // open <details data-ov> on Overview (sections + per-card cost)
  profSel: {},        // per-card selected profile ("section:agent" -> name | "__all")
  profGlobal: null,   // global override for every card: null | name | "__all"
};

/* ---------- persist UI + agent selection across reloads (localStorage) ---------- */
const LS_KEY = "adminsys.ui";
export function saveUI() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      fActive: UI.fActive, fStopped: UI.fStopped, fCron: UI.fCron,
      logErr: UI.logErr, logWarn: UI.logWarn, taskStatus: UI.taskStatus,
      taskSort: UI.taskSort, schedSort: UI.schedSort,
      openSkills: [...UI.openSkills], openOv: [...UI.openOv], selected: [...SELECTED],
      profSel: UI.profSel, profGlobal: UI.profGlobal,
    }));
  } catch (e) {}
}
function loadUI() {
  let o;
  try { o = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return; }
  if (!o || typeof o !== "object") return;
  for (const k of ["fActive", "fStopped", "fCron", "logErr", "logWarn", "taskStatus"])
    if (k in o) UI[k] = o[k];
  if (o.taskSort && o.taskSort.key) UI.taskSort = o.taskSort;
  if (o.schedSort && o.schedSort.key) UI.schedSort = o.schedSort;
  if (Array.isArray(o.openSkills)) UI.openSkills = new Set(o.openSkills);
  if (Array.isArray(o.openOv)) UI.openOv = new Set(o.openOv);
  if (o.profSel && typeof o.profSel === "object") UI.profSel = o.profSel;
  if (typeof o.profGlobal === "string") UI.profGlobal = o.profGlobal;
  if (Array.isArray(o.selected)) o.selected.forEach(n => SELECTED.add(n));
}
loadUI();
const STALE_MS = 10 * 60 * 1000;

export function isStale(updatedAt) {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  return !isNaN(t) && (Date.now() - t) > STALE_MS;
}
export function isActive(a) {
  return !!(a.gateway
    && ["running", "connected"].includes((a.gateway.gateway_state || "").toLowerCase()));
}
export function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function sortRows(rows, key, dir) {
  return rows.slice().sort((x, y) => {
    let a = x[key], b = y[key];
    if (typeof a === "number" || typeof b === "number") { a = +a || 0; b = +b || 0; }
    else { a = (a == null ? "" : String(a)).toLowerCase(); b = (b == null ? "" : String(b)).toLowerCase(); }
    return cmp(a, b) * dir;
  });
}
export function arrow(state, key) { return state.key === key ? `<span class="arr">${state.dir > 0 ? "▲" : "▼"}</span>` : ""; }
export function relTime(v) {
  if (v == null || v === "") return "";
  const t = typeof v === "number" ? (v > 1e12 ? v : v * 1000) : Date.parse(v);
  if (isNaN(t)) return "";
  const diff = t - Date.now(), s = Math.round(Math.abs(diff) / 1000);
  const units = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  let out = "0s";
  for (const [lbl, sec] of units) { if (s >= sec) { out = Math.floor(s / sec) + lbl; break; } }
  return diff >= 0 ? "in " + out : out + " ago";
}


export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

export function agents() {
  let list = SNAP.agents || [];
  if (SELECTED.size > 0) list = list.filter(a => SELECTED.has(a.name));
  if (UI.fActive || UI.fStopped) list = list.filter(a =>
    (UI.fActive && isActive(a)) || (UI.fStopped && !isActive(a)));
  return list;
}

export function badgeForState(s) {
  s = (s || "").toLowerCase();
  if (["connected","running","done","completed"].includes(s)) return "b-ok ok";
  if (["stopped","failed","crashed","error","timed_out"].includes(s)) return "b-bad bad";
  if (["running"].includes(s)) return "b-run cyan";
  if (["blocked","paused","timed_out"].includes(s)) return "b-warn warn";
  return "muted";
}

export function tsShort(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {            // epoch seconds or ms
    const ms = v > 1e12 ? v : v * 1000;
    try { return new Date(ms).toISOString().replace("T"," ").slice(0,19); }
    catch (e) { return String(v); }
  }
  return String(v).replace("T"," ").slice(0,19);
}

export function errLine(obj) {
  if (obj && obj.available === false && obj.error)
    return `<div class="err">read error: ${esc(obj.error)}</div>`;
  if (obj && obj.available === false)
    return `<div class="empty">not available</div>`;
  return "";
}

export function syncAgentFilter() {
  const panel = $("agentdd-panel"), btn = $("agentdd-btn");
  if (!panel || !btn) return;
  const names = (SNAP.agents || []).map(a => a.name);
  for (const n of [...SELECTED]) if (!names.includes(n)) SELECTED.delete(n);
  const allOn = SELECTED.size === 0;
  panel.innerHTML =
    `<span class="filterbtn ${allOn ? "on" : ""}" data-agent="*">all</span>` +
    names.map(n => `<span class="filterbtn ${SELECTED.has(n) ? "on" : ""}" data-agent="${esc(n)}">${esc(n)}</span>`).join("");
  btn.textContent = (allOn ? "all" : SELECTED.size === 1 ? [...SELECTED][0] : SELECTED.size + " agents") + " ▾";
}

// resolve which profile a per-profile card should show: explicit per-card pick
// wins, else the global override, else the first profile (main). Clamped to the
// profiles this agent actually has so a global name never blanks a card.
export function profSelFor(key, profs) {
  if (!profs || !profs.length) return null;
  let cand = Object.prototype.hasOwnProperty.call(UI.profSel, key) ? UI.profSel[key] : UI.profGlobal;
  if (!cand) return profs[0].name;
  if (cand === "__all") return "__all";
  return profs.some(p => p.name === cand) ? cand : profs[0].name;
}

// populate the header "profile" dropdown: per-card / all / each distinct profile
// name across agents (main first). Mirrors syncAgentFilter.
export function syncProfileFilter() {
  const panel = $("profdd-panel"), btn = $("profdd-btn");
  if (!panel || !btn) return;
  const set = new Set();
  (SNAP.agents || []).forEach(a => ((a.profiles && a.profiles.profiles) || []).forEach(p => set.add(p.name)));
  const names = [...set].sort((x, y) => (x === "main" ? -1 : y === "main" ? 1 : x < y ? -1 : x > y ? 1 : 0));
  const g = UI.profGlobal || "";
  const opt = (val, label) => `<span class="filterbtn ${g === val ? "on" : ""}" data-pg="${esc(val)}">${esc(label)}</span>`;
  panel.innerHTML = opt("", "per-card") + opt("__all", "all profiles") + names.map(n => opt(n, n)).join("");
  btn.textContent = (!UI.profGlobal ? "per-card" : UI.profGlobal === "__all" ? "all" : UI.profGlobal) + " ▾";
}

export function goTab(name) {
  const btn = document.querySelector(`.tabbtn[data-tab="${name}"]`);
  if (btn) btn.click();
}

export function nextCronRel() {
  let best = null;
  (agents() || []).forEach(a => ((a.cron && a.cron.jobs) || []).forEach(j => {
    if (!j.next_run_at) return;
    const t = Date.parse(j.next_run_at);
    if (!isNaN(t) && (best === null || t < best)) best = t;
  }));
  return best === null ? "—" : relTime(best);
}
export function setSnap(d){ SNAP = d; }

// last time a snapshot was applied (for the "● live · updated Xs ago" indicator)
export let LAST_UPDATE = 0;
export function markUpdated(){ LAST_UPDATE = Date.now(); }

// an agent is "session-stale" if its newest session is older than this
export const SESSION_STALE_MS = 24 * 60 * 60 * 1000;
export function sessionAge(startedAt){
  if (!startedAt) return null;
  const t = Date.parse(startedAt);
  return isNaN(t) ? null : (Date.now() - t);
}
export function fmtUsd(v){ return "$" + (Number(v) || 0).toFixed(2); }
export function fmtBytes(v){
  let n = Number(v) || 0;
  const u = ["B","KB","MB","GB","TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(1)) + " " + u[i];
}

