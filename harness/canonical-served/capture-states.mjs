#!/usr/bin/env bun
/**
 * capture-states.mjs — served state screenshots for the six-requirement validation.
 *
 * Captures, on the isolated served instance, the states this phase must show as images (not merely text):
 *   - the four views (Projects / Progress / Repositories / People);
 *   - the BARE repository selected in the Repositories view (its `empty` notice — #60/#61);
 *   - the Projects detail with the completed/abandoned fold OPEN (the terminal axis — #11).
 *
 *   NAKAMA_VIEWPORT=1440x900 NAKAMA_SHOT_DIR=<dir> bun harness/canonical-served/capture-states.mjs
 * Read-only. Exit 2 on a fault.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("capture-states: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
const OUT = process.env.NAKAMA_SHOT_DIR ?? ".";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [process.env.NAKAMA_DEV_EMAIL ?? "", process.env.NAKAMA_DEV_PASSWORD ?? ""]);
if (status !== 200) { console.error(`capture-states: login failed (${status})`); process.exit(2); }
await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });

const shot = async (name) => { const p = `${OUT}/${name}-${VIEWPORT[0]}x${VIEWPORT[1]}.png`; await page.screenshot({ path: p }); console.log(`captured ${p}`); };
const root = page.locator('div[data-plugin-id]');
try {
  await page.waitForSelector('div[data-plugin-id] [data-rd-view-option]', { timeout: 20000 });
  for (const view of ["topics", "progress", "repositories", "people"]) {
    await page.locator(`div[data-plugin-id] [data-rd-view-option="${view}"]`).first().click();
    await sleep(700);
    await shot(`view-${view}`);
  }
  // Bare repository (Repositories view, bare repo selected → its empty notice).
  await page.locator('div[data-plugin-id] [data-rd-view-option="repositories"]').first().click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-view='repositories'] [data-rd-repository]", { timeout: 15000 });
  await sleep(400);
  const rows = page.locator("div[data-plugin-id] [data-rd-view='repositories'] [data-rd-repository]");
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const name = (await rows.nth(i).evaluate((e) => e.getAttribute("data-rd-repository"))) ?? "";
    if (name.includes("bare/empty-current")) { await rows.nth(i).click(); break; }
  }
  await page.waitForSelector("div[data-plugin-id] [data-rd-notice]", { timeout: 15000 });
  await sleep(500);
  await shot("state-bare-repo-notice");
  // Terminal fold: Projects detail, open the completed/abandoned fold.
  await page.locator('div[data-plugin-id] [data-rd-view-option="topics"]').first().click();
  await page.waitForSelector("div[data-plugin-id] [data-rd-index-topic]", { timeout: 15000 });
  await sleep(500);
  await page.locator("div[data-plugin-id] [data-rd-index-topic]").first().click();
  await page.waitForSelector("div[data-plugin-id] details[data-rd-folded-axes]", { timeout: 15000 }).catch(() => {});
  await sleep(400);
  await shot("state-terminal-fold-closed");
  await page.locator("div[data-plugin-id] details[data-rd-folded-axes] summary").first().click().catch(() => {});
  await sleep(400);
  await shot("state-terminal-fold-open");
} catch (error) {
  await browser.close();
  console.error(`capture-states: fault — ${error.message}`);
  process.exit(2);
}
await browser.close();
console.log("capture-states: done");
