#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

# Pass build flags (e.g. --no-cache) through. Use "$@" not an array: bash 3.2
# under `set -u` treats an empty "${ARR[@]}" as unbound, while "$@" is safe.
"${PROJECT_DIR}/config/scripts/build/opencode.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/bun-runner.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/nifi.sh" "$@"
# hermes disabled: not built (re-enable here + start.sh + compose.yml + nginx template + dashboard)
# "${PROJECT_DIR}/config/scripts/build/hermes.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/openclaw.sh" "$@"

echo "Done."
