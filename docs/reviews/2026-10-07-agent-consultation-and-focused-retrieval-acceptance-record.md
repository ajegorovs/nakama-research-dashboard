# Acceptance record — agent consultation and focused retrieval stage (reviewer decision)

**Repository:** `nakama-research-dashboard` · **Date:** 2026-10-07
**Stage report:** [`2026-10-07-agent-consultation-and-focused-retrieval-stage-report.md`](./2026-10-07-agent-consultation-and-focused-retrieval-stage-report.md) (its §10 records the prepublication corrections below)
**Predecessor acceptance of the harness:** [`2026-10-05-semantic-eval-harness-acceptance-record.md`](./2026-10-05-semantic-eval-harness-acceptance-record.md)

This page records the **reviewer's decision** on the stage and the corrections it required. It is a **durable,
public** record: it carries labels and repo-relative paths only — no live endpoint, hostname or machine path.

## 1. Verdict (owner-supplied, quoted verbatim)

> **Stage:** APPROVE — QUALIFIED CLOSURE
> **Commit / merge:** REQUEST CHANGES

**Citation boundary (stated, not hidden).** The reviewer returned its decision through a chat surface whose
content references are not reconstructable from the artifacts available here; the full reviewer prose was
**not retrievable**. What is recorded above are the owner's exact verdict tokens, **quoted verbatim**; no
reviewer sentence is reconstructed, paraphrased or invented. The four corrections below are likewise the
owner's exact enumeration of the required changes.

## 2. Corrections the reviewer required (owner wording, verbatim)

1. **Chronology** — the earlier **Ling `3gen`/`3tool`** package must be shown distinct from the reported later
   **`2gen`/`1tool`** package; scope them explicitly (or include them), do not silently collapse them.
2. **Semantic attribution** — §3.2 (agent) vs §5.4 (human) are inconsistent; fix to one attribution.
3. **`reinstall` helper `orgs[0]`** — operational safety: select the organization explicitly; fail on ambiguity
   before any mutating request.
4. **`bound-session-model` test personal path** — sanitize the literal so the records guard is green.

The reviewer also recommended a **non-inference premerge cleanup** into clean commits. Its prose is **not** an
owner grant to commit or push: no stage/commit/push is performed here (see §5).

## 3. How each correction is resolved

| # | Resolution | Where |
|---|---|---|
| 1 | §3.1 now names the three **distinct** Ling packages — `…-fresh-process-run` (preflight mismatch, no inference), `…-bound-session-run` (`3gen`/`3tool`, `provider-error`, `empty_trace`), `…-next-run-…` (`2gen`/`1tool`, the entry the report cites) — with each package's counters; all three are indexed in the local ledger. | report §3.1, §10; local ledger `lingChronology` |
| 2 | Attribution unified to **independent agent** review (subjective), **not** a human reviewer verdict; the `SEMANTIC-REVIEW.md` artifact's own "human judgment" self-label is superseded as imprecise. | report §3.2, §5.4, §10 |
| 3 | New `harness/org-selection.mjs`; `reinstall-plugin.mjs` / `install-plugin.mjs` / `update-plugin.mjs` name the org via `--org-id` / `--org-name` (or `NAKAMA_ORG_ID` / `NAKAMA_ORG_NAME`), refuse a multi-org account with no selector, a foreign/unavailable id, and a conflicting id+name **before any mutating request**; a single-org account keeps its legacy fallback. | `harness/org-selection.mjs`, the three helpers, `harness/org-selection.test.mjs`, report §6, §10 |
| 4 | The home-path literal was removed by routing the host-checkout path through the repo's existing `hostCleanDir()` convention; the guard rule was **not** relaxed. | `harness/nakama-e2e/driver/bound-session-model.test.mjs`, report §7, §10 |

## 4. Narrowed claims (kept, not overstated)

