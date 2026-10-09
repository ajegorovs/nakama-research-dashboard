# Retained-amendment (F02 + F07/F09 + F12) — **execution report**: T1 + T2 committed, full postflight PASS, protected stores unchanged

> **Status: EXECUTED under a separate explicit owner write authorization; grant CONSUMED. Review: PENDING.**
> This record reports the live execution of the **two reviewed retained-amendment `reconcile_topic`
> transactions** (T1 + T2) from the digest-bound amendment bundle, plus the **fresh boundary preflight**
> and the **full post-write verification**. It is the **second live write** of the authoring path (the first
> was the WP-G retained scope). Companion machine evidence:
> [`2026-10-09-retained-amendment-execution-evidence.json`](2026-10-09-retained-amendment-execution-evidence.json).
>
> **Authorization.** The concrete payload was **accepted with write authorization withheld** by the reviewer
> (verdict quoted verbatim in §9). The **owner** then granted a **new, digest-bound, one-shot write
> authorization** in the exact words **"i agree. proceed"**. That grant is now **CONSUMED**: it authorized
> **T1 once and T2 once** for the amendment rows only, and authorizes no further mutation.
>
> **Public-safe.** This record carries **public labels, sanitized id references and digests only** — no live
> org id, topic/axis/person/problem/plan/step id, invocation id, host name or host path. Exact operational
> identity, the executable payload and the raw request/response envelopes live **only** in the local
> (git-ignored) `.hermes/scratch/` records.

---

## 1. Scope and what ran

| Item | Value |
|---|---|
| Scope | **SCOPE-RETAINED-AMENDMENT** — F02 + F07/F09 + F12 |
| Transactions | **2** — T1 (infrastructure topic), T2 (experimental topic, diagnostics plan on axis 4) |
| Action | `reconcile_topic` — **once each** |
| Owner write authorization | **granted** ("i agree. proceed"), digest-bound, narrow → **CONSUMED** |
| Deployment | **none** — no reinstall/deploy/restart; same served bytes before and after |
| Product/UI/harness/source change | **none** |
| Merge | **none** — PR7 stays **draft**, status corrected to *executed, pending review* |

The executed payloads are exactly the reviewed amendment bundle's two transactions: **T1** = F02
(axis→person links on ax5/ax6, matched to the **already-stored** person) + F07/F09 (dashboard repository
`url`/`description`/`defaultBranch`, topic `relationship` **preserved**); **T2** = F07/F09 (UDV + Grablink
metadata, relationships preserved) + F12 (diagnostics plan-step `position`s `1..4` in the authored order).
The already-applied F01/F04 (WP-G T1) and F08 (WP-G T2) writes were **not** re-run.

## 2. Bundle verification (before any call)

The frozen bundle was re-hashed with the **canonical algorithm** (`sha256(JSON.stringify(bundle minus
{bundleDigest, payloadDigests}))`). Every recorded digest matched, with **no edit, no regeneration and no
auto-rederive**:

| Predicate | Value | Match |
|---|---|---|
| bundle sha256 | `ba1b9050db18f3bd9baea630ab606e74a8e3bc80ca3bd4f2d10533a9a7ae27ca` | **yes** |
| T1 payload sha256 | `23a4c01d8c42a4d5605a50b887c7cd7b29ef0e7287299561f20ae6e229a1432a` | **yes** |
| T2 payload sha256 | `31241657e6386c581552f6a7ce633d4e093f3d4f4248405ffeb9240489866778` | **yes** |
| frozen file bytes sha256 | `06d8a6190459c10166fdc39609fbb02dbba5264b9034def42b4356db5cc0f66a` | **yes** |

The re-derived bundle digest equals the digest recorded in the preflight evidence and bound by the owner
grant. The frozen payload bytes were **retained, not regenerated**.

## 3. Boundary (fresh, immediately pre-T1) — **PASS, no material drift**

- **Target identity:** the `Public Research Exercise` org, resolved by **id AND name** from a fresh org list
  and **explicitly selected** as the session active org (echo asserted equal to the target) — never
  `orgs[0]`. The account's two other stores were never read as the target.
- **Served identity (org-aware, browser-actually-served):** `ui/app.js` sha256
  `f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548`, **155420** bytes, **byte-equal** to
  the repo's `ui/app.js`; the target org serves release **`0.2.0+dev.a5f76a608db2`** revision **`17`** (the
  U12 full-text clamp-release build). **No deployment change** (same before and after).
- **Object versions:** ax5 **2**, ax6 **2**, ax4 **2**; topic versions **1**; diagnostics plan version **1**
  — all matching the bundle's `expectedVersion`.
