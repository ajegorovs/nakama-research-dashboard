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
      // A blocked axis at 'confirmed' is a claim about reality, so it needs something that could have
      // confirmed it; the branch is that something.
      branch: "feat/acquisition-control",
      state: "blocked",
      title: "Parameter automation",
      topicId: topic.id,
    });
    expect(ok).toMatchObject({
      blocker: "waiting on the rig's firmware update",
      state: "blocked",
    });
    // Same statement, nothing behind it: refused. Text is an assertion, not evidence.
    expect(() =>
      store.createAxis({
        blocker: "waiting on the rig's firmware update",
        state: "blocked",
        title: "Parameter automation",
        topicId: topic.id,
      })
    ).toThrow(/carries no evidence/);
  });

  test("refuses a claim of 'confirmed' with nothing behind it", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Topic Alpha" });
    expect(() =>
      store.createAxis({
        currentState: "prototype compares methods end to end",
        currentStateConfidence: "confirmed",
        title: "Unbacked claim",
        topicId: topic.id,
      })
    ).toThrow(/carries no evidence/);

    // A confidence label attached to nothing is meaningless rather than a violation: the rule holds
    // statements about reality to their evidence, and this asserts no state, no blocker, no progress.
    const unlabelled = store.createAxis({
      currentStateConfidence: "confirmed",
      title: "Unbacked claim",
      topicId: topic.id,
    });
    expect(unlabelled.currentState).toBe("");
    expect(unlabelled.blocker).toBe("");

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
  test("links the acting user to the topic they wrote to, without inventing a person (F6)", () => {
    const { store } = openStore();
    // The dashboard learns about this person on one topic; the row itself is never re-created.
    const beta = store.reconcileTopic({
      people: [{ displayName: "Researcher A", nakamaUserId: "user-1" }],
      topicName: "Topic Beta",
    }).topic;
    const alpha = store.createTopic({ name: "Topic Alpha" });
    const gamma = store.createTopic({ name: "Topic Gamma" });

    store.reconcileTopic({
      actor: { id: "user-1", type: "human" },
      topic: { summary: "touched by the user the dashboard knows" },
      topicId: alpha.id,
    });
    const betaPeople = store
      .listTopicPeople(beta.id)
      .map((person) => person.id);
    expect(betaPeople).toHaveLength(1);
    // Same person on the topic they just wrote to — one row, two links.
    expect(store.listTopicPeople(alpha.id).map((person) => person.id)).toEqual(
      betaPeople
    );

    // An actor nobody has recorded as a person leaves no trace: no row is created for them.
    store.reconcileTopic({
      actor: { id: "user-999", type: "agent" },
      topic: { summary: "touched by someone unknown" },
      topicId: gamma.id,
    });
    expect(store.listTopicPeople(gamma.id)).toHaveLength(0);
  });

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

  test("reconcile attaches a bare display name to the same person, not a new one each call", () => {
    const { path, store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    // The librarian's form: a name from the conversation, no account identity. Reconciling the same
    // topic twice must not multiply the person — the overview lists the people tagged to a topic.
    const reconcile = () =>
      store.reconcileTopic({
        axes: [
          {
            people: [{ displayName: "Researcher A" }],
            title: "Signal explorer",
          },
        ],
        people: [{ displayName: "Researcher A", role: "owner" }],
        topicId: topic.id,
      });

    expect(reconcile().created.people).toBe(1);
    expect(reconcile().created.people).toBe(0);

    expect(count(path, "people")).toBe(1);
    expect(count(path, "topic_people")).toBe(1);
    expect(count(path, "axis_people")).toBe(1);
    expect(
      store.listTopicPeople(topic.id).map((person) => person.displayName)
    ).toEqual(["Researcher A"]);
  });

  test("a name is still not an identity: the primitive registers, and an ambiguous link refuses", () => {
    const { store } = openStore();
    // `registerPerson` maps an account to a person; two people may legitimately share a display name,
    // so the primitive keeps creating rows for a bare name.
    expect(store.registerPerson({ displayName: "Researcher A" }).created).toBe(
      true
    );
    expect(store.registerPerson({ displayName: "Researcher A" }).created).toBe(
      true
    );

    // Once the name is ambiguous the link path refuses instead of guessing or adding a third row.
    const topic = store.createTopic({ name: "Signal Processing" });
    expect(() =>
      store.reconcileTopic({
        people: [{ displayName: "Researcher A" }],
        topicId: topic.id,
      })
    ).toThrow(/2 people are named/);
  });
});

