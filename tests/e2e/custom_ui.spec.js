// custom_ui_test — custom interaction + style-consistency checks.
// Fixture: 2 agents — "alpha" (gateway running) and "empty" (unknown -> counts
// as stopped). Each tab renders a panel per agent with an .agentname heading,
// so filtering is observable on every tab.
const { test, expect } = require("@playwright/test");

const TABS = ["overview", "agents", "profiles", "schedule", "tasks", "sessions", "logs"];
const FILTER_BTNS = ["#f-active", "#f-stopped", "#f-clear"];

const alpha = (page, tab) => page.locator(`#tab-${tab} .agentname`, { hasText: "alpha" });
const empty = (page, tab) => page.locator(`#tab-${tab} .agentname`, { hasText: "empty" });

async function readStyle(locator, props) {
  return locator.evaluate((el, p) => {
    const cs = getComputedStyle(el);
    const o = {};
    p.forEach(k => (o[k] = cs[k]));
    return o;
  }, props);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".kpi").first()).toBeVisible();
});

test('custom_ui_test — "running"/"stopped"/"clear" filters work on every tab', async ({ page }) => {
  for (const tab of TABS) {
    await page.locator(`.tabbtn[data-tab="${tab}"]`).click();

    // running -> only alpha
    await page.locator("#f-active").click();
    await expect(empty(page, tab)).toHaveCount(0);
    await expect(alpha(page, tab).first()).toBeVisible();

    // clear -> both
    await page.locator("#f-clear").click();
    await expect(alpha(page, tab).first()).toBeVisible();
    await expect(empty(page, tab).first()).toBeVisible();

    // stopped -> only empty
    await page.locator("#f-stopped").click();
    await expect(alpha(page, tab)).toHaveCount(0);
    await expect(empty(page, tab).first()).toBeVisible();

    await page.locator("#f-clear").click();
  }
});

test("custom_ui_test — agents dropdown filters every tab", async ({ page }) => {
  // pick alpha once (selection is global)
  await page.locator("#agentdd-btn").click();
  await page.locator('#agentdd-panel [data-agent="alpha"]').click();
  await expect(page.locator("#agentdd-btn")).toContainText("alpha");
  await page.locator("#agentdd-btn").click(); // close panel

  for (const tab of TABS) {
    await page.locator(`.tabbtn[data-tab="${tab}"]`).click();
    await expect(empty(page, tab)).toHaveCount(0);
    await expect(alpha(page, tab).first()).toBeVisible();
  }
});

test("custom_ui_test — filter buttons share the same base style + colors", async ({ page }) => {
  const props = ["fontFamily", "fontSize", "fontWeight", "textTransform",
    "borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderRadius", "paddingTop", "paddingLeft",
    "backgroundColor", "color"];
  const base = [];
  for (const sel of FILTER_BTNS) base.push(await readStyle(page.locator(sel), props));
  // every button identical to the first
  for (let i = 1; i < base.length; i++) expect(base[i]).toEqual(base[0]);
  // sanity: square (no radius) neo-brutalist border, real border width
  expect(base[0].borderRadius).toBe("0px");
  expect(base[0].borderTopWidth).toBe("2px");
});

test("custom_ui_test — filter buttons share the same hover effect", async ({ page }) => {
  const shadows = [];
  for (const sel of FILTER_BTNS) {
    await page.locator(sel).hover();
    await page.waitForTimeout(200); // let the box-shadow transition settle
    shadows.push(await page.locator(sel).evaluate(el => getComputedStyle(el).boxShadow));
    await page.mouse.move(0, 0); // unhover
  }
  for (const s of shadows) expect(s).not.toBe("none"); // hover adds an offset shadow
  for (let i = 1; i < shadows.length; i++) expect(shadows[i]).toBe(shadows[0]);
});

test("custom_ui_test — filter buttons share the same press effect", async ({ page }) => {
  const states = [];
  for (const sel of FILTER_BTNS) {
    const btn = page.locator(sel);
    const box = await btn.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150); // let the :active transition settle
    states.push({
      shadow: await btn.evaluate(el => getComputedStyle(el).boxShadow),
      transform: await btn.evaluate(el => getComputedStyle(el).transform),
    });
    await page.mouse.up();
  }
  for (const st of states) {
    // pressed: shadow collapses, button nudges by (3px,3px)
    expect(st.shadow === "none" || /0px 0px 0px/.test(st.shadow)).toBeTruthy();
    expect(st.transform).toBe("matrix(1, 0, 0, 1, 3, 3)");
  }
  for (let i = 1; i < states.length; i++) expect(states[i]).toEqual(states[0]);
});
