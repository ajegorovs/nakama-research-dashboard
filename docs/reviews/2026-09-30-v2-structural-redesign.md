# External review — V2 structural redesign (2026-09-30)

**Status:** proposal, received for review before any implementation started.
**Scope:** the whole dashboard model — schema, action surface, UI, librarian behaviour.
**Our response and the resulting work packages:** [`../V2-PLAN.md`](../V2-PLAN.md).

Verbatim below, with these edits for this public repo: personal names and private-repository owners
are replaced with placeholders (`<person-a>`, `<group>/…`), and the illustrative topic, repository
and branch names are neutralised (`Signal Processing`, `Acquisition Automation`,
`<group>/processing-pipeline`) — the argument is structural, so the real names carry no value here
and only couple public code to internal research state. No other changes.

---

I'd proceed with **V2 as a structural redesign**, not a cosmetic update of the current `projects + activities` page.

## 1. V2 conceptual model

The hierarchy should be:

```text
Topic / research direction
├── brief description
├── people involved
├── related repositories
├── development axes
│   ├── feature / experiment / test / investigation / maintenance
│   ├── branch and PR where applicable
│   ├── people
│   ├── current state
│   ├── blocker
│   └── status
└── activity/history
```

A repository is supporting infrastructure, not the top-level organizational unit.

This solves the many-to-many relationship naturally:

```text
Topic A ──┬── Repo 1
          └── Repo 2

Topic B ───── Repo 1
```

So `processing-pipeline` can support both acquisition automation and signal-processing topics without duplication.

---

## 2. Proposed database schema

I would add a new migration, **never modify `001-research.sql`**.

Something like:

```sql
-- 002-coordination-model.sql

CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    summary TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX topics_name_unique
ON topics(name COLLATE NOCASE);


CREATE TABLE repositories (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    default_branch TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX repositories_full_name_unique
ON repositories(full_name COLLATE NOCASE);


CREATE TABLE topic_repositories (
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    relationship TEXT NOT NULL DEFAULT 'supporting',
    PRIMARY KEY(topic_id, repository_id)
);


CREATE TABLE people (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    nakama_user_id TEXT,
    github_login TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX people_nakama_user
ON people(nakama_user_id)
WHERE nakama_user_id IS NOT NULL;

CREATE UNIQUE INDEX people_github_login
ON people(github_login COLLATE NOCASE)
WHERE github_login IS NOT NULL;


CREATE TABLE topic_people (
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(topic_id, person_id)
);


CREATE TABLE development_axes (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',

    kind TEXT NOT NULL DEFAULT 'feature',
    state TEXT NOT NULL DEFAULT 'active',

    branch TEXT NOT NULL DEFAULT '',
    pr_number INTEGER,
    pr_url TEXT NOT NULL DEFAULT '',

    current_state TEXT NOT NULL DEFAULT '',
    blocker TEXT NOT NULL DEFAULT '',

    confidence TEXT NOT NULL DEFAULT 'confirmed',

    version INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_reviewed_at TEXT
);

CREATE INDEX axes_by_topic
ON development_axes(topic_id, updated_at DESC);

CREATE INDEX axes_by_repo
ON development_axes(repository_id);


CREATE TABLE axis_people (
    axis_id TEXT NOT NULL REFERENCES development_axes(id) ON DELETE CASCADE,
    person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT '',
    PRIMARY KEY(axis_id, person_id)
);


CREATE TABLE activities (
    id TEXT PRIMARY KEY,

    topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
    axis_id TEXT REFERENCES development_axes(id) ON DELETE CASCADE,
    repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,

    summary TEXT NOT NULL,

    source_type TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '',

    actor_type TEXT NOT NULL DEFAULT 'human',
    actor_id TEXT NOT NULL DEFAULT '',

    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL
);

CREATE INDEX activities_by_topic
ON activities(topic_id, occurred_at DESC);

CREATE INDEX activities_by_axis
ON activities(axis_id, occurred_at DESC);


CREATE TABLE annotations (
    id TEXT PRIMARY KEY,

    topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
    axis_id TEXT REFERENCES development_axes(id) ON DELETE CASCADE,

    text TEXT NOT NULL,

    author_type TEXT NOT NULL,
    author_id TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL
);
```

