import { $, esc, UI, agents, badgeForState, isActive, isStale, relTime, sortRows, arrow, errLine, nextCronRel, SESSION_STALE_MS, sessionAge, fmtUsd, SNAP, profSelFor } from "./core.js";

// pixel icons for the kanban-tasks, blocked-tasks and tokens KPI boxes
const ICON_KANBAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M27.432 4.575h1.52v25.9h-1.52Z"></path><path d="M25.902 3.045h1.53v1.53h-1.53Z"></path><path d="M24.382 1.525h1.52v1.52h-1.52Z"></path><path d="M25.9 7.615h-1.52V6.1h-1.52V4.575h-1.53v-1.53H3.052V32H25.9Zm-1.52 22.86H4.572v-25.9h13.71v6.09h6.1Z"></path><path d="M4.572 -0.005h19.81v1.53H4.572Z"></path><path d="M7.622 25.905h13.71v1.52H7.622Z"></path><path d="M7.622 19.805h13.71v1.53H7.622Z"></path><path d="M7.622 13.715h13.71v1.52H7.622Z"></path><path d="M7.622 7.615h6.09v1.53h-6.09Z"></path></g></svg>';
const ICON_FAILS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M3.05 32h25.9V7.62h-1.52V6.1h-1.52V4.57h-1.53V3.05h-1.52V1.52h-1.53V0H3.05ZM4.57 1.52h15.24v7.62h7.62v21.34H4.57Z"></path><path d="m7.62 19.81 0 1.52 10.67 0 0 3.05 1.52 0 0 -3.05 3.05 0 0 3.05 1.52 0 0 -4.57 -16.76 0z"></path><path d="m22.86 12.19 -1.53 0 0 1.52 -1.52 0 0 1.53 1.52 0 0 1.52 1.53 0 0 -1.52 1.52 0 0 -1.53 -1.52 0 0 -1.52z"></path><path d="M19.81 24.38h3.05v1.52h-3.05Z"></path><path d="m9.14 16.76 1.53 0 0 -1.52 1.52 0 0 -1.53 -1.52 0 0 -1.52 -1.53 0 0 1.52 -1.52 0 0 1.53 1.52 0 0 1.52z"></path></g></svg>';
const ICON_ALERT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M30.48 27.43H32v3.05h-1.52Z"></path><path d="M28.95 24.38h1.53v3.05h-1.53Z"></path><path d="M1.52 30.48h28.96V32H1.52Z"></path><path d="M27.43 21.33h1.52v3.05h-1.52Z"></path><path d="M25.9 18.29h1.53v3.04H25.9Z"></path><path d="M24.38 15.24h1.52v3.05h-1.52Z"></path><path d="M22.86 12.19h1.52v3.05h-1.52Z"></path><path d="M21.33 9.14h1.53v3.05h-1.53Z"></path><path d="M19.81 6.09h1.52v3.05h-1.52Z"></path><path d="M18.29 3.05h1.52v3.04h-1.52Z"></path><path d="m18.29 21.33 -4.58 0 0 1.53 -1.52 0 0 4.57 1.52 0 0 1.52 4.58 0 0 -1.52 1.52 0 0 -4.57 -1.52 0 0 -1.53z"></path><path d="M18.29 9.14h-4.58v1.53h-1.52v6.09h1.52v3.05h4.58v-3.05h1.52v-6.09h-1.52Zm0 6.1h-1.53v-3.05h-1.52v-1.52h1.52v1.52h1.53Z"></path><path d="M16.76 1.52h1.53v1.53h-1.53Z"></path><path d="M15.24 0h1.52v1.52h-1.52Z"></path><path d="M13.71 1.52h1.53v1.53h-1.53Z"></path><path d="M12.19 3.05h1.52v3.04h-1.52Z"></path><path d="M10.67 6.09h1.52v3.05h-1.52Z"></path><path d="M9.14 9.14h1.53v3.05H9.14Z"></path><path d="M7.62 12.19h1.52v3.05H7.62Z"></path><path d="M6.09 15.24h1.53v3.05H6.09Z"></path><path d="M4.57 18.29h1.52v3.04H4.57Z"></path><path d="M3.05 21.33h1.52v3.05H3.05Z"></path><path d="M1.52 24.38h1.53v3.05H1.52Z"></path><path d="M0 27.43h1.52v3.05H0Z"></path></g></svg>';
const ICON_TOKENS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M30.48 6.1V1.52h-4.57v1.53H6.1V1.52H1.52V6.1h1.53v19.81H1.52v4.57H6.1v-1.53h19.81v1.53h4.57v-4.57h-1.53V6.1Zm-3.05 19.81h-1.52v1.52H6.1v-1.52H4.57V6.1H6.1V4.57h19.81V6.1h1.52Z"></path><path d="M21.33 9.14h1.53v3.05h-1.53Z"></path><path d="m10.67 7.62 0 1.52 4.57 0 0 13.72 -3.05 0 0 1.52 7.62 0 0 -1.52 -3.05 0 0 -13.72 4.57 0 0 -1.52 -10.66 0z"></path><path d="M9.14 9.14h1.53v3.05H9.14Z"></path></g></svg>';

