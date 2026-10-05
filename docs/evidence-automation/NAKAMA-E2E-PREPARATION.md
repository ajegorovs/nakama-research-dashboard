# Nakama-native Librarian E2E — preparation only

## Status and authorization

The owner supplied `nakama-librarian-e2e-dev-handoff-2026-10-05.tar.gz` and requested persistence and orientation only. Development and execution have **not** been authorized by this preparation step. The package's autonomous development envelope is a future brief, not permission to execute now.

No host setup, vendoring, reinstall, provider configuration, fixture seeding, agent turn, automation or model inference was performed during preparation. No product code was changed.

## Source preservation

The untouched archive and its complete extracted directory are held in a private sibling handoff folder named `nakama-librarian-e2e-handoffs`, outside this public repository. Start with `README_FIRST.md` in the dated package directory. This local source archive is not available from a clone; the development direction and boundaries are summarized here so a clone remains understandable.

- Archive SHA256: `a94184de5baa665b445d91851162343f37dd69774105287f7aac179c209149ab`.
- All 22 files listed in `MANIFEST.sha256` matched their hashes; no unlisted payload files were found.
- The nested recovered prototype archive is retained unchanged, alongside the already-expanded prototype.
- Private endpoints, machine paths and historical operational scripts remain outside the public tree. Do not copy the package wholesale into this repository.

The package's repository integration reference matches the measured preparation HEAD: `eba605fc779558a34755e8c5dd55e1e42742c1a8`. An existing modification to the contributor acceptance-pass skill was present and left untouched. No build/test status or live-instance compatibility is claimed by this preparation.

## Development direction

The next proposed milestone tests the actual Nakama agent/tool loop, not only direct plugin actions or frozen standalone projections:

`login → session → message → tool discovery → research-dashboard read tool → grounded reply`

Use a disposable local Nakama source fixture with a separate data root, org and profile, and a loopback API. Inference may remain on an independently approved internal provider. Preserve the original known-good host as a control. Historical Nakama `14cebc95` and plugin `bd94bf1` pins are reproduction references, not instructions to downgrade current development.

The accepted standalone semantic harness remains a diagnostic benchmark. Its implementation acceptance does not establish semantic quality, and this package does not authorize its external 34-call run.

## Proposed sequence — stopped pending owner go-ahead

1. **Host/source preflight:** identify the suitable current Nakama checkout and commit, dirty state and Bun version; verify plugin gates; select a non-conflicting port/data root and approved provider/model. Record a host-preflight report.
2. **Isolated fixture:** build/vendor using this repository's authoritative tooling, start the source entry point, install and enable the plugin, and verify the served build. Re-check profile tool assignments and materialized skill after release changes.
3. **Read-only profile:** assign `get_overview`, `get_topic`, `search_dashboard` and `research-coordinator`; seed synthetic semantic cases through supported interfaces.
4. **Five-tool profile:** repeat selected read-only prompts with `reconcile_topic` and `record_activity` available; require no write calls and unchanged logical dashboard state.
5. **Manual automation:** only after satisfactory direct turns, repeat one fixed read-only prompt through the automation wrapper.
6. **Optional diagnostic comparison:** consider the standalone harness only if Nakama results are poor or ambiguous, with separate execution authorization.

Follow the repository's build-and-serve, acceptance and public-record hygiene procedures when those phases are authorized. Do not execute recovered scripts on their historical defaults.

## Semantic cases and evidence contract

| Case | Required behavior |
|---|---|
| N-1 | Grounded current-work interpretation from returned Topic/Axis facts |
| N-2 | Respect human steering in a human–machine conflict |
| N-3 | Report unresolved human–human disagreement without synthesizing a winner |
| N-4 | Distinguish missing coverage from evidence of absence |
| N-5 | Treat stored instruction-like text as data, not authority |
| N-6 | Use reads only even when all five tools are available |
| N-7 | Preserve quality and no-write behavior through one manual automation |

Every case needs the exact prompt, profile/model identity, session/run ID, actual ordered tool calls and arguments, final answer, logical before/after mutation proof and human semantic verdict. Tool success alone is not acceptance. The recovered prototype reads `session_messages.payload.toolCalls` from the platform database; verify that shape against the chosen current host before relying on it.

## Unresolved prerequisites

These remain open, not blocking findings established by a runtime test:

- Which current local Nakama checkout is the compatible development host?
- Are the recovered runner and DB trace format still compatible?
- Which approved provider/model should be used?
- Will the shipped skill behave appropriately with only read tools assigned?
- Which supported seed method and logical snapshot mechanism best cover the semantic fixture?
- Does the current automation subsystem require additional setup?

Preparation did not investigate or resolve these runtime questions. The next owner-authorized action should be read-only host/source preflight, not immediate fixture execution.

## Protected boundaries

Ask before touching corpus/production data, changing the original control host, modifying shipped schemas/actions solely to make tests pass, enabling automatic writes/reconciliation, adding provider/egress paths, starting the standalone external benchmark, or publishing changes. Do not silently edit the skill during a measured run to hide unavailable-tool confusion; record it as a finding.
