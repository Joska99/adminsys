import { $, esc, UI, agents, badgeForState, isActive, relTime, tsShort, sortRows, arrow, errLine, fmtUsd, fmtBytes, profSelFor } from "./core.js";
import { agentCard } from "./render-overview.js";

/* ---------- Agents (profiles) ---------- */
export function renderAgents() {
  const list = agents();
  const head = (t, b) => `<div class="cards-head"><span class="ch-bar">▌</span><div class="ch-txt"><div class="ch-title">${t}</div><div class="ch-brief">${b}</div></div></div>`;

  // top cards = full overview agent card + this tab's profiles table appended inside
  const profHtml = list.map(a => {
    const p = a.profiles || {};
    const rows = (p.profiles || []).map(pr =>
      `<tr><td class="mono">${esc(pr.name)}</td><td>${esc(pr.model || "—")}</td></tr>`
    ).join("");
    const profTable = `<div class="proflabel">profiles</div>${errLine(p)}
      <div class="tbl-wrap"><table><thead><tr><th scope="col">profile</th><th scope="col">model</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="2" class="empty">no profiles</td></tr>`}</tbody></table></div>`;
    return agentCard(a, profTable);
  }).join("") || `<div class="empty">No agents.</div>`;

  // one panel per agent; one block per personality (profile) inside it. The
  // profiles reader exposes per-profile soul/memory/tools/vault/kanban/logs/
  // sessions, so every section below breaks down by profile (main first).
  const plabel = pr => `<div class="proflabel"><span class="pill mono profile-tag">${esc(pr.name)}</span></div>`;
  // section is a stable key (e.g. "soul"); per card we remember which profile is
  // shown in UI.profSel["<section>:<agent>"] — default is the first profile, and
  // "__all" reveals every block (the old stacked layout).
  const perProfile = (section, a, block, countFn) => {
    const profs = ((a.profiles && a.profiles.profiles) || []).slice()
      .sort((x, y) => (x.name === "main" ? -1 : y.name === "main" ? 1 : 0));   // main always first
    if (!profs.length) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no profiles</div></div>`;
    const key = section + ":" + a.name;
    const sel = profSelFor(key, profs);     // per-card pick > global > first profile
    const btn = (val, label, on) => `<button class="profbtn${on ? " active" : ""}" data-prof="${esc(val)}">${esc(label)}</button>`;
    const lbl = pr => countFn ? pr.name + " · " + countFn(pr) : pr.name;
    const btns = profs.map(pr => btn(pr.name, lbl(pr), sel === pr.name)).join("")
      + btn("__all", "all", sel === "__all");
    const blocks = profs.map(pr => {
      const show = sel === "__all" || sel === pr.name;
      return `<div class="profblock" data-prof="${esc(pr.name)}"${show ? "" : " hidden"}>${plabel(pr)}${block(pr, a)}</div>`;
    }).join("");
    return `<div class="panel" data-card="${esc(key)}"><h3><span class="agentname">${esc(a.name)}</span></h3>
      <div class="profbtns">${btns}</div>${blocks}</div>`;
  };

  // SOULS — SOUL.md + AGENTS.md previews, per profile
  const soulHtml = list.map(a => perProfile("soul", a, (pr, ag) => {
    const so = pr.soul || {};
    if (so.available === false) return `<div class="empty">no soul</div>`;
    const a_ = encodeURIComponent(ag.name), p_ = encodeURIComponent(pr.name);
    const links = [];
    if (so.has_soul) links.push(`<a href="/api/file?agent=${a_}&profile=${p_}&name=soul" target="_blank" rel="noopener">SOUL.md ↗</a>`);
    if (so.has_agents) links.push(`<a href="/api/file?agent=${a_}&profile=${p_}&name=agents" target="_blank" rel="noopener">AGENTS.md ↗</a>`);
    const previews = [];
    [["SOUL.md", so.preview], ["AGENTS.md", so.agents_preview]].forEach(([label, pv]) => {
      if (!pv || !pv.text) return;
      previews.push(`<div class="proflabel">${label}</div><pre class="mempre">${esc(pv.text)}${pv.truncated ? "\n…" : ""}</pre>`);
    });
    return `<div class="loglinks">${links.join(" · ") || `<span class="empty">—</span>`}</div>
      ${previews.join("") || `<div class="empty">no preview</div>`}`;
  })).join("");

  // MEMORY — MEMORY.md + USER.md previews, per profile
  const memHtml = list.map(a => perProfile("memory", a, (pr, ag) => {
    const m = pr.memory || {};
    if (m.available === false) return `<div class="empty">no memory</div>`;
    const a_ = encodeURIComponent(ag.name), p_ = encodeURIComponent(pr.name);
    const links = [];
    if (m.has_memory) links.push(`<a href="/api/file?agent=${a_}&profile=${p_}&name=memory" target="_blank" rel="noopener">MEMORY.md ↗</a>`);
    if (m.has_user) links.push(`<a href="/api/file?agent=${a_}&profile=${p_}&name=user" target="_blank" rel="noopener">USER.md ↗</a>`);
    const previews = [];
    [["MEMORY.md", m.memory_preview], ["USER.md", m.user_preview]].forEach(([label, pv]) => {
      if (!pv || !pv.text) return;
      previews.push(`<div class="proflabel">${label}</div><pre class="mempre">${esc(pv.text)}${pv.truncated ? "\n…" : ""}</pre>`);
    });
    return `<div class="loglinks">${links.join(" · ") || `<span class="empty">—</span>`}</div>
      ${previews.join("") || `<div class="empty">no preview</div>`}`;
  })).join("");

  // SKILLS USAGE — uses per skill, per profile
  const skHtml = list.map(a => perProfile("skills", a, pr => {
    const used = pr.skills_used || [];
    const rows = used.map(s =>
      `<tr><td>${esc(s.name)}</td><td class="mono">${s.count}</td><td class="ts" title="${esc(relTime(s.last_used))}">${esc(tsShort(s.last_used))}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no usage</td></tr>`;
    return `<div class="tbl-wrap"><table><thead><tr><th scope="col">skill</th><th scope="col">uses</th><th scope="col">last used</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }, pr => (pr.skills_used || []).length)).join("");

  // CHANNELS — platform bindings (channels / dms / thread count), per profile
  const chHtml = list.map(a => perProfile("channels", a, pr => {
    const c = pr.channels || {};
    const row = (kind, x) => `<tr>
      <td class="mono">${kind}</td>
      <td class="mono">${esc(x.platform || "—")}</td>
      <td>${esc(x.name || x.id || "—")}</td></tr>`;
    const rows = [
      ...(c.channels || []).map(x => row("channel", x)),
      ...(c.dms || []).map(x => row("dm", x)),
    ].join("") || `<tr><td colspan="3" class="empty">no channels</td></tr>`;
    return `<div class="loglinks">
        <span class="pill mono">${(c.channels || []).length} ch</span>
        <span class="pill mono">${(c.dms || []).length} dm</span>
        <span class="pill mono">${c.threads || 0} thr</span></div>
      <div class="tbl-wrap"><table><thead><tr><th scope="col">type</th><th scope="col">platform</th><th scope="col">name</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }, pr => ((pr.channels && pr.channels.channels || []).length + (pr.channels && pr.channels.dms || []).length))).join("");

  // TOKENS — total / 30d / 7d usage (state.db sessions), per profile
  const tokHtml = list.map(a => perProfile("tokens", a, pr => {
    const s = pr.stats || {};
    const n = v => (v || 0).toLocaleString();
    return `<div class="tbl-wrap"><table><thead><tr><th scope="col">period</th><th scope="col">tokens</th><th scope="col">cost</th></tr></thead><tbody>
        <tr><td>total</td><td class="mono">${n(s.tokens_total)}</td><td class="mono">${esc(fmtUsd(s.cost_total))}</td></tr>
        <tr><td>30d</td><td class="mono">${n(s.tokens_30d)}</td><td class="mono">${esc(fmtUsd(s.cost_30d))}</td></tr>
        <tr><td>7d</td><td class="mono">${n(s.tokens_7d)}</td><td class="mono">${esc(fmtUsd(s.cost_7d))}</td></tr>
      </tbody></table></div>`;
  })).join("");

  // RECENT — last 5 task runs + last 5 sessions + log issue counts, per profile
  const recHtml = list.map(a => perProfile("recent", a, pr => {
    const k = pr.kanban || {}, lg = pr.logs || {};
    const taskRows = (k.runs || []).slice(0, 5).map(r =>
      `<tr><td class="mono">${esc((r.task_id || "").slice(0, 8))}</td>
        <td><span class="pill ${badgeForState(r.status)}">${esc(r.status || "?")}</span></td>
        <td class="ts" title="${esc(relTime(r.started_at))}">${esc(tsShort(r.started_at))}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no task runs</td></tr>`;
    const sessRows = (pr.recent_sessions || []).slice(0, 5).map(r =>
      `<tr><td class="mono">${esc((r.id || "").slice(0, 8))}</td>
        <td class="ts" title="${esc(relTime(r.started_at))}">${esc(tsShort(r.started_at))}</td>
        <td class="mono">${r.messages == null ? "—" : esc(r.messages)}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no sessions</td></tr>`;
    return `<div class="loglinks">
        <span class="pill b-bad bad">${lg.errors || 0} err</span>
        <span class="pill b-warn warn">${lg.warnings || 0} warn</span></div>
      <div class="proflabel">recent task runs</div>
      <div class="tbl-wrap"><table><thead><tr><th scope="col">task</th><th scope="col">status</th><th scope="col">started</th></tr></thead><tbody>${taskRows}</tbody></table></div>
      <div class="proflabel">recent sessions</div>
      <div class="tbl-wrap"><table><thead><tr><th scope="col">session</th><th scope="col">started</th><th scope="col">msgs</th></tr></thead><tbody>${sessRows}</tbody></table></div>`;
  })).join("");

  // TOOLS — runtime tool calls (state.db messages.tool_name), per profile
  const toolHtml = list.map(a => perProfile("tools", a, pr => {
    const t = pr.tools || {};
    if (t.available === false) return `<div class="empty">no tool data</div>`;
    const rows = (t.top || []).map(x =>
      `<tr><td>${esc(x.name)}</td><td class="mono">${(x.count || 0).toLocaleString()}</td></tr>`
    ).join("") || `<tr><td colspan="2" class="empty">no tool calls</td></tr>`;
    return `<div class="loglinks">
        <span class="pill mono">${(t.total || 0).toLocaleString()} calls</span>
        <span class="pill mono">${t.distinct || 0} tools</span></div>
      <div class="tbl-wrap"><table><thead><tr><th scope="col">tool</th><th scope="col">calls</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }, pr => ((pr.tools && pr.tools.top) || []).length)).join("");

  // DISK — agent home footprint + biggest entries (whole home, cached reader)
  const diskHtml = list.map(a => {
    const d = a.disk || {};
    if (d.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no disk data</div></div>`;
    if (d.computing) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">computing footprint…</div></div>`;
    const max = Math.max(1, ...(d.items || []).map(x => x.bytes || 0));
    const rows = (d.items || []).map(x =>
      `<tr><td class="mono">${esc(x.name)}</td><td class="mono">${esc(fmtBytes(x.bytes))}</td>
        <td><span class="bar" style="width:${Math.round((x.bytes || 0) / max * 100)}%"></span></td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">empty</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span>
        <span class="pill mono">${esc(fmtBytes(d.total_bytes))} total</span></h3>
      <div class="tbl-wrap"><table><thead><tr><th scope="col">entry</th><th scope="col">size</th><th scope="col">share</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join("");

  // VAULT — local vault entry count + auth lock state (no secret content), per profile
  const vaultHtml = list.map(a => perProfile("vault", a, pr => {
    const v = pr.vault || {};
    if (v.available === false) return `<div class="empty">no vault</div>`;
    return `<div class="loglinks">
        <span class="pill mono">${v.entries || 0} entries</span>
        <span class="pill ${v.locked ? "b-bad bad" : "b-ok ok"}">${v.locked ? "auth locked" : "auth ok"}</span></div>`;
  }, pr => (pr.vault && pr.vault.entries) || 0)).join("");

  $("tab-agents").innerHTML = `
    <div class="grid">${profHtml}</div>
    <div class="midline"></div>
    ${head("SOULS AND AGENTS", "SOUL.md persona · AGENTS.md contract · per profile")}<div class="grid">${soulHtml}</div>
    <div class="midline"></div>
    ${head("MEMORY", "MEMORY.md · USER.md preview · per profile")}<div class="grid">${memHtml}</div>
    <div class="midline"></div>
    ${head("SKILLS USAGE", "active skills · uses per skill · per profile")}<div class="grid">${skHtml}</div>
    <div class="midline"></div>
    ${head("TOOLS", "runtime tool calls · top tools (state.db) · per profile")}<div class="grid">${toolHtml}</div>
    <div class="midline"></div>
    ${head("TOKENS", "session tokens · total / 30d / 7d (state.db) · per profile")}<div class="grid">${tokHtml}</div>
    <div class="midline"></div>
    ${head("RECENT", "last 5 task runs · last 5 sessions · log issues · per profile")}<div class="grid">${recHtml}</div>
    <div class="midline"></div>
    ${head("CHANNELS", "platform bindings · channels · dms · threads · per profile")}<div class="grid">${chHtml}</div>
    <div class="midline"></div>
    ${head("DISK", "agent home footprint · biggest entries")}<div class="grid">${diskHtml}</div>
    <div class="midline"></div>
    ${head("VAULT", "local vault entries · auth lock · per profile")}<div class="grid">${vaultHtml}</div>`;
}

/* ---------- Profiles (per agent → per profile: desc, skills, channels) ---------- */
export function renderProfiles() {
  const list = agents();
  const html = list.map(a => {
    const p = a.profiles || {};
    if (p.available === false) {
      return `<div class="panel span-all"><h3><span class="agentname">${esc(a.name)}</span></h3>${errLine(p)}<div class="empty">no profiles</div></div>`;
    }
    const profs = p.profiles || [];
    const blocks = profs.map(pr => {
      const ch = pr.channels || {};
      const sk = pr.skills || {};
      const names = arr => arr.map(x => `<span class="dchip">${esc(x.name || x.id)}</span>`).join(" ") || `<span class="muted">—</span>`;
      const cats = (sk.categories || []).map(c => `<span class="pill mono">${esc(c.name)} ${c.count}</span>`).join(" ");
      const skBlock = sk.count
        ? `<details class="skills"><summary>${sk.count} skills · ${(sk.categories || []).length} categories</summary><div class="cats">${cats}</div></details>`
        : `<span class="muted">no skills</span>`;
      return `<div class="profblock">
        <div class="profhdr">
          <span class="pname">${esc(pr.name)}</span>
          <span class="pill ${badgeForState(pr.state)}">${esc(pr.state || "—")}</span>
          <span class="pill modelpill mono">${esc(pr.model || "no model")}</span>
        </div>
        ${pr.description ? `<div class="profdesc">${esc(pr.description)}</div>` : `<div class="profdesc muted">no description</div>`}
        <div class="loglinks">
          ${pr.has_profile ? `<a href="/api/file?agent=${encodeURIComponent(a.name)}&profile=${encodeURIComponent(pr.name)}&name=profile" target="_blank" rel="noopener">profile.yaml ↗</a> · ` : ""}
          <a href="/api/file?agent=${encodeURIComponent(a.name)}&profile=${encodeURIComponent(pr.name)}&name=config" target="_blank" rel="noopener">config.yaml ↗</a>
          ${pr.has_soul ? `· <a href="/api/file?agent=${encodeURIComponent(a.name)}&profile=${encodeURIComponent(pr.name)}&name=soul" target="_blank" rel="noopener">SOUL.md ↗</a>` : ""}
        </div>
        <div class="proflabel">skills</div>${skBlock}
        <div class="tbl-wrap"><table class="discord-tbl"><thead><tr><th scope="col">channels (${(ch.channels || []).length})</th><th scope="col">dms (${(ch.dms || []).length})</th><th scope="col">threads</th></tr></thead>
        <tbody><tr><td>${names(ch.channels || [])}</td><td>${names(ch.dms || [])}</td><td class="mono">${ch.threads || 0}</td></tr></tbody></table></div>
      </div>`;
    }).join("") || `<div class="empty">no profiles</div>`;
    return `<div class="panel span-all">
      <h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono">${profs.length} profiles</span></h3>
      ${errLine(p)}<div class="profgrid">${blocks}</div></div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-profiles").innerHTML = `<div class="grid">${html}</div>`;
}

/* ---------- Tasks (kanban runs) ---------- */
export function taskTh(key, label) {
  const st = UI.taskSort, as = st.key === key ? (st.dir > 0 ? "ascending" : "descending") : "none";
  return `<th scope="col" class="sortable" data-table="task" data-key="${key}" tabindex="0" role="button" aria-sort="${as}" aria-label="sort by ${label}">${label}${arrow(UI.taskSort, key)}</th>`;
}
export function renderTasks() {
  const list = agents();
  const statuses = new Set();
  list.forEach(a => {
    const k = a.kanban || {};
    const bs = (k.boards && k.boards.length) ? k.boards : [k];
    bs.forEach(b => (b.runs || []).forEach(r => statuses.add((r.status || "?").toLowerCase())));
  });
  const chips = [`<span class="chip${UI.taskStatus === "" ? " active" : ""}" data-taskstatus="">all</span>`]
    .concat([...statuses].sort().map(s =>
      `<span class="chip${UI.taskStatus === s ? " active" : ""}" data-taskstatus="${esc(s)}">${esc(s)}</span>`)).join("");

  const runsTable = (aName, boardName, k) => {
    let runs = (k.runs || []);
    if (UI.taskStatus) runs = runs.filter(r => (r.status || "").toLowerCase() === UI.taskStatus);
    runs = sortRows(runs, UI.taskSort.key, UI.taskSort.dir);
    const rows = runs.map(r =>
      `<tr>
        <td class="mono"><a href="/api/task?agent=${encodeURIComponent(aName)}&board=${encodeURIComponent(boardName)}&id=${encodeURIComponent(r.task_id || "")}" target="_blank" rel="noopener" title="open task card (description · comments · events · runs)">${esc((r.task_id || "").slice(0,10))} ↗</a></td>
        <td><span class="pill ${badgeForState(r.status)}">${esc(r.status || "?")}</span></td>
        <td>${esc(r.outcome || "")}</td>
        <td title="${esc(r.summary || "")}">${esc((r.summary || "").slice(0,70))}</td>
        <td class="ts" title="${esc(relTime(r.started_at))}">${esc(tsShort(r.started_at))}</td>
        <td class="err" title="${esc(r.error || "")}">${esc((r.error || "").slice(0,60))}</td>
      </tr>`).join("");
    return `<div class="tbl-wrap"><table><thead><tr>${taskTh("task_id","task")}${taskTh("status","status")}${taskTh("outcome","outcome")}<th scope="col">summary</th>${taskTh("started_at","started")}<th scope="col">error</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="empty">no task runs</td></tr>`}</tbody></table></div>`;
  };

  const html = list.map(a => {
    const k = a.kanban || {};
    // per-board view: default + named boards (kanban/boards/<slug>); older
    // snapshots without `boards` degrade to a single default board.
    const boards = (k.boards && k.boards.length)
      ? k.boards : [{ name: "default", title: "default", icon: "", tasks_total: k.tasks_total || 0, runs: k.runs || [], runs_total: k.runs_total || 0 }];
    const key = "kb:" + a.name;
    let sel = Object.prototype.hasOwnProperty.call(UI.profSel, key) ? UI.profSel[key] : "__all";
    if (sel !== "__all" && !boards.some(b => b.name === sel)) sel = "__all";
    const btn = (val, label, on) => `<button class="profbtn${on ? " active" : ""}" data-prof="${esc(val)}">${esc(label)}</button>`;
    const bLabel = b => `${b.icon ? b.icon + " " : ""}${b.title || b.name} · ${b.tasks_total || 0}${b.name === k.current ? " ●" : ""}`;
    const btns = boards.length > 1
      ? `<div class="profbtns">${btn("__all", "all boards", sel === "__all")}${boards.map(b => btn(b.name, bLabel(b), sel === b.name)).join("")}</div>`
      : "";
    const shown = sel === "__all" ? boards : boards.filter(b => b.name === sel);
    const blocks = shown.map(b =>
      `<div class="profblock" data-prof="${esc(b.name)}">
        <div class="proflabel"><span class="pill mono profile-tag">${esc(b.icon ? b.icon + " " : "")}${esc(b.title || b.name)}</span>
          <span class="pill mono">${b.tasks_total || 0} tasks · ${b.runs_total || 0} runs</span>
          ${b.name === k.current ? `<span class="pill b-ok ok">active board</span>` : ""}</div>
        ${runsTable(a.name, b.name, b)}
      </div>`).join("");
    return `<div class="panel span-all" data-card="${esc(key)}">
      <h3><span class="agentname">${esc(a.name)}</span> — task runs
        <span class="pill mono">${boards.length} board${boards.length > 1 ? "s" : ""}</span></h3>
      ${errLine(k)}
      ${btns}
      ${blocks}
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-tasks").innerHTML = `<div class="chips">${chips}</div><div class="grid">${html}</div>`;
}

/* ---------- Schedule (cron) ---------- */
export function schedTh(key, label) {
  const st = UI.schedSort, as = st.key === key ? (st.dir > 0 ? "ascending" : "descending") : "none";
  return `<th scope="col" class="sortable" data-table="sched" data-key="${key}" tabindex="0" role="button" aria-sort="${as}" aria-label="sort by ${label}">${label}${arrow(UI.schedSort, key)}</th>`;
}
export function renderSchedule() {
  const html = agents().map(a => {
    const c = a.cron || {};
    let jobs = sortRows(c.jobs || [], UI.schedSort.key, UI.schedSort.dir);

    // per-profile filter buttons — default "all" (the table mixes profiles);
    // stable key -> UI.profSel["cron:<agent>"], honors the global profile pick.
    const key = "cron:" + a.name;
    const profNames = [...new Set(jobs.map(j => j.profile || "main"))]
      .sort((x, y) => (x === "main" ? -1 : y === "main" ? 1 : x.localeCompare(y)));
    let sel = Object.prototype.hasOwnProperty.call(UI.profSel, key)
      ? UI.profSel[key] : (UI.profGlobal || "__all");
    if (sel !== "__all" && !profNames.includes(sel)) sel = "__all";
    const btn = (val, label, on) => `<button class="profbtn${on ? " active" : ""}" data-prof="${esc(val)}">${esc(label)}</button>`;
    const btns = profNames.length > 1
      ? `<div class="profbtns">${btn("__all", "all · " + jobs.length, sel === "__all")}${profNames.map(p =>
          btn(p, p + " · " + jobs.filter(j => (j.profile || "main") === p).length, sel === p)).join("")}</div>`
      : "";
    if (sel !== "__all") jobs = jobs.filter(j => (j.profile || "main") === sel);

    const rows = jobs.map(j =>
      `<tr>
        <td class="mono">${esc(j.profile || "—")}</td>
        <td>${esc(j.name)}</td>
        <td class="mono">${esc(j.schedule || "—")}</td>
        <td class="mono">${esc(j.skill || "—")}</td>
        <td class="mono">${esc(j.model || "—")}</td>
        <td><span class="pill ${j.enabled ? "b-ok ok" : "muted"}">${j.enabled ? "on" : "off"}</span></td>
        <td><span class="pill ${badgeForState(j.last_status)}">${esc(j.last_status || "—")}</span></td>
        <td class="ts" title="${esc(relTime(j.next_run_at))}">${esc(tsShort(j.next_run_at))}</td>
        <td class="mono">${esc(relTime(j.next_run_at))}</td>
        <td>${(j.run_count || 0) ? `<details class="skills"><summary>${j.run_count} runs</summary>${(j.runs || []).map(f => `<div class="skcat"><a href="/api/cron-run?agent=${encodeURIComponent(a.name)}&profile=${encodeURIComponent(j.profile || "main")}&job=${encodeURIComponent(j.id)}&file=${encodeURIComponent(f)}" target="_blank" rel="noopener">${esc(f.replace(".md", "").replace("_", " "))}</a></div>`).join("")}</details>` : `<span class="muted">0</span>`}</td>
      </tr>`).join("");
    return `<div class="panel span-all" data-card="${esc(key)}">
      <h3><span class="agentname">${esc(a.name)}</span> — cron jobs</h3>
      ${errLine(c)}
      ${btns}
      <div class="tbl-wrap"><table><thead><tr>${schedTh("profile","profile")}${schedTh("name","name")}${schedTh("schedule","schedule")}${schedTh("skill","skill")}${schedTh("model","model")}${schedTh("enabled","enabled")}${schedTh("last_status","last")}${schedTh("next_run_at","next run")}<th scope="col">in</th><th scope="col">runs</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10" class="empty">no cron jobs</td></tr>`}</tbody></table></div>
    </div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-schedule").innerHTML = `<div class="grid">${html}</div>`;
}

/* ---------- Sessions ---------- */
export function renderSessions() {
  const TH = `<thead><tr><th scope="col">session</th><th scope="col">started</th><th scope="col">msgs</th><th scope="col">source</th></tr></thead>`;
  // session id links to the read-only transcript endpoint (state.db or legacy jsonl)
  const sessRows = (aName, profName, list) => (list || []).map(r =>
    `<tr><td class="mono"><a href="/api/session?agent=${encodeURIComponent(aName)}&profile=${encodeURIComponent(profName)}&id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener" title="open transcript">${esc(r.id)} ↗</a></td>
      <td class="ts" title="${esc(relTime(r.started_at))}">${esc(tsShort(r.started_at))}</td>
      <td>${r.messages == null ? "—" : esc(r.messages)}</td>
      <td>${esc(r.source || "—")}</td></tr>`).join("");

  const html = agents().map(a => {
    const profs = ((a.profiles && a.profiles.profiles) || []).slice()
      .sort((x, y) => (x.name === "main" ? -1 : y.name === "main" ? 1 : 0));   // main always first

    if (!profs.length) {   // profiles reader unavailable — flat per-agent view
      const s = a.sessions || {};
      const rows = sessRows(a.name, "main", s.recent);
      return `<div class="panel">
        <h3><span class="agentname">${esc(a.name)}</span>
          <span class="pill mono">${(s.total != null ? s.total : 0)} total</span></h3>
        ${errLine(s)}
        <div class="tbl-wrap"><table>${TH}
        <tbody>${rows || `<tr><td colspan="4" class="empty">no sessions</td></tr>`}</tbody></table></div>
      </div>`;
    }

    // per-profile blocks behind a button row — same pattern as Overview/Agents;
    // stable key -> UI.profSel["sess:<agent>"], "__all" reveals every block.
    const totalAll = profs.reduce((n, p) => n + (p.sessions || 0), 0);
    const key = "sess:" + a.name;
    const sel = profSelFor(key, profs);
    const btn = (val, label, on) => `<button class="profbtn${on ? " active" : ""}" data-prof="${esc(val)}">${esc(label)}</button>`;
    const btns = profs.map(pr => btn(pr.name, pr.name + " · " + (pr.sessions || 0), sel === pr.name)).join("")
      + btn("__all", "all", sel === "__all");
    const blocks = profs.map(pr => {
      const show = sel === "__all" || sel === pr.name;
      const rows = sessRows(a.name, pr.name, pr.recent_sessions)
        || `<tr><td colspan="4" class="empty">no sessions</td></tr>`;
      return `<div class="profblock" data-prof="${esc(pr.name)}"${show ? "" : " hidden"}>` +
        `<div class="proflabel"><span class="pill mono profile-tag">${esc(pr.name)}</span></div>` +
        `<div class="tbl-wrap"><table>${TH}<tbody>${rows}</tbody></table></div></div>`;
    }).join("");
    return `<div class="panel" data-card="${esc(key)}">
      <h3><span class="agentname">${esc(a.name)}</span>
        <span class="pill mono">${totalAll} total</span></h3>
      <div class="profbtns">${btns}</div>${blocks}</div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-sessions").innerHTML = `<div class="grid">${html}</div>`;
}

/* ---------- Logs ---------- */
export function renderLogs() {
  const chips = `<div class="chips">
    <span class="filterbtn ${UI.logErr ? "on" : ""}" data-logfilter="err">errors</span>
    <span class="filterbtn ${UI.logWarn ? "on" : ""}" data-logfilter="warn">warnings</span>
  </div>`;
  const html = agents().map(a => {
    const lg = a.logs || {};
    if (lg.available === false) {
      return `<div class="panel span-all"><h3><span class="agentname">${esc(a.name)}</span></h3><div class="empty">no logs</div></div>`;
    }
    const shown = (lg.issues || []).filter(it =>
      (it.level === "error" && UI.logErr) || (it.level === "warn" && UI.logWarn));
    const lines = shown.map(it =>
      `<div class="logline ${it.level === "error" ? "bad" : "warn"}">${esc(it.text)}</div>`
    ).join("") || `<div class="empty">no matching lines</div>`;
    const a_ = encodeURIComponent(a.name);
    return `<div class="panel span-all">
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
