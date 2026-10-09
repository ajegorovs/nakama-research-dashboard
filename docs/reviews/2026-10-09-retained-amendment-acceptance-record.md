# Retained-amendment (F02 + F07/F09 + F12) — final acceptance record (2026-10-09)

**Status: reviewer-accepted at the execution stage — DOCUMENTARY QUALIFICATIONS.** This record covers what was
accepted, and only that. **No merge authorization has been requested or granted for this closeout.** This
records the absence of a merge grant; it is not — and is not to be read as — an owner refusal. No denial is
asserted or implied.

Execution report: [`2026-10-09-retained-amendment-execution-report.md`](./2026-10-09-retained-amendment-execution-report.md).
Machine evidence: [`2026-10-09-retained-amendment-execution-evidence.json`](./2026-10-09-retained-amendment-execution-evidence.json).
Findings ledger: [`public-research-fixture-findings.md`](./public-research-fixture-findings.md) §X–§X.4.
Planning/design: [`../plans/public-research-retained-fixture-amendment-design.md`](../plans/public-research-retained-fixture-amendment-design.md).

## 1. Verdict (reviewer, quoted verbatim)

> Verdict: EXECUTION ACCEPTED — DOCUMENTARY QUALIFICATIONS.

**Provenance (stated, not hidden).** This is the reviewer's verdict, relayed by the owner from the review
message; the review was made **offline** against the **archived** execution evidence (the Runners, the frozen
bundle, the pre-T1 snapshot and the harmonized postflight snapshots), not against a re-run. The full reviewer
text is **present in the project conversation**, and the line above is copied from it **verbatim**. The source
is retrievable; these tokens are **not** reconstructed, paraphrased or invented. The verdict **accepts the
execution** subject to the **documentary qualifications** below; it is **not** a live re-proof, **not** a
full-DB-bytes verification, and **not** a merge grant.

**This is the only execution verdict recorded.** No reviewer acceptance is claimed **beyond** this verdict and
the archived offline assertions; no reviewer "final closeout" or merge approval is invented or implied.

## 2. What was accepted (executed)

| Item | Value |
|---|---|
| Scope | `SCOPE-RETAINED-AMENDMENT` — **F02** + **F07/F09** + **F12** |
| Transactions | **2** `reconcile_topic` calls — T1 (infrastructure topic), T2 (experimental topic) |
| Authorization | owner one-shot, digest-bound (`"i agree. proceed"`) — **CONSUMED**; not reusable |
| T1 | ax5/ax6 person links to the **existing** person (githubLogin `ajegorovs`); axis versions `2 → 3`; dashboard repo `url`/`description`/`defaultBranch` set; topic `relationship` `primary` preserved |
| T2 | UDV + Grablink repo metadata set; topic relationships preserved; diagnostics plan-step `position`s `1..4` in the authored order (same `stepId`s, verbatim titles, state `pending`); plan version stays `1`; only each step's `updatedAt` advanced |
| Postflight | **29/29 PASS** on a single-schema readback byte-comparable to the pre-T1 snapshot |
| Protected (un-targeted) stores | **unchanged** by their own readback — `Layout Demo` `eda52f72…` (2/7/3/2); `Nakama E2E Fixture` `a75bc4c6…` (2/8/1/0) |
| Deployment | none — no reinstall/deploy/restart; served `ui/app.js` sha256 and bytecount identical before and after |

**Canonical projection digest chain** (`sha256(JSON.stringify(projection))`, one schema — corrected chain):
pre-T1 `b9218047…` → immediately post-T1 `5ab8e3e6…` → final `4fcf2b7a…` (full values in the execution report
§6 and the ledger §X.4).

**Served identity (at the boundary):** `ui/app.js` sha256
`f6e6b8f3cec9476ad55be4f7067eb116690ae0b26c03cd98c58b654cb9024548`, **155420** bytes, release
`0.2.0+dev.a5f76a608db2` revision `17` — the U12 full-text clamp-release build.

## 3. The documentary qualifications (what "accepted" does **not** claim)

