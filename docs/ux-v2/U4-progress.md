# U4 — the Progress view, first vertical slice

**Scope, as directed:** begin rendering the new model, narrow rather than cross-cutting. Progress first,
because it is the only view whose contract fundamentally depends on the Axis/Problem/Plan semantics U1–U3
stabilized. Order: (1) the axis index from `progressAxes`, (2) the selected axis's **Problem** and
**Activity** top columns, (3) the optional Plan/work package and its steps, (4) open Problems, (5) repository
threads / evidence / human steering, (6) the `Axes | Problems` subview, (7) only then propagate the shared
primitives into Topics / Repositories / People / Overview.

**Acceptance criterion (U4):** every visible Progress element must be traceable to an existing
projection/store field or an explicit contract-derived computation. **No new display-only semantics are
invented in JSX.**

That criterion is what this document exists to make checkable, and it is why the first commit of the slice is
not JSX.

## 1. The finding that reordered step 1

`progressAxes`, `progressProblems` and `overviewRecency` were written in U2 and tested there, and **no action
exposed any of them**: the three names appeared in `store.ts` and nowhere else in `src/`. The page could call
`get_overview`, `get_topic`, `list_topics`, `list_activity` and the writers — none of which return the new
model. So "render the axis index from `progressAxes`" had no data path.

U3 exposed the *writers* (`transitions[]`, `problems[]`, `plans[]`) and the *writes' read-back* through
`get_topic`. It did not expose the projections, because the reviewer's U3 step list stopped at the action
boundary for writes — reasonably, since nothing rendered them yet. Rendering is what makes the read path
load-bearing, so step 1's first half is the read action.

## 2. `get_progress` — one call, both halves, one window

```jsonc
// in:  { activitySinceDays?: 0..365, includeArchived?: bool, limit?: 1..50 }   // 0 = all time
// out: { ok: true, axes: ProgressAxes, problems: ProgressProblems }
```

Read-only, `access: "member"`, `exposeAsTool: false` — the surface stays at **five agent tools**, and the
manifest guard in `src/actions.test.ts` keeps proving it.

Two decisions worth stating:

- **Both projections in one call, from one scope.** The Axes subview renders the axis index *and* the open
  problems behind the selected axis, so two calls would let the two halves describe different windows. The
  `axes`/`problems` arrays are the same projection the store computes; `activitySinceDays` is a query
  parameter, never stored state.
- **No `subview` parameter.** Which subview is showing is a client concern; putting it in the action would
  make the action shape the view's navigation, which is display semantics in the data layer. The action
  answers "what does Progress have", the client decides what to draw.

`overviewRecency` is deliberately **not** in this action: it belongs to Overview (step 7), and exposing it
here would be the first crack in the narrow-scope instruction.

## 3. The field inventory — what the view may render, and nothing else

`ProgressAxisRow` (one row per axis in attention order: `blocked → active → usable → draft → parked →
completed → abandoned`), 16 fields:

| Field | Serves, per `interaction-spec.md` §9 |
|---|---|
| `title`, `topicId`, `topicName` | the index row, and which topic it belongs to |
| `state`, `stateConfidence` | the axis's state and how strong that reading is (inferred vs recorded) |
| `stale`, `recencyAt`, `lastActivityAt` | staleness, derived once, against the timestamp it sorts by |
| `blocker`, `blockerConfidence` | what it is waiting on; `null` confidence where no claim was made |
| `plan` (`id`, `summary`, `steps[]`, `stepsDone`) | the optional Plan/work package and its staged steps |
| `problems`, `openProblems` | how many problems exist and how many are still open |
| `activityInWindow` | the Activity column's depth in the selected window |
| `stateHistory` | the append-only transition records the view shows as history |

`ProgressProblemRow` (one row per problem, read from the problem outwards), 19 fields: `statement`, `state`,
`stateConfidence`, `history` (creation → resolve → reopen, append-only), `axisId`/`axisTitle`,
`topicId`/`topicName` (the parent context the Problems subview inverts), `repositories[]`, `people[]`,
`planStepId`/`planStepTitle` (plan context, `null` when it has none), `authorId`/`authorType` (whose text it
is), `activityCount`, `lastActivityAt`, `recencyAt`, `stale`.

Two rules the rows encode, both from the U1 charter and both now pinned by tests:

- **A problem is meaningful with no plan, no repository, no artifact.** `planStepId`/`planStepTitle` and
  `repositories` are allowed to be `null`/empty, and the row stays renderable. The test asserts the `null`
  case *and* the populated one, so neither can silently become the assumption.
