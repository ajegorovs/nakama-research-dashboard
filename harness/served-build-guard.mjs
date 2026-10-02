/**
 * served-build-guard.mjs — the precondition for trusting an acceptance or visual run.
 *
 *   node harness/served-build-guard.mjs            # exit 0 only if the instance serves this build
 *
 * Why this exists: the served dev version string is derived from the commit, so it identifies no build at
 * all — three different bundles were served as `0.2.0+dev.ae3049008d5f`. Worse, `install-plugin.mjs
 * --reinstall` without the vendor step bumps the *revision* while serving the previous bytes, because the
 * server bundles the plugin from `<nakama-checkout>/packages/plugins/<id>`, not from this repo. Both of
 * those failure modes look like success from the outside.
 *
 * So: log in, take the UI asset the browser actually fetches, and compare its sha256 against this repo's
 * own build output. A mismatch means the instance is serving something else — the run would be measuring
 * the wrong build, and this exits 1 before anything is recorded.
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const BUILD = path.resolve(
  REPO,
  process.env.NAKAMA_BUILD_FILE ?? path.join("ui", "app.js")
);

const DASHBOARD = (process.env.NAKAMA_DASHBOARD ?? "http://127.0.0.1:3003").replace(/\/+$/, "");
const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";

const fail = (message) => {
  console.error(`served-build-guard: ${message}`);
  process.exit(1);
};

if (!EMAIL || !PASSWORD) {
  console.error("served-build-guard: no credentials — set NAKAMA_EMAIL / NAKAMA_PASSWORD");
  process.exit(2);
}
if (!existsSync(BUILD)) {
  console.error(`served-build-guard: no build at ${BUILD} — run 'bun run build' first`);
  process.exit(2);
}
const repoSha = createHash("sha256").update(readFileSync(BUILD)).digest("hex");

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${DASHBOARD}/`, { waitUntil: "domcontentloaded" });
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
  if (login !== 200) fail(`login failed (HTTP ${login})`);

  await page
    .goto(`${DASHBOARD}/plugins/${PLUGIN_ID}`, { waitUntil: "networkidle" })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const served = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((name) => name.includes("/v1/plugins/ui/"));
    if (!url) return null;
    const text = await (await fetch(url, { credentials: "include" })).text();
    return { url, text };
  });
  if (served === null) fail("the page never fetched a plugin UI asset — is the plugin enabled on this instance?");

  const servedSha = createHash("sha256").update(served.text).digest("hex");
  const revision = new URL(served.url).searchParams.get("revision") ?? "?";
  const version = new URL(served.url).searchParams.get("version") ?? "?";

  if (servedSha !== repoSha) {
    console.error("served-build-guard: THE INSTANCE IS NOT SERVING THIS BUILD");
    console.error(`  served      ${servedSha}  (${served.text.length} bytes, revision ${revision}, ${version})`);
    console.error(`  this repo   ${repoSha}  (${readFileSync(BUILD).length} bytes, ui/app.js)`);
    console.error("  the refresh loop is rebuild -> vendor -> reinstall; a reinstall alone bumps the");
    console.error("  revision while still serving the previous bytes.");
    process.exit(1);
  }

  console.log(`served-build-guard: OK — the instance serves this build (revision ${revision}, ${version})`);
  console.log(`  served asset sha256 ${servedSha}`);
  process.exit(0);
} finally {
  await browser.close();
}
