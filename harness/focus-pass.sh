#!/usr/bin/env bash
# The keyboard-focus pass (H1), runnable from a clone.
#
#   bash harness/focus-pass.sh                                   # corpus, 1440x900 (the defaults)
#   bash harness/focus-pass.sh --dataset fixture --viewport 1280x800
#   bash harness/focus-pass.sh --env-file ../compose/nakama/.env
#   bash harness/focus-pass.sh --negative-control                # prove the measure can see a removal
#
# It logs into the dashboard, tabs through the plugin page in real Chromium, and for every class of control
# it reaches compares the focused render against the unfocused one: does focusing paint an indicator at all,
# does that indicator survive the element's clipping ancestors, does it stay on screen, and does it reach the
# 3:1 non-text contrast minimum against the surface it is drawn on. It also checks that the walk never moves
# focus backwards, that nothing is clickable by mouse yet unreachable by keyboard, and that Enter on the
# shell title returns to the landing without losing the reader's window.
#
# Read-only. The transcript is a public artifact, so the endpoint in it is a label, not an address: the header
# goes through harness/redact-url.mjs, the same rule the acceptance records use.
#
# **Which instance is measured is decided here, not by the shell.** The corpus env file carries no NAKAMA_URL
# (its port is a unit-level choice), so a shell that happened to source the fixture's env file first redirects
# a "corpus" run to the fixture — learned by watching a reinstall land on the wrong instance while reporting
# success. The URL is therefore resolved from the dataset (or --url) and exported explicitly, overriding
# whatever the caller's shell carries.
#
# Exit codes match the read pass: 0 = every check passed, 1 = a verdict with failures (still recorded),
# 2 = ABORTED mid-run, 3 = REFUSED (the instance is not serving this build, or is not up). 2 and 3 never
# replace the committed transcript.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

usage() {
  sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

DATASET="corpus"
VIEWPORT="${NAKAMA_VIEWPORT:-1440x900}"
TRANSCRIPT=""
ENV_FILE=""
URL=""
MODE="measure"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dataset) DATASET="${2:-}"; shift 2 ;;
    --dataset=*) DATASET="${1#*=}"; shift ;;
    --viewport) VIEWPORT="${2:-}"; shift 2 ;;
    --viewport=*) VIEWPORT="${1#*=}"; shift ;;
    --transcript) TRANSCRIPT="${2:-}"; shift 2 ;;
    --transcript=*) TRANSCRIPT="${1#*=}"; shift ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --env-file=*) ENV_FILE="${1#*=}"; shift ;;
    --url) URL="${2:-}"; shift 2 ;;
    --url=*) URL="${1#*=}"; shift ;;
    --negative-control) MODE="negative"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "focus-pass: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ ! "$VIEWPORT" =~ ^[0-9]+x[0-9]+$ ]]; then
  echo "focus-pass: --viewport wants WIDTHxHEIGHT, got '$VIEWPORT'" >&2
  exit 2
fi
case "$DATASET" in
  corpus|fixture) ;;
  *) echo "focus-pass: --dataset wants 'corpus' or 'fixture', got '$DATASET'" >&2; exit 2 ;;
esac

if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "focus-pass: --env-file '$ENV_FILE' does not exist" >&2
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

# The instance this run measures: explicit, and never inherited.
if [[ -z "$URL" ]]; then
  case "$DATASET" in
    fixture) URL="http://127.0.0.1:4400" ;;
    corpus) URL="http://127.0.0.1:4399" ;;
  esac
fi
export NAKAMA_URL="$URL"
# The dashboard the browser drives: the fixture binds loopback, the corpus binds the tailnet address (vite),
# where the API-only port would answer a page route with "Authentication required".
if [[ -z "${NAKAMA_DASHBOARD:-}" ]]; then
  case "$DATASET" in
    fixture) export NAKAMA_DASHBOARD="http://127.0.0.1:3005" ;;
    corpus) export NAKAMA_DASHBOARD="http://$(tailscale ip -4 2>/dev/null | head -1):3003" ;;
  esac
fi
export NAKAMA_PLUGIN_ID="${NAKAMA_PLUGIN_ID:-research-dashboard}"
export NAKAMA_PAGE_LABEL="${NAKAMA_PAGE_LABEL:-Research}"

# Credentials: the wrapper's names are the file's names here (the corpus env file seeds NAKAMA_SEED_ADMIN_*),
# and the pair the runner reads is derived from them, so a stale value in the caller's shell cannot win.
export NAKAMA_DEV_EMAIL="${NAKAMA_EMAIL:-${NAKAMA_SEED_ADMIN_EMAIL:-${NAKAMA_DEV_EMAIL:-}}}"
export NAKAMA_DEV_PASSWORD="${NAKAMA_PASSWORD:-${NAKAMA_SEED_ADMIN_PASSWORD:-${NAKAMA_DEV_PASSWORD:-}}}"
if [[ -z "$NAKAMA_DEV_EMAIL" || -z "$NAKAMA_DEV_PASSWORD" ]]; then
  echo "focus-pass: no credentials — pass --env-file with NAKAMA_SEED_ADMIN_* (or set NAKAMA_EMAIL/NAKAMA_PASSWORD)" >&2
  exit 2
