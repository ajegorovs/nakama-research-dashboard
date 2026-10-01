# Status — UX v2

**Live page.** Updated as each chunk lands; every number is a run's own summary line, and every claim
here should be checkable with `README.md` § "Run the acceptance pass".

Last updated at the end of **U1**; **U2** is under way, with its semantics pinned in `U2-store.md` before
any view reads them.

## Where things stand

| Chunk | State | Evidence |
|---|---|---|
| **U0** Contract, baseline, runnable pass | **done** | `contract/` published verbatim · `BASELINE.md` · the pass moved in-repo and reproduces from a *fresh clone* on a *pristine checkout* (measured below) · PR #1 merged, tagged `pre-ux-v2` · three harness defects found by that run and fixed |
| **U1** Migration 004 (`usable`, state log, Problems, Plans) | **done** | `migrations/004-ux-v2-model.sql` · design note + truth table in `U1-migration.md` (§3.2, §4, §1a, §1b) · `harness/test-004.mjs`: **79 checks, 0 failed**, including the crash-after-COMMIT re-run · applied to the dev instance by the host's own applier — new generation `g9e344…`, ledger 001–004 · both acceptance passes green afterwards, plus the `abandoned` fixture axis and a check that every state the payload carries renders as itself |
| **U2** Store writers + read models | **the store layer is complete; not yet wired to anything** | `U2-store.md` (semantics, reviewer-approved) · writers, both Progress projections, the Overview recency projection, one scope builder, one recency/stale derivation and the §11 audit all landed · `bun run check` **111 pass · 0 fail · 596 expect() calls** (was 82 · 0 · 472) · 19 acceptance items covered by named tests · **owed by U3**: nothing here is reachable from an action or a page, and `usable` is still absent from `nakama.plugin.json`'s `axes[].state` enum → **the action half is delivered in U3** (`transitions[]`/`problems[]`/`plans[]`, `usable` in the enum); the page half is U4+ |
| **U4** Progress-first vertical slice | **in progress — steps 1–5 are rendered (index; Problem + Activity columns; the optional Plan section; the open-problem inventory; repository threads, evidence and human steering); steps 6–7 remain** | `U4-progress.md`. Finding: `progressAxes`/`progressProblems`/`overviewRecency` existed in the store and **no action exposed them**, so the slice's first half was a read action. `get_progress` returns both Progress projections from one window (read-only, `exposeAsTool: false` — still five tools; host schema validation accepted it on reinstall). Traceability: the payload is deep-equal to the store's own projections, and the field set is pinned (**4** top-level · **3** per projection · **16** per axis row at U4's start, **17** once step 5 added the axis's own steering · **4**/ **19** for the problems half, **21** after step 5's `evidence` and `steering` · and step 2's activity half: **3** keys, **3** per axis bucket, **14** per event — plus no V1 `scope/approach/progress/nextStep`) so a display-only field must be declared in the test before a component can rely on it. `bun run check` = **0 typecheck · 121 pass · 0 fail · 705 expect()**. Live (`dev.e39055d638ba`, revision 289, generation unchanged): both halves on one window, and the live JSON key set is **byte-for-byte the pinned inventory** — the page can rely on every key. Gap the live read exposed: the dataset has **0 problem rows**, so the Problems subview has nothing to render against → **fixture E is now seeded** (`harness/apply-layout-fixture.mjs`, contract `fixtures.md` §E: one open Problem on two repositories, a person link, an activity, an evidence record, a human-authored steering note, a plan step it sits on, and a second Problem with `planStep = null`), idempotent on re-apply, and **measured to leave the frozen baseline untouched**: fixture pass still **50/0/0** with it present, instance still 2 topics / 7 axes / 2 people / 2 repositories. Seeding it found and fixed a real defect: a claim with two targets (or none) answered **HTTP 500 with no `kind`** instead of a refusal — the JS target check lived only in `addAnnotation`, while the reconcile loop calls `insertAnnotation` directly and died on migration 004's CHECK constraint, a raw `SQLiteError` that escaped `run()`. The check now sits in the single insert path (no caller can skip it), `StoreErrorCode` gained `invalid-input`, and tests pin two-target/none/one-target. `bun run check` = **0 typecheck · 124 pass · 0 fail · 715 expect()**. **Step 1 (the axis index) is in:** it reads `get_progress.axes.axes` directly — order preserved, no client-side sort, no client-side staleness, no re-derived counts — and shows title, state + confidence, topic, problem count and recency. The page declares its own view types (it cannot import the store's), and the first mirror flattened one level of nesting, which **no typecheck could catch** and which rendered the view empty at runtime; the harness caught it in one run because its check compares the DOM against the live action. The harness gained the window check the reviewer asked for (**C7b**: the index must equal the projection for the current window at 30 and 7 days, replaced and not extended). **Step 2 (the real composition) is in:** index left, the selected axis's Problem in the centre, its Activity beside it, all three on one row, with the detail taken from `get_progress` — never reconstructed from the V1 topic payload. `get_progress` gained a third half, `activity`, **grouped per axis by the store** (so the page looks a bucket up instead of filtering a flat list), and tests assert `eventCount` equals the index row's `activityInWindow` and that `openProblems` equals the rows the column can list — a heading can never overstate its list. The selection rule is the reviewer's: the projection's first *open* problem is shown, **the others** are listed in the projection's order and are one click away, and nothing is ranked by recency or counts. Step 2 also exposed and fixed a model defect — an activity naming only its problem stored `problem_id` with **`axis_id = NULL`** (the writer's own comment claimed the axis followed from the problem), so it was invisible to that axis's feed and missing from its count; the derivation now lives in `insertActivity`, the single row path, with the same-call ordering limitation documented as a model fact. `bun run check` = **0 typecheck · 125 pass · 0 fail · 735 expect()**. Measured on the isolated fixture-only instance: **57 PASS / 0 FAIL / 0 skip at both viewports** (51 + step 2's six DOM-vs-projection checks). **Step 3 (the optional Plan section) is in:** it renders the axis row's `plan` — **no new read contract was needed** — below the composition: `stepsDone of steps.length`, the plan's `summary`, each step's stored state, and a number **only where that step claims a `position`**. The plan ↔ problem link reads both ways (the card names the step from `planStepTitle`; the step marks the problem's step from `planStepId`), and the check for it refuses to trust the default — the projection's first open problem on that axis is the *unlinked* one, so it selects the linked problem first and then asserts exactly one step is marked. Absence is first-class: an axis with no plan renders nothing at all, and the harness asserts both that the section is absent and that no "missing plan" wording appears. The fixture gained the case step 3 needed and did not have — an **unordered multi-step plan** (2 steps, no positions, written zulu-first in two calls so the store's order and an alphabetical sort genuinely disagree) — so "a client silently sorts null-position steps" is a **discriminator**: the check prints both orders and fails unless the page keeps the store's. A step's state is **stored**, not claimed (migration 004 has no confidence column for steps), so it renders through the same `StateBadge` with `kind="stored"`, emitting `data-rd-step-state` and **no** confidence attribute — inventing one would turn a stored fact into a claim. `bun run check` = **0 typecheck · 125 pass · 0 fail · 743 expect()** (the plan and step key sets are pinned, including that `position` is a number or null). Measured: **62 PASS / 0 FAIL / 0 skip at both viewports**, release `+dev.50252156e496`, **generation unchanged**, and the fixture still reports 2 topics / 7 axes / 2 people / 2 repositories with the unordered plan present — it adds structure, not entities. See `U4-progress.md` §8–§13. The per-axis Problem subsetting question is **resolved by the reviewer — keep it in the page** (the server owns which problems exist, their order, state, counts, visibility and stale semantics; the client only picks which already-returned subset to show), to be reassessed at step 6 when the primary navigation object changes. **Step 4 (the problem inventory) is in:** the axis's open problems get their own section below the plan, and the list step 2 had put in the card column **moved** there rather than being duplicated — every open problem appears, the one on screen marked active, so the row driving the card is visible. Membership, order, state and counts stay the projection's; the page still only chooses which already-returned problem the card shows. Each row's context line is the problem's own fields (repositories or `no repository`, the step it names, its event count, its recency). Resolved problems stay out, and the fixture gained one — created and then moved to `resolved` through `transitions[]` — so the axis now carries **4 problems, 3 open**, and the check asserts that case exists *before* asserting the inventory has 3 rows, so "open only" cannot pass on a dataset with nothing to leak. An axis with no open problem renders **no section at all** and nothing alarming (nothing matching `missing problem|error|warning|invalid` on the page), while its title and the card column keep rendering — the axis is meaningful on its own. The heading carries no count on purpose: the card column already states it. `bun run check` = **0 typecheck · 125 pass · 0 fail · 745 expect()** (the contract test also pins that a closed-out problem counts in its axis's `problems` and not in its `openProblems`). Measured: **69 PASS / 0 FAIL / 0 skip at both viewports** — 62 minus step 2's "the others are listed" check, whose list left that column, plus step 4's eight — release `+dev.fea09a3701bf`, revision 65, **generation unchanged**. See `U4-progress.md` §12. **Step 5 (repository threads, evidence, human steering) is in:** three supporting sections below the inventory, in the contract's order, because they answer three different questions. **Repository threads** are the selected problem's durable relations, in the projection's order, rendered as `EntityTag`s — and **the EntityTag contract is executable now**: the harness clicks **both** of the fixture's repository tags and asserts each one lands in the Repository view with that repository selected and the repository set unchanged (one tag could pass by accident; two prove the contract). Nothing is marked primary, asserted structurally: the tag row's text must be exactly the repository names, so a rank marker would be text the names cannot account for. **Evidence** keeps provenance rather than becoming a link list — each row shows its source type, reference, summary and date, checked against the projection's own `sourceType`/`sourceRef`/`summary`. **Human steering** shows `steering`/`interpretation` claims, **human-authored only**, with the problem's own claims and the axis's under **separate scope labels**; the fixture's **axis-scoped claim is a live control** that it renders under `scope="axis"` and does not leak under the problem's. Three exclusions are pinned rather than assumed: an **ordinary note** on the same problem is not steering (fixture note, asserted absent from the section); an **agent-authored interpretation** is not a human constraint (contract test — the seed writes four annotations on one problem and the read carries one while the table carries three, the database being the counter-check, so "human only" cannot pass on a dataset with nothing else); and a **claim aimed at an axis** is not a claim about each problem beneath it. **A decision worth recording:** the action surface does not accept `authorType` for a new annotation ("the author is taken from the session, never from input"), so an agent cannot launder its text into the protected class — the consequence is that the agent-authored case is testable in-process and not in the fixture, whose session is the human seed admin. Negative cases: the problem with nothing behind it renders **no repositories and no evidence section at all**, and the steering section may appear only if the axis carries a claim, in which case it must have a row — a shell is a heading with no rows. `bun run check` = **0 typecheck · 126 pass · 0 fail · 764 expect()** (axis row **17** fields, problem row **21**; the steering test also pins that a claim aimed at the axis never appears among a problem's claims). Measured on a **rebuilt** isolated instance (fresh data root, plugin installed and enabled, fixture applied once): **80 PASS / 0 FAIL / 0 skip at both viewports** (69 + eleven), release `+dev.f3eff70d4eae` (the release digest covers the manifest's folders — `actions`, `migrations`, `ui`, `skills` — never `src/` or `harness/`, so it reproduces from a clean clone; the revision is a per-instance counter), revision 17, migrations unchanged so the generation is stable. Step 5 also found and fixed two real fixture defects — the layout pass re-sent its activities on every apply, and Fixture E's own guards read lists that **cannot see problem-targeted rows**, so both duplicated events on re-apply; the fixture is now proven idempotent by three consecutive applies with the tables read directly (8 fixture activities, 8 distinct refs). It also fixed `install-plugin.mjs`, which promised "install and enable" but never enabled. Re-running the pass on a **corpus-only instance** then exposed three more harness defects of one class — a check whose subject the dataset lacks aborted the run or went red instead of printing `SKIP <reason>`: the step-5 block read its subject unguarded (`TypeError` on `withRelations.axisId`, after 40-odd checks had already reported nothing about the page), four step-2/step-4 checks required a problem row the corpus does not have, and the repository-filter expectation read `row.topic` where the projection's axis row carries **`topicName`** — so it was red on *every* dataset. All fixed; the corpus record is now **52 pass · 0 fail · 26 skip** at both viewports on a corpus-only instance (the 43 · 0 · 7 it replaces was never corpus-only), the fixture stays **80 · 0 · 0** — one check swapped for another, not added. See `U4-progress.md` §13, §16 |
| **U3** Action surface + skill | **done — steps 1–10** | Steps 1–8: real typechecking (0 diagnostics, both modes), `usable` in the exposed enum, `transitions[]`/`problems[]`/`plans[]` on `reconcile_topic`, a machine-readable `kind` on every refusal, `get_topic` carrying problems/plan/state history, and the skill stating the new semantics + the retention rule. `bun run check` = **0 typecheck · 117 pass · 0 fail · 654 expect()**. Live: release re-minted (`dev.cc3e078d2bb6`, generation unchanged — U3 adds no migration), the **Axis and Problem** lifecycles proven through the host's action route, corpus **43/0/7** and fixture **50/0/0 at both viewports** on an isolated fixture-only instance. See `U3-surface.md` |
| U5 Overview | not started | — |
| U6 Topics | not started | — |
| U7 Progress | **pulled forward into U4's first vertical slice** (reviewer's reorder: Progress is the only view whose contract depends on the new semantics) | — |
| U8 People + Repositories | not started | — |
| U9 Primitives + density | not started | — |
| U10 Fixtures A–J + new checks | not started | — |
| U11 Screenshots, docs, handoff | not started | — |

