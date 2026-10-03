/**
 * corpus-derivation.mjs — the corpus's derived states, read from the source the instance replay uses.
 *
 * `harness/replay-corpus.mjs` does two things the transcript does not state outright, and both belong to
 * the dataset rather than to the preview: it takes each activity's repository from that activity's own
 * `sourceUrl`, and it reads the corpus's *unmerged pull requests* as the repository's open work — two
 * OPEN in the PR's own status, one CLOSED without merging (read as resolved by explicit inference, the
 * corpus's documented habit). Nothing there is hand-typed; the statement is the PR's own subject line.
 *
 * The preview needs the same states. So rather than restate that derivation, this module slices the very
 * block out of `replay-corpus.mjs` and runs it. One source, two callers — a preview that derived its own
 * problems would drift from the corpus the instance seeds the moment either is edited.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const SOURCE = path.join(import.meta.dir, "..", "replay-corpus.mjs");
const START = "const repositoryOfSource =";
const END = "\nlet login;";

/** The derivation block, sliced whole: the repository reader plus the problems/linked-activities builder. */
export function corpusDerivationBlock() {
  const text = readFileSync(SOURCE, "utf8");
  const from = text.indexOf(START);
  const to = text.indexOf(END, from);
  if (from === -1 || to === -1 || to <= from) {
    throw new Error(`corpus-derivation: could not find the derivation block in ${SOURCE}`);
  }
  return text.slice(from, to);
}

/**
 * Apply the corpus's derivation to the transcript `rows` (mutating them: each `record_activity` gains its
 * `repositoryFullName`, and each unmerged-PR row is flagged `movedToProblem`). Returns the problems and the
 * activities that name them, exactly as `replay-corpus.mjs` computes them.
 */
export function deriveCorpusProblems(rows) {
  const block = corpusDerivationBlock();
  const run = new Function(
    "rows",
    `${block}\nreturn { derivedProblems, derivedRepositories, linkedActivities };`
  );
  return run(rows);
}

if (import.meta.main) {
  const transcript = path.join(import.meta.dir, "..", "..", "docs", "corpus", "transcript", "actions.jsonl");
  const rows = readFileSync(transcript, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.action !== undefined)
    .map((record) => ({ action: record.action, input: record.input ?? {} }));
  const { derivedProblems, derivedRepositories, linkedActivities } = deriveCorpusProblems(rows);
  console.log(
    `corpus-derivation: ${derivedRepositories} activity(ies) take their repository from their own sourceUrl · ` +
      `${derivedProblems.length} problem(s) derived from this corpus's own unmerged pull requests`
  );
  for (const problem of derivedProblems) {
    console.log(`  ${problem.state.padEnd(8)} ${problem.statement}`);
  }
  console.log(`  ${linkedActivities.length} problem-linked activity(ies)`);
}
