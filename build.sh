#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Pass through build flags (e.g. --no-cache) to each build script. Use "$@"
# directly rather than an intermediate array: under `set -u`, macOS's bash 3.2
# treats expanding an empty array ("${ARR[@]}") as an unbound variable, whereas
# "$@" is safe when empty on every bash.
"${SCRIPT_DIR}/config/scripts/build/opencode.sh" "$@"
"${SCRIPT_DIR}/config/scripts/build/bun-runner.sh" "$@"
"${SCRIPT_DIR}/config/scripts/build/nifi.sh" "$@"
"${SCRIPT_DIR}/config/scripts/build/hermes.sh" "$@"
"${SCRIPT_DIR}/config/scripts/build/openclaw.sh" "$@"

echo "Done."
