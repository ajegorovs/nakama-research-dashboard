# Tier B B1/B2 — montage / prototype-pack normalization — execution record (2026-10-04)

**Unit:** repository hygiene, Tier B, **B1/B2 only** (montage packs + duplicate prototype renders). Taken on
branch `review/tier-b-b1-b2` off the pinned published checkpoint
`433950859f0993df2cafd851e57572c9f260d7c2` (`origin/review/v1-accepted`). Precedent:
[`2026-10-03-repo-hygiene-acceptance-record.md`](2026-10-03-repo-hygiene-acceptance-record.md) (Tier A) and
`AGENTS.md` § *What is tracked*. Analysis source:
[`2026-10-04-tier-b-cleanup-proposal.md`](2026-10-04-tier-b-cleanup-proposal.md) +
[`2026-10-04-tier-b-cleanup-manifest.csv`](2026-10-04-tier-b-cleanup-manifest.csv) (both on
`review/tier-b-cleanup-plan`, read with `git show` — never re-based onto here).

There is no served build to judge: the change is a harness/documentation/tree change, so the judged artifact is
the **tracked tree** and the gates that read it.

## 1. The reviewer's ruling (narrowed, verbatim)

> Approve execution with amendments. Tier B execution is limited to B1/B2: normalize the fidelity producer with
> the minimal `--prototype-dir` change, prove equivalent regeneration, remove and ignore the 56 generated
> montage/duplicate-prototype files, retain the canonical prototype and current capture evidence, and repair
> only the associated generated-artifact documentation. B3 and B4 are deferred in full: do not delete the 14
> historical correspondence files or any of the 16 UX-v2 unit/composition documents in this pass, and do not
> replace useful live documentation links with tag-recovery commands merely for file-count reduction. People
> metadata density and Repository-name wrapping remain a separate product workstream. Before execution, correct
> the gate arithmetic/base ambiguity: run from an explicitly pinned baseline and make all file-count assertions
> cumulative. `temp.md` remains untouched.

## 2. Pinned baseline and cumulative arithmetic (the ambiguity the ruling names)

The proposal's "262" is a fact about the **base** `4339508`; on the proposal branch
(`review/tier-b-cleanup-plan`, `1a51383`) the index is **264** because that branch adds the proposal and its
CSV. Every count below is therefore stated **relative to the pinned base**, cumulatively:

