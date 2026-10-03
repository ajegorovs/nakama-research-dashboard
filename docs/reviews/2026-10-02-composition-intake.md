# Composition phase — intake of the reviewer's strategy (2026-10-02)

**State: nothing implemented.** `src/` is untouched since `988bba7`; `main` is `3549823` and the tree the
reviewer read is byte-identical. This pass is verification + a resumable plan, ending at §7's decisions.

Source of the strategy: `docs/reviews/2026-10-02-composition-strategy.md` (verbatim).
Charter: `docs/ux-v2/COMPOSITION.md` + `DECISIONS.md §4–§7`.
Verification: every testable claim checked against `src/ui.tsx` / `src/store.ts` / the prototypes' markup /
the harness, plus a DOM geometry probe against the live review URL at both target viewports.

## 1. Claim → verdict → evidence

| # | claim | verdict | evidence |
|---|---|---|---|
| 1 | "The current Topics view is a vertical report page" | **confirmed** | `src/ui.tsx:3869` renders `<div className="rd-stack" data-rd-view="topics">`; measured: first card 1096px at 1440 / 936px at 1280, no index element |
| 2 | "the current People view is a vertical report page" | **wrong** | `src/ui.tsx:2313` renders `<div className="rd-split">` + `ul.rd-index` (`:2315`) + `PersonPanel` (`:2336`). Measured at both viewports: index 240px @320–560, panel 844/684px @572–, **tops equal (154 = 154), side by side**. See §2.1 |
| 3 | "Repositories is the only view already structurally close" | **confirmed** | `src/ui.tsx:2393` — same split; index 240px, panel 844/684px, tops equal |
| 4 | "Progress is a three-column data browser" | **confirmed** | `src/ui.tsx:838/841/847` — index `0 1 16rem`, problem `2 1 22rem`, activity `1 1 18rem` in one wrapping row. Measured at 1280: index 256px, problem 363px, activity ≈290px |
| 5 | "the Overview prototype has no counterpart; the landing view is the Topics card list" | **confirmed** | `VIEW_OPTIONS` has four entries (`src/ui.tsx:539–546`); the default view state is `"topics"` (`:3524`) |
| 6 | "remove the count-chip strip" — Topics carries a state-count chip strip | **confirmed** | `StateCounts` renders `{counts[state]} {state}` chips (`src/ui.tsx:1229`), used by the Topics card at `:3927` |
| 7 | "the prototype's index is 320px-ish" | **confirmed** | `topics.html:116` `320px`, `people.html:97` `310px`, `repositories.html:97` `330px`, `progress.html:129` `320px` |
| 8 | "the detail carries a two-column inner split" | **confirmed** | `topics.html:282` `minmax(0,1.3fr) minmax(280px,.7fr)`; `people.html:226` / `repositories.html:235` `1.15fr / minmax(280px,.85fr)`; `progress.html:273` `1.35fr / minmax(320px,.65fr)` |
| 9 | "`.bottom-grid` = `repeat(3, minmax(0,1fr))` → Repository threads / Evidence / Human steering" | **wrong** | `progress.html:368–370` `.bottom-grid` is **two** columns and holds `Plan / work package` (`:735`) + `Open problems` (`:776`). The three-card band is **`.support-grid`** (`:474–476` = `repeat(3, minmax(0,1fr))`) holding Repository threads (`:822`) / Evidence (`:841`) / Human steering (`:861`) |
| 10 | "keep the activity feed as the detail's right column" | **wrong as stated** | `progress.html`: `Activity` is the **top-grid's** second cell (`:694`, inside `.top-grid` at `:668`), sharing the row with the Problem card (`:670`). `bottom-grid` and `support-grid` are siblings **below** it, full detail width |
| 11 | "the `Read topic` control checks (×4)" | **imprecise** | harness contains **1** assertion whose subject is the control (`verify-page.mjs:569`), **3** `.click()` call sites that *use* it as a route (`:593`, `:656`, `:3437`), and the read-mode assertions it depends on (`:649–651`). `ui.tsx` has exactly one label (`:3996`) |
| 12 | "the harness proves semantics but not spatial composition" | **partly wrong** | 5 geometry reads exist today including the U9 glance check (`verify-page.mjs:3325–3343`, `getBoundingClientRect` on `.rd-progress-problem` / `.rd-progress-activity [data-rd-feed-event]` vs `VIEWPORT.height`). The instrument exists; the coverage is one check wide |
| 13 | "the file is ~165 KB and carries DTO mirrors, primitives, four views, CSS, shell" | **confirmed** | 165,125 bytes / 4,284 lines; mirrors `:124–460`, primitives `:1058–1710`, views `:2268/2350/2565/3868`, CSS one template literal from `:596`, shell `ResearchPage` `:3522` |
| 14 | "acceptance records will change honestly" | **confirmed, with a labelling trap** | committed transcripts: corpus `PASS 88 / SKIP 23`, fixture `PASS 112 / SKIP 0` (both viewports) — matches COMPOSITION §3. The estate `HANDOFF-UX-V2.md` §Evidence table still prints corpus `84 · 0 · 22` / fixture `107 · 0 · 0` (the U6-era numbers) **unlabelled** beside the current ones. See §8.2 |

