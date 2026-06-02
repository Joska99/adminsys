"use strict";
let SNAP = { agents: [] };
const SELECTED = new Set();   // empty = all agents


/* ---------- UI state (survives 5s SSE re-renders) ---------- */
const UI = {
  skillQ: "",
  fActive: false,
  fStopped: false,
  fCron: false,
  logErr: true,
  logWarn: true,
  taskStatus: "",
  taskSort: { key: "started_at", dir: -1 },
  schedSort: { key: "next_run_at", dir: 1 },
  openSkills: new Set(),
};
const STALE_MS = 10 * 60 * 1000;

function isStale(updatedAt) {
  if (!updatedAt) return false;
  const t = Date.parse(updatedAt);
  return !isNaN(t) && (Date.now() - t) > STALE_MS;
}
function isActive(a) {
  return !!(a.gateway
    && ["running", "connected"].includes((a.gateway.gateway_state || "").toLowerCase()));
}
function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortRows(rows, key, dir) {
  return rows.slice().sort((x, y) => {
    let a = x[key], b = y[key];
    if (typeof a === "number" || typeof b === "number") { a = +a || 0; b = +b || 0; }
    else { a = (a == null ? "" : String(a)).toLowerCase(); b = (b == null ? "" : String(b)).toLowerCase(); }
    return cmp(a, b) * dir;
  });
}
function arrow(state, key) { return state.key === key ? `<span class="arr">${state.dir > 0 ? "▲" : "▼"}</span>` : ""; }
function relTime(v) {
  if (v == null || v === "") return "";
  const t = typeof v === "number" ? (v > 1e12 ? v : v * 1000) : Date.parse(v);
  if (isNaN(t)) return "";
  const diff = t - Date.now(), s = Math.round(Math.abs(diff) / 1000);
  const units = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  let out = "0s";
  for (const [lbl, sec] of units) { if (s >= sec) { out = Math.floor(s / sec) + lbl; break; } }
  return diff >= 0 ? "in " + out : out + " ago";
}


const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function agents() {
  if (SELECTED.size === 0) return SNAP.agents || [];
  return (SNAP.agents || []).filter(a => SELECTED.has(a.name));
}

function badgeForState(s) {
  s = (s || "").toLowerCase();
  if (["connected","running","done","completed"].includes(s)) return "b-ok ok";
  if (["stopped","failed","crashed","error","timed_out"].includes(s)) return "b-bad bad";
  if (["running"].includes(s)) return "b-run cyan";
  if (["blocked","paused","timed_out"].includes(s)) return "b-warn warn";
  return "muted";
}

function tsShort(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {            // epoch seconds or ms
    const ms = v > 1e12 ? v : v * 1000;
    try { return new Date(ms).toISOString().replace("T"," ").slice(0,19); }
    catch (e) { return String(v); }
  }
  return String(v).replace("T"," ").slice(0,19);
}

function errLine(obj) {
  if (obj && obj.available === false && obj.error)
    return `<div class="err">read error: ${esc(obj.error)}</div>`;
  if (obj && obj.available === false)
    return `<div class="empty">not available</div>`;
  return "";
}

