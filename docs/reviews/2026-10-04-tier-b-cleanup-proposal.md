# Tier B repository-cleanup proposal — REVIEW ONLY (2026-10-04)

**Status: proposal under review. Nothing is executed by this document.** It is written on the review-only
branch `review/tier-b-cleanup-plan`, based explicitly on the published V1 checkpoint
`4339508` (`origin/review/v1-accepted`). This branch carries **two new files and no other change** — this
proposal and its machine-readable manifest. It performs **no** deletion, move, tag, rewrite, merge or
force-push, and it changes **no** source, harness or runtime byte.

Companion artefact (exact, one row per tracked path):
[`2026-10-04-tier-b-cleanup-manifest.csv`](2026-10-04-tier-b-cleanup-manifest.csv) — 262 rows,
`path,bytes,blob,tier,class,proposal,product_carrying,recovery`.

Precedent this proposal continues: [`2026-10-03-repo-hygiene-acceptance-record.md`](2026-10-03-repo-hygiene-acceptance-record.md)
(Tier A, accepted and closed) and `AGENTS.md` § *What is tracked*.

---

## 1. Context that stands alone

The repository is the **Nakama research dashboard plugin** — public, one dashboard page plus five agent tools
over a research knowledge base. `AGENTS.md` is the reader's entry point (orientation, tooling, the
build→vendor→serve loop, evidence discipline, public-record hygiene, and § *What is tracked*). The estate
(compose files, instance env, service docs) lives outside the repo and is out of scope here.

**Verified checkout facts** (re-derived in this session; every command in §10):

| | value |
|---|---|
| proposal base commit | `433950859f0993df2cafd851e57572c9f260d7c2` (`review/v1-accepted`) |
| `origin/review/v1-accepted` | same SHA — the base is published and immutable |
| local `main` | `1affc9d` (15 commits ahead of `origin/main`) |
| `origin/main` | `4ef40237` — **unchanged** by this proposal |
| tags | `pre-ux-v2`, `ux-v2-complete`, `ux-v2-composition-complete`, `archive/h1-parked-attempt` |
| stash | none |
| untracked (worktree) | `temp.md` only — intentionally untracked owner artifact |
| ignored | `.hermes/`, `docs/ux-v2/fidelity/preview/`, `harness/preview/fixtures.json`, `node_modules/` |

**The bloat-cleanup plan the Tier A record names is not in this checkout.**
`.hermes/plans/2026-10-03_144616-repo-bloat-cleanup.md` does not exist (only
`.hermes/plans/2026-10-03_143357-visual-coherence-pass-v1.md` does; the whole `.hermes/` tree is
git-ignored). This proposal therefore **re-derives every quantity from `HEAD`** and does not depend on that
plan. Where its numbers disagree with the Tier A record, the difference is called out (§5).

**Why Tier B is in scope now.** Tier A's reviewer set the sequence V1 → then Tier B, and `AGENTS.md`
§ *What is tracked* already states the governing policy. Tier A recorded two Tier B follow-ups and one
deferral condition: the derived prototype/montage packs under `docs/ux-v2/fidelity/` "stay harness-coupled
while that area is in active visual use". V1 closed on 2026-10-04 (`docs/reviews/2026-10-04-v1-acceptance-record.md`;
`docs/ux-v2/V1-visual-coherence.md` § *V1 acceptance*), so that condition is now met.

---

## 2. The exact current manifest (measured on `4339508`)

**262 tracked files · 22,651,305 B (21.60 MiB).** Classified:

| class | tier | files | bytes | what it is |
|---|---|---|---|---|
| **keep** | — | 176 | 12,324,343 | source, harness, migrations, bundles, frozen contract, approved prototypes, canonical evidence, final acceptance records, live product docs |
| **generate** | B1/B2 | 56 | 9,898,367 (9.44 MiB) | committed montage packs + duplicate prototype renders — the policy already calls these *generated, never tracked* |
| **history** | B3 | 14 | 99,432 | non-acceptance review correspondence |
| **uncertain** | B4 | 16 | 329,163 (0.31 MiB) | UX-v2 unit / composition docs — a trimming candidate, but mixed with live product content (§5) |

