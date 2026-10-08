# Public-research baseline-seed — design (WP3)

> **Status: DESIGN ONLY.** This is the **WP3** deliverable of the research-fixture methodology
> ([`research-fixture-methodology.md`](research-fixture-methodology.md) §7). It designs a **baseline seed**
> — the packet that would build the public-research fixture *from an empty target* — with **every field
> classified** (`required` / `optional` / `unavailable`), evidence **sequenced atomically**, an explicit
> source/date/pin manifest, and the model boundaries recorded. It performs **no** fixture write, no
> `reconcile_topic`/`record_activity`, no inference, no service/deploy/UI change, and it authorizes no
> WP4/WP5/WP-G. It is a **proposal to be validated**, not an execution record.
>
> **Governing skill:** `.agents/skills/research-fixture-authoring/` (its read-only preflight is validated at
> `a2e4931`; **its baseline-seed authoring path is not execution-validated** — no write has been exercised).
>
> **Inputs.** WP0 validation (attempt-4, passing); WP1 verification
> ([`wp1-public-research-fixture-verification.md`](../reviews/wp1-public-research-fixture-verification.md) +
> `…-evidence.json`); WP2 relationship delta
> ([`wp2-public-research-fixture-relationship-delta.md`](../reviews/wp2-public-research-fixture-relationship-delta.md) +
> `…-evidence.json`); the findings ledger ([`public-research-fixture-findings.md`](../reviews/public-research-fixture-findings.md)
> §A–§H); the approved seed packet
> ([`2026-10-07-public-research-fixture-five-tool-exercise.md`](2026-10-07-public-research-fixture-five-tool-exercise.md) §5);
> the product contract at the frozen pins (`src/actions.ts`, `src/store.ts`, `nakama.plugin.json`,
> `migrations/002`, `migrations/004`).
>
> **Sanitization.** No live org id/name, recorder actor, endpoint or host path appears here. Loopback
> (`127.0.0.1:…`) and public GitHub slugs/refs/pins are kept. Fixture-internal records are named by
> **semantic label**; the id map is a design artifact (§8), not a value.

---

## 0. Scope and authorization boundary

- **Design only.** Nothing here is dispatched or written. This document defines *what a baseline seed would
  carry and in what order*, not *that it should run*.
- **One program: baseline seed.** Not the retained-fixture amendment (WP4). A baseline seed builds a fresh
  fixture from an **empty** target; nothing can be assumed to exist, so §2–§4 of the methodology apply from
  the first write.
- **Not performed and not authorized by this design:** WP4 amendment packet, WP5 executable checks, WP-G
  mutation gate, any fixture/domain write, any inference, any service/deploy/UI/product change, any merge.
- **Owner authorization** (and an explicit target org) is a precondition of any future execution — a green
  design is not authorization.
- **Revision status (reviewer correction).** The concrete activity manifest (§3.4), the explicit-confidence
  values (§2.3, §5.3) and the all-six unresolved axis→repository roles (§9 D-A) are the **proposed baseline
  design — pending acceptance**, **not** mutation approval. Incorporating this layout is not an
  authorization to write; every write still needs explicit owner authorization and the WP-G gate.

---

## 1. Disposition model (the central rule)

Every proposed field is assigned **exactly one** disposition *before* any write. Silence must never read as
coverage; absence must never be papered over with invention.

| Disposition | Meaning | Absence is | Handling |
|---|---|---|---|
| **required** | must be present and source-backed | a defect | source it, or record an explicit open finding — do not invent |
| **optional** | may legitimately be absent | honest, not a defect | leave blank and **state it is deliberately unset** |
| **unavailable** | the product model/toolset cannot represent it | a stated limitation | record the limitation; **never** fabricate a workaround |

**"Supported" is not a fourth disposition** — it is a *capability status* reported about a **tool path**,
alongside the field's disposition. F14a is the worked case: field disposition **required**, capability
**supported**.

---

## 2. Blocks and field ledger (schema-faithful)

Field names below are the **manifest `inputSchema`** names actually accepted by the write path; the stored
model is named where it differs. "Source" is the input the baseline seed would draw the value from.

### 2.1 Repository (block: `repositories[]`, also named by links)

`Repository` (stored) = `{id, fullName, url, description, defaultBranch, createdAt, updatedAt}`
(`store.ts:112–120`); the write item accepts `{fullName, url, description, defaultBranch, relationship}`.

| Field | Disposition | Source / boundary |
|---|---|---|
| `fullName` | **required** | the public `owner/repo` slug; a repository is auto-registered when named |
| `url` | **required** (when the public source is available) | the public repo URL, grounded at the **frozen pin** (`https://github.com/<fullName>`); F07/F09 |
| `description` | **required** (when the public source is available) | the repo's **own pinned-README opening paragraph, normalized** — soft-wraps collapsed to single spaces and **presentation emphasis markers stripped**, words preserved; never a paraphrase. The **pinned README is authoritative** and GitHub's mutable `about` is **as-of-read** (§3 item 3); F07 |
| `defaultBranch` | **required** (when the public source is available) | the **source branch the pin is on** (as-of-pin) — **not** GitHub's current `default_branch`, which is stated beside it (§3 item 3); F07/F09 |
| `relationship` (topic/axis link) | **required** where a link row is written | enum `primary \| supporting` only; **no "undecided" value exists** (see §9 D-A) |
| repo **source pin** | **unavailable** | no `pin` field on `Repository` type, DDL, manifest or `types/`; F09b — carried in the §3 manifest, never a repo field |
| repo "source docs" | **unavailable** | "source docs" is not a `Repository` field at all (an activity `sourceUrl` lives on the *activity*); F09 |

