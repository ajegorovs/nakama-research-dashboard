# WP0 — Fresh zero-context validation of the research-fixture methodology (attempt 4, corrected guide)

> **Provenance.** This report was produced against the guide at head
> `a2e4931e1e81f9dbf226b42e34cf520f60e719a2` on branch `docs/research-fixture-methodology`:
> the methodology `docs/plans/research-fixture-methodology.md`, the authoring skill
> `.agents/skills/research-fixture-authoring/SKILL.md`, the findings index
> `docs/reviews/public-research-fixture-findings.md`, `docs/PLATFORM-CONTEXT.md`, and the local
> (git-ignored) operational capability handoff `.hermes/scratch/wp0-operational-handoff.md`. It was
> read **cold** (zero prior project/conversation context); no earlier WP0 report or probe was read
> before the conclusions below were formed. It is retained as evidence (methodology §9). The three
> earlier records are preserved unchanged:
> `docs/reviews/wp0-research-fixture-validation-initial.md`,
> `docs/reviews/wp0-research-fixture-validation-rerun.md` and
> `docs/reviews/wp0-research-fixture-validation-attempt-3.md`.
>
> **Scope: read-only.** No fixture/domain write, no inference, no `reconcile_topic`/`record_activity`,
> no service start/stop/restart, no vendor/reinstall/deploy, no commit/push/merge, no WP1. No
> LLM/model message was sent for any verification — every read was a direct HTTP read, a git/GitHub
> read, or a browser page-load of the plugin UI. The target fixture was not altered.
>
> **Verdict: PASS (scoped, representative).** Every required transport and identity path is
> executable and was measured against the live instance; no material required-route defect was found.
> One **non-blocking documentation inaccuracy** remains in the rationale wording (§4); it does not
> affect any required step of the recipe. This is a **scoped preflight validation, not an
> authoritative finding determination** — per-finding classification remains WP1's job, and a passing
> WP0 is **not** authorization for WP1.
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
| Branch / HEAD | `docs/research-fixture-methodology` @ `a2e4931e1e81f9dbf226b42e34cf520f60e719a2` (clean) |
| API base | `127.0.0.1:4399` (loopback — kept verbatim) |
| Dashboard / web origin | `127.0.0.1:3003` (loopback) |
| Plugin id | `research-dashboard` |
| Target org | selected **explicitly** by id (id redacted); the login default active org was a **different** org |
| Fixture mode | already seeded (read-only verification) |
| Credentials | key names only (`NAKAMA_EMAIL`/`NAKAMA_PASSWORD`); values read in-process, never printed |
| Browser | cached Chromium (Playwright fallback; the Browser-Use helper was unavailable in this session) |

## 3. Required paths — measured

