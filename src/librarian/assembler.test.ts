/**
 * Proposal assembler + bounded A/B/C snapshot driver tests
 * (DESIGN-V1 §5.2, §7.3; OFFLINE-IMPLEMENTATION-PROPOSAL §7, §8 F-2/F-3/F-5b/F-10/F-19/F-20).
 *
 * Pure — the observation is hand-built; the driver's read is an injected function.
 */
import { describe, expect, test } from "bun:test";
import {
  assembleProposal,
  assembleWithSnapshotDriver,
  assertProposalShape,
  buildObservation,
  computeCoverage,
  digestPayload,
  ContractRefusal,
  type Observation,
  type Subject,
} from "./assembler";

const SUBJECT: Subject = { axisId: "A1", topicId: "T1" };

function makeAxis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    blocker: "",
    branch: "fixture/clean",
    currentState: "",
    currentStateConfidence: "confirmed",
    evidence: [
      {
        at: "",
        by: "",
        kind: "branch",
        label: "fixture/clean",
        sourceRef: "",
        sourceType: null,
        sourceUrl: "",
      },
    ],
    history: [
      { axisId: "A1", id: "ACT-1", problemId: null, topicId: "T1" },
    ],
    id: "A1",
    kind: "feature",
    notes: [],
    plan: null,
    prNumber: 101,
    prUrl: "https://example.com/r/pull/101",
    problems: [],
    state: "active",
    stateConfidence: "confirmed",
    stateHistory: [{ axisId: "A1", id: "SL-1", problemId: null }],
    title: "Clean",
    topicId: "T1",
    updatedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function makeObservation(
  overrides: Partial<Omit<Observation, "axis">> & { axis?: Record<string, unknown> } = {}
): Observation {
  const { axis, ...rest } = overrides;
  return {
    asOf: "2026-09-20T00:00:00.000Z",
    axis: makeAxis(axis),
    digest: "digest-base",
    limits: { historyLimit: 25, notesLimit: 25 },
    payload: { axis: {}, search: null, topic: {}, topicNotes: [] },
    search: null,
    subject: SUBJECT,
    topic: { id: "T1" },
    topicActivity: [],
    topicNotes: [],
    ...rest,
  } as unknown as Observation;
}

function validCandidate(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    claimStrength: "inferred",
    conflicts: [],
    evidence_refs: [{ axisId: "A1", field: "state", variant: "axis_field" }],
    outcome: "proposal",
    provenance: "supplied-synthetic-candidate",
    text: "Fixture reading.",
  };
  // An `undefined` override removes the key (so a test can express "this field is absent").
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete base[key];
    } else {
      base[key] = value;
    }
  }
  return base;
}

describe("assembleProposal — the reply-only proposal", () => {
  test("emits a proposal-only object with no authority and no reasoning_strength", () => {
    const proposal = assembleProposal(makeObservation(), validCandidate(), {
      reads: 2,
    });
    expect(proposal.outcome).toBe("proposal");
    expect(proposal.reviewStatus).toBe("unreviewed");
    expect(proposal.claimStrength).toBe("inferred");
    expect(proposal.provenance).toBe("supplied-synthetic-candidate");
    expect(proposal.basis).toEqual({
      asOf: "2026-09-20T00:00:00.000Z",
      digest: "digest-base",
      reads: 2,
    });
    expect("authority" in proposal).toBe(false);
    expect("reasoning_strength" in proposal).toBe(false);
    expect(proposal.coverage.length).toBeGreaterThan(0);
    assertProposalShape(proposal);
  });

  test("echoes an injected provenance label verbatim (F-20)", () => {
    const proposal = assembleProposal(
      makeObservation(),
      validCandidate({ provenance: "supplied-synthetic-candidate:F-20" })
    );
    expect(proposal.provenance).toBe("supplied-synthetic-candidate:F-20");
  });

  test("F-19: a structurally valid candidate assembles even when the oracle will reject it semantically", () => {
    const proposal = assembleProposal(makeObservation(), validCandidate());
    expect(() => assertProposalShape(proposal)).not.toThrow();
  });
});

