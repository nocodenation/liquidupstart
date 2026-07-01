#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"
NGINX_TEMPLATES_DIR="${PROJECT_DIR}/config/nginx/templates"
NGINX_OUTPUT_DIR="${PROJECT_DIR}/config/nginx"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

"${PROJECT_DIR}/scripts/linux/down.sh"

# --- Pre-flight: the host ports the proxy publishes must be free -------------
# If SYSTEM_HTTP_PORT / SYSTEM_HTTPS_PORT are taken, `docker compose up` leaves
# a half-started stack. Probe each via a throwaway container: the bind happens
# on the real host, so this works from inside the Windows/macOS toolbox too. Our
# proxy was just stopped by down.sh, so a conflict here is some other process.
HTTP_PORT="$(grep -E '^SYSTEM_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="$(grep -E '^SYSTEM_HTTPS_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTPS_PORT="${HTTPS_PORT:-8833}"

LOCAL_LLM_API_BASE="$(grep -E '^LOCAL_LLM_API_BASE=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || true)"
LOCAL_LLM_HOST="${LOCAL_LLM_API_BASE#*://}"
LOCAL_LLM_HOST="${LOCAL_LLM_HOST%%[:/]*}"
export LOCAL_LLM_HOST="${LOCAL_LLM_HOST:-local_llm}"
PROBE_IMAGE=""
for _img in nginx:latest liquidupstart/liquid:latest liquidupstart/openclaw:latest \
            liquidupstart/bun-runner:latest liquidupstart/opencode:latest \
            liquidupstart/toolbox:latest; do
  if docker image inspect "$_img" >/dev/null 2>&1; then PROBE_IMAGE="$_img"; break; fi
done

port_taken() {
  # 0 = taken, 1 = free (or undeterminable — never block on that).
  local port="$1" out rc
  set +e
  out="$(docker run --rm --entrypoint true -p "${port}:1" "$PROBE_IMAGE" 2>&1)"
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    return 1
  elif printf '%s' "$out" | grep -qiE 'already allocated|address already in use|bind for|failed to (bind|set up)'; then
    return 0
  else
    return 1
  fi
}

if [[ -n "$PROBE_IMAGE" ]]; then
  _taken=""
  for _pair in "SYSTEM_HTTP_PORT:${HTTP_PORT}" "SYSTEM_HTTPS_PORT:${HTTPS_PORT}"; do
    if port_taken "${_pair##*:}"; then
      echo "Error: port ${_pair##*:} (${_pair%%:*}) is already in use on this machine." >&2
      _taken="${_taken:+${_taken}, }${_pair##*:} (${_pair%%:*})"
    fi
  done
  if [[ -n "$_taken" ]]; then
    echo "" >&2
    echo "Another program — or another copy of this stack — is holding the port(s) above," >&2
    echo "so the services can't start. Stop whatever is using them and start again. These" >&2
    echo "ports are fixed after the initial setup, so the stack must use them." >&2
    # ::aiw-error:: lines: the dashboard turns these into an on-screen error banner.
    echo "::aiw-error::Ports already in use: ${_taken}. Another program — or another copy of this stack — is holding them. Stop whatever is using those ports and start again; the ports are fixed after initial setup." >&2
    exit 1
  fi
fi
# ----------------------------------------------------------------------------

"${PROJECT_DIR}/config/scripts/start/generate_api_key.sh"
"${PROJECT_DIR}/config/scripts/start/pgadmin.sh"
"${PROJECT_DIR}/config/scripts/start/opencode.sh"
"${PROJECT_DIR}/config/scripts/start/nextcloud.sh"
"${PROJECT_DIR}/config/scripts/start/nginx.sh"
"${PROJECT_DIR}/config/scripts/start/liquid.sh"
# hermes disabled: not started
# "${PROJECT_DIR}/config/scripts/start/hermes.sh"
"${PROJECT_DIR}/config/scripts/start/openclaw.sh"


docker network inspect nocodenation_playground_network_${HTTP_PORT} >/dev/null 2>&1 \
  || docker network create nocodenation_playground_network_${HTTP_PORT}

PRIVACY_GATEWAY_ENABLE="$(grep -E '^PRIVACY_GATEWAY_ENABLE=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
if [[ "${PRIVACY_GATEWAY_ENABLE:-0}" = 1 ]]; then
  PG_PORT="$(grep -E '^PRIVACY_GATEWAY_PORT=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"")"
  PG_PORT="${PG_PORT:-8080}"
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:+${COMPOSE_PROFILES},}privacy-gateway"
  export PRIVACY_GATEWAY_ANTHROPIC_URL="http://privacy-gateway:${PG_PORT}/anthropic"
  export PRIVACY_GATEWAY_OPENAI_URL="http://privacy-gateway:${PG_PORT}/openai/v1"

  env_flag() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true; }
  if [[ "$(env_flag ENABLE_XAI_GROK)" = 1 || "$(env_flag ENABLE_GITHUB_COPILOT)" = 1 || "$(env_flag ENABLE_OPENAI_CODEX)" = 1 ]]; then
    export PRIVACY_GATEWAY_NODE_CA="/pg-ca/ca.crt"
  fi
