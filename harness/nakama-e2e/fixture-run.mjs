#!/usr/bin/env bun
/**
 * Fixture-worker entry point: confirm the dedicated fixture -> seed -> persist the source/live mapping ->
 * read back the seeded topics.
 *
 * **Dry-run by default.** Without `--execute` it prints the plan (the exact reconcile payload counts) and
 * exits 0, touching nothing. It never runs a model turn and never creates an automation — those live in
 * turn.mjs / automation.mjs and are blocked (see README "Inference is blocked").
 *
 *   bun harness/nakama-e2e/fixture-run.mjs                       # dry run: prints the plan
 *   bun harness/nakama-e2e/fixture-run.mjs --execute --base http://127.0.0.1:4399 \
 *     --expected-org <org id> --env-file <instance env file> --out <mapping.json>
 *
 * A live run refuses unless the caller names an **explicit loopback base** and an **explicit expected
 * org**, and confirms the target really is the dedicated fixture: the org must be one the account belongs
 * to (and match `--expected-org-name` when given), and the plugin store must be **empty** before seeding.
 * There is no default target — a missing `--base`/`NAKAMA_URL` is an error, not a fallback to whatever
 * environment variable points at. A wrong-but-reachable instance is refused, not seeded.
 *
 * The store identity (generation + served revision + lifecycle) is pinned **before the seed** and re-pinned
 * after the read-only readback, so the run proves the identity it was handed rather than one it discovered
 * only after it had already mutated the store. The seed itself is an expected mutation and is not
 * no-write-proved; the readback across which the pin is proven is read-only. `--data-root` /
 * `--platform-db` (or `NAKAMA_CONFIG_DIR` / `DATABASE_URL`) name the fixture's local store, or the run
 * refuses rather than reading back unpinned. The mapping output must be writable before the store is
 * mutated — a seed whose source->live mapping cannot be persisted would leave rows no readback can address.
 *
 * Credentials come only from the env file / environment (NAKAMA_SEED_ADMIN_EMAIL + _PASSWORD, or
 * NAKAMA_EMAIL + NAKAMA_PASSWORD) and are never printed. Live execution is the fixture worker's act.
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";
import { accessSync, constants, mkdirSync } from "node:fs";
import { loadSeedArtifact, buildMainInputs, buildProblemRefInputs } from "./artifact.mjs";
import { seedSemanticFixture, writeMapping, emptyMapping } from "./seed.mjs";
import { readbackAllCases } from "./readback.mjs";
import { createClient, isLoopbackBase } from "./client.mjs";
import { pinActiveStoreIdentity, assertIdentityPinned } from "./snapshot.mjs";
import { loadEnvFileArg } from "../env-file.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

function flag(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) return argv[i + 1] ?? fallback;
  const inline = argv.find((v) => v.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

/** `DATABASE_URL=file:/path/to/nakama.sqlite` -> the platform DB path (bare paths pass through). */
function platformDbFromDatabaseUrl(value) {
  const text = value ?? "";
  return text.startsWith("file:") ? text.slice("file:".length) : text;
}

/**
 * The mapping is runtime evidence that ties a run to one fixture's live ids. It must never be written
 * inside the repository (it would leak the fixture's ids/host into the public tree), so the output path
 * is refused when it resolves under the repo root. Pure and offline-testable.
 */
export function assertPrivateOutputPath(out, repoRoot = REPO_ROOT) {
  const resolved = resolve(out);
  const root = resolve(repoRoot);
  if (resolved === root || resolved.startsWith(root + sep)) {
    throw new Error(`--out ${out} is inside the repository (${root}); keep the fixture mapping outside the public tree`);
  }
  return resolved;
}

/**
 * Fail closed unless the mapping file can actually be written: create the parent directory and confirm it
 * is writable. Called **before** the seed, so a store is never mutated when its source->live mapping could
 * not be persisted. Pure filesystem check; nothing under the fixture store is touched.
 */
export function assertOutputWritable(out) {
  const resolved = resolve(out);
  const dir = dirname(resolved);
  mkdirSync(dir, { recursive: true });
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    throw new Error(`--out directory ${dir} is not writable; the source->live mapping could not be persisted`);
  }
  return resolved;
}

