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
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
