import { $, esc, UI, agents, badgeForState, isActive, relTime, tsShort, sortRows, arrow, errLine, fmtUsd } from "./core.js";
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
      <table><thead><tr><th>profile</th><th>model</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="2" class="empty">no profiles</td></tr>`}</tbody></table>`;
    return agentCard(a, profTable);
  }).join("") || `<div class="empty">No agents.</div>`;

  // SOULS — main agent SOUL.md preview (main profile only)
  const soulHtml = list.map(a => {
    const so = a.soul || {};
    const badge = `<span class="pill mono profile-tag">main</span>`;
    if (so.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> ${badge}</h3><div class="empty">no soul</div></div>`;
    const a_ = encodeURIComponent(a.name);
    const pv = so.preview || {};
    const body = pv.text
      ? `<pre class="mempre">${esc(pv.text)}${pv.truncated ? "\n…" : ""}</pre>`
      : `<div class="empty">no preview</div>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> ${badge}</h3>
      <div class="loglinks"><a href="/api/file?agent=${a_}&profile=main&name=soul" target="_blank" rel="noopener">SOUL.md ↗</a></div>
      ${body}</div>`;
  }).join("");

  const memHtml = list.map(a => {
    const m = a.memory || {};
    if (m.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span></h3><div class="empty">no memory</div></div>`;
    const a_ = encodeURIComponent(a.name);
    const links = [];
    if (m.has_memory) links.push(`<a href="/api/file?agent=${a_}&profile=main&name=memory" target="_blank" rel="noopener">MEMORY.md ↗</a>`);
    if (m.has_user) links.push(`<a href="/api/file?agent=${a_}&profile=main&name=user" target="_blank" rel="noopener">USER.md ↗</a>`);
    const previews = [];
    [["MEMORY.md", m.memory_preview], ["USER.md", m.user_preview]].forEach(([label, pv]) => {
      if (!pv || !pv.text) return;
      previews.push(`<div class="proflabel">${label}</div><pre class="mempre">${esc(pv.text)}${pv.truncated ? "\n…" : ""}</pre>`);
    });
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span></h3>
      <div class="loglinks">${links.join(" · ") || `<span class="empty">—</span>`}</div>
      ${previews.join("") || `<div class="empty">no preview</div>`}</div>`;
  }).join("");

  const skHtml = list.map(a => {
    const used = (a.skills && a.skills.used) || [];
    const rows = used.map(s =>
      `<tr><td>${esc(s.name)}</td><td class="mono">${s.count}</td><td class="ts">${esc(tsShort(s.last_used))}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no usage</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span></h3>
      <table><thead><tr><th>skill</th><th>uses</th><th>last used</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");

  // CHANNELS — per-agent platform bindings (channels / dms / threads)
  const chHtml = list.map(a => {
    const c = a.channels || {};
    if (c.available === false) return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span></h3><div class="empty">no channels</div></div>`;
    // threads carry no parent id — infer the channel from "… / #<name> / …" in
    // the thread's name. word-boundary guard so #insights ≠ #insights-ideas.
    const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const threadsFor = name => {
      if (!name) return 0;
      const re = new RegExp("#" + rxEsc(name) + "(?![\\w-])", "i");
      return (c.threads || []).filter(tn => re.test(String(tn))).length;
    };
    const row = (kind, x, thr) => `<tr>
      <td class="mono">${kind}</td>
      <td class="mono">${esc(x.platform || "—")}</td>
      <td>${esc(x.name || x.id || "—")}</td>
      <td class="mono">${esc(x.guild || "—")}</td>
      <td class="mono">${thr}</td></tr>`;
    const rows = [
      ...(c.channels || []).map(x => row("channel", x, threadsFor(x.name))),
      ...(c.dms || []).map(x => row("dm", x, "—")),
    ].join("") || `<tr><td colspan="5" class="empty">no channels</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span>
        <span class="pill mono">${(c.channels || []).length} ch</span>
        <span class="pill mono">${(c.dms || []).length} dm</span>
        <span class="pill mono">${c.thread_count || 0} thr</span></h3>
      <table><thead><tr><th>type</th><th>platform</th><th>name</th><th>guild</th><th>threads</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }).join("");

  // TOKENS — main-profile usage: all-time total, 30d, 7d (from state.db sessions)
  const tokHtml = list.map(a => {
    const s = a.sessions || {};
    const n = v => (v || 0).toLocaleString();
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span></h3>
      <table><thead><tr><th>period</th><th>tokens</th><th>cost</th></tr></thead><tbody>
        <tr><td>total</td><td class="mono">${n(s.tokens_total)}</td><td class="mono">${esc(fmtUsd(s.cost_total))}</td></tr>
        <tr><td>30d</td><td class="mono">${n(s.tokens_30d)}</td><td class="mono">${esc(fmtUsd(s.cost_30d))}</td></tr>
        <tr><td>7d</td><td class="mono">${n(s.tokens_7d)}</td><td class="mono">${esc(fmtUsd(s.cost_7d))}</td></tr>
      </tbody></table></div>`;
  }).join("");

  // RECENT — last 5 task runs + last 5 sessions + log issue counts, per agent
  const recHtml = list.map(a => {
    const k = a.kanban || {}, s = a.sessions || {}, lg = a.logs || {};
    const taskRows = (k.runs || []).slice(0, 5).map(r =>
      `<tr><td class="mono">${esc((r.task_id || "").slice(0, 8))}</td>
        <td><span class="pill ${badgeForState(r.status)}">${esc(r.status || "?")}</span></td>
        <td class="ts">${esc(tsShort(r.started_at))}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no task runs</td></tr>`;
    const sessRows = (s.recent || []).slice(0, 5).map(r =>
      `<tr><td class="mono">${esc((r.id || "").slice(0, 8))}</td>
        <td class="ts">${esc(tsShort(r.started_at))}</td>
        <td class="mono">${r.messages == null ? "—" : esc(r.messages)}</td></tr>`
    ).join("") || `<tr><td colspan="3" class="empty">no sessions</td></tr>`;
    return `<div class="panel"><h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono profile-tag">main</span>
        <span class="pill b-bad bad">${lg.errors || 0} err</span>
        <span class="pill b-warn warn">${lg.warnings || 0} warn</span></h3>
      <div class="proflabel">recent task runs</div>
      <table><thead><tr><th>task</th><th>status</th><th>started</th></tr></thead><tbody>${taskRows}</tbody></table>
      <div class="proflabel">recent sessions</div>
      <table><thead><tr><th>session</th><th>started</th><th>msgs</th></tr></thead><tbody>${sessRows}</tbody></table></div>`;
  }).join("");

  $("tab-agents").innerHTML = `
    <div class="grid">${profHtml}</div>
    <div class="midline"></div>
    ${head("SKILLS USAGE", "active skills · uses per skill")}<div class="grid">${skHtml}</div>
    <div class="midline"></div>
    ${head("TOKENS", "main profile · total · 30d · 7d")}<div class="grid">${tokHtml}</div>
    <div class="midline"></div>
    ${head("SOULS", "SOUL.md persona · main profile")}<div class="grid">${soulHtml}</div>
    <div class="midline"></div>
    ${head("MEMORY", "MEMORY.md · USER.md preview")}<div class="grid">${memHtml}</div>
    <div class="midline"></div>
    ${head("CHANNELS", "platform bindings · channels · dms · threads")}<div class="grid">${chHtml}</div>
    <div class="midline"></div>
    ${head("RECENT", "last 5 task runs · last 5 sessions · log issues")}<div class="grid">${recHtml}</div>`;
}

/* ---------- Profiles (per agent → per profile: desc, skills, channels) ---------- */
export function renderProfiles() {
  const list = agents();
  const html = list.map(a => {
    const p = a.profiles || {};
    if (p.available === false) {
      return `<div class="panel" style="grid-column:1/-1"><h3><span class="agentname">${esc(a.name)}</span></h3>${errLine(p)}<div class="empty">no profiles</div></div>`;
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
        <table class="discord-tbl"><thead><tr><th>channels (${(ch.channels || []).length})</th><th>dms (${(ch.dms || []).length})</th><th>threads</th></tr></thead>
        <tbody><tr><td>${names(ch.channels || [])}</td><td>${names(ch.dms || [])}</td><td class="mono">${ch.threads || 0}</td></tr></tbody></table>
      </div>`;
    }).join("") || `<div class="empty">no profiles</div>`;
    return `<div class="panel" style="grid-column:1/-1">
      <h3><span class="agentname">${esc(a.name)}</span> <span class="pill mono">${profs.length} profiles</span></h3>
      ${errLine(p)}<div class="profgrid">${blocks}</div></div>`;
  }).join("") || `<div class="empty">No agents.</div>`;
  $("tab-profiles").innerHTML = `<div class="grid">${html}</div>`;
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
