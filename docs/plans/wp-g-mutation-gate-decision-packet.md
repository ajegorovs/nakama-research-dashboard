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
> **Reviewer disposition (docs-only correction).** An external reviewer returned **REQUEST CHANGES** on
> this packet's scope; the corrections below are **documentation only** — **no decision is settled**, no
> write authorization is granted, and the two scopes stay **unapproved**. **WP0–WP5 remain accepted**;
> only this planning packet and its appended ledger record were revised. The reviewer's corrections are
> appended to the ledger as **§P** (request + correction), preserving the earlier history.
>
> **Reviewer disposition 2 (docs-only decision-consistency correction, 2026-10-08).** A second review
> returned **two issues plus format tightening** on the packet's **internal decision consistency**; the
> corrections are again **documentation only** — **no decision is settled**, no write authorization is
> granted, and the two scopes stay **unapproved**. They (a) make every **`confirmed` retained choice
> compatible with the axis-4 evidence rule** (D2 `populate`+`confirmed`, D3 `restore-confirmed`, and D4
> `leave`), (b) make **SCOPE-BASELINE D1 fixed/fully-required and D2 fixed** rather than open choices,
> and (c) add a **decision compatibility matrix** with a preflight validation, an authorization block,
> exact payload templates, stop/post-checks and a **decision-form cross-validation**. **WP0–WP5 remain
> accepted and are not reopened**; no harness code is changed. The corrections are appended to the
> ledger as **§Q**, preserving the earlier history.
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
- **No decision settlement in this revision.** Neither the reviewer's scope corrections (§P) nor the
  **decision-consistency corrections (§Q)** answer any of the decision categories D1–D6; SCOPE-BASELINE
  and SCOPE-RETAINED remain **unapproved**, and the **current packet is the reviewed artifact**. The
  baseline halves of D1 (all six required) and D2 (**fixed leave-absent**) are **design facts carried
  from WP3**, not WP-G choices; the retained compatibility matrix (D7) is a **preflight**, not a decision.
- **No WP3 seed and no WP4 amendment is executed by this packet.** The WP5 manifest is the WP5
  checker's *approved input contract* — permitted testdata, not an executed fixture.
- **Authorization is per scope, never blanket.** There is **no** single global "owner write
  authorization" field; each scope carries its **own** authorization bound to that scope's resolved
  decisions, payload and version (see §10).

---

## 1. Two programs, two named scopes — do not conflate

The methodology (§5) separates two mutation programs. WP-G covers **both**, but they are named and
scoped separately, and each carries its own target decision.

