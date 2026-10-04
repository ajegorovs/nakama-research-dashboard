/**
 * Evidence Automation V1 — plugin ingest/provenance/readback contract tests.
 *
 * These are the tests the pre-V1 store could not express. The migration (005) adds a provenance/receipt row
 * that is linked to an ordinary Activity; the ingest path derives the canonical event identity on the server,
 * recomputes the worker's digest, resolves the target from a server-owned enrollment, and guarantees replay
 * and conflict semantics inside one transaction.
 *
 * They are deliberately written against the store, not the HTTP layer: the store is where the atomicity
 * guarantee lives, and the worker contract (envelope shape, statuses) is frozen in `docs/` so the transport
 * can be checked separately.
 *
 * The suite is discriminating on purpose. A green `inserted` test is not evidence that a malformed envelope
 * is refused, that a replay compares metadata as well as payload, that attribution changes conflict, or that
 * a failed receipt insert leaves no orphan activity. Each of those has its own negative test below.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Axis,
  EXTERNAL_EVENT_KINDS,
  type ExternalAuthor,
  type ExternalEvidenceEnvelopeV1,
  type Problem,
  ResearchStore,
} from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

const ORG = "org_evidence";
const PROVIDER_HOST = "github.com";
const REPO_ID = "1314713700";
const DEFAULT_BRANCH = "master";
const PR_NODE = "PR_kwDOTlzwZM8AAAABFjEqcg";
const MERGE_SHA = "750be675f6e153ac7bfd452447f5e2228d4db428";
const MERGED_AT = "2026-09-29T06:39:08Z";
const OTHER_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const COMMIT_SHA = "1234567890abcdef1234567890abcdef12345678";
const PARENT_SHA = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
const TREE_SHA = "fedcbafedcbafedcbafedcbafedcbafedcbafedc";
const COMMITTED_AT = "2026-09-29T06:39:07Z";
const OBSERVED_AT = "2026-09-29T07:00:00Z";
const PR_URL = "https://github.com/ajegorovs/udv-echo-process/pull/70";

function tempPath(): string {
  return `${process.env.TMPDIR ?? "/tmp"}/research-evidence-${crypto.randomUUID()}.sqlite`;
}

function seededPath(): string {
  const path = tempPath();
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return path;
}

function openStoreAt(path: string): ResearchStore {
  return new ResearchStore(path);
}

function count(path: string, table: string): number {
  const db = new Database(path);
  try {
    return (
      db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }
    ).n;
  } finally {
    db.close();
  }
}

/** Every refusal must be structured and must not have written anything. */
function expectNoWrites(path: string): void {
  expect(count(path, "activities")).toBe(0);
  expect(count(path, "external_evidence_receipts")).toBe(0);
}

function seedAxisWithProblem(store: ResearchStore): {
  topicId: string;
  axis: Axis;
  problem: Problem;
} {
  const topic = store.createTopic({
    description: "Signal processing",
    name: "Evidence automation",
    summary: "human summary that must survive ingest",
  });
  const axis = store.createAxis({
    branch: "evidence/ingest",
    title: "Collector ingest",
    topicId: topic.id,
  });
  const problem = store.createProblem({
    axisId: axis.id,
    authorId: "human-1",
    authorType: "human",
    statement: "Runner reports work that never happened",
  });
  return { axis, problem, topicId: topic.id };
}

function enroll(
  store: ResearchStore,
  axisId: string,
  topicId: string,
  options: { repositoryId?: string; defaultBranch?: string | null } = {}
): string {
  return store.enrollExternalRepository({
    axisId,
    createdBy: "admin-1",
    ...(options.defaultBranch === null
      ? {}
      : { defaultBranch: options.defaultBranch ?? DEFAULT_BRANCH }),
    orgId: ORG,
    providerHost: PROVIDER_HOST,
    repositoryFullName: "ajegorovs/udv-echo-process",
    repositoryId: options.repositoryId ?? REPO_ID,
    repositoryNodeId: "R_kgDOTlzwZA",
    topicId,
  }).id;
}

