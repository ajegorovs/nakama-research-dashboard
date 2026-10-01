# Component Contract

The implementation should reuse shared components rather than reimplementing the same visual/interaction idea per tab.

## EntityIndex

Used by Topics, People, Repositories, Progress.

Responsibilities:

- render selectable entity rows;
- show name/title;
- show compact recency;
- show exceptional state where relevant;
- preserve keyboard/focus behavior;
- expose selected state.

Do not add broad edit controls inside index rows.

## EntityTag

Cross-view navigation primitive.

Props / conceptual inputs:

- entityType
- entityId
- label
- optional compact style

Behavior:

- navigate to canonical view for entity type;
- select entity;
- never mutate state;
- never act as a filter unless explicitly configured as a filter control.

## StatusBadge

Non-navigation state indicator.

Examples:

- stale
- blocked
- parked
- usable
- completed

Behavior:

- visually compact;
- exceptional states stronger than ordinary active state;
- non-clickable by default.

## RecencyLabel

Displays relative age:

- `2d`
- `2 days ago`

Must be derived from the same timestamp used for sorting.

## EventDate

Displays compact exact event date:

- `Mon · 28 Sep`

No year/time by default.

## ActivityFeed

Used prominently in Progress and in compact form elsewhere.

Responsibilities:

- chronological recent activity;
- date;
- activity title;
- provenance/source;
- entity tags for relevant topic/repo/person/axis.

## DetailHeader

Common selected-entity header.

May include:

- entity title,
- exceptional status,
- compact context line,
- navigation tags,
- last activity age.

Avoid turning the header into a metadata dump.

## SectionCard

General content grouping primitive.

Use to establish visible sections/columns.
Avoid presenting every small field as its own card.

## ProblemCard

Primary Progress component.

Responsibilities:

- make the problem statement visually dominant;
- show concise current interpretation if useful;
- avoid burying the problem beneath metadata.

## PlanCard

Optional Progress component.

Responsibilities:

- display an optional plan/work package;
- show plan summary;
- show ordered or unordered steps;
- allow step state such as done/current/next/blocked.

Absence of a PlanCard is valid.

## OpenProblemItem

Compact concrete problem beneath an axis.

May show:

- problem title;
- state;
- recency;
- affected repository tags;
- short explanation.

## RepositoryThread

Describes how a repository contributes to an axis/problem.

Not a duplicate axis.

## SteeringNote

Human-authored interpretive constraint.

Visually distinct but not alarmist.

Should show:

- note body;
- author/provenance if available;
- date if useful.

## DisclosureSection

Used for secondary history such as completed axes.

Behavior:

- collapsed by default when secondary;
- clear item count;
- no duplicate topic-level disclosure controls.

## ProgressSubviewToggle

`Axes | Problems`

Behavior:

- changes primary index/granularity;
- preserves shared data model;
- does not create two disconnected tracking systems.

## Layout grammar

At desktop widths:

- use 2D composition;
- use aligned columns and section groups;
- avoid single-column document flow when horizontal space is available.

At 1280x800:

- the page must remain usable without requiring excessive scrolling just to see the primary question and latest activity.
