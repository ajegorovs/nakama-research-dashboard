# UI restyling — scope and iteration contract

Status: draft; no visual direction or implementation is selected yet. The four-view plugin and its
rework/hardening are the baseline. This brief authorizes no deployment, fixture mutation, agent inference
or merge. Agree on the visual outcome with the owner/reviewer before substantive restyling.

## Scope and invariants

Restyle the existing Projects, Progress, People and Repositories surface: typography, spacing, palette,
visual hierarchy, shared controls and responsive wrapping. Preserve the current information architecture,
truthful data labels, selected-entity navigation, optional scoped plans, task/activity pagination, source
links, keyboard operation and missing-data behavior. Do not grow the schema, public API or ingestion pipeline.

Use `docs/design/dashboard-information-architecture-pivot.md` for design, the implemented data/API and
maintenance contracts for semantics, `docs/DEVELOPMENT.md` for development and `AGENTS.md` for contributor
rules. Old screenshots and HTML prototypes are historical references, not a mandate to restore five tabs.

## Run without a Nakama instance

A compatible Nakama **source checkout with dependencies installed** is still required. The host's React,
component library, stylesheet and plugin activation runtime are not published standalone packages. A
running Nakama server, login, credentials, installed release or live database is **not** required.

From this plugin repository:

```bash
bun install
bun harness/preview/run.mjs --checkout /path/to/nakama --dataset fixture --rebuild --watch
```

Open the URL printed by the runner (default `http://127.0.0.1:3010/preview.html`). Edit `src/ui.tsx`.
The watcher rebuilds `ui/app.js`; Vite reloads the browser automatically. Fixture payloads are produced
through the real action layer from local inputs. `fixture` is synthetic edge-state data; use `corpus`
for public snapshot density and `scale` for oversized lists. Stop the preview cleanly so generated
files in the host checkout are removed/restored. Read `harness/preview/README.md` for lifecycle details.
Do not run multiple previews concurrently against the same host-generated files.

## Inner loop — agent-owned visual iteration

1. Select one bounded visual outcome within the agreed direction. Read the relevant component/style and
   existing hooks before editing. Capture the baseline in a real browser.
2. Make a small source change; let the bundle rebuild and browser reload. Wait for the settled render,
   fonts and the relevant element's animations rather than using arbitrary long sleeps.
3. Capture and **open/examine the screenshot**. A saved file is not visual verification. Inspect the
   changed view and any sibling using the same primitive, and compare with the baseline.
4. Check actual DOM/computed geometry for suspected overflow, wrapping, clipping or alignment. Use
   actual keyboard input for focus and disclosure behavior. Do not infer correctness from JSX alone.
5. Correct the observed defect and repeat change → settled render → screenshot → examination until
   the bounded outcome is achieved. Avoid unrelated refactors and cosmetic churn.
6. Record a concise before/after finding with dataset, viewport, view/selected subject and bundle identity.
   Put per-iteration shots and notes in ignored `.hermes/scratch/`, not a new documentation diary.

Do not rely on `harness/preview/capture.mjs` or legacy fidelity scripts: they retain retired five-tab
and Overview assumptions. Use browser screenshots or a separately verified small capture harness.
If a required state is absent, report that boundary; do not mutate protected research to manufacture it.

## Representative review matrix

- All four views at 1440×900 and 1280×800.
- Populated and empty states, long titles/descriptions, wrapped repository references, explicit blocked
  tasks, absent plans and evidence, completed-work disclosure, and multiple independent pages where supplied.
- Shared selectors, native disclosures, segmented page controls, internal/external links and real Tab focus.
- `fixture` for edge cases; sample `corpus` and `scale` for density and oversized content before final review.

No mobile design target is silently introduced. If a dataset cannot reach a case, label it untested.
Use outcome-based screenshots plus executable semantic checks; neither replaces the other.

## Outer loop — human/reviewer coordination

Agree once on visual direction, reference examples, intended outcomes and invariants. The agent then owns
reversible implementation and the inner loop; routine screenshots are evidence, not approval requests.
At bounded milestones provide a small comparison set, findings, regressions/limitations and the concrete
questions requiring judgment. The owner supplies visual preference; the reviewer evaluates integrated
behavior and code. Incorporate their feedback through another bounded inner loop.

Pause for decisions on consequential design changes, changed semantics, scope expansion or protected
boundaries. Final package acceptance is an explicit human/reviewer checkpoint. Reviewer acceptance is not
owner permission to deploy, restart, mutate data or merge. Avoid one-hour unbounded subagent tasks and
repeated review ceremonies for individual CSS edits. Agree a bounded pass/time budget before execution;
escalate if iterations stop producing observable improvement.

## Completion gates

- Agreed visual outcomes shown by actually examined before/after screenshots; no clipping or new horizontal
  overflow at the reference viewports, and exact selected-entity navigation/paging preserved.
- Shared keyboard focus remains settled contrast >=3:1 with real keyboard coverage and a failing negative
  control as required by the focus procedure; do not report old focus measurements as fresh evidence.
- `bun run check`, `bun run typecheck:host` against the compatible checkout, and `bun run harness:records`
  pass. Rebuild and include committed installation bundles when source changes affect them.
- A cleanly stopped preview leaves no accidental host-generated files. No credentials or private paths
  appear in public records. Local preview is not authentication, persistence or production acceptance.
- Keep the PR draft until coordinated final acceptance; merge and any bounded served-instance validation
  require separately explicit scope. Retain only the final design decisions and essential evidence,
  not handoff/correspondence accumulation.
