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

test('custom_ui_test — GLOBAL: "running"/"stopped"/"clear" filters work on every tab', async ({ page }) => {
  // heaviest test: 7 tabs × full filter matrix (~70 assertions). The global 15s
  // is tight for it under full-suite load — give it room so it doesn't time out.
  test.setTimeout(45000);
  const fActive = page.locator("#f-active");
  const fStopped = page.locator("#f-stopped");
  const fClear = page.locator("#f-clear");

  for (const tab of TABS) {
    await page.locator(`.tabbtn[data-tab="${tab}"]`).click();
    // wait for the tab to actually be the active section before filtering
    await expect(page.locator(`#tab-${tab}`)).toHaveClass(/\bactive\b/);

    // running -> only alpha. Anchor on the button's .on state first: its click
    // handler toggles .on AND calls renderAll() synchronously, so once .on is
    // set the cards have already re-rendered — kills the click-vs-render race.
    await fActive.click();
    await expect(fActive).toHaveClass(/\bon\b/);
    await expect(empty(page, tab)).toHaveCount(0);
    await expect(alpha(page, tab).first()).toBeVisible();

    // clear -> both
    await fClear.click();
    await expect(fActive).not.toHaveClass(/\bon\b/);
    await expect(fStopped).not.toHaveClass(/\bon\b/);
    await expect(alpha(page, tab).first()).toBeVisible();
    await expect(empty(page, tab).first()).toBeVisible();

    // stopped -> only empty
    await fStopped.click();
    await expect(fStopped).toHaveClass(/\bon\b/);
    await expect(alpha(page, tab)).toHaveCount(0);
    await expect(empty(page, tab).first()).toBeVisible();

    await fClear.click();
    await expect(fStopped).not.toHaveClass(/\bon\b/);
  }
});

test("custom_ui_test — GLOBAL: agents dropdown filters every tab", async ({ page }) => {
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

test("custom_ui_test — GLOBAL: filter buttons share the same base style + colors", async ({ page }) => {
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

test("custom_ui_test — GLOBAL: filter buttons share the same hover effect", async ({ page }) => {
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

test("custom_ui_test — GLOBAL: filter buttons share the same press effect", async ({ page }) => {
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

test("custom_ui_test — OVERVIEW: KPI boxes share the same base style + colors", async ({ page }) => {
  // the per-box ACCENT (on .kpi-num / .kpi-icon) varies by design; the box
  // chrome — border, background, base offset shadow, padding — must be uniform.
  const props = ["borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderRadius", "paddingTop", "paddingLeft", "backgroundColor", "boxShadow"];
  const boxes = page.locator(".topgrid .kpi");
  const n = await boxes.count();
  expect(n).toBe(9);
  const base = [];
  for (let i = 0; i < n; i++) base.push(await readStyle(boxes.nth(i), props));
  for (let i = 1; i < n; i++) expect(base[i]).toEqual(base[0]);
  expect(base[0].borderRadius).toBe("0px");      // square neo-brutalist
  expect(base[0].boxShadow).not.toBe("none");    // hard offset base shadow
});

test("custom_ui_test — OVERVIEW: KPI boxes share the same hover effect", async ({ page }) => {
  const boxes = page.locator(".topgrid .kpi");
  const n = await boxes.count();
  const shadows = [];
  for (let i = 0; i < n; i++) {
    await boxes.nth(i).hover();
    await page.waitForTimeout(200); // let the box-shadow transition settle
    shadows.push(await boxes.nth(i).evaluate(el => getComputedStyle(el).boxShadow));
    await page.mouse.move(0, 0);    // unhover
  }
  for (const s of shadows) expect(s).not.toBe("none"); // hover adds an offset shadow
  for (let i = 1; i < n; i++) expect(shadows[i]).toBe(shadows[0]);
});

// the same shared agentCard() drives the top cards on both Overview and Agents
const CARD_TABS = ["overview", "agents"];

async function activateTab(page, tab) {
  await page.locator(`.tabbtn[data-tab="${tab}"]`).click();
  await expect(page.locator(`#tab-${tab}`)).toHaveClass(/\bactive\b/);
}

// the card shadow COLOR is the per-card health accent (green/red/yellow), exactly
// like the KPI accent on .kpi-num — strip it so we compare the shared geometry.
const stripColor = s => s.replace(/rgba?\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

test("custom_ui_test — OVERVIEW/AGENTS: agent cards share the same base style + colors", async ({ page }) => {
  const props = ["borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderRadius", "paddingTop", "paddingLeft", "backgroundColor", "boxShadow"];
  const base = [];
  for (const tab of CARD_TABS) {
    await activateTab(page, tab);
    const cards = page.locator(`#tab-${tab} .agent-card`);
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(2);   // fixture: alpha (running) + empty (unknown)
    for (let i = 0; i < n; i++) {
      const st = await readStyle(cards.nth(i), props);
      st.boxShadow = stripColor(st.boxShadow);   // ignore the health-accent color
      base.push(st);
    }
  }
  for (let i = 1; i < base.length; i++) expect(base[i]).toEqual(base[0]);
  expect(base[0].borderRadius).toBe("0px");      // square neo-brutalist
});

test("custom_ui_test — OVERVIEW/AGENTS: agent cards share the same hover effect", async ({ page }) => {
  const shadows = [];
  for (const tab of CARD_TABS) {
    await activateTab(page, tab);
    const cards = page.locator(`#tab-${tab} .agent-card`);
    const n = await cards.count();
    for (let i = 0; i < n; i++) {
      await cards.nth(i).hover();
      await page.waitForTimeout(200); // let the box-shadow transition settle
      shadows.push(stripColor(await cards.nth(i).evaluate(el => getComputedStyle(el).boxShadow)));
      await page.mouse.move(0, 0);    // unhover
    }
  }
  for (const s of shadows) expect(s).not.toBe("");  // hover shadow present
  for (let i = 1; i < shadows.length; i++) expect(shadows[i]).toBe(shadows[0]); // same geometry
});
