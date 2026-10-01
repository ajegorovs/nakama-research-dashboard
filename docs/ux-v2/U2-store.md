# U2 — the store layer

**What this chunk is.** The runtime half of the U1 schema: the writers that create and update Problems,
Plans and their links, the writer that moves an axis or a problem between states, and the read models the
redesigned views will read. It is *not* the action surface (U3) and not the page (U4+): nothing here is
reachable from the UI or from an agent until U3 wires it.

**Why it comes before the visual rework.** U4 onward redesigns five views. If the views are built first,
each one invents its own answers to "what is stale?", "what is in scope?", "whose words are these?" — and
the same question gets two answers in two panels. So the semantics land here, once, with tests, and the
views read them.

Status: **both halves are implemented and tested.** The writers, the projections, one recency derivation, one
scope builder, and the §11 audit run over every projection.

Measured: `bun run check` — **111 pass · 0 fail · 596 expect() calls**, across 4 files. Before this chunk it
was 82 · 0 · 472 across 3. All 29 new tests live in `src/store-ux-v2.test.ts`, and the suite is now built
from migrations 001–**004** — the same schema the platform hands the plugin, where before it was built from a
migration list that predated 004. That is why the count is not a simple "+29 assertions": the 82 tests that
already existed now run against the real schema, which is a stronger claim than the count alone suggests.

Three silent-wrongness bugs were found by these tests and fixed: a non-reentrant read snapshot; a claim
annotation that acquired a second target on the way to the database; and a projection that dated every axis
from a field `AxisScan` does not have (see §7, which is also the reason that one was invisible).

**What landed** — the writer half (problems, plans, plan steps, recorded transitions with traceability and
the human-text refusal) and the read half: two projections for the redesigned Progress view
(`progressAxes`, `progressProblems`), the Overview's recency projection (`overviewRecency`), one scope
builder (`visibleContext`, now owning the archived rule *and* the activity window), one age function
(`ageInDays`) with `isStale` and the recency sort reading the same `recencyAt` value, and the §11 audit
asserted over the projections. §5 marks what each acceptance item is covered by rather than implying the
whole chunk is proven.

## 1. Transitions: one writer, one refusal

`transitionAxis(axisId, toState, {origin, actorId, observedAt?, note?})` and
`transitionProblem(problemId, toState, {origin, actorId, observedAt?})`.

| Request | Result |
|---|---|
| axis, `toState` **equals** the current state | **refused, nothing written** — `no-op: …` |
| axis, `toState` is another one of the seven | accepted: one appended `state_log` row **and** the axis's `state` updated, `version` bumped, `updated_at` touched — one transaction |
| axis, `toState` outside the seven | refused, nothing written (`ResearchStoreError`) |
| problem, `toState` equals the current state | refused, nothing written — `no-op: …` |
| problem, `open → resolved` | accepted; one appended row |
| problem, `resolved → open` (a reopen) | accepted; history keeps both, the `resolved` row is not replaced |
| axis, `usable → active` (a reopen) | accepted; the `usable` row stays in history |
| either, unknown id | refused ("Axis not found." / "Problem not found.") |
| either, `origin` outside `human|agent` | refused — `migration` is the migration's word, never a writer's |
| either, `expectedVersion` supplied and now stale | refused — `conflict: …`, and reported as a conflict rather than as a no-op |

**The atomic unit is validate → append history → update subject → commit**, with the current state and
version read *inside* that block, so `from_state` is always the state the write is actually replacing. A
failure at any point leaves **both** the subject and the log exactly as they were; a half-applied transition
is not a possible outcome, and a test asserts it rather than assuming it.

**Optimistic version.** `expectedVersion` is how two writers that started from the same reading are
resolved: exactly one wins, and the loser gets a `conflict:` rather than appending a history row derived from
a state it no longer owns. That matters more here than in an ordinary table, because the subject's state and
its history must stay in step — a stale writer that "succeeded" would leave two rows disagreeing about what
happened.

Two invariants this table is really about:

- **Reopening is not a special case.** It is a transition *to* `active` (axis) or `open` (problem) from a
  state that had stopped. Because the log is append-only, the earlier closed/usable state is *preserved*
  rather than overwritten — the U1 charter's requirement, now exercised by a writer instead of only by the
  schema.
- **A no-op is the writer's job, not the database's.** No CHECK can see another row's current state, so
  the writer reads it and refuses. That boundary was stated at U1 and is asserted here: a refused no-op
  leaves the log row count and the subject row byte-identical.

### There is no prohibition table, and that is deliberate

