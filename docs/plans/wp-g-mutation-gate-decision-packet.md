# WP-G — mutation gate: decision & review packet

> **Status: PLANNING / REVIEW ONLY — no execution, no write authorization.** This is the **WP-G**
> deliverable of the research-fixture methodology
> ([`research-fixture-methodology.md`](research-fixture-methodology.md) §7, the mutation gate review). It
> is a **decision packet**: it lays out the independent choices a human must make, the options and their
> tradeoffs, a recommendation per choice, the exact payload a future write would carry, and the
> post-write verification a later authorized session would run. **It chooses nothing.**
>
> **What WP-G is *not*.** WP-G does **not** grant owner write authorization, does **not** bind a live
> target, does **not** run any executor, and performs **no** fixture/domain write, no `reconcile_topic`,
> no `record_activity`, no inference, no service/deploy/restart, no product/UI change, no direct-DB
> write, no merge and **no network call**. It is a document for a human to answer.
>
> **Governing artifacts (accepted):** WP0 validation (attempt-4, PASS); WP1 verification
> ([`…-verification.md`](../reviews/wp1-public-research-fixture-verification.md)); WP2 relationship delta
> ([`…-relationship-delta.md`](../reviews/wp2-public-research-fixture-relationship-delta.md)); the
> **WP3 baseline-seed design** ([`public-research-baseline-seed-design.md`](public-research-baseline-seed-design.md));
> the **WP4 retained-fixture amendment design**
> ([`public-research-retained-fixture-amendment-design.md`](public-research-retained-fixture-amendment-design.md));
> the **WP5 executable checks** ([`harness/wp5/`](../../harness/wp5/)); the sanitized ledger
> [`public-research-fixture-findings.md`](../reviews/public-research-fixture-findings.md) §A–§O.
>
> **Sanitization.** No live org id/name, recorder actor, endpoint or host path appears here. Loopback
> (`127.0.0.1:…`) and public GitHub slugs/refs/pins are kept. Fixture-internal records are named by
> **semantic label**; where a target is named it is a **public label only** (see D5), never operational
> identity.

---

## 0. Authorization boundary (read first)

- **WP0–WP5 are accepted; WP-G is entered for planning/review only** (ledger §O).
- **No execution authorization exists.** WP-G records decisions; the **owner** grants write
  authorization. A filled-in decision form here is a *proposed decision set*, not authorization.
- **Every write still needs BOTH** (a) the explicit human choices below, **and** (b) explicit owner
  write authorization. Neither is given by this packet.
- **No WP3 seed and no WP4 amendment is executed by this packet.** The WP5 manifest is the WP5
  checker's *approved input contract* — permitted testdata, not an executed fixture.

---

## 1. Two programs, two named scopes — do not conflate

The methodology (§5) separates two mutation programs. WP-G covers **both**, but they are named and
scoped separately, and each carries its own target decision.

