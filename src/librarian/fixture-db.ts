/**
 * Offline fixture loading and seeding (OFFLINE-IMPLEMENTATION-PROPOSAL §10).
 *
 * The fixture database is a **temporary** SQLite file built from the shipped migrations and seeded with
 * the fixed synthetic rows of `evaluation-dataset.json`. This module owns the seeding connection and
 * closes it before any read runs; it is **never** an input the librarian core reads. The core is handed
 * only returned rows (through the read boundary), never a database handle or this seeder.
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Migration files the platform applies, in order. Includes 005 to match the shipped manifest. */
export const MIGRATION_FILES = [
  "001-research.sql",
  "002-coordination-model.sql",
  "003-drop-legacy.sql",
  "004-ux-v2-model.sql",
  "005-external-evidence.sql",
] as const;

export type FixtureDataset = {
  datasetId: string;
  label: string;
  tables: Record<string, Array<Record<string, unknown>>>;
};

export type SuppliedCase = {
  id: string;
  description: string;
  subject: { topicId: string; axisId: string };
  mode?: "write_denied";
  writeKeys?: string[];
  readOptions?: { historyLimit: number; notesLimit: number };
  companionReads?: Array<{ action: string; input: Record<string, unknown> }>;
  snapshotScript?: string[];
  injectReadError?: boolean;
  candidate: Record<string, unknown> | null;
};

export type CandidateInputs = {
  datasetId: string;
  defaultReadOptions: { historyLimit: number; notesLimit: number };
  cases: SuppliedCase[];
};

export type ExpectedOutcome = {
  expect: {
    status: "proposal" | "refused" | "read_error" | "write_denied";
    outcome?: string;
    reason?: string;
    reads?: number;
    noText?: boolean;
    digestSource?: "A" | "B" | "C";
    conflictReasons?: string[];
    provenance?: string;
  };
  citedSupport?: string[];
  roles?: Record<string, string>;
  coverage?: Record<string, string>;
  semantic: { status: string; verdict?: string; note?: string };
};

export type ExpectedOutcomes = {
  datasetId: string;
  cases: Record<string, ExpectedOutcome>;
};

function fixturesDir(): string {
  return join(import.meta.dir, "fixtures");
}

export function migrationsDir(): string {
  return join(import.meta.dir, "..", "..", "migrations");
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir(), name), "utf8")) as T;
}

export function loadEvaluationDataset(): FixtureDataset {
  return readJson<FixtureDataset>("evaluation-dataset.json");
}

export function loadCandidateInputs(): CandidateInputs {
  return readJson<CandidateInputs>("candidate-inputs.json");
}

export function loadExpectedOutcomes(): ExpectedOutcomes {
  return readJson<ExpectedOutcomes>("expected-outcomes.json");
}

/** Read the fixture files' bytes as digests, for the report. Never fed to the core. */
export function fixtureFileDigests(): Record<string, string> {
  const names = [
    "evaluation-dataset.json",
    "candidate-inputs.json",
    "expected-outcomes.json",
    "README.md",
  ];
  const hasher = (text: string): string =>
    new Bun.CryptoHasher("sha256").update(text).digest("hex");
  const digests: Record<string, string> = {};
  for (const name of names) {
    digests[name] = hasher(readFileSync(join(fixturesDir(), name), "utf8"));
  }
  return digests;
}

export function temporaryDatabasePath(label = "librarian-fixture"): string {
  const dir = process.env.TMPDIR ?? "/tmp";
  return `${dir}/${label}-${crypto.randomUUID()}.sqlite`;
}

/**
 * Build a fresh database from the shipped migrations and insert the dataset's rows. Rows are inserted in
 * the object's own key order (parent-first in `evaluation-dataset.json`); this is a temporary seeding
 * step **outside** the runtime adapter and the connection is closed before it returns.
 */
export function seedFixtureDatabase(
  path: string,
  dataset: FixtureDataset = loadEvaluationDataset()
): void {
  const db = new Database(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    for (const name of MIGRATION_FILES) {
      db.exec(readFileSync(join(migrationsDir(), name), "utf8"));
    }
    for (const [table, rows] of Object.entries(dataset.tables)) {
      for (const row of rows) {
        const columns = Object.keys(row);
        const statement = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns
          .map(() => "?")
          .join(", ")})`;
        db.query(statement).run(...columns.map((column) => row[column] as never));
      }
    }
  } finally {
    db.close();
  }
}
