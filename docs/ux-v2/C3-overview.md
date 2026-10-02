# C3 — Overview: the aggregation, as the dashboard's default landing

**Status: open, unblocked** (reviewer, 2026-10-02, on accepting C4). Charter written before the build, from the
prototype markup and the payload that exists — not from memory of either.

## What this unit is

`COMPOSITION.md` § C3: build the prototype's two-column **Topic activity | Repository activity** composition
with its per-card actions and reference chips, and resolve the five-page/four-view collision by making it
**the dashboard's default landing / shell behaviour** rather than a fifth navigation destination
(`COMPOSITION.md` §4.1, `DECISIONS.md` §5–§7). The prototype's `Overview` tab is content to be re-homed, not a
nav item to be recreated.

The reviewer's spec for the build, in its own words:

- shell/default landing → **Topic activity | Repository activity**;
- retain the existing global window control;
- Topic cards: topic identity/description, concise current-work signal, latest event, recency, `Open topic →`;
- Repository cards: repository identity/description, latest event, recency, `Expand activity →`;
- **omit the repository-window event count for now, per D4**, because the authoritative total is not in
  `RepositoryRollup`;
- actions navigate into the existing Topics/Repositories views and **preselect the entity**;
- **no new actions, no new projections, no schema changes**;
- take a **populated fixture / default-landing montage before calling C3 complete**, so the aggregation itself —
  not merely its DOM semantics — is visually reviewed.

## Intake: everything this composition needs is already in one payload

The landing is an aggregation, so the risk is that it quietly becomes a second read path. It does not have to:
**`get_overview` already returns both column sources in a single call** (`src/store.ts:997`):

- `topics: TopicOverview[]` (`src/store.ts:982`) — `topic`, `people`, `repositories`, `axes` (`AxisOverview[]`,
  blocked first), `axisCounts`, `activityCount` (events inside the requested window), `lastActivityAt`
  (`null` when it never had any);
- `repositories: RepositoryRollup[]` (`src/store.ts:1197`) — `repository`, `topics` (with the `relationship` on
  each link), `axes`, `axisCounts`, `recentActivity` (**newest first, capped** — `DEFAULT_ROLLUP_ACTIVITY_LIMIT
  = 5`, `src/store.ts:384`), `lastActivityAt`;
- plus `counts`, `axesByState` and `blocked[]` (`axisId`, `topicId`, `topicName`, `title`, `state`, `blocker`).

So: **no new action, no projection change, one existing call.** The two views the cards navigate into already
receive these same arrays (`src/ui.tsx:4632`, `:4649` pass `overview?.repositories ?? []`), which is the
cheapest possible proof that the landing and the destination views cannot drift apart.

The landing is `get_overview` read at its own level: cards that aggregate what the payload already aggregated,
with no event list of its own.

## Card anatomy, read off the prototype markup

`docs/ux-v2/contract/prototypes/overview.html`. Left column `Topic activity` with the note *Newest activity
first*; per topic card: title (topic name) + subtitle (description) · right-hand **age** block
(`<strong>{human distance}</strong>` + `last recorded activity`, with fresh/aging/stale treatment) ·
a current-work line · **axis pills** (`{axis} · {state}`, inferred variants marked) · the latest event
(`Last event` + date, title, and a meta line naming the axis, repository and reference) · a footer holding the
reference chips (person tag, repository tags) and `Open topic →`.

Right column `Repository activity`; per repository card: title (the repository name) + subtitle · the same age
block · the latest event with its own meta · a chip row (topic tag, person tag, and an `N development axes`
chip) · a footer holding the window event count and `Expand activity →`.

**The one field the prototype has and the payload cannot honestly supply is that footer count** — the capped
`recentActivity` list's length is not a window total, which is exactly what D4 forbids printing
(`DECISIONS.md` §8.4). It is omitted, not faked, and the omission is what D4 dockets for a later projection
enhancement if the field is still wanted.

## The field mapping, so the build is mechanical

