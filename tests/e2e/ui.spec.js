// Real-browser interaction tests. Fixture has 2 agents: "alpha" (gateway
// running) and "empty" (no hermes files -> unknown state, counts as stopped).
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#tab-overview")).toHaveClass(/active/);
  // wait for the first snapshot to render the KPI row
  await expect(page.locator(".kpi").first()).toBeVisible();
});

test("KPI boxes render with the expected titles and numeric values", async ({ page }) => {
  // titles are uppercased by CSS text-transform, so compare case-insensitively
  const titles = (await page.locator(".kpi .kpi-title").allInnerTexts())
    .map(s => s.trim().toLowerCase());
  for (const t of ["agents", "profiles", "cron jobs", "kanban tasks", "sessions",
                   "tokens 7d", "spend 7d", "active agents", "running tasks",
                   "blocked tasks", "crashed tasks", "failed crons"]) {
    expect(titles).toContain(t);
  }
  // agents KPI shows 2 (alpha + empty)
  const agentsKpi = page.locator(".kpi", { hasText: "agents" }).first();
  await expect(agentsKpi.locator(".kpi-num")).toHaveText(/^\d+$/);
});

test("every sidebar tab activates its section", async ({ page }) => {
  for (const tab of ["agents", "profiles", "schedule", "tasks", "sessions", "logs", "overview"]) {
    await page.locator(`.tabbtn[data-tab="${tab}"]`).click();
    await expect(page.locator(`#tab-${tab}`)).toHaveClass(/active/);
    await expect(page.locator(`.tabbtn[data-tab="${tab}"]`)).toHaveClass(/active/);
  }
});

test("agent card: provider:model pill, no cron link, tui count, always-open cost + sections", async ({ page }) => {
  const card = page.locator("#tab-overview .agent-card").first();
  // model badge = provider:model from the root config
  await expect(card.locator(".modelpill")).toContainText("test-prov:test-model");
  // cron-jobs stat is a plain number — no jump link anywhere in the stat row
  await expect(card.locator(".stat .stat-go")).toHaveCount(0);
  await expect(card.locator('.stat [data-goto]')).toHaveCount(0);
  // session split now includes tui
  await expect(card.locator(".card-foot")).toContainText("tui sessions");
  // spend & tokens always visible — no <details>, rows present without a click
  await expect(card.locator("details.costmeta")).toHaveCount(0);
  await expect(card.locator(".costmeta")).toContainText("30d");
  // TOP SKILLS / TOP TOOLS render open — tables visible without any toggle
  await expect(page.locator("#tab-overview details.ovd")).toHaveCount(0);
  await expect(page.locator("#tab-overview")).toContainText("TOP SKILLS");
  await expect(page.locator('#tab-overview .panel[data-card="ov-skills:alpha"] table').first()).toBeVisible();
  await expect(page.locator('#tab-overview .panel[data-card="ov-tools:alpha"] table').first()).toBeVisible();
});

test("Profiles tab lists both profiles with their models", async ({ page }) => {
  await page.locator('.tabbtn[data-tab="profiles"]').click();
  const tab = page.locator("#tab-profiles");
  await expect(tab).toContainText("test-model");
  await expect(tab).toContainText("beta-model");
  await expect(tab).toContainText("news"); // sub-profile channel binding
});

test("overview agent cards and PROFILES/CRON sections do NOT jump tabs", async ({ page }) => {
  // health banner is a status line, not a logs shortcut
  await expect(page.locator('#tab-overview .health[data-goto]')).toHaveCount(0);
  await expect(page.locator('#tab-overview .health.clickable')).toHaveCount(0);
  // cards are no longer clickable shortcuts
  await expect(page.locator('#tab-overview .agent-card[data-goto]')).toHaveCount(0);
  await expect(page.locator('#tab-overview .ovsec[data-goto="profiles"]')).toHaveCount(0);
  await expect(page.locator('#tab-overview .ovsec[data-goto="schedule"]')).toHaveCount(0);
  // clicking an agent card stays on the overview tab
  await page.locator("#tab-overview .agent-card").first().click();
  await expect(page.locator("#tab-overview")).toHaveClass(/active/);
  await expect(page.locator("#tab-agents")).not.toHaveClass(/active/);
});

test("active-filter chip sits left of the filter buttons and does not shift them", async ({ page }) => {
  const btn = page.locator("#f-active");
  const before = await btn.boundingBox();
  await btn.click();                                   // filter on -> chip appears
  await expect(page.locator("#filteractive")).toBeVisible();
  const after = await btn.boundingBox();
  expect(after.x).toBe(before.x);                      // buttons stay put
  // chip renders before the "filters" label in the header flow
  const chipBox = await page.locator("#filteractive").boundingBox();
  expect(chipBox.x).toBeLessThan(after.x);
  await page.locator("#f-clear").click();
});

test("running / stopped / clear filters change the visible agent cards", async ({ page }) => {
  const cards = page.locator('#tab-overview .agent-card');
  await expect(cards).toHaveCount(2); // alpha + empty

  await page.locator("#f-active").click();   // only running -> alpha
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("alpha");

  await page.locator("#f-clear").click();    // reset
  await expect(cards).toHaveCount(2);

  await page.locator("#f-stopped").click();  // only not-running -> empty
  await expect(cards).toHaveCount(1);

  await page.locator("#f-clear").click();
  await expect(cards).toHaveCount(2);
});

test("agents dropdown filters the dashboard to one agent", async ({ page }) => {
  await page.locator("#agentdd-btn").click();
  const panel = page.locator("#agentdd-panel");
  await expect(panel).toBeVisible();

  await panel.locator('[data-agent="alpha"]').click();
  await expect(page.locator("#agentdd-btn")).toContainText("alpha");

  const cards = page.locator('#tab-overview .agent-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("alpha");
});

test("press interaction collapses a button's offset shadow (:active)", async ({ page }) => {
  const btn = page.locator("#f-active");
  await page.mouse.move(0, 0);
  await btn.hover();
  // hold the button down and read its computed shadow while active
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const shadowActive = await btn.evaluate(el => getComputedStyle(el).boxShadow);
  await page.mouse.up();
  expect(shadowActive === "none" || /0px 0px/.test(shadowActive)).toBeTruthy();
});

test("live feed dot is present and pulsing", async ({ page }) => {
  const dot = page.locator("#livedot");
  await expect(dot).toBeVisible();
  const anim = await dot.evaluate(el => getComputedStyle(el).animationName);
  expect(anim).toBe("pulse");
});
