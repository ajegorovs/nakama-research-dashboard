/**
 * The scoped supporting-evidence page: the complete, SQL-paged union behind `get_topic(axisId)`.
 *
 * What this pins, for the store method and the action wiring alike:
 *
 *   - completeness against the legacy cap: >5 activities and >5 notes, so a page of the whole union
 *     returns rows the capped `axis.evidence` line cannot;
 *   - a true backend page (LIMIT/OFFSET over the union), with an authoritative `total`, a `hasMore` that
 *     is honest at the last/partial/exhausted page, and pages whose ids are disjoint and stable;
 *   - the fixed order (branch, PR, then dated rows newest-first by their own occurredAt/createdAt, kind/id
 *     tie-break) including a same-instant tie;
 *   - a stable id per record, the raw date, author id/category, activity summary and the note's full text;
 *   - URLs from real stored data only — a branch URL only with exactly one explicitly linked repository of
 *     known GitHub shape, a PR URL only when stored;
 *   - no sibling-axis or cross-topic leakage, and the existing refusals for an unknown/cross-topic axis and
 *     malformed offset/page bounds at both boundaries;
 *   - the legacy capped evidence line and the write rule's evidence check unchanged.
 *
 * Runs against the shipped migrations 001–006 with a real database, exactly as the other store tests do.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./actions";
import { ResearchStore, ResearchStoreError } from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function freshPath(): string {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-evidence-${crypto.randomUUID()}.sqlite`;
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

function openStore(): ResearchStore {
  return new ResearchStore(freshPath());
}

/** Set annotation `created_at` directly: `addAnnotation` has no clock input, and the order under test is
 * the union's, so the timestamps it sorts on must be chosen, not the wall clock's. */
function setAnnotationTimes(
  path: string,
  pairs: Array<{ id: string; iso: string }>
): void {
  const db = new Database(path);
  try {
    const update = db.query("UPDATE annotations SET created_at = ? WHERE id = ?");
    for (const pair of pairs) {
      update.run(pair.iso, pair.id);
    }
  } finally {
    db.close();
  }
}

const RECORD_KEYS = [
  "at",
  "authorId",
  "by",
  "id",
  "kind",
  "label",
  "recordId",
  "sourceRef",
  "sourceType",
  "sourceUrl",
  "summary",
];

type Fixture = {
  activityIds: string[];
  annotationIds: string[];
  axisId: string;
  branchRecordId: string;
  expectedIds: string[];
  path: string;
  prRecordId: string;
  topicId: string;
};

/**
 * One topic, one axis: a branch and a PR (both stored), one explicitly linked GitHub repository, six
 * activities (2024-03-01…06, newest `act6`) and six notes (2024-02-01…06, newest `note6`). The legacy cap
 * is 5 per source, so both recorded sets exceed what the capped line can show.
 */
function seedFixture(): Fixture {
  const path = freshPath();
  const store = new ResearchStore(path);
  let fixture: Fixture;
  try {
    const topic = store.createTopic({ name: "Evidence paging" });
    const axis = store.createAxis({
      branch: "feature/evidence",
      kind: "feature",
      prNumber: 42,
      prUrl: "https://github.com/acme/evidence/pull/42",
      state: "active",
      title: "Paging axis",
      topicId: topic.id,
    });
    const repository = store.registerRepository({
      fullName: "acme/evidence",
      url: "https://github.com/acme/evidence.git",
    }).repository;
    store.linkAxisRepository(axis.id, repository.id, "primary");

    const activityIds: string[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const activity = store.addActivity({
        actorId: `user-${n}`,
        actorType: "human",
        axisId: axis.id,
        occurredAt: `2024-03-0${n}T00:00:00.000Z`,
        sourceRef: `abc${n}`,
        sourceType: "github_commit",
        summary: `activity ${n}`,
      });
      activityIds.push(activity.id);
    }

    const annotationIds: string[] = [];
    for (let n = 1; n <= 6; n += 1) {
      const annotation = store.addAnnotation({
        authorId: "alice",
        authorType: "human",
        axisId: axis.id,
        text: `note ${n}`,
      });
      annotationIds.push(annotation.id);
    }
    setAnnotationTimes(
      path,
      annotationIds.map((id, index) => ({
        id,
        iso: `2024-02-0${index + 1}T00:00:00.000Z`,
      }))
    );

    const idOf = (kind: string, id: string) => `${kind}:${id}`;
    fixture = {
      activityIds,
      annotationIds,
      axisId: axis.id,
      branchRecordId: idOf("branch", axis.id),
      expectedIds: [
        `branch:${axis.id}`,
        `PR:${axis.id}`,
        ...[6, 5, 4, 3, 2, 1].map((n) => `activity:${activityIds[n - 1]}`),
        ...[6, 5, 4, 3, 2, 1].map((n) => `annotation:${annotationIds[n - 1]}`),
      ],
      path,
      prRecordId: `PR:${axis.id}`,
      topicId: topic.id,
    };
  } finally {
    store.close();
  }
  return fixture;
}

