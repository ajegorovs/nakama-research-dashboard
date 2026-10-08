# WP2 — Retained-fixture relationship delta (F01, F02, F04)

> **Status: WP2 executed, read-only, task-authorized.** This record analyses the **stored
> relationships** of the retained public-research fixture for the three link findings — **F01** (the
> product repository shows no work), **F02** (the person carries no infrastructure axes) and **F04**
> (the consultation axis lacks evidence; its two problems lack repositories) — and states a
> **deduplicated before/after link delta proposal** with sources. It **corrects nothing**: no fixture
> write, no amendment packet (WP4), no baseline seed (WP3), no checks (WP5), no mutation gate (WP-G),
> no product/UI change and no merge.
>
> **Authorization.** The dispatching brief authorized **WP2 read-only**. The WP1 gate
> ([`public-research-fixture-findings.md`](public-research-fixture-findings.md) §F) had recorded WP2 as
> "prepared but NOT authorized"; this session treats the brief as that authorization and states the
> boundary rather than re-litigating it.
>
> **Reviewer qualification (appended 2026-10-08).** The analysis below stands **tested at the original
> WP2 head `fa2638ec69c2063a6a11d640ac11b7427eb72a35`** and is **preserved as written**; the external
> reviewer's verdict is applied in **§9** and in the structured evidence. **All six candidate pairs
> (D1–D6) are accepted**; the **D1/D2 axis→repository role is left `null`/undecided** (not
> `supporting`, not `primary`); D3/D4 are **source-backed enrichments**, not a restoration of the
> original packet (which named the person on axes 1–4 only); the evidence
> **move/duplicate/reassociate strategy remains undecided**; and **no WP3/WP4 is authorized**.
>
> **Scope: read-only.** The only non-`GET` calls are the login and the session-selection
> `POST /v1/auth/active-org` (session-selection state only, no domain mutation). Verification used the
> three read actions (`get_overview`, `get_topic` topic-wide and scoped, `search_dashboard`) over
> direct HTTP against the explicit target org, plus `git`/`git show` reads at the frozen pin. No
> `reconcile_topic` / `record_activity`, no inference, no service change, no deploy.
>
> **Sanitization.** Loopback endpoints (`127.0.0.1:…`) are kept verbatim. The target organization's
> id/name, the recorder actor id and host-specific absolute paths are **withheld** (`<targetOrg>`,
> `<recorder actor>`). Fixture-internal record ids are referred to by **semantic label**; the raw ids
> live only in the git-ignored local scratch batches. Public GitHub owner/repo slugs, public
> commit/PR refs and the frozen pins are public and kept. Complete machine-readable detail is in
> [`wp2-public-research-fixture-relationship-delta-evidence.json`](wp2-public-research-fixture-relationship-delta-evidence.json).

## 1. Method and sources

- **Current fixture readback (measured, this run).** `get_overview` + two topic-wide `get_topic` +
  one scoped `get_topic` per axis (6) + seven `search_dashboard` queries. Every call returned
  **HTTP 200** and `result.ok: true` from the unwrapped `{ invocationId, result }` envelope; the
  target org was selected **explicitly** with `x-org-id` (never `orgs[0]`) and CSRF was carried as
  `x-csrf-token` = the `nakama_csrf` cookie. Nothing was inferred: an absent link is an absent row,
  never a display filter.
- **Frozen pins.** UDV `841964d4…`, Grablink `e6f83b2f…`, Dashboard `95ec34e5…` (this product).
- **Product contract.** `src/actions.ts`, `src/store.ts`, `nakama.plugin.json`, `migrations/002`,
  `migrations/004`. Local digests equal the frozen pin, so every line reference below is valid at the
  pin and at HEAD.
- **Seed packet.** `docs/plans/2026-10-07-public-research-fixture-five-tool-exercise.md` §5 (the
  intended structure: topic 2 "Research infrastructure / team management" — primary **Dashboard**).
- Raw batches: `.hermes/scratch/wp2-raw-*.json` (local, git-ignored).

## 2. Stored relationships vs projections — the decisive distinction

The findings are **absent stored rows**, not UI filters. The relationship model is a set of link
tables, and every read is a projection over them:

