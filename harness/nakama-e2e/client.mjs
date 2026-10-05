/**
 * A small, bounded HTTP client for a Nakama instance's plugin action surface — the shape
 * `harness/replay-corpus.mjs` uses (cookie + CSRF login, per-org header), factored out so the seeder,
 * readback and future turn driver share one transport.
 *
 * It is bounded on purpose: it carries **no** default credentials, reads them only from the caller, and
 * the only routes it knows are the plugin action endpoint and the three auth reads it needs. It performs
 * no live call during preparation — tests inject a fake `fetchImpl`; a real run is a separate, authorized
 * act performed by the fixture worker.
 *
 * Two safety properties this transport enforces, both source-grounded:
 *
 *   1. **No automatic write retry.** A POST that times out or answers 429/503 has an *unknown* applied
 *      outcome (the server may have committed before the response was lost), so retrying it can duplicate
 *      a mutation. Only reads are retried, and only within a bounded attempt count. A write either
 *      succeeds or is surfaced to the caller as a non-200 to fail closed on — never silently replayed.
 *   2. **Explicit fixture authority.** The client refuses a non-loopback base unless the caller says so,
 *      and `login` requires an explicit `expectedOrgId` that the account actually belongs to. It never
 *      inherits "the first org on the account" as write authority, so a stray ambient URL cannot point a
 *      seed at the corpus.
 *
 * The acting identity is whatever the login session is; nothing here lets a caller set `actor` or
 * `author` in a payload (the host strips those keys, and the artifact/seeder never emit them). The actor
 * id is read from `/v1/auth/me` (host shape: `buildAuthUserResponse` returns `id: user.id`,
 * `apps/server/src/services/org-service.ts:417-425`), which is the same id the host derives authorship
 * from (`pluginActor` → `context.actor.id`, `apps/server/src/services/plugin-service.ts:1544`).
 */
import { READ_ACTIONS, WRITE_ACTIONS, validateReconcileInput, validateRecordActivityInput } from "./limits.mjs";

