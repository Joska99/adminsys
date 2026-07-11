import { $, esc, UI, agents, badgeForState, isActive, isStale, relTime, sortRows, arrow, errLine, nextCronRel, SESSION_STALE_MS, sessionAge, fmtUsd, SNAP, profSelFor } from "./core.js";
import { ICON, LINK_ICON } from "./icons.js";

// small inline icon for banner / warning lines (inherits the line's color)
const mini = svg => `<span class="mini-ic" aria-hidden="true">${svg}</span>`;

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

  // RED failure line — gateway exit, crashed tasks (same count as the KPI box,
  // scoped to this agent), failed cron jobs; entries carry the KPI icons
  const errs = [];
  if (g.exit_reason) errs.push(esc("gateway: " + g.exit_reason));
  const crashed = (a.kanban && a.kanban.crashed) || 0;
  if (crashed) errs.push(`${mini(ICON.fails)} ${esc(`${crashed.toLocaleString()} crashed task${crashed > 1 ? "s" : ""}`)}`);
  const cronFailed = (a.cron && a.cron.failed) || 0;
  if (cronFailed) errs.push(`${mini(ICON.cron)} ${esc(`${cronFailed} cron job${cronFailed > 1 ? "s" : ""} failed`)}`);
  const banner = errs.length ? `<div class="banner">${errs.join(" · ")}</div>` : "";

  // YELLOW warning line — blocked tasks
  const blocked = (a.kanban && a.kanban.blocked) || 0;
  const warnBanner = blocked
    ? `<div class="banner warn-banner">${mini(ICON.alert)} ${esc(`${blocked.toLocaleString()} blocked task${blocked > 1 ? "s" : ""}`)}</div>` : "";

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
  let runningAll = 0, cronSess = 0, discordSess = 0, tuiSess = 0, c7 = 0, c30 = 0, cTot = 0, t7 = 0, t30 = 0, tTot = 0;
  ((a.kanban && a.kanban.runs) || []).forEach(r => {
    if ((r.status || "").toLowerCase() === "running") runningAll++;
  });
  profs.forEach(p => {
    const s = p.stats || {}, bs = s.by_source || {};
    cronSess += bs.cron || 0; discordSess += bs.discord || 0; tuiSess += bs.tui || 0;
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
      <div><div class="num">${cronAll}</div><div class="lbl">cron jobs</div></div>
      <div><div class="num">${sessAll}</div><div class="lbl">sessions</div></div>
      <div><div class="num">${tasksAll.toLocaleString()}</div><div class="lbl">tasks</div></div>
      <div><div class="num">${runningAll}</div><div class="lbl">running</div></div>
    </div>
    <div>${plats}</div>
    ${spark}
    <div class="card-foot">
      ${lastActive}
      <div class="cardmeta">${tasksAll.toLocaleString()} kanban · ${cronSess} cron · ${discordSess} discord · ${tuiSess} tui sessions</div>
      <div class="costmeta">
        <div class="cardmeta costmeta-lbl">spend &amp; tokens</div>
        <div class="cardmeta">7d · ${esc(fmtUsd(c7))} spend · ${t7.toLocaleString()} tokens</div>
        <div class="cardmeta">30d · ${esc(fmtUsd(c30))} spend · ${t30.toLocaleString()} tokens</div>
        <div class="cardmeta">total · ${esc(fmtUsd(cTot))} spend · ${tTot.toLocaleString()} tokens</div>
      </div>
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
  if (!cards) cards = `<div class="empty">${(UI.fActive || UI.fStopped || UI.fCron)
    ? "No agents match the filters."
    : `No agents discovered under /data. Mount an agent home into the container — <code>-v ~/.hermes:/data/my-agent:ro</code> — then reload.`}</div>`;

  const secHead = (t, b) => `<div class="cards-head"><span class="ch-bar">▌</span><div class="ch-txt"><div class="ch-title">${t}</div><div class="ch-brief">${b}</div></div></div>`;
  // secondary sections collapse by default — Overview leads with health + KPIs + cards
  // data-ov key -> UI.openOv keeps open/closed state across re-renders (profbtn clicks, SSE)
  const collapse = (key, head, body) => `<details class="ovd" data-ov="${key}"${UI.openOv.has(key) ? " open" : ""}><summary>${head}</summary>${body}</details>`;

  // CHANNELS
  const chHtml = cardList.map(a => {
    const cs = (a.channels && a.channels.channels) || [];
    const chips = cs.map(c => `<span class="pill mono">${esc(c.platform)}:${esc(c.name || c.id)}</span>`).join(" ") || `<span class="empty">none</span>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="ts">${cs.length} channels</div><div class="cats">${chips}</div></div>`;
  }).join("");
  const secChannels = collapse("ov-channels", secHead("CHANNELS", "platform bindings"), `<div class="grid">${chHtml}</div>`);

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
        `<div class="tbl-wrap"><table><thead><tr><th scope="col">${itemHdr}</th><th scope="col">${valHdr}</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join("");
    return `<div class="panel" data-card="${esc(key)}"><h3><span class="agentname">${esc(a.name)}</span></h3>
      <div class="profbtns">${btns}</div>${blocks}</div>`;
  }).join("");

  // TOP SKILLS — most-used skills, top 10 per profile (one card per agent); always open
  const secTopSkills = secHead("TOP SKILLS", "top 10 per profile") +
    `<div class="grid">${topPerAgent("ov-skills", "skills_used", "skill", "uses", "no skill usage")}</div>`;

  // TOP TOOLS — most-called runtime tools, top 10 per profile (one card per agent); always open
  const secTopTools = secHead("TOP TOOLS", "top 10 per profile") +
    `<div class="grid">${topPerAgent("ov-tools", "tools_top", "tool", "calls", "no tool calls")}</div>`;

  // SYSTEM HEALTH — aggregate red line (+ yellow blocked line) at the very top
  const downAgents = cardList.filter(a => ["failed", "crashed", "stopped"]
    .includes(((a.gateway || {}).gateway_state || "").toLowerCase())).length;
  const logErrors = cardList.reduce((n, a) => n + (((a.logs || {}).errors) || 0), 0);
  const issues = [];
  if (downAgents) issues.push(esc(`${downAgents} agent${downAgents > 1 ? "s" : ""} down`));
  if (cronFailed) issues.push(`${mini(ICON.cron)} ${esc(`${cronFailed} cron failure${cronFailed > 1 ? "s" : ""}`)}`);
  if (crashedTasks) issues.push(`${mini(ICON.fails)} ${esc(`${crashedTasks.toLocaleString()} crashed task${crashedTasks > 1 ? "s" : ""}`)}`);
  if (logErrors) issues.push(esc(`${logErrors} error${logErrors > 1 ? "s" : ""} in logs`));
  let healthBanner = !issues.length
    ? `<div class="health ok">✓ all systems nominal</div>`
    : `<div class="health bad">⚠ ${issues.join(" · ")}</div>`;
  if (blockedTasks) {
    healthBanner += `<div class="health warn">${mini(ICON.alert)} ${esc(`${blockedTasks.toLocaleString()} blocked task${blockedTasks > 1 ? "s" : ""}`)}</div>`;
  }

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
        <span class="kpi-icon">${ICON.agents}</span>
        <div class="kpi-num">${cardList.length}</div>
        <div class="kpi-title">agents</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="profiles" title="open Profiles">
        ${LINK_ICON}
        <span class="kpi-icon">${ICON.profiles}</span>
        <div class="kpi-num">${profilesTotal}</div>
        <div class="kpi-title">profiles</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="schedule" title="open Cron">
        ${LINK_ICON}
        <span class="kpi-icon">${ICON.cron}</span>
        <div class="kpi-num">${cronTotal}</div>
        <div class="kpi-title">cron jobs</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="tasks" title="open Tasks">
        ${LINK_ICON}
        <span class="kpi-icon">${ICON.kanban}</span>
        <div class="kpi-num">${kanbanTasks.toLocaleString()}</div>
        <div class="kpi-title">kanban tasks</div>
      </div>
      <div class="kpi kpi-ink clickable" data-goto="sessions" title="open Sessions">
        ${LINK_ICON}
        <span class="kpi-icon">${ICON.sessions}</span>
        <div class="kpi-num">${totalSessions}</div>
        <div class="kpi-title">sessions</div>
      </div>
      <div class="kpi kpi-ink">
        <span class="kpi-icon">${ICON.tokens}</span>
        <div class="kpi-num">${(tokens7d || 0).toLocaleString()}</div>
        <div class="kpi-title">tokens 7d</div>
      </div>
      <div class="kpi kpi-ink">
        <span class="kpi-icon">${ICON.spend}</span>
        <div class="kpi-num">${esc(fmtUsd(spend7d))}</div>
        <div class="kpi-title">spend 7d</div>
      </div>
      <div class="kpi-grouplbl">activity &amp; alerts</div>
      <div class="kpi ${activeNames.length > 0 ? "kpi-green" : "kpi-mut"}">
        <span class="kpi-icon">${ICON.active}</span>
        <div class="kpi-num">${activeNames.length}</div>
        <div class="kpi-title">active agents</div>
      </div>
      <div class="kpi ${runningTasks > 0 ? "kpi-green" : "kpi-mut"}">
        <span class="kpi-icon">${ICON.running}</span>
        <div class="kpi-num">${runningTasks}</div>
        <div class="kpi-title">running tasks</div>
      </div>
      <div class="kpi ${blockedTasks > 0 ? "kpi-yel" : "kpi-mut"}">
        <span class="kpi-icon">${ICON.alert}</span>
        <div class="kpi-num">${blockedTasks.toLocaleString()}</div>
        <div class="kpi-title">blocked tasks</div>
      </div>
      <div class="kpi ${crashedTasks > 0 ? "kpi-red" : "kpi-mut"}">
        <span class="kpi-icon">${ICON.fails}</span>
        <div class="kpi-num">${crashedTasks.toLocaleString()}</div>
        <div class="kpi-title">crashed tasks</div>
      </div>
      <div class="kpi ${cronFailed > 0 ? "kpi-red" : "kpi-mut"}">
        <span class="kpi-icon">${ICON.cron}</span>
        <div class="kpi-num">${cronFailed}</div>
        <div class="kpi-title">failed crons</div>
      </div>
    </div>
    <div class="midline"></div>
    <div class="cards-head">
      <span class="ch-bar">▌</span>
      <div class="ch-txt">
        <div class="ch-title">AGENTS</div>
        <div class="ch-brief">${cardList.length} shown${downAgents ? ` · ${downAgents} down` : ""}</div>
      </div>
    </div>
    <div class="grid">${cards}</div>
    <div class="midline"></div>
    ${secTopSkills}
    <div class="midline"></div>
    ${secTopTools}`;
}
