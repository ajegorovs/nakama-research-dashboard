# Research dashboard — Nakama plugin

One dashboard page and **five agent tools** over organization-shared research coordination state.
The product has four views: **Projects, People, Repositories and Progress**. Projects map to stored
`topics`, workstreams to `development_axes`, and tasks to `problems`; optional plans are scoped to
projects, workstreams or tasks. Evidence and history remain attached to their actual subjects.

## Current status

The dashboard rework and hardening/testing stage is **closed**, merged through PR #8. UI restyling
is a separate next stage; production readiness is not established by development acceptance.

- [Developer guide](docs/DEVELOPMENT.md): UI loop, verification, installation boundaries and known limitations.
- [Documentation index](docs/README.md): current references and historical recovery.
- [Contributor rules](AGENTS.md): build/serve, acceptance, preservation and public-record hygiene.

Historical screenshots in `docs/screenshots/` and `docs/ux-v2/fidelity/` belong to their recorded
builds. They are not a gallery of the current four-view product.

## Build and test

Use Bun; dependencies are pinned by `bun.lock`.

```bash
bun install
bun run check          # source types, bundles, source tests and harness unit-test suite
bun run typecheck:host # additionally requires a compatible Nakama checkout
bun run harness:records
```

The established stage baseline is **376 source tests + 47 harness tests**, zero failures;
host typechecking reported zero plugin diagnostics. These are dated measurements, not guaranteed
counts for future changes. There is no GitHub CI workflow currently validating this branch.

`types/host.d.ts` supplies local declarations for unpublished host packages; real host typechecking
is authoritative. Set `NAKAMA_CHECKOUT` to the host checkout when running that check. Harness `.mjs`
files are outside the strict TypeScript program; their unit tests are included in `check`.
`@types/react@18` remains pinned for the classic injected React/global JSX contract.

`ui/app.js` and `actions/actions.js` are committed installation outputs. Never edit them by hand;
regenerate with `bun run build` and inspect the diff.

## Iterate on the UI without a Nakama instance

The preview mounts the real plugin bundle using the host runtime, components and styles. It needs
a compatible Nakama source checkout with dependencies installed, but no running API, credentials
or live database.

```bash
bun harness/preview/run.mjs --checkout /path/to/nakama --dataset fixture --rebuild --watch
```

Open the printed preview URL and edit `src/ui.tsx`. Available datasets are `corpus`, `fixture` and
`scale`. See [preview instructions](harness/preview/README.md). The older automated capture/fidelity
helpers still assume the previous tab structure; they need separate verification before use with
the current product. Preview is not proof of authentication, installation or persistence.

## Installation and updates

This repository is the plugin source, not the Nakama service estate. The bundled installation route
copies the plugin into the actual host checkout and adds its official-plugin allowlist entry.
Service units, credentials, deployment roots and restart policy belong to the operator.

1. Run the build/tests and host typecheck.
2. Back up the intended instance consistently, including SQLite WAL state.
3. Vendor into the checkout **the running instance actually uses**:
   `./vendor/vendor-into-nakama.sh /path/to/nakama`.
4. Install or reinstall into an explicitly selected organization using the harness helper.
5. Verify/reassign capabilities for the explicitly selected agent profile.
6. Verify the browser-served asset on that same organization; installation success alone is not proof.

With an existing operator-provisioned credential file outside the repositories:

```bash
# NAKAMA_URL is the API origin; NAKAMA_DASHBOARD is the browser web origin.
# NAKAMA_ENV_FILE points to the existing private credential file.
bun harness/install-plugin.mjs --env-file "$NAKAMA_ENV_FILE" --org-id "$TARGET_ORG_ID"
# For an already installed plugin, use reinstall-plugin.mjs instead of install-plugin.mjs.
bun harness/assign-capabilities.mjs --env-file "$NAKAMA_ENV_FILE" \
  --org-id "$TARGET_ORG_ID" --profile-id "$TARGET_PROFILE_ID"
bun harness/served-build-guard.mjs
```

Install/reinstall helpers refuse ambiguous multi-org selection but retain a single-org fallback;
this procedure deliberately requires an explicit selector. Capability assignment is additive,
idempotent and read back after writes; it includes the CSRF headers required by the host.

The served-build guard requires `NAKAMA_DASHBOARD` **in its process environment** and hashes raw
response bytes. It uses the browser's active organization, not an org-selector flag: confirm the
active organization and org-scoped asset path separately on multi-org accounts. Do not infer
organization identity from a generic green guard.

Migrations **001–006** are declared in `nakama.plugin.json`. The host applies pending migrations
during installation/update, not boot, and uses database generations to preserve the previous store.
Do not seed, wipe or repair existing research data as an installation shortcut.

## Tools and API compatibility

The manifest has 13 actions, of which these five are exposed to agents:

- `get_overview`
- `get_topic`
- `search_dashboard`
- `reconcile_topic`
- `record_activity`

The shipped `skills/research-coordinator/SKILL.md` describes their use. Agent tool identifiers use
underscores, e.g. `plugin_research_dashboard__get_topic`.

**Breaking read-filter rename:** the page/admin `list_activity` action accepts `personActorId`,
not `actorId`. The target host strips reserved top-level `actorId` before dispatch, so an old caller
can silently receive unscoped activity with HTTP 200. Verify returned totals after upgrading.
This filter is not access control; acting identity still comes from the authenticated context.

## Acceptance and evidence

Do not rerun a broad acceptance campaign for every style edit. Match verification to the change.
Read the [acceptance procedure](.agents/skills/acceptance-pass/SKILL.md) before refreshing records.

- Exit **0/1** establishes a passing/failing verdict and replaces the designated transcript.
- Exit **2/3** is aborted/refused and leaves that committed record untouched.
- Dataset identity and served-build identity are preconditions, not assumptions.
- Write passes mutate their fixture; never aim them at retained research without separate authority.
- Focus is measured with real keyboard input and a negative control; see the
  [focus procedure](.agents/skills/keyboard-focus-pass/SKILL.md).

The closed development stage measured bounded canonical **133/0/59** and focused **49/49** acceptance. Underlying final
raw archives remain local; earlier committed transcripts measure older builds. A summary in a clone
must not be presented as a clone containing all raw evidence. The remaining qualifications are listed
in the current contract and developer guide, not treated as production approval.

## Repository map

| Path | Purpose |
|---|---|
| `src/ui.tsx` | Page components, styling and composition |
| `src/actions.ts`, `src/store.ts` | Action dispatch and data/model behavior |
| `nakama.plugin.json`, `migrations/` | Host contract and registered migrations |
| `ui/`, `actions/` | Committed build outputs |
| `skills/` | Shipped agent skill |
| `.agents/skills/` | Contributor procedures, not shipped skills |
| `harness/` | Preview, installation and acceptance tooling |
| `vendor/` | Bundled-host installation recipe |
| `docs/` | Current specifications, procedures and version receipt |
| `prototypes/` | Separate design trials, not the served plugin |

For earlier implementation chronology, use the pinned recovery baseline in `docs/README.md` and `git show 8421f72:README.md`.
The long historical README is preserved there rather than duplicated as current operating instructions.