- **Offline, on the archive — not a live re-proof.** The acceptance rests on the **archived** evidence and its
  **offline assertions** (re-derived with `sha256`/JSON only). It does **not** re-run the write, does **not**
  re-measure the live service, and does **not** consume any grant.
- **No full-DB-bytes claim.** The "unchanged" claims rest on the **captured projection** the audited readers
  compare, which **omits** several fields (activity text/actor, person timestamps, topic `description`,
  problem-evidence timestamps, among others). "Unchanged" means the **measured fields** only — it is **not**
  an all-fields-complete or DB-byte-identity verification, and there is **no** "immutable person record"
  claim (the person check is **count-only**).
- **Projection-relative comparisons.** The digest chains use one **canonical projection hash**. A **raw
  file-bytes sha256** is a **different** value (the saved files are pretty-printed) and is labelled as such.
  The protected-store pre/post comparison is a **same-projection, immediate-pre vs post** match — not a
  historical-canonical full-state claim.
- **Counts are sync indicators, not independent invariants.** The public check counts (payload validation
  **37/37**, read-only preflight **20/20**, postflight **29/29**) are counts of the checks each run makes;
  matching totals do not by themselves prove the checks assert **independent** properties.

## 4. Evidence, and the offline archive

- **Committed evidence.** [`2026-10-09-retained-amendment-execution-evidence.json`](./2026-10-09-retained-amendment-execution-evidence.json)
  is the machine record — public labels and digests only, no live endpoint, org id, hostname or machine path.
- **Offline review archive (local, git-ignored).** `.hermes/scratch/ramd-execution-review-final.zip` collects
  the **29 prior evidence files** (runners, frozen bundle, snapshots, projections, journal, review-pack) **plus
  the two retained protected-store pre-projections**, with a README and a **digest manifest** that carries
  **both** the per-file raw `sha256` **and** the canonical projection digests (the two algorithms explicitly
  distinguished) and the **final public head**. A reader re-derives every material claim **offline** — no
  network, no instance, no write.
- **Frozen bundle bytes** sha256 `06d8a6190459c10166fdc39609fbb02dbba5264b9034def42b4356db5cc0f66a` — unchanged,
  not regenerated.

## 5. Product and scope boundaries (unchanged by this acceptance)

- **One-shot, amendment only.** The grant is **CONSUMED**; **SCOPE-BASELINE remains unselected and NOT
  authorized**; no further write (no evidence add, no other-metadata fix, no `record_activity`) is authorized.
- **No product/UI/harness/source change; no deployment/restart/merge.** PR7 stays **draft**.
- **Sanitized.** Exact operational ids (org/topic/axis/person/plan/step), the executable payload and the raw
  envelopes are held **local** (git-ignored); this record carries public labels, sanitized id references and
  digests only.

## 6. Re-derivation at record time (offline, from retained files)

| Check | Result |
|---|---|
| frozen bundle bytes sha256 | `06d8a619…` (unchanged) |
| bundle / payload digests | `ba1b9050…`; T1 `23a4c01d…`; T2 `31241657…` (re-derived, matched) |
| canonical projection chain | pre-T1 `b9218047…` → post-T1 `5ab8e3e6…` → final `4fcf2b7a…` |
| protected projection digests | `Layout Demo` `eda52f72…`; `Nakama E2E Fixture` `a75bc4c6…` (pre = post) |
| served asset | `f6e6b8f3…` / 155420 bytes |
| offline archive verifier | all assertions pass (see the archive README/digest manifest) |
| `git diff --check` | clean (documentation-only change) |
| public-record guard | `bun run harness:records` — all checks passed |

Nothing here is a code change: the working-tree changes are **documentation only** (this record, the
execution report, the execution evidence JSON, the findings ledger §X.4), so no source, bundle, harness or
migration rebuild is required and no existing gate is reopened.

## 7. Merge disposition

The reviewer's verdict closes the **execution** stage under **documentary qualifications** and grants **no
merge**. The documentation closeout is committed and pushed to the draft pull request. **No merge
authorization has been requested or granted for this closeout**; the **merge remains owner-gated** — this
record neither asserts nor implies an owner refusal.