// corner badge marking a KPI box as a clickable jump (inherits the box accent)
const LINK_ICON = '<span class="kpi-link"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M28.195 20.575h1.52v6.09h-1.52Z"></path><path d="M26.665 26.665h1.53v1.53h-1.53Z"></path><path d="M26.665 19.055h1.53v1.52h-1.53Z"></path><path d="M25.145 17.525h1.52v1.53h-1.52Z"></path><path d="M20.575 28.195h6.09v1.52h-6.09Z"></path><path d="M23.615 16.005h1.53v1.52h-1.53Z"></path><path d="M19.045 14.475h4.57v1.53h-4.57Z"></path><path d="M19.045 26.665h1.53v1.53h-1.53Z"></path><path d="M17.525 25.145h1.52v1.52h-1.52Z"></path><path d="m14.475 11.435 -3.05 0 0 3.04 1.53 0 0 1.53 1.52 0 0 1.52 1.53 0 0 1.53 1.52 0 0 1.52 3.05 0 0 -3.05 -1.53 0 0 -1.52 -1.52 0 0 -1.53 -1.52 0 0 -1.52 -1.53 0 0 -1.52z"></path><path d="M16.005 23.625h1.52v1.52h-1.52Z"></path><path d="M16.005 8.385h1.52v4.57h-1.52Z"></path><path d="M14.475 19.055h1.53v4.57h-1.53Z"></path><path d="M14.475 6.865h1.53v1.52h-1.53Z"></path><path d="M12.955 5.335h1.52v1.53h-1.52Z"></path><path d="M11.425 3.815h1.53v1.52h-1.53Z"></path><path d="M8.385 16.005h4.57v1.52h-4.57Z"></path><path d="M6.855 14.475h1.53v1.53h-1.53Z"></path><path d="M5.335 2.285h6.09v1.53h-6.09Z"></path><path d="M5.335 12.955h1.52v1.52h-1.52Z"></path><path d="M3.815 11.435h1.52v1.52h-1.52Z"></path><path d="M3.815 3.815h1.52v1.52h-1.52Z"></path><path d="M2.285 5.335h1.53v6.1h-1.53Z"></path></g></svg></span>';

