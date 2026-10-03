# Repo hygiene (Tier A) and branch hygiene — acceptance record (2026-10-03)

**Unit:** repository hygiene, Tier A — the zero-code-risk cleanup of the public tree, plus the stale remote
branch retirement. Taken on branch `chore/repo-hygiene` off `main` at `0156f37`, fast-forwarded as `849cd51`.

Unlike a UX-v2 unit there is no served build to judge. The judged artifact is the **tracked tree** and the
gates that read it: `bun run check` and `bun run harness:records`. The governing policy this produces is
[`AGENTS.md`](../../AGENTS.md) § *What is tracked*.

The analysis that produced the work is a local, git-ignored planning artifact
(`.hermes/plans/2026-10-03_144616-repo-bloat-cleanup.md`), which is why this record exists: the verdict and the
deferred scope need a durable, public home.

## The verdict (reviewer, 2026-10-03, verbatim)

> This cleanup looks well executed.
>
> The result is exactly the kind of simplification we wanted before V1: **54 tracked files removed, ~8 MB
> reclaimed, remote branch ambiguity eliminated, and the only remaining untracked file is intentionally
> `temp.md`.**
>
> I agree with both deviations/choices:
>
> - **A4 wider doc fix:** correct. Once `.revision-*` files were removed from the tip, leaving AGENTS/skill text
>   claiming they lived beside the current record would have made the repo internally false. Pointing recovery at
>   immutable tags is better.
> - **Repo tracking policy in `AGENTS.md`:** I would keep it there. That is repository-operation guidance, not a
>   UX-v2 product clarification. `DECISIONS.md` should stay focused on product/UX decisions.
>
> The branch cleanup is also clean now:
>
> - `main` only;
> - `archive/h1-parked-attempt` preserves the one unique H1 commit;
> - no force-pushes;
> - no moved tags.
>
> I would consider Tier A **accepted and closed**.
>
> The important next step is to avoid overlapping Tier B with V1. I'd keep the sequence as:
>
> 1. V1 Phase 0–2 on current `main`
> 2. visual checkpoint
> 3. complete V1 visual pass and acceptance
> 4. only then Tier B cleanup:
>    - B1/B2 montage/prototype normalization
>    - B3/B4 historical-doc trimming
>
> The write-pass screenshot producer issue can remain deferred exactly as recorded.
>
> One practical consequence: V1 now runs on a cleaner baseline, and `temp.md` is the only intentional working
> artifact. Once V1 has absorbed its findings into the V1 record, delete `temp.md`.
>
> So my classification now is:
>
> **Repo hygiene Tier A: accepted.**
> **Branch hygiene: accepted.**
> **Main is ready for V1.**
> **Tier B remains intentionally deferred until after V1.**

## Classification

| aspect | verdict |
|---|---|
| repo hygiene Tier A (A1–A5) | **accepted — closed by the reviewer** |
| branch hygiene (4 stale remotes retired, H1 commit tagged first) | **accepted — closed by the reviewer** |
| tracking policy in `AGENTS.md` (rather than `DECISIONS.md`) | **accepted — kept where it is** |
| the two deviations (A4's wider doc fix; the policy's home) | **both endorsed** |
| Tier B (montage/prototype normalization; historical-doc trimming) | **deferred by design until after the V1 visual pass** |
| write pass publishing into the read-shot directory | **deferred, recorded in `AGENTS.md`** — not closed by this record |
| `temp.md` | **intentionally kept untracked**; deletion gated on V1 absorbing its findings |

## What was measured

| | before | after |
|---|---|---|
| tracked files | 313 | **259** |
| tracked bytes | 32,041,846 | **23,983,442** (22.87 MiB) |
| remote branches | 5 (`main` + 4 stale) | **1** (`main`) |
| untracked entries | 3 | **1** (`temp.md`) |
| `temp.md` | untracked working artifact | untracked, deliberately |

Removals, by task: A1 `docs/layout-pr/` **29 files / 4,845,374 B**; A2+A3 write-pass shots **14 files /
2,863,639 B**; A4 `.revision-*` checkpoints **11 files / 352,180 B** — total **54 files / 8,061,193 B**.
A5 removed nothing from the index: it put the generated `docs/ux-v2/fidelity/preview/` tree (**52 files /
10,233,844 B**) under `.gitignore`, so it left `git status` and can no longer be swept in by `git add -A`.
Bytes here are the measured sums, not estimates; the tracked-byte total is 2,789 B above the pure subtraction
because the policy prose added to `AGENTS.md` and the ignore comments in `.gitignore` land in the same commit
range.

