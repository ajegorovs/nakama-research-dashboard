#!/usr/bin/env bun
/**
 * Typecheck the plugin against the **real** host types.
 *
 * `bun run typecheck` checks this repository as a standalone repo, which means `@nakama/ui` and
 * `@nakama/core` resolve to the declared slice in `types/host.d.ts` — a file derived from the host's sources
 * but maintained here. That declaration could drift, and a drifted declaration would turn a real
 * incompatibility into a passing check.
 *
 * This script closes that hole: it runs **the same compiler options** (read from the repository's own
 * `tsconfig.json`, never copied) with `paths` pointed at the host packages in a checkout, where the real
 * `packages/ui/src/index.ts` and `packages/core/src/index.ts` resolve. This run is authoritative.
 *
 * Usage:
 *   bun harness/typecheck-host.mjs [--checkout /mnt/otrais/repos/nakama]
 *   (or set NAKAMA_CHECKOUT)
 *
 * Exit code is non-zero when a file **in this repository** fails to typecheck. Diagnostics reported inside
 * the checkout's own files are counted and printed but do not fail the run: this config applies the plugin's
 * JSX/runtime settings to the host's sources, which the host does not build with, so those are an artifact of
 * the measurement rather than a property of the host. They are printed rather than filtered away, because a
 * silent filter is how a measurement starts lying.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const checkout = resolve(
  argValue("--checkout") ??
    process.env.NAKAMA_CHECKOUT ??
    "/mnt/otrais/repos/nakama"
);
const hostUi = join(checkout, "packages/ui/src/index.ts");
const hostCore = join(checkout, "packages/core/src/index.ts");

for (const [label, path] of [
  ["checkout", checkout],
  ["@nakama/ui entry", hostUi],
  ["@nakama/core entry", hostCore],
]) {
  if (!existsSync(path)) {
    console.error(
      `typecheck-host: ${label} not found at ${path}.\n` +
        `This check needs a Nakama checkout (it is what makes the real host types resolvable).\n` +
        `Pass --checkout <path> or set NAKAMA_CHECKOUT.`
    );
    process.exit(2);
  }
}

/** The repository's own compiler options, so this run cannot drift from `bun run typecheck`. */
const base = JSON.parse(readFileSync(join(repoRoot, "tsconfig.json"), "utf8"));

const config = {
  ...base,
  compilerOptions: {
    ...base.compilerOptions,
    // Point the host imports at the host's real sources.
    paths: {
      "@nakama/ui": [hostUi],
      "@nakama/core": [hostCore],
    },
    // `@types` come from this repository; the checkout's own node_modules is not our concern here.
    typeRoots: [join(repoRoot, "node_modules/@types")],
  },
  // Absolute, because the generated config lives elsewhere: `include` is relative to the config file.
  include: (base.include ?? ["src"]).map((entry) =>
    isAbsolute(entry) ? entry : join(repoRoot, entry)
  ),
};

const scratch = join(process.env.TMPDIR ?? "/tmp", "nakama-typecheck-host");
mkdirSync(scratch, { recursive: true });
const configPath = join(scratch, "tsconfig.host.json");
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const tsc = join(repoRoot, "node_modules/.bin/tsc");
const result = spawnSync(tsc, ["--noEmit", "-p", configPath], {
  cwd: repoRoot,
  encoding: "utf8",
});
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

/** `path(line,col): error TSxxxx: message` — the leading path is what decides which side it is on. */
const diagnostics = output
  .split("\n")
  .filter((line) => /error TS\d+/.test(line))
  .map((line) => line.trim());

const inRepo = [];
const inCheckout = [];
for (const line of diagnostics) {
  const path = line.split("(")[0]?.trim() ?? "";
  const absolute = resolve(repoRoot, path);
  (absolute.startsWith(checkout) ? inCheckout : inRepo).push(line);
}

console.log(
  `typecheck-host: ${hostUi}\n` +
    `               ${hostCore}\n` +
    `               (compiler options read from ${join(repoRoot, "tsconfig.json")})`
);

if (inRepo.length === 0) {
  console.log(
    `\n✅ this repository typechecks against the real host types — 0 diagnostics in ${dirname(join(repoRoot, "src"))}/ and types/`
  );
} else {
  console.error(
    `\n❌ ${inRepo.length} diagnostic(s) in this repository against the real host types:`
  );
  for (const line of inRepo) {
    console.error(`   ${line}`);
  }
  console.error(
    `\nIf a diagnostic names a host prop that types/host.d.ts accepts, the declaration is wrong:` +
      ` re-derive it from ${hostUi}.`
  );
}

if (inCheckout.length > 0) {
  console.log(
    `\n   ${inCheckout.length} diagnostic(s) inside the checkout's own sources, reported and not` +
      ` counted: this config applies the plugin's JSX/runtime settings to files the host builds with its own.`
  );
  const byFile = new Map();
  for (const line of inCheckout) {
    const path = line.split("(")[0]?.trim() ?? "";
    byFile.set(path, (byFile.get(path) ?? 0) + 1);
  }
  for (const [path, count] of [...byFile.entries()].sort()) {
    console.log(`     ${String(count).padStart(3)}  ${path}`);
  }
}

process.exit(inRepo.length === 0 ? 0 : 1);