describe("evidencePage (store)", () => {
  test("pages the complete union: 6 activities + 6 notes + branch + PR beyond the legacy cap", () => {
    const { path, axisId } = seedFixture();
    const store = new ResearchStore(path);
    try {
      const first = store.evidencePage({ axisId }, { limit: 5, offset: 0 });
      expect(first.total).toBe(14);
      expect(first.limit).toBe(5);
      expect(first.offset).toBe(0);
      expect(first.hasMore).toBe(true);
      expect(first.items.map((item) => item.kind)).toEqual([
        "branch",
        "pull_request",
        "activity",
        "activity",
        "activity",
      ]);

      // The capped legacy line reports the same membership but returns at most 2 + 5 + 5 = 12.
      const legacy = store.getAxisWorkstream(
        store.getAxis(axisId)?.topicId ?? "",
        axisId
      );
      expect(legacy.axis.evidence).toHaveLength(12);
      expect(legacy.coverage.evidence.limitScope).toBe("per-source");
      expect(legacy.coverage.evidence.total).toBe(14);
    } finally {
      store.close();
    }
  });

  test("every page has the exact total, disjoint stable ids, and an honest last page", () => {
    const { path, axisId, expectedIds } = seedFixture();
    const store = new ResearchStore(path);
    try {
      const seen: string[] = [];
      for (const offset of [0, 5, 10]) {
        const page = store.evidencePage({ axisId }, { limit: 5, offset });
        seen.push(...page.items.map((item) => item.id));
      }
      expect(seen).toEqual(expectedIds);
      expect(new Set(seen).size).toBe(14);

      const last = store.evidencePage({ axisId }, { limit: 5, offset: 10 });
      expect(last.items).toHaveLength(4);
      expect(last.hasMore).toBe(false);

      const exhausted = store.evidencePage({ axisId }, { limit: 5, offset: 14 });
      expect(exhausted.items).toEqual([]);
      expect(exhausted.hasMore).toBe(false);
      expect(exhausted.total).toBe(14);

      const far = store.evidencePage({ axisId }, { limit: 5, offset: 100 });
      expect(far.items).toEqual([]);
      expect(far.hasMore).toBe(false);

      // A re-read returns the same ids in the same order (stable ordering).
      const reread = store.evidencePage({ axisId }, { limit: 5, offset: 0 });
      expect(reread.items.map((item) => item.id)).toEqual(expectedIds.slice(0, 5));
    } finally {
      store.close();
    }
  });

  test("carries the raw date, author id/category and the note's full text", () => {
    const { path, axisId } = seedFixture();
    const store = new ResearchStore(path);
    try {
      const all = store.evidencePage({ axisId }, { limit: 100, offset: 0 });
      const activity = all.items.find(
        (item) => item.summary === "activity 6"
      );
      expect(activity).toBeDefined();
      expect(activity?.at).toBe("2024-03-06T00:00:00.000Z");
      expect(activity?.authorId).toBe("user-6");
      expect(activity?.by).toBe("human");
      expect(activity?.kind).toBe("activity");
      expect(activity?.label).toBe("commit abc6");

      const note = all.items.find((item) => item.summary === "note 6");
      expect(note).toBeDefined();
      expect(note?.at).toBe("2024-02-06T00:00:00.000Z");
      expect(note?.authorId).toBe("alice");
      expect(note?.kind).toBe("annotation");
      expect(note?.label).toBe("note");
      expect(note?.recordId).toBeTruthy();

      // Structural records: no stored row, empty text, and their stable ids.
      const branch = all.items[0];
      expect(branch.kind).toBe("branch");
      expect(branch.recordId).toBeNull();
      expect(branch.summary).toBe("");
      expect(branch.id).toBe(`branch:${axisId}`);
      expect(branch.label).toBe("feature/evidence");
      const pr = all.items[1];
      expect(pr.kind).toBe("pull_request");
      expect(pr.recordId).toBeNull();
      expect(pr.id).toBe(`PR:${axisId}`);
      expect(pr.label).toBe("PR #42");
    } finally {
      store.close();
    }
  });

  test("keeps a long note's text whole, not clamped", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "Long note" });
      const axis = store.createAxis({
        branch: "feature/long",
        state: "active",
        title: "Long-note axis",
        topicId: topic.id,
      });
      const text = "x".repeat(1500);
      store.addAnnotation({ axisId: axis.id, text });
      const page = store.evidencePage({ axisId: axis.id }, { limit: 5, offset: 0 });
      const note = page.items.find((item) => item.kind === "annotation");
      expect(note?.summary).toBe(text);
      expect(note?.summary.length).toBe(1500);
    } finally {
      store.close();
    }
  });

  test("tie-breaks an equal timestamp by kind then stable id", () => {
    const path = freshPath();
    const store = new ResearchStore(path);
    try {
      const topic = store.createTopic({ name: "Tie" });
      const axis = store.createAxis({
        branch: "feature/tie",
        state: "active",
        title: "Tie axis",
        topicId: topic.id,
      });
      const stamp = "2024-01-01T12:00:00.000Z";
      const first = store.addActivity({
        axisId: axis.id,
        occurredAt: stamp,
        summary: "tie a",
      });
      const second = store.addActivity({
        axisId: axis.id,
        occurredAt: stamp,
        summary: "tie b",
      });
      const note = store.addAnnotation({ axisId: axis.id, text: "tie note" });
      setAnnotationTimes(path, [{ id: note.id, iso: stamp }]);

      // Offset 1 skips the branch: the three same-instant rows follow it.
      const page = store.evidencePage({ axisId: axis.id }, { limit: 5, offset: 1 });
      expect(page.items.map((item) => item.kind)).toEqual([
        "activity",
        "activity",
        "annotation",
      ]);
      const ids = page.items.map((item) => item.id);
      expect(ids.slice(0, 2)).toEqual(
        [`activity:${first.id}`, `activity:${second.id}`].sort()
      );
      expect(ids[2]).toBe(`annotation:${note.id}`);
    } finally {
      store.close();
    }
  });

  test("refuses an unknown axis and a cross-topic axis at the store boundary", () => {
    const store = openStore();
    try {
      const alpha = store.createTopic({ name: "Alpha" });
      const axis = store.createAxis({
        branch: "feature/alpha",
        state: "active",
        title: "Alpha axis",
        topicId: alpha.id,
      });
      const beta = store.createTopic({ name: "Beta" });

      expect(() => store.evidencePage({ axisId: "no-such-axis" })).toThrow(
        "Axis not found."
      );
      expect(() =>
        store.evidencePage({ axisId: axis.id, topicId: beta.id })
      ).toThrow("Axis does not belong to this topic.");
    } finally {
      store.close();
    }
  });

  test("refuses malformed offset/page bounds at the store boundary", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "Bounds" });
      const axis = store.createAxis({
        branch: "feature/bounds",
        state: "active",
        title: "Bounds axis",
        topicId: topic.id,
      });
      const bad = (paging: { limit?: number; offset?: number }) =>
        () => store.evidencePage({ axisId: axis.id }, paging);
      expect(bad({ offset: -1 })).toThrow(ResearchStoreError);
      expect(bad({ limit: 0 })).toThrow(ResearchStoreError);
      expect(bad({ limit: 101 })).toThrow(ResearchStoreError);
      try {
        bad({ offset: -1 })();
      } catch (error) {
        expect((error as ResearchStoreError).code).toBe("invalid-input");
      }
    } finally {
      store.close();
    }
  });

  test("does not leak a sibling axis's evidence", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "Siblings" });
      const alpha = store.createAxis({
        branch: "feature/alpha",
        state: "active",
        title: "Alpha",
        topicId: topic.id,
      });
      const beta = store.createAxis({
        branch: "feature/beta",
        state: "active",
        title: "Beta",
        topicId: topic.id,
      });
      store.addAnnotation({ axisId: beta.id, text: "beta sibling note" });
      store.addActivity({ axisId: beta.id, summary: "beta sibling activity" });

      const page = store.evidencePage({ axisId: alpha.id }, { limit: 100, offset: 0 });
      const serialized = JSON.stringify(page);
      expect(serialized).not.toContain("beta");
      expect(page.total).toBe(1);
      expect(page.items.map((item) => item.label)).toEqual(["feature/alpha"]);
    } finally {
      store.close();
    }
  });
});

