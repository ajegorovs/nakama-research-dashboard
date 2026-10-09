# Retained-amendment (F02 + F07/F09 + F12) — **planning scope + read-only preflight + prepared bundle**: PASS, no material drift, no write authorized

> **Status: PLANNING + READ-ONLY PREFLIGHT — PASS. NO WRITE.** This record covers the **bounded**
> retained-amendment rows that the retained decision record left **unselected** — **F02** (axis→person
> links on axes 5/6), **F07/F09** (repository `url`/`description`/`defaultBranch`) and **F12** (plan-step
> positions `1..4`) — as a **planning scope** and a **fresh, live, read-only preflight** at the exact
> target org, plus the **preparation** (not execution) of the amendment write bundle.
>
> **No fixture/domain write was performed or authorized.** `reconcile_topic`/`record_activity` were
> **not** called; there is **no inference, no new research, no service/deploy/restart, no product/UI/
> harness/source change, and no merge**. The **F01/F04 and F08 writes are already done** (WP-G §U) and are
> **not** re-run here. The **concrete bundle review** and a **separate explicit owner write
> authorization** remain the gate before any write (§10).
>
> **Measured:** `2026-10-09T` at head `64f63934e025d8c8c3f3fabf4af60c82d878d75c` (branch
> `docs/retained-metadata-plan-amendment`).
>
> **Public-safe.** This record carries **public labels and sanitized ids only** — no live org id, no
> axis/person/problem id, no host name or host path. The **exact operational ids and the executable
> payload** live **only** in the local (git-ignored) `.hermes/scratch/` bundle, bound to this preflight by
> digest.

---

## 1. Scope and authorization

| Item | Value |
|---|---|
| Scope | **SCOPE-RETAINED-AMENDMENT** — F02 + F07/F09 + F12 (read-only preflight + write-bundle preparation) |
| Write action | **NOT authorized, NOT executed** |
| Authorization | the dispatching brief authorized **planning scope + read-only preflight** only |
| Prior writes | **F01/F04 (WP-G T1) and F08 (WP-G T2) already executed**; their grant is **CONSUMED** |
| Gate that remains | **concrete bundle review** + **separate explicit owner write authorization** |
| Transactions prepared | 2 intended (`reconcile_topic`), grouped one per topic; **neither run** |

The three rows are **design-accepted proposals, not owner-selected decisions** — see §9. This preflight
**measures whether the design still binds** and **prepares** — but does not run — the payloads.

## 2. Method — the read-only transport (no agent turn, no LLM)

- Log in (`POST /v1/auth/login`), then **explicitly select** the target active org
  (`POST /v1/auth/active-org`), asserting the echoed `activeOrgId`.
- Read with **explicit `x-org-id` on every request** (never `orgs[0]`): `get_overview`, a topic-wide
  `get_topic`, a scoped `get_topic` per axis, and `search_dashboard`.
- Take the **served asset the browser actually fetches** at the target org and hash it.
- Confirm the **fresh public GitHub metadata** (`html_url`, `default_branch`) for the three source
  repositories — bounded **metadata verification only**, no research re-run.
- Only the **three read actions** are invoked. Credentials are read in-process from the mode-600 env file
  and **never printed**; the raw envelopes are kept **local** (git-ignored).

## 3. Target identity (public label only)

- **Label:** the **`Public Research Exercise`** organization.
- **Exact id:** held in the local handoff only; **fresh-verified** and matched by id **and** name, then
  **explicitly selected** as the session's active org (echo asserted equal to the target).
- **Never `orgs[0]`:** the account carries two other stores; neither was read as the target.

## 4. Served identity — the byte the browser receives at the exact target org

| Field | Measured value |
|---|---|
| Asset route org == target | **yes** (the page fetched `/v1/plugins/ui/<target>/research-dashboard/…`) |
| `ui/app.js` **sha256** | `f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548` |
| bytes served (Buffer) | `155420` |
| served release (target org) | `0.2.0+dev.a5f76a608db2` |
| served instance revision | `17` |
| equals this repo's `ui/app.js` | **yes — byte-equal** |

This is the **U12 full-text clamp-release build** (the deployment recorded in
`docs/reviews/2026-10-09-u12-served-measurement-evidence.json`): `f6e6b8f3…`, `155420` bytes, release
`0.2.0+dev.a5f76a608db2`, revision `17` — **re-confirmed by measurement**, not assumed. The
served-build guard remains **not org-aware**; the **org-aware page fetch above** is the build of record.

## 5. Measured state at the target (sanitized ids) — the before/after for the three rows

**Counts (fresh `get_overview`):** `topics: 2`, `axes: 6`, `repositories: 3`, `people: 1`. **Events: 8.**

### 5.1 Already-applied writes (confirmed present, **not** re-sent)

