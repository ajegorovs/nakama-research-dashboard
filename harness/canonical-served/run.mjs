#!/usr/bin/env bun
/**
 * run.mjs — the admission-gated orchestrator for an **isolated served** canonical acceptance run.
 *
 * See README.md for why the local preview is not this, the operation table (O1–O6) and its boundaries,
 * and the credential/identity rules. In short: this provisions a SECOND, self-contained instance (own
 * workspace, own config dir / SQLite, own loopback ports, own generated credentials), shares nothing with
 * the running estate except a **read-only hardlink copy** of the host source tree, and performs NOTHING
 * unless the step id is named in `--allow`. `--plan` (the default) prints the plan and exits.
 *
 *   bun harness/canonical-served/run.mjs --plan
 *   bun harness/canonical-served/run.mjs --allow O1
 *   bun harness/canonical-served/run.mjs --allow O1,O2,O3,O4,O5     # O2+ needs explicit owner go-ahead
 *   bun harness/canonical-served/run.mjs --allow O6
 *
 * Fixes over the previous revision (bounded, mechanical — no framework added):
 *   - O2 no longer spawns `$HOME` as a command (that stray spawn emitted an unhandled 'error' and crashed).
 *   - O2 routes the server's stdout/stderr into LOG_FILE (the fd the header always promised).
 *   - The web origin is a SEPARATE free port: the host serves no built web dist (`apps/web/dist` absent),
 *     so NAKAMA_DASHBOARD must be the review server, not the API port.
 *   - O1 copies the host source into the workspace and vendors the fresh build THERE, so vendoring can
 *     never alter the shared runtime tree.
 *   - O5 exports NAKAMA_SHOT_DIR (a workspace scratch dir) so screenshots never land in the public repo,
 *     and a SHORT TMPDIR (Chromium's unix socket path overflows 108 chars under a deep TMPDIR).
 *   - O6 kills the recorded API **and** web pids only — never `pkill`.
 */
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");
const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? fallback : argv[at + 1];
};

const WORKSPACE = path.resolve(
  flag("workspace", path.join(homedir(), "Repos", "nakama-e2e-fixture-workspace-isolated"))
);
const PORT = flag("port", "4401");
const WEB_PORT = flag("web-port", "4451");
const HOST_SRC = path.resolve(
  flag(
    "host-src",
    path.join(homedir(), "Repos", "nakama-e2e-fixture-workspace", "sources", "nakama-host-clean")
  )
);
const ALLOW = new Set(
  (flag("allow", "") || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
);
const PLAN_ONLY = has("plan") || ALLOW.size === 0;

const HOST_COPY = path.join(WORKSPACE, "host");
const ENV_FILE = path.join(WORKSPACE, "runtime", "served.env");
const API_PID = path.join(WORKSPACE, "runtime", "served-api.pid");
const WEB_PID = path.join(WORKSPACE, "runtime", "served-web.pid");
const LOG_FILE = path.join(WORKSPACE, "runtime", "logs", "server.log");
const WEB_LOG = path.join(WORKSPACE, "runtime", "logs", "web.log");
const CONFIG_DIR = path.join(WORKSPACE, "runtime", "nakama-config");
const SHOT_DIR = path.join(WORKSPACE, "shots");
// Chromium's SingletonSocket lives under TMPDIR; keep it short or the browser aborts at launch.
const SHORT_TMP = path.join(homedir(), `.nk-${PORT}`);

/** Read a KEY=VALUE env file into an object (values never printed). */
const readEnv = (file) => {
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const bare = t.startsWith("export ") ? t.slice(7) : t;
    const i = bare.indexOf("=");
    if (i > 0) out[bare.slice(0, i).trim()] = bare.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
};

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });

const portBusy = (port) => {
  const out = spawnSync("ss", ["-ltn", `( sport = :${port} )`], { encoding: "utf8" });
  return /LISTEN/.test(out.stdout ?? "");
};

