/**
 * Closed read boundary tests (DESIGN-V1 §9 M-1/M-2; OFFLINE-IMPLEMENTATION-PROPOSAL §8 F-14).
 *
 * The boundary dispatches the three approved reads through the existing `run(input, context)` and denies
 * any other action key before dispatch. The mutant red-run shows the allowlist guard is load-bearing.
 */
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { seedFixtureDatabase, temporaryDatabasePath } from "./fixture-db";
import {
  createReadBoundary,
  ReadBoundaryDeniedError,
  ReadBoundaryInputError,
  type ReadBoundaryOptions,
} from "./read-boundary";

let databasePath: string;

beforeAll(() => {
  databasePath = temporaryDatabasePath("librarian-boundary");
  seedFixtureDatabase(databasePath);
});

afterAll(() => {
  // The temp database lives under TMPDIR and is discarded by the platform's pruning.
});

function boundary(mutants?: { disableAllowlist?: boolean }) {
  return createReadBoundary({
    actor: { id: "offline-test", role: "member" },
    databasePath,
    mutants,
    orgId: "offline-evaluation",
  });
}

const WRITE_KEYS = [
  "reconcile_topic",
  "record_activity",
  "add_annotation",
  "ingest_github_activity",
  "manage_external_enrollment",
];

describe("read boundary — the closed allowlist", () => {
  test("denies every write/undeclared action key before dispatch", async () => {
    const read = boundary();
    for (const key of [...WRITE_KEYS, "get_progress", "list_topics", "nonsense"]) {
      await expect(read.read(key, {})).rejects.toBeInstanceOf(
        ReadBoundaryDeniedError
      );
    }
    // Nothing reached dispatch: no write could have been attempted.
    expect(read.stats.dispatched).toBe(0);
    expect(read.stats.denied).toBe(WRITE_KEYS.length + 3);
  });

  test("dispatches the three approved reads", async () => {
    const read = boundary();
    const overview = (await read.read("get_overview", {})) as { ok?: boolean };
    expect(overview.ok).toBe(true);
    const topic = (await read.read("get_topic", {
      topicId: "FIX-TOPIC-ALPHA",
    })) as { axes?: unknown[]; ok?: boolean };
    expect(topic.ok).toBe(true);
    expect(Array.isArray(topic.axes)).toBe(true);
    const search = (await read.read("search_dashboard", {
      limit: 1,
      query: "fixture",
    })) as { ok?: boolean; truncated?: boolean };
    expect(search.ok).toBe(true);
    expect(search.truncated).toBe(true);
    expect(read.stats.dispatched).toBe(3);
  });

  test("refuses caller input that would override execution context", async () => {
    const read = boundary();
    for (const key of [
      "databasePath",
      "actor",
      "actionKey",
      "orgId",
      "profileId",
      "host",
    ]) {
      await expect(
        read.read("get_topic", { [key]: "spoof", topicId: "FIX-TOPIC-ALPHA" })
      ).rejects.toBeInstanceOf(ReadBoundaryInputError);
    }
    expect(read.stats.dispatched).toBe(0);
  });
});