| Object | Expected (WP-G §U) | Measured now |
|---|---|---|
| ax5 repository link | `[dashboard `primary`]` | **present** — `dashboard `primary`` |
| ax6 repository link | `[dashboard `primary`]` | **present** — `dashboard `primary`` |
| both consultation problem→repo sets | `[dashboard]` | **present** — `[dashboard]` |
| ax4 `currentState` | the exact **411-char** §3.1 string, `inferred` | **present** — exact string, `currentStateConfidence: inferred` |
| ax4 `blockerConfidence` | `inferred` (ratified) | **`inferred`** (unchanged) |
| ax4 evidence | `0` | **`[]`** |

### 5.2 The amendment rows (the deltas this bundle would write)

| Row | Object (public label) | BEFORE (measured) | AFTER (proposed) |
|---|---|---|---|
| **F02** | ax5 *Research dashboard and focused retrieval* → people | **`[]`** | link the fixture's one person (githubLogin `ajegorovs`) |
| **F02** | ax6 *Agent consultation and automation evidence* → people | **`[]`** | link the same person |
| **F07/F09** | repository `ajegorovs/nakama-research-dashboard` | `url:'' desc:'' defaultBranch:''` | `url https://github.com/ajegorovs/nakama-research-dashboard`, `defaultBranch main`, description = **pinned README string** |
| **F07/F09** | repository `ajegorovs/udv-echo-process` | `url:'' desc:'' defaultBranch:''` | `url https://github.com/ajegorovs/udv-echo-process`, `defaultBranch master`, description = **pinned README string** |
| **F07/F09** | repository `ajegorovs/Grablink-Full-sequence-acquisition` | `url:'' desc:'' defaultBranch:''` | `url https://github.com/ajegorovs/Grablink-Full-sequence-acquisition`, `defaultBranch master`, description = **pinned README string** |
| **F12** | diagnostics plan (axis 4) step `position`s | **all `null`** (4 steps) | **`1,2,3,4`** in the authored order (same `stepId`s, verbatim titles) |

Topic→repository relationships to be **preserved verbatim** (not re-asserted as a blanket value): infra →
`dashboard `primary``; experimental → `udv `primary``, `grablink `supporting``.

**Versions read fresh:** ax5 `2`, ax6 `2`, ax4 `2`, topic versions `1`; diagnostics **plan** version `1`.

## 6. Fresh public GitHub metadata (bounded verification)

The `description` field is the repository's **own pinned README opening paragraph** (the WP3/WP4
approved, normalized, byte-equal string — words preserved exactly), **not** GitHub's mutable `about`.
The `defaultBranch` is the repository's **actual GitHub `default_branch` as-of-read**:

| Repository | GitHub `html_url` | GitHub `default_branch` (as-of-read) | GitHub `about` (mutable, recorded only) |
|---|---|---|---|
| `ajegorovs/nakama-research-dashboard` | `https://github.com/ajegorovs/nakama-research-dashboard` | **`main`** | differs from the pinned README — **not used** |
| `ajegorovs/udv-echo-process` | `https://github.com/ajegorovs/udv-echo-process` | **`master`** | absent (null) |
| `ajegorovs/Grablink-Full-sequence-acquisition` | `https://github.com/ajegorovs/Grablink-Full-sequence-acquisition` | **`master`** | differs from the pinned README — **not used** |

The as-of-read values **match the accepted design** (`main`/`master`/`master`). No value is back-inferred
and no field is invented; there are **no editorial word choices** — every `description` is the approved
pinned-README source string.

## 7. Drift verdict — **NO material drift**

Every expectation matched: the only differences from the WP-G baseline are the **expected** ones.

- **Expected drift (only):** axes **5/6 and axis 4** versions `1 → 2` (the WP-G T1/T2 writes) and the
  **U12 served build** (`0.2.0+dev.78af5cbb87b4` rev `9` → `0.2.0+dev.a5f76a608db2` rev `17`). Both
  **verified by measurement**, not assumed. Axes 5/6 now carry their `primary` link; axis 4 now carries
  the F08 string.
- **No unexpected drift:** axes 1–4 links/people, the diagnostics problem link, the null step positions,
  the empty repo metadata, the empty ax5/6 people, the topic relationships, the **8 events** and the
  `people`/`repositories` counts are all **exactly** as the accepted design expects. Nothing was absorbed.

Because the drift is **only** the expected prior-write + deployment, the preflight **does not stop** and
the bundle may be **prepared** (still **not executed**).

## 8. Protected (un-targeted) stores — own-readback baseline

Both other stores were read **explicitly** (`x-org-id` per store) and baselined **by their own readback**
for a later post-write comparison — **not** by DB byte identity:

| Store (label) | counts (topics/axes/repos/people) | readback digest |
|---|---|---|
| Layout Demo | 2 / 7 / 3 / 2 | `46c7d111…` |
| Nakama E2E Fixture | 2 / 8 / 1 / 0 | `79d49a1f…` |

No reinstall, deploy or restart was performed; the API (`:4399`) and web (`:3003`) were already serving.

## 9. Bundle proposal (structure; exact ids private) — **design-accepted, not owner-selected**

Two `reconcile_topic` transactions were **prepared** (not run), grouped **one per topic** (the minimum
grouping):

