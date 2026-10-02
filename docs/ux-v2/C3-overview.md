# C3 — Overview: the aggregation, as the dashboard's default landing

**Status: accepted** (reviewer, 2026-10-02). Functional acceptance, geometry/interaction acceptance and visual
fidelity are all closed — on the fixture landing montage and the records below — and **C5 is unblocked**.
Charter written before the build, from the prototype markup and the payload that exists — not from memory of
either.

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

## Accepted (reviewer, 2026-10-02) — the three verdicts on the fixture landing montage

> **C3 functional acceptance: closed.** **C3 geometry/interaction acceptance: closed.** **C3 visual fidelity:
> closed.** **C3: accepted.**

The reviewer read the pushed fixture Overview montage and recorded that the landing now reads as the prototype's
intended ten-second aggregation rather than as a disguised Topics page: `Topic activity` is the wider left
column, `Repository activity` the narrower right one, both starting together, with cards carrying concise
movement/context plus a clear drill-in action; the absent fifth nav item is visually coherent, with `Overview` as
the landing heading and the four real destinations the only nav choices. The payload-driven differences were
accepted as right rather than as drift — the topic card's honest activity count/recency instead of an invented
latest-event title, the repository card's real newest event, the absent repository window count, and ordering
labels that describe the payload rather than copying the prototype's static "Newest activity first" — with the
explicit note that no data should be added merely to make the two columns symmetrical. The review also caught
this document's own acceptance criteria still saying "newest activity first / same ordering rule"; that was
stale against ruling 3 and is corrected above.

## Ruled on after the build (reviewer, 2026-10-02) — the two items left open

1. **The corpus `--write` record counts; the C3 write gate is closed, not open.** The 21:12:17 record is the
   canonical write item and is not superseded: the transcript demonstrates the behaviour the post-reload
   correction introduced, and the earlier aborts are consistent with the defect that correction fixed. No
   bounded settle is needed, and the fixture write record does not substitute for it — it stands beside it as
   corroborating cross-dataset evidence. What *was* stale is the prose committed alongside the green record
   (this document, the session handoff, and `3f60da9`'s own message, which cannot be corrected without
   rewriting published history). The SQLite lock/500 observations remain their own runtime-reliability item.
2. **A `ui-check <n>` topic must not count as a corpus marker** — and must not be ignored either. Three concepts
   instead of two: corpus identity, fixture identity, and acceptance-write residue, so a contaminated instance
   refuses with a truthful diagnosis while the fail-closed behaviour is preserved. The rule to avoid is the
   dangerous "anything not named like the fixture must be the corpus", and `wipe-plugin-rows.py` must likewise
   require an explicit target rather than defaulting a destructive wipe to the corpus/dev root.

Both are implemented and asserted; the two items at the end of the records section say how. All four follow-up
calls were **accepted** (reviewer, 2026-10-02): the empty-store refusal, the exact `ui-check <digits>` residue
shape, the explicit wipe target, and **no history rewrite** for `3f60da9` — whose message says the corpus write
item is open, while the green transcript was committed beside it in the same commit. The review trail is
`docs/reviews/2026-10-02-c3-acceptance-record.md`, which carries that supersession note explicitly.

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
2. every topic the payload returns appears exactly once, **in the payload's own order — attention order** —
   which is what the column label states, never the prototype's static "Newest activity first" (ruling 3);
   with identity, description, recency, axis pills and the payload's own **activity summary** (count in the
   window + last activity) — and **no event title**, per the gap above;
3. every repository the payload returns appears exactly once, **in the payload's own order — by name** —
   labelled as such rather than sharing the topics' rule (ruling 3), with identity, recency, latest event and
   its axes chip;
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
| fixture · `--write` | `all checks passed; 1 skipped` | 177 |
| corpus · 1440x900 | `all checks passed; 26 skipped` | 163 |
| corpus · 1280x800 | `all checks passed; 27 skipped` | 163 |
| corpus · `--write` | `all checks passed; 26 skipped` | 175 |
| `bun run check` | `126 pass, 0 fail` | — |

Each skip is stated by the pass with the subject this dataset lacks. Both viewports carry the same check count
per dataset, so nothing is being dropped at the narrower size. **The corpus write record is the canonical write
item and the fixture's is its cross-dataset corroboration on the same asset** — see below for why the earlier
corpus write runs did not produce it, and for the SQLite locking that stays a runtime debt rather than a gate.

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

