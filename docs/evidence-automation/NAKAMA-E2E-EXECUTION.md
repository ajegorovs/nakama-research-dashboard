# Nakama-native Librarian E2E execution envelope

## Accepted intermediate review

The owner relayed **APPROVE WITH CHANGES — Nakama-native Librarian E2E discovery accepted.** Reviewer recommendations carry the owner's authority for this task. No further discovery review is required after incorporating the amendments.

The reviewer authorized offline harness implementation plus isolated source-hosted Nakama bring-up, plugin install/enable/capability assignment, supported-API synthetic seeding and direct plugin readback, with **zero model inference**. Stop immediately before the first agent/model turn and return implementation evidence, exact provider/model selection and a bounded inference protocol for review. Earlier preparation-only wording in `NAKAMA-E2E-PREPARATION.md` describes the historical preparation step, not the current envelope.

## Mandatory amendments

1. Materialize Nakama from clean committed `945420b6d966ec68c2db8add1c988b8f9c7a11eb` and plugin from clean committed `eba605fc779558a34755e8c5dd55e1e42742c1a8`. Do not vendor either dirty working tree. Build the clean plugin and use its authoritative vendor script. No network fetch is needed. Record host/plugin commits, manifest/action/UI hashes, served revision and served action/UI identities before seeding. The observed vendored UI mismatch must resolve or fail explicitly.
2. Fixture startup, installation, assignment, seeding and direct reads belong to this zero-inference slice. Live tool-call emission, three-tool skill behavior, semantic behavior and completed automation agent traces are later first-run checks, not pre-implementation prerequisites.
3. Persist a distinct oracle-free Nakama semantic seed derived deterministically from accepted FIX-* facts and the F-2-conflict/F-18-inj variants. Exclude expected verdicts, oracle data, candidates and model metadata. Persist source fixture ID to live ID mappings and validate projections using `get_topic`; require semantic, not byte/ID, equivalence.
4. Use a real authenticated fixture-human session for annotations; the host derives author type/ID. Never spoof or raw-write attribution. Both F-3 claims originate from the same fixture human; two unresolved disagreeing human claims suffice. Distinct-human requirements would be a new condition.
5. No-write means logical immutability of the research-dashboard plugin store. Expected platform session/message writes are separate. Inspect platform tool traces read-only. Pin plugin DB generation/revision before a turn and fail closed on change. Positive-control mutation targets scratch database copies only. Missing, empty or malformed traces fail cases requiring consultation.
6. N-7 follows successful direct-turn and trace validation. Automation preparation may occur now, but no automation run may be the first inference event.

## Protected scope

Preserve the original control host and corpus/production data. Separate loopback instance, data root, org and profiles. Do not edit shipped product actions, schemas, manifest or skill merely to make tests pass. No raw plugin DB writes, automatic reconciliation, scheduler, new provider/egress route or standalone external 34-call benchmark. Do not restart existing services. Own and track disposable processes; never use broad process-kill patterns. Keep credentials and operational machine details outside the public repository.

The owner authorized parent commits/pushes for bounded work. Exclude unrelated pre-existing edits. Intermediate review handoffs must be self-contained and supported by a verified pushed revision or portable integrity-checked archive.

## Execution status

Implementation and clean-source fixture preparation were dispatched as disjoint delegated jobs. The parent will integrate and independently verify their results before supported-API semantic seeding. No inference is authorized. This document records the envelope, not successful completion of any runtime gate.
