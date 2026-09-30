/**
 * Action surface tests.
 *
 * These exercise the real entrypoint (`run`) against a real database built from the shipped
 * migrations, with a context the host would supply. What they pin down:
 *
 *   - the manifest's own contract: **exactly five** actions are exposed as agent tools, every action is
 *     declared with a name/effect/access/entry, the version matches `package.json`, and no schema uses
 *     a keyword outside the host's allowlist (which would invalidate the whole manifest on install);
 *   - the two failure shapes stay distinguishable: host schema violations are HTTP 400 and never reach
 *     this file, semantic rules come back as `{ok:false,error}`, conflicts keep their `conflict: `
 *     prefix, and a bug still throws;
 *   - provenance comes from the session, never from input.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./actions";

const repoRoot = join(import.meta.dir, "..");
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "nakama.plugin.json"), "utf8")
) as {
  actions: Array<{
    access?: string;
    effect?: string;
    entry?: string;
    exposeAsTool?: boolean;
    inputSchema?: Record<string, unknown>;
    key: string;
  }>;
  id: string;
  version: string;
};
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8")
) as {
  version: string;
};

const MIGRATIONS = ["001-research.sql", "002-coordination-model.sql"].map(
  (name) => readFileSync(join(repoRoot, "migrations", name), "utf8")
);

/** The five agent tools, and nothing else (D4). */
const EXPOSED_TOOLS = [
  "get_overview",
  "get_topic",
  "search_dashboard",
  "reconcile_topic",
  "record_activity",
];

/**
 * The host validates every declared schema against this keyword allowlist
 * (`packages/core/src/plugins.ts` `ALLOWED_SCHEMA_KEYS`); a keyword outside it makes the manifest
 * invalid on install, so it is replicated here to catch that before a Reinstall does. The real
 * enforcement is the Reinstall itself (C3 acceptance) — this is the fast feedback.
 */
const ALLOWED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "items",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "properties",
  "required",
  "type",
]);

type RunContext = Parameters<typeof run>[1];

function contextFor(
  actionKey: string,
  databasePath: string,
  options?: { actorId?: string; profileId?: string }
): RunContext {
  return {
    actionKey,
    actor: { id: options?.actorId ?? "user-1", role: "member" },
    databasePath,
    host: () => Promise.resolve({}),
    orgId: "org-test",
    ...(options?.profileId ? { profileId: options.profileId } : {}),
  } as unknown as RunContext;
}