describe("evidencePage branch URL", () => {
  function axisWithBranch(store: ResearchStore, topicId: string, title: string) {
    return store.createAxis({
      branch: "feature/url",
      state: "active",
      title,
      topicId,
    });
  }

  test("builds it only from exactly one GitHub repository, and leaves it empty otherwise", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "URLs" });

      // One GitHub repo: a URL is composed from the stored base and the branch name.
      const one = axisWithBranch(store, topic.id, "One repo");
      const github = store.registerRepository({
        fullName: "acme/one",
        url: "https://github.com/acme/one.git",
      }).repository;
      store.linkAxisRepository(one.id, github.id, "primary");
      const onePage = store.evidencePage({ axisId: one.id }, { limit: 5, offset: 0 });
      expect(onePage.items[0].sourceUrl).toBe(
        "https://github.com/acme/one/tree/feature%2Furl"
      );

      // No repo: empty.
      const none = axisWithBranch(store, topic.id, "No repo");
      const nonePage = store.evidencePage({ axisId: none.id }, { limit: 5, offset: 0 });
      expect(nonePage.items[0].sourceUrl).toBe("");

      // Two repos: ambiguous, so empty rather than a guess.
      const two = axisWithBranch(store, topic.id, "Two repos");
      const a = store.registerRepository({ fullName: "acme/two-a", url: "https://github.com/acme/two-a" }).repository;
      const b = store.registerRepository({ fullName: "acme/two-b", url: "https://github.com/acme/two-b" }).repository;
      store.linkAxisRepository(two.id, a.id);
      store.linkAxisRepository(two.id, b.id);
      expect(
        store.evidencePage({ axisId: two.id }, { limit: 5, offset: 0 }).items[0].sourceUrl
      ).toBe("");

      // One repo, but not a GitHub owner/repo URL: empty.
      const odd = axisWithBranch(store, topic.id, "Odd repo");
      const gitlab = store.registerRepository({
        fullName: "group/project",
        url: "https://gitlab.example.com/group/project",
      }).repository;
      store.linkAxisRepository(odd.id, gitlab.id);
      expect(
        store.evidencePage({ axisId: odd.id }, { limit: 5, offset: 0 }).items[0].sourceUrl
      ).toBe("");
    } finally {
      store.close();
    }
  });

  test("carries the PR URL only when it was stored", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "PR URL" });
      const withUrl = store.createAxis({
        branch: "feature/pr",
        prNumber: 7,
        prUrl: "https://github.com/acme/pr/pull/7",
        state: "active",
        title: "With URL",
        topicId: topic.id,
      });
      const without = store.createAxis({
        branch: "feature/nourl",
        prNumber: 8,
        state: "active",
        title: "Without URL",
        topicId: topic.id,
      });
      const withPage = store.evidencePage({ axisId: withUrl.id }, { limit: 5, offset: 0 });
      expect(withPage.items[1].sourceUrl).toBe("https://github.com/acme/pr/pull/7");
      const withoutPage = store.evidencePage({ axisId: without.id }, { limit: 5, offset: 0 });
      expect(withoutPage.items[1].kind).toBe("pull_request");
      expect(withoutPage.items[1].sourceUrl).toBe("");
    } finally {
      store.close();
    }
  });
});

