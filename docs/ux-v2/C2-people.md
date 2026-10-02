# C2 — People composition refinement (opened 2026-10-02)

**Status: charter recorded, intake complete, increment 1 landed and verified on the C2 build**
(`0.2.0+dev.4232c4d6b68f`, revision 20, asset sha256
`1d3c9dcf98db9b19675242aaa010bddf37efdad56816c16de9e77e9e200897b9`). The later increments in the change map
are next; each lands with its own check, and the records follow the C1 pattern (one harness, one build, every
claim reproducible from a pushed transcript).

C2 is **a refinement on the C1 master/detail grammar, not a rebuild**. People already has an index and one
persistent detail; the work is to compose them the way Topics now is.

## Charter (reviewer, 2026-10-02)

1. improve the index-row grammar with recency/context;
2. add the inner detail split;
3. make **Current involvement** the dominant lane;
4. put **Recent activity / About / Related repositories** in the side rail;
5. do **not** invent a person-level role if the payload does not have one;
6. keep `Person.notes` as the factual About content;
7. preserve existing tag navigation and preselection behaviour.

## What exists today (verified by reading, with line references)

| piece | where | notes |
|---|---|---|
| `PeopleView` | `src/ui.tsx:2454` | index (`rd-index`) + one persistent `PersonPanel`; selection is an id, first row until another is picked |
| preselection | `src/ui.tsx:2473` | a person tag elsewhere navigates here **and selects**; keyed on `seq`; never overrides a reader's own click |
| index row | `src/ui.tsx:2506` | name + `involvementLine(entry)` — counts only ("3 active · 1 blocked · 4 axes · 2 topics"), **no recency, no context** |
| `involvementLine` | `src/ui.tsx:2189` | the counts line; shared by the index row and the panel header |
| `PersonPanel` | `src/ui.tsx:2334` | one flat `rd-form`: "Topics they are on" → per-topic `rd-involvement` rows → nested `rd-axes` of `AxisScanItem`s; then "Activity attributable to them"; then a last-activity/last-reviewed cluster |
| `AxisScanItem` | `src/ui.tsx:2207` | the flat 4-part axis row (badge+tag, kind, tags/where, blocker) — the C1 axis-row grammar is **not** used here |
| payload | `get_overview` only | there is **no person-level action**; `PersonRollup` (`src/store.ts:1177`) carries `person`, `attributable`, `topics[]`, `axes[]`, `axisCounts`, `recentActivity[]`, `lastActivityAt`, `lastReviewedAt` |
| `Person` | `src/store.ts:122` | `id`, `displayName`, `nakamaUserId`, `githubLogin`, **`notes`** |

### Intake findings that shape the work

- **`person.notes` is rendered nowhere today** (`grep -c "person.notes" src/ui.tsx` → 0). "About" is new
  content, not a relocation — and it is factual content, rendered as the person's own note.
- **`involvement.role` is topic-level, not person-level** (`src/ui.tsx:2381`; from the involvement record,
  alongside `topic.status`). It stays exactly as it is: this is precisely the role the payload has, and a
  person-level role would have to be invented. Nothing in C2 introduces one.
- **`lastActivityAt` is deliberately unwindowed** (`src/store.ts:2417`): someone whose last event was three
  weeks ago has not recorded nothing. It is the natural recency source for the index rows, so the rows keep
  that meaning.
- **`attributable: false` is a distinct fact** from "recorded nothing" and the panel says so in words
  (`data-rd-attributable="false"`). That must survive the restructure.
- **Existing hooks are load-bearing** — the harness already reads `[data-rd-people]`, `[data-rd-person]`,
  `[data-rd-person-id]`, `[data-rd-person-panel]`, `[data-rd-person-topics]`, `[data-rd-person-activity]`,
  `[data-rd-attributable]`, `[data-rd-involvement]`, `[data-rd-scan-axis]` (see `harness/verify-page.mjs`
  ~1801–1830). The restructure keeps every one of them.

## The change map