function prEnvelope(
  overrides: Partial<ExternalEvidenceEnvelopeV1> = {}
): ExternalEvidenceEnvelopeV1 {
  const base = {
    author: { id: "42", login: "ajegorovs", nodeId: "U_1" },
    defaultBranch: DEFAULT_BRANCH,
    envelopeVersion: 1 as const,
    eventKind: "pr.merged" as const,
    objectId: PR_NODE,
    objectKind: "pr" as const,
    objectNumber: 70,
    occurredAt: MERGED_AT,
    payload: {
      baseRefName: DEFAULT_BRANCH,
      headRefName: "sa2-6-live-notebook-baseline",
      mergeCommitOid: MERGE_SHA,
      mergedAt: MERGED_AT,
      number: 70,
      prNodeId: PR_NODE,
    } as Record<string, unknown>,
    payloadDigest: "",
    provider: "github" as const,
    providerHost: PROVIDER_HOST,
    repositoryFullName: "ajegorovs/udv-echo-process",
    repositoryId: REPO_ID,
    summary: "PR #70 merged",
    ...overrides,
  };
  base.payloadDigest = base.payloadDigest || digestOf(base.eventKind, base.payload);
  return base;
}

function commitEnvelope(
  overrides: Partial<ExternalEvidenceEnvelopeV1> = {}
): ExternalEvidenceEnvelopeV1 {
  const base = {
    author: { id: "42", login: "ajegorovs", nodeId: "U_1" },
    defaultBranch: DEFAULT_BRANCH,
    envelopeVersion: 1 as const,
    eventKind: "commit.observed" as const,
    objectId: COMMIT_SHA,
    objectKind: "commit" as const,
    objectNumber: null,
    occurredAt: COMMITTED_AT,
    payload: {
      committedAt: COMMITTED_AT,
      parentOids: [PARENT_SHA],
      sha: COMMIT_SHA,
      treeOid: TREE_SHA,
    } as Record<string, unknown>,
    payloadDigest: "",
    provider: "github" as const,
    providerHost: PROVIDER_HOST,
    repositoryFullName: "ajegorovs/udv-echo-process",
    repositoryId: REPO_ID,
    ...overrides,
  };
  base.payloadDigest = base.payloadDigest || digestOf(base.eventKind, base.payload);
  return base;
}

