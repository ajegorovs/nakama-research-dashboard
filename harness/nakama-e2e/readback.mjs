/**
 * Read the seeded topics back through `get_topic` and validate the **returned projection** against the
 * semantic conditions each N-case needs — never byte-equality with the offline FIX-* rows (the live org
 * has its own ids, and the point is that the semantics survive, not that the bytes match).
 *
 * Authorship is validated from the host's own projection, not assumed. The store derives an annotation's
 * `authorType`/`authorId` from the acting session (`src/store.ts:5604-5608`, `:5633`); for the authenticated
 * human fixture session that means `authorType === "human"` and `authorId === <the id /v1/auth/me returned>`.
 * A returned note whose author is missing, `null`, empty or a different id is a **failure** — "two notes
 * that share some undefined author" must not be read as the same human disagreeing with themself.
 *
 * This is the "validate seeded data through actual plugin reads before any model turn" half of the
 * accepted slice. It is offline-testable: pass a fake client and a projection and assert the check fires.
 */
import { effectiveNoteText } from "./artifact.mjs";

export class ReadbackError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReadbackError";
  }
}

/** Resolve a sourceId to its live id, refusing (not returning null) when the mapping is incomplete. */
export function liveId(mapping, kind, sourceId) {
  const id = mapping?.[kind]?.[sourceId];
  if (!id) throw new ReadbackError(`mapping has no live ${kind} id for ${sourceId}`);
  return id;
}

/**
 * The semantic expectation for each N-case, in terms of the artifact's own facts.
 *
 * `requireHumanAuthor` / `requireSameHumanAuthor` pin the authorship condition; `includeVariantText` /
 * `includeClaimTexts` require the **actual claim text** to be present (not merely a row id); `notesAtCap`
 * encodes the N-4/N-5 coverage limitation: a note list sitting at the requested cap means the axis-note
 * coverage is UNKNOWN, so a missing note must not be read as "does not exist".
 */
export const CASE_EXPECTATIONS = {
  "N-1": { axis: "FIX-AXIS-CLEAN", state: "active" },
  "N-2": {
    axis: "FIX-AXIS-CONTESTED", state: "blocked", blocker: "waiting on a synthetic fixture slot",
    includeVariantText: ["F-2-conflict"], requireHumanAuthor: true,
  },
  "N-3": {
    axis: "FIX-AXIS-DISPUTED",
    includeClaimTexts: ["FIX-ANN-DISPUTE-1", "FIX-ANN-DISPUTE-2"],
    requireSameHumanAuthor: true,
  },
  "N-4": {
    axis: "FIX-AXIS-PROBLEM", state: "blocked", blocker: "a synthetic problem blocks this",
    excludeAnnotations: ["FIX-ANN-PROBLEM-STEER"],
  },
  "N-5": {
    axis: "FIX-AXIS-GUARDED", notesLimit: 2, notesAtCap: true,
    includeVariantText: ["F-18-inj"], requireHumanAuthor: true,
  },
};

/** Read one topic's projection by its live id, failing closed on a non-ok result. */
export async function readTopicProjection({ client, topicId, notesLimit, historyLimit }) {
  const input = { topicId };
  if (notesLimit !== undefined) input.notesLimit = notesLimit;
  if (historyLimit !== undefined) input.historyLimit = historyLimit;
  const response = await client.action("get_topic", input);
  if (response.status !== 200 || response.result?.ok !== true) {
    throw new ReadbackError(`get_topic(${topicId}) refused: HTTP ${response.status}`);
  }
  return response.result;
}

function noteTexts(axis) {
  return (axis.notes ?? []).map((n) => ({
    id: n.id, text: n.text, authorId: n.authorId, authorType: n.authorType, kind: n.kind,
  }));
}

/** The artifact's own annotation record for a sourceId (any topic/axis), or null. */
function findAnnotation(artifact, sourceId) {
  for (const topic of artifact.topics ?? []) {
    for (const a of topic.annotations ?? []) if (a.sourceId === sourceId) return a;
    for (const axis of topic.axes ?? []) {
      for (const a of axis.annotations ?? []) if (a.sourceId === sourceId) return a;
    }
  }
  return null;
}

/** Fail unless a returned note is a host-derived claim by the exact authenticated actor. */
function requireHumanAuthor(note, label, { failures, expectedActorId }) {
  if (note.authorType !== "human") {
    failures.push(`${label} is authored by "${note.authorType ?? "(missing)"}", not a human`);
  }
  if (!expectedActorId) {
    failures.push(`no authenticated actor id was supplied, so authorship of ${label} cannot be validated`);
  } else if (note.authorId !== expectedActorId) {
    failures.push(`${label} is authored by ${note.authorId ?? "(none)"}, not the authenticated actor ${expectedActorId}`);
  }
}

