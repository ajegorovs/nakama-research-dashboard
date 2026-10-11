# Dashboard production UI port — external review record (2026-10-10)

**Reviewer verdict: CHANGES REQUIRED.** This record preserves the reviewer's findings **verbatim** and then
records the correction status. It is the dated record the port checklist and review brief point to.

The verdict below is reproduced exactly as received. It is **not** an acceptance record, and the correction
status appended after it is the responder's, not the reviewer's.

## Reviewer verdict (verbatim)

Source: `dashboard-production-port-review-findings.md` supplied by the reviewer, review basis
`dashboard-production-port-review.zip`, archive SHA-256
`e46faec5e7c229d45085b1883093e1623512ac95fdd36801e8d99bd3aca9f3b0`.

---

### Nakama research dashboard — independent production-port review

**Decision: CHANGES REQUIRED** before advancement to the canonical isolated served acceptance phase.

**Review basis:** `dashboard-production-port-review.zip` supplied on 2026-10-10, extracted to a private cloud workspace. SHA-256 of archive: `e46faec5e7c229d45085b1883093e1623512ac95fdd36801e8d99bd3aca9f3b0`. The 90 files enumerated in `EVIDENCE-MANIFEST.json` all passed individual SHA-256 and size checks (the manifest excludes itself). Source, bundled UI, read-contract/migration docs, screenshots and recorded test claims were inspected. This is an **offline evidence review**, not a canonical served run or independently executed Bun test suite.

#### Scope and positive findings

- The four-view Project → Workstream → Task information architecture is a clearer navigation model than an Overview-led work ledger.
- Migration 006 expands the existing problem model to general tasks (`open`, `blocked`, `resolved`) without replacing stable problem identities/history. Short task titles and polymorphic project/workstream/task plans are separate and bounded.
- Plan-owner resolution and step containment, activity/problem pairing, preservation of human-authored task text, and stable source identifiers are strong choices. The store tests describe meaningful negative controls, although their reported pass counts were not independently run.
- Server-side activity/task pagination uses same-scope count and item predicates and stable `(timestamp, id)` or `(created_at, id)` ordering; the UI's pager provides numbered navigation. The record correctly does not promise stable offsets under concurrent inserts.
- The served rev-41 Progress screenshot demonstrates the corrected step-row wrapping; labelled local screenshots cover paths absent from the real dataset. Served rev-33 sibling screenshots **predate** the latest CSS corrections, as disclosed.
- The packet clearly admits that the canonical `verify-page.mjs` pass still targets the retired Overview layout, that keyboard coverage is sampled, and that person notes/task plans lack current served data.

#### Required corrections

##### R1 — Stored plan positions displayed off by one (confirmed on real served dataset)

**Where:** `source/src/ui.tsx:2873–2885` (`ScopedPlan`), `images/served-rev41/progress-1440x900.png`, and the current specification `docs/dashboard-information-architecture-pivot.md` §Tasks/Scoped Plans.

**Evidence:** stored positions `1,2,3,4`, rendered `2.,3.,4.,5.` because of `${step.position + 1}.`. The bundle `source/ui/app.js` contains the same expression. The current agreement says render stored positions without rebasing; old historical Q3 notes are superseded by the current specification.

**Smallest fix:** display the stored position directly (or explicitly settle a single normalization rule if legacy 0-based records exist). Add a regression case using the real `1..4` fixture, `null` and `0`.

##### R2 — “Open tasks” incorrectly includes blocked tasks in Projects (source-confirmed)

**Where:** `source/src/ui.tsx:5312–5314` and `5356–5358`; contrast `source/src/store.ts:6031` and `DashboardSummary` in the same UI.

**Evidence:** Projects uses `task.state !== "resolved"` for its **open** count while Progress uses `state === "open"` and blocked is counted separately. One blocked task with no open tasks becomes “1 open task · 1 blocked” in the Project card, inconsistent with Progress and dashboard totals.

**Smallest fix:** change both Project card branches to `state === "open"`. Regression fixture with at least one of each `open`, `blocked`, `resolved`; compare Project card, Progress index and Dashboard summary.

##### R3 — Entity-scoped activity paging retains the previous entity's offset (source-confirmed)

**Where:** `source/src/ui.tsx:2663–2690` (`PagedActivityFeed`), with reused instances in `PersonPanel` and `RepositoriesView` (`:4026–4039`). The `scopeKey` triggers a re-fetch but neither `offset` nor `page` is reset; there is no key-based remount.

**Impact/scenario:** on repository A activity page 3 (`offset=10`), select repository B with two records. The request remains at `offset=10`, returning an empty page even though B has records, and the pager may display a misleading range.

**Smallest fix:** key `PagedActivityFeed` by the stable person/repository ID, or reset offset and page on scope changes in an identity-safe manner. Regression with A=12 activities and B=2, switch at offset 10 to B and back, verify `offset=0` and correct attributed rows.

##### R4 — Asynchronous scoped reads may commit after selection has changed (source-confirmed race)

**Where:** `source/src/ui.tsx:4705–4755` (`loadWorkstream`), `:4838–4868` (`loadDetail`). Workstream response commits are not guarded by a current selection or request generation. Project `loadDetail` commits `topicActivityPage` without a matching topic identity or generation guard; the `active` variable in its effect is assigned but never checked by `loadDetail`.

