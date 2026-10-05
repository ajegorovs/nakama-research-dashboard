# Librarian / Reconciliation — V1 design proposal

**Status: design only — PROPOSED, not implemented.** This document proposes; it changes no code, no
migration, no bundle and no schema, and performs no live, deployed or credentialled access, no monitoring
and no operational write. It realizes the **first bounded slice** of `DECISIONS.md` **D-006**: deterministic
stored facts + agent **proposals** over the existing Axis/Problem model, human steering stated explicitly.
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
as a **proposal** with evidence references, an explicit proposal-only authority label, and honest coverage.
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
4. **An explicit approval state, if ever wanted, is a separate proposal-only concept** — distinct from
   provenance (`author_type`), from claim strength (`confidence`) and from any model certainty (§5.2).

## 4. Observe / infer / propose / mutate

**[PROPOSED]** V1 permits the first three rows and performs none of the fourth.

| Stage | Who | Carries | Writes | Evidence | V1 |
|---|---|---|---|---|---|
| **Observe** | agent reading a projection | none (stored facts) | none | the axis rows via `axisEvidence`/`get_topic` | **allowed** (read-only) |
| **Infer** | agent | none (a reading) | none | derived from observed rows | **allowed** (output only) |
| **Propose** | agent | explicit `inferred`/`uncertain` label | none in V1 | cites evidence refs + coverage | **allowed** (reply-only) |
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

**Scope is preserved, never flattened.** `listAnnotations` filters by `topicId`/`axisId` only — **not**
`problemId` (`src/store.ts:2261-2286`) — and reports no total, so a note whose `problemId` is set (a
problem-scoped steering claim) still arrives inside the list read for its axis. V1 therefore keys each note
by its own target fields (`topicId`, `axisId`, `problemId`) and treats a problem-targeted claim as steering
for **that problem only** — never as whole-axis steering. A note with `axisId` is axis-scoped; a
`topicId`-only note (`axisId` null) is topic-wide.

### 5.2 The proposal (PROPOSED — reply-only; no schema delta)

| Field | Meaning | Nature |
|---|---|---|
| `subject` | the one axis | observed |
| `kind` | `interpretation` | proposed, reply-only |
| `text` | the proposed current-work reading | proposal text |
| `authority` | `inferred`/`uncertain` — **never `confirmed`** | proposal label only |
| `approvalStatus` | `proposal-only/unreviewed` — a distinct field, **not** the stored `confidence` vocabulary | proposal label only; **not** persisted |
| `evidence_refs[]` | returned rows/fields the reading cites | observed |
| `coverage` | per source COMPLETE/PARTIAL/UNKNOWN (§8) | observed |
| `basis` | input-bundle digest + `asOf` | observed at read time |
| `reasoning_strength` | *optional* qualitative band of model lean | **not** approval, **not** stored, **not** calibrated |

`authority` is a proposal-only label; `reasoning_strength` is how strongly the model leaned — optional,
qualitative, uncalibrated; `approvalStatus` is a separate proposal-only field, deliberately distinct from the
stored `confidence` vocabulary, added so a reader cannot mistake a proposal for a stored confidence or an
approval. None of the three is approval; none is persisted. **No persistence.**

### 5.3 Delivery surface

**[PENDING]** §11 D1. Options smallest-first: **A** the agent reply (no schema, no write, ephemeral);
**B** a persisted annotation row (a real record — its own confirmation semantics, **deferred**, §10);
**C** a new page field; **D** a `proposals` table (**not proposed**). **Recommendation: A.** No new tool is
required: the bundle is reachable through `get_topic`/`get_overview`. Persisted records are **not**
pre-designed onto existing columns — that is a separate, deferred question.

### 5.4 Axis selection

**[PENDING]** §11 D3. This document does **not** select a real axis, read the live database, or fake a
target; §6 is explicitly hypothetical.

## 6. Bounded illustrative example (HYPOTHETICAL)

> Fabricated for illustration; not real research, not from any database, not a measurement.

