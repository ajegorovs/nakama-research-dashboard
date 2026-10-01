# U3 — the action surface

The store has held the V2 semantics since U2. Nothing external could reach them: no action created a
problem, none performed a state transition, and the manifest's axis-state enum did not even contain
`usable`. U3 makes the semantics *reachable*, and proves it at the boundary rather than at the store API.

Status of the reviewer's ten steps:

| # | Step | State |
|---|---|---|
| 1 | real typechecking (`typecheck` in `bun run check`) | ✅ `b04eeb4` |
| 2 | `usable` in the exposed axis-state schema | ✅ |
| 3 | the transition writer exposed through the action path | ✅ `transitions[]` on `reconcile_topic` |
| 4 | problem creation/update and resolution/reopen | ✅ `problems[]` + `transitions[]` |
| 5 | plan / plan-step operations as the contract needs | ✅ `plans[]` (with `steps[]`), read back via `get_topic` |
| 6 | the human-authored refusal preserved across the boundary | ✅ (and refined — see below) |
| 7 | structured conflict / no-op / invalid-state / refusal behaviour | ✅ `kind` on every refusal |
| 8 | the librarian skill, including history retention | ✅ |
| 9 | re-vendor + live action-level proofs | ✅ release minted; live Axis *and* Problem lifecycle proofs through the action route |
| 10 | rerun corpus + fixture acceptance | ✅ corpus 43/0/7; fixture **50/0/0 at both viewports** on an isolated fixture-only instance |

## What the action surface now accepts

`reconcile_topic` — still the single write path — gained three arrays, and one field on two existing ones:

- `problems[]`: `statement`, resolved against `axisId`/`axisTitle`; `state` and `stateConfidence` **on
  creation only**; `planStepId`, `repositoryFullNames`, `personIds`.
- `plans[]`: `summary` per axis, with `steps[]` (`title`, `position`, `state`).
- `transitions[]`: `{subject: "axis" | "problem", toState, …}` — the only way to change an existing state.
- `activities[].problemId` and `annotations[].kind` / `confidence` / `problemId`, which the code had
  already marked as U3's.

The store's writers do the work; `reconcile_topic` composes them inside its existing transaction, so a
problem, its plan step and the transition that resolves it land together or not at all.

**A `state` field on an existing problem is refused** (`invalid-input`), pointing at `transitions[]`.
Accepting it would let a caller overwrite a state with no history row — the one thing the state log exists
to prevent. Axis state changes were never expressible as a field, so this closes the asymmetry rather than
introducing one.

**`toState` is deliberately not enumerated in the manifest.** The writer is the single authority on a
subject's vocabulary (axis states and problem states differ), and it answers `invalid-state` for a name
that does not exist. An enum in the schema would be a second authority, and a stale one the moment the
vocabulary changes.

## The refusal vocabulary

`run()` now returns `{ok: false, error, kind}`. The message keeps its prefix for humans; `kind` is the same
fact for a program. Before this, every refusal was one shape, so an agent had to parse prose to decide
whether to re-read or to stop.

| `kind` | Set where | What a caller should do |
|---|---|---|
| `conflict` | `ResearchStoreConflictError` (constructor, so every optimistic-version failure carries it) | re-read, then retry |
| `no-op` | the two transition writers, when the state would not change | nothing; do not retry |
| `invalid-state` | `oneOfState`, on a transition's `toState` | fix the name |
| `human-authored` | `assertTextIsReplaceable` | stop; a person must edit the text |
| `invalid-input` | default for every other caller-fixable rule | fix the input |

`invalid-input` is the honest default: it says "your input, not the world" without inventing a category the
store did not name. A refusal writes nothing — no partial update, no history row.

## The refinement: restating is not rewriting

Applying the refusal through the action path exposed a defect in the U2 guard. `assertTextIsReplaceable`
refused whenever an agent supplied `statement`/`summary`, and the *same block* transferred authorship
(`author_type = 'agent'`) even when the text was unchanged. Two consequences:

1. `problems[].statement` is required on the action path, so a human-authored problem could not be updated
   by an agent **at all** — not even to link the repository that was the whole point of raising it.
2. An agent echoing the text would take ownership of it, and the next agent could then rewrite the
   person's words. The protection was defeated by leaving the words alone.

Refined: an unchanged echo is allowed and transfers nothing; only a *change* is refused. This follows the
reviewer's own wording — "about the provenance of the text being replaced" — and nothing is being replaced
when the text is identical. Covered at both levels: the store test keeps the rewrite refused, and
`human-authored text is refused through the action, but an unchanged echo is not a rewrite` proves the
echo works through the boundary and leaves `authorType` on `human`.

