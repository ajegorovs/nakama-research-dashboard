/**
 * The closed read boundary (DESIGN-V1 §9 M-1; OFFLINE-IMPLEMENTATION-PROPOSAL §4, §10).
 *
 * The librarian's runtime surface is **read-only by construction**. Its reads reach it only through this
 * adapter, which dispatches exactly the three approved read actions (`get_topic`, `get_overview`,
 * `search_dashboard`) through the **existing action entry point** `run(input, context)`
 * (`src/actions.ts:216`). The core is never handed a `ResearchStore` handle: `run` constructs its own
 * store from `context.databasePath` and closes it in a `finally`, so no write method is reachable by
 * construction.
 *
 * An action key outside the closed allowlist is **denied before dispatch** — before `run` is called, so a
 * write never reaches the store. `databasePath`, `actor`, `actionKey`, `orgId`, `profileId` and `host`
 * are built from this adapter's own options and are **never** taken from caller input; supplying one is
 * refused, not silently accepted. Input must be a plain JSON object (prototype `Object.prototype` or
 * `null`) carrying data properties only: a custom prototype could smuggle a context key in from outside
 * the input, and an accessor would run caller code the moment a key is read, so both are refused before
 * any key is inspected.
 *
 * This is a *surface* property, not proof of zero mutation. Proof that zero rows changed comes from the
 * separate, isolated `harness/librarian-db-snapshot.mjs` instrument, which is never an input this
 * boundary reads.
 */
import { run } from "../actions";

/** The only actions the boundary will dispatch. Everything else is denied before dispatch. */
export const READ_ACTION_ALLOWLIST = [
  "get_topic",
  "get_overview",
  "search_dashboard",
] as const;
export type ReadActionKey = (typeof READ_ACTION_ALLOWLIST)[number];

/**
 * Input keys that name execution context. The host strips spoofed copies (`SPOOFABLE_INPUT_KEYS` in
 * `plugin-service.ts`); this boundary refuses them outright so an input can never redirect the read to
 * another database or impersonate an actor. The set is the host's strip list plus the two keys the
 * boundary itself owns (`actionKey`, `host`), so no context key the host would strip can slip past here.
 */
export const RESERVED_INPUT_KEYS = [
  "actor",
  "actorId",
  "actionKey",
  "apiVersion",
  "context",
  "databasePath",
  "dataDir",
  "dataDirectory",
  "host",
  "invocationId",
  "orgId",
  "organizationId",
  "orgRole",
  "pluginId",
  "pluginVersion",
  "profileId",
  "role",
  "sessionId",
  "workspaceRoot",
] as const;

/** An action key outside the closed allowlist was refused before dispatch. */
export class ReadBoundaryDeniedError extends Error {
  readonly actionKey: string;

  constructor(actionKey: string) {
    super(
      `Action "${actionKey}" is outside the librarian read allowlist (${READ_ACTION_ALLOWLIST.join(", ")}); refused before dispatch.`
    );
    this.name = "ReadBoundaryDeniedError";
    this.actionKey = actionKey;
  }
}

/** A caller-supplied input tried to override execution context, or was not a plain data object. */
export class ReadBoundaryInputError extends Error {
  readonly key: string;

  constructor(key: string, detail?: string) {
    super(
      detail ??
        `Input key "${key}" would override execution context; context is built by the boundary and never from input.`
    );
    this.name = "ReadBoundaryInputError";
    this.key = key;
  }
}

export type ReadBoundaryOptions = {
  /** The offline fixture database the reads are pointed at — never a live database. */
  databasePath: string;
  actor: { id: string; role?: string };
  orgId?: string;
  host?: (request: Record<string, unknown>) => Promise<unknown>;
  profileId?: string;
  /**
   * Test-only mutant seam: bypass the allowlist so a guard-disabled reference can be demonstrated to go
   * red. `retainOptions` reads the trusted execution context live instead of snapshotting it at
   * construction (so a post-construction mutation of the options leaks). The pristine boundary must never
   * be constructed with either.
   */
  mutants?: { disableAllowlist?: boolean; retainOptions?: boolean };
};

export type ReadBoundaryStats = { denied: number; dispatched: number };

