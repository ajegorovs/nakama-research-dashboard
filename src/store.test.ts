/**
 * Store v2 tests.
 *
 * Every test runs against a database built from the **shipped migrations** (001, then 002) rather than
 * hand-written DDL, so the store is checked against the schema the platform will actually hand it.
 *
 * The interesting tests here are the ones V1 could not have passed: the pragmas (each action runs in a
 * fresh child process, so they must be set on every open), the transaction boundaries (a reconcile that
 * fails part-way leaves nothing behind) and the optimistic-version check.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Axis,
  ResearchStore,
  ResearchStoreConflictError,
  ResearchStoreError,
} from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = ["001-research.sql", "002-coordination-model.sql"].map(
  (name) => readFileSync(join(migrationsDir, name), "utf8")
);

function tempPath(): string {
  return `${process.env.TMPDIR ?? "/tmp"}/research-store-${crypto.randomUUID()}.sqlite`;
}

/** A database as the platform would hand it to the plugin: both migrations applied. */
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

function openStore(): { path: string; store: ResearchStore } {
  const path = seededPath();
  return { path, store: new ResearchStore(path) };
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

describe("ResearchStore connection settings", () => {
  test("configures foreign keys, WAL and a busy timeout on every open", () => {
    const { path, store } = openStore();
    expect(store.pragmas()).toEqual({
      busyTimeout: 5000,
      foreignKeys: 1,
      journalMode: "wal",
    });
    store.close();

    // A second process (= a second store) must get the same settings: nothing is configured "once at
    // startup", because for one action there is no startup.
    const reopened = new ResearchStore(path);
    expect(reopened.pragmas()).toEqual({
      busyTimeout: 5000,
      foreignKeys: 1,
      journalMode: "wal",
    });
    reopened.close();
  });
});

describe("ResearchStore topics", () => {
  test("creates, reads back and updates a topic, bumping its version", () => {
    const { store } = openStore();
    const created = store.createTopic({
      description: "filtering work",
      name: "Signal Processing",
    });
    expect(created).toMatchObject({
      description: "filtering work",
      name: "Signal Processing",
      status: "active",
      version: 1,
    });
    expect(store.getTopic(created.id)?.id).toBe(created.id);
    expect(store.getTopicByName("signal processing")?.id).toBe(created.id);

    const updated = store.updateTopic(created.id, {
      status: "completed",
      summary: "shipped",
    });
    expect(updated.version).toBe(2);
    expect(updated.status).toBe("completed");
    expect(updated.summary).toBe("shipped");
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  test("rejects a duplicate name regardless of case", () => {
    const { store } = openStore();
    store.createTopic({ name: "Topic Alpha" });
    expect(() => store.createTopic({ name: "topic alpha" })).toThrow(
      ResearchStoreError
    );
  });

  test("validates the topic status vocabulary", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    // 'done' was gen 1's word for it; gen 2 calls it 'completed'.
    expect(() =>
      store.updateTopic(topic.id, { status: "done" as unknown as "completed" })
    ).toThrow(ResearchStoreError);
  });

  test("lists topics most recently updated first", () => {
    const { store } = openStore();
    const first = store.createTopic({ name: "Topic Alpha" });
    store.createTopic({ name: "Topic Beta" });
    store.updateTopic(first.id, { summary: "touched last" });
    expect(store.listTopics()[0]?.id).toBe(first.id);
    expect(store.listTopics("active")).toHaveLength(2);
  });

  test("deleting a topic cascades to its axes, links, activity and annotations", () => {
    const { path, store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    const other = store.createTopic({ name: "Topic Beta" });
    const repository = store.registerRepository({
      fullName: "group/processing-pipeline",
    });
    const person = store.registerPerson({ displayName: "Researcher A" });
    const axis = store.createAxis({
      branch: "feat/signal-explorer",
      title: "Signal explorer",
      topicId: topic.id,
    });
    const second = store.createAxis({
      branch: "feat/acquisition-control",
      title: "Parameter automation",
      topicId: topic.id,
    });
    store.linkTopicRepository(topic.id, repository.repository.id, "primary");
    store.linkTopicPerson(topic.id, person.person.id, "lead");
    store.linkAxisRepository(axis.id, repository.repository.id, "primary");
    store.linkAxisPerson(axis.id, person.person.id, "owner");
    store.addActivity({
      axisId: axis.id,
      summary: "prototype run",
      topicId: topic.id,
    });
    store.addAnnotation({ axisId: axis.id, text: "hardware test postponed" });

    store.deleteTopic(topic.id);

    expect(store.getTopic(topic.id)).toBeNull();
    expect(store.getAxis(axis.id)).toBeNull();
    expect(store.getAxis(second.id)).toBeNull();
    expect(count(path, "axis_repositories")).toBe(0);
    expect(count(path, "axis_people")).toBe(0);
    expect(count(path, "topic_repositories")).toBe(0);
    expect(count(path, "topic_people")).toBe(0);
    expect(count(path, "activities")).toBe(0);
    expect(count(path, "annotations")).toBe(0);
    // Repositories and people are shared infrastructure: they outlive the topic that used them.
    expect(store.listRepositories()).toHaveLength(1);
    expect(store.listPeople()).toHaveLength(1);
    expect(store.getTopic(other.id)?.id).toBe(other.id);
  });
});

describe("ResearchStore optimistic versioning", () => {
  test("rejects a stale expectedVersion and writes nothing", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    store.updateTopic(topic.id, { summary: "first writer" });
    const current = store.getTopic(topic.id) as {
      updatedAt: string;
      version: number;
    };

    expect(() =>
      store.updateTopic(
        topic.id,
        { summary: "second writer" },
        { expectedVersion: 1 }
      )
    ).toThrow(ResearchStoreConflictError);
    try {
      store.updateTopic(
        topic.id,
        { summary: "second writer" },
        { expectedVersion: 1 }
      );
    } catch (error) {
      expect((error as Error).message.startsWith("conflict: ")).toBe(true);
      expect((error as Error).message).toContain("version 2");
    }

    const after = store.getTopic(topic.id) as {
      summary: string;
      updatedAt: string;
      version: number;
    };
    expect(after).toMatchObject({
      summary: "first writer",
      version: current.version,
    });
    expect(after.updatedAt).toBe(current.updatedAt);

    // The matching version goes through.
    const applied = store.updateTopic(
      topic.id,
      { summary: "second writer" },
      { expectedVersion: current.version }
    );
    expect(applied.version).toBe(current.version + 1);
  });

  test("rejects a stale expectedVersion on an axis update", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    const axis = store.createAxis({
      branch: "feat/signal-explorer",
      title: "Signal explorer",
      topicId: topic.id,
    });
    expect(() =>
      store.updateAxis(axis.id, { state: "parked" }, { expectedVersion: 99 })
    ).toThrow(ResearchStoreConflictError);
    expect(store.getAxis(axis.id)?.state).toBe("active");
  });
});

describe("ResearchStore axes", () => {
  test("refuses a blocked axis with no blocker text", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Acquisition Automation" });
    expect(() =>
      store.createAxis({
        state: "blocked",
        title: "Parameter automation",
        topicId: topic.id,
      })
    ).toThrow(/without blocker text/);
    const ok = store.createAxis({
      blocker: "waiting on the rig's firmware update",
      state: "blocked",
      title: "Parameter automation",
      topicId: topic.id,
    });
    expect(ok).toMatchObject({
      blocker: "waiting on the rig's firmware update",
      state: "blocked",
    });
  });

  test("refuses a claim of 'confirmed' with nothing behind it", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() =>
      store.createAxis({
        stateConfidence: "confirmed",
        title: "Unbacked claim",
        topicId: topic.id,
      })
    ).toThrow(/carries no evidence/);

    const backed = store.createAxis({
      branch: "feat/signal-explorer",
      title: "Backed claim",
      topicId: topic.id,
    });
    expect(backed.branch).toBe("feat/signal-explorer");
    // A claim made without evidence is still allowed if it is labelled honestly.
    const inferred = store.createAxis({
      stateConfidence: "inferred",
      title: "Inferred claim",
      topicId: topic.id,
    });
    expect(inferred.stateConfidence).toBe("inferred");
  });

  test("keeps topic and axis lifecycles separate", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() =>
      store.updateTopic(topic.id, {
        status: "abandoned" as unknown as "archived",
      })
    ).toThrow(ResearchStoreError);
    // 'archived' is a topic state, 'abandoned' is an axis state.
    expect(store.updateTopic(topic.id, { status: "archived" }).status).toBe(
      "archived"
    );
  });
});