## Gates (measured, not assumed)

| Gate | Command | Result |
|---|---|---|
| G0 (baseline, before any deletion) | `bun run check` | **126 pass · 0 fail · 764 expect()**; `git status` clean afterwards → `ui/app.js` rebuilt byte-identical |
| G0b | `bun run harness:records` | all checks passed — **184 text files scanned** |
| G1 (after Tier A) | `bun run check` | **126 pass · 0 fail · 764 expect()** |
| G1b | `bun run harness:records` | all checks passed — **168 files scanned** (16 fewer text files) |
| G1c | `git ls-files \| wc -l` | **259** |
| G1d | `git grep -l 'layout-pr' -- .` | only the 4 referrers updated in A1, each marked retired |
| final (on merged `main`) | `bun run check` + `harness:records` | both green; working tree clean except `temp.md` |

The ignore rules are asserted, not asserted-by-eye: `git check-ignore -v` was run for
`docs/screenshots/research-dashboard-write-detail.png`,
`docs/layout-fixtures/screenshots/{1440x900,1280x800}/research-dashboard-write.png` and
`docs/ux-v2/fidelity/preview/`, and each reported its matching `.gitignore` line.

## Commits

| Commit | Task |
|---|---|
| `890b15f` | A1 — retire `docs/layout-pr/`; 4 referrers marked retired |
| `dbe5eb6` | A2+A3 — drop the 14 write-pass shots; add the `.gitignore` rules |
| `f665e4b` | A4 — drop the 11 `.revision-*` checkpoints; `AGENTS.md` and the acceptance-pass skill now state where a checkpoint lives |
| `f7db220` | A5 — ignore the generated preview montage tree |
| `849cd51` | tracking policy recorded in `AGENTS.md`; `cleanup.md` (the reviewer's task copy) deleted, `temp.md` kept |

Branch hygiene, executed separately from the working-tree cleanup: annotated tag
`archive/h1-parked-attempt` → `c6852df`, pushed and verified live **before** `h1-keyboard-focus` was deleted;
`composition/c1-topics`, `layout/rework` and `ux-v2` were each confirmed a true ancestor of the live `main`
before deletion. No tag was moved and no force-push occurred.

## Boundaries — what this record does not cover

- **Tier B is not done and is not implied.** It is deferred until after the V1 visual pass, because it touches
  the fidelity/harness paths and the UX-v2 documents V1 will use. Remaining scope, measured on `849cd51`:
  - **B1/B2** — the three `side-by-side/` montage packs and the two duplicate `prototype-1440x900/` copies:
    **56 files / 9,898,367 B** (9.44 MiB). Needs a `--prototype-dir` change to `harness/fidelity/montage.mjs`,
    which currently resolves `<pack>/prototype-1440x900/` positionally.
  - **B3/B4** — the non-acceptance review correspondence and the UX-v2 implementation diaries:
    **30 files / 428,595 B** (0.41 MiB). (131 B more than the pre-cleanup measurement: two files in this set
    gained their A1 retirement annotation.)
  - Total remaining: **86 files / 10,326,962 B** (9.85 MiB).
- **`docs/screenshots/` is not legacy and was not removed.** It is the read pass's live output target
  (`harness/read-pass.sh` `DEFAULT_SHOTS`) and the top-level `README.md` embeds six of its images. Only the
  unpublished write-pass shots inside it were removed.
- **The write-pass producer is unchanged.** `read-pass.sh` still uses one `DEFAULT_SHOTS` for both passes, so a
  write run still writes into the read-shot directory; `.gitignore` holds the line rather than the producer
  being fixed. Recorded as a follow-up in `AGENTS.md`.
- **`temp.md` is deliberately untracked and still present.** It is the source of the current visual findings for
  the V1 visual-coherence pass; it is deleted only once V1 has absorbed those findings into the V1 record.
- **No V1 work is assessed here.** This record closes a repository-hygiene pass, not a product unit.
