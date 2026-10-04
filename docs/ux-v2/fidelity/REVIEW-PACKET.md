# Reviewer packet — composition phase (2026-10-02)

**The ask:** review the scope below and **propose the refactor strategy** for implementing it. No
implementation has started; nothing in `src/` has changed since the fidelity check. The strategy we want is a
plan — unit ordering, what to touch and what to leave, where the risk is, and how each step should be
verified — not code.

**Source and screenshots** are on the repository's GitHub remote (`main`, and the branch named in §6); the
owner will confirm access. Everything below is repo-relative.

## 1. Read in this order

| # | file | why |
|---|---|---|
| 1 | `docs/ux-v2/fidelity/REVIEW.md` | the verdict: what the running build does and does not reproduce, per view, with the montages beside it |
| 2 | `docs/ux-v2/COMPOSITION.md` | the scope: the target spec read off the prototypes' own markup, units C1–C5, verification plan, non-goals; §4 now records the resolved collisions |
| 3 | `docs/ux-v2/DECISIONS.md` §4–§7 | the owner's rulings that unblocked the units |
| 4 | `docs/ux-v2/STATUS.md` (header) | where the whole UX-v2 sequence stands, including why this phase exists |
| 5 | `src/ui.tsx` | the source to be refactored — one file carries the shell, the views and the token set |
| 6 | `harness/verify-page.mjs` | the checks that will have to move with the composition |
| 7 | `harness/fidelity/README.md` | the three instruments used for the fidelity check, and how to re-run them |

## 2. The finding in one paragraph

The four views do not reproduce the approved prototypes' page composition. `Repositories` matches (density
aside). `Progress` has all the content grouped differently (three near-equal columns, with the plan, repository
threads, evidence and human steering stacked below rather than in the prototype's own bands). `Topics` **is** a
**single-column stack of full-width cards** with a count-chip strip — the "counts that restate rows" pattern
the pre-pivot brief named — where its prototype shows **index + detail** (index ~320px, detail carrying a
two-column inner split). `People` **already has index + detail** (`.rd-split` + `.rd-index` + `PersonPanel`,
`src/ui.tsx:2313/2315/2336`); what it lacks is the detail's *inner* split and the prototype's index row
grammar, so its unit is smaller than this paragraph first implied. The prototype's `Overview` page (two
activity columns) has no counterpart; the landing view is the Topics card list. The acceptance checks measured
semantics, projections, structure and density; they never measured composition, and earlier reports should not
have implied they did. The owner's decision: **the prototypes are the target.**

> **Correction (2026-10-02, D1 — this paragraph was wrong about People).** It read: *"`Topics` and `People`
> are **single-column stacks of full-width cards**, each with a count-chip strip … where the prototypes show
> **index + detail**"*, and it attributed the three support cards to `.bottom-grid`. Both were wrong: People has
> rendered index + detail since C6 (confirmed in this pack's own capture `current-1440x900/people.png` and
> measured at 240 px index / 684 px detail, tops aligned, at 1280×800), and `.bottom-grid` is the two-column
> `Plan / Open problems` band while the three cards live in `.support-grid` (`progress.html:368–370`,
> `:474–476`). The reviewer's strategy inherited the People error and C2 was re-scoped accordingly; the errata
> are in `COMPOSITION.md` §1/§2/§C4 and `REVIEW.md` §3–§4. The original wording is quoted above and kept in the
> git history of this file.

## 3. Constraints any strategy must respect

- **The contract is frozen and published verbatim**; post-contract decisions live in `DECISIONS.md`. §4–§7
  are the rulings for this phase: Overview composition as **default-landing/shell behaviour** (no fifth nav
  item); the **always-present detail replaces the `Read topic` disclosure** while U6's substance stands
  (read-first, one card control, no broad editor plumbing, narrow note/correction); the shell title
  "Research overview" stays with **a per-view heading** beside it.
- **No new semantics.** Composition only: no new actions, projections, write paths or state. The existing
  payloads are the material.