| Scope name | Program | Target assumption | What it is | Design of record |
|---|---|---|---|---|
| **SCOPE-BASELINE** | **baseline seed** | a **fresh, empty** target | builds the fixture *from nothing*; every required field is sourced from the first write; §2–§4 of the methodology apply from write 1 | WP3 [`public-research-baseline-seed-design.md`](public-research-baseline-seed-design.md) |
| **SCOPE-RETAINED** | **retained-fixture amendment** | the **existing, accepted** fixture (PR #3) | idempotent, explicitly-approved before/after corrections/enrichments over the existing records; never rewrites a published acceptance record | WP4 [`public-research-retained-fixture-amendment-design.md`](public-research-retained-fixture-amendment-design.md) |

**They are not the same target and not the same packet.** SCOPE-BASELINE's target is an empty store
(nominally a **new org**); SCOPE-RETAINED's target is the org that already hosts the retained fixture.
The **D5 target decision names one target per scope** — the two scopes may not share a target by
accident, and neither may fall back to a helper's `orgs[0]`.

**A session must state which program it is running before its first write** and must not carry a
baseline seed's empty-start assumptions into an amendment, or vice versa.

---

## 2. What "accepted" already means (and what it does not)

- **WP1** established that all 21 observations hold (0 observations refuted; 1 causal *WHY* refuted —
  F14a); **WP2** accepted six source-backed candidate pairs (D1–D6); **WP3/WP4** designs were corrected
  and accepted as corrected. **WP5** checks are accepted (read-only, isolated, can go red).
- **Accepted design is not a mutation permission.** The design-accepted proposals — F02 (D3/D4), F04
  links (D5/D6), F07/F09 metadata, F12 positions `1..4` — are proposals to be validated, not an
  approval to write.
- **Not execution-validated:** the authoring/mutation path has never been exercised (no write has run).
  WP5 validates the *checker*, isolated; it does not validate a write.

---

## 3. The independent decisions (each: options · tradeoffs · recommendation · approval status)

Each decision is **independent** — answering one does not answer another. **None is approved here.**
The recommendation in each is a *default the packet proposes*, **not a chosen value**.

### D1 (G01) — axis→repository **role**, all six axes

**What it is.** `axis_repositories.relationship` accepts only **`primary | supporting`** and is
`NOT NULL DEFAULT 'supporting'` (`migrations/002`). There is **no "undecided" value**, so omitting the
field silently stores `supporting` — the very value the reviewer refused. The role is therefore
**unresolved for all six axes**: the retained fixture's `supporting` on axes 1–4 is a *fixture link, not
an approved role* ("a fixture default or another fixture link does not establish the semantics"), and
**D1/D2** (the two infra axes, 5/6) carry no link at all.

**State per axis (measured):**

| Axis | Retained link today | WP2 candidate | Role approved? |
|---|---|---|---|
| 1 UDV acquisition automation | `supporting` (unapproved) | — | **no** |
| 2 UDV sparse-analysis validation | `supporting` (unapproved) | — | **no** |
| 3 High-rate optical acquisition | `supporting` (unapproved) | — | **no** |
| 4 Grablink diagnostics | `supporting` (unapproved) | — | **no** |
| 5 Research dashboard and focused retrieval | **absent** | **D1 → Dashboard** | **no** |
| 6 Agent consultation and automation evidence | **absent** | **D2 → Dashboard** | **no** |

**Options.**
- **A — per-axis explicit choice** (`primary`/`supporting` named for each of the six). Most faithful;
  requires six answers. In SCOPE-BASELINE none are written until chosen (all six withheld).
- **B — uniform choice.** Ratify `supporting` for the four retained axes *and* set D1/D2 to `supporting`
  (or all `primary`). **Tradeoff:** uniform `primary` would **demote** an existing primary
  (`linkRepository`); uniform `supporting` **launders** the undecided semantic into the exact default
  the reviewer refused. **Not recommended without explicit intent.**
- **C — withhold all six** (write nothing; F01 stays knowingly unfixed). Safe; leaves the gap.

**Recommendation (not chosen):** **A** — a per-axis explicit value; if undecided, **withhold that axis**
rather than default it. Carry the **already-stored** topic-level roles verbatim where a repository
metadata write is coupled to a link write (see §5 D-payloads). Preserving the retained `supporting`
without a decision is **not** recommended.

**Blocked until:** D1 answered. WP5 gate **G01** stays BLOCKED.

### D2 (G02) — F08 axis-4 `currentState` **wording + confidence** (populate vs leave)

**What it is.** Axis 4's `currentState` is an **optional** field; it is blank by design today. The
pinned AGENDA source *does* support a conservative factual state, so **evidence sufficiency** and
**editorial choice** are separate: the source is sufficient; whether to **populate** and the **exact
wording** are human decisions.

**Options.**
- **A — leave absent** (optional, honest). No wording risk; axis 4 keeps only its blocker/problem/plan.
- **B — populate** with an approved sentence and an explicit confidence. The **accepted-design
  candidate** (derived strictly from the pinned AGENDA facts; **not approved**) is:

  > *Candidate wording (NOT approved):* "High-rate optical acquisition has a hardware-validated baseline
  > (≈351 FPS preview; a 200-frame capture wrote `Image_00000.bmp`–`Image_00199.bmp`; a 2000-frame
  > capacity run's manual Stop & Save wrote partial sequences of 652 and 1028 frames). Sustained
  > 300–350 FPS operation with dropped-frame measurement remains outstanding; `core/CaptureStats` is
  > implemented and covered by 13 tests but no production code calls it."

  **Confidence condition:** an `inferred` `currentState` needs **no** evidence; **`confirmed` needs the
  axis to carry evidence by the transaction's end** (`assertClaimsAreBacked`), and axis 4 currently
  carries **zero** evidence. So the safe confidence for candidate B is **`inferred`** unless an
  evidence add is separately approved (D3).

**Recommendation (not chosen):** **A (leave absent)** unless a human approves exact wording; if
populating, use **`inferred`** and the candidate above only as a starting point.

**Blocked until:** D2 answered. WP5 gate **G02** stays BLOCKED.

### D3 (G03) — axis-4 `blocker` confidence: keep the **ratified `inferred`** vs **restore `confirmed`**

**What it is.** The **retained fixture's measured `blockerConfidence` is `inferred`**, and it is
**ratified — not a defect**. The packet's historical `confirmed` was the *packet's proposal*, never
measured in the retained fixture. `assertClaimsAreBacked` grades the `blocker` claim independently of
`currentState`.

**Options.**
- **A — keep `inferred`** (do nothing). An `inferred` claim requires **no** evidence and trips no guard.
  **No default downgrade or upgrade.**
- **B — restore `confirmed`** (optional, proposed, **not approved**). Requires axis-4 **evidence present
  by the transaction's end**; **pre-existing evidence counts**, but axis 4 carries **zero** today, so a
  **first** `confirmed` needs an **evidence add** (e.g. the AGENDA-source event in the same transaction,
  or an earlier explicitly-authorized pass). Without that add, `confirmed` is **red**.

**Evidence condition (exact):** `confirmed` ⟹ axis-4 evidence(`branch`|`PR`|`activity`|`annotation`)
`> 0` at the check. `inferred` ⟹ no condition.

**Recommendation (not chosen):** **A — keep `inferred`.** Restoring `confirmed` is only meaningful if an
authorized evidence add is also chosen.

**Blocked until:** D3 answered. WP5 gate **G03** stays BLOCKED.

### D4 (G04) — F03/F04/F14a **evidence strategy** (leave / duplicate / reassociate / retro-link)

**What it is.** Where an existing (or newly recorded) evidence row attaches to the diagnostics/consultation
axes and their problems. These are **factual, `required` findings** — the human decision is *where/how*,
never *whether* the required link exists. **This is distinct from the D6 problem→repo links**, which are
separable.

**Hard capability limits (measured, WP4 §4.2/§6):**

| Strategy | Supported? | Note |
|---|---|---|
| **Leave as-is** | yes | content is **not omitted** — it sits on another axis (F03); duplicate-free; always available |
| **Reassociate / move** an existing event's axis | **UNSUPPORTED** | `activities` is **INSERT-only**; no re-point/update path |
| **Edit an existing event** (`occurredAt` / `sourceUrl`) | **UNSUPPORTED** | same INSERT-only boundary |
| **Duplicate / re-record** a distinct event | store-supported (INSERT) but **discouraged + non-idempotent** | no uniqueness constraint; a retry inserts again; acceptable only as a *distinct legitimate attachment*, readback-guarded |
| **F14a retro-link** an **existing** event to a problem | **UNSUPPORTED** | `activities[].problemId` applies only to a **new** insert |
| **F14a new** event → existing problem | **supported** | `reconcile_topic.activities[].problemId` (existing problem only) |

**No direct-DB workaround, and no duplicate fix via the database.** The product's own write path is the
only surface; the packet asserts **no** payload for an unsupported path.

**Options.** **A — leave as-is** · **B — reassociate** (blocked) · **C — duplicate** (only if a human
judges it a distinct legitimate attachment, and it must be readback-guarded) · **D — add new
problem-evidenced events** (supported, via `activities[].problemId`).

**Recommendation (not chosen):** **A — leave as-is** (the default recommendation). **Not approved.**

**Blocked until:** D4 answered. WP5 gate **G04** stays BLOCKED; C15/C17 only exercise the synthetic
`leave` / named-ref strategies.

### D5 (G05) — the explicit **target** decision (per scope; public label only)

**What it is.** The organization/instance that hosts a future write, chosen **explicitly** and recorded.
A helper that could bind a default (`orgs[0]`) must **never** be used.

**Public-safe naming.** This packet carries **no operational identity** — no live org id, name, host or
path. Candidates are named by **public label only**: the **known public exercise target** (the org that
already hosts the retained fixture) vs a **new org** (for a fresh public fixture). The actual id/name
belongs to the local (git-ignored) operational handoff, never here.

**Options.**
- **SCOPE-BASELINE:** **new org** (preferred for a fresh public fixture — a clean empty target) **vs**
  the existing retained org.
- **SCOPE-RETAINED:** the **existing retained org** (the amendment corrects the retained fixture).

**Two separate targets.** SCOPE-BASELINE and SCOPE-RETAINED **must each name their own target**; a
single blanket target for both is not valid.

**Recommendation (not chosen):** a **new org** for SCOPE-BASELINE and the existing **retained org** for
SCOPE-RETAINED — but this is a **human** decision and the packet does not make it.

**Blocked until:** D5 answered **and** owner write authorization granted. WP5 gate **G05** stays BLOCKED
(it records a **proposed target decision only**; a resolution claiming `ownerAuthorization` or
`liveBinding` is rejected).

### D6 — F04 problem→repository links (D5/D6), independent of D4

**What it is.** Both consultation-axis problems have `repositories: []` (unattributable). The fix is
`reconcile_topic.problems[].repositoryFullNames` → `ajegorovs/nakama-research-dashboard` (**replaces the
set**). **Source-backed, non-duplicating, separable** from the evidence-location choice (D4).

**Recommendation (not chosen):** confirm the source-backed links. **Design-accepted as a proposal, not a
mutation approval.** No gate blocks it; it rides the chosen target.

---

## 4. SCOPE-BASELINE — the accepted manifest, discussed

The baseline seed's approved content (WP3 §3.4/§8; the WP5 `harness/wp5/manifest.mjs` is its executable
transcription). **Every value is a *proposal being exercised*, not an executed fixture.**

### 4.1 Counts (read back programmatically, never from memory)

| Quantity | Value | Basis |
|---|---|---|
| topics | 2 | "Experimental research"; "Research infrastructure / team management" |
| axes | 6 | 4 experimental + 2 infra |
| people | 1 | *Aleksandrs Jegorovs* (`githubLogin ajegorovs`; no role) |
| repositories | 3 | UDV, Grablink, Dashboard |
| plan steps | 4 | axis-4 plan, explicit positions **1..4** |
| problems | 3 | 1 on axis 4, 2 on axis 6 |
| initial activities | **8 unique events** | placement **2 / 1 / 1 / 1 / 3 / 0** |
| topic→repo links | 3 | infra→Dashboard `primary`; experimental→UDV `primary`, →Grablink `supporting` |
| topic→person links | 2 | both topics → the person |
| axis→person links | 6 | axes 1–4 (packet) + axes 5–6 (WP2 D3/D4) |
| problem→repo links | 3 | diagnostics→Grablink; 2 consultation→Dashboard |
| **axis→repo links written** | **0** | **all six roles withheld** until D1 is answered (never defaulted) |

### 4.2 The 8 initial events — placement **2/1/1/1/3/0** and their own source dates

| # | Axis | `sourceType` | `sourceRef` | `occurredAt` | Date basis |
|---|---|---|---|---|---|
| 1 | 1 | `github_pr` | `PR #44` | `2026-09-28T15:15:05Z` | PR merge timestamp |
| 2 | 1 | `github_pr` | `PR #69` | `2026-09-28T15:22:46Z` | PR merge timestamp |
| 3 | 2 | `github_pr` | `PR #67` | `2026-09-28T13:44:37Z` | PR merge timestamp |
| 4 | 3 | `github_pr` | `PR #1` | `2026-09-24T09:16:43Z` | PR merge timestamp |
| 5 | **4** | `repo_document` | `docs/AGENDA.md` | `2026-09-24` | **last file-touch commit ≤ pin** (`44ba1a4` @ `2026-09-24T11:33:25+03:00`); day-only is a **chosen precision**, not inherent |
| 6 | 5 | `github_commit` | `95ec34e` | `2026-10-07T11:32:37Z` | commit committer date |
| 7 | 5 | `github_commit` | `da7996b` | `2026-10-07T11:32:37Z` | commit committer date |
| 8 | 5 | `github_commit` | `5a62749` | `2026-10-07T11:09:37Z` | commit committer date |

Axis 6 has **no initial activity** (its two problems are raised from acceptance records). The AGENDA
event is placed on **axis 4** — the axis whose `confirmed` blocker it backs — so the baseline seed's
`confirmed` blocker is backed **same-transaction**; a fresh seed places the event where its claims are
made, not on a sibling axis.

### 4.3 Repository metadata (byte-equal pinned-README strings; branch as-of-read)

| Repository | `url` | `defaultBranch` (as-of-read) | source branch @ pin + revision (manifest, distinct) |
|---|---|---|---|
| `ajegorovs/udv-echo-process` | `https://github.com/ajegorovs/udv-echo-process` | `master` | `master` @ `841964d41f8dc73e55d78303e79ed4098c00d700` (2026-09-28) |
| `ajegorovs/Grablink-Full-sequence-acquisition` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition` | `master` | `master` @ `e6f83b2f5a45a961044b107f2628b046d41c3ab2` (2026-09-24) |
| `ajegorovs/nakama-research-dashboard` | `https://github.com/ajegorovs/nakama-research-dashboard` | `main` | `main` @ `95ec34e5d24240c7ac92c384cff5d5658ebb8761` (2026-10-07) |

`description` = the repository's **own pinned-README opening paragraph**, soft-wraps collapsed to single
spaces and emphasis markers stripped (words preserved). The exact strings are carried in the WP3 §3.3
manifest and the WP5 `manifest.mjs` (byte-equal contract).

### 4.4 Plan, positions, confidence

- Axis-4 plan: summary verbatim; **4 steps with explicit integer positions `1..4`** in authored order.
  **No null positions** (`NULL` means "no ordering, and none is synthesized").
- **Explicit confidence, no store default relied on:** `stateConfidence` **`inferred`** on all six axes;
  `currentStateConfidence` **`inferred`** where present (axes 1,2,3,5,6; axis 4 blank); axis-4
  `blockerConfidence` = the packet's **`confirmed`** proposal backed same-transaction (SCOPE-BASELINE),
  **distinct** from the retained fixture's ratified **`inferred`** (SCOPE-RETAINED, D3).
- **Support counts (what backs each claim):** only **axis-4's blocker** carries a `confirmed` claim, and
  it is backed by activity #5 (same transaction). Every other axis claim is `inferred` (no evidence
  required). **Problem `confirmed` is a fixture policy, not a store guard**, and is **not** backed by a
  duplicated event.

