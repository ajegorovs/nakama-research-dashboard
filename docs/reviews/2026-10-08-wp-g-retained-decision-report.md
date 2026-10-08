# WP-G — retained-scope decision report: SCOPE-RETAINED settled, SCOPE-BASELINE unselected

> **Status: DECISION REPORT (documentation only) — no execution. The retained write is NOT authorized.**
> This appended review record settles the **SCOPE-RETAINED** parameter decisions against the accepted
> WP-G decision/review packet
> ([`wp-g-mutation-gate-decision-packet.md`](../plans/wp-g-mutation-gate-decision-packet.md)) at commit
> `c3566a5ef99cac3937bf1f7de0ee9c3d904127d4`, and records the external reviewer's **acceptance of that
> packet**. It is **not a verbatim reviewer transcript**: the verdict line is recorded exactly and the
> dispositions are summarized, never quoted as the reviewer's own words, and **no citation is invented**.
>
> **Docs only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no inference, no new
> research, no service/deploy/restart, no product/UI change, no harness change, no WP3 seed, no WP4
> amendment, and no merge is performed or authorized by this record. **WP0–WP5 remain accepted**
> (ledger §O) and are **not reopened**; the packet's proposal history and the design constants it cites
> are **preserved unchanged** (this record appends; it does not rewrite them).
>
> **Public-safe.** This record carries **public labels only** — no live org id, name, host or path. The
> **exact private target id** for the retained scope is held **only** in the local (git-ignored)
> operational handoff; it is a **historical bound, proposed — not fresh-verified** (see §8).

---

## 1. Reviewer verdict recorded

**Verdict: DECISION PACKET ACCEPTED (WP-G mutation-gate decision/review packet, docs-only).** The
packet at `c3566a5ef99cac3937bf1f7de0ee9c3d904127d4` — after the §P scope corrections, the §Q
decision-consistency corrections and the §R D7 payload-parameter correction — is the **reviewed
artifact**, and it is now **accepted**. The packet is **ready to settle**: the owner may answer the
scoped decision categories against it. **Acceptance of the packet is not a decision settlement and not a
write authorization** — it records that the packet is internally consistent and reviewable. **No owner
write authorization is granted** by this verdict (or by this record).

## 2. Scope: SCOPE-RETAINED only — SCOPE-BASELINE stays unselected/unapproved

The packet carries **two named programs** (§1). This decision report resolves **one** of them.

| Scope | Program | Owner selection | Write authorization |
|---|---|---|---|
| **SCOPE-RETAINED** | retained-fixture amendment (WP4) | **selected — decisions settled below** | **NOT authorized** |
| **SCOPE-BASELINE** | baseline seed (WP3) | **unselected / unapproved — no choices made** | **NOT authorized** |

**SCOPE-BASELINE is not answered here.** Its D1 (all six roles) and D2 (fixed leave-absent) are fixed by
the accepted WP3 design, **not** chosen here; its D5 target is unselected; and its write authorization
stays **NOT granted**. The retained choices below **must not be silently reused** as baseline choices.

## 3. The settled SCOPE-RETAINED decisions (D1–D6)

Each decision applies to the **retained scope only**; it answers no other scope.

| # | Category | Selected value (retained) |
|---|---|---|
| **D1** | axis→repository role (axes 5/6 only) | **axis 5 = `primary`**; **axis 6 = `primary`** (repository `ajegorovs/nakama-research-dashboard`). Existing axes **1–4 are left untouched** — no new role changes there. |
| **D2** | F08 axis-4 `currentState` (wording + confidence) | **populate** with the **exact sentence in §3.1**, `currentStateConfidence: inferred`. |
| **D3** | axis-4 `blockerConfidence` | **keep the ratified `inferred` — no change** (no upgrade, no downgrade). |
| **D4** | F03 / F14a evidence strategy | **leave as-is** — **no evidence mutation**: no event insert, no duplicate, no move, no edit. **F03 and F14a remain known residuals**, recorded, not corrected. |
| **D5** | target (one per scope) | **existing `Public Research Exercise` org** — **public label only** here; the exact private id is bound in the local (git-ignored) operational handoff (§8). **Proposed target only** — not live-bound (WP5 G05). |
| **D6** | F04 problem→repository links | **confirm both consultation problems → `ajegorovs/nakama-research-dashboard`**, carrying the **full intended set** (the write path replaces the whole `problem_repositories` set; the payload carries exactly that one repo per problem). |

### 3.1 D2 — the approved `currentState` string (exact, plain text; no formatting, no word changes)

