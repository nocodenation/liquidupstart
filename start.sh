#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
NGINX_TEMPLATES_DIR="${SCRIPT_DIR}/config/nginx/templates"
NGINX_OUTPUT_DIR="${SCRIPT_DIR}/config/nginx"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

"${SCRIPT_DIR}/down.sh"

"${SCRIPT_DIR}/config/scripts/start/generate_api_key.sh"
"${SCRIPT_DIR}/config/scripts/start/pgadmin.sh"
"${SCRIPT_DIR}/config/scripts/start/opencode.sh"
"${SCRIPT_DIR}/config/scripts/start/nextcloud.sh"
"${SCRIPT_DIR}/config/scripts/start/nginx.sh"
"${SCRIPT_DIR}/config/scripts/start/nifi.sh"


HTTP_PORT="$(grep -E '^SYSTEM_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="$(grep -E '^SYSTEM_HTTPS_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTPS_PORT="${HTTP_PORT:-8888}"

docker network inspect nocodenation_playground_network_${HTTP_PORT} >/dev/null 2>&1 \
  || docker network create nocodenation_playground_network_${HTTP_PORT}

echo "Starting containers..."
docker compose up -d

PGADMIN_DEFAULT_EMAIL="$(grep -E '^PGADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_USERNAME="$(grep -E '^NIFI_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_PASSWORD="$(grep -E '^NIFI_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

echo "pgAdmin is available on:          http://pgadmin.localhost:${HTTP_PORT}"
echo "REST interface is available on:   http://postgrest.localhost:${HTTP_PORT}"
echo "Swagger UI is available on:       http://swagger.localhost:${HTTP_PORT}"
echo "OpenCode is available on:         http://opencode.localhost:${HTTP_PORT}"
echo "Node app is available on:         http://app.localhost:${HTTP_PORT}"
echo "OpenProject is available on:      http://openproject.localhost:${HTTP_PORT}"
echo ""
echo "NextCloud is available on:        http://nextcloud.localhost:${HTTP_PORT}"
echo "        password for NextCloud admin actions is: ${PGADMIN_DEFAULT_EMAIL}"
echo ""
echo "NiFi is available on:             https://nifi.localhost:${HTTPS_PORT}"
echo "        username: ${NIFI_USERNAME}"
echo "        password: ${NIFI_PASSWORD}"
echo "                ports 8900-8999 are available for ingresses"
echo "                ingress will be available on https://PORT.nifi.localhost:${HTTPS_PORT}"
echo ""
echo "Added (but not integrated) hermes"
echo "        Web UI:                           http://localhost:9119"
echo "        OpenAI Compatible API endpoint:   http://localhost:8642"
