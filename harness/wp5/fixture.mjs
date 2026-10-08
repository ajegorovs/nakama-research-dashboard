/**
 * wp5/fixture.mjs — isolated, throwaway store fixtures + the approved baseline seed.
 *
 * **Isolation.** The store is a Bun `bun:sqlite` database opened in a **fresh, private temporary
 * directory** under `TMPDIR` (`mkdtemp`), deleted on `dispose()` — never the retained fixture, never a
 * path inside the repo, and nothing durable survives the process. `bun:sqlite` does not honour an
 * in-memory URI through this seam (`file:…?mode=memory&cache=shared` is taken as a literal filename and
 * creates a file), so a throwaway temp store is the honest isolation: the shipped test pattern
 * (`store.test.ts` `tempPath()`/`seededPath()`), with the temp dir owned and removed by this module.
 * Migrations are applied to the same database namespace, then the `ResearchStore` opens it — so the
 * store's own single-connection seam and pragmas are exercised exactly as the shipped tests exercise them.
 *
 * **Permitted testdata.** `seedApprovedBaseline` writes the APPROVED baseline manifest
 * (`manifest.mjs`) through the product's own write path (`reconcileTopic`) — never SQL, never an
 * inference, never a write to the retained fixture. It is a *proposal being exercised*, not an
 * execution: the store it writes to is discarded when the run ends.
 */
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ResearchStore } from "../../src/store.ts";
import {
  ACTIVITIES,
  AXES,
  PERSON,
  PLAN,
  PROBLEMS,
  REPOSITORIES,
  TOPIC_NAMES,
  TOPIC_REPO_LINKS,
  gateById,
} from "./manifest.mjs";

