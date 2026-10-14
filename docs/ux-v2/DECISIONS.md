# Current product decisions

This is the current policy summary for the four-view dashboard. Earlier chronological rulings
are recoverable from the pre-retirement commit listed in [the documentation map](../README.md).
The [current architecture](../design/dashboard-information-architecture-pivot.md) supersedes old
Overview, one-selected-problem and five-tab composition instructions.

## Navigation and factual presentation

- Projects is the landing view; the other views are Progress, People and Repositories.
  Overview and the legacy Dashboard summary presentation are retired; the accepted V12 layout
  has no replacement aggregate disclosure. Backend aggregate reads remain unchanged. Navigation is read-only and selects
  the exact entity, not merely its destination tab. Status indicators are never navigation.
- Display Project → Workstream → Task while retaining topic/axis/problem storage identifiers.
- Missing data remains explicit. Relationships do not imply maintainership or event authorship.
  A loaded page is not a complete-history claim. Counts must retain their projection's scope.
- Structural maintenance normally goes through the coordinator tools; visual restyling does
  not authorize broad editing controls, a new schema, ingestion or protected-data writes.
- Plan positions render as stored, including zero; absent positions carry no number.

## 11. Public-record hygiene

Public artifacts carry labels, not personal operational identities. Keep loopback diagnostic
URLs and public hosts; redact literal non-loopback addresses, identity-shaped hosts, private
DNS suffixes and the machine hostname. Keep scheme, port and path where useful. Credentials
are referenced by key name, never value. Implement redaction at the emitter through
`harness/redact.mjs`; `bun run harness:records` guards the public tree. Published history is
not rewritten. See the contributor public-records procedure for exact rules.

## 12. Keyboard focus

Every control has one shared focus indicator. Its settled render must achieve at least **3:1**
against the adjacent surface. Measure real Tab navigation, wait for the focused element's own
animations, assert control-class coverage and require a negative control to fail. Host-owned
controls and unreached instances are stated as boundaries, not silently counted as passes.

## 14.10 Geometry and focus boundaries

Judge layout against the actual detail container and intended host scroller, not only window
width. Support content must remain reachable. Overflow-dependent scroll containers enter the
Tab order only while overflowing; report reached instances honestly. Styling changes preserve
keyboard operation and truthful reading order. Legacy band-specific thresholds are historical,
not a mandate to restore the retired support-grid composition.

## 16. Scoped coordinator retrieval

`get_topic` accepts an optional stable `axisId`. Without it the topic-wide compatibility shape
is preserved. With it, return only that workstream, its evidence/history/notes and its own
problem notes. Reject unknown axes and axes outside the named topic. Coverage declares
`limitScope` (collection, per-source or per-problem), returned/total, truncated and absent.
Only `historyLimit` and `notesLimit` apply to the scoped branch; topic-wide annotation/activity
options are accepted but ignored there. A limit must not be mistaken for total completeness.
See the shipped coordinator skill and implementation contract for supported inputs.

## 18. Evidence belongs to the selected workstream

Progress renders evidence directly from the selected `axis.evidence`, not activity totals,
confidence or a progress score. Empty evidence says:
**No evidence on record — a 'confirmed' reading needs evidence**.
The three-entry preview is source-labelled and uses **+ more recorded evidence**, not an
invented exact remainder. Asserted confirmed claims require evidence. An unasserted database
`confirmed` default may exist without evidence; do not manufacture a research claim from it or
silently change persisted confidence. The accepted regression displayed ACTIVE.

## 19. Scoped history migration

The selected workstream's history is the Progress Recent-activity feed, paged independently
from tasks, newest first and excluding siblings. This replaces the retired in-card expandable
history; it is migrated substance, not exact equivalence with the old control. Evidence and
history probes are `harness/canonical-served/evidence-line.mjs` and `history-scope.mjs`.
Their bounded validation is closed as recorded in the [development boundaries](../DEVELOPMENT.md).
Production readiness and additional deployments remain separate decisions.
