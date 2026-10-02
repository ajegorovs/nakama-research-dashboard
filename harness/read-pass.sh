#!/usr/bin/env bash
# The acceptance pass, runnable from a clone.
#
#   bash harness/read-pass.sh                          # corpus dataset, 1440x900 (the defaults)
#   bash harness/read-pass.sh --dataset fixture        # the synthetic edge-state dataset
#   bash harness/read-pass.sh --viewport 1280x800
#   bash harness/read-pass.sh --env-file ../compose/nakama/.env   # credentials + dashboard URL
#   bash harness/read-pass.sh --write                  # MUTATES the dataset — re-seed afterwards
#
# It logs into the dashboard, opens the plugin page in real Chromium, prints one PASS/FAIL/SKIP line
# per check, writes a transcript, captures the views and exits non-zero if any check failed. Read-only
# unless --write is given.
#
# Requires a Nakama instance with this plugin installed, its dashboard web dev server, playwright-core
# (`bun install`) and a chromium — see README § "Run the acceptance pass". Credentials come from the
# environment or --env-file (`NAKAMA_EMAIL` / `NAKAMA_PASSWORD`; the older `NAKAMA_DEV_*` spelling is
# accepted too), never from an argument, so they do not end up in shell history or a committed file.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

usage() {
  sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

DATASET="corpus"
VIEWPORT="${NAKAMA_VIEWPORT:-1440x900}"
SHOTS=""
TRANSCRIPT=""
ENV_FILE=""
PASS="read"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dataset) DATASET="${2:-}"; shift 2 ;;
    --dataset=*) DATASET="${1#*=}"; shift ;;
    --viewport) VIEWPORT="${2:-}"; shift 2 ;;
    --viewport=*) VIEWPORT="${1#*=}"; shift ;;
    --shots) SHOTS="${2:-}"; shift 2 ;;
    --shots=*) SHOTS="${1#*=}"; shift ;;
    --transcript) TRANSCRIPT="${2:-}"; shift 2 ;;
    --transcript=*) TRANSCRIPT="${1#*=}"; shift ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --env-file=*) ENV_FILE="${1#*=}"; shift ;;
    --write) PASS="write"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "read-pass: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ! "$VIEWPORT" =~ ^[0-9]+x[0-9]+$ ]]; then
  echo "read-pass: --viewport wants WIDTHxHEIGHT, got '$VIEWPORT'" >&2
  exit 2
fi
case "$DATASET" in
  corpus|fixture) ;;
  *) echo "read-pass: --dataset wants 'corpus' or 'fixture', got '$DATASET'" >&2; exit 2 ;;
esac

# KEY=VALUE, one per line; comments and blanks skipped; quotes stripped. The values are exported into
# this process only.
if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "read-pass: --env-file '$ENV_FILE' does not exist" >&2
    exit 2
  fi
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    line="${line#export }"
    key="${line%%=*}"
    value="${line#*=}"
    value="${value%\"}"; value="${value#\"}"
    value="${value%\'}"; value="${value#\'}"
    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
fi

# Where the transcript and the screenshots land: the committed record per dataset and viewport, so a
# re-run reproduces the artifacts the docs already point at. Overridable for a scratch run.
if [[ "$DATASET" == "fixture" ]]; then
  DEFAULT_SHOTS="$REPO/docs/layout-fixtures/screenshots/$VIEWPORT"
  DEFAULT_TRANSCRIPT="$REPO/docs/layout-fixtures/verify-fixture-$PASS-$VIEWPORT.txt"
else
  if [[ "$VIEWPORT" == "1440x900" ]]; then
    DEFAULT_SHOTS="$REPO/docs/screenshots"
  else
    DEFAULT_SHOTS="$REPO/docs/screenshots/$VIEWPORT"
  fi
  if [[ "$PASS" == "write" ]]; then
    DEFAULT_TRANSCRIPT="$REPO/docs/corpus/verify-write.txt"
  elif [[ "$VIEWPORT" == "1440x900" ]]; then
    DEFAULT_TRANSCRIPT="$REPO/docs/corpus/verify-$PASS.txt"
  else
    DEFAULT_TRANSCRIPT="$REPO/docs/corpus/verify-$PASS-$VIEWPORT.txt"
  fi
fi

# Both spellings are accepted because the estate's own wrapper (services/nakama/scripts/verify-read.sh)
# passes the second pair through to this script.
export NAKAMA_SHOT_DIR="${SHOTS:-${PUBLISH_SHOT_DIR:-${NAKAMA_SHOT_DIR:-$DEFAULT_SHOTS}}}"
TRANSCRIPT="${TRANSCRIPT:-${TRANSCRIPT_OUT:-$DEFAULT_TRANSCRIPT}}"
export NAKAMA_VIEWPORT="$VIEWPORT"
# The dataset the caller asked for, so the pass can REFUSE (rather than record) a verdict for an instance
# that is not that dataset — a mixed instance has already corrupted attribution once.
export NAKAMA_EXPECT_DATASET="$DATASET"
export NAKAMA_DASHBOARD="${NAKAMA_DASHBOARD:-http://127.0.0.1:3003}"
export NAKAMA_PLUGIN_ID="${NAKAMA_PLUGIN_ID:-research-dashboard}"
export NAKAMA_PAGE_LABEL="${NAKAMA_PAGE_LABEL:-Research}"

