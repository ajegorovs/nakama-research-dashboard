# Research Dashboard UX Contract v2

Status: **Design contract for implementation**  
Target: `ajegorovs/nakama-research-dashboard`  
Purpose: define the information architecture, interaction behavior, visual grammar, and acceptance criteria for the redesigned research dashboard.

This package is not a literal HTML-to-plugin port. The HTML files under `prototypes/` are visual references for hierarchy, density, composition, and interaction intent. The Markdown specifications are authoritative where behavior or semantics are concerned.

## Product question

The dashboard should help a small research group answer:

> What is moving, what has gone quiet, what problem is being solved, and where is the evidence?

It is not a productivity scoreboard, issue tracker, or general-purpose CRUD console.

## View model

| View | Primary question | Primary object |
|---|---|---|
| Overview | What is moving, and what has been quiet? | recent topic/repository activity |
| Topics | What is this research direction, and what major work is current? | topic |
| People | What is this person involved in, and what have they touched recently? | person |
| Repositories | What implementation work is happening here, and which research work does it support? | repository |
| Progress | What problem are we solving, how is it being advanced, and what remains? | axis / problem |

## Core semantic hierarchy

`Topic -> Axis -> Problem -> repository implementation/evidence`

Important qualifications:

- **Topic** is the research/project direction.
- **Axis** is a durable major line of work inside a topic.
- **Problem** is a concrete issue being solved within an axis.
- **Repository** is an implementation/evidence surface, not the parent of the axis.
- **Plan / work package** is optional. Use it only when work is actually structured as a staged plan or feature sprint.
- **Evidence** can include PRs, commits, issues, experiments, documents, notebooks, agent reviews, and manual activity.
- An axis is not terminal. It may move from active to usable or completed and later be reopened.

## Product principles

1. **Insider-first.** The group already knows most people and repositories. Use space for current work, recency, problems, and evidence.
2. **Recency is an operational signal.** Stale means "no recent activity", not "blocked", "failed", or "abandoned".
3. **Problem first.** Progress is organized around the problem being solved, not a generic project-management template.
4. **Read surface first.** The dashboard is primarily for inspection and navigation. Structural edits normally happen through the librarian-agent.
5. **Human steering matters.** Human notes constrain librarian interpretation and must not be silently contradicted.
6. **One visual grammar.** Entity tags, status badges, recency labels, indices, activity feeds, and section cards behave consistently across views.
7. **No silent semantic loss.** Layout compression must not discard meaningful state, evidence, attribution, or provenance.

## Files

- `interaction-spec.md` — click behavior, routing, disclosure, sorting, and read/edit rules.
- `information-architecture.md` — entity meanings and cross-view projection rules.
- `component-contract.md` — reusable UI primitives and their behavioral contracts.
- `acceptance-checklist.md` — implementation acceptance criteria.
- `fixtures.md` — required edge states and expected rendering.
- `prototypes/` — current visual references for all five views.

## Implementation note

Reuse the existing plugin data/actions where possible. The redesign should not require duplicating the same underlying state for different views. Views are projections of shared entities and activity records.
