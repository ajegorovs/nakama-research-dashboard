# Evidence Automation V1 — accepted implementation baseline

Reviewer-closed; owner authorized three-component Git closure. This record adds no technical scope or operational authorization.

| Component | Immutable implementation point | Publication |
|---|---|---|
| Dashboard plugin | `c03a99d0813a0652a4504e93ba565a85c3e6b012` | established `main`; publication owner-authorized |
| Nakama host patch | `945420b6d966ec68c2db8add1c988b8f9c7a11eb` | local `evidence-automation-v1` branch only; no upstream push |
| External synchronizer | `7c41e55ebb2f4d4cfacb8273b4cc61d86647279d` | standalone local `main`; no remote |

Host upstream base: `c33b36dd2d3320fe8c6d05cb6138a7adcd270e7e` (the inspected detached checkout). There is no invented fork or upstream merge. The plugin implementation was already on `main`; no synthetic merge ceremony was needed.

## Accepted post-campaign integration (committed immutable points)

Two accepted production changes are committed as immutable implementation points on top of the V1
baseline above:

| Component | Immutable implementation point | Publication |
|---|---|---|
| Dashboard plugin — actor attribution (P1C) | `b34b2525f5bde0bba383c64b350b29a3d742125c` | established `main`; owner-authorized |
| External synchronizer — bounded discovery (P1C) | `89e4f301ba52788cb98cca8fd4085510b1040f20` | local-only `main`; no remote |

The dashboard plugin's **actor-attribution** production change — the shared activity line states a
recorded `system` actor distinctly from an unmapped human/agent and never derives it from the
event's source type (`src/ui.tsx` + `ui/app.js` updated, `src/ui-attribution.test.ts` added) — is
committed on the established `main`; its publication is owner-authorized.

The synchronizer's **bounded discovery** path (P1C; merged PRs plus default-branch direct commits
for **one** enrolled repository) is the synchronizer's accepted head, committed on top of the V1
historical point `7c41e55…` in the table above (preserved as the baseline). The
`github-evidence-synchronizer` repository is **local-only** — it has no configured remote — so its
archive is available for local transfer and is not push-published; it has not already been
transferred. The Nakama host tree is untouched. Neither commit re-points the historical
implementation points (plugin `c03a99d…`, host `945420b6…`, worker `7c41e55…`); the qualified
acceptance ([`DECISIONS.md`](DECISIONS.md) D-001) is unchanged.

The integration is **bounded and manually started** (one-shot by default, no scheduler, no daemon,
no polling service) — it is explicitly **not** periodic production monitoring, whose semantics
remain deferred and unauthorized (D-003). The attempt observer added to the worker's
`github_source.py` is a default-absent, side-effect-free **optional diagnostic seam** (retained so
a future offline observation can be phase-local, D-004); it is neither product monitoring nor the
shipped R1→R8 driver architecture.

## Closure integrity

Explicit staged path sets: plugin implementation 8 files; host patch 17 files; worker 27 files. Accepted archive source snapshots compared before staging. The only planned deltas were acceptance/status documentation and owner-requested worker ignore rules for runtime state, caches, credentials/env files and test artifacts. The normally tracked plugin action bundle is included with its source. **Superseded 2026-10-05:** the then-accurate statement that dashboard UI source/bundle is unchanged no longer holds — the accepted **actor-attribution** production change updates `src/ui.tsx` + `ui/app.js` and adds `src/ui-attribution.test.ts` (see [`CAMPAIGN-CLOSE.md`](CAMPAIGN-CLOSE.md) and [`DECISIONS.md`](DECISIONS.md) D-005). This baseline record's product scope is unchanged; the campaign's R1→R8 driver harness is historical validation, not product architecture.

The host precommit hook initially refused three E2E harness lint violations. Closure changed only the two callback arrow bodies, removed an escape-free `String.raw` wrapper and applied host formatter whitespace. Targeted host lint passed and the isolated E2E remained 36/36; no runtime/product change. The hook was not bypassed.

Excluded/preserved outside these commits:
- unrelated plugin acceptance-pass skill modification;
- scratch/review archives, caches, runtime databases, secrets and test artifacts;
- host vendored plugin tree;
- pre-existing host `plugin-service.ts` official-plugin allowlist prerequisite (not part of the accepted host implementation commit).

**Portability prerequisite:** the isolated host E2E uses the locally approved official-plugin allowlist entry for `research-dashboard`. That pre-existing one-line diff remains local and uncommitted; a future owner-approved host fork/integration must deliberately carry or otherwise resolve it. This is not a claim that the pristine host patch commit alone ships plugin enrollment/installation policy.

## Acceptance and next boundary

See [acceptance record](../reviews/2026-10-04-evidence-automation-v1-acceptance-record.md) and [contract](CONTRACT.md). Reviewed revision-2 archive SHA256: `2f0dd97a50f859246f230c3474c385b07b7ecf5f79097df0d5fc6f8beab284a2`.

The next owner/reviewer decision is the real `udv-echo-process` pilot scope. This closure does not authorize repository enrollment, research-Axis mapping/backfill, credentials, scheduling, deployment, service restart or evidence writes.