## U1 in one screen

**What 004 changes.** `development_axes.state` gains `usable` (the enum is the union of the implementation's
six states and the contract's six — seven, and no existing row is mapped onto the new one); `state_log`
becomes append-only history for axes *and* problems, seeded with one provenance row per existing axis
(`origin='migration'`, `from_state NULL`, `observed_at NULL`); `problems`, `plans`, `plan_steps`,
`problem_repositories`, `problem_people` are created, with plans optional and nothing backfilled;
`annotations` gains `problem_id` + `kind` + a nullable `confidence`, so interpretation and steering are
*claims* that can never be overwritten by later automation. The truth table is `U1-migration.md` §3.2 and
the schema is §6.

**What running it proved** (`U1-migration.md` §1a, each found by a test failing on the host's own engine,
bun:sqlite 3.53.2):

- `DROP TABLE` of a parent with foreign-key enforcement ON silently cascade-deletes every child row — so
  `PRAGMA foreign_keys = OFF` in the migration is load-bearing, not decorative.
- a plain `BEFORE DELETE … RAISE(ABORT)` on the log also fires for foreign-key cascades, which would have
  made `deleteAxis` throw for every axis — the trigger carries a `WHEN EXISTS (subject)` guard instead.
- `ALTER TABLE … RENAME TO` re-parses the schema, so the *second* execution failed until
  `PRAGMA legacy_alter_table = ON` was added — the re-runnability requirement caught this, and nothing else
  would have.

**How it was applied** (worth knowing, because it is not a boot action): the host runs plugin migrations
only during an install/enable/update cycle, and a pending migration makes it build a **new database
generation**, leaving the previous one in place untouched. For this checkout that cycle is
`bun harness/update-plugin.mjs --env-file … --data-root …`, which drives
`POST /v1/plugins/official/research-dashboard/reinstall`, after `./vendor/vendor-into-nakama.sh <checkout>`
(the instance reads the vendored copy, not this working tree).

## What the pass says right now

**Baseline (U0), measured from a clone of this repository on a pristine upstream checkout (0.4.35), against
instances the run started itself from empty data roots — one per dataset, never shared:**

| Dataset | Viewport | Result |
|---|---|---|
| corpus (695-call replay) | 1440×900 | 42 pass · 0 fail · 7 skip |
| corpus | 1280×800 | 42 · 0 · 7 |
| fixture (applied) | 1440×900 | 49 · 0 · 0 |
| fixture | 1280×800 | 49 · 0 · 0 |

`bun run check` unchanged: **82 pass · 0 fail · 472 expect()** — the U1-era figure. U2's store work takes it
to **111 · 0 · 596** (see the U2 row above); the 82 is kept here because it is what that run measured.

**After 004, on the migrated dev instance** (generation `g9e344…`, plugin version `0.2.0+dev.d5b23ff08253`,
same estate instance the baseline numbers came from, dashboard `http://100.122.4.42:3003`):

| Dataset | Viewport | Result | Conditions |
|---|---|---|---|
| corpus | 1440×900 | 43 · 0 · 7 | migrated generation, corpus `695`-call replay re-applied after the fixture run |
| corpus | 1280×800 | 43 · 0 · 7 | same |
| fixture | 1440×900 | 50 · 0 · 0 | **fixture-only instance** (plugin rows wiped first) |
| fixture | 1280×800 | 50 · 0 · 0 | same |

Both counts are one higher than the baseline because U1 added one check — *"every axis state the payload
carries reaches the page as that state"* — which asserts exactly what the new `abandoned` axis exists to
make assertable: on the fixture it reports `states [blocked, active, draft, parked, completed, abandoned]`
and nothing unrendered; on the corpus, `states [active, completed]`. It is the difference between the
seventh state being *on screen* and being *covered*.

Data after migrating, before any wipe: 1 topic, 3 axes (2 `active`, 1 `completed`), 694 activities, 7
annotations — byte-identical to the pre-004 fingerprint — plus 3 bootstrap rows in `state_log`. Ledger:
`001`, `002`, `003`, `004`.

One measurement that did **not** match, and what it means: with the fixture applied *on top of* the corpus
data (3 topics, 9 axes), the fixture pass is 48 · 1 · 0. The failing check is
`verify-page.mjs:1088` — it requires the filtered view to name exactly one topic, hard-coded to
`CORPUS.topic`, which in fixture mode is the fixture's topic; with the corpus topic still present, the
filtered view names that instead. It is a harness assumption, not a plugin or migration regression:
fixture-only, the same checks are 50 · 0 · 0. Recorded rather than smoothed over, because a reader
comparing the two tables would otherwise wonder which number to trust.

**Current (U4 steps 1–5), measured on the isolated fixture-only instance** — its own instance, its own empty data
root, plugin installed and enabled, the fixture applied once, the same recipe as the rows above: fixture
**80 · 0 · 0** at both 1440×900 and 1280×800 (the pass swapped one check for another at step 5, so the total
stays 80 rather than moving to 81 — see the README's expected-numbers paragraph). It was 50 after U1, 51 after U4's step 1 and 57 after step 2; step 3 added five, all comparing the
DOM against `get_progress`'s own answer (`U4-progress.md` §11): the plan renders **below** the top row from the
projection with no fourth column; step numbers come from the stored `position` and a stored step state carries
no invented confidence; the plan ↔ problem link is marked in both directions (after deliberately selecting the
*linked* problem, since the projection's first open problem on that axis is the unlinked one); an **unordered**
plan keeps the store's order and invents no sequence — a discriminator, because the fixture's two unpositioned
steps are written so that the store's order and an alphabetical sort disagree; and an axis with **no** plan
renders no section and no "missing plan" wording. Steps 1–2's checks are in the same 62 (`§9`, `§10`).
**Step 4 added eight and removed one** — the check that asserted step 2's inline "the others" list, which is no
longer in that column because that list *became* the inventory section (`U4-progress.md` §12): every open
problem of the axis is listed in the projection's order with its own state, repositories, step link and recency
and nothing re-derived; the row driving the card is the active one, and selecting another moves both; a
**closed-out** problem on the axis is not listed (the fixture gained one precisely so this can fail); and an
axis with **no** open problem renders no section at all and nothing alarming, while its title and the card
column keep rendering.

Run instead on the **shared dev instance** (corpus + fixture + Fixture E), the same pass (as of step 1) reported
**50 · 1 · 0**: the skips of the corpus record became real checks once fixture data was present, and one of them
failed. The coupling was real, and it was not the whole story. The check derived its expected topics from
`CORPUS.topic` (the first timeline group) while the filter it applies comes from `CORPUS.repositories[0]`, and on
a mixed instance those describe different origins. Step 3's rework replaced that with a **derived** expectation
read off the projection — and the replacement carried a defect of its own: it read `row.topic`, a field the
projection's axis row does not have (the row carries `topicName`, `store.ts:4002`), so the expectation collapsed
to `[]` and the check was red on **every** dataset, corpus or fixture. The corpus re-run recorded below is what
surfaced it. It now passes on both datasets, with the expectation naming the topics the surviving rails' own axes
belong to.

**The corpus record is measured on a corpus-only instance now** (server `:4500`, its own empty data root, plugin
installed and enabled, the committed 695-call replay seeded into it — all 695 calls accepted, 65.5 s; release
`0.2.0`, revision 4, generation `g724c4ea…`). It reads **52 pass · 0 fail · 26 skip** at both viewports. The
record it replaces (**43 · 0 · 7**) was never a corpus-only measurement: it was taken against the shared dev
instance and predates steps 3–5's checks. The 26 skips are the checks a corpus with no problem row and no plan
cannot exercise, each printed with its reason — and a corpus pass run against the shared dev instance now reads
the fixture's topic alongside the corpus one (6 axes / 2 people / 3 repositories), which is U10's mixed-instance
problem demonstrated in the corpus evidence path rather than described.

## Open

- **Nothing writes `state_log` yet.** That lands in U2/U3 with the transition writer. Consequence today:
  after a wipe and re-seed, the log is empty and newly created axes have no history — the bootstrap is a
  migration-time event, and a wipe takes its rows with the axes it described. The bootstrap itself is proven
  by `harness/test-004.mjs`, not by inspecting the running instance.
- **`usable` is reachable in the database but not writable through the action surface.**
  `nakama.plugin.json`'s `axes[].state` enum still lists the six original states; U3 has to add `usable`
  there, and to the skill, for the state to be first-class end to end.
- **The fixture pass needs a single-dataset instance** (see the 48 · 1 · 0 note). Either the check becomes
  dataset-aware or the recipe documents "wipe before applying the fixture"; U10 owns fixtures, so it is
  parked there with this evidence.
- **D3 is a deliberate relaxation**, still to be delivered with U3: the corpus gains one owner-authored
  problem statement, and `docs/corpus/README.md` must say so — a reader who knows the corpus's "nobody chose
  its state" claim should see exactly where it stops being true. (004 creates no problems: the table is
  empty, which is why the corpus's numbers are unchanged.)
- **The plugin is confirmed on upstream 0.4.35** — newer than this estate's deployment (0.4.31).
- **`abandoned` now has page-level coverage.** It is in the layout fixture (the crowded card), and the
  passes above assert it reaches the page as its own state — which is what the fixture axis exists for. The
  remaining A–J fixtures are U10's.
- **The retention boundary is a documented product rule, not fixed behaviour** (`U1-migration.md` §1b):
  completing, parking and abandoning are the ordinary ways a line of work stops; **deleting an axis or a
  problem is destructive cleanup**, and it takes that entity's history with it. Making history survive
  deletion is its own schema decision — tombstoning, or detached historical subjects — deliberately not
  smuggled into 004. U3's skill update must state the rule in the librarian's own words.
- **An observed ordering, recorded for U7:** with the fixture's six states on one card, the detail renders
  `blocked · abandoned · active · completed · parked · draft` — `abandoned` second, not last. The contract
  states no axis order (its only ordering rule is "Problem before Activity before secondary support
  material" inside a Problem, `contract/interaction-spec.md:261`), so nothing is violated today; ordering
  becomes a requirement when Progress is built, and the fixture is now where to pin it.
- **A harness defect is recorded rather than fixed:** `verify-page.mjs:1088` requires the filtered view to
  name exactly one topic and hard-codes the corpus's topic, so the fixture pass reports **48 · 1 · 0** when
  run on an instance that also holds the corpus. The frozen protocol isolates the datasets, so it is not a
  migration failure — it is a page check that should assert the *selected* topic rather than assume there is
  exactly one. U10's, with this evidence.
- **Nothing in this repo typechecked — found in U2, closed as U3's first commit** (`U2-store.md` §7).
  `bun run check` used to be `bun build` + `bun test`: types were stripped, never verified, and the repo had
  no `typescript` dependency and no `tsconfig.json`. It hid a real bug in U2 — a projection dated every axis
  from a property `AxisScan` does not have, so `undefined` became `null` and no axis was ever stale, with
  nothing failing. Now: `typescript` + `@types/bun` + `@types/react`, a committed `tsconfig.json`
  (`strict`, `src/` + `types/`), `types/host.d.ts` for the unpublished host surface, `bun run typecheck`, and
  `bun run typecheck:host` — the same compiler options against the real host types, which is authoritative.
  **0 diagnostics** over 6 files / ~11,900 lines, both modes agreeing; nothing legacy was suppressed or
  excluded. Measured along the way: 427 → 18 → 3 → 0, where the only three that were ever *code* were in a U2
  test file, fixed by making the tests assert what they meant.

  **The baseline moved on purpose, and the counts are not comparable across it.** Before U3's first commit,
  `bun run check` green meant *bundles + tests pass*. It now means **typechecks + bundles + tests pass**. The
  counts are only comparable *after* that commit: 111 · 0 · 596 (U2-era, two-part command) → 117 · 0 · 654
  (U3, three-part command) → 121 · 0 · 705 (U4's Progress data boundary) → **124 · 0 · 715** (U4, after
  Fixture E exposed a claim-targeting refusal that escaped as a server error). Anyone re-running an older
  number against this tree is running a different check.

  U3 also **reran the acceptance passes** (its step 10), so the closing statement above is re-verified:
  corpus **43 · 0 · 7**, fixture **50 · 0 · 0** at both viewports — the fixture run on an **isolated
  fixture-only instance**, which is what the two-dataset rule in the README requires. One earlier fixture run
  on a mixed instance returned 49 · 1 · 0 for the repository-filter check; the cause was the harness deriving
  its baseline from whatever dataset the instance held (`verify-page.mjs:1104`), not a regression, and the
  same check passes with fixture values when the fixture has an instance to itself. The harness coupling is
  still filed for U10 (mixed-instance robustness) but it does **not** block the frozen baseline.
  (**Superseded at U4's step 5:** the corpus figure here — 43 · 0 · 7, out of 50 checks — was measured on the
  shared dev instance and predates steps 3–5's checks; on a corpus-only instance the pass now reads
  **52 · 0 · 26**. See the current block above.)

  **Reviewer rulings on step 1** (approved): `harness/*.mjs` stays **outside** the strict program — out of
  scope by decision, recorded as a future hardening item naming the four scripts that decide acceptance
  evidence (replay, install, page verification, migration proof), and *not* `checkJs` in this step, because
  it would broaden the baseline again immediately after stabilizing it. `types/host.d.ts` is a **compatibility
  shim, not the authoritative host API**: `typecheck:host` is the authority, and a disagreement is fixed in the
  shim, never by bending plugin code to a stale local declaration. Any commit touching that file must run
  `typecheck:host` first and name the host revision it checked against. `@types/react@18` stays pinned, with
  the reason (classic JSX runtime + the global `JSX` namespace the host injects) recorded next to the
  dependency policy in the README so nobody upgrades it casually.

  **The one unreproduced test flake, now root-caused.** A single `bun run check` during U3's step 10 reported
  117 pass / 1 fail; the failing name was not captured (only the tail was). It did not reproduce at the time:
  `bun test src` and `bun run check` were green twice, and the 50-test concurrency-heavy file passed three
  consecutive runs — the observed run was competing with an isolated Nakama server, a vite dev server and two
  Chromium sessions, so contention stayed the likeliest cause. Running `bun run check` after U4's render then
  made the same class reproducible: *"a refusal keeps its kind across the action boundary"* failed 3 runs in 6.
  The cause is not contention and not the store. A topic's axes come back `ORDER BY updated_at DESC, title ASC`;
  whether the two fixture axes land in the **same millisecond** decides whether the title tiebreak is reached at
  all, so the asserted order flips whenever the inserts straddle a millisecond boundary. The store is
  deterministic given its data — the assertion pinned a timing artifact. It now compares as a set, with the
  reason written next to it. Whether the U3 run was *this* test cannot be proven after the fact, but the class
  is no longer unexplained. The same pattern (order assertions over `updated_at DESC` lists) still exists at
  five sites in `store.test.ts`; they passed 5 consecutive full runs, but they carry the same latent
  sensitivity and should be compared as sets when next touched.

## What a reviewer can usefully do at this point

- Re-run `bun harness/test-004.mjs --db <your pre-004 database>` and check the checks themselves: the
  interesting ones are the invalid combinations (axis row with a problem state, both ids NULL, both set, a
  duplicate bootstrap) and the re-run. If a check is asserting something weaker than it claims, that is the
  finding worth reporting.
- Read `U1-migration.md` §6 against the contract one more time for columns that should have stayed claims —
  the test for a column is written down there, and it is the cheapest place to catch one.
- Run the acceptance pass from a clone (README § "Run the acceptance pass") and say where the recipe had to
  be guessed; U0's version of that exercise found four defects, and 004 added two operations to the recipe
  (vendor, then reinstall).