export type ReadBoundary = {
  read(actionKey: string, input?: Record<string, unknown>): Promise<unknown>;
  stats: ReadBoundaryStats;
};

/**
 * Refuse anything that is not a plain JSON object. An array, primitive or class instance reaches here
 * only if a caller bypassed the host's schema validation; a custom prototype is the one path by which a
 * context key (`databasePath`, `context`, `sessionId`, …) could be inherited rather than own, so it is
 * refused before the reserved-key scan can be defeated by `hasOwnProperty`.
 */
function assertPlainInput(input: unknown): asserts input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ReadBoundaryInputError(
      "<input>",
      "Read input must be a plain JSON object; arrays, primitives and null are refused."
    );
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ReadBoundaryInputError(
      "<prototype>",
      "Read input must be a plain object (Object.prototype or null prototype); a custom prototype could carry a context key in from outside the input."
    );
  }
}

/**
 * Refuse accessor properties without reading them. `Object.getOwnPropertyDescriptors` returns the
 * descriptor itself, so a getter is never evaluated (evaluating caller code to decide whether to refuse
 * it would already be running the caller's code).
 */
function assertDataProperties(input: Record<string, unknown>): void {
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(input)
  )) {
    if (descriptor.get || descriptor.set) {
      throw new ReadBoundaryInputError(
        key,
        `Input key "${key}" is an accessor; read input must carry data properties only (a getter is never evaluated).`
      );
    }
  }
}

function assertAllowed(
  actionKey: string,
  input: Record<string, unknown>,
  options: ReadBoundaryOptions
): void {
  if (
    !options.mutants?.disableAllowlist &&
    !(READ_ACTION_ALLOWLIST as readonly string[]).includes(actionKey)
  ) {
    throw new ReadBoundaryDeniedError(actionKey);
  }
  assertPlainInput(input);
  assertDataProperties(input);
  for (const key of RESERVED_INPUT_KEYS) {
    // `in`, not `hasOwnProperty`: an inherited key is refused too. After `assertPlainInput` the only
    // reachable prototype is Object.prototype (or null), which carries none of these — this is
    // belt-and-braces against a future change to the plainness rule.
    if (key in input) {
      throw new ReadBoundaryInputError(key);
    }
  }
}

export function createReadBoundary(options: ReadBoundaryOptions): ReadBoundary {
  const stats: ReadBoundaryStats = { denied: 0, dispatched: 0 };

  // Freeze a private snapshot of the trusted execution context at construction. `databasePath`,
  // `actor`, `orgId`, `profileId`, `host` and the mutant seam are read from these captured values and
  // never from the caller's `options` object again — so a caller that mutates `options` (or its nested
  // `actor`/`mutants`) after construction cannot retarget a read, impersonate an actor or re-enable a
  // guard-disabled seam. A copy per object is enough; this is a bounded fix, not a generic proxy.
  const trusted: ReadBoundaryOptions = options.mutants?.retainOptions
    ? options
    : Object.freeze({
        actor: Object.freeze({ ...options.actor }),
        databasePath: options.databasePath,
        host: options.host ?? ((): Promise<unknown> => Promise.resolve({})),
        mutants: options.mutants
          ? Object.freeze({ disableAllowlist: options.mutants.disableAllowlist === true })
          : undefined,
        orgId: options.orgId ?? "offline-evaluation",
        profileId: options.profileId,
      });

  async function read(
    actionKey: string,
    input: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      assertAllowed(actionKey, input, trusted);
    } catch (error) {
      stats.denied += 1;
      throw error;
    }
    stats.dispatched += 1;
    const context = {
      actionKey,
      actor: trusted.actor,
      databasePath: trusted.databasePath,
      host: trusted.host ?? ((): Promise<unknown> => Promise.resolve({})),
      orgId: trusted.orgId ?? "offline-evaluation",
      ...(trusted.profileId ? { profileId: trusted.profileId } : {}),
    } as unknown as Parameters<typeof run>[1];
    return run(input, context);
  }

  return { read, stats };
}

/** A read result the boundary surfaced that is a refusal, not a payload. */
export function isReadFailure(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok === false
  );
}