describe("ResearchStore activity and annotations", () => {
  test("records activity with provenance and moves the parent's updated_at", async () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    const before = store.getTopic(topic.id) as { updatedAt: string };
    await Bun.sleep(2);

    const activity = store.addActivity({
      actorId: "user-1",
      actorType: "human",
      sourceRef: "run 2026-09-29-a",
      sourceType: "experiment",
      summary: "prototype run over the full evaluation set",
      topicId: topic.id,
    });
    expect(activity).toMatchObject({
      actorId: "user-1",
      actorType: "human",
      sourceType: "experiment",
      topicId: topic.id,
    });
    expect(activity.recordedAt).toBeTruthy();
    const after = store.getTopic(topic.id) as { updatedAt: string };
    expect(after.updatedAt > before.updatedAt).toBe(true);

    expect(store.listActivity({ topicId: topic.id })).toHaveLength(1);
    expect(store.listActivity({ topicId: "other-topic" })).toHaveLength(0);
  });

  test("requires an owner and a valid source type", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() => store.addActivity({ summary: "orphan" })).toThrow(
      ResearchStoreError
    );
    expect(() =>
      store.addActivity({
        sourceType: "PR" as unknown as "github_pr",
        summary: "drifted source type",
        topicId: topic.id,
      })
    ).toThrow(ResearchStoreError);
    expect(() =>
      store.addActivity({ summary: "unknown topic", topicId: "nope" })
    ).toThrow(ResearchStoreError);
  });

  test("refuses an activity whose axis belongs to another topic", () => {
    const { store } = openStore();
    const alpha = store.createTopic({ name: "Topic Alpha" });
    const beta = store.createTopic({ name: "Topic Beta" });
    const axis = store.createAxis({
      branch: "feat/signal-explorer",
      title: "Signal explorer",
      topicId: beta.id,
    });
    expect(() =>
      store.addActivity({
        axisId: axis.id,
        summary: "mismatched",
        topicId: alpha.id,
      })
    ).toThrow(/does not belong/);
  });

  test("attributes annotations to the acting human or agent without inventing a person", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    const annotation = store.addAnnotation({
      authorId: "user-9",
      authorType: "agent",
      text: "the group agreed to park this until the rig is free",
      topicId: topic.id,
    });
    expect(annotation).toMatchObject({
      authorId: "user-9",
      authorType: "agent",
    });
    expect(store.listPeople()).toHaveLength(0);
    expect(store.listAnnotations({ topicId: topic.id })).toHaveLength(1);
  });
});

