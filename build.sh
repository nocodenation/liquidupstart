#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pass through build flags (e.g. --no-cache) to each build script.
BUILD_ARGS=("$@")

"${SCRIPT_DIR}/config/scripts/build/opencode.sh" "${BUILD_ARGS[@]}"
"${SCRIPT_DIR}/config/scripts/build/bun-runner.sh" "${BUILD_ARGS[@]}"
"${SCRIPT_DIR}/config/scripts/build/nifi.sh" "${BUILD_ARGS[@]}"
#"${SCRIPT_DIR}/config/scripts/build/hermes.sh" "${BUILD_ARGS[@]}"

echo "Done."
