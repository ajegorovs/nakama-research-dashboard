# C5 acceptance record — Repositories convergence (2026-10-02)

**Unit:** C5, the last composition unit. **Branch:** `composition/c1-topics`. **Build judged:** revision 511 /
`0.2.0+dev.a4431120a2da`, served asset sha256
`82e64e29fbca3069c7b30cbdef0ea4a0c67031cbcb18dff0c34abd44e36d9523`.

This is the review trail for the verdict below. The unit's own doc is
[`../ux-v2/C5-repositories.md`](../ux-v2/C5-repositories.md); the rulings it stands on are
[`../ux-v2/DECISIONS.md`](../ux-v2/DECISIONS.md) §10.

## The verdict (reviewer, 2026-10-02, verbatim)

> I inspected both the first-screen and tall fixture montages and read the C5 record. **C5 passes visual
> fidelity.**
>
> The running Repositories view now reads as the same composition as the prototype rather than merely sharing
> its index/detail skeleton:
>
> - compact repository index on the left;
> - one persistent repository detail on the right;
> - **Current work** is unmistakably the dominant lane;
> - Recent activity is bounded and subordinate;
> - Supports and People sit in the contextual rail;
> - terminal work is honestly folded rather than mixed into "Current work";
> - the populated fixture subject proves the full composition rather than only the bare-repository case.
>
> The real fixture is much denser than the hand-authored prototype because `fixture/crowded-card` genuinely has
> four current axes plus terminal work. I do not regard that as composition drift. The hierarchy survives the
> density.

> **C5 functional acceptance: closed.**
> **C5 geometry/density acceptance: closed.**
> **C5 visual fidelity: closed.**
> **C5: accepted.**
> **Composition C1–C5: complete.**
>
> There is no further C5 product work I would require before merge readiness.

## Classification

| aspect | verdict |
|---|---|
| functional (the lane, the fold, the rail, the row grammar, the bounded activity) | **accepted — closed by the reviewer** |
| geometry / density (lane dominance, rail subordination, the denser real fixture) | **accepted — closed by the reviewer** |
| visual fidelity (first-screen and tall fixture montages against the prototype) | **accepted — closed by the reviewer** |

## The two absences, ruled on

> **Repository Notes: accept the omission.** There is no repository-level note in `RepositoryRollup`; putting a
> Notes card there would mean either fabricating prose or borrowing topic-owned information and changing its
> scope. The positive omission marker is exactly the right treatment. If repository notes become a real product
> concept later, that is a data/action/projection decision, not C5 polish.
>
> **`Stale` tag: accept the omission.** The repository row has authoritative recency and authoritative
> current-axis information, but no repository-level stale claim in its rollup. Deriving `stale` from "no current
> axis" would give the word a second meaning. Showing the actual age plus `no current axis` is more truthful.
>
> I would keep both decisions in §10 exactly as they are.

`DECISIONS.md` §10 is therefore **unchanged** by this verdict — the two absences stay recorded as decisions
there, and this record is the acceptance that points at them.

## The heading / order question, ruled on

> `Alphabetical by name · factual context, never scored` is correct.
>
> This is the same principle we established in C3: interface copy describes the ordering the payload actually
> guarantees. The mock's "Most recently active first" is not a reason to lie about alphabetical ordering.

## The record, and the build it points at

| dataset | viewport | record | result |
|---|---|---|---|
| fixture | 1440×900 | `docs/layout-fixtures/verify-fixture-read-1440x900.txt` | 180 pass / 0 fail / 1 skip (181, 22:44:01) |
| fixture | 1280×800 | `docs/layout-fixtures/verify-fixture-read-1280x800.txt` | 179 pass / 0 fail / 2 skip (181, 22:45:08) |
| corpus | 1440×900 | `docs/corpus/verify-read.txt` | 151 pass / 0 fail / 28 skip (179, 22:47:12) |
| corpus | 1280×800 | `docs/corpus/verify-read-1280x800.txt` | 150 pass / 0 fail / 29 skip (179, 22:42:50) |

`bun run check` 126 pass / 0 fail · `typecheck:host` 0 diagnostics · `harness:identity` 82/82. Visual gate:
`docs/ux-v2/fidelity/fixture/side-by-side/repositories.png` and
`docs/ux-v2/fidelity/fixture-tall/side-by-side/repositories.png`, both on `fixture/crowded-card` (chosen by
measurement) and both on the digest above.

**The commit and the tested bundle, stated precisely** (the reviewer's housekeeping point): the bundle under
test is the C5 **implementation tree** and its digest is unchanged by the two commits that follow it on the
branch, because both are documentation-only — `c1b2059` (the implementation plus its records and montages) and
`f73e430` (one documentation sentence naming the estate's `AGENDA.md` as outside this repository). No build was
manufactured to make a commit SHA equal an evidence SHA; the correspondence claimed here is tree → digest, not
SHA → SHA.

## The lost run, recorded separately (as the reviewer directed)

The first recorded corpus 1440×900 attempt **aborted** (exit 2, committed record untouched) because the dev
instance answered `500 SQLiteError: database is locked` (`SQLITE_BUSY_RECOVERY`, requestId `aa21cc5e`) at
22:41:23; `get_topic`'s pane stayed empty, three axis-hierarchy checks read that as a composition fault, and the
block's closing click waited 30 s on a disclosure that did not exist. Acceptance was taken from the clean re-run
on the fixed harness (151 pass / 0 fail), and the store/runtime item remains open in the estate's `AGENDA.md`
with this occurrence. No sleep or settle delay was added: the harness change makes a lost read **fail a check**
instead of aborting the run, which is a verdict where there was previously a lost record.

## What this verdict closes

**Composition C1–C5 is complete** and C5 is accepted. The next phase is not another visual unit: it is the
**composition-phase merge-readiness pass** for the 35 commits between `main` and `composition/c1-topics`, run on
this same build, recorded in
[`../ux-v2/MR-composition-merge-readiness.md`](../ux-v2/MR-composition-merge-readiness.md).