export class ClientError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClientError";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True only for a loopback host — the inverse of "this could be the corpus". */
export function isLoopbackBase(base) {
  let url;
  try {
    url = new URL(base);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = (url.hostname || "").toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

export function createClient({
  base,
  email,
  password,
  pluginId = "research-dashboard",
  expectedOrgId,
  expectedOrgName,
  allowNonLoopback = false,
  fetchImpl = globalThis.fetch,
  attempts = 6,
  logger = () => {},
} = {}) {
  if (!base) throw new ClientError("base URL is required");
  if (typeof fetchImpl !== "function") throw new ClientError("fetchImpl must be a function");
  if (!allowNonLoopback && !isLoopbackBase(base)) {
    throw new ClientError(
      `base "${base}" is not a loopback address; the fixture client refuses a non-loopback target ` +
        "(pass allowNonLoopback: true only when this is a deliberate, reviewed act)"
    );
  }
  const root = base.replace(/\/+$/, "");
  const jar = new Map();
  let orgId = null;
  let actorId = null;

  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  function absorbCookies(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const split = pair.indexOf("=");
      if (split > 0) jar.set(pair.slice(0, split).trim(), pair.slice(split + 1));
    }
  }

  /**
   * One HTTP call. `retryable` is the caller's assertion that the request is a **safe read**: only then
   * is a transport error or a 429/503 retried, bounded by `attempts`. A non-retryable request that fails
   * at the transport level throws (its outcome is unknown); one that answers 429/503 is returned as-is so
   * the caller fails closed rather than replaying a possibly-applied write.
   */
  async function call(path, { body, headers = {}, method, retryable = false } = {}) {
    const httpMethod = method ?? (body === undefined ? "GET" : "POST");
    for (let attempt = 1; ; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(root + path, {
          method: httpMethod,
          headers: {
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            ...(jar.size === 0 ? {} : { cookie: cookieHeader() }),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (!retryable) {
          throw new ClientError(
            `network error on ${httpMethod} ${path}; the outcome is UNKNOWN and this request is not ` +
              `retried: ${error?.message ?? error}`
          );
        }
        if (attempt >= attempts) {
          throw new ClientError(`network error on ${httpMethod} ${path} after ${attempts} attempts: ${error?.message ?? error}`);
        }
        await sleep(Math.min(250 * 2 ** attempt, 4000));
        continue;
      }
      const transient = response.status === 429 || response.status === 503;
      if (!transient || !retryable || attempt >= attempts) {
        absorbCookies(response);
        const text = await response.text();
        let parsed;
        try { parsed = JSON.parse(text || "{}"); } catch { parsed = { raw: text.slice(0, 300) }; }
        return {
          status: response.status,
          body: parsed,
          retryAfter: response.headers.get("retry-after"),
          method: httpMethod,
          retried: attempt > 1,
        };
      }
      const header = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(header) && header > 0 ? header * 1000 : Math.min(500 * 2 ** attempt, 15_000);
      logger(`HTTP ${response.status} on a read, retrying in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }
  }

  /**
   * Log in and resolve the org + acting user. Returns `{ orgId, actorId }`.
   *
   * The org is **not** taken as "the first one on the account": the caller must name the expected org,
   * and login refuses unless the account is a member of it (and, when `expectedOrgName` is given, unless
   * the name matches too). This is the write-authority guard — a default first-org would let a seed land
   * in whatever org the session happened to resolve.
   */
  async function login() {
    if (!expectedOrgId) {
      throw new ClientError("an explicit expectedOrgId is required before this client may act");
    }
    const result = await call("/v1/auth/login", { body: { email, password }, retryable: true });
    if (result.status !== 200) throw new ClientError(`login failed (HTTP ${result.status})`);
    const csrf = jar.get("nakama_csrf");
    if (!csrf) throw new ClientError("no nakama_csrf cookie after login");
    const orgs = await call("/v1/auth/orgs", { retryable: true });
    if (orgs.status !== 200 || !Array.isArray(orgs.body?.orgs)) {
      throw new ClientError("could not read the account's organizations (/v1/auth/orgs)");
    }
    const match = orgs.body.orgs.find((org) => org?.id === expectedOrgId);
    if (!match) {
      throw new ClientError(`expected org ${expectedOrgId} is not among this account's organizations`);
    }
    if (expectedOrgName && match.name !== expectedOrgName) {
      throw new ClientError(`org ${expectedOrgId} is named "${match.name}", not "${expectedOrgName}"`);
    }
    orgId = expectedOrgId;
    const me = await call("/v1/auth/me", { retryable: true });
    actorId = me.body?.id ?? null;
    if (!actorId) throw new ClientError("could not read the acting user id (/v1/auth/me)");
    return { orgId, actorId };
  }

  function actionHeaders() {
    const csrf = jar.get("nakama_csrf");
    if (!csrf) throw new ClientError("not logged in (no csrf token)");
    return { "x-csrf-token": csrf, "x-org-id": orgId };
  }

  /**
   * Invoke one plugin action. `effect` is used only to pick the pre-send limit check and whether a 429/503
   * may be retried (only the three read actions are); the host remains the authority. Returns
   * `{ status, body, result }`.
   */
  async function action(key, input = {}) {
    const retryable = READ_ACTIONS.includes(key);
    if (WRITE_ACTIONS.includes(key)) {
      const checked = key === "reconcile_topic" ? validateReconcileInput(input) : validateRecordActivityInput(input);
      if (!checked.ok) throw new ClientError(`${key} refused before send: ${checked.errors.join("; ")}`);
    }
    const response = await call(`/v1/plugins/${pluginId}/actions/${key}`, {
      body: { input },
      headers: actionHeaders(),
      retryable,
    });
    return { status: response.status, body: response.body, result: response.body?.result ?? response.body, retried: response.retried };
  }

  const listTopics = () => action("list_topics", {});

  /** A POST carrying the session's csrf + org headers (used by the gated turn driver). Never retried. */
  async function post(path, body) {
    return call(path, { body, headers: actionHeaders(), retryable: false });
  }

  return {
    call,
    action,
    post,
    listTopics,
    login,
    get base() { return root; },
    get orgId() { return orgId; },
    get actorId() { return actorId; },
    get expectedOrgId() { return expectedOrgId ?? null; },
    pluginId,
  };
}

export { READ_ACTIONS, WRITE_ACTIONS };