Arithmetic a reviewer can re-run: **56 + 14 + 16 = 86 files**, **9,898,367 + 99,432 + 329,163 = 10,326,962 B**
(9.85 MiB) is the whole proposed scope; **262 − 86 = 176** retained.

Every row, with its git blob SHA and its recovery command, is in the CSV. This document does not restate
262 rows; it states the counts and names the non-`keep` sets exactly.

---

## 3. Fidelity producers and consumers (traced, not assumed)

The `docs/ux-v2/fidelity/` tree is the only large generated surface. Its tooling:

| instrument | reads | writes |
|---|---|---|
| `harness/fidelity/capture-current.mjs` | a served instance (proves page + asset + markers, fails closed) | `current-1440x900/<view>.png` |
| `harness/fidelity/render-prototypes.mjs` | **`docs/ux-v2/contract/prototypes/*.html`** (the frozen, approved prototypes) | `<out>/<stem>-{viewport,full}.png` |
| `harness/fidelity/montage.mjs` | `<FID>/prototype-1440x900/<stem>-full.png` **and** `<FID>/current-1440x900/<view>.png` | `<OUT>/<view>.{html,png}` (prototype above, running UI below) |
| `harness/preview/fidelity.mjs` | orchestrates the three above for a local preview | `docs/ux-v2/fidelity/preview/<dataset>/{current-1440x900,prototype-1440x900,side-by-side}/` (**git-ignored**) |

**The one positional dependency that gates B1/B2.** `montage.mjs` resolves the prototype render positionally:
`path.join(FID, "prototype-1440x900", …)`. There is **no `--prototype-dir` flag** today. Every committed pack
therefore carries its own copy of the prototype renders, and because the prototypes are dataset-independent
they are byte-identical across packs.

**Stored packs (measured), and their blob identity:**

| directory | files | bytes | note |
|---|---|---|---|
| `docs/ux-v2/fidelity/side-by-side/` | 12 | 2,110,262 | montage pack (review UI) |
| `docs/ux-v2/fidelity/fixture/side-by-side/` | 12 | 2,152,838 | montage pack (fixture) |
| `docs/ux-v2/fidelity/fixture-tall/side-by-side/` | 12 | 2,356,391 | montage pack (fixture, 1440×2600) |
| `docs/ux-v2/fidelity/prototype-1440x900/` | 10 | 1,639,438 | **canonical — retained** |
| `docs/ux-v2/fidelity/fixture/prototype-1440x900/` | 10 | 1,639,438 | duplicate of canonical (**same 10 blob SHAs**) |
| `docs/ux-v2/fidelity/fixture-tall/prototype-1440x900/` | 10 | 1,639,438 | duplicate of canonical (**same 10 blob SHAs**) |
| `docs/ux-v2/fidelity/current-1440x900/` | 5 | 707,271 | **canonical — retained** |

The three `prototype-1440x900/` copies are literally the same git blobs (`overview-full.png` =
`7e32672d…`, `people-full.png` = `b33ec509…`, … identical across all three). The deduplication is real, not
approximate.

**Consumers of the packs** (the cross-reference surface):
- Live/current docs: `docs/ux-v2/fidelity/REVIEW.md`, `REVIEW-PACKET.md`; `docs/ux-v2/COMPOSITION.md`,
  `STATUS.md`, `V1-visual-coherence.md`; the unit docs `C2-people.md`, `C4-progress.md`, `C5-repositories.md`,
  `MR-composition-merge-readiness.md`.
- Harness docs: `harness/fidelity/README.md`, `harness/preview/README.md`.
- **Historical records that must not be edited**: the C1/C3/C5 acceptance records quote side-by-side paths as
  the artefact the reviewer inspected. Those are verbatim reviewer verdicts; their paths stay as historical
  references and are recoverable by tag/time (see §5.4).

---

## 4. B1/B2 — montage / prototype normalization (56 files · 9,898,367 B)

**Scope:** the three `side-by-side/` montage packs and the two duplicate `prototype-1440x900/` copies. The
canonical `docs/ux-v2/fidelity/prototype-1440x900/` and `current-1440x900/` are **retained**.