- **Amendment gaps present (the deltas this run writes):** ax5/ax6 people **`[]`** (F02); all three
  repositories `url:'' description:'' defaultBranch:''` (F07/F09); the diagnostics plan's **four** step
  positions **all `null`** (F12, same `stepId`s and verbatim titles).
- **Already-applied (not re-sent):** ax5/ax6 carry `[dashboard `primary`]` (F01); both consultation problem
  repo sets present; ax4 `currentState` = the exact **411-char** string, `currentStateConfidence: inferred`,
  `blockerConfidence: inferred`, evidence **`[]`** (F08).
- **Counts / events:** `2 topics / 6 axes / 3 repositories / 1 person`; **8 events**.
- **Gates:** boundary checks **all PASS** (served sha + bytes + versions + gaps + preserved relationships +
  protected-store baselines) → **no material drift** → the session proceeded.

## 4. T1 — infrastructure topic (F02 person links + F07/F09 dashboard metadata)

- `reconcile_topic` **once**. HTTP **200** · `result.ok` **true**.
- **Delta (verified by canonical readback):**

| Object | Before | After |
|---|---|---|
| ax5 → people | `[]` | the fixture's one person (githubLogin `ajegorovs`) |
| ax6 → people | `[]` | the same person |
| ax5 version | `2` | `3` |
| ax6 version | `2` | `3` |
| dashboard repository `url` | `''` | `https://github.com/ajegorovs/nakama-research-dashboard` |
| dashboard repository `defaultBranch` | `''` | `main` |
| dashboard repository `description` | `''` | the approved **pinned README** string (byte-equal) |
| dashboard topic `relationship` | `primary` | `primary` (**preserved**) |

- **Changed:** ax5/ax6 gained the person link; both axis versions advanced **2 → 3** (the `reconcile_topic`
  axis patch bumps the axis version unconditionally — see §8); the dashboard repository metadata was set.
- **Unchanged:** ax5/ax6 **repository links** (still `[dashboard `primary`]` — the payload's axis entries
  carried `people` only, so axis→repo links were untouched); counts `2/6/3/1`; **8 events**; axes 1–4
  links/people/versions; topic versions (`1`); topic→repo relationships; the diagnostics plan; ax4 state;
  people; topic `lastActivityAt`.

## 5. T2 — experimental topic (F07/F09 UDV + Grablink metadata, F12 plan positions)

- **Fresh T2 prerequisite (re-read after T1):** experimental topic version **1**; topic→repo relationships
  `udv `primary``, `grablink `supporting``; UDV + Grablink metadata still blank; diagnostics plan version
  **1** with summary byte-echoing the payload; the four step ids/titles matching the payload; the four
  positions still `null`. Basis matched the bundle → proceeded.
- `reconcile_topic` **once**. HTTP **200** · `result.ok` **true**.
- **Delta (verified by canonical readback):**

