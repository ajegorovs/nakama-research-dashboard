/**
 * Sequence-wide stop latch for the owning Nakama E2E driver.
 *
 * The host-amendment ruling is explicit: any forbidden call, missing/malformed trace, mutation,
 * identity/model mismatch, timeout or unknown transport outcome **latches the sequence stop**, and there
 * are **no retries or replacement cases**. The latch is the mechanical form of that rule: once stopped it
 * stays stopped, the reason is recorded (first cause wins), and every subsequent case is refused rather
 * than silently skipped-and-forgotten.
 *
 * The latch is a value object, not a thrown-at-construction error: the sequence runner records a latched
 * case as `{ ok: false, terminal: true, skipped: true }` so it remains in the evidence, and it never
 * clears the latch or substitutes a retry.
 */

/** Fixed terminal reason codes. Anything a caller latches on is one of these tokens. */
export const STOP_REASONS = Object.freeze({
  forbiddenToolCall: "forbidden_tool_call",
  malformedTrace: "malformed_trace",
  missingTrace: "missing_trace",
  emptyTrace: "empty_trace",
  // A trace with no dashboard read at all (`find_tools` only), or one whose reads all failed, cannot
  // satisfy a case that must actually consult the dashboard (reviewer corrections, item 3).
  readlessTrace: "readless_trace",
  failedRead: "failed_read",
  // The caller-supplied prompt did not match the authorization's exact byte/digest binding.
  promptMismatch: "prompt_mismatch",
  mutation: "logical_mutation",
  identityMismatch: "identity_mismatch",
  modelMismatch: "model_mismatch",
  modelEvidenceMissing: "model_evidence_missing",
  usageEvidenceMissing: "usage_evidence_missing",
  providerMismatch: "provider_mismatch",
  timeout: "timeout",
  cancelled: "cancelled",
  unknownTransport: "unknown_transport_outcome",
  budgetExceeded: "budget_exceeded",
  authorizationRefused: "authorization_refused",
  hostControlAbsent: "host_control_absent",
  automationFailure: "automation_failure",
  writerDispatchDenied: "writer_dispatch_denied",
  // Supported-API skill containment is NOT restart-persistent (every boot re-assigns the bundled
  // skills — see the readiness report §5). The driver checks containment before each case and stops
  // on any change; there is no automatic recovery or inference in response.
  containmentChanged: "containment_changed",
});

export class SequenceLatchedError extends Error {
  constructor(reason, detail = "") {
    super(`sequence latched: ${reason}${detail ? ` (${detail})` : ""}`);
    this.name = "SequenceLatchedError";
    this.reason = reason;
  }
}

/** A single-writer latch. First stop wins; it never reopens. */
export function createStopLatch() {
  let stopped = false;
  let reason = null;
  let detail = "";
  const history = [];

  return {
    stop(nextReason, nextDetail = "") {
      history.push({ reason: nextReason, detail: nextDetail });
      if (stopped) return { stopped: true, reason, alreadyStopped: true };
      stopped = true;
      reason = nextReason;
      detail = nextDetail;
      return { stopped: true, reason, alreadyStopped: false };
    },
    get stopped() {
      return stopped;
    },
    get reason() {
      return reason;
    },
    get detail() {
      return detail;
    },
    get history() {
      return [...history];
    },
    /** Throw `SequenceLatchedError` if the sequence has already stopped. */
    assertOpen() {
      if (stopped) throw new SequenceLatchedError(reason, detail);
    },
    /** A non-throwing view for the runner to attach to a skipped case's evidence. */
    snapshot() {
      return { stopped, reason, detail, history: [...history] };
    },
  };
}
