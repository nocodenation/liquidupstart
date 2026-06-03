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
"${SCRIPT_DIR}/config/scripts/start/nginx.sh"
"${SCRIPT_DIR}/config/scripts/start/nifi.sh"

# 6. Ensure shared network exists
docker network inspect nocodenation_playground_network >/dev/null 2>&1 \
  || docker network create nocodenation_playground_network

# 7. Start containers
echo "Starting containers..."
docker compose up -d

PGADMIN_DEFAULT_EMAIL="$(grep -E '^PGADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_USERNAME="$(grep -E '^NIFI_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
NIFI_PASSWORD="$(grep -E '^NIFI_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

echo "pgAdmin is available on:          http://pgadmin.localhost:8888"
echo "REST interface is available on:   http://postgrest.localhost:8888"
echo "Swagger UI is available on:       http://swagger.localhost:8888"
echo "OpenCode is available on:         http://opencode.localhost:8888"
echo "Node app is available on:         http://app.localhost:8888"
echo "OpenProject is available on:      http://openproject.localhost:8888"
echo ""
echo "NextCloud is available on:        http://nextcloud.localhost:8888"
echo "        password for NextCloud admin actions is: ${PGADMIN_DEFAULT_EMAIL}"
echo ""
echo "NiFi is available on:             https://nifi.localhost:8888"
echo "        username: ${NIFI_USERNAME}"
echo "        password: ${NIFI_PASSWORD}"
echo "                ports 8900-8999 are available for ingresses"
echo "                ingress will be available on https://nifi.localhost:PORT"
echo ""
echo "Added (but not integrated) hermes"
echo "        Web UI:                           http://localhost:9119"
echo "        OpenAI Compatible API endpoint:   http://localhost:8642"
