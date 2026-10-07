# Public-research fixture expansion — plan and approved packet

> **Status:** PLAN ONLY. Nothing in this document has been executed: no service started, no deploy, no
> credential read, no database write, no provider call, no seed. It states the intent, the approved seed
> packet and the execution phases; the seed itself is a separate, owner-authorized session.
>
> **Scope of this document.** A public, versioned plan for exercising the ResearchDashboard product
> (one page, five agent tools) against a real-example public fixture, and for growing that fixture
> through the product's own write path. Local execution detail — startup commands, absolute paths, live
> ports/pids, organization ids, env-key handling — is deliberately **not** here; it lives in an ignored
> local handoff, and a resuming session reads both.

---

## 1. Goal & non-goals

**Goal.** In a fresh session, manually exercise the ResearchDashboard product against a real-example
public fixture dataset by driving the dashboard agent through the **five product tools only** — no
acceptance harness, no model campaign, no SQL writes. Seed two topics / six development axes / one
person / three repositories plus the problems and plan steps in §5, using the product's own atomic
write path, then reconcile the readback against the packet.

**Non-goals / explicit exclusions.**
- **NOT** the E2E/model campaign: do not run the E2E driver, the frozen model matrix, or campaign tooling.
- **NOT** an inference campaign: ordinary model turns the manual conversation needs are allowed; do not
  reconstruct old hard inference gates or treat them as required to start.
- **NOT** a harness seed: events are recorded through the product's `record_activity`; there is no SQL
  write path and no replay-corpus seeding.
- **Code repairs are out of scope** — findings are recorded as product findings, not fixed as part of
  the seed.
- **No commit/push/tag/release/service restart/deployment** from the run itself.

---

## 2. Product surface — the five agent tools

The target product surface is **five agent tools**:

| Tool | Role | Writes? |
|---|---|---|
| `get_overview` | read — the startup "what is going on" | no |
| `get_topic` | read — one topic, or one axis via `axisId` | no |
| `search_dashboard` | read — substring search, match field per hit | no |
| `reconcile_topic` | the single atomic write path (topic fields, axes, links, problems, plans, transitions, annotations — one transaction) | **yes** |
| `record_activity` | one objective event (PR/commit/run/doc) | **yes** |

Loading the product skill does not itself make the tools callable: **tool assignment and skill
assignment are separate**. Assign the five tools to the profile alongside the skill and confirm they are
*assigned*, not merely described — a prompt that only lists the tool names advertises them without
assigning them, and a read that looks grounded can then come from nothing.

---

## 3. Representation packet — what the trace can and cannot carry

**Faithful (CAN represent):**
- `sourceType` values the manifest declares: `github_pr`, `github_commit`, `github_issue`,
  `repo_document`, `group_chat`, `experiment`, `agent_review`, `manual`. The identifier goes in
  `sourceRef` (e.g. `PR #44`, a short commit hash, `docs/AGENDA.md`).
- Axis fields: `kind`, `state` (`active|usable|draft|blocked|parked|completed|abandoned`),
  `currentState`, `blocker`, per-claim confidence (`stateConfidence` / `currentStateConfidence` /
  `blockerConfidence`).
- Problems (`open|resolved`, `stateConfidence`), plans with steps (`pending|active|done|blocked`),
  transitions (state history), annotations (topic- or axis-scoped; `interpretation`/`steering` must name
  exactly one target).
- Topic links: repositories (auto-registered when named), people (by account mapping), activity log.

**Cannot / must be flagged (do NOT fabricate a workaround):**
- **`record_activity` cannot link an event to a problem.** The manifest advertises `problemId` but its
  declared `inputSchema` does not include it and dispatch does not read it. A problem's *evidence*
  therefore cannot be attached through `record_activity`; a problem is still raised through
  `reconcile_topic`'s `problems[]`, with its repository link as `repositoryFullNames`. This is a
  **product finding**, not a code repair.
- **Confidence is a claim about the record, not a measurement.** A `confirmed` claim is refused unless
  backed in the *same call* by an activity, annotation, branch or PR. Where the packet says `inferred`,
  write `inferred`.
- **Attribution is account-mapped.** A person with no mapped account reports `attributable=false` —
  report that, never "idle". Identity comes from the session; never pass an actor/user id.
- **History is append-only.** A state change is a `transitions[]` entry, never a `state` field on an
  update (which is refused). Nothing deletes.
