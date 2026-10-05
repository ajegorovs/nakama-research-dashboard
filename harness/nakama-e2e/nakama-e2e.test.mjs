/**
 * Offline tests for the Nakama E2E harness slice. No network, no model, no live instance: every seam is
 * exercised with a fake transport or a scratch SQLite copy. Run with:
 *
 *     bun test harness/nakama-e2e
 *
 * Covered: the oracle-free seed artifact and its variants; the traced reconcile input limits (malformed
 * refusals); payload construction and source->live mapping; response count/malformed/duplicate validation
 * (the seeder refuses a short, malformed or duplicated response instead of warning); projection validation
 * with host-derived authorship; the no-write retry policy and explicit fixture-org authority of the client;
 * generation+revision pinning and the no-write mutation detector (positive control on a scratch copy only);
 * the tool-call trace guard (absent/empty/malformed fails); the default-blocked inference/automation guards;
 * and the fixture-run target guards (loopback base, private output path).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  loadSeedArtifact, assertOracleFree, findForbiddenKeys, listSourceIds,
  buildMainInputs, buildProblemRefInputs, effectiveNoteText, SeedArtifactError,
} from "./artifact.mjs";
import { validateReconcileInput, describeReconcileLimits } from "./limits.mjs";
import { createClient, ClientError, isLoopbackBase } from "./client.mjs";
import { seedSemanticFixture, emptyMapping, assertMappingComplete, assertIdBoundary, SeedError } from "./seed.mjs";
import { validateProjection, liveId, CASE_EXPECTATIONS } from "./readback.mjs";
import {
  canonicalSnapshot, snapshotsEqual, discoverStorePath, readServedRevision, pinStoreIdentity,
  assertIdentityPinned, assertNoLogicalMutation, positiveControlMutation, SnapshotError,
} from "./snapshot.mjs";
import { validateTrace, parseToolCalls, isWriteToolCall, normalizeToolName, readSessionMessages } from "./trace.mjs";
import { runAgentTurn, assertInferenceAuthorized, InferenceBlockedError, buildMessageRequest } from "./turn.mjs";
import { buildAutomationDefinition, runAutomation, installAutomation, AutomationBlockedError } from "./automation.mjs";
import { buildPlan, assertPrivateOutputPath, assertOutputWritable, runFixture } from "./fixture-run.mjs";

const scratch = mkdtempSync(join(tmpdir(), "nakama-e2e-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let artifact;
beforeAll(() => { artifact = loadSeedArtifact(); });

// ------------------------------------------------------------------ helpers

/** A minimal stand-in for a fetch Response — no dependence on runtime header quirks. */
function fakeResponse(status, body, { setCookies = [], headers = {} } = {}) {
  return {
    status,
    headers: {
      getSetCookie: () => setCookies,
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/**
 * Build a fetchImpl that answers the auth reads, then routes the plugin-action POSTs to `onAction`.
 * `onAction(key, attempt)` may return a fakeResponse or throw.
 */
function authFetch({ orgs = [{ id: "org-fixture", name: "Nakama E2E Fixture" }], me = { id: "user-1" }, onAction } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method, body });
    if (url.endsWith("/v1/auth/login")) return fakeResponse(200, { ok: true }, { setCookies: ["nakama_csrf=csrf-1; Path=/"] });
    if (url.endsWith("/v1/auth/orgs")) return fakeResponse(200, { orgs });
    if (url.endsWith("/v1/auth/me")) return fakeResponse(200, me);
    const match = /\/actions\/([^/?]+)$/.exec(url);
    const key = match ? match[1] : "unknown";
    const attempt = calls.filter((c) => c.url === url).length;
    return onAction ? onAction(key, attempt, body) : fakeResponse(200, { result: { ok: true } });
  };
  return { impl, calls };
}

// ------------------------------------------------------------------ artifact

describe("seed artifact", () => {
  test("loads, is oracle-free and declares the two adopted variants", () => {
    expect(artifact.artifactId).toBe("nakama-semantic-seed-v1");
    expect(findForbiddenKeys(artifact)).toEqual([]);
    expect(artifact.defaultVariants).toEqual(["F-2-conflict", "F-18-inj"]);
    expect(Object.keys(artifact.variants).sort()).toEqual(["F-18-inj", "F-2-conflict"]);
    expect(artifact.variants["F-2-conflict"].replacesNote).toBe("FIX-ANN-STEER-CONTESTED");
    expect(artifact.variants["F-18-inj"].replacesNote).toBe("FIX-ANN-GUARDED-1");
    expect(artifact.variants["F-18-inj"].text).toContain("ignore all prior instructions");
  });

  test("assertOracleFree refuses a smuggled oracle key", () => {
    const bad = { ...artifact, cases: { "F-1": { expectedOutcomes: { outcome: "proposal" } } } };
    expect(() => assertOracleFree(bad)).toThrow(SeedArtifactError);
    expect(findForbiddenKeys(bad)).toContain("$.cases.F-1.expectedOutcomes");
  });

  test("omits the topic-level steering note that reconcile cannot express", () => {
    expect(listSourceIds(artifact).annotations).not.toContain("FIX-ANN-TOPIC-STEER");
    expect(artifact.omitted[0].sourceId).toBe("FIX-ANN-TOPIC-STEER");
  });
});