**Evidence for removal.** `AGENTS.md` § *What is tracked* already classifies "side-by-side montages and their
HTML wrappers" as **generated, never tracked**, and the guarded upstream is the frozen approved prototypes
plus the instruments that render them. Nothing unique lives in the packs: every pixel is reproducible from
`docs/ux-v2/contract/prototypes/*.html` (frozen, retained) + the committed current capture + a served or
preview render. **Each of the 56 paths also exists byte-identically at tag `ux-v2-composition-complete`**
(3f08460) — verified 56/56 — so even the current bytes are recoverable from an immutable tag, not only by
regeneration.

**Dependency to clear first: `--prototype-dir`.** A per-pack duplicate prototype directory exists only
because `montage.mjs` resolves `<FID>/prototype-1440x900/` positionally. The minimal harness change:

1. `harness/fidelity/montage.mjs` — accept `--prototype-dir` (default kept as
   `path.join(FID, "prototype-1440x900")`, so the default behaviour and the preview pack shape are
   unchanged); use it in place of the inlined join.
2. `harness/preview/fidelity.mjs` — pass its own `--prototype-dir <its PROTOTYPE_DIR>` to the montage call.
   (It already renders `PROTOTYPE_DIR` and passes `--out` for capture; only the montage call lacks the flag.)

This is a **harness-only** change; it touches no `src/` or `ui/` byte and no product behaviour. It is **not
performed by this proposal** — it is specified here so the executor has an exact, bounded task.

**Proposed tasks (executor, after review):**

- **B1a** — the two-line harness change above + one rebuild proving the preview montage is unchanged.
- **B1b** — `git rm -r` the five directories (56 files), and add `.gitignore` rules so a future rebuild cannot
  re-track them:
  ```
  # Generated fidelity packs (policy AGENTS.md §What is tracked) — rebuilt by `bun run preview:fidelity`
  # / the fidelity instruments, never committed.
  docs/ux-v2/fidelity/**/side-by-side/
  docs/ux-v2/fidelity/fixture/prototype-1440x900/
  docs/ux-v2/fidelity/fixture-tall/prototype-1440x900/
  ```
- **B1c** — cross-reference fixes (§4.1).

### 4.1 Crossref fixes for B1/B2

Mirroring Tier A's A1 treatment ("referrers marked retired"), not silent deletion:

| referrer | refs | fix |
|---|---|---|
| `docs/ux-v2/fidelity/REVIEW.md`, `REVIEW-PACKET.md` | name `prototype-1440x900/` and `side-by-side/` as pack contents | add a line: these packs are generated/untracked; regenerate with `bun run preview:fidelity`; the reviewed bytes are at tag `ux-v2-composition-complete` |
| `docs/ux-v2/C4-progress.md`, `C5-repositories.md`, `C2-people.md`, `MR-composition-merge-readiness.md` | cite `fixture[-tall]/side-by-side/*.png` | mark the citation as a regenerable pack artefact (tag-recoverable) |
| `harness/fidelity/README.md`, `harness/preview/README.md` | document the paths | unchanged — the paths remain the *generated* paths; optionally note they are git-ignored |
| `docs/reviews/2026-10-0{2}-c{1,3,5}-acceptance-record.md` | cite the packs as the inspected artefact | **do not edit** — historical verdicts; add nothing |
| `docs/ux-v2/COMPOSITION.md`, `STATUS.md`, `V1-visual-coherence.md` | prose mentions | unchanged (they reference `REVIEW.md`, not the images) |
| `AGENTS.md` (the "two follow-ups … recorded rather than done" paragraph) | says the packs stay harness-coupled | **excluded** — see §7; requires a separately-approved edit |

### 4.2 Executable verification for B1/B2 (to run at execution time)