- **No timestamps invented.** PR/commit dates are day-only in the packet; do not invent a time-of-day.

---

## 4. Frozen public source pins

| Source | Repo | Pin |
|---|---|---|
| UDV (primary) | `ajegorovs/udv-echo-process` | `master` `841964d41f8dc73e55d78303e79ed4098c00d700` |
| Grablink (supporting) | `ajegorovs/Grablink-Full-sequence-acquisition` | `master` `e6f83b2f5a45a961044b107f2628b046d41c3ab2` |
| Dashboard (this product) | `ajegorovs/nakama-research-dashboard` | `main` `95ec34e5d24240c7ac92c384cff5d5658ebb8761` |

---

## 5. Approved seed packet (verbatim; do not paraphrase)

Everything below is the exact content to seed. Preserve Unicode byte-for-byte. Where a field is absent,
do **not** invent it.

### 5.1 Person

- Name: **Aleksandrs Jegorovs** · login: **ajegorovs**. Role: **none unless required** (authorized
  fixture person, expressly supplied for this public-repository exercise).

### 5.2 Topics (exact names) — no `summary` is supplied for either; leave both unset

1. **Experimental research** — primary **UDV**, supporting **Grablink**.
2. **Research infrastructure / team management** — primary **Dashboard**.

### 5.3 Six development axes, grouped by topic

**Topic 1 — "Experimental research"**

**Axis 1 — UDV acquisition automation.** `kind = experiment`, `state = usable`, confidence **inferred**,
repository **UDV**, person **Aleksandrs Jegorovs**. Windows DOP3010 acquisition, `.BDD` → JSONL decoded and
verified. Activities: `github_pr` **#44** (merged 2026-09-28) and `github_pr` **#69** (same day).