/**
 * Validate a live projection against a case expectation. Returns `{ ok, failures }`.
 * `mapping` resolves sourceId -> live id; `artifact` supplies the note texts; `expectedActorId` is the id
 * `/v1/auth/me` returned for the seeding session.
 */
export function validateProjection(projection, expectation, { artifact, mapping, expectedActorId, activeVariants } = {}) {
  const failures = [];
  const variants = activeVariants ?? artifact.defaultVariants;
  const axisId = liveId(mapping, "axes", expectation.axis);
  const axis = (projection.axes ?? []).find((a) => a.id === axisId);
  if (!axis) {
    return { ok: false, failures: [`axis ${expectation.axis} (live ${axisId}) not returned by get_topic`] };
  }
  if (expectation.state && axis.state !== expectation.state) {
    failures.push(`axis state ${axis.state} != expected ${expectation.state}`);
  }
  if (expectation.blocker && axis.blocker !== expectation.blocker) {
    failures.push(`axis blocker "${axis.blocker}" != expected "${expectation.blocker}"`);
  }
  const notes = noteTexts(axis);

  for (const variantId of expectation.includeVariantText ?? []) {
    const variant = (artifact.variants ?? {})[variantId];
    const expected = effectiveNoteText(artifact, { sourceId: variant.replacesNote, text: "" }, variants);
    const note = notes.find((n) => n.text === expected);
    if (!note) {
      failures.push(`no returned note carries the ${variantId} text`);
    } else if (expectation.requireHumanAuthor) {
      requireHumanAuthor(note, `the ${variantId} note`, { failures, expectedActorId });
    }
  }

  const claimNotes = [];
  for (const sourceId of expectation.includeClaimTexts ?? []) {
    const annotation = findAnnotation(artifact, sourceId);
    const expected = annotation ? effectiveNoteText(artifact, annotation, variants) : null;
    const note = expected === null ? undefined : notes.find((n) => n.text === expected);
    if (!note) {
      failures.push(`no returned note carries the ${sourceId} text`);
      continue;
    }
    claimNotes.push({ sourceId, note });
    if (expectation.requireSameHumanAuthor) {
      requireHumanAuthor(note, sourceId, { failures, expectedActorId });
    }
  }
  if (expectation.requireSameHumanAuthor) {
    if (claimNotes.length !== (expectation.includeClaimTexts ?? []).length) {
      failures.push("one of the disagreeing claim texts was not returned");
    } else {
      const authors = new Set(claimNotes.map(({ note }) => `${note.authorType}:${note.authorId}`));
      if (authors.size !== 1) failures.push(`the disagreeing claims are not attributed to one author: ${[...authors].join(", ")}`);
    }
  }

  for (const excludedSourceId of expectation.excludeAnnotations ?? []) {
    const live = mapping.annotations?.[excludedSourceId];
    const annotation = findAnnotation(artifact, excludedSourceId);
    const excludedText = annotation ? effectiveNoteText(artifact, annotation, variants) : null;
    if ((live && notes.some((n) => n.id === live)) || (excludedText && notes.some((n) => n.text === excludedText))) {
      failures.push(`${excludedSourceId} must not be returned by get_topic but was`);
    }
  }

  if (expectation.notesAtCap === true) {
    const limit = expectation.notesLimit;
    if (notes.length !== limit) {
      failures.push(`expected notes at cap ${limit}, got ${notes.length}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

/** Run every case's readback for the topics its axis belongs to. Returns per-case results. */
export async function readbackAllCases({ client, artifact, mapping, expectedActorId, activeVariants, cases = Object.keys(CASE_EXPECTATIONS) }) {
  const results = {};
  for (const caseId of cases) {
    const expectation = CASE_EXPECTATIONS[caseId];
    const axisSourceId = expectation.axis;
    const topic = artifact.topics.find((t) => t.axes.some((a) => a.sourceId === axisSourceId));
    const topicId = liveId(mapping, "topics", topic.sourceId);
    const projection = await readTopicProjection({
      client, topicId, notesLimit: expectation.notesLimit, historyLimit: 25,
    });
    results[caseId] = { projection, ...validateProjection(projection, expectation, { artifact, mapping, expectedActorId, activeVariants }) };
  }
  return results;
}