```bash
# precondition: harness change only, nothing else moved yet
git ls-files | wc -l                                   # expect 262  (baseline)
git check-ignore -v docs/ux-v2/fidelity/side-by-side/overview.png \
                     docs/ux-v2/fidelity/fixture/prototype-1440x900/overview-full.png  # each names a rule
git ls-files | grep -E 'side-by-side/|fixture(-tall)?/prototype-1440x900/' | wc -l    # expect 0
git ls-files | wc -l                                   # expect 206  (262 - 56)
# the retained canonical evidence is intact and still tracked:
git ls-files docs/ux-v2/fidelity/prototype-1440x900 docs/ux-v2/fidelity/current-1440x900 | wc -l  # 15
# regeneration still composes (preview pack is git-ignored output):
bun run preview:fidelity -- --no-rebuild               # exits 0; writes preview/<dataset>/side-by-side/
```

**Negative condition (the green must be able to go red):** delete one blob from the retained canonical tree
and re-run the tag-recoverability check — the check must fail; i.e. the verification distinguishes "recoverable
from the frozen prototypes" from "recoverable from nothing". Also assert the `git check-ignore` check is
discriminating: point it at a *retained* canonical path (`docs/ux-v2/fidelity/current-1440x900/overview.png`)
and it must report "not ignored".

---

## 5. B3/B4 — historical-doc trimming and crossref repair (30 files · 428,595 B)

The Tier A record scoped B3/B4 as "the non-acceptance review correspondence and the UX-v2 implementation
diaries: **30 files / 428,595 B**". This proposal **re-derives** that set and finds two problems with treating
it as an executable list.

### 5.1 Finding 1 — the Tier A aggregate is under-determined

Given the 262-file manifest, the stated totals (30 files, 428,595 B) are reproduced **exactly** by the
coherent split below (14 correspondence + 16 unit docs). But 428,595 B is matched by **112 arithmetically
equivalent 16-file subsets** of the candidate documents — the aggregate pins a *size*, not a *set*. A cleanup
task cannot be gated on an aggregate; it needs the explicit path list, which is why this proposal carries one.

### 5.2 Finding 2 — the aggregate conflates live product content ("the conflation")

Four of the sixteen reconstructed B4 documents carry **product-level decisions that are still live**, and are
exactly the source of the V1 follow-ups the tier record silently folded in:

- `docs/ux-v2/C2-people.md` — the People view.
- `docs/ux-v2/U9-density.md` — the density/emphasis pass.
- `docs/ux-v2/C4-progress.md` — the Progress view.
- `docs/ux-v2/C5-repositories.md` — the Repositories view.

`docs/ux-v2/V1-visual-coherence.md` (§ *V1-B* boundaries, § *V1 acceptance*) records the **two non-blocking
product follow-ups** — **People metadata density** and **long Repository-name wrapping** (`DECISIONS.md`
§14.6/§14.8) — and states they "ride the Tier B cleanup". That phrasing conflated a *product workstream* with
a *file-hygiene workstream*. **They are not the same task, and this proposal separates them:**

> **Tier B here is repository-artefact hygiene only** — removing or re-homing committed files.
> **The product follow-ups (People metadata density; long Repository-name wrapping) are a separate product
> workstream** recorded in `DECISIONS.md` §14.6/§14.8. They are **out of scope** of this proposal, and this
> proposal drives **no UI, `src/`, `ui/` or harness-behaviour change.** Nothing about them is decided here.

Consequently the 4 product-carrying documents are **not** proposed for removal; they are classified
`uncertain` and flagged `product_carrying=yes` in the CSV.

### 5.3 The proposed B3/B4 sets (explicit)

**B3 — non-acceptance review correspondence (14 files · 99,432 B):** all `docs/reviews/*` that are **not**
`*-acceptance-record.md`. Proposal: **remove from the tip** (recoverable, §5.4), after crossref fixes.
The 14: `2026-09-30-c4-c8-answers.md`, `2026-09-30-v2-plan-answer.md`,
`2026-09-30-v2-plan-review-request.md`, `2026-09-30-v2-structural-redesign.md`,
`2026-10-01-u4-step5-corpus-record.md`, `2026-10-02-composition-intake.md`,
`2026-10-02-composition-strategy.md`, `2026-10-02-u10-corpus-coverage.md`,
`2026-10-02-u10-resolved-fallback-fix.md`, `2026-10-02-u10-robustness-sweep.md`,
`2026-10-02-u11-merge-readiness.md`, `2026-10-02-u4-step6-axes-problems.md`,
`2026-10-02-u4-step7-grammar-propagation.md`, `2026-10-02-u4-step7-tag-navigation.md`.

