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
instance is mixed by design, and its corpus record no longer stands as U3's step 10 left it — §16 re-measures
it on a corpus-only instance.

## 8. The axis-index render (step 1, second half)

The index is this slice's one new element. It reads `get_progress.axes.axes` and nothing else:

| On screen | Comes from | Not from |
|---|---|---|
| row order | the projection's own order (attention, then recency) | no sort, no group-by, no ranking in the client |
| axis title | `row.title` | — |
| state + confidence | `row.state`, `row.stateConfidence` via the existing `StateBadge` | no vocabulary of its own, no mapping table |
| topic context | `row.topicName` | — |
| problem count | `row.problems`, `row.openProblems` | only their phrasing is decided here |
| recency | `row.recencyAt` through the page's existing `describeAge`, and `row.stale` as the projection computed it | **no client-side staleness derivation**, no threshold arithmetic |

Selection state (`selectedAxisId`) marks a row `aria-pressed` and **does nothing else** — it filters nothing,
because nothing on the view reads it yet. The contract puts the index on the left with Problem + Activity
beside it; there is nothing to put beside it yet, so it sits above the window's existing content and the
split is the next step's layout work. The window is not something the index owns either: it rides the same
`load()` that already re-queries on a window change, so **switching views still queries nothing**, at the
cost of one extra read per window change.

### The one thing that went wrong, and why the harness caught it and `tsc` could not

The page cannot import the store's types (the browser bundle must not pull in `bun:sqlite`), so it declares
its own view types. The first version of that mirror flattened the payload — it declared `{ activitySinceDays,
axes: ProgressAxisRow[], staleAfterDays }` where the contract has `{ axes: { … }, problems: { … } }`. Every
field of every row was right; one level of nesting was wrong, and **a client-side mirror is always type-correct
against itself**, so `bun run check` stayed green while the view threw
`TypeError: ((intermediate value) ?? []).map is not a function` at runtime and rendered nothing. The harness
found it in one run, because its check compares the DOM against the live action rather than against the
client's own idea of the payload. The mirror now names the nesting and says why: the outer `axes` is the
projection (window, threshold, rows), the rows are `axes.axes`, and the shape is read as-is rather than renamed
to `rows` for local readability.

## 9. The window check (C7b), and what it is really asserting

`harness/verify-page.mjs` gained one check: at 30 days and at 7 days it reads the index out of the DOM
(row ids and order, per-row activity, problem count, state, stale flag, and the window the index reports) and
compares it against **`get_progress`'s own answer for that window**, then restores the window.

Comparing against the projection rather than against a remembered expectation is what makes this a check on
the client's state instead of on the corpus: on any dataset, a row that carried its previous count forward, a
client that re-sorted, or one that kept rows from the last result would disagree with the projection. The
element missing is a failure of this check, not an abort of the pass — the first version of the check threw a
`TimeoutError` that killed the whole run, which said nothing about the page.

**Measured (isolated fixture-only instance, both viewports): 51 PASS / 0 FAIL / 0 skip**, at 1440×900 and at
1280×800. The committed fixture record is therefore 51 checks, not 50: the harness gained one. The new check's
own line reads

```
PASS  the Progress index is the projection for the current window — replaced on change, not extended — matched the projection at 30 and 7 days (7d restored)
```

## 10. The three-column composition (step 2)

Step 2 is the reviewer's "real desktop composition": **index on the left, the selected axis's Problem in the
centre, its Activity beside it**, all three visible at once. The geometry ruling was explicit that step 1 must
not fake a two-column shell with an empty right side, and that step 2 establishes the real one — so this is
where the composition appears, and where selection stops being decorative.

**What renders, and where each piece comes from.** The traceability criterion is the same as step 1's: every
visible element is a projection field or a phrase over one.

| On screen | Projection field |
|---|---|
| `Open problems (N)` | the axis row's `openProblems` — the server's count |
| the card's state badge | the problem row's `state` + `stateConfidence` |
| the statement | `statement` |
| `owner-authored` / `librarian-inferred` | `authorType` |
| `step: …` | `planStepTitle` (absent when the problem has no step — Fixture E's second problem) |
| the repository names | `repositories[]` |
| `N events` · `last activity …` | `activityCount`, `recencyAt` |
| the other open problems listed | the projection's `problems[]` for this axis, in its order |
| `Activity (N)` | the axis row's `activityInWindow` |
| each feed line | the bucket's `events[]`: `occurredAt`, `summary`, `sourceType`/`sourceRef`, `person` |
| `evidence for the problem shown` | `problemId` matching the shown problem |

**The selection rule is the reviewer's, applied literally.** An axis can have several open problems, so the
column shows the first **open** problem *in the projection's own order* — the projection already sorts by
recency — and lists **the others** beside it, immediately selectable. Nothing is ranked by activity count,
repository count or any other client-side notion of importance; selecting one changes only which card is
displayed. The default axis is likewise the projection's first row, so the column never opens on a choice the
page invented rather than one the projection made.

**The Activity half is new, and it is grouped by the server.** `get_progress` previously carried two halves
(`axes`, `problems`) and no events; the Activity column needs rows. Rather than let the page filter a flat
list by the selected axis — client-side scoping, the thing the reviewer warned would be a second model — the
store gained `progressActivity`, which returns the window's events **already grouped per axis, in the index's
order**. The page looks a bucket up; it filters and counts nothing. `eventCount` is computed from the same
predicate as the index row's `activityInWindow` (the axis's rows in `activities`, judged by the same
`visibleContext.inWindow`), and a test asserts the two agree for every axis in the payload, so a heading can
never overstate the list beneath it. The same agreement is asserted for `openProblems` against the rows the
Problem column can list.

