# WP0 — Fresh zero-context validation of the research-fixture methodology (attempt 3, corrected guide)

> **Provenance.** This report was produced against the guide at head
> `a9ba15fd10a01d0ce4f632ef3d2e0bfa693c5f6e` on branch `docs/research-fixture-methodology`:
> the methodology `docs/plans/research-fixture-methodology.md`, the authoring skill
> `.agents/skills/research-fixture-authoring/SKILL.md`, the findings index
> `docs/reviews/public-research-fixture-findings.md`, `docs/PLATFORM-CONTEXT.md`, and the local
> (git-ignored) operational capability handoff `.hermes/scratch/wp0-operational-handoff.md`. It was
> read **cold** (zero prior project/conversation context); no earlier WP0 report or probe was read
> before the conclusions below were formed. It is retained as evidence **including its failure**
> (methodology §9). The two earlier records are preserved unchanged:
> `docs/reviews/wp0-research-fixture-validation-initial.md` and
> `docs/reviews/wp0-research-fixture-validation-rerun.md`.
>
> **Scope: read-only.** No fixture/domain write, no inference, no `reconcile_topic`/`record_activity`,
> no service start/stop/restart, no vendor/reinstall/deploy, no commit/push/merge, no WP1. No
> LLM/model message was sent for any verification — every read was a direct HTTP read, a git/GitHub
> read, or a browser page-load of the plugin UI. The target fixture was not altered.
>
> **Verdict: INCOMPLETE — not a gate pass.** Every representative read-only step executed below
> **succeeded** and every measurement is real, including the served-build identity established by
> byte-level digest at the exact org. But executing the guide exposed **two correctable
> documentation gaps on required routes** that a zero-context session had to resolve outside the
> guide/handoff (see §4). Per the WP0 gate a gap on a **required** route is **INCOMPLETE**, not a
> pass. Neither gap invalidates any measurement; both are documentation-level. A passing WP0 is
> **not** authorization for WP1.
>
> **Sanitization.** Loopback endpoints (`127.0.0.1:…`) are kept verbatim (they identify nobody). The
> target organization's id and name, the account/auth identity behind public-GitHub access, and
> host-specific paths are **withheld** — the target org is written `<targetOrg>` and the credential
> file is referenced by **key name only**. Public GitHub owner/repo slugs and pins are public and
> kept. No secret, token or password value appears.

## 1. Inputs read (cold)

`AGENTS.md`; `docs/plans/research-fixture-methodology.md`;
`.agents/skills/research-fixture-authoring/SKILL.md`;
`docs/reviews/public-research-fixture-findings.md`; `docs/PLATFORM-CONTEXT.md`; and the local
(git-ignored) capability handoff `.hermes/scratch/wp0-operational-handoff.md`.

## 2. Environment observed (read-only)

| Item | Value |
|---|---|
| Branch / HEAD | `docs/research-fixture-methodology` @ `a9ba15fd10a01d0ce4f632ef3d2e0bfa693c5f6e` |
| API base | `127.0.0.1:4399` (loopback — kept verbatim) |
| Dashboard / web origin | `127.0.0.1:3003` (loopback) |
| Plugin id | `research-dashboard` |
| Target org | selected **explicitly** by id (id redacted); login default active org was a **different** org |
| Fixture mode | already seeded (read-only verification) |
| Credentials | key names only (`NAKAMA_EMAIL`/`NAKAMA_PASSWORD`); values read in-process, never printed |
| Browser | cached Chromium `chromium-1234/chrome-linux/chrome` |

## 3. Step-by-step results (actual measurements)