### 4.5 Current decision state

**All five parameter gates are BLOCKED.** `bun run harness:wp5` → **28 PASS · 0 FAIL · 5 BLOCKED**
(exit 2) — the approved baseline is internally consistent, but the run is **not green** because D1–D5
are unanswered. The **test-only** path (33 PASS) exists only to prove the checks can go red.

---

## 5. Full delta — exact payload templates (gated; no executor, no runtime write)

The dst templates below are **references**, transcribed from the accepted designs. They are **gated
on D1–D5** and are **not executed by this packet**. `expectedVersion` is read **fresh immediately
before** the call; a stale value **throws `ResearchStoreConflictError`** (never a returned conflict to
ignore).

### 5.1 SCOPE-BASELINE — two CREATION transactions (one per topic)

```
// Transaction 1 — topic "Experimental research"
reconcileTopic({
  topicName: "Experimental research",
  people: [ { displayName: "Aleksandrs Jegorovs", githubLogin: "ajegorovs", role: "" } ],
  repositories: [
    { fullName: "ajegorovs/udv-echo-process", url: …, description: …, defaultBranch: "master", relationship: "primary" },
    { fullName: "ajegorovs/Grablink-Full-sequence-acquisition", url: …, description: …, defaultBranch: "master", relationship: "supporting" },
  ],
  axes: [ /* axes 1–4: title, kind, state, stateConfidence:"inferred", currentState*, currentStateConfidence:"inferred", people:[…], repositories: <WITHHELD until D1> */ ],
  activities: [ /* #1 #2 #3 #4 #5 per §4.2; axisTitle handles */ ],
  problems: [ { statement: …, axisTitle: "Grablink diagnostics…", state: "open", stateConfidence: "confirmed",
               repositoryFullNames: ["ajegorovs/Grablink-Full-sequence-acquisition"] } ],
  plans: [ { axisTitle: "Grablink diagnostics…", summary: …, steps: [ {title …, position: 1} … {position: 4} ] } ],
})

// Transaction 2 — topic "Research infrastructure / team management"
reconcileTopic({
  topicName: "Research infrastructure / team management",
  people: [ … ], repositories: [ { fullName: "ajegorovs/nakama-research-dashboard", relationship: "primary", … } ],
  axes: [ /* axes 5–6; axis 5 carries commits #6 #7 #8; repository role WITHHELD; people per D3/D4 */ ],
  activities: [ /* #6 #7 #8 */ ],
  problems: [ /* two consultation problems: statement …, stateConfidence: "confirmed",
                 repositoryFullNames: ["ajegorovs/nakama-research-dashboard"] (D6) */ ],
})
```