### 2.2 Topic (block: `topic`, plus `topicId`/`topicName`/`expectedVersion`)

| Field | Disposition | Source / boundary |
|---|---|---|
| `name` | **required** | exact approved name (packet §5.2, verbatim, Unicode byte-for-byte) |
| `status` | **optional** (default honest) | enum `active\|paused\|completed\|archived`; both topics `active` per packet; do not assert a status the source does not state |
| `description` | **optional** | editorial/human text; **blank by design** unless a human authors it (F07b) |
| `summary` | **optional** | human editorial claim; **blank by design** (F16) |
| topic `repositories[]` | **required** where the packet names them | infra→Dashboard `primary`; experimental→UDV `primary`, →Grablink `supporting` (one `primary` max per topic) |
| topic `people[]` | **optional** | both topics → the person, role `""` (none unless required) |

### 2.3 Axis (block: `axes[]`)

| Field | Disposition | Source / boundary |
|---|---|---|
| `title` | **required** | exact packet title (verbatim) |
| `kind` | **required** | enum `feature\|experiment\|test\|investigation\|maintenance`; packet supplies each |
| `state` | **required** (packet supplies) | enum `active\|usable\|draft\|blocked\|parked\|completed\|abandoned` |
| `stateConfidence` | **required, explicit** | enum `confirmed\|inferred\|uncertain`; **`inferred` for all six** (packet). Set it explicitly: the read model and `insertAxis` both **default an unset confidence to `confirmed`** (`store.ts:800–808`, `:6187–6198`), so omitting it silently asserts `confirmed` and trips the guard (§5.1/§5.3) |
| `currentState` | **required for axes 1,2,3,5,6 / optional for axis 4** | packet supplies verbatim text for axes 1,2,3,5,6; **axis 4 has none — leave absent (optional, honest), do not invent**. The field is representable and the source supports a conservative state, so axis 4's absence is **optional** (F08), not `unavailable` |
| `currentStateConfidence` | **required where `currentState` is present, explicit** | **`inferred`** on axes 1,2,3,5,6; null where `currentState` is absent (axis 4). Never left to the `confirmed` default (§5.3); F08 |
| `blocker` | **required for axis 4** | verbatim, `blockerConfidence: confirmed` (packet §5.3) |
| `blockerConfidence` | **required with `blocker`, explicit** | **`confirmed`** for axis 4 — the one store-enforced claim in the seed, **bound to same-call evidence** (§5.1/§5.4) |
| `branch`, `prNumber`, `prUrl` | **optional** | representable axis evidence; packet records PRs as activities rather than axis fields — see §5 |
| `expectedVersion` | **required on an update, absent on a create** | a fresh axis has no version to check (methodology §4.4) |
| axis `repositories[]` | **required where source-backed; axis-level `relationship` UNRESOLVED for all six axes** | all six axes have a source repo (axes 1–4 per packet §5.3; axes 5–6 per WP2 D1/D2), but **no role is established for any of them** — the retained fixture's `supporting` on axes 1–4 is a fixture link, not an approved semantic ("a fixture default or another fixture link does not establish the semantics"). **Withhold all six links** until a human selects the role (§9 D-A); omitting the field would silently store `supporting` |
| axis `people[]` | **required for the 6 axes** | the person, role `""`; axes 1–4 per packet, axes 5–6 WP2-accepted (D3/D4) |

### 2.4 Person (block: `people[]` / axis `people[]`)

| Field | Disposition | Source / boundary |
|---|---|---|
| `displayName` | **required** | exact approved name (packet §5.1) |
| `githubLogin` | **required** | `ajegorovs` — the identity basis (WP2 §9.2: fixture `githubLogin` = GitHub `author.login`; **no author-name equivalence**) |
| `role` | **optional** | `""` — none unless required; do not invent a role |
| `nakamaUserId` | **optional** | absent → `attributable=false`; report that, **never** "idle" (F15) |

### 2.5 Problem (block: `problems[]`)