## Two findings from the boundary

**The manifest guard caught an edit of mine.** The host's `ALLOWED_SCHEMA_KEYS` contains no `description`,
so the prose I first wrote *inside* the schema (including on the step-2 enum) would have made the manifest
invalid on install. It lives on the action's `description` now, which is a legal field. The guard's failure
was the useful kind: it named all seven paths.

**...and the guard had a gap.** It checked keyword *names* but not `type` *values*, which the host also
validates (`ALLOWED_SCHEMA_TYPES`). `"string[]"` and `"anyOf"` look reasonable and both produce the same
`unsupported_schema` refusal. The guard now checks both, replicated from `packages/core/src/plugins.ts`.

**Typechecking does not cover SQL.** `listProblemRepositories` selected `l.relationship` from
`problem_repositories`, which has no such column — a raw query behind a cast is invisible to `tsc`, and the
test caught it on first run. Worth stating plainly: the U3 step-1 baseline checks the TypeScript surface,
not the SQL inside it.

## Reading the new records back

An agent that could raise a problem and never read it would be half-wired, so `get_topic`'s axis payload
now carries each axis's `problems` (statement, state, `stateConfidence`, `history`, `repositories`,
`people`, `planStepTitle`), its `plan` with steps, and its own `stateHistory`. The problem history is the
same append-only log the page reads, so what an agent is told matches what a person sees.

A problem's repository links carry no relationship, unlike an axis's: a problem *concerns* a codebase, it
does not own one — the same distinction the 004 schema makes by giving `problem_repositories` no
`relationship` column.

## Acceptance

**Action level** (`src/actions.test.ts`, 5 tests) — the chains the reviewer required:

- `active → usable` via `reconcile_topic` → **exactly one** history row (`active → usable`) → the Progress
  projection reports `usable`; then backdating the axis makes the same row `usable` **and** `stale`, because
  stale is a statement about the clock, not a state.
- `open → resolved → open` → the append-only sequence `[null→open, open→resolved, resolved→open]`, the
  problem back at `open`, and `get_topic` reporting the same three entries.
- all four refusal kinds with their message prefixes, and a read-back proving the refusals wrote nothing.
- the human-authored refusal plus the allowed echo.
- plans and steps landing, and the unrecorded-state refusal.

**Store level** (`src/store-ux-v2.test.ts`) — unchanged, and still the authority on the semantics
themselves.

Measured: `bun run check` = **0 typecheck diagnostics · 117 pass · 0 fail · 654 expect() calls**;
`bun run typecheck:host` = **0 diagnostics** against the real host types.

**Live** — re-vendored into the Nakama checkout and the release minted on the dev instance
(`0.2.0+dev.d5b23ff08253` → `0.2.0+dev.cc3e078d2bb6`, revision 273 → 281). The host saw **no pending
migration**, and the database generation is unchanged: U3 adds no migration, so this is a code-and-manifest
update. The fixture dataset is then applied *through* `POST /v1/plugins/<id>/actions/reconcile_topic` —
nothing touches SQLite directly — which exercises the new `problems[]`/`plans[]` paths on the live route.

**The live chain, action → store → log → read-back**, on a fixture axis through that same route (a probe in
scratch, run once; the output is below rather than paraphrased):

```
axisCounts live: {"active":1,"draft":1,"blocked":1,"parked":1,"completed":1,"abandoned":1,"usable":0}
axis: "Fixture: parked axis (inferred state)" state=parked version=1 history=0

reconcile_topic -> usable: ok=true
  transitions recorded in the reply: 1 [["parked","usable","human"]]

read back: state=usable
  stateHistory: [["parked","usable","human","user_admin"]]

live refusals (all write nothing):
  no-op         kind=no-op          "no-op: the axis is already \"us…"
  invalid-state kind=invalid-state  "invalid-state: toState must be one…"
  conflict      kind=conflict       "conflict: axis \"Fixture: parke…"

restored -> parked: ok=true; history now 2 rows: [["parked","usable"],["usable","parked"]]
```

Two things this proves that the unit tests cannot: `usable` is reachable **through the host's own action
route** with the live manifest (all seven buckets including `usable: 0` are present in `get_overview`), and
the three refusals arrive at a real HTTP caller with their `kind` intact. The probe's origin is `human`
because it logs in as the user without a `profileId` — the same rule the page follows.

