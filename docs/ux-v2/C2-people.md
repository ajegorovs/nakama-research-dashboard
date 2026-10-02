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
