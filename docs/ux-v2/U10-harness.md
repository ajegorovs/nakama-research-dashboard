# U10 — fixtures and harness robustness

The chunk that makes a *skip* mean "this dataset genuinely has no subject" instead of "nobody wrote the
case". Two checks had been wired and skipping since U4; this pass supplies their subjects, fixes the class of
harness defect they exposed, and leaves the product model alone.

## 1. The two seeds (2026-10-02)

Both additions are **fixture data**, not page logic — the acceptance condition the reviewer set was that the
existing skips become passes without new UI. One fixture row does both jobs:

```js
{
  axisTitle: "Fixture: active axis (with evidence)",
  occurredAt: "2026-10-01T09:05:00+03:00",
  repositoryFullName: "fixture/0-bare-repository",
  sourceRef: "#92",
  sourceType: "github_pr",
  summary: "Fixture: opened the bare-repository PR that no topic or axis claims yet.",
}
```

- **One recorded activity that names a repository.** `reconcile_topic`'s activity input already accepted
  `repositoryFullName` (it upserts the repository and stores `repository_id`), so the Progress feed's
  repository `EntityTag` now has a subject and *"a repository tag in the Activity column lands in
  Repositories with that repository selected"* executes instead of skipping — on the fixture it now clicks
  the tag and lands on `fixture/0-bare-repository`.
- **A repository nothing else claims.** The same row creates it, and because no topic or axis links it, the
  Repositories view renders its `empty` notices ("no topic names it yet", "no axis names this repository").
  The name sorts first by `full_name`, so it is the view's default selection and both notices are on screen
  without a click. Together with the collapsed card's `truncated` notice, the notice check now asserts **both
  kinds** it was only theoretically wired for, deriving the expected kinds from the dataset's own projection
  (a bare repository → `empty`; a hidden-axis count in the DOM → `truncated`).

Fixture record: **107 · 0 · 0**. The fixture now records **zero skips** — every check has a subject.

## 2. The class it exposed: a subject chosen by *position* instead of by *property*

Adding a legitimately bare first repository turned three checks red, and all three had the same defect —
they took *whatever the view showed first* as the subject of a claim about a repository that supports work:

| Check | Was | Now |
|---|---|---|
| "the Repositories view is repository-first: what it supports and the work happening in it" | asserted `supports ≥ 1` and `axes ≥ 1` **about the first index row** | split: the index **is** the set and one of them is selected (true of every dataset), and *"a repository that supports work names the topics it supports and the axes happening in it"* — asserted against a repository chosen **by property** from the projection (`topicCount > 0`, axes > 0) and selected deliberately |
| the repository half of C9's tag check | searched the view's *default* panel for a topic tag | selects the first repository that links a topic, then reads that panel |
| "an axis tag clicked in Repositories lands in Progress/Axes" | read the axis tags of the default panel | selects the first repository **with axes**, then clicks its axis tag |

This is the same defect that had already corrupted a record (the repository *filter* check read
`CORPUS.repositories[0]`, and a bare first row would have made its expectation empty): it now chooses the
first repository **that supports an axis**. A check whose subject is absent skips with its reason; a check
whose subject was never in doubt must not depend on ordering. Two more of the same shape were caught while
this pass ran — a crash (`Cannot read properties of undefined (reading 'topics')`, which killed the run
mid-transcript) and a silent skip — both fixed by the same rule.

**Measured** (both viewports, each dataset on its own isolated instance):

| | fixture | corpus |
|---|---|---|
| U10 §1 (this pass) | **107 · 0 · 0** | **73 · 0 · 33** |
| U4 close | 105 · 0 · 1 | 72 · 0 · 33 |

The corpus keeps its skips, and they are now honest in the stronger sense: it has no repository-naming event,
no bare repository and no card hiding axes, so those three checks print their reasons instead of passing
vacuously. Closing them means seeding the *corpus* (U10's remaining items), not relaxing a check.

**What did not change:** no `src/ui.tsx` change and no rebuild — the served release and its hash are the ones
U4 closed on (`0.2.0+dev.caa231a415f0`, `ui/app.js` `aa3a478c39ca045d7e96`), which is the strongest available
evidence that this pass is harness and data only.


## 3. The dataset identity guard, and a record that cannot lie about being partial (2026-10-02)

Two evidence-integrity mechanisms, both at the harness layer. The reviewer's framing: *"a verifier should
refuse to produce an acceptance verdict if the instance does not match the requested dataset identity … this
is now an evidence-integrity requirement, not convenience."*

**Identity comes from durable markers, never from whatever renders first.** The fixture's identity is its own
naming — topics `Layout fixture …`, repositories under `fixture/`; the corpus's identity is the *absence* of
that naming. `read-pass.sh` exports `NAKAMA_EXPECT_DATASET` from `--dataset`, and the pass decides before any
check runs:

| requested | instance shows | verdict |
|---|---|---|
| fixture | fixture markers only | proceeds, and the identity line is recorded in the transcript |
| fixture | corpus markers | **REFUSED** — exit 3 |
| fixture | both fixture and corpus markers | **REFUSED** — exit 3 (the mixed instance) |
| corpus | any fixture marker | **REFUSED** — exit 3 |

Measured in both confusing directions, which are exactly the pairings that produced the contaminated records:

```
--dataset fixture  -> corpus instance
identity: expected fixture · 1 topic(s) (0 fixture-named) · 0 of 1 repository(ies) under fixture/ · observed corpus markers (no fixture-named topic or repository)
REFUSED  no verdict: the pass will not measure fixture against an instance that is corpus markers ...
read pass: REFUSED — no verdict, no record            [exit 3]

--dataset corpus   -> fixture instance
identity: expected corpus · 2 topic(s) (2 fixture-named) · 3 of 3 repository(ies) under fixture/ · observed fixture markers only
read pass: REFUSED — no verdict, no record            [exit 3]
```

**A partial record can no longer masquerade as a short one.** Two layers, because the trap has two halves:

- the pass itself prints `ABORTED  the pass stopped after N check(s) — this transcript is PARTIAL and is not an
  acceptance verdict`, the first frames of the error, and `read pass: ABORTED — partial record, ...`, then exits
  **2** — a code distinct from 1, which is a real verdict with failures in it;
- the wrapper captures the run to a scratch file and copies it into the committed transcript path **only for a
  verdict** (exit 0 or 1). On exit 2 or 3 it prints `read-pass: NOT RECORDED — the committed record at <path>
  is untouched; this run is at <scratch>` and leaves the repository alone.

Tested by injection rather than by inspection: a `throw` placed after the login check produced
`inline exit=2`, `wrapper exit=2`, the three ABORTED lines, and the committed fixture transcript still ending
in its own legitimate summary — `grep -c ABORTED` on it: **0**.

**Measured after the guard** (both viewports, each dataset on its own instance): fixture **107 · 0 · 0**,
corpus **73 · 0 · 33** — unchanged by this pass, which is the point: the guard adds a refusal, not a measurement.