/** Mirrors the store's canonicalization so a fixture can produce a valid digest with or without an override. */
function digestOf(
  eventKind: (typeof EXTERNAL_EVENT_KINDS)[number],
  payload: Record<string, unknown>
): string {
  const fields: Record<string, string[]> = {
    "commit.observed": ["committedAt", "parentOids", "sha", "treeOid"],
    "pr.merged": [
      "baseRefName",
      "headRefName",
      "mergeCommitOid",
      "mergedAt",
      "number",
      "prNodeId",
    ],
  };
  const canonical: Record<string, unknown> = {};
  for (const field of fields[eventKind]) {
    if (payload[field] !== undefined) {
      canonical[field] = payload[field];
    }
  }
  const json = (value: unknown): string => {
    if (Array.isArray(value)) {
      return `[${value.map(json).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${json(record[key])}`)
        .join(",")}}`;
    }
    return JSON.stringify(value ?? null);
  };
  return new Bun.CryptoHasher("sha256").update(json(canonical)).digest("hex");
}

describe("migration 005 — external evidence", () => {
  test("is applied and creates the provenance/enrollment tables with the added columns", () => {
    const path = seededPath();
    const db = new Database(path);
    try {
      const tables = (
        db
          .query("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map((row) => row.name);
      expect(tables).toContain("external_enrollments");
      expect(tables).toContain("external_object_mappings");
      expect(tables).toContain("external_evidence_receipts");
      const enrollmentColumns = (
        db.query("PRAGMA table_info(external_enrollments)").all() as {
          name: string;
        }[]
      ).map((column) => column.name);
      const receiptColumns = (
        db.query("PRAGMA table_info(external_evidence_receipts)").all() as {
          name: string;
        }[]
      ).map((column) => column.name);
      expect(enrollmentColumns).toContain("default_branch");
      expect(receiptColumns).toContain("axis_id");
      expect(receiptColumns).toContain("problem_id");
    } finally {
      db.close();
    }
  });
});

describe("enrollExternalRepository", () => {
  test("binds an immutable repository id to an existing axis and derives the topic", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      const enrollment = store.enrollExternalRepository({
        axisId: axis.id,
        createdBy: "admin-1",
        defaultBranch: DEFAULT_BRANCH,
        orgId: ORG,
        providerHost: PROVIDER_HOST,
        repositoryId: REPO_ID,
        topicId,
      });
      expect(enrollment.repositoryId).toBe(REPO_ID);
      expect(enrollment.axisId).toBe(axis.id);
      expect(enrollment.topicId).toBe(topicId);
      expect(enrollment.defaultBranch).toBe(DEFAULT_BRANCH);
      expect(enrollment.status).toBe("active");
    } finally {
      store.close();
    }
  });

  test("refuses an axis that does not belong to the named topic", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis } = seedAxisWithProblem(store);
      const other = store.createTopic({ name: "Other" });
      expect(() =>
        store.enrollExternalRepository({
          axisId: axis.id,
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
          topicId: other.id,
        })
      ).toThrow(/does not belong/);
    } finally {
      store.close();
    }
  });

  test("refuses an invalid default branch name", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      expect(() =>
        store.enrollExternalRepository({
          axisId: axis.id,
          defaultBranch: "bad..branch",
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
          topicId,
        })
      ).toThrow(/defaultBranch/);
    } finally {
      store.close();
    }
  });

  test("re-enrolling the same identity re-points one active enrollment and bumps the mapping version", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      const first = store.enrollExternalRepository({
        axisId: axis.id,
        defaultBranch: DEFAULT_BRANCH,
        orgId: ORG,
        providerHost: PROVIDER_HOST,
        repositoryId: REPO_ID,
        topicId,
      });
      const again = store.enrollExternalRepository({
        axisId: axis.id,
        defaultBranch: DEFAULT_BRANCH,
        orgId: ORG,
        providerHost: PROVIDER_HOST,
        repositoryId: REPO_ID,
        topicId,
      });
      expect(again.id).toBe(first.id);
      expect(again.mappingVersion).toBe(first.mappingVersion + 1);
      expect(again.defaultBranch).toBe(DEFAULT_BRANCH);
      expect(store.listExternalEnrollments(ORG)).toHaveLength(1);
    } finally {
      store.close();
    }
  });
});

describe("ingestExternalEvidence — pr.merged", () => {
  test("inserts one activity and one receipt, attributes to system, and retains the GitHub author", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(result.status).toBe("inserted");
      expect(result.ok).toBe(true);
      expect(result.receipt?.activityId).toBeTruthy();
      expect(result.receipt?.payloadDigest).toBe(prEnvelope().payloadDigest);
      expect(result.receipt?.author.login).toBe("ajegorovs");

      const activities = store.listActivity({ axisId: axis.id });
      expect(activities).toHaveLength(1);
      expect(activities[0]?.actorType).toBe("system");
      expect(activities[0]?.actorId).toBe("collector-key-1");
      expect(activities[0]?.sourceType).toBe("github_pr");
      expect(activities[0]?.sourceUrl).toBe("");
      // The author is not the actor.
      expect(activities[0]?.actorId).not.toBe("ajegorovs");
      expect(count(path, "external_evidence_receipts")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("does not mint a Person or a repository registry row", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(store.listPeople()).toHaveLength(0);
      expect(store.listRepositories()).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("same identity + same payload and metadata replays: stable receipt, zero inserts, no recency touch", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const axisAfterFirst = store.getAxis(axis.id);
      const activityCount = count(path, "activities");
      const receiptCount = count(path, "external_evidence_receipts");

      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(replay.status).toBe("replayed");
      expect(replay.ok).toBe(true);
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(replay.receipt?.activityId).toBe(first.receipt?.activityId);
      expect(count(path, "activities")).toBe(activityCount);
      expect(count(path, "external_evidence_receipts")).toBe(receiptCount);
      // No recency touch: the parent's updated_at is byte-identical.
      expect(store.getAxis(axis.id)?.updatedAt).toBe(axisAfterFirst?.updatedAt);
    } finally {
      store.close();
    }
  });

  test("same identity but a different immutable payload conflicts and mutates nothing", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const activityCount = count(path, "activities");
      const conflict = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: DEFAULT_BRANCH,
            headRefName: "sa2-6-live-notebook-baseline",
            mergeCommitOid: OTHER_SHA,
            mergedAt: MERGED_AT,
            number: 70,
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(conflict.status).toBe("identity_conflict");
      expect(conflict.ok).toBe(false);
      expect(conflict.reason).toBe("identity_payload_mismatch");
      expect(conflict.receipt?.id).toBe(first.receipt?.id);
      expect(conflict.receipt?.payloadDigest).toBe(first.receipt?.payloadDigest);
      expect(count(path, "activities")).toBe(activityCount);
      expect(count(path, "external_evidence_receipts")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("a payload digest that disagrees with the server's own computation is refused", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ payloadDigest: "0".repeat(64) }),
        orgId: ORG,
      });
      expect(result.status).toBe("digest_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an unenrolled repository is unmapped and writes nothing", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId, { repositoryId: "9999999999" });
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(result.status).toBe("unmapped");
      expect(result.reason).toBe("repository_not_enrolled");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("readback returns the stored receipt by canonical identity", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const read = store.readExternalReceipt({
        eventKind: "pr.merged",
        objectId: PR_NODE,
        orgId: ORG,
        providerHost: PROVIDER_HOST,
        repositoryId: REPO_ID,
      });
      expect(read?.id).toBe(result.receipt?.id);
      expect(read?.activityId).toBe(result.receipt?.activityId);
      // A well-formed but unknown identity is a genuine `not_found`, not an error.
      expect(
        store.readExternalReceipt({
          eventKind: "pr.merged",
          objectId: "PR_kwDOTlzwZM8AAAABFjEqZZ",
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
        })
      ).toBeNull();
    } finally {
      store.close();
    }
  });

  test("malformed readback identity is refused, not answered not_found", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      // A short SHA for a commit identity is not a lookup key.
      expect(() =>
        store.readExternalReceipt({
          eventKind: "commit.observed",
          objectId: "abc123",
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
        })
      ).toThrow();
      // A malformed PR node id is not a lookup key.
      expect(() =>
        store.readExternalReceipt({
          eventKind: "pr.merged",
          objectId: "PR_nope",
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
        })
      ).toThrow();
      // An unknown provider host and a non-numeric repository id are refused too.
      expect(() =>
        store.readExternalReceipt({
          eventKind: "pr.merged",
          objectId: PR_NODE,
          orgId: ORG,
          providerHost: "gitlab.com",
          repositoryId: REPO_ID,
        })
      ).toThrow();
      expect(() =>
        store.readExternalReceipt({
          eventKind: "pr.merged",
          objectId: PR_NODE,
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: "not-numeric",
        })
      ).toThrow();
    } finally {
      store.close();
    }
  });
});

describe("ingestExternalEvidence — replay compares metadata and attribution, not only the payload", () => {
  test("a replay with different author provenance conflicts and mutates nothing", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          author: { id: "99", login: "someone-else", nodeId: "U_2" },
        }),
        orgId: ORG,
      });
      expect(replay.status).toBe("identity_conflict");
      expect(replay.reason).toBe("identity_metadata_mismatch");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
      expect(count(path, "external_evidence_receipts")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("a replay with a different source URL conflicts", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ sourceUrl: PR_URL }),
        orgId: ORG,
      });
      expect(replay.status).toBe("identity_conflict");
      expect(replay.reason).toBe("identity_metadata_mismatch");
      expect(count(path, "activities")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("a replay with a different summary conflicts", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ summary: "PR #70 merged (edited upstream)" }),
        orgId: ORG,
      });
      expect(replay.status).toBe("identity_conflict");
      expect(replay.reason).toBe("identity_metadata_mismatch");
      expect(count(path, "activities")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("observedAt is fetch time: a different value still replays", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ observedAt: OBSERVED_AT }),
        orgId: ORG,
      });
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ observedAt: "2026-09-29T09:30:00Z" }),
        orgId: ORG,
      });
      expect(replay.status).toBe("replayed");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("a free-form eventKey in the envelope cannot change identity: an identical retry replays", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const withKey = {
        ...prEnvelope(),
        eventKey: "worker-invented-identity-42",
      } as ExternalEvidenceEnvelopeV1;
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: withKey,
        orgId: ORG,
      });
      expect(first.status).toBe("inserted");
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(replay.status).toBe("replayed");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
    } finally {
      store.close();
    }
  });

  test("a mapping approved after the first write conflicts on replay, leaving the historical row intact", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, problem, topicId } = seedAxisWithProblem(store);
      const enrollmentId = enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(first.status).toBe("inserted");
      // The resolved attribution changes: the object now maps to a Problem it did not have before.
      store.setExternalObjectMapping({
        createdBy: "admin-1",
        enrollmentId,
        objectId: PR_NODE,
        objectKind: "pr",
        orgId: ORG,
        problemId: problem.id,
      });
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(replay.status).toBe("identity_conflict");
      expect(replay.reason).toBe("identity_mapping_mismatch");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
      expect(count(path, "external_evidence_receipts")).toBe(1);
      // The historical activity still has no Problem; the correction is a future append, not a rewrite.
      const stored = store.readExternalReceipt({
        eventKind: "pr.merged",
        objectId: PR_NODE,
        orgId: ORG,
        providerHost: PROVIDER_HOST,
        repositoryId: REPO_ID,
      });
      expect(stored?.activityId).toBe(first.receipt?.activityId);
      expect(store.listActivity({ axisId: axis.id })[0]?.problemId).toBeNull();
    } finally {
      store.close();
    }
  });

  test("re-pointing the enrollment to another axis conflicts on replay and never moves history", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const otherAxis = store.createAxis({
        branch: "evidence/other",
        title: "Other axis",
        topicId,
      });
      enroll(store, otherAxis.id, topicId);
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(replay.status).toBe("identity_conflict");
      expect(replay.reason).toBe("identity_mapping_mismatch");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
      // The fact still sits on the axis it was recorded against.
      expect(store.listActivity({ axisId: axis.id })).toHaveLength(1);
      expect(store.listActivity({ axisId: otherAxis.id })).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("a no-op re-enroll does not turn an identical retry into a false conflict", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const first = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      // Same identity, same target: the mapping version bumps but nothing about the meaning changes.
      enroll(store, axis.id, topicId);
      const replay = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(replay.status).toBe("replayed");
      expect(replay.receipt?.id).toBe(first.receipt?.id);
      expect(count(path, "activities")).toBe(1);
    } finally {
      store.close();
    }
  });
});

describe("ingestExternalEvidence — commit.observed and default-branch proof", () => {
  test("accepts a full default-branch SHA and rejects a short one", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);

      const short = commitEnvelope({
        objectId: COMMIT_SHA.slice(0, 7),
        payload: {
          committedAt: COMMITTED_AT,
          parentOids: [PARENT_SHA],
          sha: COMMIT_SHA.slice(0, 7),
          treeOid: TREE_SHA,
        },
      });
      expect(
        store.ingestExternalEvidence({
          collectorId: "collector-key-1",
          envelope: short,
          orgId: ORG,
        }).status
      ).toBe("rejected");

      const full = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope(),
        orgId: ORG,
      });
      expect(full.status).toBe("inserted");
      const activities = store.listActivity({ axisId: axis.id });
      expect(activities[0]?.sourceType).toBe("github_commit");
    } finally {
      store.close();
    }
  });

  test("rejects a commit whose objectId does not match payload.sha", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({ objectId: OTHER_SHA }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("object_id_payload_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("rejects short parent and tree SHAs", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const shortParent = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({
          payload: {
            committedAt: COMMITTED_AT,
            parentOids: [PARENT_SHA.slice(0, 7)],
            sha: COMMIT_SHA,
            treeOid: TREE_SHA,
          },
        }),
        orgId: ORG,
      });
      expect(shortParent.reason).toBe("invalid_parent_oid");
      const shortTree = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({
          payload: {
            committedAt: COMMITTED_AT,
            parentOids: [PARENT_SHA],
            sha: COMMIT_SHA,
            treeOid: "tree-1",
          },
        }),
        orgId: ORG,
      });
      expect(shortTree.reason).toBe("invalid_tree_sha");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("rejects a committedAt that disagrees with occurredAt", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({ occurredAt: "2026-09-29T06:39:59Z" }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("committed_at_occurred_at_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("rejects a commit when the enrollment has no approved default branch", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId, { defaultBranch: null });
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope(),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("default_branch_not_configured");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("requires explicit default-branch evidence and rejects a branch other than the approved one", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const missing = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({ defaultBranch: undefined }),
        orgId: ORG,
      });
      expect(missing.reason).toBe("default_branch_required");
      const wrong = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: commitEnvelope({ defaultBranch: "release" }),
        orgId: ORG,
      });
      expect(wrong.reason).toBe("default_branch_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("rejects a merged PR whose baseRefName is not the approved default branch", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: "release",
            headRefName: "sa2-6-live-notebook-baseline",
            mergeCommitOid: MERGE_SHA,
            mergedAt: MERGED_AT,
            number: 70,
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("pr_base_branch_not_default");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });
});

describe("ingestExternalEvidence — malformed envelopes fail closed as structured refusals", () => {
  test("an empty allowlisted payload is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ payload: {} }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("invalid_pr_payload");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("a payload that is not an object is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: [] as unknown as Record<string, unknown>,
        }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("invalid_payload");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an envelope that is not an object is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: [] as unknown as ExternalEvidenceEnvelopeV1,
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("invalid_envelope");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an objectId that does not match payload.prNodeId is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          objectId: "PR_kwDOTlzwZM8AAAABFjEqZZ",
        }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("object_id_payload_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an objectNumber that does not match payload.number is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ objectNumber: 71 }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("object_number_payload_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("a short merge SHA, a string number and a malformed mergedAt are rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const shortSha = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: DEFAULT_BRANCH,
            headRefName: "sa2-6-live-notebook-baseline",
            mergeCommitOid: MERGE_SHA.slice(0, 7),
            mergedAt: MERGED_AT,
            number: 70,
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(shortSha.reason).toBe("invalid_merge_commit_sha");
      const stringNumber = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: DEFAULT_BRANCH,
            headRefName: "sa2-6-live-notebook-baseline",
            mergeCommitOid: MERGE_SHA,
            mergedAt: MERGED_AT,
            number: "70",
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(stringNumber.reason).toBe("invalid_pr_number");
      const badDate = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: DEFAULT_BRANCH,
            headRefName: "sa2-6-live-notebook-baseline",
            mergeCommitOid: MERGE_SHA,
            mergedAt: "yesterday",
            number: 70,
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(badDate.reason).toBe("invalid_merged_at");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("a mergedAt that disagrees with occurredAt is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ occurredAt: "2026-09-29T06:39:59Z" }),
        orgId: ORG,
      });
      expect(result.reason).toBe("merged_at_occurred_at_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("a non-numeric repository id and a non-github host are rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const badRepo = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ repositoryId: "ajegorovs/udv-echo-process" }),
        orgId: ORG,
      });
      expect(badRepo.reason).toBe("invalid_repository_id");
      const badHost = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ providerHost: "gitlab.com" }),
        orgId: ORG,
      });
      expect(badHost.reason).toBe("unsupported_provider_host");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("a malformed source URL, a malformed author and a malformed observedAt are rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const badUrl = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ sourceUrl: "not a url" }),
        orgId: ORG,
      });
      expect(badUrl.reason).toBe("invalid_source_url");
      const offHost = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ sourceUrl: "https://example.com/pull/70" }),
        orgId: ORG,
      });
      expect(offHost.reason).toBe("invalid_source_url");
      const badAuthor = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          author: "ajegorovs" as unknown as ExternalAuthor,
        }),
        orgId: ORG,
      });
      expect(badAuthor.reason).toBe("invalid_author");
      const badObserved = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ observedAt: "yesterday" }),
        orgId: ORG,
      });
      expect(badObserved.reason).toBe("invalid_observed_at");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an oversized UTF-8 field is rejected by byte length", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      // "é" is two UTF-8 bytes, so 200 of them exceed the 255-byte field bound.
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({
          payload: {
            baseRefName: DEFAULT_BRANCH,
            headRefName: "é".repeat(200),
            mergeCommitOid: MERGE_SHA,
            mergedAt: MERGED_AT,
            number: 70,
            prNodeId: PR_NODE,
          },
        }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("payload_field_too_large");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });
});

describe("explicit object→Problem mapping", () => {
  test("a caller-supplied problemId without an approved mapping is refused", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, problem, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ problemId: problem.id }),
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("object_mapping_mismatch");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("an approved mapping attaches the Problem, and a different caller problemId still conflicts", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, problem, topicId } = seedAxisWithProblem(store);
      const enrollmentId = enroll(store, axis.id, topicId);
      store.setExternalObjectMapping({
        createdBy: "admin-1",
        enrollmentId,
        objectId: PR_NODE,
        objectKind: "pr",
        orgId: ORG,
        problemId: problem.id,
      });
      const wrong = store.createProblem({
        axisId: axis.id,
        authorId: "human-1",
        authorType: "human",
        statement: "unrelated",
      });
      const refused = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ problemId: wrong.id }),
        orgId: ORG,
      });
      expect(refused.status).toBe("rejected");

      const ok = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ problemId: problem.id }),
        orgId: ORG,
      });
      expect(ok.status).toBe("inserted");
      const activities = store.listActivity({ axisId: axis.id });
      expect(activities[0]?.problemId).toBe(problem.id);
    } finally {
      store.close();
    }
  });

  test("a mapping to a Problem on another axis is refused at mapping time", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis: enrolledAxis, topicId: enrolledTopic } =
        seedAxisWithProblem(store);
      const enrollmentId = enroll(store, enrolledAxis.id, enrolledTopic);
      const otherTopic = store.createTopic({ name: "Elsewhere" });
      const otherAxis = store.createAxis({
        title: "Other axis",
        topicId: otherTopic.id,
      });
      const otherProblem = store.createProblem({
        axisId: otherAxis.id,
        authorId: "human-1",
        authorType: "human",
        statement: "elsewhere",
      });
      expect(() =>
        store.setExternalObjectMapping({
          enrollmentId,
          objectId: PR_NODE,
          objectKind: "pr",
          orgId: ORG,
          problemId: otherProblem.id,
        })
      ).toThrow(/does not belong/);
    } finally {
      store.close();
    }
  });
});

describe("interpreted state is stable across ingest", () => {
  test("only new activity and documented parent recency change", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, problem, topicId } = seedAxisWithProblem(store);
      store.addAnnotation({
        axisId: axis.id,
        authorId: "human-1",
        authorType: "human",
        text: "human note must survive",
      });
      store.updateAxis(axis.id, {
        blocker: "waiting on upstream",
        currentState: "downstream review",
        state: "blocked",
      });
      store.updateTopic(topicId, { summary: "human topic summary" });
      const enrollmentId = enroll(store, axis.id, topicId);
      store.setExternalObjectMapping({
        createdBy: "admin-1",
        enrollmentId,
        objectId: PR_NODE,
        objectKind: "pr",
        orgId: ORG,
        problemId: problem.id,
      });

      const topicBefore = store.getTopic(topicId);
      const axisBefore = store.getAxis(axis.id);
      const problemBefore = store.getProblem(problem.id);
      const notesBefore = store.listAnnotations({ axisId: axis.id });

      store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope({ problemId: problem.id }),
        orgId: ORG,
      });

      const topicAfter = store.getTopic(topicId);
      const axisAfter = store.getAxis(axis.id);
      const problemAfter = store.getProblem(problem.id);
      const notesAfter = store.listAnnotations({ axisId: axis.id });

      expect(topicAfter?.summary).toBe(topicBefore?.summary);
      expect(topicAfter?.description).toBe(topicBefore?.description);
      expect(axisAfter?.state).toBe(axisBefore?.state);
      expect(axisAfter?.stateConfidence).toBe(axisBefore?.stateConfidence);
      expect(axisAfter?.blocker).toBe(axisBefore?.blocker);
      expect(axisAfter?.currentState).toBe(axisBefore?.currentState);
      expect(problemAfter?.statement).toBe(problemBefore?.statement);
      expect(problemAfter?.state).toBe(problemBefore?.state);
      expect(notesAfter).toEqual(notesBefore);
      // The one permitted change: the axis was touched, so its recency moved.
      expect(Date.parse(axisAfter?.updatedAt ?? "")).toBeGreaterThanOrEqual(
        Date.parse(axisBefore?.updatedAt ?? "")
      );
    } finally {
      store.close();
    }
  });
});

describe("atomicity under replay, response loss and fault", () => {
  test("two distinct store connections racing the same envelope create exactly one activity", () => {
    const path = seededPath();
    const writer = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(writer);
      enroll(writer, axis.id, topicId);
    } finally {
      writer.close();
    }
    const a = openStoreAt(path);
    const b = openStoreAt(path);
    try {
      const first = a.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      const second = b.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect([first.status, second.status].sort()).toEqual([
        "inserted",
        "replayed",
      ]);
      expect(count(path, "activities")).toBe(1);
      expect(count(path, "external_evidence_receipts")).toBe(1);
    } finally {
      a.close();
      b.close();
    }
  });

  test("two separate OS processes racing the same envelope create exactly one activity", async () => {
    const path = seededPath();
    const setup = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(setup);
      enroll(setup, axis.id, topicId);
    } finally {
      setup.close();
    }

    const workerPath = `${process.env.TMPDIR ?? "/tmp"}/evidence-ingest-worker-${crypto.randomUUID()}.ts`;
    writeFileSync(
      workerPath,
      [
        `import { ResearchStore } from ${JSON.stringify(join(import.meta.dir, "store.ts"))};`,
        "const store = new ResearchStore(process.argv[2]);",
        "try {",
        "  const result = store.ingestExternalEvidence({",
        '    collectorId: "collector-key-1",',
        "    envelope: JSON.parse(process.argv[3]),",
        '    orgId: "org_evidence",',
        "  });",
        "  process.stdout.write(result.status);",
        "} finally {",
        "  store.close();",
        "}",
      ].join("\n")
    );
    const envelope = JSON.stringify(prEnvelope());
    const spawn = () =>
      Bun.spawn([process.execPath, workerPath, path, envelope], {
        stderr: "pipe",
        stdout: "pipe",
      });
    const a = spawn();
    const b = spawn();
    const [outA, outB, codeA, codeB] = await Promise.all([
      new Response(a.stdout).text(),
      new Response(b.stdout).text(),
      a.exited,
      b.exited,
    ]);
    rmSync(workerPath, { force: true });
    expect([codeA, codeB]).toEqual([0, 0]);
    expect([outA.trim(), outB.trim()].sort()).toEqual(["inserted", "replayed"]);
    expect(count(path, "activities")).toBe(1);
    expect(count(path, "external_evidence_receipts")).toBe(1);
  });

  test("response loss is recovered by exact-key readback after the write committed", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      // Simulate: the worker timed out, but the write committed.
      store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      store.close();

      const recovered = openStoreAt(path);
      try {
        const receipt = recovered.readExternalReceipt({
          eventKind: "pr.merged",
          objectId: PR_NODE,
          orgId: ORG,
          providerHost: PROVIDER_HOST,
          repositoryId: REPO_ID,
        });
        expect(receipt).not.toBeNull();
        // And a retry of the same payload is a replay, not a duplicate.
        const retry = recovered.ingestExternalEvidence({
          collectorId: "collector-key-1",
          envelope: prEnvelope(),
          orgId: ORG,
        });
        expect(retry.status).toBe("replayed");
        expect(count(path, "activities")).toBe(1);
      } finally {
        recovered.close();
      }
    } finally {
      // store already closed; guard with a no-op
    }
  });

  test("a receipt-insert failure rolls back the activity and the recency touch", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const axisBefore = store.getAxis(axis.id);

      // Inject a deterministic failure **after** the activity insert has run, at the receipt insert.
      const injector = new Database(path);
      injector.exec(
        "CREATE TRIGGER fail_receipt BEFORE INSERT ON external_evidence_receipts BEGIN SELECT RAISE(ABORT, 'injected receipt failure'); END;"
      );
      injector.close();

      expect(() =>
        store.ingestExternalEvidence({
          collectorId: "collector-key-1",
          envelope: prEnvelope(),
          orgId: ORG,
        })
      ).toThrow();

      // No orphan activity, no orphan receipt, and the parent recency bump was rolled back.
      expectNoWrites(path);
      expect(store.getAxis(axis.id)?.updatedAt).toBe(axisBefore?.updatedAt);

      // With the fault removed the same envelope commits exactly once.
      const remover = new Database(path);
      remover.exec("DROP TRIGGER fail_receipt");
      remover.close();
      const ok = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: prEnvelope(),
        orgId: ORG,
      });
      expect(ok.status).toBe("inserted");
      expect(count(path, "activities")).toBe(1);
      expect(count(path, "external_evidence_receipts")).toBe(1);
    } finally {
      store.close();
    }
  });
});

describe("existing record_activity contract is unchanged", () => {
  test("a human/agent can still record activity with no external key", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      const activity = store.addActivity({
        actorId: "human-1",
        actorType: "human",
        axisId: axis.id,
        sourceRef: "manual note",
        summary: "recorded by hand",
        topicId,
      });
      expect(activity.actorType).toBe("human");
      expect(activity.summary).toBe("recorded by hand");
      expect(count(path, "external_evidence_receipts")).toBe(0);
    } finally {
      store.close();
    }
  });
});

describe("hardening F2/F3 — mapping org scope and padded semantic fields", () => {
  test("F2: a mapping is refused when its org does not own the enrollment", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, problem, topicId } = seedAxisWithProblem(store);
      const enrollmentId = enroll(store, axis.id, topicId);
      expect(() =>
        store.setExternalObjectMapping({
          createdBy: "admin-1",
          enrollmentId,
          objectId: PR_NODE,
          objectKind: "pr",
          // A second organization that does not own this enrollment.
          orgId: "org_other",
          problemId: problem.id,
        })
      ).toThrow(/another organization/);
      // And nothing was written.
      const mapped = store.getExternalObjectMapping({
        enrollmentId,
        objectId: PR_NODE,
        objectKind: "pr",
      });
      expect(mapped).toBeNull();
    } finally {
      store.close();
    }
  });

  test("F3: a padded PR semantic field is rejected, not silently normalized", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const padded = prEnvelope();
      padded.payload = { ...padded.payload, prNodeId: ` ${PR_NODE} ` };
      // Cross-check uses the trimmed view, so identity is unchanged; the strict rule still refuses it
      // because the digested bytes are not the canonical identity the contract freezes.
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: padded,
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("invalid_pr_payload");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });

  test("F3: a padded commit parent OID is rejected", () => {
    const path = seededPath();
    const store = openStoreAt(path);
    try {
      const { axis, topicId } = seedAxisWithProblem(store);
      enroll(store, axis.id, topicId);
      const env = commitEnvelope();
      const parents = (env.payload as { parentOids: string[] }).parentOids;
      (env.payload as { parentOids: string[] }).parentOids = [
        ` ${parents[0]} `,
        ...parents.slice(1),
      ];
      const result = store.ingestExternalEvidence({
        collectorId: "collector-key-1",
        envelope: env,
        orgId: ORG,
      });
      expect(result.status).toBe("rejected");
      expect(result.reason).toBe("invalid_parent_oid");
      expectNoWrites(path);
    } finally {
      store.close();
    }
  });
});
