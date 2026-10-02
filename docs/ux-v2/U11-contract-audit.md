# U11 — the contract audit: does the frozen contract still describe the implementation?

**Date:** 2026-10-02 · **Contract:** `docs/ux-v2/contract/` (published verbatim at U0 — **not edited by this
audit**) · **Method:** section-level, each section mapped to the implementation and to **named checks from the
committed records**, with every item I could not confirm called out rather than ticked.

**Granularity, stated plainly:** this is a section-level audit with citations, not a per-box re-derivation of
all 96 checklist items. Where the contract's wording and the implementation seemed to disagree, I looked — that
produced one real finding (§10), and I say so rather than quietly checking the box.

## 1. Global — satisfied, exercised at both reference widths

All five views exist and are reachable from one page; the pass runs **both** viewports (`1440x900`, `1280x800`)
on **both** datasets, which is the checklist's rendering requirement, and the shared grammar is asserted
directly: *"every state row in every view renders its claim through the one badge"*, *"every recency label's
words are the age of the timestamp it carries, in all four views"*. Read vs steering is asserted as a mode
boundary: *"reading a topic does not open the editor"*, *"the form appears only from Edit fields"*, *"finishing
an edit returns to reading, with the card still open"*. *No broad CRUD console reappears* is enforced by the
surface itself: five actions, `reconcile_topic` the single write path.

## 2. Tags and navigation — satisfied, and executed rather than described

One `EntityTag` primitive, one entry point. Exercised **in the pass**: *"a topic tag lands in Topics with that
topic selected, and the label matches the card it opened"*, the person, repository, problem and axis variants
*"whichever subview it was clicked from"*, plus the two negative rules — *"no status badge is a tag"* — and the
no-mutation rule, asserted twice: *"the tag traversal wrote nothing: no write action was called and the
projection is unchanged"* and *"the grammar traversal wrote nothing"*.

## 3. Overview — satisfied (recency-first, no duplicated section, no stat strip)

*"overview renders as the default screen"*, *"the overview renders from one get_overview call"*, *"a
get_overview call reads other plugin actions for nothing else on first paint"*, *"the count line reads correctly
when the count is one"*, *"each topic card reports its recent-activity summary"*. The recency semantics live in
the store's projection (`overviewRecency`), and the stale-vs-blocked distinction is asserted where it can be:
*"the blocked axis shows its blocker text"* plus *"a topic with a blocked axis is visually distinct"*.

## 4. Topics — satisfied except one wording mismatch (§10)

*"the expanded card renders the topic detail, one block per axis"*, *"the detail shows the topic's fields, its
notes and its activity separately"*, *"the topic card offers one disclosure control, not two"*, *"a card that
hides axes states it rather than offering a second way in"* (the folding requirement), *"reading a card shows
every axis it holds"*. Activity carrying repository tags is U10 §1's seed: the fixture activity now names a
repository and the check renders and passes there.

## 5. People — satisfied, and the judgment boundary is asserted

*"person-first shows one person at a time, with their involvement grouped underneath"*, *"the person panel
states attribution instead of implying idleness"*, *"one person on several topics shows each topic with its own
axes underneath"*, and the no-ranking rule is a check rather than a promise: *"one person is exactly one row in
the index, and the panel is theirs"*, *"a person filter that matches nothing attributable says so, and shows no
unrelated events"*.

## 6. Repositories — satisfied

*"the Repositories view is repository-first: the index is the set, and one of them is selected"*, *"a repository
that supports work names the topics it supports and the axes happening in it"* — i.e. the repository is not
treated as a parent of the axes. *"a repository's topic tags are the topics its own rollup links it to, ids and
names alike"* closes the navigability item.

## 7. Progress — satisfied, including the two subjects and the protected classes

Index and both subviews: *"the Progress index offers both subjects, and opens on Axes"*, *"the Problems index
lists the projection's problems, in the server's order, with each row's own state, axis, topic and recency"*.
The problem-centred reading surface, the adjacent Activity column (*"the Progress top area shows the index, the
Problem column and the Activity feed side by side"*), the optional plan (*"an axis with no plan renders no plan
section at all"*), repository threads, evidence provenance and human steering each have their own checks
(*"human steering is exactly the projection's claims, under the scope each was aimed at"*, *"an ordinary note on
the same problem is context, not steering"*). Reopen-after-usable is a store/migration-004 behaviour, covered in
`U1-migration.md` and its tests; the model-level rule that a resolved problem counts in `problems` but not in
`openProblems` is pinned by a contract test.

## 8. Semantics / librarian behavior — satisfied

Stale-means-inactivity: the recency labels carry ages and the store derives staleness, with the blocked-stale
separation asserted above. Confidence-belongs-to-claims: *"every rendered state carries its claim, and one that
is not confirmed says so"*, *"the corpus's inferred states reach the view as unconfirmed, not laundered into
facts"*. Provenance admission: *"a recorded event names its source the way it is reported, not the way the menu
offers it"*. Human-before-automated: the steering section renders human-authored claims only, and the action
surface takes the author from the session, never from input.

## 9. Regression / harness — satisfied

*"Existing real-corpus dataset still renders"* and *"existing layout fixtures still render"*: the two records are
the proof, on separate instances, both viewports. *"No fixture coverage is weakened"*: the count went
**up** (105 → 107 on the fixture, 72 → 84 on the corpus) and every skip carries a reason; the one thing this
audit **cannot** claim from the records is *"existing structured conflict semantics remain unchanged"* — that is
a store-level property, asserted in `src/store*.test.ts` (126 pass) rather than in the page pass.

## 10. Flagged for the reviewer: one wording mismatch, no implementation gap

**Topics → *"Broad Add Topic / Edit Fields controls are absent."*** The page **does** carry an `Add topic`
button (the read pass records it in the toolbar inventory and the write pass clicks it) and does have an `Edit fields` control (the pass asserts *"the form
appears only from Edit fields"*). But the rest of the contract asks for exactly that: `interaction-spec.md`
requires reading and editing to be **different modes** with one disclosure control per card, and the rework
brief's toolbar list includes `Add topic` among the grouped controls. So the checklist's literal sentence is not
satisfied while the contract's intent is — the mismatch is *inside* the frozen contract. I did not edit it
(it is published verbatim); it is the reviewer's wording to settle.

**Resolved (2026-10-02, reviewer ruling):** the later UX review supersedes the earlier language that retained
broad `Add topic` / `Edit fields` controls — the checklist's wording is the **intended final behavior**, and
removing the broad controls is a **U6 refinement item**. The frozen contract is not rewritten; the clarification
lives in `docs/ux-v2/DECISIONS.md` §1 and is registered as **D7** in `docs/ux-v2/README.md`. The two items below
became hardening items **H1**/**H2** in `STATUS.md`.

**Not confirmed by this audit, and why:** *"Existing structured conflict semantics remain unchanged"* (a store
property — covered by tests, not the page pass), and *"Keyboard focus and selected-row state remain visible"*,
for which I found no named check in the records — if it is meant to be machine-checked, it needs one; if it is a
visual judgement, it belongs to the reviewer's eye, not the transcript.
