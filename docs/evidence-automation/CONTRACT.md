# Evidence Automation V1 — frozen external-worker contract

Status: **frozen for wave 1; implementation underway, not accepted.** This is the transport and envelope
contract the wave-2 synchronizer is built against. It is expressed against the `research-dashboard` plugin on
a host that ships this wave. Changing any field, status or code here is a contract change, not an
implementation detail.

## 1. Authentication and capability

The worker authenticates as a **collector principal**: an organization-scoped API key whose `scope` is
`collector`.

- Create it (org admin only, browser session): `POST /v1/orgs/{orgId}/api-keys`
  body `{ "name": "<label>", "scope": "collector", "expiresAt": null }` → `201 { key, secret }`. The
  `secret` is shown once and is the bearer token. It has the form `nk_live_<64 hex>`.
- Every collector request carries the header `Authorization: Bearer <secret>`. The secret is a
  credential and must never appear in logs or artifacts. `X-Org-Id` is optional; when present it must equal
  the key's organization or the request is rejected `400 Organization context conflict`.
- The key's **creating user must still be a member of the organization**; a removed creator makes the key
  fail authentication (the org middleware resolves membership). This is the one operational coupling to
  document for provisioning.
- A collector key is **denied by default** on every route except the two collector endpoints in §2. It cannot
  reach reconciliation, admin, org, other plugin actions or the generic plugin-action endpoint at all
  (`403 Forbidden`).
- A member or browser session **cannot** use the collector endpoints (`403 Forbidden`), and the generic
  plugin-action endpoint refuses the collector-only action keys, so no person can hand-write evidence.

## 2. HTTP endpoints

Base path: `/v1/plugins/research-dashboard`.

| Method | Path | Principal | Body |
|---|---|---|---|
| POST | `/collector/ingest` | collector | `{ "envelope": <EnvelopeV1> }` |
| POST | `/collector/readback` | collector | `{ "providerHost", "repositoryId", "eventKind", "objectId" }` |
| POST | `/collector/enrollment` | org admin | `{ "operation": "enroll" \| "map", ... }` |
| GET | `/collector/enrollment` | org admin | — |

The enrollment endpoints are the scoped server API that creates mapping authority. They exist for controlled
setup and are **not** implemented for the worker; only test fixtures exercise them today.

A malformed **readback** identity (a short SHA for `commit.observed`, a malformed PR node id for
`pr.merged`, a non-numeric repository id, an unknown host) is refused as `rejected` (HTTP 400), never
answered `not_found` — a worker must not be told "no such fact" for an identity it could never have written.

Successful ingest/readback responses are the plugin action result plus an `invocationId`:

```json
{ "status": "inserted", "ok": true, "reason": "recorded",
  "receipt": { "id": "...", "activityId": "...", "canonicalEventKey": "pr.merged:PR_...",
               "payloadDigest": "...", "objectId": "...", "eventKind": "pr.merged", ... },
  "invocationId": "..." }
```

## 3. Envelope v1

Only `pr.merged` and `commit.observed` are accepted. Everything else is rejected — open PRs, issues,
lifecycle transitions, snapshot revisions and corrections are out of V1 scope.

The example below is a **clearly synthetic fixture** (repository `acme/widgets`, PR `1234`); its ids and SHAs
are illustrative and are not a claim about any real repository or pull request.

```jsonc
{
  "envelopeVersion": 1,
  "provider": "github",
  "providerHost": "github.com",
  "repositoryId": "424242",                    // immutable numeric id — THE dedupe identity
  "repositoryNodeId": "R_kgDOExample",         // optional display/provenance
  "repositoryFullName": "acme/widgets",        // mutable display metadata, not identity
  "eventKind": "pr.merged",                    // "pr.merged" | "commit.observed"
  "objectKind": "pr",                          // must pair: pr.merged↔pr, commit.observed↔commit
  "objectId": "PR_kwDOExampleAAAABFjEqcg",     // pr: PR node id; commit: full 40-hex SHA
  "objectNumber": 1234,                        // PR number; must equal payload.number
  "defaultBranch": "main",                     // observed branch; must equal the enrollment's approved branch
  "payload": {                                 // allowlisted immutable semantic fields — all required (see §4)
    "baseRefName": "main", "headRefName": "feature/example",
    "mergeCommitOid": "0123456789abcdef0123456789abcdef01234567",
    "mergedAt": "2026-01-02T03:04:05Z", "number": 1234,
    "prNodeId": "PR_kwDOExampleAAAABFjEqcg"
  },
  "payloadDigest": "<sha256 hex of the canonical payload>",
  "occurredAt": "2026-01-02T03:04:05Z",         // upstream event time
  "observedAt": "2026-01-02T03:10:00Z",         // worker fetch time
  "sourceUrl": "https://github.com/acme/widgets/pull/1234",
  "summary": "PR #1234 merged",
  "author": { "id": "1", "nodeId": "U_1", "login": "octocat" },
  "problemId": "<optional>"
}
```

