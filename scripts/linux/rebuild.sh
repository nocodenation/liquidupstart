#!/usr/bin/env bash
set -euo pipefail

# Stop the running stack, then rebuild every image (to pick up updated
# Dockerfiles/sources). Does NOT start the stack again — click Start afterwards.
# down.sh and build.sh each cd to the project root themselves. Flags pass through.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/down.sh"
"${SCRIPT_DIR}/build.sh" "$@"
