#!/usr/bin/env bun
/**
 * run.mjs — serve the plugin's real page locally, with no Nakama instance.
 *
 * Why this exists: the only way to *see* `src/ui.tsx` render used to be the full estate loop —
 * build → vendor → reinstall → guard → a real browser against a served instance — because the plugin
 * asset is served from the org's installed **release snapshot**, not the checkout tree. Every CSS
 * tweak paid that. This script mounts the same bundle through the host's own activation path
 * (`@/lib/plugin-runtime`), the host's own components (`@nakama/ui`) and the host's own stylesheet,
 * against payloads replayed from a committed dataset. What it renders is the plugin's real code and
 * the host's real primitives; what it is not is the served page (see `preview-main.tsx`).
 *
 * It needs a Nakama checkout (the host's packages are not published) and nothing else — no server, no
 * database, no instance, no credentials. The checkout supplies React 19, `@nakama/ui`, Tailwind v4 and
 * the dashboard's tokens, so the preview uses exactly the host's versions.
 *
 *   bun harness/preview/run.mjs                       # corpus dataset, http://127.0.0.1:3010
 *   bun harness/preview/run.mjs --dataset fixture --port 3011
 *   bun harness/preview/run.mjs --watch                # rebuild ui/app.js on save (no second shell)
 *   bun harness/preview/run.mjs --checkout /path/to/nakama --keep
 *
 * It writes six files into the checkout to run. By default it removes the ones it created on exit (and
 * restores anything it overwrote); `--keep` leaves them. Either way a manifest (`.preview-generated.json`)
 * is the record, and a stale one from a crashed run is recovered on the next start.
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HERE = import.meta.dir;
const REPO = path.resolve(HERE, "../..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const has = (name) => args.includes(`--${name}`);

const CHECKOUT = path.resolve(
  flag("checkout", process.env.NAKAMA_CHECKOUT ?? path.join(homedir(), "Repos", "nakama"))
);
const DATASET = flag("dataset", "corpus");
// Source fixtures to mount. Defaults to this harness's own `fixtures.json`; callers that own their
// payload (e2e-render.mjs) pass `--fixtures <path>` so they never overwrite a committed fixture file.
const FIXTURES = flag("fixtures", path.join(HERE, "fixtures.json"));
const PORT = flag("port", process.env.PREVIEW_PORT ?? "3010");
const REBUILD = has("rebuild");
const WATCH = has("watch");
const SKIP_FIXTURES = has("no-fixtures");
// The preview copies real files into the host checkout to run. `--keep` leaves them (and the manifest) so
// they can be inspected; the default removes what this run created when it exits.
const KEEP = has("keep");
// A caller that must prove the responder is *its own* child (the full-text-clamp check, guarding the
// bind→serve race on a reused port) passes `--run-token`: this run then also writes `preview-identity.json`
// into the webapp root, where the caller fetches and matches it. Absent a token nothing extra is written.
const RUN_TOKEN = flag("run-token", "");

const die = (message) => {
  console.error(`preview: ${message}`);
  process.exit(2);
};

const WEBAPP = path.join(CHECKOUT, "apps", "web");
if (!existsSync(path.join(WEBAPP, "node_modules", "vite"))) {
  die(
    `no Vite in ${WEBAPP}.\n` +
      `  The host's packages are not published, so the preview runs inside a checkout.\n` +
      `  git clone --depth 1 --branch v0.4.31 https://github.com/ahmadrosid/nakama.git "${CHECKOUT}"\n` +
      `  (then: cd "${CHECKOUT}" && bun install)\n` +
      `  or pass --checkout <path>.`
  );
}
const BUNDLE = path.join(REPO, "ui", "app.js");
if (!existsSync(BUNDLE)) {
  die(`no built plugin bundle at ${BUNDLE} — run \`bun run build\` first.`);
}

const run = (command, argv, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, argv, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))
    );
  });

if (REBUILD) {
  console.log("preview: rebuilding the plugin bundle…");
  await run("bun", ["run", "build"], { cwd: REPO });
}

if (!SKIP_FIXTURES) {
  console.log(`preview: building '${DATASET}' fixtures…`);
  await run(
    "bun",
    [path.join(HERE, "make-fixtures.mjs"), "--dataset", DATASET, "--out", path.join(HERE, "fixtures.json")],
    { cwd: REPO }
  );
}
const fixturesFile = path.resolve(SKIP_FIXTURES ? FIXTURES : path.join(HERE, "fixtures.json"));
if (!existsSync(fixturesFile)) {
  die(`no fixtures at ${fixturesFile} — run without --no-fixtures, pass --fixtures <file>, or run make-fixtures.mjs first.`);
}

// ── place the preview into the checkout, and own what we place ─────────────────────────────────────
// Six files are written into the host checkout for the preview to run. They are not ours to leave behind:
// a manifest records exactly what this run created (backing up anything it had to overwrite), so the
// default exit removes only our own files and restores what was there before. A stale manifest left by a
// crashed run is recovered at startup, before this run writes anything.
const MANIFEST = path.join(WEBAPP, ".preview-generated.json");
const insideWebapp = (candidate) => {
  const resolved = path.resolve(candidate);
  return resolved === WEBAPP || resolved.startsWith(WEBAPP + path.sep);
};
const owned = [];
/** Set once the children exist, so cleanup can stop them without outliving this process. */
let watcher = null;
let server = null;

