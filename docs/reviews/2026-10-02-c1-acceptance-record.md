# C1 acceptance record — 2026-10-02

Status recorded at the reviewer's direction, at a deliberate stopping point.

## Classification

| aspect | state |
|---|---|
| functional composition | **accepted** |
| write-path acceptance | pending one app-side commit/render diagnostic |
| visual fidelity | pending fresh capture → montage |
| C2 | blocked until both are closed |

## Accepted functional composition

Green with the composition in place — index rail + one persistent detail, the write
affordances folded, the side rail proportional and Current Work dominant:

```
corpus   1440x900   all checks passed; 34 skipped
corpus   1280x800   all checks passed; 34 skipped
fixture  1440x900   all checks passed; 1 skipped
fixture  1280x800   all checks passed; 1 skipped
```

Served build at the time of the fixture runs: revision 381, `0.2.0+dev.8da05dfbdbad`,
served asset sha256 `af71f1ffd59a5227495195801c08840d6c6fd477e27287b2e9bca0e42e824da9`.

Composition decisions this unit settled, all evidence-backed:

- **Side rail is proportional** (`minmax(0, 1fr) minmax(250px, 0.6fr)`). At 1280 Current
  Work is 1.67× the rail (was 1.10× with a fixed 320px rail), index rail unchanged at
  24.4% of the container. The ≥1.25× check stands unchanged.
- **Blocked axes carry the exceptional accent** (3px rule, `data-rd-axis-state="blocked"`),
  normal axes unchanged, no box, no background — colour only for exceptional state (U9).
- **Entity tags are one line** (nowrap + ellipsis, full label on `title`).
- **The note/correction path is reachable and visible by design.** The inline note form
  sits form → side card → side stack → detail grid → panel → split, with no `<details>` in
  its path; the one closed `details[data-rd-write]` is the separate *Record activity*
  surface. Product untouched on this evidence.

Harness faults found and fixed, none by weakening an assertion: probes reading a folded
element's empty `innerText`; a probe reading the retired `data-rd-topic` attribute; a
`get_topic` invariant that counted the page's own load-time read as a duplicate; and a
note probe that assumed the detail pane is a descendant of the `[data-rd-view="topics"]`
element (it is not — it reported 0 inputs for a pane rendering the form the whole time,
while the sibling D7 check counted 1 in the same frame).

## Open: write-path acceptance (one diagnostic)

The write pass aborts because its own librarian-created topic never renders the note
form. Established so far, from the harness side:

- the created topic's row **is** pressed and its pane **is** the one rendering;
  `data-rd-topic-stale="false"`;
- `get_topic` **is** issued for that topic id (the last call in the trace);
- a response body **is** returned — but the harness recorder truncates bodies at 300
  chars, so the returned `result.topic.id` could not be parsed. **That `null` is a
  truncation artifact, not evidence.** Do not conclude from it.

Deciding the branch requires instrumentation inside `ui.tsx`, behind a temporary flag:

- in the `get_topic` effect: `requestedTopicId`, `active`, `result.topic.id`, current
  `expandedId`, and whether `setDetail(result)` executes;
- after render: `selectedEntry.topic.id`, `detail?.topic.id`, and
  `detail.topic.id === selectedEntry.topic.id`.

Branch logic:

- `active === false` before commit → lifecycle/cleanup issue (look at the dev-runtime
  reconnect and rapid `expandedId`/overview updates after the pass's reload);
- `setDetail` runs but ids/gate differ → identity/state flow;
- gate true but the form absent → downstream `selectedDetails` render path.

**Do not change the render gate (`ui.tsx:3890`) and do not add timing workarounds.**

Two preconditions before that run:

1. **Fix the harness recorder first** — store `result.topic.id` explicitly rather than
   recovering identity from a truncated body, so app-side and harness-side evidence line
   up.
2. **Re-seed before each diagnostic run.** Repeated runs accumulate librarian-created
   topics (a previous run's topic appeared three times in the call trace), which pollutes
   the evidence.

Then: rebuild → vendor → reinstall → served-digest guard (see `harness/refresh.sh`, which
restarts the dev instance before the reinstall because a stale SQLite lock otherwise
leaves the new version dark while reporting `lifecycleState enabled`).

## Open: visual fidelity

The Topics montage has **not** been taken from a valid capture and is **not** a review
artifact. The fidelity capture fails with a `{"error":"Not found"}` response — a
routing/path problem, not environment setup. Required before regenerating any montage:

1. print and fetch the exact dashboard page URL;
2. confirm the plugin asset URL resolves;
3. navigate and assert the same durable page markers the acceptance pass uses.

Fail closed: if a layer fails, do not overwrite the screenshot or montage input. The
capture also needs `PROBE_ENV_HELPER=$PWD/harness/env-file.mjs` exported (its own header
documents it) — better, it should fail loudly or resolve the helper itself.

## Hygiene

Uncommitted by design: the throwaway `RD_DIAG` instrumentation and the aborted
write-pass transcripts. They are working records, not acceptance evidence, and must not
enter the acceptance record.