describe("evidencePage write-rule behaviour", () => {
  test("leaves the capped evidence line and the confirmed-claim guard unchanged", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "Guard" });
      // A confirmed state with no evidence at all is still refused...
      expect(() =>
        store.createAxis({ state: "active", title: "Bare", topicId: topic.id })
      ).toThrow();
      // ...and one backed by a branch is still accepted.
      const backed = store.createAxis({
        branch: "feature/backed",
        state: "active",
        title: "Backed",
        topicId: topic.id,
      });
      expect(backed.state).toBe("active");
    } finally {
      store.close();
    }
  });

  test("the legacy evidence membership matches the page's when both fit the cap", () => {
    const store = openStore();
    try {
      const topic = store.createTopic({ name: "Membership" });
      const axis = store.createAxis({
        branch: "feature/small",
        state: "active",
        title: "Small",
        topicId: topic.id,
      });
      store.addActivity({ axisId: axis.id, summary: "one event" });
      store.addAnnotation({ axisId: axis.id, text: "one note" });

      const legacy = store.getAxisWorkstream(topic.id, axis.id);
      const page = store.evidencePage({ axisId: axis.id }, { limit: 100, offset: 0 });
      expect(page.total).toBe(legacy.axis.evidence.length);
      // Same membership (the page orders by time; the legacy line groups by kind — either way the set is
      // identical when both fit the cap).
      const membership = (items: Array<{ kind: string; label: string }>) =>
        items.map((item) => `${item.kind}:${item.label}`).sort();
      expect(membership(page.items)).toEqual(membership(legacy.axis.evidence));
    } finally {
      store.close();
    }
  });
});

