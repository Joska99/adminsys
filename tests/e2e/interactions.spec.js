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

// ---------- SESSIONS ----------
test("Sessions: total + rows, and the agent dropdown filters them", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="sessions"]').click();
  const tab = page.locator("#tab-sessions");
  await expect(tab).toContainText("2 total");
  await expect(tab.locator("td", { hasText: "20260602_110000_bbb" })).toHaveCount(1);

  // narrow to alpha via the dropdown -> only alpha's sessions panel remains
  await page.locator("#agentdd-btn").click();
  await page.locator('#agentdd-panel [data-agent="alpha"]').click();
  await expect(tab.locator("h3", { hasText: "alpha" })).toHaveCount(1);
  await expect(tab.locator("h3", { hasText: "empty" })).toHaveCount(0);
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
