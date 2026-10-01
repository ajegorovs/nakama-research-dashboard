# Status — UX v2

**Live page.** Updated as each chunk lands; every number is a run's own summary line, and every claim
here should be checkable with `README.md` § "Run the acceptance pass".

Last updated at the end of **U0**.

## Where things stand

| Chunk | State | Evidence |
|---|---|---|
| **U0** Contract, baseline, runnable pass | **done** | `contract/` published verbatim · `BASELINE.md` · the pass moved in-repo and reproduces from a *fresh clone* on a *pristine checkout* (measured below) · PR #1 merged, tagged `pre-ux-v2` (`9b48f99`) · three harness defects found by that run and fixed |
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

Measured from a clone of this repository, on a pristine upstream Nakama checkout (0.4.35), against
instances the run started itself from empty data roots — one per dataset, never shared:

| Dataset | Viewport | Result | Summary line |
|---|---|---|---|
| corpus (695-call replay) | 1440×900 | 42 pass · 0 fail · 7 skip | `read pass: all checks passed; 7 skipped for want of a subject in this corpus` |
| corpus | 1280×800 | 42 · 0 · 7 | same |
| fixture (applied) | 1440×900 | 49 · 0 · 0 | `read pass: all checks passed; 0 skipped for want of a subject in this corpus` |
| fixture | 1280×800 | 49 · 0 · 0 | same |

`bun run check` unchanged: **82 pass · 0 fail · 472 expect()**.

The dashboard URL in all four transcripts is `http://127.0.0.1:3013` — the clone's own web server. An
earlier attempt to verify this ran its passes against the *estate's* dashboard (its transcript header says
so), which proves the pass runs but proves nothing about a clone; it is recorded here because the
difference matters and it is exactly the kind of thing a summary line cannot tell you.

The contract's prototypes render, but nothing about the new views exists yet — the numbers above are the
*v1* page on a fresh clone, which is the point of a baseline.

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
| Regression / harness | 5 | corpus and fixture both render on a clean clone; the rules are unchanged so far | U10 |

## What the clean-clone run cost us (and what a reviewer should know)

Running the recipe from a clone, with no help, found four things. They are all fixed, and each one is the
kind that only shows up when somebody who did not write the script follows the README:

1. **The documented credentials did not work.** `read-pass.sh` demanded `NAKAMA_DEV_EMAIL` /
   `NAKAMA_DEV_PASSWORD`; every other script and the README's env file use `NAKAMA_EMAIL` /
   `NAKAMA_PASSWORD`. So the documented `--env-file` path failed with "not set" unless the shell also
   happened to export the other pair. The documented names are now primary and the DEV pair is an alias —
   with the documented names *winning*, because a leftover export must not override the file you handed
   over.
2. **`--env-file` used to lose to the environment.** The JS loader let an existing variable beat the file,
   so a shell that still had `NAKAMA_URL` from an earlier instance silently redirected a run elsewhere. It
   now matches `read-pass.sh`: the file wins.
3. **The README's web-server line was wrong in both directions.** `bun run dev:web` exists (so "it does
   not exist" is wrong), but it starts a server of its own when `NAKAMA_SERVER_URL` is not answering and
   it takes no port flag, so it cannot serve two datasets side by side. The recipe runs vite from
   `apps/web` directly, and says why.
4. **A mid-replay `429 Too many requests` used to read as "the dataset is NOT this transcript."** The
   replayer now retries 429/503 with backoff (honouring `Retry-After`) and, if a call still fails, prints
   the exact `--force --start N` that resumes. Honest caveat: we could not reproduce the 429 ourselves —
   two full 695-call replays on a fresh 0.4.35 instance were accepted end to end (34.8 s and 64.1 s) — so
   the backoff is insurance, not a fix for a reproduced bug. The rate limiter is real
   (`apps/server/src/http/rate-limit-middleware.ts`, budgets settable via `NAKAMA_RATE_LIMIT_MAX`); the
   conditions that trip it are not pinned down.

## Open

- **D3 is a deliberate relaxation.** The corpus gains one owner-authored problem statement, and
  `docs/corpus/README.md` must say so; a reader who knows the corpus's "nobody chose its state" claim
  should be able to see exactly where it now stops being true.
- **The plugin is confirmed on upstream 0.4.35**, which is newer than the instance this estate runs
  (0.4.31). Install, replay, fixture apply and both passes all work there; that is a stronger statement
  than "it builds", and it is the version a reviewer will get from upstream.
- **Fixture coverage for A–J** is U10's job, but four of them (`usable`-but-incomplete, reopened axis,
  plan absent/present, problem spanning repositories) cannot even be written until U1/U3 land — the
  fixture work is gated on the model, not on the layout.

## What a reviewer can usefully do at this point

- Re-run the pass from a clone (`README.md` § "Run the acceptance pass") and say whether the recipe
  worked — a step that has to be guessed is a defect worth reporting as much as a failing check. Four of
  those came out of the first attempt; assume there are more.
- Read `contract/` against `docs/ux-v2/README.md` § "Chunk map" and disagree with the mapping: a
  requirement with no chunk, or a chunk that does not trace to a requirement, is cheapest to fix now.
- Say whether the six deltas in that file read like the redesign you wrote, especially the two that
  change the data model (`Problem`, `Plan`) — those are the expensive ones to redo.