**Not a guaranteed total of two calls:** any explicitly-approved problem-evidence pass (F14a) is a
**later** `reconcileTopic`. **No event is ever duplicated** to satisfy the problem-evidence policy.

### 5.2 SCOPE-RETAINED — before/after amendment (idempotent, content-stable)

| Finding | Payload (reference) | Class | Gate |
|---|---|---|---|
| **F01 (D1/D2)** | `reconcileTopic({ topicId:<infra>, axes:[ { id:<ax5>, expectedVersion:<fresh>, repositories:[{ fullName:"ajegorovs/nakama-research-dashboard", relationship:<D1> }] }, { id:<ax6>, expectedVersion:<fresh>, repositories:[…] } ] })` | correction | **D1** |
| **F02 (D3/D4)** | `reconcileTopic({ topicId:<infra>, axes:[ { id:<ax5>, expectedVersion:<fresh>, people:[{ displayName:"Aleksandrs Jegorovs", githubLogin:"ajegorovs" }] }, { id:<ax6>, … } ] })` | enrichment | ok (proposal) |
| **F04 (D5/D6)** | `reconcileTopic({ topicId:<infra>, problems:[ { problemId:<N-7…>, statement:<verbatim echo>, repositoryFullNames:["ajegorovs/nakama-research-dashboard"] }, { problemId:<skill-loading…>, … } ] })` | correction | ok (proposal) |
| **F07/F09** | `reconcileTopic({ topicId:<t>, repositories:[{ fullName:…, url:…, description:<pinned README>, defaultBranch:<as-of-read>, relationship:<stored value verbatim> }] })` — **must carry the stored relationship** (metadata write is coupled to a link write; omitting demotes a primary) | correction | ok (proposal) |
| **F12** | `reconcileTopic({ topicId:<exp>, plans:[ { planId:<diag>, axisId:<ax4>, summary:<verbatim echo>, steps:[ {stepId:<s1>,title:<verbatim>,position:1} … {position:4} ] } ] })` | correction | ok (proposal) |
| **F08** | `reconcileTopic({ topicId:<exp>, axes:[ { id:<ax4>, expectedVersion:<fresh>, currentState:<D2 wording>, currentStateConfidence:<D2 confidence> } ] })` | optional editorial | **D2** |
| **F03/F04 evidence** | **leave** (no payload) · **duplicate** (new `reconcileTopic.activities[]`, readback-guarded, non-idempotent) · **F14a new** `activities[].problemId` | required | **D4** |
| **F05 / F10 (existing) / move / retro-link** | **no payload — BLOCKED** (INSERT-only `activities`) | — | — |

