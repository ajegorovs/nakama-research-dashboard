#!/usr/bin/env bun
/**
 * Librarian semantic-evaluation runner (OFFLINE-SEMANTIC-EVALUATION-PROPOSAL §5, §9, §10).
 *
 * This is the offline generation adapter's orchestration surface. It ships nothing: it is **not** imported
 * by `src/actions.ts` or `src/ui.tsx` and is not part of `bun run build`.
 *
 * Modes (all non-generation by default):
 *   --mode offline   (default) verify the frozen artifacts are byte-unchanged, enumerate the exact 34-call
 *                    plan, and render every prompt deterministically. **No network, no model, no capture.**
 *   --mode preflight run the non-generation capability check through the Hermes-backed Python transport
 *                    helper (resolve the pinned runtime; the one permitted authenticated GET /models).
 *   --mode generate  the **bounded** 34-call orchestration. **REFUSED** unless an explicit, external run
 *                    authorization record is present and matches (see `authorization.mjs`). None is
 *                    granted here, so this exits 3 without contacting a provider. When authorized it reads
 *                    the frozen synthetic projections only (no live DB), drives the coordinator through a
 *                    mock-or-transport `generate` seam, captures every generation losslessly, and writes an
 *                    append-only run report — never overwriting an existing capture.
 *
 * The Python helper is invoked with the interpreter that belongs to the installed `hermes` executable —
 * resolved from the executable itself, never from a hardcoded install path or hash.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderPrompt } from "../../src/librarian/prompt.ts";
import { currentRevision, loadAuthorization } from "./authorization.mjs";
import { buildSchedule, executeSchedule } from "./orchestrate.mjs";

const HERE = import.meta.dir;
const REPO = resolve(HERE, "..", "..");
const MANIFEST_PATH = join(HERE, "run-manifest.json");
const HELPER_PATH = join(HERE, "transport_helper.py");
const AUTHORIZATION_PATH = join(HERE, "run-authorization.json");

/** Resolve the interpreter of the installed `hermes` executable, safely and without a hardcoded hash. */
export function resolveHermesInterpreter() {
  const which = spawnSync("sh", ["-c", "command -v hermes"], { encoding: "utf8" });
  const exe = (which.stdout ?? "").trim();
  if (!exe) return null;
  let real;
  try {
    real = realpathSync(exe);
  } catch {
    return null;
  }
  const candidate = join(dirname(real), "python3");
  return existsSync(candidate) ? candidate : null;
}

