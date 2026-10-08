# WP4 — Retained-fixture amendment: design (before/after, classified, idempotent)

> **Status: WP4 DESIGN ONLY — no execution.** This document designs the **retained-fixture amendment**
> program for the accepted public-research fixture. It performs **no** fixture write, no `reconcile_topic`,
> no `record_activity`, no inference, no service start/stop/restart, no vendor/reinstall/deploy, no
> product/UI edit and no merge. It authorizes **no** WP3 baseline seed, no WP5 checks, no WP-G mutation
> gate. Every proposal below is a **candidate** that awaits explicit human approval and the WP-G gate.
>
> **Authorization.** The dispatching brief authorized **WP4 design only**. This session treats the brief as
> that authorization and states the boundary rather than re-litigating it. It does not edit the findings
> ledger's §A–§H rows, the WP1/WP2 records, the WP3 document, any PR, any skill, or git history.
>
> **Scope of the artifact.** This design is
> `docs/plans/public-research-retained-fixture-amendment-design.md`; its sibling
> `docs/plans/public-research-baseline-seed-design.md` is the WP3 design. Local scratch (git-ignored) is
> allowed; no `§A–§H` finding row or WP1/WP2 record is amended. (A separate appended ledger stage-summary,
> §I, records the design stage.)

## 1. Purpose and what this design covers

WP2 designed the **link** delta (F01/F02/F04, six candidate pairs D1–D6). WP4's mandate is broader: an
**idempotent before/after amendment plan covering every verified correctable fixture finding** — links,
source dates, identity metadata, `currentState`, public URLs, plan `position`s and wording — not only the
six links. This document is that plan.

It is a **design**, not a packet to run. For each correctable finding it states:

- the **BEFORE** (measured, retained) and the **AFTER** (proposed);
- its **mutation class** — one of exactly three: **correction**, **enrichment**, **optional editorial addition**;
- the **exact exposed tool path** and whether that path **actually supports** the change (§4 is the
  feasibility ground; a change with no supported path is **BLOCKED**, never expressed as a payload that
  does not exist);
- its **idempotency** and **conflict** semantics (§4.3);
- the **decision** it needs (whose: human, product, or none).

Findings that are **not correctable** (product boundaries, intentional absences, reviewer-attested only,
or product-repair findings) are carried as **no-mutation** with the reason, so silence is never mistaken
for coverage.

### 1.1 Inputs (read, not re-litigated)

| Input | Role |
|---|---|
| `docs/reviews/public-research-fixture-findings.md` §A–§H | the ledger; §E WP1 dispositions, §F/§H reviewer verdicts (preserved) |
| `docs/reviews/wp1-public-research-fixture-verification.md` + `…-evidence.json` | per-finding verified evidence at the frozen pins |
| `docs/reviews/wp2-public-research-fixture-relationship-delta.md` §9 + `…-evidence.json` | the accepted six-pair link delta and its qualifications |
| `docs/plans/research-fixture-methodology.md` §2–§6 | dispositions, evidence rules, the amendment-vs-seed rule, the pre-write gates |
| `.agents/skills/research-fixture-authoring/SKILL.md` | the contributor procedure and readback shapes |
| Product contract: `nakama.plugin.json`, `src/actions.ts`, `src/store.ts`, `migrations/002`, `004` | the **exposed write paths** and what each can and cannot update |

Frozen pins (public, kept): UDV `ajegorovs/udv-echo-process` `841964d4…` (master); Grablink
`ajegorovs/Grablink-Full-sequence-acquisition` `e6f83b2f…` (master); Dashboard
`ajegorovs/nakama-research-dashboard` `95ec34e5…` (main). Source-file line references below are valid at
the pin and at HEAD (WP1: `git diff 95ec34e…HEAD` touches only `docs/` and `.agents/skills/`).

### 1.2 Program declaration

This is a **retained-fixture amendment**: it corrects/enriches an **existing, accepted** fixture. It is
**explicitly approved and idempotent**; it **re-reads** the current version, adds only what sources
support, and may correct existing links/dates/positions only through an **approved before/after delta**.
It **does not** duplicate events to simulate corrections, and it **preserves** stronger human steering and
historical acceptance records. A correction to a published acceptance record would live in a **new
document**, never a force-push — but no published record needs correcting here.

## 2. The three mutation classes (applied to every row)

| Class | Meaning | Examples here |
|---|---|---|
| **correction** | fixes a **required** field/finding whose absence is a defect | F01 (D1/D2), F04 (D5/D6), **F14a** (required evidence field on a supported capability), F07/F09 metadata, F12 positions |
| **enrichment** | adds source-backed content the fixture legitimately lacked (not a defect) | F02 (D3/D4) axis→person links; **F03 / F04 axis-evidence** (source-backed evidence) |
| **optional editorial addition** | populates an **optional** field / authors wording; needs human-authored approval — **authored prose only** | F08 `currentState` wording (the field is optional) |