// ------------------------------------------------------------------ limits

describe("traced reconcile input limits", () => {
  test("a valid main payload passes the traced limit check", () => {
    for (const call of buildMainInputs(artifact)) {
      const result = validateReconcileInput(call.input);
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  test("refuses an over-long annotation text (2000 max)", () => {
    const bad = { topicName: "x", annotations: [{ text: "a".repeat(2001) }] };
    const result = validateReconcileInput(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toContain("longer than 2000");
  });

  test("refuses a bad enum, an unknown key, a wrong type and a missing required field", () => {
    expect(validateReconcileInput({ axes: [{ title: "a", state: "nope" }] }).ok).toBe(false);
    expect(validateReconcileInput({ topicName: "x", bogus: 1 }).ok).toBe(false);
    expect(validateReconcileInput({ axes: [{ title: 5 }] }).ok).toBe(false);
    expect(validateReconcileInput({ activities: [{ sourceRef: "no summary" }] }).ok).toBe(false);
  });

  test("refuses more items than the per-call maximum", () => {
    const annotations = Array.from({ length: 21 }, (_, i) => ({ text: `n${i}` }));
    expect(validateReconcileInput({ topicName: "x", annotations }).ok).toBe(false);
  });

  test("describes the reconcile write limits it enforces", () => {
    expect(describeReconcileLimits()).toMatchObject({
      topicName: 120, axesPerCall: 20, activitiesPerCall: 50, annotationsPerCall: 20,
      problemsPerCall: 25, annotationText: 2000,
    });
  });
});

// ------------------------------------------------------------------ client pre-send guard & retry safety

describe("client refuses out-of-contract payloads before sending", () => {
  test("a malformed reconcile never reaches fetch", async () => {
    let called = 0;
    const client = createClient({
      base: "http://127.0.0.1:1", email: "e", password: "p",
      fetchImpl: async () => { called += 1; return fakeResponse(200, "{}"); },
    });
    await expect(client.action("reconcile_topic", { annotations: [{ text: "a".repeat(2001) }] }))
      .rejects.toBeInstanceOf(ClientError);
    expect(called).toBe(0);
  });
});

describe("client write-retry safety (B1)", () => {
  test("a transient failure on a write is NOT retried and its outcome is surfaced", async () => {
    let posts = 0;
    const { impl } = authFetch({ onAction: () => { posts += 1; throw new Error("socket closed"); } });
    const client = createClient({ base: "http://127.0.0.1:4399", email: "e", password: "p", expectedOrgId: "org-fixture", fetchImpl: impl });
    await client.login();
    await expect(client.action("reconcile_topic", { topicName: "x", annotations: [{ text: "note" }] }))
      .rejects.toBeInstanceOf(ClientError);
    expect(posts).toBe(1);
  });

  test("a 503 on a write is returned un-retried so the caller fails closed", async () => {
    let posts = 0;
    const { impl } = authFetch({ onAction: () => { posts += 1; return fakeResponse(503, { error: "unavailable" }); } });
    const client = createClient({ base: "http://127.0.0.1:4399", email: "e", password: "p", expectedOrgId: "org-fixture", fetchImpl: impl });
    await client.login();
    const response = await client.action("reconcile_topic", { topicName: "x", annotations: [{ text: "note" }] });
    expect(posts).toBe(1);
    expect(response.status).toBe(503);
    expect(response.retried).toBe(false);
  });

  test("a bounded 503 on a read action is retried and then succeeds", async () => {
    let reads = 0;
    const { impl } = authFetch({
      onAction: () => {
        reads += 1;
        return reads === 1 ? fakeResponse(503, { error: "unavailable" }) : fakeResponse(200, { result: { ok: true, axes: [] } });
      },
    });
    const client = createClient({ base: "http://127.0.0.1:4399", email: "e", password: "p", expectedOrgId: "org-fixture", fetchImpl: impl, attempts: 3 });
    await client.login();
    const response = await client.action("get_topic", { topicName: "x" });
    expect(reads).toBe(2);
    expect(response.status).toBe(200);
    expect(response.retried).toBe(true);
  });
});

describe("client fixture authority (B2/B3)", () => {
  test("refuses a non-loopback base unless explicitly allowed", () => {
    expect(() => createClient({ base: "http://corpus.example.com:4399", email: "e", password: "p" }))
      .toThrow(ClientError);
    expect(isLoopbackBase("http://127.0.0.1:4399")).toBe(true);
    expect(isLoopbackBase("http://[::1]:4400")).toBe(true);
    expect(isLoopbackBase("http://corpus.example.com:4399")).toBe(false);
  });

  test("login refuses without an explicit expected org", async () => {
    const { impl } = authFetch();
    const client = createClient({ base: "http://127.0.0.1:4399", email: "e", password: "p", fetchImpl: impl });
    await expect(client.login()).rejects.toBeInstanceOf(ClientError);
  });

  test("login refuses when the account is not a member of the expected org", async () => {
    const { impl } = authFetch({ orgs: [{ id: "org-corpus", name: "Corpus" }] });
    const client = createClient({ base: "http://127.0.0.1:4399", email: "e", password: "p", expectedOrgId: "org-fixture", fetchImpl: impl });
    await expect(client.login()).rejects.toBeInstanceOf(ClientError);
  });

  test("login refuses when the expected org name does not match, and reads the actor from /auth/me", async () => {
    const { impl } = authFetch({ orgs: [{ id: "org-fixture", name: "Something Else" }] });
    const client = createClient({
      base: "http://127.0.0.1:4399", email: "e", password: "p",
      expectedOrgId: "org-fixture", expectedOrgName: "Nakama E2E Fixture", fetchImpl: impl,
    });
    await expect(client.login()).rejects.toBeInstanceOf(ClientError);

    const ok = authFetch({ me: { id: "actor-9" } });
    const good = createClient({
      base: "http://127.0.0.1:4399", email: "e", password: "p",
      expectedOrgId: "org-fixture", expectedOrgName: "Nakama E2E Fixture", fetchImpl: ok.impl,
    });
    await expect(good.login()).resolves.toEqual({ orgId: "org-fixture", actorId: "actor-9" });
    expect(good.actorId).toBe("actor-9");
  });
});

// ------------------------------------------------------------------ artifact -> payloads

describe("payload construction", () => {
  test("applies the F-2-conflict variant to the contested note only", () => {
    const calls = buildMainInputs(artifact, { variants: ["F-2-conflict"] });
    const alpha = calls.find((c) => c.topicSourceId === "FIX-TOPIC-ALPHA");
    const contested = alpha.input.annotations.find((a) => a.axisTitle === "Contested workstream");
    expect(contested.text).toBe(artifact.variants["F-2-conflict"].text);
    const guarded = alpha.input.annotations.find((a) => a.axisTitle === "Guarded steering workstream");
    expect(guarded.text).toBe("Synthetic guarded note one.");
  });

  test("defers problem-scoped facts to the phase-2 payload", () => {
    const main = buildMainInputs(artifact);
    const alpha = main.find((c) => c.topicSourceId === "FIX-TOPIC-ALPHA");
    expect(alpha.input.problems.map((p) => p.statement)).toEqual(["Synthetic fixture problem: slot not allocated."]);
    expect(alpha.input.activities.map((a) => a.summary)).not.toContain("Synthetic fixture activity: filed a fixture issue.");
    expect(alpha.input.annotations.map((a) => a.text)).not.toContain("Synthetic problem-scoped steering that get_topic never returns.");
  });

  test("builds phase-2 problem references from the mapping", () => {
    const mapping = emptyMapping(["F-2-conflict", "F-18-inj"]);
    mapping.problems["FIX-PROBLEM-1"] = "live-problem-1";
    const refs = buildProblemRefInputs(artifact, mapping);
    const alpha = refs.find((c) => c.topicSourceId === "FIX-TOPIC-ALPHA");
    expect(alpha.input.activities[0].problemId).toBe("live-problem-1");
    expect(alpha.input.annotations[0].problemId).toBe("live-problem-1");
    for (const call of refs) expect(validateReconcileInput(call.input).errors).toEqual([]);
  });

  test("effectiveNoteText leaves a non-target note untouched", () => {
    expect(effectiveNoteText(artifact, { sourceId: "FIX-ANN-GUARDED-2", text: "two" }, ["F-18-inj"])).toBe("two");
  });
});

// ------------------------------------------------------------------ seeder (fake client)

function fakeClient({ existingTopics = [], mutate = (result) => result } = {}) {
  let counter = 0;
  const id = (p) => `${p}-${++counter}`;
  return {
    listTopics: async () => ({ status: 200, result: { topics: existingTopics } }),
    action: async (key, input) => {
      fakeClient.last.push({ key, input });
      const result = mutate({
        ok: true,
        topic: { id: id("live-topic") },
        axes: (input.axes ?? []).map(() => ({ id: id("live-axis") })),
        recorded: {
          activities: (input.activities ?? []).map(() => id("live-act")),
          annotations: (input.annotations ?? []).map(() => id("live-ann")),
        },
        problems: (input.problems ?? []).map(() => ({ id: id("live-problem") })),
      });
      return { status: 200, body: { result }, result };
    },
  };
}
fakeClient.last = [];

describe("seeder", () => {
  test("seeds through the action API and persists a complete source->live mapping", async () => {
    fakeClient.last = [];
    const client = fakeClient();
    const { mapping, calls, warnings } = await seedSemanticFixture({ artifact, client });
    expect(warnings).toEqual([]);
    expect(calls.length).toBeGreaterThan(0);
    expect(mapping.topics["FIX-TOPIC-ALPHA"]).toMatch(/^live-topic/);
    expect(mapping.axes["FIX-AXIS-CONTESTED"]).toMatch(/^live-axis/);
    expect(mapping.variantTargets["F-2-conflict"]).toBe(mapping.annotations["FIX-ANN-STEER-CONTESTED"]);
    expect(mapping.variantTargets["F-18-inj"]).toBe(mapping.annotations["FIX-ANN-GUARDED-1"]);
    expect(mapping.problems["FIX-PROBLEM-1"]).toBeTruthy();
    expect(fakeClient.last.every((c) => c.key === "reconcile_topic")).toBe(true);
  });

  test("refuses a second copy over an existing fixture topic, with no force override", async () => {
    const client = fakeClient({ existingTopics: [{ id: "x", name: "Fixture Topic Alpha" }] });
    await expect(seedSemanticFixture({ artifact, client })).rejects.toBeInstanceOf(SeedError);
    // A caller passing a legacy `force` cannot override the guard (the option is gone).
    await expect(seedSemanticFixture({ artifact, client, force: true })).rejects.toBeInstanceOf(SeedError);
  });

  test("fails closed when the topic list cannot be read", async () => {
    const client = { listTopics: async () => ({ status: 500, result: null }), action: async () => ({}) };
    await expect(seedSemanticFixture({ artifact, client })).rejects.toBeInstanceOf(SeedError);
  });

  test("refuses a malformed 200 with a SeedError, not a raw TypeError (L1)", async () => {
    const client = fakeClient({ mutate: (result) => { delete result.topic; return result; } });
    await expect(seedSemanticFixture({ artifact, client })).rejects.toBeInstanceOf(SeedError);
    await expect(seedSemanticFixture({ artifact, client })).rejects.toThrow(/topic/);
  });

  test("refuses a short/reordered response instead of mis-addressing the mapping (L2)", async () => {
    const client = fakeClient({ mutate: (result) => {
      result.recorded.activities = result.recorded.activities.slice(0, -1);
      return result;
    } });
    await expect(seedSemanticFixture({ artifact, client })).rejects.toThrow(/recorded activity/);
  });

  test("refuses two sourceIds sharing one live id (expected-id boundary)", async () => {
    const client = fakeClient({ mutate: (result) => {
      result.axes = (result.axes ?? []).map(() => ({ id: "same-axis" }));
      return result;
    } });
    await expect(seedSemanticFixture({ artifact, client })).rejects.toBeInstanceOf(SeedError);
  });

  test("assertMappingComplete reports a missing live id instead of hiding it", () => {
    const warnings = assertMappingComplete(artifact, emptyMapping([]));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join()).toContain("FIX-TOPIC-ALPHA");
  });

  test("assertIdBoundary flags a duplicate live id", () => {
    const mapping = emptyMapping([]);
    for (const topic of artifact.topics) {
      mapping.topics[topic.sourceId] = "T1";
      for (const axis of topic.axes) mapping.axes[axis.sourceId] = "A1";
    }
    const problems = assertIdBoundary(artifact, mapping);
    expect(problems.join()).toContain("duplicate live topics id");
  });
});

// ------------------------------------------------------------------ readback projection

describe("readback projection validation", () => {
  const ACTOR = "actor-1";
  const mapping = {
    topics: { "FIX-TOPIC-ALPHA": "T1" },
    axes: {
      "FIX-AXIS-CLEAN": "A1", "FIX-AXIS-CONTESTED": "A2", "FIX-AXIS-DISPUTED": "A3",
      "FIX-AXIS-PROBLEM": "A4", "FIX-AXIS-GUARDED": "A5",
    },
    annotations: {
      "FIX-ANN-DISPUTE-1": "N1", "FIX-ANN-DISPUTE-2": "N2",
      "FIX-ANN-PROBLEM-STEER": "N9", "FIX-ANN-STEER-CONTESTED": "N3", "FIX-ANN-GUARDED-1": "N5",
    },
    problems: { "FIX-PROBLEM-1": "P1" }, activities: {}, variantTargets: {}, variants: [],
  };
  // Built lazily: `artifact` is loaded in `beforeAll`, after this describe body is collected.
  const ctx = () => ({ artifact, mapping, expectedActorId: ACTOR, activeVariants: artifact.defaultVariants });

  test("N-2 recognises the returned human conflict note with the exact variant text", () => {
    const projection = { axes: [{ id: "A2", state: "blocked", blocker: "waiting on a synthetic fixture slot",
      notes: [{ id: "N3", text: artifact.variants["F-2-conflict"].text, authorType: "human", authorId: ACTOR }] }] };
    expect(validateProjection(projection, CASE_EXPECTATIONS["N-2"], ctx())).toEqual({ ok: true, failures: [] });
  });

  test("N-2 fails when the conflict note is attributed to an agent", () => {
    const projection = { axes: [{ id: "A2", state: "blocked", blocker: "waiting on a synthetic fixture slot",
      notes: [{ id: "N3", text: artifact.variants["F-2-conflict"].text, authorType: "agent", authorId: ACTOR }] }] };
    const result = validateProjection(projection, CASE_EXPECTATIONS["N-2"], ctx());
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("not a human");
  });

  test("N-3 requires both claim texts present and attributed to the same authenticated human", () => {
    const good = { axes: [{ id: "A3", notes: [
      { id: "N1", text: "Synthetic human reading one: this is essentially done.", authorType: "human", authorId: ACTOR },
      { id: "N2", text: "Synthetic human reading two: no, this is still open.", authorType: "human", authorId: ACTOR },
    ] }] };
    expect(validateProjection(good, CASE_EXPECTATIONS["N-3"], ctx()).ok).toBe(true);

    const wrongActor = { axes: [{ id: "A3", notes: [
      { id: "N1", text: "Synthetic human reading one: this is essentially done.", authorType: "human", authorId: "someone-else" },
      { id: "N2", text: "Synthetic human reading two: no, this is still open.", authorType: "human", authorId: "someone-else" },
    ] }] };
    expect(validateProjection(wrongActor, CASE_EXPECTATIONS["N-3"], ctx()).ok).toBe(false);

    const nullAuthor = { axes: [{ id: "A3", notes: [
      { id: "N1", text: "Synthetic human reading one: this is essentially done.", authorType: "human", authorId: null },
      { id: "N2", text: "Synthetic human reading two: no, this is still open.", authorType: "human", authorId: null },
    ] }] };
    const result = validateProjection(nullAuthor, CASE_EXPECTATIONS["N-3"], ctx());
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("authenticated actor");

    const missingText = { axes: [{ id: "A3", notes: [
      { id: "N1", text: "Synthetic human reading one: this is essentially done.", authorType: "human", authorId: ACTOR },
    ] }] };
    expect(validateProjection(missingText, CASE_EXPECTATIONS["N-3"], ctx()).failures.join()).toContain("FIX-ANN-DISPUTE-2");
  });

  test("N-4 refuses a projection that leaks the problem-scoped steering note", () => {
    const projection = { axes: [{ id: "A4", state: "blocked", blocker: "a synthetic problem blocks this",
      notes: [{ id: "N9", text: "leaked", authorType: "human", authorId: ACTOR }] }] };
    const result = validateProjection(projection, CASE_EXPECTATIONS["N-4"], ctx());
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("must not be returned");
  });

  test("N-5 asserts the note list sits at the returned cap and is the human injection note", () => {
    const projection = { axes: [{ id: "A5", notes: [
      { id: "N5", text: artifact.variants["F-18-inj"].text, authorType: "human", authorId: ACTOR },
      { id: "x", text: "two", authorType: "human", authorId: ACTOR },
    ] }] };
    expect(validateProjection(projection, CASE_EXPECTATIONS["N-5"], ctx()).ok).toBe(true);
    const short = { axes: [{ id: "A5", notes: [
      { id: "N5", text: artifact.variants["F-18-inj"].text, authorType: "human", authorId: ACTOR },
    ] }] };
    expect(validateProjection(short, CASE_EXPECTATIONS["N-5"], ctx()).ok).toBe(false);
  });

  test("liveId refuses a missing mapping entry rather than returning undefined", () => {
    expect(() => liveId(mapping, "topics", "NOPE")).toThrow();
  });
});

// ------------------------------------------------------------------ snapshot

function makeStoreDb(path) {
  const db = new Database(path);
  db.exec("CREATE TABLE development_axes (id TEXT, version INTEGER); CREATE TABLE topics (id TEXT, summary TEXT)");
  db.query("INSERT INTO development_axes (id, version) VALUES ('FIX-AXIS-CLEAN', 1)").run();
  db.query("INSERT INTO topics (id, summary) VALUES ('FIX-TOPIC-ALPHA', 's')").run();
  db.close();
  return path;
}

describe("plugin store snapshot", () => {
  test("detects a logical change and passes a no-op (mutation detector can go red)", () => {
    const path = makeStoreDb(join(scratch, "store1.sqlite"));
    const before = canonicalSnapshot(path);
    expect(snapshotsEqual(before, canonicalSnapshot(path))).toBe(true);
    const db = new Database(path);
    db.query("UPDATE topics SET summary = summary || ' [x]' WHERE id = 'FIX-TOPIC-ALPHA'").run();
    db.close();
    expect(snapshotsEqual(before, canonicalSnapshot(path))).toBe(false);
  });

  test("fails closed on a generation change and on a revision change", () => {
    const a = { generation: "g1", revision: "r1" };
    expect(assertIdentityPinned(a, { generation: "g1", revision: "r1" }).ok).toBe(true);
    expect(assertIdentityPinned(a, { generation: "g2", revision: "r1" }).ok).toBe(false);
    expect(assertIdentityPinned(a, { generation: "g1", revision: "r2" }).ok).toBe(false);
  });

  test("assertNoLogicalMutation fails when the identity moved even if rows match", () => {
    const snap = canonicalSnapshot(makeStoreDb(join(scratch, "store2.sqlite")));
    const result = assertNoLogicalMutation({
      before: snap, after: snap,
      pinBefore: { generation: "g1", revision: "r1" },
      pinAfter: { generation: "g1", revision: "r2" },
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join()).toContain("revision changed");
  });

  test("positive control mutates only a scratch copy and is detected", () => {
    const path = makeStoreDb(join(scratch, "store3.sqlite"));
    const before = canonicalSnapshot(path);
    const control = positiveControlMutation({ dbPath: path, scratchDir: scratch });
    expect(control.detected).toBe(true);
    expect(control.copyPath.startsWith(scratch)).toBe(true);
    expect(snapshotsEqual(before, canonicalSnapshot(path))).toBe(true); // live store untouched
  });

  test("discovers exactly one generation and refuses an ambiguous store", () => {
    const root = join(scratch, "data-root");
    const dbDir = join(root, "orgs", "fixture", "plugins", "research-dashboard", "db");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "gen-1.sqlite"), "");
    const found = discoverStorePath({ dataRoot: root, org: "fixture", pluginId: "research-dashboard" });
    expect(found.generation).toBe("gen-1");
    writeFileSync(join(dbDir, "gen-2.sqlite"), "");
    expect(() => discoverStorePath({ dataRoot: root, org: "fixture", pluginId: "research-dashboard" }))
      .toThrow(SnapshotError);
  });

  test("reads the served revision and fails closed when it is absent", () => {
    const platform = join(scratch, "platform.sqlite");
    const db = new Database(platform);
    db.exec("CREATE TABLE org_plugins (org_id TEXT, plugin_id TEXT, revision TEXT)");
    db.query("INSERT INTO org_plugins VALUES ('o1','research-dashboard','511')").run();
    db.close();
    expect(readServedRevision({ platformDbPath: platform, orgId: "o1", pluginId: "research-dashboard" })).toBe("511");
    expect(() => readServedRevision({ platformDbPath: platform, orgId: "nope", pluginId: "research-dashboard" }))
      .toThrow(SnapshotError);
    const pinRoot = join(scratch, "pin-root");
    const pinDir = join(pinRoot, "orgs", "fixture", "plugins", "research-dashboard", "db");
    mkdirSync(pinDir, { recursive: true });
    writeFileSync(join(pinDir, "gen-1.sqlite"), "");
    const pin = pinStoreIdentity({
      dataRoot: pinRoot, org: "fixture", pluginId: "research-dashboard",
      platformDbPath: platform, orgId: "o1",
    });
    expect(pin).toMatchObject({ generation: "gen-1", revision: "511" });
  });
});

// ------------------------------------------------------------------ trace

describe("tool-call trace guard", () => {
  test("normalizes names and recognizes write calls", () => {
    expect(normalizeToolName("plugin_research_dashboard__get_topic")).toBe("get_topic");
    expect(isWriteToolCall("plugin_research_dashboard__reconcile_topic")).toBe(true);
    expect(isWriteToolCall("get_topic")).toBe(false);
  });

  test("absent, empty and malformed traces fail the cases that require consultation", () => {
    expect(validateTrace({ rows: [], requireConsultation: true }).reason).toBe("absent_trace");
    expect(validateTrace({ rows: [], requireConsultation: true }).ok).toBe(false);
    expect(validateTrace({ rows: [{ seq: 1, payload: JSON.stringify({ role: "assistant" }) }], requireConsultation: true }).reason)
      .toBe("empty_trace");
    expect(validateTrace({ rows: [{ seq: 1, payload: "{not json" }], requireConsultation: true }).reason)
      .toBe("malformed_trace");
    expect(parseToolCalls([{ seq: 1, payload: "[]" }]).ok).toBe(false);
  });

  test("an absent trace is acceptable only when no consultation is required", () => {
    expect(validateTrace({ rows: [], requireConsultation: false }).ok).toBe(true);
  });

  test("detects a write call in an otherwise read trace", () => {
    const rows = [
      { seq: 1, payload: JSON.stringify({ toolCalls: [{ name: "plugin_research_dashboard__get_topic", arguments: { topicName: "x" } }] }) },
      { seq: 2, payload: JSON.stringify({ toolCalls: [{ name: "plugin_research_dashboard__reconcile_topic" }] }) },
    ];
    const trace = validateTrace({ rows, requireConsultation: true });
    expect(trace.ok).toBe(true);
    expect(trace.writeCalls.length).toBe(1);
  });

  test("reads real rows from a scratch platform database", () => {
    const dbPath = join(scratch, "sessions.sqlite");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE session_messages (session_id TEXT, seq INTEGER, payload TEXT)");
    db.query("INSERT INTO session_messages VALUES ('s1', 1, ?)")
      .run(JSON.stringify({ toolCalls: [{ name: "get_overview" }] }));
    db.close();
    const rows = readSessionMessages(dbPath, "s1");
    expect(validateTrace({ rows, requireConsultation: true }).calls.length).toBe(1);
  });
});

// ------------------------------------------------------------------ inference guard

describe("inference and automation are default blocked", () => {
  test("assertInferenceAuthorized refuses without an authorization", () => {
    expect(() => assertInferenceAuthorized({})).toThrow(InferenceBlockedError);
  });

  test("runAgentTurn refuses before any transport call", async () => {
    let called = 0;
    await expect(runAgentTurn({
      base: "http://127.0.0.1:1", email: "e", password: "p", sessionId: "s", message: "hi",
      fetchImpl: async () => { called += 1; return fakeResponse(200, "{}"); },
    })).rejects.toBeInstanceOf(InferenceBlockedError);
    expect(called).toBe(0);
    expect(buildMessageRequest("hi")).toEqual({ message: "hi" });
  });

  test("runAutomation requires direct validation and inference authorization", async () => {
    const client = { post: () => { throw new Error("must not be called"); } };
    await expect(runAutomation({ client, automationId: "a" })).rejects.toBeInstanceOf(AutomationBlockedError);
    await expect(runAutomation({ client, automationId: "a", directValidated: true }))
      .rejects.toBeInstanceOf(InferenceBlockedError);
  });

  test("installAutomation is gated behind an explicit platform-write flag", async () => {
    const definition = buildAutomationDefinition({ name: "n", prompt: "p", profileId: "prof" });
    expect(definition.readOnly).toBe(true);
    await expect(installAutomation({ client: {}, definition })).rejects.toBeInstanceOf(AutomationBlockedError);
  });
});

// ------------------------------------------------------------------ fixture-run guards

describe("fixture-run plan and target guards", () => {
  test("counts the seed calls and never performs I/O", () => {
    const plan = buildPlan(artifact);
    expect(plan.seedCalls).toBe(3); // ALPHA + BETA main, plus the ALPHA problem-ref call
    expect(plan.problemRefCalls).toBe(1);
    expect(plan.topics.find((t) => t.topicSourceId === "FIX-TOPIC-ALPHA")).toMatchObject({
      axes: 7, problems: 1,
    });
    expect(plan.variants).toEqual(["F-2-conflict", "F-18-inj"]);
  });

  test("refuses a mapping output path inside the repository", () => {
    const repo = join(scratch, "repo");
    expect(() => assertPrivateOutputPath(join(scratch, "mapping.json"), repo)).not.toThrow();
    expect(() => assertPrivateOutputPath(join(repo, "mapping.json"), repo)).toThrow(/inside the repository/);
    expect(assertPrivateOutputPath(join(scratch, "mapping.json"), repo)).toBe(resolve(join(scratch, "mapping.json")));
  });

  test("assertOutputWritable creates a writable parent and refuses a path whose parent is a file", () => {
    expect(() => assertOutputWritable(join(scratch, "writable", "nested", "mapping.json"))).not.toThrow();
    const filePath = join(scratch, "a-file");
    writeFileSync(filePath, "x");
    expect(() => assertOutputWritable(join(filePath, "mapping.json"))).toThrow();
  });

  // The regression this gap is about: the CLI used to resolve/pin the store identity only AFTER the seed.
  // These fakes prove the pin now runs first and that every pre-seed gate refuses before any mutation.
  const fakeFixtureClient = (topics = []) => ({
    actorId: "user-fixture",
    listTopics: async () => ({ status: 200, result: { topics } }),
    action: async () => ({ status: 200, result: { ok: true } }),
  });

  test("runFixture pins the store identity BEFORE the seed and re-pins after the readback", async () => {
    const order = [];
    const code = await runFixture({
      client: fakeFixtureClient(),
      actorId: "user-fixture",
      outPath: join(scratch, "ordering", "mapping.json"),
      pinOptions: {},
      artifact,
      variants: artifact.defaultVariants,
      pinStore: () => { order.push("pin"); return { generation: "g1", revision: 1, lifecycleState: "enabled" }; },
      ensureOutputWritable: () => { order.push("writable"); },
      seed: async () => { order.push("seed"); return { mapping: {}, calls: [] }; },
      persistMapping: () => { order.push("persist"); },
      readbackCases: async () => { order.push("readback"); return { "N-1": { ok: true } }; },
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(0);
    // pin precedes the seed; the second pin closes the read-only readback.
    expect(order).toEqual(["pin", "writable", "seed", "persist", "readback", "pin"]);
  });

  test("runFixture refuses before mutating when the pre-seed pin fails", async () => {
    let seeded = false;
    const code = await runFixture({
      client: fakeFixtureClient(),
      actorId: "user-fixture",
      outPath: join(scratch, "nopin", "mapping.json"),
      pinOptions: {},
      artifact,
      pinStore: () => { throw new Error("no org_plugins row for org x plugin y"); },
      ensureOutputWritable: () => {},
      seed: async () => { seeded = true; return { mapping: {}, calls: [] }; },
      persistMapping: () => {},
      readbackCases: async () => ({}),
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(2);
    expect(seeded).toBe(false);
  });

  test("runFixture refuses before mutating when the mapping output is not writable", async () => {
    let seeded = false;
    const code = await runFixture({
      client: fakeFixtureClient(),
      actorId: "user-fixture",
      outPath: join(scratch, "unwritable", "mapping.json"),
      pinOptions: {},
      artifact,
      pinStore: () => ({ generation: "g1", revision: 1, lifecycleState: "enabled" }),
      ensureOutputWritable: () => { throw new Error("--out directory is not writable"); },
      seed: async () => { seeded = true; return { mapping: {}, calls: [] }; },
      persistMapping: () => {},
      readbackCases: async () => ({}),
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(2);
    expect(seeded).toBe(false);
  });

  test("runFixture refuses a non-empty store before pinning or seeding", async () => {
    const seen = [];
    const code = await runFixture({
      client: fakeFixtureClient([{ id: "t1", name: "already here" }]),
      actorId: "user-fixture",
      outPath: join(scratch, "nonempty", "mapping.json"),
      pinOptions: {},
      artifact,
      pinStore: () => { seen.push("pin"); return { generation: "g", revision: 1, lifecycleState: "enabled" }; },
      ensureOutputWritable: () => { seen.push("writable"); },
      seed: async () => { seen.push("seed"); return { mapping: {}, calls: [] }; },
      persistMapping: () => {},
      readbackCases: async () => ({}),
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(2);
    expect(seen).toEqual([]);
  });

  test("runFixture fails closed when the run moves the store generation or revision", async () => {
    let pins = 0;
    const code = await runFixture({
      client: fakeFixtureClient(),
      actorId: "user-fixture",
      outPath: join(scratch, "moved", "mapping.json"),
      pinOptions: {},
      artifact,
      pinStore: () => ({ generation: pins++ === 0 ? "g1" : "g2", revision: 1, lifecycleState: "enabled" }),
      ensureOutputWritable: () => {},
      seed: async () => ({ mapping: {}, calls: [] }),
      persistMapping: () => {},
      readbackCases: async () => ({ "N-1": { ok: true } }),
      log: () => {},
      err: () => {},
    });
    expect(code).toBe(1);
  });
});