/** Undo everything `owned` names: restore backups, remove files this run created. Idempotent. */
const cleanup = () => {
  for (const entry of owned) {
    const target = path.resolve(entry.file);
    if (!insideWebapp(target)) continue;
    if (entry.backup !== null && existsSync(entry.backup)) renameSync(entry.backup, target);
    else if (entry.backup === null) rmSync(target, { force: true });
    if (entry.backup !== null) rmSync(entry.backup, { force: true });
  }
  rmSync(MANIFEST, { force: true });
  try {
    watcher?.kill();
  } catch {}
  try {
    server?.kill();
  } catch {}
};

/** Recover a manifest a previous (crashed or --keep) run left behind, before writing over it. */
const recoverStale = () => {
  if (!existsSync(MANIFEST)) return;
  let prior = { files: [] };
  try {
    prior = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    // A corrupt manifest still means a run did not finish; fall through and remove it.
  }
  for (const entry of prior.files ?? []) {
    const target = path.resolve(entry.file);
    if (!insideWebapp(target)) continue;
    if (entry.backup && existsSync(entry.backup)) renameSync(entry.backup, target);
    else if (!entry.backup) rmSync(target, { force: true });
    if (entry.backup) rmSync(entry.backup, { force: true });
  }
  rmSync(MANIFEST, { force: true });
  console.log("preview: cleaned up files a previous preview run left in the checkout.");
};

/**
 * Claim a path before writing it, deciding ownership from content:
 *   - absent                         → owned; removed on cleanup;
 *   - present and byte-identical to what we are about to write → owned; it is our own artifact (or a
 *     leftover from an older preview run), so it is removed on cleanup — this is what makes the harness
 *     self-healing for the six files it has historically left behind;
 *   - present and different          → a user file; backed up and restored on cleanup, never deleted.
 */
const claim = (target, content) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const existed = existsSync(target);
  const identical = existed && readFileSync(target).equals(buffer);
  let backup = null;
  if (existed && !identical) {
    backup = `${target}.preview-bak`;
    copyFileSync(target, backup);
  }
  owned.push({ backup, file: target, preexisting: backup !== null, reclaimed: identical });
  writeFileSync(MANIFEST, `${JSON.stringify({ files: owned }, null, 2)}\n`);
  return { identical };
};

recoverStale();

const place = (source, target) => {
  const content = readFileSync(source);
  const { identical } = claim(target, content);
  writeFileSync(target, content);
  if (identical) console.log(`preview: reclaiming leftover ${path.relative(WEBAPP, target)} (removed on exit).`);
};

for (const name of ["preview.html", "preview-main.tsx", "preview.css"]) {
  place(path.join(HERE, name), path.join(WEBAPP, name));
}
place(fixturesFile, path.join(WEBAPP, "preview-fixtures.json"));

