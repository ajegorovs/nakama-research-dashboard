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
import { ResearchStore } from "./store";

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

const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
].map((name) => readFileSync(join(repoRoot, "migrations", name), "utf8"));

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

/**
 * ...and the type names it accepts (`ALLOWED_SCHEMA_TYPES`). A `type` outside this set is the same
 * `unsupported_schema` refusal as an unknown keyword, and it is the easier mistake to make: `"string[]"`
 * and `"anyOf"` both look reasonable and both make the manifest invalid on install.
 */
const ALLOWED_SCHEMA_TYPES = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
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
    // `profileId` is what makes a call a machine's: the host sends it on agent tool calls and not on the
    // page's own. Omitting it is therefore "a person is doing this", which is what these tests default to.
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
        if (key === "type") {
          const types = Array.isArray(value) ? value : [value];
          for (const type of types) {
            if (typeof type !== "string" || !ALLOWED_SCHEMA_TYPES.has(type)) {
              offenders.push(`${path}.type=${JSON.stringify(type)}`);
            }
          }
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

/**
 * C9a — the drift test the V1 rework lacked. The skill is the agent's only map of this surface and is
 * materialized per release, so a stale body costs real turns (V1 shipped one naming keys that no longer
 * existed). The tool names in the skill and the manifest's exposed actions must be the same set, in both
 * directions, and the skill must describe the payload the actions actually return.
 */
describe("the shipped skill matches the surface it promises (C9a)", () => {
  const skill = readFileSync(
    join(repoRoot, "skills", "research-coordinator", "SKILL.md"),
    "utf8"
  );
  const namedInSkill = [
    ...new Set(
      [...skill.matchAll(/`plugin_([a-z_]+)__([a-z_]+)`/g)].map(
        (match) => match[2] ?? ""
      )
    ),
  ];

  test("names exactly the exposed tools, and all of them", () => {
    expect(namedInSkill.sort()).toEqual([...EXPOSED_TOOLS].sort());
  });

  test("calls the plugin by its real id, hyphen turned into underscore", () => {
    expect(skill).toContain(`plugin_${manifest.id.replace(/-/g, "_")}__`);
  });

  test("tells the agent about the rollups get_overview carries (C6/C7)", () => {
    for (const field of ["people", "repositories", "timeline"]) {
      expect(skill).toContain(field);
    }
  });

  test("states the semantics the store now enforces", () => {
    // The rules a rewrite must not lose: read before inferring, annotations outrank inference,
    // reconcile rather than recreate, and evidence for a `confirmed` claim.
    for (const phrase of [
      /annotations and corrections are human notes/i,
      /outranks your inference/i,
      /Reconcile, do not recreate/i,
      /must be backed by something in that call/i,
    ]) {
      expect(skill).toMatch(phrase);
    }
  });

  test("states the U3 semantics: recorded states, the refusal kinds, and history retention", () => {
    // What the skill owes an agent that can now move state through the action surface. A skill that
    // teaches the tool but not the four ways a call can be refused makes the agent guess at retries.
    for (const phrase of [
      /States are recorded, not typed in/i,
      /is not a softer/i, // `usable` is not a softer `completed`
      /A problem is a real record, not a status note/i,
      /A plan is optional/i,
      /A state change is not a rewrite/i,
      /History is permanent while its subject exists/i,
      /Deleting an axis or a problem takes its history with it/i,
    ]) {
      expect(skill).toMatch(phrase);
    }
    // The refusal vocabulary, each kind with what to do about it — the table is the contract.
    for (const kind of [
      "conflict",
      "no-op",
      "invalid-state",
      "human-authored",
      "invalid-input",
    ]) {
      expect(skill).toContain(`\`${kind}\``);
    }
    // A refusal is not a partial write, and the skill has to say so: otherwise an agent reports a
    // half-applied update that never happened.
    expect(skill).toMatch(/A refusal writes nothing at all/i);
  });

  test("promises no GitHub inspection — that is C9b/C11", () => {
    expect(skill).not.toMatch(
      /inspect (the )?(repository|repositories|branch|PR)/i
    );
    expect(skill).not.toMatch(/fetch (the )?(commits|PRs|pull requests)/i);
  });
});

/**
 * U3 — the new semantics through the action boundary, not the store API.
 *
 * The store proves its own rules; these prove that the *exposed* path reaches them: a state change made by
 * an agent lands in the history once and shows up in the projection the page reads, and the four refusals a
 * caller has to tell apart stay distinct on the way out instead of collapsing into "business error".
 */
describe("U3 action surface", () => {
  function stateLogRows(
    path: string,
    column: "axis_id" | "problem_id",
    id: string
  ): Array<{ from_state: string | null; to_state: string; origin: string }> {
    const db = new Database(path);
    try {
      return db
        .query(
          `SELECT from_state, to_state, origin FROM state_log WHERE ${column} = ? ORDER BY recorded_at, id`
        )
        .all(id) as Array<{
        from_state: string | null;
        to_state: string;
        origin: string;
      }>;
    } finally {
      db.close();
    }
  }

  async function axisIdOf(path: string, title: string): Promise<string> {
    const readBack = await call("get_topic", { topicName: "Acquisition Automation" }, { path });
    const axis = ((readBack.axes ?? []) as Array<{ id: string; title: string }>).find(
      (candidate) => candidate.title === title
    );
    if (!axis) {
      throw new Error(`axis ${title} is missing from the read-back`);
    }
    return axis.id;
  }

  test("active -> usable via the action: one history row, and the Progress projection reports usable", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      {
        axes: [
          {
            branch: "feat/sweep",
            state: "active",
            stateConfidence: "inferred",
            title: "Parameter automation",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );
    expect(created.ok).toBe(true);
    const axisId = await axisIdOf(path, "Parameter automation");
    // An axis created before the log existed carries no bootstrap row — nothing was replaced.
    expect(stateLogRows(path, "axis_id", axisId)).toEqual([]);

    const transitioned = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [
          { subject: "axis", axisTitle: "Parameter automation", toState: "usable" },
        ],
      },
      { path }
    );
    expect(transitioned.ok).toBe(true);
    expect(transitioned.transitions as unknown[]).toHaveLength(1);

    const rows = stateLogRows(path, "axis_id", axisId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ from_state: "active", to_state: "usable" });

    const store = new ResearchStore(path);
    try {
      const progress = store.progressAxes();
      const row = progress.axes.find((candidate) => candidate.id === axisId);
      expect(row?.state).toBe("usable");
      // One entry, and it records what was replaced. An axis that existed before the log does not get a
      // fabricated bootstrap row: nothing was replaced, so there is nothing to record.
      expect(
        row?.stateHistory.map((entry) => [entry.fromState, entry.toState])
      ).toEqual([["active", "usable"]]);

      // Recency is independent of state. Backdate the axis's own activity and the same row reports both
      // facts at once — usable and stale — because stale is a statement about the clock, not a state.
      const db = new Database(path);
      try {
        db.query(
          "UPDATE development_axes SET updated_at = ? WHERE id = ?"
        ).run(
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          axisId
        );
      } finally {
        db.close();
      }
      const aged = store.progressAxes().axes.find((candidate) => candidate.id === axisId);
      expect(aged?.state).toBe("usable");
      expect(aged?.stale).toBe(true);
    } finally {
      store.close();
    }
  });

  test("open -> resolved -> open via the action, both transitions preserved", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ state: "active", stateConfidence: "inferred", title: "Parameter automation" }],
        problems: [
          {
            axisTitle: "Parameter automation",
            repositoryFullNames: ["group/pipeline"],
            statement: "The loss floor is not reproducible across seeds.",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );
    expect(created.ok).toBe(true);
    const problems = created.problems as Array<{ id: string; statement: string; state: string }>;
    expect(problems).toHaveLength(1);
    expect(problems[0]?.state).toBe("open");

    const problemId = problems[0]?.id ?? "";
    const resolved = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [{ problemId, subject: "problem", toState: "resolved" }],
      },
      { path }
    );
    expect(resolved.ok).toBe(true);

    // While it is closed out, the projection counts it among the axis's problems and **not** among the open
    // ones — the distinction the inventory's "open problems only" rendering rests on (U4 step 4).
    const closed = (await call("get_progress", { activitySinceDays: 0 }, { path })) as {
      axes?: { axes?: Array<{ id: string; openProblems: number; problems: number }> };
      problems?: { problems?: Array<{ axisId: string; id: string; state: string }> };
    };
    const closedProblem = (closed.problems?.problems ?? []).find((row) => row.id === problemId);
    const closedAxis = (closed.axes?.axes ?? []).find((row) => row.id === closedProblem?.axisId);
    expect(closedProblem?.state).toBe("resolved");
    expect(closedAxis?.problems).toBeGreaterThan(closedAxis?.openProblems ?? 0);

    const reopened = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [{ problemId, subject: "problem", toState: "open" }],
      },
      { path }
    );
    expect(reopened.ok).toBe(true);

    // Append-only: the bootstrap row that states what it was created as, then both transitions, in order.
    expect(
      stateLogRows(path, "problem_id", problemId).map((row) => [
        row.from_state,
        row.to_state,
      ])
    ).toEqual([
      [null, "open"],
      ["open", "resolved"],
      ["resolved", "open"],
    ]);

    const store = new ResearchStore(path);
    try {
      const row = store.progressProblems().problems.find(
        (candidate) => candidate.id === problemId
      );
      // Reopened is open again, and the history that says it was once resolved is still there.
      expect(row?.state).toBe("open");
      expect(row?.history.map((entry) => entry.toState)).toEqual([
        "open",
        "resolved",
        "open",
      ]);
    } finally {
      store.close();
    }

    // ...and the detail view carries the same facts, so an agent that raised a problem can read it back:
    // the record, its state, and how its state got there.
    const detail = await call(
      "get_topic",
      { topicName: "Acquisition Automation" },
      { path }
    );
    const axisDetail = (
      detail.axes as Array<{
        problems: Array<{
          history: Array<{ toState: string }>;
          repositories: Array<{ fullName: string }>;
          state: string;
          statement: string;
        }>;
      }>
    )[0];
    expect(axisDetail?.problems).toHaveLength(1);
    expect(axisDetail?.problems[0]).toMatchObject({
      repositories: [{ fullName: "group/pipeline" }],
      state: "open",
      statement: "The loss floor is not reproducible across seeds.",
    });
    expect(axisDetail?.problems[0]?.history.map((entry) => entry.toState)).toEqual([
      "open",
      "resolved",
      "open",
    ]);
  });

  test("a refusal keeps its kind across the action boundary", async () => {
    const path = freshDatabase();
    await call(
      "reconcile_topic",
      {
        axes: [
          { state: "active", stateConfidence: "inferred", title: "Parameter automation" },
          { state: "draft", stateConfidence: "inferred", title: "Signal explorer" },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );

    // no-op: the axis is already there. Distinct from a conflict, because retrying changes nothing.
    const noOp = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [
          { subject: "axis", axisTitle: "Parameter automation", toState: "active" },
        ],
      },
      { path }
    );
    expect(noOp.ok).toBe(false);
    expect(noOp.kind).toBe("no-op");
    expect(String(noOp.error)).toStartWith("no-op: ");

    // invalid-state: a name that does not exist. The caller sent the wrong word, not the wrong moment.
    const invalid = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [
          { subject: "axis", axisTitle: "Parameter automation", toState: "finished" },
        ],
      },
      { path }
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.kind).toBe("invalid-state");
    expect(String(invalid.error)).toStartWith("invalid-state:");
    // ...and the same word is invalid for a problem, whose vocabulary is different. One authority: the
    // writer, which is why the manifest does not enumerate states for a transition.
    expect(invalid.kind).not.toBe("no-op");

    // conflict: an expected version that no longer matches. Re-read and retry is meaningful here.
    const conflicted = await call(
      "reconcile_topic",
      {
        topicName: "Acquisition Automation",
        transitions: [
          {
            expectedVersion: 99,
            subject: "axis",
            axisTitle: "Signal explorer",
            toState: "usable",
          },
        ],
      },
      { path }
    );
    expect(conflicted.ok).toBe(false);
    expect(conflicted.kind).toBe("conflict");
    expect(String(conflicted.error)).toStartWith("conflict: ");

    // A refusal writes nothing: the two axes are exactly as they were left.
    const readBack = await call("get_topic", { topicName: "Acquisition Automation" }, { path });
    const states = ((readBack.axes ?? []) as Array<{ state: string; title: string }>).map(
      (axis) => [axis.title, axis.state]
    );
    // Compared as a set, not in order. A topic's axes come back `ORDER BY updated_at DESC, title ASC`, and
    // whether the two inserts land in the same millisecond decides whether the title tiebreak is reached —
    // so the order here flips roughly half the time. That is a property of the query's key, not of the
    // refusal this test is about; pinning it made the test time-sensitive and it failed intermittently.
    expect(states.sort()).toEqual([
      ["Parameter automation", "active"],
      ["Signal explorer", "draft"],
    ]);
  });

  test("human-authored text is refused through the action, but an unchanged echo is not a rewrite", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ state: "active", stateConfidence: "inferred", title: "Parameter automation" }],
        problems: [
          {
            axisTitle: "Parameter automation",
            statement: "The loss floor is not reproducible across seeds.",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );
    const problemId = (created.problems as Array<{ id: string }>)[0]?.id ?? "";

    // A person edits the text. Authorship follows the words.
    const humanEdit = await call(
      "reconcile_topic",
      {
        problems: [
          {
            problemId,
            statement: "The loss floor moves with the seed, so the reported value is not reproducible.",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );
    expect(humanEdit.ok).toBe(true);
    expect((humanEdit.problems as Array<{ authorType: string }>)[0]?.authorType).toBe(
      "human"
    );

    // An agent may not replace those words.
    const refused = await call(
      "reconcile_topic",
      {
        problems: [
          { problemId, statement: "A tidier phrasing of the same finding." },
        ],
        topicName: "Acquisition Automation",
      },
      { path, profileId: "agent-7" }
    );
    expect(refused.ok).toBe(false);
    expect(refused.kind).toBe("human-authored");
    expect(String(refused.error)).toStartWith("human-authored:");

    // ...but it may work with them: an echo plus a new link is ordinary work, and the words stay the
    // person's (an agent repeating them does not acquire them).
    const linked = await call(
      "reconcile_topic",
      {
        problems: [
          {
            problemId,
            repositoryFullNames: ["group/pipeline"],
            stateConfidence: "inferred",
            statement: "The loss floor moves with the seed, so the reported value is not reproducible.",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path, profileId: "agent-7" }
    );
    expect(linked.ok).toBe(true);
    expect((linked.problems as Array<{ authorType: string; statement: string }>)[0]).toMatchObject({
      authorType: "human",
      statement:
        "The loss floor moves with the seed, so the reported value is not reproducible.",
    });
  });

  test("plans and steps land through the action, and a state on an update is refused as unrecorded", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ state: "active", stateConfidence: "inferred", title: "Parameter automation" }],
        plans: [
          {
            axisTitle: "Parameter automation",
            steps: [
              { position: 0, title: "Reproduce the sweep on a second seed" },
              { state: "active", title: "Compare against the published floor" },
            ],
            summary: "Close the reproducibility gap before the next report.",
          },
        ],
        problems: [
          {
            axisTitle: "Parameter automation",
            statement: "The loss floor is not reproducible across seeds.",
          },
        ],
        topicName: "Acquisition Automation",
      },
      { path }
    );
    expect(created.ok).toBe(true);
    const plans = created.plans as Array<{ id: string; steps: Array<{ state: string }> }>;
    expect(plans).toHaveLength(1);
    expect(plans[0]?.steps).toHaveLength(2);

    const problemId = (created.problems as Array<{ id: string }>)[0]?.id ?? "";
    const unrecorded = await call(
      "reconcile_topic",
      {
        problems: [{ problemId, state: "resolved", statement: "The loss floor is not reproducible across seeds." }],
        topicName: "Acquisition Automation",
      },
      { path, profileId: "agent-7" }
    );
    expect(unrecorded.ok).toBe(false);
    expect(unrecorded.kind).toBe("invalid-input");
    expect(String(unrecorded.error)).toMatch(/send it in `transitions`/);
  });
});