Field notes:

- `repositoryId` is the immutable numeric repository id. `repositoryFullName` and any URL are observed
  display metadata and are **not** part of identity. V1 accepts `providerHost` `github.com` only.
- `objectId` is the identity's object half: a PR node id (`PR_…`) for `pr.merged`, a full 40-character
  lowercase hex SHA for `commit.observed`. A short SHA is rejected (`rejected`, HTTP 400). The same commit on
  two branches is one commit fact. `objectId` must equal `payload.prNodeId` (`pr.merged`) or `payload.sha`
  (`commit.observed`), and `objectNumber` must equal `payload.number`; a disagreement is `rejected`.
- `defaultBranch` is the **observed-branch assertion**: the worker asserts the branch it observed, and the
  server checks it equals the server-owned enrollment's approved default branch; a `pr.merged` payload's
  `baseRefName` must equal it as well. This is an assertion checked against the enrollment, **not** a
  provider-side proof — in V1 the server never fetches upstream, so the trust anchor is the authenticated
  collector principal over TLS, not a second lookup. An enrollment with no approved default branch accepts
  no evidence; nothing is inferred.
- `occurredAt` must be an RFC-3339 instant that agrees with the payload event time (`mergedAt` for
  `pr.merged`, `committedAt` for `commit.observed`). `observedAt` is the worker's fetch time: validated but
  excluded from the replay comparison.
- `author` is provenance only. It is stored on the receipt and is never minted into a dashboard Person. The
  authenticated collector is never the author. A malformed `author` is `rejected`.
- `sourceUrl`, when present, must be an absolute `http(s)` URL whose host equals `providerHost`; a malformed
  or off-host URL is `rejected`.
- `problemId` is a **request**, not an assertion: it is honoured only when an approved object mapping names the
  same object and the same Problem. Otherwise the envelope is rejected (`object_mapping_mismatch`, HTTP 400).
  When an approved mapping exists it is attached even if `problemId` is omitted.
- There is no free-form worker `eventKey`. Any such field is ignored; identity is derived from the structured
  fields above, and an unknown extra field cannot change identity or the digest.

## 4. Canonical payload digest (worker-computed, server-verified)

The worker MUST send `payloadDigest`; the server recomputes it and rejects a mismatch (`digest_mismatch`,
HTTP 400). (The server accepts an omitted digest by computing one itself, but that is not the supported
worker path — a worker that omits it cannot prove it observed the same bytes.) The digest is `sha256`
(lowercase hex) over the deterministic JSON of **only the allowlisted fields that are present**:

- `pr.merged`: `baseRefName`, `headRefName`, `mergeCommitOid`, `mergedAt`, `number`, `prNodeId`
- `commit.observed`: `committedAt`, `parentOids`, `sha`, `treeOid`

Every allowlisted field for the event kind is **required** and independently validated server-side: PR
reference names are bounded strings; `number` is a positive integer; `mergeCommitOid`, `sha`, `treeOid` and
each entry of `parentOids` are full 40-character lowercase hex SHAs; timestamps are RFC-3339 instants. A
missing or malformed field is `rejected` with a reason naming it — an empty or partial payload is never
digested into an accepted fact.

Deterministic JSON: object keys sorted at every depth; arrays in order; strings JSON-escaped; `null` → `null`.
Size bounds are measured in **bytes** (UTF-8), and the canonical payload may not exceed 16384 bytes.

## 5. Server-derived identity

The server derives the canonical event key itself — the worker never supplies one:

```
canonicalEventKey = `${eventKind}:${objectId}`
identity          = (organization, providerHost, repositoryId, canonicalEventKey)
```

## 6. Ingest outcomes