| # | Path | Result |
|---|---|---|
| 1 | Direct-HTTP read transport + `{invocationId, result}` unwrap | `POST /v1/plugins/research-dashboard/actions/{get_overview,get_topic,search_dashboard}` all **HTTP 200**; body top-level keys were exactly `["invocationId","result"]`; the domain payload was read from `result`; `result.ok === true` in every case. |
| 2 | `get_overview` shape | `result.counts = {topics:2, axes:6, repositories:3, people:1}` (matches the handoff's expected baseline); `counts.topicsByStatus={active:2,paused:0,completed:0,archived:0}`; `topics[].topic` / `people[].person` / `repositories[].repository` nested (not flat); one person with `people[].person.attributable === false`. |
| 3 | `get_topic` topic-wide vs scoped + nested plan | topic-wide: `result.axes` is an **array**, with 2 axes on the **first topic index** and 4 on the **second topic index** (2+4 = the 6 counted above), and **no** `axis` singular. Scoped (`{topicId, axisId}`): `result.axis` **singular object**, `result.axisId` equals the requested id, `result.coverage` present, **no** `axes` array. Nested plan verified: `axes[].plan` is `null` or `{plan:{summary,…}, steps:[{position,…}]}`; a fixture axis carried a plan with `plan.plan.summary` set and 4 steps whose `position` values were **all `null`** (the F12 unordered case). Scoped path `axis.plan.plan.summary` / `axis.plan.steps[].position` confirmed. |
| 4 | `search_dashboard` shape | HTTP 200, wrapped, `result.ok`; keys `{ok,query,axes,topics,activities,annotations,truncated,limit}` (+`includeArchived`); `truncated:false`. |
| 5 | Public pinned sources | All three pins resolve by public GitHub read (representative): `ajegorovs/udv-echo-process@841964d4…` (2026-09-28), `ajegorovs/Grablink-Full-sequence-acquisition@e6f83b2f…` (2026-09-24), `ajegorovs/nakama-research-dashboard@95ec34e5…` (2026-10-07). |
| 6 | Browser authenticate via API in-process + active-org selection | Login (`POST /v1/auth/login`) **200**, session + CSRF cookies captured in-process (never printed). `POST /v1/auth/active-org {orgId:<target>}`, CSRF carried, **HTTP 200**, response echoed `activeOrgId === <target>` exactly. |
| 7 | Actual served-asset identity vs local UI | Page loaded at the dashboard origin (`http://127.0.0.1:3003/plugins/research-dashboard`); the browser's **actual** UI asset request was the plugin **root** `…/v1/plugins/ui/<targetOrg>/research-dashboard/?import&revision=9&version=0.2.0+dev.78af5cbb87b4` (not a literal `app.js`). Path `orgId` equals the target. Fetched bytes **154598**, sha256 `41e61ef5891bfd630a1704d26f144880730f3d842f7d81b79426dd48709787fc` — **equal** to the committed local `ui/app.js` sha256 (154598 bytes). |

Topic axes are reported here by **positional index** (first / second topic), not by topic name: the
fixture's topic names were not captured by these probes and are not asserted.

## 4. Corroborating route facts (measured)

- Bare root, root-with-import-query, and `…/research-dashboard/app.js` all return **200** and
  **byte-identical** content (same sha256). Legacy `…/research-dashboard/ui/app.js` returns **404**
  `{"error":"Not found"}`. Asset route with **no cookie → 401**; with a bogus path `orgId` → **404**.
- **Necessity of the active-org step (browser):** without the `POST /v1/auth/active-org` selection,
  the page fetched a **non-target** org's asset; the login default active org is **not** the target.
  This confirms both the selection step the guide now requires and the "assert the URL's `orgId`"
  guard.
- Served evidence re-measured at run time: build `0.2.0+dev.78af5cbb87b4`, revision `9` (not the
  superseded `…164ccaafbca4` rev 12).
- `active-org` selection is **per-session** (a fresh login returned the non-target default), so no
  persistent account state was changed; no restore was required.

## 5. Non-blocking finding — rationale wording

**D1 (non-blocking, documentation accuracy).** The guide and skill state the UI asset route
"requires the path `orgId` to equal the session's active org." Measured, that equality is **not
enforced on a direct GET**: an asset request whose path `orgId` was the target returned **HTTP 200**
even when the session's active org was a **different** org — only auth plus path-org instance gating
applies (no cookie ⇒ 401; a bogus path org ⇒ 404). The operational recipe remains **correct and
safe** because it **mandates selecting the target as the active org** and then **asserting the
fetched URL's `orgId` is the target** before hashing; and the **page** fetches the **session's
active-org** asset, so a session that skipped the selection would fetch a **wrong-org** byte-stream,
which the URL assertion catches. The accurate rationale is therefore: **the page fetches the active
org's asset, so the explicit selection step is what makes the browser fetch the target org's bytes —
it is not a route-level path-versus-session equality check.**

*Correction applied — rationale wording only.* Plan §11, the authoring skill and the local handoff
now state the accurate rationale. **No functional change to the recipe**: the login, the explicit
`POST /v1/auth/active-org` selection, the page load, and the actual-URL-and-digest assertion are all
unchanged. Being an optional documentation refinement rather than a gap on a required route, it does
**not** keep WP0 incomplete (plan §9).

Nothing else was ambiguous, wrong or missing on a required route.

## 6. Scope and limitations

- **Scoped and representative, not exhaustive** — authoritative findings are WP1's job. Scoped reads
  were exercised on one topic/axis; the plan shape was observed via a single non-null plan.
- Pins were verified to **exist** at the exact SHAs; pin **content** was not re-derived here (WP1).
- Viewer-refusal (role < member) was **not** tested — no viewer credential was available; member
  access was used throughout.
- `POST /v1/auth/active-org` changes **session-selection state only** (explicitly permitted); no
  domain write was issued, and **untargeted organizations were not written to**. This report does
  **not** claim the backing database was byte-unchanged (a SQLite page rewrite elsewhere is possible)
  and does **not** claim any source set was exhaustive.
- Live credentials/CSRF were handled in-process; no secret value appears in any file.

## 7. Recommendation

The guide's required routes are runnable and were measured clean on the corrected guide. Correct only
the rationale wording of §5 (documentation-level; no recipe change). **This report does not authorize
WP1** — the owner must explicitly authorize the authoritative WP1 run *after* WP0 passes (plan §9).

## 8. Raw artifacts (local scratch, git-ignored)

`.hermes/scratch/wp0a4-{http,http2,paths,paths2,served,neg,neg2,ctl,p3}.mjs` (read-only). Not part of
the clone.
