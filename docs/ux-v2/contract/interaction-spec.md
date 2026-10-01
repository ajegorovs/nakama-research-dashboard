# Interaction Specification

## 1. Global navigation

Top-level tabs:

- Overview
- Topics
- People
- Repositories
- Progress

Navigation changes the canonical view. It must not mutate dashboard data.

## 2. Entity tags

Entity tags are the primary cross-view navigation primitive.

A tag has:

- an entity type,
- an entity identifier,
- a visible label,
- a canonical destination.

Canonical routing:

| Tag type | Destination |
|---|---|
| Topic | Topics view, selected topic |
| Person | People view, selected person |
| Repository | Repositories view, selected repository |
| Axis | Progress view, selected axis |
| Problem | Progress > Problems subview, selected problem |

Required behavior:

- Clicking a tag navigates to the canonical view and selects that entity.
- Tags do not mutate data.
- Tags do not become filters merely because they look like pills.
- The same entity must look and behave consistently everywhere.
- Tags may wrap inline. Do not prematurely collapse them into "more" menus unless real data proves necessary.

## 3. Status badges

Status badges are distinct from navigation tags.

Examples:

- STALE
- ACTIVE
- USABLE
- BLOCKED
- PARKED
- COMPLETED
- ABANDONED

Rules:

- Badges are non-clickable by default.
- Normal "active" state should remain visually quiet.
- Exceptional states deserve stronger visual treatment.
- `STALE` is an observation about recency, not a diagnosis.
- A future explicit stale filter may be added, but this must be a deliberate filter control rather than accidental badge behavior.

## 4. Recency

Use two complementary forms:

- card/index level: relative age, e.g. `2 days ago` or `2d`
- event level: exact compact date, e.g. `Mon · 28 Sep`

Do not show year or time-of-day unless required by ambiguity or later product need.

Sorting defaults:

- Overview topic cards: most recent activity first.
- Overview repository cards: most recent activity first.
- Topic/People/Repository indices: most recent activity first unless a later design explicitly changes this.
- Progress axes: most recently active first is acceptable; exceptional states must remain visible even if old.

## 5. Overview interactions

Overview is not an admin page.

Primary sections:

- Topic/project activity
- Repository activity

Behavior:

- Cards are sorted by recency.
- Each card surfaces the latest meaningful event and relative age.
- Topic/repository/person tags navigate to canonical views.
- Stale items show a small `[STALE]` indicator.
- No broad edit/create controls.
- Recent Activity is absorbed into the cards rather than duplicated as a third feed.

## 6. Topics interactions

Use an index + selected-detail layout.

Index:

- selecting a row changes the selected topic;
- show recency and exceptional state;
- do not spend visual weight on ordinary ACTIVE labels.

Detail:

- concise topic description;
- participants/repositories as navigation tags;
- current axes visible;
- completed/abandoned axes folded under a secondary disclosure such as `Completed work (N)`;
- recent activity carries repository tags;
- broad `Add topic` and `Edit fields` controls are absent.

Human intervention:

- a narrow `Add note / correction` or equivalent steering affordance is allowed;
- structural edits normally occur through librarian chat/actions.

## 7. People interactions

Use the same index + selected-detail grammar.

Detail should include:

- compact bio / role context;
- current topic/axis involvement;
- recent attributable activity;
- related repositories.

Do not introduce:

- workload scores,
- rankings,
- utilization metrics,
- inferred performance judgments.

## 8. Repository interactions

Use index + selected-detail grammar.

Repository detail should show:

- concise repository purpose in the current research context;
- topics/axes/people supported by this repository;
- current implementation work;
- recent activity.

Repository is an implementation/evidence surface, not the parent hierarchy for research axes.

## 9. Progress interactions

Progress is the deepest operational view.

Internal subviews:

- `Axes`
- `Problems`

### Axes subview

Left index selects an axis.

Desktop top area should keep both of these visible simultaneously:

- **Problem** — central/main column
- **Activity** — dedicated adjacent live-feed column

Secondary sections may include:

- optional Plan / work package
- Open problems
- Repository threads
- Evidence
- Human steering

Do not force every axis into fixed `scope / approach / progress / next step` cards.

### Problems subview

Invert the perspective:

- index concrete problems first;
- selecting a problem shows its parent axis and topic;
- show affected repositories, current approach/plan context, evidence, activity, resolution/reopen history.

## 10. Plan / work package

Optional structure.

Use when the work actually follows a staged implementation plan, feature sprint, experiment campaign, or defined sequence.

A plan may hold:

- what is being done,
- why,
- how,
- staged steps / milestones.

PRs, commits, experiments, and other activity then answer:

> At what step are we?

Do not create a plan merely to fill a template.

## 11. Axis lifecycle

Recommended states:

- active
- blocked
- parked
- usable
- completed
- abandoned

`usable` means:

- sufficient for the current research need,
- known gaps remain,
- work may resume without implying failure.

Reopening is first-class:

- usable -> active
- parked -> active
- completed -> active

History should preserve the prior state rather than pretending the axis was never closed.

## 12. Read vs edit

Default philosophy:

- dashboard = read/navigation surface
- librarian chat/actions = structural management
- narrow steering/correction notes = allowed in-context

Automation gathers evidence and updates derived state. Human notes constrain interpretation.

## 13. Responsive behavior

Primary design targets:

- 1440x900
- 1280x800

At desktop widths:

- use horizontal space;
- avoid turning every view into one long vertical document;
- Progress must keep Problem and Activity visible side-by-side where feasible.

At smaller widths:

- columns may stack;
- preserve semantic order: Problem before Activity before secondary support material;
- do not hide important state merely to reduce height.
