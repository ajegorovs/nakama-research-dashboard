# C5 — Repositories convergence (opened 2026-10-02)

**Status: built, verified on both datasets at both viewports, awaiting the reviewer's visual verdict.**
Build under test: **`0.2.0+dev.a4431120a2da`**, served asset sha256
`82e64e29fbca3069c7b30cbdef0ea4a0c67031cbcb18dff0c34abd44e36d9523` (corpus revision 511, fixture revision 107).
The reviewer's verdict asked for a **populated fixture montage**; it is
`docs/ux-v2/fidelity/fixture/side-by-side/repositories.png` (and the tall pair beside it), with both the capture
and the montage now choosing the subject by measurement rather than by whichever row sorts first.

C5 is the **final fidelity/convergence pass on the Repositories view**, not a structural redesign: the prototype's
composition is brought onto the index/detail macro-layout the view already had, and the whole panel is put on
C1's own `rd-detail-grid` — the same grid Topics and People already use — rather than given a layout of its own.

## Charter (reviewer, 2026-10-02)

1. retain the existing repository index/detail macro-layout;
2. improve index-row grammar and recency/context;
3. make the repository's **current supported work the dominant detail lane**;
4. **bound Recent activity**;
5. keep related Topics / Axes / People contextual and subordinate;
6. **do not invent** repository-level notes or people data the rollup does not actually carry;
7. preserve repository tag navigation and preselection;
8. take a **populated fixture montage** before declaring convergence complete.

`COMPOSITION.md`'s original one-line sketch for C5 ("structural parity already holds; this brings rows and chips
to the prototype's tighter grammar. Small.") is superseded by that list where the two differ; the list is what was
built.

## What existed before (read, not assumed)

| piece | before |
|---|---|
| macro-layout | `div.rd-split` — `ul.rd-index` left, one persistent `Card.rd-panel` right. **Kept.** |
| index row | full name + `involvementLine(entry)` ("3 active · 1 blocked · 2 axes · 2 topics") — **no recency, and phrased for a person, not a repository** |
| detail head | `DetailHeader` with the name and a description/default-branch line — **no age box**, so "how stale is this" was only answered at the *bottom* of the panel |
| detail body | one flat `div.rd-form`: Supports → Current work → Recent activity → last activity, **four equal stacked sections** |
| Current work | `ul.rd-axes` of **every** axis the rollup carries, terminal ones included, under a heading that says "Current work" |
| Recent activity | `ActivityList` — the whole window in the panel, **no window, no remainder**, unlike the topic and person rails |
| people | not rendered at all |
| heading hint | `"Most recently active first"` — copied from the prototype's static mock, while the rollup is ordered `ORDER BY full_name COLLATE NOCASE ASC` |

## The change map

**1. The detail is now the shared grid (`rd-detail-grid`).** Current work is the lane; Recent activity, Supports
and People are a rail beside it. The grid is C1's, so the dominance rule is inherited rather than restated:
`minmax(0, 1fr) minmax(250px, 0.6fr)`, measured at **1.67×** at 1440 and 1280 and stacking below 1000px. The
lane is marked `data-rd-repository-lane="current"` and the grid `data-rd-repository-split="true"`, the same
idiom the People view uses.

**2. The lane is the payload's own current/terminal partition.** `Current work` holds the axes that are *not*
completed or abandoned; stopped work is stated under one summary with its own count
(`data-rd-repository-folded`, "Completed and abandoned work (N)") and stays one control away — the fold C1's
topic lane already has. The split goes through **one predicate** (`isTerminalAxis`), which the topic lane was
refactored onto in the same pass, because two copies of "what counts as stopped" is exactly how two lanes come
to disagree about the word. The payload's own total is still on the page (`data-rd-repository-axes`, on both
lists), so the fold is a disclosure of the split rather than a place where work goes missing.