```
High-rate optical acquisition has a hardware-validated baseline (≈351 FPS preview; a 200-frame capture wrote Image_00000.bmp–Image_00199.bmp; a 2000-frame capacity run's manual Stop & Save wrote partial sequences of 652 and 1028 frames). Sustained 300–350 FPS operation with dropped-frame measurement remains outstanding; core/CaptureStats is implemented and covered by 13 tests but no production code calls it.
```

The value is the **plain string above** — a single `currentState` text value, **no inline formatting**
(the candidate in the packet's §3 D2 carried markdown emphasis markers; the settled value is the plain
text, word-for-word identical). Written with `currentStateConfidence: inferred` (§3 D2).

## 4. D7 compatibility check for the settled combination (valid)

The settled retained combination is **internally compatible** and passes the D7 preflight:

| D2 `currentState` | D3 `blocker` | D4 evidence strategy | D7 verdict |
|---|---|---|---|
| populate + **`inferred`** | keep-**`inferred`** | **leave** | **yes — none required** (all `inferred`, no evidence needed) |

- **No `confirmed` claim is made in the retained scope**: D2 is `populate + inferred`, D3 keeps the
  ratified `inferred`. An `inferred` claim **requires no evidence** and trips no guard — so the
  `assertClaimsAreBacked` evidence condition, and the prior-verified-evidence exception, are **not
  engaged** by this decision set.
- **D4 = leave is compatible** precisely because no `confirmed` claim is made: a `confirmed` claim with
  D4 = leave would have been BLOCKED. The kit needs **no** fresh axis-4 evidence readback.
- **No silent default** is applied: no `supporting` demotion (D1 sets axes 5/6 explicitly `primary`), no
  `confirmed` promotion, no forced upgrade/downgrade.

The compatibility is a **decision combination** verdict, not a live measurement (§9).

## 5. What is NOT settled here — still requires authorization

This record **must not** be read as approving any mutation beyond the six retained decisions in §3.
Separately and explicitly, **these remain unselected proposals or blocked rows** and each **REQUIRES
explicit authorization** before any write:

| Row | Class (WP4) | Status after this record |
|---|---|---|
| **F07 / F09** repository metadata (`url` / `description` / `defaultBranch`) | correction | **design-accepted proposal — not selected here; REQUIRES authorization.** Must carry the stored `relationship` verbatim (the metadata write is coupled to a link write). |
| **F12** plan-step `position`s **1..4** | correction | **design-accepted convention (`1..4`) — not a mutation approval; REQUIRES authorization.** |
| **F02 (WP2 D3/D4)** axis→person links on axes 5/6 | enrichment | **design-accepted proposal — not selected here; REQUIRES authorization.** |
| **F04** problem `statement` echo | correction | carried only as the verbatim, unchanged echo required by the payload; **no text rewrite.** |
| **F01** axis→repo *link presence* on axes 5/6 | correction | the link is the D1 write; **role settled (§3), execution not authorized.** |
| **F03 / F04 evidence placement / F14a evidence link** | required finding | **D4 = leave — residuals accepted; no event added.** Any future evidence add is a **new operation under a new design**, not part of this set. |
| **F05 / F10 (existing) / move / retro-link** | blocked | **no supported path — no payload asserted** (INSERT-only `activities`). |
| **F07b / F16 / F09b / F11 / F13 / F14b / F14c / F15 / F17** | no-mutation | **boundaries recorded, no mutation** (WP4 §9.2/§9.3). |

**Nothing else is granted.** A blank or an unspecified row is **not** an approval; it **withholds** and
**requires** the decisions in §7.

## 6. Proposed full retained execution bundle (grounded WP4) — gated, not executed

This enumerates the **whole** retained bundle so nothing is silently granted. Every row is **gated on
the retained decisions (§3) plus that scope's owner write authorization, which is NOT granted.** The
rows marked **SELECTED** are the decisions of §3; rows marked **NOT SELECTED** still require
authorization.

| # | WP4 row | Retained class | Gate/decision | Bundle status |
|---|---|---|---|---|
| 1 | **F01** axis→repo links (axes 5/6) | correction | D1 | **SELECTED (D1: ax5/ax6 `primary`); not executed** |
| 2 | **F02** axis→person links (axes 5/6) | enrichment | WP2 D3/D4 | **NOT SELECTED — REQUIRES authorization** |
| 3 | **F04** problem→repo links (both consultation problems) | correction | D6 | **SELECTED (D6: confirm both); not executed** |
| 4 | **F07 / F09** repository metadata | correction | (proposal) | **NOT SELECTED — REQUIRES authorization** |
| 5 | **F12** plan-step positions `1..4` | correction | (accepted convention) | **NOT SELECTED — REQUIRES authorization** |
| 6 | **F08** axis-4 `currentState` | optional editorial | D2 | **SELECTED (D2: populate + inferred, exact string §3.1); not executed** |
| 7 | **D3** axis-4 `blockerConfidence` | — | D3 | **SELECTED (D3: keep `inferred`, no change)** |
| 8 | **F03 / F04 evidence / F14a** | required finding | D4 | **SELECTED (D4: leave — residuals accepted; no event added)** |
| 9 | **F05 / F10 (existing) / move / retro-link** | blocked | — | **BLOCKED — no path; unchanged** |