**A defect the new half exposed, and the fix.** Recording an event that names *only* its problem did not put
the event on the axis. The writer's own comment claimed the opposite ("Naming a problem is evidence for it:
the axis and topic follow from the problem's own links"), but the axis was never resolved from the problem, so
the row carried `problem_id` with `axis_id = NULL`: invisible to the axis's Activity column and missing from
its count. The fix is in `insertActivity` — the single path every activity row goes through — so the
derivation cannot be skipped by a caller, the same place the claim-targeting rule was fixed in U3. The
remaining limitation is real and stays documented: an activity written in the **same** call that creates its
problem cannot resolve the axis, because activities are written before problems inside the transaction. That
is the model fact behind Fixture E's two-pass shape, not something to paper over in the UI.

**Also fixed, found by widening a type.** The page's `AxisState` mirror listed six states and was missing
`usable` — the state U1 added — so the page's own types disagreed with the contract's vocabulary even though
nothing rendered wrong. `usable` is now in the mirror, and the compiler immediately demanded it in the
`axisCounts` literal for a newly created topic, which is the kind of drift that widening a local type is
supposed to surface.

**What step 2 deliberately does not include:** the optional Plan/work package and its steps, the open-problems
list as its own section, repository threads, evidence and human steering (steps 3–5), and the `Axes | Problems`
subview (step 6). The V1 filter row and the grouped timeline below the composition are untouched — they are
still the V1 surface, and step 7 is where shared primitives propagate.

**One open question for the reviewer.** The Problem column takes the projection's `problems[]` and shows the
subset belonging to the selected axis. The *count* is the server's and the *order* is the server's, and a test
asserts the count matches the subset's length — but the subsetting itself happens in the page. That is the same
shape of decision as the index filters, so it is worth an explicit ruling: keep it (selection is navigation,
not filtering), or move the grouping server-side as it was for the activity half when the Problems subview
arrives (step 6).

**Measured:** isolated fixture-only instance, **57 PASS / 0 FAIL / 0 skip at both viewports** (1440×900,
1280×800) — 51 plus the six checks step 2 added, all of them comparing the DOM against the live projection:
the three regions sit on one row in the contract's order; the index opens on the projection's first row with
the detail columns following it; the Problem column shows the projection's first open problem under the
projection's count; the other open problems are listed in the projection's order and picking one changes the
card; the feed is the projection's bucket, row for row, in order; and selecting another axis moves **both**
columns to that axis's data. The live release on the isolated instance moved through revisions 25 → 57
(`+dev.aaa050430c7f`, `+dev.cac5f44486fb`, `+dev.bdca2624c91b`) with the **generation unchanged** — no
migration, only bundle changes.

### The recipe defect that run exposed

Re-pushing a checkout to a running host is **two** steps, and doing only the second one silently serves the
old code: `update-plugin.mjs` calls the host's `reinstall` route, which installs from the **vendored copy**
inside the Nakama checkout (`packages/plugins/research-dashboard/`), not from this repository. Without a fresh
`vendor/vendor-into-nakama.sh`, the reinstall mints a release and bumps the revision while the bundle it
installs is the previous one — the action answered with the old key set and no `activity` half at all. The
symptom was a `TypeError` in the harness rather than a wrong number, which is the right way for it to fail.
The README's recipe now spells out the order (`vendor` → `update`).

## 11. The Plan section (step 3)

Step 3 renders the axis's **optional** plan below the composition — a secondary section under the top row,
not a fourth column, so the glance the layout gives (which axis, which problem, what has been happening) is
untouched. `progressAxes` already carried the plan on the axis row (`{id, summary, stepsDone, steps}`), so
this step added **no** read contract: it renders `activeAxis.plan` as it arrives, in the store's own step
order.

| On screen | Projection field |
|---|---|
| `Plan · N steps` | `plan.steps.length` |
| `N of M done` | `plan.stepsDone` of `plan.steps.length` |
| the plan's own description | `plan.summary` |
| each step's chip | `step.state` — the stored `pending\|active\|done\|blocked` |
| each step's number | `step.position`, and **only** where a step claims one |
| the step the problem sits on | `problem.planStepId === step.id` |
| `step: …` on the problem card | `problem.planStepTitle` |

**Optional by construction.** An axis with no plan renders nothing at all — no section, no shell, no
"missing plan" wording (the harness asserts the absence of the section *and* of such wording). It also took
no server change to make this true: `plan` is `null` in the projection and the section is a conditional.

**Absence as a first-class case, in the data rather than in the code.** Fixture E's plan lives on one axis and
no other fixture axis has one, and the harness picks the planned axis and the unplanned axis **out of the
projection** rather than naming them, so the two checks stay meaningful on any dataset: one axis proves the
section renders from the projection, the other proves its absence is silent.

**Nullable `position` kept honest.** The model's own comment is the rule: an unordered checklist is not an
ordered one with gaps filled in. So the page renders a number exactly where a step claims a `position` and
never fills one in; a plan whose steps claim none says `unordered — no step claims a position`, and the list
is a plain `<ul>` rather than an `<ol>` so the markup does not assert a sequence either. Step 3's edge case —
an **unordered plan with several steps** — now exists in Fixture E because it did not: the existing plan's
steps carry positions 0 and 1, so nothing exercised the null path.

**The unordered check is a discriminator, not a smoke test.** The fixture's two unpositioned steps are written
**zulu first, alpha second** (in two calls, ~250 ms apart: `listPlanSteps` orders unpositioned steps by
`created_at` and then by `id`, so one call would land both in the same millisecond and hand the order to a
random uuid — the fixture has to be reproducible) and the check fails unless the DOM order is the store's
*and* differs from the alphabetical one it prints. Measured on the fixture:

```
order ["Fixture E: unordered step — zulu, written first","Fixture E: unordered step — alpha, written second"]
vs projection [same two]  (alphabetical would be ["… alpha …","… zulu …"]); positions ["",""]; unordered marker true
```

So a client that sorted null-position steps alphabetically — the failure the reviewer asked us to rule out —
would be caught rather than silently tolerated.

**Two vocabularies meet, and the page keeps them apart.** A plan step's state is **stored**, written by an
author, and migration 004 has no confidence column for it; an axis's or a problem's state is a **claim**, often
only inferred, and C8 requires every claim to carry its confidence where it is read. The step chip is rendered
by the same `StateBadge` component with `kind="stored"`, which emits `data-rd-step-state` and **no**
confidence attribute — inventing one would turn a stored fact into a claim, which is the error C8 exists to
prevent in the other direction. The new checks assert the absence of that attribute on every step, and C8
still counts claims only.

**The plan ↔ problem link, both ways.** The Problem card names the step (`step: …` from `planStepTitle`), and
the step names the problem (`data-rd-plan-step-shown`). The check for this deliberately does **not** trust the
default: the projection's first open problem on Fixture E's axis is the *unlinked* one, so the harness first
observes that nothing is marked, then selects the linked problem from the list and asserts exactly one step is
marked and that the card names that step's title. Measured: `marked steps [false,true]` for step `8444037a`,
card `owner-authored · step: Fixture step 2: reconcile the two rigs' floors · fixture/crowded-card,
fixture/second-topic · 4 events · last activity today`.

**No duplication with Activity:** this section renders the intended structure (`summary`, step states,
positions, the linkage) and never an event; the feed renders what actually happened and never a step.