- **A problem's state changes only through `transitions[]`.** `history` is the record; there is no field on
  the row that a view could write.

No V1 display vocabulary survives in the payload — no `scope`/`approach`/`progress`/`nextStep`. The contract
retired those fixed cards, and the test asserts their absence so the view cannot quietly fall back to them.

## 4. Why these tests, and what they do not prove

`src/actions.test.ts` → `describe("U4 — Progress reads the model as the store computes it")`:

1. **deep equality** — `result.axes`/`result.problems` equal `store.progressAxes(options)` /
   `store.progressProblems(options)` for the same scope. If the action adds, renames or reshapes a field,
   this fails. This is the action layer's half of the U4 criterion.
2. **the field set is pinned** — 3 top-level keys, 3 keys per projection, 16 per axis row, 4 per plan, 19 per
   problem row, plus the absence of the V1 names. A display-only field now has to be declared in this test
   before a component can rely on it.
3. **one call, one window** — both halves report the requested window, the stale threshold is shared, and `0`
   means all time.
4. **the new model, not a derived V1 shape** — plan steps and `stepsDone`, problem counts, `usable` with its
   history row, problem history in order with its repositories, and the plan-step linkage.

**What this does not prove:** that the rendered pixels trace to those fields. That is the JSX half of the
criterion, and it needs the view to exist. The pins make it checkable: anything the view wants to show either
appears in the inventory above or the test fails first.

One earlier assumption did not survive contact and is worth keeping: an axis whose state is *inferred* has
**no history row**. History records what was written, and nothing was written — so the test creates a real
transition rather than expecting a bootstrap row. Same rule that bit in U3, from the other direction.

## 5. Consequence to be explicit about