**Impact/scenario:** select A (slow response) then B (fast response). When A finally returns it may overwrite B's workstream/task/activity view despite B being selected. The Project detail has a `selectedDetails` identity check, but its separately stored activity page may still be the wrong project's. Rapid pager clicks can similarly commit out of order.

**Smallest fix:** use request sequence/identity guards at the commit point for each scoped read (e.g. `useRef` counter plus requested selection/offset), or cancel stale calls. Clear stale scoped pages on selection. Add deferred-promise tests for A-slow/B-fast and offset-5-slow/offset-10-fast. Do not mutate after failed or stale requests.

#### Secondary contract qualification (can be addressed in same small pass)

**S1 — `taskPage` enrichment does not participate in the row/count snapshot.** `source/src/store.ts:4988–4992` calls `problemPageCore` (which ends its SQLite `snapshot`) and only *then* maps returned rows through `problemDetailOf`. Thus the asserted single-snapshot consistency guarantees row/count membership, but not task plan/people/repository enrichment. For strict adherence, wrap `taskPage` as a whole in `this.snapshot(() => ...)` (its nested core snapshot is already reentrant), and add a snapshot-boundary regression. This issue is not evidenced as a live failure in the supplied captures.

**S2 — No canonical served acceptance yet.** The archive reports `bun run check` 365 tests passing and host typecheck clean, but the review packet omits the runner/harness needed to reproduce the canonical served test; Bun is not installed in this review environment. Adapt `harness/verify-page.mjs` from five tabs/Overview to four tabs/Projects, run the isolated served read pass and full focus matrix after the corrections. Do not call this archive-only decision final production acceptance.

**S3 — Explicit data-maintenance limitation:** topic `summary`/`description` has no mechanical human-authorship guard (implementation design §14). This is disclosed, not a regression in this UI port. Keep provenance/manual correction policy explicit when connecting automated librarian maintenance.

#### Minimum acceptance follow-up

1. Implement R1–R4 with focused UI regression tests (plus S1 if the advertised snapshot contract is to be maintained literally).
2. Rebuild the production UI bundle, confirm source/bundle identity, and capture both viewports for the modified paths.
3. Adapt the canonical read harness to four views, exercise a dataset with blocked tasks, multi-page repository activity and rapid navigation, and collect keyboard focus evidence.
4. Return an updated packet with the same served-vs-synthetic labels and without any unapproved domain writes. Re-review for **accepted** before formal served acceptance.

**Boundary:** This review approves no mutation, deployment, merge or production acceptance.

---

## Findings distinction (recorded by the responder, not the reviewer)

- **R1 is an observable fact with a qualified norm claim.** The reviewer's *observation* — stored `1,2,3,4`
  rendered `2.,3.,4.,5.` on the served dataset — is **true and independently re-confirmed** here. The
  *normative* part ("the current agreement says render stored positions without rebasing; old Q3 notes are
  superseded") was a **settlement the owner had not yet made** when the review was written: the pivot spec's
  §1.3/Q3 then said the convention was **OPEN** and forbade a code change before a ruling. The **owner has now
  ruled** (2026-10-10): render the **stored** `position` directly (`1..4` → `1.,2.,3.,4.`), a stored `0` as
  `0.`, a `null` as no number, with **no data rebasing**. So the defect is real; the fix required an owner
  decision, which is now recorded in the current spec (`dashboard-information-architecture-pivot.md` §1.3,
  Q3 **resolved**, §7.2).
- **R2–R4 and S1 are source-confirmed defects** and were not norm-contested.

## Correction status (responder)

All of R1–R4 and S1 are implemented; a revised, separately versioned review packet accompanies this record.
Details, evidence and before/after counts are in `.hermes/scratch/reviewer-corrections-local.md` (local
receipt) and reproduced in the packet.

| Finding | Status | Evidence |
|---|---|---|
| R1 | **closed (measured)** | `src/ui.tsx` `ScopedPlan` renders `${step.position}.`; browser regression asserts `1.,2.,3.,4.` / `0.` / none |
| R2 | **closed (measured)** | both Project card branches use `state === "open"`; Project open count == Progress rail open count (1) under mixed states |
| R3 | **closed (measured)** | `PagedActivityFeed` resets offset + page on a scope change; A(12)@offset10 → B(2)@offset0 → back A@offset0 |
| R4 | **closed (measured)** | generation guards in `loadWorkstream`/`loadDetail`; A-slow/B-fast keeps B; offset5-slow/offset10-fast keeps 10; stale failure not surfaced; pages cleared on selection |
| S1 | **closed (measured)** | `taskPage` wrapped in one reentrant `snapshot`; `src/store-taskpage-snapshot.test.ts` boundary regression + negative control |
| S2 | **outstanding** | four-tab `harness/verify-page.mjs` adaptation and the canonical served read pass are **not** run; flagged, not executed |
| S3 | **disclosed, unchanged** | data-maintenance limitation; no change in this pass |

**Sequencing:** the revised packet must be **re-reviewed before any canonical served acceptance**. The served
release remains rev 41; the corrected code is a **local bundle only** — nothing was deployed, reinstalled or
restarted, and no research write, reseed or profile change was performed. **Boundary:** this responder record
approves no mutation, deployment, merge or production acceptance.