**Bundle:** topic `Topic Alpha`; axis `Example workstream` (kind `feature`, state `blocked`,
`stateConfidence: inferred`) with blocker text "waiting on slot"; one activity `github_pr`, ref `PR #N`,
"opened for review"; one human `steering` annotation, `confirmed`, dated `2026-09-30`, "holding until the
hardware slot". No list truncated.

**Proposed interpretation (authority `inferred`) — grounded, no causal leap:** *"Example workstream is
recorded `blocked` with blocker text 'waiting on slot'; the newest recorded event is PR #N opened for
review."* — refs: the `PR #N` activity and the `steering` annotation; coverage COMPLETE; basis digest *d*,
observed *T*; reasoning_strength not asserted. It does **not** claim *why* the axis is blocked or name a
cause; a reading like *"blocked on review availability rather than the hardware slot"* is a causal claim the
rows do not support and is out of scope.

**Conflict / abstention branch.** If the machine reading competes with the person's stated reading, V1
**withholds the competing interpretation** and states the conflict: *"a machine reading disagrees with the
steering note; the person's reading stands and V1 abstains."*

**Human–human disagreement.** If two returned human notes disagree, V1 marks an **unresolved human–human
conflict** and abstains — it does not choose by date, `confidence` or `author_type`. Dated notes stay as
provenance.

## 7. Conflict, insufficient evidence, snapshot, steering coverage

**[PROPOSED]** Four cases:

1. **Conflicting human steering.** Collect **every** returned human claim. If any competes with the reading,
   withhold or deliver **only** with a conflict label deferring to the person; never edit it. If the human
   claims disagree **with each other**, state an **unresolved human–human conflict** and abstain. **No
   value of `author_type`, `confidence` or `created_at` decides authority** — no automatic "latest human
   wins", no supersession, no recency tie-break; abstention is the fallback.
2. **Insufficient evidence.** With an empty evidence list the proposal may not assert `confirmed` and must
   say so in the record's own words for absence — *"no evidence on record"* (`src/ui.tsx:2125`) — and, per
   the shipped skill, never invent activity to fill a gap
   (`skills/research-coordinator/SKILL.md:100-101`). If there is nothing to interpret, output is
   **no proposal**. A **read error** is reported as an **error**, never as absence.
3. **Snapshot change.** `basis` is a deterministic **digest over a normalized content projection** of the
   selected RETURNED payload — computed by the harness/tooling, **not** by the model — plus `asOf`, the
   read-time stamp kept **separately**. The projection **omits only** the transport wrapper (`ok`) and the
   response-generation timing (`generatedAt`, fresh on every response, `src/store.ts:2527,2627`) and other
   read-timing metadata; it **retains** domain timestamps (`occurredAt`, `createdAt`), versions, every
   evidence field and all other selected stable payload. Digests are compared **like-for-like** — the same
   tool, query, options (`limits`, `activitySinceDays`) and target (`topicId`/`axisId`) — so an unchanged
   payload digests equal and any real change mismatches. A digest over the **raw** full response would always
   mismatch, because `generatedAt` moves on every call, and is therefore **not** used. One `get_topic` call
   is internally coherent — it runs inside a single `snapshot()` BEGIN/COMMIT (`src/store.ts:2466,2129-2145`)
   — but that coherence does **not** cross calls: a supported **read-again compare** re-reads and re-digests
   immediately before output, and on mismatch the proposal is **withheld and recomputed**. The re-read is a
   compare only; it is **not** a durable-current guarantee.
4. **Steering coverage unknown.** When the relevant human steering arrives only through a bounded projection
   whose completeness is **UNKNOWN** (§8), V1 does **not** infer a blocker change from the absence of a
   recorded steering note. It offers an **evidence-limited factual synopsis** of what the returned rows
   state, or abstains and gives that as the reason — and it never asserts that *no steering exists*, only
   that none was **returned**.

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
- External receipts are collector-only (§2) — V1 cites none.