The contract names three reopenings (`usable → active`, `parked → active`, `completed → active`); it does
not enumerate forbidden transitions. So the rule implemented is: **any transition that actually changes
the state is accepted; only non-changes are refused.** Inventing prohibitions would encode assumptions the
contract does not make — the same discipline that kept `blocked`/`parked` out of the Problem lifecycle.

The one consequence worth a decision: **`abandoned → active` is therefore allowed today.** Nothing in the
contract says `abandoned` is terminal, and if it is meant to be terminal that is a real rule which deserves
its own evidence rather than a prohibition I chose at a keyboard. Flagged for the reviewer; the code
carries the same note where the rule would live.

## 2. Human-authored text is never rewritten by automation

Rule, at **field** level in intent and row level in implementation:

- *Authored text*: `problems.statement`, `plans.summary`, `annotations.text`.
- **Known gap, stated rather than smoothed over**: `plan_steps` carries no authorship columns, so a step
  title cannot be protected — there is nothing on the row to compare an incoming author against, and the
  step writer therefore permits anyone to edit it. Giving steps authorship is a schema change with its own
  review; it is not folded into this chunk because nothing has asked for step-level provenance yet.
- An **agent**-origin update that would change authored text on a row whose authorship is `human` is
  **refused** (`human-authored: …`), and nothing is written.
- An agent may still change what is *machine-owned*: state (through the transition writer, as an appended
  row), repository/person links, plan-step state, and it may always add new rows.
- A **human**-origin update may edit human text — a person correcting their own words is not automation.

**The approximation, stated rather than implied.** The invariant is about the provenance of *the text being
replaced*, not about who first created the entity. The schema carries authorship per row, so the rule is
implemented at row level with one clarification that makes it unambiguous: **`author_type`/`author_id`
describe who wrote the text currently stored.** A human rewrite of authored text therefore *sets*
`author_type='human'` on that row, and the protection follows the text from then on. Per-field provenance is
deliberately **not** built — it would be infrastructure for a case that has not asked for it yet.

The handoff case this exists for, and which is tested:

1. an agent creates a problem (`author_type='agent'`);
2. a human rewrites its `statement` → the row is now human-authored text;
3. a later agent update may still change that problem's links, plan-step state and state — and is **refused**
   for the statement, with `human-authored: …` and nothing written.

The same rule read the other way is also tested: a statement no human has ever edited may still be rewritten
by a later agent write.

That is the contract's requirement — a human's words must not be silently replaced by later automation —
expressed as a refusal the caller can see, rather than a silent non-write.

## 3. Traceability: what every new row carries

| Row | Carries |
|---|---|
| `problems`, `plans` | `author_type` (`human|agent`), `author_id`, `created_at`, `updated_at`, `version` |
| `plan_steps` | `created_at`, `updated_at` (not authored text — a step's title is a plan's own structure) |
| `state_log` | `axis_id` xor `problem_id`, `from_state`, `to_state`, `origin` (`human|agent`, never `migration` from a writer), `actor_id`, `recorded_at` (always now), `observed_at` (**nullable — when the state was observed is often unknown, and that is not the same fact as when the ledger learned it**) |
| `annotations` | `kind`, `confidence` (NULL when there is no claim), `author_type`, `author_id`, `created_at` |
| `activities` | the new `problem_id` link, plus the existing actor/source fields |

## 4. The read models, and the two rules that keep them honest

Read models added: an axis's open problems; a repository's affected problems; a problem's parent
axis/topic, evidence and resolution/reopen history; a plan with its steps; an axis's state history; the
Overview recency projection (topic and repository cards); the two Progress projections. Plus the fields the
five redesigned views will read for Problems and Plans.

- **One stale derivation, used by every view.** `stale` is derived from recency and nothing else, it is
  never stored, and it is a *different fact* from `blocked`. A test asserts stale ≠ blocked: a blocked axis
  with recent activity is current-but-blocked, a quiet axis is stale, and neither term may stand in for the
  other.
- **The stale timestamp and the sort timestamp are the same timestamp.** Not two helpers sharing a
  threshold: the value that decides `stale` for an object is exactly the value that places it in the
  recency order, and a test asserts the two are equal for the same object — because two sources sharing a
  number today can drift apart with one edit, and then a panel sorts an object as current while another
  marks it stale.
- **One visible-set helper.** Archived rows and the activity window are resolved once per call, in a
  shared helper, and every read model reads *that* — not its own copy of the filter. Two copies drift the
  moment one gains a rule, and then two panels answer "what is in scope?" differently.

