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


## 4. Corpus coverage, under the provenance rule (2026-10-02)

The reviewer's hierarchy for this pass, verbatim: *(1) prefer corpus-derived facts already present in the
replay/source material; (2) if a useful state cannot be derived, allow an explicitly owner-authored row,
clearly labelled as such in the corpus documentation; (3) if neither is truthful, leave the check skipped and
keep the reason.* And the constraint: **"Do not optimize for `0 skips`. The corpus is valuable precisely because
it remains an honest public-data corpus"**, with additions kept minimal and no artificial blocked/abandoned
states introduced merely because a check exists.

### 4a — each event's repository, derived from its own `sourceUrl` (rung 1)

Every one of the corpus's 694 events is read from one public repository's history, and the event's own
`sourceUrl` names that repository (`.../udv-echo-process/commit/<sha>`, `.../pull/<n>`); the axes declare the
same repository as primary. `record_activity` has always accepted `repositoryFullName` — the replay simply
never passed it, so **the corpus's activity rows carried no repository and the Activity-column repository tag
had no subject in any dataset**. `harness/replay-corpus.mjs` now derives it from the event's own URL, and the
replay reports the count (`694 event(s) take their repository from their own sourceUrl`). No row was added and
no field invented: the link was in the material and simply was not recorded.

Measured (both viewports, corpus-only instance): **73 · 0 · 33 → 74 · 0 · 32**. Exactly one check flipped,
the Activity-column repository tag, with no other change anywhere in the transcript.

### 4b — the corpus's own unmerged pull requests, as its problems (rung 1, one explicit inference)

The corpus's pull requests that never merged are the repository's own open work: **#68** and **#70** are OPEN
in the PR's own status (`PR #70 (open)`), and **#48** is a design review the repository CLOSED without merging.
The replayer derives one problem per unmerged PR — the statement is the PR's own subject line, the axis is the
axis this corpus already assigned that PR, the repository is the PR's own — and reads `resolved` for #48 by
**explicit inference** (`stateConfidence: inferred`), which is the habit this corpus already documents for its
axis states. Merged PRs are finished work, not problems, so none of them is seeded.

The three problems' own events are re-recorded through the topic write path (`reconcile_topic`'s `activities[]`
carry `problemId`; `record_activity`'s schema does not), so each event stays **one** row while also naming its
problem; the created ids are read back from the projection and matched on the PR's own subject line rather than
assumed. Replay output: `derived 3 problem(s) from this corpus's own unmerged pull requests, and 3 event(s)
now name theirs.`

Measured: **74 · 0 · 32 → 83 · 1 · 22** — ten more skips execute, and **one fails**.

### The failure this pass surfaced — ruled, fixed, and re-measured

**Ruling (reviewer, 2026-10-02): remove the fallback (option a).** *"In Axes mode, the central Problem card is
the selected axis's first open Problem in projection order. If there are zero open Problems, then there is no
Problem card to show for that axis. The axis itself still remains meaningful and the Activity column still
follows it."* Showing a resolved Problem under `Open problems (0)` is internally contradictory and weakens the
deliberate distinction between **Axes** (current/open work) and **Problems** (the full inventory, resolved
included). The seeds were not changed and no truthful skip was reduced.

**Fix** (`src/ui.tsx`, Axes mode): the card is now `axesModeProblems.filter((row) => row.state === "open")[0]
?? null` — no `axesModeProblems[0]` fallback. The empty state's text is now accurate to its cause: an axis with
resolved problems and none open reads **"No open problems on this axis."**, and only an axis with no problems at
all reads "Nothing is recorded against this axis." Resolved problems remain in the **Problems** subview, and the
corpus record proves it: *"the Problems index lists the projection's problems, in the server's order, with each
row's own state, axis, topic and recency — 3 row(s) of 3; order matches; fields match"*.

