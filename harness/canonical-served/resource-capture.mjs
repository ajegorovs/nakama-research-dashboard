#!/usr/bin/env bun
/**
 * resource-capture.mjs — §3.3: capture and classify failed resource loads, read-only, so a `403` can be
 * told apart as a **harmless host asset** vs a **plugin blocker**.
 *
 * Why: a `403` on a resource load had not been captured with enough detail to tell an unrelated host asset
 * from something the plugin actually needs. This harness registers the same read-only listeners the races
 * harness uses (`page.on("response")`, `page.on("requestfailed")`), plus a CDP `Network` session so each
 * failed resource carries its **initiator** (chain type + the URL that requested it), its **status**, its
 * **resource type** and its **failedURL**.
 *
 * Design rules (from the plan §3.3):
 *   - **Boot/nav pagination is permitted:** the page's own `get_overview` / `get_topic` / `list_activity`
 *     reads (at any offset) are expected — they answer 2xx and are never flagged. Only non-2xx / failed
 *     resources are recorded.
 *   - **No double-load false positive:** the dev React StrictMode double-invoke is two 2xx responses, so
 *     it is never a fault (we record failures, not request counts).
 *   - **Classification:** a record whose path is the plugin's own bundle (`/v1/plugins/ui/…`), one of its
 *     action endpoints (`/actions/…`), or the official-plugin API (`/v1/plugins/official/…`) is a
 *     **plugin-blocker**; anything else (favicon, an unrelated host asset, analytics, fonts) is
 *     **harmless-host**. A plugin blocker is a finding; a harmless-host 403 is labelled noise.
 *   - **Positive + mutant/negative:** a normal run records nothing material (the logger is not always
 *     "clean by construction"); a mutant run deliberately fails one plugin resource and one host asset,
 *     and the classifier must label each correctly.
 *   - Logging is **read-only**; nothing is written to the instance.
 *
 * Exit 0 only when the positive run records nothing material AND the mutant run classifies both a
 * plugin-blocker and a harmless-host; exit 1 on a mismatch; exit 2 on a setup fault. Credentials from env.
 */
