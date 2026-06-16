#!/usr/bin/env bash
set -euo pipefail

# Rebuild = stop the running stack, then rebuild every image. Used to pick up a
# newly pulled version of the project (updated Dockerfiles / sources). It does
# NOT start the stack again — click Start/Restart afterwards.
#
# down.sh and build.sh each cd into the project root on their own, so they are
# safe to call directly from here. Build flags (e.g. --no-cache) pass through.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/down.sh"
"${SCRIPT_DIR}/build.sh" "$@"
