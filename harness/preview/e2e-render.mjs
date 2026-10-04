#!/usr/bin/env bun
/**
 * e2e-render.mjs — render the plugin's real bundle against the **true post-ingest payloads** produced by
 * the host E2E (`apps/server/src/testing/evidence-e2e/run.ts`).
 *
 * It reuses the existing preview harness (`harness/preview/run.mjs`) unchanged: the same activation path,
 * the same host components and stylesheet, the same **committed** `ui/app.js`. What changes is only the
 * data channel: the payload the E2E captured live from the real action layer is mounted as the preview's
 * fixtures, so the screen shows the ingested facts (PR #69 + the commit) on the fixture Axis.
 *
 * Isolation / portability contract (why this driver is safe to run anywhere):
 *   - **No machine defaults.** The Nakama checkout must be given explicitly (`--checkout` or
 *     `NAKAMA_CHECKOUT`); there is no hardcoded home path. The payload must be given (`--payload`).
 *   - **Nothing in the plugin repo is written.** The payload is copied into a scratch workspace under the
 *     OS temp dir; the committed `harness/preview/fixtures.json` is never overwritten.
 *   - **An ephemeral port** is chosen per run, so no listener that already exists is disturbed and this
 *     driver never cleans up a listener it did not start (it stops only its own preview child).
 *   - The preview shell is the **preview**, not the served host web app: the screenshot proves the
 *     unchanged bundle renders the factual Activity on the correct Axis, and says nothing about the rest
 *     of the estate.
 *
 *   bun harness/preview/e2e-render.mjs --payload <artifact>/render-payload.json --checkout <nakama> \
 *     [--out <dir>] [--port <n>]
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "../chromium.mjs";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const die = (message) => {
  console.error(`e2e-render: ${message}`);
  process.exit(2);
};

const PAYLOAD = flag("payload", "");
if (!PAYLOAD || !existsSync(PAYLOAD)) {
  die(`--payload <file> is required and must exist (got ${PAYLOAD || "<none>"}).`);
}
// No default checkout: a hardcoded home path is the portability bug this driver must not carry.
const CHECKOUT = flag("checkout", process.env.NAKAMA_CHECKOUT || "");
if (!CHECKOUT || !existsSync(path.join(CHECKOUT, "apps", "web"))) {
  die(
    `--checkout <nakama checkout> (or NAKAMA_CHECKOUT) is required — ` +
      `no Nakama packages are published, so the preview runs inside a checkout. Got ${CHECKOUT || "<none>"}.`
  );
}

// A scratch workspace under the OS temp dir: screenshots, DOM and the mounted payload live here, never in
// the plugin repo. `--out` may override, but the default is disposable.
const OUT = path.resolve(flag("out", mkdtempSync(path.join(tmpdir(), "e2e-render-"))));
mkdirSync(OUT, { recursive: true });
const scratchFixtures = path.join(OUT, "fixtures.json");
copyFileSync(PAYLOAD, scratchFixtures);

const bundlePath = path.join(REPO, "ui", "app.js");
const bundleHash = createHash("sha256").update(readFileSync(bundlePath)).digest("hex");

/** A port the OS says is free right now; `run.mjs` then binds it with strictPort. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
const PORT = Number(flag("port", process.env.PREVIEW_PORT || "0")) || (await freePort());

const preview = spawn(
  "bun",
  [
    path.join(HERE, "run.mjs"),
    "--no-fixtures",
    "--fixtures",
    scratchFixtures,
    "--port",
    String(PORT),
    "--checkout",
    CHECKOUT,
  ],
  { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }
);
let previewLog = "";
preview.stdout.on("data", (d) => (previewLog += d.toString()));
preview.stderr.on("data", (d) => (previewLog += d.toString()));
const stopPreview = () => {
  try {
    preview.kill("SIGTERM");
  } catch {}
};

const url = `http://127.0.0.1:${PORT}/preview.html`;

/**
 * Readiness, not a blanket 200: the preview is ready only when it serves **our** shell with our root
 * element. A bare `fetch().ok` would accept any process answering on the port.
 */