**B4 — UX-v2 unit / composition docs (16 files · 329,163 B):** the reconstructed implementation diaries —
`U1-migration.md`, `U2-store.md`, `U3-surface.md`, `U4-progress.md`, `U6-topics.md`, `U9-density.md`,
`U10-harness.md`, `U11-contract-audit.md`, `U11-merge-readiness.md`, `MR-composition-merge-readiness.md`,
`H1-focus-visibility.md`, `C2-people.md`, `C3-handoff.md`, `C3-overview.md`, `C4-progress.md`,
`C5-repositories.md`. Proposal: **owner decision**, recommended to split:
- **12 pure implementation diaries** (`U1,U2,U3,U4,U6,U10,U11×2,MR,H1,C3×2`) — trim from the tip once
  `STATUS.md` is confirmed to carry everything a reader needs (STATUS already summarises each chunk).
- **4 product-carrying** (`C2-people`, `U9-density`, `C4-progress`, `C5-repositories`) — **retain** as live
  product docs, unless the follow-up decisions they document are first re-homed into `DECISIONS.md`.

### 5.4 Recoverability — verified, not asserted

Primary (immutable because published on `origin`): the **base checkpoint `4339508`** carries every path's
exact current bytes:

```bash
git show 4339508:docs/reviews/2026-10-02-composition-intake.md      # exact current bytes
git show 4339508:docs/ux-v2/U4-progress.md
```

Corroborating immutable tags (byte-identical check run per file):

| | B3 (14) | B4 (16) |
|---|---|---|
| byte-identical at `ux-v2-composition-complete` (3f08460) | **13** | 15 |
| **differs** at that tag (use base SHA) | `2026-10-02-composition-intake.md` (gained its A1 retirement annotation after the tag) | `docs/ux-v2/V1-visual-coherence.md`'s sibling set is unaffected; the one B4 doc that differs at the tag is flagged in the CSV |

The CSV's `recovery` column gives each row's exact command and whether the tag match is byte-identical.

### 5.5 Crossref fixes for B3/B4

Live referrers that would dangle (from `git grep`), each to be pointed at tag recovery or marked retired:

| file to trim | live referrers | fix |
|---|---|---|
| `2026-09-30-c4-c8-answers.md`, `2026-09-30-v2-plan-answer.md`, `2026-09-30-v2-structural-redesign.md` | `README.md` (lines 61/64/75), `docs/V2-PLAN.md` | retarget to `git show ux-v2-composition-complete:docs/reviews/<f>` or mark retired |
| `2026-10-02-composition-intake.md`, `composition-strategy.md` | `docs/ux-v2/DECISIONS.md` | retarget to tag/base-SHA recovery |
| `2026-10-02-u10-robustness-sweep.md` | `docs/ux-v2/U6-topics.md` | retarget (or leave if U6 is itself trimmed) |
| the 12 B4 diaries | `docs/ux-v2/STATUS.md` (and each other) | retarget to `git show <tag>:<path>` |

The acceptance records (`*-acceptance-record.md`) and the frozen contract are **not** touched.

### 5.6 Executable verification for B3/B4

```bash
# baseline
git ls-files docs/reviews | wc -l                      # expect 28 (14 acceptance + 14 correspondence)
git ls-files | wc -l                                   # 262
# after trim (12 diaries + 14 correspondence; 4 product docs retained)
git ls-files | wc -l                                   # expect 236
git ls-files docs/reviews | grep -c -- '-acceptance-record.md'   # expect 14  (all retained)
git ls-files docs/ux-v2 | grep -cE 'C2-people|U9-density|C4-progress|C5-repositories'  # expect 4 (retained)
# every trimmed path is still byte-recoverable:
for p in docs/reviews/2026-09-30-c4-c8-answers.md docs/ux-v2/U4-progress.md; do
  git cat-file -e "4339508:$p" && echo "recoverable: $p"
done
# no internal doc link points at a now-absent path the tip still needs:
git grep -nE 'docs/reviews/2026-09-30|docs/ux-v2/U1-migration|docs/ux-v2/U2-store' -- README.md docs/V2-PLAN.md docs/ux-v2/DECISIONS.md docs/ux-v2/STATUS.md
```