// Only when a caller asked to identify this run: write its identity (the run token, plus the boot
// bundle's sha256 and byte length, read from the raw bytes) into the webapp root. The caller fetches
// `/preview-identity.json` and matches all three, so a responder that is not this child — a leftover
// preview or a foreign server that won the bind race — is refused rather than measured.
if (RUN_TOKEN) {
  const bundleBuf = readFileSync(BUNDLE);
  const identity = {
    token: RUN_TOKEN,
    pluginId: "research-dashboard",
    buildSha256: createHash("sha256").update(bundleBuf).digest("hex"),
    buildBytes: bundleBuf.length,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  const identityTarget = path.join(WEBAPP, "preview-identity.json");
  claim(identityTarget, `${JSON.stringify(identity)}\n`);
  writeFileSync(identityTarget, `${JSON.stringify(identity)}\n`);
}

// The plugin is imported by relative path (outside the checkout's root, which `server.fs.allow`
// permits below) so Vite watches `ui/app.js` itself — a rebuild reloads the page, with no copy step.
let relative = path.relative(WEBAPP, BUNDLE).split(path.sep).join("/");
if (!relative.startsWith(".")) {
  relative = `./${relative}`;
}
const pluginContent = `// Generated by harness/preview/run.mjs — the plugin's built bundle, exactly as the host would load it.\nexport * from ${JSON.stringify(relative)};\n`;
const pluginTarget = path.join(WEBAPP, "preview-plugin.ts");
const reclaimedPlugin = claim(pluginTarget, pluginContent).identical;
writeFileSync(pluginTarget, pluginContent);
if (reclaimedPlugin) console.log("preview: reclaiming leftover preview-plugin.ts (removed on exit).");

// Extend the dashboard's own Vite config: same plugins, same Tailwind pipeline, same aliases, plus
// read access to this repository and a port that will not collide with the review web on :3003.
const checkoutRoot = JSON.stringify(CHECKOUT);
const viteContent =
  `// Generated by harness/preview/run.mjs — the dashboard's config, plus a port and fs.allow for the preview.\n` +
  `import base from "./vite.config";\n\n` +
  `export default {\n` +
  `  ...base,\n` +
  `  server: {\n` +
  `    ...base.server,\n` +
  `    host: "127.0.0.1",\n` +
  `    port: ${Number(PORT)},\n` +
  `    strictPort: true,\n` +
  `    fs: { allow: [${checkoutRoot}, ${JSON.stringify(REPO)}] },\n` +
  `  },\n` +
  `};\n`;
const viteTarget = path.join(WEBAPP, "preview.vite.config.ts");
const reclaimedVite = claim(viteTarget, viteContent).identical;
writeFileSync(viteTarget, viteContent);
if (reclaimedVite) console.log("preview: reclaiming leftover preview.vite.config.ts (removed on exit).");

if (WATCH) {
  console.log("preview: --watch — `ui/app.js` rebuilds on save (bun run build:watch).");
  watcher = spawn("bun", ["run", "build:watch"], { cwd: REPO, stdio: "inherit" });
}

console.log(`\npreview: serving http://127.0.0.1:${PORT}/preview.html`);
console.log(`preview: dataset '${DATASET}' · plugin bundle ${path.relative(REPO, BUNDLE)}`);
if (WATCH) {
  console.log("preview: edit src/, save — the page reloads on its own.\n");
} else {
  console.log("preview: edit src/, then `bun run build` (or use --watch) — the page reloads on its own.\n");
}

if (KEEP) {
  console.log(
    `preview: --keep — leaving ${owned.length} generated file(s) in ${path.relative(REPO, WEBAPP) || WEBAPP}; ` +
      `run again without --keep (or delete them and the manifest) to remove them.`
  );
} else {
  console.log(`preview: ${owned.length} generated file(s) in the checkout — removed on exit (see --keep).`);
  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      cleanup();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

server = spawn(
  "bun",
  ["run", "vite", "--config", "preview.vite.config.ts", "--port", String(PORT)],
  { cwd: WEBAPP, stdio: "inherit" }
);
server.on("exit", (code) => process.exit(code ?? 0));
