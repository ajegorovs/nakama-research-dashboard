# U9 — the density and emphasis pass (executed)

**Status:** executed · read pass re-recorded from this build · parent `7c8a4ed`
**Scope:** the conservative polish list — hierarchy and spacing, pale-box monotony, primary vs secondary,
activity and recency, tags that wrap, exceptional states, and the 1280×800 reference. Presentation only: no
contract change, no model change, and no new product behaviour beyond **one control for the Activity column's
own window** (below), which the density acceptance required.

## 1. What the pass measured before it changed anything

The vocabulary had drifted, and the drift was measurable rather than a matter of taste:

| what | found | why it reads as noise |
|---|---|---|
| type sizes | `10px · 11px · 12px · 13px · 0.85em` (5 values) | four of them within 3px — a hierarchy you cannot see |
| gaps | `2 · 4 · 6 · 8 · 10 · 12 · 14px` (7 values) | spacing that is *nearly* consistent reads as careless |
| opacity | `0.55 · 0.6 · 0.65 · 0.75 · 0.8` (5 values) | five flavours of "quieter" is no quietness at all |
| exceptional colour | 12 uses | counts, "no evidence", an uncertain confidence were all painted like a failure |
| `.rd-strong` | **no CSS rule at all** | the line that answers the question rendered identically to its own provenance |
| the one inline-styled heading | `<h2 style={{ margin: 0 }}>` | the page title was the only heading not on the scale |
| Progress at 1280×800 | **13,071px of content — 16 screens** | the Activity column alone was 10,792px: every event in the window, uncapped (one corpus axis carries 50 rows) |
| bordered chips/blocks on Progress | 229, against 23–27 on the other views | the "pale box on pale box" complaint, counted |

Measured with a read-only probe (logs in through the page's own fetch, walks the DOM, prints numbers; never
prints credentials) against the corpus instance at 1280×800, both before and after this pass.

## 2. What changed

- **One type scale, in tokens**: `--rd-label` 11 · `--rd-meta` 12 · `--rd-body` 13, with the host card title
  above them. 75 declarations now use the tokens instead of literals.
- **One spacing scale**: three gap tiers (`2 / 4 / 8 / 12`) replacing seven literals; the two largest
  tighten, which is also the axis the 1280×800 complaint pointed at.
- **One quietness**: `--rd-quiet` replaces five opacity literals.
- **One surface per level**: the axis block and the Progress Problem card were boxes nested inside the
  card's box; they are now the same left rule the axis and activity rows already use. A refusal banner is
  still a box — it is transient and its whole job is to be noticed — and that exception is written into the
  check, not left implicit.
- **The exceptional colour is reserved for the exceptional state**: removed from a count, from "blocked by"
  text, from an uncertain confidence and from "no evidence on record" (the words carry those); kept on the
  blocked badge, the error line, the conflict banner and the three state borders where a blocked axis is
  read.
- **The primary line reads as primary**: `.rd-strong { font-weight: 600 }` — it had no rule at all.
- **The page title joins the scale**: `.rd-page-title` replaces the one inline style.
- **The Activity column leads with the newest and states the rest**: `FEED_LEAD = 12` rows, then
  "12 of 50 shown, newest first" and one control (`Show all 50` / `Show fewer`) that governs the column's
  own window. The rows are the same rows and the count is the projection's own — capping what is *shown* is
  a reading decision, and nothing is lost silently because the page says how many it holds back.

## 3. What it measures now (corpus, 1280×800, content height)

| view | before | after |
|---|---|---|
| Topics (the default recency-first surface) | 744px | 744px |
| **Progress** | **13,071px** | **4,363px** |
| People | 966px | 807px |
| Repositories | 992px | 820px |

The Activity column: 10,792px → 2,386px. Bordered chips/blocks on Progress: 229 → 77. The glance the U9
acceptance names — the Problem column **and** the newest Activity row — sits at 204px and 402px on a 900px
screen.

## 4. The checks added (five, both datasets, both viewports)

1. **one surface per level** — no boxed block nests inside another, except a refusal banner.
   *Catches:* a future inner box that reintroduces the pale-on-pale pattern.
2. **the exceptional colour is used only for the exceptional state** — read off whatever the theme resolves
   (the blocked badge's own colour), not a literal, and it SKIPs with that reason where no blocked state is
   on the view (the corpus renders none).
   *Catches:* the over-colouring this pass removed coming back on an ordinary fact.
3. **tags stay chips when they wrap** — one height per cluster, one line each, ≤32px.
   *Catches:* a long entity name changing the shape of its neighbours.
4. **no view runs away with the scroll** — a budget of eight screens of content per view, expressed in
   screens so it means the same thing at either recorded viewport.
   *Catches:* a return of the unbounded column (16 screens) without pinning the check to one pixel height.
5. **the Progress glance is inside the first screen** — the Problem column and the newest Activity row.
   *Catches:* a cap that pushes the newest activity off the first screen while looking tidy.

## 5. Coverage that moved (and why nothing was lost)

Capping the column changed the subject of three existing checks: they compared *every* projection event
against rendered rows. They now compare the window the page **states** it is showing, and require the
remainder to be stated — a page that rendered fewer rows than it claimed fails. Two tag-navigation checks
whose subject can sit outside the window now expand it **through the page's own control** (the reader's
click, not a back door) and the traversal collapses it again, so the checks that measure the default window
still measure the default window. The problem-tag check that first came back SKIPped was fixed this way
rather than accepted as a skip: the subject was reachable, so the check reaches it.

## 6. Open questions for the reviewer

- ~~The **U5 "Overview"** …~~ **Settled** (reviewer, 2026-10-02): there is no separate fifth destination. The
  implementation has four navigable views — Topics, People, Repositories, Progress — and "Research overview" is
  the dashboard shell/title, so the U9 measurements above name exactly the four views that exist and the
  recency-first surface is dashboard-shell behavior. Recorded as [`DECISIONS.md`](DECISIONS.md) §3, with the
  superseded wording in `README.md` annotated rather than rewritten.
- The visual outcome itself is the reviewer's call, not the harness's. The four new structural checks hold
  the rules; the screenshots under `docs/layout-fixtures/screenshots/{1280x800,1440x900}/`
  (regenerated by these runs — `dashboard.png`, `dashboard-detail.png`, `dashboard-progress.png`,
  `dashboard-problems.png`, `navigation.png`) are what remains a judgement.