describe("assembleProposal — the contract fails closed", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    [
      "withheld text on a non-proposal",
      validCandidate({ claimStrength: undefined, outcome: "abstained", text: "leak" }),
      "withheld_text",
    ],
    [
      "claim strength on a non-proposal",
      validCandidate({ outcome: "insufficient_evidence", text: undefined }),
      "claim_strength_on_non_proposal",
    ],
    [
      "proposal without claim strength",
      validCandidate({ claimStrength: undefined }),
      "claim_strength_required",
    ],
    [
      "proposal without refs",
      validCandidate({ evidence_refs: [] }),
      "proposal_without_refs",
    ],
    [
      "the forbidden authority field",
      validCandidate({ authority: "high" }),
      "forbidden_field",
    ],
    [
      "a derived provenance request",
      validCandidate({ provenance: undefined, provenanceFrom: "author_type" }),
      "provenance_not_injected",
    ],
    [
      "an unknown conflict reason",
      validCandidate({
        claimStrength: undefined,
        conflicts: [{ reason: "vibes", refs: [] }],
        outcome: "abstained",
        text: undefined,
      }),
      "unknown_conflict_reason",
    ],
    [
      "a conflict with a proposal outcome",
      validCandidate({ conflicts: [{ reason: "human_steering_conflict", refs: [] }] }),
      "conflict_ref_not_human_steering",
    ],
    [
      "an abstention with no conflict",
      validCandidate({
        claimStrength: undefined,
        conflicts: [],
        outcome: "abstained",
        text: undefined,
      }),
      "abstention_without_conflict",
    ],
  ];

  for (const [name, candidate, reason] of cases) {
    test(`refuses ${name}`, () => {
      try {
        assembleProposal(makeObservation(), candidate);
        throw new Error("should have refused");
      } catch (error) {
        expect(error).toBeInstanceOf(ContractRefusal);
        expect((error as ContractRefusal).reason).toBe(reason);
      }
    });
  }

  test("refuses a proposal on an empty-evidence axis (F-5b)", () => {
    const empty = makeObservation({ axis: { evidence: [] } });
    try {
      assembleProposal(empty, validCandidate());
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ContractRefusal).reason).toBe("proposal_without_evidence");
    }
  });

  test("refuses human_human_conflict with fewer than two human claims (F-3 guard)", () => {
    const note = {
      authorType: "human",
      axisId: "A1",
      id: "N1",
      kind: "steering",
      problemId: null,
      topicId: null,
    };
    const observation = makeObservation({ axis: { notes: [note] } });
    try {
      assembleProposal(
        observation,
        validCandidate({
          claimStrength: undefined,
          conflicts: [
            { reason: "human_human_conflict", refs: [{ id: "N1", variant: "annotation" }] },
          ],
          evidence_refs: [{ id: "N1", variant: "annotation" }],
          outcome: "abstained",
          text: undefined,
        })
      );
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ContractRefusal).reason).toBe("human_human_conflict_needs_two");
    }
  });

  test("refuses a structured conflict carried on a proposal outcome", () => {
    const note = {
      authorType: "human",
      axisId: "A1",
      id: "N1",
      kind: "steering",
      problemId: null,
      topicId: null,
    };
    const observation = makeObservation({ axis: { notes: [note] } });
    try {
      assembleProposal(
        observation,
        validCandidate({
          conflicts: [
            { reason: "human_steering_conflict", refs: [{ id: "N1", variant: "annotation" }] },
          ],
          evidence_refs: [{ id: "N1", variant: "annotation" }],
        })
      );
      throw new Error("should have refused");
    } catch (error) {
      expect((error as ContractRefusal).reason).toBe("conflict_without_abstention");
    }
  });
});

describe("computeCoverage — derived only from returned evidence", () => {
  test("markup: cap equality is UNKNOWN, under-cap is COMPLETE, axis_evidence is always UNKNOWN", () => {
    const observation = makeObservation({
      axis: { notes: [{ id: "n1" }, { id: "n2" }] },
      limits: { historyLimit: 25, notesLimit: 2 },
    });
    const bySource = Object.fromEntries(
      computeCoverage(observation).map((entry) => [entry.source, entry.status])
    );
    expect(bySource.axis_notes).toBe("UNKNOWN");
    expect(bySource.axis_history).toBe("COMPLETE");
    expect(bySource.axis_evidence).toBe("UNKNOWN");
    expect(bySource.problem_scoped_steering).toBe("UNKNOWN");
    expect(bySource.axis_state_history).toBe("COMPLETE");
  });

  test("an explicit truncated flag is the only source that proves PARTIAL", () => {
    const observation = makeObservation({
      search: { limit: 1, query: "fixture", truncated: true },
    });
    const bySource = Object.fromEntries(
      computeCoverage(observation).map((entry) => [entry.source, entry.status])
    );
    expect(bySource.search).toBe("PARTIAL");
  });
});