describe("ResearchStore overview and search", () => {
  test("summarises the dashboard in one call", () => {
    const { store } = openStore();
    const alpha = store.createTopic({ name: "Signal Processing" });
    store.createTopic({ name: "Acquisition Automation", status: "paused" });
    store.reconcileTopic({
      activities: [
        { axisTitle: "Parameter automation", summary: "sweep queued" },
      ],
      // A claim marked `confirmed` has to be backed in the same call: the group saying "we are waiting
      // on the rig firmware" *is* the evidence, and it is recorded as the annotation.
      annotations: [
        {
          axisTitle: "Rig control",
          text: "the group said the rig is waiting on a firmware update",
        },
      ],
      axes: [
        { branch: "feat/acquisition-control", title: "Parameter automation" },
        {
          blocker: "rig firmware update",
          state: "blocked",
          title: "Rig control",
        },
      ],
      people: [{ displayName: "Researcher A" }],
      repositories: [{ fullName: "group/processing-pipeline" }],
      topicId: alpha.id,
    });

    const overview = store.getOverview();
    expect(overview.activitySinceDays).toBe(14); // the default, echoed back
    expect(overview.counts).toMatchObject({
      axes: 2,
      people: 1,
      repositories: 1,
      topics: 2,
    });
    expect(overview.counts.topicsByStatus).toEqual({
      active: 1,
      archived: 0,
      completed: 0,
      paused: 1,
    });
    expect(overview.axesByState).toMatchObject({ active: 1, blocked: 1 });
    expect(overview.blocked).toHaveLength(1);
    expect(overview.blocked[0]).toMatchObject({
      blocker: "rig firmware update",
      title: "Rig control",
      topicName: "Signal Processing",
    });
    expect(overview.recentActivity[0]?.summary).toBe("sweep queued");
    expect(overview.recentTopics).toHaveLength(2);
    expect(overview.generatedAt).toBeTruthy();

    // The front page proper (C4): axes grouped under their topic, not one flat list across the board.
    expect(overview.topics).toHaveLength(2);
    const signal = overview.topics.find(
      (entry) => entry.topic.name === "Signal Processing"
    );
    expect(signal?.axisCounts).toMatchObject({ active: 1, blocked: 1 });
    // Blocked work is listed before ongoing work, whatever order the rows were written in.
    expect(signal?.axes.map((axis) => axis.title)).toEqual([
      "Rig control",
      "Parameter automation",
    ]);
    expect(signal?.people.map((person) => person.displayName)).toEqual([
      "Researcher A",
    ]);
    expect(signal?.repositories[0]?.fullName).toBe("group/processing-pipeline");
    // "Recent: 1 event · last activity today" — the summary line the card shows.
    expect(signal?.activityCount).toBe(1);
    expect(signal?.lastActivityAt).toBeTruthy();
    // A topic carrying a blocker leads the page.
    expect(overview.topics[0]?.topic.name).toBe("Signal Processing");
    // A topic with no axes still gets a card, with empty counts rather than a missing row.
    expect(overview.topics[1]?.axes).toEqual([]);
    expect(overview.topics[1]?.axisCounts.blocked).toBe(0);
  });

  test("groups axes under their topic in attention order", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    // Written in an order that is not the display order, so the assertion cannot pass by accident.
    // Nothing backs these states, so they are labelled honestly instead of claimed as confirmed.
    store.reconcileTopic({
      axes: [
        {
          state: "parked",
          stateConfidence: "inferred",
          title: "Parked exploration",
        },
        {
          state: "completed",
          stateConfidence: "inferred",
          title: "Finished sweep",
        },
      ],
      topicId: topic.id,
    });
    store.reconcileTopic({
      axes: [
        {
          state: "draft",
          stateConfidence: "inferred",
          title: "Draft proposal",
        },
        {
          state: "abandoned",
          stateConfidence: "inferred",
          title: "Dropped idea",
        },
      ],
      topicId: topic.id,
    });
    store.reconcileTopic({
      // The annotation is the evidence the blocked claim needs, in the same call.
      annotations: [{ axisTitle: "Blocked rig", text: "waiting on the rig" }],
      axes: [
        { blocker: "rig firmware", state: "blocked", title: "Blocked rig" },
      ],
      topicId: topic.id,
    });
    store.reconcileTopic({
      axes: [{ title: "Live work" }],
      topicId: topic.id,
    });

    const entry = store.getOverview().topics[0];
    expect(entry?.axes.map((axis) => axis.state)).toEqual([
      "blocked",
      "active",
      "draft",
      "parked",
      "completed",
      "abandoned",
    ]);
  });

  test("hides archived topics from the front page unless asked, and windows activity", () => {
    const { store } = openStore();
    const live = store.createTopic({ name: "Signal Processing" });
    const retired = store.createTopic({ name: "Retired direction" });
    store.reconcileTopic({
      topic: { status: "archived" },
      topicId: retired.id,
    });
    const longAgo = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000
    ).toISOString();
    store.addActivity({
      occurredAt: longAgo,
      summary: "old run",
      topicId: live.id,
    });
    store.addActivity({ summary: "recent run", topicId: live.id });

    const front = store.getOverview();
    expect(front.topics.map((entry) => entry.topic.name)).toEqual([
      "Signal Processing",
    ]);
    expect(front.topics[0]?.activityCount).toBe(1); // only the event inside the 14-day window
    expect(front.topics[0]?.lastActivityAt).toBeTruthy();

    const archived = store.getOverview({ includeArchived: true });
    expect(archived.topics).toHaveLength(2);

    // `0` is the "all time" window the page's last control sends: no lower bound at all.
    const allTime = store.getOverview({
      activitySinceDays: 0,
      includeArchived: true,
    });
    expect(allTime.activitySinceDays).toBe(0);
    expect(
      allTime.topics.find((entry) => entry.topic.name === "Signal Processing")
        ?.activityCount
    ).toBe(2);
  });

  test("treats activitySinceDays as a query parameter, not stored state", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    const longAgo = new Date(
      Date.now() - 45 * 24 * 60 * 60 * 1000
    ).toISOString();
    store.addActivity({
      occurredAt: longAgo,
      summary: "old run",
      topicId: topic.id,
    });
    store.addActivity({ summary: "recent run", topicId: topic.id });

    expect(store.getOverview().recentActivity).toHaveLength(1);
    expect(
      store.getOverview({ activitySinceDays: 90 }).recentActivity
    ).toHaveLength(2);
  });

  test("searches every entity and reports which field matched", () => {
    const { store } = openStore();
    const topic = store.createTopic({
      description: "acquisition rig automation",
      name: "Acquisition Automation",
    });
    store.createAxis({
      branch: "feat/acquisition-control",
      title: "Parameter automation",
      topicId: topic.id,
    });
    store.addActivity({
      summary: "acquisition sweep queued",
      topicId: topic.id,
    });
    store.addAnnotation({
      text: "acquisition window agreed",
      topicId: topic.id,
    });
    store.createTopic({ name: "Signal Processing" });

    const results = store.searchDashboard({ query: "acquisition" });
    expect(results.topics.map((hit) => hit.record.name)).toEqual([
      "Acquisition Automation",
    ]);
    expect(results.topics[0]?.matchedFields).toEqual(["name", "description"]);
    expect(results.axes).toHaveLength(1);
    expect(results.axes[0]).toMatchObject({
      topicName: "Acquisition Automation",
    });
    expect(results.axes[0]?.matchedFields).toEqual(["branch"]); // only the branch carries the term
    expect(results.activities.map((hit) => hit.record.summary)).toEqual([
      "acquisition sweep queued",
    ]);
    expect(results.annotations[0]?.matchedFields).toEqual(["text"]);
    expect(results.truncated).toBe(false);

    // Case-insensitive, and a query that matches nothing is empty rather than an error.
    expect(store.searchDashboard({ query: "ACQUISITION" }).topics).toHaveLength(
      1
    );
    expect(
      store.searchDashboard({ query: "nothing-matches-this" }).topics
    ).toHaveLength(0);
  });

  test("hides archived topics unless asked, and reports truncation", () => {
    const { store } = openStore();
    const archived = store.createTopic({ name: "Filtering Comparison" });
    store.updateTopic(archived.id, { status: "archived" });
    store.createTopic({ name: "Filtering Comparison v2" });

    expect(store.searchDashboard({ query: "Filtering" }).topics).toHaveLength(
      1
    );
    expect(
      store.searchDashboard({ includeArchived: true, query: "Filtering" })
        .topics
    ).toHaveLength(2);
    expect(
      store.searchDashboard({
        includeArchived: true,
        limit: 1,
        query: "Filtering",
      }).truncated
    ).toBe(true);
  });

  test("treats LIKE wildcards in the query as literal text", () => {
    const { store } = openStore();
    store.createTopic({ name: "Topic 100%" });
    store.createTopic({ name: "Topic 100x" });

    expect(
      store
        .searchDashboard({ query: "100%" })
        .topics.map((hit) => hit.record.name)
    ).toEqual(["Topic 100%"]);
    // '%' and '_' must not act as wildcards: neither name contains a literal "10_".
    expect(store.searchDashboard({ query: "10_" }).topics).toHaveLength(0);
  });

  test("rejects an empty search query as a fixable rule", () => {
    const { store } = openStore();
    expect(() => store.searchDashboard({ query: "  " })).toThrow(
      ResearchStoreError
    );
  });
});

