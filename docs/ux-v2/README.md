# UX contract v2 — how this is being implemented

`contract/` is the redesign contract, kept **verbatim** as the reviewer wrote it (five Markdown specs,
five HTML prototypes, its `manifest.json`). The prototypes are visual references for hierarchy, density
and composition — where behavior or semantics are concerned, the Markdown is authoritative, and nothing
here is an HTML-to-plugin port.

This directory is the reviewer's entry point: `STATUS.md` says where the work stands right now,
`BASELINE.md` records the measured starting point, and this file maps the contract onto the work.

## What is being changed, and why it is not a layout refresh

Six requirements in the contract have no state behind them in the implementation as of the `pre-ux-v2`
tag, so the work is model-first and the UI is rebuilt on top of it:

1. **Overview becomes a view of its own** (contract `README.md` view model, `interaction-spec.md` §5):
   recency and attention, `[STALE]` on what has gone quiet. Today the topic-card list *is* the overview.
2. **Problem is first-class** (`information-architecture.md` §3): a concrete thing blocking or advancing
   an axis, traceable to repositories and evidence, with its own subview and its own tag type.
3. **Plan / work package** (`interaction-spec.md` §10): optional, with steps, never a template filler.
4. **Axis lifecycle widens and reopens** (`interaction-spec.md` §11): `usable` joins the vocabulary, the
   three reopen transitions are first-class, and history keeps the prior state instead of pretending the
   axis was never closed. There is no state-transition record at all today — axis "history" is its
   activity log.
5. **One navigation grammar** (`interaction-spec.md` §2–3, `component-contract.md`): an entity tag routes
   to a canonical view *and selects the entity*; a status badge never routes; the same entity looks and
   behaves the same everywhere. Selection is per-view local state today.
6. **Stale is recency, not diagnosis** (`interaction-spec.md` §3–4, `fixtures.md` G/H): derived from the
   timestamp that sorts the list, rendered as an observation, never as a state.

Smaller but real: confidence is null where there is no claim (§11 — mostly already true), recency comes
in two forms (`2d` vs `Mon · 28 Sep`), and Progress must keep **Problem and Activity side by side** at
1280×800 rather than becoming one long vertical document.

## Chunk map

Each chunk is named by what it delivers, not by a file. `STATUS.md` carries the live state.

| Chunk | Deliverable | Contract sections |
|---|---|---|
| **U0** | Contract + baseline + a pass anyone can re-run from a clone | — (groundwork) |
| **U1** | Migration 004: problems, plans + steps, axis state log, `usable` | `information-architecture.md` §2–3, §6; `interaction-spec.md` §11 |
| **U2** | Store writers + read models: problem/plan CRUD, the state-transition writer (a no-op refused, human-authored text protected, every write traceable), problem/plan/state-history projections, one stale derivation, overview recency, both Progress subviews — semantics pinned in `U2-store.md` | all of `information-architecture.md`; `interaction-spec.md` §9 |
| **U3** | Action surface + bundled skill for the new vocabulary (still five agent tools) — what landed, and the two findings from the boundary, in `U3-surface.md` | `information-architecture.md` §3, §6, §9 |
| **U4** | Five tabs, one route, canonical navigation for all five tag types — **as directed, started as a Progress-first vertical slice** (`U4-progress.md`): the axis index, then the Problem + Activity columns, the optional Plan/steps, open problems, repository threads/evidence/steering, the `Axes \| Problems` subview, and only then the shared primitives into the other four tabs | `interaction-spec.md` §1–2; `component-contract.md` EntityTag |
| **U5** | Overview | `interaction-spec.md` §5 |
| **U6** | Topics (index + detail) | `interaction-spec.md` §6 |
| **U7** | Progress (Axes \| Problems; Problem + Activity columns; optional Plan) | `interaction-spec.md` §9–11 |
| **U8** | People and Repositories on the shared grammar | `interaction-spec.md` §7–8 |
| **U9** | The shared primitives and the density pass | `component-contract.md` |
| **U10** | Fixtures A–J + the new checks | `fixtures.md`, `acceptance-checklist.md` |
| **U11** | Re-captured screenshots, docs, handoff | `acceptance-checklist.md` |

`acceptance-checklist.md` is the acceptance list. `STATUS.md` tracks it by section (with item counts),
and item by item as each chunk lands — the list is not restated here.

## Invariants (they must survive the redesign)

1. **One write path, atomic.** `reconcile_topic` stays the single writer; new units of work join the
   transaction in flight instead of starting a second one.
2. **`confirmed` requires evidence in the same call**; a caller-fixable refusal is `{ok:false,error}` and
   distinguishable from a bug; a stale write refuses with the `conflict:` prefix.
3. **Reading and editing are different modes** — opening a topic to read never implies editing.
4. **Nothing disappears.** Compression may disclose, never delete: provenance, evidence, attribution,
   state claims, history.
5. **Five exposed agent tools.** `find_tools` shows at most five definitions per call and a search by
   plugin name returns the whole group, so the new vocabulary fits the existing tools rather than adding
   a sixth.
6. **Both datasets, both viewports, every increment** — corpus 42·0·7 and fixture 49·0·0 as the starting
   point; a pass count that drops is a crash until proven otherwise.

## Decisions taken, and who took them

| # | Decision | Answer |
|---|---|---|
| D1 | Where v2 branches from | PR #1 (read/edit modes, grouped toolbar, one disclosure control, axis compression) merged to `main` first; `pre-ux-v2` tags the result and v2 continues on `ux-v2` |
| D2 | `draft` vs `usable` | `usable` is added **alongside** `draft` — seven states, nothing rewritten |
| D3 | Problems in the corpus | A **plausible synthetic** problem is acceptable at this stage (factuality is not the point yet). It is still written through the action surface, and `docs/corpus/README.md` labels it owner-authored |
| D4 | Reopen matrix | The full set (`usable`/`parked`/`completed` → `active`) |
| D5 | Reviewability | Everything the reviewer needs is published **in this repo** — contract, mapping, status, baseline and a runnable acceptance pass. The reviewer pulls the repo rather than reaching an instance |
| D6 | Deployment | Dev instance only until v2 is proven; the Docker deployment is out of scope |
| D7 | Topics editing controls (post-contract) | **Topics is read-first.** The later UX review supersedes earlier language retaining broad `Add Topic` / `Edit Fields` controls; the acceptance checklist's wording is the intended final behavior, and removing the broad controls is a **U6 refinement item**. See `DECISIONS.md` |
| D8 | UX-v2 baseline | U11 and the merge are **accepted** on `63e1d4c` / tag `ux-v2-complete`. Open after it: the U5/U6/U8/U9 refinement (incl. D7) and two hardening items from the contract audit — an executable **keyboard-focus visibility** check, and no browser test for structured conflict semantics (the store/action tests cover it) |

## How to check any claim in this directory

Nothing here asks to be taken on trust. `README.md` § "Run the acceptance pass" brings up an instance
from a clone and re-runs the pass that produced every number; `STATUS.md` quotes the run's own summary
line rather than a re-count of `PASS` lines, and each run's transcript is committed beside its dataset.
