/**
 * Offline evaluator tests (OFFLINE-IMPLEMENTATION-PROPOSAL §6, §7, §11).
 *
 * Runs the whole fixture and checks the structural result, then shows the evaluator can go red with a
 * deliberately broken candidate/oracle (a suite that cannot go red proves nothing by passing).
 *
 * The evaluator owns its scratch fixture database; there is no caller-supplied path. The CLI is tested
 * for the opposite: `--db` (and every other unknown flag) is refused with a usage error, before any file
 * is opened, so an existing database is left byte-identical and a nonexistent one is never created.
 */
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { EvaluationContractError, evaluateFixture } from "./evaluate";
import { loadCandidateInputs, loadExpectedOutcomes } from "./fixture-db";

const F_CASE_IDS = Array.from({ length: 20 }, (_, index) => `F-${index + 1}`);

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const CLI = join(REPO_ROOT, "src", "librarian", "evaluate.ts");
const SCRATCH = process.env.TMPDIR ?? "/tmp";

/** Run the evaluator CLI as a child process, the way a caller would. */
function runCli(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return { output: `${result.stdout ?? ""}${result.stderr ?? ""}`, status: result.status };
}

describe("offline evaluator — the committed fixture", () => {
  test("every structural expectation holds for F-1…F-20", async () => {
    const report = await evaluateFixture();
    expect(report.structuralPass).toBe(true);
    const ids = report.cases.map((entry) => entry.id);
    for (const id of F_CASE_IDS) {
      expect(ids).toContain(id);
    }
    for (const entry of report.cases) {
      expect(entry.failures).toEqual([]);
    }
    expect(report.semanticStatus).toBe("pending_human_review");
  });

  test("the fixture is not vacuous: it exercises refusal, abstention, instability and read failure", async () => {
    const report = await evaluateFixture();
    const byStatus = (status: string): number =>
      report.cases.filter((entry) => entry.status === status).length;
    const byOutcome = (outcome: string): number =>
      report.cases.filter((entry) => entry.outcome === outcome).length;
    expect(byStatus("refused")).toBeGreaterThanOrEqual(3);
    expect(byStatus("read_error")).toBe(1);
    expect(byStatus("write_denied")).toBe(1);
    expect(byOutcome("snapshot_unstable")).toBe(1);
    expect(byOutcome("abstained")).toBe(2);
    expect(byOutcome("insufficient_evidence")).toBe(1);
  });

  test("F-19 is structurally valid but semantically rejected, pending human review", async () => {
    const report = await evaluateFixture();
    const f19 = report.cases.find((entry) => entry.id === "F-19");
    expect(f19?.structuralPass).toBe(true);
    expect(f19?.semantic.status).toBe("pending_human_review");
    expect(f19?.semantic.verdict).toBe("reject");
  });

  test("F-16 and F-17 resolve with role topic and role problem respectively", async () => {
    const report = await evaluateFixture();
    const f16 = report.cases.find((entry) => entry.id === "F-16");
    const f17 = report.cases.find((entry) => entry.id === "F-17");
    expect(f16?.roles["annotation:FIX-ANN-TOPIC-STEER"]).toBe("topic");
    expect(f17?.roles["problem_field:FIX-PROBLEM-1:state"]).toBe("problem");
    expect(f17?.roles["state_log:FIX-SL-P4"]).toBe("problem");
  });
});

describe("offline evaluator — candidate inputs are independent of the oracle", () => {
  test("candidate-inputs.json carries no expected outcomes", () => {
    const raw = readFileSync(
      join(import.meta.dir, "fixtures", "candidate-inputs.json"),
      "utf8"
    );
    expect(raw.includes('"expect"')).toBe(false);
    const candidates = loadCandidateInputs();
    expect(candidates.cases.every((entry) => !("expect" in entry))).toBe(true);
  });

  test("the builder path never reads the oracle", () => {
    for (const name of ["assembler.ts", "references.ts"]) {
      const source = readFileSync(join(import.meta.dir, name), "utf8");
      expect(source.includes("expected-outcomes")).toBe(false);
      expect(source.includes("loadExpectedOutcomes")).toBe(false);
      expect(source.includes("fixture-db")).toBe(false);
    }
  });

  test("the oracle is loaded with every case pending human review", () => {
    const oracle = loadExpectedOutcomes();
    expect(Object.keys(oracle.cases).length).toBeGreaterThanOrEqual(20);
    for (const entry of Object.values(oracle.cases)) {
      expect(entry.semantic.status).toBe("pending_human_review");
    }
  });
});