fi

echo "Starting containers..."
docker compose up -d

PGADMIN_DEFAULT_EMAIL="$(grep -E '^PGADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
LIQUID_USERNAME="$(grep -E '^LIQUID_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
LIQUID_PASSWORD="$(grep -E '^LIQUID_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
# hermes disabled: HERMES_API_KEY="$(grep -E '^HERMES_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

# Colors only when stdout is a terminal (stays plain when piped/redirected).
if [[ -t 1 ]]; then
  HDR=$'\033[1;32m'   # bold green  - section headers
  SVC=$'\033[1m'      # bold        - service names
  URL=$'\033[36m'     # cyan        - URLs
  CRED=$'\033[1;33m'  # bold yellow - passwords/tokens
  DIM=$'\033[2m'      # dim         - secondary info
  RST=$'\033[0m'
else
  HDR='' SVC='' URL='' CRED='' DIM='' RST=''
fi

url_line() { printf "  ${SVC}%-13s${RST} ${URL}%s${RST}\n" "$1" "$2"; }

echo ""
echo "${HDR}=== Web interfaces = Storage =====================================${RST}"
url_line "NextCloud"   "http://nextcloud.localhost:${HTTP_PORT}"
url_line "pgAdmin"     "http://pgadmin.localhost:${HTTP_PORT}"
url_line "REST API"    "http://postgrest.localhost:${HTTP_PORT}"
url_line "Swagger UI"  "http://swagger.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Web interfaces = Applications ================================${RST}"
url_line "Liquid"        "https://liquid.localhost:${HTTPS_PORT}"
url_line "Node app"    "http://app.localhost:${HTTP_PORT}        - build an app using OpenClaw first"
url_line "OpenProject" "http://openproject.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Web interfaces = AI Harnesses ================================${RST}"
# hermes disabled: url_line "Hermes"      "http://hermes.localhost:${HTTP_PORT}"
url_line "OpenClaw"    "http://openclaw.localhost:${HTTP_PORT}   - recommended"
url_line "OpenCode"    "http://opencode.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Logins, passwords & tokens ===================================${RST}"
# hermes disabled: echo "  Hermes API/Webhooks token:  ${CRED}${HERMES_API_KEY}${RST}"
echo "  NextCloud admin password:   ${CRED}${PGADMIN_DEFAULT_EMAIL}${RST}"
echo "  Liquid username:              ${CRED}${LIQUID_USERNAME}${RST}"
echo "  Liquid password:              ${CRED}${LIQUID_PASSWORD}${RST}"
echo ""
echo "${HDR}=== Additional endpoints =========================================${RST}"
# hermes disabled: echo "  ${DIM}Hermes API:                 ${URL}http://api.hermes.localhost:${HTTP_PORT}${RST}"
# hermes disabled: echo "  ${DIM}Hermes webhooks:            ${URL}http://webhooks.hermes.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}Liquid ingresses: ports 8900-8999, served on https://PORT.liquid.localhost:${HTTPS_PORT}${RST}"
echo "  ${DIM}OpenClaw node bridge:       ${URL}http://bridge.openclaw.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}OpenClaw MS Teams endpoint: ${URL}http://msteams.openclaw.localhost:${HTTP_PORT}${RST}"
echo ""