**Increment 1 — index rows (recency + context).** Give the row the same reading order the C1 index has:
identity, then what is on, then when. Recency comes from the unwindowed `lastActivityAt`; context is the
existing counts line plus the attributable fact where it is false (a person with no mapped account is not
idle, and the row should not read as though they were). `involvementLine` stays the counts source so the
index and the panel header cannot drift apart.

**Increment 2 — the inner split, with Current involvement dominant.** `PersonPanel` becomes an inner
`rd-split`: the dominant lane is the person's current involvement (their topics, and their own axes inside
each), subordinate is everything else. The axes inside it adopt the **C1 axis-row grammar** — the reading
first, references and history demoted behind `More on this axis` — rather than `AxisScanItem`'s four
equal-weight parts. The same discipline as C1 §7 applies: one dominant reading surface, and the lane's
dominance is a measured property, not a claim.

**Increment 3 — the side rail.** `Recent activity` bounded, with an explicit expansion (the C1
`RAIL_ACTIVITY_LEAD`-style window, and bounded by height as well as by row count), then `About` (the
person's own `notes`, verbatim), then `Related repositories` — the repositories their axes name, taken from
the payload they already hold. A tag that cannot be named from the payload is not rendered: inventing a name
is worse than a missing tag.

**Increment 4 — checks.** Each increment adds its assertion to `harness/verify-page.mjs` in the C1 mould:
the index row carries recency and context; the inner split has a dominant lane and a subordinate rail, with
the lane's geometry measurably dominating; the rail is bounded and its expansion is explicit; About renders
the person's own notes and nothing else; the `attributable: false` case still says so in words; and **tag
navigation plus preselection still land** (the existing check, unchanged, is the proof).

**Increment 5 — fidelity + records.** Regenerate the People captures and the side-by-side montage, and write
the C2 record in the shape of the C1 one: what was measured, on which build, with the transcripts committed.

## Invariants (unchanged by C2)

- No scoring, ranking or percentage anywhere — counts and recency only.
- One `StateBadge` rule; the `EntityTag` contract (a person tag selects *and* opens; an axis tag opens
  Progress's subview; a repository tag opens Repositories'); the topic tag in the panel keeps selecting the
  topic.
- Tag navigation and preselection behaviour is preserved, not reimplemented.
- No person-level role is invented. `Person.notes` is displayed as fact, never embellished into a bio.

## Increment 1 — landed and verified (2026-10-02)

**What changed.** The index row is now identity → what is on → *when*, with a marker on every segment:
`data-rd-person-context` on the counts line, and `data-rd-person-recency` carrying either the payload's own
`lastActivityAt`, `none`, or `unattributable`. The last segment is deliberately *when* and not *how much*:
recency is the unwindowed value, and a person with no mapped account shows the missing-link fact rather than a
claim about their activity — "no activity" would be a different and false statement. `involvementLine` remains
the single counts source, so the index row and the panel header cannot drift apart.

**What proves it.** A new check reads the rows from the DOM and compares them against the payload the page
itself fetched — no second opinion about the data, in the C1 mould:

```
PASS  every person index row carries its context, and its recency is the payload's own
      rows:     [ { context: "2 active · 1 blocked · 4 axes · 2 topics", name: "Fixture Alpha",
                    recency: "2026-10-01T15:25:00+03:00" },
                  { context: "1 active · 1 axis · 1 topic", name: "Fixture Zeta",
                    recency: "unattributable" } ]
      expected: [ ["Fixture Alpha", "2026-10-01T15:25:00+03:00"], ["Fixture Zeta", "unattributable"] ]
```

The fixture dataset is what makes that check worth anything: it carries both an attributable person with
activity *and* a person with no mapped account, so both branches of the grammar are exercised, while the
corpus can only show the first. `bun run check` (typecheck + build + tests) is green: 126 tests, 0 failures.

**Where it was measured.** On the durable fixture instance, after the whole loop — rebuild → vendor → restart
`nakama-fixture-instance.service` → reinstall → served-build guard **OK** on `1d3c9dcf…` (revision 20) — then
`fixture 1440×900`: **all checks passed, 0 skipped, exit 0**. This increment's artifacts went to scratch (via
the `SHOTS` / `TRANSCRIPT` overrides), so the committed C1 records at the canonical paths are untouched; the
C2 record set is taken when the unit's render work is complete.