**Unsuitable-to-invent.** Where there is no supported path, the packet asserts **no** payload (§6).

---

## 6. Capability boundaries (recorded, not worked around)

- **Live preflight is a precondition, not part of this packet.** Before any future write: explicit
  target chosen; **served build established by measurement** (the actual asset, by sha256, at the exact
  target org — not a reinstall's output); dedup pass (`get_overview` + `search_dashboard`); versions
  captured; source refs/dates immutable and public; hygiene applied. A gate that cannot be met **stops**
  the session and is reported, not worked around.
- **Version discipline.** `expectedVersion` exists for the **topic** (top-level) and each **axis**
  (`axes[].expectedVersion`); the manifest's **`problems[]`/`plans[]` carry none**, so those updates
  **cannot** be version-guarded through the tool — dedup rests on a fresh readback. On `conflict`,
  **re-read and decide**, never overwrite blindly.
- **Skip / idempotency / conflict / abort / partial recovery.** Link/upsert writes are idempotent
  (content-stable); axis/topic patches bump the version on **every** call, so a retry must re-read;
  **activity inserts are NOT idempotent** (front-guard with a readback that asserts absence). A
  `conflict` **aborts** the transaction; **partial recovery** is by re-reading the fresh state.
- **No automatic rollback for unsupported events.** There is **no** `updateActivity`/`deleteActivity`
  and no such action — an unsupported mutation (F05 `occurredAt`, F10-existing `sourceUrl`, activity
  re-point, F14a retro-link) has **no path**, and the packet asserts none. The store's own atomicity
  covers a *failed* transaction; it does **not** offer a general undo for a *committed* one.
- **Read-only verification transport** (for any later authorized preflight): the three read actions over
  direct HTTP with explicit `x-org-id` and CSRF; the wrapper is `{ invocationId, result }` (unwrap
  `result`); the served-asset route is `GET /v1/plugins/ui/<orgId>/research-dashboard/<asset>`, and the
  **page** fetches the **active** org's asset (select it via `POST /v1/auth/active-org`, never
  `orgs[0]`).

