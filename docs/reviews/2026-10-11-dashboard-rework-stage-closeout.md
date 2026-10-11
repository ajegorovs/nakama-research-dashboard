# Dashboard rework stage closeout — development stage `rework-hardening-tests`

**Date:** 2026-10-11
**Subject:** the documentary closeout of the development stage that turned the prototype IA rework into the
served product surface — the three commits on `prototype/dashboard-ui-rework` merged to `main` as PR #8,
with the rework's hardening and harness work, the measured acceptance evidence, and the stage's open items.
**Public-record hygiene:** this record carries labels, not live endpoints, org ids, account ids or credentials.
The only network value quoted is the loopback dashboard origin (`http://127.0.0.1:3003`), which the rule keeps
verbatim (`docs/ux-v2/DECISIONS.md` §11). Everything here is written to be read from a clone.
**Commit state:** this is a **documentary closeout**. The closeout files — this record and the documentary edits
listed in §6 — are **not committed as of this pass**; no commit, push, tag, merge or service change is made here.

## Verdict

**Development stage `rework-hardening-tests` — CLOSED.** The rework, its hardening and its test work are done
and merged; the acceptance evidence is measured and recorded below. This is **NOT production acceptance** —
**production readiness** is a **separate decision, deliberately left open**. The **source is already merged and
published** to `main` (merge `06a4ec1…`, PR #8); no *publication* step remains open. **UI restyling is deferred**
(see *Next work*); it is not part of this stage.

## 1. Source identity and merge (verified this pass)

| Item | Value |
|---|---|
| Branch | `prototype/dashboard-ui-rework` |
| Stage HEAD | `aa6a3064fe0a256ba38a009d0c07c67d5d3eef64` |
| Merge commit on `main` | `06a4ec1de041885347e1a450cf3220029bf37416` — *Merge PR #8* |
| Relationship | HEAD is an **ancestor** of the merge; merge-base == HEAD; both trees == `a536f6725a728db253489e6686f61f6d007178c5` (identical, `git diff` empty) |
| Working tree | clean (0 entries) — measured **before** this closeout's documentary edits (§6); those edits are the only changes made and are **not committed** |

**The three implementation commits carried by the merge** (`a21fc1b…` → `aa6a306`):

1. `06dcbe78662d41ff62dc85b46d3a090b6ad3e6d0` — `feat(dashboard): task-plan text, scoped reads and review findings (m006)`
2. `0785d7b8aab78b1c4ba2c401eb2dbf2af5781f4d` — `test(harness): reader/skip/timeline suites, canonical-served passes + gate wiring`
3. `aa6a3064fe0a256ba38a009d0c07c67d5d3eef64` — `docs(ux-v2): acceptance records, design/contract docs, focus corpora and config`

**Product build identity** (re-derived with `sha256sum` this pass; byte-identical to the accepted identity):

| Artifact | sha256 | bytes |
|---|---|---|
| `ui/app.js` | `8ce68fbeec3351ed17eca7ec1eaf07a244d4134a7d76c9a6536f3100b40c81ae` | 155216 |
| `actions/actions.js` | `bd4139a44b8b8e8d30114134657560e618f37fec96de7b85e64b250793be25f7` | 156170 |

The served surface is the **pivoted four-view product**: `VIEW_OPTIONS` in `src/ui.tsx` lists
**Projects** (the landing; value `topics`), **People**, **Repositories**, **Progress**; Overview is retired and
its aggregate counts live in the collapsed *Dashboard summary* above the Projects landing. (This is the shipped
**product**; the **prototype** is a separate design surface — see *Documentary corrections*.)

## 2. Merge gate — measured, exit 0

Run on this stage's tree (`bun run check` = typecheck + build + `bun test src` + harness test suite):

| Gate | Result |
|---|---|
| `bun run check` | **exit 0** — **376 src pass / 0 fail** (19 files) **+ 47 harness pass / 0 fail** (6 files) |
| `bun run typecheck:host` | **0 diagnostics in this repo** (host-checkout diagnostics are printed but not counted — by design) |
| `bun run harness:records` (public-record guard) | **exit 0** — **343** text files scanned (**152** under `docs/`), 2 excluded by path; this closeout's re-run measures **343 / 152**, one more than the **342 / 151** previously established for the merge gate (the increment is the docs-side file this closeout adds); all redaction checks pass |

The **harness test suite is now inside the merge gate** (`… && bun run harness:suite:test`); the earlier
"11 ungated tests" caveat is closed — `served-build-guard`, `assign-capabilities` and `org-selection` are
covered, and no harness test is ungated.

## 3. Served validation evidence (bounded, local, isolated)

Two distinct passes: a **focused** served validation and a **canonical** bounded isolated served pass. They are
reported separately, and the requirement outcomes are attributed to the pass they come from.

**Focused served validation — accepted.** Five invocations against an already-provisioned instance
(revision 44, release `0.2.0+dev.e8f73b913af5`), no rebuild / vendor / reinstall / reseed:

| Invocation | Checks |
|---|---|
| evidence-line 1440×900 | 12 pass · 0 fail |
| evidence-line 1280×800 | 12 pass · 0 fail |
| evidence-line `--negative-control` 1440×900 | 13 pass · 0 fail (12 + 1 mutation control) |
| history-scope 1440×900 | 6 pass · 0 fail |
| history-scope 1280×800 | 6 pass · 0 fail |
| **Total** | **49 pass · 0 fail** = **48 ordinary + 1 mutation-sensitivity control** |

The **focused** pass closes **#17 / #18** (recorded evidence and its absence) and the approved **#24 migration** to the selected workstream's Progress → Recent activity feed, not the retired in-card expanding history disclosure. In the default-confirmed regression, the workstream is visually **ACTIVE**, while stored `stateConfidence: confirmed` remains unchanged. The evidence line reads **`No evidence on record — a 'confirmed' reading needs evidence`**. This does not invent an independently verified reading or alter confidence. The history-scope check read the
selected workstream's own **10 scoped events over 2 rendered pages** (page size 5), with **0 sibling leaks** and
**0 writes**.

**Canonical bounded isolated served pass — accepted.** `133 PASS / 0 FAIL / 59 SKIP`, exit 0, at **both**
1440×900 and 1280×800. The 59 SKIPs are checks whose *subject the corpus does not hold*, each printed with its
reason — not a coverage claim. **Requirements #11 / #60 / #61 are accepted from this canonical pass** (not from
the focused run), each with its qualifier:

