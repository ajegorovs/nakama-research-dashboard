# WP-G — retained-scope **read-only preflight** report: PASS, no material drift, no write authorized

> **Status: READ-ONLY PREFLIGHT — PASS.** This record reports a **fresh, live, read-only
> measurement** of the retained fixture at the exact target org, taken under the user's explicit
> read-only authorization. **No fixture/domain write was performed or authorized:** the two intended
> `reconcile_topic` transactions are **NOT executed**, `reconcile_topic`/`record_activity` are **not**
> called, there is **no inference, no service/deploy/restart, and no product/UI/harness change**. The
> **concrete bundle review** and a **separate explicit owner write authorization** remain the gate
> before any write (report §7 of the decision record; corrected below).
>
> **Measured:** `2026-10-08T18:42:58Z` at head `9f0755299a88299d15a816e6545455211eb7f65c`.
>
> **Public-safe.** This record carries **public labels and sanitized ids only** — no live org id,
> no hostname (loopback URLs identify nobody and stay verbatim). The **exact operational ids and the
> executable payload** live **only** in the local (git-ignored) operational handoff and bundle
> (`.hermes/scratch/`), bound to this preflight by digest.

---

## 1. Scope and authorization

| Item | Value |
|---|---|
| Scope | **SCOPE-RETAINED**, read-only preflight + write-bundle preparation |
| Write action | **NOT authorized, NOT executed** |
| Authorization | user's explicit **read-only** authorization (measurement + bundle prep only) |
| Gate that remains | **concrete bundle review** + **separate explicit owner write authorization** |
| Transactions prepared | 2 intended (`reconcile_topic`); **neither run** |

The settled SCOPE-RETAINED decisions (D1–D6) are taken as fixed from the decision record; this
preflight **measures whether they still bind** and **prepares** — but does not run — the payloads.

## 2. Method — the read-only transport (no agent turn, no LLM)

- Log in (`POST /v1/auth/login`), then **explicitly select** the target active org
  (`POST /v1/auth/active-org`), asserting the echoed `activeOrgId`.
- Read with **explicit `x-org-id` on every request** (never `orgs[0]`): `get_overview`, a topic-wide
  `get_topic`, a scoped `get_topic` per axis, and `search_dashboard`.
- Take the **served asset the browser actually fetches** and hash it; run the served-build guard.
- Only the **three read actions** are invoked. No write action is called. Credentials are read
  in-process from the mode-600 env file and **never printed**; the raw envelopes are kept **local**
  (git-ignored).

## 3. Target identity (public label only)

- **Label:** the **`Public Research Exercise`** organization.
- **Exact id:** held in the local handoff only; **exact id is fresh-verified**, not the historical
  proposed bound — resolved by a **fresh** read to the account's org list and matched by id **and**
  name, then **explicitly selected** as the session's active org (echo asserted equal to the target).
- **Never `orgs[0]`:** the account carries two other stores; neither was read as the target.

## 4. Served identity — the byte the browser receives at the exact target org

| Field | Measured value |
|---|---|
| Asset route org == target | **yes** (the page fetched `/v1/plugins/ui/<target>/research-dashboard/…`) |
| `ui/app.js` **sha256** | `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc` |
| bytes served | `154417` |
| served release (target org) | `0.2.0+dev.78af5cbb87b4` |
| served instance revision | `9` |
| equals this repo's `ui/app.js` | **yes — byte-equal** |

