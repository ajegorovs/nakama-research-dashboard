# Visual fidelity review — the running review UI vs the approved prototypes

**Question asked (reviewer, 2026-10-02):** is the UI the owner is looking at the current build, and does that
build implement the approved prototypes? Do not treat harness green as fidelity.

**Answer, in two parts:** the review UI was serving a **two-chunk-old build** (now fixed), and after fixing it
the current build **does not reproduce the prototypes' page composition** in several views. Details below.

## 1. Which service, and what it was serving

| | |
|---|---|
| Review UI (the owner's URL) | `http://<box>.<tailnet>.ts.net:3003/plugins/research-dashboard` — Vite dev web from `/mnt/otrais/repos/nakama`, bound to the tailnet address, proxying the dev instance |
| Its backend | dev Nakama on `127.0.0.1:4399` (data root `/mnt/otrais/data/nakama-dev`) |
| Documented "Dashboard" in `services/nakama/README.md` | `http://<box>.<tailnet>.ts.net:4310` — the **Docker** instance, which answers **"This plugin isn't available"**: it has never carried this plugin. That README row is wrong for this plugin and is corrected. |

**Before:** the instance was serving `version 0.2.0+dev.f3eff70d4eae`, `revision 321` — a **pre-U6** build
(it still rendered `Add topic` / `Edit fields`, had no `.rd-page-title`, no Activity cap). The plugin *files*
in the checkout were current; the instance was not.

**Why a restart did not fix it:** plugins are **installed into the instance's config dir**
(`data/nakama-dev/plugins/research-dashboard/<version>/`, ~40 versions accumulated). The server loads that
installed copy, not the checkout — so restarting the dev instance reloaded the same stale copy. The UI asset
is served from the installed copy too (`/v1/plugins/ui/{orgId}/{pluginId}/{path}`).

**What was changed, exactly:**

1. stopped the stale server (`pid 492453` on `:4399`, started Wed Sep 30 18:36), started a fresh one as a
   transient user unit **`nakama-dev-instance.service`** (so it survives this session; Vite untouched, still
   tailnet-bound, so remote access is unchanged);
2. `bun harness/install-plugin.mjs --reinstall` against `:4399` — **`0.2.0+dev.f3eff70d4eae` rev 321 →
   `0.2.0+dev.ae3049008d5f` rev 329**, `lifecycleState=enabled`, organization data preserved. `--reinstall` is
   a new opt-in flag on that script: the default stays "report only", because an acceptance run must never
   change the build it is measuring;
3. verified through the owner's own URL: page title `Research overview` present, **no `Add topic`/`Edit
   fields`**, 21 tags rendered — the current build.

## 2. Method

Screenshots at **1440×900** from the review URL above (`current-1440x900/`), and the five approved prototypes
rendered in the same browser at the same viewport (`prototype-1440x900/`, files from
`docs/ux-v2/contract/prototypes/`). Side-by-side montages (prototype above, app below, labelled with the build
string) are in `side-by-side/`. The app scrolls inside a host pane, so app captures are **viewport** captures;
prototype captures include a full-page variant. Claims about what is "absent" are limited to the first screen
unless the DOM evidence says otherwise.

## 3. What differs, per view

### Topics — composition does not match
- **Prototype:** nav bar (Overview · Topics · People · Repositories · Progress), a **narrow left index** of
  compact topic rows (title · "3 current axes" · recency, `[STALE]` where quiet, `Add topic` at the foot), and a
  **wide detail card** holding a three-part inner composition: `CURRENT WORK` rows (state badge · bold axis
  title · summary · right-aligned ref chip) with `▸ Completed work (1)` folded, a right-hand `Recent activity`
  column, and `Notes` / `Related repositories` cards; `Add note / correction` at the card foot.
- **App:** a **single column of full-width cards**; no index pane, no per-card activity/notes column. Each card
  carries a **count chip strip** (`1 blocked` `1 active` `1 draft` `1 parked` `1 completed` `1 abandoned`) —
  the "counts that restate rows" pattern the pre-pivot brief named as a step-4 item — then state-prefixed axis
  lines, a one-line `Recent: 5 events · last activity yesterday`, and a `Read topic` button. Detail lives
  behind that button instead of beside the index.

### People — same class of difference
- **Prototype:** index of people (name · `@handle` · "2 topics · 3 current axes" · recency) beside a wide
  person card: name + handle + a **role/description line**, a topic chip row, `CURRENT INVOLVEMENT` blocks
  (topic · recency · bold axis · summary · ref chip), a right column with `Recent activity`, `About` prose and
  `Related repositories`.
  > **Correction (2026-10-02, D1).** No person-level role exists in the payload to fill that role line
  > (`Person` carries `notes`, not a role; roles live on the topic link, `PersonTopicInvolvement.role`), and
  > `Related repositories` is not on `PersonRollup` either — it is derivable in-view from the overview's person
  > rollups, and only while `peopleTruncated === false`. `About` **is** backed (`Person.notes`). Ruled: omit
  > the role line, render `About` from `notes`, never synthesize a bio from link roles.
- **App:** single column of full-width person cards; `@handle`, a count line (`4 active · 1 blocked · 7 axes ·
  3 topics`), then `TOPICS THEY ARE ON` and `ACTIVITY ATTRIBUTED TO THEM` as stacked lists. No index pane; no
  role line; the recency that the prototype puts top-right appears only as per-row text.

> **Correction (2026-10-02, D1 — this paragraph was wrong).** "Single column of full-width person cards … No
> index pane" is **false**, and it is the sentence the composition strategy's People verdict read off. People
> has rendered index + detail since C6: `PeopleView` is `rd-split` (`src/ui.tsx:2313`) with `ul.rd-index`
> (`:2315`) and `PersonPanel` (`:2336`), and this pack's own capture `current-1440x900/people.png` shows the
> index (ajegorovs / Fixture Zeta) beside the panel. Measured on the review URL: index 240 px left of a 684 px
> detail at 1280×800 (844 px at 1440×900), **tops aligned at both**. What People genuinely lacks is the
> detail's **inner** two-column split, an index **recency** column, and `About` / `Related repositories` — so
> C2 is grammar work, not construction. The paragraph above is kept as the historical record. The two
> corresponding statements elsewhere in this pack — `REVIEW-PACKET.md` §2 and `COMPOSITION.md` §2 — carry the
> same correction.

### Repositories — index/detail **is** present
- **Prototype:** index of repositories beside a detail card with a header tag row (topic · person · two axis
  chips), `CURRENT WORK` rows, and a right column of `Recent activity` / `Supports` / `People` / `Notes`.
- **App:** **index present** (3 repository rows) beside a detail card with the full name, description,
  `SUPPORTS` (topic · relational type), `CURRENT WORK` rows (topic chip · state badge · axis · refs · right
  qualifier) and `RECENT ACTIVITY` commit lines. Structurally aligned; the app is denser — commit subjects
  wrap to two lines and chip labels are long.

### Progress — content present, grouping different
- **Prototype:** `[Axes][Problems]` toggle above a left axis index (state badge · "2 open problems" · recency);
  detail = header (title · state · topic/axis/person chips · "2 days ago / last activity"), then `PROBLEM`
  (large statement + `CURRENT READING`), `PLAN / WORK PACKAGE` as a numbered step card, and a bottom band of
  three cards `Repository threads` / `Evidence` / `Human steering`; **right column** `ACTIVITY` feed and
  `OPEN PROBLEMS`.
- **App:** three equal columns — axis index | `Open problems (2)` | `Activity (11)` — with the plan, repository
  threads, evidence and steering stacked **below** rather than grouped in the same band beside the problem.
  Subview toggle present, but inside the global control band rather than above the index.

> **Correction (2026-10-02, D1/D3 — the prototype half of this paragraph was wrong).** The prototype does not
> put `OPEN PROBLEMS` in a right column, and the three-card band is not the same grid as the plan: read off the
> markup, `.bottom-grid` is **two** columns (`progress.html:368–370`) holding `Plan / work package` (`:735`) and
> `Open problems` (`:776`), while the three cards live in the separate `.support-grid` (`:474–476`,
> `repeat(3, minmax(0,1fr))`) → `Repository threads` (`:822`) / `Evidence` (`:841`) / `Human steering` (`:861`).
> `ACTIVITY` is the **top-grid's second cell** (`:694`, inside `.top-grid` at `:668`), sharing its row with the
> Problem card (`:670`) — not a full-height right rail. The App half of the paragraph above stands and is
> measured: at 1280 the index is 256 px, the Problem 363 px and the Activity rail ≈290 px — near-equal columns,
> which is exactly why "Problem left of Activity / Activity narrower" cannot be the geometry assertion (both
> already pass on this build).

### Overview — not built
- **Prototype:** `Overview` is its own page: a range control (`7d 14d 30d All`) and a `Refresh` button, then
  **two columns** — `Topic activity` (per-topic cards: description, state chip row, `LAST EVENT`, `Open topic
  →`, recency) and `Repository activity` (per-repo cards: name, description, `LAST EVENT`, "607 recorded events
  in the selected window", `Expand activity →`, recency), with a reference chip row at the foot.
- **App:** there is no Overview destination (settled: `DECISIONS.md` §3 — four views, "Research overview" is
  the shell). The landing view is the **Topics card list**, so the prototype's two-column topic/repository
  aggregation is **not implemented anywhere**.

### Not differences (deliberate)
- The host application chrome (Personal / New chat / Agent / … sidebar) is Nakama's shell, not this plugin's.
- The five-vs-four destinations is a decision, recorded, not drift.
- The app's global range control (`7 days · 14 days · 30 days · All time`), where the prototype shows it only
  on Overview.
- Content sparsity: the review instance holds 3 topics / 2 people / 3 repositories, so its cards are emptier
  than the prototype's. That is data, not composition.

## 4. Verdict

**No — the running build does not reproduce the approved prototypes' page composition.** The semantics the
harness proves (states, tags, refs, notes, projections, accessibility of the data) are present in the build;
the **page composition** the prototypes specify is only partly present: `Repositories` has index+detail, and
`Progress` has all the content but grouped differently; `Topics` **is** a single-column card stack with a
count-chip strip where the prototype shows index+detail; `People` has index+detail but lacks the detail's
inner split (corrected 2026-10-02 — see the correction under §3 People); the prototype's `Overview` page has no
counterpart.

The acceptance checks measured semantics, structure and density — they were never able to measure this, and
the earlier reports should not have implied they did.

## 5. Repairing the two documentation traps found on the way

1. `services/nakama/README.md` advertised `:4310` (the Docker instance) as the dashboard — corrected to say
   the review surface is the dev web behind the tailnet address, and that the Docker instance does not carry
   this plugin.
2. `harness/install-plugin.mjs` gained `--reinstall`, so refreshing a long-running review instance onto the
   vendored build is one documented command instead of an exercise in archaeology.