async function waitForShell() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok && (await r.text()).includes('id="root"')) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const report = {
  surface: "preview-shell",
  servedHost: false,
  checkout: CHECKOUT,
  port: PORT,
  payload: PAYLOAD,
  bundleHash,
  checks: [],
  ok: false,
};
function check(name, ok, detail) {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

try {
  if (!(await waitForShell())) {
    throw new Error(`preview shell did not serve ${url}\n${previewLog}`);
  }

  // Verify the bytes the dev server actually hands the browser are the committed bundle: vite serves a
  // file with no imports under `/@fs/<abs>`, so hash what is served (sourcemap comment stripped).
  try {
    const served = await fetch(`http://127.0.0.1:${PORT}/@fs${bundlePath}`);
    const body = served.ok ? await served.text() : "";
    const stripped = body.replace(/\/\/# sourceMappingURL=.*$/m, "").trimEnd() + "\n";
    const servedHash = createHash("sha256").update(stripped).digest("hex");
    const rawHash = createHash("sha256").update(body).digest("hex");
    report.servedBundleHash = servedHash;
    check("R-render served bundle bytes match the committed ui/app.js hash", servedHash === bundleHash || rawHash === bundleHash, {
      status: served.status,
      servedHash: servedHash.slice(0, 16) + "…",
      rawHash: rawHash.slice(0, 16) + "…",
      bundleHash: bundleHash.slice(0, 16) + "…",
    });
  } catch (error) {
    check("R-render served bundle bytes match the committed ui/app.js hash", false, String(error).slice(0, 160));
  }

  const browser = await chromium.launch(chromiumLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Populated-DOM readiness: fail loudly rather than swallowing a timeout and asserting on an empty page.
    await page.waitForSelector('div[data-plugin-id="research-dashboard"]', { timeout: 60_000 });
    await page.waitForFunction(
      () => document.body.innerText.includes("Evidence automation fixture"),
      null,
      { timeout: 30_000 }
    );

    const text = await page.evaluate(() => document.body.innerText);
    writeFileSync(path.join(OUT, "overview-dom.txt"), `${text}\n`);
    await page.screenshot({ path: path.join(OUT, "overview.png"), fullPage: true });

    check("R-render fixture topic present in the overview", text.includes("Evidence automation fixture"));
    check("R-render fixture axis present in the overview", text.includes("Collector ingest"));

    // Open the topic detail: the Axis-scoped view is where the two ingested facts must appear.
    const opener = page.getByText("Open topic", { exact: false }).first();
    await opener.click({ timeout: 10_000 });
    await page.waitForFunction(
      () => /PR #69/.test(document.body.innerText) && /62ff1e52878a/.test(document.body.innerText),
      null,
      { timeout: 30_000 }
    );
    const detailText = await page.evaluate(() => document.body.innerText);
    writeFileSync(path.join(OUT, "topic-detail-dom.txt"), `${detailText}\n`);
    await page.screenshot({ path: path.join(OUT, "topic-detail.png"), fullPage: true });

    // Axis-scoped assertions: the detail view is the fixture Axis, and both facts are its Activity lines.
    check("R-render axis view is the fixture Axis (Collector ingest)", detailText.includes("Collector ingest"));
    check("R-render PR #69 activity line on the fixture Axis", detailText.includes("PR #69"));
    check("R-render commit activity line on the fixture Axis", detailText.includes("62ff1e52878a"));

    report.ok = report.checks.every((c) => c.ok);
  } finally {
    await browser.close();
  }
} catch (error) {
  check("R-render ran", false, String(error).slice(0, 400));
} finally {
  stopPreview();
  if (report.checks.length === 0) report.checks.push({ name: "R-render ran", ok: false, detail: "no checks ran" });
  writeFileSync(path.join(OUT, "render-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`e2e-render: wrote ${OUT} (bundle ${bundleHash.slice(0, 16)}…)`);
  process.exit(report.ok ? 0 : 1);
}
