/**
 * Offline contract evaluator (OFFLINE-IMPLEMENTATION-PROPOSAL §6, §7a).
 *
 * Replays the synthetic fixture through the read boundary and the assembler, and compares the **structural**
 * result against the oracle **after** assembly. The builder/assembler path never reads the oracle: candidate
 * inputs are loaded first, every case is assembled, and only then is `expected-outcomes.json` opened to
 * compare.
 *
 * This is a **deterministic contract evaluator**, the whole of the offline slice. It certifies structure — a
 * green run says nothing about semantic usefulness, and it cannot catch an undeclared conflict. The semantic
 * evaluation is a separate, human-reviewed procedure (`semantic.status: pending_human_review` everywhere).
 *
 * Run: `bun run librarian:evaluate` (exit 0 iff every structural expectation holds). The command accepts
 * only `--out <report.json>`; every other flag — `--db` included — is refused with a usage error **before**
 * any file is opened or seeded. The fixture database is always a scratch file this module creates, seeds
 * and removes itself: there is no seam by which a caller can point the evaluator at an arbitrary or
 * production database.
 */
import { rmSync, writeFileSync } from "node:fs";
import {
  assertProposalShape,
  assembleWithSnapshotDriver,
  buildObservation,
  computeCoverage,
  type EvaluationResult,
  type Observation,
} from "./assembler";
import {
  fixtureFileDigests,
  loadCandidateInputs,
  loadExpectedOutcomes,
  seedFixtureDatabase,
  temporaryDatabasePath,
  type CandidateInputs,
  type ExpectedOutcome,
  type ExpectedOutcomes,
  type SuppliedCase,
} from "./fixture-db";
import {
  createReadBoundary,
  isReadFailure,
  ReadBoundaryDeniedError,
} from "./read-boundary";

export type CaseOutcome = {
  id: string;
  description: string;
  status: "proposal" | "refused" | "read_error" | "write_denied";
  outcome: string | null;
  reason: string | null;
  reads: number;
  digests: string[];
  provenance: string | null;
  citedSupport: string[];
  roles: Record<string, string>;
  coverage: Record<string, string> | null;
  structuralPass: boolean;
  failures: string[];
  semantic: { status: string; verdict: string | null; note: string | null };
  error: string | null;
};

export type EvaluationReport = {
  datasetId: string;
  generatedAt: string;
  fixtureDigests: Record<string, string>;
  cases: CaseOutcome[];
  structuralPass: boolean;
  semanticStatus: "pending_human_review";
  boundaryStats: { denied: number; dispatched: number };
};

const DRIFT = {
  drift1: "2026-09-29T00:00:00.000Z",
  drift2: "2026-09-30T00:00:00.000Z",
} as const;

type MutableDetail = {
  topic?: { updatedAt?: string };
  axes?: Array<{ updatedAt?: string }>;
};

/** A labelled, synthetic content change applied to the RETURNED projection between reads (F-9/F-10). */
function applyDrift(raw: unknown, mode: string): unknown {
  const drift = DRIFT[mode as keyof typeof DRIFT];
  if (!drift || typeof raw !== "object" || raw === null) {
    return raw;
  }
  const detail = raw as MutableDetail;
  if (detail.topic) {
    detail.topic.updatedAt = drift;
  }
  for (const axis of detail.axes ?? []) {
    axis.updatedAt = drift;
  }
  return raw;
}

function coverageMap(observation: Observation | null): Record<string, string> | null {
  if (!observation) {
    return null;
  }
  return Object.fromEntries(
    computeCoverage(observation).map((entry) => [entry.source, entry.status])
  );
}

