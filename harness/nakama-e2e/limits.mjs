/**
 * Traced input limits for the research-dashboard plugin actions the Nakama E2E harness drives.
 *
 * This file is the harness's own copy of the **host-declared** input contract, transcribed from
 * `nakama.plugin.json` (the schema the host validates before any action runs). It exists so the seeder
 * can refuse an out-of-contract payload *before* it is sent, and so an offline test can prove that
 * refusal. It is a bound check, not a substitute for the host's validation: the host still validates.
 *
 * Source anchors (read at implementation time):
 *   - reconcile_topic  nakama.plugin.json:122-639   (the single write path)
 *   - get_topic        nakama.plugin.json:46-90     (read options: axisId scoping, notesLimit/historyLimit 1..100)
 *   - record_activity  nakama.plugin.json:648-709
 *   - actions.ts:67-131  (host-side re-checks: optionalText/requiredText/optionalInt/optionalEnum)
 *   - actions.ts:155-165 (topicName <= 120), :185-193 (axisTitle <= 160)
 *   - store.ts:968-1068  (ReconcileTopicInput shape the store accepts)
 *
 * `additionalProperties: false` is modelled too: an unknown key is refused, so a payload can never smuggle
 * a context key (`actor`, `databasePath`, …) past the schema — matching read-boundary.ts's RESERVED set.
 */

/** @typedef {{ kind: string, [k: string]: unknown }} Schema */

const S = {
  string: (max, min = 0) => ({ kind: "string", max, min }),
  int: (min, max) => ({ kind: "int", min, max }),
  intMin: (min) => ({ kind: "int", min }),
  enum: (values) => ({ kind: "enum", values }),
  array: (maxItems, items) => ({ kind: "array", maxItems, items }),
  object: (properties, required = []) => ({ kind: "object", properties, required }),
  nullableString: (max) => ({ kind: "nullable-string", max }),
};

/** nakama.plugin.json — reconcile_topic.inputSchema (transcribed). */
export const RECONCILE_TOPIC_SCHEMA = S.object({
  topicId: S.string(100, 1),
  topicName: S.string(120, 1),
  expectedVersion: S.intMin(1),
  topic: S.object({
    name: S.string(120, 1),
    description: S.string(4000),
    status: S.enum(["active", "paused", "completed", "archived"]),
    summary: S.string(4000),
  }),
  repositories: S.array(20, S.object({
    fullName: S.string(200, 1),
    url: S.string(500),
    description: S.string(1000),
    defaultBranch: S.string(120),
    relationship: S.enum(["primary", "supporting"]),
  }, ["fullName"])),
  people: S.array(20, S.object({
    displayName: S.string(120, 1),
    role: S.string(80),
    githubLogin: S.string(100),
    nakamaUserId: S.string(100, 1),
  }, ["displayName"])),
  axes: S.array(20, S.object({
    id: S.string(100, 1),
    title: S.string(160, 1),
    description: S.string(2000),
    kind: S.enum(["feature", "experiment", "test", "investigation", "maintenance"]),
    state: S.enum(["active", "usable", "draft", "blocked", "parked", "completed", "abandoned"]),
    branch: S.string(200),
    prNumber: S.intMin(1),
    prUrl: S.string(500),
    currentState: S.string(2000),
    blocker: S.string(1000),
    stateConfidence: S.enum(["confirmed", "inferred", "uncertain"]),
    currentStateConfidence: S.enum(["confirmed", "inferred", "uncertain"]),
    blockerConfidence: S.enum(["confirmed", "inferred", "uncertain"]),
    expectedVersion: S.intMin(1),
    repositories: S.array(10, S.object({
      fullName: S.string(200, 1), url: S.string(500), description: S.string(1000),
      defaultBranch: S.string(120), relationship: S.enum(["primary", "supporting"]),
    }, ["fullName"])),
    people: S.array(10, S.object({
      displayName: S.string(120, 1), role: S.string(80), githubLogin: S.string(100),
      nakamaUserId: S.string(100, 1),
    }, ["displayName"])),
  })),
  activities: S.array(50, S.object({
    summary: S.string(1000, 1),
    sourceType: S.enum(["manual", "github_pr", "github_commit", "github_issue", "repo_document",
      "group_chat", "experiment", "agent_review"]),
    sourceRef: S.string(200),
    sourceUrl: S.string(500),
    occurredAt: S.string(40),
    axisId: S.string(100, 1),
    axisTitle: S.string(160, 1),
    repositoryFullName: S.string(200, 1),
    problemId: S.string(100, 1),
  }, ["summary"])),
  annotations: S.array(20, S.object({
    text: S.string(2000, 1),
    axisId: S.string(100, 1),
    axisTitle: S.string(160, 1),
    kind: S.enum(["note", "interpretation", "steering"]),
    confidence: S.enum(["confirmed", "inferred", "uncertain"]),
    problemId: S.string(100, 1),
  }, ["text"])),
  problems: S.array(25, S.object({
    problemId: S.string(100, 1),
    statement: S.string(2000, 1),
    axisId: S.string(100, 1),
    axisTitle: S.string(160, 1),
    state: S.enum(["open", "resolved"]),
    stateConfidence: S.enum(["confirmed", "inferred", "uncertain"]),
    planStepId: S.nullableString(100),
    repositoryFullNames: S.array(20, S.string(200, 1)),
    personIds: S.array(50, S.string(100, 1)),
  }, ["statement"])),
  plans: S.array(10, S.object({
    planId: S.string(100, 1),
    axisId: S.string(100, 1),
    axisTitle: S.string(160, 1),
    summary: S.string(2000, 1),
    steps: S.array(50, S.object({
      stepId: S.string(100, 1),
      title: S.string(300, 1),
      position: S.int(0, Number.MAX_SAFE_INTEGER),
      state: S.enum(["pending", "active", "done", "blocked"]),
    }, ["title"])),
  }, ["summary"])),
  transitions: S.array(25, S.object({
    subject: S.enum(["axis", "problem"]),
    axisId: S.string(100, 1),
    axisTitle: S.string(160, 1),
    problemId: S.string(100, 1),
    toState: S.string(40, 1),
    observedAt: S.string(40),
    expectedVersion: S.intMin(1),
    blocker: S.string(500),
  }, ["subject", "toState"])),
});

