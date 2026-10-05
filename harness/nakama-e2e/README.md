# `harness/nakama-e2e` — bounded Nakama-native Librarian E2E harness

Offline-testable machinery for running the N-1…N-7 semantic matrix through the **real** Nakama agent/tool
loop on an isolated fixture. This slice builds and validates everything up to the first model turn and
**stops there**: no inference is authorized or performed here.

It has no product dependencies: nothing under `src/`, `nakama.plugin.json`, `migrations/` or
`.agents/skills/` is touched by it.

## Layout

| File | Responsibility |
|---|---|
| `seed-artifact.json` | The **distinct** oracle-free seed: the accepted FIX-* facts expressed in the supported `reconcile_topic` vocabulary, including the adopted `F-2-conflict` and `F-18-inj` note texts. No expected outcome/verdict, no candidate output, no model metadata. |
| `artifact.mjs` | Loads/guards the artifact (`assertOracleFree`) and builds the two-phase reconcile payloads + variant substitution. |
| `limits.mjs` | The traced `reconcile_topic`/`get_topic`/`record_activity` input limits and a fail-closed validator (see `API-LIMITS.md`). |
| `client.mjs` | Small bounded HTTP client (cookie+CSRF login, per-org header, 429/503 retry). Refuses an out-of-contract write before sending. |
| `seed.mjs` | Seeds the artifact through the **authenticated human** `reconcile_topic` action and persists a source-id → live-id mapping; duplicate guard fails closed. |
| `readback.mjs` | Validates the live `get_topic` projection against the semantic conditions each N-case needs (never byte-equality). |
| `snapshot.mjs` | Logical plugin-store snapshot, pinning **generation + revision**, failing closed on change; positive control mutates a scratch **copy** only. |
| `trace.mjs` | Reads and validates the real tool-call trace from the platform DB (`session_messages.payload.toolCalls`); absent/empty/malformed fails consultation. |
| `turn.mjs` | Agent/model turn driver and the inference interlock — **default blocked**. |
| `automation.mjs` | Manual-automation definition (pure); install/run gated — run also requires direct validation (N-7 downstream). |
| `fixture-run.mjs` | Fixture-worker entry: **pre-seed pin → seed → mapping → readback → re-pin**. **Dry-run by default**; never runs a model turn. |
| `nakama-e2e.test.mjs` | Offline tests of every seam (79 cases), including the fixture-run pin-before-seed ordering. |

## Run the tests (offline)

```bash
bun test harness/nakama-e2e
```

or via the runner that mirrors the `librarian-generation` convention:

```bash
bun harness/nakama-e2e/run-tests.mjs
```

No network, no model, no live instance. **Proposed** `package.json` script (not added — `package.json` is
out of scope for this slice): `"harness:e2e": "bun test harness/nakama-e2e"`.

## Inference is blocked

`turn.mjs` exports `assertInferenceAuthorized` and `INFERENCE_AUTHORIZED = false`; `runAgentTurn` and
`runAutomation` throw `InferenceBlockedError` before any transport call, and `installAutomation` throws
unless an explicit `allowPlatformWrite: true` is passed. There is no authorization record in this
envelope, so the gates are shut. A test asserts the guarded functions throw **and** that an injected
transport is never called.

## What the no-write proof measures

`snapshot.mjs` compares two `canonicalSnapshot`s (schema objects + per-table row count + canonical-sorted
rows + a `development_axes`/`problems` version map) of the plugin store, and separately asserts the store
identity did not move:

- **Plugin store only.** Platform writes are expected and are *not* part of this proof — they are read
  separately from the platform DB (`trace.mjs`).
- **Generation + revision are pinned.** `pinStoreIdentity` reads the generation filename and the served
  revision (`org_plugins`); `assertNoLogicalMutation` fails if either moved, even when the rows match.
- **The positive control never touches the live store.** `positiveControlMutation` copies the DB (plus
  WAL/SHM) into a scratch directory and edits the copy, proving the comparator can go red without mutating
  the fixture under test.

## Operational instructions for the parent / fixture worker

Prerequisites the harness assumes (owned elsewhere, not created here):

1. An isolated fixture instance with a `data-root`, `org`, and profile; loopback API; the plugin
   installed+enabled. The harness only needs the store path convention
   `<data-root>/orgs/<org>/plugins/<pluginId>/db/<generation>.sqlite` and the platform DB at
   `<data-root>/data/sqlite/nakama.sqlite`.
2. Credentials reachable by name from an env file: `NAKAMA_SEED_ADMIN_EMAIL` / `NAKAMA_SEED_ADMIN_PASSWORD`
   (or `NAKAMA_EMAIL` / `NAKAMA_PASSWORD`). The harness never prints them.
3. The approved provider/model remains a **separate** presentation before any model turn.

Then:

```bash
# dry run — prints the plan, touches nothing
bun harness/nakama-e2e/fixture-run.mjs

# seed + read back (fixture worker, once the fixture exists). Every target flag is EXPLICIT: there is no
# default base, org or store path, so a stray ambient NAKAMA_URL cannot aim this at the corpus.
bun harness/nakama-e2e/fixture-run.mjs --execute \
  --base http://127.0.0.1:<fixture port> \
  --expected-org <fixture org id> --expected-org-name <fixture org name> \
  --env-file <instance env file> \
  --data-root <NAKAMA_CONFIG_DIR> --platform-db <platform sqlite path> \
  --out <scratch>/nakama-e2e/mapping.json
```

`--env-file` supplies the credentials (by key name; never printed). `--data-root` and `--platform-db` name
the fixture's local store; they may instead come from `NAKAMA_CONFIG_DIR` and `DATABASE_URL` in the loaded
env. The run's order is fixed and fails closed at each step:

1. **login** with an explicit expected org (the account must be a member; the name is checked when given);
2. **empty-store confirmation** — a fixture that already holds topics is refused (no force override);
3. **pin the store identity before the seed** — generation + served revision + lifecycle, read from the
   platform DB; absent/malformed/non-enabled all refuse;
4. **mapping output writable** — the `--out` parent is created and checked before anything is mutated;
5. **seed** through the authenticated-human `reconcile_topic` action (an expected mutation; a failure stops
   the run — no reseed, no reset, no retry);
6. **persist the source→live mapping**, then **read back** each N-case projection through `get_topic`;
7. **re-pin** across the read-only readback and fail if the generation or revision moved.

The run writes the source→live mapping to `--out` (keep it outside the repo). `mapping.json` is what the
readback, the snapshot identity check and a later turn-trace validation all address the fixture by; a run
without it cannot be tied back to the seeded rows.

After seeding, the readback validates each N-case projection. Then, and only then, would a direct agent
turn follow — which this slice does not enable.

## Boundaries honoured by this slice

- No product `src/`, manifest, schema or shipped-skill change; `package.json` untouched.
- No git state-changing command; no commit.
- No credentials/provider-config read, no live HTTP, no install, no service operation performed to build
  or test this slice.
- The seed artifact is derived from the accepted FIX-* facts and is deliberately free of the offline
  evaluator's oracle/verdict/candidate/model vocabulary.