// --------------------------------------------------------------------------- action boundary

type RunContext = Parameters<typeof run>[1];

async function call(
  actionKey: string,
  input: Record<string, unknown>,
  databasePath: string
): Promise<Record<string, unknown>> {
  return (await run(input, {
    actionKey,
    actor: { id: "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
  } as unknown as RunContext)) as Record<string, unknown>;
}

type Page = {
  hasMore: boolean;
  items: Array<Record<string, unknown>>;
  limit: number;
  offset: number;
  total: number;
};

describe("get_topic evidencePage (action)", () => {
  test("adds the page only for evidence inputs, and returns the true total", async () => {
    const { path, axisId, topicId, expectedIds } = seedFixture();

    const legacy = await call("get_topic", { topicId, axisId }, path);
    expect("evidencePage" in legacy).toBe(false);
    expect(legacy.ok).toBe(true);

    // `offset`/`pageSize` are the activity/task pager's inputs and must not trigger the evidence page.
    const taskPaged = await call("get_topic", { offset: 0, pageSize: 5, topicId, axisId }, path);
    expect("evidencePage" in taskPaged).toBe(false);
    expect(taskPaged.activityPage).toBeDefined();
    expect(taskPaged.problemPage).toBeDefined();

    const paged = await call(
      "get_topic",
      { axisId, evidenceOffset: 0, evidencePageSize: 5, topicId },
      path
    );
    const page = paged.evidencePage as Page;
    expect(page.total).toBe(14);
    expect(page.limit).toBe(5);
    expect(page.offset).toBe(0);
    expect(page.hasMore).toBe(true);
    expect(page.items).toHaveLength(5);
    expect(page.items.map((item) => item.id)).toEqual(expectedIds.slice(0, 5));
    // The legacy scoped keys sit beside it, unchanged.
    expect((paged.axis as Record<string, unknown>).evidence).toHaveLength(12);
    expect(paged.coverage).toBeDefined();
  });

  test("defaults the evidence page size to 5 when only an offset is sent", async () => {
    const { path, axisId, topicId } = seedFixture();
    const paged = await call("get_topic", { axisId, evidenceOffset: 0, topicId }, path);
    const page = paged.evidencePage as Page;
    expect(page.limit).toBe(5);
    expect(page.total).toBe(14);
  });

  test("the last page is partial and exhausted pages are empty", async () => {
    const { path, axisId, topicId } = seedFixture();
    const last = (await call(
      "get_topic",
      { axisId, evidenceOffset: 10, evidencePageSize: 5, topicId },
      path
    )).evidencePage as Page;
    expect(last.items).toHaveLength(4);
    expect(last.hasMore).toBe(false);

    const exhausted = (await call(
      "get_topic",
      { axisId, evidenceOffset: 14, evidencePageSize: 5, topicId },
      path
    )).evidencePage as Page;
    expect(exhausted.items).toEqual([]);
    expect(exhausted.hasMore).toBe(false);
    expect(exhausted.total).toBe(14);
  });

  test("serializes with the pinned record field set", async () => {
    const { path, axisId, topicId } = seedFixture();
    const result = await call(
      "get_topic",
      { axisId, evidenceOffset: 0, evidencePageSize: 100, topicId },
      path
    );
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('"evidencePage"');
    const parsed = JSON.parse(serialized) as { evidencePage: Page };
    expect(Object.keys(parsed.evidencePage).sort()).toEqual([
      "hasMore",
      "items",
      "limit",
      "offset",
      "total",
    ]);
    for (const item of parsed.evidencePage.items) {
      expect(Object.keys(item).sort()).toEqual([...RECORD_KEYS].sort());
    }
  });

  test("does not leak a sibling axis through the action", async () => {
    const path = freshPath();
    const store = new ResearchStore(path);
    let topicId = "";
    let alphaId = "";
    try {
      const topic = store.createTopic({ name: "Action siblings" });
      topicId = topic.id;
      const alpha = store.createAxis({
        branch: "feature/alpha",
        state: "active",
        title: "Alpha",
        topicId: topic.id,
      });
      const beta = store.createAxis({
        branch: "feature/beta",
        state: "active",
        title: "Beta",
        topicId: topic.id,
      });
      alphaId = alpha.id;
      store.addAnnotation({ axisId: beta.id, text: "beta leak marker" });
      store.addActivity({ axisId: beta.id, summary: "beta leak marker" });
    } finally {
      store.close();
    }

    const result = await call(
      "get_topic",
      { axisId: alphaId, evidenceOffset: 0, evidencePageSize: 100, topicId },
      path
    );
    expect(JSON.stringify(result)).not.toContain("beta");
    expect((result.evidencePage as Page).total).toBe(1);
  });

  test("refuses an unknown or cross-topic axis and malformed evidence bounds", async () => {
    const { path, axisId, topicId } = seedFixture();

    const unknown = await call(
      "get_topic",
      { axisId: "no-such-axis", evidenceOffset: 0, topicId },
      path
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toMatch(/Axis not found/);

    // A second topic with its own axis: scoping it to the first topic is refused.
    const otherTopic = await call(
      "reconcile_topic",
      { axes: [{ title: "Other axis" }], topicName: "Other" },
      path
    );
    const otherAxisId = (otherTopic.axes as Array<{ id: string }>)[0].id;
    const cross = await call(
      "get_topic",
      { axisId: otherAxisId, evidenceOffset: 0, evidencePageSize: 5, topicId },
      path
    );
    expect(cross.ok).toBe(false);
    expect(cross.error).toMatch(/does not belong to this topic/);

    for (const input of [
      { evidenceOffset: -1 },
      { evidenceOffset: 1.5 },
      { evidencePageSize: 0 },
      { evidencePageSize: 101 },
    ]) {
      const bad = await call(
        "get_topic",
        { axisId, topicId, ...input },
        path
      );
      expect(bad.ok).toBe(false);
      expect(bad.kind).toBe("invalid-input");
    }
  });
});
