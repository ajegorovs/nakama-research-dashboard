#!/usr/bin/env bun
/**
 * wp5/run.mjs — the WP5 executable verification run.
 *
 *   bun harness/wp5/run.mjs                     # default: unresolved gates → BLOCKED
 *   bun harness/wp5/run.mjs --decisions <file>  # TEST-ONLY synthetic decisions → fully PASS
 *
 * **What it does.** It builds the APPROVED baseline manifest (public, from the accepted WP3/WP4 designs)
 * inside an **isolated, throwaway temp store**, reads it back through the product's own read model, and
 * runs the WP5 checks. Gate checks verify their decision against the view it belongs to: the baseline seed,
 * an **amendment view** (the seed plus the test-only synthetic deltas), or the **retained view** (a
 * disposable retained-like store). It then reports each check's outcome and exits on the aggregate.
 *
 * **What it does NOT do.** It never opens the retained fixture, never touches a live instance, never runs a
 * migration against anything durable, and never performs a network call. Every store it uses is an
 * isolated temp throwaway (`fixture.openIsolatedStore`), deleted in `finally` when the run ends. There is
 * no target org and no write path that could reach one; the static no-network guard (C21) asserts that over
 * the harness's own modules.
 *
 * **Outcomes (the run can go red).** `PASS` (0) — every check passed. `FAIL` (1) — at least one check is
 * red. `BLOCKED` (2) — no check failed, but an unresolved parameter gate means the run could not establish
 * the full contract. **BLOCKED is not green:** the six axis→repository roles, the F08 wording/confidence,
 * the optional blocker restoration, the evidence strategy and the target are all unapproved by default, so
 * the gate checks report BLOCKED rather than defaulting any value. Exit 2 is that honest "not established"
 * verdict — mirroring the acceptance pass, where a non-verdict does not replace a record.
 *
 * **The `--decisions` option is test-only.** The payload must carry `"testOnly": true`; it resolves every
 * gate with a **synthetic** value so the fully-PASS path is reachable and the checks can be shown to be
 * able to go red. It is not an owner decision, not an approval and not a target binding — a payload without
 * the label is refused (exit 3), so a "test-only parameter" can never be mistaken for a real, approved
 * target.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { evaluateStore, evaluateView, harnessSources, pluginActionKeys, summarize } from "./checks.mjs";
import {
  addAxis4Evidence,
  applyTestOnlyAmendment,
  openIsolatedStore,
  readView,
  seedApprovedBaseline,
  seedRetainedLike,
} from "./fixture.mjs";
import { TEST_ONLY_LABEL, testOnlyDecisions, unresolvedGates } from "./manifest.mjs";

const pluginManifestPath = join(import.meta.dir, "../../nakama.plugin.json");

function parseArgs(argv) {
  const out = { decisionsPath: null, builtinTestOnly: false, restoreWithEvidence: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--decisions") out.decisionsPath = argv[i + 1] ?? null;
    if (argv[i] === "--test-only-decisions") out.builtinTestOnly = true;
    if (argv[i] === "--restore-with-evidence") out.restoreWithEvidence = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  // Refuse a decisions payload that is not explicitly labelled test-only — it must never read as a real
  // approval or an approved target.
  let decisions = null;
  if (args.builtinTestOnly) decisions = testOnlyDecisions();
  if (args.decisionsPath) {
    const payload = JSON.parse(readFileSync(args.decisionsPath, "utf8"));
    if (payload?.testOnly !== true) {
      console.log("WP5: REFUSED — a decisions payload must carry \"testOnly\": true; it is not an approval");
      return 3;
    }
    decisions = payload;
  }

  const gates = decisions ? decisions.gates : unresolvedGates();

  // Stores: primary (baseline), amendment (seed + test-only deltas) when decisions are supplied, retained.
  const primary = openIsolatedStore("wp5-primary");
  const extraStores = [];
  const amendment = decisions ? openIsolatedStore("wp5-amendment") : null;
  const retained = openIsolatedStore("wp5-retained");
  const makeStore = () => {
    const s = openIsolatedStore("wp5-aux");
    extraStores.push(s);
    return s.store;
  };

  let results;
  try {
    seedApprovedBaseline(primary.store);
    const view = readView(primary.store);

    let amendmentView = null;
    if (amendment) {
      seedApprovedBaseline(amendment.store);
      if (args.restoreWithEvidence && gateValue(gates, "G03") === "restore") {
        addAxis4Evidence(amendment.store);
      }
      applyTestOnlyAmendment(amendment.store, gates);
      amendmentView = readView(amendment.store);
    }

    seedRetainedLike(retained.store);
    const retainedView = readView(retained.store);

    results = [
      ...evaluateView(view, gates, { amendment: amendmentView, retained: retainedView }),
      ...evaluateStore({
        store: primary.store,
        makeStore,
        pluginActions: pluginActionKeys(pluginManifestPath),
        harnessSources: harnessSources(),
        gates,
      }),
    ];
  } finally {
    primary.dispose();
    if (amendment) amendment.dispose();
    retained.dispose();
    for (const s of extraStores) s.dispose();
  }

  const status = summarize(results);

  console.log("WP5 executable verification — baseline manifest + amendment invariants");
  console.log("  store:    isolated throwaway temp (never the retained fixture)");
  if (decisions) {
    console.log("  gates:    " + TEST_ONLY_LABEL);
    console.log("            " + gates.map((g) => `${g.id}=${JSON.stringify(g.value)}`).join(" "));
  } else {
    console.log("  gates:    " + gates.map((g) => `${g.id}${g.resolved ? "" : "(unresolved)"}`).join(" "));
  }
  console.log("");
  const width = Math.max(...results.map((r) => r.id.length));
  for (const r of results) {
    console.log(`  ${r.status.padEnd(7)} ${r.id.padEnd(width)}  ${r.title}`);
    if (r.detail) console.log(`          ${r.detail}`);
  }
  const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  console.log("");
  console.log(`  result: ${status}  (PASS ${counts.PASS ?? 0} · FAIL ${counts.FAIL ?? 0} · BLOCKED ${counts.BLOCKED ?? 0})`);
  if (status === "BLOCKED") {
    console.log("  not green: unresolved parameter gates carry no default — see BLOCKED rows above");
  }

  return status === "PASS" ? 0 : status === "FAIL" ? 1 : 2;
}

function gateValue(gates, id) {
  const gate = (gates ?? []).find((g) => g.id === id);
  return gate && gate.resolved ? gate.value : null;
}

process.exit(main());
