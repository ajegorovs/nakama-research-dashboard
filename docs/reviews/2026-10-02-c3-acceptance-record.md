# C3 acceptance record — 2026-10-02

Written as the review trail for C3 (the Overview aggregation as the dashboard's default landing). The unit's own
charter, gaps, eight rulings, records and evidence are in [`../ux-v2/C3-overview.md`](../ux-v2/C3-overview.md);
session state and the traps are in [`../ux-v2/C3-handoff.md`](../ux-v2/C3-handoff.md). This file records what the
reviewer ruled, what the record had wrong, and how it was corrected. Same convention as
[`2026-10-02-c1-acceptance-record.md`](2026-10-02-c1-acceptance-record.md).

## Classification

| aspect | state |
|---|---|
| functional acceptance | **accepted — closed by the reviewer** |
| geometry/interaction acceptance | **accepted — closed by the reviewer** |
| visual fidelity | **accepted — closed by the reviewer**, from the fixture Overview montage captured against this build |
| C3 | **accepted** |
| C5 (Repositories convergence) | **unblocked** — row grammar, detail hierarchy, rail density and fidelity; not a rebuild |

## Reviewer acceptance — visual fidelity

**C3: accepted.** The reviewer inspected `docs/ux-v2/fidelity/fixture-tall/side-by-side/overview.png` and
`docs/ux-v2/fidelity/fixture/side-by-side/overview.png` from `origin/composition/c1-topics` and ruled:

> **C3 functional acceptance: closed.**
> **C3 geometry/interaction acceptance: closed.**
> **C3 visual fidelity: closed.**
> **C3: accepted.**

The substance, as the reviewer stated it: the landing reads as the prototype's intended ten-second aggregation
rather than as a disguised Topics page — `Topic activity` the wider left column, `Repository activity` the
narrower right one, both starting together, cards carrying concise movement/context plus a clear drill-in action
— and the absent fifth nav item is visually coherent, with `Overview` as the landing heading and the four real
destinations the only nav choices. The payload-driven differences were ruled **appropriate rather than drift**:
the topic card's honest activity count/recency instead of an invented latest-event title, the repository card's
real newest event, the absent repository window count, and ordering labels that describe the payload rather than
copying the prototype's static "Newest activity first". Explicitly: **do not add data merely to make the two
columns artificially symmetric.**

## Reviewer rulings — the two items the build left open

### 1. The corpus `--write` record is canonical; the C3 write gate is closed

The record generated **2026-10-02 21:12:17** on this asset — `docs/corpus/verify-write.txt`, **175 checks, all
passed, 26 skipped** — is the canonical write item and is **not superseded**. What was stale was the prose
committed alongside it. No bounded settle was needed, and the fixture write record does not substitute for it: it
stands as corroborating cross-dataset evidence. The `SQLiteError: database is locked` / `POST 500` observations
remain an infrastructure/store-runtime item, not a C3 write-acceptance gate.

### 2. A `ui-check <n>` topic is acceptance-write residue, not a corpus marker

Three concepts, not two: **corpus identity, fixture identity, acceptance-write residue**. A contaminated
instance refuses with a truthful diagnosis instead of the misleading "BOTH fixture and corpus markers — a mixed
instance", and the fail-closed behaviour is preserved. The rule to avoid is the dangerous "anything not named
like the fixture must be the corpus". The write pass may still create and operate on its own `ui-check` subject;
ordinary runs afterwards require a re-seed. `wipe-plugin-rows.py` must likewise require an explicit target rather
than defaulting a destructive wipe to the corpus/dev root.

## Rulings accepted on the implementation (reviewer, 2026-10-02)

| item | ruling |
|---|---|
| an **empty** store refuses for either dataset | **accepted** — "'not fixture' is not sufficient evidence for 'corpus'"; treating zero data as a valid corpus identity would make the gate actively misleading |
| residue matches the exact shape `ui-check <digits>`, not the prefix | **accepted** — a legitimate topic whose name merely starts with `ui-check` must not classify as harness residue |
| explicit `--data-root`/`--org` for destructive wipes | **accepted** — preferable to any default, given concrete evidence the old default wiped the wrong instance |
| no history rewrite for `3f60da9` | **accepted** — no force-push, no amended historical commit |

The reviewer also kept **"verified, not assumed"** as a standing rule for instance-state claims, and recorded
that the 82/82 identity cases plus the live injected-residue refusal are what make this a real identity
classifier rather than a naming heuristic.

## Correction to the record — `3f60da9`'s commit message is superseded

**The superseded sentence: the commit `3f60da9` message states that the corpus write item is open.** That
sentence is superseded by (a) the green corpus write transcript committed *beside it in the same commit* —
`docs/corpus/verify-write.txt`, generated 21:12:17 on the final C3 asset, 175 checks, all passed, 26 skipped —
and (b) this acceptance record together with the corrected copies of `C3-overview.md` (its acceptance criteria
included, which had still said "newest activity first / same ordering rule" against ruling 3), `C3-handoff.md`,
`PLAN-UX-V2.md` and `HANDOFF-UX-V2.md`.

**The commit message is not corrected, by ruling, and no history is rewritten** — a force-push or an amended
historical commit was explicitly rejected. The docs are the authoritative correction. Anyone reading the history
should read `3f60da9`'s message with this note: the earlier aborts it reasons about
(`locator.click: Timeout 30000ms exceeded` at 21:01:46, 21:06:30 and 21:10:28) were the harness-navigation
defect the post-reload Topics-selection correction fixed; the run taken after that correction passes every check.

Two further claims in the pre-acceptance prose are corrected the same way, and both were in the pushed artifacts:

- **The instance state was asserted, not measured.** The handoff's "Corpus: 1 topic / 3 axes / 1 person /
  1 repository / 694 activities" was false at the time of writing: the corpus instance was **empty**. The 21:22
  wipe meant for the fixture hit the dev data root (the documented trap, then a permissive default), the fixture
  re-seed that followed restored only the fixture, and the baseline survived only in an older database
  generation — while the live generation (`org_plugins.database_generation`) held nothing and per-file counts
  looked healthy. Remediation: the corpus was replayed back to the documented baseline (695/695 calls, 70.5 s,
  then asserted `1/3/1/1/694`), and the handoff now says **measured, not assumed**.
- **The old identity gate could not have caught it.** An empty store read as "corpus markers" and would have been
  accepted, which is why the empty-store refusal above is a correction and not just an extension.

## Evidence

Served build for every record: **revision 91 / `0.2.0+dev.4dfdb691c706`**, one asset, sha256
`58f01bf1b56c2bf78c78be9096c3462f83be501a7a3923f80bf9915e7c46c554`, served by both instances (the corpus reports
revision 495 on the same bytes), re-verified with `harness/served-build-guard.mjs` on each instance's own env
file and its own web origin.

| record | result | checks |
|---|---|---|
| fixture · 1440×900 | `all checks passed; 1 skipped` | 165 |
| fixture · 1280×800 | `all checks passed; 2 skipped` | 165 |
| fixture · `--write` | `all checks passed; 1 skipped` | 177 |
| corpus · 1440×900 | `all checks passed; 26 skipped` | 163 |
| corpus · 1280×800 | `all checks passed; 27 skipped` | 163 |
| corpus · `--write` | `all checks passed; 26 skipped` | 175 |
| `bun run check` | `126 pass, 0 fail` (764 `expect()`) | — |
| `bun run typecheck:host` | `0 diagnostics` | — |
| `bun run harness:identity` | `82/82 case(s) passed` | 82 |

The identity classifier was exercised against a live instance, not inspected: residue injected through
`reconcile_topic` (`ui-check 55555`) on the fixture, then a fixture run → **exit 3, REFUSED** —
`expected fixture · 3 topic(s) (2 fixture-named, 1 write residue) · 3 of 3 repository(ies) under fixture/ ·
observed the fixture plus acceptance-write residue (ui-check 55555)` — with the committed record untouched, then
re-seeded and green. Both clean paths were re-measured through the new gate to scratch transcripts, so **no
committed record was rewritten**: fixture `all checks passed; 1 skipped`, corpus `all checks passed; 26 skipped`.

## Where the corrections landed

Plugin (`a1e21ab`, pushed to `origin/composition/c1-topics`): `harness/dataset-identity.mjs` and
`harness/test-dataset-identity.mjs` (new), `harness/verify-page.mjs` (the scalar identity block replaced by the
classifier), `package.json` (`harness:identity`), `docs/ux-v2/C3-overview.md`, `docs/ux-v2/C3-handoff.md`,
`docs/ux-v2/COMPOSITION.md`.

Estate (local commits, no remote): `e0232a7` — `services/nakama/PLAN-UX-V2.md`, `services/nakama/HANDOFF-UX-V2.md`,
`services/nakama/README.md`, `services/nakama/scripts/wipe-plugin-rows.py` (explicit target required),
`AGENDA.md` (the store/runtime item the lock deserves, plus the identity-gate update to the harness item) — and
`73fa6f4` for the handoff heading and the repo registry row.

`harness/`, `package.json` and `docs/` sit outside the release digest (the manifest's folders only), so **the
served build is unchanged**: the records above are still the measurement of the bytes both instances serve.

## Next

**C5 (Repositories convergence) is unblocked**: Repositories already has the right index/detail
macro-composition, so the work is row grammar, detail hierarchy, rail density and fidelity — not a rebuild.