/* ---------- shared rich agent card (Overview + Agents tab) ---------- */
// `extra` is optional HTML appended inside the card (Agents tab adds its profiles table).
export function agentCard(a, extra = "") {
  const g = a.gateway || {};
  const gs = (g.gateway_state || "").toLowerCase();
  let health;
  if (["running", "connected"].includes(gs)) health = "h-ok";              // running -> green
  else if (["failed", "crashed", "stopped"].includes(gs)) health = "h-bad"; // stopped/failed -> red
  else health = "h-warn";                                                  // other/unknown -> yellow

  // pill order: discord first, api server second, anything else after
  const platRank = k => { k = (k || "").toLowerCase(); return k.includes("discord") ? 0 : k.includes("api") ? 1 : 2; };
  const plats = Object.entries(g.platforms || {})
    .sort((a, b) => platRank(a[0]) - platRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([k, v]) =>
      `<span class="pill ${(v.state || "").toLowerCase() === "connected" ? "b-ok ok" : "b-bad bad"}">${esc(k)}: ${esc(v.state)}</span>`
    ).join(" ") || `<span class="empty">no platforms</span>`;

  // small inline icon for banner / warning lines (inherits the line's color)
  const mini = svg => `<span class="mini-ic" aria-hidden="true">${svg}</span>`;

  // RED failure line — gateway exit, failed task runs, failed cron jobs
  const errs = [];
  if (g.exit_reason) errs.push("gateway: " + g.exit_reason);
  const failed = ((a.kanban && a.kanban.runs) || []).filter(r =>
    r.error || ["failed", "crashed", "timed_out"].includes((r.status || "").toLowerCase()));
  if (failed.length) errs.push(failed.length + " task run(s) crashed");
  const cronFailed = (a.cron && a.cron.failed) || 0;
  if (cronFailed) errs.push(cronFailed + " cron job(s) failed");
  const banner = errs.length ? `<div class="banner">${mini(ICON_FAILS)} ${esc(errs.join(" · "))}</div>` : "";

  // YELLOW warning line — blocked tasks
  const blocked = (a.kanban && a.kanban.blocked) || 0;
  const warnBanner = blocked
    ? `<div class="banner warn-banner">${mini(ICON_ALERT)} ${esc(blocked + " task(s) blocked")}</div>` : "";

  // session freshness — main profile's newest session (would have caught the
  // "sessions frozen" bug at a glance)
  const la = a.sessions && a.sessions.last_active;
  const laSrc = (((a.sessions || {}).recent || [])[0] || {}).source || "";
  const lastActive = la
    ? `<div class="lastact">last main profile session ${esc(relTime(la))}${laSrc ? ` · ${esc(laSrc)}` : ""}</div>`
    : `<div class="lastact">no main profile sessions</div>`;

  // all-profile rollups for the stat row + footer (every profile, incl. main)
  const profs = (a.profiles && a.profiles.profiles) || [];
  const sessAll = profs.reduce((n, p) => n + (p.sessions || 0), 0);
  const cronAll = (a.cron && a.cron.jobs) ? a.cron.jobs.length : 0;
  const tasksAll = ((a.kanban || {}).tasks_total) || 0;
  let runningAll = 0, cronSess = 0, discordSess = 0, c7 = 0, c30 = 0, cTot = 0, t7 = 0, t30 = 0, tTot = 0;
  ((a.kanban && a.kanban.runs) || []).forEach(r => {
    if ((r.status || "").toLowerCase() === "running") runningAll++;
  });
  profs.forEach(p => {
    const s = p.stats || {}, bs = s.by_source || {};
    cronSess += bs.cron || 0; discordSess += bs.discord || 0;
    c7 += s.cost_7d || 0; c30 += s.cost_30d || 0; cTot += s.cost_total || 0;
    t7 += s.tokens_7d || 0; t30 += s.tokens_30d || 0; tTot += s.tokens_total || 0;
  });

  // 7-day session sparkline, summed across all profiles (falls back to main)
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = d => { const t = Date.parse(d); return isNaN(t) ? "" : DOW[new Date(t).getUTCDay()]; };
  const dmap = new Map();
  profs.forEach(p => ((p.stats || {}).daily7 || []).forEach(x =>
    dmap.set(x.date, (dmap.get(x.date) || 0) + (x.count || 0))));
  const d7 = dmap.size
    ? [...dmap.entries()].sort((x, y) => x[0] < y[0] ? -1 : 1).map(([date, count]) => ({ date, count }))
    : ((a.sessions && a.sessions.daily7) || []);
  const sparkMax = Math.max(1, ...d7.map(x => x.count || 0));
  const spark7Total = d7.reduce((n, x) => n + (x.count || 0), 0);
  const spark = d7.length
    ? `<div class="spark-wrap" tabindex="0" role="img" aria-label="7-day sessions: ${spark7Total} total" title="7-day sessions: ${spark7Total} total"><div class="spark-col"><div class="spark">${d7.map(x =>
        `<i style="height:${Math.round((x.count || 0) / sparkMax * 100)}%" data-tip="${esc(String(x.date).slice(5))}: ${x.count || 0} sessions"></i>`).join("")}</div>` +
        `<div class="spark-days">${d7.map(x => `<span>${esc(dayName(x.date))}</span>`).join("")}</div></div>` +
        `<span class="spark-lbl">7d&nbsp;sessions</span></div>`
    : "";

  return `<div class="panel agent-card ${health}">
    <h3><span class="agentname">${esc(a.name)}</span>${a.dashboard_url
      ? `<a class="dash-link${health === "h-bad" ? " down" : ""}" href="${esc(a.dashboard_url)}" target="_blank" rel="noopener" title="${health === "h-bad" ? "Hermes dashboard (agent down — may be unreachable)" : "open Hermes dashboard"}">↗</a>`
      : ""}
      <span class="pill ${badgeForState(g.gateway_state)}">${esc(g.gateway_state || "unknown")}</span>
      <span class="pill modelpill mono">${esc(a.model || "no model")}</span></h3>
    ${errLine(g)}
    ${banner}
    ${warnBanner}
    <div class="stat">
      <div><div class="num">${profs.length}</div><div class="lbl">profiles</div></div>
      <div class="stat-go clickable" data-goto="schedule" title="open Cron"><div class="num">${cronAll}</div><div class="lbl">cron jobs <span class="stat-ic">↗</span></div></div>
      <div><div class="num">${sessAll}</div><div class="lbl">sessions</div></div>
      <div><div class="num">${tasksAll.toLocaleString()}</div><div class="lbl">tasks</div></div>
      <div><div class="num">${runningAll}</div><div class="lbl">running</div></div>
    </div>
    <div>${plats}</div>
    ${spark}
    <div class="card-foot">
      ${lastActive}
      <div class="cardmeta">${tasksAll.toLocaleString()} kanban · ${cronSess} cron · ${discordSess} discord sessions</div>
      <details class="costmeta">
        <summary>spend &amp; tokens</summary>
        <div class="cardmeta">7d · ${esc(fmtUsd(c7))} spend · ${t7.toLocaleString()} tokens</div>
        <div class="cardmeta">30d · ${esc(fmtUsd(c30))} spend · ${t30.toLocaleString()} tokens</div>
        <div class="cardmeta">total · ${esc(fmtUsd(cTot))} spend · ${tTot.toLocaleString()} tokens</div>
      </details>
    </div>
    ${extra}
  </div>`;
}