---

## 7. Preservation, canonical readback, and the limits of a test store

- **Preserved stores.** A write targets **one explicitly chosen org**; the **un-targeted** store(s) are
  left unchanged and confirmed **by their own readback measurement**, not DB byte identity (a write can
  legitimately rewrite shared SQLite pages). No reinstall/deploy/restart.
- **Complete canonical readback.** The untargeted-store check compares a **full mutation-public**
  readback: repository metadata; topic/axis repository links **and** people; `currentState`/blocker
  **confidences**; problem repository sets; plan step **ids, titles, positions**; source events
  (type/ref/url/occurredAt/axis); and topic/axis **versions** — excluding **only** volatile presentation
  (generated/recorded/updated timestamps and random row ids).
- **Limitation — a test store is not live proof.** WP5 exercises an **isolated throwaway** store; it
  proves the checker reaches its verdicts, **not** that a live target behaves identically. A green (or
  BLOCKED) WP5 run is **not** evidence about any live service; only a fresh live readback at the exact
  target can establish live state.

---

## 8. Post-write verification (a later, separately authorized stage — NOT now)

A future authorized session, after any write, runs **one** verification pass and records it. **No
network fixture, no live read, and no write runs now.**

**Exact metrics to assert (per scope):**
- **SCOPE-BASELINE:** counts `2 topics / 6 axes / 1 person / 3 repositories / 4 plan steps / 3 problems /
  8 unique events`; mapping **2/1/1/1/3/0**; byte-equal metadata; positions `1..4` (no nulls); every
  event's own `occurredAt` (AGENDA present at `2026-09-24`); public `sourceUrl`s; no `axis_repositories`
  row with an omitted role; **zero** new duplicates.
