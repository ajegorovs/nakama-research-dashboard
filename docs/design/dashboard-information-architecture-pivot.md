# Dashboard — current information architecture

## Current agreement and scope

This section is the single current specification for the standalone prototype. Owner-agreed
presentation choices are distinguished from data/model questions below. They are not production
implementation, fixture-write, deployment, restart or publication authorization.

**Status:** the four-view rework is implemented; its hardening/testing stage is closed.
UI restyling is a separate stage. This specification does not authorize deployment or data writes.
The [implementation contract](dashboard-minimal-implementation-design.md) resolves the prototype-era
data questions; [development boundaries](../DEVELOPMENT.md) states acceptance boundaries.

### Work sequence and constraints

1. Ground the prototype and its semantics.
2. Map the layout and interactions to required data and verified existing support.
3. Decide how each datum is obtained, synthesized, stored and retrieved.
4. Specify the smallest production changes and acceptance checks.
5. Implement and deploy only under the corresponding authorizations.

- Subagents may perform well-scoped work once given a quality brief grounded in this spec/plan.
  The parent owns integrated decisions and verifies their findings; speculative excursions remain deferred.
- Nakama currently runs agents on the host. That is not the intended future execution pattern.
  Host Git/gh availability, credentials and clone paths are not portable product requirements.
- The librarian must be able to investigate nonconforming repositories, including PR discussions,
  diffs and history. Web scraping is a viable baseline; specialized tools are additional capabilities.
  Templates may help later but are not prerequisites. Interpretation requires agency; deterministic
  mechanics govern identities, validation, persistence and retrieval rather than guaranteeing identical
  interpretations.
- Avoid overengineering. Reuse the current coordination tools and data model where they suffice.
- Agent runs and integration exercises require their own explicit scope; they are not prerequisites for visual restyling.

### Views and navigation

| View | Selector | Selected content and purpose |
|---|---|---|
| **Projects** (landing) | Projects | Project description, optional checkpoints, participants and concise workstream cards; orientation rather than full work detail |
| **Progress** | Workstreams grouped under simple muted project headings | Full workstream context, scoped plan, supporting repositories, activity and visible task cards |
| **People** | Person identity | Optional biography/profile, involvement grouped by project using shared workstream cards, related repositories and only attributable activity |
| **Repositories** | Owner separate from repository name | Description, default branch, external destination and current work grouped by project using shared workstream cards |

- Overview and its legacy Dashboard summary presentation are retired. The accepted V12 composition
  contains no aggregate disclosure or replacement placement; backend aggregate reads remain available.
  Old Overview routes fall back to Projects.
- Display **Project → Workstream → Task**; do not silently migrate the topic/axis/problem schema.
- Projects summarize; Progress preserves the full substantive reading.
- All four side selectors use the same pane width (380px at the measured desktop viewports).
  Progress no longer uses the narrower variant, horizontal project-label rules, guides or dark group boxes.
- Workstream card titles navigate to the exact Progress entry. Do not add duplicate Open workstream or
  Review blocker buttons. Keep a lower-right Return to project action in full workstream context.
- People and Repositories project groups show a short project description and right-aligned Open project
  action immediately beneath the group heading. This action is not an obsolete Overview card footer.

### Shared presentation

- Keep description surfaces white; use shared bold muted disclosure headings, arrows, dividers and
  right-aligned status badges. Entity and section disclosures remain; task selection/unfolding is removed.
- Preserve pre-dark selector styling. The dark inversion and subsequent #f5f5f5 experiment were rejected
  for this prototype. Final palette harmonization belongs to the original product; the segmented page
  switch is the preferred newer control styling, not a command to recolor every surface now.
- Project/workstream selectors use status dots, compact count tags and relative recorded recency with
  exact-date tooltips. No status contours, Has plan pill or duplicate Blocker reported warning.
- Retain **No plan** as a reminder; plans themselves remain optional.
- Known blocked-task count pills are red; typography/padding/height match sibling pills. Never infer
  blocked children from a parent blocker.
- Participants have an explicit quiet inline label beneath a divider. Project-header repository rows
  remain omitted; references have their own scoped placement.
- Prototype provenance belongs in the overlay and documentation, not repeated copy badges on cards.

### Tasks, descriptions and scoped plans

- Task cards show a concise title, status and full description without clicking a selector row.
  Use **Tasks (N)**, not the parent title repeated in the section heading. No one-open-task behavior.
- Omit repeated task status and workstream context from the body. Keep optional scoped plan, supporting
  repository references and activity beneath the description.
- Project checkpoints, workstream strategy and task implementation plans are different optional scopes.
  Place each beside its description, with an independently collapsible bold plan heading and divider.
- Existing workstream plan summaries, step order and states must survive the production port.
- Migration 006 supplies separate task titles and project/workstream/task-scoped plans.
  No automatic checkpoint links, inherited plans or progress rollups are implied.
- Task states are `open`, `blocked` and `resolved`; a parent blocker does not set child states.

### Repository links, involvement and attribution

- Supporting repositories are explicit many-to-many links at workstream and task scope. A repository may
  serve multiple projects; tasks do not automatically inherit parent repositories or activity.
- Repository name opens the exact dashboard entry. Separate **GitHub ↗** opens its actual external URL
  in a new tab; keep a thin vertical separator within each pair and dots between pairs, permitting wrapping.
- Repository external navigation belongs at the description footer's lower right; default branch is
  separate metadata, not an assertion of freshness or a pinned revision.
- Related repositories in People do not imply maintainership. Project involvement does not establish
  personal authorship of workstream events. Missing biography or attribution stays explicit.
- Activity links require an actual source URL or explicit entity association. Do not fabricate PR links
  or borrow repository-wide events to fill an empty workstream/task feed.

### Activity and pagination

- Activity is a record of updates, not a plan, completed-work inference or performance score.
  Place it after description → scoped plan → supporting repositories, in an independent disclosure.
- Use per-list **Previous / numbered pages / Next** with the shared segmented-switch treatment.
  Prototype page size is five. Hide page buttons when the available list fits on one page; show the
  actual displayed range and available count. Direct task navigation opens its containing task page.
- Numbered pagination replaces the 3/5/10/20/50 latest-entry limit switch and growing scroll-list approach.
  Activity uses newest-first source records. Task ordering is a separate open decision.
- The prototype currently slices supplied local data and retains a bounded keyboard-focusable activity
  scroll body. Production must retrieve scoped pages and report availability/completeness honestly.
  Whether ordinary activity scrolling can be removed is open; do not treat the current scroll cap as a
  settled product requirement.
- No dashboard-wide time filter or chart. Charts and cross-project event processing remain deferred.
- Illustrative reports live in `editorial.json`, labelled **Example report**. They do not change frozen
  event counts, recency or factual completion claims. Preserve `data.json` unchanged.


## Implementation and boundaries

The stored vocabulary remains topic/axis/problem; display labels do not rename the schema.
Plans preserve stored step positions, including zero, and omit numbering for absent positions.
Task and activity pagination are independent. See the implementation contract for ordering,
containment, authored text and read-projection details. Frozen trial data and editorial overlays
remain separate from live research data.