I would retire the old `projects` model gradually rather than trying to make it coexist forever.

---

## 3. Development-axis vocabulary

I would start with these types:

```text
feature
experiment
test
investigation
maintenance
```

and states:

```text
active
draft
blocked
parked
completed
abandoned
```

This covers your examples well.

A stale exploratory PR becomes:

```text
kind: experiment
state: parked
```

A draft PR intended for future work becomes:

```text
kind: feature
state: draft
```

A prototype unlikely to merge can remain:

```text
kind: experiment
state: active
```

without implying it will eventually become production code.

---

## 4. Don't expose every CRUD operation to the agent

This is important because Nakama's plugin tools are discovered through `find_tools`, and a huge action surface becomes cumbersome.

I would expose a **small semantic toolset**.

| Agent tool | Purpose |
|---|---|
| `get_overview` | Current topics, people, axes, blockers, recent activity |
| `get_topic` | Full state for one topic |
| `search_dashboard` | Resolve topic/person/repository/axis names |
| `reconcile_topic` | Apply a coherent librarian-produced update |
| `record_activity` | Record factual event |
| `add_annotation` | Human correction/context |
| `register_repository` | Add/link repository |
| `register_person` | Add/update identity mapping |

UI-specific editing actions can exist without `exposeAsTool: true`.

The most important action is `reconcile_topic`.

Rather than the librarian making ten calls such as:

```text
update axis
assign user
change blocker
add activity
change PR
...
```

it sends one coherent update:

```json
{
  "topicId": "...",
  "axes": [
    {
      "id": "...",
      "state": "active",
      "currentState": "Notebook implementation complete; live validation underway",
      "branch": "feat/signal-explorer",
      "prNumber": 45,
      "people": ["..."]
    }
  ],
  "activities": [...]
}
```

That can execute transactionally.

---

## 5. Provenance should be built in

The agent will infer things. We shouldn't pretend inferred state and factual state are identical.

I'd use:

```text
confidence:
    confirmed
    inferred
    uncertain
```

and activity sources such as:

```text
github_pr
github_commit
github_issue
repo_document
group_chat
experiment
manual
agent_review
```

Example:

```text
Signal explorer

state: active
current state:
    "Ready for live validation."

confidence:
    inferred

evidence:
    PR #45
    agenda.md
    latest commit
```

A manager can then correct it.

---

## 6. Corrections should be first-class

I would not create a heavyweight approval queue yet.

Instead, if you edit:

> This isn't blocked; the hardware test is intentionally postponed.

that should create an annotation attached to the axis:

```text
Human annotation
2026-09-30

Hardware test intentionally postponed.
Treat axis as parked, not blocked.
```

The librarian should read annotations before making its next inference.

This gives you persistent steering without building an administrative workflow.

---

## 7. Multi-user design

I would keep **one shared organizational dashboard**.

There should not initially be:

```text
<person-a> dashboard
<person-b> dashboard
<person-c> dashboard
```

Instead:

```text
Shared state
     │
     ├── Topic A
     │    ├── User A
     │    └── User B
     │
     └── Topic B
          └── User C
```

Then the UI provides filters:

```text
All people
<person-a>
<person-b>
<person-c>
```

Selecting one person answers:

> What is this person currently working on?

without creating separate state.

### Identity mapping

Do **not** assume these are identical:

```text
Nakama account
GitHub account
person
```

Use the `people` table as the canonical person.

Example:

```text
Person
  display_name: <person-d>
  nakama_user_id: 9ab...
  github_login: <person-d>-dev
```

That will matter when the librarian sees commits authored by `<person-d>-dev`.

---

## 8. Concurrency

For your group size, SQLite remains completely reasonable.

But I would change `ResearchStore` initialization to use:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

and use explicit transactions for multi-row operations.

For example:

```text
reconcile_topic
    BEGIN

    update axis
    update people links
    add activities
    update topic timestamp

    COMMIT
```

I would also use the `version` integer for optimistic editing.

UI sends:

```text
axisId
expectedVersion: 7
```

If someone has updated it since:

```text
current version = 8
```

the action returns:

```text
conflict: record changed since you opened it
```

For fewer than ten trusted users this is enough; PostgreSQL would be unnecessary complexity.

---

## 9. Overview UI

The existing list/detail UI should become an internal detail view.

