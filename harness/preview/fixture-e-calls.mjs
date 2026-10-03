/**
 * fixture-e-calls.mjs — run the layout fixture's Fixture E against a local action dispatcher.
 *
 * `harness/apply-layout-fixture.mjs` declares its whole dataset once. The `FIXTURE` array (the plain
 * `reconcile_topic` calls) is read by `layout-fixture-calls.mjs`; **Fixture E** is the rest of that same
 * dataset — an open Problem on two repositories with a person link, an activity, an evidence record, a
 * human steering note and a plan step; a second Problem with none of those; a closed-out Problem; an
 * unordered plan — and it is applied by that file's `applyFixtureE`, which needs a second pass because a
 * row cannot name a problem whose id the store mints later.
 *
 * The preview needs those states too (the Progress view is empty without them). Rather than re-implement
 * that orchestration — and drift from it — this module slices `applyFixtureE` out of the source and runs
 * it against a dispatcher. Its own constants and its own two-pass reads stay the single source of truth;
 * only the transport changes, from `POST /v1/…/actions/<key>` to the local action layer.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { sliceBalanced } from "./source-blocks.mjs";

const SOURCE = path.join(import.meta.dir, "..", "apply-layout-fixture.mjs");
const CONSTANTS_START = "const FIXTURE_E_AXIS =";
const CONSTANTS_END = "/**\n * Fixture E, idempotently.";
const FUNCTION_MARKER = "async function applyFixtureE(headers)";
const PLUGIN_ID = "research-dashboard";

/** The Fixture E constants and the `applyFixtureE` source, read together from the fixture's own file. */
export function loadFixtureE() {
  const text = readFileSync(SOURCE, "utf8");
  const from = text.indexOf(CONSTANTS_START);
  const to = text.indexOf(CONSTANTS_END, from);
  if (from === -1 || to === -1 || to <= from) {
    throw new Error(`fixture-e-calls: could not find the Fixture E constants in ${SOURCE}`);
  }
  return {
    constants: text.slice(from, to),
    source: `${FUNCTION_MARKER} ${sliceBalanced(text, FUNCTION_MARKER)}`,
  };
}

/**
 * Build a `applyFixtureE` bound to a local dispatcher.
 *
 * `dispatch(key, input)` runs one action and returns what the action layer returned (an object with
 * `ok`) — the same value the HTTP transport carries under `result`. The returned function takes the
 * headers its caller would pass (ignored locally) and resolves to `0` on success, `1` on the first
 * failure, exactly as the fixture's own `applyFixtureE` does.
 */
export function applyFixtureEWith(dispatch) {
  const { constants, source } = loadFixtureE();
  const call = async (pathname, body) => {
    const key = String(pathname).split("/actions/").pop();
    const result = await dispatch(key, body?.input ?? {});
    return { body: { result }, status: 200 };
  };
  const build = new Function(
    "call",
    "PLUGIN_ID",
    "console",
    `${constants}\n${source}\nreturn applyFixtureE;`
  );
  return build(call, PLUGIN_ID, console);
}

if (import.meta.main) {
  const { constants, source } = loadFixtureE();
  const titles = [...constants.matchAll(/const (FIXTURE_E_[A-Z_]+) =/g)].map((match) => match[1]);
  console.log(
    `fixture-e-calls: read ${titles.length} Fixture E constant(s) and a ${source.split("\n").length}-line ` +
      `applyFixtureE from ${path.relative(process.cwd(), SOURCE)}`
  );
  for (const title of titles) console.log(`  ${title}`);
}