| # | Step | Result | Measurement |
|---|---|---|---|
| 1 | Instance reachability | **PASS** | `GET /health` 200; dashboard `/` 200; `/plugins/research-dashboard` 200 |
| 2 | Login + CSRF | **PASS** | login 200; sets `nakama_session` + `nakama_csrf`; reads work with `x-csrf-token` = csrf cookie |
| 3 | Explicit target-org selection | **PASS (gap D2)** | login default active org ≠ target; switched via `POST /v1/auth/active-org` (subject to CSRF); `/v1/auth/me` then reports target |
| 4 | `get_overview` counts | **PASS** | `counts {topics:2, axes:6, repositories:3, people:1}`, `topicsByStatus {active:2,…}`; the single person link reports `attributable:false` |
| 5 | `get_topic` topic-wide shape | **PASS** | payload has `axes[]` (2 axes); **no** `axis` singular; axis records carry `plan`, `problems[]`, `evidence[]`, `history[]`, `notes[]`, `repositories[]` |
| 6 | `get_topic` scoped shape | **PASS** | payload = `{ok, axis, axisId, coverage, generatedAt, topic}`; `axis` **singular** present, **no** `axes[]`; `coverage` carries `{limit,limitScope,returned,total,truncated,absent}` with `limitScope` = `collection`/`per-source`/`per-problem`; unknown axis returned `{ok:false,error:"Axis not found."}` (HTTP 200 by the host's `{ok:false}` contract) |
| 7 | Plan shapes | **PASS** | 5 of 6 axes `plan:null`; one non-null: `axes[].plan.plan.summary` present and `axes[].plan.steps[].position` = `[null,null,null,null]` (F12 unordered, observed) |
| 8 | `search_dashboard` shape | **PASS** | `{ok, query, axes[], topics[], activities[], annotations[], truncated, limit, includeArchived}` |
| 9 | Frozen public pins resolve | **PASS** | 3/3 exact SHAs exist publicly: UDV `841964d…` (2026-09-28), Grablink `e6f83b2…` (2026-09-24), dashboard `95ec34e…` (2026-10-07) |
| 10 | Declared schema source (F14) | **PASS** | manifest `reconcile_topic.activities[].problemId` present ⇒ F14a **supported**; `record_activity` schema has **no** `problemId` ⇒ F14c defect confirmed; no title-like ref for a new problem ⇒ F14b. `GET /v1/tools` carries **no `inputSchema`** (manifest is the schema source, as documented) |
| 11 | Served-build identity (exact org, real browser) | **PASS** | browser fetched `…/v1/plugins/ui/<targetOrg>/research-dashboard/?import&revision=9&version=0.2.0+dev.78af5cbb87b4`; **URL orgId == target**; served **sha256 `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc`** (154,598 bytes) **== local `ui/app.js`**. Root, bare `/`, and `/app.js` byte-identical; legacy `/ui/app.js` → 404 (all as the guide states) |

## 4. Guide defects found

**D1 — material (readback contract).** The prescribed direct-HTTP transport returns every action
result wrapped as **`{ invocationId, result }`** (`InvokePluginActionResponse` in the host contract;
`apps/server/src/http/routes/plugins.ts` returns `json(invoked)`), but the guide/skill "Readback
shapes" table and `PLATFORM-CONTEXT` stated the field paths directly (`counts.…`, `axes[]`,
`axes[].plan.…`). A zero-context verifier reads the documented path at the top level, gets
`undefined`, and cannot tell from the docs that `result` must be unwrapped. Correct by stating the
envelope (or rooting the field paths at `result`), and require checking the HTTP status and
`result.ok` with no silent fallback.

**D2 — gap (served-identity recipe).** The exact-org recipe said "log in, **select the target org**,
load the plugin page" but the guide, skill **and the private handoff** all omitted **how**. The
session's login default active org was **not** the target, and the browser UI route requires the path
`orgId` to equal the **session's active org**. The mechanism (`POST /v1/auth/active-org`, body
`{orgId}`, CSRF-protected; response echoes `activeOrgId`) had to be discovered from the running
server source (`apps/server/src/http/routes/auth.ts`, `setActiveOrgSchema = z.object({ orgId:
z.string() })`; `orgService.buildAuthUserResponse` returns `activeOrgId`). For pure `x-org-id` read
calls this is unnecessary, but the browser served-identity step cannot be completed from the docs
alone.

Neither gap invalidates any measurement above; both are documentation-level and correctable.

## 5. Scope — a required-route gap blocks, an optional refinement does not

The two gaps above are on **required** routes: the direct-HTTP read envelope every field path
depends on, and the active-org selection the browser exact-org asset check depends on. A missing or
wrong step a zero-context session needs to complete a required transport is **material** and keeps
WP0 INCOMPLETE. An **optional** refinement — clearer wording, a convenience that does not change a
required read — does **not** block. The final re-run is therefore scoped to exactly the required
checks: the read transport and its `{ invocationId, result }` unwrap (plus status/`ok` handling),
the explicit active-org selection (no `orgs[0]`), and the actual served-asset path/digest assertion.

## 6. Provenance and limitations

- **Representative, not exhaustive** (authoritative findings are WP1's job). Scoped reads were
  exercised on one topic/axis; plan shape observed via a single non-null plan.
- Pins verified to **exist** at the exact SHAs; pin **content** was not re-derived here (WP1).
- Viewer-refusal (role < member) was **not** tested — no viewer credential was available; member
  access was used throughout.
- `POST /v1/auth/active-org` changes **session selection state only** (explicitly permitted); no
  domain write was issued; the other two orgs were left untouched.
- Live credentials/CSRF were handled in-process; no secret value appears in any file.

## 7. Recommendation

Correct D1 and D2 in `docs/plans/research-fixture-methodology.md` §11, the authoring skill's
*Readback shapes* / *Served-build identity* / *Operational capability handoff*, and the local handoff
§5/§7; then **repeat WP0 once more on the corrected guide**, scoped to the required transport/wrapper,
active-org selection and actual served-asset checks. Do **not** treat this report as authorization
for WP1 — owner authorization is required separately.

## 8. Raw artifacts (local scratch, git-ignored)

`.hermes/cache/scratch/wp0a-overview.json`, `wp0a-probe.mjs`, `wp0a-scoped.json`,
`wp0a-topicwide.json`, `wp0b-*.{mjs,json}`, `wp0c-plan.mjs`, `wp0d-orgcheck.mjs`,
`wp0e-switch.mjs`, `wp0f-activeorg.mjs`, `wp0g-served.mjs`, `wp0h-tools.mjs` (read-only). Not part of
the clone.