- **#11** — completed/abandoned work is *folded*, closed initially, and opens on demand (**completed-only**
  subject).
- **#60** — a repository with nothing current raises an **exceptional notice**; the notice is
  **non-navigating**, and the subject is the **empty kind**.
- **#61** — a **bare** repository reports itself; the subject is a **current-empty** repository.

**Honest limits, stated not glossed:**

- The `133 / 0 / 59` canonical figure is **now recorded in this document**. Its underlying **raw logs and
  archives remain git-ignored and uncommitted** (local, not cloneable), so a reviewer holding only a clone reads
  the figure as a **summary here, not a re-derivation from the raw artifacts**. Committed correction records
  carry **different** canonical figures for earlier builds — `128 PASS / 0 FAIL / 62 SKIP`
  (`docs/design/dashboard-final-bounded-acceptance.md`) and `99 / 0 / 78`
  (`2026-10-11-canonical-next-phase-review-record.md`). Three canonical figures therefore appear across the
  tree; each belongs to the build named with it, and this record does not flatten them into one.
- The focused `49 / 49` figure **is** backed by a committed doc (`docs/design/dashboard-final-bounded-acceptance.md`).
- These served passes need a compatible external host checkout; no compatible host is bundled, and none is
  claimed. They are **not reproducible from a clone alone**.

## 4. Remote install and local reinstall (product reached a served instance)

**Accepted-source archive** — the delivery bundle `research-dashboard-accepted-source.zip`, sha256
`dbee4d52163f0f69aed77fb2ddcffe1b2078c845de57a9dcf5d23fd92b882c40` (349 files, matching `SOURCE-DELIVERY`).