- **Profile `systemPrompt` workaround, not a host fix.** Delivering guidance through the profile `systemPrompt`
  with the skill unassigned removes the contradiction *for the fixture profiles*; it is a fixture-scoped
  workaround. The standing one-line host change (make the `read_file` directive conditional) remains
  **unverified and out of scope**.
- **N-7: `SUCCESS` ≠ tool path proven.** Host automation run `status: completed`; harness classification
  `missing_trace`; generation/tool counts recorded **`unknown` (null)**. N-7 consultation is evidenced by
  **grounded content**, not by a tool trace — **not** a semantic failure, and **not** proven tool-level
  consultation.
- **Semantic verdict is not formal.** The direct answers were judged strong by a **subjective agent** review;
  this is not a machine-scored result.

## 5. Boundaries and publication gate

- **No commit, push, merge, release or branch creation** was performed; no `git add`/`git commit`/`git push`.
  The tree remains **dirty and uncommitted**.
- **No inference**, no network provider call, no deployment, no service restart, no unrelated edit.
- **Publication is gated.** The reviewer's `REQUEST CHANGES` is a pre-merge correction request, not a
  publication approval; publication waits on the corrections landing and a fresh owner-authorized review.
- The staged-but-unperformed items below need an **owner** decision, not a reviewer one.

## 6. Verification at record time (this machine, this tree)

| Gate | Result |
|---|---|
| `bun run check` (typecheck + build + `src` tests) | **312 pass / 0 fail** (1602 expects, 13 files) |
| `bun run build` output vs committed bundles | `actions/actions.js` `25900ac1…` and `ui/app.js` `41e61ef5…` — **byte-identical** (no generated-output drift) |
| `bun test harness/nakama-e2e` | **262 pass / 0 fail** (1007 expects, 11 files) |
| `bun test harness/org-selection.test.mjs` | **17 pass / 0 fail** (31 expects) |
| `bun run typecheck:host --checkout <host checkout>` | **0 repository diagnostics**; host-checkout diagnostics reported, not counted (155) |
| `bun run harness:records` | **all checks passed** — 0 endpoint offences, 0 identity-bearing home paths, 244 text files scanned (2 excluded by path) |

## 7. Items the owner must still decide (not requested, not performed)

1. **Commit grouping** for the combined work (see the intended grouping in report §10).
2. **`AGENTS.md`** — the build-loop note naming the org selector is an `AGENTS.md` change, which needs owner
   approval; it is intentionally **not** applied here.
3. The remaining open items from the stage report §8 (N-7 trace sink, `limitScope` naming, guidance widening).

## 8. Publication preparation executed (2026-10-07, local — appended)

Sections 1–7 record the review at stage close, when the tree was uncommitted. The reviewer-requested
non-inference cleanup was then closed into **local** implementation commits `75d3545` (product), `88a5dd0`
(harness / e2e) and `59f4d6b` (org-selection safety), followed by this durable-docs commit — with **no push,
merge, tag or release**. `.agents/skills/acceptance-pass/SKILL.md` (pre-existing, unrelated; excluded by D-015)
remains uncommitted. `AGENTS.md` was updated under owner approval and lands in the org-selection commit. The
verdict quoted verbatim in §1 is unchanged.

## 9. Publication verdict and bounded correction (2026-10-07, appended)

**This section is appended.** Sections 1–8 record the stage-close review and the local publication preparation
at that time; that history stands and is not rewritten. Section 1's `REQUEST CHANGES` was a **pre-merge**
correction request; it is now **superseded** by the verdict below, recorded after the corrections landed and
the branch was published.

### 9.1 Verdict (owner-supplied, quoted verbatim)

> **APPROVE — QUALIFIED CLOSURE / PUBLICATION ACCEPTED**

The §1 tokens are retained verbatim for the record; the commit/merge `REQUEST CHANGES` line is **superseded**
by this publication acceptance. `main` is **published** at `5a62749` (commit subject: *Record the
agent-consultation and focused-retrieval stage and its acceptance*), the tip of `origin/main` at the time of
this record.

