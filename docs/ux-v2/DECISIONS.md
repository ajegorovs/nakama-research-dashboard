# Decisions after the contract — post-contract clarifications

The contract in `docs/ux-v2/contract/` is **frozen and published verbatim**; nothing here edits it. This file
carries the decisions taken *after* it that a reader needs in order to read it correctly. Each entry says what
was decided, what it supersedes, and where the work lands.

## 1. Topics editing controls — the checklist's wording is the intended final behavior (2026-10-02)

> **Post-contract clarification — Topics editing controls.** The later UX review supersedes earlier language
> that retained broad `Add Topic` / `Edit Fields` controls. **Topics is primarily a read/navigation surface:**
> structural changes normally go through the librarian, and narrow note/correction/steering affordances are
> acceptable. The acceptance-checklist wording — *"Broad Add Topic / Edit Fields controls are absent"* —
> **represents the final intended behavior**, so it stands as written.

- **Superseded by this decision:** the `layout-rework-brief.md` toolbar list (which counts `Add topic` among the
  grouped controls) and any interaction-spec language that reads as requiring a broad edit entry point on
  Topics.
- **Not superseded:** the principle behind the read/edit boundary — **one control per piece of state**, never a
  second way into the same state (D1). What U6 removed is the *edit* half: `Read topic` is now the card's only
  control and reading its only mode. The principle stays; the `Edit fields` control does not.
- **Where the work lands:** **U6 (Topics refinement)**. The merged build is a usable UX-v2 baseline; removing
  the broad controls is polish, not a reason to reopen the merge. Raised in the U11 contract audit §10.
- **Executed in U6** (2026-10-02): the broad `Add topic` and `Edit fields` controls are removed, along with the
  edit mode and its topic-field/activity editor. What remains on the page is `Read topic` (the card's one
  disclosure), the inline topic note and the axis correction. Read pass re-recorded from that build — corpus
  **84 · 0 · 22**, fixture **107 · 0 · 0**; see [`U6-topics.md`](U6-topics.md).

## 2. Deployment status is stated, not implied (2026-10-02)

There is **no always-on deployed dashboard service** today. The project is merged, installable and
reproducible from a clone; "production deployed" would be inaccurate. This restates D6 (dev instance only until
v2 is proven; the Docker deployment is out of scope) and is kept explicit in `services/nakama/HANDOFF-UX-V2.md`
and the estate's service README so no reader infers a live service from the acceptance records.

## 3. The Overview destination — four navigable views, and "Research overview" is the shell (2026-10-02)

> **Post-contract clarification — Overview destination.** The final UX-v2 implementation has **four navigable
> views: Topics, People, Repositories, Progress**. "Research overview" is the dashboard **shell/title**, not a
> separate destination. Earlier prototype/spec language describing Overview as an independent tab is
> **superseded**.

- **Superseded by this decision:** the "Overview becomes a view of its own" entry in `docs/ux-v2/README.md`,
  and the U5 label wherever it reads as an unfinished standalone Overview view (the estate plan, the handoff,
  `STATUS.md`).
- **Not superseded:** what the shell actually does. The page title, the counts line under it and the
  recency-first default surface stay as they are — described as **dashboard-shell / default landing behavior**,
  not as a fifth tab.
- **What the implementation says:** `VIEW_OPTIONS` in `src/ui.tsx` lists four views, and the page renders
  `<h2 class="rd-page-title">Research overview</h2>` above whichever one is active. The read pass's view checks
  address exactly those four.
- **Where the work lands:** documentation, plus one consequence for the pass — the density checks name the four
  views that exist. An earlier measurement named a fifth and reported the default surface's numbers under it
  (a click with no control to click fails quietly); the instrument was corrected, not the page.