/** Pure: the offline plan — how many calls, and the source ids each call will seed. */
export function buildPlan(artifact, { variants = artifact.defaultVariants } = {}) {
  const main = buildMainInputs(artifact, { variants });
  const refs = buildProblemRefInputs(artifact, dummyMapping(artifact, variants), { variants });
  return {
    seedCalls: main.length + refs.length,
    topics: main.map((c) => ({
      topicSourceId: c.topicSourceId,
      axes: c.input.axes.length,
      activities: c.input.activities.length,
      annotations: c.input.annotations.length,
      problems: c.input.problems.length,
    })),
    problemRefCalls: refs.length,
    variants,
  };
}

function dummyMapping(artifact, variants) {
  const mapping = emptyMapping(variants);
  for (const topic of artifact.topics) {
    for (const axis of topic.axes) {
      for (const p of axis.problems) mapping.problems[p.sourceId] = `pending:${p.sourceId}`;
    }
  }
  return mapping;
}

/**
 * The live orchestration, factored out of `main` so the **ordering** (pin before seed) is unit-testable
 * with injected fakes. Dependencies default to the real ones; a test substitutes every seam.
 *
 * Order is the point: the store identity is resolved and pinned FIRST, then the output is proven writable,
 * and only then is the store mutated. Any failure before the seed returns without touching the store; any
 * failure during the seed propagates (the caller stops — no reset, no retry, no second copy).
 */
export async function runFixture({
  client,
  actorId,
  outPath,
  pinOptions,
  artifact,
  variants,
  pinStore = pinActiveStoreIdentity,
  seed = seedSemanticFixture,
  readbackCases = readbackAllCases,
  persistMapping = writeMapping,
  ensureOutputWritable = assertOutputWritable,
  log = console.log,
  err = console.error,
} = {}) {
  // Genuine fixture confirmation: a dedicated, unseeded store. The org membership check ran inside login;
  // this proves the plugin store has no topics yet, so every live id the seed produces is new to it.
  const listed = await client.listTopics();
  if (listed.status !== 200 || !Array.isArray(listed.result?.topics)) {
    err(`fixture-run: could not read the fixture's topics (HTTP ${listed.status}); refusing — the dedicated-store confirmation cannot run`);
    return 2;
  }
  if (listed.result.topics.length > 0) {
    err(
      `fixture-run: the target already holds ${listed.result.topics.length} topic(s); this is not a dedicated empty fixture — refusing`
    );
    return 2;
  }

  // PIN BEFORE SEED. The store identity (generation + revision + lifecycle) is read from the platform DB
  // and the active generation file *before* any mutation, so the run can never discover its baseline after
  // it has already written. Fails closed.
  let pinBefore;
  try {
    pinBefore = pinStore(pinOptions);
  } catch (error) {
    err(`fixture-run: cannot pin the fixture store identity before seeding (${error.message}); refusing`);
    return 2;
  }
  log(
    `fixture-run: pre-seed store generation ${pinBefore.generation} · revision ${pinBefore.revision} · ${pinBefore.lifecycleState}`
  );

  // The mapping output must be writable BEFORE the store is mutated: a seed whose source->live mapping
  // could not be persisted would leave written rows that no readback can address.
  try {
    ensureOutputWritable(outPath);
  } catch (error) {
    err(`fixture-run: ${error.message}; refusing to seed`);
    return 2;
  }

  // The seed is an EXPECTED mutation — the store's rows change by design, so no no-write proof is made
  // across it. A seed failure propagates: the caller stops rather than reseeding or retrying.
  const { mapping, calls } = await seed({ artifact, client, variants });
  persistMapping(outPath, mapping);
  log(`fixture-run: ${calls.length} reconcile calls accepted; mapping -> ${outPath}`);

  const readback = await readbackCases({ client, artifact, mapping, expectedActorId: actorId, activeVariants: variants });
  let failed = 0;
  for (const [caseId, result] of Object.entries(readback)) {
    if (!result.ok) { failed += 1; err(`fixture-run: ${caseId} FAIL — ${result.failures.join("; ")}`); }
    else log(`fixture-run: ${caseId} projection OK`);
  }

  // Re-pin across the (read-only) readback: the identity must not have moved.
  let pinAfter;
  try {
    pinAfter = pinStore(pinOptions);
  } catch (error) {
    err(`fixture-run: cannot re-pin the fixture store identity after the readback (${error.message})`);
    return 1;
  }
  const pinned = assertIdentityPinned(pinBefore, pinAfter);
  if (!pinned.ok) {
    err(`fixture-run: the readback moved the store identity — ${pinned.failures.join("; ")}`);
    return 1;
  }
  return failed === 0 ? 0 : 1;
}

