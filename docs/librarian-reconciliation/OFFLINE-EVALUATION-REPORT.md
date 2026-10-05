# Librarian / Reconciliation V1 — offline evaluation report

**Status: offline implementation; final review pending.** One bounded, offline slice: a
committed synthetic fixture, a deterministic contract evaluator, a fail-closed typed-reference resolver, a
closed read boundary, contract tests, and an isolated canonical-logical DB-snapshot harness. No runtime,
tool, bundle, schema, persistence, schedule or live-access change. The real-Axis read remains held for a
separate authorization (D3). The semantic evaluation remains a **separate, human-reviewed** procedure.
Merge and push are separate owner-authorized actions; this report predicts neither.

This run is a **structural** result. A green contract run certifies structure; it is **not** a claim that
any reading is semantically useful or faithful, and it cannot catch an undeclared conflict. Every fixture
case's semantic verdict is marked `pending_human_review`.

## 1. Commands, as run

| Gate | Command | Result |
|---|---|---|
| Types | `bun run typecheck` | 0 diagnostics (exit 0) |
| Contract tests | `bun test src/librarian` | 90 pass, 0 fail (exit 0) |
| Full suite | `bun run check` | 271 pass, 0 fail across 10 files (exit 0) |
| Host types | `bun run typecheck:host -- --checkout <checkout>` | 0 diagnostics in this repo; 155 host-source compiler-context diagnostics reported separately (external — 0 plugin diagnostics, exit 0) |
| Offline evaluator | `bun run librarian:evaluate` | structural PASS, 21 cases (exit 0) |
| CLI flag rejection | `bun src/librarian/evaluate.ts --db <path>` | usage error, exit 2, no database touched (§1.1) |
| Zero-mutation | `bun harness/librarian-db-snapshot.mjs --force-write-attempt` | logical snapshots equal, control write detected (exit 0) |
| Negative control (mutant) | `bun harness/librarian-db-snapshot.mjs --mutant-allowlist` | red-run (exit 1), log retained |
| Public hygiene | `bun run harness:records` | no live endpoint, no home path (exit 0) |

The evaluator artifact is written to `$TMPDIR/librarian-evaluation-report.json` (scratch); the harness
retains its run log to `$TMPDIR/librarian-snapshot-<run>.log`. Both live under the platform scratch
directory, never in the repository. The evaluator's fixture database is a scratch file it creates, seeds
and **removes itself**; the only fixture file paths the tests touch are the controlled scratch paths they
own.

### 1.1 Independent-verifier findings addressed

- **F1 — no caller-chosen database path.** `--db` was removed from the CLI; `parseArgs` accepts only
  `--out <path>` and refuses every other argument (`--db`, `--db=…`, an unknown flag, a missing value) with
  a usage error and exit 2, *before* any file is opened or seeded. `evaluateFixture` no longer takes a
  `databasePath`: it always creates, seeds and removes its own scratch database, so no seam exists by
  which the evaluator can be pointed at an existing or production database. Demonstrated on a real probe:
  an existing 8192-byte scratch SQLite database is byte-identical after `--db <probe>` is rejected (its
  sha256 is unchanged, no `-wal`/`-shm`/`-journal` sidecar appears, no report is written), and a
  nonexistent target is never created. A refused companion `search_dashboard` read is now a typed
  `EvaluationContractError` — a hard failure, never read as absent evidence — and `main` reports it as a
  single `HARD FAILURE` line with exit 1 instead of an uncaught stack.
- **F2 — inherited and non-plain input refused.** The boundary now refuses any input that is not a plain
  JSON object (prototype `Object.prototype` or `null`), refuses accessor properties without evaluating the
  getter, and checks reserved keys with `in` (inherited or own) rather than `hasOwnProperty`. The reserved
  set is the host's `SPOOFABLE_INPUT_KEYS` (which includes `context` and `sessionId`) plus the boundary's
  own `actionKey`/`host`, so a prototype-inherited `databasePath`, `context` or `sessionId` is refused too.
  Regressions cover inherited keys, every reserved key as an own key, arrays/class instances/primitives,
  and getters that must not run.
- **F3 — logical-only zero-mutation claim.** The snapshot comparator measures logical rows/schema/versions
  only; it does **not** measure SQLite journal/WAL bookkeeping or file bytes. §4 states this explicitly,
  and the harness now primes the scratch database into WAL mode before the first snapshot so both
  snapshots observe an already-WAL scratch database (the equality is not partly a journal-mode transition).
  The shipped `ResearchStore` is unchanged.

