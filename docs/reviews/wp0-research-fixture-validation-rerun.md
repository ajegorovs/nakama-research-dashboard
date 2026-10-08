# WP0 — Fresh zero-context re-run validation of the research-fixture methodology (corrected guide)

> **Provenance.** This report was produced against the **corrected** guide at head
> `b8ba44034b286acdd9a332b469df7d6174ab0cc5` on branch `docs/research-fixture-methodology`:
> the methodology `docs/plans/research-fixture-methodology.md`, the authoring skill
> `.agents/skills/research-fixture-authoring/SKILL.md`, the findings index
> `docs/reviews/public-research-fixture-findings.md`, and `AGENTS.md`. It was read **cold** (zero
> prior project/conversation context); the earlier WP0 records were read **only after** the
> conclusions below were reached. It is retained as evidence **including its failure** (methodology §9).
>
> **Scope: read-only.** No fixture/domain write, no inference, no `reconcile_topic`/`record_activity`,
> no service start/stop/restart, no vendor/reinstall/deploy, no commit/push/merge, no WP1. No
> LLM/model message was sent for any verification — every read was a direct HTTP read, a git/GitHub
> read, or a browser page-load of the plugin UI. The target fixture was not altered.
>
> **Verdict: INCOMPLETE — not a gate pass.** Every representative step was executable from the
> supplied docs + the explicit operational handoff, and the served-build identity was established by
> measurement (byte-level digest, exact org). **But the authoring skill's scoped `get_topic` readback
> row is materially wrong** (see §4 D1): it documents the scoped response as "the same axis object
> under `axes[0]`", while the real response carries the axis under **`axis` (singular)** and no `axes`
> array at all. A verifier resolving F03/F04/F08 through a scoped axis read would look in the wrong
> place and could record the read as empty. A guide with a wrong readback shape on a required route is
> **not runnable as written**, so this re-run is **INCOMPLETE**: the guide is corrected from this
> report (§4), and the run must be **repeated on the corrected guide** before any output is relied on.
> This is a WP0 report only — **not** WP1 authorization.
>
> **Sanitization.** Loopback endpoints (`127.0.0.1:…`) are kept verbatim (they identify nobody). The
> target organization's id and name, the account/auth identity behind public-GitHub access, and
> host-specific paths are **withheld**; the target org is written `<targetOrg>` and the credential
> file is referenced by **key name only**. Public GitHub owner/repo slugs and pins are public and kept.
> No secret, token or password value appears.

## 1. Inputs read (cold)

`AGENTS.md`; `docs/plans/research-fixture-methodology.md`;
`.agents/skills/research-fixture-authoring/SKILL.md`;
`docs/reviews/public-research-fixture-findings.md`; `docs/PLATFORM-CONTEXT.md`; and the local
(git-ignored) capability handoff `.hermes/scratch/wp0-operational-handoff.md`. The prior WP0 report
(`docs/reviews/wp0-research-fixture-validation-initial.md`) was read **only after** the conclusions
below were reached.

## 2. Environment observed (read-only)

| Probe | Observed |
|---|---|
| Branch / HEAD | `docs/research-fixture-methodology` @ `b8ba44034b286acdd9a332b469df7d6174ab0cc5` (clean) |
| API listener | `127.0.0.1:4399` — `/health` → 200 |
| Dashboard/web origin | `127.0.0.1:3003` — `GET /` → 200, `GET /plugins/research-dashboard` → 200 |
| Other store listeners | `4400`, `3005` closed (matches the handoff) |
| Public GitHub | `gh` authenticated (account identity withheld), `repo` scope present |
| Orgs (read-only) | 3 orgs; **target found by exact id** (`<targetOrg>`, name withheld); not `orgs[0]` |
| Mode-600 env file | present, mode 600; keys read **in-process**, **no value printed** |

Credentials were read in-process only; the browser never received a password — the session was
injected as a cookie.

## 3. Step-by-step results (representative WP1 read-only)