fi

if ! curl -fsS -o /dev/null --max-time 5 "$NAKAMA_DASHBOARD"; then
  echo "focus-pass: no dashboard at $NAKAMA_DASHBOARD" >&2
  echo "  start the instance and its web server first (services/nakama/scripts/run-dev-*.sh)" >&2
  exit 2
fi

RUNNER="${HARNESS_RUNNER:-node}"
if ! command -v "$RUNNER" >/dev/null 2>&1; then
  RUNNER="bun"
fi
if [[ -z "${PLAYWRIGHT_CORE:-}" && ! -d "$REPO/node_modules/playwright-core" ]]; then
  echo "focus-pass: playwright-core is not installed here — run 'bun install' in $REPO" >&2
  exit 2
fi

if [[ "$DATASET" == "fixture" ]]; then
  DEFAULT_TRANSCRIPT="$REPO/docs/ux-v2/focus-fixture-$VIEWPORT.txt"
else
  DEFAULT_TRANSCRIPT="$REPO/docs/ux-v2/focus-corpus-$VIEWPORT.txt"
fi
[[ "$MODE" == "negative" ]] && DEFAULT_TRANSCRIPT="${DEFAULT_TRANSCRIPT%.txt}-negative-control.txt"
TRANSCRIPT="${TRANSCRIPT:-$DEFAULT_TRANSCRIPT}"
mkdir -p "$(dirname "$TRANSCRIPT")"

# PRECONDITION: the instance must be serving this build. A revision bump proves nothing, and an instance that
# is on the previous bundle would silently re-measure the *defect H1 just fixed* as if it were still there.
SERVED="$("$RUNNER" "$HERE/served-build-guard.mjs" 2>&1)" && GUARD=0 || GUARD=$?
if [[ "$GUARD" -ne 0 ]]; then
  echo "$SERVED" >&2
  echo "" >&2
  echo "focus-pass: REFUSED — the instance is not serving this build (see served-build-guard above)" >&2
  echo "focus-pass: the committed record at $TRANSCRIPT is untouched; refresh with rebuild -> vendor -> reinstall" >&2
  exit 3
fi
RELEASE="$(printf '%s' "$SERVED" | sed -n 's/.*serves this build (revision \([^,]*\), \(.*\))/\2, revision \1/p')"

SCRATCH_TRANSCRIPT="$(mktemp "${TMPDIR:-/tmp}/nakama-focus-pass-XXXXXX.txt")"
ARGS=(--url "$NAKAMA_DASHBOARD" --viewport "$VIEWPORT")
[[ "$MODE" == "negative" ]] && ARGS+=(--negative-control)
# `set -e` must not apply to this pipeline: a pass WITH FAILURES is a verdict and must still be recorded.
set +e
{
  echo "# harness/focus-pass.sh — keyboard focus visibility · dataset $DATASET · viewport $VIEWPORT"
  echo "# dashboard: $("$RUNNER" "$HERE/redact-url.mjs" "$NAKAMA_DASHBOARD")"
  echo "# instance: $NAKAMA_URL ($RELEASE)"
  if [[ "$MODE" == "negative" ]]; then
    echo "# negative control: a focus-killing rule is injected, and the pass MUST report failures"
  fi
  echo "# generated: $(date -Is)"
  echo
  "$RUNNER" "$HERE/focus-matrix.mjs" "${ARGS[@]}"
} 2>&1 | tee "$SCRATCH_TRANSCRIPT"
status="${PIPESTATUS[0]}"
set -e

# In negative-control mode the pass is expected to fail: 0 failures means the measure could not see a removed
# indicator, which is the one result that would make every passing class meaningless.
if [[ "$MODE" == "negative" ]]; then
  failures="$(grep -c '^FAIL' "$SCRATCH_TRANSCRIPT" || true)"
  if [[ "$failures" -eq 0 ]]; then
    echo "" >&2
    echo "focus-pass: THE NEGATIVE CONTROL DID NOT FAIL — the measure cannot see a removed focus indicator," >&2
    echo "focus-pass: so its passes prove nothing. Scratch copy: $SCRATCH_TRANSCRIPT" >&2
    exit 1
  fi
  echo ""
  echo "focus-pass: negative control behaved — $failures check(s) failed once indication was removed, so the"
  echo "focus-pass: measure is sensitive. This is the expected outcome for --negative-control."
  status=0
fi

if [[ "$status" -eq 2 || "$status" -eq 3 ]]; then
  why="ABORTED (the pass died mid-run)"
  [[ "$status" -eq 3 ]] && why="REFUSED"
  echo "" >&2
  echo "focus-pass: NOT RECORDED — the pass exited $status: $why" >&2
  echo "focus-pass: the committed record at $TRANSCRIPT is untouched; this run is at $SCRATCH_TRANSCRIPT" >&2
  exit "$status"
fi

cp -f "$SCRATCH_TRANSCRIPT" "$TRANSCRIPT"
exit "$status"
