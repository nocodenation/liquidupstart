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

PRIVACY_PROXY_ENABLE="$(grep -E '^PRIVACY_PROXY_ENABLE=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
if [[ "${PRIVACY_PROXY_ENABLE:-0}" != 1 ]]; then
  echo "Error: PRIVACY_PROXY_ENABLE=1 is not set in ${ENV_FILE}" >&2
  exit 1
fi

"${PROJECT_DIR}/config/scripts/build/privacy-proxy.sh" "$@"

LOCAL_LLM_API_BASE="$(grep -E '^LOCAL_LLM_API_BASE=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || true)"
LOCAL_LLM_HOST="${LOCAL_LLM_API_BASE#*://}"
LOCAL_LLM_HOST="${LOCAL_LLM_HOST%%[:/]*}"
export LOCAL_LLM_HOST="${LOCAL_LLM_HOST:-local_llm}"

PP_PORT="$(grep -E '^PRIVACY_PROXY_PORT=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
PP_PORT="${PP_PORT:-8080}"
export COMPOSE_PROFILES="${COMPOSE_PROFILES:+${COMPOSE_PROFILES},}privacy-proxy"
export PRIVACY_PROXY_URL="http://privacy-proxy:${PP_PORT}"

docker compose up -d --no-deps privacy-proxy