| Field | Disposition | Source / boundary |
|---|---|---|
| `statement` | **required** | verbatim packet text; required by the manifest on every `problems[]` item |
| `axisId`/`axisTitle` | **required** | the parent axis (by title in the creating transaction) |
| `state` | **required** | enum `open\|resolved`; packet: three open problems |
| `stateConfidence` | **required, explicit** | the packet's acknowledged gaps are declared `confirmed`. This is a **fixture policy, not store enforcement** — the `confirmed` guard covers only axis `state`/`current_state`/`blocker` (§5.1/§5.2), so a problem's confidence is stored as sent. The seed still follows the policy by hand; it does **not** duplicate an event to "back" a problem (§5.2) |
| `planStepId` | **optional** | link a problem to a plan step; not supplied by the packet |
| `repositoryFullNames[]` | **required where source-backed** | diagnostics problem→Grablink (existing); consultation problems→Dashboard (WP2 D5/D6); **replaces the set** on update |
| `personIds[]` | **optional** | not supplied by the packet |
| problem **`sourceUrl`** | **unavailable** | the `Problem` type carries **no `sourceUrl`** field (`store.ts:336–348`); problem provenance is a model boundary, not a blank field (F10) |

### 2.6 Plan and steps (block: `plans[]`)

| Field | Disposition | Source / boundary |
|---|---|---|
| `summary` | **required** | verbatim packet plan summary |
| `steps[].title` | **required** | verbatim, in the packet's authored order |
| `steps[].position` | **required, explicit** | integer, 1..n; **never null** — `NULL` means "no ordering, and no ordering is synthesized" (`migrations/004:118–119,142`); the retained fixture's nulls are the F12 defect |
| `steps[].state` | **optional** | enum `pending\|active\|done\|blocked`; packet supplies no per-step state |
| plan **content provenance** | **unavailable** | `Plan` carries `authorType`/`authorId` (authorship) but **no content provenance/source** (`store.ts:351–358`); F13 — the plan's source doc rides the §3 manifest/activity, not a plan field |

### 2.7 Activity (block: `activities[]` in `reconcile_topic`; `record_activity` for later events)

| Field | Disposition | Source / boundary |
|---|---|---|
| `summary` | **required** | objective event text; the only `record_activity`-required field |
| `sourceType` | **required** | enum `manual\|github_pr\|github_commit\|github_issue\|repo_document\|group_chat\|experiment\|agent_review` |
| `sourceRef` | **required** | e.g. `PR #44`, a short commit hash, `docs/AGENDA.md` |
| `sourceUrl` | **required where a public URL exists** | public only; all event records are public, so the retained fixture's empty `sourceUrl` is the F10 supported-but-empty gap. Concrete per-event URLs: §3.4 |
| `occurredAt` | **required for every event** | the event's **own** date at the source's precision (§3). PR/commit events use their **own** event timestamp; a document with no explicit date is dated by its **last file-touch commit at or before the pin** (day-only chosen precision) — **never omitted**, never the ingestion date. Concrete values: §3.4 |
| `axisId`/`axisTitle` | **required** | the axis the event belongs to — **`axisTitle` is the same-transaction handle** (§5) |
| `repositoryFullName` | **optional** | a *direct* event→repo link; **prefer the axis→repo link** (§7) — a direct link duplicates the indirect attribution WP2 established |
| `problemId` | **required where the source backs an existing-problem evidence link** | **supported** (F14a) via `reconcile_topic.activities[].problemId`; resolves only an **existing** problem (§5) |

### 2.8 Provenance links (the relationship rows)

| Link | Written by | Baseline disposition |
|---|---|---|
| topic ↔ repository | `reconcile_topic.repositories[]` | required where the packet names them; role `primary`/`supporting` |
| topic ↔ person | `reconcile_topic.people[]` | optional; role `""` |
| axis ↔ repository | `reconcile_topic.axes[].repositories[]` | required where source-backed; **role = human decision** for the 2 infra axes (§9 D-A) |
| axis ↔ person | `reconcile_topic.axes[].people[]` | required for axes 1–4 (packet); axes 5–6 are the **WP2-accepted source-backed enrichment** (D3/D4); role `""`; person reused by `githubLogin` |
| problem ↔ repository | `reconcile_topic.problems[].repositoryFullNames[]` | required where source-backed; **replaces** the set |
| event → repository | activity `repositoryFullName` | optional (prefer the axis link) |
| event → problem | `reconcile_topic.activities[].problemId` | required where source-backed and the problem **pre-exists** (F14a) |

---

## 3. Source, date and pin manifest (not Repository fields)

The pins, source dates and repository public metadata **cannot be stored as first-class Repository state**
(F09b), so the baseline seed carries a separate **seed manifest** (a design artifact, not a product object).
It states, per source:

1. **Frozen public pins** (authoritative; the pin is quoted, not the read moment):

   | Source | Repo | Pin | Pin date (day-only) |
   |---|---|---|---|
   | UDV (primary) | `ajegorovs/udv-echo-process` | `841964d41f8dc73e55d78303e79ed4098c00d700` | 2026-09-28 |
   | Grablink (supporting) | `ajegorovs/Grablink-Full-sequence-acquisition` | `e6f83b2f5a45a961044b107f2628b046d41c3ab2` | 2026-09-24 |
   | Dashboard (this product) | `ajegorovs/nakama-research-dashboard` | `95ec34e5d24240c7ac92c384cff5d5658ebb8761` | 2026-10-07 |