The default screen should instead look approximately like:

```text
Research Overview                       Last 14 days

Signal Processing
A, B

  ● Signal explorer
    feature · active
    feat/signal-explorer · PR #45
    Live measurement validation underway

  ◐ Filtering comparison
    experiment · draft
    Comparing alternative filtering methods

  ○ Reconstruction investigation
    investigation · parked

  Recent: 6 events · last activity today


Acquisition Automation
A, C

  ● Parameter automation
    active

  ! UI automation
    blocked
    Blocker: live Windows machine unavailable

  Recent: 3 events · last activity yesterday
```

This should be the manager's **10-second view**.

---

## 10. Topic detail

Clicking a topic opens:

```text
Signal Processing

Description
People
Repositories

Development
──────────────────────────────

Signal explorer                 ACTIVE
feature
repo: processing-pipeline
branch: feat/signal-explorer
PR #45

Current:
Notebook functionality implemented.
Live validation underway.

People:
A, B

[history ▼]


Filtering comparison            DRAFT
experiment
...
```

The timeline should remain attached to each development axis rather than becoming one giant undifferentiated log.

---

## 11. Repositories view

Repositories deserve their own view, but they aren't the organizational hierarchy.

For example:

```text
<group>/processing-pipeline

Supports:
  Acquisition Automation
  Signal Processing

Branches/axes represented:
  feat/signal-explorer
      → Signal processing

  feat/acquisition-control
      → Acquisition automation

Recent activity:
  PR #...
  PR #...
```

This becomes especially useful when a repository serves several topics.

---

## 12. People view

Keep this simple:

```text
<person-a>

Currently involved in

Signal Processing
  Signal explorer            active

Acquisition Automation
  Parameter automation       active

Recent activity
  ...
```

This directly addresses your original requirement:

> open dashboard and understand what users are working on.

---

## 13. Librarian behavior

The rewritten skill should say, conceptually:

```text
Dashboard = current shared interpretation.

When asked to review a topic:

1. Read existing dashboard state and human annotations.
2. Inspect relevant repositories and declared project documents.
3. Examine recent branches, PRs, commits and issues.
4. Compare evidence against existing development axes.
5. Reconcile:
   - new axes
   - changed state
   - current progress
   - people
   - blockers
   - recent factual activity
6. Mark inferred conclusions as inferred.
7. Never override explicit human annotations without explaining the conflict.
```

This is considerably more useful than the current rule of "only write what the human explicitly said."

---

## 14. The 14-day view

I would make this a query parameter rather than special stored state.

For example:

```text
get_overview({
    activitySinceDays: 14
})
```

Default:

```text
14 days
```

UI controls could later support:

```text
7d
14d
30d
all
```

No additional history architecture is needed.

---

## 15. Migration from current V1

The current `projects` can map fairly cleanly:

```text
projects → topics
```

and current:

```text
activities
```

can migrate into the new activity table with:

```text
topic_id = old project_id
axis_id = NULL
```

So existing test data and real dashboard state don't have to disappear.

I would **not delete the old tables immediately**. Migration 002 can copy them, then V2 code stops reading them.

A later migration can remove legacy tables once V2 has been proven.

---

## 16. Suggested implementation sequence

1. Add migration `002-coordination-model.sql` plus V1→V2 migration tests.
2. Refactor `ResearchStore` with WAL, busy timeout, transactions, topics/repos/people/axes.
3. Implement `get_overview`, `get_topic`, `search_dashboard`, and `reconcile_topic`.
4. Add provenance, annotations and actor tracking from `context.actor.id`.
5. Build the new overview UI, while retaining current detail editing functionality underneath.
6. Add Topic detail with concurrent development axes and expandable histories.
7. Add People and Repositories internal views.
8. Rewrite the `research-coordinator` skill for librarian reconciliation.
9. Add optimistic version checks and multi-user tests.
10. Only after that, implement automated GitHub/repository review.

That gets us to a useful **V2 coordination dashboard independently of the exact GitHub automation strategy**.

The biggest architectural decision I would lock in now is:

> **Topics are the organizational unit; development axes represent concurrent work; repositories, users, branches, PRs and activity are evidence/context attached to them.**

That model should survive even if the librarian later gets GitHub polling, group-chat access, repo skills, or additional reporting sources.
