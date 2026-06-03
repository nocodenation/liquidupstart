#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/config/scripts/build/opencode.sh"
"${SCRIPT_DIR}/config/scripts/build/bun-runner.sh"
"${SCRIPT_DIR}/config/scripts/build/nifi.sh"

echo "Done."