**Org-awareness finding (do not trust the guard's default).** The served-build guard is **not
org-aware**; on a fresh login (no explicit selection) it measured a **different store** —
release `0.2.0+dev.164ccaafbca4`, revision `20`. The **same bytes** are served, and the **authoritative
served identity is the org-aware page fetch above** (release `…78af5cbb87b4`, revision `9`, sha256
`41e61ef5…`). The guard's non-org-aware pair is recorded here only to document the trap and is **not
used** as the build of record.

## 5. Measured state at the target (sanitized ids)

**Counts (fresh `get_overview`):** `topics: 2`, `axes: 6`, `repositories: 3`, `people: 1`.

| Axis (public label) | Repository link now | Expected (settled) |
|---|---|---|
| ax1 UDV acquisition automation | `udv-echo-process` `supporting` | untouched (axes 1–4) |
| ax2 UDV sparse-analysis validation | `udv-echo-process` `supporting` | untouched |
| ax3 High-rate optical acquisition | `Grablink-…` `supporting` | untouched |
| ax4 Grablink diagnostics and sustained-rate validation | `Grablink-…` `supporting` | untouched |
| **ax5 Research dashboard and focused retrieval** | **absent** | **`primary` (D1) — add** |
| **ax6 Agent consultation and automation evidence** | **absent** | **`primary` (D1) — add** |

| Field | Measured | Expected (settled) |
|---|---|---|
| P-C1 / P-C2 (both ax6 consultation problems) repository sets | **`[]` (empty)** | **`[nakama-research-dashboard]` (D6) — add** |
| P-D1 (ax4 diagnostics problem) repository set | `[Grablink-…]` | unchanged |
| ax4 `currentState` | **`""` (blank)** | populate (D2) with the report §3.1 string |
| ax4 `currentStateConfidence` | `null` | `inferred` (D2) |
| ax4 `blockerConfidence` | **`inferred`** | keep `inferred` (D3, ratified) |
| ax4 evidence | **`[]` (zero)** | leave (D4) |
| diagnostics plan step **positions** | **all `null`** (4 steps) | `1..4` (F12) — **NOT selected** |
| topic / axis **versions** | **all `1`** | fresh `expectedVersion` = `1` |

## 6. Drift verdict — **NO material drift**

Every expectation above matched the accepted design: the axes-5/6 gap and the two empty consultation
problem sets are **exactly** the F01/F04 corrections in scope; the axes 1–4 links, the diagnostics
problem link, the ax4 blank+`inferred`, the null step positions and the zero ax4 evidence all match
their **expected historical** values. There is **no legitimate-extra link set** beyond the four
expected axes 1–4 links, so **nothing was absorbed** (no un-targeted data folded into the scope).
Because there is **no material drift**, the preflight **does not stop** and the bundle may be
**prepared** (still **not executed**).

## 7. Protected (un-targeted) stores — own-readback baseline

Both other stores were read **explicitly** (`x-org-id` per store) and are baselined **by their own
readback** for the later post-write comparison — **not** by DB byte identity:

| Store (label) | counts (topics/axes/repos/people) | readback digest |
|---|---|---|
| Layout Demo | 2 / 7 / 3 / 2 | `34e54b10…` |
| Nakama E2E Fixture | 2 / 8 / 1 / 0 | `82377e5a…` |

No reinstall, deploy or restart was performed; the API (`:4399`) and web (`:3003`) were already
serving.

## 8. Checks

**22 / 22 checks PASS**, including the org-explicit target resolution, the axes-5/6 absence, the
empty consultation sets, the ax4 blank/`inferred`, the zero ax4 evidence, the version capture, the
served/ local byte equality, the axes-1–4 role preservation and the two protected-store baselines.
`materialDriftDetected: false`. The full check list and the raw envelopes are held **local**
(`.hermes/scratch/wpg-preflight-checks.json`, `wpg-raw-*.json`);
**mutation-public snapshot digest** `a99fd2f3a583a1efc7ff5931f4ed4789eda57851a273f83a5ca63e51383f0312`.

## 9. Bundle proposal (structure; exact ids private)

Two intended `reconcile_topic` transactions were **prepared** (not run), bound to this preflight:

```
T1  reconcile_topic({ topicId: <T-infra>,
      axes: [ { id: <ax5>, expectedVersion: 1, repositories: [ { fullName: <dashboard>, relationship: "primary" } ] },
              { id: <ax6>, expectedVersion: 1, repositories: [ { fullName: <dashboard>, relationship: "primary" } ] } ],
      problems: [ { problemId: <P-C1>, statement: <verbatim echo>, repositoryFullNames: [ <dashboard> ] },
                  { problemId: <P-C2>, statement: <verbatim echo>, repositoryFullNames: [ <dashboard> ] } ] })

T2  reconcile_topic({ topicId: <T-exp>,
      axes: [ { id: <ax4>, expectedVersion: 1,
                currentState: <report §3.1 exact 411-char string>, currentStateConfidence: "inferred" } ] })
```

- **Only** the selected rows: axis 5/6 `primary` links (D1) + both consultation problem→repo sets
  (D6) in T1; the ax4 `currentState` (D2, `inferred`) in T2. **Excluded:** F02 (axis→person),
  F07/F09 (repo metadata), F12 (positions `1..4`), and any evidence add (D4 = leave).
- **No implicit metadata.** The axis-link payload carries **only** `{fullName, relationship}` — the
  store keeps the existing `url`/`description`/`defaultBranch` when they are omitted, so **no repo
  metadata is written**. The problem write **replaces** the `problem_repositories` set; the statements
  are **verbatim echoes** (no text rewrite). Topic-level `primary` links are preserved.
- **No executor.** No auto-write script is produced. The exact ids, the executable payload and the
  bundle digest are held **local** (`.hermes/scratch/wpg-retained-bundle.json`).
- **Temporary validity.** The bundle is bound to this preflight (served sha256, release, head, object
  versions). At the write boundary it must be **re-measured**; **any served-sha or `expectedVersion`
  drift STOPS the write** and requires a fresh preflight.

## 10. Remaining gate

1. **Concrete bundle review** of the prepared payload (against the decision record §6 and this §9).
2. **Separate explicit owner write authorization** for SCOPE-RETAINED, bound to the resolved payload
   and version.

Until both are granted, **no write runs**. This preflight is **not** authorization.

## 11. Boundaries

- **Read-only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no inference, no new
  research, no service/deploy/restart, no product/UI/harness change, no merge.
- **Sanitized.** Exact operational ids and the executable payload are local-only; this record carries
  public labels and sanitized id references.
- **Proposed, not authorized.** The bundle is prepared, not granted; settlement of D1–D6 is not a
  mutation permission.