**Infrastructure carried by this increment.** `harness/refresh.sh` took its unit and port from constants; it
now takes them from `NAKAMA_UNIT` / `NAKAMA_URL` exactly as it already took its env file, because the fixture
is a second instance on another port. A fixture refresh that restarted the corpus unit would report success
while the fixture kept serving the previous vendored bytes — and it logged in with the wrong instance's
credentials (HTTP 401), which is how the defect surfaced.

## Increments 2–4 — the inner split, the rail, and the checks (landed 2026-10-02)

**The inner split is C1's own grid, not a new one.** The panel body is now
`<div class="rd-detail-grid" data-rd-person-split>` — the composition unit the Topics detail already uses: a
`1fr` lane against a `minmax(250px, 0.6fr)` rail, `align-items: start`, stacking under 1000px. Inheriting the
grid is deliberate: the dominance rule (the lane at least 1.25× the rail) is then *the same rule*, not a
second set of numbers that can drift. Measured on the fixture at both reference viewports:

| viewport | lane | rail | ratio | tops |
|---|---|---|---|---|
| 1440×900 | 488.75 × 492.6 at x 597 | 293.25 × 366 at x 1097.75 | **1.67×** | both y 276 |
| 1280×800 | 372 × 579.1 at x 597 | 250 × 392 at x 981 | **1.49×** | both y 220 |

The rail lands exactly on its documented 250px floor at 1280, which is the clearest evidence that this is the
C1 grid and not a lookalike.

**The lane is Current involvement, and the row is the C1 grammar cut to what the payload can carry.** This is
the one place C2 had to make a judgement, and it is worth stating plainly: a C1 row's dominant element is its
current-state **reading**, and `AxisScan` holds no reading — no `currentState`, no `description`, no evidence.
It is a scan of the links (title, kind, state and its confidence, blocker, branch/PR, version, when it was last
touched, repositories), not the axis detail. So the person row's reading is the one narrative fact the rollup
does have about the axis's condition — **its blocker** — and where there is none the row says *"no blocker
recorded"* rather than inventing a sentence. Everything else is one quiet reference line (repository tags,
branch/PR) plus a `More on this axis` disclosure holding state confidence, version date and last review. There
are **no controls**: this panel has no write path, and a person's involvement row is a pointer to the axis, not
a copy of the axis's own lane. That is the reviewer's warning made structural — the check asserts the absence
of history, correction and evidence material in the default row, so the row cannot quietly grow into one.

**The rail is Recent activity, About, Related repositories**, in C1's own card grammar (`.rd-side-stack`,
`.rd-side-card`, `.rd-side-title`), and the activity list is bounded by *height* as well as by the
`RAIL_ACTIVITY_LEAD` window (`.rd-side-card .rd-activity`), with the remainder stated — `4 of 12 shown, newest
first` — and one click to have the rest. Two content rules the reviewer set are enforced by checks rather than
by intent: **About renders `Person.notes` verbatim or says there is none** (no generated prose, no inferred
role), and **Related repositories are exactly the repositories the payload's own axes name** — derived and
de-duplicated from the involvement already in hand, compared by id against the payload, never fetched again
and never guessed.

The four checks read the rows from the DOM and compare them against the payload the page itself fetched:

```
PASS  C2: the person detail is an inner split — lane left of a rail, lane materially wider, tops aligned
PASS  C2: the rail is Recent activity, About and Related repositories, in that order
PASS  C2: the default involvement row stays concise — a reading, and none of the axis lane's heavier material
PASS  C2: About is the person's own recorded note, verbatim — and says so when there is none
PASS  C2: About's other branch — a person with no note is told so, never given prose
PASS  C2: Related repositories are the ones the payload's own axes name — derived, not invented
```