**Negative condition:** run the link check *before* the crossref fix — it must report the dangling citations;
after the fix it must report none. A check that is green both ways proves nothing.

---

## 6. Retained — explicitly out of the removal scope

`keep` = **176 files / 12,324,343 B**, including all of:

- **Source / build / manifest** — `src/`, `harness/`, `migrations/`, `vendor/`, `types/`, `ui/app.js`,
  `actions/`, `nakama.plugin.json`, `package.json`, `bun.lock`, `tsconfig.json`, `LICENSE`, `README.md`,
  `AGENTS.md`, `.gitignore`.
- **Repo skills** — `.agents/skills/**` (the four contributor procedures, incl. `acceptance-pass`,
  `dashboard-build-and-serve`, `public-records-hygiene`, `keyboard-focus-pass`).
- **Frozen contract + approved prototypes** — `docs/ux-v2/contract/**` (Markdown specs, `manifest.json`,
  and `contract/prototypes/*.html`).
- **Canonical evidence** — `docs/corpus/**`, `docs/layout-fixtures/**`, `docs/screenshots/**`,
  `docs/ux-v2/focus-*.txt`, and the canonical `docs/ux-v2/fidelity/{prototype-1440x900,current-1440x900}/`.
- **Final acceptance records** — all 14 `docs/reviews/*-acceptance-record.md` (incl.
  `2026-10-04-v1-acceptance-record.md`).
- **Live product docs** — `docs/ux-v2/{DECISIONS,STATUS,README,BASELINE,COMPOSITION,V1-visual-coherence}.md`,
  `docs/ux-v2/fidelity/{REVIEW,REVIEW-PACKET}.md`, `docs/{OPEN-QUESTIONS,PLATFORM-CONTEXT,V2-PLAN,layout-rework-brief}.md`.

## 7. Excluded / separately-gated — **not** part of this proposal

- **The product follow-ups** — People metadata density and long Repository-name wrapping. A separate product
  workstream (`DECISIONS.md` §14.6/§14.8). **No UI work here.** (§5.2.)
- **`AGENTS.md` changes** — the "two follow-ups … recorded rather than done" paragraph will need a one-line
  update once B1/B2 lands, but **`AGENTS.md` is excluded** from this proposal and needs its own approval.
- **The write-pass producer** — `harness/read-pass.sh` still uses one `DEFAULT_SHOTS` for both passes, so a
  write run publishes into the read-shot directory; `.gitignore` holds the line. Remains **deferred as
  recorded** in `AGENTS.md` and the Tier A record; not touched.
