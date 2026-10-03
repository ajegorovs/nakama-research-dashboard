/**
 * fidelity.mjs — one command from source to a preview-vs-prototype montage.
 *
 * Starts the preview server (`run.mjs`, which builds the fixtures and serves the real bundle through the
 * host's runtime), waits for it to answer, then runs the three read-only instruments in order:
 *
 *   1. `capture.mjs`          — screenshots the preview across the five views at 1440x900;
 *   2. `render-prototypes.mjs`— renders the approved prototypes at the same viewport;
 *   3. `montage.mjs`          — builds the labelled side-by-side montages.
 *
 * Everything lands under one directory (default `docs/ux-v2/fidelity/preview/<dataset>/`), in the same
 * `prototype-1440x900/ · current-1440x900/ · side-by-side/` shape the committed `fixture/` pack uses, so the
 * corpus and fixture previews sit beside each other instead of overwriting one another. The server is stopped
 * and its generated files in the checkout are removed when this command exits.
 *
 *   bun run preview:fidelity                 # build, serve, capture, montage
 *   bun run preview:fidelity -- --dataset fixture --port 3011 --full
 *   bun run preview:fidelity -- --no-rebuild --keep
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);

const PORT = flag("port", process.env.PREVIEW_PORT ?? "3010");
const VIEWPORT = flag("viewport", "1440x900");
const DATASET = flag("dataset", "corpus");
const OUT_ROOT = flag("out", `docs/ux-v2/fidelity/preview/${DATASET}`);
const PROTOCOLS_DIR = flag("prototypes", "docs/ux-v2/contract/prototypes");
const NO_REBUILD = has("no-rebuild");
const FULL = has("full");
const CHECKOUT = flag("checkout", null);

const absOut = path.resolve(REPO, OUT_ROOT);
const CURRENT_DIR = path.join(absOut, "current-1440x900");
const PROTOTYPE_DIR = path.join(absOut, "prototype-1440x900");
const MONTAGE_DIR = path.join(absOut, "side-by-side");
const PREVIEW_URL = `http://127.0.0.1:${PORT}/preview.html`;

const step = (message) => console.log(`\npreview:fidelity ── ${message}`);
const die = (message) => {
  console.error(`preview:fidelity: ${message}`);
  process.exit(2);
};

const run = (argv, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn("bun", argv, { cwd: REPO, stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`bun ${argv.join(" ")} exited ${code}`))));
  });

// ── start the preview server, and wait until it actually answers ────────────────────────────────────
const serverArgs = [path.join(HERE, "run.mjs"), "--port", PORT, "--dataset", DATASET];
if (!NO_REBUILD) serverArgs.push("--rebuild");
if (has("keep")) serverArgs.push("--keep");
if (CHECKOUT) serverArgs.push("--checkout", CHECKOUT);

step(`starting the preview on :${PORT} (this builds fixtures, then serves)`);
const server = spawn("bun", serverArgs, { cwd: REPO, stdio: "inherit" });
let serverExited = false;
server.on("exit", (code) => {
  serverExited = true;
  if (code !== 0 && code !== null) console.error(`preview:fidelity: the preview server exited ${code}`);
});

const stopServer = () => {
  try {
    server.kill("SIGTERM"); // run.mjs removes its generated files in the checkout on SIGTERM
  } catch {}
};
process.on("exit", stopServer);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopServer();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

const deadline = Date.now() + 180_000;
let ready = false;
while (Date.now() < deadline) {
  if (serverExited) die("the preview server exited before it answered — see its output above");
  try {
    const response = await fetch(PREVIEW_URL, { headers: { accept: "text/html" } });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // not listening yet
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) die(`the preview did not answer on ${PREVIEW_URL} within 180s`);

// ── the bundle the capture will show, so the montage caption is not a guess ────────────────────────
const bundlePath = path.join(REPO, "ui", "app.js");
const note = existsSync(bundlePath)
  ? `preview · ui/app.js sha256 ${createHash("sha256").update(readFileSync(bundlePath)).digest("hex").slice(0, 12)} — no instance`
  : "preview — no instance";

try {
  step("capturing the preview (five views, 1440x900)");
  const captureArgs = [path.join(HERE, "capture.mjs"), "--url", PREVIEW_URL, "--viewport", VIEWPORT, "--out", CURRENT_DIR];
  if (FULL) captureArgs.push("--full");
  await run(captureArgs);

  step("rendering the approved prototypes at the same viewport");
  await run([
    path.join(REPO, "harness/fidelity/render-prototypes.mjs"),
    "--dir", PROTOCOLS_DIR,
    "--out", PROTOTYPE_DIR,
    "--viewport", VIEWPORT,
  ]);

  step("building the side-by-side montages");
  await run([
    path.join(REPO, "harness/fidelity/montage.mjs"),
    "--fidelity", absOut,
    "--out", MONTAGE_DIR,
    "--current-label", "PREVIEW (host runtime, no instance)",
    "--current-note", note,
  ]);
} finally {
  stopServer();
}

step("artifacts");
console.log(`  capture    ${path.relative(REPO, CURRENT_DIR)}/`);
console.log(`  prototypes ${path.relative(REPO, PROTOTYPE_DIR)}/`);
console.log(`  montage    ${path.relative(REPO, MONTAGE_DIR)}/`);
console.log(`\npreview:fidelity: done. The preview server was stopped.`);
