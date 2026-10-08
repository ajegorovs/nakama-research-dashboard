# WP-G — retained-scope **execution report**: T1 + T2 committed, postflight PASS, protected stores unchanged

> **Status: EXECUTED (SCOPE-RETAINED only) under explicit owner write authorization; grant CONSUMED.**
> This record reports the live execution of the **two reviewed retained `reconcile_topic` transactions**
> (T1 + T2) from the prepared bundle bound by digest to the retained-scope preflight
> ([`2026-10-08-wp-g-retained-preflight-report.md`](2026-10-08-wp-g-retained-preflight-report.md)), and the
> post-write verification. It is the **first live write** of the authoring path. Companion machine evidence:
> [`2026-10-08-wp-g-retained-execution-evidence.json`](2026-10-08-wp-g-retained-execution-evidence.json).
>
> **Authorization.** The owner granted an explicit write authorization ("Yes. I authorize. Continue the
> work") scoped to **SCOPE-RETAINED only** — the two reviewed calls, bound to the bundle digest. It is a
> **narrow, one-shot grant**, now **CONSUMED**: it authorizes no further mutation. **SCOPE-BASELINE remains
> unselected and NOT authorized.**
>
> **Public-safe.** This record carries **public labels, sanitized id references and digests only** — no live
> org id, topic/axis/problem id, invocation id, host name or host path. Exact operational identity and the
> raw envelopes live **only** in the local (git-ignored) operational records and `.hermes/scratch/`.

---

## 1. Scope and what ran

| Item | Value |
|---|---|
| Scope | **SCOPE-RETAINED** (retained-fixture amendment) |
| Transactions | **2** — T1 (infrastructure topic), T2 (experimental topic, axis 4) |
| Action | `reconcile_topic` — **once each** |
| Owner write authorization | **granted** (narrow, digest-bound) → **CONSUMED** |
| Deployment | **none** — no reinstall/deploy/restart; same served bytes before and after |
| Product/UI/harness/source change | **none** |

The executed payloads are exactly the reviewed bundle's two transactions: T1 = the axes-5/6 `primary`
repository links (D1/F01) plus both consultation problem→repo sets (D6/F04); T2 = the axis-4
`currentState` population (D2/F08, `inferred`). Nothing else was written.

## 2. Bundle verification (before any call)

The prepared file was re-hashed with the **canonical algorithm** (sha256 over the bundle object minus its
three trailing digest fields). Every recorded digest matched, with **no edit and no auto-rederive**:

| Predicate | Value | Match |
|---|---|---|
| bundle sha256 | `4606d290c89572f88ef0386551883d193a92a85ffae1235d079513137fece154` | **yes** |
| T1 payload sha256 | `647dd32465e2421bc3e1705b3f9704db323e4c835187fe4560d7516a98610b08` | **yes** |
| T2 payload sha256 | `daee7b23f80ec9fb109e1303aea3ae14f00d88bc7bba4fb937239ce96969d655` | **yes** |
| F08 string length | **411** chars | **yes** |

The re-derived bundle digest equals the digest recorded in the preflight report and the owner grant.

## 3. Boundary (fresh, immediately pre-T1)

- **Target identity:** the `Public Research Exercise` org, resolved by **id AND name** from a fresh org list
  and **explicitly selected** as the session active org (echo asserted equal to the target) — never
  `orgs[0]`.
- **Served identity (org-aware, browser-actually-served):** `ui/app.js` sha256
  `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`, **154417** bytes, **byte-equal** to
  the repo; the target org serves release **`0.2.0+dev.78af5cbb87b4`** revision **`9`**. **No deployment
  change** (same before and after).
- **Object versions:** all topic/axis `expectedVersion` = **1**.
- **Dedup / absence:** axes 5/6 carry **no** repository link; both consultation problems carry an **empty**
  repository set; the diagnostics **plan-steps** keep **null** positions; **ax4** `currentState` is
  **blank**, `currentStateConfidence` **null**, `blockerConfidence` **inferred** (ratified), axis-4
  **evidence zero**.
- **Byte-echo:** both consultation problem **statements** matched the bundle **verbatim**.
- **Counts / events:** `2 topics / 6 axes / 3 repositories / 1 person`; **8 events**.
- **Gates:** **22/22** boundary checks PASS; **no material drift** → the session proceeded.

## 4. T1 — infrastructure topic (axes 5/6 links + consultation problem sets)

- `reconcile_topic` **once**. HTTP **200** · `result.ok` **true**.
- **Delta (verified by canonical readback):**

| Object | Before | After |
|---|---|---|
| ax5 repository link | `[]` | `[ajegorovs/nakama-research-dashboard `primary`]` |
| ax6 repository link | `[]` | `[ajegorovs/nakama-research-dashboard `primary`]` |
| consultation problem 1 repo set | `[]` | `[ajegorovs/nakama-research-dashboard]` |
| consultation problem 2 repo set | `[]` | `[ajegorovs/nakama-research-dashboard]` |

- **Changed:** axes **5/6** version advanced **1 → 2** as their repository links were written (a
  `reconcile_topic` axis patch bumps the axis version unconditionally); each consultation problem's
  **repository set** was replaced with `[ajegorovs/nakama-research-dashboard]`. The problems' `statement`
  text is **unchanged** (verbatim echo), and their row version stayed **1** with `updatedAt` **not
  advanced** — measured in the T1 readback, and consistent with the source contract (`problems[]` carry no
  `expectedVersion`, and replacing the problem set does not bump the row).
- **Unchanged:** problem statements (verbatim echo); counts `2/6/3/1`; **8 events**; axes **1–4**
  links/people (and **axes 1–3** versions); the topic row; topic-level `primary` links; plans; repository
  metadata; people; every `occurredAt`; topic `lastActivityAt`.

## 5. T2 — experimental topic, axis 4 (`currentState`)

- **Fresh pre-write diagnostics:** axis-4 topic = the `Experimental research` topic (ownership confirmed);
  version **1**; `currentState` blank; `currentStateConfidence` null; `blockerConfidence` `inferred`;
  evidence `[]`. Basis matched the bundle → proceeded.
- `reconcile_topic` **once**. HTTP **200** · `result.ok` **true**.
- **Delta (verified):** axis-4 `currentState` = the **exact 411-char §3.1 string**;
  `currentStateConfidence` = **`inferred`**; axis-4 version **1 → 2** (expected).
- **Unchanged:** `blockerConfidence` **`inferred`** (ratified, no upgrade/downgrade); **axis-4 evidence
  still `[]`** (F03/F14a residual accepted — D4 = leave); counts; **8 events**; all `occurredAt`; topic
  `lastActivityAt`; axes 1–3; plans; metadata; people.

## 6. Post-write verification — **PASS**

Fresh canonical readback; **24/24 checks PASS**:

- counts `2 topics / 6 axes / 3 repositories / 1 person` — **unchanged**; **8** events — **unchanged**;
- axes 1–4 links/people unchanged (axes 1–3 versions unchanged; axis-4 version advanced for the T2 write);
- `plans` unchanged (F12 null positions preserved); repository metadata unchanged (F07/F09 not written);
  people unchanged (F02 not written); topic `primary` links preserved;
- **F03/F14a residual = axis-4 evidence `0`**; **F05/F10-existing/move/retro-link = no new events**;
- **`lastActivityAt` unchanged** (recency/`updatedAt` may advance — recency is not research, F06).

**Protected (un-targeted) stores — unchanged by their own fresh readback** (stable projection, immediate
pre-T1 vs post, **not** DB byte identity): `Layout Demo` digest `edfdf7dc…` (2/7/3/2), `Nakama E2E Fixture`
digest `7d84edbd…` (2/8/1/0) — **identical before and after**.

**Mutation-public snapshot digest:** `d8d62f53…` (pre) → `9789f151…` (post).

## 7. Optional UI render check (report-only)

Attempted a read-only browser render at the target org. The **Overview** tab renders correctly
(`2 topics · 6 axes · 1 person · 3 repositories`); the axis-4 detail **F08** text was **not conclusively
reached** by automated navigation this pass. This is **not a product issue** — the F08 value is confirmed
by canonical readback. The screenshot is retained **only** in `.hermes/scratch/`; **no canonical fixture
screenshot was overwritten**.

## 8. Boundaries and limitations

- **One-shot, retained only.** The grant is **CONSUMED**; **SCOPE-BASELINE is NOT authorized**; no further
  retained write (no evidence add, no F02/F07/F09/F12) is authorized by this record.
- **No deployment change, no restart** — none was needed and none was performed.
- **First live write.** The authoring/mutation path was **not previously execution-validated**; this run
  validates **only this narrow retained path (T1/T2)** — **not** a full baseline authoring, and **not** the
  wider WP3/WP4 design.
- **Digest hygiene.** The preflight report's un-targeted-store **envelope** digests were **volatile**
  (per-read timestamps); this run deliberately compares a **stable projection** fresh pre vs post.
- **No rollback** exists for a committed transaction; the residual accepted here (F03/F14a) is by design.

## 9. Private records (git-ignored)

Exact operational identity, the raw request/response envelopes and the consumable grant record are held
**local only** in `.hermes/scratch/` (`wpg-owner-grant-record.md`, `wpg-retained-execution-record.md`,
`wpg-exec-*.json`). Nothing operational is committed here.

**PR links.** Branch `docs/research-fixture-methodology`; draft PR #4
(`https://github.com/ajegorovs/nakama-research-dashboard/pull/4`).