- **Built in the U9 token set** (one type scale, one spacing scale, one surface per level, one quietness,
  exceptional colour reserved). The prototypes' CSS is reference material, not source: their column
  geometry and section order are the target, their styles are not.
- **Standing structural rules survive**: the `EntityTag` contract (a tag names an entity, navigates to its
  canonical view, writes nothing, renders only where the entity is named) and the rule that **a tag does not
  live inside an index row** — the prototypes comply; index rows carry counts, state and recency.
- **The harness is part of the deliverable.** Checks whose subject moves (the `Read topic` control checks, the
  U9 structural checks, the D7 read-first checks, `overview renders as the default screen`) are **coverage
  moves**, not deletions — the U6 lesson. Read passes are re-taken on **separate isolated instances per
  dataset**, both viewports, and the records change honestly rather than being reconciled to the old numbers
  (today: corpus `88 · 0 · 23`, fixture `112 · 0 · 0`).
- **The review UI is not to be trusted without a refresh.** Plugins are installed into the instance's config
  dir, not read from the checkout; `harness/install-plugin.mjs --reinstall` moves it, and a screenshot taken
  before that is a screenshot of an unknown build.

## 4. The live review service (for reproducing the comparison)

| | |
|---|---|
| Review URL | `http://<box>.<tailnet>.ts.net:3003/plugins/research-dashboard` — Vite dev web from `/mnt/otrais/repos/nakama`, tailnet-bound, proxying the dev Nakama on `127.0.0.1:4399`. Both halves are permanent enable-on-boot user units (`nakama-dev-instance.service`, `nakama-review-web.service`), so the surface survives a reboot |
| Served build | `0.2.0+dev.ae3049008d5f`, revision 329, `lifecycleState=enabled` — verified through that URL, not assumed |
| Not the review surface | the Docker instance on `:4310` answers *"This plugin isn't available"* and never carried the plugin (the estate README said otherwise; corrected) |

## 5. Evidence inventory

```
docs/ux-v2/fidelity/
  REVIEW.md                     the difference review, per view, with the deliberate non-differences
  current-1440x900/             topics, people, repositories, progress — captured from the review URL
  prototype-1440x900/           the five prototypes, viewport + full-page, same browser, same width
  side-by-side/                 labelled montages (prototype above, running UI below, build string in caption)
  REVIEW-PACKET.md              this file
harness/fidelity/               served-build.mjs · render-prototypes.mjs · montage.mjs · README.md
docs/ux-v2/contract/prototypes/ the approved prototypes themselves (topics, people, repositories, progress,
                                overview) — 5 pages, ~11–19 KB each, hand-written HTML
```

> **Generated artifacts (2026-10-04).** The `side-by-side/` montages and the per-pack prototype renders
> (`fixture/`, `fixture-tall/`) are **generated, not tracked** (AGENTS.md § *What is tracked*) and are no
> longer committed; the canonical `prototype-1440x900/` and `current-1440x900/` are. Rebuild the packs with the
> `harness/fidelity/` instruments (or `bun run preview:fidelity`); the reviewed bytes remain at the immutable
> tag `ux-v2-composition-complete`.

Caveats, stated so the review does not over-read the evidence: the app captures are **viewport** captures (the
app scrolls inside the host pane), so claims about what lies below the fold come from the DOM, not the image;
the review instance holds a small dataset (3 topics / 2 people / 3 repositories), so its cards are emptier
than the prototypes' — content sparsity is data, not composition.

## 6. Also parked, deliberately

**H1 keyboard-focus visibility** lives on branch `h1-keyboard-focus`, not on `main`. It is a working check with
two honest findings — no *visible* focus ring on the `Read topic` control and on an icon button, plus a crude
repeat/trap inference in the check itself — and it is parked because focus visibility should be validated
against the **final** composition, not an intermediate one. `main` stays clean.

## 7. Out of bounds for this review

Re-litigating the four-view decision, the data model, or the earlier UX-v2 units. This packet asks for one
thing: **how should the composition refactor be executed**, given the constraints in §3.