function freshDatabase(): string {
  const path = `${process.env.TMPDIR ?? "/tmp"}/research-actions-${crypto.randomUUID()}.sqlite`;
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

/**
 * The single axis a one-axis fixture returns, asserted rather than optional-chained. The lint rule
 * refuses `a?.b as T` — a cast that hides the possibility of `undefined` inside a chain that would
 * then throw — so the check is explicit and happens once, here.
 */
function onlyAxis(result: Record<string, unknown>): {
  evidence: Array<{ kind: string; label: string }>;
  history: Array<{ id: string }>;
  notes: Array<{ text: string }>;
  people: unknown[];
  repositories: unknown[];
  state: string;
  stateConfidence: string;
} {
  const [axis] = (result.axes ?? []) as Array<{
    evidence: Array<{ kind: string; label: string }>;
    history: Array<{ id: string }>;
    notes: Array<{ text: string }>;
    people: unknown[];
    repositories: unknown[];
    state: string;
    stateConfidence: string;
  }>;
  if (!axis) {
    throw new Error("expected exactly one axis in this fixture");
  }
  return axis;
}

/** One call the way the host makes it: fresh connection, one action, structured result. */
async function call(
  actionKey: string,
  input: Record<string, unknown> = {},
  options?: { actorId?: string; path?: string; profileId?: string }
): Promise<Record<string, unknown>> {
  const path = options?.path ?? freshDatabase();
  return (await run(input, contextFor(actionKey, path, options))) as Record<
    string,
    unknown
  >;
}

describe("manifest contract", () => {
  test("exposes exactly the five librarian tools", () => {
    const exposed = manifest.actions
      .filter((action) => action.exposeAsTool === true)
      .map((action) => action.key)
      .sort();
    expect(exposed).toEqual([...EXPOSED_TOOLS].sort());
  });

  test("declares every other action explicitly as not-a-tool", () => {
    for (const action of manifest.actions) {
      if (!EXPOSED_TOOLS.includes(action.key)) {
        // Not merely omitted: a missing `exposeAsTool` would be a silent sixth tool.
        expect([action.key, action.exposeAsTool]).toEqual([action.key, false]);
      }
    }
  });

  test("declares each action completely and with unique keys", () => {
    const keys = manifest.actions.map((action) => action.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const action of manifest.actions) {
      expect(action.entry).toBe("actions/actions.js");
      expect(["read", "write"]).toContain(action.effect ?? "");
      expect(["admin", "member"]).toContain(action.access ?? "");
      expect(action.inputSchema?.type).toBe("object");
      expect(action.inputSchema?.additionalProperties).toBe(false);
    }
  });

  test("keeps the manifest version equal to the package version", () => {
    expect(manifest.version).toBe(packageJson.version);
  });

  test("uses only schema keywords the host accepts, at every depth", () => {
    const offenders: string[] = [];
    const walk = (schema: unknown, path: string): void => {
      if (typeof schema !== "object" || schema === null) {
        return;
      }
      for (const [key, value] of Object.entries(
        schema as Record<string, unknown>
      )) {
        if (!ALLOWED_SCHEMA_KEYS.has(key)) {
          offenders.push(`${path}.${key}`);
        }
        if (key === "properties") {
          for (const [name, child] of Object.entries(
            value as Record<string, unknown>
          )) {
            walk(child, `${path}.properties.${name}`);
          }
        }
        if (key === "items") {
          walk(value, `${path}.items`);
        }
      }
    };
    for (const action of manifest.actions) {
      walk(action.inputSchema, action.key);
    }
    expect(offenders).toEqual([]);
  });
});

describe("read actions", () => {
  test("get_overview answers 'what is going on' in one call", async () => {
    const path = freshDatabase();
    await call(
      "reconcile_topic",
      {
        annotations: [
          { axisTitle: "Rig control", text: "waiting on the rig firmware" },
        ],
        axes: [
          {
            branch: "feat/acquisition-control",
            people: [{ displayName: "Researcher A" }],
            repositories: [
              {
                fullName: "group/processing-pipeline",
                relationship: "primary",
              },
            ],
            title: "Parameter automation",
          },
          {
            blocker: "rig firmware",
            repositories: [{ fullName: "group/rig-tools" }],
            state: "blocked",
            title: "Rig control",
          },
        ],
        people: [{ displayName: "Researcher A", role: "owner" }],
        repositories: [
          { fullName: "group/processing-pipeline", relationship: "primary" },
        ],
        topic: { summary: "under review" },
        topicName: "Acquisition Automation",
      },
      { path }
    );

    const result = await call("get_overview", {}, { path });
    expect(result.ok).toBe(true);
    expect(result.counts).toMatchObject({ axes: 2, topics: 1 });
    expect(result.activitySinceDays).toBe(14);
    expect(result.blocked).toHaveLength(1);
    expect((result.blocked as Array<Record<string, unknown>>)[0]).toMatchObject(
      {
        blocker: "rig firmware",
        topicName: "Acquisition Automation",
      }
    );
    expect(result.recentTopics).toHaveLength(1);

    // The page's front page comes from this same call (C4): axes grouped under their topic, in
    // attention order and carrying the repositories each touches, rather than one flat list across
    // the whole board. One nested match asserts the order *and* the "repo · branch · PR" data.
    const entry = (result.topics as Array<Record<string, unknown>>)[0];
    expect(entry).toMatchObject({
      axes: [
        { title: "Rig control" },
        {
          repositories: [
            {
              fullName: "group/processing-pipeline",
              relationship: "primary",
            },
          ],
          title: "Parameter automation",
        },
      ],
      axisCounts: { active: 1, blocked: 1 },
      topic: { name: "Acquisition Automation" },
    });

    // C6: the same call also carries the other two views — person-first and repository-first — grouped
    // by identity rather than by link, so one person on a topic and an axis is one row, not two.
    const person = (result.people as Array<Record<string, unknown>>)[0];
    expect(result.people).toHaveLength(1);
    expect(result.peopleTruncated).toBe(false);
    expect(person).toMatchObject({
      axes: [{ title: "Parameter automation" }],
      person: { displayName: "Researcher A" },
      topics: [{ role: "owner", topic: { name: "Acquisition Automation" } }],
    });
    const repository = (
      result.repositories as Array<Record<string, unknown>>
    ).find(
      (entry) =>
        (entry.repository as Record<string, unknown>).fullName ===
        "group/processing-pipeline"
    );
    expect(result.repositoriesTruncated).toBe(false);
    expect(repository).toMatchObject({
      repository: { fullName: "group/processing-pipeline" },
      topics: [
        {
          relationship: "primary",
          topic: { name: "Acquisition Automation" },
        },
      ],
    });
    // "Supports" is what a topic declared, not what we can infer: the axis-only repository below has no
    // support link, and the view shows it under the work that names it instead of inventing one.
    const axisOnly = (
      result.repositories as Array<Record<string, unknown>>
    ).find(
      (entry) =>
        (entry.repository as Record<string, unknown>).fullName ===
        "group/rig-tools"
    );
    expect(axisOnly).toMatchObject({
      axes: [{ title: "Rig control" }],
      topics: [],
    });
    // The repository view scans the axes that name it, in the same attention order as the topic view.
    const repositoryAxes =
      repository === undefined
        ? undefined
        : (repository.axes as Array<Record<string, unknown>>);
    expect(repositoryAxes?.length ?? -1).toBe(1);

    // The window is a query parameter, not stored state — and `0` is the page's "all time".
    const allTime = await call(
      "get_overview",
      { activitySinceDays: 0 },
      { path }
    );
    expect(allTime.activitySinceDays).toBe(0);
    // Archived topics stay off the front page unless the caller asks for them.
    const withArchived = await call(
      "get_overview",
      { includeArchived: true },
      { path }
    );
    expect(withArchived.topics).toHaveLength(1);
  });

  test("get_topic returns the axes with their links, activity and annotations", async () => {
    const path = freshDatabase();
    await call(
      "reconcile_topic",
      {
        activities: [
          {
            axisTitle: "Signal explorer",
            repositoryFullName: "group/pipeline",
            summary: "run finished",
          },
        ],
        axes: [
          {
            branch: "feat/signal-explorer",
            currentState: "prototype compares methods",
            people: [{ displayName: "Researcher A", role: "owner" }],
            repositories: [
              { fullName: "group/pipeline", relationship: "primary" },
            ],
            title: "Signal explorer",
          },
        ],
        people: [{ displayName: "Researcher B", role: "reviewer" }],
        repositories: [{ fullName: "group/docs", relationship: "supporting" }],
        topic: { description: "filtering and reconstruction" },
        topicName: "Signal Processing",
      },
      { path }
    );

    const result = await call(
      "get_topic",
      { topicName: "signal processing" },
      { path }
    );
    expect(result.ok).toBe(true);
    const topic = result.topic as Record<string, unknown>;
    expect(topic.name).toBe("Signal Processing");
    expect(topic.version).toBe(2); // returned so the caller can write it back safely
    const axes = result.axes as Array<Record<string, unknown>>;
    expect(axes).toHaveLength(1);
    expect(axes[0]).toMatchObject({
      branch: "feat/signal-explorer",
      state: "active",
    });
    // C5: the detail is per-axis. Each axis carries its own history and its own evidence line, and the
    // topic-level counts say how much of the topic has no evidence at all.
    const axis = onlyAxis(result);
    expect(axis.repositories).toHaveLength(1);
    expect(axis.people).toHaveLength(1);
    expect(axis.history).toHaveLength(1);
    expect(axis.evidence.map((item) => item.kind)).toEqual([
      "branch",
      "activity",
    ]);
    expect(result.repositories).toHaveLength(1);
    expect(result.people).toHaveLength(1);
    expect(result.activity).toHaveLength(1);
    expect(result.counts).toMatchObject({
      activities: 1,
      axes: 1,
      axesWithoutEvidence: 0,
      notes: 0,
    });
  });

  test("get_topic files a note under its own axis, and a manual correction carries it (D8)", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ title: "Rig control" }],
        topic: { description: "hardware-side work" },
        topicName: "Acquisition Automation",
      },
      { path }
    );
    const topicId = (created.topic as { id: string }).id;
    const axisId = (created.axes as Array<{ id: string }>)[0]?.id as string;

    // A person parks an axis that nothing else backs yet, and says why in the same call. The note is
    // what makes 'confirmed' reachable — the evidence rule reads it in that transaction.
    const corrected = await call(
      "reconcile_topic",
      {
        annotations: [
          {
            axisId,
            text: "waiting intentionally for the October hardware slot",
          },
        ],
        axes: [{ id: axisId, state: "parked", stateConfidence: "confirmed" }],
        topicId,
      },
      { path }
    );
    expect(corrected.ok).toBe(true);

    const detail = await call("get_topic", { topicId }, { path });
    const axis = onlyAxis(detail);
    expect(axis).toMatchObject({
      state: "parked",
      stateConfidence: "confirmed",
    });
    // An axis note renders under its axis, not in the topic-level list...
    expect(axis.notes).toHaveLength(1);
    expect(detail.annotations).toHaveLength(0);
    // ...and the evidence line is the same set the write rule accepted, in words.
    expect(axis.evidence.map((item) => item.label)).toEqual(["note"]);
    expect(detail.counts).toMatchObject({ axesWithoutEvidence: 0, notes: 0 });
  });

  test("search_dashboard reports which field matched", async () => {
    const path = freshDatabase();
    await call(
      "reconcile_topic",
      {
        axes: [{ title: "Parameter automation" }],
        topic: { name: "Acquisition Automation" },
        topicName: "Acquisition Automation",
      },
      { path }
    );

    const result = await call(
      "search_dashboard",
      { query: "automation" },
      { path }
    );
    expect(result.ok).toBe(true);
    const topics = result.topics as Array<Record<string, unknown>>;
    expect(topics).toHaveLength(1);
    expect(topics[0]?.matchedFields).toEqual(["name"]);
    expect((result.axes as unknown[]).length).toBe(1);
    expect(result.truncated).toBe(false);
  });
});