describe("read boundary — F-14 write attempt does not mutate the fixture", () => {
  test("a denied write attempt leaves every fixture row unchanged", async () => {
    const before = counts();
    const read = boundary();
    for (const key of WRITE_KEYS) {
      await expect(read.read(key, {})).rejects.toBeInstanceOf(
        ReadBoundaryDeniedError
      );
    }
    expect(counts()).toEqual(before);
  });

  function counts(): Record<string, number> {
    const db = new Database(databasePath, { readonly: true });
    try {
      const tables = [
        "topics",
        "development_axes",
        "activities",
        "annotations",
        "state_log",
      ];
      return Object.fromEntries(
        tables.map((table) => [
          table,
          (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
        ])
      );
    } finally {
      db.close();
    }
  }
});

describe("read boundary — guard-disabled mutant goes red", () => {
  test("with the allowlist disabled, a write key reaches dispatch (no denial)", async () => {
    const pristine = boundary();
    await expect(pristine.read("record_activity", {})).rejects.toBeInstanceOf(
      ReadBoundaryDeniedError
    );

    // Mutant: the allowlist check is removed, so the same call is no longer denied — the pristine
    // assertion above would fail under this guard, proving the guard is wired to the code under test.
    const mutated = boundary({ disableAllowlist: true });
    const result = (await mutated.read("record_activity", {})) as {
      ok?: boolean;
    };
    expect(result.ok).toBe(false); // reached dispatch, refused by the store rule — but never mutated
    expect(mutated.stats.denied).toBe(0);
    expect(mutated.stats.dispatched).toBe(1);
  });
});

describe("read boundary — non-plain and inherited input is refused (F2)", () => {
  test("refuses a context key inherited through a custom prototype", async () => {
    const read = boundary();
    for (const key of [
      "databasePath",
      "context",
      "sessionId",
      "orgId",
      "role",
      "profileId",
    ]) {
      const spoof = Object.create({ [key]: "spoof" });
      spoof.topicId = "FIX-TOPIC-ALPHA";
      await expect(read.read("get_topic", spoof)).rejects.toBeInstanceOf(
        ReadBoundaryInputError
      );
    }
    expect(read.stats.dispatched).toBe(0);
  });

  test("refuses every reserved context key supplied as an own key", async () => {
    const read = boundary();
    for (const key of [
      "sessionId",
      "context",
      "role",
      "actorId",
      "workspaceRoot",
      "organizationId",
      "dataDirectory",
      "apiVersion",
      "pluginId",
      "invocationId",
    ]) {
      await expect(
        read.read("get_topic", { [key]: "spoof", topicId: "FIX-TOPIC-ALPHA" })
      ).rejects.toBeInstanceOf(ReadBoundaryInputError);
    }
    expect(read.stats.dispatched).toBe(0);
  });

  test("refuses arrays, class instances and primitives", async () => {
    const read = boundary();
    class Sneaky {
      databasePath = "/prod/research.sqlite";
    }
    for (const input of [[], new Sneaky(), "topic", 7, null]) {
      await expect(
        read.read("get_topic", input as unknown as Record<string, unknown>)
      ).rejects.toBeInstanceOf(ReadBoundaryInputError);
    }
    expect(read.stats.dispatched).toBe(0);
  });

  test("refuses an accessor input key without evaluating the getter", async () => {
    let evaluated = false;
    const accessor: Record<string, unknown> = { topicId: "FIX-TOPIC-ALPHA" };
    Object.defineProperty(accessor, "query", {
      enumerable: true,
      get() {
        evaluated = true;
        return "boom";
      },
    });
    const read = boundary();
    await expect(read.read("get_topic", accessor)).rejects.toBeInstanceOf(
      ReadBoundaryInputError
    );
    expect(evaluated).toBe(false);
    expect(read.stats.dispatched).toBe(0);
  });

  test("refuses a getter behind a reserved key without evaluating it", async () => {
    let evaluated = false;
    const accessor: Record<string, unknown> = {};
    Object.defineProperty(accessor, "databasePath", {
      enumerable: true,
      get() {
        evaluated = true;
        return "/prod/research.sqlite";
      },
    });
    const read = boundary();
    await expect(read.read("get_topic", accessor)).rejects.toBeInstanceOf(
      ReadBoundaryInputError
    );
    expect(evaluated).toBe(false);
  });

  test("still dispatches plain-object input, including a null prototype", async () => {
    const read = boundary();
    const plain = (await read.read("get_topic", {
      topicId: "FIX-TOPIC-ALPHA",
    })) as { ok?: boolean };
    expect(plain.ok).toBe(true);
    const nullProto = Object.assign(Object.create(null), {
      topicId: "FIX-TOPIC-ALPHA",
    });
    const second = (await read.read("get_topic", nullProto)) as { ok?: boolean };
    expect(second.ok).toBe(true);
    expect(read.stats.dispatched).toBe(2);
  });
});

describe("read boundary — trusted options are snapshotted at construction", () => {
  function options(): ReadBoundaryOptions {
    return {
      actor: { id: "offline-test", role: "member" },
      databasePath,
      orgId: "offline-evaluation",
    };
  }

  test("pristine: mutating the options after construction cannot retarget a read or re-enable a guard-disabled seam", async () => {
    const settings = options();
    const read = createReadBoundary(settings);

    // A caller now mutates the options object and its nested actor after construction. With the
    // construction-time snapshot in place none of this reaches the read.
    (settings as { databasePath: string }).databasePath =
      "/nonexistent/does-not-exist.sqlite";
    (settings.actor as { id: string }).id = "spoofed-actor";
    (settings as { mutants?: { disableAllowlist?: boolean } }).mutants = {
      disableAllowlist: true,
    };

    // The read still targets the original fixture database...
    const topic = (await read.read("get_topic", {
      topicId: "FIX-TOPIC-ALPHA",
    })) as { ok?: boolean };
    expect(topic.ok).toBe(true);
    // ...and the closed allowlist is still enforced: the late mutant injection did not take effect.
    await expect(read.read("record_activity", {})).rejects.toBeInstanceOf(
      ReadBoundaryDeniedError
    );
    expect(read.stats.denied).toBe(1);
  });

  test("mutant: retaining live options lets a late mutant injection disable the allowlist (the pristine denial above goes red)", async () => {
    const settings = options();
    settings.mutants = { retainOptions: true };
    const read = createReadBoundary(settings);

    // The late injection now reaches the live options, so the same write key is no longer denied.
    settings.mutants = { disableAllowlist: true };
    const result = (await read.read("record_activity", {})) as { ok?: boolean };
    expect(result.ok).toBe(false); // reached dispatch (refused by the store rule), never mutated
    expect(read.stats.denied).toBe(0);
    expect(read.stats.dispatched).toBe(1);
  });
});