The fixture axis now carries two extra history rows (out and back); a fixture re-capture needs the fixture
re-applied first.

**The live Problem lifecycle, action → store → log → read-back** (same route, on the isolated fixture
instance, after the acceptance run so the capture could not be affected). The output, not a paraphrase:

```
create problem: ok=true state=open authorType=human
  read back: state=open history=[[null,"open","human"]]

resolve: ok=true    reopen: ok=true

read back after both transitions:
  state:    open
  history:  [[null,"open","human"],["open","resolved","human"],["resolved","open","human"]]
  statement unchanged: true
  authorType still:    human (the text was never rewritten by a transition)

refusals through the same route (each writes nothing):
  repeat the reopen      kind=no-op          "no-op: the problem is already \"ope…"
  axis word on a problem kind=invalid-state  "invalid-state: toState must be one of: o…"
  stale expectedVersion  kind=conflict       "conflict: problem \"Live proof:…"
  state on an update     kind=invalid-input  "problems[].state applies when crea…"

unchanged by the refusals: state=open history=3 rows, statement unchanged=true
```

Three things this proves that a store test cannot. The problem lifecycle is reachable **through the host's
action route**; the bootstrap row, both transitions and the reopen are one append-only sequence with the
current state — `open` — readable back through `get_topic`; and the refusals arrive at a real HTTP caller
with their kinds intact while changing nothing. The `invalid-state` line is the vocabulary authority doing
its job: `usable` is a perfectly valid **axis** state and an invalid **problem** one, which is exactly why
the manifest does not enumerate either.

**Acceptance passes** — both datasets re-verified, from the isolated-instance recipe the README documents
("the two datasets must not be mixed. Give each its own instance"):

- **Fixture: 50 PASS / 0 FAIL / 0 skip at both viewports** (1440×900 and 1280×800), on a **fixture-only**
  instance — a fresh server on `:4400` with its own config dir and its own web dev server, the plugin
  installed and enabled there, then the fixture applied. The committed transcript *and* screenshots were
  refreshed from these runs, which is the documented way the record is kept. (U4's step 1 has since added one
  check to the pass, so the same fixture runs reported **51/0/0**; see `U4-progress.md` §9. U4's step 2 has
  since added six (the composition and its selection against the projection) and step 3 five (the optional
  Plan section, its absence, the stored positions, the link both ways and the unordered discriminator), so the
  pass reported **62/0/0**; see `U4-progress.md` §10–§11. Step 4 has since added eight for the open-problem
  inventory, so the pass reported **69/0/0** (see §12); step 5 has added eleven for repository threads, evidence
  and human steering — including the tag navigation and the negative cases — so the pass now reports
  **80/0/0**, see §13. U3's numbers are
  kept as U3 measured them.)
- **Corpus: 43 PASS / 0 FAIL / 7 skip** as U3 measured it, and **superseded** at U4's step 5 by a
  corpus-only measurement: **52 PASS / 0 FAIL / 26 skip** at both viewports (`U4-progress.md` §16). The
  43 · 0 · 7 was taken against the shared dev instance and predates steps 3–5's checks.

The earlier fixture run's 49 PASS / 1 FAIL is now fully explained, and it was the harness's dataset
coupling rather than anything in U3: `verify-page.mjs:1104` asserts `topics[0] === CORPUS.topic`, where
`CORPUS` is read off the live page. On a mixed dataset the derived baseline is a fixture topic, so two runs
with character-identical rendered output got opposite verdicts. On the isolated instance that same check
passes with fixture values (`topics ["Layout fixture — crowded card"]`, the fixture's own rails) — the proof
that the failure was composition, not code. **No U10 fix was needed to reproduce the frozen baseline**, only
the isolation the protocol always required; the U10 item stands on its own merits for making mixed-instance
verification robust.

Isolation was also worth more than the numbers: on the isolated instance the fixture's people are
`Fixture Alpha` / `Fixture Zeta` as the fixture intends, whereas on the mixed instance the fixture's
activity was attributed to the corpus's `ajegorovs` — the same coupling showing up as data, not just as a
verdict.

## Not done here

- The new records are **not rendered by any view yet**: `get_topic` returns them and the projections exist
  in the store, but the page still shows the V1 surface. That is U4+.
- `plan_steps.title` still has no authorship columns, so a step title cannot be protected the way a
  problem's statement can. Tracked as a possible future schema change, not folded into U3.
