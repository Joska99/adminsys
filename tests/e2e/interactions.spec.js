// Interaction tests for the Tasks / Cron / Sessions / Logs tabs.
// Fixture: agent "alpha" has 2 task runs (running "doing it" + failed "broke"),
// cron job1 with 1 run report, 2 sessions, logs with 1 error + 1 warning;
// agent "empty" has none of these.
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".kpi").first()).toBeVisible();
});

// ---------- TASKS ----------
test("Tasks: status chips filter the runs", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="tasks"]').click();
  const tab = page.locator("#tab-tasks");
  // both runs visible initially
  await expect(tab.locator("td", { hasText: "doing it" })).toHaveCount(1);
  await expect(tab.locator("td", { hasText: "broke" })).toHaveCount(1);

  const running = tab.locator('.chip[data-taskstatus="running"]');
  await running.click();
  await expect(running).toHaveClass(/active/);
  await expect(tab.locator("td", { hasText: "broke" })).toHaveCount(0);   // failed hidden
  await expect(tab.locator("td", { hasText: "doing it" })).toHaveCount(1);

  await tab.locator('.chip[data-taskstatus=""]').click();                 // back to all
  await expect(tab.locator("td", { hasText: "broke" })).toHaveCount(1);
});

test("Tasks: task id links to the card-detail endpoint", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="tasks"]').click();
  const link = page.locator('#tab-tasks a[href*="/api/task"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /agent=alpha&board=default&id=t1/);

  const res = await page.request.get("/api/task?agent=alpha&id=t1");
  expect(res.status()).toBe(200);
  const text = await res.text();
  expect(text).toContain("title:    build");
  expect(text).toContain("## Comments");
  expect(text).toContain("## Runs");
});

test("Tasks: board buttons switch between default and a1k0", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="tasks"]').click();
  const panel = page.locator('#tab-tasks .panel[data-card="kb:alpha"]');

  // all boards by default: both boards' runs visible, a1k0 marked active
  await expect(panel.locator("td", { hasText: "doing it" })).toHaveCount(1);
  await expect(panel.locator("td", { hasText: "rendered" })).toHaveCount(1);
  await expect(panel.locator(".pill", { hasText: "active board" })).toHaveCount(1);

  // narrow to the a1k0 board -> default board's runs disappear
  await panel.locator(".profbtn", { hasText: /A1k0/ }).click();
  await expect(panel.locator("td", { hasText: "doing it" })).toHaveCount(0);
  await expect(panel.locator("td", { hasText: "rendered" })).toHaveCount(1);

  // its task link carries the board param
  const link = panel.locator('a[href*="board=a1k0"]');
  await expect(link).toHaveAttribute("href", /id=t2/);

  await panel.locator(".profbtn", { hasText: /^all boards/ }).click();
  await expect(panel.locator("td", { hasText: "doing it" })).toHaveCount(1);
});

test("Tasks: clicking a sortable header adds a sort arrow", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="tasks"]').click();
  const th = page.locator('#tab-tasks th.sortable[data-key="status"]').first();
  await expect(th.locator(".arr")).toHaveCount(0);
  await th.click();
  await expect(th.locator(".arr")).toBeVisible();
});

// ---------- CRON ----------
test("Cron: sortable header + run-history details with a cron-run link", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="schedule"]').click();
  const tab = page.locator("#tab-schedule");

  const th = tab.locator('th.sortable[data-key="name"]').first();
  await th.click();
  await expect(th.locator(".arr")).toBeVisible();

  const details = tab.locator("details.skills").first();      // "1 runs"
  await details.locator("summary").click();
  const link = details.locator('a[href*="/api/cron-run"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /agent=alpha/);
  await expect(link).toHaveAttribute("href", /job=job1/);
});

test("Cron: profile buttons filter jobs per profile", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="schedule"]').click();
  const panel = page.locator('#tab-schedule .panel[data-card="cron:alpha"]');

  // default = all: both main's and beta's jobs visible
  await expect(panel.locator("td", { hasText: "daily" })).toHaveCount(1);
  await expect(panel.locator("td", { hasText: "hourly" })).toHaveCount(1);

  // narrow to main -> beta's job disappears
  await panel.locator('.profbtn', { hasText: /^main/ }).click();
  await expect(panel.locator("td", { hasText: "hourly" })).toHaveCount(0);
  await expect(panel.locator("td", { hasText: "daily" })).toHaveCount(1);

  // back to all
  await panel.locator('.profbtn', { hasText: /^all/ }).click();
  await expect(panel.locator("td", { hasText: "hourly" })).toHaveCount(1);
});

// ---------- SESSIONS ----------
test("Sessions: total + rows, and the agent dropdown filters them", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="sessions"]').click();
  const tab = page.locator("#tab-sessions");
  await expect(tab).toContainText("3 total");   // main (2 jsonl) + beta (1 state.db)
  await expect(tab.locator("td", { hasText: "20260602_110000_bbb" })).toHaveCount(1);

  // narrow to alpha via the dropdown -> only alpha's sessions panel remains
  await page.locator("#agentdd-btn").click();
  await page.locator('#agentdd-panel [data-agent="alpha"]').click();
  await expect(tab.locator("h3", { hasText: "alpha" })).toHaveCount(1);
  await expect(tab.locator("h3", { hasText: "empty" })).toHaveCount(0);
});

test("Sessions: profile buttons switch blocks; id links to the transcript", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="sessions"]').click();
  const panel = page.locator('#tab-sessions .panel[data-card="sess:alpha"]');

  // default = main profile block; its session id links to /api/session
  const mainLink = panel.locator('a[href*="/api/session"]', { hasText: "20260602_110000_bbb" });
  await expect(mainLink).toHaveCount(1);
  await expect(mainLink).toHaveAttribute("href", /agent=alpha&profile=main&id=20260602_110000_bbb/);

  // switch to beta -> its state.db session shows, main block hides
  await panel.locator(".profbtn", { hasText: /^beta/ }).click();
  await expect(panel.locator("td", { hasText: "20260603_120000_ccc" })).toBeVisible();
  await expect(panel.locator('.profblock[data-prof="main"]')).toBeHidden();

  // the beta transcript endpoint actually serves the messages
  const res = await page.request.get("/api/session?agent=alpha&profile=beta&id=20260603_120000_ccc");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("beta says hi");
});

// ---------- LOGS ----------
test("Logs: err/warn filter chips toggle the visible lines", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="logs"]').click();
  const tab = page.locator("#tab-logs");
  await expect(tab.locator(".logline", { hasText: "boom" })).toHaveCount(1);
  await expect(tab.locator(".logline", { hasText: "heads up" })).toHaveCount(1);

  await tab.locator('[data-logfilter="err"]').click();        // errors off
  await expect(tab.locator(".logline", { hasText: "boom" })).toHaveCount(0);
  await expect(tab.locator(".logline", { hasText: "heads up" })).toHaveCount(1);

  await tab.locator('[data-logfilter="warn"]').click();       // warnings off too
  await expect(tab).toContainText("no matching lines");

  await tab.locator('[data-logfilter="err"]').click();        // errors back on
  await expect(tab.locator(".logline", { hasText: "boom" })).toHaveCount(1);
});

test("Logs: open-full links point at the /api/log endpoint", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="logs"]').click();
  const link = page.locator('#tab-logs a[href*="/api/log"]').first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", /agent=alpha/);
});
