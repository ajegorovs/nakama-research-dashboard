/**
 * Offline tests for the explicit **N-7-only continuation** (`n7-continuation.mjs`).
 *
 * These prove the continuation binds a preserved successful direct-evidence digest + model/profile/prompt/
 * plugin/org identities, refuses on any tamper or binding mismatch, and never replays a direct case. The
 * actual turn is an injected seam, so no network/model is touched.
 *
 *   bun test harness/nakama-e2e/driver/n7-continuation.test.mjs
 */
import { describe, expect, test } from "bun:test";

import { buildProposedAuthorizationRecord } from "./authorization.mjs";
import { AUTOMATION_CASE, DIRECT_CASE_ORDER } from "./cases.mjs";
import { FIXTURE_PROFILES, profileKeyForCase } from "./profiles.mjs";
import {
  N7_CONTINUATION_ERROR_CODES,
  assertDirectEvidenceBinding,
  directEvidenceDigest,
  runN7OnlyContinuation,
  sha256Utf8,
  verifyN7Binding,
} from "./n7-continuation.mjs";

const auth = () => buildProposedAuthorizationRecord({ executionAuthorized: true });
const MODEL = auth().model.requested;

function evidenceRow(id, overrides = {}) {
  return {
    caseId: id,
    ok: true,
    evaluation: { terminalReason: "completed", forbidden: null, modelGenerations: 3, toolExecutions: 3 },
    trace: { answer: `grounded answer for ${id}`, model: MODEL, calls: [{ name: "find_tools" }, { name: "plugin_research_dashboard__get_topic" }] },
    ...overrides,
  };
}
const evidence = () => DIRECT_CASE_ORDER.map((id) => evidenceRow(id));

describe("direct-evidence digest is immutable and order-independent", () => {
  test("deterministic and stable under reordering", () => {
    const a = directEvidenceDigest(evidence());
    const b = directEvidenceDigest([...evidence()].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  test("changes when any answer byte changes", () => {
    const base = directEvidenceDigest(evidence());
    const tampered = evidence().map((r) => (r.caseId === "N-3" ? evidenceRow("N-3", { trace: { ...r.trace, answer: r.trace.answer + "." } }) : r));
    expect(directEvidenceDigest(tampered)).not.toBe(base);
  });
});

describe("assertDirectEvidenceBinding refuses incomplete / unsuccessful / tampered evidence", () => {
  const a = auth();
  test("accepts the canonical, all-successful set with the recorded digest", () => {
    const r = assertDirectEvidenceBinding({ directEvidence: evidence(), authorization: a, expectedDigest: directEvidenceDigest(evidence()) });
    expect(r.ok).toBe(true);
    expect(r.bound.size).toBe(6);
  });
  test("refuses missing evidence", () => {
    expect(assertDirectEvidenceBinding({ directEvidence: [], authorization: a, expectedDigest: "x".repeat(64) }).code).toBe(N7_CONTINUATION_ERROR_CODES.evidenceAbsent);
  });
  test("refuses an incomplete set", () => {
    const r = assertDirectEvidenceBinding({ directEvidence: evidence().slice(0, 5), authorization: a, expectedDigest: directEvidenceDigest(evidence()) });
    expect(r.code).toBe(N7_CONTINUATION_ERROR_CODES.evidenceIncomplete);
  });
  test("refuses when a case is not successful", () => {
    const ev = evidence().map((r) => (r.caseId === "N-2" ? { ...r, ok: false } : r));
    const r = assertDirectEvidenceBinding({ directEvidence: ev, authorization: a, expectedDigest: directEvidenceDigest(ev) });
    expect(r.code).toBe(N7_CONTINUATION_ERROR_CODES.evidenceNotSuccessful);
  });
  test("refuses a digest mismatch", () => {
    const r = assertDirectEvidenceBinding({ directEvidence: evidence(), authorization: a, expectedDigest: "0".repeat(64) });
    expect(r.code).toBe(N7_CONTINUATION_ERROR_CODES.digestMismatch);
  });
  test("refuses an evidence whose model is not the authorized model", () => {
    const ev = evidence().map((r) => ({ ...r, trace: { ...r.trace, model: "some-other-model" } }));
    const r = assertDirectEvidenceBinding({ directEvidence: ev, authorization: a, expectedDigest: directEvidenceDigest(ev) });
    expect(r.code).toBe(N7_CONTINUATION_ERROR_CODES.modelMismatch);
  });
});

describe("verifyN7Binding binds the N-7 profile/prompt/plugin/org", () => {
  test("accepts the admitted record and confirms the byte-identical repeat", () => {
    const r = verifyN7Binding({ authorization: auth() });
    expect(r.ok).toBe(true);
    expect(r.profileId).toBe(FIXTURE_PROFILES[profileKeyForCase(AUTOMATION_CASE)].id);
    expect(r.repeatsCaseId).toBe("N-1");
    expect(auth().prompts["N-7"].sha256).toBe(auth().prompts["N-1"].sha256);
  });
  test("refuses when N-7 is not admitted", () => {
    const a = auth();
    a.cases = a.cases.filter((c) => c !== AUTOMATION_CASE);
    expect(verifyN7Binding({ authorization: a }).code).toBe(N7_CONTINUATION_ERROR_CODES.n7NotAdmitted);
  });
  test("refuses when the N-7 prompt is not a byte-identical repeat", () => {
    const a = auth();
    a.prompts["N-7"] = { text: "a different prompt", sha256: sha256Utf8("a different prompt") };
    expect(verifyN7Binding({ authorization: a }).code).toBe(N7_CONTINUATION_ERROR_CODES.n7PromptNotRepeat);
  });
});

describe("runN7OnlyContinuation: delegates the single N-7 turn, never replays a direct case", () => {
  test("runs the wrapper once with the preserved direct results and no direct replay", async () => {
    let calls = 0;
    let seen = null;
    const result = await runN7OnlyContinuation({
      authorization: auth(),
      directEvidence: evidence(),
      expectedDigest: directEvidenceDigest(evidence()),
      runAutomationCase: async (args) => {
        calls += 1;
        seen = args;
        return { ok: true, automation: { ok: true }, trace: { answer: "automation output" } };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.delegated).toBe(true);
    expect(result.replayedDirectCases).toEqual([]);
    expect(calls).toBe(1);
    expect(seen.directResults.size).toBe(6);
    expect(seen.directResults.get("N-1").trace.answer).toBe("grounded answer for N-1");
  });

  test("does not delegate when the digest is wrong", async () => {
    let calls = 0;
    const result = await runN7OnlyContinuation({
      authorization: auth(),
      directEvidence: evidence(),
      expectedDigest: "0".repeat(64),
      runAutomationCase: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    expect(result.ok).toBe(false);
    expect(result.delegated).toBe(false);
    expect(calls).toBe(0);
  });

  test("does not delegate when N-7 is not admitted", async () => {
    const a = auth();
    a.cases = a.cases.filter((c) => c !== AUTOMATION_CASE);
    let calls = 0;
    const result = await runN7OnlyContinuation({
      authorization: a,
      directEvidence: evidence(),
      expectedDigest: directEvidenceDigest(evidence()),
      runAutomationCase: async () => {
        calls += 1;
        return { ok: true };
      },
    });
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });

  test("exposes no direct-case runner — there is no path to replay N-1…N-6 here", async () => {
    const mod = await import("./n7-continuation.mjs");
    expect(typeof mod.runN7OnlyContinuation).toBe("function");
    expect(mod.runCase).toBeUndefined();
    expect(mod.runAuthorizedSequence).toBeUndefined();
  });
});
