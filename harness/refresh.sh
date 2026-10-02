#!/usr/bin/env bash
# refresh.sh — the canonical deployment chain, hard-gated. Run this before ANY acceptance pass.
#
#   build -> vendor -> reinstall -> served-build-guard (bounded retry) -> ready
#
# Why it exists: an acceptance run must never measure a build that is not the one it thinks it is
# measuring. Three real traps made that possible:
#
#   1. `install-plugin.mjs --reinstall` alone re-snapshots the Nakama checkout, so a revision bump can
#      serve the PREVIOUS UI. The vendor step is mandatory.
#   2. A failed `bun run build` used to be survivable — a chain written with `;` ran the passes anyway
#      and measured the old bytes. Here every step is `&&`: a failed build makes the rest impossible.
#   3. After a reinstall the plugin asset takes ~10s to become available, so an immediate digest check
#      fails with a connection or asset error that reads like a digest mismatch. The guard is retried
#      for a bounded period instead.
#
# On success it prints the served revision + version + asset digest, which is the evidence to quote.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ESTATE="${ESTATE:-/mnt/otrais/services}"
CHECKOUT="${NAKAMA_CHECKOUT:-/mnt/otrais/repos/nakama}"
ENV_FILE="${NAKAMA_ENV_FILE:-$ESTATE/compose/nakama/.env}"
GUARD_TIMEOUT="${GUARD_TIMEOUT:-90}"

step() { printf '\n== %s\n' "$1"; }

step "1/4 build"
cd "$REPO"
bun run build

step "2/4 vendor into the Nakama checkout"
bash vendor/vendor-into-nakama.sh "$CHECKOUT"

step "3/4 reinstall onto the running instance"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export NAKAMA_EMAIL="${NAKAMA_SEED_ADMIN_EMAIL:?seed admin email missing from $ENV_FILE}"
export NAKAMA_PASSWORD="${NAKAMA_SEED_ADMIN_PASSWORD:?seed admin password missing from $ENV_FILE}"
export NAKAMA_URL="${NAKAMA_URL:-http://127.0.0.1:4399}"
bun harness/reinstall-plugin.mjs

step "4/4 served digest == repo build digest (retry up to ${GUARD_TIMEOUT}s)"
deadline=$(( $(date +%s) + GUARD_TIMEOUT ))
attempt=0
until out="$(bun harness/served-build-guard.mjs 2>&1)"; do
  attempt=$(( attempt + 1 ))
  if [ "$(date +%s)" -ge "$deadline" ]; then
    printf 'served-build-guard: FAILED after %ss and %s attempt(s)\n%s\n' "$GUARD_TIMEOUT" "$attempt" "$out" >&2
    exit 1
  fi
  printf '  attempt %s not ready yet — the asset lags a reinstall; retrying in 5s\n' "$attempt"
  sleep 5
done
printf '%s\n' "$out"
printf '\nrefresh: OK — the instance serves this build. Quote the revision, version and digest above.\n'
