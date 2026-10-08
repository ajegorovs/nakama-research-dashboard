#!/usr/bin/env bun
/**
 * wp5/run.mjs — the WP5 executable verification run.
 *
 *   bun harness/wp5/run.mjs        # or: bun run harness:wp5
 *
 * **What it does.** It builds the APPROVED baseline manifest (public, from the accepted WP3/WP4 designs)
 * inside an **isolated, throwaway temp store**, reads it back through the product's own read model, and
 * runs the WP5 checks. It then reports each check's outcome and exits on the aggregate.
 *
 * **What it does NOT do.** It never opens the retained fixture, never touches a live instance, never runs a
 * migration against anything durable, and never performs a network call. Every store it uses is an
 * isolated temp throwaway (`fixture.openIsolatedStore`), deleted when the run ends. There is no target org
 * and no write path that could reach one; the static no-network guard (C21) asserts that over the harness's
 * own modules.
 *
 * **Outcomes (the run can go red).** `PASS` (0) — every check passed. `FAIL` (1) — at least one check is
 * red. `BLOCKED` (2) — no check failed, but an unresolved parameter gate means the run could not establish
 * the full contract. **BLOCKED is not green:** the six axis→repository roles, the F08 wording/confidence,
 * the optional blocker restoration, the evidence strategy and the target are all unapproved, so the gate
 * checks report BLOCKED rather than defaulting any value. Exit 2 is that honest "not established" verdict —
 * mirroring the acceptance pass, where a non-verdict does not replace a record.
 */
import { join } from "node:path";

import { evaluateStore, evaluateView, harnessSources, pluginActionKeys, summarize } from "./checks.mjs";
import { openIsolatedStore, readView, seedApprovedBaseline } from "./fixture.mjs";
import { unresolvedGates } from "./manifest.mjs";

const pluginManifestPath = join(import.meta.dir, "../../nakama.plugin.json");

function main() {
  const gates = unresolvedGates();

  // 1. The approved baseline, seeded into an isolated in-memory store (permitted testdata).
  const primary = openIsolatedStore("wp5-primary");
  const extraStores = [];
  const makeStore = () => {
    const s = openIsolatedStore("wp5-aux");
    extraStores.push(s);
    return s.store;
  };

  let results;
  try {
    seedApprovedBaseline(primary.store);
    const view = readView(primary.store);
    results = [
      ...evaluateView(view, gates),
      ...evaluateStore({
        store: primary.store,
        makeStore,
        pluginActions: pluginActionKeys(pluginManifestPath),
        harnessSources: harnessSources(),
      }),
    ];
  } finally {
    primary.dispose();
    for (const s of extraStores) s.dispose();
  }

  const status = summarize(results);

  console.log("WP5 executable verification — baseline manifest + amendment invariants");
  console.log("  store:    isolated throwaway temp (never the retained fixture)");
  console.log("  gates:    " + gates.map((g) => `${g.id}${g.resolved ? "" : "(unresolved)"}`).join(" "));
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

process.exit(main());