**Measured:** `bun run check` = **0 typecheck · 125 pass · 0 fail · 743 expect()** (the plan and step key sets
are now pinned, including that `position` is a number or null and that steps arrive in the store's order).
Fixture acceptance **62 PASS / 0 FAIL / 0 skip at both viewports** — 57 plus the five checks step 3 added:
the plan below the row and from the projection; numbers from the stored position with no invented confidence;
the linkage both ways; the unordered discriminator; and the silent absence. Release `+dev.50252156e496`,
**generation unchanged**. The fixture still reports **2 topics / 7 axes / 2 people / 2 repositories** with the
unordered plan present — it adds structure, not entities, which is what keeps it invisible to the frozen V1
checks.

## 12. The problem inventory (step 4)

Step 4 gives the axis's **open problems** their own section, below the plan, and takes the list out of the card
column where step 2 had put it. The list is *not* "the others": every open problem appears, including the one on
screen, which is marked active — so the reader can see which row is driving the card.

**Where each thing comes from.** Membership, order, state and counts are the projection's: `problems.problems`
filtered by `axisId` and `state === "open"`, in the order the server returned them. The page decides only which
already-returned problem the card shows — the boundary the reviewer set in step 2 and kept here. Each row's
context line is the problem's own fields, phrased: its repositories (or `no repository`), the step it sits on
where it names one, its event count, and its recency using the same timestamp that sorts it.

**Two cases the section must not show.** *Closed-out problems:* the fixture gained one on Fixture E's axis —
created and then moved to `resolved` through `transitions[]`, since a problem's state changes only that way — so
that axis carries **3 problems, 2 open** (the pass's own line reads `1 closed-out of 3 problem(s) on the axis;
2 row(s) for 2 open`). The check asserts that case exists before asserting the inventory lists every open one,
which is what keeps "open only" from passing on a dataset with nothing to leak.
(**Corrected at step 6:** this section first read *4 problems, 3 open*, which was true of the instance stepping
4 measured — that instance had been through the layout applier twice, and the pre-step-5 applier duplicated a
problem on re-apply. Step 5's idempotency fix removed the duplicate, so a fresh apply gives 3/2, and the
harness's skip reason that repeated the old number is corrected with it. The measured claim — one closed-out
problem is excluded while every open one is listed — is unaffected; only the count was stale.)
*No open problems at all:* an axis with none renders **nothing** — no section, no shell, no "missing problem"
wording (nothing matching `missing problem|error|warning|invalid` on the page) — while the axis's title and the
card column keep rendering, because the axis is meaningful on its own.

**Why the heading carries no count.** The card column's heading already says `Open problems (n)` with the
projection's own number; a second heading asserting the same number would be two sources for one fact. The
count that matters is asserted where it is rendered, and the section's own row count is checked against the
projection.

**Measured.** Fixture acceptance **69 PASS / 0 FAIL / 0 skip at both viewports** — 62, minus step 2's "the
others are listed" check (the list it asserted is no longer in that column) plus step 4's eight. The action
suite also pins the distinction at the contract level: with the problem closed out, its axis counts 1 problem
and 0 open. `bun run check` = **0 typecheck · 125 pass · 0 fail · 745 expect()**; release
`+dev.fea09a3701bf`, revision 65, **generation unchanged**. Eye-checked at 1440×900: the inventory sits below
the plan, each row carries a chip, its statement and its compact context, the first row is highlighted and the
card above is the same problem — no clipping.

## 13. The three supporting sections (step 5)

Step 5 renders what the reviewer called three different questions — **where implementation is happening**
(repository threads), **what substantiates the reading** (evidence), and **how a person has constrained the
automated abstraction** (human steering). They are three sections because they are three questions: merging
them would produce a link list that answers none of them.

### Repository threads

The source is the selected problem's **durable relations** — the projection's `repositories` array, rendered
in the projection's order, one `EntityTag` per repository. Nothing is picked out as primary, and that is
checked by construction: the tag row's `innerText` must be exactly the repository names, so any "primary" or
rank marker would be text the names do not account for.

**The EntityTag contract is now executable rather than documented.** Clicking a tag navigates to the
canonical Repository view and selects that repository — the tag names an entity, the app lands on it and
writes nothing. The check clicks **both** of Fixture E's tags (one tag could pass by accident while the second
never fires), asserts the landing view and the selected row each time, and asserts the repository set is the
same afterwards. The parent holds the request as `{id, seq}` rather than a bare id, so a second click on the
same tag re-applies instead of being swallowed by an unchanged prop.

### Evidence

A problem's supporting records are the events that name it, kept **with their source**: `sourceType`,
`sourceRef`, `sourceUrl`, `summary`, `occurredAt`. The section shows the source type as a chip, the reference
and the summary, so a reviewer/experiment/document/PR stays recognisable — the alternative, a link list,
discards exactly the provenance that makes a record evidence. The same row can appear in the Activity column;
there it is movement, here it is support, and the two sections are computed from the same store rows rather
than duplicated in the model.

### Human steering — and what it excludes

`steering` and `interpretation` claims, **human-authored only**, scoped to the object they were aimed at:
the problem's own claims under `scope="problem"`, the axis's under `scope="axis"`, each group labelled.
The store filters (author type and kind are model semantics); the page does not re-filter, and it renders the
author type it is given.

Three exclusions are real, not assumed:

- **An ordinary note is not a claim.** Fixture E puts a note on the same problem as its steering claim; the
  check asserts the note's text is absent from the steering section.
- **An agent-authored interpretation is not a human constraint.** Pinned in the action suite, where the case
  can be created: the seed writes four annotations on one problem — a human steering claim, a human
  axis-scoped interpretation, an agent-authored interpretation, and a note — and the test asserts the read
  carries **one** row while the table carries **three** for that problem. The database is the counter-check,
  so "human only" cannot pass on a dataset that has nothing else.
- **A claim aimed at the axis is not a claim about each problem under it.** Target specificity is proven live:
  the fixture's axis-scoped claim renders under `scope="axis"` and the check asserts it does not leak into the
  problem's group.

**A decision worth recording:** the action surface does **not** accept `authorType` for a new annotation —
`add_annotation` documents "the author is taken from the session, never from input", and letting a caller
assert `human` would let an agent launder its own text into the protected class. The agent-authored case is
therefore testable in-process (where an agent actor is constructible) and not in the fixture, whose session is
the human seed admin. That is an honest limit of the fixture, not an untested path.

### The negative cases, and how "no shell" is defined

Fixture E's problem with nothing behind it (no repository, no step, no record, no claim) is the subject, and
the harness picks it from the projection rather than naming it. Two definitions matter:

- **A shell is a heading with no rows.** Repositories and evidence must not be present at all for that
  problem; the steering section *may* be — the axis carries a claim — but then it must have a row. That
  distinction is what makes the axis claim a **control**: it shows the section is rendering correctly rather
  than merely hidden, which is exactly the difference between "no data" and "the feature is broken".
- **Absence is not reported.** Nothing matching `missing repository|no evidence|none recorded` is added.

### Four checks that failed because the harness was wrong

Recorded because the failures were informative: (1) the sparse-problem selector matched the **resolved**
problem — which is correctly not selectable, so the click timed out; the predicate now requires
`state === "open"` and the click is guarded, failing a check instead of hanging the pass. (2) The
"nothing marked primary" check read the section's `innerText`, which **includes its heading**, so the
comparison was against text plus heading; it now reads the tag row. (3) The first shell check treated any
`Human steering` heading as a shell, including one holding the axis claim — which is the correct render; the
check now asserts a heading must have rows. (4) The inventory block asserted about **`axes[0]`**, and the
projection orders axes by recency — with every axis written inside the same millisecond by a fixture
re-application, that order is **tie-broken by title**, so the check asserted about a plan- and problem-less
axis and reported the absence as a failure (two FAILs, plus a skip). The subject axis is now chosen from the
projection by "the one with open problems", with a guard check that such an axis exists. This is the *same*
same-millisecond ordering property that root-caused the `117/1` flake in the action suite (§15) — worth
noting because it is the second time it has produced a false failure, and the lesson is about **choosing a
stable subject**, not about the code under test. In all four the page was right and the check was wrong, which
is why the numbers were worth chasing rather than silencing.

### What step 5 found outside the render

**The fixture was not idempotent for its own events — twice over, and the second layer was the interesting
one.**

`reconcile_topic` appends; nothing makes an activity unique by text. Two distinct defects followed from that:

1. **The layout pass re-sent its `activities` array on every application.** Repeated applies accumulated
   duplicates, visible on the page as four identical rows for one event and inflating the V1 counts (the
   Progress summary read **30 events** where the fixture declares 9). Fixed by filtering the array against
   what the topic already carries, by the only durable handles the fixture has — an activity's `sourceRef` and
   a claim's text.
2. **Fixture E's own linking guards read lists that cannot see the rows they were guarding.** The guard for
   the linked activity and its evidence record read an **axis-scoped** activity list capped per axis; the
   guard for the claims read the **topic's** annotations. But these rows are **problem-targeted**: they do not
   appear in a topic-targeted annotation list at all, and they fall out of a capped axis list once the axis
   has more items than the cap. So the guard concluded "not there" and wrote them again on every application —
   the dataset grew to two copies of the evidence, the activity and the claims, which is what showed up as
   paired rows in the Activity column. The guard now reads **`get_progress`**, the projection the page reads,
   which is the one read that exposes a problem's own `evidence` and `steering`.

   Fixing that exposed a **read gap worth recording**: no projection exposes a problem's plain *notes* — the
   projection carries claims, and the topic detail lists notes aimed at the topic or an axis. The fixture's
   note therefore cannot guard itself by text; it rides on the evidence guard, and the comment in the applier
   says so. Adding a note field to the projection purely so the fixture can check itself would be the wrong
   trade, and this is the honest alternative.

**Proven, not asserted.** The fixture is applied **three** times in a row against the same dataset: every
element reports "already there", and the tables are then read directly — **8 fixture activity rows with 8
distinct `sourceRef`s** (one each, not sixteen) and the linked problem carrying exactly **2** supporting
records. The previous, doubled rows on this instance were removed by keeping one row per `sourceRef`/text
before that run, so the dataset the numbers describe is the one a single application produces.

**`install-plugin.mjs` did not enable the plugin.** Its docstring promises "install and enable", but on a
fresh instance `install` alone leaves the plugin `disabled`, and the enable call is revision-guarded
(`{expectedRevision}`; an unnamed or stale revision is refused `409 stale_revision`). The script now enables
when needed and fails loudly if it cannot. Without it the clean-instance recipe's next step is a page that
does not load, with a one-line warning as the only clue.

The step-5 numbers were measured on a **rebuilt instance** — fresh data root, plugin installed and enabled,
the fixture applied once — so the recorded figures describe a dataset a reviewer can reproduce rather than one
this session accumulated.

## 14. What the shared dev instance measured, and the corpus record


Run on the shared dev instance (corpus + fixture + Fixture E), the same pass reported **50 pass · 1 fail · 0
skip** (as of step 1): the corpus record's 7 skips became real checks once fixture data was present, and one of
them failed. It was not the render. The check
*"filtering by a repository keeps only the axes that name it, and says it is filtered"* derives two things
from two different places: `CORPUS.repositories[0]` (the corpus repository, and therefore its topic) and
`CORPUS.topic` (the topic of the **first timeline group**, which on a mixed instance is a fixture topic). The
filter and the expectation describe different origins, so they disagree — the rails themselves were clean
(`stray []`). This is the mixed-dataset coupling U10 already owns; it is recorded here rather than papered over,
and the **committed corpus record was not overwritten** with a mixed-instance result. A corpus number that a
reviewer can reproduce needs a corpus-only instance — which now exists, and §16 is its record.

## 15. A pre-existing flake, root-caused

While running `bun run check` after the render, the U3 action test *"a refusal keeps its kind across the action
boundary"* failed — and then failed 3 runs in 6. It is not timing in the store: a topic's axes come back
`ORDER BY updated_at DESC, title ASC`, and whether the two fixture axes land in the same millisecond decides
whether the title tiebreak is reached, so the order flips. The store is deterministic given its data; the
assertion pinned a timing artifact, and it now compares as a set with the reason written next to it. This is
very likely the same class as the single unexplained `117/1` run recorded at U3's close — reproduced here, so
it is no longer an unexplained observation, though whether that run *was* this test cannot be proven after the
fact. The same pattern (order assertions over `updated_at DESC` lists) still exists at five sites in
`store.test.ts`; they passed 5 consecutive full runs, but they carry the same latent sensitivity.

## 16. The corpus record, re-measured on a corpus-only instance

§14 left the corpus figure where U3's step 10 had put it: taken against the shared dev instance, which is not
corpus-only. It has an instance of its own now — a fresh `NAKAMA_CONFIG_DIR`, the plugin installed **and
enabled** (the enable is what creates the org's data store), then the committed 695-call replay seeded into it
(all 695 calls accepted, 65.5 s). The served bytes are byte-identical to this repository's build; the release
label is `0.2.0` (a fresh install publishes the packaged version — a *reinstall* is what mints a
`+dev.<digest>`), revision **4**, generation `g724c4ea…`.

| dataset | instance | record (both 1440×900 and 1280×800) |
|---|---|---|
| corpus (695-call replay) | `:4500`, web `:3007`, corpus only | **52 pass · 0 fail · 26 skip** (step 5's record; **56 · 0 · 30** at step 6, §17) |
| fixture (applied once) | `:4400`, web `:3005`, fixture only | **80 · 0 · 0** (step 5's record; **87 · 0 · 0** at step 6, §17) |

**The 26 skips are a finding, not noise.** The corpus carries **no problem row and no plan**, so every check
whose subject is a problem — the Problem column, the open-problem inventory, repository threads, evidence,
human steering, the sparse negative cases — has nothing to read on it. Each prints `SKIP` with its reason and
is counted in the summary line, because `0 failed` must never be read as `everything exercised`.

**Three harness defects, one class: a check whose subject the dataset lacks killed the run instead of saying
so.**

1. The step-5 block read its subject unguarded — `withRelations.axisId` on `undefined` — so the pass died with
   a `TypeError` **after 40-odd checks**, reporting nothing about the page. It is guarded now: with no problem
   carrying more than one repository, the block's seven checks print `SKIP` and their reason.
2. Five step-2/step-4 checks needed a problem row. Four (the Problem column, the inventory listing, the row
   context, the active row) reported **FAIL** on a dataset whose subject they need, and a fifth passed
   **vacuously** — `expectedOpen.length === 0 || …` is a green tick on a dataset with nothing to tick. All five
   now `SKIP` with a reason.
3. The repository-filter check derived its expected topics from `row.topic` — a field the projection's axis row
   does not have; the row carries **`topicName`** (`store.ts:4002`). A field name a row lacks yields `null` per
   rail rather than an error, so the expectation collapsed to `[]` and the check was **red on every dataset**,
   corpus or fixture. It was the derivation step 3's rework had just introduced, so §14's "the filter worked
   while the check failed" was only half the story: the *other* half is that the replacement expectation could
   never have matched. It passes on both datasets now.

**The fixture total did not move to 81 — it is 80, with one check swapped.** The uncommitted step-5 edits add
the three-halves precondition (+1) and fold the fixture's closed-out-problem precondition into the conditional
that replaced it (−1). Verified by diffing the two runs' check lists: exactly one description left, exactly one
arrived. The expectation of 81 counted the addition and missed the removal; the run's own summary line is the
authority.

**The mixed-instance claim is measured now, not remembered.** A corpus pass pointed at the shared dev dashboard
(`:3003` → `:4399`) reads a payload of **6 axes / 2 people / 3 repositories** whose selected topic is `Layout
fixture — crowded card` — the corpus pass is reading the fixture dataset next to the corpus one. That is U10's
mixed-instance problem demonstrated in the corpus evidence path. The transcript is kept outside this repository
(the operator's scratch tree) on purpose: what this repository commits under `docs/corpus/` is the corpus-only
record.

---

---

## 19. One grammar across the four views (step 7, second half)

The reviewer accepted the frozen Progress record and set the propagation pass as the second half of step 7:
give Topics, People, Repositories and Overview the primitives Progress had just proved, **conservatively** —
"keep the accepted view-specific product rules intact rather than homogenizing them too aggressively."
That framing decided almost every judgement below.

**What was extracted into one place.** Five components now carry the grammar, and each is used by more than
one view:

- `EntityTag` (step 7) — one component, one attribute pair plus `data-rd-tag-label`, one `compact` style for
  use inside an existing line. Nothing about it changed here; the four views were changed to *use* it.
- `RecencyLabel` — the age, derived from **the timestamp the row is sorted by**, with that timestamp carried
  to the DOM (`data-rd-recency`). The four views had four phrasings (`updated <date>`, `last activity 3 days
  ago`, `· last reviewed …`) and no way to check any of them against the field they came from.
- `DetailHeader` — the selected-entity header (title node, exceptional status, a context line of tags). Used
  by the People panel, the Repositories panel, the topic card and the Progress card. The title is a *node*,
  not a string, so a card keeps its heading level and the Progress card keeps the `<h3>` its own checks read.
- `DetailHeader`'s context line is the same `rd-tags` cluster the Progress card already used, so the
  "compact context line, navigation tags" contract is one piece of markup in four places.
- `ActivityLine` (+ `EventDate`) — one recorded event, rendered one way. It reads a narrow structural type
  (`ActivityLineItem`), which both the C6 lists' `Activity` and the Progress feed's own row satisfy, so the
  two payloads did not have to be widened into one another. It renders a tag for every entity the event
  names and, where the view states it, the words for an unattributed event.
- `Notice` — an exceptional state that names which one it is (`empty` / `filtered` / `truncated`) and can
  carry the caller's own fact (the hidden-axis count) without a second element. A notice is never a tag.

**What each view now shows as tags** — always the entity's own name, always only where the entity is named,
never a call:

| View | tags it emits |
|---|---|
| Topics (the default, recency-first surface) | repositories and people from the topic's rollup (card header); the axis on every axis row and card; the repositories each axis lives in; in the topic's own activity, the axis, repository and topic each event names |
| People | the topic on each involvement line; the axis and its repositories on every axis row |
| Repositories | the topic on each "supports" link; the axis and repositories on every axis row |
| Progress | topic and axis on the reading surface's context line; topic, repository, person, problem and axis on every activity row |

**Two structural findings.** An index row is a `<button>`, so a tag **cannot** live inside one — nesting
buttons is invalid and the browser will not honour it. That is why the Overview's rows carry their tags on
the *title* (as the row's own name becoming a link) and in the subordinate line's cluster, and why the
Progress index's rows keep their context as text with the tags living on the card. The second: a view that
is not mounted has no DOM, so a check that reads a selection must first bring the view back — the same trap
as step 7's, one level up (there the *view* reset, here the *selection read* was stale).

**The checks.** Ten new ones, all dataset-honest:

1. every state row in every view renders its claim through the one badge (corpus: 3 rows in each of Topics,
   People, Repositories, none without a claim);
2. every recency label's words are the age of the timestamp it carries — the harness re-derives the age
   from the attribute and compares (corpus: 7 labels across all four views, each matching);
3. an exceptional state says which one it is and never navigates (fixture: the collapsed card's
   `truncated` notice; corpus: no such surface, so it skips with its reason);
4. a person's topic tags are the topics their own rollup links them to — every link covered, and **no tag
   naming a topic the rollup does not link** (this is why the assertion is coverage-plus-no-foreign rather
   than an equality: the panel's *activity* rows tag their topics too);
5. the same for a repository;
6. a topic tag clicked in **People** lands in Topics with that topic open, under the same name;
7. an axis tag clicked in **Repositories** lands in Progress/Axes with that axis selected;
8. a repository tag clicked in **Topics** lands in Repositories with that repository selected;
9. the whole traversal wrote nothing: no write action, projection byte-identical.

**Measured** (both viewports, each dataset on its own isolated instance):

| | fixture | corpus |
|---|---|---|
| step 7 second half | **105 · 0 · 1** | **72 · 0 · 33** |
| step 7 first half | 96 · 0 · 1 | 64 · 0 · 32 |

`bun run check`: 0 typecheck errors · 126 pass · 0 fail · 764 expect(). Release
`0.2.0+dev.caa231a415f0`, served `ui/app.js` `aa3a478c39ca045d7e96` identical across both instances, the vendored
checkout and the repo build.

**What deliberately did not change.** The four views' product rules are untouched: Topics still leads with
its 2–4 most relevant axes and keeps `Read topic` as its only disclosure control, People is still
person-first and never scores anybody, Repositories is still implementation-first, and the Progress
composition's columns are the ones step 6 froze. The propagation is grammar and navigation, not a redesign —
and the step-7 acceptance for Progress is still the record those views are measured against.

---

## 18. The EntityTag contract, exercised (step 7)

Step 7 was the Progress consolidation/finalization pass: make the shared components, the tag primitive, the status
treatment and the cross-view navigation match the UX contract, then freeze the acceptance record — with the first
**real** EntityTag navigation proof, so the tag contract stops being a styling convention and becomes an exercised
primitive.

**One tag, five types, one entry point.** `EntityTag` (`component-contract.md` § EntityTag) is now a single
component with a single pair of attributes (`data-rd-entity-tag` / `data-rd-entity-id`) plus `data-rd-tag-label`,
and the page has one navigation entry point (`openEntity(type, id)`) that maps an entity type to its canonical view
(`ENTITY_VIEW`). The repository tags that step 5 wrote by hand now render through it, unchanged on screen and in
the DOM, so the step-5 checks kept passing without edit — which is what "consolidation" has to mean.

**Where Progress emits tags.** The reading surface's context line names its topic and its axis — the contract's
DetailHeader "compact context line, navigation tags" — and the Activity column emits a tag for every entity its
event carries (topic, repository, person, and the problem the event is evidence for). Two rules came out of the
projection rather than the markup: a tag's label is the **entity's own name** (`topicName`, `title`, `fullName`,
`displayName`, the problem's `statement`), and a tag only renders when the entity is actually named — an event with
no mapped account says "no account attributed" in words rather than showing a tag that would name nobody, and a
reference the page's rollup does not carry renders no tag. No lookup, no call: every tag resolves from the payload
that view already read.

**The two entities whose home is Progress** needed the other half of the contract: a `preselect` on the view (the
same `{id, seq}` shape `RepositoriesView` already used, now on `PeopleView` and `ProgressView`), where an axis
target switches the subview to `Axes` and a problem target to `Problems`. `seq` is what makes the same tag land
twice after a hand-made selection. For a topic target the destination is the topic index and "selected" is the
expanded card — the detail is what makes a topic the subject of the page — applied in the page, since the index and
its detail are one screen.

**Three drift findings, all in the page's mirrors of the server's payloads.** (1) `ProgressProblemRow` in the page
omitted `topicId` (the store has it) — a topic tag cannot be built without an id, so this would have silently
dropped the topic half of the context line. (2) `ProgressEventRow` omitted `topicId` and `repositoryId`; the store's
`TimelineEvent` carries them. (3) The People and Repositories index rows carried display names but no ids, so a
"is this the entity I asked for?" assertion had to compare by name; they now carry `data-rd-person-id` /
`data-rd-repository-id`. This is step 6's lesson recurring at a third site: the page's own view types are
type-correct against themselves, so nothing but a DOM-vs-projection comparison catches a field the projection
sends and the mirror never declares.

**Two datasets, honestly.** The pass exercises each tag where the entity exists and `SKIP`s with a reason where it
does not. **Neither dataset's recorded events name a repository** (`repositoryId` is `null` on all 150 corpus events
and all 8 fixture events — the replay records commits with a source URL and links repositories through the
topic/axis relations, not per event), so the Activity column's repository tag renders nowhere yet and both runs
skip it; the repository *navigation* is still exercised, from the threads section, on the fixture. The corpus
carries no problem, so its problem tag skips too. The fixture exercises all the rest.

**Measured.** Release `0.2.0+dev.e026dbe92b22` on both instances (revision 28 corpus / 41 fixture); the served
`ui/app.js` hashes to **`77643db412aaf226`** on both instances, in the vendored checkout, and in this repository's
build. **Fixture acceptance 96 pass · 0 fail · 1 skip** at both 1440×900 and 1280×800 (was 87 · 0 · 0); **corpus
64 pass · 0 fail · 32 skip** at both (was 56 · 0 · 30). The ten added checks: the context tags carry the
projection's ids and labels; every Activity tag names an entity its own event carries and no more (row by row
against the live answer); an attributed event's person is a tag; topic, person, repository, problem and axis tags
each land in their canonical view **with the entity actually selected there** (the expanded card, the panel, the
active row) and with the label matching what the destination calls it; no status badge is a tag; and the whole
traversal wrote nothing — no write action called, projection byte-identical.

**One harness defect of my own, fixed and worth remembering.** Clicking a tag captured in one view, after the page
had navigated away, is a 30-second locator timeout that kills the pass — and an unmounted view loses its selection
(re-mounting Progress resets the subview and the axis to the projection's first row), so "what the last landing
left on screen" is not a fact. The checks now navigate, re-read, derive the subject **from the projection** (which
bucket can show a tag at all), click, assert — and skip rather than go red when the subject is absent. The pass
script's `--dataset` default also bit once: a fixture run without the flag writes the fixture's transcript into
`docs/corpus/`, contaminating a committed record; both runs were re-taken with the dataset named explicitly.

---

## 17. The index's two subjects (step 6)

Step 6 was specified as an **inversion, not a sibling**: with `Problems` selected the navigation object becomes
the concrete problem, and the reading surface, the sections and the Activity feed stay the ones already built.
The rule that makes that checkable is that switching is a **switch over one payload** — no request, no write, no
re-derivation — and the harness asserts it on **both** datasets.

**What rendered.** A two-option control (`Axes | Problems`, `data-rd-progress-switch`) sits above the composition,
with the left column as the thing it governs. In `Problems`, the column lists `get_progress.problems.problems` —
the server's rows, in the server's order, unfiltered and unsorted — each row carrying its state chip, its
statement, and one context line built from the row's own fields: parent axis, topic, repositories (or
`no repository`), the step it sits on, its event count and its recency. The fixture's index shows the three
problems of `Fixture: active axis (with evidence)` — the one on step 2 with two repositories and two evidence
records, the unlinked one behind nothing, and the closed-out one — in the projection's order, which is recency,
so the list is not a priority order and is not presented as one.

**The reviewer's spec, item by item.** Concrete problems instead of axes: yes, from the projection, unfiltered.
Server order: kept (a check compares the rendered id sequence against the live answer's). Enough context to
disambiguate: statement, state, parent axis, topic, recency — the row's own fields, with no lookup invented to
fill a gap. Same Problem reading surface: the card, the facts line, the plan, the three sections and the feed are
the same components, reading the same `shownProblem`; the check that proves it compares the **section counts**
against that problem's own projection row rather than against a constant. Activity follows the problem's parent:
in `Problems` the axis is *derived from the problem* (`shownProblem.axisId`), so the feed is the server's bucket
for that parent, and the column says so out loud (`on <axis title>`) instead of leaving a reader to assume the
events belong to the problem. Repository/evidence/steering keep using the one Problem object — nothing is
re-fetched or re-shaped for the subview. Switching creates and mutates nothing: asserted as an absence of calls
and as an identical payload.

**The selection rules, written down because they are the whole interaction.** `Axes → Problems` keeps the reader
where they were: their own problem pick if they made one, else the first **open** problem of the axis on screen in
the projection's order (the rule the axis index's own default already uses), else that axis's first problem
whatever its state, else nothing — a dataset with no problem has no bridge to preserve. `Problems → Axes` selects
the problem's **parent axis**, so the axis index marks the row the page is actually showing; a check exercises
exactly that round trip. No memory of "where I was" beyond that bridge, per the reviewer's "no elaborate
selection memory yet".

**One thing the mode had to change.** The card's heading in `Axes` is `Open problems (n)` — the projection's own
number. In `Problems` the card can be a problem that is closed out, and a count of open problems would then
describe something the card is not showing, so the heading becomes `Problem` with a context line naming where it
sits. Same components, a heading that stays true in both positions.

**The deferred question, answered: `get_progress` was not touched.** Step 2's `problems.filter(axisId)` stays,
and the problem index does **not** need it — the projection already returns every problem, in the server's order,
with the fields both positions read (the index uses the whole list; the axes-mode card uses the subset for the
selected axis). A second, "problems index" projection would have been a second source for one fact and a
migration of the read contract for a navigation change. Left alone deliberately, recorded here so a later reader
does not reopen it as an oversight.

**Two defects on the way.** (1) The page's own view type had gone stale against the projection: the new index
read `axisTitle`/`topicName` off a problem row and the mirror never declared them, so the component would have
rendered an axis-free context line. The typecheck caught it *this* time because the field was used in a typed
expression — which is why the step-1 mirror defect (a flattened level of nesting, invisible to the checker and
empty on screen) remains the more dangerous cousin, and why the harness's DOM-vs-projection comparisons exist.
(2) The rebuild loop had no script: `install-plugin.mjs` installs and enables but never reinstalls, so serving a
new build was a hand-run endpoint call. It is now `harness/reinstall-plugin.mjs` (`bun run harness:reinstall`),
which names the revision it read, reports the version change, and says so plainly when the vendored bytes are
identical to the release already installed — the case where a pass would otherwise silently measure the previous
build.

**Measured.** Release `0.2.0+dev.5b9351485fe2` on both instances, revision 12 (corpus) / 25 (fixture); the served
`ui/app.js` hashes to **`72e6b99c0cfaa27e`** on both instances, in the vendored checkout, and in this repository's
own build. Fixture acceptance **87 PASS / 0 FAIL / 0 skip** at both 1440×900 and 1280×800; corpus **56 PASS /
0 FAIL / 30 skip** at both. The seven added checks: the control and its default; the index against the
projection's list, order and fields; the picked problem in the same reading surface with the parent-axis
follow-through; the sections rendering from that same object; the parent-axis bridge back to `Axes`; and — on
both datasets — no action call and an identical payload. The corpus exercises four of them and skips three (no
problem row to index), plus its own empty-index check: with no problem in the dataset the index says
`No problems yet.` and the card says `No problem is recorded yet.`, rather than rendering an empty list that
would look the same as a load failure. `bun run check` = **0 typecheck · 126 pass · 0 fail · 764 expect()**
(unchanged: step 6 is page-side; the store, the actions and the field inventory are untouched). A seventh
published capture, `dashboard-problems.png`, shows the inverted index at the moment the checks describe.

**One correction that fell out of the measurement.** The step-4 section above and a harness skip reason both said
the fixture's axis carries *four problems, three open*. Step 4 was right about the instance it measured, but that
instance had been through the layout applier twice and the pre-step-5 applier duplicated a problem; step 5's
idempotency fix removed the duplicate, so a fresh apply gives **three problems, two open** — which is what the
step-5 transcript already printed. The prose and the skip reason are corrected; the measured claim they support
is unchanged. Three consecutive applies still prove idempotency.

**Not done:** step 7 (propagating the shared primitives into Topics, Repositories, People and Overview), and the
`state_log`-backed history UI. The corpus's problem-index checks will exercise on the day the corpus carries a
problem — `problems.problems` is empty on it today.