> currentState (verbatim #1): Automated UDV acquisition can mutate and verify the tested emissions/profile boundary and persist evidence-backed BDD/job records. Live commissioning passed for E20/E64 transitions; subsequent bring-up documentation records the two independent storage-directory surfaces.

**Axis 2 — UDV sparse-analysis validation.** `kind = test`, `state = usable`, confidence **inferred**,
repository **UDV**, person **Aleksandrs Jegorovs**. Activity: `github_pr` **#67** (merged 2026-09-28).

> currentState (verbatim #2): Cross-sitting sparse-analysis publication is reproducible and independently verified for the frozen SA5 comparison set. The published result deliberately stops short of recurrence, interpolation, cross-grid mapping or population inference.

**Axis 3 — High-rate optical acquisition.** `kind = feature`, `state = usable`, confidence **inferred**,
repository **Grablink**, person **Aleksandrs Jegorovs**. Activity: `github_pr` **#1** (merged
2026-09-24). Document: `repo_document` `docs/AGENDA.md`.

> currentState (verbatim #3): The RAM-buffered capture and asynchronous-save architecture is operational and has passed hardware-free and several connected-camera validations. Clean-machine MultiCam SDK setup is documented and configurable through one build property.

**Axis 4 — Grablink diagnostics and sustained-rate validation.** `kind = investigation`, `state = active`,
confidence **inferred**, repository **Grablink**, person **Aleksandrs Jegorovs**. Counters: duration, FPS,
save throughput, diagnostics, check return codes. Measured dropped **300–350 FPS**; driver
`TimeCode`/`OverrunCount` **not read**; sustained full-buffer complete; disk cycle open.

> currentState: **NONE supplied.** Do **NOT** invent a `currentState` text field for this axis. This is
> deliberate — record the axis fields, blocker, problem and plan exactly as below.

Blocker (verbatim, confirmed):
> Connected-camera sustained-rate and full-buffer validation remain required; dropped-frame behavior at 300–350 FPS is not yet fully instrumented.

Open problem (verbatim, confirmed):
> Sustained 300–350 FPS operation has measured dropped frames, while driver TimeCode/OverrunCount and production CaptureStats instrumentation are not yet available to explain them.

Plan (summary verbatim):
> Complete camera-connected validation and production diagnostics for sustained high-rate acquisition.

Plan steps (verbatim, in order):
1. `Wire CaptureStats into the callback and save path.`
2. `Measure callback duration, effective FPS, save duration and disk throughput.`
3. `Read relevant driver/drop counters and surface diagnostics.`
4. `Run sustained 300–350 FPS and full-buffer-to-disk validation.`

Plan provenance: `docs/AGENDA.md` in the Grablink repo — if the source cannot be verified, **report
that; do not invent the plan.**

**Topic 2 — "Research infrastructure / team management"**

**Axis 5 — Research dashboard and focused retrieval.** `kind = feature`, `state = usable`, confidence
**inferred**, product shared. Activities (`github_commit`): **`5a62749`**, **`da7996b`**, **`95ec34e`**.
Qualified acceptance.

> currentState (verbatim #5): The dashboard product and scoped `get_topic` retrieval are published and accepted for the tested scope. A follow-up pagination edge case was corrected without reopening the historical live acceptance.

**Axis 6 — Agent consultation and automation evidence.** `kind = test`, `state = usable`, confidence
**inferred**. Direct + focused demonstrated; profile system-prompt workaround; assigned skill
**unproven**; N-7 complete but ephemeral; ordered trace **unproven**; semantic (not formal).

> currentState (verbatim #6): Direct dashboard consultation is demonstrated, but the accepted stage remains qualified: normal assigned-skill loading was not exercised end-to-end, and N-7 automation lacks a retained tool trace.

Open problems (verbatim, confirmed) — acknowledged gaps, **not** a blocked state:
1. > Normal assigned `research-coordinator` skill loading has not yet been demonstrated end-to-end; the accepted consultation fixture used profile system-prompt guidance instead.
2. > N-7 automation completes, but its ephemeral session does not retain the tool trace required to prove dashboard consultation.

### 5.4 Activity provenance (8 events: day-only dates)

| Event | Axis | `sourceType` | `sourceRef` | Date |
|---|---|---|---|---|
| PR #44 merged | 1 | `github_pr` | `PR #44` | 2026-09-28 |
| PR #69 | 1 | `github_pr` | `PR #69` | 2026-09-28 |
| PR #67 merged | 2 | `github_pr` | `PR #67` | 2026-09-28 |
| PR #1 merged | 3 | `github_pr` | `PR #1` | 2026-09-24 |
| AGENDA doc | 3 | `repo_document` | `docs/AGENDA.md` | (not supplied — omit) |
| commit 5a62749 | 5 | `github_commit` | `5a62749` | 2026-10-07 |
| commit da7996b | 5 | `github_commit` | `da7996b` | 2026-10-07 |
| commit 95ec34e | 5 | `github_commit` | `95ec34e` | 2026-10-07 |

Caveat: some `sourceType`s (`repo_document`, `github_commit`) may not be honored by a given tool
version — verify against the live `inputSchema` first and report a declared-but-unsupported type. Commit
refs must be the **public** commit URL/hash only; never a private URL.

---

## 6. Expected post-seed counts (verify programmatically, never from memory)

**2 topics · 6 axes · 1 person · 3 repositories · 4 plan steps · 3 problems** (1 on axis 4, 2 on axis 6).
Read from `get_overview` / `get_topic`; do not assert from memory.

---

## 7. Execution phases

**Phase 0 — startup & live-state checks (read-only first).** Check what is already listening before
starting anything; the instance starter refuses to launch when its port already has a listener, so never
start a second API. Health-check the API **before** starting it, and start it through its own script with
a sanitized environment (no provider keys inherited). Launch the review web from a **persistent parent
shell**, not a delegated/background child that is torn down with a session, and verify each listener
independently (a missing UI is not evidence the API is down, and vice-versa). Treat lifecycle
explanations as hypotheses until measured. Observe, and warn about, any boot-time bundled-skill
assignment/containment warnings; do **not** repair-and-continue for a manual exercise, and preserve any
existing E2E containment state rather than erasing it.

**Phase 1 — org discovery & EXPLICIT target decision (gate: PENDING; one decision before any write).**
Capture the read-only identity of **both** existing org stores before writing. Choose **one** target org
for the exercise and record the choice and rationale; the intent for a **fresh public fixture** is a new,
separate org (org creation is the one owner authorization this plan batches — obtain it before writing).
Rules: never let a reinstall/install helper pick `orgs[0]` (pass `--org-id`/`--org-name` or the explicit
env selector); never silently overwrite the admitted E2E store; preserve both existing stores
byte-identical and record before→after identity and counts. The org that hosts the corrected deploy must
be the same explicit target as the write. **How an unknown target prevents writes:** until this one
decision is made, no write may proceed — an unqualified helper could rebind the wrong organization.

**Phase 2 — corrected product deploy (explicit target org; prerequisite to writing).** Only if the served
release ≠ the corrected build at the chosen org. Gate the source (`bun run check` and
`bun run typecheck:host`), vendor into the checkout the units actually run from, reinstall with the
**explicit** org, and verify with the served-build guard (reinstall output is not evidence). Confirm the
untargeted store is untouched. Owner-authorized, fresh-session only.

**Phase 3 — the manual five-tool exercise (product write path only).** The operator works through the
dashboard agent; the agent discovers the five tools and calls them on the next model call. The operator
does **not** run SQL, harness seeders, or the action HTTP route directly.
- **Search-before-create:** `get_overview` for the baseline and counts; `search_dashboard` for each topic
  name and axis title — reconcile, do not near-duplicate.
- **Write sequence:** one atomic `reconcile_topic` per topic carrying axes, the axis-4 problem and plan,
  and any annotations the conversation established; then `record_activity` per event (§5.4). Pass
  `expectedVersion` on every `reconcile_topic`; on `conflict`, re-read and decide again — never overwrite
  blindly. Check `ok` on every call and handle by `kind`.
- **Do not:** invent fields the packet omits (notably axis 4's `currentState`); promote `inferred` to
  `confirmed` without same-call evidence; link an activity to a problem (unsupported, §3); write via SQL
  or run a harness seeder.

**Phase 4 — readback, reconciliation & evidence.** Re-read with `get_topic` (topic-wide and
`axisId`-scoped) and `get_overview`; reconcile the counts against §6 and per-axis texts against §5;
report any drift as a finding. Separate **requested** from **executed** calls, and where a session does
not retain a tool trace, classify it `missing_trace` rather than claiming tool-level consultation from
grounded content alone. Cross-check the untargeted store is unchanged. Apply public-record hygiene to
anything the run would publish.

---

## 8. Read, search & version semantics (the product's own rules)

- **`search_dashboard`** returns a match field per hit; dedupe against it before creating.
- **`get_overview`** is the baseline: establish and record counts before any write and after.
- **`get_topic` scoped reads:** a topic-wide read and an `axisId`-scoped read have different shapes. The
  axis-scoped `notes` collection is filtered to notes filed on the axis itself **in the read, before the
  limit** — a multi-target note that also names a problem belongs to that problem and does not consume an
  axis-notes slot. Read `coverage`/`truncated` (rows exist beyond what was returned) rather than assuming
  `returned <= limit`, and never read an empty collection (`absent`) as omitted. **Completeness:** page a
  truncated read; `truncated` is not `absent`.
- **Versions:** every `reconcile_topic` should carry the `expectedVersion` read from `get_topic`; a
  `conflict` is a re-read-and-decide, never a blind overwrite.

---

## 9. Limitations (stated, not invented)

- **No automated acceptance** from this run: it is manual, and its result is a **finding set**, not a
  verdict.
- **Unsupported `record_activity` → problem evidence** (§3): that link stays absent.
- **Axis 4 has no `currentState`** by design (§5.3).
- **Person attribution** depends on account mapping; `attributable=false` is reported, not "idle".
- **Day-only dates**: merge dates are day-only; do not invent times or an AGENDA publication date. If a
  tool requires a timestamp, report that precision limitation rather than fabricating one.
- **No topic summary** is supplied, so both topics' `summary` stays unset.

---

## 10. Open decision (must be answered before execution)

**Target organization (§7, Phase 1):** which org hosts this exercise — the existing real-example store, a
**new** org (preferred for a fresh public fixture), or (only if authorized) the admitted E2E store?
**One decision, before any write.** Writing into the admitted E2E store without this decision would
contaminate the evaluation fixture. The local handoff names the actual orgs and ids.

---

## 11. Public-record hygiene

This plan and the packet are a fact **set**, not a live endpoint. If anything from the run is published:
loopback (`127.0.0.1:<port>`) stays verbatim; an identity-shaped host becomes
`http://<box>.<tailnet>.ts.net`; a literal address, a private DNS suffix or a machine path
(`/home/<name>/`, `/mnt/<name>/`) is redacted to a placeholder; credentials are referenced by key name
only. The ignored local handoff — startup commands, absolute paths, live ports/pids, org ids, env-key
handling — never enters this committed plan.
