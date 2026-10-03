/**
 * capture.mjs — screenshot the *preview* page across the same views at the same viewport the fidelity
 * montage compares, so `harness/fidelity/montage.mjs` can build a preview-vs-prototype montage with no
 * instance anywhere.
 *
 * The preview (`harness/preview/run.mjs`) serves `ui/app.js` through the host's own activation path. This
 * captures it exactly like `harness/fidelity/capture-current.mjs` captures a served UI — same five views
 * (`overview`, `topics`, `people`, `repositories`, `progress`), same 1440x900 clip, same scratch-then-move
 * discipline — but against `http://127.0.0.1:<port>/preview.html`, with no login and no credentials.
 *
 * It fails closed: nothing is written unless the page mounted and every view rendered its own container.
 * It also hashes the built bundle it captured, because a preview screenshot is only meaningful next to the
 * bundle it shows (see the montage caption).
 *
 *   bun harness/preview/capture.mjs                          # expects the preview on :3010
 *   bun harness/preview/capture.mjs --url http://127.0.0.1:3011/preview.html \
 *     --viewport 1440x900 --out docs/ux-v2/fidelity/preview/current-1440x900 --full
 */
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);

const URL = (flag("url", `http://127.0.0.1:${process.env.PREVIEW_PORT ?? 3010}/preview.html`)).replace(/\/+$/, "");
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);
const OUT = flag("out", "docs/ux-v2/fidelity/preview/current-1440x900");
const FULL = has("full");
// Same order as capture-current: the landing is captured first, before any view control is pressed.
const VIEWS = ["overview", "topics", "people", "repositories", "progress"];
const PLUGIN_ROOT = 'div[data-plugin-id="research-dashboard"]';

// The durable markers each view must carry before it is captured — the attributes the acceptance pass
// reads, so a build that lost one cannot be photographed under its name.
const VIEW_MARKERS = {
  overview: [
    "[data-rd-landing]",
    '[data-rd-landing-column="topics"]',
    '[data-rd-landing-column="repositories"]',
    '[data-rd-home="current"]',
  ],
  people: ['[data-rd-view="people"]', "[data-rd-people]", '[data-rd-view-heading="people"]'],
  progress: ['[data-rd-view="progress"]', "[data-rd-progress-index]", "[data-rd-progress-detail]", '[data-rd-view-heading="progress"]'],
  repositories: ['[data-rd-view="repositories"]', "[data-rd-repositories]", '[data-rd-view-heading="repositories"]'],
  topics: ['[data-rd-view="topics"]', "[data-rd-topic-index]", "[data-rd-index-topic]", "[data-rd-detail]", '[data-rd-view-heading="topics"]'],
};

let scratchDir = null;
const refuse = (why) => {
  if (scratchDir !== null) rmSync(scratchDir, { force: true, recursive: true });
  console.error(`preview-capture: REFUSED — ${why}`);
  console.error(`preview-capture: nothing was written; ${OUT} is untouched`);
  process.exit(3);
};

// Prove the preview is answering before opening a browser — a wrong port reads as "the page did not mount",
// which sends the reader after the wrong fault.
const answer = await fetch(URL, { headers: { accept: "text/html" } }).catch((error) => {
  refuse(`the preview URL did not answer (${error.message}) — is \`bun run preview\` running?`);
});
if (!answer.ok) {
  refuse(`${URL} answered HTTP ${answer.status} — is \`bun run preview\` running on this port?`);
}

const bundlePath = path.join(REPO, "ui", "app.js");
const bundleBytes = existsSync(bundlePath) ? readFileSync(bundlePath) : null;
const bundle = bundleBytes
  ? {
      bytes: bundleBytes.length,
      path: path.relative(REPO, bundlePath),
      sha256: createHash("sha256").update(bundleBytes).digest("hex"),
    }
  : null;

console.log(`preview-capture: url ${URL}`);
console.log(`preview-capture: browser ${chromiumLaunchOptions().executablePath ?? "(playwright default)"}`);
if (bundle) console.log(`preview-capture: bundle ${bundle.path} — ${bundle.bytes} bytes, sha256 ${bundle.sha256}`);

const browser = await chromium.launch(chromiumLaunchOptions());
try {
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  await page.goto(URL, { waitUntil: "networkidle" }).catch(() => {});
  const mounted = await page
    .waitForSelector(`${PLUGIN_ROOT} [data-rd-landing]`, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 160));
    refuse(`the preview mounted no landing on ${URL} — body starts: ${body}`);
  }

  const scratch = `${OUT}.capture-${process.pid}`;
  mkdirSync(scratch, { recursive: true });
  scratchDir = scratch;

  const shots = [];
  for (const view of VIEWS) {
    if (view !== "overview") {
      const control = page.locator(`${PLUGIN_ROOT} [data-rd-view-option="${view}"]`);
      if ((await control.count()) === 0) {
        refuse(`no control for view ${view} — the capture would record another view under its name`);
      }
      await control.first().click();
      const switched = await page
        .waitForSelector(`${PLUGIN_ROOT} [data-rd-view="${view}"]`, { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!switched) refuse(`view ${view} never rendered its container ([data-rd-view="${view}"])`);
    } else {
      const alreadyInView = await page.locator(`${PLUGIN_ROOT} [data-rd-view]`).count();
      if (alreadyInView > 0) refuse("the overview shot would record a view that was already selected");
    }
    const markers = VIEW_MARKERS[view].map((selector) => `${PLUGIN_ROOT} ${selector}`);
    const present = await page.evaluate(
      (selectors) => selectors.map((selector) => [selector, document.querySelector(selector) !== null]),
      markers
    );
    const missing = present.filter(([, ok]) => !ok).map(([selector]) => selector);
    if (missing.length > 0) refuse(`view ${view} is missing its durable markers: ${missing.join(", ")}`);
    console.log(`preview-capture: view ${view} — markers ok (${present.length}/${markers.length})`);
    // Fonts settle a beat after mount; screenshot after the layout is stable rather than mid-swap.
    await page.waitForTimeout(300);
    const file = path.join(scratch, `${view}.png`);
    await page.screenshot({ path: file, clip: { height: VIEWPORT[1], width: VIEWPORT[0], x: 0, y: 0 } });
    shots.push(file);
    if (FULL) {
      const full = path.join(scratch, `${view}-full.png`);
      await page.screenshot({ fullPage: true, path: full });
      shots.push(full);
    }
  }

  mkdirSync(OUT, { recursive: true });
  for (const file of shots) renameSync(file, path.join(OUT, path.basename(file)));
  rmSync(scratch, { force: true, recursive: true });
  console.log(`preview-capture: wrote ${shots.length} screenshot(s) to ${OUT}`);
  console.log(
    JSON.stringify(
      { bundle, capturedAt: new Date().toISOString(), capturedViews: VIEWS, url: URL, viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}` },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