- **SCOPE-RETAINED:** `new_repositories = new_people = new_topics = new_axes = 0`; identical link sets
  across a re-run; the stored relationship equals the **human-decided** value (never a defaulted
  `supporting`); metadata byte-equal; positions distinct/ascending with **step ids and titles
  unchanged**; the ratified `inferred` **not silently promoted**; no activity added without an approved
  strategy; **no** attempt to write an existing event's `occurredAt`/`sourceUrl`.
- **Both:** the un-targeted store unchanged by its own readback; recency (`updatedAt`) may advance while
  `lastActivityAt`, event count and each `occurredAt` are **unchanged** (recency is not research).

**Stop conditions (abort and report, never work around):** a wrong/missing served build; a dedup hit
that contradicts the expected empty/pre-seeded shape; an unresolved or mismatched `expectedVersion`
(`conflict`); an evidence absence for a `confirmed` claim; a truncated read treated as absent; any
un-targeted-store change; any attempted write on an unsupported path; any live/network behaviour the
preflight did not authorize.

**Fresh read at the later stage:** verification reads the **live** state fresh at the exact target — the
packet's committed evidence is a **proposal's** projection, not a live measurement.

---

## 9. Recommendations (proposed — the packet does NOT choose)

| Decision | Packet's recommendation | Status |
|---|---|---|
| D1 axis→repo roles (all six) | per-axis explicit value; withhold any undecided axis; preserve stored topic-level roles verbatim | **not approved** |
| D2 F08 `currentState` | leave absent unless exact wording approved; if populated, `inferred` | **not approved** |
| D3 axis-4 blocker | keep the ratified `inferred` | **not approved** |
| D4 evidence strategy | **leave as-is** | **not approved** |
| D5 target | new org for SCOPE-BASELINE; retained org for SCOPE-RETAINED | **not approved** |
| D6 problem→repo links | confirm (source-backed, separable) | **not approved** |

