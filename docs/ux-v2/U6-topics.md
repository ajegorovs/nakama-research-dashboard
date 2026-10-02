# U6 — the Topics control cleanup (D7 executed)

**Status:** executed · read pass re-recorded from the U6 build · parent commit `780a7d2`
**Ruling executed:** [`DECISIONS.md`](DECISIONS.md) §1 —

> **Topics is primarily a read/navigation surface. Broad `Add topic` and `Edit fields` controls should
> not be part of the normal Topics UI. Structural changes normally go through the librarian; narrow
> note/correction/steering affordances are acceptable.**

The frozen contract was **not** rewritten (`git diff <baseline>..main -- docs/ux-v2/contract/` stays
empty). This record is the erratum the reviewer asked for, and the change is the U6 refinement item the
U11 acceptance left open.

## 1. What the page lost, and what it kept

Removed from `src/ui.tsx` (net **−211 lines**, bundle `ui/app.js` **103,219 → 97,814 bytes**):

| Control | Was | Why it goes |
|---|---|---|
| `Add topic` form (`New topic name` + submit) | In the Topics toolbar row, always visible | Creating a topic is the librarian's job (`reconcile_topic`, covered by the store/action tests) |
| `Edit fields` / `Done editing` | A per-card mode switch (`data-rd-edit-open`) | D7: no broad edit control; the page has no edit mode |
| The topic-field editor (`data-rd-topic-editor`) | Description, approved summary, status change + its rationale, `Save` | Structural change → librarian. The page's second mode existed only to host it |
| The topic activity recorder (`Activity` + `Record activity`) | Inside the editor | Same class: recording work on a topic is a librarian/agent write |
| State and plumbing | `editing`, `Draft` type, `startEditing`, `createTopic`, `saveDetails`, the `setEditing` calls, the `"edit"` value of `data-rd-mode` | Dead once the controls are gone |

Kept (unchanged, and the reason the removal is not a capability loss on the read surface):

- **`Read topic` / `Close`** — the card's one disclosure control, now its only control.
- **The topic note** (`Topic note` + `Add note`) — was *already* outside the editor, inline in the read
  detail, so nothing had to be re-homed. It is the narrow affordance D7 keeps.
- **The axis correction** (`Correct` / `Save correction`) — a manager's correction to one axis, also
  outside the topic editor.
- The **topic-level conflict banner** (`data-rd-conflict`, no axis) — the refusal surface for any
  topic-scoped write the page still makes (the note path). Kept rather than deleted: it is the page's
  honest handler, and deleting it would have removed the *response* to a refusal that can still occur.

`data-rd-mode` now reads `read` · `collapsed` only — no third value.

## 2. Coverage accounting

The harness was not weakened; its composition changed, with a reason per line.

| Check | Before | After |
|---|---|---|
| header inventory | asserted `Add topic` **present** (`addTopic: true`) | asserts **absence**: `createControl: false`, `editControl: false` |
| "the form appears only from `Edit fields`" | `mode === "edit" && editor === true` | **retired** — the mode and the editor no longer exist (D7 is the reason) |
| "finishing an edit returns to reading, with the card still open" | `mode === "read" && editor === false` | **retired** — there is no edit to finish |
| — | — | **added:** "the card offers no broad edit control (D7: Topics is read-first)" — `edit-open 0`, `Edit`/`Done` labels `0`, editors `0` |
| — | — | **added:** "the narrow note affordance is inline, with no mode to enter (D7)" — the note input renders in the read detail and the card's mode is `read` |
| "switching back to Topics restores the topic view…" | also asserted the create form **present** (`.rd-newtopic` count `1`) | asserts it **absent** (`create form 0`), same intent otherwise |

Net counts are unchanged (**84 · 0 · 22** corpus, **107 · 0 · 0** fixture) — two retired, two added, two
flipped — so the change is visible in the transcript's *composition*, not in its totals.

Two harness bugs were found and fixed while doing this, both worth stating because either would have
produced a green check on a page that was not what the check described:

1. **`data-rd-mode` is an attribute of the card element itself**, not of a descendant, so
   `card.querySelector("[data-rd-mode]")` returned `null` and the check failed for the wrong reason.
2. **An absence check passes vacuously on an unexpanded card.** The checks above it only need the card's
   own axis rows, which a collapsed card renders too, so the pass now opens the detail explicitly
   (`Read topic` if the card is not already in read mode) and waits on the page's own marker before
   reading the detail. The first run exposed this as a **flake** in the corpus 1440x900 pass (four
   detail checks failed together); with the guard, all four runs are deterministic.