## 2. Fixture digests (sha256, fixture file bytes)

| File | sha256 |
|---|---|
| `evaluation-dataset.json` | `d0db4f8be1c87af0ad51276f7756a508c71d2f7df47f226aba801ccadef6a760` |
| `candidate-inputs.json` | `0b57a3773f7af6545c679999741f069acc66876e4f54beeb602cbbb542ec37e0` |
| `expected-outcomes.json` | `0c8033baaae446e83ef16113ddcb70984e05a6be9fbdcc27e9e89ec7922c1ff0` |
| `README.md` | `ee09a0e65728d4d5d149e55ceddeaabbba05db8f3943f4318628e0530eb9c2b0` |

Dataset id `librarian-fixture-v1`. Fixed ids and fixed timestamps; the seed is synthetic, labelled and
deterministic. `candidate-inputs.json` carries no expected outcomes; the oracle is opened only after every
case is assembled (asserted by `evaluate.test.ts` and by a source check on the builder path).

## 3. Adversarial matrix — structural outcomes (F-1…F-20 + F-5b)

Every case's structural expectation held. `reads` is the bounded snapshot driver's own read count.

| # | Branch | Status | Outcome / reason | reads |
|---|---|---|---|---|
| F-1 | Clean happy path | proposal | `proposal` | 2 |
| F-2 | Human steering conflicts | proposal | `abstained` (`human_steering_conflict`, no text) | 2 |
| F-3 | Two humans disagree | proposal | `abstained` (`human_human_conflict`, no text) | 2 |
| F-4 | Problem-scoped steering not returned | refused | `unknown_id`; coverage `problem_scoped_steering` UNKNOWN | 2 |
| F-5 | Empty evidence | proposal | `insufficient_evidence` (no text) | 2 |
| F-5b | Proposal on empty evidence | refused | `proposal_without_evidence` | 2 |
| F-6 | List length equals cap | proposal | `proposal`; coverage `axis_notes` UNKNOWN | 2 |
| F-7 | Explicit truncated flag | proposal | `proposal`; coverage `search` PARTIAL | 2 |
| F-8 | Snapshot stable A=B | proposal | `proposal`, basis digest A | 2 |
| F-9 | Snapshot changes once | proposal | `proposal`, basis digest B (A discarded) | 3 |
| F-10 | Snapshot churns | proposal | `snapshot_unstable`, no text, no further reads | 3 |
| F-11 | Read failure | read_error | hard error, never `insufficient_evidence` | 1 |
| F-12 | Invalid reference | refused | `unknown_id` | 2 |
| F-13 | Spoofed provenance | refused | `provenance_not_injected` | 2 |
| F-14 | Write attempt | write_denied | 3/3 keys denied before dispatch | 0 |
| F-15 | Label / index as identity | refused | `non_typed_reference` | 2 |
| F-16 | Topic-wide steering | proposal | `proposal`; cited with role `topic` | 2 |
| F-17 | Problem state-history | proposal | `proposal`; cited with role `problem` | 2 |
| F-18 | Unknown steering coverage | proposal | `proposal`; coverage `axis_notes` UNKNOWN | 2 |
| F-19 | Structural pass, semantic reject | proposal | `proposal`; oracle verdict `reject`, pending human | 2 |
| F-20 | Injected provenance | proposal | `proposal`; provenance echoed verbatim | 2 |

Contract refusals: `unknown_id`, `proposal_without_evidence`, `provenance_not_injected`,
`non_typed_reference`. No proposal carried text on a non-text outcome; no proposal carried an `authority`
or `reasoning_strength` field; `claimStrength` was present only for `outcome = proposal` and always
`inferred`/`uncertain` (never `confirmed`); `reviewStatus` was always `unreviewed`.

## 4. Zero-mutation proof (isolated instrument)

`harness/librarian-db-snapshot.mjs` seeded a temporary fixture database, primed it into WAL mode, and
compared a **canonical logical projection** — schema objects (tables/indexes/triggers) plus each user
table's row count and its rows in canonical sorted order — before and after a librarian run. Nothing that
moves without a logical change (SQLite bytes, WAL/journal, page layout, `-wal`/`-shm`) is compared. The
equality is therefore a **logical** claim only; see the scope bullet below.

- **Before/after canonical snapshots equal.** Row counts: `topics=2 development_axes=8 activities=4
  annotations=9 problems=1 plans=1 plan_steps=1 repositories=1 state_log=9` (link tables 0). No version
  moved; no `state_log` row was added.