## 2. Corrections to our own charter artifacts (the root cause of two misreads)

### 2.1 `REVIEW.md` §People is false, and it caused the People misread

`docs/ux-v2/fidelity/REVIEW.md:66–68` states the app's People view is "single column of full-width person
cards … **No index pane**". The source and the capture disagree: `PeopleView` has rendered `rd-split` +
`rd-index` + `PersonPanel` since C6, and `docs/ux-v2/fidelity/current-1440x900/people.png` shows the index
(ajegorovs / Fixture Zeta) beside the panel. The reviewer read the pack in the order the packet specifies
(`REVIEW.md` first) and inherited the error.

**Consequence for the plan:** C2 is not "build master-detail for People". The macro-layout exists and is
measured. C2's real content is the **detail's inner two-column split** (main | side rail — none exists today),
the **index row grammar** (no recency column today), and the **proportional widening** of the index if the
grammar wants it. That is a materially smaller unit than the strategy assumes.

### 2.2 The `.bottom-grid` / `Open problems` misstatement

`COMPOSITION.md:22` and the strategy both place the three support cards in `.bottom-grid`; the markup puts
them in `.support-grid`, with `.bottom-grid` carrying Plan | Open problems. `REVIEW.md:82–83` repeats the
error and adds "right column … `OPEN PROBLEMS`", which the prototype does not have. §1 rows 9–10.
This matters because C4's acceptance will otherwise assert a structure the target does not specify.

## 3. Capability findings — what the existing payloads can and cannot produce

The charter forbids new projections, so each prototype element was checked against the payload that exists.

| element | payload | verdict |
|---|---|---|
| C1 detail: title/description, entity tags, current-work rows, folded completed work, activity list, Notes, Related repositories | `TopicDetail` carries `topic, people, repositories, axes, axisCounts, activity, notes, counts` (`ui.tsx:124–139`) | **all present** — C1 needs no projection |
| C1 index: title, "N current axes", recency, STALE | `TopicOverview.topic/axes/axisCounts/lastActivityAt` (`:151–159`) | **present** |
| C2 detail: "About" | `Person.notes` exists (`:162–168`) | **present** (human-authored, factual — not fabricated prose) |
| C2 detail: the single role/description line | no person-level role. Roles live on the *topic link* (`PersonTopicInvolvement.role`, `:204–208`; `LinkedPerson = Person & {role}`), often empty | **absent** → omit, or render the per-link roles where they exist |
| C2 detail: "Related repositories" | not on `PersonRollup` | **derivable in-view** by inverting the overview's `people[].axes[].repositories`, bounded by `peopleTruncated` |
| C3 card: "latest event" text | `TopicOverview` has `activityCount` + `lastActivityAt`, **no** latest-event text | **derivable** only from the global `recentActivity` (capped at 25, `store.ts:2036`) → some cards legitimately have none |
| C3 card: "activity count in window" (repository) | `RepositoryRollup` has a **capped** list (`DEFAULT_ROLLUP_ACTIVITY_LIMIT = 5`, `store.ts:384`, accumulator `:2529–2541`) and **no count field** — unlike `TopicOverview.activityCount`, which is the true window total (`store.ts:991–993`) | **absent.** Printing `recentActivity.length` as a window count reads "5" whenever there are ≥5 events — the exact "counts that restate rows" defect this phase exists to remove |
| C5 detail: "People" block on a repository detail | not on `RepositoryRollup` (`:224–231`) | **derivable in-view** by inverting the overview's person rollups; bounded by the people cap |
| C5 detail: "Notes" block on a repository detail | annotations attach to a topic or an axis only (`listAnnotations({topicId, axisId})`, `store.ts:1666–1670`); the prototype's block is static explanatory prose (`repositories.html:540–543`) | **mock content** → omit |

## 4. Measured geometry (read-only DOM probe, live review URL, both viewports)

Nakama's host chrome is **296px** at both viewports, so the plugin container is **viewport − 296**:

| viewport | container | view root (after plugin padding) | index / detail | tops |
|---|---|---|---|---|
| 1440×900 | 1144px | 1096px | 240px / 844px | 154 = 154 |
| 1280×800 | 984px | 936px | 240px / 684px | 154 = 154 |