import { existsSync, readdirSync } from "node:fs";

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const cachedChromium = () => {
  const root = `${process.env.HOME}/.cache/ms-playwright`;
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort((a, b) => Number(b.split("-")[1] ?? 0) - Number(a.split("-")[1] ?? 0)))
    for (const rel of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(`${root}/${build}/${rel}`)) return `${root}/${build}/${rel}`;
  return null;
};
const EXECUTABLE = process.env.PLAYWRIGHT_CHROMIUM ?? cachedChromium();
if (!EXECUTABLE) { console.error("resource-capture: no chromium"); process.exit(2); }
const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:4451").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const VIEWPORT = (process.env.NAKAMA_VIEWPORT ?? "1440x900").split("x").map(Number);
const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Classify a failed resource: the plugin's own surface is a blocker; anything else is host noise. */
const classify = (url) => {
  const u = url.split("?")[0];
  if (/\/v1\/plugins\/ui\//.test(u)) return "plugin-blocker";
  if (/\/actions\//.test(u)) return "plugin-blocker";
  if (/\/v1\/plugins\/official\//.test(u)) return "plugin-blocker";
  if (new RegExp(`/v1/plugins/${PLUGIN_ID}/`).test(u)) return "plugin-blocker";
  return "harmless-host";
};

async function runPass({ failPlugin = false, failHost = false, label }) {
  const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const meta = new Map();
  cdp.on("Network.requestWillBeSent", (e) => meta.set(e.requestId, { url: e.request.url, type: e.type, initiator: e.initiator, status: null, failed: false, errorText: null }));
  cdp.on("Network.responseReceived", (e) => { const m = meta.get(e.requestId); if (m) { m.status = e.response.status; m.mime = e.response.mimeType; } });
  cdp.on("Network.loadingFailed", (e) => { const m = meta.get(e.requestId); if (m) { m.failed = true; m.errorText = e.errorText; } });

  if (failPlugin || failHost) {
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (failPlugin && /\/actions\/list_activity/.test(url)) {
        return route.fulfill({ status: 403, contentType: "application/json", body: "{}" });
      }
      if (failHost && /__capture_host_probe\.js/.test(url)) {
        return route.fulfill({ status: 403, contentType: "text/plain", body: "" });
      }
      return route.continue();
    });
  }

  await page.goto(DASHBOARD, { waitUntil: "domcontentloaded" });
  const status = await page.evaluate(async ([e, p]) => (await fetch("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }), credentials: "include" })).status, [EMAIL, PASSWORD]);
  if (status !== 200) { await browser.close(); throw new Error(`login failed (${status})`); }
  await page.goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" });
  try {
    await page.waitForSelector('div[data-plugin-id] [data-rd-view-option="progress"]', { timeout: 20000 });
    await page.locator('div[data-plugin-id] [data-rd-view-option="progress"]').first().click();
    await page.waitForSelector("div[data-plugin-id] [data-rd-index-axis]", { timeout: 15000 }).catch(() => {});
    await page.locator("div[data-plugin-id] [data-rd-index-axis]").first().click({ timeout: 5000 }).catch(() => {});
    await sleep(400);
    await page.locator('div[data-plugin-id] [data-rd-view-option="topics"]').first().click().catch(() => {});
    await sleep(400);
    await page.locator('div[data-plugin-id] [data-rd-view-option="people"]').first().click().catch(() => {});
    await sleep(400);
    // The harness-injected host asset: a route the plugin does not need (harmless-host class).
    if (failHost) await page.evaluate(() => { const s = document.createElement("script"); s.src = "/__capture_host_probe.js"; document.head.appendChild(s); }).catch(() => {});
    await sleep(800);
  } catch (e) {
    await browser.close();
    throw new Error(`setup fault during ${label}: ${e.message}`);
  }
  await browser.close();

  const failures = [];
  for (const m of meta.values()) {
    const bad = m.failed || (typeof m.status === "number" && m.status >= 400);
    if (!bad) continue;
    // The harness's own favicon/login noise from the host shell is not the plugin's concern but is still
    // classified honestly (harmless-host) rather than dropped.
    failures.push({
      failedURL: m.url.split("?")[0],
      initiator: m.initiator ? { type: m.initiator.type ?? null, url: m.initiator.url ?? null } : null,
      status: m.status,
      resourceType: m.type,
      errorText: m.errorText,
      class: classify(m.url),
    });
  }
  // de-dup identical records (StrictMode double-invoke of the same failed URL).
  const seen = new Set();
  const unique = failures.filter((f) => { const k = `${f.failedURL}|${f.status}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { label, failures: unique };
}

const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); };

let positive, mutant;
try {
  positive = await runPass({ label: "positive" });
  mutant = await runPass({ failPlugin: true, failHost: true, label: "mutant" });
} catch (e) {
  console.error(`resource-capture: setup fault — ${e.message}`);
  process.exit(2);
}

const posPlugin = positive.failures.filter((f) => f.class === "plugin-blocker");
const mutPlugin = mutant.failures.filter((f) => f.class === "plugin-blocker");
const mutHost = mutant.failures.filter((f) => f.class === "harmless-host");
const mutAction = mutant.failures.filter((f) => /list_activity/.test(f.failedURL));

check("positive: a healthy run records no plugin-blocker (the logger can be clean)", posPlugin.length === 0, `pluginBlockers=${JSON.stringify(posPlugin)}`);
check("mutant: a deliberately failed plugin resource is captured", mutPlugin.length > 0, `pluginBlockers=${JSON.stringify(mutPlugin.map((f) => ({ url: f.failedURL, status: f.status, class: f.class })))}`);
check("mutant: the plugin action 403 is classified plugin-blocker", mutAction.length > 0 && mutAction.every((f) => f.class === "plugin-blocker"), `list_activity=${JSON.stringify(mutAction.map((f) => ({ status: f.status, class: f.class })))}`);
check("mutant: a deliberately failed host asset is captured and classified harmless-host (labelled, not ignored)", mutHost.length > 0, `harmlessHost=${JSON.stringify(mutHost.map((f) => ({ url: f.failedURL, status: f.status })))}`);
check("every captured failure carries failedURL + initiator + status + resource type", [...positive.failures, ...mutant.failures].every((f) => f.failedURL && f.status !== null && f.resourceType && "initiator" in f), `records=${positive.failures.length + mutant.failures.length}`);

const fails = checks.filter((c) => !c.ok);
console.log(JSON.stringify({ viewport: `${VIEWPORT[0]}x${VIEWPORT[1]}`, positive: positive.failures, mutant: mutant.failures, checks }, null, 2));
console.log(fails.length === 0 ? "resource-capture: PASS" : `resource-capture: FAIL (${fails.length})`);
process.exit(fails.length === 0 ? 0 : 1);
