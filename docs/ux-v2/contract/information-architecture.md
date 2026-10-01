# Information Architecture

## 1. Topic

A Topic is the high-level research/project direction.

Examples:

- compressed sensing UDV
- UDV Echo Process
- validation campaign

Topic view should answer:

- what is this direction?
- who is involved?
- which repositories support it?
- what major axes are current?
- what has happened recently?

Topic descriptions are compact abstractions, not full execution logs.

## 2. Axis

An Axis is a durable major line of work inside one Topic.

Examples:

- acquisition automation
- signal analysis
- docs & agent skills
- rig-control integration

An axis is not merely a branch, PR, or repository feature.

Characteristics:

- topic-owned;
- can span multiple repositories;
- can contain multiple concrete problems;
- can be active, blocked, parked, usable, completed, abandoned;
- can be reopened;
- may or may not have a formal plan/work package.

The Topic page shows the axis as a concise current abstraction.
The Progress page shows its concrete problem, activity, implementation threads, evidence, and steering context.

## 3. Problem

A Problem is the concrete thing currently preventing, enabling, or advancing the axis.

Example:

> We cannot apply filter X because the UDV signal does not yet expose a validated structured time grid.

A Problem should be traceable downward to implementation/evidence.

Typical fields:

- statement,
- state,
- parent axis,
- affected repository/repositories,
- people,
- latest activity,
- optional current interpretation,
- optional linked plan step,
- evidence/artifacts,
- resolution/reopen history.

Problems are the natural bridge between research intent and repository/code work.

## 4. Repository

A Repository is an implementation and evidence surface.

A repository may:

- support multiple topics;
- support multiple axes;
- contain work relevant to multiple problems.

Repository work should not automatically define the research hierarchy.

The repository view is therefore an inverse projection:

> Which topics, axes, and concrete problems is this repo helping with?

## 5. Person

A Person is an attribution and involvement entity.

The dashboard may show:

- compact factual bio/role context;
- topics and axes involved in;
- attributable activity;
- repositories touched.

Do not derive performance judgments from activity density.

## 6. Plan / work package

Optional execution structure beneath an Axis.

Use for:

- staged implementation plans,
- feature sprints,
- experiment campaigns,
- defined validation sequences.

A plan can contain ordered or unordered steps.

It is not required for:

- exploratory research,
- open-ended investigation,
- ad-hoc debugging,
- loosely structured analysis.

## 7. Activity

Activity is evidence that something happened.

Sources may include:

- manual
- github_pr
- github_commit
- github_issue
- repo_document
- group_chat
- experiment
- agent_review

Activity should retain provenance and attribution when known.

Recency is useful even when the activity itself is not "important" in a project-management sense. A documentation change can still demonstrate that work is alive.

## 8. Evidence

Evidence supports claims and summaries.

Examples:

- PR
- commit
- issue
- experiment run
- test result
- notebook
- design document
- agent review

Evidence is not the same as activity, although one record may serve both roles.

## 9. Human steering note

A human steering note is explicit interpretive context.

Examples:

- "Good enough for the current experiment; do not call this complete."
- "Reopen when the next sweep needs emissions control."
- "This axis is about measurement automation, not general Windows UI automation."

Rules:

- steering notes constrain librarian summaries;
- automation must not silently override them;
- conflicting evidence should surface the conflict rather than rewrite the human intent invisibly.

## 10. Abstraction flow

Information should compact upward:

`Problem / evidence / activity -> Axis interpretation -> Topic summary -> Overview signal`

This is an abstraction process, not duplication.

### Progress

Deep operational truth:

- concrete problem,
- plan,
- repository thread,
- activity,
- evidence,
- steering.

### Topics

Compact current interpretation:

- what the topic is,
- current axes,
- exceptional states,
- latest meaningful activity.

### Overview

Minimal operational signal:

- what moved,
- how recently,
- what has gone quiet.

## 11. Confidence semantics

Confidence describes a claim, not the existence of an entity.

If there is no claim, confidence should be null rather than defaulting to confirmed.

Suggested claim confidence:

- confirmed
- inferred
- uncertain

Human correction notes have priority as interpretive evidence.