- Topics: `.rd-stack`, first card 1096 / 936px wide — **no index element exists**.
- People / Repositories: side-by-side at **both** viewports, index left of detail, tops equal. The index is
  already **~22–26% of the usable width**, which is the prototypes' own proportion (320px of ~1380px ≈ 23%).
- Progress (1280): index 256px @320–576, problem 363px @588–951, activity ≈290px @963–1256.
- The prototypes' own breakpoints are **≤1000px** (`topics/people/repositories.html:438/349/—`) and
  **≤1100px** (`progress.html:551`) — i.e. the prototype itself collapses to one column at the review
  width. **Every geometry assertion must be written against the container, not the viewport.**

## 5. Harness: the coverage moves C1 must make

| subject | where | move |
|---|---|---|
| "the topic card offers one disclosure control, not two" | `verify-page.mjs:569` (+ `disclosureNames` `:564`, `secondExpanders` `:565`) | **retire**, reason recorded: the control's subject disappears. Replace with an **absence** assertion (no disclosure control on a topic card), per the U6 lesson |
| the `Read topic` route | `.click()` at `:593`, `:656`, `:3437` | **re-point** onto the always-present detail (select the topic, then assert) — coverage moves, not deletes |
| read-mode / no-editor assertions (D7) | `:649–651` and the note path at `:3434–3451` | keep, re-pointed at the always-present detail; the note path is unchanged (it already lives inline in the detail) |
| "overview renders as the default screen" | `:343` (+ `:348` "from one get_overview call") | **survives C1** (Topics stays the default until C3); it **moves** in C3, when the landing composition changes |
| "one surface per level: no boxed block nests inside another, except a refusal banner" | `:3225`, `:3233` | re-check after C1/C4; the composition moves what nests |
| "the Progress glance … is inside the first screen" | `:3338`, measured at `:3325–3343` | **the precedent to copy** for the new geometry checks |

Selection semantics note: a topic tag click currently routes to Topics and sets `expandedId`
(`ui.tsx:3548`, `:3555–3558`) — i.e. it *opens* the card. Under C1 that becomes a *selection*; the
EntityTag contract's "navigate and select" half needs no new plumbing, only the rename of that one state.

## 6. Chunk plan (the strategy's order, with the corrected content)

| unit | state | content, as corrected | acceptance |
|---|---|---|---|
| **C1** Topics index + detail | **blocked on D1, D8, D9, D10** | `rd-stack` → index + persistent detail; count strip retired; detail inner split (main vs side rail); selection state replacing `expandedId`; geometry checks at both viewports | harness + new geometry checks + fresh montage + reviewer sign-off |
| **C2** People | todo (smaller than scoped) | macro-layout exists — add the **detail inner split**, index row grammar, and the blocks the payload supports (About from `notes`; related repositories derived) | as C1 |
| **C4** Progress | todo | regroup to the **markup** reading (§1 rows 9–10): top-grid = Problem + Activity; bottom-grid = Plan + Open problems; support-grid = the three cards; toggle above index | as C1 |
| **C3** Overview landing | todo | two-column aggregation as default landing; `Open topic →` selects in Topics, `Expand activity →` selects in Repositories | as C1 |
| **C5** Repositories | todo | convergence only: same inner split, row grammar, header | as C1 |

Nothing is implemented; no branch has been cut.

## 7. Decisions blocking the first chunk

**D1 — accept the corrected charter? (blocks C1)** The markup, not `COMPOSITION.md:22` / the People and
Progress paragraphs of `REVIEW.md` (`:66–68`, `:82–83`), governs. Recommend: yes — correct all three sites in
place with a dated note (the correction is auditable, and the packet's reading order otherwise re-seeds the
error).

**D2 — C2 re-scoped?** With §2.1, C2 is "detail inner split + index grammar + the two payload-backed
blocks", not "build master-detail for People". Recommend: yes; keep its place in the order (it is genuinely
cheap now).

**D3 — Progress composition: markup or `COMPOSITION.md §C4`'s wording?** They disagree (§1 rows 9–10).
Recommend: the markup; record the §C4 wording as an erratum beside it.

**D4 — the repository "activity count in window"** (§3). Recommend: **omit the count**; do not print a capped
list's length as a window count. Record a follow-up: adding `activityCount` to the two rollups mirrors
`TopicOverview.activityCount` and is a one-field change for a later phase, if the element is wanted.

**D5 — repository "People", derived in-view?** Recommend: yes, derived from the overview's person rollups,
and when `peopleTruncated` is true either say the list is bounded or omit the block — never show a subset as
if complete.