- **Write attempt refused before dispatch.** `reconcile_topic`, `record_activity` and `add_annotation`
  were each denied with `ReadBoundaryDeniedError`; `stats.dispatched` counted only the four approved reads.
- **Positive instrument control.** A deliberate isolated `UPDATE` was applied to the fixture and the
  comparator **detected** the difference — the instrument can go red, so a passing equality is not a
  rubber stamp.
- **Scope of the equality — logical rows/schema/versions only.** The instrument does **not** measure
  SQLite journal/WAL bookkeeping, page layout or file bytes. The fixture is primed into WAL mode before the
  first snapshot, so both snapshots observe an already-WAL scratch database; a run that rewrote a page
  without changing any row would still be reported equal. The shipped `ResearchStore` sets
  `journal_mode = WAL` on first open (changing the file header even with no rows written) and is left
  deliberately unchanged — a byte-level claim is out of scope for this instrument.
- **Negative control (guard-disabled).** `--mutant-allowlist` disables the read-boundary allowlist; the
  same three write keys then reached dispatch, so the acceptance criterion "writes denied before dispatch"
  fails and the run exits **1** with its log retained. The pristine suite passes and the mutant fails — the
  guard is load-bearing. The action-level tests add the two in-process reference-guard mutants (scope
  check, field allowlist): pristine refuses, mutant resolves.

## 5. Frozen product unchanged (byte-identical pre/post)

`bun run check` rebuilds the committed bundles. sha256 before and after are identical for every frozen
path:

```
src/actions.ts        c10a0b54d795c06d1faa584970378579b71648e9e9ae11dbf5b0715899a67da5
src/store.ts          bc96a27c4e7742b7348d1dc919007609b77426849c0201aa480a287f9b46686c
src/ui.tsx            b7fd49981471eaa44ed2ce29d1ae0b7123288b8033666c116c84010be4a96faa
nakama.plugin.json    5f0a5f8e08b13a2fd7dca6a272405e26d10dd331d71387fa784e1dfdbd3587f9
migrations/001…005    (unchanged; see git)
actions/actions.js    4a0686dd4e8d9809a4ea400b4ab5127b8587cc69abdb21b4ea7331b2e39c523c
ui/app.js             41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc
```

The librarian module is not imported by `src/actions.ts` or `src/ui.tsx`, is not part of `bun run build`,
and adds nothing to the agent tool surface. The existing dirty
`.agents/skills/acceptance-pass/SKILL.md` was left byte-identical
(`36b9ae968d5e929483744b090b6994b1a305ed87dab22cfe186ba00e7cc8eb05`).

## 6. Semantic evaluation — status and boundary

**PENDING HUMAN REVIEW.** The deterministic evaluator compared supplied, explicitly labelled candidate
outputs and conflict assessments; it derived no provenance, invoked no model, and performed no NLP. It
cannot certify a reading's usefulness and cannot catch an undeclared conflict. The F-19 case is the
explicit demonstration: a structurally perfect candidate whose oracle verdict is `reject`. Every case in
`expected-outcomes.json` carries `semantic.status = pending_human_review`; the semantic gate may only be
marked green by a named human review with recorded evidence, and that review is outside this slice.

## 7. Limitations (stated, not implied)

- **Structural only.** A structural pass is not semantic validity.
- **Problem-scoped steering is a coverage limitation.** It is neither returned by `get_topic` nor
  fabricated; a citation to a problem-scoped annotation id fails closed (`unknown_id`). Even a COMPLETE
  axis-notes list proves nothing about it.
- **Cap equality yields UNKNOWN.** Equal-to-cap list lengths are reported UNKNOWN, never COMPLETE and never
  proven PARTIAL; PARTIAL is used only for an explicit `truncated` flag.
- **Digest scope.** The digest covers the selected returned bundle only — not hidden, truncated or
  concurrently-added rows outside the payload — and does not guarantee transactional coherence across
  reads. There is no forever-current guarantee, only "the returned bundle was unchanged as of T".
- **Synthetic snapshot churn.** F-9/F-10 drive the bounded A/B/C compare through a labelled, injected
  content change to the returned projection (a fixed `updatedAt` drift); they do not perform a concurrent
  database write.