| Scope name | Program | Target assumption | What it is | Design of record |
|---|---|---|---|---|
| **SCOPE-BASELINE** | **baseline seed** | a **fresh, verified-empty** target — **never** the retained org | builds the fixture *from nothing*; every required field is sourced from the first write; §2–§4 of the methodology apply from write 1 | WP3 [`public-research-baseline-seed-design.md`](public-research-baseline-seed-design.md) |
| **SCOPE-RETAINED** | **retained-fixture amendment** | the **existing, accepted** fixture (PR #3) | idempotent, explicitly-approved before/after corrections/enrichments over the existing records; never rewrites a published acceptance record | WP4 [`public-research-retained-fixture-amendment-design.md`](public-research-retained-fixture-amendment-design.md) |

**They are not the same target and not the same packet.** SCOPE-BASELINE's target must be a **fresh target
verified empty at preflight** — and it must **never** be the org that hosts the retained fixture. **No
reset/clear/re-seed is permitted** as a way to reach an empty target: if the chosen target is **nonempty**
(any pre-existing topic/axis/object), the session **STOPS** rather than clearing or overwriting it.
SCOPE-RETAINED's target is the org that already hosts the retained fixture. The **D5 target decision names
one target per scope** — the two scopes may not share a target by accident, and neither may fall back to a
helper's `orgs[0]`. Candidates are named by **public sanitized label** here; the **future exact org
id/name** lives **only** in the local (git-ignored) operational handoff (§10).

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

## 3. The scoped decisions (each: options · tradeoffs · recommendation · approval status)

The packet carries **six decision categories (D1–D6)**, each **scoped** to a program — a category may
apply to **SCOPE-BASELINE**, to **SCOPE-RETAINED**, or to **both with different content per scope**. They
are **not** one global independent set: a resolved decision answers **only its own scope**. **None is
approved here**, and the reviewer's corrections settle **none** of them. The recommendation in each is a
*default the packet proposes*, **not a chosen value**. A seventh element, **D7** (end of this section), is
**not a decision** but a **compatibility preflight** over D2/D3/D4 — the check that refuses an
incompatible/unbacked `confirmed`. Two baseline halves are **not choices at all** and are **fixed by the
accepted WP3 design**: **D1 baseline resolves all six roles** (no withhold, no partial seed) and **D2
baseline is leave-absent**.

### D1 (G01) — axis→repository **role**, scoped

**What it is.** `axis_repositories.relationship` accepts only **`primary | supporting`** and is
`NOT NULL DEFAULT 'supporting'` (`migrations/002`). There is **no "undecided" value**, so omitting the
field silently stores `supporting` — the very value the reviewer refused. **The decision is scoped:**

- **SCOPE-BASELINE — all six axes.** A fresh seed builds every axis, so **all six** roles are resolved
  here (axes 1–4 experimental, axes 5–6 infra). None may be left to the `supporting` default.
- **SCOPE-RETAINED — only the missing axes 5/6.** The retained fixture already carries a stored
  `supporting` on axes 1–4; the amendment **leaves axes 1–4 untouched — no new role changes there**.
  Only the two axes with **no link at all** (axes 5/6, the WP2 D1/D2 pairs) are in scope.

**State per axis (measured / designed):**

| Axis | Retained link today | Scope that decides it | Role approved? |
|---|---|---|---|
| 1 UDV acquisition automation | `supporting` (retained) | **baseline only** — retained leaves it **untouched** | no |
| 2 UDV sparse-analysis validation | `supporting` (retained) | **baseline only** — retained untouched | no |
| 3 High-rate optical acquisition | `supporting` (retained) | **baseline only** — retained untouched | no |
| 4 Grablink diagnostics | `supporting` (retained) | **baseline only** — retained untouched | no |
| 5 Research dashboard and focused retrieval | **absent** | **baseline + retained** (WP2 D1) | **no** |
| 6 Agent consultation and automation evidence | **absent** | **baseline + retained** (WP2 D2) | **no** |

**Options (per scope).**
- **SCOPE-BASELINE:** a per-axis explicit `primary`/`supporting` for **each of the six** (Option A —
  the **only** supported option); a uniform value (Option B — **not recommended**: uniform `supporting`
  launders the undecided semantic into the refused default; uniform `primary` demotes an existing
  primary). **`primary | supporting` ONLY.** The **six roles are all required**, never defaulted, and
  **never withheld** in the baseline: the seed writes **all six** links with a decided role. There is
  **no `withhold` option and no partial seed** — a **blank/unresolved** role for any axis **blocks this
  scope's authorization** (the form cannot be authorized while any of the six is blank), and writing
  **five of six** links is **not permitted** (the baseline is all-six or nothing). (A design that would
  withhold a baseline link is a **WP3/WP5 design change**, not a WP-G choice — see the note below.)
- **SCOPE-RETAINED:** `primary`/`supporting` for **the missing axes 5 and 6** — axes 1–4 are **not
  re-decided** and **not rewritten** (no new role changes on the existing four links). Within the
  retained scope a role **may be withheld** (leaving the axes 5/6 link a **known residual**, recorded,
  not silently dropped) — this is the **existing accepted retained scope preserved**, and the packet
  makes **no unrequested decision** beyond it.

**Recommendation (not chosen):** per-axis explicit values; baseline **all six** `primary`/`supporting`
(**no withhold, no default**); retained axes 5/6 by explicit value or an **explicit withhold** stated as
a residual. **Never** default any role to `supporting`.

**Not a WP-G choice (format).** The baseline's all-six requirement is **the accepted WP3 design**
(WP3 §2.3/§8/§9 D-A: `axis_repositories` has no "undecided" value and omitting it silently stores
`supporting`). **WP-G does not reopen WP3**: any change to *whether* a baseline link is written is a
**small WP3/WP5 design/check delta → reviewer → re-enter WP-G**, never a new baseline option here.

**Blocked until:** D1 answered. WP5 gate **G01** stays BLOCKED.

### D2 (G02) — F08 axis-4 `currentState` **wording + confidence**, scoped

**What it is.** Axis 4's `currentState` is an **optional** field. The pinned AGENDA source **does**
support a conservative factual state, so **evidence sufficiency** and **editorial choice** are separate.
**The decision is scoped, and the two scopes must not silently share an answer:**

- **SCOPE-BASELINE — FIXED leave-absent (not a WP-G choice).** The baseline seed's accepted design
  (WP3 §2.3/§9 D-B) **leaves axis-4 `currentState` absent**; this is an **accepted WP3 deviation** from
  the original exercise packet. **WP-G does not offer a baseline `populate` option**, and **no new
  baseline decision is made here.** Making the baseline populate `currentState` — or populating it with
  any wording/confidence — requires a **small WP3/WP5 design/check delta (counts and claims expectations
  updated) → reviewer → re-enter WP-G**, and **then** it is a separate, explicitly-approved choice. It is
  **not** implied by the retained scope's answer and the retained choice **must not be silently reused**
  in the seed. (Baseline `currentStateConfidence` is therefore **inferred where a state is present**
  (axes 1,2,3,5,6) and **null on axis 4** — §4.4.)
- **SCOPE-RETAINED — its own wording + confidence.** The retained amendment carries **its own** approved
  sentence and an explicit `currentStateConfidence`, independent of the baseline's fixed blank.

**Options (per scope).**
- **SCOPE-BASELINE:** **none** — the field is **fixed leave-absent**. (`populate` is **withdrawn** as a
  WP-G option; it is a WP3/WP5 design change as above.)
- **SCOPE-RETAINED:** **A — leave as-is** (axis 4 keeps only its blocker/problem/plan) or **B — populate**
  with an approved sentence and an explicit confidence. The **accepted-design candidate** (derived
  strictly from the pinned AGENDA facts; **not approved**) is:

  > *Candidate wording (NOT approved):* "High-rate optical acquisition has a hardware-validated baseline
  > (≈351 FPS preview; a 200-frame capture wrote `Image_00000.bmp`–`Image_00199.bmp`; a 2000-frame
  > capacity run's manual Stop & Save wrote partial sequences of 652 and 1028 frames). Sustained
  > 300–350 FPS operation with dropped-frame measurement remains outstanding; `core/CaptureStats` is
  > implemented and covered by 13 tests but no production code calls it."

  **Confidence condition (retained):** an `inferred` `currentState` needs **no** evidence; **`confirmed`
  needs the axis to carry evidence by the transaction's end** (`assertClaimsAreBacked`), and the live
  historical retained fixture's axis 4 currently carries **zero** evidence. So the safe confidence is
  **`inferred`** unless an evidence add is separately authorized. (In SCOPE-RETAINED a `confirmed`
  `currentState` needs pre-existing axis evidence — see the compatibility matrix below; in SCOPE-BASELINE
  the field is fixed absent, and a `confirmed` value would require the same-transaction activity #5.)

**Recommendation (not chosen):** baseline **fixed leave-absent** (no option); retained **A — leave
as-is** unless a human approves exact wording. **Never reuse one scope's answer for the other.**

**Blocked until:** D2 answered **in the retained scope** (the baseline half is **fixed**, not open).
WP5 gate **G02** stays BLOCKED.

### D3 (G03) — axis-4 `blocker` confidence — **SCOPE-RETAINED only**

**What it is.** This decision exists **only in SCOPE-RETAINED**. The retained fixture's measured
`blockerConfidence` is **`inferred`** and it is **ratified — not a defect**. The packet's historical
`confirmed` was the *packet's proposal*, never measured in the retained fixture. `assertClaimsAreBacked`
grades the `blocker` claim independently of `currentState`.

**SCOPE-BASELINE — not this decision.** In the baseline seed the axis-4 `blocker` is **fixed at
`confirmed` and is evidence-backed same-transaction** (WP3 §5.3/§5.4 — activity #5, the AGENDA event
placed on axis 4). It is **not** an open choice and must **not** be re-derived from the retained answer.

**Options (retained only).**
- **A — keep `inferred`** (do nothing). An `inferred` claim requires **no** evidence and trips no guard.
  **No default downgrade or upgrade.**
- **B — restore `confirmed`** (optional, proposed, **not approved**). Requires axis-4 **evidence present
  by the transaction's end**; **pre-existing evidence counts**, but axis 4 carries **zero** today, so a
  **first** `confirmed` needs an **evidence add** (e.g. the AGENDA-source event in the same transaction,
  or an earlier explicitly-authorized pass).

**Evidence condition (exact):** `confirmed` ⟹ **qualifying axis-4 evidence**
(`branch` | `PR` | `activity` | `annotation`, `axisEvidence(axis).length > 0`) at the check — i.e.
**present by the transaction's end**; **pre-existing axis evidence counts**. `inferred` ⟹ no condition.
**The live historical retained fixture's axis 4 carries zero such evidence**, so **B** needs a
**separately authorized evidence add** and is otherwise **blocked**. This is one row of the compatibility
matrix below; it must hold together with **D4** (which supplies or withholds axis-4 evidence).

**Recommendation (not chosen):** retained **A — keep `inferred`.** Restoring `confirmed` is only
meaningful if an authorized evidence add (amenable to the D4 choice) is also chosen.

**Blocked until:** D3 answered. WP5 gate **G03** stays BLOCKED.

### D4 (G04) — F03/F14a **evidence strategy** — **SCOPE-RETAINED only**

**What it is.** Where an existing (or newly recorded) evidence row attaches to the diagnostics/consultation
axes and their problems. **This decision is in SCOPE-RETAINED only.** It is **distinct from the D6
problem→repo links**, which are **separable and independent** — F04's repository links do not depend on
this choice. **Two concerns must be kept apart, not conflated:**

- **Mandatory relationships** — the F01/F02/F04 **link rows** (axis→repo, axis→person, problem→repo);
  these are required and source-backed, and are governed by **D1/D6**, *not* by D4.
- **Evidence placement** — where an activity *sits* (F03) and whether a problem gains a **new**
  evidenced event (F14a).

**"Leave" = accept the residual gap.** Choosing **A (leave as-is)** means **no evidence mutation**: F03
and F14a remain **known residuals** — **not corrected** — and are recorded as such. The earlier
"…never *whether* the required link exists" framing is **withdrawn as contradictory**: for *evidence
placement* the human **does** decide whether a follow-up is made now or accepted as a residual; what is
never optional is the **presence of the mandatory relationship rows** (D1/D6) — a separate concern.

**Hard capability limits (measured, WP4 §4.2/§6):**

| Strategy | Supported? | Note |
|---|---|---|
| **Leave as-is** | yes | content is **not omitted** — it sits on another axis (F03); duplicate-free; **accepts the F03/F14a residual** |
| **Reassociate / move** an existing event's axis | **UNSUPPORTED** | `activities` is **INSERT-only**; no re-point/update path |
| **Edit an existing event** (`occurredAt` / `sourceUrl`) | **UNSUPPORTED** | same INSERT-only boundary |
| **Duplicate / re-record** a distinct event | store-supported (INSERT) but **discouraged + non-idempotent** | no uniqueness constraint; a retry inserts again; only as a *distinct legitimate attachment*, readback-guarded |
| **F14a retro-link** an **existing** event to a problem | **UNSUPPORTED** | `activities[].problemId` applies only to a **new** insert |
| **F14a new** event → existing problem | **supported** | `reconcile_topic.activities[].problemId` (existing problem only). To count as **axis-4 evidence** the new event must **also** carry axis 4 (`axisId`/`axisTitle`); a problem attachment **alone** is not axis evidence |

**No direct-DB workaround, and no duplicate fix via the database.** The product's own write path is the
only surface; the packet asserts **no** payload for an unsupported path.

**SCOPE-BASELINE — not this decision.** The baseline seed's **initial 8 events are fixed** by the WP3
design (§3.4), placed **2/1/1/1/3/0**, with evidence written **same-transaction**. Any **later** baseline
problem-evidence pass (F14a) is a **separate operation under a new design** — its counts and payloads are
**not part of this authorization**. The baseline therefore does **not** answer D4.

**Options (retained only).** **A — leave as-is** (accept the F03/F14a residual) · **B — reassociate**
(blocked) · **C — duplicate** (only if a human judges it a distinct legitimate attachment; readback-guarded) ·
**D — add new problem-evidenced events** (supported, via `activities[].problemId`).

**Compatibility of D4 with a `confirmed` axis-4 claim (D2/D3).** If **D2 = populate + `confirmed`** or
**D3 = restore-confirmed**, the axis must carry **qualifying axis-4 evidence by the transaction's end**.
D4 then decides whether that evidence is supplied:

- **D4 = leave (A)** adds **no** evidence. It is therefore **incompatible** with a `confirmed` D2/D3
  **unless** a **separately authorized pre-existing-evidence operation has already completed AND a fresh
  readback proves qualifying axis-4 evidence** (`branch`|`PR`|`activity`|`annotation`) **already exists**
  at the check. Absent that proof — and the live historical retained fixture today carries **zero**
  axis-4 evidence — **D4 = leave forces `inferred`**: D2 `populate` is allowed only at
  `currentStateConfidence: inferred` and D3 is **keep-`inferred`**. (No fresh read is performed now; the
  current zero-evidence state is the **historical measured** value, §D3.)
- **D4 = duplicate (C) or new-problem-event (D)** **may** supply evidence — but only if the new event is
  **axis-4-linked** (`axisId`/`axisTitle` = axis 4), **not** merely attached to a problem
  (`activities[].problemId`). A problem attachment alone is **not** axis-4 evidence and does **not**
  satisfy the `confirmed` condition. The event's approved payload **must name an explicit axis** and an
  **existing problem id** (when the problem path is used); no path is invented.

**No invented paths.** Only the supported paths above exist (INSERT-only `activities`; no move/re-point/
retro-link). The packet asserts **no** payload for an unsupported path.

**Recommendation (not chosen):** retained **A — leave as-is**. **Not approved.** If a `confirmed` claim
is desired, D4 must be **C/D** (or a separately authorized pre-existing-evidence operation must be
proved by fresh readback) — the decision form cross-validation below enforces this.

**Blocked until:** D4 answered. WP5 gate **G04** stays BLOCKED; C15/C17 only exercise the synthetic
`leave` / named-ref strategies.

### D5 (G05) — the explicit **target** decision (**one per scope**; public label only)

**What it is.** The organization/instance that hosts a future write, chosen **explicitly** and recorded.
A helper that could bind a default (`orgs[0]`) must **never** be used. **Each scope names its own target;
there is no shared or blanket target.**

- **SCOPE-BASELINE:** a **new** org — and only a **fresh target verified empty at preflight**. The
  baseline target is **NEVER the retained org**. **No reset/clear/re-seed is permitted** to empty an
  existing target: a **nonempty** target **STOPS** the session.
- **SCOPE-RETAINED:** the **existing retained org** (the amendment corrects the retained fixture).

**Public-safe naming.** This public packet carries **no operational identity** — no live org id, name,
host or path. Each scope's target is a **public sanitized label** only; the **future exact org id/name**
is held **only** in the local (git-ignored) **operational handoff**, never here. **No heuristic labels**
and **no actual secret ids** appear in this packet.

**Two separate targets — two separate authorizations.** SCOPE-BASELINE and SCOPE-RETAINED **must each
name their own target** and carry their **own** write authorization (§10). A single blanket target or a
single blanket authorization for both is **not valid**.

**Blocked until:** D5 answered **and** that scope's owner write authorization granted. WP5 gate **G05**
stays BLOCKED (it records a **proposed target decision only**; a resolution claiming `ownerAuthorization`
or `liveBinding` is rejected).

### D6 — F04 problem→repository links (D5/D6) — scoped, independent of D4

**What it is.** Both consultation-axis problems have `repositories: []` (unattributable). The fix is
`reconcile_topic.problems[].repositoryFullNames` → `ajegorovs/nakama-research-dashboard` (**replaces the
set**). **Source-backed, non-duplicating, and separable** from the evidence-location choice (D4).

**Scope.**
- **SCOPE-BASELINE — required, cannot be withheld.** The baseline seed writes **all three problem→repo
  links** — diagnostics→Grablink **and both consultation problems→Dashboard**. These are **required**;
  the seed **cannot withhold** them, and **the baseline is not green if they are unsatisfied** (the WP5
  baseline metrics assert three problem→repo links, §4.1/§8).
- **SCOPE-RETAINED — confirm or withhold.** The retained amendment may **confirm** the two consultation
  links, or **withhold**; a **withhold leaves F04 as a known residual** (recorded, not silently dropped).

**Recommendation (not chosen):** **confirm** in both scopes (source-backed). **Design-accepted as a
proposal, not a mutation approval.** In the baseline it is a required metric; in the retained scope it
rides the chosen target.

### D7 — decision **compatibility matrix** (added 2026-10-08; validation preflight, authorization block)

**Purpose.** The six decisions are **not independent**: a `confirmed` axis-4 claim requires qualifying
axis-4 evidence, and only the **D4** choice can supply it. This matrix is the **preflight a scope's
authorization must pass**; it **forces no upgrade, downgrade or default mutation** — an incompatible
combination is **BLOCKED**, never silently repaired. **No fresh read is performed now** (the packet is
planning-only); the current `zero axis-4 evidence` is the **historical measured** value (§3 D3), not a
live measurement.

**Compatibility matrix (SCOPE-RETAINED; the baseline halves of D2/D3 are fixed, not choices).**

| D2 `currentState` | D3 `blocker` | D4 evidence strategy | Compatible? | Required condition |
|---|---|---|---|---|
| leave-as-is | keep-`inferred` | leave | **yes** | none — all `inferred`, no evidence needed |
| populate + `inferred` | keep-`inferred` | leave | **yes** | none |
| populate + `inferred` | keep-`inferred` | duplicate / new-problem-event | **yes** | evidence add readback-guarded; axis-4-linked |
| populate + `confirmed` | keep-`inferred` | leave | **NO** | needs qualifying axis-4 evidence by tx end — see exception |
| leave-as-is | restore-`confirmed` | leave | **NO** | needs qualifying axis-4 evidence by tx end — see exception |
| populate + `confirmed` | restore-`confirmed` | leave | **NO** | needs qualifying axis-4 evidence by tx end — see exception |
| any (`confirmed`) | any (`confirmed`) | duplicate / new-problem-event | **yes** | new event **must** be axis-4-linked (`axisId`=axis 4); problem-only attachment does **not** qualify |

**Prior-verified-evidence exception (the only way `confirmed` + leave is allowed).** A `confirmed` claim
with **D4 = leave** is permitted **only if** a **separately authorized pre-existing-evidence operation
has already completed** AND a **fresh readback proves qualifying axis-4 evidence exists**
(`branch`|`PR`|`activity`|`annotation`). **A future measurement is never asserted as current**: the
packet records the **historical** zero-evidence state, and only the later authorized fresh readback may
establish the exception. Absent that, `confirmed` with `leave` is **BLOCKED**.

**Authorization block (exact conditions).** A scope's write authorization (§10) may be **granted only
when** the resolved decisions are **internally compatible**:

1. **SCOPE-BASELINE:** **all six** axis→repo roles resolved `primary|supporting` (**no blank, no
   withhold, no partial seed**); D2 **fixed leave-absent**; D3 **fixed `confirmed`, evidence-backed
   same-transaction** (activity #5); D6 **three required links confirmed** (no withhold). Any blank →
   authorization **BLOCKED**.
2. **SCOPE-RETAINED:** the matrix row above is **`yes`**, **or** the prior-verified-evidence exception is
   **evidenced by a fresh readback**; a `confirmed` claim whose matrix row is `NO` and whose exception is
   unproven → authorization **BLOCKED**. D1 axes 5/6 must each be an explicit value **or** an **explicit
   withhold** stated as a residual; an **ambiguous blank** → **BLOCKED** (no default).
3. **Both scopes:** D5 target resolved (fresh-verified-empty for baseline; the retained org for retained);
   the scope's **own** owner write authorization bound to the resolved payload/version — **no blanket
   field**.

**Exact payload templates (evidence path — retained D4 = C/D; gated, not executed).**

```
// D4 = new-problem-event (supported) — the new event is axis-4-linked AND attached to an EXISTING problem.
reconcileTopic({
  topicId: <infra>,
  activities: [ {
    axisId:   <axis4>,                 // REQUIRED: makes it qualifying axis-4 evidence
    problemId:<existing problem id>,   // REQUIRED where the problem path is used; must PRE-EXIST
    summary:  <verbatim source text>,
    sourceType: <enum>, sourceRef: <public ref>, sourceUrl: <public URL>, occurredAt: <own source date>
  } ]
})
// D4 = duplicate (distinct legitimate attachment) — same shape, axis-4-linked, readback-guarded against a
// duplicate (activities is INSERT-only and NOT idempotent: a retry inserts a second row).
// No payload is asserted for an UNSUPPORTED path (move / retro-link / event edit).
```

```
// D2 = populate (retained) or D3 = restore-confirmed — after the evidence above is present by tx end.
reconcileTopic({ topicId:<experimental>, axes:[ { id:<ax4>, expectedVersion:<fresh>,
  currentState:<approved text>, currentStateConfidence:<c> } ] })   // F08; c = inferred unless classified
reconcileTopic({ topicId:<infra>, axes:[ { id:<ax4>, expectedVersion:<fresh>,
  blockerConfidence:"confirmed" } ] })                              // D3 restore only; evidence must exist
```

**Stop / post-checks.** Before the call: assert the matrix row's condition (evidence present by tx end)
and dedup-readback absence for any new event. On an incompatible/unproven `confirmed`: **STOP**, do not
downgrade silently and do not write — report the BLOCKED combination. After the call: verify the axis
carries qualifying evidence and that no **un**approved event/duplicate was inserted (event count,
`lastActivityAt`, each `occurredAt` unchanged except the approved add).

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
| problem→repo links | 3 | diagnostics→Grablink; 2 consultation→Dashboard — **required in the baseline (D6); cannot be withheld** |
| **axis→repo links written** | **6** | gated on **D1**: the baseline resolves **all six roles** explicitly (`primary`/`supporting` only — **never defaulted to `supporting`, never withheld, no partial 5-link seed**; a blank role blocks authorization) |

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

**All five parameter gates (G01–G05) are BLOCKED.** `bun run harness:wp5` → **28 PASS · 0 FAIL · 5 BLOCKED**
(exit 2) — the approved baseline is internally consistent, but the run is **not green** because the
decision categories D1–D6 are unanswered. The **test-only** path (33 PASS) exists only to prove the checks
can go red.

---

## 5. Full delta — exact payload templates (gated; no executor, no runtime write)

The dst templates below are **references**, transcribed from the accepted designs. They are **gated
on D1–D6** and are **not executed by this packet**. `expectedVersion` is read **fresh immediately
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
  axes: [ /* axes 1–4: title, kind, state, stateConfidence:"inferred", currentState (present, inferred, on axes 1–3; ABSENT on axis 4 — baseline D2 FIXED leave-absent), currentStateConfidence:"inferred", people:[…], repositories:[ { fullName, relationship:<D1, all six required> } ] */ ],
  activities: [ /* #1 #2 #3 #4 #5 per §4.2; axisTitle handles */ ],
  problems: [ { statement: …, axisTitle: "Grablink diagnostics…", state: "open", stateConfidence: "confirmed",
               repositoryFullNames: ["ajegorovs/Grablink-Full-sequence-acquisition"] } ],
  plans: [ { axisTitle: "Grablink diagnostics…", summary: …, steps: [ {title …, position: 1} … {position: 4} ] } ],
})

// Transaction 2 — topic "Research infrastructure / team management"
reconcileTopic({
  topicName: "Research infrastructure / team management",
  people: [ … ], repositories: [ { fullName: "ajegorovs/nakama-research-dashboard", relationship: "primary", … } ],
  axes: [ /* axes 5–6; axis 5 carries commits #6 #7 #8; repositories:[ { fullName:"ajegorovs/nakama-research-dashboard", relationship:<D1> } ]; people per D3/D4 */ ],
  activities: [ /* #6 #7 #8 */ ],
  problems: [ /* two consultation problems: statement …, stateConfidence: "confirmed",
                 repositoryFullNames: ["ajegorovs/nakama-research-dashboard"] (D6) */ ],
})
```

**Not a guaranteed total of two calls:** any explicitly-approved problem-evidence pass (F14a) is a
**later** `reconcileTopic`. **No event is ever duplicated** to satisfy the problem-evidence policy.

**Partial commit — stop, record, verify (never blind re-run).** The two creation transactions commit
**independently**. If **T1 commits and T2 fails**, the target is now **nonempty**: **STOP all writes**,
**log the exact committed transaction** (T1's payload/version/result), and **read back fresh** the
measured state. **Never blind-re-run** creation. A resume is a **new, explicitly scoped authorization**
that starts from the **measured state** — with a dedup pass and the correct `expectedVersion` / expected
existence per object (an already-created object is **matched, never re-created**). If an **activity
insert's transport is ambiguous** (unknown whether it landed), **do NOT retry** until a readback **proves
the event was not inserted** (activities are non-idempotent). An **unsupported update has no rollback** —
there is no undo for a committed transaction (§6).

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
- **Partial commit is stop-record-verify — no implicit rollback.** Writes commit **per call**; there is
  **no cross-call transaction and no implicit rollback**. On a partial commit (a later call fails after an
  earlier one committed) the session **STOPS**, **records the exact committed transaction(s)** and
  **verifies by fresh readback** — in **both** scopes. **SCOPE-BASELINE:** a T1-committed/T2-failed target
  is **nonempty**; creation is **never blind-re-run**, only **resumed** under a new explicitly scoped
  authorization from the measured state (§5.1). **SCOPE-RETAINED:** multi-call amendments may leave
  **partial commits**; stop, record and verify — do **not** assume a rollback.
- **An ambiguous activity transport is not retried.** If it is unknown whether an activity insert landed,
  **do NOT retry** until a readback proves the event is absent (inserts are non-idempotent).
- **Unsupported updates have no rollback.** For F05 / F10-existing / re-point / retro-link there is no
  update path and therefore **no rollback**: the store's atomicity covers a *failed* transaction, never an
  undo for a *committed* one.
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
  8 unique events`; **six axis→repo links, each with an explicit decided role** (D1; none omitted, none
  defaulted); **three problem→repo links** (diagnostics→Grablink **and both consultation→Dashboard**, D6
  — required); mapping **2/1/1/1/3/0**; byte-equal metadata; positions `1..4` (no nulls); every event's
  own `occurredAt` (AGENDA present at `2026-09-24`); public `sourceUrl`s; **zero** new duplicates.
- **SCOPE-RETAINED:** `new_repositories = new_people = new_topics = new_axes = 0`; **only the missing
  axes 5/6 role links are added — axes 1–4 untouched (no new role changes)**; identical link sets across
  a re-run; the stored relationship equals the **human-decided** value (never a defaulted `supporting`);
  metadata byte-equal; positions distinct/ascending with **step ids and titles unchanged**; the ratified
  `inferred` **not silently promoted**; no activity added without an approved strategy; **no** attempt to
  write an existing event's `occurredAt`/`sourceUrl`.
- **Both:** the un-targeted store unchanged by its own readback; recency (`updatedAt`) may advance while
  `lastActivityAt`, event count and each `occurredAt` are **unchanged** (recency is not research).

**Stop conditions (abort and report, never work around):** a wrong/missing served build; **a SCOPE-BASELINE
target that is not verified empty (nonempty → STOP; no reset/clear)**; a dedup hit that contradicts the
expected empty/pre-seeded shape; an unresolved or mismatched `expectedVersion` (`conflict`); an evidence
absence for a `confirmed` claim; a truncated read treated as absent; any un-targeted-store change; any
attempted write on an unsupported path; an **ambiguous activity-insert transport not yet proven absent by
readback**; any live/network behaviour the preflight did not authorize.

**Fresh read at the later stage:** verification reads the **live** state fresh at the exact target — the
packet's committed evidence is a **proposal's** projection, not a live measurement.

---

## 9. Recommendations (proposed — the packet does NOT choose)

| Decision | Scope | Packet's recommendation | Status |
|---|---|---|---|
| D1 axis→repo roles | **BASELINE: all six required (`primary`\|`supporting` only; no withhold/partial)** · **RETAINED: axes 5/6 only (1–4 untouched; explicit value or explicit withhold-residual)** | per-axis explicit value; never default; a blank blocks authorization | **not approved** |
| D2 F08 `currentState` | **BASELINE: FIXED leave-absent (not a choice)** · **RETAINED: own wording/confidence** | baseline: none (change → WP3/WP5 delta); retained: leave absent unless exact wording approved; if populated, `inferred` unless evidence exists | **not approved** |
| D3 axis-4 blocker | **RETAINED only** (baseline `confirmed` is evidence-backed, fixed) | keep the ratified `inferred`; a `confirmed` restore needs axis-4 evidence by tx end (matrix) | **not approved** |
| D4 evidence strategy | **RETAINED only** (baseline 8 events fixed) | leave as-is (accept the F03/F14a residual) — but `leave` cannot back a `confirmed` D2/D3 unless pre-existing evidence is proved; else C/D (axis-4-linked) | **not approved** |
| D5 target | one **explicit** target per scope (baseline: fresh, verified-empty; never the retained org) | new org for SCOPE-BASELINE; retained org for SCOPE-RETAINED | **not approved** |
| D6 problem→repo links | **BASELINE: required (cannot withhold)** · **RETAINED: confirm/withhold** | confirm in both (baseline required; retained else F04 residual) | **not approved** |
| **D7** (compatibility matrix) | **not a choice — a preflight** over D2/D3/D4 | an incompatible `confirmed` combination is **BLOCKED** (no forced upgrade/downgrade/default) | **enforced, not decided** |

**All six decision categories are recommendations only.** The packet chooses none; the owner decides,
**per scope**. Authorization is **never blanket** — each scope carries its own (§10).

---

## 10. Decision forms — one per scope (each with its own exact target and authorization)

Two forms, one per program. Each is **independent**: answering one scope does **not** answer the other.
**Each carries its own exact target and its own write authorization, bound to that scope's resolved
decisions, payload and version** — there is **no blanket authorization field**. Answer any subset; a blank
line **withholds** (no default is applied) — **except** where a blank is **not permitted** and instead
**blocks** authorization: the baseline D1 roles are **all required** (a blank there blocks the scope), and
the retained D1 axes 5/6 must be an explicit value **or** an explicit withhold (an ambiguous blank blocks).
The **D7 compatibility matrix cross-validation** (below the forms) is applied before any authorization is
granted. The **exact org id/name** for each chosen target is recorded
only in the local (git-ignored) **operational handoff**; the public packet keeps **sanitized labels**
(no heuristic labels, no actual secret ids).

```
WP-G decision form — SCOPE-BASELINE (fresh seed)
Target (D5a; exact id/name in the private handoff):  [ new-org (verified-empty) ]    ______
  (a nonempty target STOPS; the retained org is NOT permitted here)

D1 axis→repo role — ALL SIX axes, REQUIRED (primary|supporting ONLY — never withhold, no partial seed;
   a blank on any axis BLOCKS this scope's authorization):
  ax1 UDV acquisition automation ....... ______   ax2 UDV sparse-analysis validation .. ______
  ax3 High-rate optical acquisition .... ______   ax4 Grablink diagnostics ........... ______
  ax5 Research dashboard (D1) .......... ______   ax6 Agent consultation (D2) ......... ______

D2 F08 axis-4 currentState:  [ FIXED leave-absent — not a choice ]                   ______
   (a baseline populate is a WP3/WP5 design/check delta → reviewer → re-enter WP-G, NOT a form option)

D6 F04 problem→repo links (3, required — cannot withhold):  [ confirm ]              ______

SCOPE-BASELINE write authorization (bound to the resolved D1/D6 above; D2 fixed):    ______
   *** not granted | granted *** — grants BASELINE only; WP-G grants nothing by itself.
   (cannot be granted while any of the six D1 roles is blank)

WP-G decision form — SCOPE-RETAINED (amendment)
Target (D5b; exact id/name in the private handoff):  [ retained-org ]                ______

D1 axis→repo role — ONLY the missing axes 5/6 (axes 1–4 untouched):
  ax5 Research dashboard (D1) .......... ______   ax6 Agent consultation (D2) ......... ______
   (each: primary | supporting | withhold [leaves the axes 5/6 link a stated residual]; a blank is ambiguous)

D2 F08 axis-4 currentState:  [ leave-as-is | populate ]                              ______
   if populate: confidence [inferred|confirmed]; wording: ______________________________
   (a `confirmed` here requires qualifying axis-4 evidence by tx end — see D4/matrix)

D3 axis-4 blocker confidence: [ keep-inferred (ratified) | restore-confirmed ]       ______
   (restore-confirmed requires qualifying axis-4 evidence by tx end — see D4/matrix) ______

D4 evidence strategy:  [ leave (accept F03/F14a residual) | duplicate | new-problem-event ]  ______
   if duplicate/new: name the exact source refs allowed (the new event MUST be axis-4-linked): ______
   (leave is incompatible with a `confirmed` D2/D3 unless pre-existing axis-4 evidence is proved)

D6 F04 problem→repo links (D5/D6):  [ confirm | withhold (leaves F04 a known residual) ]  ______

SCOPE-RETAINED write authorization (bound to the resolved D1–D4/D6 above):           ______
   *** not granted | granted *** — grants RETAINED only; WP-G grants nothing by itself.
   (cannot be granted while a `confirmed` D2/D3 is unbacked by axis-4 evidence, or D1 is an ambiguous blank)

Cross-validation (D7 matrix — applied before either authorization is granted):
  - D2/D3 `confirmed` is allowed ONLY with D4 = duplicate/new-problem-event that is axis-4-linked,
    OR a separately authorized pre-existing-evidence operation already proved by fresh readback.
  - a `confirmed` row whose matrix verdict is NO and whose exception is unproven → authorization BLOCKED.
  - baseline: any blank D1 role, or a withhold, or a partial (5-of-6) seed → authorization BLOCKED.
  - no choice silently forces an upgrade/downgrade or applies a `supporting`/`confirmed` default.
```

---

## 11. Boundaries

- **Planning/review only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no
  inference, no service/deploy/restart, no product/UI edit, no direct-DB write, no merge, no network
  call.
- **No decision settlement; scopes unapproved.** The reviewer's corrections (§P scope, §Q
  decision-consistency) settle **none** of D1–D6; SCOPE-BASELINE and SCOPE-RETAINED remain **unapproved**,
  and **WP0–WP5 remain accepted** (ledger §O), **not reopened**.
- **No blanket authorization.** Every write needs the explicit human choices **and** that **scope's**
  explicit owner write authorization; the decision categories (D1–D6) stay BLOCKED until answered. There
  is **no** single global authorization field.
- **No choice forces a default mutation.** A blank, an unresolved combination or an unbacked `confirmed`
  is **BLOCKED** — it never silently applies the `supporting` link default, the `confirmed` confidence
  default, an upgrade/downgrade, or a partial seed. The **D7 compatibility matrix** (validation preflight
  + authorization block + decision-form cross-validation) is the check that enforces this.
- **Scope integrity.** SCOPE-BASELINE targets a **fresh, verified-empty** org and **never** the retained
  org; **no reset/clear** is permitted, and a **nonempty** target **STOPS**. Its **D1 resolves all six**
  roles (`primary`/`supporting`) — **never withheld, never a partial 5-of-6 seed** — and its **D2 is
  fixed leave-absent**. SCOPE-RETAINED touches **only** the missing axes 5/6 role links (each an explicit
  value **or** an explicit withhold-residual) and leaves axes 1–4 **untouched**.
- **Partial commits stop the session.** A partial commit (baseline T1-committed/T2-failed, or a retained
  multi-call partial) **STOPS** the session, is **logged exactly** and **verified by fresh readback** —
  never blind-re-run, and there is **no implicit rollback**.
- **No live identity.** The packet carries public labels and public GitHub refs/pins only; the actual
  target id/name/path lives in the local operational handoff.
- **A passing design/WP-G packet is not authorization.** This document is a question, not an answer.
