# Retained-amendment (F02 + F07/F09 + F12) — **execution report**: T1 + T2 committed, full postflight PASS, protected stores unchanged

> **Status: EXECUTED under a separate explicit owner write authorization; grant CONSUMED. Review: EXECUTION
> ACCEPTED — DOCUMENTARY QUALIFICATIONS (reviewer verdict quoted verbatim in §9; a documentary-qualified
> acceptance, not a merge grant — see §10).**
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
  - **Served-asset hash method (corrected).** The T1 boundary runner (`ramd-exec-a.mjs`) fetched the asset
    with `await res.text()` and hashed the **decoded text re-encoded to UTF-8** — `sha256(assetText)`, a
    string hash, **not** a raw-`Buffer` hash. Because the asset is valid UTF-8 the re-encoded text is
    `155420` bytes and the digest is `f6e6b8f3…`; the runner also recorded the JavaScript **string character
    count** `155239`, which is why the first check compared `charLen 155239` with `bytes 155420` — a
    reader-unit (UTF-8 multibyte) mismatch, **not** a served-bytes change. A separate standalone probe
    (`ramd-served-probe2.mjs`) hashed **both** the decoded text (`textSha`) **and** the raw response buffer
    (`bufSha`); both equal `f6e6b8f3…` / `155420`. The record does **not** claim the T1 runner hashed the raw
    buffer.
- **Object versions:** ax5 **2**, ax6 **2**, ax4 **2**; topic versions **1**; diagnostics plan version
  **1**. The bundle binds `expectedVersion` on **T1's two axis patches only** (ax5/ax6 = 2); **ax4, both
  topics and the diagnostics plan carry no `expectedVersion`** — their versions were **measured, not bound**
  (topic, repositories and plans are **unguarded** in the reconcile path). (Wording corrected in the execution
  audit closeout; see the findings ledger §X.3.)
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
| each step `updatedAt` | *(pre-T2)* | **advanced** (the only per-row **timestamp** change; the same rows' `position`s also changed, `null → 1..4`) |

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
- **Protected (un-targeted) stores — unchanged** by their own fresh readback (stable **canonical
  projection**, immediate pre-T1 vs post, **not** DB byte identity). The retained immediate-pre and post
  full-projection files are `ramd-exec-pret1-untargeted_org_<id>-mutation-public.json` (immediate pre-T1)
  and `ramd-exec-postflight-untargeted_org_<id>-mutation-public.json` (post-harmonized); the two are
  **byte-identical**, so their canonical digests match: `Layout Demo` (org `…dbc885d6`) `eda52f72…`
  (2/7/3/2), `Nakama E2E Fixture` (org `…b2b1029`) `a75bc4c6…` (2/8/1/0) — **identical before and after**.
  (The earlier *non-harmonized* first-postflight files `ramd-exec-post-untargeted_org_*.json` gave
  `bb2dac2b…`/`4962e129…` from a **different reader projection** — superseded by the harmonized run, **not**
  store drift. The preflight §X counts-only digests `46c7d111…`/`79d49a1f…` are a **third, counts-only
  projection**.)

**Mutation-public snapshot digest (corrected chain — one schema, one algorithm).** All three values are the
**canonical projection hash** `sha256(JSON.stringify(projection))` (compact, UTF-8) over the **same corrected
Phase-A projection** shared by the pre-T1 reader and the harmonized postflight:

- pre-T1 (retained `ramd-exec-pret1-mutation-public.json`):
  `b92180471ea42c24ea52dfc3886e3bd9aa26bb6aad8b939eec4858959d93b64d`
- immediately post-T1 (retained `ramd-exec-postt1-mutation-public.json`):
  `5ab8e3e676e3c4434527a50bab1a97d80b846d24c01c3d740194fc96324320d9`
- final / post-T2 (retained harmonized `ramd-exec-postflight-mutation-public.json`):
  `4fcf2b7a9b77db68ef0837533afe0721424e046e49478863908b51ef38caac0c`

**Algorithm distinction (explicit).** Two different hashes were conflated in an earlier draft of this
chain: `535b5f41…` is the **Phase-B runner's pre-T2 reader digest** (`ramd-exec-b.json` `/pret2`, a
*different projection reader* than Phase A), and `5b965d6a…` is the **raw pretty-printed file-bytes sha256**
of `ramd-exec-postflight-mutation-public.json` (`sha256(file bytes)`), **not** the canonical projection hash
`4fcf2b7a…`. A **raw file hash** (`sha256` of the saved file, written with `JSON.stringify(obj, null, 2)`)
differs from the **canonical projection hash** (`sha256(JSON.stringify(obj))`, compact) whenever the
pretty-printing differs. This record quotes only the canonical projection chain above; the old mixed
`b9218047 / 535b5f41 / 5b965d6a` progression is **superseded** (see the findings ledger §X.4).

## 7. Deployment and served bytes

No reinstall, deploy or restart. The API (`:4399`) and web (`:3003`) were already serving; the served
`ui/app.js` sha256 (`f6e6b8f3…`, `155420` bytes) is **identical before and after** — the write touched the
**fixture/domain store**, not the served build.