**All six are recommendations only.** The packet chooses none; the owner decides.

---

## 10. Decision form — one form, all independent choices

Answer every line; each is **independent**. Leave a line blank to **withhold** (the dependent check
stays BLOCKED, never defaulted).

```
WP-G decision form — answer any subset; blanks withhold (no default is applied).

SCOPE-BASELINE target (D5a):  [ new-org | retained-org | <label> ]        ______
SCOPE-RETAINED target (D5b):  [ retained-org | <label> ]                  ______

D1 axis→repo role, per axis (primary|supporting|withhold):
  ax1 UDV acquisition automation ................... ______
  ax2 UDV sparse-analysis validation ............... ______
  ax3 High-rate optical acquisition ................ ______
  ax4 Grablink diagnostics ......................... ______
  ax5 Research dashboard (D1) ...................... ______
  ax6 Agent consultation (D2) ...................... ______

D2 F08 axis-4 currentState:   [ leave-absent | populate ]                 ______
   if populate: confidence [ inferred | confirmed ]; wording: ____________

D3 axis-4 blocker confidence: [ keep-inferred | restore-confirmed ]       ______
   (restore-confirmed requires an approved axis-4 evidence add: yes/no)   ______

D4 evidence strategy:         [ leave | duplicate | new-problem-event ]   ______
   if duplicate/new: name the exact source refs allowed: ________________

D6 F04 problem→repo links (D5/D6):  [ confirm | withhold ]                ______

Owner write authorization:    [ not granted | granted ]                   ______
   (separate from every choice above; WP-G itself grants nothing)
```

---

## 11. Boundaries

- **Planning/review only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no
  inference, no service/deploy/restart, no product/UI edit, no direct-DB write, no merge, no network
  call.
- **No execution authorization.** Every write needs the explicit human choices **and** explicit owner
  write authorization; the five gates (D1–D5) stay BLOCKED until answered.
- **No live identity.** The packet carries public labels and public GitHub refs/pins only; the actual
  target id/name/path lives in the local handoff.
- **A passing design/WP-G packet is not authorization.** This document is a question, not an answer.