| # | Step | Result | Exact evidence |
|---|---|---|---|
| S1 | Checkout/docs adequacy | **PASS** | HEAD = tested head `b8ba440…`; plan, skill, findings, handoff all present. |
| S2 | Explicit target org (never `orgs[0]`) | **PASS** | `/v1/auth/orgs` listed 3; target matched by exact id; other two orgs untouched. |
| S3 | Read-only dashboard transport, no LLM | **PASS** | `POST /v1/plugins/research-dashboard/actions/{get_overview,get_topic,search_dashboard}` with `x-org-id` + `x-csrf-token`; 200s. |
| S4 | Baseline `get_overview` + nested shape | **PASS** | `counts {topics:2, axes:6, repositories:3, people:1}`; `topics[].topic`, `people[].person`, `repositories[].repository` all nested as the skill states. |
| S5 | `get_topic` topic-wide shape | **PASS** | Returns `topic`, `axes[]`, `axisCounts`, `activity`, `notes`, `counts` (plus `generatedAt`/`people`/`repositories`/`annotations`/`ok`). |
| S6 | `get_topic` **scoped** (`axisId`) shape | **FAIL (guide)** | Actual returns the axis under **`axis` (singular)** with top keys `{ok, axis, axisId, coverage, generatedAt, topic}` and **no `axes` array**. The skill says "the same axis object under `axes[0]`, plus `coverage`". Confirmed against `src/actions.ts` (`store.getAxisWorkstream` → `{axisId, axis, coverage}`; `AxisWorkstream` in `src/store.ts`). |
| S7 | `search_dashboard` shape | **PASS** | `{ok, query, axes[], topics[], activities[], annotations[], truncated, limit}` (plus `includeArchived`). |
| S8 | Plan readback shape | **PASS** | One axis plan: `axes[].plan = {plan:{…,summary}, steps[]}`; summary at `axes[].plan.plan.summary`; order at `axes[].plan.steps[].position`. **All 4 positions `null`** → independently reproduces **F12 (verified)**. |
| S9 | Public source pins resolve | **PASS** | All three pins resolve via `gh api`: `ajegorovs/udv-echo-process@841964d4…` (2026-09-28), `ajegorovs/Grablink-Full-sequence-acquisition@e6f83b2f…` (2026-09-24), `ajegorovs/nakama-research-dashboard@95ec34e5…` (2026-10-07). |
| S10 | File readback at a public pin (date-basis method) | **PASS** | `src/actions.ts` at the dashboard pin is byte-identical to this checkout's copy (sha256 `9964d4a52e4b00c0b836f5d8beebc22d3298e045163cfb1e5cc9e8494c32b25b`); the last file-touch at/before pin resolves for the date-basis rule. |
| S11 | **F14c** at exact source | **PASS (verified)** | `record_activity` case (`src/actions.ts` L361–386) builds `store.addActivity` with **no `problemId`** → F14c schema defect confirmed from source. `problemId` appears only in `manage_external_enrollment`'s "map" (a different path). |
| S12 | Live tool surface `/v1/tools` | **PASS (limited)** | Tools listed by `name` (`plugin_research_dashboard__*`) **without an `inputSchema`** — so the live surface cannot settle F14; the source read (S11) is the correct method. |
| S13 | **Served-build identity — exact org, by the actual page asset** | **PASS (by measurement)** | Logged in + set session active org to `<targetOrg>`; the real page (`/plugins/research-dashboard` on `3003`) fetched `http://127.0.0.1:3003/v1/plugins/ui/<targetOrg>/research-dashboard/?import&revision=9&version=0.2.0+dev.78af5cbb87b4`. **Path orgId asserted == target.** sha256 **`41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`** (154,598 bytes), **identical to this repo's own `ui/app.js`**. Re-measured at re-run time; not the historical `…164ccaafbca4` snapshot. |
| S14 | Asset route org-scoping (negative) | **PASS** | `…/ui/<targetOrg>/research-dashboard/app.js` → 200 (identical digest); legacy `…/ui/<targetOrg>/research-dashboard/ui/app.js` → **404**; a request under a **different** org path while the session active org = target → **400** "Organization context conflict" (matches `servePluginUi`). |
| S15 | Handoff gotcha (env `NAKAMA_DASHBOARD`) | **PASS (confirmed)** | The env-file `NAKAMA_DASHBOARD` points at the API (`4399`), not the web origin; the SPA is served on `3003`. Navigating the env value yields `{"error":"Not found"}` and no plugin asset. |

