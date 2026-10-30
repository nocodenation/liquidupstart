#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck source=../../config/scripts/start/lib/components.sh
. "${PROJECT_DIR}/config/scripts/start/lib/components.sh"
if ! lu_privacy_proxy_on "$ENV_FILE"; then
  echo "Error: PRIVACY_PROXY_ENABLE=1 is not set in ${ENV_FILE}" >&2
  exit 1
fi

"${PROJECT_DIR}/config/scripts/build/privacy-proxy.sh" "$@"

LOCAL_LLM_API_BASE="$(grep -E '^LOCAL_LLM_API_BASE=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || true)"
LOCAL_LLM_HOST="${LOCAL_LLM_API_BASE#*://}"
LOCAL_LLM_HOST="${LOCAL_LLM_HOST%%[:/]*}"
export LOCAL_LLM_HOST="${LOCAL_LLM_HOST:-local_llm}"

export COMPOSE_PROFILES="${COMPOSE_PROFILES:+${COMPOSE_PROFILES},}privacy-proxy"
# The proxy listens on its built-in port 8080 inside the stack network.
export PRIVACY_PROXY_URL="http://privacy-proxy:8080"

docker compose up -d --no-deps privacy-proxy