**D6 — repository "Notes"?** Recommend: omit — it is mock content (`repositories.html:540–543`), and
annotations cannot target a repository.

**D7 — the person role line / About?** Recommend: omit the single role line (no person-level role exists);
render the per-link role where it exists; render About from `Person.notes` when non-empty (with the empty
state named, per the U6 discipline).

**D8 — the geometry assertions' wording** (§4). Recommend: container-relative, not viewport-relative;
assert order + equal tops + detail wider + both tops inside the first screen; express the index as a
**share of the usable width (20–27%)**, not the absolute 280–350px band — measured, the prototype's own
proportion at this width is ~23%, and a literal 280–350px band fails both the current build and the
prototype's own ratio.

**D9 — Progress assertions as proposed do not discriminate the defect.** Measured today, the Problem column
is already left of Activity and the rail is already narrower, so those two assertions pass on the build that
is wrong. Recommend adding: "the Problem is the widest column in the top row (≥1.25× the Activity rail)" and
"index, problem and activity tops are equal".

**D10 — the disclosure check.** Recommend: **retire** "one disclosure control, not two" (its subject is
gone) and add the absence assertion; do not convert it into a positive assertion about a control that no
longer exists.

**D11 — per-unit branch + sign-off?** Recommend: one branch per unit (`composition/c1-topics` …), montage
before merge, `main` holding the accepted baseline throughout.

## 8. Owner items (not part of the strategy reply)

### 8.1 Identity leak in a **public** repo — **RESOLVED 2026-10-02** (commit `50ff45e`)

> **Status:** fixed before any further push, per the reviewer's ruling. `harness/fidelity/montage.mjs` now takes
> `--url-label` (placeholder default) and `--build`; the five montages are regenerated; `STATUS.md`, `REVIEW.md`
> and the four `layout-pr/verify-*.txt` are scrubbed to the placeholder form (tailnet-IP forms included — that is
> the AGENDA *Endpoint addressing & IP storage* candidate policy for repo docs). A whole-tree check now returns
> zero occurrences. **History is not rewritten** — the identifiers remain in past commits; that is a separate
> operational decision with cache/collaborator implications, as the reviewer ruled.
>
> **Residual, lower severity:** the app captures are viewport captures, so they include the host's own chrome
> (the Nakama sidebar with the workspace name and recent chat titles) — no account email or host name, but the
> component-only capture the fidelity method asks for would remove it. Docketed, not changed here.

Original finding, as recorded at intake:

`ajegorovs/nakama-research-dashboard` is **public**, and this host's real device name + tailnet suffix
(`<box>.<tailnet>.ts.net` — the values are the ones the estate's AGENTS.md legend scrubs) are committed in
**11 tracked files**: `docs/ux-v2/fidelity/REVIEW.md`,
`docs/ux-v2/STATUS.md`, `docs/ux-v2/fidelity/side-by-side/*.html` (5), `docs/layout-pr/verify-*.txt` (4; since retired from `main` 2026-10-03, preserved at tag `pre-ux-v2`) —
and **hardcoded in the generator** `harness/fidelity/montage.mjs:64`, so re-running the instrument
reproduces the leak. The montage **PNGs bake the string into the rendered caption** (confirmed by eye on
`side-by-side/people.png`); a string grep cannot find it there.

`REVIEW-PACKET.md` itself is clean (it uses the placeholder), so the packet's promise holds — but the
reading order's item 1 does not. Fix: parameterize the caption, re-render the montages, scrub the text
files, and decide what to do about history (a rewrite, or accept it as already-public). *Superseded by the
status block above — fixed the same day.*

### 8.2 Acceptance-count labelling — **RESOLVED 2026-10-02**

> **Status:** the estate `HANDOFF-UX-V2.md` §Evidence table now carries the current (post-U9) pair
> `88 · 0 · 23` / `112 · 0 · 0` and names the earlier pair `84 · 0 · 22` / `107 · 0 · 0` as the **U6-era**
> measurement, kept for the record only.

Original finding:

The estate `HANDOFF-UX-V2.md` prints corpus `84 · 0 · 22` / fixture `107 · 0 · 0` in its §Evidence table
while its later paragraph and the checkpoint print `88 · 0 · 23` / `112 · 0 · 0`. The committed transcripts
say `PASS 88 / SKIP 23` and `PASS 112 / SKIP 0`, so the table row is the stale U6-era pair, unlabelled. Fix:
label each count with its era.

### 8.3 Review-UI durability — **awaiting the owner's word**

> **Status:** ruled by the reviewer as *do it before per-view sign-off*, and documented as a **review/dev
> service, explicitly not a production deployment**. Not yet done: it edits host service config, which this
> session does not touch unasked.