**Classification rule — factual correction/enrichment vs authored optional prose.** A finding whose subject
is a **required, source-backed link or field** (F01, F03, F04, F14a) is a **correction or enrichment**,
never an "optional editorial addition": calling a *required* sourced link "optional editorial" would
disguise a defect as a taste choice. The human decision for those rows is only *where/how* evidence or the
link is attached (§9.1), not *whether* the required content exists. **Only authored human prose over an
*optional* field** — F08's `currentState` wording, and a topic `description`/`summary` a human might one
day write (F07b/F16) — is an optional editorial addition. The classes are mutually exclusive per row.

A **capability status** (supported/unavailable) is reported **alongside** the class, never instead of it
(the F14a rule). A row may be a class **and** BLOCKED: the class says what the change *would be*, BLOCKED
says no exposed path can carry it.

## 3. Finding disposition register (all verified correctable findings)

Legend: **Path** = the exposed tool write path (or `—` for none). **Idem** = idempotency at the store
level. **Decision** = what must be approved before executing.

| ID | Class | Intended change | Path (feasibility) | Idem | Decision |
|---|---|---|---|---|---|
| **F01** (D1,D2) | correction | axis↔repo links on both infra axes | `reconcile_topic.axes[].repositories[]` — **supported** | upsert | **role undecided → human**; cannot express "undecided" (§5) |
| **F02** (D3,D4) | enrichment | axis↔person links on both infra axes | `reconcile_topic.axes[].people[]` — **supported** | upsert by login | approved (exact login confirmed) |
| **F03** | enrichment (evidence placement; **required** finding) | diagnostics-axis evidence / provenance location | insert-only, or none; **move UNSUPPORTED** | see §9.1 | **choice unresolved → human** |
| **F04** (D5,D6) | correction | problem↔repo links (both consultation problems) | `reconcile_topic.problems[].repositoryFullNames` — **supported** | replace-set | approved; needs verbatim `statement` |
| **F04** evidence part | enrichment (evidence placement; **required** finding) | consultation-axis evidence | insert-only, or none; **move UNSUPPORTED** | see §9.1 | **choice unresolved → human** |
| **F05** | correction *(would-be)* | AGENDA event `occurredAt` → source date | **BLOCKED** — no activity-update path | — | blocked capability (§6) |
| **F07** | correction | repo `url`/`description`/`defaultBranch` | `reconcile_topic.repositories[]` — **supported** (coupled to a link write) | upsert | approved; **exact pinned-README description text fixed in §7.2** |
| **F08** | optional editorial addition | diagnostics-axis `currentState` | `reconcile_topic.axes[].currentState` — **supported** | version-bump | **exact wording + confidence → human**; evidence coupling (§8) |
| **F09** (url/branch/desc) | correction | same fields as F07 | same as F07 | same | same |
| **F09** ("source docs") | — | none | **unavailable** (no Repository field) | — | boundary, no mutation |
| **F10** (existing events) | correction *(would-be)* | event `sourceUrl` | **BLOCKED** — no activity-update path | — | blocked capability (§6) |
| **F10** (problem provenance) | — | none | **unavailable** (Problem has no `sourceUrl`) | — | boundary, no mutation |
| **F12** | correction | plan-step `position`s 1..4 | `reconcile_topic.plans[].steps[].position` — **supported** | update by stepId | approved |
| **F14a** | correction (required evidence field; **existing** problem only) | existing-problem evidence links | **supported but insert-only** (`activities[].problemId`) | insert | **choice unresolved → human** |
| **F14b / F14c** | — | none | **unavailable / schema defect** | — | product finding, no mutation (§9) |
| **F17** | — | none (documentary only) | **no fixture field overstates** | — | fixture text stands; report corrected (§9) |
| **F06, F11, F13, F15, F07b, F16** | — | none | product projection / optional / boundary | — | no mutation (§9) |

## 4. Feasibility ground — the exposed write paths (contract-inspected)

Everything below is read from the product contract at the pin; WP4 asserts only paths that exist.

### 4.1 What the two write tools can change