describe("buildObservation — the digest normalization", () => {
  function rawDetail(generatedAt: string, updatedAt: string): unknown {
    return {
      activity: [],
      axes: [makeAxis({ updatedAt })],
      generatedAt,
      notes: [],
      ok: true,
      topic: { id: "T1" },
    };
  }

  test("omits the transport wrapper and read timing, retains domain timestamps", () => {
    const a = buildObservation(rawDetail("2026-09-20T10:00:00.000Z", "2026-09-01T00:00:00.000Z"), {
      limits: { historyLimit: 25, notesLimit: 25 },
      search: null,
      subject: SUBJECT,
    });
    const b = buildObservation(rawDetail("2026-09-20T10:00:09.999Z", "2026-09-01T00:00:00.000Z"), {
      limits: { historyLimit: 25, notesLimit: 25 },
      search: null,
      subject: SUBJECT,
    });
    // generatedAt moves on every read; the digest must not.
    expect(a.digest).toBe(b.digest);
    expect(a.asOf).not.toBe(b.asOf);
    // A real domain change (updatedAt) must move the digest.
    const c = buildObservation(rawDetail("2026-09-20T10:00:00.000Z", "2026-09-29T00:00:00.000Z"), {
      limits: { historyLimit: 25, notesLimit: 25 },
      search: null,
      subject: SUBJECT,
    });
    expect(c.digest).not.toBe(a.digest);
  });

  test("the canonical digest is key-order independent", () => {
    expect(digestPayload({ a: 1, b: [2, 3] })).toBe(
      digestPayload({ b: [2, 3], a: 1 })
    );
  });
});

describe("buildObservation — the observation is an isolated snapshot", () => {
  function rawDetail(
    activity: unknown[],
    notes: unknown[],
    generatedAt = "2026-09-20T10:00:00.000Z"
  ): unknown {
    return {
      activity,
      axes: [makeAxis({ notes })],
      generatedAt,
      notes: [],
      ok: true,
      topic: { id: "T1" },
    };
  }
  const OPTIONS = {
    limits: { historyLimit: 25, notesLimit: 25 },
    search: null,
    subject: SUBJECT,
  };
  const ACTIVITY = (id: string): unknown => ({
    axisId: null,
    id,
    problemId: null,
    topicId: "T1",
  });
  const NOTE = (id: string): unknown => ({
    authorType: "human",
    axisId: "A1",
    id,
    kind: "steering",
    problemId: null,
    topicId: null,
  });

  test("a post-construction mutation of the raw rows or options cannot change the observation, its digest or its citable rows", () => {
    const activity = [ACTIVITY("ACT-X")];
    const notes = [NOTE("N-RAW")];
    const raw = rawDetail(activity, notes);
    const options = {
      limits: { historyLimit: 25, notesLimit: 25 },
      search: null as Observation["search"],
      subject: { ...SUBJECT },
    };
    const observation = buildObservation(raw, options);
    const digestBefore = observation.digest;

    // Mutate the raw returned rows and the caller options after construction.
    activity.push(ACTIVITY("ACT-NEW"));
    notes.push(NOTE("N-NEW"));
    options.limits.notesLimit = 1;
    options.subject.axisId = "MUTATED";

    expect(observation.digest).toBe(digestBefore);
    expect(observation.topicActivity.length).toBe(1);
    expect(observation.axis.notes.length).toBe(1);
    expect(observation.limits.notesLimit).toBe(25);
    expect(observation.subject.axisId).toBe("A1");
    expect(Object.isFrozen(observation.axis)).toBe(true);
    expect(Object.isFrozen(observation.topicActivity)).toBe(true);
  });

  test("mutant: retaining aliases lets a raw mutation leak into the observation (the pristine guard above goes red)", () => {
    const activity = [ACTIVITY("ACT-X")];
    const raw = rawDetail(activity, []);
    const observation = buildObservation(raw, {
      ...OPTIONS,
      mutants: { retainAliases: true },
    });
    activity.push(ACTIVITY("ACT-LEAK"));
    // Under the mutant the observation aliases the raw array, so the mutation is visible here — the
    // pristine assertion `topicActivity.length === 1` would fail against this mutant.
    expect(observation.topicActivity.length).toBe(2);
    expect(Object.isFrozen(observation.topicActivity)).toBe(false);
  });

  test("topic-wide activity is part of the digest: a different activity list moves it", () => {
    const one = buildObservation(rawDetail([ACTIVITY("ACT-X")], []), OPTIONS);
    const two = buildObservation(rawDetail([ACTIVITY("ACT-Y")], []), OPTIONS);
    expect(one.digest).not.toBe(two.digest);
  });

  test("mutant: omitting topicActivity from the digest hides an activity change (the pristine assertion above goes red)", () => {
    const one = buildObservation(rawDetail([ACTIVITY("ACT-X")], []), {
      ...OPTIONS,
      mutants: { omitTopicActivityFromDigest: true },
    });
    const two = buildObservation(rawDetail([ACTIVITY("ACT-Y")], []), {
      ...OPTIONS,
      mutants: { omitTopicActivityFromDigest: true },
    });
    expect(one.digest).toBe(two.digest);
  });

  test("the caller options (subject, limits) are part of the digest", () => {
    const raw = rawDetail([], []);
    const base = buildObservation(raw, OPTIONS);
    expect(
      buildObservation(raw, {
        ...OPTIONS,
        limits: { historyLimit: 25, notesLimit: 2 },
      }).digest
    ).not.toBe(base.digest);
    expect(
      buildObservation(raw, {
        ...OPTIONS,
        subject: { axisId: "A1", topicId: "T2" },
      }).digest
    ).not.toBe(base.digest);
  });
});