describe("ResearchStore topic detail and evidence (C5)", () => {
  test("gives each axis its own history and its own notes, and the topic its own", async () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Acquisition Automation" });
    const control = store.createAxis({
      branch: "feat/rig-control",
      kind: "investigation",
      prNumber: 88,
      title: "Rig control",
      topicId: topic.id,
    });
    const noise = store.createAxis({ title: "Noise study", topicId: topic.id });
    await Bun.sleep(2);
    store.addActivity({
      axisId: control.id,
      sourceRef: "PR #88",
      sourceType: "github_pr",
      summary: "rig firmware update merged",
      topicId: topic.id,
    });
    store.addActivity({
      axisId: noise.id,
      sourceRef: "README.md",
      sourceType: "repo_document",
      summary: "notes on the noise floor",
      topicId: topic.id,
    });
    store.addActivity({
      sourceType: "group_chat",
      summary: "standup: the rig is the priority",
      topicId: topic.id,
    });
    store.addAnnotation({
      authorType: "human",
      axisId: control.id,
      text: "waiting intentionally for the October hardware slot",
    });
    store.addAnnotation({
      text: "the group re-scoped this topic in September",
      topicId: topic.id,
    });

    const detail = store.getTopicDetail(topic.id);

    // Each axis carries its own history — never one merged log for the whole topic.
    expect(detail.axes.map((axis) => axis.title)).toEqual([
      "Rig control",
      "Noise study",
    ]);
    const [rig, study] = detail.axes;
    expect(rig.history.map((item) => item.sourceRef)).toEqual(["PR #88"]);
    expect(study.history.map((item) => item.sourceRef)).toEqual(["README.md"]);
    // The topic's own log sees everything, and a row that belongs to an axis says so.
    expect(detail.activity).toHaveLength(3);
    expect(
      detail.activity.filter((item) => item.axisId === control.id)
    ).toHaveLength(1);
    // Notes separate from activity, and an axis note renders under its axis (D8's split).
    expect(rig.notes.map((note) => note.text)).toEqual([
      "waiting intentionally for the October hardware slot",
    ]);
    expect(detail.notes.map((note) => note.text)).toEqual([
      "the group re-scoped this topic in September",
    ]);
    expect(detail.counts).toMatchObject({
      activities: 3,
      axes: 2,
      axesWithoutEvidence: 0,
      notes: 1,
    });
    // The detail answers for one topic only.
    expect(() => store.getTopicDetail("no-such-topic")).toThrow(
      ResearchStoreError
    );
  });

  test("reads the evidence a claim could rest on in words, from the set the rule accepts", async () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Signal Processing" });
    const axis = store.createAxis({
      branch: "feat/rig-control",
      prNumber: 88,
      prUrl: "https://example.invalid/group/signal-pipeline/pull/88",
      state: "active",
      stateConfidence: "inferred",
      title: "Rig control",
      topicId: topic.id,
    });
    store.addActivity({
      axisId: axis.id,
      sourceRef: "PR #90",
      sourceType: "github_pr",
      summary: "follow-up pull request",
      topicId: topic.id,
    });
    store.addAnnotation({ axisId: axis.id, text: "reviewed by hand" });

    const detail = store.getTopicDetail(topic.id);
    const evidence = detail.axes[0].evidence;
    // Reading order: what the axis names about itself, then what was recorded against it.
    expect(evidence.map((item) => item.kind)).toEqual([
      "branch",
      "pull_request",
      "activity",
      "annotation",
    ]);
    expect(evidence.map((item) => item.label)).toEqual([
      "feat/rig-control",
      "PR #88",
      "PR #90",
      "note",
    ]);
    expect(evidence[1].sourceUrl).toBe(
      "https://example.invalid/group/signal-pipeline/pull/88"
    );
    expect(evidence[2]).toMatchObject({ by: "unknown", sourceType: "github_pr" });
  });

  test("a person's own note is evidence, so a manual 'confirmed' can land (D8)", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Reconstruction Study" });
    const axis = store.createAxis({
      state: "active",
      stateConfidence: "inferred",
      title: "Filtering comparison",
      topicId: topic.id,
    });
    expect(store.axisEvidence(axis)).toEqual([]);

    // Nothing backs this axis, so the strict claim is refused...
    expect(() =>
      store.updateAxis(axis.id, {
        state: "parked",
        stateConfidence: "confirmed",
      })
    ).toThrow(ResearchStoreError);

    // ...and a note arriving in the same call is what makes it a fact rather than a guess.
    const result = store.reconcileTopic({
      actor: { id: "user-1", type: "human" },
      annotations: [
        {
          axisId: axis.id,
          text: "waiting intentionally for the October hardware slot",
        },
      ],
      axes: [{ id: axis.id, state: "parked", stateConfidence: "confirmed" }],
      topicId: topic.id,
    });
    expect(result.axes[0]).toMatchObject({
      state: "parked",
      stateConfidence: "confirmed",
    });

    const detail = store.getTopicDetail(topic.id);
    expect(detail.axes[0].evidence.map((item) => item.kind)).toEqual([
      "annotation",
    ]);
    expect(detail.axes[0].notes).toHaveLength(1);
    expect(detail.axes[0].notes[0].authorType).toBe("human");
    expect(detail.counts.axesWithoutEvidence).toBe(0);
  });

  // The C5 detail surfaced this one: the read model filled a confidence from the column's default, so
  // an axis nobody had said anything about rendered "confirmed" — in the page and in the agent tool
  // alike. A confidence belongs to a claim; with no claim there is nothing to be confident about.
  test("does not invent a confidence for a claim nobody made", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Sparse Topic" });
    const axis = store.createAxis({ title: "Bare axis", topicId: topic.id });

    expect(axis.currentStateConfidence).toBeNull();
    expect(axis.blockerConfidence).toBeNull();
    expect(store.listAxes(topic.id)[0]?.blockerConfidence).toBeNull();
    expect(
      store.getTopicDetail(topic.id).axes[0]?.currentStateConfidence
    ).toBeNull();

    // Stating a progress note states a claim, so it carries a confidence — and is held to the rule.
    expect(() =>
      store.updateAxis(axis.id, { currentState: "half way" })
    ).toThrow(ResearchStoreError);
    const stated = store.updateAxis(axis.id, {
      currentState: "half way",
      currentStateConfidence: "inferred",
    });
    expect(stated.currentStateConfidence).toBe("inferred");
  });

  // The invariant the page's conflict path leans on: when a correction carries a rationale note and
  // the axis moved underneath it, the refusal takes the note down with it. Nothing half-written.
  test("a stale correction is atomic: neither the axis nor its note is written", () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Atomicity" });
    const axis = store.createAxis({ title: "Rig control", topicId: topic.id });
    const readVersion = axis.version;

    // Another writer moves the axis on after the page has read it.
    store.updateAxis(axis.id, { description: "bumped by someone else" });
    const before = store.getAxis(axis.id);

    expect(() =>
      store.reconcileTopic({
        annotations: [{ axisId: axis.id, text: "parked on purpose" }],
        axes: [
          {
            expectedVersion: readVersion,
            id: axis.id,
            state: "parked",
            stateConfidence: "inferred",
          },
        ],
        topicId: topic.id,
      })
    ).toThrow(ResearchStoreConflictError);

    const after = store.getAxis(axis.id);
    expect(after?.state).not.toBe("parked");
    expect(after?.version).toBe(before?.version);
    expect(after?.description).toBe("bumped by someone else");
    expect(store.listTopicNotes(topic.id)).toHaveLength(0);
    expect(store.listAnnotations({ axisId: axis.id })).toHaveLength(0);
  });

  test("caps per-axis history without losing the count of what exists", async () => {
    const { store } = openStore();
    const topic = store.createTopic({ name: "Filtering Comparison" });
    const axis = store.createAxis({ title: "Baseline sweep", topicId: topic.id });
    for (let index = 0; index < 4; index += 1) {
      store.addActivity({
        axisId: axis.id,
        sourceRef: `run ${index}`,
        sourceType: "experiment",
        summary: `run ${index}`,
        topicId: topic.id,
      });
      await Bun.sleep(1);
    }
    const detail = store.getTopicDetail(topic.id, { historyLimit: 2 });
    expect(detail.axes[0].history).toHaveLength(2);
    // Newest first, and the cap is a window onto the axis, not a different axis.
    expect(detail.axes[0].history.map((item) => item.sourceRef)).toEqual([
      "run 3",
      "run 2",
    ]);
    expect(detail.counts.activities).toBe(4);
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
