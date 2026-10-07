/**
 * TEST-ONLY sandbox for the **positive** gate path.
 *
 * The owning gates are deliberately hard: `turn.mjs` keeps `INFERENCE_AUTHORIZED = false`, so `mintLiveGrant`
 * always refuses and the real entrypoint's positive path is unreachable in this repository — by design. To
 * exercise that positive path offline, this helper copies the harness tree into a scratch directory and flips
 * the single `const` **in the copy only** (`export const INFERENCE_AUTHORIZED = false;` → `true`).
 *
 * What this is **not**: it mints nothing itself and exposes no ungated production capability. The grant the
 * tests use is minted by the **copied** `mintLiveGrant`, which still runs `authorizeExecution` and
 * `assertInferenceAuthorized` (the latter returning normally only because the *copy* authorised inference).
 * The repository tree is never written to, and every live transport is an injected, offline emulator — no
 * runtime network. `cleanup()` removes the copy.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // …/driver
const HARNESS = resolve(HERE, ".."); // …/nakama-e2e

const INFERENCE_MARKER = "export const INFERENCE_AUTHORIZED = false;";
const INFERENCE_FLIPPED = "export const INFERENCE_AUTHORIZED = true;";

/** Copy the harness tree, flip the inference const in the copy, and load the guard-bearing modules from it. */
export async function loadLiveSandbox() {
  const root = mkdtempSync(join(tmpdir(), "nakama-live-sandbox-"));
  const copy = join(root, "nakama-e2e");
  cpSync(HARNESS, copy, { recursive: true });

  const turnPath = join(copy, "turn.mjs");
  const source = readFileSync(turnPath, "utf8");
  if (!source.includes(INFERENCE_MARKER)) {
    throw new Error(`live sandbox: failed to locate ${JSON.stringify(INFERENCE_MARKER)} in the copied turn.mjs`);
  }
  writeFileSync(turnPath, source.replace(INFERENCE_MARKER, INFERENCE_FLIPPED));

  const load = (rel) => import(pathToFileURL(join(copy, rel)).href);
  const [turn, liveGrant, adapters, live, focusedLive] = await Promise.all([
    load("turn.mjs"),
    load("driver/live-grant.mjs"),
    load("driver/http-adapters.mjs"),
    load("driver/live.mjs"),
    load("driver/focused-live.mjs"),
  ]);
  return { root, turn, liveGrant, adapters, live, focusedLive, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
