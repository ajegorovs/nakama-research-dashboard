# Reviewer strategy — composition phase (2026-10-02)

Stored **verbatim** as returned, routed owner → agent. Debrief: `2026-10-02-composition-intake.md`.
Nothing in this document has been implemented.

---

I went through the checkpoint material, including the fidelity screenshots, `REVIEW.md`,
`REVIEW-PACKET.md`, `COMPOSITION.md`, the post-contract decisions, the approved prototype HTML, and the
current `src/ui.tsx`.

The agent’s own verdict is correct: this is not a small styling drift. It is a **composition drift**. The
implementation has most of the right semantics and data, but several views are arranged in the wrong page
model.

The screenshots make that very obvious.

The current Topics and People views are essentially **vertical report pages**. The prototypes are
**master-detail applications**. The current Progress page is a **three-column data browser**; the prototype
is a **selected-axis detail page with a subordinate activity rail**. Repositories is the only view already
structurally close.

So I would not ask the agent to “polish toward the prototypes.” I would treat this as a **controlled
composition refactor**, with the existing data model, actions, tags, state semantics and U9 token system
held fixed.

The good news is that the repo is now set up for exactly that. `COMPOSITION.md` is largely the right scope.
I agree with its unit order, with one refinement to the implementation strategy.

## What I think the target should be

The four navigable views remain:

**Topics · People · Repositories · Progress**

The approved Overview prototype should still be implemented, but per the decision already recorded, it
becomes the **default landing composition**, not a fifth button.

That means the shell has two states conceptually:

- no explicit view selected / dashboard landing → Overview composition;
- user selects Topics / People / Repositories / Progress → that view.

“Research overview” remains the shell title. Each selected view gets its own internal heading.

That is consistent with the decisions already recorded and avoids reopening navigation.

## The main refactor principle

Do **not** rewrite the data layer.

The current work has already paid heavily for:

- store semantics;
- projections;
- action boundaries;
- tags;
- state/confidence semantics;
- stale derivation;
- plans/problems;
- activity grouping;
- human steering;
- test fixtures.

The composition phase should operate almost entirely in `src/ui.tsx` plus the browser harness.

I would explicitly prohibit during C1–C5:

> no new actions, no new projections, no schema changes, no new lifecycle semantics, no new derived ranking.

If a prototype element cannot be produced from existing payloads, first ask whether it is genuinely required
or just mock content from the prototype. Do not extend the backend reflexively.

## I would execute it in this order

### C1 — Topics, but build shared master-detail primitives while doing it

This is the most important correction because the current Topics screen is furthest from the intended
interaction.

The target should look like the prototype:

**left rail**
- compact topic index;
- title;
- current-axis count;
- recency;
- STALE only when applicable;
- selection highlight;
- no entity tags inside the row.

**right detail**
- selected topic always visible;
- topic title/description;
- entity tags;
- current work in compact axis rows;
- completed/abandoned work folded;
- right-hand recent activity;
- Notes;
- Related repositories;
- narrow note/correction affordance only.

Critically, **remove the count-chip strip from the main detail**. It is one of the strongest visual signs of
the current dashboard drifting into “database report” mode.

The prototype answers:

> what is this topic, and what is happening inside it?

The current screen answers:

> how many rows of each state exist?

Those are not equivalent.

While implementing C1, extract reusable composition components, not business abstractions. Something like:

- `MasterDetailLayout`
- `IndexPanel`
- `IndexRow`
- `DetailPane`
- `DetailColumns`
- `Section`
- `SideRail`

Do not build a giant generic “EntityDetail” component. Topics, People and Repositories have different
information grammar; only the geometry should be shared.

### C2 — People, using C1’s geometry almost mechanically

People should become the same index/detail composition.

The running screenshot currently makes People look like an audit dump:
- person;
- counts;
- all axes;
- all activity.

The prototype is much clearer:

**index**
- person;
- handle;
- topic/current-axis counts;
- recency.

**detail**
- name / handle / short role context;
- topic tags;
- Current involvement;
- Recent activity;
- About;
- Related repositories.

I would be conservative about the “bio” field. If there is no real role/bio payload, do not fabricate prose.
Use whatever factual role/context exists, or omit the block cleanly.

This should be a cheap unit if C1 is done properly.

### C4 — Progress next, before Overview

I agree with the plan’s C1 → C2 → C4 → C3 → C5 order.

Progress has the most valuable model and should be realigned before building the landing page.

The current screenshot is too flat:

> axis index | problems | activity

That makes the **problem itself visually secondary**, which is the opposite of what we designed.

The target should restore the prototype hierarchy:

**left**
- Axes / Problems toggle;
- index below it.

**right detail**
- selected axis header;
- topic/repo/person tags;
- recency.

Then inside detail:

**main column**
- Problem as the dominant block;
- Current reading;
- Plan/work package;
- Open problems;
- then Repository threads / Evidence / Human steering in a three-card band.

**right rail**
- Activity.

This is the biggest conceptual visual correction after Topics.

I would preserve the U9 activity cap; the prototype only shows a few events anyway. The cap is compatible
with the composition.

For the Problems subview, do not invent a second layout. Keep the same detail shell, but selection
originates from Problems and the parent axis context is explicit.

### C3 — Default landing / Overview aggregation

Only after Topics/People/Progress share the new composition grammar.

The approved Overview prototype is actually quite good for the dashboard’s “10-second view”:

**left column: Topic activity**
- topic;
- description;
- compact current-work tags/state;
- latest event;
- recency;
- “Open topic →”.

**right column: Repository activity**
- repo;
- description;
- latest event;
- activity count in window;
- recency;
- “Expand activity →”.

