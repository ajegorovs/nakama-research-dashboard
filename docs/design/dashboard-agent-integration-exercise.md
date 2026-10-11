# Dashboard agent integration exercise — smallest practical (proposal-only, then isolated writes)

Status: **design only — no runner implemented, no live run, no writes, no restart.**
This is the small integration exercise the plans call for: one real public-repository investigation through the
dashboard agent, in one existing multi-turn session, **first proposal-only, then separately authorized isolated
writes with readback.** It is written to be read from a clone and carries no personal or machine identity
(loopback only; no endpoints, hosts, credentials, org or profile ids written here — the historical ids and
absolute paths live in the private local plan and are referenced below by **label only**; every historical id is
cited to its source and must be re-confirmed, not trusted).

Read with `docs/design/dashboard-data-and-maintenance-contract.md` (the completed local contract) and
`docs/design/dashboard-minimal-implementation-design.md` (the local implementation). This document adds no
framework and no new E2E campaign.

## 0. Purpose and non-goals

**Is:** the smallest exercise that proves the *integration* works end to end through the intended interface —
the agent reads the dashboard, investigates one real public repository, synthesizes a sourced proposal, and
(on separate approval) applies it to an isolated target and reads it back.

**Is not:** an intelligence benchmark, a new E2E framework, a frozen case registry, or a mandatory revival of
the historical inference-grant harness. It reuses the shipped skill, the existing dashboard tools, the session
transport and the historical session driver.

## 1. Grounding — what exists now (all re-read this pass)

### 1.1 Shipped skill, tool surface, and the actual evidence rule
- Shipped skill: `skills/research-coordinator/SKILL.md` (product skill; currently modified in the working tree).
  It defines the dashboard tools, the refusal kinds (`conflict`, `no-op`, `invalid-state`, `human-authored`,
  `invalid-input`), the read-before-write / `expectedVersion` discipline, and the recorded-transition rule.
- Dashboard tools (deferred-loaded per turn via `find_tools`): `plugin_research_dashboard__get_overview`,
  `…get_topic`, `…search_dashboard`, `…reconcile_topic` (the single write path), `…record_activity`.