2. **Source dates, with the exact basis and precision.** A document's **own** date is used, never the
   ingestion/recording date. Day-only stays day-only; **no time-of-day is invented**. When a document
   carries **no explicit date**, it is dated by the **last file-touch commit at or before the pin**,
   recording that basis. The worked case — **included in the seed, not omitted**: `docs/AGENDA.md` has no
   explicit date; its last file-touch commit at/before the pin `e6f83b2` is
   `44ba1a43da78c8f572f042f1af4850f3b64790cb` @ `2026-09-24T11:33:25+03:00`; the day-only value
   **2026-09-24** is an **explicitly chosen precision**, not an inherent limit (F05). PR/commit events
   carry their **own** event date at the source's precision (concrete values in §3.4).

3. **Repository public metadata — as-of-pin vs current, enumerated.** `url`/`defaultBranch`/`description`
   are grounded at the **frozen pin** and are reproducible from it. **Normalization:** the description is
   the repo's own **pinned-README opening paragraph** with **soft line-wraps collapsed to single spaces and
   presentation emphasis markers stripped** — words preserved, nothing added, removed or reordered. The
   field is plain text; the **exact pinned excerpt** is retained in this manifest.

   | Repository | `url` | `defaultBranch` (source branch @ pin) | current GitHub `default_branch` (as-of-read) | `description` (pinned README, normalized) |
   |---|---|---|---|---|
   | `ajegorovs/udv-echo-process` | `https://github.com/ajegorovs/udv-echo-process` | `master` | `master` | Multi-sensor Ultrasonic Doppler Velocimetry (UDV) processing for rotating machinery analysis. Supports echo (amplitude) and velocity measurements from single-sensor continuous recordings and multi-sensor rolling (round-robin) arrays, in both raw time-series and statistical-summary formats. |
   | `ajegorovs/Grablink-Full-sequence-acquisition` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition` | `master` | `master` | Windows MFC application for capturing high-frame-rate 8-bit monochrome image sequences from an Euresys Grablink/MultiCam capture card. |
   | `ajegorovs/nakama-research-dashboard` | `https://github.com/ajegorovs/nakama-research-dashboard` | `main` | `main` | A dashboard page plus agent tools over shared coordination state — topics, development axes and the evidence attached to them — for a self-hosted Nakama instance. One page (the overview, with the editing surface underneath it), eight actions of which five are agent tools, one skill, org-scoped SQLite storage. |

   - **Branch provenance.** The stored `defaultBranch` is the **source branch the pin is on** (as-of-pin),
     **never** a value copied from GitHub's mutable current metadata. At the pins the two agree
     (`master`/`master`/`main`) and the **current** GitHub `default_branch` read today is stated beside it
     so the historical value is never *inferred from* the current one. If they diverge, the as-of-pin value
     wins and the divergence is stated, not silently resolved.
   - **`about` is not versioned** and **current GitHub metadata is variable**: the Dashboard `pushed_at`
     now postdates the pin, and `about`/`homepage` change between reads. A value read from the live GitHub
     API is **`as-of-read`, not `as-of-pin`**, and is labelled as such — at read time UDV has no `about`;
     Grablink's `about` reads *"modified Euresys Grablink program to continuously save images"*; Dashboard's
     reads *"Research dashboard plugin for a self-hosted Nakama deployment: …"*. Where the as-of-pin source
     (README) and the mutable current metadata disagree, the **as-of-pin README is authoritative** for the
     fixture, and the variance is stated, not silently resolved.

   `sourceUrl` is a **field of the activity**, not of the Repository or Problem; the pins/dates/metadata
   above are **manifest entries**, not Repository fields.

### 3.4 Concrete activity source manifest (the 8 initial events)

Every initial event is public and carries its **own** source date at the source's precision — no ingestion
date, no invented time-of-day. One event per activity row; the placements are the design's (see §9 D-E).

| # | Axis | `sourceType` | `sourceRef` | `sourceUrl` (public) | `occurredAt` | Date basis / precision |
|---|---|---|---|---|---|---|
| 1 | axis 1 — UDV acquisition automation | `github_pr` | `PR #44` | `https://github.com/ajegorovs/udv-echo-process/pull/44` | `2026-09-28T15:15:05Z` | PR #44 **merge** timestamp (its own event date; the source is known to the second) |
| 2 | axis 1 — UDV acquisition automation | `github_pr` | `PR #69` | `https://github.com/ajegorovs/udv-echo-process/pull/69` | `2026-09-28T15:22:46Z` | PR #69 merge timestamp |
| 3 | axis 2 — UDV sparse-analysis validation | `github_pr` | `PR #67` | `https://github.com/ajegorovs/udv-echo-process/pull/67` | `2026-09-28T13:44:37Z` | PR #67 merge timestamp |
| 4 | axis 3 — High-rate optical acquisition | `github_pr` | `PR #1` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/pull/1` | `2026-09-24T09:16:43Z` | PR #1 merge timestamp |
| 5 | **axis 4** — Grablink diagnostics and sustained-rate validation | `repo_document` | `docs/AGENDA.md` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition/blob/e6f83b2f5a45a961044b107f2628b046d41c3ab2/docs/AGENDA.md` | `2026-09-24` | file-touch basis: last file-touch commit ≤ pin `e6f83b2` is `44ba1a43da78c8f572f042f1af4850f3b64790cb` @ `2026-09-24T11:33:25+03:00`; **day-only is a chosen precision** (no time-of-day invented) |
| 6 | axis 5 — Research dashboard and focused retrieval | `github_commit` | `95ec34e` | `https://github.com/ajegorovs/nakama-research-dashboard/commit/95ec34e5d24240c7ac92c384cff5d5658ebb8761` | `2026-10-07T11:32:37Z` | commit committer date |
| 7 | axis 5 — Research dashboard and focused retrieval | `github_commit` | `da7996b` | `https://github.com/ajegorovs/nakama-research-dashboard/commit/da7996b6143f918ca590a79649aba831151b4dca` | `2026-10-07T11:32:37Z` | commit committer date |
| 8 | axis 5 — Research dashboard and focused retrieval | `github_commit` | `5a62749` | `https://github.com/ajegorovs/nakama-research-dashboard/commit/5a6274918c92d8c6a539349d3549dde045c3985f` | `2026-10-07T11:09:37Z` | commit committer date |

