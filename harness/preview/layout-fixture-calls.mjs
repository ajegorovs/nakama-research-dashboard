/**
 * layout-fixture-calls.mjs — the synthetic layout-fixture dataset, as local action calls.
 *
 * `harness/apply-layout-fixture.mjs` declares its dataset once, as a `FIXTURE` array of `reconcile_topic`
 * payloads, and applies it over HTTP. The preview wants the *same* dataset, locally, without a server —
 * and a second, hand-written copy would drift from the first the moment either is edited. So this module
 * reads that file and takes the array from it, rather than restating it.
 *
 * It is a reader, not a re-implementation: it extracts the three payload helpers (`repo`, `repoLink`,
 * `person`) and the `FIXTURE` array literal and evaluates exactly those declarations. Nothing in
 * `apply-layout-fixture.mjs` is modified, and no network or environment is touched.
 *
 * Boundary, stated: this is the `FIXTURE` array only — the plain `reconcile_topic` calls the fixture
 * instance is seeded from first. **Fixture E** (the open problem, its plan steps and the steering note) is
 * applied by that file's own `applyFixtureE`, which resolves store-minted ids between two calls; it is read
 * separately, from the same file, by `harness/preview/fixture-e-calls.mjs`, and applied after this array.
 * The preview's Progress view therefore shows Fixture E's problem rows too. The corpus dataset derives its
 * own problems the same way, out of `harness/replay-corpus.mjs`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = path.join(import.meta.dir, "..", "apply-layout-fixture.mjs");

/** Slice a balanced `[...]` literal starting at `marker`, respecting strings and comments. */
function sliceArrayLiteral(text, marker) {
  const from = text.indexOf(marker);
  if (from === -1) {
    throw new Error(`layout-fixture-calls: '${marker}' not found in ${SOURCE}`);
  }
  let i = text.indexOf("[", from);
  let depth = 0;
  let quote = null;
  let out = "";
  for (; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\") out += text[++i];
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        out += ch;
        return out;
      }
    }
    out += ch;
  }
  throw new Error(`layout-fixture-calls: unterminated literal at '${marker}'`);
}

export function layoutFixtureCalls() {
  const text = readFileSync(SOURCE, "utf8");
  const helpers = ["repo", "repoLink", "person"]
    .map((name) => {
      const match = text.match(new RegExp(`const ${name} = [^\\n]+;`));
      if (!match) {
        throw new Error(`layout-fixture-calls: helper '${name}' not found in ${SOURCE}`);
      }
      return match[0];
    })
    .join("\n");
  const literal = sliceArrayLiteral(text, "const FIXTURE = [");
  const fixture = new Function(`${helpers}\nreturn ${literal}\n`)();
  if (!Array.isArray(fixture) || fixture.length === 0) {
    throw new Error("layout-fixture-calls: the FIXTURE array came back empty");
  }
  return fixture.map((entry) => ({ action: "reconcile_topic", input: entry }));
}

// `--check` prints what was read, so a change to the source file that breaks the read is visible here
// rather than as a quietly smaller dataset.
if (import.meta.main) {
  const calls = layoutFixtureCalls();
  const axes = calls.reduce((n, c) => n + (c.input.axes?.length ?? 0), 0);
  const blocked = calls.reduce(
    (n, c) => n + (c.input.axes ?? []).filter((a) => a.state === "blocked").length,
    0
  );
  console.log(
    `layout-fixture: ${calls.length} topics · ${axes} axes · ${blocked} blocked · ` +
      `${new Set(calls.flatMap((c) => (c.input.people ?? []).map((p) => p.displayName))).size} people · ` +
      `${new Set(calls.flatMap((c) => (c.input.repositories ?? []).map((r) => r.fullName))).size} repositories ` +
      `(declared in FIXTURE; activities may reference more, which the store derives — the page then shows them)`
  );
  for (const { input } of calls) console.log(`  ${input.topicName}`);
}
