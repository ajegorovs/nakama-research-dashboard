# Traced action input limits

The harness refuses an out-of-contract payload **before** it is sent. That is only meaningful if the
limits it enforces are the host's real limits, so this file records where each number was read. The host
still validates; these are a bound check, not a substitute.

`limits.mjs` is the executable copy of everything below and is covered by
`nakama-e2e.test.mjs` ("traced reconcile input limits").

## Source anchors

| What | Where (read at implementation time) |
|---|---|
| Declared schema the host validates first | `nakama.plugin.json` |
| `reconcile_topic` inputSchema | `nakama.plugin.json:122-639` |
| `get_topic` inputSchema | `nakama.plugin.json:46-85` |
| `record_activity` inputSchema | `nakama.plugin.json:648-709` |
| Host-side re-checks (text/int/enum, extra bounds) | `src/actions.ts:67-131`, `:155-165`, `:185-193` |
| Store shape the write path accepts | `src/store.ts:968-1068` (`ReconcileTopicInput`) |
| The write path itself (order of processing) | `src/store.ts:5426-5801` |

## reconcile_topic (the single write path)

Top level: `topicId ≤100`, `topicName ≤120`, `expectedVersion ≥1`. `additionalProperties: false` — an
unknown key is refused (this is what stops `actor`/`databasePath` from being smuggled in).

| Field | Bound |
|---|---|
| `topic.name` | 1–120 |
| `topic.description`, `topic.summary` | ≤ 4000 |
| `repositories[]` | ≤ 20 items; `fullName` 1–200, `url` ≤500, `description` ≤1000, `defaultBranch` ≤120 |
| `people[]` | ≤ 20 items; `displayName` 1–120, `role` ≤80, `githubLogin` ≤100, `nakamaUserId` 1–100 |
| `axes[]` | ≤ 20 items; `title` 1–160, `description` ≤2000, `branch` ≤200, `prUrl` ≤500, `currentState` ≤2000, `blocker` ≤1000 |
| `axes[].repositories[]`, `axes[].people[]` | ≤ 10 items each |
| `activities[]` | ≤ 50 items; `summary` 1–1000, `sourceRef` ≤200, `sourceUrl` ≤500, `occurredAt` ≤40 |
| `annotations[]` | ≤ 20 items; `text` 1–2000 |
| `problems[]` | ≤ 25 items; `statement` 1–2000, `repositoryFullNames[]` ≤20, `personIds[]` ≤50 |
| `plans[]` | ≤ 10 items; `summary` 1–2000; `steps[]` ≤50, `title` 1–300 |
| `transitions[]` | ≤ 25 items; `toState` 1–40, `blocker` ≤500 |

Enumerations enforced by the schema: `topic.status` `active|paused|completed|archived`;
axis `kind` `feature|experiment|test|investigation|maintenance`; axis `state`
`active|usable|draft|blocked|parked|completed|abandoned`; confidences
`confirmed|inferred|uncertain`; activity `sourceType` `manual|github_pr|github_commit|github_issue|
repo_document|group_chat|experiment|agent_review`; annotation `kind` `note|interpretation|steering`;
problem `state` `open|resolved`.

## Behavioural (not schema) rules the seeder must respect

These are not size limits; they are ordering/identity rules that the artifact and seeder are shaped around
(`src/store.ts:5426-5801`):

- **Processing order is activities → annotations → problems → transitions.** An activity that names a
  `problemId` therefore cannot be sent in the same call that creates the problem (the foreign key would not
  exist yet). The seeder does phase 1 (topic/axes/plans/non-problem facts/problems) then phase 2 (the
  problem-named activity and the problem-scoped steering note) — see `artifact.mjs`.
- **A `confirmed` axis claim must be backed by evidence in the same call** (a branch, a PR, an activity or
  an annotation), else `reconcile_topic` refuses (`store.ts:6540-6570`). `FIX-AXIS-CLEAN` is `confirmed`
  and carries a branch + PR, so it is seeded as-is.
- **The author is host-derived.** The manifest's annotation item has **no** `authorType` field, and the
  store falls back to the acting session (`store.ts:5604-5608,5633`). The seeder never sets an author, so
  the F-3 disagreeing notes are legitimately authored by the one authenticated human.
- **A topic-wide steering note is not expressible.** `reconcile_topic` annotations carry
  `axisId|axisTitle|problemId` but no `topicId`; the artifact lists `FIX-ANN-TOPIC-STEER` under `omitted`
  rather than seeding it through an untraced path.

## get_topic (read options)

`topicId ≤100`, `topicName ≤120`, `historyLimit` 1–100, `notesLimit` 1–100, `activityLimit` 1–100,
`activitySinceDays` 1–365, `includeAnnotations` boolean. The `notesLimit` cap is the **coverage mechanic**
for N-4/N-5: a note list returned at the cap means axis-note coverage is UNKNOWN, so a missing note is not
evidence of absence.

## record_activity

`topicId ≤100`, `topicName ≤120`, `axisId ≤100`, `axisTitle ≤160`, `summary` 1–1000 (required),
`sourceRef ≤200`, `sourceUrl ≤500`, `occurredAt ≤40`, `repositoryFullName` 1–200.