function sha256Hex(text) {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const corpus = JSON.parse(
  readFileSync(join(REPO, "src", "librarian", "fixtures", "semantic-cases.json"), "utf8")
);

/** Verify the frozen artifacts are byte-identical to the digests pinned in the manifest. */
export function verifyFrozenArtifacts() {
  const checked = [];
  let ok = true;
  for (const key of ["corpus", "rubric", "promptTemplate"]) {
    const entry = manifest.artifacts[key];
    const text = readFileSync(join(REPO, entry.path), "utf8");
    const matches = sha256Hex(text) === entry.digest;
    checked.push({ path: entry.path, ok: matches });
    ok = ok && matches;
  }
  return { checked, ok };
}

/** Enumerate the exact call plan (30 semantic + 4 reconstruction = 34) and render every prompt. */
export function enumeratePlan() {
  const plan = manifest.callPlan;
  const promptDigests = {};
  let semantic = 0;
  for (const caseId of plan.semanticCases) {
    // The F-2 and F-18 slots render the adopted within-budget variants; base projections drive no calls.
    const projection =
      caseId === plan.conflictVariant.replacesCaseSlot
        ? corpus.conflictVariant.projection
        : caseId === plan.injectionVariant.replacesCaseSlot
          ? corpus.injectionVariant.projection
          : corpus.semanticCases.find((entry) => entry.id === caseId)?.projection;
    if (!projection) throw new Error(`plan references an unknown semantic case: ${caseId}`);
    for (const seed of manifest.seeds.semanticPredeclared) {
      const rendered = renderPrompt(projection);
      if (rendered.requestDigest !== renderPrompt(projection).requestDigest) {
        throw new Error(`non-deterministic prompt render for ${caseId}`);
      }
      promptDigests[`${caseId}/s${seed}`] = rendered.requestDigest;
      semantic += 1;
    }
  }
  const reconstruction = plan.reconstructionExercise.reduce((sum, entry) => sum + entry.calls, 0);
  if (semantic !== plan.semanticCalls) {
    throw new Error(`semantic call count ${semantic} != declared ${plan.semanticCalls}`);
  }
  if (reconstruction !== plan.reconstructionCalls) {
    throw new Error(`reconstruction call count ${reconstruction} != declared ${plan.reconstructionCalls}`);
  }
  const total = semantic + reconstruction;
  if (total > plan.hardMaximumCalls) {
    throw new Error(`plan total ${total} exceeds hard maximum ${plan.hardMaximumCalls}`);
  }
  return { promptDigests, reconstructionCalls: reconstruction, semanticCalls: semantic, total };
}

function preflight() {
  const interpreter = resolveHermesInterpreter();
  if (!interpreter) {
    console.error("preflight: could not resolve the hermes interpreter (is `hermes` on PATH?).");
    return 2;
  }
  const result = spawnSync(interpreter, [HELPER_PATH, "--mode", "preflight"], { encoding: "utf8" });
  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  if (result.status !== 0) {
    // The helper's error is a fixed, secret-free code.
    console.error(`preflight: transport helper refused: ${stderr || "unknown"}`);
    return result.status ?? 1;
  }
  console.log(stdout);
  return 0;
}

/**
 * The authorized generation path. Reads the frozen synthetic projections only, drives the bounded
 * coordinator, captures every generation losslessly, and writes an append-only run report. Never reached
 * in this envelope: the gate is shut and no authorization record exists.
 */
async function generate() {
  const authorization = loadAuthorization({
    manifest,
    manifestPath: MANIFEST_PATH,
    recordPath: AUTHORIZATION_PATH,
    repo: REPO,
  });
  if (!authorization.authorized) {
    console.error(`generate: REFUSED — ${authorization.reason} (generation_not_authorized).`);
    return 3;
  }
  const interpreter = resolveHermesInterpreter();
  if (!interpreter) {
    console.error("generate: could not resolve the hermes interpreter (is `hermes` on PATH?).");
    return 2;
  }
  const model = manifest.identity.model;
  const captureRoot = join(HERE, "capture");
  mkdirSync(captureRoot, { recursive: true });
  // Refuse to reuse an existing run directory: captures are append-only and never overwritten.
  const captureDir = join(captureRoot, authorization.record.captureBasename);
  mkdirSync(captureDir, { recursive: false });
  const revision = currentRevision(REPO) ?? "unknown";

  const generateSeam = (request) => {
    const requestJson = JSON.stringify({
      max_tokens: manifest.transportBudgetsApproved.completionTokensMax,
      model,
      seed: request.seed,
      system: request.prompt.system,
      temperature: manifest.decodingParameters.temperature,
      top_p: manifest.decodingParameters.top_p,
      user: request.prompt.user,
    });
    const result = spawnSync(
      interpreter,
      [HELPER_PATH, "--mode", "generate", "--run-authorization", AUTHORIZATION_PATH],
      { encoding: "utf8", input: requestJson, maxBuffer: 16 * 1024 * 1024 }
    );
    if (result.status !== 0) {
      const error = new Error("generation_transport_refused");
      error.name = "GenerationTransportError";
      throw error;
    }
    const capture = JSON.parse(result.stdout ?? "{}");
    return Buffer.from(String(capture.completionBase64 ?? ""), "base64").toString("utf8");
  };

  const schedule = buildSchedule(manifest, corpus);
  const report = await executeSchedule({
    captureDir,
    corpus,
    generate: generateSeam,
    manifest,
    model,
    revision,
    runId: authorization.record.captureBasename,
    schedule,
  });
  writeFileSync(join(captureDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(
    `generate: ${report.totalCalls}/${report.hardMaximumCalls} calls; green=${report.green}; ` +
      `captures=${report.captureCount}; dir=${captureDir}`
  );
  return report.green && report.countsMatch ? 0 : 1;
}

export async function main(argv) {
  const modeFlag = argv.indexOf("--mode");
  const mode = modeFlag >= 0 ? argv[modeFlag + 1] : "offline";

  const frozen = verifyFrozenArtifacts();
  for (const entry of frozen.checked) {
    console.log(`${entry.ok ? "PASS" : "FAIL"}  frozen ${entry.path}`);
  }
  if (!frozen.ok) {
    console.error("runner: a frozen artifact changed — refusing to continue.");
    return 1;
  }

  const plan = enumeratePlan();
  console.log(
    `plan: ${plan.semanticCalls} semantic + ${plan.reconstructionCalls} reconstruction = ${plan.total} calls ` +
      `(hard max ${manifest.callPlan.hardMaximumCalls}); prompts rendered: ${Object.keys(plan.promptDigests).length}`
  );

  if (mode === "generate") return generate();
  if (mode === "preflight") return preflight();
  if (mode !== "offline") {
    console.error(`runner: unknown mode "${mode}".`);
    return 2;
  }
  console.log("offline: no network, no model, no capture performed.");
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
