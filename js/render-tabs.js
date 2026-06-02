import { $, esc, UI, agents, badgeForState, isActive, relTime, tsShort, sortRows, arrow, errLine } from "./core.js";

/* ---------- Agents (profiles) ---------- */
export function renderAgents() {
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
export function taskTh(key, label) {
  return `<th class="sortable" data-table="task" data-key="${key}">${label}${arrow(UI.taskSort, key)}</th>`;
}
export function renderTasks() {
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
export function schedTh(key, label) {
  return `<th class="sortable" data-table="sched" data-key="${key}">${label}${arrow(UI.schedSort, key)}</th>`;
}
export function renderSchedule() {
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
export function renderSessions() {
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
export function renderLogs() {
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
