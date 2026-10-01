# Acceptance Checklist

## Global

- [ ] All five top-level views exist: Overview, Topics, People, Repositories, Progress.
- [ ] Shared visual grammar is used across views.
- [ ] Existing dashboard data is projected into the new UI without silent semantic loss.
- [ ] No broad CRUD console reappears.
- [ ] Read/navigation is visually distinct from steering/editing.
- [ ] 1440x900 reference rendering is usable.
- [ ] 1280x800 reference rendering is usable.
- [ ] Keyboard focus and selected-row state remain visible.

## Tags and navigation

- [ ] Topic tag -> Topics + selected topic.
- [ ] Person tag -> People + selected person.
- [ ] Repository tag -> Repositories + selected repo.
- [ ] Axis tag -> Progress/Axes + selected axis.
- [ ] Problem tag -> Progress/Problems + selected problem.
- [ ] Tags do not mutate state.
- [ ] Status badges do not accidentally navigate.
- [ ] Same entity has consistent label/behavior across views.

## Overview

- [ ] Two primary sections: topic/project activity and repository activity.
- [ ] Cards are sorted by last activity.
- [ ] Relative age is prominent.
- [ ] Latest event includes compact exact date.
- [ ] Stale is visible but not described as blocked/stalled.
- [ ] No separate duplicated Recent Activity section.
- [ ] No summary-stat strip dominates the view.

## Topics

- [ ] Index + selected topic detail.
- [ ] Normal active topic is not visually over-labeled.
- [ ] Current axes are visible.
- [ ] Completed/abandoned axes are secondary/folded.
- [ ] Activity carries repository tags where applicable.
- [ ] Broad Add Topic / Edit Fields controls are absent.
- [ ] Narrow note/correction affordance is acceptable.
- [ ] Topic detail is more abstract than Progress detail.

## People

- [ ] Index + selected person detail.
- [ ] Compact factual bio/role context.
- [ ] Current topic/axis involvement visible.
- [ ] Recent attributable activity visible.
- [ ] Related repositories visible.
- [ ] No activity ranking, score, utilization, or productivity judgment.

## Repositories

- [ ] Index + selected repository detail.
- [ ] Repository purpose is concise.
- [ ] Current work is visible.
- [ ] Supported topics/axes/people are navigable.
- [ ] Recent activity is visible.
- [ ] Repository is not treated as parent of topic axes.

## Progress

- [ ] Axes and Problems subviews exist or are implementable without data-model duplication.
- [ ] Axis remains the durable topic-owned work line.
- [ ] Concrete problems are first-class.
- [ ] Problem description is the visual center of the selected axis.
- [ ] Activity is visible in a separate adjacent column at desktop widths.
- [ ] Optional plan/work-package structure is supported.
- [ ] Plan is not required for axes that do not naturally have one.
- [ ] Open problems are distinct from the parent axis.
- [ ] Repository threads are visible as implementation contributions.
- [ ] Evidence/artifacts remain traceable.
- [ ] Human steering note is visible and semantically protected.
- [ ] `usable` state exists or equivalent gray-zone semantics are supported.
- [ ] Axis can be reopened after usable/completed/parked.
- [ ] Reopen/history does not erase prior state.

## Semantics / librarian behavior

- [ ] Stale means inactivity, not diagnosis.
- [ ] Confidence belongs to claims, not entity existence.
- [ ] Human correction/steering is read before automated reinterpretation.
- [ ] Automated summaries do not silently contradict human steering.
- [ ] Topic summaries compact lower-level evidence rather than duplicating it.
- [ ] Overview remains the highest-level recency signal.

## Regression / harness

- [ ] Existing real-corpus dataset still renders.
- [ ] Existing layout fixtures still render.
- [ ] No fixture coverage is weakened to make the redesign pass.
- [ ] Existing structured conflict semantics remain unchanged.
- [ ] Existing provenance/evidence admission rules remain unchanged.
