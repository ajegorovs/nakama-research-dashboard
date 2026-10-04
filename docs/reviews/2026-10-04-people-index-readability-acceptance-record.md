# People-index readability — final acceptance record (2026-10-04)

**Status: accepted and closed, without conditions.** Reviewer work is complete; commit, publication and merge remain separately owner-authorized. V1 and Tier B B1/B2 remain closed; B3/B4 remain deferred.

## Reviewer ruling (verbatim)

> **People-index readability package accepted.** The People index no longer renders an inter-block separator before block-level recency. Fixture Alpha improves from 102 px to 84 px at both supported viewports with the separator-only line eliminated; other measured People rows do not increase in height. Factual counts, ordinary and exceptional recency wording, hooks, detail content, the 240 px rail, navigation and focus behavior are preserved. No CSS or Repository behavior changed. The implementation is verified by build/unit and host type checks, served measurements, four canonical read passes, four focus passes, a discriminating focus negative control, and dedicated positive/negative boundary-regression coverage. The absence of served `nothing attributed yet` coverage is explicitly recorded and does not block acceptance. No further product or reviewer correction is required.

## Measured build and outcome

| Item | Value |
|---|---|
| release | `0.2.0+dev.7c8fdc999f49` |
| bundle SHA256 | `714e55a7f9181bffc0e7ef144c1cfa18fe8c1fcbf3cde10136b030b8fa86179b` |
| corpus / fixture revisions | 60 / 44 |
| datasets and viewports | corpus and fixture; 1440×900 and 1280×800 |
| Fixture Alpha | 102→84px; separator-only line 1→0 at both viewports |
| other sampled People rows | 84px unchanged |
| rail | 240px; no measured horizontal overflow or row-height increase |

Only the People index's literal boundary separator is removed. Baseline count and recency wording remain;
shared metadata CSS, detail content and Repository wrapping are unchanged. Recency shortening and conditional
count de-duplication were explored but not implemented because they did not address the block-boundary mechanism.

## Verification

- `bun run check`: 127 unit tests passed, 0 failed; build and source typecheck green.
- Explicit host typecheck: 0 plugin diagnostics; host-only diagnostics reported separately, not counted as plugin errors.
- `bun run harness:boundary`: 17 positive/negative checks passed. Deliberate predicate corruption failed;
  served transient trailing/inter-sibling separator reinsertion was detected.
- Both served-build guards green, matching the bundle above; served measurement probe: 146/146 assertions.
- Canonical corpus read records: 154 pass / 0 fail / 27 skip at each viewport.
- Canonical fixture read records: 181 pass / 0 fail / 2 skip at each viewport.
- Ordinary focus records: corpus 60/64, fixture 60/60 passed, 0 failures; negative control detects 10 failures.
- Public-record hygiene and `git diff --check` green. Screenshots were republished by the read passes;
  regenerated non-People screenshots do not represent additional UI changes.

The orchestrator independently reran build/unit, source/host type checks, boundary/public-record suites and all
four served measurement/capture probes, read back the canonical records and inspected the before/after montage.
Read/focus passes and transient defect-reinsertion checks were executed by the serialized workers.

## Evidence and boundaries

Canonical evidence: [corpus 1440](../corpus/verify-read.txt), [corpus 1280](../corpus/verify-read-1280x800.txt),
[fixture 1440](../layout-fixtures/verify-fixture-read-1440x900.txt),
[fixture 1280](../layout-fixtures/verify-fixture-read-1280x800.txt), and the dataset/viewport focus records under
`docs/ux-v2/`. Standing decision: [DECISIONS §15](../ux-v2/DECISIONS.md#15-people-index-metadata-boundary-and-outcome-based-review-2026-10-04).

`nothing attributed yet` is absent from the served datasets: the added unit test covers its projection fields,
not rendered-state coverage. This limitation is accepted, not counted as a rendered pass. Range measurements
are text layout extents, not rasterized glyph ink. Existing console 401/MIME observations were not diagnosed
or classified as normal by this package.

No service restart, seed/wipe, `AGENTS.md` edit, publication, tag or merge was performed. Local development
instances were updated for served verification. Reviewer acceptance does not authorize the remaining owner-only
operational actions.

## Workflow disposition

The package validates outcome-based autonomy: one agreed objective/invariant set, independent investigation,
implementation, hardening and verification, then final package review. The suspected escaping defect was a
JSON-display artifact; runtime behavior was correct, and executable predicate coverage was added without
changing its meaning. No additional cosmetic workstream is opened by closing this package.