describe("ResearchStore reconcileTopic", () => {
  test("applies a whole topic update in one call", () => {
    const { store } = openStore();
    const result = store.reconcileTopic({
      actor: { id: "user-1", type: "human" },
      annotations: [
        { axisTitle: "Signal explorer", text: "agreed in the group meeting" },
      ],
      axes: [
        {
          branch: "feat/signal-explorer",
          currentState: "filtering prototype compares methods",
          description: "prototype work",
          kind: "experiment",
          people: [{ displayName: "Researcher A", role: "owner" }],
          repositories: [
            { fullName: "group/processing-pipeline", relationship: "primary" },
            { fullName: "group/analysis-notes" },
          ],
          state: "active",
          title: "Signal explorer",
        },
      ],
      people: [{ displayName: "Researcher B", role: "reviewer" }],
      repositories: [
        { fullName: "group/processing-pipeline", relationship: "primary" },
      ],
      topic: {
        description: "filtering and reconstruction",
        summary: "under review",
      },
      topicName: "Signal Processing",
    });

    expect(result.created).toMatchObject({
      axes: 1,
      people: 2,
      repositories: 2,
      topic: true,
    });
    expect(result.topic).toMatchObject({
      description: "filtering and reconstruction",
      name: "Signal Processing",
      summary: "under review",
      version: 2, // created, then patched in the same transaction
    });
    expect(result.axes).toHaveLength(1);
    const axis = result.axes[0] as Axis;
    expect(axis).toMatchObject({
      kind: "experiment",
      state: "active",
      version: 1,
    });

    // Many-to-many holds: one repository is primary for the topic and the axis, the other supporting.
    expect(
      store
        .listAxisRepositories(axis.id)
        .map((row) => [row.fullName, row.relationship])
    ).toEqual([
      ["group/processing-pipeline", "primary"],
      ["group/analysis-notes", "supporting"],
    ]);
    expect(store.listTopicRepositories(result.topic.id)).toHaveLength(1);
    expect(store.listAxisPeople(axis.id)[0]).toMatchObject({
      displayName: "Researcher A",
      role: "owner",
    });
    expect(store.listTopicPeople(result.topic.id)[0]).toMatchObject({
      displayName: "Researcher B",
    });
    expect(result.recorded.annotations).toHaveLength(1);
  });

  test("updates an existing topic and axis by name, bumping each version once", () => {
    const { store } = openStore();
    const first = store.reconcileTopic({
      axes: [{ branch: "feat/signal-explorer", title: "Signal explorer" }],
      topicName: "Signal Processing",
    });
    const again = store.reconcileTopic({
      activities: [
        { axisTitle: "Signal explorer", summary: "filtering run finished" },
      ],
      axes: [{ state: "parked", title: "Signal explorer" }],
      topic: { status: "paused" },
      topicName: "Signal Processing",
    });

    expect(again.created).toMatchObject({ axes: 0, topic: false });
    expect(again.topic.id).toBe(first.topic.id);
    expect(again.topic.status).toBe("paused");
    expect(again.topic.version).toBe(2); // 1 on create (no patch in that call), + 1 for this patch
    const axis = again.axes[0] as Axis;
    expect(axis).toMatchObject({ state: "parked", version: 2 });
    expect(store.listActivity({ axisId: axis.id })).toHaveLength(1);
    expect(store.getTopicByName("Signal Processing")?.id).toBe(first.topic.id);
  });

  test("promoting a repository to primary demotes the previous one", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    const one = store.registerRepository({ fullName: "group/one" });
    const two = store.registerRepository({ fullName: "group/two" });
    store.linkTopicRepository(topic.id, one.repository.id, "primary");
    store.linkTopicRepository(topic.id, two.repository.id, "primary");
    expect(
      store
        .listTopicRepositories(topic.id)
        .map((row) => [row.fullName, row.relationship])
    ).toEqual([
      ["group/two", "primary"],
      ["group/one", "supporting"],
    ]);
  });

  test("is atomic: a failure part-way through changes nothing", async () => {
    const { path, store } = openStore();
    const topic = store.createTopic({
      name: "Signal Processing",
      summary: "before",
    });
    await Bun.sleep(2);
    const before = store.getTopic(topic.id) as {
      updatedAt: string;
      version: number;
    };

    // The topic patch lands first, then the first axis, then the second axis trips the blocker rule —
    // far enough in that an unprotected writer would leave rows behind.
    expect(() =>
      store.reconcileTopic({
        axes: [
          { branch: "feat/signal-explorer", title: "Signal explorer" },
          { state: "blocked", title: "Parameter automation" },
        ],
        people: [{ displayName: "Researcher A" }],
        repositories: [{ fullName: "group/processing-pipeline" }],
        topic: { summary: "after" },
        topicId: topic.id,
      })
    ).toThrow(/without blocker text/);

    const after = store.getTopic(topic.id) as {
      summary: string;
      updatedAt: string;
      version: number;
    };
    expect(after).toMatchObject({ summary: "before", version: before.version });
    expect(after.updatedAt).toBe(before.updatedAt);
    expect(count(path, "development_axes")).toBe(0);
    expect(count(path, "repositories")).toBe(0);
    expect(count(path, "people")).toBe(0);
    expect(count(path, "topic_people")).toBe(0);
    expect(count(path, "topic_repositories")).toBe(0);
  });

  test("is atomic on a version conflict too", () => {
    const { path, store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() =>
      store.reconcileTopic({
        axes: [{ title: "Signal explorer" }],
        expectedVersion: 42,
        topic: { summary: "should not land" },
        topicId: topic.id,
      })
    ).toThrow(ResearchStoreConflictError);
    expect(store.getTopic(topic.id)?.summary).toBe("");
    expect(count(path, "development_axes")).toBe(0);
  });

  test("the evidence a claim needs may arrive in the same call", () => {
    const { path, store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    // Declaring a state with no branch, PR or activity must fail ...
    expect(() =>
      store.reconcileTopic({
        axes: [{ state: "completed", title: "Unbacked" }],
        topicId: topic.id,
      })
    ).toThrow(/carries no evidence/);
    expect(count(path, "development_axes")).toBe(0);

    // ... and the same call passes when it also records what backs the claim.
    const result = store.reconcileTopic({
      activities: [
        { axisTitle: "Backed", summary: "reconstruction baseline retired" },
      ],
      axes: [{ state: "completed", title: "Backed" }],
      topicId: topic.id,
    });
    const axis = result.axes[0] as Axis;
    expect(axis.state).toBe("completed");
    expect(store.listActivity({ axisId: axis.id })).toHaveLength(1);
  });

  test("reports unknown ids as fixable rules, not raw SQLite errors", () => {
    const { store } = openStore();
    expect(() => store.reconcileTopic({ topicId: "missing" })).toThrow(
      /Topic not found/
    );
    expect(() => store.reconcileTopic({})).toThrow(
      /topicId or topicName is required/
    );
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() =>
      store.reconcileTopic({
        activities: [{ axisTitle: "No such axis", summary: "x" }],
        topicId: topic.id,
      })
    ).toThrow(/not found in this topic/);
  });
});

