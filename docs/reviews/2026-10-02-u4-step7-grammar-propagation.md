# U4 step 7, second half — the shared grammar across Topics, People, Repositories and Overview

**To the reviewer.** The frozen Progress record was accepted, and this pass propagated the primitives
Progress proved into the other four surfaces, conservatively, as you asked. This note says what was
extracted, what each view now shows, what is measured, and the two structural findings I would want you to
know about before ruling.

## What is now shared, and who uses it

Five components carry the grammar, each used by more than one view:

- **`EntityTag`** (unchanged from step 7) — one attribute pair, one label attribute, one `compact` style.
- **`RecencyLabel`** — the age, derived from **the timestamp the row is sorted by**, with that timestamp on
  the element (`data-rd-recency`). The four views previously had four phrasings and no way to check any of
  them against the field it came from.
- **`DetailHeader`** — the selected-entity header: a title *node* (so a card keeps its heading level and the
  Progress card keeps the `<h3>` the pass reads), an exceptional status, and the context line of tags.
- **`ActivityLine`** (+ `EventDate`) — one recorded event, one rendering, used by the C6 lists and the
  Progress feed alike. It reads a narrow structural type that both payloads already satisfy, so neither had
  to be widened; it tags every entity the event names and, where the view states it, the words for an
  unattributed event.
- **`Notice`** — an exceptional state that names which one it is (`empty` / `filtered` / `truncated`) and can
  carry the caller's own fact. A notice is never a tag.

## What each view now shows as tags

Always the entity's own name, always only where the entity is named, never a call: **Topics** — repositories
and people from the topic's rollup, the axis on every row and card with the repositories it lives in, and in
its own activity the axis, repository and topic each event names; **People** — the topic on each involvement
line, the axis and repositories on every axis row; **Repositories** — the topic on each "supports" link, the
axis and repositories on every axis row; **Progress** — unchanged from step 7's proof.

So the reviewer's five destinations now all have a *source* outside Progress: a tag clicked in People,
Repositories or Topics lands on its entity, selected, under the destination's own name.

## Two structural findings

1. **A tag cannot live inside an index row.** Those rows are `<button>`s; nesting a button inside a button is
   invalid, and the browser will not honour it. That is why the Overview's rows carry their tags on the
   *title* (the row's own name becoming the link to its canonical view) and in the subordinate line's tag
   cluster, while the Progress index's rows keep their context as text and the tags live on the card beside
   them. It is a constraint of the accepted markup, not a preference — worth stating because it looks like
   an inconsistency otherwise.
2. **A view that is not mounted has no DOM.** Two of my new checks read a *selection* (which person's panel,
   which repository's panel) from the live page; the same trap as step 7's, one level up. The pattern is the
   same one the harness now uses everywhere: bring the view back, re-read, then assert.

## Measured

| | fixture | corpus |
|---|---|---|
| this pass | **105 · 0 · 1** | **72 · 0 · 33** |
| step 7 (first half) | 96 · 0 · 1 | 64 · 0 · 32 |

Both at 1440×900 and 1280×800, each dataset on its own isolated instance. Nine checks added.
`bun run check`: 0 typecheck · 126 pass · 0 fail · 764 expect(). Release `0.2.0+dev.caa231a415f0`, revision
36 corpus / 49 fixture, served `ui/app.js` `aa3a478c39ca045d7e96` identical across both instances, the vendored checkout and the
repo build.

Two checks skip on one dataset each, with their reasons rather than a green tick: the corpus renders no
exceptional-state notice (no empty or truncated surface — it has no blocked axis, and its cards hide no
axes), and neither dataset's events name a repository, so the feed's repository tag still has no subject.
The corpus also cannot exercise the badges' *blocked* styling, which is the same dataset fact step 3
recorded.

## What did not change

The four views' product rules are untouched, as instructed: Topics still leads with its 2–4 most relevant
axes and keeps `Read topic` as its only disclosure control; People is still person-first and never scores
anybody; Repositories is still implementation-first; the Progress composition is exactly the one step 6
froze. This pass is grammar and navigation.

## Ruled on

**The reviewer closed U4 on 2026-10-02, accepting the records above as the frozen U4 acceptance and both
skips as data-dependent gaps rather than hidden failures — U0–U4 are complete.** (The text below was the
question this note opened; it is kept as the record of what was asked.)

**U4 is complete on this evidence, if you accept it.** The Progress vertical slice has its frozen record
(step 7), the shared grammar is exercised in all four remaining views, and the acceptance records are
re-taken on both datasets at both viewports. My reading of the plan is that the next work is U10/U11 rather
than anything further in U4 — but the plan's step 7 named both halves, so I would rather you close it
explicitly than assume it.