const waitUrl = async (url, { method = "GET", body, tries = 120 } = {}) => {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url, {
        method,
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body }),
      });
      if (res.status > 0) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const STEPS = {
  O1: {
    label: "provision — workspace, mode-600 env, fresh config dir, read-only host copy + vendor",
    boundary: "none (loopback; no network, no server process)",
    async run() {
      if (portBusy(PORT)) throw new Error(`API port ${PORT} already has a listener — refusing to provision`);
      if (portBusy(WEB_PORT)) throw new Error(`web port ${WEB_PORT} already has a listener — refusing to provision`);
      mkdirSync(path.join(WORKSPACE, "runtime", "logs"), { recursive: true });
      mkdirSync(CONFIG_DIR, { recursive: true });
      mkdirSync(SHOT_DIR, { recursive: true });
      mkdirSync(SHORT_TMP, { recursive: true });

      // INDEPENDENT copy of the shared host source, then vendor the FRESH build into the copy.
      // A hardlink copy (`cp -al`) shares inodes with the shared tree, so ANY in-place write inside the
      // workspace (a build output, a vite cache, a patched source) would silently corrupt the shared host
      // runtime. `cp -a --reflink=auto` gives every file its OWN inode while sharing extents on a
      // copy-on-write filesystem (btrfs here) — no real duplication, but writes can never reach the source.
      // Symlinks are preserved (the tree's top-level `node_modules` stays the read-only shared link).
      if (!existsSync(HOST_COPY)) {
        const cp = spawnSync("cp", ["-a", "--reflink=auto", HOST_SRC, HOST_COPY], { encoding: "utf8" });
        if (cp.status !== 0) throw new Error(`copy of host source failed: ${cp.stderr}`);
        console.log(`O1: independently copied host source -> ${HOST_COPY}`);
      }
      // Guard: the copy must not share any writable regular file's inode with the shared tree. Sample the
      // files vendoring patches and a build output; a shared inode is a hard failure, not a warning.
      const sharedInodes = [];
      for (const rel of [
        "apps/server/src/services/plugin-service.ts",
        "apps/server/src/index.ts",
        "apps/web/package.json",
        "packages/plugins/research-dashboard/package.json",
      ]) {
        const a = spawnSync("stat", ["-c", "%i:%h", path.join(HOST_COPY, rel)], { encoding: "utf8" });
        const b = spawnSync("stat", ["-c", "%i", path.join(HOST_SRC, rel)], { encoding: "utf8" });
        const [copyInode, links] = (a.stdout ?? "").trim().split(":");
        if (copyInode && b.stdout && copyInode === b.stdout.trim()) sharedInodes.push(rel);
        if (links && Number(links) > 1) sharedInodes.push(`${rel} (link count ${links})`);
      }
      if (sharedInodes.length > 0) {
        throw new Error(
          `O1: workspace copy shares inodes with the shared tree (unsafe for in-place writes): ${sharedInodes.join(", ")}`
        );
      }
      console.log("O1: workspace copy inodes are independent of the shared source (no shared writable inode)");
      await run("bash", [path.join(REPO, "vendor/vendor-into-nakama.sh"), HOST_COPY], { cwd: REPO });

      if (existsSync(ENV_FILE)) {
        console.log(`O1: env file already present at ${ENV_FILE} — leaving it in place`);
        return;
      }
      const rand = () => randomBytes(24).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 28);
      const email = `served-admin-${randomBytes(4).toString("hex")}@example.invalid`;
      const password = rand();
      const body =
        [
          "# Isolated served acceptance instance — loopback only. Mode 600. Outside the public repo.",
          "# Credential VALUES live here only; reports reference these KEY names.",
          `NAKAMA_URL=http://127.0.0.1:${PORT}`,
          `NAKAMA_DASHBOARD=http://127.0.0.1:${WEB_PORT}`,
          `NAKAMA_WEB_URL=http://127.0.0.1:${WEB_PORT}`,
          `NAKAMA_WEB_PORT=${WEB_PORT}`,
          "NAKAMA_PLUGIN_ID=research-dashboard",
          `NAKAMA_EMAIL=${email}`,
          `NAKAMA_PASSWORD=${password}`,
          `NAKAMA_DEV_EMAIL=${email}`,
          `NAKAMA_DEV_PASSWORD=${password}`,
          `NAKAMA_SEED_ADMIN_EMAIL=${email}`,
          'NAKAMA_SEED_ADMIN_NAME="Served Admin"',
          `NAKAMA_SEED_ADMIN_PASSWORD=${password}`,
          'NAKAMA_SEED_ORG_NAME="Served Synthetics"',
          "NAKAMA_HOST=127.0.0.1",
          `NAKAMA_PORT=${PORT}`,
          `NAKAMA_CONFIG_DIR=${CONFIG_DIR}`,
          `DATABASE_URL=file:${CONFIG_DIR}/data/sqlite/nakama.sqlite`,
          `PM2_HOME=${path.join(WORKSPACE, "runtime", "pm2")}`,
          `TMPDIR=${SHORT_TMP}`,
          "",
        ].join("\n");
      writeFileSync(ENV_FILE, body);
      chmodSync(ENV_FILE, 0o600);
      console.log(`O1: wrote ${ENV_FILE} (mode 600); credential values not printed`);
    },
  },
  O2: {
    label: "start — launch the isolated host server + review web (own ports/db)",
    boundary: "starts a NEW instance",
    async run() {
      const env = readEnv(ENV_FILE);
      if (portBusy(PORT)) throw new Error(`API port ${PORT} already has a listener — refusing to start`);
      mkdirSync(path.join(WORKSPACE, "runtime", "logs"), { recursive: true });
      mkdirSync(SHORT_TMP, { recursive: true });
      const logFd = openSync(LOG_FILE, "w");
      const server = spawn(
        path.join(homedir(), ".bun", "bin", "bun"),
        ["run", path.join(HOST_COPY, "apps/server/src/index.ts")],
        {
          detached: true,
          stdio: ["ignore", logFd, logFd],
          env: {
            HOME: process.env.HOME,
            PATH: `${path.join(homedir(), ".bun", "bin")}:/usr/bin:/bin`,
            TMPDIR: env.TMPDIR,
            LANG: "C.UTF-8",
            NAKAMA_HOST: env.NAKAMA_HOST,
            NAKAMA_PORT: env.NAKAMA_PORT,
            NAKAMA_CONFIG_DIR: env.NAKAMA_CONFIG_DIR,
            DATABASE_URL: env.DATABASE_URL,
            PM2_HOME: env.PM2_HOME,
            NAKAMA_SEED_ADMIN_EMAIL: env.NAKAMA_SEED_ADMIN_EMAIL,
            NAKAMA_SEED_ADMIN_NAME: env.NAKAMA_SEED_ADMIN_NAME,
            NAKAMA_SEED_ADMIN_PASSWORD: env.NAKAMA_SEED_ADMIN_PASSWORD,
            NAKAMA_SEED_ORG_NAME: env.NAKAMA_SEED_ORG_NAME,
          },
        }
      );
      server.unref();
      closeSync(logFd);
      writeFileSync(API_PID, String(server.pid));
      console.log(`O2: started isolated API pid ${server.pid}; log ${LOG_FILE}`);
      if (!(await waitUrl(`http://127.0.0.1:${PORT}/health`))) throw new Error("O2: API did not answer within 60s");

      const webFd = openSync(WEB_LOG, "w");
      const web = spawn(
        path.join(homedir(), ".bun", "bin", "bun"),
        ["node_modules/.bin/vite", "--host", "127.0.0.1", "--port", WEB_PORT, "--strictPort"],
        {
          cwd: path.join(HOST_COPY, "apps/web"),
          detached: true,
          stdio: ["ignore", webFd, webFd],
          env: {
            HOME: process.env.HOME,
            PATH: `${path.join(homedir(), ".bun", "bin")}:/usr/bin:/bin`,
            TMPDIR: env.TMPDIR,
            LANG: "C.UTF-8",
            NAKAMA_SERVER_URL: env.NAKAMA_URL,
          },
        }
      );
      web.unref();
      closeSync(webFd);
      writeFileSync(WEB_PID, String(web.pid));
      console.log(`O2: started isolated web pid ${web.pid}; log ${WEB_LOG}`);
      if (!(await waitUrl(`http://127.0.0.1:${WEB_PORT}/`))) throw new Error("O2: web did not answer within 60s");
      console.log("O2: instance is answering");
    },
  },
  O3: {
    label: "install+enable — harness/install-plugin.mjs against the isolated instance",
    boundary: "≤ O2 (new instance only)",
    async run() {
      await run("bun", [path.join(REPO, "harness/install-plugin.mjs"), "--env-file", ENV_FILE], { cwd: REPO });
    },
  },
  O4: {
    label: "seed — labelled [synthetics] cases via the product's own write path",
    boundary: "domain write (throwaway instance only)",
    async run() {
      await run("bun", [path.join(import.meta.dir, "seed-synthetic.mjs"), "--env-file", ENV_FILE], { cwd: REPO });
    },
  },
  O5: {
    label: "verify — the canonical harness/verify-page.mjs pass",
    boundary: "≤ O4",
    async run() {
      const env = readEnv(ENV_FILE);
      await run("bun", [path.join(REPO, "harness/verify-page.mjs")], {
        cwd: REPO,
        env: {
          ...process.env,
          TMPDIR: env.TMPDIR,
          NAKAMA_DASHBOARD: env.NAKAMA_DASHBOARD,
          NAKAMA_DEV_EMAIL: env.NAKAMA_DEV_EMAIL,
          NAKAMA_DEV_PASSWORD: env.NAKAMA_DEV_PASSWORD,
          NAKAMA_PLUGIN_ID: env.NAKAMA_PLUGIN_ID,
          // Name the target organization EXPLICITLY so the canonical pass resolves it exactly and never
          // falls back to a lone-org default (the isolated instance's own org is the seed org).
          NAKAMA_ORG_NAME: env.NAKAMA_SEED_ORG_NAME,
          NAKAMA_SHOT_DIR: SHOT_DIR,
        },
      });
    },
  },
  O6: {
    label: "stop — kill the recorded api and web pids only",
    boundary: "none",
    async run() {
      for (const file of [WEB_PID, API_PID]) {
        if (!existsSync(file)) {
          console.log(`O6: no pidfile ${file}`);
          continue;
        }
        const pid = Number(readFileSync(file, "utf8").trim());
        try {
          process.kill(pid);
          console.log(`O6: stopped pid ${pid} (${path.basename(file)})`);
        } catch {
          console.log(`O6: pid ${pid} not running (${path.basename(file)})`);
        }
      }
    },
  },
};

if (PLAN_ONLY) {
  console.log("canonical-served — plan (nothing is started; pass --allow <ids> to act)\n");
  for (const [id, step] of Object.entries(STEPS)) {
    const allowed = ALLOW.has(id) ? "AUTHORIZED" : "not authorized";
    console.log(`  ${id}  [${allowed}]  ${step.label}\n        boundary: ${step.boundary}`);
  }
  console.log(`\nworkspace : ${WORKSPACE}`);
  console.log(`API port  : ${PORT}`);
  console.log(`web port  : ${WEB_PORT}`);
  console.log(`host src  : ${HOST_SRC}`);
  process.exit(0);
}

for (const [id, step] of Object.entries(STEPS)) {
  if (!ALLOW.has(id)) {
    console.log(`${id}: SKIP (not authorized) — ${step.label}`);
    continue;
  }
  console.log(`${id}: ${step.label}`);
  await step.run();
}
