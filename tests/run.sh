#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LEVELS="unit component contract integration system"

# Bun defaults to five seconds per test. Tests here shell out to docker, to git
# and to the network, and under the full suite that default is exceeded for
# reasons unrelated to the code -- an intermittently red suite teaches everyone
# to ignore red. Raised in one place rather than per test.
TEST_TIMEOUT_MS="${TEST_TIMEOUT_MS:-60000}"

MILESTONE=""
ROOT="$SCRIPT_DIR"
LIST=0
NO_SYSTEM=0
DASHBOARD_ONLY=0
ROOT_GIVEN=0

usage() {
  cat <<'USAGE'
Usage: tests/run.sh [milestone] [options]

  milestone        run only files named m-<milestone>.*.test.ts
  --list           print the files that would run, then exit
  --no-system      skip tests that need the running stack
  --dashboard      run only the dashboard suite
  --root DIR       discover tests under DIR instead of tests/
  -h, --help       this text
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list) LIST=1 ;;
    --no-system) NO_SYSTEM=1 ;;
    --dashboard) DASHBOARD_ONLY=1 ;;
    --root)
      [[ $# -ge 2 ]] || { echo "--root needs a directory" >&2; exit 2; }
      ROOT="$2"; ROOT_GIVEN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) MILESTONE="$1" ;;
  esac
  shift
done

run_dashboard() {
  echo "--- dashboard suite ---"
  (cd "${REPO_DIR}/dashboard" && bun test --timeout "$TEST_TIMEOUT_MS" src)
}

if [[ $DASHBOARD_ONLY -eq 1 ]]; then
  status=0
  run_dashboard || status=$?
  exit $status
fi

if [[ ! -d "$ROOT" ]]; then
  echo "test root not found: ${ROOT}" >&2
  exit 2
fi

if [[ -n "$MILESTONE" ]]; then
  case "$MILESTONE" in
    m-*) PATTERN="${MILESTONE}.*.test.ts" ;;
    *) PATTERN="m-${MILESTONE}.*.test.ts" ;;
  esac
else
  PATTERN="*.test.ts"
fi

SYSTEM_FILES=()
OTHER_FILES=()
for level in $LEVELS; do
  dir="${ROOT}/${level}"
  [[ -d "$dir" ]] || continue
  while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    if [[ "$level" == "system" ]]; then
      SYSTEM_FILES+=("$f")
    else
      OTHER_FILES+=("$f")
    fi
  done < <(find "$dir" -type f -name "$PATTERN" | sort)
done

system_count=${#SYSTEM_FILES[@]}
other_count=${#OTHER_FILES[@]}
total=$((system_count + other_count))

if [[ $total -eq 0 ]]; then
  echo "no tests matched (root=${ROOT}, pattern=${PATTERN})" >&2
  exit 2
fi

SELECTED=()
if [[ $NO_SYSTEM -eq 1 ]]; then
  [[ $other_count -gt 0 ]] && SELECTED=("${OTHER_FILES[@]}")
else
  [[ $other_count -gt 0 ]] && SELECTED=("${OTHER_FILES[@]}")
  [[ $system_count -gt 0 ]] && SELECTED=(${SELECTED[@]+"${SELECTED[@]}"} "${SYSTEM_FILES[@]}")
fi

if [[ ${#SELECTED[@]} -eq 0 ]]; then
  echo "SKIPPED: ${system_count} system test file(s) need the running stack; nothing else matched."
  exit 0
fi

if [[ $LIST -eq 1 ]]; then
  printf '%s\n' "${SELECTED[@]}"
  exit 0
fi

status=0
bun test --timeout "$TEST_TIMEOUT_MS" "${SELECTED[@]}" || status=$?

if [[ $status -eq 0 && -z "$MILESTONE" && $ROOT_GIVEN -eq 0 ]]; then
  run_dashboard || status=$?
fi

exit $status