- **The evidence rule — what the store actually enforces.** The skill and the `reconcile_topic` tool
  description *instruct* the agent to back a `confirmed` claim with evidence **in the same call** ("a branch, a
  PR number/URL, an activity or an annotation … or the whole update is refused"). The **store** enforces
  strictly less: `assertClaimsAreBacked` (store) refuses a `confirmed` `state`/`currentState`/`blocker` only
  when the axis carries **no evidence at all by the end of the reconcile transaction**, and `axisEvidence`
  (which both the rule and the read projection call) reads the axis's **existing** branch/PR fields and any
  activity or annotation already recorded against it. So **pre-existing evidence counts**: an activity recorded
  in an *earlier* call backs a `confirmed` claim set in a *later* `reconcile_topic`.
  - Verified by a disposable probe of the working-tree store: call #1 records an activity on a new axis; call
    #2 (a separate `reconcile_topic`) sets `currentState` `confirmed` **with no evidence in that call** —
    accepted. (The store is the authority; the tool/skill wording is instruction-level, see
    `plan-implementability-review`.)
  - **Consequence for this document:** a same-call requirement is a **stronger authoring policy this exercise
    chooses**, not a universal product constraint. T2 below adopts it deliberately and must be read as
    exercise policy.

### 1.2 Transport (the supported way to drive the agent)
- `POST /v1/sessions` `{ channel:"web", profileId, model? }` → **201** `{ sessionId }`.
- `POST /v1/sessions/:sessionId/messages` `{ message, stream:true }` → **SSE**, `content-type: text/event-stream`.
  The stream frames are **data-only** (`data: {…}` lines with no `event:` line): the event kind is the `type`
  field **inside** the JSON `data` payload, not an SSE event name. Observed kinds on the historical host:
  `thinking`, `tool_input_delta`, `tool_start`, `tool_end`, `chunk`, `usage`, `done`; the host's stream code also
  emits `todos_updated`, `questionnaire_updated`, `sub_agent_activity` and `error`. Example frames:
  ```
  data: {"delta":"…","type":"thinking"}
  data: {"input":{"query":"…"},"tool":"plugin_research_dashboard__get_overview","toolCallId":"…","type":"tool_start"}
  data: {"result":{…},"tool":"plugin_research_dashboard__get_overview","toolCallId":"…","type":"tool_end"}
  ```
  A parser that keys on an SSE `event:` line will label **every** frame `event:"message"` and match no tool
  event — the historical driver does exactly this (see §1.4).
- Multi-turn = repeated `send` calls to the **same** `sessionId`.
- `GET /v1/sessions/:sessionId/messages` → retained messages; on the historical host (`0.4.31`) these carried
  the ordered `toolCalls` (findings F5), correcting the earlier "public route exposes no tool names" premise.
  Re-confirm against the current host before relying on it; the SSE `tool_start`/`tool_end` capture is the
  authoritative per-turn trace in any case.

### 1.3 Historical artifacts (labels only — ids and absolute paths are in the private plan)
The 2026-10-07 manual five-tool run is the closest precedent. Its artifacts are archived **outside version
control** in the agent working area of the research-dashboard checkout (a fresh clone does not carry them).
Re-confirm before reuse.
- `session-driver.mjs` (`create` / `send`) + `lib.mjs` (env by key name; cookie-jar client). This is the runner
  to adapt — not rebuild.
- The historical five-tool profile **`public-research-5tool`** in an ad-hoc "Public Research Exercise" org
  (findings §3–4). **Historical, re-confirm.**
- Protected stores that must stay untouched: the **Layout Demo** org and the **Nakama E2E Fixture** org
  (findings §1; discovery §5). **Historical, re-confirm.** Their org ids are recorded in the private plan, not
  here.

### 1.4 Known driver defects (must be fixed before reuse)
- **Hardcoded model.** `create` sends `model:"deepseek/deepseek-v4.1-flash"`; findings F6 show an explicit model
  string was **refused 400 "Select a configured model"** even for the configured id, while creating **without**
  `model` succeeded on that same model. So the hardcoded value is not a provider-neutral recipe.
- **False successful exit.** The `send` branch calls `process.exit(0)` regardless of HTTP or semantic outcome,
  so a failed turn looks like success. It needs explicit assertions before it can gate anything.
- **Tool-event selector keyed on the wrong field.** The `send` summary filters `e.event === "tool_start"` /
  `"tool_end"`, but the kind is `e.data.type` (the frames are data-only). As shipped, the summary reports no
  tool events even on a successful turn, and any assertion built on `e.event` silently passes.

### 1.5 The local contract — and its deployment status
The local implementation (`migrations/006-task-plan-text.sql`, `Plan.owner` + retained `axisId`,
`Problem.title`, widened `PROBLEM_STATES = [open,blocked,resolved]`, `record_activity.problemId` wiring,
`getOverview.problemsByState`, per-problem `title`/own-`plan` projections, `searchDashboard` `problems[]`,
`ProgressAxisRow.description`, and the `ScopedPage<T>` `activityPage`/`problemPage` reads) exists in the
working tree **and is not deployed.** Any live exercise that wants to *observe* those fields requires a
separate deployment authorization against the isolated org; the exercise must not assume them installed. In
particular **a problem `title` does not exist on the deployed product** — do not assert it (§5).

### 1.6 Temporary host execution vs future container architecture
Nakama currently runs agents **directly on the host**; reported host Git/gh/credentials/clone paths are
present-environment facts, **not** portable production requirements. Future execution isolation, filesystem
access, credentials and tool provisioning are **unspecified**. Therefore: the exercise and any skill/doc
guidance stay capability-abstract and must **not** bake host paths or authentication into the skill or this
document. Container architecture is a later concern.

## 2. The exercise shape — one session, four turns (T0–T3)

One session (`channel:"web"`), one isolated org, one profile, one real public repository. The four turns are
labelled **T0–T3**. **T0–T2 are read/proposal-only (no writes):** T0 is the read/capability prerequisite, T1
and T2 are the investigation and its precision. A human reviews the proposal; only then is **T3** (writes)
separately authorized.

Reuse before creating: if a **verified** existing session (matching channel/profile) or an existing verified
profile (already carrying the dashboard tools, the web capability of §3-T1, and the `research-coordinator`
skill) is available in the target org, **reuse it** rather than creating a new session or configuring a new
profile. Create/config is the fallback, not the default.

## 3. Concrete prompts (reference the real tools and fields)

**T0 — read / capability prerequisite.**
> Use `find_tools` to locate the research-dashboard tools (and any web/search tools you have) and report the
> exact tool names you found. Then call `get_overview` and report its counts (`axesByState`, `problemsByState`,
> `repositories`, `people`, `recentActivity`) and the topics that already exist. Do not write anything.

*(The acting identity comes from the session, not the prompt — the agent must not be asked for, or pass, an
actor/user id. This turn proves tool discovery and the read path.)*

**T1 — real public-repository investigation (web scraping; `gh`/clone optional, not required).**
> Investigate the public repository `<owner>/<repo>` from the web. Do not clone, and do not use `gh` unless I
> authorize it. Start from a **bounded set of starting sources** — the README, the latest release notes /
> CHANGELOG, and the most recent visible pull-request titles — but treat that as a **starting point, not a
> template**: follow the relevant PR discussion or diff (or a linked issue/doc) when you need it to interpret
> how something evolved, rather than stopping at the surface text. For every finding give three separate
> things: the **source URL**, the **observation** (what the source states), and — labelled separately — your
> **interpretation**. Put anything you cannot confirm from a source under **unknown** rather than guessing.
> Then use `search_dashboard` for the repository and workstream names and tell me which existing topic/axis
> this evidence concerns, or that none exists. Propose — do not apply — the `reconcile_topic` update you would
> send: topic `summary` (concise orientation), `description` (full purpose), one axis with `currentState`, and
> any `problems[]` each with a concise `title`, a full `statement` and an explicit `stateConfidence`. Draft the
> text from sources you actually read.

**T2 — proposal precision (still no writes).**
> Show the exact `reconcile_topic` JSON payload you propose, including `expectedVersion` for any existing topic
> and every evidence field. Mark each of `state`/`currentState`/`blocker` **`confirmed` only if your own
> proposal also carries evidence in that same call** (a branch, a PR number/URL, an activity or an annotation);
> otherwise set `stateConfidence`/`currentStateConfidence`/`blockerConfidence` to `inferred`. If a claim has no
> same-call evidence, say so instead of defaulting it. Do not call `reconcile_topic` yet.

*(This is the **exercise's own stronger policy** — the store would also accept evidence that already exists on
the axis by the end of the reconcile transaction (§1.1); we hold the proposal to the same-call bar
deliberately, because it forces the proposal to show its work. Say plainly in the write-up that this is
exercise policy, not a product guarantee.)*

*(**Schema as data.** The proposal-only turns run with the write tools **unassigned** — the writer
assignments stay removed, so the run stays read-only (§2). To keep the proposal shaped to the real contract,
include the write schema as **data** in the T2 prompt: paste the authoritative
`nakama.plugin.json` → `actions[key = "reconcile_topic"].inputSchema` text (not a paraphrase), so the nested
shape — `topic{}` for the topic text, `problems[].title`, the problem `state` vocabulary
`open|blocked|resolved`, `annotations[].kind` — is discoverable without discovering the tool. A proposal
synthesized from tool *descriptions* alone mis-shapes nested fields; giving the schema text as data removes
that failure without re-assigning any write tool.)*

**T3 — authorized write + readback (separate authorization required).**
> Apply **exactly the operations in my approved list — nothing more.** That list is: `<the one reconcile_topic
> call, pasted verbatim>` and `<any record_activity call(s), listed separately, or none>` — each is its own
> approved operation; no other write is in scope. Do not add an activity, an annotation or a follow-up write I
> did not list. After the approved operations, read back with `get_topic` and `get_overview` and tell me what
> the dashboard now holds: the topic, the axis, the problem ids and their `state`, the recorded activity and
> its `sourceRef`, and the new `version`.
> **Stop / partial policy:** if any call returns `ok:false`, report its `kind` and `error` and **stop** — do not
> retry blindly and do not substitute a different call. On any failed or ambiguous call, mark **PARTIAL**,
> record the exact operations that committed, re-read state, and do not replay or infer a rollback. Resume a
> partial bundle only under renewed, scope-specific authorization from the measured state — never by re-running
> the original admission.

*(If you do not want any `record_activity` write, drop it from the approved list entirely — do not combine
"apply exactly this payload" with an invitation to add extra writes.)*

## 4. Minimal existing-driver adaptations

Reuse `session-driver.mjs`; change only what the defects of §1.4 demand.

1. **`create`** — drop the hardcoded `model`. Either omit `model` (session uses the profile/default — the F6
   path that succeeded) or set it to a **verified** configured selector. Keep `channel:"web"` and `profileId`;
   assert the response carries a `sessionId` (exit non-zero if not).
2. **`send`** — replace `process.exit(0)` with assertions over the parsed `events`, keyed on **`e.data.type`**
   (not `e.event`):
   - `httpStatus === 200` and no `data.type === "error"`;
   - each expected tool appears as a `data.type === "tool_end"` with the matching `data.tool`
     (e.g. `--expect-tools find_tools,plugin_research_dashboard__get_overview`);
   - proposal turns must **not** execute a write tool (`reconcile_topic`/`record_activity` absent);
   - the write turn's `reconcile_topic`/`record_activity` `tool_end` result has `ok === true`;
   - exit non-zero on any failed assertion.
   Keep `--raw <file>` for the SSE audit trail.
3. **Readback** — a small helper that calls the supported reads after the write and diffs the intended vs
   persisted values (topic `version`, problem `state`, activity `sourceRef`; add problem `title` **only** if
   the local contract is deployed).
4. Do not add a new framework, profile manager or grant mint; compose from the routes in §1.2.

## 5. Illustrative offline assertions (not executed — the example documents shape, it is not a runnable gate)

No captured `events-turn*.json` / `readback-*.json` exists yet, so the sketch below is **illustrative**: it
shows the **actual** shapes from §1.2/§1.5, uses no undefined placeholder variables, and is not presented as a
passing test. Wire it only after a real capture, and then assert the real nested problem path.

```js
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// The driver saves { httpStatus, events:[{event,data}] }. Frames are data-only, so the kind is data.type.
const ev = JSON.parse(readFileSync("events-t0.json", "utf8"));
assert.equal(ev.httpStatus, 200);
const kindsFor = (tool) => ev.events
  .filter((e) => e.data && e.data.type === "tool_end" && e.data.tool === tool);

assert(kindsFor("find_tools").length > 0, "agent did not discover tools");
assert(kindsFor("plugin_research_dashboard__get_overview").length > 0);
// proposal-only turns: no write tool may have executed
assert.equal(kindsFor("plugin_research_dashboard__reconcile_topic").length, 0);
assert.equal(kindsFor("plugin_research_dashboard__record_activity").length, 0);

// authorized write turn: the reconcile result reports success
const w = JSON.parse(readFileSync("events-t3.json", "utf8")).events
  .find((e) => e.data && e.data.type === "tool_end" &&
               e.data.tool === "plugin_research_dashboard__reconcile_topic");
assert(w && w.data.result.ok === true, "reconcile_topic did not succeed");

// readback: get_topic nests a problem under its axis (`axes[].problems[]`) — there is no topic-level
// `problems[0]`. A problem `title` only exists once the local contract is deployed (§1.5), so assert
// `state`, a field the deployed product carries; the outer wrapper key depends on the capture route
// (a plugin read is wrapped in `result`, a session tool call returns the value directly) — match your capture.
const topic = JSON.parse(readFileSync("readback-get-topic.json", "utf8"));
const firstProblem = topic.result.axes[0].problems[0];
assert.equal(firstProblem.state, "open");
```

These run offline on saved artifacts; they are the repeatable evidence, not a live dependency.

## 6. Operational inputs (discovered by the operator, or authorized by the owner)

Distinguish three kinds: **(a)** things the operator **discovers** from the running host (no owner decision),
**(b)** things the owner **authorizes** (permission), **(c)** things the owner **chooses** (product input).

| Input | Kind | Note |
|---|---|---|
| Reuse an existing verified profile (dashboard tools + web capability + skill), else create one | (a) discover, fall back to (b) | Look first; do not configure a new profile gratuitously. |
| Reuse an existing verified session, else create one | (a) discover | One session, `channel:"web"`. |
| Exact isolated **org** (new/ad-hoc, or an existing verified one) | (b) authorize | **Not** Layout Demo or the E2E Fixture. Exact id recorded in the private plan. |
| Profile tool/skill assignment: the **five dashboard tools** + the **host web capability** + `research-coordinator` | (a) discover names, (b) authorize assignment | The web capability is the host's builtin web search/fetch (found as `web_search`/`web_fetch` in the pinned host checkout; the profile must carry it or T1 cannot run). **Re-confirm the exact names at run time via `find_tools`; invent none.** `automationsEnabled` off unless an install needs it on. |
| Provider **model selector** for `POST /v1/sessions` | (a) discover | Omit `model` (session default) or read the configured selector from the host (`GET /v1/models` / profile config). This is an operator-side discovery, **not** an owner question — do not ask the owner for a selector string (F6 shows the naive id is refused). |
| The one real public repo + the bounded **starting** sources | (c) choose (default proposed) | Default candidate `heroiclabs/nakama` (real, public). Reading a public repo needs **no owner approval** — propose it as an engineering default; the owner may substitute. |
| Whether the local contract fields are exercised | (b) authorize | Local fields (e.g. problem `title`) require a deployment to the isolated org = separate authorization. Do not claim deployed. |
| Write authorization + "cleanup" rule | (b) authorize | See §7-C; the surface has **no delete**, so cleanup means a throwaway org, not row deletion. |
| Restart | (b) authorize only if proven necessary | Default: no restart. |

## 7. Authorization checklist (bundled; writes gated separately)

**A. Identity/config bundle — verify before reuse (do not trust historical ids):**
- [ ] Exact isolated **org** id confirmed (new/ad-hoc or an existing verified one) — value in the private plan.
- [ ] **Profile** read back: the five dashboard tools **plus the host web capability** (names confirmed at run
  time); the `research-coordinator` skill; `automationsEnabled` value.
- [ ] **Provider/model** path confirmed for `POST /v1/sessions` (omit `model`, or a selector read from the host
  — not the F6-failing string).
- [ ] **Plugin release** deployed to that org **if** the exercise must observe it — separate deployment step;
  never claim the local working-tree contract is installed.

**B. Execution bundle — read/proposal (read-only):**
- [ ] Permission to use one web session and run the proposal-only turns (**T0–T2**).

**C. Write bundle — separate, explicit:**
- [ ] Permission to make **live test writes** via `reconcile_topic` / `record_activity` **into the isolated
  org only**, listing the exact approved operations (see T3).
- [ ] Permission for **cleanup**, acknowledging the surface **deletes nothing** — history is permanent — so the
  isolated org is throwaway and protected stores are snapshotted before/after.
- [ ] Explicit confirmation that the **Layout Demo** and **E2E Fixture** orgs are not touched (record their
  before/after).

**D. Restart:** only if a restart is **proven necessary**. Default = no restart.

**E. Evidence:** capture SSE `--raw` per turn plus retained messages; assert tool dispatch separately from
answer wording (a grounded-looking answer without a `tool_end` trace proves nothing).

## 8. Boundaries and honesty

- The local contract is in the working tree and **not deployed**; the exercise must not assume its fields are
  live. An exercise that observes them needs a separate deployment authorization.
- Historical ids (the ad-hoc research org, the Layout Demo org, the E2E Fixture org) and the absolute artifact
  paths are **cited from the 2026-10-07 findings** to their source and recorded in the private plan; they must
  be re-confirmed, not trusted.
- **No synthetic evidence passed as real.** Investigation uses real retrievable public sources; any offline
  fixture is labelled synthetic and never given a real-looking source URL.
- The driver's hardcoded model, false-success exit and tool-event selector are **defects to fix before reuse**.
- No runner is implemented by this document; no live run, write, profile change, inference, deployment or
  restart is authorized here.