| `status` | HTTP | Meaning | Worker action |
|---|---|---|---|
| `inserted` | 200 | Activity + receipt written in one transaction | Advance checkpoint |
| `replayed` | 200 | Same identity **and** same canonical payload **and** same provenance metadata **and** same resolved attribution already stored; **zero inserts, no recency touch**; receipt is stable | Advance checkpoint; treat as success |
| `identity_conflict` | 409 | Same identity but a different canonical payload, provenance metadata (author, event time, source URL or summary), or resolved attribution (Axis or Problem); nothing mutated | Quarantine; do not retry unchanged |
| `digest_mismatch` | 400 | `payloadDigest` disagrees with the server's computation | Fix the digest or payload; do not blind-retry |
| `unmapped` | 409 | Repository identity has no active enrollment | Durable quarantine/backlog; do not retry blindly |
| `rejected` | 400 | Structural/enrollment/mapping/target problem (`reason` names it) | Fix input or escalate; do not blind-retry |

`observedAt` is the worker's fetch time and is **excluded** from the replay comparison, so a legitimate
re-fetch of the same fact replays even when the fetch clock advanced. A re-enroll that leaves the resolved
axis and Problem unchanged does not turn an identical retry into a false conflict; a genuinely changed
resolved attribution (a re-pointed enrollment or a newly approved mapping) does conflict, and the historical
Activity row is never moved or rewritten.

`readback` answers `found` (200, with the receipt) or `not_found` (404) for a well-formed identity. A worker
that loses the response to a successful ingest recovers by calling `readback` with the same identity before
resending; a resend of the identical envelope is safe and answers `replayed` with zero inserts. A malformed
identity is refused `rejected` (400), not answered `not_found`.

Representative `rejected` reasons: `unsupported_envelope_version`, `unsupported_provider`,
`unsupported_provider_host`, `missing_repository_identity`, `invalid_repository_id`, `unsupported_event_kind`,
`object_kind_event_kind_mismatch`, `invalid_object_id`, `invalid_pr_node_id`, `commit_requires_full_sha`,
`invalid_occurred_at`, `invalid_observed_at`, `invalid_payload`, `invalid_pr_payload`, `invalid_commit_payload`,
`object_id_payload_mismatch`, `object_number_payload_mismatch`, `invalid_merge_commit_sha`, `invalid_commit_sha`,
`invalid_tree_sha`, `invalid_parent_oid`, `duplicate_parent_oid`, `invalid_pr_number`, `invalid_merged_at`,
`invalid_committed_at`, `merged_at_occurred_at_mismatch`, `committed_at_occurred_at_mismatch`,
`invalid_object_number`, `object_number_not_applicable`, `invalid_author`, `invalid_source_url`,
`payload_field_too_large`, `payload_too_large`, `summary_too_large`, `default_branch_not_configured`,
`default_branch_required`, `default_branch_mismatch`, `pr_base_branch_not_default`, `enrollment_target_missing`,
`object_mapping_mismatch`, `mapped_problem_missing`.

## 7. Enrollment (server-owned mapping authority)

An enrollment binds one immutable repository identity to one existing Axis; the Topic is derived from the
axis and checked, never trusted from the caller. `operation: "enroll"` takes `providerHost`, `repositoryId`,
`repositoryNodeId?`, `repositoryFullName?`, `defaultBranch?`, `topicId`, `axisId`. `defaultBranch` is the
server-owned approved default branch every observed-branch assertion is checked against; it is validated as
branch name and stored, and an enrollment without one accepts no evidence. `operation: "map"` takes
`enrollmentId`, `objectKind` (`pr`|`commit`|`issue`), `objectId`, `problemId`; the Problem must sit on the
enrolled axis. Re-enrolling the same identity re-points the single active enrollment and bumps
`mappingVersion`; historical evidence is never moved. The caller cannot name an arbitrary target and cannot
set an "explicit" flag.

## 8. Actor and provenance guarantees

- The Activity row records `actorType = "system"` and an actor id derived from the authenticated collector —
  never from the request body, never the GitHub author.
- The upstream GitHub author is retained on the receipt only. No Person, no repository registry row and no
  automatic hierarchy/state/person creation happens on the ingest path.
- The interpreted state (topic/axis/problem text, states, summaries, blockers, plans, links, annotations) is
  unchanged by ingest. The only permitted side effect is the ordinary Activity insert and its documented
  parent recency touch. A failure before the receipt commit — including a fault injected during the receipt
  insert — rolls back the Activity and the recency touch together, so no orphan row is left behind.

## 9. Versioning

`envelopeVersion` is `1`. A future envelope version is a new contract; the current server rejects anything
other than `1` with `rejected` / `unsupported_envelope_version`.