## 3. Records (this build, isolated instances)

| Dataset | Viewport | Result | Verdict sequence |
|---|---|---|---|
| corpus | 1440x900 | **84 pass · 0 fail · 22 skip** | `3bf99625bd77` |
| corpus | 1280x800 | **84 pass · 0 fail · 22 skip** | `3bf99625bd77` |
| fixture | 1440x900 | **107 pass · 0 fail · 0 skip** | `2158b0c99910` |
| fixture | 1280x800 | **107 pass · 0 fail · 0 skip** | `2158b0c99910` |

Verdict sequence = `sha256` over the transcript's `PASS|FAIL|SKIP` lines with their detail text removed.
It is **different from the U11 baseline** (`56d284c3d9` corpus, `49e7652baa` fixture) — expected, because
the check *set* changed: the sequence hashes the checks, so removing two and adding two necessarily moves
it. Same totals, different composition, and both viewports agree.

Transcript diff against the accepted records is exactly the composition change plus one known field:

- the five header/inventory lines above;
- the corpus's `Recent: N events` summary moved `584 → 560` — the known **time-relative projection**
  behaviour (wall-clock window), recorded in U10 §5 and explicitly not a failure; the fixture, whose
  topics carry fixed timestamps, shows no such move.

## 4. Release identity

`bun run build` → `bash vendor/vendor-into-nakama.sh` → `bun run harness:reinstall` on **both**
instances. Three-way byte match on the entry point:

| Where | sha256 (prefix) |
|---|---|
| repo build `ui/app.js` | `2eeff57af5433cb22889` |
| vendored `packages/plugins/research-dashboard/ui/app.js` | `2eeff57af5433cb22889` |
| served release `<data-root>/plugins/research-dashboard/0.2.0+dev.ec820fb02ca3/ui/app.js` (both instances) | `2eeff57af5433cb22889` |

Version **`0.2.0+dev.ec820fb02ca3`** (revision 12, `lifecycleState enabled` on both instances;
previously `0.2.0+dev.5a98360ab6cc`). Both instances re-seeded nothing — this is a UI-only change, and the
corpus store is untouched by the read pass.

## 5. The write pass was trimmed to the surviving surface

`harness/verify-page.mjs --write` was never committed evidence (there is no `verify-write.txt` in the
repo), but a tool that drives removed controls would rot into a lying script. It now:

- asserts the absence first (the same four facts as the read pass) — so re-adding a control fails here;
- creates its working topic **through the action** (`reconcile_topic`) rather than from the page, which is
  the librarian path D7 names;
- exercises the **note write** end to end (fill `Topic note` → `Add note` → the text renders in
  Corrections & notes) — new coverage for the affordance that survived;
- opens the card with `Read topic`, and keeps the axis-correction flow unchanged;
- **retires the page-side "behaviour 1 of the conflict contract" check.** That behaviour had exactly one
  page entry point — the topic-field editor's save — so there is no page-side revision-guarded
  topic-scoped write left to trigger it. The behaviour itself is unchanged and stays covered by the
  store/action tests (H2's ruling). The topic-level banner remains in the UI and the axis-level half of
  the contract is still asserted where it renders.

## 6. Language this supersedes (no history rewritten)

- `docs/ux-v2/contract/interaction-spec.md` (and the estate copy) — **frozen, untouched.** Its
  "Add Topic / Edit Fields" checklist item is the item the acceptance checklist already words the other
  way; the clarification is in `DECISIONS.md` §1, per the ruling.
- `docs/layout-pr/README.md`, `docs/layout-rework-brief.md` — dated stage records; left as written.
- `docs/corpus/README.md` — its `dashboard-detail.png` caveat ("the only route into a topic's axes is
  `Edit fields`") carried a one-line supersession note, because that README is a living document. The
  regenerated detail capture no longer shows an editor.
- `docs/ux-v2/U10-harness.md` §5 and `docs/reviews/2026-10-02-u10-robustness-sweep.md` — dated measurements
  of the harness *as it stood*; the two waits they inventory (editor appears / editor gone) are the ones
  this step removed.

## 7. Still open (unchanged by this step)

- **H1** — keyboard focus visibility: still the main executable UI-hardening gap; a browser check that
  focuses a control and compares its rendered focus style against the unfocused one.
- **U5/U8/U9** — visual-density/emphasis polish, the reviewer's next order after U6.
- **Not production-deployed** — standing wording (H3): merged, installable, reproducible.
