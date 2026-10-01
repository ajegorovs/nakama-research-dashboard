# U4 step 7 — the consolidation pass, and the EntityTag contract exercised

**To the reviewer.** Step 6 is accepted and closed on your ruling: the **Problem index stays unfiltered** and
**`Axes` stays the default**. Step 7 is done as you framed it — a consolidation/finalization pass rather than
more model semantics — and its acceptance record is the frozen Progress record. This note says what landed, what
it is measured at, and the two things I would flag before you rule.

## The tag contract became a primitive, not a section's decoration

One `EntityTag` component now serves every type: one attribute pair (`data-rd-entity-tag` /
`data-rd-entity-id`, plus `data-rd-tag-label`), and the page has **one** navigation entry point,
`openEntity(type, id)` → `ENTITY_VIEW`. The repository tags step 5 wrote by hand render through it **unchanged**
— the step-5 checks kept passing without a single edit, which is the only meaningful evidence that this was
consolidation and not a rewrite wearing its name.

Progress emits tags where the contract says it should:

- the reading surface's **context line** — DetailHeader's "compact context line, navigation tags" — names its
  **topic** and its **axis**;
- the **Activity column** carries a tag for every entity its event names: **topic**, **repository**, **person**,
  and the **problem** the event is evidence for.

Two rules come from the projection, not from the markup: a tag's label is the **entity's own name**
(`topicName`, `title`, `fullName`, `displayName`, the problem's `statement`), and a tag renders **only where the
entity is actually named** — an event with no mapped account says "no account attributed" in words rather than
showing a tag that names nobody, and a reference the page's rollup does not carry renders no tag. No tag costs a
call: every one resolves from the payload the view already read.

The destination half is a `preselect` prop — the `{id, seq}` shape `RepositoriesView` already used, now also on
`PeopleView` and `ProgressView`, where an axis target switches the subview to `Axes` and a problem target to
`Problems`. `seq` is what makes the same tag land twice after a hand-made selection. For a topic target,
"selected" is the **expanded card** — the detail is what makes a topic the subject of the page — applied in the
page, since the topic index and its detail are one screen.

## The navigation proof, and how it is asserted

The pass clicks **each of the five tag types where Progress shows it** and asserts the canonical view **and the
entity genuinely selected there** — the expanded topic card, the person detail panel, the repository panel, the
active axis row, the problem the card is showing — with the label matching what the destination calls that
entity. It also compares the Activity column **row by row** against the events it claims to describe (every tag
names an entity its own event carries, and no more), pins that **no status badge is a tag**, and brackets the
whole traversal with the claim that matters most for a navigation primitive: **no write action was called, and
the projection is byte-identical afterwards**. (`get_topic`, when a topic card expands, is a read, and the
check's read-set says so explicitly rather than counting all calls as one thing.)

## Two dataset facts, recorded rather than smoothed

1. **No recorded event names a repository.** `repositoryId` is `null` on all 150 corpus events and all 8 fixture
   events — the replay records commits with a source URL and links repositories through the topic/axis
   relations, not per event. So the Activity column's repository tag renders **nowhere yet**, and both runs
   `SKIP` that check with its reason. The repository *navigation* is still exercised, from the threads section,
   on the fixture (step 5's two-tag check).
2. The corpus carries **no problem row**, so its problem tag skips too.

I would rather report this than manufacture a subject: the tag is written to render the moment an event names a
repository, and the check will run for real on any dataset that does.

## Three more mirror-drift findings, one class

`ProgressProblemRow` omitted **`topicId`** (the store's projection has it — without the id the topic half of the
context line would have been silently absent); `ProgressEventRow` omitted **`topicId` and `repositoryId`**; and
the People/Repositories index rows carried display names but no ids, so an identity assertion had to compare by
name. The page's own view types are type-correct against themselves, so only a DOM-vs-projection comparison
catches a field the projection sends and the mirror never declares — this is step 6's lesson at a third site.

## Measured

| | fixture | corpus |
|---|---|---|
| this step (7) | **96 pass · 0 fail · 1 skip** | **64 pass · 0 fail · 32 skip** |
| before (step 6) | 87 · 0 · 0 | 56 · 0 · 30 |

Both at 1440×900 and 1280×800, each on its own isolated instance. Ten checks added (nine run on the fixture,
eight on the corpus). `bun run check` 0 typecheck · 126 pass · 0 fail · 764 expect(). Release
`0.2.0+dev.e026dbe92b22`, revision 28 (corpus) / 41 (fixture), generation unchanged; the served `ui/app.js`
hashes to `77643db412aaf226` on both instances, in the vendored checkout and in this repository's build — the
"tested a different build than the repo contains" class is ruled out again.

## A harness defect of my own, fixed, and worth your attention

Clicking a tag captured in one view **after** the page has navigated away is a 30-second locator timeout that
kills the whole pass — and an unmounted view loses its selection (re-mounting Progress resets the subview and the
axis to the projection's first row), so "what the last landing left on screen" is not a fact to build a check on.
The checks now navigate, re-read, derive the subject **from the projection** (which bucket can show a tag at
all), click, assert — and `SKIP` rather than go red when the subject is absent. Separately, `read-pass.sh`
defaults `--dataset` to the corpus, so one fixture run without the flag wrote the fixture's transcript into
`docs/corpus/`; both runs were re-taken with the dataset named explicitly, and no contaminated record is
committed.

## What I would like ruled on

1. **The Progress acceptance record is frozen at step 7** — fixture 96 · 0 · 1, corpus 64 · 0 · 32. If you agree,
   the next work is the second half of U4 step 7: propagating this same grammar (shared components, tags, status
   treatment, responsive layout, cross-view navigation) into **Topics, Repositories, People and Overview**.
2. **The repository tag's subject gap** — no dataset's events name a repository, so the feed's repository tag is
   written but unexercised. Options: leave it (my preference — the check skips with its reason and will run when a
   dataset names a repository), or extend the layout fixture with an event that names a repository. Note that
   this is a *data* fact about the replay, not a missing capability in the page; if you want the fixture to carry
   it, that is a fixture change I would do as its own small step rather than inside a consolidation pass.