describe("ResearchStore repositories and people", () => {
  test("registers each repository once, keyed case-insensitively by full name", () => {
    const { path, store } = openStore();
    const first = store.registerRepository({
      description: "pipeline",
      fullName: "group/Repo",
    });
    expect(first.created).toBe(true);
    const second = store.registerRepository({
      fullName: "GROUP/repo",
      url: "https://example.invalid/r",
    });
    expect(second.created).toBe(false);
    expect(second.repository.id).toBe(first.repository.id);
    expect(second.repository.url).toBe("https://example.invalid/r");
    expect(count(path, "repositories")).toBe(1);
  });

  test("resolves a person by Nakama user id or GitHub login, never by display name", () => {
    const { path, store } = openStore();
    const byNakama = store.registerPerson({
      displayName: "Researcher A",
      nakamaUserId: "user-1",
    });
    expect(
      store.registerPerson({
        displayName: "Researcher A renamed",
        nakamaUserId: "user-1",
      }).created
    ).toBe(false);
    const byLogin = store.registerPerson({
      displayName: "Researcher B",
      githubLogin: "researcher-b",
    });
    expect(
      store.registerPerson({
        displayName: "Someone Else",
        githubLogin: "RESEARCHER-B",
      }).created
    ).toBe(false);
    // Two people may share a display name; the name is not an identity.
    expect(store.registerPerson({ displayName: "Researcher A" }).created).toBe(
      true
    );
    expect(count(path, "people")).toBe(3);
    expect(store.getPersonByNakamaUser("user-1")?.id).toBe(byNakama.person.id);
    expect(store.getPerson(byLogin.person.id)?.githubLogin).toBe(
      "researcher-b"
    );
  });
});

