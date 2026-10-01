# U4 Step 6 — the `Axes | Problems` subview

**To:** reviewer · **From:** implementation · **Date:** 2026-10-02 · **Commit:** `b0bc4e1` (`ux-v2`), estate `1ecc49d`

You accepted Step 5 and asked for Step 6 as an **inversion of the existing projection, not another tracking
surface**. This is what was built, what it reuses, and the two things measuring it turned up.

## What was asked, and what the page now does

| asked | delivered |
|---|---|
| left index becomes concrete Problems rather than Axes | the switch `Axes \| Problems` (`data-rd-progress-switch`) governs the left column; `Problems` lists `get_progress.problems.problems` |
| preserve the server's problem order | no sort, no grouping, no ranking — a check compares the rendered id sequence against the live answer's, in order |
| row shows statement/title, state, parent axis, topic, recency | the state chip, the statement, and one context line built from the row's own fields: parent axis, topic, repositories (or `no repository`), step, event count, recency |
| selecting a Problem shows the same reading surface | the same card, facts line, plan section, three sections and feed components, reading the same `shownProblem` |
| Activity follows the problem / its parent context, not reconstructed in JSX | in `Problems` the axis is *derived* from `shownProblem.axisId`, so the feed is the server's bucket for that parent — and the column says `on <axis title>` rather than leaving it implied |
| repository/evidence/steering use the same Problem object | unchanged components over the same object; the check compares the **section counts against that problem's own projection row**, not against a constant |
| switching must not create or mutate anything | asserted on **both** datasets: no `get_progress` call during any switch, and the live payload before and after is identical |
| selection bridge when there is an obvious identity bridge | `Axes → Problems`: the reader's own pick if they made one, else the axis's first **open** problem in projection order, else that axis's first problem, else nothing. `Problems → Axes`: the problem's parent axis. No memory beyond that |

One heading had to become mode-aware: `Axes` keeps `Open problems (n)` from the projection, but in `Problems`
the card can be a closed-out problem, and a count of *open* problems would then describe something the card is
not showing. It reads `Problem` with a context line instead. Same components, a heading that stays true in both
positions.

## The deferred question, answered by not acting

You asked whether the client-side `problems.filter(axisId)` should move into a server projection. It should not,
and `get_progress` was **not touched**: the payload already returns every problem, in server order, with the
fields both positions read (the problem index uses the whole list; the axes-mode card uses the subset for the
selected axis). A second projection would be a second source for one fact, and a read-contract migration for a
navigation change. Recorded in `U4-progress.md` §17 so a later reader does not reopen it as an oversight.

## Evidence

- **Fixture:** `87 pass · 0 fail · 0 skip` at 1440×900 and at 1280×800 (seven added).
- **Corpus:** `56 pass · 0 fail · 30 skip` at both (four of the seven, three skipped for want of a problem row,
  plus its own empty-index check: the index says `No problems yet.` rather than rendering an empty list that
  would look like a load failure).
- `bun run check`: 0 typecheck, **126 pass · 0 fail · 764 expect()** — unchanged, since Step 6 is page-side.
- Release `0.2.0+dev.5b9351485fe2` (revision 12 corpus / 25 fixture); served `ui/app.js` hashes to
  `72e6b99c0cfaa27e` on **both** instances, in the vendored checkout and in the repository's own build — so the
  pass cannot have measured a different build than the repo contains.
- New capture `docs/layout-fixtures/screenshots/{1440x900,1280x800}/dashboard-problems.png`, taken in exactly
  the state the checks describe.

## Two things measuring turned up

1. **A stale claim, corrected.** The Step-4 record and a harness skip reason both said the fixture's axis
   carries *four problems, three open*. Step 4 was right about the instance it measured — that instance had been
   through the layout applier twice and the pre-Step-5 applier duplicated a problem — and Step 5's idempotency
   fix removed the duplicate. The fresh apply gives **three problems, two open**, which the Step-5 transcript had
   already printed without anyone reading it against the prose. Prose and skip reason corrected; the claim they
   support (closed-out excluded, every open one listed) is unaffected.
2. **The rebuild loop had no script.** `install-plugin.mjs` installs and enables but never reinstalls, so serving
   a changed build was a hand-run endpoint call — exactly the place where a pass silently measures the previous
   build. Now `harness/reinstall-plugin.mjs` (`bun run harness:reinstall`), which names the revision it read and
   says so plainly when the vendored bytes are identical to the installed release.

Also worth noting for the record: the page's own view type had gone stale against the projection
(`axisTitle`/`topicName` undeclared on the problem row). The typecheck caught it this time only because the new
index read the field in a typed expression — the same drift class as Step 1's mirror defect, which the typecheck
could not see because a flattened level of nesting type-checks clean and renders empty. The DOM-vs-projection
comparisons in the pass remain the guard that would catch it either way.

## Open for you

- Whether the problem index should stay **unfiltered** (the axis index is), or whether a later step should let
  the view's window/filters narrow it. Today it is symmetric with the axis index deliberately.
- Whether `Problems` should be the *default* for reviewers arriving with a problem in hand. Today `Axes` is the
  default and the switch is explicit.

Next: Step 7 — propagating the shared primitives into Topics, Repositories, People and Overview.
