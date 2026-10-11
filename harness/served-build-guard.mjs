/**
 * served-build-guard.mjs — the precondition for trusting an acceptance or visual run.
 *
 *   NAKAMA_DASHBOARD=<web origin> node harness/served-build-guard.mjs   # exit 0 only if the instance serves this build
 *   NAKAMA_DASHBOARD=<web origin> bun  harness/served-build-guard.mjs
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
 *
 * Target selection is **explicit and has no default.** `NAKAMA_DASHBOARD` must name the exact origin the
 * browser loads the dashboard from (the asset at `/v1/plugins/ui/…` is fetched from that origin). The API
 * origin answers a page route with "Authentication required", so pointing the guard at it yields "the page
 * never fetched a plugin UI asset" — which reads like a disabled plugin or a digest failure rather than the
 * wrong target it is. A missing value is refused (exit 2), never silently pointed at a guess. A *unified*
 * origin — one process serving both the web surface and the API — is legitimate and is accepted like any
 * other; only absence is refused.
 *
 * The digest is taken from the asset's **raw response bytes** (`arrayBuffer()`), never from `text().length`
 * (a character count, which is not the byte length for a non-ASCII bundle).
 */
import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

/**
 * Resolve the dashboard (web) origin from an environment value. Pure and exported so the refusal is unit
 * tested without a browser: an absent or blank value is refused, and any present value is accepted with its
 * trailing slashes stripped. A unified origin equal to the API origin is not special-cased — it is a real
 * target, not an error.
 *
 * @param {string|undefined} rawValue the `NAKAMA_DASHBOARD` value
 * @returns {{ok: true, origin: string} | {ok: false, message: string}}
 */
export function resolveDashboardOrigin(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (value === "") {
    return {
      ok: false,
      message:
        "NAKAMA_DASHBOARD is required — set it to the exact web origin the browser loads the dashboard " +
        "from (e.g. http://127.0.0.1:3003). There is no default; the API origin is not the target.",
    };
  }
  return { ok: true, origin: value.replace(/\/+$/, "") };
}

const IS_MAIN =
  import.meta.main ??
  (process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false);

if (IS_MAIN) {
  const BUILD = path.resolve(
    REPO,
    process.env.NAKAMA_BUILD_FILE ?? path.join("ui", "app.js")
  );
  const origin = resolveDashboardOrigin(process.env.NAKAMA_DASHBOARD);
  const PLUGIN_ID = process.env.NAKAMA_PLUGIN_ID ?? "research-dashboard";
  const EMAIL = process.env.NAKAMA_DEV_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
  const PASSWORD = process.env.NAKAMA_DEV_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";

  const fail = (message) => {
    console.error(`served-build-guard: ${message}`);
    process.exit(1);
  };

  if (!origin.ok) {
    console.error(`served-build-guard: ${origin.message}`);
    process.exit(2);
  }
  const DASHBOARD = origin.origin;
  if (!EMAIL || !PASSWORD) {
    console.error("served-build-guard: no credentials — set NAKAMA_EMAIL / NAKAMA_PASSWORD");
    process.exit(2);
  }
  if (!existsSync(BUILD)) {
    console.error(`served-build-guard: no build at ${BUILD} — run 'bun run build' first`);
    process.exit(2);
  }
  const buildBytes = readFileSync(BUILD);
  const repoSha = createHash("sha256").update(buildBytes).digest("hex");

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

    // Hash the asset's raw bytes: base64 is returned to Node (btoa in-page) so the digest is over exactly
    // the bytes the browser received, not a character count.
    const served = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .find((name) => name.includes("/v1/plugins/ui/"));
      if (!url) return null;
      const buffer = await (await fetch(url, { credentials: "include" })).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { url, base64: btoa(binary), bytes: bytes.length };
    });
    if (served === null) fail("the page never fetched a plugin UI asset — is the plugin enabled on this instance?");

    const servedSha = createHash("sha256").update(Buffer.from(served.base64, "base64")).digest("hex");
    const revision = new URL(served.url).searchParams.get("revision") ?? "?";
    const version = new URL(served.url).searchParams.get("version") ?? "?";

    if (servedSha !== repoSha) {
      console.error("served-build-guard: THE INSTANCE IS NOT SERVING THIS BUILD");
      console.error(`  served      ${servedSha}  (${served.bytes} bytes, revision ${revision}, ${version})`);
      console.error(`  this repo   ${repoSha}  (${buildBytes.length} bytes, ui/app.js)`);
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
}