async function main() {
  const argv = process.argv.slice(2);
  const artifact = loadSeedArtifact(flag(argv, "artifact"));
  const variants = (flag(argv, "variants") ?? artifact.defaultVariants.join(",")).split(",").filter(Boolean);

  if (!argv.includes("--execute")) {
    console.log("fixture-run: DRY RUN (pass --execute to seed a live fixture)");
    console.log(JSON.stringify(buildPlan(artifact, { variants }), null, 2));
    return 0;
  }

  loadEnvFileArg();

  const base = flag(argv, "base") ?? process.env.NAKAMA_URL ?? "";
  if (!base) {
    console.error("fixture-run: --base <http://127.0.0.1:PORT> (or NAKAMA_URL) is required; refusing to default a target");
    return 2;
  }
  if (!isLoopbackBase(base)) {
    console.error(`fixture-run: base ${base} is not a loopback address; refusing — the corpus/production is not a fixture`);
    return 2;
  }
  const expectedOrgId = flag(argv, "expected-org", process.env.NAKAMA_EXPECTED_ORG ?? "");
  if (!expectedOrgId) {
    console.error("fixture-run: --expected-org <org id> is required; refusing to inherit write authority from the session's first org");
    return 2;
  }
  const expectedOrgName = flag(argv, "expected-org-name", process.env.NAKAMA_SEED_ORG_NAME ?? "");

  const email = process.env.NAKAMA_SEED_ADMIN_EMAIL ?? process.env.NAKAMA_EMAIL ?? "";
  const password = process.env.NAKAMA_SEED_ADMIN_PASSWORD ?? process.env.NAKAMA_PASSWORD ?? "";
  if (!email || !password) {
    console.error("fixture-run: no credentials in the env file / environment; refusing");
    return 2;
  }
  const out = flag(argv, "out");
  if (!out) {
    console.error("fixture-run: --out <mapping.json> is required with --execute");
    return 2;
  }
  let outPath;
  try {
    outPath = assertPrivateOutputPath(out);
  } catch (error) {
    console.error(`fixture-run: ${error.message}`);
    return 2;
  }

  // The local store identity (generation + served revision + lifecycle) is resolved BEFORE the client acts,
  // so a missing data root / platform DB refuses without a login or a mutation.
  const dataRoot = flag(argv, "data-root", process.env.NAKAMA_CONFIG_DIR ?? "");
  const platformDbPath = flag(argv, "platform-db", platformDbFromDatabaseUrl(process.env.DATABASE_URL));
  if (!dataRoot || !platformDbPath) {
    console.error("fixture-run: --data-root and --platform-db (or NAKAMA_CONFIG_DIR + DATABASE_URL) are required to pin the fixture store identity");
    return 2;
  }

  const client = createClient({
    base, email, password,
    pluginId: process.env.NAKAMA_PLUGIN_ID,
    expectedOrgId, expectedOrgName,
  });
  const { orgId, actorId } = await client.login();
  console.log(`fixture-run: ${base} · org ${orgId} · acting as ${actorId}`);

  const pinOptions = {
    dataRoot, org: flag(argv, "org", orgId), pluginId: client.pluginId, platformDbPath, orgId,
  };

  return runFixture({ client, actorId, outPath, pinOptions, artifact, variants });
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(`fixture-run: ${error?.message ?? error}`);
    process.exit(2);
  });
}