| Object | Before | After |
|---|---|---|
| udv repository `url` / `defaultBranch` | `''` / `''` | `https://github.com/ajegorovs/udv-echo-process` / `master` |
| udv repository `description` | `''` | the approved **pinned README** string (byte-equal) |
| grablink repository `url` / `defaultBranch` | `''` / `''` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition` / `master` |
| grablink repository `description` | `''` | the approved **pinned README** string (byte-equal) |
| plan-step `position`s (4) | `null, null, null, null` | `1, 2, 3, 4` (authored order) |
| plan version | `1` | `1` (**unchanged** — verbatim summary echo) |
| plan `updatedAt` | *(pre-T2)* | **unchanged** |
| each step `updatedAt` | *(pre-T2)* | **advanced** (the only per-row change) |

- **Changed:** UDV + Grablink metadata set; the four step positions written `1..4` in the authored order
  (same `stepId`s, verbatim titles, state still `pending`); each step's `updatedAt` advanced — the only
  timestamp change.
- **Unchanged:** the plan **version** (verbatim summary echo does not bump it); the plan `updatedAt`;
  `stepId`s, titles, states and `createdAt`s; counts `2/6/3/1`; **8 events**; ax5/ax6 (people + version `3`,
  from T1); ax4 (version `2`, 411-char `currentState`, `inferred` confidences, evidence `[]`); axes 1–4
  links/people/versions; topic versions; topic→repo relationships (`udv `primary``, `grablink
  `supporting``); problems; people; topic `lastActivityAt`.

## 6. Post-write verification — **FULL POSTFLIGHT PASS**

A single-schema readback (identical projection to the pre-T1 snapshot, so target and protected projections
are byte-comparable) — **29/29 checks PASS**:

- counts `2 topics / 6 axes / 3 repositories / 1 person` and **8 events** — **unchanged**;
- F02/F07/F09/F12 deltas all present (§4, §5); ax5/ax6 people + version `3`; dashboard + UDV + Grablink
  metadata set; four step positions `1..4`, titles/states/`createdAt`s unchanged, step `updatedAt`s
  advanced;
- axes 1–4 links/people/versions unchanged; ax4 version/`currentState`/confidences/evidence unchanged;
  topic versions unchanged; topic→repo relationships preserved (`dashboard `primary`` / `udv `primary``,
  `grablink `supporting``); no new activities; no new problems; `lastActivityAt` unchanged; consultation
  problem repo sets unchanged;
- **Protected (un-targeted) stores — unchanged** by their own fresh readback (stable projection, immediate
  pre-T1 vs post, **not** DB byte identity): `Layout Demo` digest `eda52f72…` (2/7/3/2), `Nakama E2E
  Fixture` digest `a75bc4c6…` (2/8/1/0) — **identical before and after**.

**Mutation-public snapshot digest:** `b9218047…` (pre-T1) → `535b5f41…` (post-T1) → `5b965d6a…` (post-T2).

## 7. Deployment and served bytes

No reinstall, deploy or restart. The API (`:4399`) and web (`:3003`) were already serving; the served
`ui/app.js` sha256 (`f6e6b8f3…`, `155420` bytes) is **identical before and after** — the write touched the
**fixture/domain store**, not the served build.

## 8. Store-contract findings (measured, not assumed)

- **Axis guard is version-enforced.** The axis patch applies `expectedVersion` (the payload sent `2` on
  ax5/ax6, matching live) — and it **bumps the axis version unconditionally**, so ax5/ax6 advanced `2 → 3`
  even though only the person link changed.
- **Repositories, plans and steps are unguarded in the reconcile path** (as recorded in the preflight
  review receipt): the payload carries the **stored** relationships verbatim (no `primary` demotion), and
  the plan summary is a **verbatim echo** so the plan version stays `1`.
- **`updatePlanStep` looks a step up by `id` with no enclosing plan/axis/topic ownership check** — the
  payload used the four correct diagnostics-plan step ids (confirmed against the fresh snapshot before the
  write), but the store cannot itself prove that ownership.

## 9. Reviewer verdicts (verbatim) and the owner grant

Two review verdicts and the owner authorization are recorded, exactly, in chronological order.

**Scope verdict (historical, §X):**

> Verdict: ACCEPT THE PROPOSED SCOPE, WITHHOLD WRITE AUTHORIZATION.

**Concrete-payload verdict (supplied; accepted the payload, withheld write authorization):**

> CONCRETE PAYLOAD ACCEPTED — WRITE AUTHORIZATION WITHHELD.

**Owner write authorization (new, digest-bound; exact words):**

> i agree. proceed

The concrete-payload verdict **accepted the payload** but **withheld write authorization**; the **owner**
then granted the one-shot write authorization above, which this run **consumed**. Any paraphrase of either
verdict is a **summary, not a verbatim quote**.

## 10. Execution status

**EXECUTED — PENDING REVIEW.** T1 and T2 committed once each; full postflight PASS; protected stores
unchanged. This is **not** a merge and **not** a "ready" state: **PR7 stays draft**, its status corrected to
*executed, pending review*. **No reviewer has accepted the execution** (no such verdict is invented here);
the owner's one-shot grant is **CONSUMED** and is not reusable.

## 11. Boundaries and limitations

- **One-shot, amendment only.** The grant is **CONSUMED**; **SCOPE-BASELINE remains unselected and NOT
  authorized**; no further write (no evidence add, no other-metadata fix, no `record_activity`) is
  authorized by this record.
- **No deployment change, no restart** — none was needed and none was performed.
- **No rollback** exists for a committed transaction; the run stopped cleanly with no partial/ambiguous
  state.
- **Digest hygiene.** The protected-store comparison uses a **stable single-schema projection** compared
  fresh pre-T1 vs post — **not** DB byte identity and **not** the volatile per-read envelope digest.
- **Single-execution serialized.** No concurrent fixture writer was known; the two transactions were
  executed serially in one process each, with the T1 result verified before T2 began.

## 12. Private records (git-ignored)

Exact operational identity, the executable payload, the frozen bundle bytes, the raw request/response
envelopes and the digest-bound grant record are held **local only** in `.hermes/scratch/`
(`ramd-exec-a.mjs`, `ramd-exec-b.mjs`, `ramd-postflight.mjs`, `ramd-exec-*.json`,
`ramd-private-review-package/`). Nothing operational is committed here.

**PR links.** Branch `docs/retained-metadata-plan-amendment`; draft PR #7
(`https://github.com/ajegorovs/nakama-research-dashboard/pull/7`).
