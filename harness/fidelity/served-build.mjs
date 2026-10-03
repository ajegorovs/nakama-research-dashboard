/**
 * served-build.mjs — WHICH BUILD does a given service actually render? Read-only.
 * Logs in on the dashboard origin, opens the plugin page, and reports the markers that distinguish
 * pre-U6 / pre-U9 / current builds. Never prints credential values, never writes to the instance.
 *
 *   cd <plugin repo> && bun harness/fidelity/served-build.mjs \
 *     --env-file <env> --url http://<host>:3003 --viewport 1440x900 --shots <dir>
 *
 * The shared credential helper is resolved from this file's own location (`harness/env-file.mjs`, or
 * $PROBE_ENV_HELPER), the same way `capture-current.mjs` does it. It used to be `import(process.env
 * .PROBE_ENV_HELPER)` with no fallback, so the documented invocation — and the way this tool's own output
 * feeds `montage.mjs --build` — died with `Cannot find package 'undefined'`, an error that names nothing
 * about the missing helper. A missing helper now says so and exits 2.
 */
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const helper = process.env.PROBE_ENV_HELPER ?? path.resolve(HERE, "..", "env-file.mjs");
if (!existsSync(helper)) {
  console.error(`served-build: the credential helper is missing at ${helper}`);
  console.error("  pass PROBE_ENV_HELPER=<path to env-file.mjs>, or run from the plugin repo");
  process.exit(2);
}
const { loadEnvFileArg } = await import(helper);
loadEnvFileArg();
const TARGET = flag("url", "http://127.0.0.1:3007");
const VIEWPORT = (flag("viewport", "1440x900")).split("x").map(Number);
const SHOTS = flag("shots", null);
// The seeded admin is spelled NAKAMA_SEED_ADMIN_* in a compose env and NAKAMA_EMAIL/PASSWORD in an
// acceptance env; sending the wrong pair looks exactly like "not permitted".
const EMAIL =
  process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_SEED_ADMIN_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD =
  process.env.NAKAMA_DEV_PASSWORD ??
  process.env.NAKAMA_SEED_ADMIN_PASSWORD ??
  process.env.NAKAMA_PASSWORD ??
  "";

// The same shared resolver `harness/preview/capture.mjs` uses. The local probe this replaced only knew the
// older `chrome-linux/chrome` cache layout, so on a machine whose Playwright cache carries the newer
// `chrome-linux64/chrome` it found nothing and let the driver try to download its pinned revision.
const browser = await chromium.launch(chromiumLaunchOptions());
const context = await browser.newContext({ viewport: { width: VIEWPORT[0], height: VIEWPORT[1] } });
const page = await context.newPage();

const build = {};
await page.goto(`${TARGET}/`, { waitUntil: "domcontentloaded" });
build.login = await page.evaluate(
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
build.pluginInstalled = await page.evaluate(async () => {
  const response = await fetch("/v1/console/plugins", { credentials: "include" });
  if (!response.ok) return `console/plugins -> ${response.status}`;
  const body = await response.json().catch(() => null);
  const rows = body?.plugins ?? body?.data ?? body;
  if (!Array.isArray(rows)) return "unreadable";
  return rows
    .filter((row) => String(JSON.stringify(row)).includes("research-dashboard"))
    .map((row) => `${row.id ?? row.name ?? "?"} rev=${row.revision ?? "?"} v=${row.version ?? "?"}`)
    .join(" | ") || "no research-dashboard row";
});

await page.goto(`${TARGET}/plugins/research-dashboard`, { waitUntil: "networkidle" }).catch(() => {});
await page.waitForTimeout(2500);
const markers = await page.evaluate(() => {
  const scope = document.querySelector("div[data-plugin-id]");
  if (scope === null) return { mounted: false, body: document.body.innerText.slice(0, 160) };
  const feed = scope.querySelector("[data-rd-progress-feed]");
  return {
    mounted: true,
    pluginId: scope.getAttribute("data-plugin-id"),
    views: [...scope.querySelectorAll("[data-rd-view-option]")].map((el) =>
      el.getAttribute("data-rd-view-option")
    ),
    // Five peer tabs: which one the page reports active, and whether the Overview-only window selector is
    // present (it belongs to Overview's heading; the other tabs read all time and carry none).
    activeView: scope
      .querySelector('[data-rd-view-option][aria-pressed="true"]')
      ?.getAttribute("data-rd-view-option") ?? null,
    activeWindow:
      scope.querySelector('[data-rd-window][aria-pressed="true"]')?.getAttribute("data-rd-window") ?? null,
    title: (scope.querySelector(".rd-page-title")?.textContent ?? "(no .rd-page-title)").trim(),
    preU6_broadControls: /Add topic|Edit fields/i.test(scope.textContent ?? ""),
    u6_singleControl: /Read topic/i.test(scope.textContent ?? ""),
    u9_feedCap: feed?.getAttribute("data-rd-progress-feed-shown") ?? null,
    u9_feedNote: feed?.parentElement?.textContent?.match(/\d+ of \d+ shown/)?.[0] ?? null,
    tagCount: scope.querySelectorAll(".rd-tag").length,
    cardCount: scope.querySelectorAll("[data-rd-topic-card], .rd-topic-card").length,
  };
});
build.markers = markers;

if (SHOTS !== null) {
  mkdirSync(SHOTS, { recursive: true });
  // All five peer tabs, Overview included. Each is clicked through its own control and the active marker is
  // checked, so a build whose tabs do not select cannot be photographed under a tab's name.
  for (const view of ["overview", "topics", "people", "repositories", "progress"]) {
    const control = page.locator(`div[data-plugin-id] [data-rd-view-option="${view}"]`);
    if ((await control.count()) > 0) {
      await control.first().click();
      await page
        .waitForFunction(
          (wanted) =>
            document
              .querySelector('div[data-plugin-id] [data-rd-view-option][aria-pressed="true"]')
              ?.getAttribute("data-rd-view-option") === wanted,
          view,
          { timeout: 5000 }
        )
        .catch(() => console.warn(`served-build: view ${view} did not report active after click`));
      await page.waitForTimeout(900);
    }
    await page.screenshot({
      path: path.join(SHOTS, `${view}.png`),
      clip: { x: 0, y: 0, width: VIEWPORT[0], height: VIEWPORT[1] },
    });
  }
}
console.log(JSON.stringify(build, null, 2));
await browser.close();
