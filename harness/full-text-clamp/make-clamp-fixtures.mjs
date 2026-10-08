/**
 * make-clamp-fixtures.mjs — build the preview payload the full-text-clamp regression check mounts.
 *
 * The clamp-release check needs one axis whose `currentState` is long enough to be clipped by the
 * shipped 2-line clamp, and the real subject it is written for. The corpus dataset has no such axis
 * (its longest state is 127 chars — two lines, nothing to release), so this reads the corpus payload,
 * replays the committed transcript through the real action layer (make-fixtures.mjs, so the shape is
 * the server's, not a hand-written mock), then rewrites three axes of the one topic:
 *
 *   - axis 0 → the F08 subject: title and `currentState` verbatim from the approved design's subject
 *     string (411 chars) — the exact string the reader could not read when the fold was open;
 *   - axis 1 → a short state ("no progress note" length) so the expansion must be a visual no-op;
 *   - axis 2 → left as the corpus states it (a "medium" clamped state, unchanged by the check).
 *
 * This is a PREVIEW payload for the check. It is NOT served data and NOT the live fixture instance; the
 * F08 string is public and copied byte-for-byte, never paraphrased.
 *
 *   bun harness/full-text-clamp/make-clamp-fixtures.mjs --out <path>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const OUT = flag("out", path.join(import.meta.dir, "clamp-fixtures.json"));
const SOURCE = flag("source", path.join(import.meta.dir, "..", "preview", "make-fixtures.mjs"));

// The F08 subject string, verbatim from `.hermes/scratch/full-text-access-design.md` §1 (411 chars).
export const F08_STATE =
  "High-rate optical acquisition has a hardware-validated baseline (\u2248351 FPS preview; a 200-frame capture wrote Image_00000.bmp\u2013Image_00199.bmp; a 2000-frame capacity run's manual Stop & Save wrote partial sequences of 652 and 1028 frames). Sustained 300\u2013350 FPS operation with dropped-frame measurement remains outstanding; core/CaptureStats is implemented and covered by 13 tests but no production code calls it.";
export const F08_TITLE = "Grablink diagnostics and sustained-rate validation";
export const TOPIC = "Experimental research";
// A public blocker sentence (the WP5 manifest's axis-4 blocker, verbatim). It gives the Repositories
// scan rows a `[data-rd-scan-axis]` reading to keep clamped — the fold-less boundary the rule must not touch.
export const BLOCKER =
  "Connected-camera sustained-rate and full-buffer validation remain required; dropped-frame behavior at 300\u2013350 FPS is not yet fully instrumented.";

const { spawnSync } = await import("node:child_process");
const built = spawnSync(
  "bun",
  [SOURCE, "--dataset", "corpus", "--out", OUT],
  { encoding: "utf8" }
);
if (built.status !== 0) {
  console.error(built.stdout);
  console.error(built.stderr);
  process.exit(built.status ?? 1);
}

const payload = JSON.parse(readFileSync(OUT, "utf8"));
const topicKey = Object.keys(payload.responses).find((key) => key.startsWith("get_topic:"));
if (!topicKey) {
  console.error("make-clamp-fixtures: the corpus payload carries no get_topic response");
  process.exit(2);
}
const topic = payload.responses[topicKey];
if (!Array.isArray(topic.axes) || topic.axes.length < 3) {
  console.error(`make-clamp-fixtures: expected >=3 axes, found ${topic.axes?.length ?? 0}`);
  process.exit(2);
}

topic.topic.title = TOPIC;
topic.axes[0].title = F08_TITLE;
topic.axes[0].currentState = F08_STATE;
topic.axes[0].currentStateConfidence = "inferred";
// The corpus's first axis is `completed`, which renders inside the closed "Completed and abandoned
// axes" fold — the walk cannot reach a summary inside a closed disclosure. The real F08 axis is
// `active`; promote it so it renders in the open lane, where the fold is a live control.
topic.axes[0].state = "active";
topic.axes[0].stateConfidence = "confirmed";
topic.axes[1].currentState = "no progress note";

// Give the Repositories scan rows a blocker reading (fold-less). The rule is scoped to fold-owning rows,
// so these must stay clamped; a scan row with no reading could not show that.
for (const [key, resp] of Object.entries(payload.responses)) {
  if (!key.startsWith("get_overview")) continue;
  for (const repo of resp.repositories ?? []) {
    if (!Array.isArray(repo.axes) || repo.axes.length === 0) continue;
    repo.axes[0].blocker = BLOCKER;
    repo.axes[0].blockerConfidence = "confirmed";
  }
}

writeFileSync(OUT, `${JSON.stringify(payload)}\n`);
console.log(
  `make-clamp-fixtures: ${OUT}\n` +
    `  topic '${TOPIC}' · axis[0] '${F08_TITLE}' currentState ${F08_STATE.length} chars · ` +
    `axis[1] short (${topic.axes[1].currentState.length}) · axis[2] medium (${topic.axes[2].currentState?.length ?? 0})`
);