The frozen acceptance passes (`docs/corpus/`, `docs/layout-fixtures/`) pin the **current** Progress view, and
that view is derived from `get_overview` rollups — the V1 shape. Starting to render the new model therefore
puts those checks knowingly out of date until the harness is updated for the new view (U10 owns the harness;
U7 is Progress in the plan's original numbering). Per the reviewer's ruling, proving the old UI had not
regressed was U3's step 10, and it is done: corpus 43/0/7, fixture 50/0/0 at both viewports. Nothing further
is proven by keeping the old checks green while the view is replaced, which is why the render is a separate
commit rather than a reason to stall.

## 6. Verified live, through the host action route

Re-vendored and re-minted (`0.2.0+dev.e39055d638ba`, revision 289, **generation unchanged** — no pending
migration). The reinstall is itself a check: the host's schema validator is stricter than our manifest guard,
and a schema violation is an `unsupported_schema` refusal at install time. It accepted `get_progress`.

Then a read-only probe against the running instance (`localhost:4399`, corpus + fixture):

```
ok=true  top-level keys: ["axes","ok","problems"]
axes:     activitySinceDays=30 staleAfterDays=7 rows=10
problems: activitySinceDays=30 staleAfterDays=7 rows=0
first axis row: "Fixture: parked axis (inferred state)" state=parked conf=inferred stale=false
  problems=0 open=0 activityInWindow=1 historyRows=2   plan: null
  axis keys == pinned inventory: true
window is a query parameter: 0 -> axes=0 problems=0; 30 -> 30
```

Two things this buys beyond "the call returns":

- **The pin is confirmed against the real runtime.** The page receives **JSON**, where an `undefined` field
  simply disappears — so an in-process deep-equality test alone would not prove the page can rely on a key
  existing. The live key set is byte-for-byte the pinned inventory, which is what makes the pin usable as
  the view's contract.
- **Both halves share one window in the host too** (30/30, 0/0) — the "one call, one scope" decision holds
  outside the test harness.

**One gap the live read exposed, for the render step:** the live dataset has **0 problem rows**. Neither the
corpus nor the layout fixture creates a Problem — correctly, since 004 invented none and a problem has to be
authored — so the Problems subview and every problem-derived element in the Axes subview (counts, plan
context, problem history) currently have nothing to render against. Rendering them will need the fixture
extended with problems (the reviewer's `fixtures.md` describes them), or a problem seeded live through the
action surface before a visual check. Worth deciding before the Problems subview is written: verifying a view
with no data is how display-only semantics get invented.

## 7. Fixture E — the seeded structure, and the defect it exposed

Per the reviewer's ruling, Fixture E was seeded **before** rendering, so Progress cannot be "implemented"
against empty data. It lives in `harness/apply-layout-fixture.mjs` (so it is reproducible, not hand-run), and
it hangs off an axis and repositories that **already exist** — which is what keeps the frozen baseline
untouched.

What it carries, per the reviewer's list: one parent axis; one **open** Problem on **two** repositories; a
person link; an activity tied to the Problem; an evidence/artifact record; a human-authored steering note;
and a plan with the step the Problem sits on — plus a second Problem with no step, no repository and no
artifact, so `planStep = null` stays a *rendered* case rather than an assumption.

**It needs two calls, and the model forces that rather than taste.** Inside one `reconcile_topic` the writes
are ordered topic → people → repositories → axes → **activities → annotations → plans → problems**, and row
ids are server-generated (`const id = crypto.randomUUID()` — no caller-supplied id can name a new row). So an
activity, an annotation and a `planStepId` link cannot reference a problem created in the same call. The
applier reads the ids back and does the referencing pass second.

**Idempotence had to be designed, twice.** Problems have no natural key, so re-applying the fixture would
pile up duplicates; the applier uses the statement as one (a fixture convention, explicitly not a model
guarantee), dedupes activities on `sourceRef` and annotations on their exact text, and treats the plan as
present once it carries the step title. The first attempt at this still duplicated the plan, because
re-sending a step without a `stepId` creates another step — so when the plan exists, only the **missing**
step is sent.

**The defect it found — a claim's target rule escaped the action boundary.** Seeding the steering note (a
claim on an axis *and* a problem at once) returned **HTTP 500, "An unexpected server error occurred", with no
`kind`** — while every other caller mistake returns a structured refusal. Isolated by bisecting the payload
live:

| annotation | targets | before | after |
|---|---|---|---|
| `steering` | one (problem **or** axis) | 200 ✔ | 200 ✔ |
| `steering` | two | **500, no kind** | `invalid-input` |
| `steering` | none | **500, no kind** | `invalid-input` |
| `interpretation` | two | **500, no kind** | `invalid-input` |

Root cause, and it was a *class* rather than one site: migration 004 enforces the rule with a CHECK
constraint — `kind = 'note' OR (topic_id IS NOT NULL) + (axis_id IS NOT NULL) + (problem_id IS NOT NULL) = 1`
— and the JS check lived only in `addAnnotation` (the `add_annotation` action's path). The reconcile loop
calls the low-level `insertAnnotation` **directly**, so a mis-targeted claim reached the INSERT and died on
the constraint: a raw `SQLiteError`, which is not a `ResearchStoreError`, so `run()`'s catch did not convert
it and it surfaced as a 500. Fix: the check now sits in `insertAnnotation` — the single place the row is
written — so **no caller can skip it**; the CHECK constraint stays as the backstop for anything writing SQL
directly. `StoreErrorCode` also gained `invalid-input`, which the taxonomy and `refusalKind`'s default
already used but the store could not name.

Pinned by tests (`src/actions.test.ts`, *"a mis-targeted claim is a refusal, not a server error"*): two
targets, no target, and the accepted one-target case — including that a refusal writes **nothing**.

**Measured, not inferred: the baseline is undisturbed.** On the isolated fixture-only instance, with Fixture
E applied, the frozen fixture acceptance pass is **50 PASS / 0 FAIL / 0 skip** — the same as the committed
baseline — and the instance still reports **2 topics, 7 axes, 2 people, 2 repositories**, exactly as before
the seed. That is the check that the new structure is invisible to the V1 page (it renders no problems), so
U4 can render `get_progress` without the old checks becoming meaningless. On that instance the fixture's own
person is `Fixture Alpha`; on the shared dev instance the same seed links `ajegorovs`, because the mixed
instance merged them — the by-axis person lookup handles both, and says which it used.

Clean Fixture E numbers, isolated instance:

```
fixture E: created 2 problem(s), 1 plan with 2 steps
fixture E: linked 2 activity/evidence record(s), 2 annotation(s), the plan step and the person link
fixture E: problem on a step — 2 repositories, 1 person, 2 activity record(s), step "Fixture step 2: …", history 1 row
fixture E: problem with nothing behind it — repositories 0, step null, history 1 row
```

**One disclosure:** the shared dev instance carries diagnosis leftovers — probe activities on the fixture
problem (6 activity records there rather than 2) and one duplicated plan from the first failed attempt. The
numbers above are from the isolated instance, which is where the fixture is meant to be read; the dev
instance is mixed by design and its corpus record stands as U3's step 10 left it.