/* ---------- Overview ---------- */
export function renderOverview() {
  const list = agents();

  // agents() already applies the agent + running/stopped filters
  const cardList = list;

  // box stats reflect only the currently shown cards. sessions / spend / tokens
  // sum every profile (incl. main); cron + kanban tasks already aggregate profiles.
  let activeAgents = 0, totalSessions = 0, runningTasks = 0, cronTotal = 0, cronFailed = 0;
  let spend7d = 0, tokens7d = 0, kanbanTasks = 0, blockedTasks = 0, crashedTasks = 0;
  cardList.forEach(a => {
    activeAgents += (a.gateway && a.gateway.active_agents) || 0;
    cronTotal += (a.cron && a.cron.jobs ? a.cron.jobs.length : 0);
    cronFailed += (a.cron && a.cron.failed) || 0;
    kanbanTasks += ((a.kanban || {}).tasks_total) || 0;
    blockedTasks += ((a.kanban || {}).blocked) || 0;
    crashedTasks += ((a.kanban || {}).crashed) || 0;
    ((a.kanban && a.kanban.runs) || []).forEach(r => {
      if ((r.status || "").toLowerCase() === "running") runningTasks++;
    });
    const profs = (a.profiles && a.profiles.profiles) || [];
    if (profs.length) {
      totalSessions += profs.reduce((n, p) => n + (p.sessions || 0), 0);
      profs.forEach(p => {
        const s = p.stats || {};
        spend7d += s.cost_7d || 0; tokens7d += s.tokens_7d || 0;
      });
    } else {                       // profiles reader unavailable — fall back to main
      const s = a.sessions || {};
      totalSessions += s.total || 0;
      spend7d += s.cost_7d || 0; tokens7d += s.tokens_7d || 0;
    }
  });

  const profilesTotal = cardList.reduce((n, a) => n + (((a.profiles || {}).profiles || []).length), 0);

  const activeNames = cardList.filter(isActive).map(a => a.name).sort();

  let cards = cardList.map(a => agentCard(a)).join("");
  if (!cards) cards = `<div class="empty">No agents ${(UI.fActive || UI.fStopped || UI.fCron) ? "match the filters" : "discovered under /data"}.</div>`;

  const secHead = (t, b) => `<div class="cards-head"><span class="ch-bar">▌</span><div class="ch-txt"><div class="ch-title">${t}</div><div class="ch-brief">${b}</div></div></div>`;

  // CHANNELS
  const chHtml = cardList.map(a => {
    const cs = (a.channels && a.channels.channels) || [];
    const chips = cs.map(c => `<span class="pill mono">${esc(c.platform)}:${esc(c.name || c.id)}</span>`).join(" ") || `<span class="empty">none</span>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="ts">${cs.length} channels</div><div class="cats">${chips}</div></div>`;
  }).join("");
  const secChannels = secHead("CHANNELS", "platform bindings") + `<div class="grid">${chHtml}</div>`;

  // one card per agent; per-profile blocks toggled by a button row (same pattern
  // as the Agents tab). section is a stable key -> UI.profSel["<section>:<agent>"];
  // default shows the first profile (main), "__all" reveals every block.
  const topPerAgent = (section, field, itemHdr, valHdr, empty) => cardList.map(a => {
    const profs = ((a.profiles && a.profiles.profiles) || []).slice()
      .sort((x, y) => (x.name === "main" ? -1 : y.name === "main" ? 1 : 0));   // main always first
    if (!profs.length) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no profiles</div></div>`;
    const key = section + ":" + a.name;
    const sel = profSelFor(key, profs);
    const btn = (val, label, on) => `<button class="profbtn${on ? " active" : ""}" data-prof="${esc(val)}">${esc(label)}</button>`;
    const btns = profs.map(pr => btn(pr.name, pr.name + " · " + (pr[field] || []).length, sel === pr.name)).join("")
      + btn("__all", "all", sel === "__all");
    const blocks = profs.map(pr => {
      const show = sel === "__all" || sel === pr.name;
      const rows = (pr[field] || []).slice().sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 10)
        .map(s => `<tr><td>${esc(s.name)}</td><td class="mono">${s.count}</td></tr>`).join("")
        || `<tr><td colspan="2" class="empty">${empty}</td></tr>`;
      return `<div class="profblock" data-prof="${esc(pr.name)}"${show ? "" : " hidden"}>` +
        `<div class="proflabel"><span class="pill mono profile-tag">${esc(pr.name)}</span></div>` +
        `<table><thead><tr><th>${itemHdr}</th><th>${valHdr}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join("");
    return `<div class="panel" data-card="${esc(key)}"><h3><span class="agentname">${esc(a.name)}</span></h3>
      <div class="profbtns">${btns}</div>${blocks}</div>`;
  }).join("");

  // TOP SKILLS — most-used skills, top 10 per profile (one card per agent)
  const secTopSkills = secHead("TOP SKILLS", "top 10 per profile") +
    `<div class="grid">${topPerAgent("ov-skills", "skills_used", "skill", "uses", "no skill usage")}</div>`;

  // TOP TOOLS — most-called runtime tools, top 10 per profile (one card per agent)
  const secTopTools = secHead("TOP TOOLS", "top 10 per profile") +
    `<div class="grid">${topPerAgent("ov-tools", "tools_top", "tool", "calls", "no tool calls")}</div>`;

  // SYSTEM HEALTH — single aggregate status line at the very top
  const downAgents = cardList.filter(a => ["failed", "crashed", "stopped"]
    .includes(((a.gateway || {}).gateway_state || "").toLowerCase())).length;
  const logErrors = cardList.reduce((n, a) => n + (((a.logs || {}).errors) || 0), 0);
  const issues = [];
  if (downAgents) issues.push(`${downAgents} agent${downAgents > 1 ? "s" : ""} down`);
  if (cronFailed) issues.push(`${cronFailed} cron failure${cronFailed > 1 ? "s" : ""}`);
  if (logErrors) issues.push(`${logErrors} error${logErrors > 1 ? "s" : ""} in logs`);
  const healthBanner = !issues.length
    ? `<div class="health ok">✓ all systems nominal</div>`
    : `<div class="health bad clickable" data-goto="logs">⚠ ${esc(issues.join(" · "))}</div>`;

  $("tab-overview").innerHTML = `
    ${healthBanner}
    <div class="ov-head">
      <div class="ov-title">▌ SYSTEM OVERVIEW</div>
      <div class="ov-brief">showing ${cardList.length}/${(SNAP.agents || []).length} agents</div>
    </div>
    <div class="topgrid">
      <div class="kpi-grouplbl first">fleet</div>
      <div class="kpi kpi-ink clickable" data-goto="agents" title="open Agents">
        ${LINK_ICON}
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M28.95 15.24h1.53v7.62h-1.53Z"></path><path d="m27.43 24.39 1.52 0 0 -1.53 -1.52 0 0 -7.62 1.52 0 0 -1.52 -1.52 0 0 -3.05 -1.53 0 0 3.05 -19.8 0 0 -3.05 -1.53 0 0 3.05 -1.52 0 0 1.52 1.52 0 0 7.62 -1.52 0 0 1.53 1.52 0 0 1.52 1.53 0 0 -10.67 19.8 0 0 10.67 1.53 0 0 -1.52z"></path><path d="M25.9 0h1.53v1.53H25.9Z"></path><path d="M24.38 25.91h1.52v1.52h-1.52Z"></path><path d="M24.38 7.62h1.52v3.05h-1.52Z"></path><path d="M24.38 1.53h1.52v1.52h-1.52Z"></path><path d="M22.86 6.1h1.52v1.52h-1.52Z"></path><path d="M22.86 3.05h1.52v1.53h-1.52Z"></path><path d="m21.33 30.48 1.53 0 0 -1.52 1.52 0 0 -1.53 -3.05 0 0 3.05z"></path><path d="M19.81 4.58h3.05V6.1h-3.05Z"></path><path d="M18.29 30.48h3.04V32h-3.04Z"></path><path d="m13.71 27.43 0 3.05 1.53 0 0 -1.52 1.52 0 0 1.52 1.53 0 0 -3.05 -4.58 0z"></path><path d="M12.19 3.05h7.62v1.53h-7.62Z"></path><path d="M10.67 30.48h3.04V32h-3.04Z"></path><path d="M22.86 12.19V9.15h-1.53V7.62H10.67v1.53H9.14v3.04Zm-4.57 -3.04h1.52v1.52h-1.52Zm-6.1 0h1.52v1.52h-1.52Z"></path><path d="M9.14 4.58h3.05V6.1H9.14Z"></path><path d="m7.62 27.43 0 1.53 1.52 0 0 1.52 1.53 0 0 -3.05 -3.05 0z"></path><path d="M7.62 6.1h1.52v1.52H7.62Z"></path><path d="M7.62 3.05h1.52v1.53H7.62Z"></path><path d="M6.1 25.91h1.52v1.52H6.1Z"></path><path d="M6.1 7.62h1.52v3.05H6.1Z"></path><path d="M6.1 1.53h1.52v1.52H6.1Z"></path><path d="M4.57 0H6.1v1.53H4.57Z"></path><path d="M1.52 15.24h1.53v7.62H1.52Z"></path></g></svg></span>
        <div class="kpi-num">${cardList.length}</div>
        <div class="kpi-title">agents</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="profiles" title="open Profiles">
        ${LINK_ICON}
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M30.48 18.285H32v1.53h-1.52Z"></path><path d="M27.43 16.765h3.05v1.52h-3.05Z"></path><path d="M27.43 13.715h1.52v1.53h-1.52Z"></path><path d="m22.86 15.245 0 -3.05 -1.52 0 0 -1.53 -1.53 0 0 -3.04 1.53 0 0 -1.53 6.09 0 0 1.53 1.52 0 0 6.09 1.53 0 0 -9.14 -1.53 0 0 -1.53 -1.52 0 0 -1.52 -6.09 0 0 1.52 -1.53 0 0 1.53 -1.52 0 0 4.57 -4.57 0 0 -4.57 -1.53 0 0 -1.53 -1.52 0 0 -1.52 -6.1 0 0 1.52 -1.52 0 0 1.53 -1.52 0 0 9.14 1.52 0 0 -6.09 1.52 0 0 -1.53 6.1 0 0 1.53 1.52 0 0 3.04 -1.52 0 0 1.53 -1.52 0 0 3.05 -4.58 0 0 1.52 4.58 0 0 6.09 1.52 0 0 -7.61 1.52 0 0 -1.53 7.62 0 0 1.53 1.53 0 0 7.61 1.52 0 0 -6.09 4.57 0 0 -1.52 -4.57 0z"></path><path d="M24.38 28.955h1.53v1.52h-1.53Z"></path><path d="M22.86 27.435h1.52v1.52h-1.52Z"></path><path d="M19.81 25.905h3.05v1.53h-3.05Z"></path><path d="M19.81 22.855h1.53v1.53h-1.53Z"></path><path d="M18.29 16.765h1.52v3.05h-1.52Z"></path><path d="M12.19 24.385h7.62v1.52h-7.62Z"></path><path d="M13.72 21.335h4.57v1.52h-4.57Z"></path><path d="M12.19 16.765h1.53v3.05h-1.53Z"></path><path d="M10.67 22.855h1.52v1.53h-1.52Z"></path><path d="M9.15 25.905h3.04v1.53H9.15Z"></path><path d="M7.62 27.435h1.53v1.52H7.62Z"></path><path d="M6.1 28.955h1.52v1.52H6.1Z"></path><path d="M3.05 13.715h1.52v1.53H3.05Z"></path><path d="M1.53 16.765h3.04v1.52H1.53Z"></path><path d="M0 18.285h1.53v1.53H0Z"></path></g></svg></span>
        <div class="kpi-num">${profilesTotal}</div>
        <div class="kpi-title">profiles</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="schedule" title="open Cron">
        ${LINK_ICON}
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m19.81 26.67 0 1.52 3.04 0 0 1.53 -13.71 0 0 -1.53 3.05 0 0 -1.52 -3.05 0 0 -3.05 -1.52 0 0 6.1 -3.05 0 0 1.52 22.86 0 0 -1.52 -3.05 0 0 -6.1 -1.53 0 0 3.05 -3.04 0z"></path><path d="M21.33 20.57h1.52v3.05h-1.52Z"></path><path d="M21.33 8.38h1.52v3.05h-1.52Z"></path><path d="M19.81 19.05h1.52v1.52h-1.52Z"></path><path d="M18.28 17.53h1.53v1.52h-1.53Z"></path><path d="M16.76 25.14h3.05v1.53h-3.05Z"></path><path d="m19.81 14.48 0 -1.53 1.52 0 0 -1.52 -10.67 0 0 1.52 1.53 0 0 1.53 1.52 0 0 3.05 1.53 0 0 7.61 1.52 0 0 -7.61 1.52 0 0 -3.05 1.53 0z"></path><path d="M12.19 25.14h3.05v1.53h-3.05Z"></path><path d="M12.19 17.53h1.52v1.52h-1.52Z"></path><path d="M10.66 19.05h1.53v1.52h-1.53Z"></path><path d="M9.14 20.57h1.52v3.05H9.14Z"></path><path d="M9.14 8.38h1.52v3.05H9.14Z"></path><path d="m9.14 2.29 13.71 0 0 6.09 1.53 0 0 -6.09 3.05 0 0 -1.53 -22.86 0 0 1.53 3.05 0 0 6.09 1.52 0 0 -6.09z"></path></g></svg></span>
        <div class="kpi-num">${cronTotal}</div>
        <div class="kpi-title">cron jobs</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="tasks" title="open Tasks">
        ${LINK_ICON}
        <span class="kpi-icon">${ICON_KANBAN}</span>
        <div class="kpi-num">${kanbanTasks.toLocaleString()}</div>
        <div class="kpi-title">kanban tasks</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="sessions" title="open Sessions">
        ${LINK_ICON}
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m3.81 1.52 24.38 0 0 1.53 -1.52 0 0 1.52 1.52 0 0 3.05 1.53 0 0 22.86 1.52 0 0 -24.38 -1.52 0 0 -4.58 1.52 0 0 -1.52L3.81 0l0 1.52z"></path><path d="m6.86 30.48 0 -22.86 9.14 0 0 -1.52 -12.19 0 0 1.52 1.53 0 0 22.86 -1.53 0 0 1.52 25.91 0 0 -1.52 -22.86 0z"></path><path d="m25.15 10.67 -1.53 0 0 -4.57 -1.52 0 0 -1.53 1.52 0 0 -1.52 -7.62 0 0 1.52 1.53 0 0 1.53 1.52 0 0 15.23 1.52 0 0 -1.52 1.53 0 0 -1.52 1.52 0 0 1.52 1.53 0 0 1.52 1.52 0 0 -15.23 -1.52 0 0 4.57z"></path><path d="M23.62 4.57h1.53V6.1h-1.53Z"></path><path d="M5.34 3.05h9.14v1.52H5.34Z"></path><path d="M2.29 28.95h1.52v1.53H2.29Z"></path><path d="M2.29 1.52h1.52v1.53H2.29Z"></path><path d="m2.29 6.1 1.52 0 0 -1.53 -1.52 0 0 -1.52 -1.53 0 0 25.9 1.53 0 0 -22.85z"></path></g></svg></span>
        <div class="kpi-num">${totalSessions}</div>
        <div class="kpi-title">sessions</div>
      </div>
      <div class="kpi kpi-ink">
        <span class="kpi-icon">${ICON_TOKENS}</span>
        <div class="kpi-num">${(tokens7d || 0).toLocaleString()}</div>
        <div class="kpi-title">tokens 7d</div>
      </div>
      <div class="kpi kpi-ink">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m18.285 6.095 3.05 0 0 1.52 1.52 0 0 1.53 1.53 0 0 3.05 1.52 0 0 7.61 -1.52 0 0 3.05 -1.53 0 0 1.53 -1.52 0 0 1.52 -3.05 0 0 1.52 -7.62 0 0 1.53 10.67 0 0 -1.53 3.05 0 0 -1.52 1.52 0 0 -1.52 1.53 0 0 -1.53 1.52 0 0 -3.05 1.52 0 0 -7.61 -1.52 0 0 -3.05 -1.52 0 0 -1.53 -1.53 0 0 -1.52 -1.52 0 0 -1.52 -3.05 0 0 -1.53 -10.67 0 0 1.53 7.62 0 0 1.52z"></path><path d="M22.855 12.195h1.53v7.61h-1.53Z"></path><path d="M21.335 19.805h1.52v1.53h-1.52Z"></path><path d="M21.335 10.665h1.52v1.53h-1.52Z"></path><path d="M19.815 21.335h1.52v1.52h-1.52Z"></path><path d="M19.815 9.145h1.52v1.52h-1.52Z"></path><path d="M18.285 22.855h1.53v1.53h-1.53Z"></path><path d="M18.285 7.615h1.53v1.53h-1.53Z"></path><path d="M10.665 24.385h7.62v1.52h-7.62Z"></path><path d="M16.765 16.765h1.52v3.04h-1.52Z"></path><path d="M16.765 12.195h1.52v1.52h-1.52Z"></path><path d="M10.665 6.095h7.62v1.52h-7.62Z"></path><path d="m13.715 21.335 0 1.52 1.52 0 0 -1.52 1.53 0 0 -1.53 -1.53 0 0 -3.04 1.53 0 0 -1.53 -1.53 0 0 -3.04 1.53 0 0 -1.53 -1.53 0 0 -1.52 -1.52 0 0 1.52 -1.52 0 0 1.53 1.52 0 0 3.04 -1.52 0 0 1.53 1.52 0 0 3.04 -1.52 0 0 1.53 1.52 0z"></path><path d="M10.665 18.285h1.53v1.52h-1.53Z"></path><path d="M10.665 12.195h1.53v3.04h-1.53Z"></path><path d="M7.625 25.905h3.04v1.52h-3.04Z"></path><path d="M9.145 22.855h1.52v1.53h-1.52Z"></path><path d="M9.145 7.615h1.52v1.53h-1.52Z"></path><path d="M7.625 4.575h3.04v1.52h-3.04Z"></path><path d="M7.625 21.335h1.52v1.52h-1.52Z"></path><path d="M7.625 9.145h1.52v1.52h-1.52Z"></path><path d="M6.095 24.385h1.53v1.52h-1.53Z"></path><path d="M6.095 19.805h1.53v1.53h-1.53Z"></path><path d="M6.095 10.665h1.53v1.53h-1.53Z"></path><path d="M6.095 6.095h1.53v1.52h-1.53Z"></path><path d="M4.575 22.855h1.52v1.53h-1.52Z"></path><path d="M4.575 12.195h1.52v7.61h-1.52Z"></path><path d="M4.575 7.615h1.52v1.53h-1.52Z"></path><path d="M3.045 19.805h1.53v3.05h-1.53Z"></path><path d="M3.045 9.145h1.53v3.05h-1.53Z"></path><path d="M1.525 12.195h1.52v7.61h-1.52Z"></path></g></svg></span>
        <div class="kpi-num">${esc(fmtUsd(spend7d))}</div>
        <div class="kpi-title">spend 7d</div>
      </div>
      <div class="kpi-grouplbl">activity &amp; alerts</div>
      <div class="kpi ${activeNames.length > 0 ? "kpi-green" : "kpi-mut"}">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M1.52 30.475h28.96v-1.52H32v-10.67h-1.52v-1.52H1.52v1.52H0v10.67h1.52Zm24.38 -10.66h3.05v3.05H25.9Zm-7.61 0h4.57v1.52h-3.05v1.53h3.05v1.52h-3.05v1.52h3.05v1.53h-4.57Zm-6.1 0h1.52v6.09h1.53v-6.09h1.52v6.09h-1.52v1.53h-1.53v-1.53h-1.52Zm-3.05 0h1.53v7.62H9.14Zm-6.09 0h1.52v6.09h3.05v1.53H3.05Z"></path><path d="M25.9 7.625h1.53v1.52H25.9Z"></path><path d="M24.38 6.095h1.52v1.53h-1.52Z"></path><path d="M22.86 10.665h1.52v1.53h-1.52Z"></path><path d="M21.33 9.145h1.53v1.52h-1.53Z"></path><path d="M21.33 4.575h3.05v1.52h-3.05Z"></path><path d="M18.29 7.625h3.04v1.52h-3.04Z"></path><path d="M18.29 12.195h1.52v1.52h-1.52Z"></path><path d="M18.29 3.055h3.04v1.52h-3.04Z"></path><path d="M13.71 10.665h4.58v1.53h-4.58Z"></path><path d="M13.71 6.095h4.58v1.53h-4.58Z"></path><path d="M13.71 1.525h4.58v1.53h-4.58Z"></path><path d="M12.19 12.195h1.52v1.52h-1.52Z"></path><path d="M10.67 3.055h3.04v1.52h-3.04Z"></path><path d="M10.67 7.625h3.04v1.52h-3.04Z"></path><path d="M9.14 9.145h1.53v1.52H9.14Z"></path><path d="M7.62 4.575h3.05v1.52H7.62Z"></path><path d="M7.62 10.665h1.52v1.53H7.62Z"></path><path d="M6.1 6.095h1.52v1.53H6.1Z"></path><path d="M4.57 7.625H6.1v1.52H4.57Z"></path></g></svg></span>
        <div class="kpi-num">${activeNames.length}</div>
        <div class="kpi-title">active agents</div>
      </div>
      <div class="kpi ${runningTasks > 0 ? "kpi-green" : "kpi-mut"}">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="M30.47 6.1H32v4.57h-1.53Z"></path><path d="M28.95 10.67h1.52v1.52h-1.52Z"></path><path d="M28.95 4.57h1.52V6.1h-1.52Z"></path><path d="M27.43 12.19h1.52v1.52h-1.52Z"></path><path d="M27.43 3.05h1.52v1.52h-1.52Z"></path><path d="M25.9 13.71h1.53v1.53H25.9Z"></path><path d="M25.9 10.67h1.53v1.52H25.9Z"></path><path d="M25.9 1.52h1.53v1.53H25.9Z"></path><path d="M24.38 15.24h1.52v1.52h-1.52Z"></path><path d="M24.38 9.14h1.52v1.53h-1.52Z"></path><path d="M22.85 16.76h1.53v1.53h-1.53Z"></path><path d="M22.85 10.67h1.53v1.52h-1.53Z"></path><path d="M22.85 7.62h1.53v1.52h-1.53Z"></path><path d="M21.33 0h4.57v1.52h-4.57Z"></path><path d="M21.33 18.29h1.52v1.52h-1.52Z"></path><path d="M21.33 12.19h1.52v1.52h-1.52Z"></path><path d="M21.33 6.1h1.52v1.52h-1.52Z"></path><path d="M19.81 19.81h1.52v1.52h-1.52Z"></path><path d="M19.81 13.71h1.52v1.53h-1.52Z"></path><path d="M19.81 7.62h1.52v1.52h-1.52Z"></path><path d="M19.81 4.57h1.52V6.1h-1.52Z"></path><path d="M19.81 1.52h1.52v1.53h-1.52Z"></path><path d="M18.28 21.33h1.53v1.53h-1.53Z"></path><path d="M18.28 15.24h1.53v1.52h-1.53Z"></path><path d="M18.28 9.14h1.53v1.53h-1.53Z"></path><path d="M18.28 3.05h1.53v1.52h-1.53Z"></path><path d="M16.76 22.86h1.52v1.52h-1.52Z"></path><path d="M16.76 16.76h1.52v1.53h-1.52Z"></path><path d="M16.76 10.67h1.52v1.52h-1.52Z"></path><path d="M16.76 4.57h1.52V6.1h-1.52Z"></path><path d="M15.24 24.38h1.52v1.52h-1.52Z"></path><path d="M15.24 18.29h1.52v1.52h-1.52Z"></path><path d="M15.24 12.19h1.52v1.52h-1.52Z"></path><path d="M15.24 6.1h1.52v1.52h-1.52Z"></path><path d="M13.71 25.9h1.53v1.53h-1.53Z"></path><path d="M13.71 19.81h1.53v1.52h-1.53Z"></path><path d="M13.71 13.71h1.53v1.53h-1.53Z"></path><path d="M13.71 7.62h1.53v1.52h-1.53Z"></path><path d="M12.19 27.43h1.52v1.52h-1.52Z"></path><path d="M12.19 21.33h1.52v1.53h-1.52Z"></path><path d="M12.19 15.24h1.52v1.52h-1.52Z"></path><path d="M12.19 9.14h1.52v1.53h-1.52Z"></path><path d="M10.66 22.86h1.53v1.52h-1.53Z"></path><path d="M10.66 16.76h1.53v1.53h-1.53Z"></path><path d="M10.66 10.67h1.53v1.52h-1.53Z"></path><path d="M10.66 30.48h1.53v-1.53h-1.53v-4.57H7.62v-3.05H3.05v-1.52H1.52v1.52H0V32h10.66Zm-1.52 0H4.57v-1.53H3.05v-1.52H1.52v-4.57h4.57v3.04h3.05Z"></path><path d="M9.14 18.29h1.52v1.52H9.14Z"></path><path d="M9.14 12.19h1.52v1.52H9.14Z"></path><path d="M7.62 19.81h1.52v1.52H7.62Z"></path><path d="M7.62 13.71h1.52v1.53H7.62Z"></path><path d="M6.09 15.24h1.53v1.52H6.09Z"></path><path d="M4.57 16.76h1.52v1.53H4.57Z"></path><path d="M3.05 18.29h1.52v1.52H3.05Z"></path></g></svg></span>
        <div class="kpi-num">${runningTasks}</div>
        <div class="kpi-title">running tasks</div>
      </div>
      <div class="kpi ${blockedTasks > 0 ? "kpi-yel" : "kpi-mut"}">
        <span class="kpi-icon">${ICON_ALERT}</span>
        <div class="kpi-num">${blockedTasks.toLocaleString()}</div>
        <div class="kpi-title">blocked tasks</div>
      </div>
      <div class="kpi ${crashedTasks > 0 ? "kpi-red" : "kpi-mut"}">
        <span class="kpi-icon">${ICON_FAILS}</span>
        <div class="kpi-num">${crashedTasks.toLocaleString()}</div>
        <div class="kpi-title">crashed tasks</div>
      </div>
      <div class="kpi ${cronFailed > 0 ? "kpi-red" : "kpi-mut"}">
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
        <div class="ch-brief">${cronTotal} cron jobs</div>
      </div>
    </div>
    <div class="grid">${cards}</div>
    <div class="midline"></div>
    ${secTopSkills}
    <div class="midline"></div>
    ${secTopTools}`;
}