/**
 * U4 — the refusal taxonomy at the annotation boundary.
 *
 * The claim kinds (`interpretation`, `steering`) must name exactly one target. The store enforces that, and
 * `store-ux-v2.test.ts` asserts the throw. What was never pinned is what the **action boundary** does with
 * it: found while seeding Fixture E, a two-target (or targetless) claim answered HTTP 500 with "An
 * unexpected server error occurred" and no `kind`, while every other caller mistake returns a structured
 * refusal. A caller cannot act on a 500, which is the whole reason the kinds exist.
 */
describe("U4 — a mis-targeted claim is a refusal, not a server error", () => {
  /** A topic with one axis and one problem: enough for a claim to have two targets, or none. */
  async function seedClaim(path: string): Promise<{ axisTitle: string; problemId: string }> {
    const axisTitle = "Claim axis";
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ title: axisTitle }],
        problems: [{ axisTitle, statement: "The claim about this problem is mis-targeted." }],
        topic: { summary: "Claim targeting." },
        topicName: "Claim topic",
      },
      { path }
    );
    expect(created.ok).toBe(true);
    return { axisTitle, problemId: (created.problems as Array<{ id: string }>)[0]?.id ?? "" };
  }

  test("two targets on a steering claim come back as invalid-input", async () => {
    const path = freshDatabase();
    const { axisTitle, problemId } = await seedClaim(path);

    const refused = await call(
      "reconcile_topic",
      {
        annotations: [
          {
            axisTitle,
            kind: "steering",
            problemId,
            text: "Steering aimed at an axis and a problem at once.",
          },
        ],
        topicName: "Claim topic",
      },
      { path }
    );

    expect(refused.ok).toBe(false);
    expect(refused.kind).toBe("invalid-input");
    expect(String(refused.error)).toMatch(/exactly one/);

    // And nothing was written: the refusal is not a partial write.
    const after = await call("get_topic", { topicName: "Claim topic" }, { path });
    expect(after.annotations).toHaveLength(0);
  });

  test("no target on an interpretation claim comes back as invalid-input", async () => {
    const path = freshDatabase();
    await seedClaim(path);

    const refused = await call(
      "reconcile_topic",
      {
        annotations: [
          { kind: "interpretation", text: "An interpretation that names nothing." },
        ],
        topicName: "Claim topic",
      },
      { path }
    );

    expect(refused.ok).toBe(false);
    expect(refused.kind).toBe("invalid-input");
  });

  test("one target on a steering claim is accepted", async () => {
    const path = freshDatabase();
    const { problemId } = await seedClaim(path);

    const accepted = await call(
      "reconcile_topic",
      {
        annotations: [
          { kind: "steering", problemId, text: "Steering that names the problem it is about." },
        ],
        topicName: "Claim topic",
      },
      { path }
    );

    expect(accepted.ok).toBe(true);
  });
});