| Link | Table | Written by | Read as |
|---|---|---|---|
| axis ↔ repository | `axis_repositories` (`002:131`) | `reconcile_topic.axes[].repositories[]` (`store.ts:5778-5790`) | `axis.repositories`; repository rollup |
| axis ↔ person | `axis_people` (`002:142`) | `reconcile_topic.axes[].people[]` (`store.ts:5791-5801`) | person `axes` (`store.ts:3290-3318`) |
| topic ↔ person | `topic_people` (`002:84`) | `reconcile_topic.people[]` (`store.ts:5724-5735`) | person `topics` |
| topic ↔ repository | `topic_repositories` (`002:56`) | `reconcile_topic.repositories[]` (`store.ts:5736-5748`) | `topic.repositories` |
| problem ↔ repository | `problem_repositories` (`004:185`) | `reconcile_topic.problems[].repositoryFullNames[]` (`store.ts:4845-4848`) | `problem.repositories` |
| event → repository (direct) | `activities.repository_id` (`004:352`) | activity write | repository activity — **NULL in this fixture** |
| event → problem | `activities.problem_id` (`004:351`) | `reconcile_topic.activities[].problemId` (F14a) | problem evidence |

**Event→repository attribution is indirect through the axis.** An event recorded against an axis
belongs to the repository that axis names even when `activities.repository_id` is `NULL`
(`store.ts:3355-3394`; the last-activity join at `store.ts:3411-3419` joins `activities` to
`axis_repositories` on `axis_id`). So once an infra axis **names** the dashboard repository, the three
commit events already on that axis attribute to the repository **without editing any event row** —
a direct `repository_id` on each event would be a needless duplicate of the same fact. The commit
provenance is real: `95ec34e` (the frozen pin), `da7996b` and `5a62749` are all commits of
`ajegorovs/nakama-research-dashboard`, git-verified.

## 3. Measured before-state (relevant links)

- **Topics (v1).** "Research infrastructure / team management" → repository **Dashboard (primary)**,
  person *Aleksandrs Jegorovs*. "Experimental research" → **UDV (primary)**, **Grablink
  (supporting)**, person *Aleksandrs Jegorovs*.
- **Infra axes (both v1, `usable`).** "Research dashboard and focused retrieval": `repositories: []`,
  `people: []`, 3 commit events (`95ec34e`, `da7996b`, `5a62749`). "Agent consultation and automation
  evidence": `repositories: []`, `people: []`, **0 events**, 2 open problems.
- **Experimental axes (all v1).** Each names its repository (`supporting`) and the person; the
  diagnostics axis's problem names Grablink.
- **Person (v1).** *Aleksandrs Jegorovs* (`githubLogin ajegorovs`, `nakamaUserId: null`,
  `attributable: false`): 4 experimental axes only; infra **topic** membership present with `axes: []`.
- **Events.** All `repository_id: NULL`, `problem_id: NULL`, `sourceUrl: ''`, `actorType: 'agent'`,
  single `<recorder actor>`.
- **Repositories.** Three, all with `url/description/defaultBranch: ''` (F07 — out of this delta).

## 4. Candidate delta — deduplicated before → after

Six **candidate link-adds**, all objects pre-existing (0 new repositories, 0 new people). Each pair is
verified **absent** today (no duplicate). **No move/duplicate/reassociate strategy is chosen** — this
is a proposal for WP4/WP-G.

| # | Finding | Subject | Predicate | Object | Source |
|---|---|---|---|---|---|
| D1 | F01 | axis *Research dashboard and focused retrieval* | names repository | `ajegorovs/nakama-research-dashboard` | its 3 commit events are commits of that repo (git-verified); parent topic primary repo = Dashboard |
| D2 | F01 | axis *Agent consultation and automation evidence* | names repository | `ajegorovs/nakama-research-dashboard` | its 2 problems' records live in that repo; commit `5a62749` records the stage; parent topic primary repo |
| D3 | F02 | axis *Research dashboard and focused retrieval* | names person | *Aleksandrs Jegorovs* (`ajegorovs`) | the axis's 3 commits are authored by `ajegorovs`; person already a topic member |
| D4 | F02 | axis *Agent consultation and automation evidence* | names person | *Aleksandrs Jegorovs* (`ajegorovs`) | person is a topic member; recording commit authored by `ajegorovs` |
| D5 | F04 | problem *N-7 automation completes…* | names repository | `ajegorovs/nakama-research-dashboard` | problem describes the dashboard consultation stage, recorded in that repo |
| D6 | F04 | problem *Normal assigned `research-coordinator` skill loading…* | names repository | `ajegorovs/nakama-research-dashboard` | same stage records / product-skill-loading subject |

**Candidate relationship value** for D1/D2 is **`null` / undecided** (reviewer qualification
2026-10-08 — §9). It is **not** `supporting` and **not** `primary`: the experimental axes'
`axis_repositories` rows happen to use `supporting` and the topic→repository rows use `primary`, but a
fixture default, or another fixture link, **does not establish the semantics** of this axis's link.
Promoting it to `primary` would read a **one-primary** implication out of a topic-level fact (the infra
topic already names Dashboard `primary`) and is likewise **not** source-established. The role is left
to **WP4 / human approval**.