/** nakama.plugin.json — get_topic.inputSchema (read options). */
export const GET_TOPIC_SCHEMA = S.object({
  topicId: S.string(100, 1),
  topicName: S.string(120, 1),
  axisId: S.string(100, 1),
  activityLimit: S.int(1, 100),
  activitySinceDays: S.int(1, 365),
  historyLimit: S.int(1, 100),
  notesLimit: S.int(1, 100),
  includeAnnotations: { kind: "boolean" },
});

/** nakama.plugin.json — record_activity.inputSchema. */
export const RECORD_ACTIVITY_SCHEMA = S.object({
  topicId: S.string(100, 1),
  topicName: S.string(120, 1),
  axisId: S.string(100, 1),
  axisTitle: S.string(160, 1),
  summary: S.string(1000, 1),
  sourceType: S.enum(["manual", "github_pr", "github_commit", "github_issue", "repo_document",
    "group_chat", "experiment", "agent_review"]),
  sourceRef: S.string(200),
  sourceUrl: S.string(500),
  occurredAt: S.string(40),
  repositoryFullName: S.string(200, 1),
});

/** The action keys the harness may send. Read keys and write keys are kept distinct on purpose. */
export const READ_ACTIONS = ["get_overview", "get_topic", "search_dashboard"];
export const WRITE_ACTIONS = ["reconcile_topic", "record_activity"];

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Recursively validate `value` against `schema`. Returns an array of human-readable error strings
 * (empty means valid). Unknown object keys are errors (`additionalProperties: false`).
 */
export function validate(value, schema, path = "$") {
  const errors = [];
  switch (schema.kind) {
    case "string": {
      if (typeof value !== "string") return [`${path}: expected string, got ${typeName(value)}`];
      if (value.length < schema.min) errors.push(`${path}: shorter than ${schema.min}`);
      if (value.length > schema.max) errors.push(`${path}: longer than ${schema.max}`);
      return errors;
    }
    case "nullable-string": {
      if (value === null) return [];
      if (typeof value !== "string") return [`${path}: expected string|null, got ${typeName(value)}`];
      if (value.length > schema.max) errors.push(`${path}: longer than ${schema.max}`);
      return errors;
    }
    case "int": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return [`${path}: expected integer, got ${typeName(value)}`];
      }
      if (value < schema.min) errors.push(`${path}: below ${schema.min}`);
      if (schema.max !== undefined && value > schema.max) errors.push(`${path}: above ${schema.max}`);
      return errors;
    }
    case "boolean":
      return typeof value === "boolean" ? [] : [`${path}: expected boolean, got ${typeName(value)}`];
    case "enum":
      return schema.values.includes(value) ? []
        : [`${path}: "${String(value)}" is not one of ${schema.values.join(", ")}`];
    case "array": {
      if (!Array.isArray(value)) return [`${path}: expected array, got ${typeName(value)}`];
      if (value.length > schema.maxItems) errors.push(`${path}: more than ${schema.maxItems} items`);
      value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
      return errors;
    }
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${path}: expected object, got ${typeName(value)}`];
      }
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push(`${path}.${key}: unknown key`);
        }
      }
      for (const req of schema.required ?? []) {
        if (!Object.prototype.hasOwnProperty.call(value, req)) errors.push(`${path}.${req}: required`);
      }
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(...validate(value[key], sub, `${path}.${key}`));
        }
      }
      return errors;
    }
    default:
      return [`${path}: unknown schema kind ${schema.kind}`];
  }
}

/** Validate a reconcile_topic payload. `{ ok, errors }`. Fails closed: any error means refuse. */
export function validateReconcileInput(input) {
  const errors = validate(input, RECONCILE_TOPIC_SCHEMA, "reconcile_topic");
  return { ok: errors.length === 0, errors };
}

/** Validate get_topic read options. */
export function validateGetTopicInput(input) {
  const errors = validate(input, GET_TOPIC_SCHEMA, "get_topic");
  return { ok: errors.length === 0, errors };
}

/** Validate record_activity input. */
export function validateRecordActivityInput(input) {
  const errors = validate(input, RECORD_ACTIVITY_SCHEMA, "record_activity");
  return { ok: errors.length === 0, errors };
}

/** A short, bounded human summary of the traced reconcile write limit. Used by docs and tests. */
export function describeReconcileLimits() {
  const s = RECONCILE_TOPIC_SCHEMA.properties;
  return {
    topicName: s.topicName.max,
    axesPerCall: s.axes.maxItems,
    activitiesPerCall: s.activities.maxItems,
    annotationsPerCall: s.annotations.maxItems,
    problemsPerCall: s.problems.maxItems,
    annotationText: s.annotations.items.properties.text.max,
  };
}