- **`reconcile_topic`** — one atomic transaction (`store.ts:5672`). It can:
  - patch **topic** fields (`name/description/status/summary`) — guarded by the **top-level
    `expectedVersion`**, used **only** when a `topic` patch is present (`store.ts:5698-5708`,
    `applyTopicPatch` `store.ts:6105-6155`; `assertVersion` `store.ts:6752`);
  - create/patch **axes** by `id` (needs the axis's `expectedVersion` inside the item) (`store.ts:5750-5804`);
  - **link** repositories and people at topic and axis level (upsert-on-conflict, `linkRepository`
    `store.ts:6429-6452`);
  - **insert** activities (`store.ts:5806-5840`, `insertActivity` `store.ts:6575`) and annotations;
  - update **problems** via `problems[]` → `updateProblem` (`store.ts:4779-4862`), where
    `repositoryFullNames` **replaces** the whole `problem_repositories` set (`replaceProblemRepositories`
    `store.ts:6556`);
  - update/create **plans** and **steps** via `plans[]` (`store.ts:5882-5927`; `updatePlanStep`
    `store.ts:5086`).
- **`record_activity`** — **inserts one event only** (`actions.ts:361-387`, `addActivity`
  `store.ts:3817`). It has **no update mode**.
- **No action exists** for `register_repository`/`register_person`, for **deleting/deleting-repointing
  an activity**, or for editing a plan step outside `reconcile_topic`.

### 4.2 UPDATE-supported vs INSERT-only (the crux)

| Object | Update in place? | Evidence |
|---|---|---|
| topic | yes (versioned) | `applyTopicPatch` `store.ts:6105` |
| axis (incl. `currentState`) | yes (versioned) | `applyAxisPatch` `store.ts:6205-6290` |
| repository metadata | yes (`url`/`description`/`defaultBranch`) | `upsertRepository` `store.ts:6292-6347` |
| person | match-only (creates if new) | `upsertPerson` `store.ts:6388-6427` |
| plan | yes (summary; versioned) | `updatePlan` `store.ts:5006` |
| plan step (title/position/state) | yes | `updatePlanStep` `store.ts:5086` |
| problem (statement/conf/planStep/links) | yes | `updateProblem` `store.ts:4779` |
| **activity (any field)** | **NO — INSERT-only** | only `insertActivity` writes `activities`; no `UPDATE activities` anywhere |

**Consequence:** every finding whose fix would **edit an existing activity row** (F05 `occurredAt`; F10
`sourceUrl`) has **no supported mutation path** and is **BLOCKED** (§6). It must not be expressed as a
payload.

### 4.3 Idempotency and conflict semantics (as designed, not assumed)

- **`expectedVersion` availability is uneven.** It exists for the **topic** (top-level) and for each
  **axis** (`axes[].expectedVersion`). The manifest's **`problems[]` and `plans[]` items carry no
  `expectedVersion`**, so a problem/plan update **cannot be version-guarded through the tool**; dedup for
  those rests on a fresh **readback** (statement/version match) before writing.
- **Version bumps are sometimes unconditional.** `applyAxisPatch` and `applyTopicPatch` do
  `version = version + 1` on **every** call, even a no-op. So the amendment is **content-convergent**
  (a re-run reaches the same stored content) but **not version-frozen**: a retry must **re-read** the
  version, and a retry that reuses a stale `expectedVersion` gets a **`conflict`** (`assertVersion`
  `store.ts:6752-6766`). "Idempotent" here means *same end content*, not *same version*.
- **Link/upsert writes are idempotent.** `linkRepository` (`ON CONFLICT … DO UPDATE`),
  `resolvePersonForLink`/`upsertPerson` (match by `github_login`), `upsertRepository` (match by
  `full_name`, updates only changed columns), `updatePlanStep` (by `stepId`). Re-running them does not
  duplicate.
- **Activity inserts are NOT idempotent.** `activities` has **no uniqueness constraint** on
  `(topic_id/axis_id, source_ref)` (`migrations/004:346-370`), and `insertActivity` always inserts a new
  row. A retried activity add produces a **second event**. Every activity-adding proposal (§9.1) is
  therefore marked **non-idempotent at the store** and must be front-guarded by a readback
  (`search_dashboard`/`get_topic`) that asserts the event is absent; it is never auto-retried.
- **`assertClaimsAreBacked`** (`store.ts:6786-6816`): a `current_state` claim marked **`confirmed`**
  is refused unless the axis carries **evidence** (`axisEvidence(axis).length > 0`) — a branch, a PR or
  an activity — in the **same call**. This governs F08 (§8).
- **The default `relationship` is `supporting`.** A repository item with no `relationship` links as
  `supporting`; a `primary` link **demotes** any current primary first (`store.ts:6437-6445`). So a
  repository **metadata** write (which must go through `repositories[]`) is **coupled** to a link write
  and can silently change a relationship. The mitigation is to **carry the existing relationship
  explicitly** (§7.2).

## 5. Group A/B — axis links (F01, F02)

Both are additive link writes on the **existing** axes of the infra topic, inside one `reconcile_topic`
transaction. Axis `expectedVersion` is read fresh before the call. Because `expectedVersion` is at the
**axis** level and the topic patch is absent, the **top-level `expectedVersion` is inert** for a
links-only reconcile (`resolveTopicForReconcile` ignores it; `applyTopicPatch` is only entered when
`input.topic` is present).

### 5.1 A — F01 axis↔repository links (correction) — D1, D2

- **BEFORE (measured):** both infra axes have `repositories: []`; the dashboard repository reports
  `axes: []`, `activityCount: 0`, `lastActivityAt: null`, yet the axis carries three dashboard commits
  (`95ec34e`, `da7996b`, `5a62749`) and the sibling consultations. Event→repository attribution is
  **indirect through the axis** (`store.ts:3411-3419`), so **naming** the repository on the axis
  attributes those events **without editing any event row**.
- **AFTER (proposed):** axis *Research dashboard and focused retrieval* → `ajegorovs/nakama-research-dashboard`;
  axis *Agent consultation and automation evidence* → `ajegorovs/nakama-research-dashboard`.
  `relationship` = **[UNDECIDED — do not default]**.
- **Path:**
  `reconcile_topic { topicId:<infra>, axes:[ { id:<axis5>, expectedVersion:<axis5 v>,
  repositories:[{ fullName:"ajegorovs/nakama-research-dashboard", relationship:<decided> }] },
  { id:<axis6>, expectedVersion:<axis6 v>, repositories:[{ fullName:…, relationship:<decided> }] } ] }`
- **BLOCKED-pending-human — the role cannot be left undecided.** The reviewer left the axis→repository
  role `null`/undecided, explicitly **not** `supporting` and **not** `primary` (§9.1 of WP2; §H.1 of the
  ledger). The manifest enum is **`{primary, supporting}` only**, and omitting the field makes the store
  **default to `supporting`** (`store.ts:5788`, `:6436`). There is **no way to store "undecided"**.
  Therefore executing D1/D2 without a human role decision would **silently assert `supporting`** — the
  exact value the reviewer refused. **Decision: withhold D1/D2 until a human sets the role.** (This is a
  design decision, not an oversight: the amendment must not launder an undecided semantic into a default.)
  **The same reasoning applies to axes 1–4's retained `supporting`** — its being a fixture link does not
  establish the semantics, so the axis→repository role is unresolved for **all six** axes (see the WP3
  design §9 D-A).
- **Idempotency:** `linkRepository` upserts on `(axis_id, repository_id)` — re-running is content-stable.
  Each run bumps both axis versions, so retries re-read versions.
- **Source:** the three commits are git-verified commits of the dashboard repo; parent-topic primary repo
  is the dashboard repo (WP2 §4).

### 5.2 B — F02 axis↔person links (enrichment) — D3, D4

- **BEFORE:** person *Aleksandrs Jegorovs* (`githubLogin ajegorovs`, `nakamaUserId: null`) carries the
  four experimental axes only; both infra axes have `people: []`; the person is linked to the infra
  **topic** but not its axes.
- **AFTER (proposed):** axis5 and axis6 each link the person.
- **Path:** `… axes:[{ id:<axis5>, expectedVersion:…, people:[{ displayName:"Aleksandrs Jegorovs",
  githubLogin:"ajegorovs" }] }, { id:<axis6>, … }]`
- **Class rationale:** WP2 §9.2/§H classifies these as **source-backed enrichments**, not a restoration of
  the seed packet (the packet named the person on axes 1–4 only). The identity basis is **exact and
  API-verified**: fixture `githubLogin` = the GitHub `author.login` of each of the three named dashboard
  commits; the git author *name* is not treated as identity.
- **Idempotency:** `resolvePersonForLink` matches the existing row by `github_login` (no new person);
  `nakamaUserId` stays `null`, so `attributable` stays **false** — "report `attributable=false`, never
  idle". Re-running is content-stable.
- **Decision:** approved (exact login confirmed).

## 6. Blocked mutations — findings with no supported path (state the gap, invent nothing)

These are **correctable in principle** but the exposed toolset has **no path**; they must be recorded as
**blocked capability**, never expressed as a payload that "would" be sent. `activities` is written only by
`insertActivity` — there is **no `UPDATE activities`, no `deleteActivity`, and no such action in
`nakama.plugin.json`** — and **no direct-database write and no workaround** is used: the product's own
write path is the only surface, and a mutation outside it is out of scope for any amendment.

| ID | Would-be class | Why blocked | Exact gap |
|---|---|---|---|
| **F05** | correction | the AGENDA event `occurredAt` cannot be updated | `activities` is **INSERT-only**; no `updateActivity`/`deleteActivity` and no such action in `nakama.plugin.json` |
| **F10** (existing events) | correction | existing event `sourceUrl` cannot be set | same INSERT-only boundary |
| **F03 / F04 — "move"** | correction | an event cannot be **re-pointed** to another axis | no activity re-point path (single-axis column, insert-only) |
| **F14a — retro-link** | enrichment | an **existing** event cannot be linked to a problem after the fact | `activities[].problemId` only applies to a **new** insert |

### 6.1 F05 — source-date basis and precision (settled spec, for the record and for future seeds)

The AGENDA document `docs/AGENDA.md` (Grablink, pin `e6f83b2`) carries **no explicit date**. Its
**last file-touch commit at or before the pin** is `44ba1a4` @ **2026-09-24T11:33:25+03:00** — a
timestamp **known to the second with offset**, so the source is **not inherently day-only**. The
**chosen precision** for this historical attribution is **day-only `2026-09-24`** (no time-of-day
invented). The fixture currently stores `occurredAt` = `recordedAt` = **2026-10-07T14:32:13.984Z**
(the ingestion day). This basis/precision is the **decided spec**; **its application to the existing
event is BLOCKED** (no update path). If a human ever authorizes an activity-update capability, the value
to write is `occurredAt = "2026-09-24"`.

### 6.2 F10 — public URLs (design spec; existing rows blocked, future events carry them)

The model supports `activities.source_url` (`migrations/002:164`, `004:362`; manifest
`activities[].sourceUrl`). Proposal (for **new** events only; existing rows **BLOCKED**):

- dashboard commits `95ec34e`/`da7996b`/`5a62749` → `https://github.com/ajegorovs/nakama-research-dashboard/commit/<full-sha>`;
- Grablink `PR #1` → `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/pull/1`;
- UDV `PR #44`/`#69`/`#67` → `https://github.com/ajegorovs/udv-echo-process/pull/<n>`;
- AGENDA doc → `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/blob/<pin>/docs/AGENDA.md`.

**Problem provenance is not a field at all** (`Problem` type `store.ts:336-348` has no `sourceUrl`), so
that half of F10 is a **model boundary**, not a blank field.

## 7. Group C/D/E — links, metadata, positions

### 7.1 C — F04 problem↔repository links (correction) — D5, D6

- **BEFORE:** the two consultation-axis problems both have `repositories: []` → unattributable (F04).
- **AFTER (proposed):** each problem → `ajegorovs/nakama-research-dashboard`.
- **Path:** `reconcile_topic { topicId:<infra>, problems:[ { problemId:<N-7…>, statement:<verbatim>,
  repositoryFullNames:["ajegorovs/nakama-research-dashboard"] }, { problemId:<skill-loading…>,
  statement:<verbatim>, repositoryFullNames:[…] } ] }`
- **Feasibility & hazards:** `problems[].repositoryFullNames` maps to `replaceProblemRepositories`
  (`store.ts:4849-4854`) which **deletes then re-inserts the whole set** — so the payload must carry the
  **full intended set** (here, exactly the one repo), and the manifest **requires `statement`** on every
  item. The `statement` is an **unchanged echo** of the stored text → `assertTextIsReplaceable` passes
  (unchanged echo is not a rewrite) and **no version bump** occurs for the statement; the repository set
  is replaced regardless.
- **Conflict guard — limitation:** the manifest `problems[]` item has **no `expectedVersion`**, so this
  update **cannot** be version-guarded through the tool. Dedup/conflict is handled by a fresh **readback**
  of the problem's `statement`/`version` immediately before the call; on any drift, stop and re-derive.
- **Idempotency:** replacing the set with the same set is content-stable and re-runnable (a retry
  re-reads the statement first).
- **Source:** `5a62749` and the consultation stage/acceptance records live in the dashboard repo.

### 7.2 D — F07 / F09 repository metadata (correction)

- **BEFORE (measured):** all three repositories return `url:''`, `description:''`, `defaultBranch:''`.
- **AFTER (proposed — explicit values, fixed by the pin):**

  | Repository | `url` | `defaultBranch` (source branch @ pin) | current GitHub `default_branch` (as-of-read) | `description` (pinned README, normalized) |
  |---|---|---|---|---|
  | `ajegorovs/nakama-research-dashboard` | `https://github.com/ajegorovs/nakama-research-dashboard` | `main` | `main` | `A dashboard page plus agent tools over shared coordination state — topics, development axes and the evidence attached to them — for a self-hosted Nakama instance. One page (the overview, with the editing surface underneath it), eight actions of which five are agent tools, one skill, org-scoped SQLite storage.` |
  | `ajegorovs/udv-echo-process` | `https://github.com/ajegorovs/udv-echo-process` | `master` | `master` | `Multi-sensor Ultrasonic Doppler Velocimetry (UDV) processing for rotating machinery analysis. Supports echo (amplitude) and velocity measurements from single-sensor continuous recordings and multi-sensor rolling (round-robin) arrays, in both raw time-series and statistical-summary formats.` |
  | `ajegorovs/Grablink-Full-sequence-acquisition` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition` | `master` | `master` | `Windows MFC application for capturing high-frame-rate 8-bit monochrome image sequences from an Euresys Grablink/MultiCam capture card.` |

- **The description value is concrete and normalized, not a "harvest at execution" placeholder.** Each
  string above is the repository's **own README opening paragraph from the frozen pin** (§1 header pins;
  `README.md`, the paragraph immediately under the H1), with the **soft line-wraps collapsed to single
  spaces** and the markdown **`**…**` emphasis markers stripped** — the emphasis is **presentation**, and
  the field is plain text. **Words are preserved exactly**: nothing added, removed or reordered. The exact
  pinned excerpt is retained in the WP3 design's §3.3 manifest. F07 requires **source text, not
  paraphrase**, and the pin fixes the string, so it is specified here rather than deferred.
- **Branch provenance — as-of-pin vs current, stated not assumed.** The `defaultBranch` written is the
  **source branch the frozen pin is on** (as-of-pin), **not** GitHub's mutable current `default_branch`; the
  **current** value read today is stated beside it. At the pins the two agree (`main`/`master`/`master`); if
  they ever diverge, the as-of-pin value wins and the divergence is recorded, never silently resolved.
- **As-of-pin vs as-of-read (stated, not silently resolved).** The `description` above is the **pinned
  README**, which is **versioned and authoritative** for the fixture. GitHub's mutable **`about`** field is
  **as-of-read** and **differs**: at read time UDV has no `about`; Grablink's `about` reads *"modified
  Euresys Grablink program to continuously save images"*; Dashboard's reads *"Research dashboard plugin for
  a self-hosted Nakama deployment: …"*. Per the WP3 design §3 item 3 the **pinned README wins**; the current
  `about`/`pushed_at` variance (the Dashboard `pushed_at` now postdates the pin) is **recorded, not
  resolved**, and a value read from the live API is labelled `as-of-read`. Repositories carry no `pin`
  field (F09b), so the pin rides this design's manifest.
- **Path & coupling hazard:** the **only** exposed path to write repository metadata is
  `reconcile_topic.repositories[]` (no `register_repository` action exists). That path **always also
  writes a link** (`linkRepository`), and a repository item with **no `relationship` defaults to
  `supporting`**, which would **demote** an existing `primary` topic link (infra→Dashboard primary;
  experimental→UDV primary). **Mitigation:** carry the **already-stored relationship verbatim** — the
  value the topic already holds, never an invented one (`topic_repositories`: infra names Dashboard
  **`primary`**; experimental names UDV **`primary`** and Grablink **`supporting`**; WP2 §3/§5) — in the
  payload —
  `repositories:[ { fullName:"ajegorovs/nakama-research-dashboard", url:…, description:…,
  defaultBranch:"main", relationship:"primary" } ]` for the infra topic, and
  `… relationship:"primary"` for UDV / `… "supporting"` for Grablink in the experimental topic. **No
  blanket `primary`:** each value is the stored one, not a default chosen for the write.
- **Idempotency:** `upsertRepository` updates only fields that **changed**; the link upsert is stable.
  Re-running is content-stable.
- **Note:** the "source docs" component of F09 is **unavailable** (no Repository field carries a
  document link) — no mutation (§9).

### 7.3 E — F12 plan-step positions (correction)

- **BEFORE:** the diagnostics axis's plan has 4 steps, **every `position: null`** (unordered; the model
  synthesizes no order — `migrations/004:118-119`).
- **AFTER (proposed):** the same 4 steps, **same `stepId`s and same verbatim titles**, carrying explicit
  positions **1, 2, 3, 4** in the authored order (step 1 → `Wire CaptureStats…` … step 4 → `Run sustained
  300–350 FPS…`). The design proposes **1..4 consistently** (the first authored step is position 1). The
  schema accepts any non-negative integer (`optionalPosition` `store.ts:654`; index
  `plan_steps_by_plan (plan_id, position)` `migrations/004:151`); the design fixes the base at **1** rather
  than leaving it open.
- **Path:** `reconcile_topic { topicId:<experimental>, plans:[ { planId:<diag plan>, axisId:<axis4>,
  summary:<verbatim plan summary>, steps:[ { stepId:<s1>, title:<verbatim>, position:1 }, … ] } ] }`
- **Semantics preserved:** a `stepId` present → `updatePlanStep` (update in place, **same step id**);
  `stepId` absent → `createPlanStep` (a new step — not what we do). The manifest requires `title` on
  every step; we resend the verbatim title. **Steps carry no version column**, so there is no step-level
  version to preserve. The **plan's** version is **not bumped**, because the required `summary` is sent as
  an **unchanged echo** (`updatePlan` bumps only when the summary text changes; `store.ts:5031`).
- **Idempotency:** re-running with the same positions updates the same steps — content-stable.
- **Decision:** **proposed, pending acceptance** — the authored order is in the packet §5.3, but the
  position base (1..4) is this design's proposal, not an approved mutation.

## 8. F08 — diagnostics-axis `currentState` (optional editorial addition)

- **BEFORE:** diagnostics axis `currentState:''`, `currentStateConfidence:null`; the other five axes
  carry a `currentState`.
- **Source sufficiency:** the pinned AGENDA (`Grablink docs/AGENDA.md` @ `e6f83b2`) supports a
  **conservative factual state** — a hardware-validated baseline (≈351 FPS preview, a 200-frame capture
  writing exactly `Image_00000.bmp`–`Image_00199.bmp`, a 2000-frame capacity run whose manual
  `Stop & Save` wrote **partial** sequences of 652 and 1028 frames) beside **outstanding** work
  (sustained 300–350 FPS with dropped-frame measurement; `core/CaptureStats` implemented and covered by
  13 tests but **no production code calls it**). **Evidence sufficiency and editorial choice are
  separate questions**: the source is sufficient; **population and exact wording remain human approval.**
- **AFTER (proposed, wording PENDING):** `currentState` = a candidate sentence drawn strictly from the
  AGENDA facts above; `currentStateConfidence` ∈ {`confirmed`, `inferred`}. This design does **not** fix
  the final sentence — that is the human's editorial call.
- **Path:** `reconcile_topic { topicId:<experimental>, axes:[ { id:<axis4>, expectedVersion:<v>,
  currentState:<approved text>, currentStateConfidence:<c> } ] }`
- **Evidence coupling — driven by the axis's `confirmed` blocker, NOT by the `currentState` confidence.**
  `assertClaimsAreBacked` runs on **any** axis write (`updateAxis` calls it "unconditionally … including
  ones this patch did not touch", `store.ts:3698–3700`; `reconcile_topic` calls it for every touched axis,
  `store.ts:6027–6037`) and grades the axis's `state`/`current_state`/`blocker` claims from the
  **patched/stored** values (`store.ts:6790–6798`). Axis 4 carries a **`confirmed` blocker** (the approved
  value, packet §5.3). So **every** axis-4 patch re-evaluates that blocker and needs the axis to carry
  **evidence in the same reconciliation** — a branch, a PR, an activity or an annotation — **regardless of
  the `currentState` confidence**. Writing `currentStateConfidence: inferred` does **not** exempt the call,
  because the blocker is a separate claim. **No confidence downgrade is proposed** to sidestep the guard:
  the honest values are kept and the required same-call axis evidence is carried (the natural route is a
  same-call axis activity, e.g. the AGENDA-source event — which is also what F03 asks for).
  *(The retained store currently carries axis 4's `blockerConfidence` as `inferred`, a measured deviation
  from the approved `confirmed`; that is a separate correction on the blocker's own row, not this
  `currentState` row.)*
- **Idempotency:** `applyAxisPatch` bumps the axis version on every call — content-stable, version-
  monotonic (re-read before retry). Not idempotent if the confidence/evidence pairing differs run to run.

## 9. Group G & no-mutation rows — evidence choices and boundaries

### 9.1 F03 / F04 (evidence) and F14a — the unresolved choice, articulated

**Distinguish two different things** (the brief's core requirement). These are **factual, `required`
findings** (F03/F04/F14a), **not authored-prose choices** (WP4 §2): the human decision is *where/how* an
existing or newly recorded evidence row is attached, never *whether* the required link exists. The
**move/duplicate/reassociate evidence strategy remains undecided** — no strategy is approved here.

1. **Problem → repository LINK** (F04; D5/D6) — a supported, non-duplicating mutation (§7.1). It does
   **not** depend on the evidence-location decision and can be approved independently.
2. **Existing-event PROVENANCE location** (F03; F04's axis evidence) — where the AGENDA/consultation
   evidence *sits*. This is **not** a link row; it is the `axis_id` on an existing `activities` row.

**Single-axis cardinality:** an `activities` row carries **exactly one** `axis_id`
(`migrations/004:350`; single FK). One event **cannot** be provenance for two axes at once. The AGENDA
event currently sits on the **sibling** high-rate-optical axis; it therefore cannot simultaneously serve
the diagnostics/consultation axes.

**Alternatives (no automatic move or duplicate — human decides):**

- **A — Leave as-is (no mutation).** The content is **not omitted**; it is attached to another axis
  (WP1 F03). Conservative, duplicate-free. **Recommended default.**
- **B — Reassociate / move** the event's axis to the target. **UNSUPPORTED** — no activity re-point/update
  path (§4.2). Blocked.
- **C — Duplicate/re-record** an AGENDA-referencing event on the target axis via
  `reconcile_topic.activities[]` (or `record_activity`). Feasible at the store (INSERT) but **discouraged**
  by the amendment rule ("do not duplicate events to simulate corrections") and **non-idempotent** (a
  retry inserts again; no uniqueness constraint). Acceptable **only** if a human judges it a *distinct,
  legitimate attachment*, not a duplicate — and it must be readback-guarded.
- **D — F14a evidence link.** Attach the axis's **existing** problem as evidence of an event via
  `reconcile_topic.activities[].problemId` (`store.ts:5837`, `6599-6609`). This is the **supported** way
  to give a problem evidence — **but only through a NEW event**; an event **already** recorded cannot be
  retro-linked (§6). So F14a's fix is "add new sourcing events", not "re-point old ones".

**Feasibility verdict:** in-place re-point is **impossible**; duplication is **possible but discouraged +
non-idempotent**; "leave" is always available. **No automatic choice is made here** — each is an approval
item. The F04 **repository links** (§7.1) are separable and do not require resolving this.

### 9.2 Non-correctable / boundary findings (no mutation, stated not implied)

| ID | Reason for no mutation |
|---|---|
| **F06** | product projection: `recencyAt` falls back to record touch and the UI labels it "activity" (`store.ts:5252/5438/5553` vs honest `lastActivityAt` `:5257/5444/5566`; `ui.tsx:4232/4248/4519`). A **product/UI repair**, out of amendment scope. |
| **F07b, F16** | topic `description`/`summary` are **optional/intentional** blanks (human editorial claims). **Protected** — leave blank; do not author. |
| **F09b** | repository **pin** is **unavailable** — no `pin` on the Repository type/DDL/manifest. Carried in the evidence manifest; never fabricated as dashboard state. |
| **F11** | attribution boundary (recorder vs upstream author); the manual tool path has no upstream-author field. Optional accepted limitation; **do not manufacture an account mapping**. |
| **F13** | plan **content provenance** is **unavailable** (plan authorship is first-class; the source document of its content is not). No field to add. |
| **F14b** | no title-like reference targets a **newly generated** problem in the same `reconcile_topic` call — **unavailable**; no workaround. |
| **F14c** | `record_activity` omits `problemId` from its declared schema — a **schema defect** at the action boundary. Record the defect; no workaround. |
| **F15** | person with no mapped account → `attributable=false`; optional accepted limitation; report the boundary, never "idle". |

### 9.3 F17 — correction is documentary, not a fixture write

The overstated shorthand ("…`sustained full-buffer complete`; disk cycle open") lives in the **report/
packet** (`docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md:134`), **not** in a fixture
field. The **fixture's own** text is the conservative blocker ("Connected-camera sustained-rate and
full-buffer validation remain required; dropped-frame behavior at 300–350 FPS is not yet fully
instrumented"), which the source **supports** (`Grablink README` "Still open… measured dropped frames at
300–350 FPS… a full-buffer capture followed by a complete disk-write cycle"). **No fixture field
overstates** → **no fixture mutation**; a gratuitous overwrite is refused. Correcting the *report shorthand*
is a documentary act outside this amendment (a new document, not a force-push).

## 10. Preservation and protection (must survive the amendment)

- **Human steering / accepted summaries are protected.** Blank `topic.summary`/`description` (F07b/F16)
  stay blank. Any human-authored problem `statement` or plan `summary` is protected by
  `assertTextIsReplaceable` (`store.ts:6518`); this design only **echoes** stored text unchanged, never
  rewrites it. (Today the fixture's text is agent-authored, so an agent *could* technically edit it — this
  design deliberately does **not**, per preservation.)
- **Protected orgs.** The write targets **one explicitly chosen organization** (`x-org-id` / `--org-id`),
  **never** `orgs[0]`; no helper that could rebind a default is used; the **un-targeted** stores are left
  unchanged and confirmed by their **own readback measurement** (post-write, not DB byte identity). No
  reinstall/deploy/restart.
- **Historical records preserved.** The findings ledger, WP1/WP2 records and PR #3 artifacts are
  **preserved unchanged**; no acceptance record is rewritten.
- **Public-record hygiene.** No live endpoints, org ids, recorder actor ids or secrets in anything this
  design would publish; loopback stays verbatim, identity hosts become placeholders.

## 11. Design invariants (for WP5 to encode later — NOT implemented here)

WP5 authors executable checks; **this design only states the invariants** they must assert. None is
implemented now.

1. **No new objects.** Post-amendment counts keep `new_repositories = 0`, `new_people = 0`,
   `new_topics = 0`, `new_axes = 0` (the amendment touches existing objects only).
2. **Link idempotency.** Running the amendment twice yields the **same set** of link rows
   (`axis_repositories`, `axis_people`, `problem_repositories`) — no duplicates.
3. **Version discipline.** Every versioned mutation (`topic`, `axis`) carries the `expectedVersion`
   **re-read in the same run**; a stale version refuses with `conflict` (a check that can go red on a
   planted stale version).
4. **No activity duplication.** The amendment adds **no** activity row unless a specific evidence-
   approval (§9.1) explicitly authorizes one; if authorized, a readback-guarded absence check precedes it
   (negative control: an injected duplicate must be detected).
5. **Relationship preservation.** For D1/D2 the stored `relationship` equals the **human-decided** value
   (never a defaulted `supporting`); topic `primary` links (Dashboard, UDV) remain `primary`.
6. **Metadata equality.** Stored repo `url`/`defaultBranch` equal the proposed values and `description`
   equals the **pinned README string** (byte-equal), not a paraphrase.
7. **Position monotonicity.** The four diagnostics steps carry **distinct ascending** positions in the
   authored order; step **ids and titles** are unchanged.
8. **Optional stays optional.** `topic.summary`/`description` remain empty; the `currentState` is written
   only if approved, and if its confidence is `confirmed`, the same transaction carries evidence (or the
   check demands `inferred`).
9. **Untargeted store unchanged** by its own readback.
10. **Blocked findings stay unapplied**: no attempt to write an activity `occurredAt`/`sourceUrl` on an
    existing row (there is no path; a check asserts none was attempted).
11. **Recency is not research (F06 side-effect).** A link write (axis↔repo, axis↔person, problem↔repo) and
    any axis patch **advance the axis's `updated_at`/recency** but add **no** activity; for every
    non-activity change the check asserts the **event count, each event's `occurredAt`, and `lastActivityAt`
    are unchanged**, while a recency/`updatedAt` field **may** advance — so a bumped recency is not mistaken
    for a new research event. (The product's `recencyAt` fallback and the "last activity" label are the F06
    *product* finding; this check is scoped to the fixture's own fields.)

## 12. Approval checklist (what a human must decide before WP-G)

| # | Decision | Blocks |
|---|---|---|
| 1 | axis→repository **role** for **all six** axes (`primary` \| `supporting`) — or explicitly withhold | Group A |
| 2 | F03 / F04 evidence-location choice (A leave / C duplicative add / D new problem-evidenced event) | §9.1 |
| 3 | F08 `currentState` **exact wording** and **confidence** (and the evidence pairing it implies) | §8 |
| 4 | Whether any **new** evidence events are authorized at all (F03/F04/F14a) | §9.1 |
| 5 | Confirm F04 problem↔repo links (D5/D6) independently of #2 | §7.1 |
| 6 | Confirm F12 positions base (1..4 vs 0..3) | §7.3 |
| 7 | Explicit **target organization** for the future write | all |

Approved items: F02 (D3/D4), F04 links (D5/D6), F07/F09 metadata, F12 positions. Blocked: F05, F10
(existing), F03/F04 move, F14a retro-link.

## 13. Boundaries

- **Design only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no inference, no
  service change, no deploy, no product/UI edit, no merge, no WP3/WP5/WP-G execution.
- **No invented capability.** Where there is no supported path (F05, F10-existing, move, retro-link), the
  limitation is recorded — no payload is asserted to exist.
- **No ledger/record edits by this design.** The findings ledger's §A–§H, the WP1/WP2 records and the WP3
  document are preserved unchanged; this design adds one new `docs/plans/` file (the WP3 design adds the
  sibling one). The ledger's appended §I stage-summary records the design stage and amends nothing.
- **A passing design is not authorization.** The write needs explicit human approval and the WP-G gate.