This is much closer to the original goal:

> what is moving and what has gone quiet?

than the current landing page, which is effectively Topics rendered as large cards.

I would not reintroduce an Overview nav item. The default landing can simply render this composition until
the user selects one of the four views.

One interaction needs to be explicit: clicking `Open topic →` should set `view=Topics` and select that topic.
`Expand activity →` should set `view=Repositories` and select that repo.

### C5 — Repositories last

Repositories already has the correct macro-layout. I would not refactor it aggressively.

Bring it into the same geometry/treatment as Topics and People:

- same index widths/gaps;
- same selected-row language;
- same detail header;
- compact Current Work rows;
- right-side Recent Activity / Supports / People / Notes;
- recency top-right.

This should mostly be convergence, not reconstruction.

## One thing I would change in the agent’s current plan

I would make **composition fidelity itself executable**, not just rely on fresh montages.

The previous harness failed because it proved semantics but not spatial composition.

For each unit, add a small number of geometry assertions at 1440×900 and 1280×800.

Not pixel-perfect snapshots. Structural geometry.

For Topics/People/Repositories:

- index left of detail;
- index width roughly 280–350 px;
- detail wider than index;
- selected detail top aligned with index;
- inner main column left of side rail;
- both visible concurrently at 1280.

For Progress:

- index left of detail;
- Problem left of Activity;
- Activity rail narrower than Problem;
- Problem + Activity visible concurrently at both target widths;
- support cards below Problem;
- toggle above index.

For landing Overview:

- Topic activity and Repository activity are side-by-side;
- topic column wider than repository column;
- both begin in first viewport.

This would close the exact testing blind spot that created the drift.

## I would also require screenshot review after every composition unit

Not only at the end.

After C1:
- prototype Topics;
- running Topics;
- montage;
- owner/reviewer check.

Then C2, C4, C3, C5.

The reason is simple: if C1 establishes the wrong shared master-detail grammar and we reuse it everywhere,
the drift multiplies.

The agent already has the fidelity tooling. Use it as a first-class gate.

## What I would leave untouched

I would explicitly tell the agent not to disturb:

- U1–U3 model/store/action work;
- state vocabularies;
- Problem/Plan semantics;
- tag routing;
- human-authored text rules;
- stale logic;
- confidence logic;
- activity window semantics;
- U9 tokens;
- structured refusals;
- fixture/corpus provenance;
- H1 branch.

H1 should indeed remain parked until C1–C5 are done.

## About the current `src/ui.tsx`

The file has become large enough that this phase is a good opportunity to reduce risk, but I would not turn
that into a full architecture rewrite.

The UI file is ~165 KB and currently contains:
- DTO mirrors;
- shared primitives;
- all four views;
- CSS;
- shell logic.

I would permit a **light extraction only if it directly reduces composition risk**, for example:

- `ui/layout.tsx` — master-detail/index/detail primitives;
- `ui/primitives.tsx` — existing EntityTag, StateBadge, RecencyLabel, ActivityLine;
- keep view-specific components together initially.

But I would not make “split ui.tsx” a prerequisite. A large file is less dangerous right now than mixing a
file-architecture refactor with a visual-composition refactor.

First make the page look right. Extract afterwards if needed.

## What success looks like

I would not call the composition phase done merely because the harness is green.

I would require three classes of evidence:

1. **semantic regression**
   - `bun run check`;
   - host typecheck;
   - isolated corpus and fixture passes.

2. **composition geometry**
   - explicit DOM bounding-box assertions at both viewports.

3. **visual fidelity**
   - side-by-side prototype/current montage;
   - reviewer sign-off per view.

The final result does not need to copy the prototype CSS. In fact it should retain U9’s cleaner token system.
But the **spatial hierarchy** should be recognizably the same.

From the screenshots, I would define that bar quite strongly:

> If someone glances at the prototype and then the running view, they should identify the same page structure
> before reading any text.

Right now that is true for Repositories, partly true for Progress, and false for Topics/People/default
landing.

## Concrete restart instruction for the dev agent

I would give the restarted session this direction:

> Resume from `main = 3549823`. Treat `docs/ux-v2/COMPOSITION.md` and `DECISIONS.md §4–§7` as the active
> composition charter.
>
> Execute **C1 only first**. Do not begin C2 until Topics has been reviewed visually.
>
> C1 must:
> - replace the Topics full-width card stack with a 320px-ish index + persistent detail pane;
> - preserve server order and existing selection semantics;
> - remove state-count-strip prominence;
> - render Current Work + folded Completed Work in the main detail column;
> - render Recent Activity + Notes + Related Repositories in a right side rail;
> - retain the narrow note/correction path;
> - use U9 tokens, not prototype CSS;
> - add structural bounding-box checks at 1440×900 and 1280×800;
> - move any old `Read topic` checks onto the always-visible selected detail rather than deleting coverage;
> - refresh the actual review service with `install-plugin.mjs --reinstall`;
> - produce a fresh Topics montage against the approved prototype.
>
> Stop after C1 and return the montage, measurements, acceptance deltas, and any payload limitation
> encountered. Do not proceed automatically to C2.

That stop after C1 is important. Given how much visual drift accumulated while semantic work was green, I
would restore a **human visual checkpoint per view** for this phase.

My overall assessment is that the current recovery plan is sound. The backend work is not wasted; it is
actually in good shape. The mistake was treating semantic/structural harness success as evidence that the
approved visual composition had been implemented. The right recovery is therefore **not to restart UX-v2**,
but to rebuild the composition layer deliberately on top of the existing model.