describe("write actions", () => {
  test("reconcile_topic is the single write path and lands the whole payload", async () => {
    const path = freshDatabase();
    const result = await call(
      "reconcile_topic",
      {
        activities: [
          { axisTitle: "Parameter automation", summary: "sweep queued" },
        ],
        axes: [
          { branch: "feat/acquisition-control", title: "Parameter automation" },
        ],
        people: [{ displayName: "Researcher A" }],
        repositories: [{ fullName: "group/pipeline", relationship: "primary" }],
        topic: { status: "paused" },
        topicName: "Acquisition Automation",
      },
      { path }
    );

    expect(result.ok).toBe(true);
    expect(result.created).toMatchObject({
      axes: 1,
      people: 1,
      repositories: 1,
      topic: true,
    });
    expect((result.axes as unknown[])[0]).toMatchObject({
      title: "Parameter automation",
    });

    const readBack = await call(
      "get_topic",
      { topicName: "Acquisition Automation" },
      { path }
    );
    const topic = readBack.topic as Record<string, unknown>;
    expect(topic.status).toBe("paused");
    expect(readBack.activity).toHaveLength(1);
  });

  test("reconcile_topic is atomic at the action level too", async () => {
    const path = freshDatabase();
    await call("reconcile_topic", { topicName: "Topic Alpha" }, { path });

    const failed = await call(
      "reconcile_topic",
      {
        axes: [
          { branch: "feat/signal-explorer", title: "Signal explorer" },
          { state: "blocked", title: "Parameter automation" }, // no blocker text -> rule violation
        ],
        topic: { summary: "should not land" },
        topicName: "Topic Alpha",
      },
      { path }
    );
    expect(failed.ok).toBe(false);
    expect(String(failed.error)).toMatch(/without blocker text/);

    const after = await call(
      "get_topic",
      { topicName: "Topic Alpha" },
      { path }
    );
    expect((after.topic as Record<string, unknown>).summary).toBe("");
    expect(after.axes).toHaveLength(0);
  });

  test("record_activity records the session actor and registers the named repository", async () => {
    const path = freshDatabase();
    await call("reconcile_topic", { topicName: "Signal Processing" }, { path });

    const result = await call(
      "record_activity",
      {
        axisTitle: "Nope",
        repositoryFullName: "group/pipeline",
        sourceRef: "PR #142",
        sourceType: "github_pr",
        summary: "sampler refactor merged",
        topicName: "Signal Processing",
      },
      { path }
    );
    // The axis does not exist yet, so the rule says so instead of writing anything.
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/No axis "Nope"/);

    const recorded = await call(
      "record_activity",
      {
        repositoryFullName: "group/pipeline",
        sourceRef: "PR #142",
        sourceType: "github_pr",
        summary: "sampler refactor merged",
        topicName: "Signal Processing",
      },
      { actorId: "user-42", path }
    );
    expect(recorded.ok).toBe(true);
    expect(recorded.activity).toMatchObject({
      actorId: "user-42",
      actorType: "human",
      sourceType: "github_pr",
      summary: "sampler refactor merged",
    });

    const readBack = await call(
      "get_topic",
      { topicName: "Signal Processing" },
      { path }
    );
    // The repository is registered and the *activity* points at it; a topic-level repository link means
    // "this topic lives in that repo", which is a statement nobody made here.
    expect(
      (readBack.activity as Array<Record<string, unknown>>)[0]?.repositoryId
    ).toEqual(expect.any(String));
    expect(readBack.repositories).toHaveLength(0);
  });

  test("a tool call is attributed to the agent, a page call to the person", async () => {
    const path = freshDatabase();
    const topic = await call(
      "reconcile_topic",
      { topicName: "Topic Alpha" },
      { path }
    );
    const topicId = (topic.topic as Record<string, unknown>).id as string;

    const fromAgent = await call(
      "add_annotation",
      { text: "the agent read this from the meeting notes", topicId },
      { actorId: "user-7", path, profileId: "profile-1" }
    );
    expect(fromAgent.annotation).toMatchObject({
      authorId: "user-7",
      authorType: "agent",
    });

    const fromPerson = await call(
      "add_annotation",
      { text: "and the person confirmed it", topicId },
      { actorId: "user-7", path }
    );
    expect(fromPerson.annotation).toMatchObject({
      authorId: "user-7",
      authorType: "human",
    });
  });

  test("list_topics and list_activity serve the page", async () => {
    const path = freshDatabase();
    await call("reconcile_topic", { topicName: "Topic Alpha" }, { path });
    await call("reconcile_topic", { topicName: "Topic Beta" }, { path });
    const topics = await call("list_topics", {}, { path });
    expect((topics.topics as unknown[]).length).toBe(2);
    const paused = await call("list_topics", { status: "paused" }, { path });
    expect(paused.topics).toHaveLength(0);
    const activity = await call("list_activity", { limit: 5 }, { path });
    expect(activity.ok).toBe(true);
    expect(activity.activity).toHaveLength(0);
  });
});