**Re-measured after the fix** (both viewports, separate instances): corpus **84 · 0 · 22** — the failing check
now passes as *"selected 3e5b5f94: problem axis 3e5b5f94, feed axis 3e5b5f94, shown (projection none open), 43
feed rows vs 43"*, i.e. no card, the axis still standing and the Activity column still following it. Fixture
**107 · 0 · 0**, unchanged by the fix. Release `0.2.0+dev.5a98360ab6cc` installed on both instances; source
`ui/app.js` `7f97ce64c530ab80128f` identical in the repo and the vendored checkout, and the two instances serve
byte-identical assets (Nakama route `ca730ec7fc2b7edb7277`, dashboard route `c80ada07b81f13e6164a`).

### The failure, as it was found (kept for the record)

`selecting another axis moves the Problem and Activity columns to that axis` fails because the page and the
projection disagree about an axis that has a **resolved** problem and no open one (the acquisition axis, from
PR #48): the column's own attribute says `data-rd-progress-problem-open="0"` and its heading reads
`Open problems (0)`, yet it renders a problem card. In `src/ui.tsx`, Axes mode picks the column's problem as
`axesModeProblems.filter((row) => row.state === "open")[0] ?? axesModeProblems[0] ?? null` — the `all[0]`
fallback was introduced with the accepted step-6 inversion and no dataset could exercise it until now (it
needs a corpus with a resolved problem and nothing open on the same axis). The accepted rule is *"the Problem
column shows the projection's first open problem, under the projection's own count"*, so **the check encodes
the rule and the page deviates from it**. It is left unfixed and recorded: the page is product design and this
pass is data/harness work. Ruling options: (a) drop the `?? axesModeProblems[0]` fallback — restores the
accepted rule, record goes green; (b) keep the fallback and change the check to expect a resolved problem for a
resolved-only axis, which also requires the heading to stop saying `Open problems`.

### What stays skipped, and why (rung 3 — every remaining skip)

22 skips remain, in **13 causes**; none is a candidate for an authored row, because each would require the
corpus to state something it does not (a blocked axis, a second repository, a plan, a bare problem, an
unattributable person, a topic with more than three axes, an evidence-free axis, a second topic, or an
extraordinary-state subject). The table is the decision, not an omission:

| skips | cause | rung | decision |
|---|---|---|---|
| 7 | no problem with more than one repository (the corpus has **one**) | 3 | left — a second repository would be invented |
| 3 | no problem with nothing behind it | 3 | left — a bare problem would be authored content |
| 3 | no axis carries a plan (incl. a plan step a problem names, and an unordered multi-step plan) | 3 | left — the material's axes carry prose states, not plans |
| 2 | all 3 axes carry evidence (the bare axis state) | 3 | left — an evidence-free axis would be hollow |
| 2 | no axis in this corpus is blocked | 3 | left — **explicitly** the artificial state the reviewer warned against |
| 1 | the topic leads with all 3 axes (LEAD_AXES = 3), so none are hidden | 3 | left — a fourth axis would be invented |
| 1 | the corpus links one person to 1 topic | 3 | left — the corpus is deliberately one topic |
| 1 | no resolved problem **on the axis on screen** (the axis has 2, both open) | 3 | left — #48's resolved problem is on another axis; moving it would falsify the corpus |
| 1 | every person maps to a platform account | 3 | left — the material has no unmapped person |
| 1 | no exceptional-state subject (no bare repository, no card hiding axes) | 3 | left — neither subject exists in the material |

**Counts after the ruling and the fix** (both viewports, separate instances): fixture **107 · 0 · 0**
(unchanged — the ruling did not touch it), corpus **84 · 0 · 22** (the finding above, closed).

### One harness regression found while recording this pass

The `set -euo pipefail` wrapper aborted *before* its new scratch-copy step when the runner exited 1 (a pass
with failures) — so a **red run silently left the previous green transcript in place**. The runner's exit 1 is a
verdict and must be recorded; the pipeline is now run under `set +e`. Caught because the record's mtime did not
move while the run printed `1 FAILED` — the same class as the mid-run crash that masqueraded as a short record,
one layer up.