/**
 * U4 step 1 — the Progress view's data boundary.
 *
 * U4's acceptance criterion is that every visible Progress element traces to a projection/store field or
 * an explicit contract-derived computation, with no display-only semantics invented in JSX. The action
 * layer's half of that is this: what the page receives *is* the projection, field for field, and the field
 * set is pinned so a display-only addition has to be declared here rather than appearing in a component.
 */
describe("U4 — Progress reads the model as the store computes it", () => {
  /**
   * The four annotation cases the steering read has to separate. The first two must reach the page; the last
   * two must not, and they exist in the seed so that the exclusion can fail.
   */
  const STEERING_PROBLEM_TEXT =
    "Do not reconcile the two floors by widening the reported spread.";
  const STEERING_AXIS_TEXT =
    "Whatever the problem rows say, this axis is only usable with the gap written down.";
  const AGENT_INTERPRETATION_TEXT =
    "A reading the librarian inferred: the disagreement is likely a calibration artefact.";
  const NOTE_TEXT = "A note is context, not a claim.";
  /**
   * One axis carrying every element the Progress view has to render, created through the action route.
   *
   * `STEERING_PROBLEM_TEXT` / `STEERING_AXIS_TEXT` are the claims the read must produce;
   * `AGENT_INTERPRETATION_TEXT` and `NOTE_TEXT` are the two it must **not** — an agent's reading is not a
   * human constraint, and a note is context rather than a claim.
   */
  async function seedProgress(
    path: string
  ): Promise<{ axisId: string; problemId: string; stepId: string }> {
    const seeded = await call(
      "reconcile_topic",
      {
        axes: [{ title: "Parameter automation" }],
        plans: [
          {
            axisTitle: "Parameter automation",
            steps: [
              { position: 0, title: "Reproduce the sweep on a second seed" },
              { state: "active", title: "Compare against the published floor" },
            ],
            summary: "Close the reproducibility gap before the next report.",
          },
        ],
        problems: [
          {
            axisTitle: "Parameter automation",
            repositoryFullNames: ["group/pipeline"],
            statement: "The loss floor is not reproducible across seeds.",
          },
        ],
        topic: { summary: "Progress reads this axis." },
        topicName: "Progress seed",
      },
      { path }
    );
    expect(seeded.ok).toBe(true);

    const axisId = (seeded.axes as Array<{ id: string }>)[0]?.id ?? "";
    // Record one axis transition. An axis whose state is merely *inferred* has no history row — history
    // records what was written, and nothing was — so the append-only history only exists from a real
    // transition, which is also what makes `usable` and the history visible to the Progress view.
    const transitioned = await call(
      "reconcile_topic",
      {
        topicName: "Progress seed",
        transitions: [{ axisId, subject: "axis", toState: "usable" }],
      },
      { path }
    );
    expect(transitioned.ok).toBe(true);

    const problemId = (seeded.problems as Array<{ id: string }>)[0]?.id ?? "";
    const stepId =
      (seeded.plans as Array<{ steps: Array<{ id: string }> }>)[0]?.steps[1]?.id ?? "";
    // Two events inside the window: one that names the axis, and one that names the problem as its evidence.
    // The Activity column is per axis and the problem's own count is read from the same rows, so the seed has
    // to produce both — otherwise the feed half of the projection would only ever be tested empty.
    const recorded = await call(
      "reconcile_topic",
      {
        activities: [
          {
            axisId,
            sourceRef: "experiment:second-seed",
            sourceType: "experiment",
            summary: "Second seed swept on the same rig.",
          },
          {
            problemId,
            sourceRef: "experiment:floor-check",
            sourceType: "experiment",
            summary: "The loss floor moved again on the second seed.",
          },
        ],
        topicName: "Progress seed",
      },
      { path }
    );
    expect(recorded.ok).toBe(true);
    // Resolve and reopen, so the problem row's history is longer than its creation row.
    await call(
      "reconcile_topic",
      {
        topicName: "Progress seed",
        transitions: [{ problemId, subject: "problem", toState: "resolved" }],
      },
      { path }
    );
    await call(
      "reconcile_topic",
      {
        topicName: "Progress seed",
        transitions: [{ problemId, subject: "problem", toState: "open" }],
      },
      { path }
    );
    await call(
      "record_activity",
      {
        axisTitle: "Parameter automation",
        sourceRef: "PR #7",
        sourceType: "github_pr",
        summary: "second-seed sweep reproduced the floor",
        topicName: "Progress seed",
      },
      { path }
    );
    // The steering read's four cases, in one call: a human claim on the problem and a human claim on the
    // **axis** (both must appear, each under its own scope), plus an agent-authored interpretation and an
    // ordinary note (neither may). The last two exist so the exclusions can fail rather than pass vacuously.
    const annotated = await call(
      "reconcile_topic",
      {
        annotations: [
          { kind: "steering", problemId, text: STEERING_PROBLEM_TEXT },
          { axisId, kind: "interpretation", text: STEERING_AXIS_TEXT },
          {
            authorType: "agent",
            kind: "interpretation",
            problemId,
            text: AGENT_INTERPRETATION_TEXT,
          },
          { kind: "note", problemId, text: NOTE_TEXT },
        ],
        topicName: "Progress seed",
      },
      { path }
    );
    expect(annotated.ok).toBe(true);

    return { axisId, problemId, stepId };
  }

  test("steering is human claims only, each under the scope it was aimed at", async () => {
    const path = freshDatabase();
    const { axisId, problemId } = await seedProgress(path);

    const result = await call("get_progress", { activitySinceDays: 7 }, { path });
    const axes = result.axes as { axes: Array<Record<string, unknown>> };
    const problems = result.problems as { problems: Array<Record<string, unknown>> };
    const problemRow = problems.problems.find((row) => row.id === problemId) as {
      steering: Array<{
        authorType: string;
        kind: string;
        scope: string;
        text: string;
      }>;
    };
    const axisRow = axes.axes.find((row) => row.id === axisId) as {
      steering: Array<{ kind: string; scope: string; text: string }>;
    };

    // What the projections carry: the human claim on the problem, and the human claim on the axis — each
    // under its own scope, and the axis claim is **not** copied under the problem beneath it.
    expect(problemRow.steering.map((row) => [row.scope, row.kind, row.authorType])).toEqual([
      ["problem", "steering", "human"],
    ]);
    expect(problemRow.steering[0]?.text).toBe(STEERING_PROBLEM_TEXT);
    expect(axisRow.steering.map((row) => [row.scope, row.kind])).toEqual([
      ["axis", "interpretation"],
    ]);
    expect(axisRow.steering[0]?.text).toBe(STEERING_AXIS_TEXT);
    expect(problemRow.steering.some((row) => row.text === STEERING_AXIS_TEXT)).toBe(false);

    // And the counter-check, straight from the database: three annotations name that problem and only one
    // reaches the read. Without this the exclusions could pass on a seed that never had anything to exclude.
    const stored = (() => {
      const db = new Database(path);
      try {
        return db
          .query(
            "SELECT kind, author_type FROM annotations WHERE problem_id = ? ORDER BY created_at"
          )
          .all(problemId) as Array<{ author_type: string; kind: string }>;
      } finally {
        db.close();
      }
    })();
    expect(stored.length).toBe(3);
    expect(stored.map((row) => [row.kind, row.author_type]).sort()).toEqual([
      ["interpretation", "agent"],
      ["note", "human"],
      ["steering", "human"],
    ]);
    expect(problemRow.steering.length).toBe(1);
  });

  test("hands over both projections exactly as the store computes them", async () => {
    const path = freshDatabase();
    await seedProgress(path);

    const options = { activitySinceDays: 0, includeArchived: false, limit: 50 };
    const result = await call("get_progress", { activitySinceDays: 0 }, { path });
    const store = new ResearchStore(path);

    expect(result.ok).toBe(true);
    // Deep equality, not a spot check: if the action added, renamed or reshaped anything, this fails.
    expect(result.activity).toEqual(store.progressActivity(options));
    expect(result.axes).toEqual(store.progressAxes(options));
    expect(result.problems).toEqual(store.progressProblems(options));
  });

  test("pins the field set the Progress view may render", async () => {
    const path = freshDatabase();
    await seedProgress(path);

    const result = await call("get_progress", {}, { path });
    const activity = result.activity as {
      byAxis: Array<{ axisId: string; eventCount: number; events: Array<Record<string, unknown>> }>;
    };
    const axes = result.axes as {
      axes: Array<
        Record<string, unknown> & {
          activityInWindow: number;
          id: string;
          openProblems: number;
        }
      >;
    };
    const problems = result.problems as {
      problems: Array<Record<string, unknown> & { axisId: string; state: string }>;
    };

    expect(Object.keys(result).sort()).toEqual(["activity", "axes", "ok", "problems"]);
    expect(Object.keys(activity).sort()).toEqual([
      "activitySinceDays",
      "byAxis",
      "staleAfterDays",
    ]);
    expect(Object.keys(activity.byAxis[0] ?? {}).sort()).toEqual([
      "axisId",
      "eventCount",
      "events",
    ]);
    // The event row the Activity column renders — one line per event, with the linkage it needs to show
    // where the event belongs and who is behind it.
    expect(Object.keys(activity.byAxis[0]?.events[0] ?? {}).sort()).toEqual([
      "actorId",
      "actorType",
      "axisId",
      "id",
      "occurredAt",
      "person",
      "problemId",
      "recordedAt",
      "repositoryId",
      "sourceRef",
      "sourceType",
      "sourceUrl",
      "summary",
      "topicId",
    ]);
    // The index's per-axis count and the feed's own count are the same number from the same predicate —
    // asserted rather than trusted, because a column that disagrees with the row it was opened from is
    // exactly how a projection becomes two.
    for (const axis of axes.axes) {
      const feed = activity.byAxis.find((bucket) => bucket.axisId === axis.id);
      expect(feed?.eventCount).toBe(axis.activityInWindow);
    }
    // The plan the axis row carries is the page's only source for the Plan section, so its shape — and a
    // step's — is pinned here like every other rendered field. `position` is nullable **by design**: the page
    // shows a number only where a step claims one, so the pin has to cover both shapes rather than assume a
    // sequence.
    const planned = axes.axes.find((row) => row.plan)?.plan as
      | { steps: Array<Record<string, unknown>>; stepsDone: number }
      | null;
    expect(planned).toBeTruthy();
    expect(Object.keys(planned as object).sort()).toEqual([
      "id",
      "steps",
      "stepsDone",
      "summary",
    ]);
    expect(planned?.steps.length).toBe(2);
    expect(Object.keys(planned?.steps[0] ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "planId",
      "position",
      "state",
      "title",
      "updatedAt",
    ]);
    for (const step of planned?.steps ?? []) {
      expect(step.position === null || typeof step.position === "number").toBe(true);
    }
    // And the steps arrive in the store's own order, which is what the page renders as given: ordered steps
    // first in non-decreasing position, then any step that claims none.
    for (const axis of axes.axes) {
      const steps =
        (axis.plan as { steps: Array<{ position: number | null }> } | null)?.steps ?? [];
      const positions = steps.map((step) => step.position);
      const claimed = positions.filter((position): position is number => position !== null);
      expect(claimed).toEqual([...claimed].sort((left, right) => left - right));
      expect(positions.slice(0, claimed.length)).toEqual(claimed);
    }
    for (const axis of axes.axes) {
      const mine = problems.problems.filter(
        (row) => row.axisId === axis.id && row.state === "open"
      );
      expect(mine.length).toBe(axis.openProblems);
    }
    expect(Object.keys(axes).sort()).toEqual(["activitySinceDays", "axes", "staleAfterDays"]);
    expect(Object.keys(problems).sort()).toEqual([
      "activitySinceDays",
      "problems",
      "staleAfterDays",
    ]);

    // The axis row, as the Progress index renders it: state and its confidence, the stale flag with its
    // recency, the optional plan with its steps, problem counts, the window count and the append-only history.
    expect(Object.keys(axes.axes[0] ?? {}).sort()).toEqual([
      "activityInWindow",
      "blocker",
      "blockerConfidence",
      "id",
      "lastActivityAt",
      "openProblems",
      "plan",
      "problems",
      "recencyAt",
      "stale",
      "state",
      "stateConfidence",
      "stateHistory",
      "steering",
      "title",
      "topicId",
      "topicName",
    ]);
    expect(Object.keys((axes.axes[0]?.plan ?? {}) as object).sort()).toEqual([
      "id",
      "steps",
      "stepsDone",
      "summary",
    ]);

    // The problem row, read from the problem outwards: parent axis and topic, affected repositories, the
    // plan step it belongs to, evidence and people, recency, and its own resolution/reopen history.
    expect(Object.keys(problems.problems[0] ?? {}).sort()).toEqual([
      "activityCount",
      "authorId",
      "authorType",
      "axisId",
      "axisTitle",
      "evidence",
      "history",
      "id",
      "lastActivityAt",
      "people",
      "planStepId",
      "planStepTitle",
      "recencyAt",
      "repositories",
      "stale",
      "state",
      "stateConfidence",
      "statement",
      "steering",
      "topicId",
      "topicName",
    ]);

    // The two supporting reads step 5 renders are pinned too: a record keeps its provenance, and a steering
    // claim keeps the scope it was aimed at.
    const withEvidence = (
      problems.problems as unknown as Array<{ evidence: Array<Record<string, unknown>> }>
    ).find((row) => row.evidence.length > 0);
    expect(Object.keys(withEvidence?.evidence[0] ?? {}).sort()).toEqual([
      "id",
      "label",
      "occurredAt",
      "sourceRef",
      "sourceType",
      "sourceUrl",
      "summary",
    ]);
    const withSteering = (
      problems.problems as unknown as Array<{ steering: Array<Record<string, unknown>> }>
    ).find((row) => row.steering.length > 0);
    expect(Object.keys(withSteering?.steering[0] ?? {}).sort()).toEqual([
      "authorId",
      "authorType",
      "confidence",
      "id",
      "kind",
      "recordedAt",
      "scope",
      "text",
    ]);

    // No V1 display vocabulary survives in the payload: the view cannot fall back to the fixed
    // scope/approach/progress/nextStep cards the contract retired.
    for (const forbidden of ["scope", "approach", "progress", "nextStep"]) {
      expect(Object.keys(axes.axes[0] ?? {})).not.toContain(forbidden);
    }
  });

  test("one call, one window — both halves describe the same scope", async () => {
    const path = freshDatabase();
    await seedProgress(path);

    const result = await call("get_progress", { activitySinceDays: 7 }, { path });
    const activity = result.activity as { activitySinceDays: number; staleAfterDays: number };
    const axes = result.axes as { activitySinceDays: number; staleAfterDays: number };
    const problems = result.problems as { activitySinceDays: number; staleAfterDays: number };

    expect(axes.activitySinceDays).toBe(7);
    expect(problems.activitySinceDays).toBe(7);
    expect(activity.activitySinceDays).toBe(7);
    // One stale derivation, shared: the three halves cannot disagree about what "stale" means.
    expect(axes.staleAfterDays).toBe(problems.staleAfterDays);
    expect(axes.staleAfterDays).toBe(activity.staleAfterDays);

    // 0 means all time, and it is a query parameter rather than stored state.
    const allTime = await call("get_progress", { activitySinceDays: 0 }, { path });
    expect((allTime.axes as { activitySinceDays: number }).activitySinceDays).toBe(0);
  });

  test("carries the new model the slice renders, not a derived V1 shape", async () => {
    const path = freshDatabase();
    const { problemId, stepId } = await seedProgress(path);

    const result = await call("get_progress", {}, { path });
    const axes = (result.axes as { axes: Array<Record<string, any>> }).axes;
    const problems = (result.problems as { problems: Array<Record<string, any>> }).problems;

    const axis = axes[0] ?? {};
    expect(axis.title).toBe("Parameter automation");
    expect(axis.state).toBe("usable");
    expect(axis.problems).toBe(1);
    expect(axis.openProblems).toBe(1);
    // One reviewable transition, one row: no bootstrap row was invented, and `usable` is what the axis
    // now holds. This is the append-only history the Progress view renders.
    expect(axis.stateHistory.map((entry: { toState: string }) => entry.toState)).toEqual(["usable"]);
    expect(axis.plan.steps).toHaveLength(2);
    expect(axis.plan.stepsDone).toBe(0);
    // Three events, and the problem-linked one belongs to this axis too: the insert path resolves an event
    // that named only its problem back up to the axis, so the index count and the feed agree without the
    // page assembling anything.
    expect(axis.activityInWindow).toBe(3);

    const problem = problems.find((row) => row.id === problemId) ?? {};
    expect(problem.state).toBe("open");
    expect(problem.statement).toBe("The loss floor is not reproducible across seeds.");
    expect(problem.axisTitle).toBe("Parameter automation");
    expect(problem.topicName).toBe("Progress seed");
    expect(problem.planStepTitle).toBeNull();
    expect(problem.repositories.map((repo: { fullName: string }) => repo.fullName)).toEqual([
      "group/pipeline",
    ]);
    // The history the Problems subview shows: creation, resolution, reopen — in order, append-only.
    expect(problem.history.map((entry: { toState: string }) => entry.toState)).toEqual([
      "open",
      "resolved",
      "open",
    ]);

    // The populated half of the same field: a problem *may* sit on a plan step, and the projection carries
    // the step's title. The null case above is the one the contract requires — a problem stays meaningful
    // with no plan, no repository and no artifact — so both are pinned rather than assuming the richer one.
    const linked = await call(
      "reconcile_topic",
      {
        problems: [
          {
            axisTitle: "Parameter automation",
            planStepId: stepId,
            statement: "The comparison against the published floor has no fixed tolerance.",
          },
        ],
        topicName: "Progress seed",
      },
      { path }
    );
    expect(linked.ok).toBe(true);

    const after = await call("get_progress", {}, { path });
    const rows = (after.problems as { problems: Array<Record<string, any>> }).problems;
    const onStep = rows.find(
      (row) => row.statement === "The comparison against the published floor has no fixed tolerance."
    );
    expect(onStep?.planStepTitle).toBe("Compare against the published floor");
    expect(onStep?.planStepId).toBe(stepId);
    expect(onStep?.history.map((entry: { toState: string }) => entry.toState)).toEqual(["open"]);
    // The axis index counts it without the view counting anything itself.
    expect((after.axes as { axes: Array<Record<string, any>> }).axes[0]?.openProblems).toBe(2);
  });

  test("the activity feed is grouped by the server, in the index's order, and names its problem", async () => {
    const path = freshDatabase();
    const { problemId } = await seedProgress(path);

    const result = await call("get_progress", {}, { path });
    const axes = (result.axes as { axes: Array<{ id: string }> }).axes;
    const feed = (
      result.activity as {
        byAxis: Array<{
          axisId: string;
          eventCount: number;
          events: Array<{ problemId: string | null; sourceRef: string | null; summary: string }>;
        }>;
      }
    ).byAxis;

    // The feed arrives in the index's order, so switching rows never reorders the feed underneath the
    // reader. Asserted as a relative order over the axes that have events, which is what the guarantee is.
    const feedIds = feed.map((bucket) => bucket.axisId);
    expect(feedIds).toEqual(
      axes.map((row) => row.id).filter((id) => feedIds.includes(id))
    );

    // Both events land under the one axis — including the one that named only the problem — and the
    // problem-linked line carries the id the Problem section can match on.
    expect(feed).toHaveLength(1);
    expect(feed[0]?.eventCount).toBe(3);
    const linked = feed[0]?.events.find((event) => event.problemId === problemId);
    expect(linked?.summary).toBe("The loss floor moved again on the second seed.");
    // Newest first, like the timeline it shares its derivation with — including the event that named only
    // the axis and the one recorded through the single-activity action.
    expect(feed[0]?.events.map((event) => event.sourceRef)).toEqual([
      "PR #7",
      "experiment:floor-check",
      "experiment:second-seed",
    ]);
  });
});