The exact payloads ride the packet's §5.2 templates and the WP4 design; **no payload is asserted for an
unsupported path**. The bundle reads **"design accepted, not owner writes"**: the accepted design is a
proposal, and no row runs without the explicit gate + authorization in §7.

## 7. Remaining for a future authorized session (before any retained write)

Even with the retained decisions settled, **the retained write is NOT authorized.** The sequence is
**measure-then-review-then-grant** — the write authorization is the **last** step, **never the first**:

1. **Read-only preflight (measurement first).** Establish **fresh private target identity** and the
   **served build by measurement** at the **exact target org**, capture each axis's fresh
   `expectedVersion`, run the dedup pass, take the served-asset sha256, and confirm the **un-targeted
   stores by their own readback** (WP4 §10; packet §6/§7). *(Done — see the appended retained-scope
   preflight report; **PASS**, no material drift.)*
2. **Exact write-bundle preparation.** Bind the prepared payloads to that preflight (served sha256,
   head, object versions); **no executor and no auto-write script** — a temporary-validity artifact
   that must be **re-measured at the write boundary**, where **any version/served-sha drift STOPS**.
3. **Concrete bundle review.** The reviewer inspects the prepared payload against §6 of this record
   (selected vs not-selected rows, no implicit metadata, verbatim echo, gate compatibility).
4. **Explicit owner write authorization for SCOPE-RETAINED**, bound to the **reviewed** bundle's
   resolved decisions, exact payloads and target version — **not a blanket field** (packet §10).
5. **Post-write verification** (packet §8) as one separately authorized pass.

**No call is made** until steps 1–4 have produced a **measured, reviewed and explicitly granted**
bundle. Step 3 (review) and step 4 (grant) are **separate** and both required; neither the preflight
(step 1) nor the prepared bundle (step 2) is itself authorization.

*Formatting note (presentational, optional).* The payload templates elsewhere in this record use code
blocks/backticks for readability only; the values are the **plain text** they contain (e.g. the §3.1
sentence is the plain 411-character string, not its fenced rendering). Code formatting carries **no
semantic weight**.

## 8. Private target binding (label only here; exact id in the local handoff)

- **Public label:** the **`Public Research Exercise`** organization (the org that hosts the accepted
  retained fixture).
- **Exact private id:** held **only** in the local (git-ignored) operational handoff — **never in this
  public record** (packet §3 D5 / §10; ledger §P #8). It is a **historical bound** carried from the
  existing private handoff, **proposed and not fresh-verified**.
- **WP5 G05:** this is a **proposed target decision only**; a resolution claiming `ownerAuthorization`
  or `liveBinding` is rejected by the gate.
- **No live fixture read authorization exists** for this record, so the binding is **not** re-verified
  here.

## 9. No live verification — claims are decisions, not measurements

- **No fresh read, no live preflight and no write ran** for this record. The retained fixture's
  zero-axis-4-evidence state cited by the packet is the **historical measured** value, not a live
  measurement; it is moot here because no `confirmed` claim is made (§4).
- The D7 compatibility verdict in §4 is a **decision combination** verdict, **not** a live state claim.
- The target id's binding (§8) is **historical/proposed**, not a fresh identity measurement.
- A passing decision record is **not** authorization and is **not** evidence about any live service.

## 10. Boundaries

- **Decisions, not execution.** SCOPE-RETAINED parameter decisions are **settled**; **no write is
  authorized** (retained or baseline). SCOPE-BASELINE stays **unselected/unapproved**.
- **No blanket authorization.** The retained write still needs its **own** owner write authorization
  bound to its resolved payload/version (§7).
- **No silent mutations.** Unselected proposals (F07/F09, F12, F02, and any evidence add) are explicitly
  **not** granted; blocked rows (F05, F10-existing, move, retro-link) stay blocked.
- **Preservation.** The packet's proposal history, the WP0–WP5 acceptance (§O) and the WP1/WP2 records
  are **preserved unchanged**; this record **appends** and rewrites no design constant.
- **Boundary of record.** WP0–WP5 accepted; SCOPE-BASELINE unapproved; **both** scopes' writes
  **NOT authorized**.
