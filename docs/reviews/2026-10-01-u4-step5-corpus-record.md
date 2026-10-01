# U4 step 5 — the corpus record, and what re-measuring it exposed (2026-10-01)

**Status:** step 5 is complete, committed and pushed (`ux-v2` at `4f09983`; the plugin work is `02e8c0a` +
`1203b09`). **Decisions I would like confirmed are at the end.**
**Evidence:** `../corpus/verify-read.txt` · `verify-read-1280x800.txt` · `../layout-fixtures/verify-fixture-read-*.txt` ·
`../ux-v2/U4-progress.md` §13 (**step 5**) and **§16** (this re-measurement).

## What changed in the numbers, and why

| dataset | instance | record (both viewports) | before |
|---|---|---|---|
| corpus (695-call replay) | `:4500`, corpus only | **52 pass · 0 fail · 26 skip** | 43 · 0 · 7 |
| fixture (applied once) | `:4400`, fixture only | **80 · 0 · 0** | 80 · 0 · 0 |

**The corpus figure was never a corpus-only measurement.** The record it replaces (`43 · 0 · 7`, out of 50
checks) was taken against the shared dev instance and predates the checks steps 3–5 added. That instance
carries corpus **and** fixture data in one org — demonstrated rather than asserted: a corpus pass pointed at the
dev dashboard today reads a payload of **6 axes / 2 people / 3 repositories** whose selected topic is
`Layout fixture — crowded card`, i.e. the corpus pass was reading the fixture dataset next to the corpus one.
This is the U10 mixed-instance problem, showing up in the corpus evidence path itself.

The new record is measured on an instance of its own: fresh data root, plugin installed **and enabled** (the
enable is what creates the org's data store), the committed 695-call replay seeded into it (all 695 accepted,
65.5 s). Release `0.2.0` — a fresh *install* publishes the packaged version; only a *reinstall* mints
`+dev.<digest>` — revision 4, generation `g724c4ea…`; the served bytes are byte-identical to the repository's
build (`ui/app.js` sha256 `4b4b7361…`), so the published screenshots now rest on this run.

**The 26 skips are a finding, not noise.** This corpus has **no problem row and no plan**, so every check whose
subject is a problem — the Problem column, the open-problem inventory, repository threads, evidence, human
steering, the sparse negative cases — cannot be exercised on it. Each prints `SKIP` with its reason and is
counted in the summary line, so `0 failed` cannot be read as `everything exercised`. The 20 extra skips over the
old 7 are exactly the states the corpus has never had; the fixture run is where they become real checks.

## The harness defects the corpus re-run exposed

All three are one class: **a check whose subject the dataset lacks killed the run instead of saying so.**

1. The step-5 block read its subject unguarded. With no problem carrying more than one repository,
   `withRelations.axisId` threw, and the pass **died after 40-odd checks** having reported nothing about the
   page. It is now guarded, and its seven checks print `SKIP` with a reason.
2. Four step-2/step-4 checks reported **FAIL** for a subject the corpus does not have (the Problem column, the
   inventory listing, its row context, the active row), and a fifth passed **vacuously** — a form like
   `expectedOpen.length === 0 || …` is a green tick on a dataset with nothing to tick. All five now `SKIP`.
3. The repository-filter check derived its expected topics from `row.topic` — a field the projection's axis row
   does not have; the row carries **`topicName`** (`store.ts:4002`). A field name a row lacks yields `null` per
   rail rather than an error, so the expectation collapsed to `[]` and the check was **red on every dataset**,
   corpus or fixture. It was the derivation step 3's rework had just introduced, which is why the earlier
   reading ("the filter worked while the check failed") was only half the story. It passes on both now.

## The fixture total did not move to 81 — it is 80, with one check swapped

Step 5's edits add the three-halves precondition (**+1**) and fold the fixture's closed-out-problem precondition
into the conditional that replaced it (**−1**). Verified by diffing the two runs' check lists: exactly one
description left, exactly one arrived. Measured after the edits: **80 · 0 · 0** at 1440×900 and 1280×800.
The expectation of 81 counted the addition and missed the removal; the run's own summary line is the authority.

## The `authorType` decision, restated

The action surface does **not** accept `authorType` for a new annotation — "the author is taken from the
session, never from input". An agent therefore cannot launder its own text into the human-authored class that
protects a steering claim from being rewritten. The cost, stated rather than hidden: the agent-authored case is
testable **in-process** (an agent actor is constructible there) and not through the fixture, whose session is the
human seed admin. The fixture proves the exclusions it can — an ordinary note is not a claim, a claim aimed at an
axis is not a claim about each problem beneath it — and the contract test carries the fourth case, with the
database as the counter-check (four annotations on one problem; one row in the read, three in the table).

## What I would like confirmed

1. **The corpus record as committed**: `52 · 0 · 26` on a corpus-only instance supersedes `43 · 0 · 7`
   everywhere it was cited (README, `docs/corpus/`, `docs/layout-fixtures/`, `docs/ux-v2/{STATUS,U3-surface,
   U4-progress}`). Historical figures are kept and marked superseded, not rewritten.
2. **The skip convention as the standard**: a check whose subject the dataset lacks prints `SKIP <reason>` and is
   counted — never a red FAIL for a case the dataset never had, and never a silent pass.
3. **The fixture staying at 80.** I did not invent a check to reach the predicted 81. If the reviewer wants the
   total to move, the honest way is a check with a real subject, not a counter.
4. **Whether the corpus deserves a stronger record than "52 passes with 26 skips".** The corpus is the density
   reference and cannot exercise the problem/plan/steering surface at all; if the intended evidence for steps 4–5
   is the fixture alone, saying so once in `docs/corpus/README.md` would be clearer than a skip list read as a
   gap. (My reading: the fixture is the acceptance record for those sections, and the corpus record proves the
   parts the corpus does have.)

Steps 6–7 of U4 remain: step 6 is the `Axes | Problems` subview, where the read shape and the client-side
problem subsetting come back for reassessment; step 7 propagates the shared primitives into Topics,
Repositories, People and Overview.
