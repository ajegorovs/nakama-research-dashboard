# Coverage-contract correction record — final bounded acceptance (documentary)

**Date:** 2026-10-11
**Subject:** the reviewer's decision on the *final bounded acceptance* coverage ledger, and the bounded
**documentary** correction it authorised — the 19 formerly-mandatory `current-relevant-missing` rows
reconciled against the current four-tab contract, and an exact passing trace for every *replaced* and
*duplicate* row. Corrected packet: `coverage-contract-corrected-2026-10-11` (private reviewer ZIP).
**Public-record hygiene:** this record carries labels, not live endpoints, private ids or credentials.

## Verdict

> Reviewer verdict: **ACCEPT THE EVIDENCE INVENTORY; REQUEST CHANGES TO THE COVERAGE CLASSIFICATION.**

**Verbatim boundary.** That sentence is the reviewer's decision, quoted **exactly**. The reviewer's **full
written response was provided to the requester** and is **not reproduced here** (hygiene/length); this
record carries the decision verbatim plus the reviewer's **authoritative qualifications** as they bear on
this correction. Nothing here is fabricated or reconstructed.

## Reviewer qualifications (authoritative)

- **Person-notes (Grant C) — optional, retained.** The retained gap stands as a documented boundary. **No
  public-API expansion** and **no DB injection** is granted to reach it.
- **Bare-repository (a repository with neither a topic link nor a current axis) — a genuine public-seed
  gap.** Keep the **strict** assertion (`noTopic AND noAxis`); it is **retained, not executed** in this
  pass. A served confirmation run is a **fresh** review scope; **no fixture grant** is made.
- **Repository page-race (PR) — qualification, NOT causal proof.** The identified shared mechanism is
  `PagedActivityFeed` with the `active` abort guard (`src/ui.tsx` ~2700) — the *same* component for both
  scopes; the guard mutant is contrasted against the **`loadDetail` generation** counter (`src/ui.tsx`
  ~4675-4680, ~4936), and `get_topic` is a **separate** path. An **independent repository-only guard is NOT
  demonstrated**; do **not** claim one. The endpoint is `list_activity` with `repositoryId` (the shared
  PagedActivityFeed). The repository counter-fail remains unresolved and is reported as such.
- **Deploy identity — defer.** No named deployment target and no expected served-build/release hash was
  supplied; none is guessed. No read-live probe, install or restart is implied.

## What the decision does — and does not — authorise

- It **accepts the evidence inventory** (the 62-row SKIP ledger, the build identity, the two focused
  diagnoses, the retained archives).
- It **requests changes to the coverage classification only** — a **documentary** reconciliation, not a
  product or harness change.
- It does **NOT** authorise a fixture mutation, a new instance, a harness behaviour change, a source change,
  a new execution, a deployment/restart, or a commit/push/tag/merge.
- The evidence remains a **bounded, local** acceptance artifact — **explicitly NOT production acceptance**.

## The correction applied (this pass; documentary only)

- **19 formerly-mandatory rows reconciled** against the current product build (`ui/app.js` sha256
  `8de8954c…`, `actions/actions.js` `bd4139a4…`) and the current instrument (`harness/verify-page.mjs`
  `a12f9ccc…`): **11 → explicit retired** (pivot-removed surfaces; **hooks absent from the built bundle**),
  **4 → migrated, covered** by a passing current-surface re-point (#38, #43, #44, #46), **1 → migrated,
  open** with no exact equivalent (#18 — the only re-point asserts *no-progress*, which is **not**
  *no-evidence*), **3 → genuine current gap** (#11, #60, #61 — current hooks, seedable through the public
  write path).
- **15 traces** (the ledger's 12 *replaced* + 3 *duplicate*) proved from the **retained** per-check result
  JSON (190 checks per viewport). Two of the twelve (*replaced* #17 evidence line, #24 per-axis history)
  resolve to **none** and are **reclassified migrated-open**. See the corrected public doc
  `docs/design/dashboard-final-bounded-acceptance.md` §11.
- **Corrected totals:** retired **39**, replaced **14**, duplicate **3**, current-relevant-missing **3**,
  migrated-open **3** (Σ 62) — from 28 / 12 / 3 / 19 (Σ 62). Covered **17**, optional **39**, mandatory
  **3**, not-covered **3**.
- **Instrument correspondence labelled, not asserted identical:** 170/190 retained result titles are
  verbatim literals in the current instrument; the other 20 are the source title **truncated at the first
  ` — `** (a parser artifact of the `<title> — <detail>` transcript format), **not** content drift. The
  retained run is labelled **consistent-with**, not a byte-identical measurement of, the current
  instrument; the raw stdout of the 128/0/62 run was not captured.

## Boundaries (stated, not implied)

- **No new execution.** No instance was started or written; no fixture was mutated; no `harness:*` exit is
  claimed for this pass. The traces are read from the retained run.
- **No product or harness change.** `harness/verify-page.mjs` and `src/**` are byte-identical to the
  measured build (their recorded shas). The correction lives in documents and a private packet.
- **Preserved, not rewritten.** The original 62-row ledger, the superseded doc text (§1–§10) and every
  historical archive/transcript are immutable; the correction is additive and dated (§11).
- **Not published.** The reviewer packet README is a **local note**, not a published artifact; nothing was
  uploaded or pushed.
- **Findings reported, not fixed.** One instrument-reason defect is reported (see the receipt): the SKIP
  reason for the retired step-5 problem surface is selected by an **inverted** ternary, so it prints the
  *dataset-lack* reason where the *pivot-retired* reason is intended. NOT fixed here.