### §11 audit: a confidence exists only where there is a claim

Every projection is checked for the same failure: a `*_confidence` field filled from a column default
reports `confirmed` for a row nobody has said anything about — and if that projection is also the agent's
payload, the wrong fact reaches the model, not just the screen. An entity with no claim reports `null`,
the views render nothing for it, and a test asserts that a never-claimed entity is `null` rather than
`confirmed`.

## 5. Acceptance — the tests that define this chunk

Alongside keeping every existing test green — **✅ covered by a test, ⏳ still owed**:

| # | Test | State |
|---|---|---|
| 1 | a valid transition appends exactly one row with the right `from_state`/`to_state`/`origin`/`actor_id`, and leaves `state` updated and `version` bumped | ✅ |
| 2 | a no-op transition writes **nothing** — log count and subject row unchanged | ✅ |
| 3 | an invalid state name is a fixable error, not a crash, and nothing is written | ✅ |
| 4 | a reopen keeps the prior state in history (`usable → active`; `parked`/`completed` take the same path) | ✅ |
| 5 | a problem's `resolved → open` shows the whole arc in its history, including the row its creation wrote | ✅ |
| 6 | an agent update to human-authored text is refused, and the text is unchanged | ✅ |
| 7 | every new write carries its author/origin fields (traceability asserted, not assumed) | ✅ |
| 8 | a new `interpretation`/`steering` claim with two targets is refused; a legacy-shaped `note` with two targets still inserts | ✅ |
| 9 | a problem with no repository, no plan step and no activity is still meaningful | ✅ |
| 10 | a plan with unordered steps returns `position = null` rather than a synthesized order | ✅ |
| 11 | stale ≠ blocked, **and the value that decides stale is the same value that sorts that object** | ✅ |
| 12 | an entity with no claim reports `null`, not `confirmed` (the §11 audit, run over every projection) | ✅ |
| 13 | **the handoff case**: agent creates, human rewrites the statement, a later agent write is refused for the text and permitted for the links and state | ✅ |
| 14 | **the concurrency case**: two writers holding the same `expectedVersion` — exactly one wins, the loser conflicts, `state_log` gains one row | ✅ |
| 15 | **the atomicity case**: a failure mid-transition leaves the log and the subject unchanged | ✅ |
| 16 | **the reviewer's case**: one axis `usable` *and* stale at once, with a second `usable` axis that is not stale — the two facts vary independently | ✅ |
| 17 | the display window changes what is counted, never what is stale or how old anything is | ✅ |
| 18 | an archived topic leaves the Overview and both Progress projections together, and `includeArchived` brings it back to all three | ✅ |
| 19 | a `blocked` axis is quiet on its own clock: recently touched it is not stale, untouched for a month it is both blocked and stale | ✅ |

Two of these found real bugs rather than confirming the design, which is the point of writing them: the read
snapshot was not reentrant (a plan assembled from its steps issued a second `BEGIN`), and `addAnnotation`
derived a topic from the axis for *every* kind, so a steering claim on an axis arrived at the database with
two targets — precisely the row the schema refuses.

A third was found by the projection tests, and it is the reason §7 exists: `progressAxes` dated each axis
from `scan.createdAt`, a property `AxisScan` does not have. Nothing failed. The value was `undefined`, so
`newestOf` returned `null`, so every axis was reported as never stale — a plausible, quiet, wrong answer.
The tests caught it because they recompute the verdict from the value the row carries rather than asserting
the verdict alone; a type check would have caught it in milliseconds.

## 5a. The stale threshold is the contract's, not ours

`STALE_AFTER_DAYS = 7`, from the contract's own fixture G — "No activity for >7 days, no blocker"
(`contract/fixtures.md:98`) — and the contract's own definition of what stale *is*: "an observation about
recency, not a diagnosis" (`contract/interaction-spec.md:63`). Two consequences are load-bearing:

- **`stale` is not a state and is not derived from one.** Fixture G's "no blocker" describes that fixture's
  setup; it is not a rule that blockers are exempt from recency. A blocked axis nobody has touched for a
  month is both blocked and stale, and test 19 asserts both halves.
- **`recencyAt`** is the newest timestamp the record holds for the object — its last activity, or when the
  row itself was last written. `isStale` and the recency sort both read that one value, so a panel cannot
  sort something as current while another marks it stale. Test 11 recomputes the verdict from the value the
  row carries; test 17 asserts a narrow display window cannot re-date an object.

