# Nakama-native E2E — zero-inference checkpoint

## Outcome

The reviewer-authorized implementation/fixture-preparation slice is complete through supported-API synthetic seeding and direct plugin readback. **No model turn or automation run was performed.** This is preparation/instrument evidence, not semantic acceptance.

Nakama was materialized offline from committed `945420b6d966ec68c2db8add1c988b8f9c7a11eb`; the served plugin was built from clean committed `eba605fc779558a34755e8c5dd55e1e42742c1a8`. Dirty original checkouts were not used as fixture sources. Dependencies were reused locally; no install/fetch or provider contact was needed. The new harness lives in `harness/nakama-e2e/` and does not alter shipped product code, schemas, manifest or skill.

## Measured identities

| Item | Identity |
|---|---|
| Release | `0.2.0+dev.164ccaafbca4` |
| Served revision | `12` |
| Active plugin generation | `g7e6ef07132594080899afb12ad2200cc` |
| Source manifest SHA256 | `5f0a5f8e08b13a2fd7dca6a272405e26d10dd331d71387fa784e1dfdbd3587f9` |
| Action bundle SHA256 | `4a0686dd4e8d9809a4ea400b4ab5127b8587cc69abdb21b4ea7331b2e39c523c` |
| UI bundle SHA256 | `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc` |

UI was verified through authenticated HTTP bytes; action bytes were verified in the selected release store, not through a nonexistent action-download route. The host rewrites the release manifest version to the digest label. The earlier vendored UI mismatch is resolved.

## Preparation evidence

Three `reconcile_topic` calls through the authenticated fixture-human session produced **2 topics, 8 axes, 8 annotations, 4 activities, 1 problem, 1 plan and 1 plan step**. A distinct oracle-free seed artifact and persisted source-to-live mapping are used, not raw SQLite seed writes or standalone expected outcomes.

Direct `get_topic` projection validation passed for N-1 through N-5: ordinary work; conflicting human steering; two unresolved disagreeing claims from the same real fixture human; omission of problem-scoped steering from the supported projection; and stored instruction-like text at the requested note cap. Returned relevant notes have `authorType=human` and the authenticated actor ID. These checks establish fixture conditions, not model compliance.

The parent independently reran N-1 through N-5 reads and the logical plugin-store comparator: all passed, active generation/revision unchanged. The scratch-copy positive control detected a mutation; the live store remained unchanged. Platform writes and plugin-store immutability are treated separately.

Parent verification:

- `bun run check`: **304 tests pass**, typecheck and build pass.
- Host typecheck against the clean pinned host: **0 plugin diagnostics**; 155 host-internal diagnostics excluded by the existing checker design.
- `bun harness/nakama-e2e/run-tests.mjs`: **79 tests pass**.
- `bun run harness:records`: pass.
- Direct-read no-write proof and positive-control detection: pass.

Parent read-only platform-DB verification confirmed zero sessions, session messages, model-turn usage, model-usage rows, workflow runs, automations and automation runs. Provider remains unconfigured. No actual live agent tool-call emission has been tested.

## Findings and limitations

The initial client retried uncertain writes and selected the first org implicitly. These were fixed and regression-tested before the only live seed attempt. Seed mappings now fail closed on malformed or incomplete responses; target/org/output authority is explicit. Snapshots select the active generation from the current host row and pin both generation and revision; positive controls use consistent scratch copies only.

An idle automation worker was subsequently observed under the isolated fixture PM2 home, contradicting the earlier preparation report's claim of an empty worker list. No automation definitions/runs or inference occurred. Do not treat worker suppression as established; inspect and enforce containment before configuring a provider.

Profiles have exactly the requested plugin assignments, but also host-default built-in tools and skills, including file writers and web fetch. They are **not** capability-isolated to three or five total tools. This must be resolved or explicitly accepted for inference, especially the stored-instruction test; no product defaults were changed to hide it.

`turn.mjs` and `automation.mjs` are blocked preparation scaffolds, not an inference-ready owning driver. Before inference, implement/test the approved bounded orchestration with explicit org/profile/model identity, per-turn store pins and snapshot/trace checks, total tool/model budgets, stop latch and downstream automation gate. Merely flipping the authorization constant is insufficient.

## Next review decision

Accept or request changes to the zero-inference preparation evidence. Inference remains blocked until an exact approved provider/model is selected and the bounded protocol/containment is approved and mechanically enforced. No provider selection is claimed: the fixture intentionally has none, and the delegation backend does not imply evaluation approval.

Suggested later protocol, **not authorized or inference-ready**: one fresh-session direct smoke first; on valid actual trace and unchanged plugin state, proceed to N-2 through N-5 with the three-plugin-read profile; then N-6 with all five plugin tools; finally one N-7 manual read-only automation. At most seven user turns/runs, no automatic retries or replacement experiments. A per-turn model/tool-call ceiling and timeout must be verified against the host before this becomes an executable budget. Stop on write calls, logical mutation, identity change, malformed/missing consultation trace, or provider/runtime failure; preserve evidence and permit only approved owned-process cleanup.

No corpus/production/control-host access, shipped skill/product changes, scheduler creation or standalone external 34-call benchmark is included. Original unrelated contributor-skill modifications remain excluded from publication.