## 4. Material guide defects

**D1 (material) — scoped `get_topic` readback shape is wrong.**
The skill's *Readback shapes* table said the scoped (`axisId`) read returns "the same axis object
under `axes[0]`, plus `coverage`". The real response puts the axis under **`axis` (singular)** and
carries **no `axes` array** (`{ok, axis, axisId, coverage, generatedAt, topic}`), confirmed both by
measurement and by source (`src/actions.ts`: `store.getAxisWorkstream` returns `{axisId, axis,
coverage}`; `AxisWorkstream` in `src/store.ts` has fields `generatedAt, topic, axisId, axis,
coverage`). A verifier resolving F03/F04/F08 through a scoped axis read would look in the wrong place
and could record the read as empty.
*Fix applied:* the skill's row now reads `get_topic` scoped → `{ ok, axis, axisId, coverage,
generatedAt, topic }` (axis under `axis`, not `axes[0]`), and the plan element paths are split into
topic-wide (`axes[].plan.plan.summary` / `axes[].plan.steps[].position`) and scoped
(`axis.plan.plan.summary` / `axis.plan.steps[].position`).

**D2 (minor) — served asset URL is the plugin root, not literally `app.js`.**
The guide called the served asset `…/research-dashboard/app.js`; the **actual page fetch** is
`…/research-dashboard/?import&revision=…&version=…`. Both (and the bare `/`) serve **byte-identical**
content, so the digest is unaffected — but the "take the actual asset URL the browser fetched" recipe
and the literal `app.js` wording read as inconsistent, and a guessed literal path is not
authoritative.
*Fix applied:* the skill and plan now state the page fetches the plugin **root** asset, that the
root/`app.js` resolve to the same bytes, and that the **sha256 is the authoritative identity** while
the URL's `orgId` must be asserted.

**D3 (minor) — `/v1/tools` does not carry tool input schemas.**
The live surface lists plugin tools by name but with no `inputSchema`, so F14a/F14c cannot be settled
from it; verifying from `nakama.plugin.json` / `src/actions.ts` is the right and only route. Worth
stating explicitly so a verifier does not treat `/v1/tools` as the F14 source.
*Fix applied:* the skill and plan now state that declared inputs are settled from the manifest and
action definitions, **not** from the tool-discovery listing.

## 5. Sources / input sufficiency

- **Docs + the explicit handoff: SUFFICIENT** to run every representative step above — the handoff
  supplies instance URLs, the explicit target org, the credential path by key name, the direct-HTTP
  read transport, the frozen pins, and browser support. The one blocker to a clean WP0 is **D1** (a
  wrong documented readback shape), not missing access.
- **Docs alone (without the handoff): NOT sufficient** — the live values legitimately live in the
  local handoff only.

## 6. Boundaries observed

Read-only throughout. No service restarted; no fixture/domain write; no reinstall/vendor/deploy; no
commit/push/merge; no WP1; no LLM turn. Browser password fields were never used (the session was
injected as a cookie; the vault had no entry, and none was created). The other two orgs were
untouched. No finding here is promoted to authoritative WP1; WP1 owes the exhaustive per-finding
classification.

## 7. Raw artifacts (local scratch, git-ignored)

`wp0v2-probe.mjs`, `wp0v2-probe2.mjs`, `wp0v2-served.mjs`, `wp0v2-hash.mjs`, `wp0v2-tools*.mjs`
(read-only). Not part of the clone.