# Credentials. NAKAMA_EMAIL / NAKAMA_PASSWORD are the names every script in harness/ uses, and the ones
# the README's env file sets; the older NAKAMA_DEV_* pair is still accepted, because the estate wrapper
# that calls this script exports both. The checker itself (verify-page.mjs) reads the DEV pair, so the
# alias is exported for it rather than renaming the variable underneath it. The documented names win:
# a shell that happens to carry an old NAKAMA_DEV_* value must not override the env file it was handed.
export NAKAMA_DEV_EMAIL="${NAKAMA_EMAIL:-${NAKAMA_DEV_EMAIL:-}}"
export NAKAMA_DEV_PASSWORD="${NAKAMA_PASSWORD:-${NAKAMA_DEV_PASSWORD:-}}"
if [[ -z "$NAKAMA_DEV_EMAIL" || -z "$NAKAMA_DEV_PASSWORD" ]]; then
  echo "read-pass: no credentials — set NAKAMA_EMAIL / NAKAMA_PASSWORD (or the NAKAMA_DEV_* pair), in the environment or in --env-file" >&2
  exit 2
fi

# A dashboard that answers nothing turns into a chromium timeout three screens later; say it here.
if ! curl -fsS -o /dev/null --max-time 5 "$NAKAMA_DASHBOARD"; then
  echo "read-pass: no dashboard at $NAKAMA_DASHBOARD" >&2
  echo "  start the Nakama instance and its web dev server first (README § Run the acceptance pass)" >&2
  exit 2
fi

RUNNER="${HARNESS_RUNNER:-node}"
if ! command -v "$RUNNER" >/dev/null 2>&1; then
  RUNNER="bun"
fi
if [[ -z "${PLAYWRIGHT_CORE:-}" && ! -d "$REPO/node_modules/playwright-core" ]]; then
  echo "read-pass: playwright-core is not installed here — run 'bun install' in $REPO" >&2
  exit 2
fi

# PRECONDITION: the instance must be serving *this* build before a single check is measured. A revision
# bump proves nothing — the server bundles the plugin from the Nakama checkout, so a reinstall without
# vendoring serves the previous release while looking like a successful refresh, and the dev version
# string is commit-derived, so it identifies no build at all. Refusing here (rather than recording) keeps
# a run against the wrong bytes out of the acceptance record entirely.
if ! "$RUNNER" "$HERE/served-build-guard.mjs"; then
  echo "" >&2
  echo "read-pass: REFUSED — the instance is not serving this build (see served-build-guard above)" >&2
  echo "read-pass: the committed record at $TRANSCRIPT is untouched; refresh with rebuild -> vendor -> reinstall" >&2
  exit 3
fi

mkdir -p "$NAKAMA_SHOT_DIR"
mkdir -p "$(dirname "$TRANSCRIPT")"

ARGS=()
if [[ "$PASS" == "write" ]]; then ARGS+=(--write); fi

# The run's output is captured to a scratch file first, so that a pass which REFUSED (3) or ABORTED (2)
# cannot overwrite the committed record with a partial one. Only a verdict — 0 (all checks passed) or 1
# (checks failed, which is itself a record) — is copied into the transcript path.
SCRATCH_TRANSCRIPT="$(mktemp "${TMPDIR:-/tmp}/nakama-read-pass-XXXXXX.txt")"
# `set -e` must not apply to this pipeline: the runner exits 1 for a pass WITH FAILURES, which is a verdict and
# must still be recorded. Without this, a failing pass would abort this script before the copy below, and the
# previous (green) transcript would silently survive a red run.
set +e
{
  echo "# harness/read-pass.sh — $PASS pass · dataset $DATASET · viewport $VIEWPORT"
  echo "# dashboard: $NAKAMA_DASHBOARD"
  echo "# generated: $(date -Is)"
  echo
  "$RUNNER" "$HERE/verify-page.mjs" "${ARGS[@]+"${ARGS[@]}"}"
} 2>&1 | tee "$SCRATCH_TRANSCRIPT"
status="${PIPESTATUS[0]}"
set -e

if [[ "$status" -eq 2 || "$status" -eq 3 ]]; then
  why="ABORTED (the pass died mid-run)"
  [[ "$status" -eq 3 ]] && why="REFUSED (the instance is not the dataset this run asked for)"
  echo "" >&2
  echo "read-pass: NOT RECORDED — the pass exited $status: $why" >&2
  echo "read-pass: the committed record at $TRANSCRIPT is untouched; this run is at $SCRATCH_TRANSCRIPT" >&2
  exit "$status"
fi

cp -f "$SCRATCH_TRANSCRIPT" "$TRANSCRIPT"

# The published set uses stable names, so the README and the plan documents keep pointing at the right
# image after a re-capture. Only a read pass publishes; a write pass leaves its raw shots alone.
if [[ "$status" -eq 0 && "$PASS" == "read" ]]; then
  rename_map=(
    "research-dashboard-read.png:dashboard.png"
    "research-dashboard-read-detail.png:dashboard-detail.png"
    "research-dashboard-read-people.png:dashboard-people.png"
    "research-dashboard-read-repositories.png:dashboard-repositories.png"
    "research-dashboard-read-progress.png:dashboard-progress.png"
    "research-dashboard-read-problems.png:dashboard-problems.png"
    "research-dashboard-read-palette.png:navigation.png"
  )
  for pair in "${rename_map[@]}"; do
    src="${pair%%:*}"; dst="${pair##*:}"
    if [[ -f "$NAKAMA_SHOT_DIR/$src" ]]; then
      mv -f "$NAKAMA_SHOT_DIR/$src" "$NAKAMA_SHOT_DIR/$dst"
      echo "published: $dst"
    fi
  done
fi

exit "$status"
