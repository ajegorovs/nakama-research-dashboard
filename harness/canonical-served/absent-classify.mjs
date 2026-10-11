#!/usr/bin/env bun
/**
 * absent-classify.mjs — a PROGRAMMATIC classification of a canonical transcript's SKIP set against the
 * CURRENT build, replacing an impression ("absent by default") with a per-subject mapping:
 *
 *     exact transcript SKIP line → the `verify-page.mjs` assertion that owns it (source line)
 *                               → the hook(s) that assertion reads
 *                               → a disposition grounded in the BUILT bundle
 *
 *   bun harness/canonical-served/absent-classify.mjs <transcript.txt> [<transcript2.txt> …]
 *
 * Dispositions (per subject):
 *   - `exercised`        the assertion ran and PASSED in this transcript (not a SKIP) — counted so the
 *                        classifier reports real cover, never only gaps.
 *   - `seedable-current` the assertion reads ONLY hooks the current bundle emits; a bounded seed can reach
 *                        it. Safe to seed (disposable instance only).
 *   - `retired-surface`  the assertion (or its subject lookup) still reads a hook the current bundle does
 *                        NOT emit — no seed can exercise it until the assertion is re-pointed. The hook
 *                        names are reported so the disposition is auditable, never a blanket "absent".
 *
 * The hook set is read from the BUILT bundle (`ui/app.js`), so "current" means what the served build
 * actually renders — not what the source intends. Output is JSON on stdout.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dir, "../..");
const BUNDLE = path.join(REPO, "ui/app.js");
const VERIFY = path.join(REPO, "harness/verify-page.mjs");

const bundle = readFileSync(BUNDLE, "utf8");
const verifySrc = readFileSync(VERIFY, "utf8");
const verifyLines = verifySrc.split("\n");

// The hooks the current build actually emits: `data-rd-*` attributes and `rd-*` class tokens present in
// the bundle. (A class token counts only if it appears in a class position; a substring hit is a
// conservative yes — the disposition errs toward "seedable", the per-hook report lets a reader verify.)
const bundleHooks = new Set();
for (const m of bundle.matchAll(/data-rd-[a-z0-9-]+/g)) bundleHooks.add(m[0]);
for (const m of bundle.matchAll(/rd-[a-z0-9-]+/g)) bundleHooks.add(m[0]);
const hasHook = (h) => bundleHooks.has(h);

const HOOK_RE = /data-rd-[a-z0-9-]+|\brd-[a-z0-9-]+\b/g;

/** Find the assertion source line whose registered description equals `desc`. Descriptions may be a
 *  literal in `check(…)`/`skip(…)`/`retired(…)` or a constant; match the literal, then the constant name. */
function locate(desc) {
  const lit = verifyLines.findIndex((l) => l.includes(`"${desc}"`) || l.includes(`\`${desc}\``));
  if (lit !== -1) return lit;
  // The description may be a named constant (e.g. RAIL_LEAD_CHECK): find the const, then its use.
  const constLine = verifyLines.find((l) => /= \s*"([^"]+)"\s*;/.test(l) && l.includes(`"${desc}"`));
  if (constLine) {
    const name = constLine.split("=")[0].trim();
    const use = verifyLines.findIndex((l) => new RegExp(`\\b${name}\\b`).test(l) && !l.includes("const "));
    if (use !== -1) return use;
  }
  return -1;
}

/** The hooks a source window reads. */
function hooksNear(line) {
  if (line === -1) return [];
  const window = verifyLines.slice(Math.max(0, line - 60), line + 30).join("\n");
  return [...new Set(window.match(HOOK_RE) ?? [])];
}

const out = {};
for (const file of process.argv.slice(2)) {
  if (!existsSync(file)) {
    out[file] = { error: "no such transcript" };
    continue;
  }
  const lines = readFileSync(file, "utf8").split("\n");
  const skips = lines
    .filter((l) => l.startsWith("SKIP"))
    .map((l) => {
      const body = l.slice(6);
      const at = body.indexOf(" — ");
      return { desc: (at === -1 ? body : body.slice(0, at)).trim(), reason: (at === -1 ? "" : body.slice(at + 3)).trim() };
    });
  const passLines = lines.filter((l) => l.startsWith("PASS")).length;

  const subjects = skips.map((s) => {
    const line = locate(s.desc);
    const hooks = hooksNear(line);
    // Hooks referenced by the assertion's window that the bundle does NOT emit.
    const missing = hooks.filter((h) => (h.startsWith("data-rd-") || /^rd-/.test(h)) && !hasHook(h));
    // `rd-` substrings are noisy: a class fragment ("rd-progress-e") can appear when a longer class is
    // present. Drop any missing token that is a prefix of a present hook.
    const realMissing = missing.filter((h) => ![...bundleHooks].some((b) => b.startsWith(h) && b !== h));
    const disposition = realMissing.length > 0 ? "retired-surface" : "seedable-current";
    return { desc: s.desc, reason: s.reason, verify_page_line: line === -1 ? null : line + 1, hooks, missing_hooks: realMissing, disposition };
  });

  const counts = subjects.reduce((acc, s) => ({ ...acc, [s.disposition]: (acc[s.disposition] ?? 0) + 1 }), {});
  out[file] = {
    skip_total: skips.length,
    pass_total: passLines,
    dispositions: counts,
    subjects,
  };
}
console.log(JSON.stringify(out, null, 2));