**3. The index row states the two facts the prototype's row states.** Name, then the age of its own
`lastActivityAt` top-right (the recency label, which carries its timestamp to the DOM), then a second line
phrased from the rollup's own numbers: `supports 1 topic · 4 current axes`, and `no topic names it · no current
axis` where that is the truth. "Current" here is the same partition the lane uses, so the row and the lane below
it cannot disagree.

**4. The head carries the age box** ("last activity 2d ago", in the title row) instead of the panel's last line.
The marker the previous composition carried (`data-rd-repository-last`) moved with it.

**5. Recent activity is a window.** It leads with `RAIL_ACTIVITY_LEAD` (4) events, states
`4 of 5 shown, newest first` and offers the rest in one click — the identical treatment the topic and person
rails use, with the count still the payload's own (`data-rd-repository-activity`).

**6. The heading no longer claims an order the rollup does not have.** It reads
`Alphabetical by name · factual context, never scored`, which is what `ORDER BY full_name COLLATE NOCASE` does.
This is the same class of drift C3's ruling 3 corrected on the landing: the label describes the payload, not the
prototype's copy.

## The two deliberate absences

Both are prototype content the payload cannot support. Each is asserted as an absence so the next reader sees a
decision rather than an oversight.

- **Notes.** The prototype's Notes card carries a repository-level sentence; `RepositoryRollup` carries no
  repository note (notes belong to a topic, and the topic panel renders them). The card is **omitted** and the
  omission is marked `data-rd-repository-notes-omitted="true"` — the D4 pattern.
- **A `Stale` tag.** The prototype marks a quiet repository `Stale`. The store *does* have a `stale` rule, but it
  is a recency rule on the overview's own cards and the repository rollup does not carry it; inventing a second
  definition of "stale" here (current-axis count = 0) would put two meanings of one word in the same product. The
  row says what it knows instead: the age, and `no current axis` on the second line.

**People is derived, not invented** (D5's rule): the rollup has no people, so the card is built from the *people*
rollup's axes — an axis carries the repositories it names — and it **collapses** when the derivation is empty
rather than rendering a prototype-shaped empty card. When the people rollup is truncated the card says so
instead of presenting a bounded subset as the whole list.

## What the pass now checks (17 checks)

The section is `harness/verify-page.mjs` → *C5: the Repositories view*; every check reads the page against the
`get_overview` projection fetched in the same run, and the lead is re-declared in the harness so the page cannot
widen its own window into correctness.

| claim | how it is measured |
|---|---|
| the index is the projection, in the projection's order | row ids/names against the payload, in order |
| the heading states the real order | the hint mentions "by name" and not "most recently active" |
| each row's age is its own timestamp | `data-rd-recency` vs `lastActivityAt`; `never` where null |
| each row's second line is the rollup's numbers | exact string vs a line computed from the projection |
| a quiet repository says so | the one dataset row with no topic and no current axis |
| the lane is dominant | width ≥ 1.25× the rail, left of it, same top (not stacked) |
| the lane holds the current axes | axis rows outside the fold, by identity, + the stated count |
| the fold holds the terminal axes | rows inside the fold, by identity, + summary count + the payload's total |
| no stopped work ⇒ no empty disclosure | fold absent |
| topic links are the rollup's, in the rail | tags by id and label; the card is inside the rail |
| people are derived from the people rollup | tags vs an independent derivation from the payload |
| Notes is omitted, with its marker | marker present; no `Notes` rail title |
| the rail leads with the newest few | `total`, `-shown` = lead, the newest N rows by date+summary, the note |
| the remainder is one control away | click → all shown + `all N shown, newest first` |
| expanding is composition only | non-read action calls unchanged across expand/collapse |
| a short rail states no remainder | note empty where the window fits the lead |

## Evidence

| dataset | viewport | record | result |
|---|---|---|---|
| fixture | 1440×900 | `docs/layout-fixtures/verify-fixture-read-1440x900.txt` | **180 pass / 0 fail / 1 skip** (181 checks, 22:44:01) |
| fixture | 1280×800 | `docs/layout-fixtures/verify-fixture-read-1280x800.txt` | **179 pass / 0 fail / 2 skip** (181 checks, 22:45:08) |
| corpus | 1440×900 | `docs/corpus/verify-read.txt` | **151 pass / 0 fail / 28 skip** (179 checks, 22:47:12) |
| corpus | 1280×800 | `docs/corpus/verify-read-1280x800.txt` | **150 pass / 0 fail / 29 skip** (179 checks, 22:42:50) |

Every record's header carries the served build it judged: revision **511** and asset sha256
`82e64e29fbca3069c7b30cbdef0ea4a0c67031cbcb18dff0c34abd44e36d9523` — the same digest the captures below
recorded, so the montages and the read passes are views of one artifact.

Montages: `docs/ux-v2/fidelity/fixture/side-by-side/` (first screen, 1440×900) and
`docs/ux-v2/fidelity/fixture-tall/side-by-side/` (the whole composition at a 1440×2600 viewport), both
regenerated from the fixture instance and both captured on **`fixture/crowded-card`** — the row that renders
the lane, the fold, the supports, the people and the activity rail (5 of 5 composition parts), chosen by
measurement. `docs/ux-v2/fidelity/side-by-side/` was regenerated from the review UI in the same pass.

### The run that did not record — and the two harness fixes it bought

The first recorded corpus 1440×900 attempt **aborted** (exit 2) and left the committed record untouched, which
is the wrapper working as designed and still a lost record. The cause was not the composition: at
**22:41:23** the dev instance answered `POST … 500` with `SQLiteError: database is locked`
(`SQLITE_BUSY_RECOVERY`, requestId `aa21cc5e`) — the store/runtime debt already open in `AGENDA.md` — so
`get_topic` never landed, the topic detail stayed empty, three axis-hierarchy checks read that emptiness as a
composition fault, and the block's closing click then waited 30s on a disclosure that did not exist and killed
the pass.

Two fixes, both in the existing topic-detail block:

- **The block waits for the reading surface it judges** (the detail's own axis rows, 20s, polling) before
  reading it — so a detail that never lands still fails those checks, but with the pane's own state on screen
  instead of as a fault of the reading surface;
- **the closing click is asserted before it is clicked.** Clicking a control that is not rendered does not fail
  a check, it aborts the entire pass on a locator timeout — an aborted run is a lost record, a failed check is
  a verdict. The same rule the rail's expand control already followed.

Re-run on the fixed harness, same viewport, same instance: **151 pass / 0 fail**, and the record is the one
committed above.

`bun run check` 126 pass / 0 fail · `bun run typecheck:host` 0 diagnostics · `bun run harness:identity` 82/82.

## Traps

- **The row's age label is a `.rd-meta` too.** A reader that takes "the first `.rd-meta` in the row" reads the age
  as if it were the counts; the row's second line carries its own handle (`data-rd-repository-line`) for exactly
  that reason. The first version of the check failed on it and read a row's `yesterday` as its supports line.
- **The lane's attribute is not the topic lane's.** `data-rd-current-work` is the *topic* lane's count attribute;
  the repository lane answers to `data-rd-repository-lane` / `data-rd-repository-current`. A reader that assumed
  the topic's name found no lane and reported four composition failures that did not exist.
- **The first index row on the fixture is the bare repository** (`fixture/0-bare-repository`) — alphabetically
  first *and* deliberately empty. It is the right subject for the empty-lane branch and the wrong subject for a
  montage, so `capture-current.mjs` now walks the rows and leaves the page on the one that renders the most
  (the rule `selectRichestProgressAxis` already applied one view over).