- **No real axis.** No live, deployed or credentialled access was performed.
- **Journal/WAL is not measured.** The zero-mutation proof is a logical row/schema/version equality on an
  isolated, already-WAL scratch database. It does not show that the SQLite file bytes or journal/WAL
  bookkeeping were untouched (the store's own `journal_mode = WAL` open changes the header).
- **No caller-chosen database.** The evaluator owns its scratch fixture database and the CLI refuses every
  flag but `--out`; there is no flag or API by which a run can be pointed at a live or production database.

## 8. Files

New: `src/librarian/{references,assembler,read-boundary,evaluate}.ts`; `src/librarian/fixture-db.ts`
(support — seeding/loading shared by the evaluator, the tests and the harness, justified to avoid three
divergent seeders); `src/librarian/{references,assembler,evaluate,read-boundary}.test.ts`;
`src/librarian/fixtures/{evaluation-dataset,candidate-inputs,expected-outcomes}.json` and
`fixtures/README.md`; `harness/librarian-db-snapshot.mjs`; this report. Edited:
`package.json` (one script, `librarian:evaluate`). The verifier-hardening pass edited only files in this
slice: `src/librarian/evaluate.ts` (CLI accepts only `--out`, owns its scratch DB, typed hard-failure
path), `src/librarian/read-boundary.ts` (plain-input/accessor rules, full reserved-key set),
`src/librarian/evaluate.test.ts` and `src/librarian/read-boundary.test.ts` (regressions), and
`harness/librarian-db-snapshot.mjs` (WAL priming + scope comment). No shipped
action/store/ui/manifest/schema/dependency changed; no git state-changing command was run.

## 9. Snapshot-integrity correction (this pass)

A review of the frozen snapshot contract found four integrity gaps; each is closed below, offline, inside
this slice. No shipped action/store/ui/manifest/schema/dependency changed. That pass left the fixture JSON
files byte-unchanged; the digests in §2 are the **current** bytes — a later prose-only label correction to
`candidate-inputs.json` (F-8/F-9 description strings only: no case semantics, no assertions) changed its
digest, which §2 now reflects.

- **Digest completeness (all citation inputs).** `Observation.topicActivity` is a citable row set
  (`bundleOf` → the resolver resolves topic-wide `activity` against it) but was **absent** from the digest
  projection, so a change to citable topic activity could leave the digest unchanged. `SelectedPayload` now
  also carries `subject`, `limits` and `topicActivity`, so the digest covers **every** field a citation can
  resolve against or the assembler can infer from. Only the transport wrapper (`ok`) and the read timing
  (`generatedAt`) are omitted; domain timestamps (`updatedAt`, `version`, …) are retained.
- **Observation isolation.** `buildObservation` previously stored **raw aliases**: the axis, topic, notes,
  activity, `search`, `limits` and `subject` were references into the read result or the caller options, so
  a post-construction mutation of either could change the observation's payload and its citable rows while
  the digest (computed at build time) stayed put. The builder now takes a **deep, JSON-compatible snapshot
  of the returned rows and the caller options and deep-freezes it** before hashing, so the observation is
  an immutable, ownership-isolated value; the emitted proposal's `subject` and refs point at the frozen
  snapshot, never at a mutable input.
- **Finite construct/compare ordering and fail-closed refs on every path.** The bounded A/B/C driver's order
  is fixed and now proven by tests that record every `read`/`observe` call: construct A, construct B,
  compare; if A≠B discard A and recompute from B **before** reading C; if B≠C emit `snapshot_unstable` with
  no further reads or recomputes. The supplied candidate is validated exactly once against the final stable
  observation (not per snapshot), so a candidate that would be invalid against a stale A can never abort the
  bounded safety protocol. `buildUnstableProposal` no longer `catch`-and-drops unresolvable references and
  no longer invents an `"unlabeled-supplied-candidate"` provenance: it validates the candidate exactly as
  the stable path does, so an unresolvable reference or a missing/derived provenance is a hard **refusal**
  on the churn path too (never a silent `snapshot_unstable` success). The unstable shape carries **no**
  candidate refs by design (there is no stable reading text to ground them), no text and no claim-strength
  label, and never exceeds three reads.
- **`assertProposalShape` scope.** The emitted-artifact validator was partial (forbidden fields,
  `reviewStatus`, outcome, text/claim-strength only) while its name implied a full structural check. It now
  validates `basis` (`asOf`/`digest`/numeric `reads`), `subject` (`topicId`/`axisId`), non-empty
  `provenance`, and the `evidence_refs`, `conflicts` and `coverage` arrays — each reference is checked as a
  well-formed typed reference (permitted variant, non-empty identity, role, typed `ref`, scope). Reference
  **identity resolution** (that a citation names exactly one returned row) remains enforced by the assembler
  against the returned bundle; the docs now state this scope honestly.

Negative controls (each pristine assertion is shown red under its mutant, not merely that the mutant
succeeds): the digest omits `topicActivity` only under `mutants.omitTopicActivityFromDigest` (pristine
digests differ, mutant digests are equal); the observation aliases its input only under
`mutants.retainAliases` (pristine mutation-invisible, mutant leaks the mutation); the read boundary keeps
live options only under `mutants.retainOptions` (pristine denial stands, mutant leaks a late allowlist
injection); and the existing reference/boundary mutants.

**Deviation disclosure — the supplied constant candidate (offline specialization, explicitly scoped).**
`DESIGN-V1.md` §7.3's general protocol constructs a candidate from A and, on A ≠ B, discards it and
**recomputes** the proposal from B. This offline slice does not: it drives the bounded A/B/C compare with
**one supplied, constant candidate**, validated **exactly once** against the final stable observation — the
A observation when A = B, or the B observation on churn (A ≠ B, B = C) — and it **never** constructs or
regenerates a candidate, invokes **no model**, and has **no candidate factory**. The safety properties are
kept: **≤3 reads**, no further reads or recomputes after `snapshot_unstable`, stable digest preserved. This
is a **disclosed implementation specialization**, **not** a reviewer-approved change to the design (it is
recorded as a disposition in `OFFLINE-IMPLEMENTATION-PROPOSAL.md` §5 and `DESIGN-V1.md` §7.3); reusing the
code with a runtime- or model-constructed candidate still requires the design's construct/recompute
protocol under a future authorization. The supplied candidates are **structural test inputs** — a structural
pass over them **does not establish semantic usefulness or faithfulness** (§6, §7).

## 10. Parent-rerun gate (provenance counts)

The parent **independently reran** every gate after this correction. The values below are what this pass
observed and what the parent's own rerun reproduced; they are recorded as the parent's independent
provenance, not taken from this report's own account. Merge and push remain separate owner-authorized
actions and are not predicted here.

| Provenance | Count | Gate |
|---|---|---|
| Full suite | 271 pass / 0 fail across 10 files | `bun run check` |
| Librarian contract tests | 90 pass / 0 fail across 4 files (+28 vs the pre-correction 62) | `bun test src/librarian` |
| Evaluator cases | 21 structural PASS (F-1…F-20 + F-5b) | `bun run librarian:evaluate` |
| Host types | 0 diagnostics in this repo; 155 host-source compiler-context diagnostics reported separately (external — 0 plugin diagnostics) | `bun run typecheck:host -- --checkout <checkout>` |
| Zero-mutation pristine | logical snapshots equal; control write detected (exit 0) | `librarian-db-snapshot --force-write-attempt` |
| Allowlist mutant (negative control) | write reached dispatch → red-run (exit 1) | `librarian-db-snapshot --mutant-allowlist` |
| Public hygiene | pass (170 text files scanned, no live endpoint / home path) | `bun run harness:records` |
| Frozen product unchanged | sha256 identical to §5 for all seven frozen paths | `git status` / `sha256sum` |

Command that reproduces the corrected suite and evaluator:

```
bun run typecheck && bun test src/librarian && bun run check && bun run librarian:evaluate
bun harness/librarian-db-snapshot.mjs --force-write-attempt   # exit 0
bun harness/librarian-db-snapshot.mjs --mutant-allowlist      # exit 1 (designed red-run)
bun run harness:records                                       # exit 0
```

Bounded correction only: the edited files are `src/librarian/assembler.ts`, `src/librarian/read-boundary.ts`,
`src/librarian/assembler.test.ts` and `src/librarian/read-boundary.test.ts`, plus this report. No shipped
`action`/`store`/`ui`/manifest/migration/bundle byte changed; `git status` shows no library source outside
this slice. Merge and push remain separate owner-authorized actions and are not predicted here.

**Label-correction pass (prose only — this correction).** The offline constant-candidate specialization is
now disclosed as a scoped footnote in `DESIGN-V1.md` §7.3 and as an implementation disposition in
`OFFLINE-IMPLEMENTATION-PROPOSAL.md` §5 (not a reviewer-approved deviation; see the §9 disclosure above).
Misleading test titles in `src/librarian/assembler.test.ts` now say the driver compares snapshots and
selects the stable observation — the supplied candidate is never rebuilt — with **assertions unchanged**
(90 pass / 0 fail, 271 across the full suite). The `candidate-inputs.json` F-8/F-9 **description strings**
now say "supplied constant candidate" (its byte digest is updated in §2; no case semantics, candidate data,
reading input, oracle, seed or assertion changed). No shipped `action`/`store`/`ui`/manifest/migration/bundle
byte changed; the frozen-bundle sha256 in §5 are unchanged pre/post.
