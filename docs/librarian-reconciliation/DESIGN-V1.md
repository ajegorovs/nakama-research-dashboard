# Librarian / Reconciliation — V1 design proposal

**Status: design approved with amendments (2026-10-05) — NOT implemented.** This document proposes; it
changes no code, no migration, no bundle and no schema, and performs no live, deployed or credentialled
access, no monitoring and no operational write. The reviewer approved this design with amendments (durable
ruling recorded in [`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md) **D-008**,
with the later offline-envelope scope corrections recorded there as **D-009**); the
amendments are incorporated below and do not alter the approved one-Axis, proposal-only architecture. It
realizes the **first bounded slice** of `DECISIONS.md` **D-006**: deterministic stored facts + agent
**proposals** over the existing Axis/Problem model, human steering stated explicitly.
Operation is a future, separately authorized period; nothing is authorized by the retired validation
campaign. The observable-input limits are stated honestly (§7, §8).

## 0. How to read this document

| Tag | Meaning |
|---|---|
| **[CURRENT]** | verified repository behaviour, with a file:line citation |
| **[PROPOSED]** | a design that does **not** exist in the tree and is not implemented here |
| **[LIMITATION]** | something the V1 input cannot establish, stated so it is not overclaimed |
| **[PENDING]** | a decision only the reviewer/owner can make; listed in §11 |

## 1. Problem and the one slice

The dashboard stores, per topic, **axes** with recorded state and per-claim confidence, **problems**,
optional **plans**, **activities** and **annotations** — including the `interpretation`/`steering` claim
kinds that carry a human reading **[CURRENT]** (`migrations/004-ux-v2-model.sql:67-99,162-180,291-324`). The
`research-coordinator` skill already binds an agent to read annotations before inferring and to treat a
human annotation as outranking its inference **[CURRENT]** (`skills/research-coordinator/SKILL.md:78-82`).

What does not exist is a disciplined way for an agent to turn that stored evidence into a **current-work
reading of an axis** a human can accept or reject — without the agent writing state. That is the open
question in `docs/OPEN-QUESTIONS.md` §2 (`:39-47`).

**The V1 slice is one thing:** given **one existing Axis** (selected under a separately authorized
read-only step, §5.4), observe its stored evidence, infer a **current-work interpretation**, and deliver it
as a **proposal** with evidence references, an explicit proposal-only claim-strength label, and honest
coverage.
**V1 performs no mutation.** Nothing is scheduled; no batch, no multi-axis platform.

## 2. Grounding — what exists today

**[CURRENT]** Migration 002 defines `topics`, `development_axes`, `repositories`, `people`, link tables,
`activities`, `annotations`; 004 adds `problems`, `plans`, `plan_steps`, `state_log` and the annotation
claim kinds; 005 adds server-owned external-evidence enrollment/mappings/receipts. A reading consumes:

- axis state and fields: `state`, `kind`, `branch`, `pr_number`, `pr_url`, `current_state`, `blocker`, and
  three `*_confidence` columns (`migrations/004:68-99`);
- the one definition of "that axis has evidence": `axisEvidence()` — branch, PR, then activities and
  annotations newest-first (`src/store.ts:2384-2446`);
- the append-only `state_log` history (`migrations/004:213-272`);
- one topic read carrying per-axis `evidence`/`history`/`notes`/`problems`/`plan`/`stateHistory` plus counts
  and the topic `version` (`src/store.ts:2457-2533`, exposed as `get_topic`).

The stored `confidence` enum is `confirmed | inferred | uncertain` (`src/store.ts:74`) on the axis claim
columns, `problems.state_confidence` (`migrations/004:87-92,169-170`) and annotation claims
(`migrations/004:314-315`). The agent surface is **five exposed tools** — `get_overview`, `get_topic`,
`search_dashboard`, `reconcile_topic`, `record_activity` (`src/actions.ts:7-11`; five `exposeAsTool: true`
in `nakama.plugin.json`). **Two of them write:** `reconcile_topic` (`src/store.ts:5426`) is the single write
path **for a topic update**, and `record_activity` (`src/actions.ts:340-365`) inserts an activity — plus the
page action `add_annotation` (`src/actions.ts:493-505`). External evidence is written only by a
host-enforced **collector** as actor `system` (`src/actions.ts:368-384`; `migrations/005`); its actions are
`exposeAsTool: false` (and two are `admin`), so **receipts are unreachable from the agent surface.**

## 3. Load-bearing distinctions (corrected)

1. **`confirmed` is evidence-backedness — not model certainty and not human approval.** The rule
   `assertClaimsAreBacked` refuses `confirmed` on an axis whose `axisEvidence()` is empty
   (`src/store.ts:6540-6569`). It checks **evidence**, not authorship: an agent writing through the action
   surface can set `confirmed` whenever evidence exists, and a person can set `inferred` on a claim they
   stand behind. V1 must never present a stored `confirmed` as a person's sign-off.
2. **`author_type` is provenance, not authorization.** It records *who wrote a row*, never taken from input
   (`src/store.ts:5631-5633`; `src/actions.ts:137-143`). A human's priority over machine inference is a
   **design/skill rule** (`skills/research-coordinator/SKILL.md:78-82`), not a stored rank.
3. **The `human-authored` guard protects text, not confidence.** It forbids an agent replacing a human's
   **words**, while explicitly permitting changes to the links, the confidence or the plan step on the same
   echoed text (`src/store.ts:6262-6288`). So **V1 does not relabel stored claims because V1 writes
   nothing** (a read-only allowlist, §9/§10) — not because the store guarantees non-relabel.
4. **Four distinct things, which V1 must not conflate.** The **stored** `confidence` enum
   (`confirmed | inferred | uncertain`) is *evidence-backedness* on a stored claim (§3.1). The proposal's
   own **`claimStrength`** (`inferred | uncertain`, never `confirmed`, §5.2) is the strength of the
   *proposal itself* — it is **not** authority and **not** a stored value. **Human-steering authority** is a
   separate **precedence rule** (§5.2 field notes, §7.1): a human's steering outranks a machine reading,
   and it is stated — never inferred from `author_type`, `confidence`, `created_at` or row order. An explicit
   approval state, if ever wanted, is a fourth, separate proposal-only concept (§5.3 B, §10). V1 introduces
   **no field named `authority`** and **no field named `reasoning_strength`**. These are the amendments to
   this document, taken before implementation.

## 4. Observe / infer / propose / mutate

**[PROPOSED]** V1 permits the first three rows and performs none of the fourth.

| Stage | Who | Carries | Writes | Evidence | V1 |
|---|---|---|---|---|---|
| **Observe** | agent reading a projection | none (stored facts) | none | the axis rows via `axisEvidence`/`get_topic` | **allowed** (read-only) |
| **Infer** | agent | none (a reading) | none | derived from observed rows | **allowed** (output only) |
| **Propose** | agent | explicit `claimStrength` (`inferred`/`uncertain`) + `outcome` | none in V1 | cites typed evidence refs + coverage | **allowed** (reply-only) |
| **Mutate** | human via the action surface, or `system` via collector | existing record authority | yes, existing gated paths | unchanged | **not performed by V1** |

**V1's artifact cannot change any stored row.** Confirmation that would turn a proposal into a record is a
future, separately gated step (§10).

## 5. The V1 slice — one axis, one interpretation proposal

### 5.1 Input bundle

**[PROPOSED]** For exactly one axis, from **stored rows only** (no live read, no schedule):

- axis claim fields and their confidences;
- the axis's `axisEvidence()` list (`src/store.ts:2384-2446`);
- its `history` (activities), `notes` (annotations), `stateHistory`, `problems`, `plan`, from `get_topic`
  (`src/store.ts:2456-2533`);
- the **topic-level** notes (`get_topic` `notes`, `listTopicNotes`, `src/store.ts:2357-2373,2515,2528`) —
  topic-wide human steering counts as steering for the axis, so it is read too, under the same `notesLimit`
  cap as axis notes;
- **every** returned human `interpretation`/`steering` claim — not the newest.

**Scope is preserved, never flattened — and what is *not* returned is stated, not fabricated.** A claim-kind
annotation carries exactly **one canonical target** — topic **or** axis **or** problem
(`(topic_id IS NOT NULL) + (axis_id IS NOT NULL) + (problem_id IS NOT NULL) = 1`,
`migrations/004-ux-v2-model.sql:302-324`) **[CURRENT]**. `listAnnotations({ axisId })` matches only rows whose
`axis_id` is that axis, and `listTopicNotes` matches `topic_id = ? AND axis_id IS NULL`
(`src/store.ts:2261-2286,2357-2371`) **[CURRENT]**. A **problem-scoped** `interpretation`/`steering` claim has
`axis_id` NULL **and** `topic_id` NULL, so it is **returned by neither projection** — it is **not exposed
through `get_topic`**. V1 therefore keys each **returned** note by its own target fields: a returned note with
`axisId` is axis-scoped; a returned note with `topicId` and `axisId` null is topic-wide. **Problem-scoped
steering is not an input V1 receives** — it is an explicit **coverage limitation** (§8), never a projection V1
fabricates. What *is* genuinely returned about a problem is its **state history** — `ProblemDetail.history`
(`StateLogEntry[]`, `src/store.ts:1246-1253,2490`) **[CURRENT]** — and that coverage is kept. Problem-scoped
steering is assembled only by the page-only Progress projection (`ProgressProblemRow.steering`,
`src/store.ts:5104-5134,5330,1464,534`), which is `get_progress` (`exposeAsTool: false`) and unreachable from
the agent surface.

### 5.2 The proposal (reply-only; no schema delta)

The proposal is a **reply-only** object with **no stored counterpart**. It carries an **`outcome`** that
selects one of four shapes; on any outcome other than `proposal`, `text` is absent and **no competing
interpretation is emitted** (no leakage of a withheld reading).

| Field | Meaning | Nature |
|---|---|---|
| `subject` | the one axis | observed |
| `kind` | `interpretation` | proposed, reply-only |
| `text` | the proposed current-work reading — **present only when `outcome = proposal`** | proposal text |
| `claimStrength` | `inferred` / `uncertain` — the proposal's own strength; **never `confirmed`**, never authority | proposal label only |
| `reviewStatus` | `unreviewed` — a distinct field, deliberately **not** the stored `confidence` vocabulary | proposal label only; **not** persisted |
| `outcome` | `proposal` / `abstained` / `insufficient_evidence` / `snapshot_unstable` | proposal label only |
| `evidence_refs[]` | typed, resolvable references to returned rows/fields (§5.5) | observed |
| `conflicts[]` | structured conflicts `{ refs[], reason }` with `reason` ∈ `human_steering_conflict` / `human_human_conflict` (§7) | observed |
| `coverage` | per source COMPLETE/PARTIAL/UNKNOWN (§8) | observed |
| `basis` | input-bundle digest + `asOf` | observed at read time |

**Field notes.**

- **Applicability by outcome.** `text` and `claimStrength` exist **only** when `outcome = proposal`: an
  `abstained`, `insufficient_evidence` or `snapshot_unstable` result carries **no** proposal text and **no**
  synthetic claim-strength label — a non-proposal is not a claim of any strength. `outcome`, `evidence_refs[]`,
  `conflicts[]`, `coverage` and `basis` remain on every shape.
- `claimStrength` **replaces** the earlier `authority` field. `inferred`/`uncertain` denote the *strength of
  the proposal's claim*, not authority over anything: a proposal has no authority. V1 adds **no `authority`
  field**, and **no `reasoning_strength` field** — uncalibrated model lean is omitted entirely from V1.
- **Human-steering authority is a precedence rule, stated separately, not a value on this object.** Where a
  returned human `interpretation`/`steering` claim bears on the subject, the human's reading governs and the
  proposal records the conflict and abstains (§7.1). Authority is not a field and never comes from
  `author_type`, stored `confidence`, `created_at` or row order.
- `reviewStatus: unreviewed` is a proposal-only label so a reader cannot mistake the object for an approved
  record; it is **not** the stored `confidence` vocabulary and is **not** persisted. None of these is
  approval; none is persisted. **No persistence.**

### 5.3 Delivery surface

**[RESOLVED — D1: reply-only.]** Options were, smallest-first: **A** the agent reply (no schema, no write,
ephemeral); **B** a persisted annotation row (a real record — its own confirmation semantics, **deferred**,
§10); **C** a new page field; **D** a `proposals` table (**not proposed**). **Decision: A.** No new tool is
required: the bundle is reachable through `get_topic`/`get_overview`. Persisted records are **not**
pre-designed onto existing columns — that is a separate, deferred question. Persistence and confirmation
workflows remain deferred (D1).

### 5.4 Axis selection

**[RESOLVED — D3: committed offline evaluation data first.]** This document does **not** select a real axis,
read the live database, or fake a target; §6 is explicitly hypothetical. Reading a **real existing axis**
happens only later, under a **separately authorized supported read**, and only after the committed offline
evaluation data step (§11 D3, `OFFLINE-IMPLEMENTATION-PROPOSAL.md`).

### 5.5 Typed evidence references (§5.2 `evidence_refs[]`)

**[PROPOSED] A small, finite, closed reference grammar.** A citation is a **typed reference to a returned row
or field**, never free text and never a display label, list index or title. Each variant carries a **real
stored id** or a **real exposed field name** (verified against the source, §2), so a reference either
resolves to exactly one returned element or the resolver **fails closed**.

| Reference variant | Carries | Resolves against | Field allowlist (exposed names, verified) |
|---|---|---|---|
| `axis_field` | `axisId` + `field` | the subject axis's own fields (`Axis`, `src/store.ts:130-147`) | `state`, `kind`, `branch`, `prNumber`, `prUrl`, `currentState`, `blocker`, `stateConfidence`, `currentStateConfidence`, `blockerConfidence`, `version` |
| `problem_field` | `problemId` + `field` | that problem's fields (`Problem`, `src/store.ts:336-349`) | `state`, `stateConfidence`, `statement` |
| `activity` | `id` | an `Activity` row in the returned `history` (`src/store.ts:152-175`) | — |
| `annotation` | `id` | an `Annotation` row in the returned `notes` (`src/store.ts:312-322`) | — |
| `state_log` | `id` | a `StateLogEntry` in `stateHistory` (`src/store.ts:374-385`) | — |
| `plan_step` | `id` | a `PlanStep` in `plan.steps` (`src/store.ts:362-371`) | — |

**Resolver contract (fail closed).**

- **Unknown id ⇒ unresolvable.** A reference whose id is not present in the returned bundle is a resolver
  **error**, not a dangling citation to render.
- **Scope mismatch ⇒ refused.** A reference whose scope disagrees with the subject is refused even if the id
  exists elsewhere. Scope is read from the row's **own target fields** (`topicId`, `axisId`, `problemId`),
  never assumed: a row with no `axisId` is not for that reason a mismatch. A reference is in scope when it
  resolves to a returned row that belongs to the subject — an `axis_field` where `axisId` is the subject axis;
  a `problem_field` whose `problemId` is one of the subject axis's returned problems; or an
  `annotation`/`activity`/`state_log` row whose own fields place it in the subject's scope under exactly one
  citation **role**:
  - **`axis`** — `row.axisId` is the subject axis (axis-scoped evidence);
  - **`topic`** — `row.axisId` is null and `row.topicId` is the subject's topic (topic-wide human steering,
    §5.1, §7.4);
  - **`problem`** — `row.problemId` is one of the subject axis's returned problems **and the row is actually
    returned by a supported read**. In the current projections the only problem-scoped rows returned are the
    problem's **state-history** entries (`ProblemDetail.history`, `StateLogEntry[]`,
    `src/store.ts:1246-1253,2490`); a problem-scoped `annotation` is **not returned at all** (§5.1), so its id
    is absent from the bundle and the resolver **refuses** it. The grammar defines **no problem-annotation
    role**: the resolver does not assert a problem-annotation capability it cannot read — it rejects an absent
    id fail-closed rather than fabricating a projection.

  The cited role must match how the proposal uses the ref: a `problem`-role ref supports a **problem-specific**
  statement or structured conflict only and is **never** cited as whole-axis evidence or whole-axis steering; a
  `topic`-role ref is topic-wide context, never problem-specific. An `axis_field` ref whose `axisId` is not the
  subject is refused.
- **Duplicate / ambiguous ⇒ refused.** Two references that canonicalise to the same identity are collapsed to
  one; a variant that could resolve to more than one element (e.g. a bare label, an index, or a field name
  outside the allowlist) is **refused**, never guessed.
- **Identity is the id, not the label.** Display text (`label`, `title`, `statement`, `summary`) and list
  position are **not** citation identity, because they are not stable and not unique.
- Refusal is a **hard failure** — a fail-closed resolver error that aborts the proposal — **never**
  `insufficient_evidence`, never an absence and never a silently dropped citation. `insufficient_evidence` is
  reserved for a genuinely empty returned evidence list (§7.2); a malformed or out-of-scope reference is an
  error, not that outcome.

## 6. Bounded illustrative example (HYPOTHETICAL)

> Fabricated for illustration; not real research, not from any database, not a measurement.

**Bundle:** topic `Topic Alpha`; axis `Example workstream` (kind `feature`, state `blocked`,
`stateConfidence: inferred`) with blocker text "waiting on slot"; one activity `github_pr`, ref `PR #N`,
"opened for review"; one human `steering` annotation, `confirmed`, dated `2026-09-30`, "holding until the
hardware slot". No list truncated.

**Proposed interpretation (`claimStrength` `inferred`, `outcome` `proposal`) — grounded, no causal leap:**
*"Example workstream is recorded `blocked` with blocker text 'waiting on slot'; the newest recorded event is
PR #N opened for review."* — typed refs (§5.5): `axis_field(axisId, state)` = `blocked`, `axis_field(axisId,
blocker)`, the `PR #N` `activity` row and the `steering` `annotation` row; coverage COMPLETE; basis digest *d*,
observed *T*. (No `authority` field and no `reasoning_strength` are emitted.) It does **not** claim *why* the
axis is blocked or name a cause; a reading like *"blocked on review availability rather than the hardware
slot"* is a causal claim the rows do not support and is out of scope.

**Conflict / abstention branch (`outcome` `abstained`).** If the machine reading competes with the person's
stated reading, V1 **withholds the competing interpretation** — `text` is absent, so no competing reading
leaks — and returns `conflicts: [{ refs: [<the steering annotation ref>], reason:
"human_steering_conflict" }]` with the statement that the person's reading stands and V1 abstains.

**Human–human disagreement (`outcome` `abstained`).** If two returned human notes disagree, V1 returns
`conflicts: [{ refs: [<both annotation refs>], reason: "human_human_conflict" }]` — an **unresolved
human–human conflict** — and abstains; it does not choose by date, `confidence` or `author_type`. Dated notes
stay as provenance.

## 7. Conflict, insufficient evidence, snapshot, steering coverage

**[PROPOSED]** Four cases, each producing a structured **`outcome`** and, where a person's reading is
involved, a structured **`conflicts[]`** entry — never a prose-only signal.

1. **Conflicting human steering (`outcome` `abstained`).** Collect **every** returned human claim. If any
   competes with the reading, **withhold the competing text** (it is not emitted) and return
   `conflicts: [{ refs, reason: "human_steering_conflict" }]`, deferring to the person; never edit it. If the
   human claims disagree **with each other**, return `conflicts: [{ refs, reason: "human_human_conflict" }]`
   and abstain. **No value of `author_type`, `confidence` or `created_at` decides authority** — no automatic
   "latest human wins", no supersession, no recency tie-break; abstention is the fallback.
2. **Insufficient evidence (`outcome` `insufficient_evidence`).** With an empty evidence list the proposal may
   not assert `confirmed` and must say so in the record's own words for absence — *"no evidence on record"*
   (`src/ui.tsx:2125`) — and, per the shipped skill, never invent activity to fill a gap
   (`skills/research-coordinator/SKILL.md:100-101`). If there is nothing to interpret, output is
   `insufficient_evidence`, `text` absent. A **failed read** is reported as an **error** (a hard evaluator
   failure), never as `insufficient_evidence` and never as absence.
3. **Snapshot change (`outcome` `snapshot_unstable`).** `basis` is a deterministic **digest over a normalized
   content projection** of the selected RETURNED payload — computed by the harness/tooling, **not** by the
   model — plus `asOf`, the read-time stamp kept **separately**. The projection **omits only** the transport
   wrapper (`ok`) and the response-generation timing (`generatedAt`, fresh on every response,
   `src/store.ts:2527,2627`) and other read-timing metadata; it **retains** domain timestamps (`occurredAt`,
   `createdAt`), versions, every evidence field and all other selected stable payload. Digests are compared
   **like-for-like** — the same tool, query, options (`limits`, `activitySinceDays`) and target
   (`topicId`/`axisId`) — so an unchanged payload digests equal and any real change mismatches. A digest over
   the **raw** full response would always mismatch, because `generatedAt` moves on every call, and is
   therefore **not** used. One `get_topic` call is internally coherent — it runs inside a single `snapshot()`
   BEGIN/COMMIT (`src/store.ts:2466,2129-2145`) — but that coherence does **not** cross calls. Snapshot
   recomputation is therefore **bounded and finite**, never a loop:

   1. **Construct** the bundle from the first read, digest it (**A**), and build the candidate proposal from
      **A**.
   2. **Read once more immediately before output and digest it (B).** If A = B, deliver the A-built candidate
      against digest A/B, carrying **its own** `outcome` (which may be `abstained` or `insufficient_evidence`,
      not necessarily `proposal`).
   3. If A ≠ B, **discard the candidate built from A** and **recompute the proposal from the fresh read B**;
      then **read and digest once more (C)** and compare **B = C**.
   4. If B = C, deliver the **B-built** proposal against digest B/C, again carrying **its own** semantic
      `outcome` — a stable comparison does not force `proposal`. If B ≠ C, set `outcome` `snapshot_unstable`,
      emit **no text**, and **perform no further reads or recomputes** — the instability is itself the honest
      result. No retry loop, no third reconstruction.
   The re-read is a compare only; it is **not** a durable-current guarantee.
4. **Steering coverage unknown.** When the relevant human steering arrives only through a bounded projection
   whose completeness is **UNKNOWN** (§8), V1 does **not** infer a blocker change from the absence of a
   recorded steering note. It offers an **evidence-limited factual synopsis** of what the returned rows
   state, or abstains and gives that as the reason — and it never asserts that *no steering exists*, only
   that none was **returned**.

> **Scoped footnote to case 3 (snapshot change) above — the implemented offline contract slice (disclosed
> specialization).** The offline evaluator slice (`OFFLINE-EVALUATION-REPORT.md`) realizes that bounded
> A→B→C discipline with **one supplied, constant candidate**, validated **exactly once** against the final
> stable observation — the A observation when A = B, or the B observation on churn (A ≠ B, B = C) — never
> against a stale A and **never regenerated**. It therefore does **not** perform the general per-read
> **candidate construction and recomputation** described above (build the candidate from A; on A ≠ B discard
> it and recompute from B): that slice invokes **no model** and has **no candidate factory**. The safety
> properties this section requires are preserved — the read count is bounded to **≤3**, no further reads or
> recomputes follow a `snapshot_unstable`, and the stable digest is kept. **Reusing the implementation with
> a runtime- or model-constructed candidate still requires the original construct/recompute protocol in this
> section, under its own future authorization**; the offline slice does not substitute for it. The supplied
> candidates are structural test inputs, so a structural pass is not a semantic claim.

**Read-only runtime surface vs. authoritative verification.** The librarian's runtime surface is **read-only
by construction** — its reads reach it only through the read-boundary adapter (§9 M-1, §10) and it is never
handed a store handle, so it cannot reach a write path. That is a
*surface* property, not proof of zero mutation. Proof that **zero rows changed** is **separate and
authoritative**: it comes from an **isolated verification harness that snapshots the database** before and
after a librarian run and compares them. That harness is a **test/instrumentation** artifact, must **never**
be an input the librarian reads, and its evidence — not the librarian's own account — is what establishes
non-mutation.

**[LIMITATION]** A topic/axis `version` is **not** a snapshot identity: adding an activity or annotation
does **not** bump it — only patching a row or recording a transition does
(`src/store.ts:4710-4714,5897-5899`; `addActivity`/`addAnnotation` touch no version, `:3571,4264-4329`). So
V1 does not rely on `version`, `updated_at`, time or count alone. Even the digest is honest about scope: it
detects a change to the **visible returned bundle only** — not hidden, truncated or concurrently-added rows
outside the payload, and it does **not** guarantee transactional coherence across multiple reads. There is
**no guaranteed forever-current output**, only "the returned bundle was unchanged as of `T`". **No raw
direct-DB fallback:** if the supported reads cannot supply the bundle, V1 says so.

## 8. Coverage and truncation

**[PROPOSED]** Every proposal carries evidence refs resolvable in the returned bundle (never free text), the
`basis` (digest + `asOf`), and per source one of **COMPLETE / PARTIAL / UNKNOWN** derived **only from
returned evidence**. **[CURRENT]** what the projections actually give, per source:

- `axisEvidence()` items carry `at/by/kind/label/sourceRef/sourceType/sourceUrl` and **no row id**, and
  activities and annotations are each capped at `EVIDENCE_ITEM_LIMIT = 5` **with no reported total**
  (`src/store.ts:2384-2446,527-528`) → completeness **UNKNOWN** from this projection alone.
- `get_topic` `history`/`notes` are **full rows with ids, authorType and kind**, capped at
  `historyLimit`/`notesLimit` (default 25, max 100) (`src/store.ts:2456-2485`). The returned list length
  decides, and only against the cap: **fewer than the cap** ⇒ **COMPLETE for that query scope** (no error,
  no active filter); **equal to the cap** ⇒ **UNKNOWN** — the list *may* be truncated, but it may equally be
  exactly the whole set, so equality with the cap proves nothing. Topic-level `notes` take the same cap
  (`src/store.ts:2515,2528`). `stateHistory` is uncapped ⇒ **COMPLETE** as returned. The `counts` returned
  are the **lengths of the returned lists, not the stored totals** (`src/store.ts:2515-2521`), so they cannot
  be used to detect truncation.
- `search_dashboard` returns an explicit `truncated` boolean (`src/store.ts:1110-1111`) — the only source
  that proves **PARTIAL**, and it does so by flag. **PARTIAL is used only for an explicit truncation flag**,
  never inferred from a length.
- The Progress steering projection (`humanSteeringBy`, cap `PROGRESS_SUPPORT_LIMIT = 10`,
  `src/store.ts:5104-5134,534`) is page-only: `get_progress` is `exposeAsTool: false` — V1 reads human
  steering via `get_topic` `notes`, not that projection.
- **Problem-scoped steering is a distinct, unboundable coverage gap.** An `interpretation`/`steering` claim
  aimed at a problem is assembled only by the page-only Progress projection (`ProgressProblemRow.steering`,
  cap `PROGRESS_SUPPORT_LIMIT = 10`, `src/store.ts:5104-5134,5330,1464,534`), which is `get_progress`
  (`exposeAsTool: false`) and therefore **unreachable from the agent surface**. `get_topic` returns **no**
  problem-note list (§5.1), so problem-scoped steering is **neither read by V1 nor provably absent from V1's
  bundle**: because no supported read returns a problem-annotation list at all, **even a COMPLETE axis-notes
  list proves nothing about problem-scoped steering**. Per-source coverage for problem-scoped steering is
  therefore **UNKNOWN** — a **coverage limitation**, never COMPLETE and never a fabricated empty set.
- External receipts are collector-only (§2) — V1 cites none.

A bounded or **UNKNOWN** source does not, on its own, make the whole result "known partial". When a matching
richer source proves the whole query complete for that scope — e.g. an under-cap `history`/`notes` list
covering the same rows that the capped `axisEvidence()` projection could not bound — the residual gap from
the narrower projection is reported as **coverage-limited/unknown**, distinct from the proven **PARTIAL**
that only an explicit truncation flag produces. A genuinely truncated or bounded subset is still never
presented as complete (`docs/ux-v2/DECISIONS.md:140-144`).

## 9. Acceptance criteria (future slice)

**[PROPOSED]** Positive, negative, non-mutation and read-enforcement cases are all required.

**Positive** — P-1 every `evidence_ref` is a **typed reference** that resolves to exactly one returned
element under the §5.5 grammar (an unknown id, a scope mismatch, or a duplicate/ambiguous variant is
**refused**, not rendered); P-2 `claimStrength` + `reviewStatus` + `outcome` + `basis` stated; P-3 coverage
stated per source incl. truncated; P-4 a bounded/UNKNOWN source is **not** reported as known-PARTIAL where a
matching richer source proves the query complete for that scope — it is labelled **coverage-limited/unknown**,
never as proven PARTIAL; P-5 a conflict is a structured `conflicts[]` entry (`refs` + `reason`) and an
abstention emits **no competing `text`**.

**Negative** — N-1 never `confirmed`, and **no `authority` field and no `reasoning_strength` field exist at
all**; N-2 `claimStrength`, `reviewStatus`, `outcome` and any `conflicts[]` entry are never written or
rendered as the stored `confidence` or as approval; N-3 empty evidence ⇒ `outcome` `insufficient_evidence`
(no `confirmed`, no text) when there is nothing to interpret, and a **read error is a hard error, not
absence**; N-4 a competing human claim is never overwritten/superseded — conflict stated (`reason`
`human_steering_conflict`), V1 abstains; N-5 two disagreeing human claims ⇒ `reason` `human_human_conflict` +
`human_human_conflict` + abstention, no recency/`confidence`/`author_type` resolution; N-6 a digest mismatch on the bounded
A→B→C compare ⇒ `outcome` `snapshot_unstable` with **no further reads or recomputes** (never a loop); N-7 a
spoofed actor/author token cannot mint provenance (`src/store.ts:5633`); N-8 a problem-scoped steering claim is
**never fabricated as returned** and is never applied as whole-axis steering: V1 reports problem-scoped
steering as an explicit **coverage limitation** (UNKNOWN, §8) and the resolver **refuses** a citation to a
problem-scoped annotation id (absent from the bundle), while topic-wide steering is read where returned
(§5.1); where human-steering coverage is UNKNOWN — including problem-scoped steering — V1 infers no blocker
change, only an evidence-limited synopsis or a reasoned abstention (§7.4); N-9 a citation by display label,
list index or title (not a typed id/field) is refused.

**Non-mutation / read-enforcement** — M-1 the **runtime** execution reads only through a **read-boundary
adapter** that dispatches exactly the three read actions (`get_topic`, `get_overview`, `search_dashboard`)
through the **existing action entry point** (`run`, `src/actions.ts:216`); the core is **never handed a
`ResearchStore` handle** (which would expose the write methods), so `reconcile_topic`, `record_activity` and
every other write path are unreachable, and an action key outside the closed allowlist is **denied before
dispatch**. M-2 the denial is **enforced by a test**, and the guard is **mutant-proven**: the pristine suite
passes, and an **injected mutant that disables the allowlist or the reference-scope check must fail
acceptance** — a rejection case alone does not prove the guard can go red. M-3 zero rows change (byte-identical counts and contents), established by an
**isolated authoritative DB-snapshot instrumentation harness** — a before/after snapshot comparison that is
**never** an input the librarian reads (§7). M-4 no `state_log` row, no `version` move. M-5 the exposed tool
set and manifest are unchanged.

**[LIMITATION]** The read-only enforcement mechanism **does not exist yet**. M-1/M-2 need a read-boundary
adapter (over the existing action dispatch) that is not built; until it exists and is proven (writes denied
before dispatch, zero mutation observed by the isolated harness, mutant red-run as in M-2), **no
implementation can satisfy this design** — it is an **implementation acceptance blocker**, not a detail. The
read boundary and the isolated snapshot harness are **two different artifacts**: the read boundary bounds what
the librarian *can* read; the harness *proves* no row changed, and neither substitutes for the other.

## 10. Confirmation is future and separately gated

**[PENDING]** Turning a proposal into a stored record is where mutation enters — **deliberately out of V1**.
Any persisted-proposal record and its confirmation semantics are a separate, deferred design (§5.3 B) with
its own authorization; nothing here performs or authorizes it.

## 11. Decisions — resolved (approved with amendments)

These were the three product decisions the reviewer owned. All three are now **resolved**, not pending; the
durable ruling is **D-008** in [`../evidence-automation/DECISIONS.md`](../evidence-automation/DECISIONS.md).
The later, bounded **offline-envelope scope corrections** are recorded as **D-009** in the same file.
Not reviewer choices, and unchanged by the amendment: confirmation workflow (out of scope, §10); external
receipts (inaccessible by construction, §8); bundle digest and read-safety (engineering requirements, §7.3).

1. **D1 — Delivery: reply-only (approved).** No persistence. The proposal is an ephemeral reply (§5.2, §5.3).
   Persistence and confirmation workflows remain deferred.
2. **D2 — Conflict: report + abstain (approved).** V1 reports the conflict structurally and abstains rather
   than delivering a competing interpretation; **unresolved human–human disagreement always abstains** (§7.1).
3. **D3 — First target: committed offline evaluation data first (approved).** Reason offline over a
   **committed, synthetic, labelled, deterministic evaluation dataset** — not real research — and only then,
   under a **separate authorization**, read **one real existing Axis** through a supported read (§5.4).
   No real axis is read by the offline slice.

The amendments that accompany this approval — rename `authority` to `claimStrength`; align standing decision
D-006; omit `reasoning_strength`; typed resolvable evidence references; structured abstention/conflict
outcomes; bounded snapshot recomputation; and the read-only runtime-surface / isolated-verification distinction — are
incorporated throughout this document. They do **not** alter the approved **one-Axis, proposal-only**
architecture. The **D-009** offline-envelope corrections — problem-scoped steering is a coverage limitation,
not a returned projection (§5.1, §5.5, §8, §9 N-8); problem state-history is kept where genuinely returned;
supplied assessments are inputs with explicit injected provenance; candidate inputs are separate from the
oracle; and non-mutation proof uses canonical logical DB snapshots — are bounded corrections, not a new design
decision, and likewise do not alter the architecture.

## 12. Non-goals

- No scheduler/daemon/queue/polling or periodic authenticated monitoring (D-003).
- No multi-axis/batch platform, backfill or repository enrollment.
- No new table or column; no persistence; no second claim store beside `annotations`.
- No `authority` field and no `reasoning_strength` field on the proposal (amendment); no uncalibrated model
  reasoning strength in V1.
- No authoritative mutation by V1; no auto-confirmation; no faked target or live-DB read; no raw direct-DB
  fallback. Zero-mutation is proven by an isolated DB-snapshot harness, never by the librarian's own word.
- No resolution of human–human disagreement by recency, `confidence` or `author_type`.
- No reopening of the R-series validation (D-001) or any accepted UX-v2/evidence-automation unit.
- Not a general approval queue (explicit V2-PLAN non-goal, `docs/V2-PLAN.md:794-801`).

## Appendix — source citations

- Model: `migrations/002`; `migrations/004-ux-v2-model.sql:67-99,123-133,162-180,213-272,291-324`;
  `migrations/005`.
- Store: `src/store.ts:34-99,101-149,517-537,1110-1111,1495-1504,1596-1608,2129-2145,2261-2286,
  2357-2373,2384-2446,2456-2533,2627,3571,4264-4329,4710-4714,5897-5899,5104-5134,5426,5631-5633,
  6262-6288,6540-6569`.
- UI copy: `src/ui.tsx:2125` ("no evidence on record").
- Actions/manifest: `src/actions.ts:7-11,137-143,329-337,340-365,368-384,493-505`; `nakama.plugin.json`.
- Skill: `skills/research-coordinator/SKILL.md:12-26,40-46,51-58,63-64,68-71,78-82,87-90,91-93,100-101,105-106`.
- Roadmap/questions: `docs/V2-PLAN.md:686-711,794-801`; `docs/OPEN-QUESTIONS.md:39-47`;
  `docs/ux-v2/DECISIONS.md:140-144`.
- Standing decisions: `docs/evidence-automation/DECISIONS.md` D-001…D-009 (D-006 aligned; D-008 records the
  design approval ruling; D-009 records the offline-envelope scope corrections — all three cited, and D-006/D-008/D-009
  edited only in that file, never here).