describe("failure shapes stay distinguishable", () => {
  test("semantic problems come back as results, not exceptions", async () => {
    const path = freshDatabase();
    await call("reconcile_topic", { topicName: "Topic Alpha" }, { path });
    const other = await call(
      "reconcile_topic",
      { topicName: "Topic Beta" },
      { path }
    );
    const beta = (other.topic as Record<string, unknown>).id as string;
    const betaAxis = await call(
      "reconcile_topic",
      { axes: [{ title: "Signal explorer" }], topicId: beta },
      { path }
    );
    const axisId = ((betaAxis.axes as Array<Record<string, unknown>>)[0]?.id ??
      "") as string;

    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ["get_topic", {}, /topicId or topicName is required/],
      ["get_topic", { topicId: "missing" }, /Topic not found/],
      ["get_topic", { topicName: "No Such Topic" }, /No topic named/],
      [
        "record_activity",
        { summary: "x", topicId: "missing" },
        /Topic not found/,
      ],
      [
        "record_activity",
        { summary: "  ", topicName: "Topic Alpha" },
        /summary is required/,
      ],
      ["reconcile_topic", { topicId: "missing" }, /Topic not found/],
      ["search_dashboard", {}, /query is required/],
      ["search_dashboard", { query: "   " }, /query is required/],
      ["add_annotation", { text: "orphan" }, /topicId or axisId is required/],
      ["list_topics", { status: "done" }, /status must be one of/],
      // Cross-topic confusion is caught, not silently applied.
      [
        "record_activity",
        { axisId, summary: "x", topicName: "Topic Alpha" },
        /does not belong/,
      ],
    ];

    for (const [actionKey, input, pattern] of cases) {
      const result = await call(actionKey, input, { path });
      expect([actionKey, result.ok]).toEqual([actionKey, false]);
      expect(String(result.error)).toMatch(pattern);
    }
  });

  test("a stale version keeps its conflict prefix so the caller knows to re-read", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      { topicName: "Topic Alpha" },
      { path }
    );
    const topicId = (created.topic as Record<string, unknown>).id as string;
    await call(
      "reconcile_topic",
      { topic: { summary: "first writer" }, topicId },
      { path }
    );

    const conflict = await call(
      "reconcile_topic",
      { expectedVersion: 1, topic: { summary: "second writer" }, topicId },
      { path }
    );
    expect(conflict.ok).toBe(false);
    expect(String(conflict.error).startsWith("conflict: ")).toBe(true);

    const after = await call("get_topic", { topicId }, { path });
    expect((after.topic as Record<string, unknown>).summary).toBe(
      "first writer"
    );
  });

  test("identity is never read from input, even if a spoof survives the host", async () => {
    const path = freshDatabase();
    const result = await call(
      "reconcile_topic",
      {
        // The declared schema rejects unknown keys with a 400, so this cannot arrive through the host —
        // the action must not trust it either (defence in depth).
        actor: { id: "someone-else", type: "human" },
        annotations: [{ text: "whose note is this?" }],
        topicName: "Topic Alpha",
      },
      { actorId: "user-1", path }
    );
    expect(result.ok).toBe(true);

    const readBack = await call(
      "get_topic",
      { topicName: "Topic Alpha" },
      { path }
    );
    const annotation = (
      readBack.annotations as Array<Record<string, unknown>>
    )[0];
    expect(annotation?.authorId).toBe("user-1");
  });

  test("an unknown action key throws instead of pretending to succeed", async () => {
    await expect(call("not_an_action", {}, {})).rejects.toThrow(
      /Unsupported action/
    );
  });
});