```
T1  reconcile_topic({ topicId: <T-infra>,
      repositories: [ { fullName: <dashboard>, url:<public>, description:<pinned README>,
                        defaultBranch:"main", relationship:"primary" } ],          // F07/F09
      axes: [ { id:<ax5>, expectedVersion:2, people:[ { displayName:<person>, githubLogin:"ajegorovs" } ] },
              { id:<ax6>, expectedVersion:2, people:[ { displayName:<person>, githubLogin:"ajegorovs" } ] } ] }) // F02

T2  reconcile_topic({ topicId: <T-exp>,
      repositories: [ { fullName: <udv>, url:<public>, description:<pinned README>,
                        defaultBranch:"master", relationship:"primary" },
                      { fullName: <grablink>, url:<public>, description:<pinned README>,
                        defaultBranch:"master", relationship:"supporting" } ],     // F07/F09
      plans: [ { planId:<diag plan>, axisId:<ax4>, summary:<verbatim>,
                 steps:[ { stepId:<s1>, title:<verbatim>, position:1 }, … { stepId:<s4>, position:4 } ] } ] }) // F12
```

- **Only** the amendment rows: F02 people on ax5/6 (T1); F07/F09 metadata for Dashboard (T1) and UDV +
  Grablink (T2); F12 positions on the diagnostics plan (T2). **Excluded:** any re-send of F01/F04
  (already written), any re-send of F08 (already written), any evidence add (D4 = leave), and every
  BLOCKED row (F05/F10-existing/move/retro-link).
- **No accidental topic/repository primary demotion.** The topic-level `repositories[]` write is coupled
  to a link write that defaults to `supporting`; the payload carries the **already-stored relationship
  verbatim** (infra → dashboard `primary`; experimental → udv `primary`, grablink `supporting`). No
  blanket `primary`, no demotion.
- **No implicit metadata / no word rewrite.** Repository items carry only `fullName/url/description/
  defaultBranch/relationship`; descriptions are the **approved pinned-README strings** (byte-equal, no
  editorial choice); the plan `summary` and step `title`s are **verbatim echoes** (an unchanged echo does
  not bump the plan version, and no step id changes).
- **No executor.** No auto-write script is produced. The exact ids, the executable payload and the bundle
  digest are held **local** (`.hermes/scratch/ramd-retained-amendment-bundle.json`):
  **bundle digest** `ba1b9050db18f3bd9baea630ab606e74a8e3bc80ca3bd4f2d10533a9a7ae27ca`;
  **payload digests** T1 `23a4c01d8c42a4d5605a50b887c7cd7b29ef0e7287299561f20ae6e229a1432a`,
  T2 `31241657e6386c581552f6a7ce633d4e093f3d4f4248405ffeb9240489866778` — each **re-derived and
  matched** (no edit, no auto-rederive).
- **Static schema validation:** both payloads **PASSED** a static structural validation against the
  manifest's `reconcile_topic` `inputSchema` (types, enums, `additionalProperties:false`, `required`,
  `maxLength`, `maxItems`, `minimum`) — **0 errors**. No live/store call was made.
- **Temporary validity.** The bundle is bound to this preflight (served sha256, release, head, object
  versions). At the write boundary it must be **re-measured**; **any served-sha or `expectedVersion`
  drift STOPS** the write and requires a fresh preflight.

**Reviewed-row status (what the owner still must decide).** The blank/unspecified rows below are **NOT
approvals** — each **withholds** and requires the owner's explicit grant:

| Row | Class (WP4) | Status | What a future grant must bind |
|---|---|---|---|
| **F02** axis→person on ax5/6 | enrichment | **design-accepted proposal — NOT owner-selected** | the two axis ids + `expectedVersion` + the person (`githubLogin`) |
| **F07/F09** repository metadata | correction | **design-accepted proposal — NOT owner-selected** | the three `fullName`s + the exact approved `url`/`description`/`defaultBranch` + the preserved relationship |
| **F12** plan-step positions `1..4` | correction | **design-accepted convention — NOT a mutation approval** | the plan/step ids + the base `1` in the authored order |

No role/persona is invented: the axis→person link uses the **already-stored** person (matched by
`github_login`); no `primary`/`supporting` choice is invented for the topic links (the **stored** values
are carried).

## 10. Remaining gate

1. **Concrete bundle review** of the prepared payloads against the decision record and this §9.
2. **Separate explicit owner write authorization** for the amendment rows, bound to the resolved payloads
   and versions.

Until both are granted, **no write runs**. This preflight is **not** authorization; the **WP-G grant is
consumed** and is not reusable.

## 11. Boundaries

- **Read-only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no inference, no new
  research, no service/deploy/restart, no product/UI/harness change, no merge.
- **No retrospective write approval.** Nothing in this record approves any earlier or future write.
- **Sanitized.** Exact operational ids (org/axis/person/problem/plan/step) and the executable payload are
  local-only; this record carries public labels, sanitized id references and digests.
- **Proposed, not authorized.** The bundle is prepared, not granted; the rows are design-accepted, not
  owner-selected.