**Placement counts: axis 1 = 2, axis 2 = 1, axis 3 = 1, axis 4 = 1, axis 5 = 3, axis 6 = 0 — eight unique
events.** Axis 6 has **no initial activity** (its two problems are raised from acceptance records, and the
`problemId` evidence link is a separate, unresolved strategy — §9 D-D). The AGENDA event is placed on
**axis 4**, the axis whose blocker/problem/plan it backs, so axis 4's `confirmed` blocker is backed by
**same-transaction evidence**; a fresh seed places the event where its claims are made rather than on a
sibling axis.

---

## 4. Ordered positions (explicit)

- Every plan step is seeded with an **explicit integer `position`** 1..n in the authored order. The
  read projection is **not** an ordering contract — the retained fixture's all-null positions (F12) are the
  defect this prevents.
- `NULL` is never used to mean "authored order TBD": `migrations/004:118–119` states NULL means *no
  ordering*, and none is synthesized. If an order is not sourced, either source it or leave the plan out —
  do not write null positions and rely on display order.
- No other ordered collection is seeded with an implicit order; array order is never asserted as meaning.

---

## 5. Transaction and evidence sequencing (the crux of WP3)

**Rule.** A topic's initial supporting activities belong **inside the same `reconcile_topic` transaction**
that creates the claims they back. `record_activity` is for events that *arrive afterwards*, not for
manufacturing an initial claim's evidence. This is the sequencing defect the first packet violated
(WP0/methodology §9).

### 5.1 The `confirmed` guard is axis-scoped — `state`, `current_state`, `blocker` only

`assertClaimsAreBacked` is the **only** store-level enforcement of the "confirmed needs evidence" rule, and
it grades **axis** claims and nothing else. After the write loops, `reconcile_topic` calls it for every
touched axis **inside the transaction** (`store.ts:6027–6037`; rule at `store.ts:6786–6816`). The claims it
grades are exactly three per axis (`store.ts:6790–6798`):

- `state` — only when the caller **mentions** `state` (`store.ts:1698–1700`: the column default is where an
  axis starts, not something anyone asserted);
- `current_state` — only when the patched/stored text is non-empty;
- `blocker` — only when the patched/stored text is non-empty.

It requires same-call evidence when such a claim is `confirmed`; the evidence definition is `axisEvidence`
(`store.ts:2506`): the axis's **branch**, its **PR** (`prNumber`/`prUrl`), its **recorded activities**
(`axis_id`) and its **annotations** (`axis_id`). A `confirmed` claim with an empty evidence list throws and
**rolls the whole update back**. **Problem claims are not covered by this guard.**

### 5.2 Problem confidence is a fixture policy, NOT store enforcement

The packet's problems are declared `confirmed`, and the **policy** is that a `confirmed` problem should be
backed by an evidence link (F14a). That policy is a *rule the seed follows by hand*, **not** a store
invariant: no guard fires, and omitting the evidence would roll nothing back. Keep the two apart — reading a
problem's `confirmed` as "guard-enforced" would overstate the store and understate the seed's own
discipline. The evidence link itself is `reconcile_topic.activities[].problemId`, which resolves an
**existing** problem only (§5.4). Do **not** duplicate an event or invent a link to "satisfy" the policy.

### 5.3 Explicit confidence — no defaults

The read model reports a text-carrying claim's confidence as `confirmed` when the column is unset
(`store.ts:800–808`), and `insertAxis` writes `confirmed` when the caller omits it (`store.ts:6187–6198`).
A seed that leans on that default silently asserts `confirmed` and trips the guard. The seed therefore sets
**every** axis claim's confidence explicitly (§2.3): `stateConfidence` **inferred** on all six axes;
`currentStateConfidence` **inferred** on axes 1,2,3,5,6; axis 4's `blockerConfidence` **confirmed** — backed
by the same-transaction AGENDA activity (§3.4 row 5). **No claim relies on a default.**

### 5.4 Consequences for the baseline-seed packet