const migrationsDir = join(import.meta.dir, "../../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

let counter = 0;

/**
 * Open an isolated store in a fresh private temp directory under `TMPDIR`. Returns `{ store, path,
 * dispose }`; `dispose()` closes both connections and removes the directory (the database file and its
 * WAL sidecars). Nothing is written inside the repository and nothing survives the process.
 */
export function openIsolatedStore(label = "wp5") {
  const root = process.env.TMPDIR || tmpdir();
  const dir = mkdtempSync(join(root, `wp5-${label}-${process.pid}-${++counter}-`));
  const path = join(dir, "store.sqlite");
  const keeper = new Database(path);
  for (const migration of MIGRATIONS) {
    keeper.exec(migration);
  }
  const store = new ResearchStore(path);
  return {
    store,
    path,
    dir,
    dispose() {
      try {
        store.close();
      } finally {
        keeper.close();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/**
 * The temp directories this harness's isolated stores live in (for the cleanup safety test). Every one is
 * created under `TMPDIR` with the `wp5-` prefix and is removed on `dispose()`; a leftover after a run is a
 * leak the cleanup assertion catches.
 */
export function listTempStoreDirs() {
  const root = process.env.TMPDIR || tmpdir();
  return readdirSync(root).filter((name) => name.startsWith("wp5-"));
}

function repoInput(fullName, relationship) {
  const repo = REPOSITORIES.find((r) => r.fullName === fullName);
  if (!repo) throw new Error(`unknown repository ${fullName}`);
  return {
    fullName: repo.fullName,
    url: repo.url,
    description: repo.description,
    defaultBranch: repo.defaultBranch,
    ...(relationship ? { relationship } : {}),
  };
}

/** The approved topic→repository link inputs for one topic (used by the idempotency/preservation checks). */
export function topicRepoLinkInputs(topicName) {
  return TOPIC_REPO_LINKS.filter((l) => l.topic === topicName).map((l) => ({
    fullName: l.fullName,
    relationship: l.relationship,
  }));
}

function personInput() {
  return { displayName: PERSON.displayName, githubLogin: PERSON.githubLogin, role: PERSON.role };
}

/**
 * Seed the approved baseline into an isolated store: one `reconcileTopic` per topic (the packet's two
 * creation transactions). Axis→repository roles are deliberately NOT written — all six are unresolved
 * (WP3 §9 D-A), so omitting them is the only honest choice; the checks surface that as BLOCKED.
 */
export function seedApprovedBaseline(store) {
  const byTopic = (topicName, predicate) =>
    predicate(AXES.filter((a) => a.topic === topicName));

  const topicRepoLinks = (topicName) =>
    TOPIC_REPO_LINKS.filter((l) => l.topic === topicName).map((l) =>
      repoInput(l.fullName, l.relationship)
    );

  const axisInput = (axis) => ({
    title: axis.title,
    kind: axis.kind,
    state: axis.state,
    // Explicit confidence — never left to the store default (`confirmed`).
    stateConfidence: axis.stateConfidence,
    ...(axis.currentState !== null
      ? {
          currentState: axis.currentState,
          currentStateConfidence: axis.currentStateConfidence,
        }
      : {}),
    ...(axis.blocker !== null
      ? { blocker: axis.blocker, blockerConfidence: axis.blockerConfidence }
      : {}),
    people: [personInput()],
  });

  const results = {};

  for (const topicName of TOPIC_NAMES) {
    const axes = AXES.filter((a) => a.topic === topicName);
    const axisNumbers = new Set(axes.map((a) => a.n));
    const activities = ACTIVITIES.filter((a) => axisNumbers.has(a.axis)).map((a) => ({
      summary: a.summary,
      sourceType: a.sourceType,
      sourceRef: a.sourceRef,
      sourceUrl: a.sourceUrl,
      occurredAt: a.occurredAt,
      axisTitle: AXES.find((x) => x.n === a.axis).title,
    }));
    const problems = PROBLEMS.filter((p) => axisNumbers.has(p.axis)).map((p) => ({
      statement: p.statement,
      state: p.state,
      stateConfidence: p.stateConfidence,
      axisTitle: AXES.find((x) => x.n === p.axis).title,
      repositoryFullNames: p.repositoryFullNames,
    }));
    const plans =
      PLAN.axis !== undefined && axisNumbers.has(PLAN.axis)
        ? [
            {
              axisTitle: AXES.find((x) => x.n === PLAN.axis).title,
              summary: PLAN.summary,
              steps: PLAN.steps.map((s) => ({ title: s.title, position: s.position })),
            },
          ]
        : [];

    results[topicName] = store.reconcileTopic({
      topicName,
      people: [personInput()],
      repositories: topicRepoLinks(topicName),
      axes: axes.map(axisInput),
      activities,
      problems,
      plans,
    });
  }

  return results;
}

/**
 * Read the store back into a normalized, serializable "view" that the pure checks consume. All values
 * come from the store's own read model (`getOverview` / `getTopicDetail`), never from the seed input —
 * so a check can only pass on what was actually stored.
 */
export function readView(store) {
  const overview = store.getOverview({ includeArchived: true, activitySinceDays: 0 });
  const topics = overview.topics.map((t) => {
    const detail = store.getTopicDetail(t.topic.id, { historyLimit: 100, notesLimit: 100 });
    return {
      id: t.topic.id,
      name: t.topic.name,
      version: t.topic.version,
      axes: detail.axes.map((axis) => ({
        id: axis.id,
        // The persistent optimistic-version number, copied verbatim so a readback can measure it: it is
        // a canonical, mutation-public value (a no-op axis reconcile bumps it) and must never be undefined.
        version: axis.version,
        title: axis.title,
        state: axis.state,
        stateConfidence: axis.stateConfidence,
        currentState: axis.currentState,
        currentStateConfidence: axis.currentStateConfidence,
        blocker: axis.blocker,
        blockerConfidence: axis.blockerConfidence,
        evidenceCount: axis.evidence.length,
        historyCount: axis.history.length,
        history: axis.history.map((a) => ({
          sourceType: a.sourceType,
          sourceRef: a.sourceRef,
          sourceUrl: a.sourceUrl,
          occurredAt: a.occurredAt,
          recordedAt: a.recordedAt,
        })),
        plan: axis.plan
          ? {
              id: axis.plan.plan.id,
              summary: axis.plan.plan.summary,
              steps: axis.plan.steps.map((s) => ({ id: s.id, title: s.title, position: s.position })),
            }
          : null,
        problems: axis.problems.map((p) => ({
          statement: p.statement,
          state: p.state,
          stateConfidence: p.stateConfidence,
          repositoryFullNames: p.repositories.map((r) => r.fullName).sort(),
        })),
        repositories: axis.repositories.map((r) => ({
          fullName: r.fullName,
          relationship: r.relationship,
        })),
        people: axis.people.map((p) => p.githubLogin),
      })),
      repositories: detail.repositories.map((r) => ({
        fullName: r.fullName,
        relationship: r.relationship,
      })),
      people: detail.people.map((p) => p.githubLogin),
      lastActivityAt: t.lastActivityAt,
      activityCount: t.activityCount,
    };
  });
  return {
    counts: overview.counts,
    topics,
    generatedAt: overview.generatedAt,
    repositories: store.listRepositories().map((r) => ({
      fullName: r.fullName,
      url: r.url,
      description: r.description,
      defaultBranch: r.defaultBranch,
    })),
  };
}

/**
 * Labels and synthetic constants for the **test-only synthetic retained-like** fixture. This store is built
 * to model the *retained fixture's measured relationship shape* — its missing D1–D6 links — as a disposable
 * throwaway, never the retained fixture itself. Everything it applies is labeled synthetic.
 */
export const RETAINED_LIKE_LABEL =
  "TEST-ONLY SYNTHETIC retained-like fixture — models the retained fixture's link shape, is not it";

/**
 * The axis→repository role the retained fixture happens to store on axes 1–4: `supporting`. It is **not an
 * approved role** (WP2 §H.1). The product enum is `{primary, supporting}` with no "undecided", so omitting
 * the field stores exactly this value — the hazard the C15 check records. Choosing `primary` is the other
 * hazard: it demotes any current axis-level primary (`linkRepository`).
 */
export const SYNTHETIC_ROLE = "supporting";

function findAxis(store, title) {
  for (const name of TOPIC_NAMES) {
    const topic = store.getTopicByName(name);
    if (!topic) continue;
    const axis = store.listAxes(topic.id).find((a) => a.title === title);
    if (axis) return axis;
  }
  return null;
}

/**
 * Seed a **disposable retained-like** store: the approved content, but with the retained fixture's measured
 * link shape — axes 5/6 carry **no** axis→repo or axis→person link (D1–D4 absent), the two consultation
 * problems carry **no** repository (D5/D6 absent), axes 1–4 carry the retained `supporting` axis→repo links,
 * axis-4 carries the ratified `inferred` blockerConfidence, and the AGENDA event sits on axis 3 (F03).
 * Test-only synthetic: this is permitted testdata in a throwaway temp store, never the retained fixture.
 */
export function seedRetainedLike(store) {
  const axisInput = (axis) => ({
    title: axis.title,
    kind: axis.kind,
    state: axis.state,
    stateConfidence: axis.stateConfidence,
    ...(axis.currentState !== null
      ? { currentState: axis.currentState, currentStateConfidence: axis.currentStateConfidence }
      : {}),
    ...(axis.blocker !== null
      ? {
          blocker: axis.blocker,
          // The retained fixture's ratified value on axis 4 is `inferred`, not the packet's `confirmed`.
          blockerConfidence: axis.n === 4 ? "inferred" : axis.blockerConfidence,
        }
      : {}),
    // Retained person shape: only axes 1–4 (D3/D4 absent on axes 5/6).
    ...(axis.n <= 4 ? { people: [personInput()] } : {}),
  });

  // Retained placement: the AGENDA event sits on the sibling high-rate axis (3), not axis 4 (F03).
  const retainedActivities = ACTIVITIES.map((a) => (a.sourceRef === "docs/AGENDA.md" ? { ...a, axis: 3 } : a));

  const results = {};
  for (const topicName of TOPIC_NAMES) {
    const axes = AXES.filter((a) => a.topic === topicName);
    const axisNumbers = new Set(axes.map((a) => a.n));
    const activities = retainedActivities
      .filter((a) => axisNumbers.has(a.axis))
      .map((a) => ({
        summary: a.summary,
        sourceType: a.sourceType,
        sourceRef: a.sourceRef,
        sourceUrl: a.sourceUrl,
        occurredAt: a.occurredAt,
        axisTitle: AXES.find((x) => x.n === a.axis).title,
      }));
    const problems = PROBLEMS.filter((p) => axisNumbers.has(p.axis)).map((p) => ({
      statement: p.statement,
      state: p.state,
      stateConfidence: p.stateConfidence,
      axisTitle: AXES.find((x) => x.n === p.axis).title,
      // The two consultation problems (axis 6) have no repository in the retained fixture (D5/D6 absent);
      // the diagnostics problem keeps its Grablink link.
      repositoryFullNames: p.axis === 6 ? [] : p.repositoryFullNames,
    }));
    const plans =
      PLAN.axis !== undefined && axisNumbers.has(PLAN.axis)
        ? [
            {
              axisTitle: AXES.find((x) => x.n === PLAN.axis).title,
              summary: PLAN.summary,
              steps: PLAN.steps.map((s) => ({ title: s.title, position: s.position })),
            },
          ]
        : [];

    results[topicName] = store.reconcileTopic({
      topicName,
      people: [personInput()],
      repositories: TOPIC_REPO_LINKS.filter((l) => l.topic === topicName).map((l) =>
        repoInput(l.fullName, l.relationship)
      ),
      axes: axes.map(axisInput),
      activities,
      problems,
      plans,
    });
  }

  // The retained fixture's axes 1–4 carry `supporting` axis→repo links; apply them directly (synthetic,
  // test-only). Axes 5/6 stay missing so the real D1/D2 delta has somewhere to land.
  for (const def of AXES.filter((a) => a.n <= 4)) {
    const axis = findAxis(store, def.title);
    const repo = store.getRepositoryByFullName(def.repo);
    if (axis && repo) store.linkAxisRepository(axis.id, repo.id, SYNTHETIC_ROLE);
  }
  return results;
}

/** Add one test-only synthetic activity on axis 4 so an optional `confirmed` restoration can be backed. */
export function addAxis4Evidence(store) {
  const def = AXES.find((x) => x.n === 4);
  return store.reconcileTopic({
    topicName: def.topic,
    activities: [
      {
        summary: "test-only synthetic axis-4 evidence (for the optional blocker restoration case).",
        sourceType: "repo_document",
        sourceRef: "test-only://axis-4-evidence",
        axisTitle: def.title,
      },
    ],
  });
}

/**
 * Apply the **test-only synthetic** gate decisions to a freshly seeded baseline store, producing the
 * *amendment view* the gate checks verify against. Only G01/G02/G03 change stored state; G04 ("leave") and
 * G05 (proposed target, no authorization) write nothing. Never call this to represent an approved
 * amendment — it is test-only.
 */
export function applyTestOnlyAmendment(store, gates) {
  const value = (id) => {
    const gate = gateById(gates, id);
    return gate && gate.resolved ? gate.value : null;
  };

  // G01 — synthetic axis→repository roles.
  const roles = value("G01");
  if (roles) {
    for (const def of AXES) {
      const axis = findAxis(store, def.title);
      const role = roles[def.title];
      const repo = store.getRepositoryByFullName(def.repo);
      if (axis && repo && role) store.linkAxisRepository(axis.id, repo.id, role);
    }
  }

  // G02 — synthetic F08 wording + confidence.
  const f08 = value("G02");
  if (f08) {
    const def = AXES.find((x) => x.n === 4);
    const axis = findAxis(store, def.title);
    store.reconcileTopic({
      topicName: def.topic,
      axes: [
        {
          id: axis.id,
          expectedVersion: axis.version,
          currentState: f08.currentState,
          currentStateConfidence: f08.confidence,
        },
      ],
    });
  }

  // G03 — optional blocker restoration. "skip"/"inferred" writes nothing; "restore"/"confirmed" sets the
  // value, which the store grades against the axis's evidence by transaction end (it throws if unbacked).
  const g03 = value("G03");
  const decision = typeof g03 === "string" ? g03 : g03?.decision;
  if (decision === "restore" || decision === "confirmed") {
    const def = AXES.find((x) => x.n === 4);
    const axis = findAxis(store, def.title);
    store.reconcileTopic({
      topicName: def.topic,
      axes: [{ id: axis.id, expectedVersion: axis.version, blockerConfidence: "confirmed" }],
    });
  }
}
