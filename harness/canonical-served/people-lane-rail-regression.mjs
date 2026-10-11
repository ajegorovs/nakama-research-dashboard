#!/usr/bin/env bun
/**
 * people-lane-rail-regression.mjs — the bounded negative-control regression for the People inner split.
 *
 * The product's own rule (`src/ui.tsx`, the `.rd-detail-grid` comment; asserted by `harness/verify-page.mjs`
 * check "C2: the person detail is an inner split … lane materially wider") is that the person lane is at
 * least 1.25x its rail, at BOTH reference viewports. At 1280 the panel is ~500px; the old absolute floor
 * `minmax(250px, 0.6fr)` forced the rail to 250px and the lane to ~244px — a real 0.98x. The corrected rule
 * caps the floor proportionally (`minmax(min(250px, 37.5%), 0.6fr)`) — the value that ships in `src/ui.tsx`
 * and that the served canonical C2 check measured (lane 304.25 / rail 189.75 = 1.60x at 1280).
 *
 * This harness proves BOTH directions against a served instance, in one browser, at native pixels:
 *   - AFTER  (the served bundle): the rule HOLDS at 1440x900 and 1280x800.
 *   - BEFORE (the old rule re-injected as CSS, a mutant of exactly the changed declaration): the SAME
 *     measure FAILS at 1280x800 — so a green run here can go red, and the fix is what makes it pass.
 *
 * It is a served measurement (a real browser against a served instance), never a preview. It measures the
 * same two elements and the same inequality the canonical pass measures.
 *
 *   NAKAMA_DASHBOARD=http://127.0.0.1:4451 NAKAMA_DEV_EMAIL=… NAKAMA_DEV_PASSWORD=… \
 *     bun harness/canonical-served/people-lane-rail-regression.mjs
 *
 * Credentials are read from the environment and never printed.
 */
import { existsSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  const builds = readdirSync(root)
    .filter((name) => name.startsWith("chromium-"))
    .sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0));
  for (const build of builds) {
    for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      if (existsSync(`${root}/${build}/${relative}`)) return `${root}/${build}/${relative}`;
    }
  }
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) {
  console.error("people-lane-rail-regression: no chromium (set PLAYWRIGHT_CHROMIUM)");
  process.exit(2);
}
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";

// The rule under test, stated once. `CHECK` is the product's own inequality (verify-page §C2).
const CHECK = (lane, rail) =>
  lane !== null &&
  rail !== null &&
  lane.x < rail.x &&
  lane.width >= rail.width * 1.25 &&
  Math.abs(lane.y - rail.y) <= 2;

// The mutation is exactly the one declaration the fix changed: the old absolute floor.
const OLD_RULE = `.rd-detail-grid{grid-template-columns:minmax(0,1fr) minmax(250px,0.6fr)!important}`;

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(
  async ([email, password]) => {
    const r = await fetch("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    return r.status;
  },
  [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]
);
if (status !== 200) {
  console.error(`people-lane-rail-regression: login failed (status ${status})`);
  process.exit(2);
}
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="people"]', { timeout: 15000 });

const measure = async () => {
  await page.locator('[data-rd-view-option="people"]').first().click();
  await page.waitForSelector('[data-rd-person-split]', { timeout: 10000 });
  await page.waitForTimeout(250); // let the grid settle; read the settled render
  return page.evaluate(() => {
    const panel = document.querySelector("div[data-plugin-id] [data-rd-person-panel]");
    const box = (node) => {
      const r = node?.getBoundingClientRect();
      return r ? { height: +r.height.toFixed(1), width: +r.width.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1) } : null;
    };
    const split = document.querySelector("div[data-plugin-id] [data-rd-person-split]");
    return {
      containerWidth: split ? +split.getBoundingClientRect().width.toFixed(1) : null,
      lane: box(panel?.querySelector("[data-rd-person-lane]")),
      rail: box(panel?.querySelector("[data-rd-person-rail]")),
    };
  });
};

const RATIO = (lane, rail) => (lane && rail && rail.width ? +(lane.width / rail.width).toFixed(3) : null);

const results = {};
let ok = true;
for (const vp of [
  { height: 900, label: "1440x900", width: 1440 },
  { height: 800, label: "1280x800", width: 1280 },
]) {
  await page.setViewportSize({ height: vp.height, width: vp.width });

  // AFTER: the served (corrected) bundle.
  await page.evaluate((css) => {
    document.getElementById("__oldrule")?.remove();
    return css;
  }, "");
  const after = await measure();

  // BEFORE: re-inject the old absolute floor over the served rule and re-measure the same elements.
  await page.evaluate((css) => {
    const el = document.createElement("style");
    el.id = "__oldrule";
    el.textContent = css;
    document.head.appendChild(el);
  }, OLD_RULE);
  const before = await measure();
  await page.evaluate(() => document.getElementById("__oldrule")?.remove());

  const afterPass = CHECK(after.lane, after.rail);
  const beforePass = CHECK(before.lane, before.rail);
  // The regression's own expectation: corrected passes at both widths; the old geometry fails at 1280 and
  // passes at 1440 (which is exactly why the report called 1280 a real, single failure).
  const expectAfter = true;
  const expectBefore = vp.label === "1280x800" ? false : true;
  const stepOk = afterPass === expectAfter && beforePass === expectBefore;
  if (!stepOk) ok = false;
  results[vp.label] = {
    after: { ...after, hasMore: undefined, pass: afterPass, ratio: RATIO(after.lane, after.rail) },
    before: { ...before, hasMore: undefined, pass: beforePass, ratio: RATIO(before.lane, before.rail) },
    expected: { after: expectAfter, before: expectBefore },
    ok: stepOk,
  };
}

await browser.close();
console.log(JSON.stringify({ check: "lane >= 1.25 * rail, lane left of rail, tops aligned", results }, null, 2));
console.log(ok ? "people-lane-rail-regression: PASS — corrected geometry holds; the old floor fails at 1280" : "people-lane-rail-regression: FAIL");
process.exit(ok ? 0 : 1);
