# V2 plan — review request (delta only)

**For:** the reviewer who wrote [`2026-09-30-v2-structural-redesign.md`](2026-09-30-v2-structural-redesign.md).
**Our response:** [`../V2-PLAN.md`](../V2-PLAN.md) — the scope assessment, the verified platform facts,
and the eleven chunks. Nothing is implemented yet.

## What we are *not* asking

Please don't re-read §1–§6 of the plan. Your proposal's model is accepted as written (topics as the
organizational unit, development axes for concurrent work, repositories/people/activity as evidence),
the vocabulary is yours, the `reconcile_topic` single-call reconcile is the core of C3, annotations
replace an approval queue, and the 14-day window is a query parameter. Re-litigating that is not a
useful use of your time.

Where we **did** deviate, we say so below with the exact consequence — so you can object precisely
instead of re-deriving it.

## What we are asking (six items, all schema- or scope-shaped)

### 1. §2 `confidence` is one column per axis; §5 attaches it to a claim

§5's example marks *"Ready for live validation"* as inferred, with evidence, but the schema stores one
`confidence` for the whole row — so `state`, `current_state`, `blocker` and `people` share it.

- (a) as reviewed — one column; can't say "state confirmed, current_state inferred"
- (b) three columns — recommended:
  ```sql
  state_confidence         TEXT NOT NULL DEFAULT 'confirmed',
  current_state_confidence TEXT NOT NULL DEFAULT 'confirmed',
  blocker_confidence       TEXT NOT NULL DEFAULT 'confirmed',
  ```
- (c) an `axis_claims(id, axis_id, kind, text, confidence, evidence_ref, asserted_at)` table, with the
  axis keeping a denormalised "current" view — the only option that preserves *what was claimed when*

We recommend (b) now and (c) only if the librarian starts revising claims often.

### 2. §2 `development_axes.repository_id` allows one repository per axis

The premise of §1 is that work spans repositories, so this is the one place the schema is narrower than
the model. Recommended: add the join table, same shape as `topic_repositories`:

```sql
CREATE TABLE axis_repositories (
    axis_id       TEXT NOT NULL REFERENCES development_axes(id) ON DELETE CASCADE,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relationship  TEXT NOT NULL DEFAULT 'primary',
    PRIMARY KEY(axis_id, repository_id)
);
```

**Sub-question:** keep `repository_id` on the axis as the "display default", or drop it entirely? We'd
keep it only with an enforced rule that it must also be one of the links — otherwise the two can drift.

### 3. §2 `topics.status` has no vocabulary

Axes get six states; topics get `DEFAULT 'active'` and no list. We'd use
`active | paused | completed | archived` (a topic isn't "blocked" — its axes are). If you'd rather
topics reuse the axis vocabulary, say so.

Related decision we've taken: since the platform does **not** validate `inputSchema` (it is
documentation for the model — `PluginActionContribution.inputSchema: unknown`), the enums get `CHECK`
constraints in the DDL as well as constants in the store. That is the only place a bad value can be
stopped.

### 4. §15's migration needs a different mechanism than §2 implies

§2 does `CREATE TABLE activities`. That table already exists (`001-research.sql:16`), so 002 as written
**fails** with `table activities already exists`. Our fix keeps your intent: 002 renames the V1 pair to
`projects_v1` / `activities_v1`, creates the new schema, copies (`topic_id = old project_id`,
`axis_id = NULL`), and 003 drops the `_v1` tables once V2 is proven — the "copy, then stop reading
them, then remove them" sequence from §15. Object if you'd rather the new table be named
`activities_v2`; we preferred keeping the clean name on the live table.

Two smaller copy problems in the same area, both fixed in the plan: V1's `commit`/`document` source
types need a map onto `github_commit`/`repo_document`, and `recorded_at NOT NULL` has no V1 source
(backfilled from `occurred_at`).

### 5. §16.8 assumes evidence access the plugin does not have

§13's protocol steps 2–3 (inspect repositories, branches, PRs, commits, issues) require a capability
that is deferred to §16.10 — the last step of your own sequence. So the librarian rewrite is split:
**C9a** = tool surface + reading human annotations + reconciling from what the bound profile can
already see; **C9b** = evidence-driven reconciliation, blocked until the GitHub/repo work exists. C9a is
worded so it stops short of promising C9b's behaviour. Acceptable, or would you sequence it
differently?

### 6. §4's eight tools versus what `find_tools` can actually load

Measured: `find_tools` loads **at most 5 tools per call** (`packages/agent/src/tool-loop.ts:159`), and
the catalog of *every* exposed action key is embedded in the tool's description (`tool-loop.ts:74`).
Your eight tools therefore need two discovery round-trips. We're starting with eight and measuring the
agent's behaviour before consolidating (folding `register_person`/`register_repository` into
`reconcile_topic`'s payload would bring it to five). If you'd cut it to five now, we will.

## What a review cannot settle

Two risks in this plan are not reviewable, only measurable — C1 applies an irreversible migration to
existing data (we test it against a database built from 001 and take a file copy before the first
Reinstall), and C2's `busy_timeout` under genuinely concurrent writers is a number to observe, not
argue about. The acceptance criteria for both are commands, not opinions.

## How to reply

A GitHub issue on this repo, comments in a PR against these docs, or however you sent the last review —
whatever is least effort for you. Answers land in §7 of the plan, which is the resume point.
