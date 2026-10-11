/**
 * S1 — `taskPage`'s per-row enrichment must run inside the page's own read snapshot.
 *
 * The review finding (S1): `taskPage` called `problemPageCore` (which ends its SQLite `snapshot`) and only
 * *then* mapped the returned rows through `problemDetailOf`, so the row/count membership was
 * snapshot-consistent but the per-row plan/step/repository/people enrichment was not — it could read rows
 * written after the count was taken. The correction wraps the whole read in one reentrant `snapshot`.
 *
 * The probe spies on the private `problemDetailOf` and records the store's read-transaction depth
 * (`readDepth`) at each call. The corrected `taskPage` must perform every enrichment read with the
 * snapshot open (depth >= 1). The negative control reproduces the *pre-fix* shape — mapping rows through
 * `problemDetailOf` with no outer snapshot — and shows the same probe reads depth 0, so the assertion is
 * not vacuous: it can tell a snapshotted enrichment from an unsnapshotted one.
 *
 * Built from the shipped migrations 001–006, so the test runs against the schema the host applies.
 */
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ResearchStore } from "./store";

const migrationsDir = join(import.meta.dir, "../migrations");
const MIGRATIONS = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
  "006-task-plan-text.sql",
].map((name) => readFileSync(join(migrationsDir, name), "utf8"));

function openStore(): ResearchStore {
  const path = `${process.env.TMPDIR ?? "/tmp"}/taskpage-snapshot-${crypto.randomUUID()}.sqlite`;
  const db = new Database(path);
  try {
    for (const migration of MIGRATIONS) {
      db.exec(migration);
    }
  } finally {
    db.close();
  }
  return new ResearchStore(path);
}

/** A topic with one active axis and `count` tasks, so a page has rows to enrich. */
function seed(count = 3) {
  const store = openStore();
  const topic = store.createTopic({ name: "Snapshot topic" });
  const axis = store.createAxis({
    branch: "b/snapshot",
    kind: "experiment",
    state: "active",
    title: "Snapshot axis",
    topicId: topic.id,
  });
  for (let i = 0; i < count; i += 1) {
    store.createProblem({
      axisId: axis.id,
      authorType: "human",
      statement: `task ${i}`,
    });
  }
  return { axis, store };
}

/**
 * The private `problemDetailOf` method and the private `readDepth` field, reached at runtime (TypeScript
 * `private` is compile-time only — both are ordinary JavaScript properties). The spy records the depth at
 * each enrichment call.
 */
type Probed = {
  problemDetailOf: (problem: unknown) => unknown;
  readDepth: number;
};

function withDepthProbe(run: () => void): number[] {
  const proto = ResearchStore.prototype as unknown as Probed;
  const original = proto.problemDetailOf;
  const seen: number[] = [];
  proto.problemDetailOf = function (this: Probed, problem: unknown) {
    seen.push(this.readDepth);
    return original.call(this, problem);
  };
  try {
    run();
  } finally {
    proto.problemDetailOf = original;
  }
  return seen;
}

describe("S1 — taskPage enrichment joins the page's snapshot", () => {
  test("every per-row enrichment read happens with the read snapshot open (readDepth >= 1)", () => {
    const { axis, store } = seed(3);

    const seen = withDepthProbe(() => {
      const page = store.taskPage({ axisId: axis.id }, { limit: 50 });
      expect(page.items).toHaveLength(3);
      expect(page.total).toBe(3);
    });

    // The enrichment ran, once per returned row, and never outside a snapshot.
    expect(seen.length).toBe(3);
    expect(seen.every((depth) => depth >= 1)).toBe(true);
  });

  test("negative control: the same probe reads depth 0 when enrichment runs with no outer snapshot", () => {
    const { axis, store } = seed(3);
    // The pre-fix shape: the page read has already ended its snapshot, and enrichment is mapped after.
    const page = store.problemPage({ axisId: axis.id }, { limit: 50 });
    expect(page.items).toHaveLength(3);

    const seen = withDepthProbe(() => {
      for (const row of page.items) {
        (store as unknown as Probed).problemDetailOf(row);
      }
    });

    // No snapshot is open at the commit point, so the probe distinguishes the two shapes.
    expect(seen.length).toBe(3);
    expect(seen.every((depth) => depth === 0)).toBe(true);
  });
});