**Seeding discipline.** These tests seed the *common* shape, not the convenient one: an activity that names
its problem and lets its axis and repository be implied by the problem's links — because that is what the
writers actually produce, and a fixture that fills in every foreign key exercises the easy path and hides
the real one.

## 6. What U2 deliberately leaves open

- **The action surface** (U3): no action key creates a problem or performs a transition yet, so nothing
  here is reachable from the UI or an agent. In particular `usable` is still absent from
  `nakama.plugin.json`'s `axes[].state` enum, which is U3's first change.
- **`abandoned`'s terminality — confirmed as "not a rule".** The reviewer's ruling: these are descriptive
  lifecycle states, not a workflow engine; the contract defines no transition edges, so inventing a matrix
  now would be stronger semantics than the product warrants. `abandoned → active` therefore stays
  permissible, and the history explains the odd-looking transition instead of the writer refusing a
  legitimate research decision. No prohibition table exists, by decision rather than omission.
- **Row-level authorship approximating text-level provenance** (§2) — documented, tested against the
  realistic handoff, and deliberately not expanded into per-field provenance infrastructure.
- **Whether history must survive entity deletion** — the U1 retention boundary, unchanged: this chunk
  writes history, it does not make history outlive its subject.
- **Ordering and layout** of anything rendered — U4 onward.

## 7. A finding about the harness: nothing in this repo typechecked — **closed in U3, step 1**

This was a defect found while writing U2's tests, recorded because the U2 numbers depended on it. It is kept
here as the reason the typecheck exists rather than as an open item.

`bun run check` was `bun run build && bun test src`. `build` is `bun build` (a bundler: it strips types rather
than checking them) and `bun test` uses the same pipeline. The repository had no `typescript` dependency and no
`tsconfig.json`, so no step in this repo had ever verified a type. A green `check` meant "it bundles and the
tests pass", which is a weaker claim than the same words would carry in a typed project.

What that hid, concretely: `progressAxes` read `scan.createdAt`, which does not exist on `AxisScan`. The
property was `undefined`, `newestOf` returned `null`, and every axis was projected as never stale. Nothing
threw, nothing failed, and the number it produced was plausible.

**How it was closed** (U3's first commit, by the reviewer's ruling that this is an engineering safety boundary
rather than cleanup):

- `typescript`, `@types/bun` and `@types/react` as dev dependencies, and a committed `tsconfig.json`
  (`strict`, `src/` + `types/`). The scoping decision is recorded in that file: `harness/*.mjs` is operator
  tooling and deliberately outside the program.
- `bun run typecheck` (`tsc --noEmit`), and `bun run check` is now `typecheck && build && test`.
- `types/host.d.ts` declares the host surface this plugin uses, derived from the host's sources, because
  `@nakama/ui` and `@nakama/core` are unpublished and were previously resolving to `any` — which is what made
  the 13 implicit-`any` callback parameters in `src/ui.tsx` invisible as well as unchecked.
- `bun run typecheck:host` re-runs the same compiler options with `paths` pointed at the real host packages in
  a checkout, and **that run is authoritative**. It exists so the committed declaration cannot quietly become a
  lie: if the declaration accepts something the real types reject, the two runs disagree.

Measured at each step, because the first configuration was not an honest number — the diagnostic count fell
from 427 to 0 across the five rows below, and only three of those diagnostics, ever, were code that was
actually wrong:

| Configuration | Diagnostics |
|---|---|
| No config, ad-hoc `--strict` over the two U2 files | 7 — all missing type *declarations* (`bun:sqlite`, `node:fs`, `process`), zero real type errors |
| Full `tsconfig.json`, before `@types/react` | 427 — 390 of them the JSX namespace missing, i.e. one dependency |
| Full `tsconfig.json`, with `@types/react` | 18 — 13 implicit-`any` (the `ui` namespace was `any`), 3 unresolved host modules, 3 in a U2 test |
| Full `tsconfig.json` + `types/host.d.ts` | **0** |
| Against the real host types (`typecheck:host`) | **0** in this repository, agreeing with the run above |

The whole existing surface — 6 files, ~11,900 lines — is clean under `strict: true`; nothing legacy had to be
suppressed, and nothing was. The only three real errors the checker ever found were in a U2 test file, and they
were fixed by making the tests assert what they meant (a topic that must exist; an axis that must be present in
both windows) rather than by chaining optionals into `undefined === undefined`.

**What a green `bun run check` means now, and what it meant before** — this is a deliberate baseline
discontinuity, not a like-for-like number:

- before: bundles + tests pass
- now: **typechecks + bundles + tests pass**
