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

## Rulings (reviewer, 2026-10-02), recorded as they were given

1. **`view: null` as the landing state is correct** — the Overview composition gets a real default state
   without creating a fifth navigable tab.
2. **The shell title as home is acceptable**, given exactly what is implemented: not styled or modelled as a
   fifth navigation option, no pressed state, it simply returns to the default landing.
3. **Ordering labels follow payload truth, not prototype copy.** Topics arrive in attention order and
   repositories by name, so the columns say that; neither is relabelled "Newest activity first" to imitate
   static mock text.
4. **The topic activity summary without an event title remains correct** — the payload gives count + last
   activity, so that is the honest abstraction.
5. **`recentActivity[0]` as the repository's latest event remains correct**, and the D4 omission marker is the
   better assertion than a fragile text absence.
6. **Naming the blocked axis rather than printing blocker prose** is the better ten-second treatment.
7. **Every view-specific check must navigate to the view it claims to inspect.** The landing exposed an
   assumption latent since the default was Topics; the correction is required, not optional.
8. **`entityTarget` sequencing must be shown not to resurface a stale target.** Home should clear only the
   explicit view selection; if the existing `seq` sequencing already handles it, no new behaviour — but the
   interaction test must not leave a stale-target surprise unexamined.

## What the landing changed outside the page

Both harnesses held the same latent assumption — that the shell opens on a *view*:

- the **acceptance pass** read `[data-rd-index-topic]` without ever navigating, so it graded the Topics view by
  inheritance. Every view-specific check now navigates to the view it names, which is also what ruling 7 asks
  for and what the C8 read already taught in C4;
- the **fidelity capture** waited for `[data-rd-view="topics"]` as its mount gate, so it refused the page
  outright once the landing rendered. It waits for the landing now, and the `overview` shot is taken first,
  refusing if a view container is already on screen — a shot named "overview" that is really another view is
  worse than no shot.

Neither was a page defect; both were checks that had borrowed the old default. They are recorded here because
a harness that silently grades a different screen than it names cannot be trusted for the next unit either.

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

**Built and served as `0.2.0+dev.4dfdb691c706`** (revision 91 on the fixture, revision 495 on the corpus — one
asset, `sha256 58f01bf1b56c2bf78c78be9096c3462f83be501a7a3923f80bf9915e7c46c554`, served by both). Every run
below is on that asset, guarded by `served-build-guard.mjs` before it starts.

| Record | Result | Checks |
|---|---|---|
| fixture · 1440x900 | `all checks passed; 1 skipped` | 165 |
| fixture · 1280x800 | `all checks passed; 2 skipped` | 165 |
| corpus · 1440x900 | `all checks passed; 26 skipped` | 163 |
| corpus · 1280x800 | `all checks passed; 27 skipped` | 163 |
| corpus · `--write` | **open — see below** | — |
| `bun run check` | `126 pass, 0 fail` | — |

Each skip is stated by the pass with the subject this dataset lacks. Both viewports carry the same check count
per dataset, so nothing is being dropped at the narrower size.

**The checks the unit was chartered on**, passing by name:

- `the shell opens on the default landing, with no view selected — landing=true; view container(s)=0; pressed
  view option(s)=[]; home=current`
- `the shell title returns to the landing and carries the window with it — window before 30, after returning
  home 30`
- `` `Open topic` lands in the Topics view with that topic selected`` and `` `Expand activity` lands in the
  Repositories view with that repository selected``
- `a plain view choice after two card actions lands on the entity asked for last, not a superseded one` —
  landed on `["Layout fixture — second topic"]`, the topic asked for last. **Ruling 8 is answered by the
  existing `seq` sequencing, with no new behaviour**, and the check now pins it; it skips on the single-topic
  corpus with its reason.
- `the selected index row and the visible detail refer to the same topic` · `opening a topic reads it once, in
  one get_topic call — 1 load read + 2 selection read(s) over 2 distinct`
- geometry: the topic column is the wider one (`left 320 w 591`) against the repository column (`left 923`),
  both beginning in the first viewport
- D4: `data-rd-landing-count-omitted="d4"` on all 3 repository cards, 0 printing a window count
- the topic activity line reads the payload's own window count and last activity
  (`8 events in the selected window · last activity yesterday`), with no event title

**The write record is open, and the cause is instance-level rather than the page.** The write pass creates its
fixture topic, reloads and reads it back; the reads that follow the write lose the SQLite lock, and the detail
sits on `Loading this topic` until the pass gives up. The instance log during that run:

```
21:12:14 SQLiteError: database is locked  → POST 500 (requestId bb37106e-…, durationMs 73)
21:13:04 SQLiteError: database is locked  → POST 500 (requestId 50b5fff9-…, durationMs 61)
```

The `reconcile_topic` that creates the topic returns 200 (its check passes) and the store afterwards held
`topics=2, development_axes=4` — the write landed; the reads are what failed. The page renders **no banner**, so
its read is pending rather than rejected: the host runs actions as unserialised subprocesses, and the landing
adds one more read to the window immediately after a write. Recorded with its timestamps, request ids and
statuses rather than waived by a second green run; the committed `docs/corpus/verify-write.txt` is untouched,
because the wrapper refuses to record an aborted pass.

Two more harness assumptions the landing exposed, both fixed, both the same class as the read-side correction
and both worth keeping because each one first presented as a page fault:

1. the write section reloads with `page.goto` and then clicked a rail row — which worked only while a reload
   landed on *Topics*. The view is chosen after the reload now;
2. the C3 interaction block handed its successors a window (`14`), a view and a selection that it had invented
   rather than the ones it read. It restores the window it read, leaves the view the pass reads on its default
   selection, and never re-clicks a row that is already pressed (that re-click does not hold the selection, and
   an empty pane aborted the next check on a 30s locator timeout).
