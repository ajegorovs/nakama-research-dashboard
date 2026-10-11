#!/usr/bin/env bun
/**
 * skip-audit.mjs — a programmatic audit of a canonical transcript's SKIP lines.
 *
 *   bun harness/canonical-served/skip-audit.mjs <transcript.txt> [<transcript2.txt> …]
 *
 * It reads every `SKIP  <description> — <reason>` line and classifies the reason into one of four buckets,
 * so the skip set is a count, not an impression:
 *   - retired           the subject was removed by the four-tab pivot (the reason says so)
 *   - relocated         the assertion MOVED to an equivalent surface and its substance is retained there
 *                       (e.g. the full reading is now read in the Progress view) — distinct from retired,
 *                       so a merely-disappeared old selector is never filed as "gone"
 *   - absent            the dataset lacks the subject the assertion would read (a seedable gap)
 *   - covered_elsewhere  the assertion's substance is covered elsewhere — asserted inside another check
 *                       (an embedded assertion) or on an equivalent surface — so it is real coverage,
 *                       not an abandoned gap. (This class was previously labelled `instrument_missing`.)
 * Output is JSON on stdout.
 */
import { readFileSync } from "node:fs";

const classify = (reason) => {
  const r = reason.toLowerCase();
  if (/no-write property|not substituted|no committed identity/.test(r)) return "covered_elsewhere";
  if (/progress view|asserted inside the|list_activity read/.test(r)) return "relocated";
  if (/retired|the pivot/.test(r)) return "retired";
  return "absent";
};

const out = {};
for (const file of process.argv.slice(2)) {
  const skips = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("SKIP"))
    .map((l) => {
      const body = l.slice(6);
      const at = body.indexOf(" — ");
      const desc = at === -1 ? body : body.slice(0, at);
      const reason = at === -1 ? "" : body.slice(at + 3);
      return { desc: desc.trim(), reason: reason.trim(), class: classify(reason.trim()) };
    });
  const byClass = {};
  for (const s of skips) (byClass[s.class] ??= []).push(s.desc);
  out[file] = {
    total: skips.length,
    classes: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
    byClass,
  };
}
console.log(JSON.stringify(out, null, 2));
