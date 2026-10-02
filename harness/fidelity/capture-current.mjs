/**
 * capture-current.mjs — capture the running UI for the fidelity montage, and REFUSE when it cannot
 * prove what it captured. Read-only against the instance; the only writes are the screenshots.
 *
 *   bun harness/fidelity/capture-current.mjs --env-file <env> --url http://<host>:3003 \
 *     --viewport 1440x900 --out docs/ux-v2/fidelity/current-1440x900
 *
 * Why this exists: the first capture produced four identical 9 KB images of an error page and a montage
 * built from them was very nearly presented as a review artifact. The failure was a wrong origin
 * (`{"error":"Not found"}` is the API server's answer for a page route — it serves the API only, the
 * web dev server serves the SPA), and nothing in the old path noticed: it screenshotted whichever
 * document came back, for every view, and overwrote the montage input in place.
 *
 * So the capture proves three layers before it writes a single pixel, prints each one, and fails
 * closed — the target directory is left untouched unless every layer and every view held:
 *
 *   1. the exact page URL, printed and fetched: HTTP 200 and an HTML document (the SPA shell);
 *   2. the plugin UI asset the browser actually fetched: HTTP 200 and a non-empty body, hashed —
 *      this is also where the served revision/version come from, so the caption is not a guess;
 *   3. the durable page markers the acceptance pass uses (`div[data-plugin-id]`, the view container,
 *      the index, the detail pane) — per view, before that view is captured.
 *
 * It resolves the shared credential helper itself (`harness/env-file.mjs`, or $PROBE_ENV_HELPER), so a
 * missing helper fails with a sentence rather than a TypeError from `import(undefined)`.
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

// ---- layer 0: the shared credential helper, resolved rather than assumed ----------------------
const helper = process.env.PROBE_ENV_HELPER ?? path.resolve(HERE, "..", "env-file.mjs");
if (!existsSync(helper)) {
  console.error(`capture-current: the credential helper is missing at ${helper}`);
  console.error("  pass PROBE_ENV_HELPER=<path to env-file.mjs>, or run from the plugin repo");
  process.exit(2);
}
const { loadEnvFileArg } = await import(helper);
loadEnvFileArg();

const TARGET = (flag("url", process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:3003")).replace(/\/+$/, "");
const PAGE_URL = `${TARGET}/plugins/research-dashboard`;
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);
const OUT = flag("out", null);
const VIEWS = ["topics", "people", "repositories", "progress"];
// The capture's own scratch directory, created only once every layer up to the first screenshot has
// held. `refuse` removes it, so a late failure leaves no half-capture behind.
let scratchDir = null;
// The durable markers, per view — the same attributes the acceptance pass reads. Each view's own list
// container is the first thing a half-mounted view does not have, and the topic index's detail pane is
// the composition's core claim, so it is required there too. A capture that cannot find them is a
// capture of something else, whatever it looks like.
const VIEW_MARKERS = {
  people: ["[data-rd-view=\"people\"]", "[data-rd-people]"],
  progress: ["[data-rd-view=\"progress\"]", "[data-rd-progress-index]"],
  repositories: ["[data-rd-view=\"repositories\"]", "[data-rd-repositories]"],
  topics: [
    "[data-rd-view=\"topics\"]",
    "[data-rd-topic-index]",
    "[data-rd-index-topic]",
    "[data-rd-detail]",
  ],
};
const PLUGIN_ROOT = 'div[data-plugin-id="research-dashboard"]';

const EMAIL =
  process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_SEED_ADMIN_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD =
  process.env.NAKAMA_DEV_PASSWORD ??
  process.env.NAKAMA_SEED_ADMIN_PASSWORD ??
  process.env.NAKAMA_PASSWORD ??
  "";

const refuse = (why) => {
  // Fail closed: the montage input is never touched, and the capture's own scratch directory (if this
  // run got as far as making one) goes away with it — a half-capture must not look like a capture.
  if (scratchDir !== null) {
    rmSync(scratchDir, { force: true, recursive: true });
  }
  console.error(`capture-current: REFUSED — ${why}`);
  console.error(`capture-current: nothing was written; ${OUT ?? "(no --out)"} is untouched`);
  process.exit(3);
};

// ---- layer 1: the page URL answers as a page ---------------------------------------------------
console.log(`capture-current: page url ${PAGE_URL}`);
const pageResponse = await fetch(PAGE_URL, { headers: { accept: "text/html" } }).catch((error) => {
  refuse(`the page URL did not answer at all (${error.message})`);
});
const pageText = await pageResponse.text();
console.log(`capture-current:   HTTP ${pageResponse.status}, ${pageText.length} bytes`);
const looksLikeShell = /<html/i.test(pageText) && /<div id="root"|<div id="app"/i.test(pageText);
if (!pageResponse.ok || !looksLikeShell) {
  refuse(
    `${PAGE_URL} answered ${pageResponse.status} and is ${looksLikeShell ? "" : "not "}an SPA document` +
      (pageResponse.ok ? "" : ` — body starts: ${pageText.slice(0, 80)}`)
  );
}

if (!EMAIL || !PASSWORD) {
  refuse("no credentials — set NAKAMA_EMAIL / NAKAMA_PASSWORD or pass --env-file");
}

const cachedChromium = () => {
  const root = path.join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium")) continue;
    for (const candidate of [
      path.join(root, entry, "chrome-linux", "chrome"),
      path.join(root, entry, "chrome-linux", "headless_shell"),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

const browser = await chromium.launch({ executablePath: cachedChromium() ?? undefined });
try {
  const page = await browser.newPage({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  await page.goto(`${TARGET}/`, { waitUntil: "domcontentloaded" });
  const login = await page.evaluate(
    async ([email, password]) => {
      const response = await fetch("/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });
      return response.status;
    },
    [EMAIL, PASSWORD]
  );
  if (login !== 200) {
    refuse(`login failed (HTTP ${login}) on ${TARGET}`);
  }

  await page.goto(PAGE_URL, { waitUntil: "networkidle" }).catch(() => {});
  const mounted = await page
    .waitForSelector(`${PLUGIN_ROOT} [data-rd-view="topics"]`, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!mounted) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 160));
    refuse(`the plugin page never mounted on ${PAGE_URL} — body starts: ${body}`);
  }

  // ---- layer 2: the plugin asset the browser fetched -----------------------------------------
  const asset = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => name.includes("/v1/plugins/ui/"));
    if (!url) return null;
    const response = await fetch(url, { credentials: "include" });
    const text = await response.text();
    return { status: response.status, text, url };
  });
  if (asset === null || asset.status !== 200 || asset.text.length === 0) {
    refuse(
      asset === null
        ? "the page fetched no plugin UI asset — the plugin is not mounted on this origin"
        : `the plugin asset answered HTTP ${asset.status} with ${asset.text.length} bytes`
    );
  }
  const assetUrl = new URL(asset.url);
  const served = {
    assetBytes: asset.text.length,
    // The served asset's own bytes, hashed here rather than inferred from the URL: this is what the
    // montage caption may quote, and it is comparable with the acceptance pass's guard.
    assetSha256: createHash("sha256").update(asset.text).digest("hex"),
    revision: assetUrl.searchParams.get("revision") ?? "?",
    url: asset.url,
    version: assetUrl.searchParams.get("version") ?? "?",
  };
  console.log(
    `capture-current: plugin asset ${asset.url}\ncapture-current:   HTTP 200, ${asset.text.length} bytes, ` +
      `revision ${served.revision}, ${served.version}\ncapture-current:   sha256 ${served.assetSha256}`
  );

  // ---- layer 3 + capture: markers per view, into a scratch dir -------------------------------
  const scratch = OUT ? `${OUT}.capture-${process.pid}` : null;
  if (OUT) {
    mkdirSync(scratch, { recursive: true });
    scratchDir = scratch;
  }
  const shots = [];
  for (const view of VIEWS) {
    const control = page.locator(`div[data-plugin-id] [data-rd-view-option="${view}"]`);
    if ((await control.count()) > 0) {
      await control.first().click();
      const switched = await page
        .waitForSelector(`div[data-plugin-id] [data-rd-view="${view}"]`, { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (!switched) {
        refuse(`view ${view} never rendered its container ([data-rd-view="${view}"])`);
      }
    } else if (view !== "topics") {
      refuse(`no control for view ${view} — the capture would record another view under its name`);
    }
    const markers = VIEW_MARKERS[view].map((selector) => `${PLUGIN_ROOT} ${selector}`);
    const present = await page.evaluate((selectors) => {
      return selectors.map((selector) => [selector, document.querySelector(selector) !== null]);
    }, markers);
    const missing = present.filter(([, ok]) => !ok).map(([selector]) => selector);
    if (missing.length > 0) {
      refuse(`view ${view} is missing the durable markers: ${missing.join(", ")}`);
    }
    console.log(
      `capture-current: view ${view} — markers ok (${present.length}/${markers.length})`
    );
    if (scratch) {
      const file = path.join(scratch, `${view}.png`);
      await page.screenshot({
        path: file,
        clip: { height: VIEWPORT[1], width: VIEWPORT[0], x: 0, y: 0 },
      });
      shots.push(file);
    }
  }

  // Only now, with every layer proven and every view captured, does the montage input move into
  // place. A late failure leaves the previous capture exactly where it was, visibly stale, rather
  // than half-replaced or replaced by an error page.
  if (scratch && OUT) {
    mkdirSync(OUT, { recursive: true });
    for (const file of shots) {
      renameSync(file, path.join(OUT, path.basename(file)));
    }
    rmSync(scratch, { force: true, recursive: true });
    console.log(`capture-current: wrote ${shots.length} screenshot(s) to ${OUT}`);
  }
  console.log(
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        capturedViews: VIEWS,
        pageUrl: PAGE_URL,
        served,
        viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`,
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