**The write record: taken on the corpus, corroborated on the fixture.** `docs/corpus/verify-write.txt` is the
canonical write item: generated 2026-10-02 21:12:17 on this asset, **175 checks, `all checks passed`, 26
skipped**. It proves the C3 landing first (the transcript shows the shell opening on the default landing) and
then the whole narrow-write sequence end to end — the topic created, the `ui-check` topic selected, the note
field writable, the note landing, a stale correction refused, "wrote nothing" verified, the reload, and the
corrected write landing.

Three earlier corpus write runs (21:01:46, 21:06:30 after 156 checks, 21:10:28 after 66) **ABORTED on
`locator.click: Timeout 30000ms exceeded`** — the harness-navigation defect, not the page: after C3 a reload
lands on the landing, so the write section's rail-row click had no index to find. The transcript demonstrates
the behaviour the correction introduced, which is why the green record is the one that counts; the correction
is in `3f60da9`, committed four minutes after the run.

The fixture write pass is the same measurement on the other dataset, same asset: `write pass: all checks passed;
1 skipped`, 177 checks, `docs/layout-fixtures/verify-fixture-write.txt`.

**The SQLite lock is a runtime debt, not a C3 acceptance gate — and no settle delay was added to hide it.** The
corpus instance logs `database is locked` → `POST 500` in and around the write runs:

```
21:12:14 SQLiteError: database is locked  → POST 500 (requestId bb37106e-…, durationMs 73)
21:13:04 SQLiteError: database is locked  → POST 500 (requestId 50b5fff9-…, durationMs 61)
```

The green transcript itself records a console 500, and the fixture logged the same `SQLITE_BUSY_RECOVERY` →
`POST 500` at 21:20:03 inside its own green run. The host runs actions as unserialised subprocesses, so
concurrent page loads can lose the lock and an ordinary read loses its turn — an HTTP 500 followed by a UI on
`Loading this topic` is bad operational behaviour and worth fixing, but it is not a composition defect and it
did not stop the write semantics from being verified. Tracked as its own item in the estate's `AGENDA.md`.

**Two things that investigation exposed, both ruled on the same day (reviewer, 2026-10-02):**

1. **A `ui-check <n>` topic is acceptance-write *residue*, not a corpus marker.** The write pass's own subject
   is neither dataset, and the gate now distinguishes three things rather than two, so one fixture write run
   diagnoses as *"the fixture plus acceptance-write residue (ui-check …)"* and refuses with a re-seed hint —
   instead of the old *"BOTH fixture and corpus markers — a mixed instance"*, a wrong diagnosis of a known
   cause. Residue refuses in either direction, and an **empty** instance refuses too: a store with no dataset is
   not a clean corpus. The rule lives in `harness/dataset-identity.mjs`, asserted by `bun run harness:identity`
   (82 checks) — including the boundary that a genuine topic called "ui-check policy review" is corpus data,
   not residue — and the wired pass was exercised by injecting the residue through `reconcile_topic` on the
   fixture: a fixture run then exits 3, `REFUSED`, with the committed record untouched. The write pass itself
   still creates and operates on its own subject; the gate runs before it writes.
2. **`wipe-plugin-rows.py` has no default target any more.** `--data-root` and `--org` are required, so the
   instance-targeting mistake cannot recur silently. It already had: with the *fixture* env sourced the script
   emptied `/mnt/otrais/data/nakama-dev` anyway, and the fixture re-seed that followed restored only the
   fixture — the corpus stayed wiped until it was replayed through `harness/replay-corpus.mjs` (695 calls, then
   `1 topic / 3 axes / 1 person / 1 repository / 694 activities`).

Two more harness assumptions the landing exposed, both fixed, both the same class as the read-side correction
and both worth keeping because each one first presented as a page fault:

1. the write section reloads with `page.goto` and then clicked a rail row — which worked only while a reload
   landed on *Topics*. The view is chosen after the reload now;
2. the C3 interaction block handed its successors a window (`14`), a view and a selection that it had invented
   rather than the ones it read. It restores the window it read, leaves the view the pass reads on its default
   selection, and never re-clicks a row that is already pressed (that re-click does not hold the selection, and
   an empty pane aborted the next check on a 30s locator timeout).
