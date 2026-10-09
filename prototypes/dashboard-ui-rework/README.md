# dashboard-ui-rework — interactive prototype

A **lightweight, self-contained prototype** of the dashboard's information-architecture pivot: a
five-tab shell with an interactive **Topics → Progress** hierarchy (Topic → Axis → Problem), built to be
read and clicked by a reviewer without a build, a server dependency or a database.

- **Not the product.** No framework, no React, no plugin packaging, no backend, no auth and **no
  writes**. It is a design surface for the owner to react to — a *trial*, not an approved design.
- **Frozen, read-only data.** `data.json` is a sanitized export taken from the *supported read actions*
  (`get_overview`, `list_topics`, `get_topic`, `get_progress`) of an existing instance, then reduced to
  **logical aliases** (`topic-1`, `axis-3`, `problem-1`, `repo-1`, `person-1`) with no UUIDs, no org id,
  no account id and no endpoint. The page fetches only these local files — it never contacts an instance.
- **No product source is touched by the prototype.** It lives entirely under `prototypes/` and adds one
  convenience script to `package.json`.

## Run it

```bash
bun prototypes/dashboard-ui-rework/serve.mjs            # http://127.0.0.1:3013
bun prototypes/dashboard-ui-rework/serve.mjs --port 3014
# or, equivalently:
bun run prototype:serve
```

Then open <http://127.0.0.1:3013/>. `/healthz` returns a small readiness JSON. The server is a Bun
one-file static server (no dependencies) on loopback only.

## What it implements

| Area | Behaviour |
|---|---|
| Shell | Five peer tabs — **Overview, Topics, People, Repositories, Progress**. Overview is the default landing. |
| Overview | Honest baseline from the frozen data: counts, research directions, recent activity. |
| Topics | Left = research-direction rows (short title, purpose, status, blocker brief, people, explicit **Select** and **Open axis →**). Right = the direction's development axes. |
| Progress | Left = the axis index (grouped by topic). Main = the **selected axis's full context** (purpose + reading, never summarised), the **problem index**, the **axis plan**, and the selected problem's full statement/status/blocker/work context. |
| People / Repositories | Functional baseline over the frozen data (name/handle/axes; repo description/branch/url/axes). |
| Search | Flat search across topics, axes and problems (top-right). |
| Deep links | The selection is in the URL hash (`#/progress/axis-3/problem-1`), so back/forward and a shared link both work. Selection is **view state only** — never persisted, never written. |

### Deliberate IA choices (carried into the prototype)

- **Axis is a frame, not a folder.** The Progress view shows the selected axis's **full** purpose and
  current reading beside the problem index — nothing is summarised or folded away.
- **The plan is the axis's.** The plan block is labelled *"shared by this axis, not owned by any single
  problem"*; the prototype never infers problem-specific plan ownership.
- **Problem statements are shown in full.** Long statements/titles are line-clamped with a real,
  keyboard-reachable **"Show full statement"** control that reveals the stored text — no invented short
  titles or agent rewrites.
- **Stored step positions are shown as stored** (`stored position 1..4`, human `1..4`) — the prototype
  does **not** rebase them to 0-based (that convention is an open question in the pivot spec).
- **Absent fields read as absent** ("No description recorded in the source."), never fabricated.

## Files

| File | Role |
|---|---|
| `index.html` | the shell: top bar, five tab buttons, five view sections, footer. |
| `styles.css` | tokens (lifted from the frozen contract prototypes) + composition. |
| `app.js` | vanilla render + navigation (hash), search, clamp toggles. No dependencies. |
| `data.json` | the **frozen sanitized export** (the only data the page reads). |
| `build.json` | build identity: sha256 of `data.json` + git HEAD, shown in the footer. |
| `make-build.mjs` | regenerate `build.json` after a data change. |
| `serve.mjs` | Bun static server (loopback). |

## Provenance

`data.json.provenance` records the schema, capture time, source actions, and the counts
(2 topics · 6 axes · 3 problems · 3 repositories · 1 person · 1 plan · 4 steps · 8 events). The raw
envelopes (which carry real ids) are written to the private, git-ignored `.hermes/scratch/raw/` — never
committed. The sanitizer is `.hermes/scratch/probes/build-data.py`.

## Accessibility

One focus indicator for every control from a single rule (`:focus-visible`, an outline that measures
≥ 3:1 against the surfaces it is drawn on). Interactive elements are real `<button>`/`<a>` controls with
accessible names. Motion is disabled under `prefers-reduced-motion`.
