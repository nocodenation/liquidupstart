#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

# Pass build flags (e.g. --no-cache) through. Use "$@" not an array: bash 3.2
# under `set -u` treats an empty "${ARR[@]}" as unbound, while "$@" is safe.
"${PROJECT_DIR}/config/scripts/build/opencode.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/bun-runner.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/liquid.sh" "$@"
# hermes disabled: not built (re-enable here + start.sh + compose.yml + nginx template + dashboard)
# "${PROJECT_DIR}/config/scripts/build/hermes.sh" "$@"
"${PROJECT_DIR}/config/scripts/build/openclaw.sh" "$@"

PRIVACY_GATEWAY_ENABLE="$(grep -E '^PRIVACY_GATEWAY_ENABLE=' "${PROJECT_DIR}/.env" 2>/dev/null | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
if [[ "${PRIVACY_GATEWAY_ENABLE:-0}" = 1 ]]; then
  "${PROJECT_DIR}/config/scripts/build/privacy-gateway.sh" "$@"
fi

echo "Done."