The About card has two branches, so the check reads both: it selects the second person and re-reads, which is
why the six checks run as six and not as five plus an assumption.

## Found and left open: `Person.notes` cannot be set by any caller

The About card renders `Person.notes`, and the reviewer's charter says to keep it as the factual About content
— so the fixture was given a real note for one person (and none for the other), to exercise both branches. The
attempt failed, and the failure is informative:

- `harness/apply-layout-fixture.mjs` carrying `notes` on a person entry is rejected by the **host** as
  `HTTP 400 {"error":"invalid_input"}`. Validation is not the plugin's: `src/actions.ts` documents that the host
  validates input shape against the declared schema *before* the bundle runs, and the declaration is
  `nakama.plugin.json` — where both `reconcile_topic` person schemas say `"additionalProperties": false` and
  never listed `notes`.
- Declaring it there is not enough on its own: adding the field to both person item schemas made the host
  refuse the **whole manifest** (`reinstall refused (HTTP 400) {"error":"invalid_manifest"}`), from
  `validatePluginManifest` in the host (`apps/server/src/services/plugin-service.ts:2257`). Which rule the
  addition violated was not isolated before the changes were reverted — restoring the fixture was the priority,
  and the store had been emptied by a wipe in that same run.
- The store layer is ready and always was: `resolvePersonForLink` and `upsertPerson` both accept and persist
  `notes`, and both reconcile call sites pass the person entry through verbatim. The field is missing only at
  the caller-facing schema.

**Consequence, stated honestly:** on both datasets the About card renders its *empty* branch, because nothing
can put a note on a person. The check proves what the page does with a note it holds (`""` → the honest
sentence, and a real note → the note itself, text-compared against the payload), but the non-empty branch is
currently unreachable in a running instance. Making it reachable needs the host's manifest rules read properly
— the two constants above are the entry points — and that is a data-surface change, not a composition one, so
it is reported rather than smuggled into C2.

## C2 records — one harness, one build (2026-10-02)

Build: **revision 463 / `0.2.0+dev.7950867bd0fa`**, served asset sha256
`e52d9c113f57dc3cc189f163ca5f069094832c8f3bbbfd0a7a673e5985f41025`. Both instances were refreshed onto it
before any record was taken, so all five records name one build.

| record | result |
|---|---|
| fixture 1440×900 | all checks passed · 0 skipped |
| fixture 1280×800 | all checks passed · 1 skipped |
| corpus 1440×900 | all checks passed · 24 skipped |
| corpus 1280×800 | all checks passed · 25 skipped |
| corpus 1440×900 `--write` | all checks passed · 24 skipped |

`bun run check` (typecheck + build + tests): **126 tests, 0 failures.** After the write pass the corpus instance
was wiped and re-seeded through the plugin's own action surface (695/695 calls) and its store is clean.

**The two skip counts, stated plainly.** The fixture's single skip is the first-screen rail assertion at a
non-reference viewport — the same one C1 documented. The corpus gains exactly one skip over C1's set because
**the corpus holds a single person** (`ajegorovs`): `C2: About's other branch` skips with that reason rather
than failing, and the fixture is what covers it, since it carries a second person.

**One defect found by looking at the capture, not by a check.** The first capture showed an orphan `blocker`
label under every "no blocker recorded" reading: the reading rendered its claim, then the label and an empty
confidence badge regardless of whether a blocker existed. It renders the claim with its label and badge only
when there is a blocker now, and one muted sentence when there is not. The records above are from after that
fix, and no check would have caught it — the reading was present and non-empty either way, which is the
argument for looking at the picture rather than only at the assertions.

**C1's records are preserved beside the new ones.** `docs/corpus/verify-*.txt.revision-442.txt` and
`docs/layout-fixtures/verify-fixture-read-*.txt.revision-442.txt` hold the accepted C1 build's records at the
same paths the C2 set now occupies, so both eras stay on disk rather than only the newer one.