/**
 * The scoped `get_topic` read.
 *
 * The finding this pins: a topic-wide read returns every axis's notes, so a caller that cares about one
 * axis has no way to ask for just it, and a problem's own notes were not exposed at all. These tests fix
 * the smallest boundary that answers that — an optional stable `axisId` — and assert both halves: the
 * scoped return (selection, sibling exclusion, problem notes, coverage) and the untouched legacy shape.
 */
describe("get_topic scoped workstream", () => {
  type AxisRef = { id: string; title: string };
  type Coverage = {
    limit: number;
    limitScope: "collection" | "per-source" | "per-problem";
    returned: number;
    total: number;
    truncated: boolean;
    absent: boolean;
  };

  /** One topic, three axes (Alpha notes+problem, Beta a note, Gamma empty), and a problem note. */
  async function seedWorkstream(path: string) {
    const created = await call(
      "reconcile_topic",
      {
        axes: [{ title: "Alpha axis" }, { title: "Beta axis" }, { title: "Gamma axis" }],
        topicName: "Workstream scope",
      },
      { path }
    );
    const axes = created.axes as AxisRef[];
    const idOf = (title: string) => axes.find((axis) => axis.title === title)?.id as string;
    const topicId = (created.topic as { id: string }).id;
    const alphaId = idOf("Alpha axis");
    const betaId = idOf("Beta axis");
    const gammaId = idOf("Gamma axis");

    // A note on each of Alpha and Beta: Beta's is the sibling a scoped Alpha read must not return.
    await call(
      "reconcile_topic",
      {
        annotations: [
          { axisId: alphaId, text: "alpha note" },
          { axisId: betaId, text: "beta sibling note" },
        ],
        topicId,
      },
      { path }
    );

    // A problem on Alpha, then a note that names only the problem.
    const withProblem = await call(
      "reconcile_topic",
      { problems: [{ axisId: alphaId, statement: "alpha problem" }], topicId },
      { path }
    );
    const problemId = (withProblem.problems as Array<{ id: string }>)[0]?.id as string;
    await call(
      "reconcile_topic",
      { annotations: [{ problemId, text: "problem-scoped note" }], topicId },
      { path }
    );

    return { alphaId, betaId, gammaId, problemId, topicId };
  }

  test("scopes to the selected axis and returns no sibling note", async () => {
    const path = freshDatabase();
    const { alphaId, topicId } = await seedWorkstream(path);

    const result = await call("get_topic", { topicId, axisId: alphaId }, { path });
    expect(result.ok).toBe(true);
    // The scoped read is a workstream, not a narrowed topic detail: no sibling axes, no topic-wide
    // note list to leak one.
    expect(result.axes).toBeUndefined();
    expect(result.annotations).toBeUndefined();

    const axis = result.axis as { id: string; notes: Array<{ text: string }> };
    expect(axis.id).toBe(alphaId);
    const noteTexts = axis.notes.map((note) => note.text);
    expect(noteTexts).toContain("alpha note");
    expect(noteTexts).not.toContain("beta sibling note");
  });

  test("reaches a problem's own notes, and keeps them off the axis", async () => {
    const path = freshDatabase();
    const { alphaId, problemId, topicId } = await seedWorkstream(path);

    const result = await call("get_topic", { topicId, axisId: alphaId }, { path });
    const axis = result.axis as {
      notes: Array<{ text: string }>;
      problems: Array<{ id: string; notes: Array<{ text: string }> }>;
    };
    // The problem note was never exposed before; now it is reachable, under its problem...
    const problem = axis.problems.find((row) => row.id === problemId);
    expect(problem?.notes.map((note) => note.text)).toEqual(["problem-scoped note"]);
    // ...and not duplicated into the axis's own note list.
    expect(axis.notes.map((note) => note.text)).not.toContain("problem-scoped note");
  });

  test("refuses an axis id that belongs to another topic", async () => {
    const path = freshDatabase();
    const a = await call(
      "reconcile_topic",
      { axes: [{ title: "Only axis" }], topicName: "Topic A" },
      { path }
    );
    const aTopicId = (a.topic as { id: string }).id;
    const b = await call(
      "reconcile_topic",
      { axes: [{ title: "Other axis" }], topicName: "Topic B" },
      { path }
    );
    const bAxisId = (b.axes as AxisRef[])[0]?.id as string;

    const result = await call("get_topic", { topicId: aTopicId, axisId: bAxisId }, { path });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/does not belong to this topic/);
  });

  test("refuses an axis id that does not exist", async () => {
    const path = freshDatabase();
    const { topicId } = await seedWorkstream(path);

    const result = await call("get_topic", { topicId, axisId: "no-such-axis" }, { path });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
    expect(String(result.error)).toMatch(/Axis not found/);
  });

  test("coverage tells an absent collection from a capped one", async () => {
    const path = freshDatabase();
    const { alphaId, betaId, gammaId, topicId } = await seedWorkstream(path);
    // Alpha already carries one axis note; two more make three, so a notesLimit of two must bite.
    await call(
      "reconcile_topic",
      {
        annotations: [
          { axisId: alphaId, text: "alpha note two" },
          { axisId: alphaId, text: "alpha note three" },
        ],
        topicId,
      },
      { path }
    );

    const capped = await call(
      "get_topic",
      { axisId: alphaId, notesLimit: 2, topicId },
      { path }
    );
    const cappedCoverage = (capped.coverage as { notes: Coverage }).notes;
    expect(cappedCoverage).toMatchObject({
      absent: false,
      limit: 2,
      returned: 2,
      total: 3,
      truncated: true,
    });

    // Gamma has no notes, no activity and no problems: empty is a fact (`absent`), never `truncated`.
    const empty = await call("get_topic", { axisId: gammaId, notesLimit: 2, topicId }, { path });
    const emptyCoverage = empty.coverage as {
      evidence: Coverage;
      history: Coverage;
      notes: Coverage;
      problemNotes: Coverage;
    };
    expect(emptyCoverage.notes).toMatchObject({
      absent: true,
      returned: 0,
      total: 0,
      truncated: false,
    });
    expect(emptyCoverage.history.truncated).toBe(false);
    expect(emptyCoverage.history.absent).toBe(true);

    // And the sibling Beta read shows its own note only — Gamma's emptiness is not Beta's.
    const beta = await call("get_topic", { axisId: betaId, topicId }, { path });
    const betaAxis = beta.axis as { notes: Array<{ text: string }> };
    expect(betaAxis.notes.map((note) => note.text)).toEqual(["beta sibling note"]);
  });

  test("coverage names the limit unit, so returned may exceed limit (per-source / per-problem)", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      { axes: [{ branch: "feat/alpha", title: "Alpha axis" }], topicName: "Limit scope" },
      { path }
    );
    const alphaId = (created.axes as AxisRef[])[0]?.id as string;
    const topicId = (created.topic as { id: string }).id;

    // Five activities is exactly the per-source evidence cap, so the evidence line (one structural
    // branch + five capped activities + one axis note) returns 7 against a limit of 5.
    await call(
      "reconcile_topic",
      {
        activities: [1, 2, 3, 4, 5].map((n) => ({
          axisId: alphaId,
          sourceType: "manual",
          summary: `activity ${n}`,
        })),
        topicId,
      },
      { path }
    );

    // Two problems, each with two problem-scoped notes, plus one axis note. A per-problem notesLimit of
    // 2 returns 2 per problem — the problemNotes collection returns 4 against a limit of 2, untruncated.
    const withProblems = await call(
      "reconcile_topic",
      {
        problems: [
          { axisId: alphaId, statement: "problem one" },
          { axisId: alphaId, statement: "problem two" },
        ],
        topicId,
      },
      { path }
    );
    const problemIds = (withProblems.problems as Array<{ id: string }>).map((p) => p.id);
    await call(
      "reconcile_topic",
      {
        annotations: [
          { axisId: alphaId, text: "axis note" },
          ...problemIds.flatMap((problemId) => [
            { problemId, text: "problem note one" },
            { problemId, text: "problem note two" },
          ]),
        ],
        topicId,
      },
      { path }
    );

    const result = await call(
      "get_topic",
      { axisId: alphaId, notesLimit: 2, topicId },
      { path }
    );
    const coverage = result.coverage as {
      evidence: Coverage;
      history: Coverage;
      notes: Coverage;
      problemNotes: Coverage;
    };
    const axis = result.axis as {
      evidence: unknown[];
      history: unknown[];
      notes: unknown[];
      problems: Array<{ id: string; notes: unknown[] }>;
    };

    // Each unit is named, so a caller never infers `returned <= limit` from `limit` alone.
    expect(coverage.history.limitScope).toBe("collection");
    expect(coverage.notes.limitScope).toBe("collection");
    expect(coverage.evidence.limitScope).toBe("per-source");
    expect(coverage.problemNotes.limitScope).toBe("per-problem");

    // Only a collection-scoped limit bounds the returned count.
    expect(coverage.history.returned).toBeLessThanOrEqual(coverage.history.limit);
    expect(coverage.notes.returned).toBeLessThanOrEqual(coverage.notes.limit);

    // Per-source: the limit caps each source, so the collection's returned count exceeds it.
    expect(coverage.evidence.limit).toBe(5);
    expect(coverage.evidence.returned).toBeGreaterThan(coverage.evidence.limit);

    // Per-problem: two problems at a limit of two return four, and nothing was left out.
    expect(coverage.problemNotes).toMatchObject({
      absent: false,
      limit: 2,
      limitScope: "per-problem",
      returned: 4,
      total: 4,
      truncated: false,
    });
    expect(coverage.problemNotes.returned).toBeGreaterThan(coverage.problemNotes.limit);

    // Serialized consistency: every coverage `returned` equals what the payload actually carries.
    expect(coverage.evidence.returned).toBe(axis.evidence.length);
    expect(coverage.history.returned).toBe(axis.history.length);
    expect(coverage.notes.returned).toBe(axis.notes.length);
    expect(coverage.problemNotes.returned).toBe(
      axis.problems.reduce((sum, problem) => sum + problem.notes.length, 0)
    );
  });

  test("refuses a limit below the floor (absence is not a limit of zero)", async () => {
    const path = freshDatabase();
    const { alphaId, topicId } = await seedWorkstream(path);

    const result = await call("get_topic", { axisId: alphaId, notesLimit: 0, topicId }, { path });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe("invalid-input");
  });

  test("the axis note cap excludes problem-scoped notes in SQL, before the limit", async () => {
    const path = freshDatabase();
    const created = await call(
      "reconcile_topic",
      { axes: [{ title: "Crowded axis" }], topicName: "Pre-limit filter" },
      { path }
    );
    const axisId = (created.axes as AxisRef[])[0]?.id as string;
    const topicId = (created.topic as { id: string }).id;

    // One problem, so a plain note can legally name **both** the axis and the problem. Such a note
    // belongs to the axis but is surfaced under its problem; the axis collection must not show it, and
    // must not let it spend a `notesLimit` slot either.
    const withProblem = await call(
      "reconcile_topic",
      { problems: [{ axisId, statement: "crowding problem" }], topicId },
      { path }
    );
    const problemId = (withProblem.problems as Array<{ id: string }>)[0]?.id as string;

    // Insertion order fixes the newest-first order (created_at, then rowid as the tiebreak): the three
    // axis-only notes first (C oldest, A newest), then two newer multi-target notes. The axis-only page
    // is therefore A, B, C — and the two mult-target notes are the ones that would crowd it.
    await call(
      "reconcile_topic",
      {
        annotations: [
          { axisId, text: "axis note C" },
          { axisId, text: "axis note B" },
          { axisId, text: "axis note A" },
          { axisId, problemId, text: "crowding note one" },
          { axisId, problemId, text: "crowding note two" },
        ],
        topicId,
      },
      { path }
    );

    const result = await call("get_topic", { axisId, notesLimit: 2, topicId }, { path });
    const coverage = result.coverage as { notes: Coverage; problemNotes: Coverage };
    const axis = result.axis as {
      notes: Array<{ text: string }>;
      problems: Array<{ id: string; notes: Array<{ text: string }> }>;
    };

    // The two limit slots go to genuine axis notes, not to the newer multi-target notes that a
    // post-query `.filter` would have dropped *after* they consumed the slots. `returned` equals the
    // capped page; `total` counts every axis-only note and matches the coverage predicate
    // (`axis_id = ? AND problem_id IS NULL`).
    expect(coverage.notes).toMatchObject({
      absent: false,
      limit: 2,
      limitScope: "collection",
      returned: 2,
      total: 3,
      truncated: true,
    });
    expect(axis.notes.map((note) => note.text)).toEqual(["axis note A", "axis note B"]);

    // The multi-target notes are not lost: both are retrievable under their problem.
    const problem = axis.problems.find((row) => row.id === problemId);
    expect(problem?.notes.map((note) => note.text)).toEqual([
      "crowding note two",
      "crowding note one",
    ]);
    expect(coverage.problemNotes.returned).toBe(2);
  });

  test("the topic-wide read keeps its legacy shape", async () => {
    const path = freshDatabase();
    const { topicId } = await seedWorkstream(path);

    const result = await call("get_topic", { topicId }, { path });
    expect(result.ok).toBe(true);
    // No axisId: the same topic-wide detail, all axes present, and none of the scoped fields.
    expect((result.axes as unknown[]).length).toBe(3);
    expect(result.axis).toBeUndefined();
    expect(result.coverage).toBeUndefined();
    expect(result.annotations).toBeDefined();
    // Legacy problems carry no `notes` key at all — the scoped addition does not leak into this shape.
    const axes = result.axes as Array<{ problems: Array<Record<string, unknown>> }>;
    for (const axis of axes) {
      for (const problem of axis.problems) {
        expect("notes" in problem).toBe(false);
      }
    }
  });
});