### 9.2 The reviewer's bounded correction

`ResearchStore.getAxisWorkstream` (`src/store.ts`) built the axis's own note list as
`listAnnotations({ axisId, limit: notesLimit }).filter((note) => note.problemId === null)`. `listAnnotations`
applies `ORDER BY … LIMIT` **in SQL**, so the `problem_id IS NULL` test ran **after** the limit: a plain note
that legitimately names **both** the axis and a problem (a multi-target `note`, the only kind the schema
permits more than one target) consumed a `notesLimit` slot and was then dropped by the filter. On an axis
whose newest notes were multi-target, a legitimate axis note could be crowded out of the page entirely and
`coverage.notes.returned` fell short of the collection's own `total`.

**Resolution.** A dedicated seam `listAxisNotes(axisId, limit)` (`src/store.ts`) applies
`problem_id IS NULL` **before** `ORDER BY … LIMIT`, mirroring the existing `listTopicNotes` shape. It is used
**only** by the scoped `getAxisWorkstream` collection. The topic-wide `getTopicDetail` read, the generic
`listAnnotations` caller semantics, and the `problemNotes` per-problem read are **unchanged**; the axis
`notes` `total` already counted `axis_id = ? AND problem_id IS NULL` (`src/store.ts`), so the fix makes the
returned page agree with the total it always reported — the behaviour `docs/ux-v2/DECISIONS.md` §16 already
specifies ("the `notes` total excludes problem-scoped notes … so each collection agrees with itself").
No contract change was required.

**Regression test** (`src/actions.test.ts`, *"the axis note cap excludes problem-scoped notes in SQL, before
the limit"*): a legacy plain multi-target set — three axis-only notes (A newest, then B, C) and two newer
notes naming both the axis and one problem — read scoped with `notesLimit: 2`. It asserts
`coverage.notes = {limit: 2, limitScope: "collection", returned: 2, total: 3, truncated: true}` with the page
`[A, B]` (the genuine axis notes, not the two newer multi-target notes), and that both multi-target notes
remain retrievable under their problem. On the pre-fix code the same test returns `returned: 0` — the two
limit slots are spent by the multi-target notes and then filtered away.

### 9.3 What this does not invalidate

- **The historic acceptance stands.** The bounded correction changes a results shape only in the multi-target
  case; the scoped live acceptance (stage report §5.4, invocation 5) exercised a problem-scoped note that
  carried **no** axis link (a problem-targeted note), so it never competed for an axis `notesLimit` slot.
  Every observed value in the acceptance is unchanged by the fix.
- **No new inference was run.** This correction is an **offline, source-and-test** change; no provider call,
  no model generation, no deployment and no process restart occurred. The stage report's five-invocation
  ledger is untouched.
- **No product-UI change.** `ui/app.js` is byte-identical; only the action bundle regenerated.

### 9.4 Verification at record time (this machine, this tree)

| Gate | Result |
|---|---|
| `bun run check` (typecheck + build + `src` tests) | **313 pass / 0 fail** (1606 expects, 13 files) — +1 test over the stage-close count |
| `bun run build` | `ui/app.js` sha256 `41e61ef5…` — **byte-identical** (UI unchanged); `actions/actions.js` regenerated (`06831505…`) |
| `bun test harness/nakama-e2e` | **262 pass / 0 fail** (1007 expects, 11 files) |
| `bun test harness/org-selection.test.mjs` | **17 pass / 0 fail** (31 expects) |
| `bun run typecheck:host --checkout <host checkout>` | ✅ this repository typechecks against the real host types — **0 repository diagnostics**; 155 checkout-only diagnostics reported, not counted |
| `bun run harness:records` | **all checks passed** — 0 endpoint offences, 0 identity-bearing home paths, 245 text files scanned (2 excluded by path) |

`.agents/skills/acceptance-pass/SKILL.md` remains the only unrelated working-tree change and is untouched.