function compareCase(
  id: string,
  description: string,
  result: EvaluationResult | null,
  writeFailures: string[],
  coverage: Record<string, string> | null,
  oracle: ExpectedOutcome
): CaseOutcome {
  const expect = oracle.expect;
  const failures: string[] = [];
  const proposal = result?.proposal ?? null;
  const status: CaseOutcome["status"] = result ? result.status : "write_denied";

  if (result) {
    if (result.status !== expect.status) {
      failures.push(`status ${result.status} != expected ${expect.status}`);
    }
    if (typeof expect.reads === "number" && result.reads !== expect.reads) {
      failures.push(`reads ${result.reads} != expected ${expect.reads}`);
    }
    if (proposal) {
      try {
        assertProposalShape(proposal);
      } catch (error) {
        failures.push(`shape: ${(error as Error).message}`);
      }
      if (expect.outcome && proposal.outcome !== expect.outcome) {
        failures.push(`outcome ${proposal.outcome} != expected ${expect.outcome}`);
      }
      if (expect.noText && "text" in proposal) {
        failures.push("text present on a non-text outcome");
      }
      if (expect.conflictReasons) {
        const actual = proposal.conflicts.map((conflict) => conflict.reason).sort();
        const wanted = [...expect.conflictReasons].sort();
        if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
          failures.push(`conflict reasons ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
        }
      }
      if (expect.digestSource) {
        const index = { A: 0, B: 1, C: 2 }[expect.digestSource];
        if (proposal.basis.digest !== result.digests[index]) {
          failures.push(`basis digest != digest ${expect.digestSource}`);
        }
      }
      if (expect.provenance && proposal.provenance !== expect.provenance) {
        failures.push(`provenance "${proposal.provenance}" != "${expect.provenance}"`);
      }
      if (oracle.citedSupport) {
        const actual = proposal.evidence_refs.map((ref) => ref.identity).sort();
        const wanted = [...oracle.citedSupport].sort();
        if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
          failures.push(`citedSupport ${JSON.stringify(actual)} != ${JSON.stringify(wanted)}`);
        }
      }
      for (const [identity, role] of Object.entries(oracle.roles ?? {})) {
        const ref = proposal.evidence_refs.find((entry) => entry.identity === identity);
        if (!ref) {
          failures.push(`missing cited ref ${identity}`);
        } else if (ref.role !== role) {
          failures.push(`role for ${identity} is ${ref.role}, expected ${role}`);
        }
      }
    } else if (result.status === "refused" && expect.reason) {
      if (result.error?.reason !== expect.reason) {
        failures.push(`refusal reason ${result.error?.reason} != expected ${expect.reason}`);
      }
    }
  }

  failures.push(...writeFailures);
  if (oracle.coverage) {
    if (!coverage) {
      failures.push("coverage expectation present but no observation was available");
    } else {
      for (const [source, wanted] of Object.entries(oracle.coverage)) {
        if (coverage[source] !== wanted) {
          failures.push(`coverage ${source}=${coverage[source]} != ${wanted}`);
        }
      }
    }
  }

  return {
    citedSupport: proposal ? proposal.evidence_refs.map((ref) => ref.identity) : [],
    coverage,
    description,
    digests: result?.digests ?? [],
    error: result?.error?.message ?? null,
    failures,
    id,
    outcome: proposal?.outcome ?? null,
    provenance: proposal?.provenance ?? null,
    reads: result?.reads ?? 0,
    reason: result?.error?.reason ?? null,
    roles: proposal
      ? Object.fromEntries(proposal.evidence_refs.map((ref) => [ref.identity, ref.role]))
      : {},
    semantic: {
      note: oracle.semantic.note ?? null,
      status: oracle.semantic.status,
      verdict: oracle.semantic.verdict ?? null,
    },
    status,
    structuralPass: failures.length === 0,
  };
}

export type EvaluateOptions = {
  /** Test seam: supply candidate inputs directly instead of loading them from disk. */
  candidates?: CandidateInputs;
  /** Test seam: supply the oracle directly instead of loading it from disk. */
  oracle?: ExpectedOutcomes;
};

/**
 * A fixture-contract failure: the evaluation could not be carried out honestly (a companion read the
 * fixture declares was refused, or a subject read refused). It is **not** a case outcome — it must surface
 * as a hard, non-zero failure rather than being read as an absent result.
 */
export class EvaluationContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationContractError";
  }
}

/** Remove the scratch database and any sidecar it left, never throwing out of cleanup. */
function removeScratchDatabase(databasePath: string): void {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      rmSync(`${databasePath}${suffix}`, { force: true });
    } catch {
      // Best effort: a leftover scratch file is harmless and must not mask a result.
    }
  }
}

/**
 * Run the fixture. The evaluator **owns** its scratch database: it creates a temporary path, seeds it
 * from the shipped migrations and the committed dataset, runs every case, and removes the file and its
 * sidecars before returning (or before a thrown failure propagates). No caller-supplied database path is
 * accepted. `candidate-inputs.json` is loaded and every case assembled **before** `expected-outcomes.json`
 * is opened — the oracle is not an input to assembly.
 */
export async function evaluateFixture(
  options: EvaluateOptions = {}
): Promise<EvaluationReport> {
  const databasePath = temporaryDatabasePath("librarian-evaluate");
  try {
    seedFixtureDatabase(databasePath);
    return await runFixture(databasePath, options);
  } finally {
    removeScratchDatabase(databasePath);
  }
}

async function runFixture(
  databasePath: string,
  options: EvaluateOptions
): Promise<EvaluationReport> {
  const candidates = options.candidates ?? loadCandidateInputs();
  const boundary = createReadBoundary({
    actor: { id: "librarian-offline-evaluator", role: "member" },
    databasePath,
    orgId: "offline-evaluation",
    profileId: "librarian-offline-evaluator",
  });

  const assembled: Array<{
    case: SuppliedCase;
    result: EvaluationResult | null;
    writeFailures: string[];
    coverage: Record<string, string> | null;
  }> = [];

  for (const testCase of candidates.cases) {
    const limits = testCase.readOptions ?? candidates.defaultReadOptions;
    if (testCase.mode === "write_denied") {
      const writeFailures: string[] = [];
      for (const key of testCase.writeKeys ?? []) {
        try {
          await boundary.read(key, {});
          writeFailures.push(`${key} was not denied before dispatch`);
        } catch (error) {
          if (!(error instanceof ReadBoundaryDeniedError)) {
            writeFailures.push(`${key}: expected denial, got ${(error as Error).name}`);
          }
        }
      }
      assembled.push({ case: testCase, coverage: null, result: null, writeFailures });
      continue;
    }

    const subject = testCase.subject;
    const searchRead = (testCase.companionReads ?? []).find(
      (entry) => entry.action === "search_dashboard"
    );
    let search: Observation["search"] = null;
    if (searchRead) {
      const raw = await boundary.read("search_dashboard", searchRead.input);
      if (isReadFailure(raw)) {
        // A companion read the fixture declares was refused: that is a fixture-contract failure, never
        // "no search evidence" — treating it as absence would silently weaken the case it drives.
        throw new EvaluationContractError(
          `companion search_dashboard read refused for ${testCase.id}`
        );
      }
      const result = raw as { truncated?: unknown; query?: unknown; limit?: unknown };
      search = {
        limit: typeof result.limit === "number" ? result.limit : 0,
        query: typeof result.query === "string" ? result.query : "",
        truncated: result.truncated === true,
      };
    }

    const script = testCase.snapshotScript ?? [];
    let firstObservation: Observation | null = null;

    const read = async (step: number): Promise<unknown> => {
      if (testCase.injectReadError && step === 0) {
        throw new Error("injected fixture read failure");
      }
      const raw = await boundary.read("get_topic", {
        historyLimit: limits.historyLimit,
        notesLimit: limits.notesLimit,
        topicId: subject.topicId,
      });
      if (isReadFailure(raw)) {
        throw new EvaluationContractError(`get_topic refused for ${testCase.id}`);
      }
      return applyDrift(raw, script[step] ?? "base");
    };

    const observe = (raw: unknown, step: number): Observation => {
      const observation = buildObservation(raw, { limits, search, subject });
      if (step === 0 && firstObservation === null) {
        firstObservation = observation;
      }
      return observation;
    };

    const result = await assembleWithSnapshotDriver({
      candidate: testCase.candidate,
      observe,
      read,
    });
    assembled.push({
      case: testCase,
      coverage: coverageMap(firstObservation),
      result,
      writeFailures: [],
    });
  }

  // The oracle is opened only now — after every case has been assembled.
  const oracle = options.oracle ?? loadExpectedOutcomes();
  const cases = assembled.map((entry) =>
    compareCase(
      entry.case.id,
      entry.case.description,
      entry.result,
      entry.writeFailures,
      entry.coverage,
      oracle.cases[entry.case.id]
    )
  );

  return {
    boundaryStats: { ...boundary.stats },
    cases,
    datasetId: candidates.datasetId,
    fixtureDigests: fixtureFileDigests(),
    generatedAt: new Date().toISOString(),
    semanticStatus: "pending_human_review",
    structuralPass: cases.every((entry) => entry.structuralPass),
  };
}

const USAGE = "usage: bun run librarian:evaluate [--out <report.json>]";

/**
 * Only `--out` is accepted. Every other argument — most importantly `--db` — is refused here, before any
 * database is opened or seeded, so the command can never be pointed at an arbitrary or production
 * database. `--db` was removed deliberately: the evaluator owns its scratch fixture database.
 */
function parseArgs(argv: string[]): { out: string | null; error: string | null } {
  let out: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return { error: "--out requires a path value.", out: null };
      }
      out = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (value.length === 0) {
        return { error: "--out requires a path value.", out: null };
      }
      out = value;
      continue;
    }
    return { error: `unknown argument "${arg}".`, out: null };
  }
  return { error: null, out };
}

async function main(): Promise<void> {
  const { out, error } = parseArgs(process.argv.slice(2));
  if (error) {
    console.error(`librarian:evaluate — ${error}`);
    console.error(USAGE);
    process.exit(2);
  }

  let report: EvaluationReport;
  try {
    report = await evaluateFixture();
  } catch (failure) {
    // A hard failure (e.g. a refused companion read) is reported as one line and a non-zero exit — never
    // an uncaught stack the caller could mistake for a clean "no evidence" run.
    const message = failure instanceof Error ? failure.message : String(failure);
    console.error(`librarian:evaluate — HARD FAILURE: ${message}`);
    process.exit(1);
  }

  const target =
    out ?? `${process.env.TMPDIR ?? "/tmp"}/librarian-evaluation-report.json`;
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `librarian:evaluate — dataset ${report.datasetId} · ${report.cases.length} case(s) · structural ${report.structuralPass ? "PASS" : "FAIL"}`
  );
  for (const entry of report.cases) {
    console.log(
      `  ${entry.structuralPass ? "PASS" : "FAIL"}  ${entry.id.padEnd(6)} ${entry.status.padEnd(10)} ${entry.outcome ?? entry.reason ?? ""} · reads=${entry.reads} · semantic=${entry.semantic.status}${entry.semantic.verdict ? ` (${entry.semantic.verdict})` : ""}`
    );
    for (const failure of entry.failures) {
      console.log(`        · ${failure}`);
    }
  }
  console.log(`\nartifact: ${target}`);
  console.log(
    "semantic evaluation: PENDING HUMAN REVIEW — a structural pass is not a semantic claim."
  );
  process.exit(report.structuralPass ? 0 : 1);
}

if (import.meta.main) {
  await main();
}