A bounded or **UNKNOWN** source does not, on its own, make the whole result "known partial". When a matching
richer source proves the whole query complete for that scope — e.g. an under-cap `history`/`notes` list
covering the same rows that the capped `axisEvidence()` projection could not bound — the residual gap from
the narrower projection is reported as **coverage-limited/unknown**, distinct from the proven **PARTIAL**
that only an explicit truncation flag produces. A genuinely truncated or bounded subset is still never
presented as complete (`docs/ux-v2/DECISIONS.md:140-144`).

## 9. Acceptance criteria (future slice)

**[PROPOSED]** Positive, negative, non-mutation and read-enforcement cases are all required.

**Positive** — P-1 every `evidence_ref` resolves in the returned bundle; P-2 `authority` + `basis` stated;
P-3 coverage stated per source incl. truncated; P-4 a bounded/UNKNOWN source is **not** reported as
known-PARTIAL where a matching richer source proves the query complete for that scope — it is labelled
**coverage-limited/unknown**, never as proven PARTIAL.

**Negative** — N-1 never `confirmed`; N-2 neither a `reasoning_strength` value nor the `approvalStatus`
field is written or rendered as the stored `confidence` or as approval; N-3 empty evidence ⇒ no `confirmed`
and no proposal when nothing to interpret (a read error is an error, not absence); N-4 a competing human
claim is never overwritten/superseded — conflict stated, V1 abstains; N-5 two disagreeing human claims ⇒
unresolved human–human conflict + abstention, no recency/`confidence`/`author_type` resolution; N-6 digest
mismatch ⇒ withhold + recompute; N-7 a spoofed actor/author token cannot mint provenance
(`src/store.ts:5633`); N-8 a problem-targeted steering claim is never applied as whole-axis steering and
topic-wide steering is read (§5.1), and where human-steering coverage is UNKNOWN V1 infers no blocker change
— only an evidence-limited synopsis or a reasoned abstention (§7.4).

**Non-mutation / read-enforcement** — M-1 execution is restricted to a read-only allowlist (`get_topic`,
`get_overview`, `search_dashboard` only); `reconcile_topic`, `record_activity` and every other
write path are unavailable. M-2 an attempted write from that context is **refused**, and the attempt is
demonstrated, not asserted. M-3 zero rows change (byte-identical counts and contents). M-4 no `state_log`
row, no `version` move. M-5 the exposed tool set and manifest are unchanged.

**[LIMITATION]** The read-only enforcement mechanism **does not exist yet**. M-1/M-2 need a tool-allowlist
that is not built; until it exists and is proven (writes refused, zero mutation observed), **no
implementation can satisfy this design** — it is an **implementation acceptance blocker**, not a detail.

## 10. Confirmation is future and separately gated

**[PENDING]** Turning a proposal into a stored record is where mutation enters — **deliberately out of V1**.
Any persisted-proposal record and its confirmation semantics are a separate, deferred design (§5.3 B) with
its own authorization; nothing here performs or authorizes it.

## 11. Decisions for the reviewer

Three product decisions, each with a recommended default. Not reviewer choices: confirmation workflow (out
of scope, §10); external receipts (inaccessible by construction, §8); bundle digest and read-safety
(engineering requirements, §7.3).

1. **D1 — Delivery.** Reply-only (no persistence) or a persisted record? *Recommended: reply-only.*
2. **D2 — Conflict.** Report + **abstain**, or deliver a competing interpretation? *Recommended: report +
   abstain; human–human disagreement always abstains (§7.1).*
3. **D3 — First target.** Reason offline over a **committed illustrative dataset**, or read a **real
   existing axis** under a separately authorized supported read? *Recommended: committed dataset first; a
   real axis only under separate authorization.*

## 12. Non-goals

- No scheduler/daemon/queue/polling or periodic authenticated monitoring (D-003).
- No multi-axis/batch platform, backfill or repository enrollment.
- No new table or column; no persistence; no second claim store beside `annotations`.
- No authoritative mutation by V1; no auto-confirmation; no faked target or live-DB read; no raw direct-DB
  fallback.
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
- Standing decisions: `docs/evidence-automation/DECISIONS.md` D-001…D-007 (cited only — not edited here).
