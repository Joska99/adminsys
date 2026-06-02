import { $, esc, UI, agents, badgeForState, isActive, isStale, relTime, tsShort, sortRows, arrow, errLine, nextCronRel } from "./core.js";

/* ---------- Overview ---------- */
export function renderOverview() {
  const list = agents();

  // agents() already applies the agent + running/stopped filters
  const cardList = list;

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


    return `<div class="panel clickable ${health}" data-goto="agents" title="open Agents tab">
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
    `<div class="panel ovsec clickable" data-goto="logs" title="open Logs"><table><thead><tr><th>agent</th><th>errors</th><th>warnings</th><th>cron fail</th><th>exit reason</th></tr></thead><tbody>${incRows || `<tr><td colspan="5" class="empty">no incidents</td></tr>`}</tbody></table></div>`;

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
    `<div class="panel ovsec clickable" data-goto="schedule" title="open Cron"><table><thead><tr><th>agent</th><th>profile</th><th>name</th><th>schedule</th><th>skill</th><th>model</th><th>in</th></tr></thead><tbody>${schRows}</tbody></table></div>`;

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
      <div class="kpi kpi-grn clickable" data-goto="agents" title="open Agents">
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
      <div class="kpi kpi-org clickable" data-goto="schedule" title="open Cron">
        <span class="kpi-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g><path d="m19.81 26.67 0 1.52 3.04 0 0 1.53 -13.71 0 0 -1.53 3.05 0 0 -1.52 -3.05 0 0 -3.05 -1.52 0 0 6.1 -3.05 0 0 1.52 22.86 0 0 -1.52 -3.05 0 0 -6.1 -1.53 0 0 3.05 -3.04 0z"></path><path d="M21.33 20.57h1.52v3.05h-1.52Z"></path><path d="M21.33 8.38h1.52v3.05h-1.52Z"></path><path d="M19.81 19.05h1.52v1.52h-1.52Z"></path><path d="M18.28 17.53h1.53v1.52h-1.53Z"></path><path d="M16.76 25.14h3.05v1.53h-3.05Z"></path><path d="m19.81 14.48 0 -1.53 1.52 0 0 -1.52 -10.67 0 0 1.52 1.53 0 0 1.53 1.52 0 0 3.05 1.53 0 0 7.61 1.52 0 0 -7.61 1.52 0 0 -3.05 1.53 0z"></path><path d="M12.19 25.14h3.05v1.53h-3.05Z"></path><path d="M12.19 17.53h1.52v1.52h-1.52Z"></path><path d="M10.66 19.05h1.53v1.52h-1.53Z"></path><path d="M9.14 20.57h1.52v3.05H9.14Z"></path><path d="M9.14 8.38h1.52v3.05H9.14Z"></path><path d="m9.14 2.29 13.71 0 0 6.09 1.53 0 0 -6.09 3.05 0 0 -1.53 -22.86 0 0 1.53 3.05 0 0 6.09 1.52 0 0 -6.09z"></path></g></svg></span>
        <div class="kpi-num">${cronTotal}</div>
        <div class="kpi-title">total crons</div>
      </div>
      <div class="kpi kpi-red clickable" data-goto="schedule" title="open Cron">
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