1. **Initial axis evidence == same-transaction activities.** Each axis that carries a `confirmed` claim
   (here only **axis 4's blocker**) must carry its backing activity **in the same `reconcile_topic` call**.
   The activity targets the axis by **`axisTitle`**, which resolves to the axis created earlier in the same
   transaction (axes loop `store.ts:5750` runs before the activities loop `store.ts:5806`).
2. **`inferred` where evidence is not atomic.** Where the source is a design-review hypothesis rather than
   a same-call record, write **`inferred`**, per the packet. Do not promote to `confirmed` for convenience.
3. **Existing-problem evidence is supported (F14a) — but only for a pre-existing problem.** An activity's
   `problemId` resolves from an **existing** problem row (`store.ts:5837`, second pass at
   `store.ts:6599–6609`). In one `reconcile_topic` call the write order is **activities → problems**
   (`store.ts:5806` → `5929`) and `activities.problem_id` is a real FK with `PRAGMA foreign_keys = ON`
   (`migrations/004:351`, `store.ts:2152`).
4. **Do NOT promise a newly created problem's evidence in the same call (F14b).** There is **no**
   title-like handle for a newly generated problem, and the id handle requires the problem to pre-exist, so
   a same-call event→new-problem link is **unavailable** — record the limitation, never improvise a
   workaround. If source-backed evidence for a problem is required, it is added by a **subsequent**
   `reconcile_topic` (the problem then exists), not in the creating call.
5. **`record_activity` cannot target any problem (F14c).** The manifest *advertises* `problemId` but its
   `inputSchema` omits it (`additionalProperties:false`) and dispatch never reads it
   (`src/actions.ts:361–387`). This is a recorded **schema defect**, not a workaround target; problem
   evidence therefore goes through `reconcile_topic.activities[].problemId`, never `record_activity`.

### 5.5 Creation transactions — two, plus explicitly-approved later passes

`reconcile_topic` is per-topic atomic: one call per topic carries that topic's axes, their same-call
evidence, plans, problems and links. The baseline seed is therefore **two CREATION transactions** (one per
topic). That is **not** a guaranteed total of two: any **explicitly-approved** problem-evidence pass (F14a,
§5.4 items 3–4) is a *later* `reconcile_topic` call and is separately authorized. No event is ever
**duplicated** to satisfy the problem-evidence policy (§5.2).

---

## 6. Search-before-create, dedup and versions

- **Baseline before writing:** `get_overview` for counts; `search_dashboard` for each topic name and axis
  title. Reconcile against the read; do not near-duplicate.
- **A baseline seed runs against an empty target**, so the dedup pass is expected to find **zero**
  pre-existing objects — but it is still executed and recorded (an unexpected hit is a stop-and-reconcile,
  not an overwrite).
- **`expectedVersion` guards only the topic and axes, and is passed on every existing versioned mutation.**
  It exists at the **top level** (the topic) and **per axis** (`axes[].expectedVersion`); the manifest's
  **`problems[]` and `plans[]` items carry no `expectedVersion`**, so a problem/plan update **cannot be
  version-guarded through the tool** — its dedup rests on a fresh readback (statement/summary/version match at
  the same read). A fresh create has no version to check. On `conflict`, re-read and decide again — never
  overwrite blindly.
- **`truncated` is not `absent`:** page a truncated read; never treat a truncated collection as empty.

---

## 7. Attribution and indirect event→repository links

- **Event→repository attribution is indirect through the axis** (`store.ts:3355–3394`, join
  `store.ts:3411–3419`): once an axis names a repository, that axis's events attribute to it **without
  editing any event row**. Seeding both an axis→repo link and a per-event `repositoryFullName` would
  duplicate the same fact; the design **prefers the axis link** and treats the per-event link as optional.
- **Person reuse.** `reconcile_topic.axes[].people[]` resolves through `resolvePersonForLink`
  (`store.ts:6362–6410`); a person with `nakamaUserId: null` is reused by `githubLogin` (`ajegorovs`) — do
  **not** let the seed create a duplicate person. The account mapping stays absent, so `attributable`
  stays `false` (F15).
- **No invented attribution.** The fixture's write path attributes events to the recorder actor; the model
  has no upstream-author field on the tool surface (F11). Do not manufacture an account mapping to "fix"
  authorship — record the boundary.

---

## 8. Seed manifest, id map, counts

The seed design carries a machine-readable **manifest** with, per record, the semantic label → generated
UUID (ids are generated by the product, never chosen to encode meaning). It also maps each activity to its
§3 source entry and each link to its source. Design counts (verify programmatically at run, never from
memory):

| Quantity | Count | Basis |
|---|---|---|
| topics | 2 | packet §5.2 |
| axes | 6 | packet §5.3 |
| people | 1 | packet §5.1 |
| repositories | 3 | packet §4 |
| plan steps | 4 | packet §5.3 (axis 4), explicit positions 1–4 |
| problems | 3 | packet §5.3 (1 on axis 4, 2 on axis 6) |
| initial activities | 8 | §3.4 manifest (axis 1: PRs #44,#69; axis 2: PR #67; axis 3: PR #1; axis 4: AGENDA doc; axis 5: commits `95ec34e`/`da7996b`/`5a62749`; axis 6: none) — 8 unique events |
| topic→repo links | 3 | infra→Dashboard `primary`; experimental→UDV `primary`, →Grablink `supporting` |
| topic→person links | 2 | both topics → the person |
| axis→repo links | 6 intended → **0 written** | all six roles **unresolved** pending human approval (§9 D-A); every link withheld, because omitting the role would silently store the `supporting` default |
| axis→person links | 6 | axes 1–4 (packet) + axes 5–6 (WP2 D3/D4 accepted) |
| problem→repo links | 3 | diagnostics→Grablink; 2 consultation→Dashboard (WP2 D5/D6) |

**Dedup identity.** The WP2 dedup is authoritative: **0 new repositories, 0 new people, 0 already-present
pairs** — the six candidate pairs (D1–D6) are the accepted source-backed relationship set; a baseline seed
that encodes them creates **no duplicate objects**. The axis→repository links are **withheld** (§9 D-A), so
nothing is written there until a role is decided.

---

## 9. Human decisions (explicit — no silent decisions)

These are **not resolved here**. The design records them so a future session abstains rather than deciding
silently.

- **D-A — the axis→repository roles (all six).** The reviewer left the axis→repository role **undecided**
  (`null`) for the two infra axes (WP2 D1/D2), explicitly rejecting both `supporting` and `primary`. By the
  same reasoning the **retained fixture's `supporting` on axes 1–4 is a fixture link, not an approved
  role** — "a fixture default or another fixture link does not establish the semantics" (WP2 §9.1/§H.1).
  **So the axis→repository role is unresolved for all six axes** pending explicit human approval (or an
  explicit owner ratification). **The schema cannot store "undecided":** `axis_repositories.relationship` is
  `NOT NULL DEFAULT 'supporting'` with `CHECK (primary|supporting)`, and `reconcile_topic` writes
  `repository.relationship ?? "supporting"` (`store.ts:5783`). **Therefore omitting the field does not leave
  it undecided — it silently stores `supporting`, the value the reviewer refused.** The baseline seed must
  **not** write **any** of the six links until a human selects `primary`/`supporting` per axis; until then
  each pair is an explicit open item and F01 is knowingly unfixed for all six axes.
- **D-B — axis-4 `currentState` (F08).** The source supports a conservative factual state; whether to
  populate the **optional** field and the **exact wording** are human/editorial decisions. Leave blank
  unless approved.
- **D-C — topic descriptions/summaries (F07b/F16).** Human editorial claims, blank by design; populate only
  if a human authors and approves the wording.
- **D-D — problem evidence (`problemId`) links (F14a).** Whether to add existing-problem evidence links, and
  the exact events, is a human decision; the capability is supported but unused. Not promised same-call for
  newly created problems (§5.4).
- **D-E — the baseline seed is a clean-slate build that encodes the WP2-accepted link set (D1–D6) —
  resolved, not open.** A baseline seed builds the fixture *from an empty target* (the owner's explicit
  intent), so it carries the **current accepted intent**, not a reproduction of the original packet. The
  original packet named the person only on axes 1–4 and never named a repository on the two infra axes;
  the accepted relationship set ([`…-findings.md`](../reviews/public-research-fixture-findings.md) §G/§H)
  adds D1–D6 as **source-backed** links (D1/D2 axis→repo, D3/D4 axis→person, D5/D6 problem→repo). The seed
  **includes all six in its intended link set**: D3/D4 and D5/D6 are written directly, while D1/D2 are
  **withheld until the D-A role is chosen** (a link whose role is undecided cannot be written without
  asserting the very default the reviewer refused). **Reproducing the defective original packet verbatim —
  knowingly writing the F01/F02 link gaps into a *fresh* fixture — is rejected as not a valid reading.**
- **D-F — problem/plan wording and any `confirmed` vs `inferred` call** where the packet is silent.

---

## 10. Review invariants (for WP5 to implement — not implemented here)

These are the properties a future WP5 check would assert. They are stated so they can be tested, not built:

1. **Count identity** — read-back counts equal §8 (topics/axes/people/repos/plan steps/problems/links).
2. **No null positions** — every seeded plan step has an explicit integer position 1..n.
3. **Confirmed ⟹ same-call evidence** — every `confirmed` **axis** claim (`state`/`current_state`/`blocker`)
   has an activity/annotation/branch/PR on that axis in the same call; the suite can go red on a negative
   control (a `confirmed` axis claim with no evidence must fail). Problem claims are **not** covered by this
   guard (a fixture policy, not store-enforced, §5.2).
4. **No silent role default** — no `axis_repositories` row exists whose role was omitted (would default to
   `supporting`); every axis→repo role is an approved value. All six are withheld until decided (§9 D-A).
5. **Source dates** — no activity's `occurredAt` equals its ingestion time; each date matches its §3 basis
   and precision, and the AGENDA event is **present** with `occurredAt` = `2026-09-24` (not omitted).
6. **Source URLs public** — every activity with an available public URL carries one; no private URL.
7. **Dedup** — zero duplicate topic/axis/person/repository rows; the accepted pairs present once.
8. **Problem→repo set exact** — each problem's `repositoryFullNames` equals its approved set (the write
   replaces the set).
9. **Untargeted stores unchanged** — confirmed by the untargeted store's **own readback measurement**, not
   DB byte identity (methodology §6).
10. **No invented fields** — every required field non-empty; every optional field either populated from an
    approved source or explicitly blank.
11. **Recency is not activity (F06 side-effect).** A link touch or an axis patch advances the axis's
    `updated_at`/recency but adds **no** activity; the check asserts the seed's **event count, each event's
    `occurredAt`, and `lastActivityAt`** carry the §3.4 values, while a recency/`updatedAt` field may still
    advance — a bumped recency is not mistaken for a phantom new research event.

---

## 11. Model boundaries (recorded, not worked around)

| ID | Boundary | Baseline-seed handling |
|---|---|---|
| **F09b** | No first-class repository **pin** field | Pin lives in the §3 manifest; never a Repository field |
| **F13** | `Plan` has authorship but **no content provenance** | Plan source rides the manifest/activity; never invent a plan-source field |
| **F14b** | No title handle for a **newly generated** problem; same-call event→new-problem link impossible | Record the limitation; evidence for a new problem only in a **subsequent** call |
| **F14c** | `record_activity` **omits** `problemId` (schema defect) | Problem evidence goes through `reconcile_topic`, never `record_activity` |
| **F14a** | Existing-problem linkage **is supported** via `reconcile_topic.activities[].problemId` (second pass) | Required where source-backed and the problem pre-exists; **not** a fourth disposition |
| **F10** | `Problem` has no `sourceUrl` | Problem provenance is a model boundary; activity `sourceUrl` is supported-but-must-be-filled |
| **F15** | Person with no mapped account → `attributable=false` | Report `attributable=false`, never "idle"; do not invent a mapping |
| **D-A schema** | `relationship` has no "undecided" value | Do not write the link until a human chooses (would default to `supporting`) |

---

## 12. Boundaries and open decisions

- **Design only.** No write, no dispatch, no authorization of WP4/WP5/WP-G.
- **Open (owner/human):** §9 D-A (all six axis→repo roles — **undecided, blocked**; the seed withholds
  all six links rather than defaulting any to `supporting`), D-B (axis-4 `currentState` wording), D-C
  (topic descriptions/summaries), D-D (problem evidence links), D-F (remaining wording/confidence calls).
  **D-E is resolved** (§9): the clean-slate seed encodes the accepted D1–D6; D1/D2 stay gated on D-A. Also
  outstanding: the explicit **target org** and **owner authorization** (no fixture write without both).
- **Not validated end-to-end:** the authoring skill's baseline-seed path is not execution-validated;
  this packet is a proposal to be validated, not a proven procedure.

---

## 13. Factual checks performed (bounded, read-only)

- **Contract read at HEAD (equal to the frozen dashboard pin for `src/`/manifest/migrations):**
  - `reconcile_topic.inputSchema`: `activities[].problemId`, `axisTitle`, `repositoryFullName`,
    `sourceUrl`, `occurredAt`; `axes[].repositories[].relationship` enum `primary|supporting`;
    `plans[].steps[].position` `integer|null`; `problems[]` field set; `repositories[]` field set.
  - `record_activity.inputSchema` (required `[summary]`, `additionalProperties:false`): **no `problemId`**
    → F14c confirmed at the declaration.
  - `store.ts`: `Repository` (no pin, F09b), `Problem` (no `sourceUrl`, F10), `Plan` (authorship only, F13),
    `assertClaimsAreBacked` (`store.ts:6786–6816`) + call site (`store.ts:6027–6037`),
    `axisEvidence` (`store.ts:2506`), write order axes `5750`→activities `5806`→plans `5882`→problems
    `5929`, second-pass problemId resolution (`store.ts:6599–6609`), `linkRepository` default
    (`store.ts:5783` `?? "supporting"`).
  - `migrations/002` (`relationship NOT NULL DEFAULT 'supporting'`; one-primary per topic/axis),
    `migrations/004` (`plan_steps.position INTEGER` + "no ordering synthesized"; `problems`; `plans`).
- **Bounded source harvest (public, read-only):** the three repos' **current** GitHub `about` /
  `default_branch` read (used only to distinguish as-of-read from as-of-pin); the **pinned** `README.md` at
  each frozen pin (UDV `841964d4…`, Grablink `e6f83b2f…`, Dashboard `95ec34e5…`) fetched to confirm the
  verbatim description source text (§3.3); and the **8 initial events' own public URLs and event dates**
  read from the GitHub API (§3.4 — PR merge timestamps for `#44/#69/#67/#1`, commit committer dates for
  `95ec34e`/`da7996b`/`5a62749`, and the AGENDA file-touch commit `44ba1a4`). **No authoritative WP1/WP2
  re-run was performed** — this is bounded, public, read-only source confirmation only.