| Card field (prototype) | Payload field it will read |
|---|---|
| topic title / description | `TopicOverview.topic.name` / `.description` |
| topic age block | `TopicOverview.lastActivityAt` via `describeAge` (`src/ui.tsx:1214`) |
| topic "current-work" line | `TopicOverview.axisCounts` (the counts line the front page and both C6 rollups share, `src/store.ts:682`) + the topic's own `blocked[].blocker` sentence when one exists |
| topic axis pills | `TopicOverview.axes` → `{title} · {state}` with the state's `stateConfidence` marked when it is not `confirmed` |
| topic activity summary | `TopicOverview.activityCount` + `lastActivityAt` — the payload's own window count, never a list length |
| topic reference chips | `TopicOverview.people` (person tags), `TopicOverview.repositories` (repository tags) |
| repository title / description | `RepositoryRollup.repository.name` / `.description` |
| repository age block | `RepositoryRollup.lastActivityAt` |
| repository "last event" | `RepositoryRollup.recentActivity[0]` — the newest of a **capped, newest-first** list, used as *an event*, never as a count |
| repository chips | `RepositoryRollup.topics` (topic tag + `relationship`), `.axes.length` for the `N development axes` chip |
| repository footer count | **absent by ruling** (D4) — omitted, with the omission asserted |
| both card actions | `onOpenEntity("topic" \| "repository", id)` — the existing navigation contract, which already sets the view and preselects (`src/ui.tsx:3828`) |

## The payload gaps this unit must not paper over

1. **The repository window count** — the prototype prints `607 recorded events in the selected window`; the
   authoritative total is not in `RepositoryRollup`. **Omitted by D4**, not faked from the capped list's length.
2. **The topic's latest *event*** — the prototype's topic card names one event (title, axis, repository,
   reference); `TopicOverview` carries only `activityCount` and `lastActivityAt`, and no per-topic event. The
   only existing route to an event title is a window-wide activity read, which is the duplicate reading this
   phase exists to remove (F2). So the topic card shows the **payload's own activity summary** (count in the
   window + when it last moved) and **not** an event title. Raising this here rather than inventing a line:
   if the event title is wanted, it is a projection enhancement to docket beside D4's, not something to
   reconstruct in the view.
3. **The repository card does** get a genuine `Last event` line from `RepositoryRollup.recentActivity[0]` — the
   asymmetry between the two columns follows the payload, and the card will not pretend otherwise.

## The two judgement calls, stated up front

1. **The current-work line must be composed from payload facts, not written.** The prototype's line is
   hand-authored prose ("Signal analysis remains active; the SA5 cross-sitting slice has been published"). The
   payload's factual equivalents are the axis-state counts the front page and both C6 rollups already share
   (`src/store.ts:682`), and — when the topic actually has one — the blocked axis's own `blocker` sentence from
   `Overview.blocked[]`. The line will be composed from those, and **nothing will be synthesized** when a topic
   has neither. This is the C2 role-line situation (`DECISIONS.md` §8.6): the prototype's decoration is not a
   contract to imitate.
2. **Coming back to the landing.** With four nav items and no fifth, the shell's own title becomes the way home
   (a title control, not a tab). Flagged because it is a shell control the ruling did not name: if it reads as a
   fifth destination, it should be struck rather than defended.

## Out of scope

No new nav item; no new action, projection, schema or store method; no client-side re-aggregation of events —
the cards read the payload's rollups and their counts. C5 (Repositories density) stays separate.

## Acceptance criteria for C3

Semantics, each asserted positively rather than by omission:

1. the default landing renders **both** columns, from one `get_overview` payload — with no second read path and
   no event list of its own;
2. every topic the payload returns appears exactly once, newest activity first, with identity, description,
   recency, axis pills and the payload's own **activity summary** (count in the window + last activity) — and
   **no event title**, per the gap above;
3. every repository the payload returns appears exactly once, same ordering rule, with identity, recency, latest
   event and its axes chip;
4. the repository card's footer carries **no window count** (D4) — the assertion is an absence with its reason,
   not a missing check;
5. `Open topic →` lands in Topics with that topic selected, and `Expand activity →` lands in Repositories with
   that repository selected — the same navigation contract the tag chips use, so a card action and a chip are
   two doors into one destination;
6. the window control still drives both columns (the counts move with it);
7. the four nav items are unchanged in name, order and count, and none of them is the landing.

Geometry, container-relative per D8/D9: two columns side by side with aligned tops; the landing begins in the
first viewport; the topic column is not narrower than the repository column by accident of markup order — if
they are not equal, the reason is stated.

Visual: a **fixture default-landing montage** (prototype above, running page below, tall viewport if the
composition exceeds the frame) inspected before the unit is called complete — the C1/C2/C4 lesson, applied at
the start rather than at the gate.

## Records

To be filled by the build: build string and asset digest, both instances on the same version, the pass counts
for fixture and corpus, and the geometry the checks measured.