describe("assertProposalShape — the emitted structural contract", () => {
  function emitted(): Record<string, unknown> {
    return assembleProposal(makeObservation(), validCandidate()) as unknown as Record<
      string,
      unknown
    >;
  }

  test("accepts a well-formed emitted proposal", () => {
    expect(() => assertProposalShape(emitted())).not.toThrow();
  });

  const malformed: Array<[string, (proposal: Record<string, any>) => void]> = [
    ["a missing basis", (p) => { delete p.basis; }],
    ["a non-numeric basis.reads", (p) => { p.basis.reads = "two"; }],
    ["a missing subject axisId", (p) => { delete p.subject.axisId; }],
    ["an empty provenance", (p) => { p.provenance = "   "; }],
    ["evidence_refs that is not an array", (p) => { p.evidence_refs = {}; }],
    ["a reference with no identity", (p) => { (p.evidence_refs as any[])[0].identity = ""; }],
    ["a conflict with an unknown reason", (p) => { p.conflicts = [{ reason: "vibes", refs: [] }]; }],
    ["coverage with an unknown status", (p) => {
      p.coverage = [{ note: "x", scope: "axis", source: "s", status: "MAYBE" }];
    }],
    ["a non-proposal outcome carrying text", (p) => { p.outcome = "abstained"; p.text = "leak"; }],
  ];

  for (const [name, mutate] of malformed) {
    test(`rejects ${name}`, () => {
      const proposal = emitted();
      mutate(proposal);
      expect(() => assertProposalShape(proposal)).toThrow(ContractRefusal);
    });
  }
});