**Canonical review archive — a distinct source, not the accepted-source zip** — the reviewer packet
`final-canonical-remaining-review-2026-10-11.zip`, sha256
`0ec53855b70fbce741dd283a1d238207dae0bf64d4f23a239ecc44b45730e07c`. The two archives are **different
artifacts**; an earlier draft of this record mislabelled `0ec53855…` as the accepted-source archive — it is the
canonical-review packet.

| Where | What was measured |
|---|---|
| **Remote** (fresh, disposable instance — "the receiving-side handback") | Revision **12**, **empty store** (structural); served `ui/app.js` byte-identical to the accepted digest (`8ce68fbe…`, raw 155216 B); accepted-source archive verified, `SHA256SUMS` **349/349**; **14/14** read-only checks (four views present by label; scoped reads answer 200; **no state-changing call**). Labelled **NOT production acceptance**. |
| **Local** (the retained development instance, one explicitly named organization) | Revision **49** on the same accepted digest; a **populated** store — **3 topics · 7 axes · 8 activities · 1 person** — preserved **by count** (identity preserved; **not** a full-DB equality claim). The Layout and E2E-fixture organizations read back **unchanged** (release binding measured per org; the vendored checkout bytes changing globally is expected for a vendor step). A WAL-safe online backup of the instance's databases was taken before the change (held by label, outside this repo). |

Remote is **empty/structural** (14 checks); local is **populated** (counts preserved). Both are stated as the
different shapes they are.

## 5. Lifecycle, boundaries and non-blockers

- **Stage CLOSED:** `rework-hardening-tests`. Done — the rework, hardening and test work are merged and the
  evidence above is measured. **Not production acceptance.**
- **UI restyling — deferred.** Explicitly wanted later by the owner; **not started**. The next work runs
  through the prototype/preview surface (below).
- **Selected-identity test strengthening — OPEN, clearly non-blocker.** Correction #3 in `harness/verify-page.mjs`
  was loosened to *"every `get_topic` target ∈ the index's topics"*; the reviewer ruled it **narrower, not
  equivalent** and required a follow-up to restore the selected-identity guarantee (plan §3.5). Tracked, not
  re-opened as a review cycle.
- **Person-notes (Grant C) — OPTIONAL.** The public write path has no `notes` field, so the branch is not
  exercisable through supported input. Retained, not injected; no public-API growth.
- **Repository page-race — qualified, not resolved.** No independent repository-only guard is demonstrated;
  the shared `PagedActivityFeed` mechanism is the candidate. Historical qualification, not a blocker.
- **Keyboard-focus figures — not re-taken here** (prior measurements stand as recorded).
- **Requirements #11 / #60 / #61 — closed within their accepted scopes.** Their qualifiers (*completed-only / empty-only / bare*) remain explicit; acceptance is not generalized to untested subjects.
- **No tag was created or moved** (a new baseline gets a new name; tags are never rewritten). **No remote
  contact** (no push, no merge, no PR edit) and **no service restart** was performed by this record.

## 6. Documentary corrections applied with this closeout

No product, test, harness, helper, migration or build-output change is made by this closeout. The only edits
are documentary:

1. **Root `README.md`** — a stage-closeout pointer added to the reviewer block; the body is otherwise not
   rewritten (its earlier acceptance numbers and dates stand as written).
2. **`AGENTS.md`** — the top *Status* paragraph is clarified: the UX-v2 composition line is historical, and the
   rework-hardening-tests stage close is appended. No structural rewrite.
3. **Preview documentation.** `harness/preview/README.md` now describes the shipped four-view product and warns that older capture assumptions need separate verification. The interactive prototype and its own README are unchanged; their legacy descriptions must not be used as the product contract. No preview/capture runtime was modified or newly verified during this closeout.
4. **`docs/ux-v2/DECISIONS.md`** — one brief, dated closeout pointer added; no new product decision.

## 7. Next work

**UI restyling via the prototype/preview** — the owner has said they want it, later. It is deliberately not
started in this stage and is the natural next step now that the rework-hardening-tests stage is closed.