describe("ResearchStore concurrency", () => {
  test("two store instances write to one file without surfacing SQLITE_BUSY", () => {
    const { path, store } = openStore();
    const other = new ResearchStore(path);
    const topic = store.createTopic({ name: "Topic Alpha" });
    const otherTopic = other.createTopic({ name: "Topic Beta" });
    try {
      for (let index = 0; index < 10; index += 1) {
        store.addActivity({ summary: `writer A ${index}`, topicId: topic.id });
        other.addActivity({
          summary: `writer B ${index}`,
          topicId: otherTopic.id,
        });
      }
    } finally {
      other.close();
    }
    expect(store.listActivity({ topicId: topic.id })).toHaveLength(10);
    expect(store.listActivity({ topicId: otherTopic.id })).toHaveLength(10);
  });

  test("waits out a competing writer holding the lock instead of failing immediately", async () => {
    const { path, store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });

    // A separate PROCESS holds a write transaction for ~400 ms. It has to be a process: bun:sqlite is
    // synchronous, so an in-process timer could not fire while our own write waits for the lock.
    const script = `${process.env.TMPDIR ?? "/tmp"}/research-lock-holder-${crypto.randomUUID()}.ts`;
    await Bun.write(
      script,
      `import { Database } from "bun:sqlite";
const db = new Database(process.argv[2]);
db.exec("BEGIN IMMEDIATE");
console.log("locked");
await Bun.sleep(400);
db.exec("COMMIT");
db.close();
`
    );
    const child = Bun.spawn(["bun", script, path], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const reader = child.stdout.getReader();
    await reader.read(); // the holder has the write lock now

    const started = Date.now();
    let activity: { id: string } | undefined;
    let failure: unknown;
    try {
      activity = store.addActivity({
        summary: "recorded while another writer held the lock",
        topicId: topic.id,
      });
    } catch (error) {
      failure = error;
    }
    const waited = Date.now() - started;
    await child.exited;

    expect(failure).toBeUndefined();
    expect(activity?.id).toBeTruthy();
    // Proves it waited for the lock (busy_timeout) rather than squeaking past it.
    expect(waited).toBeGreaterThanOrEqual(200);
    expect(store.listActivity({ topicId: topic.id })).toHaveLength(1);
  }, 15_000);
});