describe("offline evaluator — fixture ownership and hard read failures", () => {
  test("a refused companion search_dashboard read is a hard contract error, never absence", async () => {
    const candidates = loadCandidateInputs();
    // The fixture's F-7 declares a companion search; break its input so the store refuses the read. The
    // evaluator must reject, not quietly record the case as having no search evidence.
    const broken = {
      ...candidates,
      cases: candidates.cases.map((entry) =>
        entry.id === "F-7"
          ? {
              ...entry,
              companionReads: [
                { action: "search_dashboard", input: { query: "" } },
              ],
            }
          : entry
      ),
    };
    await expect(
      evaluateFixture({ candidates: broken })
    ).rejects.toBeInstanceOf(EvaluationContractError);
  });

  test("an unknown --db flag is refused before an existing database is touched", () => {
    const dir = mkdtempSync(join(SCRATCH, "librarian-cli-existing-"));
    const probe = join(dir, "probe.sqlite");
    const db = new Database(probe);
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec("CREATE TABLE probe(x INTEGER)");
    db.exec("INSERT INTO probe VALUES (1)");
    db.close();

    const before = readFileSync(probe);
    const entriesBefore = readdirSync(dir).sort();

    const { status, output } = runCli([
      "--db",
      probe,
      "--out",
      join(dir, "report.json"),
    ]);

    expect(status).not.toBe(0);
    expect(output).toContain("unknown argument");
    // The database is byte-identical: a WAL switch alone would have changed it even with no rows written.
    expect(readFileSync(probe).equals(before)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(entriesBefore);
    for (const side of ["-wal", "-shm", "-journal"]) {
      expect(existsSync(`${probe}${side}`)).toBe(false);
    }
  });

  test("a nonexistent --db= target is never created", () => {
    const dir = mkdtempSync(join(SCRATCH, "librarian-cli-new-"));
    const target = join(dir, "does-not-exist.sqlite");

    const { status } = runCli([`--db=${target}`]);

    expect(status).not.toBe(0);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dir)).toEqual([]);
  });

  test("--db is refused even when paired with a valid --out", () => {
    const { status, output } = runCli([
      "--out",
      join(SCRATCH, "librarian-cli-refused-report.json"),
      "--db",
      join(SCRATCH, "nope.sqlite"),
    ]);
    expect(status).not.toBe(0);
    expect(output).toContain("unknown argument");
  });
});

describe("offline evaluator — it can go red", () => {
  test("a candidate whose citation does not resolve fails structurally", async () => {
    const candidates = loadCandidateInputs();
    const broken = {
      ...candidates,
      cases: candidates.cases.map((entry) =>
        entry.id === "F-1"
          ? {
              ...entry,
              candidate: {
                ...entry.candidate,
                evidence_refs: [{ id: "FIX-ACT-NOT-REAL", variant: "activity" }],
              },
            }
          : entry
      ),
    };
    const report = await evaluateFixture({ candidates: broken });
    expect(report.structuralPass).toBe(false);
    const f1 = report.cases.find((entry) => entry.id === "F-1");
    expect(f1?.failures.length).toBeGreaterThan(0);
  });

  test("a wrong coverage expectation fails structurally", async () => {
    const oracle = loadExpectedOutcomes();
    const mutated = {
      ...oracle,
      cases: {
        ...oracle.cases,
        "F-6": {
          ...oracle.cases["F-6"],
          coverage: { axis_notes: "COMPLETE" },
        },
      },
    };
    const report = await evaluateFixture({ oracle: mutated });
    expect(report.structuralPass).toBe(false);
    const f6 = report.cases.find((entry) => entry.id === "F-6");
    expect(f6?.failures.some((line) => line.includes("coverage"))).toBe(true);
  });
});
