# Status — UX v2

**Live page.** Updated as each chunk lands; every number is a run's own summary line, and every claim
here should be checkable with `README.md` § "Run the acceptance pass".

Last updated at the end of **U0**.

## Where things stand

| Chunk | State | Evidence |
|---|---|---|
| **U0** Contract, baseline, runnable pass | **nearly done** | `contract/` published verbatim · `BASELINE.md` · the pass moved in-repo and reproduced locally (below) · PR #1 merged as `pre-ux-v2` (`9b48f99`) · an independent clean-clone verification was run and is being reconciled — see "Open" |
| U1 Migration 004 (problems, plans, state log, `usable`) | not started | — |
| U2 Store read models | not started | — |
| U3 Action surface + skill | not started | — |
| U4 Five tabs + canonical navigation | not started | — |
| U5 Overview | not started | — |
| U6 Topics | not started | — |
| U7 Progress | not started | — |
| U8 People + Repositories | not started | — |
| U9 Primitives + density | not started | — |
| U10 Fixtures A–J + new checks | not started | — |
| U11 Screenshots, docs, handoff | not started | — |

## What the pass says right now

Reproduced **after** the pass moved into the repository (corpus dataset, both viewports) — the harness's
own summary line, not a re-count of `PASS` lines:

| Dataset | Viewport | Summary line |
|---|---|---|
| `docs/corpus/` | 1440×900 | `read pass: all checks passed; 7 skipped for want of a subject in this corpus` (42 pass · 0 fail) |
| `docs/corpus/` | 1280×800 | `read pass: all checks passed; 7 skipped for want of a subject in this corpus` |

`bun run check` unchanged: **82 pass · 0 fail · 472 expect()**.

The fixture dataset is **not** re-run by us yet: the pass was reproduced on the corpus only, because the
two datasets must not share an instance and the fixture needs its own. The independent clean-clone run
below is what exercises both, on fresh instances, from the README alone. Until it reports, treat the
fixture's 49·0·0 as the **baseline** figure (measured before the port, `BASELINE.md`), not as a
post-port measurement.

## Acceptance checklist — by section

The contract's list is 68 items in nine sections. Section state is what has been *demonstrated*; a chunk
may still add items to a section it does not own.

| Contract section | Items | State | Owner chunk |
|---|---|---|---|
| Global | 8 | 2 already true (read/navigation distinction, no broad CRUD reappearing) · 6 need U4–U9 | U4–U9 |
| Tags and navigation | 8 | none — no routing exists yet | U4 |
| Overview | 7 | none — no Overview view yet | U5 |
| Topics | 8 | the read/edit split is in place; index+detail, folding and de-CRUD-ing are not | U6 |
| People | 6 | the no-ranking rule already holds; bio/role, involvement and tags need the new grammar | U8 |
| Repositories | 6 | the "not the parent of an axis" rule already holds; the rest needs the new grammar | U8 |
| Progress | 14 | none — the view is being rebuilt around Problem + Activity | U2, U7 |
| Semantics / librarian behavior | 6 | stale/confidence/human-steering rules are the point of U1–U3 | U1–U3 |
| Regression / harness | 5 | corpus and fixture both render; the rules are unchanged so far | U10 |

## Open

- **The independent clean-clone verification** (a fresh clone of this repo, a pristine upstream Nakama
  checkout, the README as the only instruction) is running; its result — including every place the
  README was wrong — is reconciled into this page and the README before U0 is called done.
- **D3 is a deliberate relaxation.** The corpus gains one owner-authored problem statement, and
  `docs/corpus/README.md` must say so; a reader who knows the corpus's "nobody chose its state" claim
  should be able to see exactly where it now stops being true.
- **Fixture coverage for A–J** is U10's job, but four of them (`usable`-but-incomplete, reopened axis,
  plan absent/present, problem spanning repositories) cannot even be written until U1/U3 land — the
  fixture work is gated on the model, not on the layout.

## What a reviewer can usefully do at this point

- Re-run the pass from a clone (`README.md` § "Run the acceptance pass") and say whether the recipe
  worked — a step that has to be guessed is a defect worth reporting as much as a failing check.
- Read `contract/` against `docs/ux-v2/README.md` § "Chunk map" and disagree with the mapping: a
  requirement with no chunk, or a chunk that does not trace to a requirement, is cheapest to fix now.
- Say whether the six deltas in that file read like the redesign you wrote, especially the two that
  change the data model (`Problem`, `Plan`) — those are the expensive ones to redo.