/* ---------- Overview ---------- */
function renderOverview() {
  const list = agents();

  // filtered set = the agent cards currently shown
  let cardList = list;
  if (UI.fActive || UI.fStopped) cardList = cardList.filter(a =>
    (UI.fActive && isActive(a)) || (UI.fStopped && !isActive(a)));
  if (UI.fCron) cardList = cardList.filter(a =>
    a.cron && a.cron.jobs && a.cron.jobs.length > 0);

  // box stats reflect only the currently shown cards
  let activeAgents = 0, totalSessions = 0, runningTasks = 0, cronTotal = 0, cronFailed = 0;
  cardList.forEach(a => {
    activeAgents += (a.gateway && a.gateway.active_agents) || 0;
    totalSessions += (a.sessions && a.sessions.total) || 0;
    cronTotal += (a.cron && a.cron.jobs ? a.cron.jobs.length : 0);
    cronFailed += (a.cron && a.cron.failed) || 0;
    ((a.kanban && a.kanban.runs) || []).forEach(r => {
      if ((r.status || "").toLowerCase() === "running") runningTasks++;
    });
  });

  const q = UI.skillQ.trim().toLowerCase();
  const agentNames = cardList.map(a => a.name).slice().sort();
  const activeNames = cardList.filter(isActive).map(a => a.name).sort();

  let cards = cardList.map(a => {
    const g = a.gateway || {};
    const gs = (g.gateway_state || "").toLowerCase();
    let health;
    if (["running", "connected"].includes(gs)) health = "h-ok";      // running -> green
    else if (["failed", "crashed"].includes(gs)) health = "h-bad";   // failed -> red
    else health = "h-warn";                                          // stopped/other -> yellow

    const plats = Object.entries(g.platforms || {}).map(([k, v]) =>
      `<span class="pill ${(v.state || "").toLowerCase() === "connected" ? "b-ok ok" : "b-bad bad"}">${esc(k)}: ${esc(v.state)}</span>`
    ).join(" ") || `<span class="empty">no platforms</span>`;

    // error surfacing
    const errs = [];
    if (g.exit_reason) errs.push("gateway: " + g.exit_reason);
    const failed = ((a.kanban && a.kanban.runs) || []).filter(r =>
      r.error || ["failed", "crashed", "timed_out"].includes((r.status || "").toLowerCase()));
    if (failed.length) errs.push(failed.length + " task run(s) failed");
    const banner = errs.length ? `<div class="banner">⚠ ${esc(errs.join(" · "))}</div>` : "";

    // 7-day session sparkline
    const d7 = (a.sessions && a.sessions.daily7) || [];
    const max = Math.max(1, ...d7.map(x => x.count || 0));
    const spark = d7.length
      ? `<div class="spark-wrap"><div class="spark">${d7.map(x =>
          `<i style="height:${Math.round((x.count || 0) / max * 100)}%" title="${esc(x.date)}: ${x.count}"></i>`).join("")}</div><span class="spark-lbl">7d&nbsp;sessions</span></div>`
      : "";

    // skills (filterable, open-state preserved)
    const sk = a.skills || {};
    let byCat = sk.by_category || {};
    if (q) {
      const f = {};
      Object.entries(byCat).forEach(([cat, names]) => {
        const m = names.filter(n => n.toLowerCase().includes(q));
        if (m.length) f[cat] = m;
      });
      byCat = f;
    }
    const shownTotal = Object.values(byCat).reduce((s, n) => s + n.length, 0);
    const cats = Object.entries(byCat).map(([c, n]) =>
      `<span class="pill mono">${esc(c)} ${n.length}</span>`).join(" ");
    const skDetail = Object.entries(byCat)
      .sort((x, y) => y[1].length - x[1].length)
      .map(([cat, names]) =>
        `<div class="skcat"><b>${esc(cat)}</b>${
          names.map(n => `<span class="pill mono">${esc(n)}</span>`).join(" ")}</div>`).join("");
    const open = (UI.openSkills.has(a.name) || q) ? " open" : "";
    const skillsBlock = sk.available === false
      ? `<div class="empty">skills not available</div>`
      : `<div class="cats">${cats || `<span class="empty">${q ? "no skills match" : "no skills"}</span>`}</div>
         ${skDetail ? `<details class="skills" data-agent="${esc(a.name)}"${open}><summary>${
            q ? shownTotal + " of " + (sk.total || 0) : "all " + (sk.total || 0)} skills</summary>${skDetail}</details>` : ``}`;


    return `<div class="panel clickable ${health}" onclick="goTab('agents')" title="open Agents tab">
      <h3><span class="agentname">${esc(a.name)}</span>
        <span class="pill ${badgeForState(g.gateway_state)}">${esc(g.gateway_state || "unknown")}</span>
        <span class="pill modelpill mono">${esc(a.model || "no model")}</span></h3>
      ${errLine(g)}
      ${banner}
      <div class="stat">
        <div><div class="num c-yel">${(a.sessions && a.sessions.total) || 0}</div><div class="lbl">sessions</div></div>
        <div><div class="num">${(g.active_agents != null ? g.active_agents : "-")}</div><div class="lbl">active</div></div>
        <div><div class="num">${(a.cron && a.cron.jobs ? a.cron.jobs.length : 0)}</div><div class="lbl">cron jobs</div></div>
        <div><div class="num">${(sk.total != null ? sk.total : 0)}</div><div class="lbl">skills</div></div>
        <div><div class="num">${(a.profiles && a.profiles.profiles ? a.profiles.profiles.length : 0)}</div><div class="lbl">profiles</div></div>
      </div>
      <div>${plats}</div>
    </div>`;
  }).join("");
  if (!cards) cards = `<div class="empty">No agents ${(UI.fActive || UI.fStopped || UI.fCron) ? "match the filters" : "discovered under /data"}.</div>`;

  const secHead = (t, b) => `<div class="cards-head"><span class="ch-bar">▌</span><div class="ch-txt"><div class="ch-title">${t}</div><div class="ch-brief">${b}</div></div></div>`;

  // INCIDENTS — agents with errors / cron failures / gateway exit
  const incRows = cardList.map(a => {
    const lg = a.logs || {}, cr = a.cron || {}, g = a.gateway || {};
    const errs = lg.errors || 0, warns = lg.warnings || 0, cf = cr.failed || 0, exit = g.exit_reason || "";
    if (!errs && !cf && !exit) return "";
    return `<tr><td>${esc(a.name)}</td><td class="bad">${errs}</td><td class="warn">${warns}</td><td class="bad">${cf}</td><td class="ts">${esc(exit)}</td></tr>`;
  }).filter(Boolean).join("");
  const secIncidents = secHead("INCIDENTS", "errors · cron failures · exits — click to open Logs") +
    `<div class="panel ovsec clickable" onclick="goTab('logs')" title="open Logs"><table><thead><tr><th>agent</th><th>errors</th><th>warnings</th><th>cron fail</th><th>exit reason</th></tr></thead><tbody>${incRows || `<tr><td colspan="5" class="empty">no incidents</td></tr>`}</tbody></table></div>`;

  // CHANNELS
  const chHtml = cardList.map(a => {
    const cs = (a.channels && a.channels.channels) || [];
    const chips = cs.map(c => `<span class="pill mono">${esc(c.platform)}:${esc(c.name || c.id)}</span>`).join(" ") || `<span class="empty">none</span>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="ts">${cs.length} channels</div><div class="cats">${chips}</div></div>`;
  }).join("");
  const secChannels = secHead("CHANNELS", "platform bindings") + `<div class="grid">${chHtml}</div>`;

  // TOP SKILLS — top 10 used per agent (skills/.usage.json use_count)
  const tsHtml = cardList.map(a => {
    const tu = (a.skills && a.skills.top_used) || [];
    const rows = tu.map((s, i) => `<tr><td class="muted">${i + 1}</td><td>${esc(s.name)}</td><td>${s.count}</td></tr>`).join("") || `<tr><td colspan="3" class="empty">no usage</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><table><thead><tr><th>#</th><th>skill</th><th>uses</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
  const secTopSkills = secHead("TOP SKILLS", "top 10 used per agent") + `<div class="grid">${tsHtml}</div>`;

  // SCHEDULE — next 5 cron jobs across all shown agents & profiles
  const allJobs = [];
  cardList.forEach(a => ((a.cron && a.cron.jobs) || []).forEach(j => allJobs.push({ agent: a.name, job: j })));
  allJobs.sort((x, y) => {
    const xa = x.job.next_run_at || "~", ya = y.job.next_run_at || "~";
    return xa < ya ? -1 : xa > ya ? 1 : 0;
  });
  const schRows = allJobs.slice(0, 5).map(({ agent, job: j }) =>
    `<tr><td>${esc(agent)}</td><td class="mono">${esc(j.profile || "—")}</td><td>${esc(j.name)}</td><td class="mono">${esc(j.schedule || "—")}</td><td class="mono">${esc(j.skill || "—")}</td><td class="mono">${esc(j.model || "—")}</td><td class="mono">${esc(relTime(j.next_run_at))}</td></tr>`
  ).join("") || `<tr><td colspan="7" class="empty">no cron jobs</td></tr>`;
  const secSchedule = secHead("CRON", "next 5 cron jobs — click to open Cron") +
    `<div class="panel ovsec clickable" onclick="goTab('schedule')" title="open Cron"><table><thead><tr><th>agent</th><th>profile</th><th>name</th><th>schedule</th><th>skill</th><th>model</th><th>in</th></tr></thead><tbody>${schRows}</tbody></table></div>`;

  const tokRows = cardList.map(a => {
    const t = a.tokens || {};
    if (t.available === false) return `<tr><td>${esc(a.name)}</td><td class="muted">—</td><td class="muted">—</td><td class="muted">—</td></tr>`;
    const top = (t.models || [])[0];
    return `<tr><td>${esc(a.name)}</td><td>${(t.total_tokens || 0).toLocaleString()}</td><td>${t.responses || 0}</td><td class="mono">${top ? esc(top.model) + " (" + top.tokens + ")" : "—"}</td></tr>`;
  }).join("");
  const secTokens = secHead("TOKENS", "usage from response_store.db") +
    `<div class="panel ovsec"><table><thead><tr><th>agent</th><th>total tokens</th><th>responses</th><th>top model</th></tr></thead><tbody>${tokRows}</tbody></table></div>`;

  $("tab-overview").innerHTML = `
    <div class="ov-head">
      <div class="ov-title">▌ SYSTEM OVERVIEW</div>
      <div class="ov-brief">showing ${cardList.length}/${list.length} agents · ${activeNames.length} active · ${runningTasks} running · ${totalSessions} sessions</div>
    </div>
    <div class="topgrid">
      <div class="kpi kpi-grn clickable" onclick="goTab('agents')" title="open Agents">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M28.95 15.24h1.53v7.62h-1.53Z"></path><path d="m27.43 24.39 1.52 0 0 -1.53 -1.52 0 0 -7.62 1.52 0 0 -1.52 -1.52 0 0 -3.05 -1.53 0 0 3.05 -19.8 0 0 -3.05 -1.53 0 0 3.05 -1.52 0 0 1.52 1.52 0 0 7.62 -1.52 0 0 1.53 1.52 0 0 1.52 1.53 0 0 -10.67 19.8 0 0 10.67 1.53 0 0 -1.52z"></path><path d="M25.9 0h1.53v1.53H25.9Z"></path><path d="M24.38 25.91h1.52v1.52h-1.52Z"></path><path d="M24.38 7.62h1.52v3.05h-1.52Z"></path><path d="M24.38 1.53h1.52v1.52h-1.52Z"></path><path d="M22.86 6.1h1.52v1.52h-1.52Z"></path><path d="M22.86 3.05h1.52v1.53h-1.52Z"></path><path d="m21.33 30.48 1.53 0 0 -1.52 1.52 0 0 -1.53 -3.05 0 0 3.05z"></path><path d="M19.81 4.58h3.05V6.1h-3.05Z"></path><path d="M18.29 30.48h3.04V32h-3.04Z"></path><path d="m13.71 27.43 0 3.05 1.53 0 0 -1.52 1.52 0 0 1.52 1.53 0 0 -3.05 -4.58 0z"></path><path d="M12.19 3.05h7.62v1.53h-7.62Z"></path><path d="M10.67 30.48h3.04V32h-3.04Z"></path><path d="M22.86 12.19V9.15h-1.53V7.62H10.67v1.53H9.14v3.04Zm-4.57 -3.04h1.52v1.52h-1.52Zm-6.1 0h1.52v1.52h-1.52Z"></path><path d="M9.14 4.58h3.05V6.1H9.14Z"></path><path d="m7.62 27.43 0 1.53 1.52 0 0 1.52 1.53 0 0 -3.05 -3.05 0z"></path><path d="M7.62 6.1h1.52v1.52H7.62Z"></path><path d="M7.62 3.05h1.52v1.53H7.62Z"></path><path d="M6.1 25.91h1.52v1.52H6.1Z"></path><path d="M6.1 7.62h1.52v3.05H6.1Z"></path><path d="M6.1 1.53h1.52v1.52H6.1Z"></path><path d="M4.57 0H6.1v1.53H4.57Z"></path><path d="M1.52 15.24h1.53v7.62H1.52Z"></path></g></svg></span>
        <div class="kpi-num">${cardList.length}</div>
        <div class="kpi-title">agents</div>
      </div>
      <div class="kpi kpi-cyn">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M1.52 30.475h28.96v-1.52H32v-10.67h-1.52v-1.52H1.52v1.52H0v10.67h1.52Zm24.38 -10.66h3.05v3.05H25.9Zm-7.61 0h4.57v1.52h-3.05v1.53h3.05v1.52h-3.05v1.52h3.05v1.53h-4.57Zm-6.1 0h1.52v6.09h1.53v-6.09h1.52v6.09h-1.52v1.53h-1.53v-1.53h-1.52Zm-3.05 0h1.53v7.62H9.14Zm-6.09 0h1.52v6.09h3.05v1.53H3.05Z"></path><path d="M25.9 7.625h1.53v1.52H25.9Z"></path><path d="M24.38 6.095h1.52v1.53h-1.52Z"></path><path d="M22.86 10.665h1.52v1.53h-1.52Z"></path><path d="M21.33 9.145h1.53v1.52h-1.53Z"></path><path d="M21.33 4.575h3.05v1.52h-3.05Z"></path><path d="M18.29 7.625h3.04v1.52h-3.04Z"></path><path d="M18.29 12.195h1.52v1.52h-1.52Z"></path><path d="M18.29 3.055h3.04v1.52h-3.04Z"></path><path d="M13.71 10.665h4.58v1.53h-4.58Z"></path><path d="M13.71 6.095h4.58v1.53h-4.58Z"></path><path d="M13.71 1.525h4.58v1.53h-4.58Z"></path><path d="M12.19 12.195h1.52v1.52h-1.52Z"></path><path d="M10.67 3.055h3.04v1.52h-3.04Z"></path><path d="M10.67 7.625h3.04v1.52h-3.04Z"></path><path d="M9.14 9.145h1.53v1.52H9.14Z"></path><path d="M7.62 4.575h3.05v1.52H7.62Z"></path><path d="M7.62 10.665h1.52v1.53H7.62Z"></path><path d="M6.1 6.095h1.52v1.53H6.1Z"></path><path d="M4.57 7.625H6.1v1.52H4.57Z"></path></g></svg></span>
        <div class="kpi-num">${activeNames.length}</div>
        <div class="kpi-title">active agents</div>
      </div>
      <div class="kpi kpi-pnk">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M30.47 6.1H32v4.57h-1.53Z"></path><path d="M28.95 10.67h1.52v1.52h-1.52Z"></path><path d="M28.95 4.57h1.52V6.1h-1.52Z"></path><path d="M27.43 12.19h1.52v1.52h-1.52Z"></path><path d="M27.43 3.05h1.52v1.52h-1.52Z"></path><path d="M25.9 13.71h1.53v1.53H25.9Z"></path><path d="M25.9 10.67h1.53v1.52H25.9Z"></path><path d="M25.9 1.52h1.53v1.53H25.9Z"></path><path d="M24.38 15.24h1.52v1.52h-1.52Z"></path><path d="M24.38 9.14h1.52v1.53h-1.52Z"></path><path d="M22.85 16.76h1.53v1.53h-1.53Z"></path><path d="M22.85 10.67h1.53v1.52h-1.53Z"></path><path d="M22.85 7.62h1.53v1.52h-1.53Z"></path><path d="M21.33 0h4.57v1.52h-4.57Z"></path><path d="M21.33 18.29h1.52v1.52h-1.52Z"></path><path d="M21.33 12.19h1.52v1.52h-1.52Z"></path><path d="M21.33 6.1h1.52v1.52h-1.52Z"></path><path d="M19.81 19.81h1.52v1.52h-1.52Z"></path><path d="M19.81 13.71h1.52v1.53h-1.52Z"></path><path d="M19.81 7.62h1.52v1.52h-1.52Z"></path><path d="M19.81 4.57h1.52V6.1h-1.52Z"></path><path d="M19.81 1.52h1.52v1.53h-1.52Z"></path><path d="M18.28 21.33h1.53v1.53h-1.53Z"></path><path d="M18.28 15.24h1.53v1.52h-1.53Z"></path><path d="M18.28 9.14h1.53v1.53h-1.53Z"></path><path d="M18.28 3.05h1.53v1.52h-1.53Z"></path><path d="M16.76 22.86h1.52v1.52h-1.52Z"></path><path d="M16.76 16.76h1.52v1.53h-1.52Z"></path><path d="M16.76 10.67h1.52v1.52h-1.52Z"></path><path d="M16.76 4.57h1.52V6.1h-1.52Z"></path><path d="M15.24 24.38h1.52v1.52h-1.52Z"></path><path d="M15.24 18.29h1.52v1.52h-1.52Z"></path><path d="M15.24 12.19h1.52v1.52h-1.52Z"></path><path d="M15.24 6.1h1.52v1.52h-1.52Z"></path><path d="M13.71 25.9h1.53v1.53h-1.53Z"></path><path d="M13.71 19.81h1.53v1.52h-1.53Z"></path><path d="M13.71 13.71h1.53v1.53h-1.53Z"></path><path d="M13.71 7.62h1.53v1.52h-1.53Z"></path><path d="M12.19 27.43h1.52v1.52h-1.52Z"></path><path d="M12.19 21.33h1.52v1.53h-1.52Z"></path><path d="M12.19 15.24h1.52v1.52h-1.52Z"></path><path d="M12.19 9.14h1.52v1.53h-1.52Z"></path><path d="M10.66 22.86h1.53v1.52h-1.53Z"></path><path d="M10.66 16.76h1.53v1.53h-1.53Z"></path><path d="M10.66 10.67h1.53v1.52h-1.53Z"></path><path d="M10.66 30.48h1.53v-1.53h-1.53v-4.57H7.62v-3.05H3.05v-1.52H1.52v1.52H0V32h10.66Zm-1.52 0H4.57v-1.53H3.05v-1.52H1.52v-4.57h4.57v3.04h3.05Z"></path><path d="M9.14 18.29h1.52v1.52H9.14Z"></path><path d="M9.14 12.19h1.52v1.52H9.14Z"></path><path d="M7.62 19.81h1.52v1.52H7.62Z"></path><path d="M7.62 13.71h1.52v1.53H7.62Z"></path><path d="M6.09 15.24h1.53v1.52H6.09Z"></path><path d="M4.57 16.76h1.52v1.53H4.57Z"></path><path d="M3.05 18.29h1.52v1.52H3.05Z"></path></g></svg></span>
        <div class="kpi-num">${runningTasks}</div>
        <div class="kpi-title">running tasks</div>
      </div>
      <div class="kpi kpi-yel">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m3.81 1.52 24.38 0 0 1.53 -1.52 0 0 1.52 1.52 0 0 3.05 1.53 0 0 22.86 1.52 0 0 -24.38 -1.52 0 0 -4.58 1.52 0 0 -1.52L3.81 0l0 1.52z"></path><path d="m6.86 30.48 0 -22.86 9.14 0 0 -1.52 -12.19 0 0 1.52 1.53 0 0 22.86 -1.53 0 0 1.52 25.91 0 0 -1.52 -22.86 0z"></path><path d="m25.15 10.67 -1.53 0 0 -4.57 -1.52 0 0 -1.53 1.52 0 0 -1.52 -7.62 0 0 1.52 1.53 0 0 1.53 1.52 0 0 15.23 1.52 0 0 -1.52 1.53 0 0 -1.52 1.52 0 0 1.52 1.53 0 0 1.52 1.52 0 0 -15.23 -1.52 0 0 4.57z"></path><path d="M23.62 4.57h1.53V6.1h-1.53Z"></path><path d="M5.34 3.05h9.14v1.52H5.34Z"></path><path d="M2.29 28.95h1.52v1.53H2.29Z"></path><path d="M2.29 1.52h1.52v1.53H2.29Z"></path><path d="m2.29 6.1 1.52 0 0 -1.53 -1.52 0 0 -1.52 -1.53 0 0 25.9 1.53 0 0 -22.85z"></path></g></svg></span>
        <div class="kpi-num">${totalSessions}</div>
        <div class="kpi-title">total sessions</div>
      </div>
      <div class="kpi kpi-org clickable" onclick="goTab('schedule')" title="open Cron">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m19.81 26.67 0 1.52 3.04 0 0 1.53 -13.71 0 0 -1.53 3.05 0 0 -1.52 -3.05 0 0 -3.05 -1.52 0 0 6.1 -3.05 0 0 1.52 22.86 0 0 -1.52 -3.05 0 0 -6.1 -1.53 0 0 3.05 -3.04 0z"></path><path d="M21.33 20.57h1.52v3.05h-1.52Z"></path><path d="M21.33 8.38h1.52v3.05h-1.52Z"></path><path d="M19.81 19.05h1.52v1.52h-1.52Z"></path><path d="M18.28 17.53h1.53v1.52h-1.53Z"></path><path d="M16.76 25.14h3.05v1.53h-3.05Z"></path><path d="m19.81 14.48 0 -1.53 1.52 0 0 -1.52 -10.67 0 0 1.52 1.53 0 0 1.53 1.52 0 0 3.05 1.53 0 0 7.61 1.52 0 0 -7.61 1.52 0 0 -3.05 1.53 0z"></path><path d="M12.19 25.14h3.05v1.53h-3.05Z"></path><path d="M12.19 17.53h1.52v1.52h-1.52Z"></path><path d="M10.66 19.05h1.53v1.52h-1.53Z"></path><path d="M9.14 20.57h1.52v3.05H9.14Z"></path><path d="M9.14 8.38h1.52v3.05H9.14Z"></path><path d="m9.14 2.29 13.71 0 0 6.09 1.53 0 0 -6.09 3.05 0 0 -1.53 -22.86 0 0 1.53 3.05 0 0 6.09 1.52 0 0 -6.09z"></path></g></svg></span>
        <div class="kpi-num">${cronTotal}</div>
        <div class="kpi-title">total crons</div>
      </div>
      <div class="kpi kpi-red clickable" onclick="goTab('schedule')" title="open Cron">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m19.81 26.67 0 1.52 3.04 0 0 1.53 -13.71 0 0 -1.53 3.05 0 0 -1.52 -3.05 0 0 -3.05 -1.52 0 0 6.1 -3.05 0 0 1.52 22.86 0 0 -1.52 -3.05 0 0 -6.1 -1.53 0 0 3.05 -3.04 0z"></path><path d="M21.33 20.57h1.52v3.05h-1.52Z"></path><path d="M21.33 8.38h1.52v3.05h-1.52Z"></path><path d="M19.81 19.05h1.52v1.52h-1.52Z"></path><path d="M18.28 17.53h1.53v1.52h-1.53Z"></path><path d="M16.76 25.14h3.05v1.53h-3.05Z"></path><path d="m19.81 14.48 0 -1.53 1.52 0 0 -1.52 -10.67 0 0 1.52 1.53 0 0 1.53 1.52 0 0 3.05 1.53 0 0 7.61 1.52 0 0 -7.61 1.52 0 0 -3.05 1.53 0z"></path><path d="M12.19 25.14h3.05v1.53h-3.05Z"></path><path d="M12.19 17.53h1.52v1.52h-1.52Z"></path><path d="M10.66 19.05h1.53v1.52h-1.53Z"></path><path d="M9.14 20.57h1.52v3.05H9.14Z"></path><path d="M9.14 8.38h1.52v3.05H9.14Z"></path><path d="m9.14 2.29 13.71 0 0 6.09 1.53 0 0 -6.09 3.05 0 0 -1.53 -22.86 0 0 1.53 3.05 0 0 6.09 1.52 0 0 -6.09z"></path></g></svg></span>
        <div class="kpi-num">${cronFailed}</div>
        <div class="kpi-title">failed crons</div>
      </div>
    </div>
    <div class="midline"></div>
    <div class="cards-head">
      <span class="ch-bar">▌</span>
      <div class="ch-txt">
        <div class="ch-title">AGENTS</div>
        <div class="ch-brief">· ${cronTotal} cron jobs</div>
      </div>
    </div>
    <div class="grid">${cards}</div>
    <div class="midline"></div>
    ${secSchedule}
    <div class="midline"></div>
    ${secTopSkills}
    <div class="midline"></div>
    ${secTokens}
    <div class="midline"></div>
    ${secIncidents}`;
}

/* ---------- Agents (profiles) ---------- */
function renderAgents() {
  const list = agents();
  const head = (t, b) => `<div class="cards-head"><span class="ch-bar">▌</span><div class="ch-txt"><div class="ch-title">${t}</div><div class="ch-brief">${b}</div></div></div>`;

  const profHtml = list.map(a => {
    const p = a.profiles || {};
    const rows = (p.profiles || []).map(pr =>
      `<tr><td class="mono">${esc(pr.name)}</td><td>${esc(pr.model || "—")}</td></tr>`
    ).join("");
    return `<div class="panel">
      <h3><span class="agentname">${esc(a.name)}</span></h3>
      ${errLine(p)}
      <table><thead><tr><th>profile</th><th>model</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="2" class="empty">no profiles</td></tr>`}</tbody></table>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;

  const discHtml = list.map(a => {
    const c = a.channels || {};
    if (c.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no discord directory</div></div>`;
    const chList = (c.channels || []).map(x => `<div class="dname">${esc(x.name || x.id)}</div>`).join("") || `<div class="muted">—</div>`;
    const dmList = (c.dms || []).map(x => `<div class="dname">${esc(x.name || x.id)}</div>`).join("") || `<div class="muted">—</div>`;
    return `<div class="panel">
      <h3><span class="agentname">${esc(a.name)}</span></h3>
      <table class="discord-tbl"><thead><tr><th>channels</th><th>dms</th><th>threads</th></tr></thead>
      <tbody><tr><td>${chList}</td><td>${dmList}</td><td class="mono">${c.thread_count || 0}</td></tr></tbody></table>
    </div>`;
  }).join("");

  const memHtml = list.map(a => {
    const m = a.memory || {};
    if (m.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no memory</div></div>`;
    const mem = m.memory ? `<details class="skills" open><summary>MEMORY.md</summary><pre class="memtext">${esc(m.memory)}</pre></details>` : "";
    const usr = m.user ? `<details class="skills"><summary>USER.md</summary><pre class="memtext">${esc(m.user)}</pre></details>` : "";
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3>${mem}${usr || (mem ? "" : `<div class="empty">—</div>`)}</div>`;
  }).join("");

  const skHtml = list.map(a => {
    const used = (a.skills && a.skills.used) || [];
    const rows = used.map(s =>
      `<tr><td>${esc(s.name)}</td><td class="mono">${s.count}</td><td class="ts">${esc(tsShort(s.last_used))}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no usage</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3>
      <table><thead><tr><th>skill</th><th>uses</th><th>last used</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");

  $("tab-agents").innerHTML = `
    <div class="grid">${profHtml}</div>
    <div class="midline"></div>
    ${head("DISCORD", "channels · dms · threads")}<div class="grid">${discHtml}</div>
    <div class="midline"></div>
    ${head("SKILLS USAGE", "active skills · uses per skill")}<div class="grid">${skHtml}</div>
    <div class="midline"></div>
    ${head("MEMORY", "MEMORY.md · USER.md")}<div class="grid">${memHtml}</div>`;
}

/* ---------- Tasks (kanban runs) ---------- */
function taskTh(key, label) {
  return `<th class="sortable" data-table="task" data-key="${key}">${label}${arrow(UI.taskSort, key)}</th>`;
}
function renderTasks() {
  const list = agents();
  const statuses = new Set();
  list.forEach(a => ((a.kanban && a.kanban.runs) || []).forEach(r => statuses.add((r.status || "?").toLowerCase())));
  const chips = [`<span class="chip${UI.taskStatus === "" ? " active" : ""}" data-taskstatus="">all</span>`]
    .concat([...statuses].sort().map(s =>
      `<span class="chip${UI.taskStatus === s ? " active" : ""}" data-taskstatus="${esc(s)}">${esc(s)}</span>`)).join("");

  const html = list.map(a => {
    const k = a.kanban || {};
    let runs = (k.runs || []);
    if (UI.taskStatus) runs = runs.filter(r => (r.status || "").toLowerCase() === UI.taskStatus);
    runs = sortRows(runs, UI.taskSort.key, UI.taskSort.dir);
    const rows = runs.map(r =>
      `<tr>
        <td class="mono">${esc((r.task_id || "").slice(0,10))}</td>
        <td><span class="pill ${badgeForState(r.status)}">${esc(r.status || "?")}</span></td>
        <td>${esc(r.outcome || "")}</td>
        <td>${esc((r.summary || "").slice(0,70))}</td>
        <td class="ts">${esc(tsShort(r.started_at))}</td>
        <td class="err">${esc((r.error || "").slice(0,60))}</td>
      </tr>`).join("");
    return `<div class="panel" style="grid-column:1/-1">
      <h3><span class="agentname">${esc(a.name)}</span> — task runs</h3>
      ${errLine(k)}
      <table><thead><tr>${taskTh("task_id","task")}${taskTh("status","status")}${taskTh("outcome","outcome")}<th>summary</th>${taskTh("started_at","started")}<th>error</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty">no task runs</td></tr>`}</tbody></table>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-tasks").innerHTML = `<div class="chips">${chips}</div><div class="grid">${html}</div>`;
}

/* ---------- Schedule (cron) ---------- */
function schedTh(key, label) {
  return `<th class="sortable" data-table="sched" data-key="${key}">${label}${arrow(UI.schedSort, key)}</th>`;
}
function renderSchedule() {
  const html = agents().map(a => {
    const c = a.cron || {};
    const jobs = sortRows(c.jobs || [], UI.schedSort.key, UI.schedSort.dir);
    const rows = jobs.map(j =>
      `<tr>
        <td class="mono">${esc(j.profile || "—")}</td>
        <td>${esc(j.name)}</td>
        <td class="mono">${esc(j.schedule || "—")}</td>
        <td class="mono">${esc(j.skill || "—")}</td>
        <td class="mono">${esc(j.model || "—")}</td>
        <td><span class="pill ${j.enabled ? "b-ok ok" : "muted"}">${j.enabled ? "on" : "off"}</span></td>
        <td><span class="pill ${badgeForState(j.last_status)}">${esc(j.last_status || "—")}</span></td>
        <td class="ts">${esc(tsShort(j.next_run_at))}</td>
        <td class="mono">${esc(relTime(j.next_run_at))}</td>
        <td>${(j.run_count || 0) ? `<details class="skills"><summary>${j.run_count} runs</summary>${(j.runs || []).map(f => `<div class="skcat"><a href="/api/cron-run?agent=${encodeURIComponent(a.name)}&profile=${encodeURIComponent(j.profile || "main")}&job=${encodeURIComponent(j.id)}&file=${encodeURIComponent(f)}" target="_blank" rel="noopener">${esc(f.replace(".md", "").replace("_", " "))}</a></div>`).join("")}</details>` : `<span class="muted">0</span>`}</td>
      </tr>`).join("");
    return `<div class="panel" style="grid-column:1/-1">
      <h3><span class="agentname">${esc(a.name)}</span> — cron jobs</h3>
      ${errLine(c)}
      <table><thead><tr>${schedTh("profile","profile")}${schedTh("name","name")}${schedTh("schedule","schedule")}${schedTh("skill","skill")}${schedTh("model","model")}${schedTh("enabled","enabled")}${schedTh("last_status","last")}${schedTh("next_run_at","next run")}<th>in</th><th>runs</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10" class="empty">no cron jobs</td></tr>`}</tbody></table>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-schedule").innerHTML = `<div class="grid">${html}</div>`;
}

/* ---------- Sessions ---------- */
function renderSessions() {
  const html = agents().map(a => {
    const s = a.sessions || {};
    const rows = (s.recent || []).map(r =>
      `<tr><td class="mono">${esc(r.id)}</td><td class="ts">${esc(tsShort(r.started_at))}</td>
        <td>${r.messages == null ? "—" : esc(r.messages)}</td></tr>`).join("");
    return `<div class="panel">
      <h3><span class="agentname">${esc(a.name)}</span>
        <span class="pill mono">${(s.total != null ? s.total : 0)} total</span></h3>
      ${errLine(s)}
      <table><thead><tr><th>session</th><th>started</th><th>msgs</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="3" class="empty">no sessions</td></tr>`}</tbody></table>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-sessions").innerHTML = `<div class="grid">${html}</div>`;
}

/* ---------- Logs ---------- */
function renderLogs() {
  const chips = `<div class="chips">
    <span class="filterbtn ${UI.logErr ? "on" : ""}" data-logfilter="err">errors</span>
    <span class="filterbtn ${UI.logWarn ? "on" : ""}" data-logfilter="warn">warnings</span>
  </div>`;
  const html = agents().map(a => {
    const lg = a.logs || {};
    if (lg.available === false) {
      return `<div class="panel" style="grid-column:1/-1"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no logs</div></div>`;
    }
    const shown = (lg.issues || []).filter(it =>
      (it.level === "error" && UI.logErr) || (it.level === "warn" && UI.logWarn));
    const lines = shown.map(it =>
      `<div class="logline ${it.level === "error" ? "bad" : "warn"}">${esc(it.text)}</div>`
    ).join("") || `<div class="empty">no matching lines</div>`;
    const a_ = encodeURIComponent(a.name);
    return `<div class="panel" style="grid-column:1/-1">
      <h3><span class="agentname">${esc(a.name)}</span>
        <span class="pill b-bad bad">${lg.errors || 0} err</span>
        <span class="pill b-warn warn">${lg.warnings || 0} warn</span>
        <span class="pill">${lg.total || 0} lines</span></h3>
      <div class="loglinks">open full:
        <a href="/api/log?agent=${a_}&file=errors.log" target="_blank" rel="noopener">errors.log ↗</a>
        <a href="/api/log?agent=${a_}&file=agent.log" target="_blank" rel="noopener">agent.log ↗</a>
        <a href="/api/log?agent=${a_}&file=gateway.log" target="_blank" rel="noopener">gateway.log ↗</a>
      </div>
      <div class="logbox">${lines}</div>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-logs").innerHTML = chips + `<div class="grid">${html}</div>`;
}

function renderAll() {
  $("agentcount").textContent = (SNAP.agent_count || 0) + " agents";
  const av = document.getElementById("appver"); if (av) av.textContent = SNAP.version || "dev";
  renderOverview(); renderAgents(); renderTasks(); renderSchedule(); renderSessions(); renderLogs();
}

function syncAgentFilter() {
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

let LAST_SIG = "";
function applySnapshot(data) {
  SNAP = data || { agents: [] };
  syncAgentFilter();
  const sig = JSON.stringify(SNAP.agents);
  if (sig === LAST_SIG) return;   // no data change -> keep DOM + interaction state
  LAST_SIG = sig;
  renderAll();
}

/* tabs */
function goTab(name) {
  const btn = document.querySelector(`.tabbtn[data-tab="${name}"]`);
  if (btn) btn.click();
}
function nextCronRel() {
  let best = null;
  (agents() || []).forEach(a => ((a.cron && a.cron.jobs) || []).forEach(j => {
    if (!j.next_run_at) return;
    const t = Date.parse(j.next_run_at);
    if (!isNaN(t) && (best === null || t < best)) best = t;
  }));
  return best === null ? "—" : relTime(best);
}
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
  renderOverview();
});
$("f-stopped").addEventListener("click", () => {
  UI.fStopped = !UI.fStopped;
  $("f-stopped").classList.toggle("on", UI.fStopped);
  renderOverview();
});

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
    es.onerror = () => { $("livedot").style.background = "var(--gold)"; };
    es.onopen = () => { $("livedot").style.background = "var(--green)"; };
  } catch (e) { pollFallback(); }
}
function pollFallback() {
  fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
  setInterval(() => fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {}), 8000);
}
fetch("/api/snapshot").then(r => r.json()).then(applySnapshot).catch(() => {});
startSSE();
