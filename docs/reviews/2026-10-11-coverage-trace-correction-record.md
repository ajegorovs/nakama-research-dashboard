# Coverage trace correction — final bounded acceptance (documentary)

**Date:** 2026-10-11
**Subject:** the reviewer's decision on the *final bounded acceptance* coverage correction, and the
bounded **documentary** trace corrections it required — **five** targeted fixes to the trace set in
§11.4/§11.5 of `docs/design/dashboard-final-bounded-acceptance.md`. Corrected public section: **§12**.
Private trace-corrected ledger: `.hermes/scratch/coverage-trace-corrected-ledger.json`.
**Public-record hygiene:** this record carries labels, not live endpoints, private ids or credentials.

## Verdict

> Reviewer decision: **SUBSTANTIVE RECONCILIATION ACCEPTED — TRACE CORRECTIONS REQUIRED.**

**Verbatim boundary.** That sentence is the reviewer's decision, quoted **exactly**. The reviewer's full
written response was provided to the requester and is **not reproduced here** (hygiene/length); this
record carries the decision verbatim plus the required corrections. Nothing here is fabricated.

## What the decision means

- The **substantive reconciliation** of the previous pass — the 19-row `current-relevant-missing`
  classification, the corrected totals (39 retired / 14 replaced / 3 duplicate / 3 mandatory /
  3 migrated-open), and the four migrated-covered re-points — is **accepted**.
- The **traces** were sent back: **five** targeted documentary trace corrections are required. This is a
  **documentary** correction, **not** a product, harness, dataset or instance change.

## The five corrections applied (this pass; documentary only)

| # | target | correction |
|---|---|---|
| **C1** | **#62** `replacementCheck` | Re-pointed to the **Repositories** pager check, EXACT **"the rail's remainder is one page away, and paging changes only what is shown"** (`harness/verify-page.mjs:6792`, `[data-rd-repository-panel] .rd-pager`) — **not** the Topics/Projects rail pager (`:1222`). Retained result **PASS at both viewports**; `replacementStableId = ck_d35a176fbdb8`. |
| **C2** | **#3, #16, #26** `semanticEquivalence` | Narrowed **exact → partial**: #3 count-consistency only; #16 badge state/confidence only (not the full axis-metadata field set nor all claims); #26 workstream recency only (not the retired Problems-entity subject). |
| **C3** | **#60** hook state | Recorded as **current-present** — the `[data-rd-notice]` hook is in the built bundle and the check asserts a recognised kind `{empty, filtered, truncated}` with **no entity tags**. No "retired (hook absent)". Class unchanged: **genuine current gap**. |
| **C4** | **#11** future test | Recorded as **dischargeable by TWO current assertions** — `ck_c801e1bcc453` "completed/abandoned work is folded, and the fold is closed initially" (`:1491`) and `ck_d24e83216d24` "the completed/abandoned fold opens on demand" (`:1505`). The original umbrella SKIP title (`:1484`) **need not** itself become a PASS; same retained key. |
| **C5** | **#60** structure | Limitation recorded: the "never navigates" clause is asserted **structurally**, with **no direct keyboard/click non-navigation probe**. A future test covering **both** halves is **requested, not implemented**. |

## Totals

The corrections are **trace-level**; **no** total moves. Dispositions **39 retired / 14 replaced /
3 duplicate / 3 current-relevant-missing / 3 migrated-open** (Σ 62); coverage **17 covered / 39 optional /
3 mandatory / 3 not-covered**. The only count that changes is the **equivalence** split within the
traces: **exact 8 / partial 9 / none 3** (was 11 / 6 / 3).

## Boundaries (stated, not implied)

- **No new execution.** No instance was started or written; no fixture was mutated; no `harness:*` exit is
  claimed for this pass. Every trace is read from the **retained** 128 PASS / 0 FAIL / 62 SKIP run.
- **No product or harness change.** `src/**`, `ui/app.js`, `actions/actions.js` and
  `harness/verify-page.mjs` are **byte-identical** to the measured build (their recorded shas). The
  correction lives in documents and a private packet.
- **Preserved, not rewritten.** The original 62-row ledger (`464f6c0d…`), the corrected ledger
  (`6e81e522…`) and the superseded doc text (§1–§11) are **immutable**; the correction is **additive**
  and dated (§12).
- **Not published.** The reviewer packet README is a **local note**, not a published artifact; nothing was
  uploaded or pushed.
- **Findings reported, not fixed.** The instrument-reason defect reported in the previous pass (the SKIP
  reason for the retired step-5 problem surface selected by an inverted ternary) is **restated, not
  fixed** — out of scope (no harness behaviour change). No source or harness behaviour was edited.
- **Prior conditions retained, not discharged.** The prior reviewer's qualifications remain standing: the
  person-notes gap (optional, retained; no public-API expansion, no DB injection); the bare-repository
  seed (a genuine public-seed gap; a served confirmation run is a fresh scope — no fixture grant); the
  repository page-race qualification (shared `PagedActivityFeed` mechanism; **no** independent
  repository-only guard demonstrated); deploy identity deferred.
- **Bounded, local artifact.** This is a bounded acceptance artifact, **explicitly NOT production
  acceptance**.