| Stage | tracked files | tracked bytes | note |
|---|---|---|---|
| **Pinned baseline `4339508`** (measured) | **262** | **22,651,305** | `git ls-files \| wc -l`; `git ls-tree -r -l HEAD \| awk …` |
| **B1b removal** (56 montage / duplicate-prototype paths) | **−56** | **−9,898,367** | the manifest in §3 |
| **= existing baseline after B1b** | **206** | **12,752,938** | 262 − 56 |
| **+ new files added by this pass** | **+1** | *(this record's bytes)* | the only new path; §7 |
| **= tip after this pass** | **207** | *(see §9, measured post-commit)* | 206 + 1 |

Modified existing paths (`harness/fidelity/montage.mjs`, `harness/preview/fidelity.mjs`, `.gitignore`,
`docs/ux-v2/fidelity/REVIEW.md`, `docs/ux-v2/fidelity/REVIEW-PACKET.md`, `harness/fidelity/README.md`,
`harness/preview/README.md`) move no count. The proposal branch's own 2 files are **not** part of this branch
and are **not** used as a baseline.

## 3. The exact 56-path manifest and its recoverability (derived, not transcribed)

Derived programmatically by intersecting the current index's `side-by-side/ | fixture(-tall)?/prototype-1440x900/`
match with the proposal CSV's `tier=B1B2` rows:

```
index 262 · CSV rows 262 · matcher set 56 · CSV B1B2 set 56 · sets_equal=True · only_in_one=∅
```

| directory | files | bytes |
|---|---|---|
| `docs/ux-v2/fidelity/side-by-side/` | 12 | 2,110,262 |
| `docs/ux-v2/fidelity/fixture/side-by-side/` | 12 | 2,152,838 |
| `docs/ux-v2/fidelity/fixture-tall/side-by-side/` | 12 | 2,356,391 |
| `docs/ux-v2/fidelity/fixture/prototype-1440x900/` | 10 | 1,639,438 |
| `docs/ux-v2/fidelity/fixture-tall/prototype-1440x900/` | 10 | 1,639,438 |
| **total** | **56** | **9,898,367** |

**Recoverability — verified per path, not asserted.** All **56/56** paths resolve **byte-identically** (same
blob SHA as the index) at the immutable tag **`ux-v2-composition-complete`** (tag object `099540b`, commit
`2b7c9a9`) **and** at the pinned base **`4339508`**. The two duplicate `prototype-1440x900/` directories carry
**the same 10 blob SHAs as the retained canonical** `docs/ux-v2/fidelity/prototype-1440x900/`
(`overview-full.png = 7e32672d…`, `people-full.png = b33ec509…`, … — 10/10 identical) — the deduplication is
exact.

## 4. B1a — the minimal fidelity-producer change

Two files, no `src/`/`ui/`/manifest byte:

1. `harness/fidelity/montage.mjs` — gains `--prototype-dir`, **defaulting to the historical
   `path.join(FID, "prototype-1440x900")`**, and reads the prototype renders from it instead of the inlined
   join. A bare invocation is unchanged.
2. `harness/preview/fidelity.mjs` — passes its own `--prototype-dir PROTOTYPE_DIR` (the prototypes it just
   rendered) to the montage call, so a preview pack no longer needs its own copy.

## 5. Equivalent-regeneration proof (decoded pixels, real runs — not an exit code)

The pre-change producer was run **before any deletion** on the **real `fixture/` pack arrangement**, output
captured in scratch (`old-fixture-run1`, `old-fixture-run2`). The post-change producer was run on the **same
inputs** three ways, in the same arrangement:

| comparison | result |
|---|---|
| old producer, twice (determinism) | **5/5 views byte- and pixel-identical** |
| old vs new **default** (same pack arrangement) | **5/5 pixel-identical**, byte-identical; the emitted `.html` files are byte-identical too |
| old vs new **explicit `--prototype-dir`** (same dir) | **5/5 pixel-identical** |
| **old (pre-deletion pack) vs new (canonical prototype dir, same current captures)** | **5/5 pixel-identical** — the exact substitution the deletion requires |

**Nondeterminism, stated honestly.** A montage PNG is a Chromium rasterisation of a generated HTML page, so the
portable equivalence claim is **decoded-pixel identity**, not file-byte identity: rasterisation is
font/rasteriser/machine dependent, and a PNG encoder's chunk layout is not a product invariant. On *this* host
the render proved fully deterministic (the two pre-change runs were byte-identical, `ndiff=0`, `maxdelta=0`),
which is why byte and pixel comparisons agree; the pixel comparison is the claim that survives a different
host. Each `ndiff` above is 0 over `1480×{1884…2257}` frames.

**Negative control (the green can go red).** `--prototype-dir` pointed at a non-existent directory: the
producer reported `MISSING` for **all 5 views and wrote 0 PNGs** (exit 0, nothing fabricated) — the selector is
actually consulted, not ignored.

## 6. B1b — removal, precise ignore protection, and the negative controls

- `git rm -r` the five directories (**56 files / 9,898,367 B**).
- `.gitignore` gains three precise rules (plus a comment): `docs/ux-v2/fidelity/**/side-by-side/`,
  `docs/ux-v2/fidelity/fixture/prototype-1440x900/`, `docs/ux-v2/fidelity/fixture-tall/prototype-1440x900/`.
  The canonical `prototype-1440x900/` and every `current-1440x900/` are **not** ignored.
- **Ignore positive control:** `git check-ignore -v` names a rule for a path in each of the five removed
  directories (`**.gitignore:20/21/22`).
- **Ignore negative control:** `git check-ignore -v docs/ux-v2/fidelity/prototype-1440x900/overview-full.png
  docs/ux-v2/fidelity/current-1440x900/overview.png …` reports **nothing (exit 1 — not ignored)**.
- **Recoverability negative control:** a never-existing path does **not** resolve at the tag (exit 128) and the
  byte-identity equality discriminates (a removed path's tag blob differs from an unrelated retained file's) —
  the recovery check is not a rubber stamp.

**Retained (still tracked):** `docs/ux-v2/fidelity/prototype-1440x900/` (10) and `docs/ux-v2/fidelity/current-1440x900/`
(5) — the canonical prototype and current-capture evidence — plus the per-dataset `current-1440x900/` captures.

## 7. Crossref repair — only the generated-artifact documentation

**Edited** (the docs whose subject *is* the generated packs): `docs/ux-v2/fidelity/REVIEW.md`,
`docs/ux-v2/fidelity/REVIEW-PACKET.md`, `harness/fidelity/README.md`, `harness/preview/README.md`. Each gains a
short note that the `side-by-side/` montages and the per-pack prototype renders are **generated, never
tracked**, that the canonical prototype/current captures stay committed, the regeneration command, and the tag
recovery anchor. `harness/fidelity/README.md` also documents `--prototype-dir`.

**Deliberately not edited** (stated so silence is not mistaken for coverage):

- **B3/B4 documents are deferred in full** — the 14 non-acceptance review correspondence files and all 16
  UX-v2 unit/composition docs are untouched. In particular `docs/ux-v2/C4-progress.md` and
  `docs/ux-v2/C5-repositories.md` carry direct `fixture[-tall]/side-by-side/*.png` citations; those stay as the
  units' own historical evidence references rather than being rewritten to tag-recovery commands (the ruling:
  *"do not replace useful live documentation links with tag-recovery commands merely for file-count
  reduction"*). This ruling overrides the proposal's §4.1 suggestion to mark those citations.
- **`AGENTS.md`** is untouched (its "two follow-ups … recorded rather than done" paragraph needs its own
  approval; proposal §7).
- **Acceptance records** (incl. the C1/C3/C5 records that quote side-by-side paths) are historical reviewer
  verdicts — untouched.
- Prose that merely names "side-by-side" as a layout idea (`contract/fixtures.md`, `contract/interaction-spec.md`)
  is not a path citation — untouched.

## 8. Gates (measured)

| Gate | Command | Result |
|---|---|---|
| G0 baseline | `git rev-parse HEAD` · `git ls-files \| wc -l` · byte sum | `433950859f…` · **262** · **22,651,305** |
| G1 build/tests | `bun run check` | **126 pass · 0 fail · 764 expect()** |
| G1b bundles unchanged | `sha256sum ui/app.js actions/actions.js` before/after build | `3b63f1fb…` / `4e5a8be3…` — **unchanged**; `git status` clean for both |
| G2 records/public hygiene | `bun run harness:records` | all checks passed — **141 text files scanned (82 under docs/)**, no live endpoint, no identifier home path |
| G3 whitespace/conflict | `git diff --check` | clean |
| G4 count | `git ls-files \| wc -l`; removed rows tracked | **206**; **0** |
| G5 canonical retained | `git ls-files docs/ux-v2/fidelity/{prototype,current}-1440x900` | **15** |
| G1n ignore negative | `git check-ignore -v <canonical>` | not ignored (exit 1) |
| G5n recoverability negative | tag lookup of a bogus path; equality discrimination | fails as required — **discriminating** |
| G6 syntax | `node --check` both edited `.mjs` | OK (and `montage.mjs` ran 4× successfully) |

## 9. Commits and tip arithmetic

| Commit | What |
|---|---|
| *(impl)* | B1a `--prototype-dir`; B1b removal + `.gitignore`; crossref notes on the generated-artifact docs |
| *(record)* | this file |

Cumulative, all measured: **262 (pinned base) − 56 (B1b) = 206 tracked files / `12,752,938 B` after the
removal** (`12,756,357 B` once the `.gitignore` and document edits are included); this record adds the single
new path, so the tip holds **207 files**. The `ui/app.js` (`3b63f1fb…`) and `actions/actions.js` (`4e5a8be3…`)
hashes are unchanged from the base.

## 10. Recovery anchors

- **The 56 removed paths** — byte-identical at tag `ux-v2-composition-complete`
  (`git show ux-v2-composition-complete:<path>`) and at base `4339508`.
- **Regeneration** — `bun run preview:fidelity` (preview pack), or
  `bun harness/fidelity/render-prototypes.mjs … && bun harness/fidelity/montage.mjs --prototype-dir <dir> …`.
- **This branch** — `review/tier-b-b1-b2`, off `4339508`; the proposal stays on `review/tier-b-cleanup-plan`.

## 11. Boundaries — what this record does not cover

- **B3 and B4 are not done and are not implied.** The 14 correspondence files and 16 UX-v2 docs remain on the
  tip. Default of the proposal's reviewer questions 2 and 3 (retain) stands.
- **The two product follow-ups** (People metadata density; long Repository-name wrapping) are a separate
  product workstream (`DECISIONS.md` §14.6/§14.8) — no UI/`src/`/`ui/` change here.
- **`AGENTS.md`** needs its own approved edit to move the pack-hygiene follow-up out of "recorded rather than
  done".
- **`temp.md`** is left untouched (untracked owner artifact).
- **No tag was moved, deleted or rewritten; no `main` merge or push; no history rewrite; no instance restart;
  the shared preview on `:3010` was not disturbed** (the equivalence runs used only the committed read-only
  producer inputs and an isolated scratch output tree).
- **The write-pass producer** (`read-pass.sh` `DEFAULT_SHOTS`) remains deferred exactly as recorded.