**Served-asset hash method.** The `f6e6b8f3…` value is the digest of the **decoded text re-encoded to
UTF-8** (the T1 runner's `sha256(assetText)`); the **raw response buffer** hashes to the same value, as
re-confirmed by the standalone probe `ramd-served-probe2.mjs`, which computes **both** `textSha` (decoded
text) and `bufSha` (raw `Buffer`) and reports them equal. The earlier **pre-write boundary stop** compared
the string **character count** (`155239`) with the **byte count** (`155420`) — a UTF-8 reader-unit bug
corrected in the runner, **not** a served-bytes change (disclosed in the findings ledger §X.3). The record
does **not** claim the T1 runner hashed the raw buffer.

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

Three review verdicts and the owner authorization are recorded, exactly, in chronological order.

**Scope verdict (historical, §X):**

> Verdict: ACCEPT THE PROPOSED SCOPE, WITHHOLD WRITE AUTHORIZATION.

**Concrete-payload verdict (supplied; accepted the payload, withheld write authorization):**

> CONCRETE PAYLOAD ACCEPTED — WRITE AUTHORIZATION WITHHELD.

**Owner write authorization (new, digest-bound; exact words):**

> i agree. proceed

**Execution verdict (supplied; accepts the execution, documentary-qualified):**

> Verdict: EXECUTION ACCEPTED — DOCUMENTARY QUALIFICATIONS.

The concrete-payload verdict **accepted the payload** but **withheld write authorization**; the **owner**
then granted the one-shot write authorization above, which this run **consumed**; the **execution verdict**
then **accepted the execution** subject to **documentary qualifications** — it is an acceptance of the
*execution*, made **offline** on the archived evidence (see the acceptance record
[`2026-10-09-retained-amendment-acceptance-record.md`](2026-10-09-retained-amendment-acceptance-record.md)),
**not** a live re-proof, **not** full-DB-bytes verification, and **not** a merge or "ready" grant. Any
paraphrase of any verdict is a **summary, not a verbatim quote**.

## 10. Execution status

**EXECUTED — ACCEPTED (DOCUMENTARY QUALIFICATIONS).** T1 and T2 committed once each; full postflight PASS;
protected stores unchanged; the execution is **reviewer-accepted** subject to the documentary qualifications
in §9 and the acceptance record. This is **not** a merge and **not** a "ready" state: **PR7 stays draft**.
The acceptance rests on the **archived offline evidence** and makes **no** live re-proof and **no**
full-DB-bytes claim; the owner's one-shot grant is **CONSUMED** and is not reusable. No **merge** is
authorized by any verdict here.

## 11. Boundaries and limitations

- **One-shot, amendment only.** The grant is **CONSUMED**; **SCOPE-BASELINE remains unselected and NOT
  authorized**; no further write (no evidence add, no other-metadata fix, no `record_activity`) is
  authorized by this record.
- **No deployment change, no restart** — none was needed and none was performed.
- **No rollback** exists for a committed transaction; the run stopped cleanly with no partial/ambiguous
  state.
- **Digest hygiene.** The protected-store comparison uses a **stable single-schema canonical projection**
  compared fresh pre-T1 vs post — **not** DB byte identity and **not** the volatile per-read envelope
  digest. The three mutation-public snapshot digests quoted in §6 use one **canonical projection hash**
  (`sha256(JSON.stringify(projection))`); a **raw pretty-file hash** (`sha256(file bytes)`) is a different
  value (see §6 algorithm note).
- **Single-execution serialized.** No concurrent fixture writer was known; the two transactions were
  executed serially in one process each, with the T1 result verified before T2 began.

## 12. Private records (git-ignored)

Exact operational identity, the executable payload, the frozen bundle bytes, the raw request/response
envelopes and the digest-bound grant record are held **local only** in `.hermes/scratch/`
(`ramd-exec-a.mjs`, `ramd-exec-b.mjs`, `ramd-postflight.mjs`, `ramd-exec-*.json`,
`ramd-private-review-package/`). Nothing operational is committed here. The updated offline review archive
`.hermes/scratch/ramd-execution-review-final.zip` (local, git-ignored; with its README and digest manifest,
including the **retained protected-store pre-projections**) lets a reviewer re-derive the claims without
executing anything.

## 13. Acceptance record and corrections

- **Acceptance record:**
  [`2026-10-09-retained-amendment-acceptance-record.md`](2026-10-09-retained-amendment-acceptance-record.md)
  — records the reviewer's **execution** verdict (`Verdict: EXECUTION ACCEPTED — DOCUMENTARY
  QUALIFICATIONS.`) verbatim, with its documentary boundaries.
- **Findings ledger corrections:** appended **§X.4** (retained-amendment execution acceptance + documentary
  digest/algorithm corrections). §A–§W and §X/§X.1/§X.2/§X.3 stand as recorded and are **not** rewritten; the
  digest chain in §X.2 is **corrected by §X.4**, not edited in place.

**PR links.** Branch `docs/retained-metadata-plan-amendment`; draft PR #7
(`https://github.com/ajegorovs/nakama-research-dashboard/pull/7`).