### 4.1 F04 separately — repository omission, sibling evidence location, candidate relationship

- **Repository omission.** Both consultation-axis problems have `repositories: []` — no
  `problem_repositories` rows — so they are unattributable to a codebase (F04).
- **Sibling evidence location.** The evidence that would back them already exists as the
  `github_commit 5a62749` event on the **sibling** axis *Research dashboard and focused retrieval*
  (plus that axis's two other commit events). The consultation axis itself has **zero** events. The
  content is therefore **not omitted** — its evidence sits on the sibling axis.
- **Candidate needed relationship.** problem *N-7* → **Dashboard** and problem *skill-loading* →
  **Dashboard**, via `reconcile_topic.problems[].repositoryFullNames`. Whether to additionally record
  or move the sibling evidence onto the consultation axis is **not decided here**.

### 4.2 Counts (actual dedup)

`candidate_adds = 6` (2 axis-repository + 2 axis-person + 2 problem-repository);
`new_repositories_created = 0`, `new_people_created = 0`,
`candidate_pairs_already_present = 0`. All six objects already exist; only link rows are candidates.

## 5. Unchanged objects (must not be disturbed by any future amendment)

Topic→repository links (infra→Dashboard *primary*; experimental→UDV *primary*, →Grablink
*supporting*); both topics' person links; the four experimental axes' repository and people links;
the diagnostics problem→Grablink link; the three infra commit events (their `repository_id` stays
`NULL` — attribution is indirect); and every record version (all v1) before any write.

## 6. Limitations for WP4 mechanics

- **Axis links** are additive: pass the **existing** axis id with `expectedVersion = 1` inside
  `reconcile_topic`; `linkRepository` upserts on conflict (`store.ts:5783, 5796-5800`).
- **Person reuse.** `reconcile_topic.axes[].people[]` goes through `resolvePersonForLink`
  (`store.ts:6362-6386`): a person with `nakamaUserId: null` is reused by `github_login`
  (`ajegorovs`) or, when a name is unique, by `display_name`. The account mapping is still absent, so
  `attributable` stays `false`.
- **Problem repo links REPLACE the set.** `updateProblem` → `replaceProblemRepositories`
  (`store.ts:4845-4848`), and the manifest requires `statement` on every `problems[]` item, so the
  exact intended `repositoryFullNames` and the verbatim statement must be sent.
- **Problem state** cannot be changed through `problems[]` on an update (`store.ts:5931-5938`);
  only via `transitions[]` — not needed for these links.
- `reconcile_topic` is per-topic atomic; the D1/D3 infra links are one transaction in the infra topic.
- **F14a evidence links** (`reconcile_topic.activities[].problemId`) are a supported but **unused**
  capability (zero event→problem links today); whether to add problem *evidence* in addition to
  problem *repository* links is a WP4 decision, outside this delta.
- **F09b:** the repository model carries no pin field, so the dashboard pin cannot be stored as
  first-class repository state; it rides the evidence manifest only.

## 7. Uncertainty (stated, not papered over)

- Axis-level repository attribution for the two infra axes rests on the topic's primary repo **plus
  the commits' own provenance** — the seed packet does not spell out an axis-level repository for
  axis 5 ("product shared").
- D4 (axis-6 person) is the weakest candidate: no axis-local event; basis is topic membership plus
  the recording commit's authorship.
- The D1/D2 relationship value is **`null`/undecided** — **not** `supporting`, **not** `primary`; the
  role is a **WP4 / human** decision (§9). A fixture default or another fixture link does not establish
  the semantics, and a `primary` promotion would import a one-primary implication the source does not
  state for these axes.
- **This is a delta proposal only.** Move/duplicate/reassociate strategy, wording and approval are
  WP4/human decisions.

## 8. Boundaries

- **Read-only.** No fixture/domain write, no `reconcile_topic`/`record_activity`, no inference, no
  service change, no deploy, no product/UI edit, no fixture repair, no merge.
- **This is WP2 analysis, not authorization for WP3/WP4/WP5/WP-G.**
- The findings ledger is **preserved**; the WP2 disposition is **appended** (§G), not rewritten.

## 9. Reviewer qualification of the accepted delta (appended 2026-10-08)

> **Appended, not an amendment — and not a verbatim transcript.** §1–§8 above are preserved as the
> analysis **tested at the original WP2 head `fa2638ec69c2063a6a11d640ac11b7427eb72a35`**. This section
> records the external reviewer's **qualification of the accepted delta**; the verdict line is exact and
> the qualifications are **summarized**, and must not be quoted as the reviewer's own words.
> **Docs-only.** No fixture write, no product/UI/service change, no inference, no WP3/WP4 design, no
> merge; the only verification was the GitHub commit API for **exact identity/source** of three named
> commits (no expanded research).

**Verdict: ACCEPT all six candidate link-adds (D1–D6), with the qualifications below.** The six pairs
are accepted; two decision items remain **unresolved** for **WP4 / human approval** and are **not**
silently resolved.

### 9.1 D1/D2 — the axis→repository role is NOT established

The axis→repository **relationship value is `null` / undecided**. It is **not** `supporting` and
**not** `primary`.

- **A default, or another fixture link, does not establish the semantics.** The experimental axes'
  `axis_repositories` rows happen to use `supporting`, and the topic→repository rows use `primary`, but
  copying either value would assert a semantic the source does not state for these two infra axes.
- **A `primary` promotion is not source-established either.** The source carries a **one-primary**
  implication — a topic names one primary repository, and the infra topic already names Dashboard
  `primary` — so promoting an axis link to `primary` would read a rule out of a topic-level fact. It is
  refused as a substitute.
- **Resolution:** the role is left for **WP4 / human approval**; the delta records the pair with the
  role field **unset**.

### 9.2 D3/D4 — source-backed enrichments, not a restoration

D3/D4 are **source-backed enrichments** of the retained fixture, **not** a restoration of an original
packet value: the **seed packet named the person only on axes 1–4** and stated no axis-level person for
the infra axes. The add is justified by **source**, not by the packet.

**Identity basis — exact, public, API-verified; no author-name equivalence.** The fixture person's
`githubLogin` is `ajegorovs`. Each of the three infra commit events was **independently resolved
through the GitHub commit API** at the frozen repository `ajegorovs/nakama-research-dashboard`, and its
**`author.login`** is `ajegorovs` for every commit:

| Commit (short → full) | GitHub `author.login` | `commit.author.name` | date |
|---|---|---|---|
| `95ec34e` → `95ec34e5d24240c7ac92c384cff5d5658ebb8761` | `ajegorovs` | `ajegorovs` | 2026-10-07 |
| `da7996b` → `da7996b6143f918ca590a79649aba831151b4dca` | `ajegorovs` | `ajegorovs` | 2026-10-07 |
| `5a62749` → `5a6274918c92d8c6a539349d3549dde045c3985f` | `ajegorovs` | `ajegorovs` | 2026-10-07 |

The established basis is **fixture `githubLogin` = GitHub `author.login`**, scoped to these three exact
commits in this exact frozen repository. The git **author *name*** also reads `ajegorovs`, but a name is
freely settable and is **not equivalent** to the account login — **no author-name equivalence** is
claimed. **No expanded research:** only these commits' identity/source were queried.

### 9.3 D4 — the strongest chain, stated precisely

D4 is the **stronger** of the D3/D4 pair, on an exact chain rather than a generic one. This
**supersedes §7's "D4 … weakest candidate" label**, which rested only on the absence of an axis-local
event — the author-route chain below is exact:

- **fixture `githubLogin` (`ajegorovs`) = GitHub `author.login`** of commit
  `5a6274918c92d8c6a539349d3549dde045c3985f` in `ajegorovs/nakama-research-dashboard` (API-verified);
- that commit **contains the exact consultation stage/acceptance**: its tree carries
  `docs/reviews/2026-10-07-agent-consultation-and-focused-retrieval-stage-report.md` and
  `docs/reviews/2026-10-07-agent-consultation-and-focused-retrieval-acceptance-record.md` — the material
  the consultation-axis problems are about (N-7 automation-completes; normal assigned
  `research-coordinator` skill loading), both **represented on axis 6**;
- **topic membership is corroboration, not the primary basis**: the person is linked to the parent
  topic, which supports the link but does not by itself establish it; the **author-route chain above is
  the primary basis**.

### 9.4 Unchanged — and the accepted disposition

The **move / duplicate / reassociate strategy remains undecided** (as in §4.1 and §6); the six
`candidate_adds`, the dedup counts (0 new repositories, 0 new people, 0 already-present pairs) and the
unchanged-object list are unchanged. **Accepted-disposition summary:** six pairs accepted; **two
unresolved role decisions** (D1, D2); **identity basis confirmed** (`githubLogin` = `author.login`);
**author route proof** recorded; evidence strategy undecided. **This qualification authors no write and
authorizes no WP3/WP4/WP5/WP-G.**
