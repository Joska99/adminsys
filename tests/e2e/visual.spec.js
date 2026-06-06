// Visual / layout tests — computed styles + geometry that only a real browser
// (with CSS applied) can verify. Tokens: green #1FA84E = rgb(31,168,78),
// pink #C42A86 = rgb(196,42,134), red #E2231A = rgb(226,35,26).
const { test, expect } = require("@playwright/test");

const GREEN = "31, 168, 78";
const PINK = "rgb(196, 42, 134)";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".kpi").first()).toBeVisible();
});

test("KPI row shows 7 boxes in the top grid", async ({ page }) => {
  await expect(page.locator(".topgrid .kpi")).toHaveCount(7);
});

test("only the clickable KPI boxes carry the link badge", async ({ page }) => {
  // 4 clickable boxes: agents, profiles, total sessions, total crons (failed crons is not a button)
  await expect(page.locator(".kpi.clickable")).toHaveCount(4);
  await expect(page.locator(".kpi.clickable .kpi-link")).toHaveCount(4);
  // non-clickable boxes have no link badge
  await expect(page.locator(".kpi:not(.clickable) .kpi-link")).toHaveCount(0);
});

test("profiles KPI number uses the pink accent", async ({ page }) => {
  const num = page.locator(".kpi", { hasText: "profiles" }).first().locator(".kpi-num");
  await expect(num).toHaveCSS("color", PINK);
});

test("running agent card carries a green health shadow", async ({ page }) => {
  const card = page.locator('#tab-overview .agent-card',
    { hasText: "alpha" });
  await expect(card).toHaveClass(/h-ok/);
  const shadow = await card.evaluate(el => getComputedStyle(el).boxShadow);
  expect(shadow).toContain(GREEN);   // 6px 6px 0 var(--green)
});

test("the card 'main' badge is styled with the pink profile color", async ({ page }) => {
  const badge = page.locator('#tab-overview .agent-card',
    { hasText: "alpha" }).locator(".profile-tag").first();
  await expect(badge).toHaveText(/main/i);
  await expect(badge).toHaveCSS("color", PINK);
});

test("sidebar sits to the left of the content (flex layout)", async ({ page }) => {
  const sb = await page.locator(".sidebar").boundingBox();
  const ct = await page.locator(".content").boundingBox();
  expect(sb.x).toBeLessThan(ct.x);
  expect(sb.x).toBeLessThanOrEqual(2);   // flush to the left edge
});

test("panels render a hard offset shadow (neo-brutalist, not blurred)", async ({ page }) => {
  const card = page.locator('#tab-overview .agent-card').first();
  const shadow = await card.evaluate(el => getComputedStyle(el).boxShadow);
  // hard shadow => blur radius is 0px (format: "rgb(...) Xpx Ypx 0px 0px")
  expect(shadow).toMatch(/\b6px 6px 0px\b/);
});

test("clicking a stopped/unknown agent shows a non-green shadow", async ({ page }) => {
  // the "empty" agent has no gateway -> unknown state -> h-warn (yellow), not green
  const card = page.locator('#tab-overview .agent-card',
    { hasText: "empty" });
  await expect(card).not.toHaveClass(/h-ok/);
  const shadow = await card.evaluate(el => getComputedStyle(el).boxShadow);
  expect(shadow).not.toContain(GREEN);
});
