#!/usr/bin/env bash
set -euo pipefail

# Stop the running stack, then rebuild every image (to pick up updated
# Dockerfiles/sources). Does NOT start the stack again — click Start afterwards.
# down.sh and build.sh each cd to the project root themselves. Flags pass through.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# build.sh refuses a switch value that is neither 1 nor 0, and here that would come after
# down.sh had emptied the stack. Asked first instead, so a refusal stops nothing (CS-3).
# shellcheck source=../../config/scripts/start/lib/components.sh
. "${PROJECT_DIR}/config/scripts/start/lib/components.sh"
if ! lu_components_check "${PROJECT_DIR}/.env"; then
  echo "  Nothing has been stopped; the stack is as it was." >&2
  exit 1
fi

"${SCRIPT_DIR}/down.sh"
"${SCRIPT_DIR}/build.sh" "$@"
