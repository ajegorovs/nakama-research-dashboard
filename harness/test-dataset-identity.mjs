#!/usr/bin/env bun
/**
 * test-dataset-identity.mjs — the C3 identity ruling, asserted case by case, without a browser.
 *
 *   bun harness/test-dataset-identity.mjs
 *
 * The pass refuses to record a verdict for an instance that is not the dataset it was pointed at, and
 * that decision used to be an inline rule inside a 5,900-line browser script — so the one behaviour that
 * protects every record could only be exercised by mutating a real instance. It lives in
 * `dataset-identity.mjs` now, and this is its test: the five states the reviewer named, plus the two the
 * ruling implies but does not spell out (an empty store, and residue with nothing else on the instance).
 *
 * The three that matter most, because they are the ones a naming-only rule gets wrong:
 *   * a `ui-check <n>` topic is *write residue*, not a corpus marker — the fixture must not read as mixed;
 *   * an empty store is not a clean corpus — a corpus run must refuse rather than measure nothing;
 *   * residue must not be accepted as either dataset, in either direction.
 */
import {
  ACCEPTED,
  KINDS,
  classifyDataset,
  fixHint,
  observedPhrase,
  verifyDataset,
} from "./dataset-identity.mjs";

let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(`${label} — ${detail || "condition was false"}`);
    console.log(`  FAIL  ${label}\n        ${detail || "condition was false"}`);
  }
}

const CORPUS = {
  repositoryNames: ["ajegorovs/udv-echo-process"],
  topicNames: ["UDV Echo Process"],
};
const FIXTURE = {
  repositoryNames: [
    "fixture/0-bare-repository",
    "fixture/crowded-card",
    "fixture/second-topic",
  ],
  topicNames: ["Layout fixture — crowded card", "Layout fixture — second topic"],
};

/** Assert a classification's kind, both verdicts, and that the kind is a declared one. */
function case_(label, input, kind, accepts) {
  const classification = classifyDataset(input);
  check(
    `${label} → ${kind}`,
    classification.kind === kind,
    `classified as ${classification.kind} (counts ${JSON.stringify(classification.counts)})`
  );
  check(`${label} · kind is declared`, KINDS.includes(classification.kind), classification.kind);
  for (const expected of ["corpus", "fixture"]) {
    const verdict = verifyDataset(expected, classification);
    const wanted = accepts.includes(expected);
    check(
      `${label} · ${expected} run ${wanted ? "accepted" : "refused"}`,
      verdict.ok === wanted,
      wanted ? `refused: ${verdict.reason}` : "accepted an instance it should refuse"
    );
    if (!wanted) {
      check(`${label} · refusal for ${expected} says what was observed`, Boolean(verdict.reason));
      check(`${label} · refusal for ${expected} says what to do`, fixHint(classification).length > 0);
    }
  }
  return classification;
}

console.log("dataset identity — the ruling, as cases");

case_("clean corpus", CORPUS, "corpus", ["corpus"]);
case_("clean fixture", FIXTURE, "fixture", ["fixture"]);

// The ruling's own subject: a fixture write run leaves a ui-check topic behind, and that used to read as
// BOTH fixture and corpus markers, which refuses every later fixture run with the wrong diagnosis.
const fixtureResidue = case_(
  "fixture + write residue",
  { ...FIXTURE, topicNames: [...FIXTURE.topicNames, "ui-check 1"] },
  "fixture+residue",
  []
);
check(
  "fixture + write residue names the residue",
  observedPhrase(fixtureResidue).includes("ui-check 1"),
  observedPhrase(fixtureResidue)
);
check(
  "fixture + write residue does not read as a corpus marker",
  !observedPhrase(fixtureResidue).toLowerCase().includes("both"),
  observedPhrase(fixtureResidue)
);

const corpusResidue = case_(
  "corpus + write residue",
  { ...CORPUS, topicNames: [...CORPUS.topicNames, "ui-check 90143"] },
  "corpus+residue",
  []
);
check(
  "corpus + write residue names the residue",
  observedPhrase(corpusResidue).includes("ui-check 90143"),
  observedPhrase(corpusResidue)
);

case_(
  "corpus + fixture subjects",
  {
    ...FIXTURE,
    topicNames: [...FIXTURE.topicNames, ...CORPUS.topicNames],
    repositoryNames: [...FIXTURE.repositoryNames, ...CORPUS.repositoryNames],
  },
  "mixed",
  []
);
case_(
  "fixture topics + corpus topic + residue",
  {
    ...FIXTURE,
    topicNames: [...FIXTURE.topicNames, "UDV Echo Process", "ui-check 2"],
  },
  "mixed",
  []
);
case_("wipe with no replay", { repositoryNames: [], topicNames: [] }, "empty", []);
case_("residue only", { repositoryNames: [], topicNames: ["ui-check 3"] }, "residue-only", []);
case_(
  "fixture topics without a fixture repository is not fixture identity",
  { repositoryNames: ["ajegorovs/udv-echo-process"], topicNames: FIXTURE.topicNames },
  "mixed",
  []
);
case_("corpus topic without repositories", { ...CORPUS, repositoryNames: [] }, "corpus", [
  "corpus",
]);

// Boundaries of the markers themselves — a gate that over-matches is as wrong as one that under-matches.
check(
  "a corpus topic that mentions ui-check is not residue",
  classifyDataset({ ...CORPUS, topicNames: ["ui-check policy review"] }).kind === "corpus",
  classifyDataset({ ...CORPUS, topicNames: ["ui-check policy review"] }).kind
);
check(
  "fixture naming is matched case-insensitively",
  classifyDataset({
    repositoryNames: ["fixture/one"],
    topicNames: ["layout fixture — lower case"],
  }).kind === "fixture",
  classifyDataset({ repositoryNames: ["fixture/one"], topicNames: ["layout fixture — x"] }).kind
);
check(
  "a repository merely containing 'fixture/' is not fixture naming",
  classifyDataset({
    repositoryNames: ["org/not-fixture/thing"],
    topicNames: ["UDV Echo Process"],
  }).kind === "corpus",
  classifyDataset({ repositoryNames: ["org/not-fixture/thing"], topicNames: ["UDV Echo Process"] })
    .kind
);
check(
  "an unknown --dataset is not enforced here",
  verifyDataset("", classifyDataset(CORPUS)).ok === true,
  "an empty expectation must not refuse"
);
check(
  "the accepted kinds are exactly corpus and fixture",
  JSON.stringify(ACCEPTED) === JSON.stringify({ corpus: ["corpus"], fixture: ["fixture"] }),
  JSON.stringify(ACCEPTED)
);

console.log("");
if (failures.length > 0) {
  console.log(`dataset-identity: ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  process.exit(1);
}
console.log(`dataset-identity: all ${passed} checks passed`);