describe("assembleWithSnapshotDriver — bounded A/B/C", () => {
  function driver(script: string[]) {
    const observe = (raw: unknown): Observation =>
      makeObservation({ digest: String(raw) });
    return assembleWithSnapshotDriver({
      candidate: validCandidate(),
      observe,
      read: async (step: number) => script[step],
    });
  }

  test("A = B: equal snapshots — the supplied constant candidate is delivered against the stable A/B observation", async () => {
    const result = await driver(["base", "base"]);
    expect(result.status).toBe("proposal");
    expect(result.proposal?.outcome).toBe("proposal");
    expect(result.reads).toBe(2);
    expect(result.digests).toEqual(["base", "base"]);
    expect(result.proposal?.basis.digest).toBe(result.digests[0]);
  });

  test("A != B, B = C: discards the A snapshot, selects the stable B observation, delivers against B/C", async () => {
    const result = await driver(["a", "b", "b"]);
    expect(result.status).toBe("proposal");
    expect(result.proposal?.outcome).toBe("proposal");
    expect(result.reads).toBe(3);
    expect(result.digests).toEqual(["a", "b", "b"]);
    expect(result.proposal?.basis.digest).toBe(result.digests[1]);
  });

  test("A != B, B != C: snapshot_unstable, no text, no further reads (F-10)", async () => {
    const result = await driver(["a", "b", "c"]);
    expect(result.status).toBe("proposal");
    expect(result.proposal?.outcome).toBe("snapshot_unstable");
    expect(result.reads).toBe(3);
    expect(result.proposal && "text" in result.proposal).toBe(false);
    expect(result.proposal && "claimStrength" in result.proposal).toBe(false);
  });

  test("an injected read failure is a hard read_error, never insufficient_evidence (F-11)", async () => {
    const result = await assembleWithSnapshotDriver({
      candidate: validCandidate(),
      observe: (raw: unknown): Observation => makeObservation({ digest: String(raw) }),
      read: async () => {
        throw new Error("injected fixture read failure");
      },
    });
    expect(result.status).toBe("read_error");
    expect(result.reads).toBe(1);
    expect(result.proposal).toBeNull();
  });
});

