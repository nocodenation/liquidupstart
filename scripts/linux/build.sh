#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"

# Before any build script, so a switch value that is neither 1 nor 0 costs no image (CS-3).
# shellcheck source=../../config/scripts/start/lib/components.sh
. "${PROJECT_DIR}/config/scripts/start/lib/components.sh"
lu_components_check "$ENV_FILE" || exit 1

# Pass build flags (e.g. --no-cache) through. Use "$@" not an array: bash 3.2
# under `set -u` treats an empty "${ARR[@]}" as unbound, while "$@" is safe.
# A switched-off component is not built, and an image it left behind stays where it is.
if lu_component_on "$ENV_FILE" ENABLE_OPENCODE; then
  "${PROJECT_DIR}/config/scripts/build/opencode.sh" "$@"
fi
"${PROJECT_DIR}/config/scripts/build/bun-runner.sh" "$@"
if lu_component_on "$ENV_FILE" ENABLE_LIQUID; then
  "${PROJECT_DIR}/config/scripts/build/nar-builder.sh" "$@"
  "${PROJECT_DIR}/config/scripts/build/liquid.sh" "$@"
fi
# hermes disabled: not built (re-enable here + start.sh + compose.yml + nginx template + dashboard)
# "${PROJECT_DIR}/config/scripts/build/hermes.sh" "$@"
if lu_component_on "$ENV_FILE" ENABLE_OPENCLAW; then
  "${PROJECT_DIR}/config/scripts/build/openclaw.sh" "$@"
fi

PRIVACY_PROXY_ENABLE="$(grep -E '^PRIVACY_PROXY_ENABLE=' "${PROJECT_DIR}/.env" 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
if [[ "${PRIVACY_PROXY_ENABLE:-0}" = 1 ]]; then
  "${PROJECT_DIR}/config/scripts/build/privacy-proxy.sh" "$@"
fi

echo "Done."
