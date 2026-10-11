# Development and verification

## Fast UI loop

Use Bun and a compatible Nakama checkout with dependencies installed. The preview mounts the
real plugin bundle through host React/components/styles and answers from synthetic or corpus
fixtures; no live API, credentials or research database is needed.

```bash
bun install
bun harness/preview/run.mjs --checkout /path/to/nakama --dataset fixture --rebuild --watch
```

Edit `src/ui.tsx`; the build watcher updates `ui/app.js` and Vite reloads the browser.
Datasets: `corpus` for public snapshot density, `fixture` for synthetic edge states, `scale`
for oversized lists. The host checkout's generated preview files are cleaned/restored on exit.
See `harness/preview/README.md` for lifecycle and identity details. Legacy capture/fidelity
scripts have retired five-tab assumptions and are not current visual acceptance tools.

## Gates

```bash
bun run check
bun run typecheck:host
bun run harness:records
```

The host check requires `NAKAMA_CHECKOUT`. `check` is source types + build + source tests + root
harness unit tests, not every optional harness suite and not served acceptance. Committed
`ui/app.js` and `actions/actions.js` are generated outputs, never edited by hand.
The established closed-stage measurements were 376 source and 47 harness tests, zero failures;
counts may change. There is no configured GitHub CI workflow.

## Served loop

Build/check → vendor into the actual running host checkout → install/reinstall into an explicitly
selected organization → assign capabilities to the explicitly selected profile → served-build guard.
The root README has the commands. Match URL, web origin, env file and organization as one target.
Capability assignment is additive/idempotent and uses cookie+CSRF+org headers with readback.
Install/reinstall retains a single-org fallback; contributor procedures deliberately name the org.
The guard requires `NAKAMA_DASHBOARD` in its environment and hashes raw browser-response bytes.
It does not select an organization: verify active org and org-scoped asset path separately.

A release's digest folder and raw bundle SHA identify bytes; per-instance revision numbers are
not comparable across machines. A successful reinstall is not proof those bytes are served.
Restart only under operator authorization and only if fresh guard output requires it. Keep
credential files outside the repository; back up SQLite consistently including WAL state.

## Acceptance scope and limitations

Match verification to the change; do not reopen a broad campaign for every style edit.
The acceptance contributor skill governs served-build/dataset identity, output paths, archive
handling and write-pass re-seeding. Exit 0/1 is a verdict; 2/3 leaves the existing record untouched.
Synthetic writes belong only in separately authorized disposable instances.

The closed rework stage had bounded canonical 133 PASS / 0 FAIL / 59 SKIP at 1440×900 and
1280×800, plus focused 49/49 evidence/history/control checks. Those are historical measured
boundaries, not 100% coverage or production acceptance. Raw final archives were local, not
bundled in this clone. Completed-work folding, empty notices and bare repositories were accepted
only for their tested subjects. Prior keyboard-focus figures were not re-taken by this cleanup.
Current contract qualifications are listed in the data/API contract.

## Optional tooling is not the product

The E2E, librarian-generation, WP5 and correction harnesses retain test inputs and optional
package commands. They are not required to restyle or install the plugin; running agent turns,
fixture mutations or collector scheduling needs separate explicit scope. Their presence does
not imply production readiness. Byte-pinned evaluator templates/rubrics must not be rewritten
as ordinary prose: verify hashes and consumers before changing those inputs.

## Historical recovery

Retired specifications, review correspondence, handoffs and execution records remain in normal
Git history. `docs/README.md` pins the pre-cleanup baseline. Source comments citing retired paths
are provenance, not current instructions. Screenshots remain temporarily as historical visual
references until the next UI work; they are not the current specification.