describe("assembleWithSnapshotDriver — construct/compare order and fail-closed refs", () => {
  /** A driver that records every read/observe call in order, with an arbitrary candidate. */
  function recordingDriver(script: string[], candidate: unknown) {
    const calls: string[] = [];
    const run = assembleWithSnapshotDriver({
      candidate,
      observe: (raw: unknown, step: number): Observation => {
        calls.push(`observe:${step}`);
        return makeObservation({ digest: String(raw) });
      },
      read: async (step: number) => {
        calls.push(`read:${step}`);
        return script[step];
      },
    });
    return { calls, run };
  }

  test("A = B: constructs A, constructs B, compares, and never reads C", async () => {
    const { calls, run } = recordingDriver(["base", "base"], validCandidate());
    const result = await run;
    expect(calls).toEqual(["read:0", "observe:0", "read:1", "observe:1"]);
    expect(result.status).toBe("proposal");
    expect(result.reads).toBe(2);
    expect(result.digests).toEqual(["base", "base"]);
  });

  test("A != B, B = C: discards A, selects the stable B observation before reading C", async () => {
    const { calls, run } = recordingDriver(["a", "b", "b"], validCandidate());
    const result = await run;
    expect(calls).toEqual([
      "read:0",
      "observe:0",
      "read:1",
      "observe:1",
      "read:2",
      "observe:2",
    ]);
    expect(result.status).toBe("proposal");
    expect(result.reads).toBe(3);
    expect(result.proposal?.basis.digest).toBe("b");
  });

  test("A != B, B != C: unstable, exactly three reads, no further observation builds", async () => {
    const { calls, run } = recordingDriver(["a", "b", "c"], validCandidate());
    const result = await run;
    expect(calls).toEqual([
      "read:0",
      "observe:0",
      "read:1",
      "observe:1",
      "read:2",
      "observe:2",
    ]);
    expect(result.reads).toBe(3);
    expect(result.proposal?.outcome).toBe("snapshot_unstable");
  });

  test("a candidate error against a stale A does not abort the protocol (validation is against the stable read)", async () => {
    const result = await assembleWithSnapshotDriver({
      candidate: validCandidate({
        evidence_refs: [{ id: "ACT-B", variant: "activity" }],
      }),
      observe: (raw: unknown, step: number): Observation =>
        makeObservation({
          axis:
            step === 1 || step === 2
              ? { history: [{ axisId: "A1", id: "ACT-B", problemId: null, topicId: "T1" }] }
              : {},
          digest: String(raw),
        }),
      read: async (step: number) => ["a", "b", "b"][step],
    });
    expect(result.status).toBe("proposal");
    expect(result.reads).toBe(3);
    expect(result.proposal?.basis.digest).toBe("b");
  });

  test("an unresolvable reference is refused on the A=B path", async () => {
    const { run } = recordingDriver(
      ["base", "base"],
      validCandidate({ evidence_refs: [{ id: "NOPE", variant: "activity" }] })
    );
    const result = await run;
    expect(result.status).toBe("refused");
    expect(result.error?.reason).toBe("unknown_id");
    expect(result.reads).toBe(2);
    expect(result.proposal).toBeNull();
  });

  test("an unresolvable reference is refused on the B=C path", async () => {
    const { run } = recordingDriver(
      ["a", "b", "b"],
      validCandidate({ evidence_refs: [{ id: "NOPE", variant: "activity" }] })
    );
    const result = await run;
    expect(result.status).toBe("refused");
    expect(result.error?.reason).toBe("unknown_id");
    expect(result.reads).toBe(3);
  });

  test("an unresolvable reference is refused on the churn path — never a silent drop", async () => {
    const { run } = recordingDriver(
      ["a", "b", "c"],
      validCandidate({ evidence_refs: [{ id: "NOPE", variant: "activity" }] })
    );
    const result = await run;
    expect(result.status).toBe("refused");
    expect(result.error?.reason).toBe("unknown_id");
    expect(result.reads).toBe(3);
    expect(result.proposal).toBeNull();
  });

  test("a missing provenance is refused on the churn path (no invented fallback)", async () => {
    const { run } = recordingDriver(
      ["a", "b", "c"],
      validCandidate({ provenance: undefined })
    );
    const result = await run;
    expect(result.status).toBe("refused");
    expect(result.error?.reason).toBe("provenance_missing");
    expect(result.reads).toBe(3);
    expect(result.proposal).toBeNull();
  });

  test("a valid churn carries the injected provenance and no candidate refs, and never exceeds three reads", async () => {
    const { run } = recordingDriver(
      ["a", "b", "c"],
      validCandidate({ evidence_refs: [{ id: "ACT-1", variant: "activity" }], provenance: "p:churn" })
    );
    const result = await run;
    expect(result.status).toBe("proposal");
    expect(result.reads).toBe(3);
    expect(result.proposal?.outcome).toBe("snapshot_unstable");
    expect(result.proposal?.provenance).toBe("p:churn");
    expect(result.proposal?.evidence_refs).toEqual([]);
    expect(result.proposal && "text" in result.proposal).toBe(false);
    expect(result.proposal && "claimStrength" in result.proposal).toBe(false);
  });

  test("a changed-then-stable compare preserves an insufficient_evidence outcome", async () => {
    const { run } = recordingDriver(
      ["a", "b", "b"],
      validCandidate({
        claimStrength: undefined,
        evidence_refs: [],
        outcome: "insufficient_evidence",
        text: undefined,
      })
    );
    const result = await run;
    expect(result.status).toBe("proposal");
    expect(result.proposal?.outcome).toBe("insufficient_evidence");
    expect(result.proposal?.basis.digest).toBe("b");
    expect(result.reads).toBe(3);
    expect(result.proposal && "text" in result.proposal).toBe(false);
  });

  test("a changed-then-stable compare preserves an abstained outcome and its structured conflict", async () => {
    const note = {
      authorType: "human",
      axisId: "A1",
      id: "N1",
      kind: "steering",
      problemId: null,
      topicId: null,
    };
    const result = await assembleWithSnapshotDriver({
      candidate: validCandidate({
        claimStrength: undefined,
        conflicts: [
          { reason: "human_steering_conflict", refs: [{ id: "N1", variant: "annotation" }] },
        ],
        evidence_refs: [{ id: "N1", variant: "annotation" }],
        outcome: "abstained",
        text: undefined,
      }),
      observe: (raw: unknown, step: number): Observation =>
        makeObservation({ axis: { notes: [note] }, digest: String(raw) }),
      read: async (step: number) => ["a", "b", "b"][step],
    });
    expect(result.status).toBe("proposal");
    expect(result.proposal?.outcome).toBe("abstained");
    expect(result.proposal?.conflicts.map((conflict) => conflict.reason)).toEqual([
      "human_steering_conflict",
    ]);
    expect(result.proposal?.basis.digest).toBe("b");
    expect(result.reads).toBe(3);
  });
});
