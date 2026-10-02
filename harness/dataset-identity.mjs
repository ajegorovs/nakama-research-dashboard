/**
 * dataset-identity.mjs — what an instance actually holds, decided from durable naming, then enforced.
 *
 * Why this is its own module: the acceptance pass must refuse to record a verdict for a dataset it was
 * not pointed at, and that decision has to be testable without a browser (harness/test-dataset-identity.mjs)
 * and readable on its own. `verify-page.mjs` imports it and prints what it decided; it holds no rule of
 * its own.
 *
 * THREE concepts, not two (reviewer ruling, C3 — see docs/ux-v2/C3-overview.md § "ruled on"):
 *
 *   corpus identity          the real corpus. Read from the absence of the other two, never from
 *                            "anything that is not the fixture", which is the dangerous rule: it would
 *                            make a mixed, empty or residue-carrying instance pass as a clean corpus.
 *   fixture identity         the synthetic layout fixture's own durable naming: topics "Layout fixture …",
 *                            repositories under "fixture/". Identity needs the *whole* topic set to be
 *                            fixture-named and at least one fixture repository — a fixture topic beside a
 *                            corpus topic is a mixed instance, not a fixture with a stray row.
 *   acceptance-write residue the topics a `--write` pass creates for itself ("ui-check <n>"). It is
 *                            neither corpus nor fixture data: it is the write pass's own footprint, and it
 *                            is exactly what a naming-based gate used to misread as a corpus marker. Its
 *                            presence in a normal run means the instance must be re-seeded first.
 *
 * The write pass itself may of course create and operate on its own `ui-check` subject — the gate runs
 * before it writes. What residue forbids is a *later* ordinary run measuring a contaminated instance.
 */

export const FIXTURE_TOPIC = /^layout fixture/i;
export const FIXTURE_REPOSITORY = /^fixture\//i;
// The write pass names its own subject `ui-check <n>` (`verify-page.mjs` — `ui-check ${Date.now()…}`), so
// the marker is that exact shape, not the prefix: a real topic called "ui-check policy review" is corpus
// data, and a gate that over-matches invents residue where there is none.
export const WRITE_RESIDUE = /^ui-check\s+\d+\s*$/i;

/** What an instance can look like, in the order the classifier settles it. */
export const KINDS = [
  "corpus",
  "fixture",
  "corpus+residue",
  "fixture+residue",
  "residue-only",
  "mixed",
  "empty",
];

/** Datasets a pass may be pointed at, and the one kind each accepts. */
export const ACCEPTED = { corpus: ["corpus"], fixture: ["fixture"] };

/**
 * Classify a dataset from the durable naming markers only — the topics' names and the repositories'
 * full names, as the payload reports them.
 */
export function classifyDataset({ topicNames = [], repositoryNames = [] } = {}) {
  const names = topicNames.map((name) => name ?? "");
  const repos = repositoryNames.map((name) => name ?? "");
  const fixtureTopics = names.filter((name) => FIXTURE_TOPIC.test(name));
  const residueTopics = names.filter((name) => WRITE_RESIDUE.test(name));
  const corpusTopics = names.filter(
    (name) => !FIXTURE_TOPIC.test(name) && !WRITE_RESIDUE.test(name)
  );
  const fixtureRepositories = repos.filter((name) => FIXTURE_REPOSITORY.test(name));
  const showsFixture = fixtureTopics.length > 0 || fixtureRepositories.length > 0;
  const hasResidue = residueTopics.length > 0;

  let kind;
  if (names.length === 0 && repos.length === 0) {
    // An empty store is not a clean corpus: it is the state a wipe leaves before the replay, and every
    // check would be reading a dataset that is not there.
    kind = "empty";
  } else if (showsFixture && hasResidue) {
    kind = corpusTopics.length > 0 ? "mixed" : "fixture+residue";
  } else if (showsFixture) {
    kind =
      corpusTopics.length === 0 &&
      fixtureTopics.length === names.length &&
      fixtureRepositories.length > 0
        ? "fixture"
        : "mixed";
  } else if (hasResidue) {
    kind = corpusTopics.length > 0 ? "corpus+residue" : "residue-only";
  } else {
    kind = "corpus";
  }

  return {
    counts: {
      corpusTopics: corpusTopics.length,
      fixtureRepositories: fixtureRepositories.length,
      fixtureTopics: fixtureTopics.length,
      repositories: repos.length,
      residueTopics: residueTopics.length,
      topics: names.length,
    },
    kind,
    residue: residueTopics,
  };
}

/** The observed-state phrase used in the pass's own output and in the refusal. */
export function observedPhrase(classification) {
  const { counts, kind } = classification;
  switch (kind) {
    case "corpus":
      return "corpus markers (no fixture-named topic or repository, no write residue)";
    case "fixture":
      return "fixture markers only";
    case "corpus+residue":
      return `the corpus plus acceptance-write residue (${classification.residue.join(", ")})`;
    case "fixture+residue":
      return `the fixture plus acceptance-write residue (${classification.residue.join(", ")})`;
    case "residue-only":
      return `only acceptance-write residue (${classification.residue.join(", ")})`;
    case "mixed":
      return counts.fixtureTopics > 0 || counts.fixtureRepositories > 0
        ? "BOTH fixture and corpus markers — a mixed instance"
        : "more than one dataset's markers";
    default:
      return "no dataset at all (no topic and no repository)";
  }
}

/** What to do about it — a refusal that does not say how to fix it is only half a refusal. */
export function fixHint(classification) {
  switch (classification.kind) {
    case "corpus+residue":
    case "fixture+residue":
    case "residue-only":
      return (
        "the write pass's own subject is still on the instance — wipe its rows and re-apply the dataset " +
        "you mean to measure (harness/apply-layout-fixture.mjs, or harness/replay-corpus.mjs), then re-run"
      );
    case "empty":
      return (
        "the instance holds no dataset — apply the corpus (harness/replay-corpus.mjs) or the fixture " +
        "(harness/apply-layout-fixture.mjs), then re-run"
      );
    default:
      return (
        "apply the dataset you mean to measure to an instance of its own " +
        "(harness/apply-layout-fixture.mjs, or the corpus seed), then re-run"
      );
  }
}

/** The verdict: does this instance hold the dataset the run was pointed at? */
export function verifyDataset(expected, classification) {
  const accepted = ACCEPTED[expected];
  if (!accepted) {
    return { ok: true, reason: null };
  }
  return accepted.includes(classification.kind)
    ? { ok: true, reason: null }
    : { ok: false, reason: observedPhrase(classification) };
}
