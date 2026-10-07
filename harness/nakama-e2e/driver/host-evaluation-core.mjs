/**
 * Load the **pinned host's own** evaluation guard/validator from the clean host checkout, so the driver's
 * offline tests exercise the real `@nakama/core` `evaluation-policy` code rather than a re-implementation.
 *
 * The host checkout is a sibling of this repository in the E2E fixture workspace:
 *
 *   <Repos>/nakama-research-dashboard/harness/nakama-e2e/driver/  (this file)
 *   <Repos>/nakama-e2e-fixture-workspace/sources/nakama-host-clean/
 *
 * `NAKAMA_HOST_CLEAN` overrides the location. The module is imported dynamically so the driver's non-test
 * paths never depend on the checkout being present; tests that need it call `loadHostEvaluationCore()`.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HERE = import.meta.dir;

/** The clean host checkout directory. */
export function hostCleanDir() {
  return (
    process.env.NAKAMA_HOST_CLEAN ??
    resolve(HERE, "..", "..", "..", "..", "nakama-e2e-fixture-workspace", "sources", "nakama-host-clean")
  );
}

/** True when the pinned host's evaluation-policy source is present. */
export function hostEvaluationCoreAvailable() {
  return existsSync(resolve(hostCleanDir(), "packages/core/src/evaluation-policy.ts"));
}

/**
 * Import the real `evaluation-policy` module. Returns `{ validateEvaluationPolicy, createEvaluationTurnGuard,
 * deriveConversationToken, EVALUATION_TERMINAL_REASONS }`. Throws a clear error if the checkout is absent.
 */
export async function loadHostEvaluationCore() {
  const file = resolve(hostCleanDir(), "packages/core/src/evaluation-policy.ts");
  if (!existsSync(file)) {
    throw new Error(
      `pinned host evaluation core not found at ${file}; set NAKAMA_HOST_CLEAN to the clean host checkout`
    );
  }
  return await import(file);
}
