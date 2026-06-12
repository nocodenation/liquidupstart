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

"${PROJECT_DIR}/config/scripts/start/generate_api_key.sh"
"${PROJECT_DIR}/config/scripts/start/pgadmin.sh"
"${PROJECT_DIR}/config/scripts/start/opencode.sh"
"${PROJECT_DIR}/config/scripts/start/nextcloud.sh"
"${PROJECT_DIR}/config/scripts/start/nginx.sh"
"${PROJECT_DIR}/config/scripts/start/nifi.sh"
"${PROJECT_DIR}/config/scripts/start/hermes.sh"
"${PROJECT_DIR}/config/scripts/start/openclaw.sh"


HTTP_PORT="$(grep -E '^SYSTEM_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="$(grep -E '^SYSTEM_HTTPS_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTPS_PORT="${HTTPS_PORT:-8833}"

docker network inspect nocodenation_playground_network_${HTTP_PORT} >/dev/null 2>&1 \
  || docker network create nocodenation_playground_network_${HTTP_PORT}

echo "Starting containers..."
docker compose up -d

PGADMIN_DEFAULT_EMAIL="$(grep -E '^PGADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_USERNAME="$(grep -E '^NIFI_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_PASSWORD="$(grep -E '^NIFI_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HERMES_API_KEY="$(grep -E '^HERMES_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

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
url_line "NiFi"        "https://nifi.localhost:${HTTPS_PORT}"
url_line "Node app"    "http://app.localhost:${HTTP_PORT}        - build an app using OpenClaw first"
url_line "OpenProject" "http://openproject.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Web interfaces = AI Harnesses ================================${RST}"
url_line "Hermes"      "http://hermes.localhost:${HTTP_PORT}"
url_line "OpenClaw"    "http://openclaw.localhost:${HTTP_PORT}   - recommended"
url_line "OpenCode"    "http://opencode.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Logins, passwords & tokens ===================================${RST}"
echo "  Hermes API/Webhooks token:  ${CRED}${HERMES_API_KEY}${RST}"
echo "  NextCloud admin password:   ${CRED}${PGADMIN_DEFAULT_EMAIL}${RST}"
echo "  NiFi username:              ${CRED}${NIFI_USERNAME}${RST}"
echo "  NiFi password:              ${CRED}${NIFI_PASSWORD}${RST}"
echo ""
echo "${HDR}=== Additional endpoints =========================================${RST}"
echo "  ${DIM}Hermes API:                 ${URL}http://api.hermes.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}Hermes webhooks:            ${URL}http://webhooks.hermes.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}NiFi ingresses: ports 8900-8999, served on https://PORT.nifi.localhost:${HTTPS_PORT}${RST}"
echo "  ${DIM}OpenClaw node bridge:       ${URL}http://bridge.openclaw.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}OpenClaw MS Teams endpoint: ${URL}http://msteams.openclaw.localhost:${HTTP_PORT}${RST}"
echo ""