- **`temp.md`** — an untracked owner working artifact. **Explicit owner decision; no deletion here.** This
  proposal neither stages nor removes it. (Its content is absorbed into `V1-visual-coherence.md` §V1-B; the
  Tier A record's editorial note covers it.)
- **No tag is moved, deleted or rewritten; no `main` merge or push; no history rewrite.**

## 8. Bounded stage gates and negative conditions

Every gate carries a command, an expected result and an **empty "Actual"** column for the executor. The gate
is written so a failure is attributable to a change, not to a dirty tree.

| Gate | After | Command | Expected | Actual |
|---|---|---|---|---|
| **G0** baseline (before any change) | base `4339508` | `bun run check && bun run harness:records && git diff --check` | check green (126·0·764); records green; no whitespace error; `git status` clean | |
| **G0b** — baseline count | base | `git ls-files \| wc -l` · `git ls-tree -r -l HEAD \| awk '{s+=$4} END{print s}'` | `262` · `22651305` | |
| **G1** — B1/B2 applied | B1a+B1b | §4.2 checks | 206 tracked; 0 side-by-side/duplicate rows; 15 canonical fidelity rows; harness behaviour unchanged (`bun run preview:fidelity -- --no-rebuild`) | |
| **G1n** — B1/B2 negative | G1 | point `git check-ignore` at a retained canonical path | must report "not ignored" | |
| **G2** — B3/B4 applied | B3+B4(12 diaries) | §5.6 checks | 236 tracked; 14 acceptance records retained; 4 product docs retained; every trimmed path `git cat-file -e 4339508:<p>`; zero dangling citations | |
| **G2n** — B3/B4 negative | before crossref fix | the §5.6 link check | must list the dangling citations (then be empty after the fix) | |
| **G3** — after every change | G2 | `bun run check && bun run harness:records && git diff --check` | green; records scan count drops with the removed text files (matches the tracked removal) | |

**Negative conditions are mandatory.** A counts-only gate can pass on a tree that lost the wrong files; each
phase carries one check that must go red when the invariant is broken (G1n, G2n), mirroring the V1 discipline
that "a green run must be able to go red".

## 9. Reviewer questions (each with a recommendation and a default)

1. **B1/B2 — approve the 56-file removal + the `--prototype-dir` harness change?** *(Recommend: yes; it is the
   already-stated policy, the duplicates are byte-identical, and all 56 bytes survive at
   `ux-v2-composition-complete`.)* **Default if unanswered:** no removal; proposal stays open.
2. **B4 — trim the 12 diaries, retain the 4 product-carrying docs?** *(Recommend: yes, and only after a
   `STATUS.md` completeness read.)* **Default if unanswered:** retain all 16 (B4 = no-op).
3. **B3 — remove the 14 correspondence files after retargeting the `README.md`/`V2-PLAN.md`/`DECISIONS.md`
   links to tag recovery?** **Default if unanswered:** retain (B3 = no-op).
4. **Should the canonical `docs/ux-v2/fidelity/prototype-1440x900/` also be untracked** (it is itself a
   render of the frozen prototypes), leaving only `current-1440x900/` committed? *(Recommend: not in this
   proposal — keep the canonical capture committed; it is the pack's evidence.)*
5. **Do the two product follow-ups get their own proposal** (product, not hygiene), rather than riding Tier B?
   *(Recommend: yes.)*
6. **`temp.md`** — owner decision: keep it untracked as-is, or delete it now that its findings are absorbed
   into `V1-visual-coherence.md` §V1-B? *(Recommend: owner decides; **no action in this proposal**.)* **Default:**
   leave untracked.

## 10. How every claim here was derived (re-runnable)

```bash
git rev-parse HEAD                                  # 433950859f0993df2cafd851e57572c9f260d7c2
git ls-files | wc -l                                # 262
git ls-tree -r -l HEAD | awk '{s+=$4} END{print s}'
git ls-files | grep -E 'side-by-side/|fixture(-tall)?/prototype-1440x900/' | wc -l        # 56
git ls-files | grep -E 'side-by-side/' | wc -l      # 36
git grep -l -F 'side-by-side' -- . | grep -v side-by-side/  # consumers
git ls-tree -r HEAD docs/ux-v2/fidelity/fixture/prototype-1440x900 \
  | awk '{print $3}' | sort -u                       # 10 blobs == the canonical dir's 10
for p in <each proposed path>; do git cat-file -e "ux-v2-composition-complete:$p"; done     # tag presence
```

## 11. Unknowns and stated limits

- **This proposal is review only.** Nothing is removed, moved, tagged, merged or force-pushed. The harness
  `--prototype-dir` change is specified, **not implemented**.
- **No served acceptance was run** — correctly so: this branch changes only documentation and does not alter
  any runtime, `src/`, `ui/` or harness byte, so the served pass would measure nothing new. The applicable
  hygiene/diff/records checks are run on the branch and reported in the commit message.
- **The bloat-cleanup plan the Tier A record cites is absent** from the checkout; this proposal independently
  re-derives all counts and does not rely on it.
- **The Tier A B3/B4 aggregate is under-determined** (§5.1) and **conflates product content** (§5.2); the
  manifest here pins explicit paths, and the 4 product-carrying docs are deliberately left to the owner.
- **Not verified in this session:** the executor-time regeneration of the montage packs against a live served
  instance (needs an instance, which is outside this review-only branch). The regeneration *composes* from the
  frozen prototypes and the committed capture; that is the invariant this proposal relies on.
