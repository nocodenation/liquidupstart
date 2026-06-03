#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
ENV_FILE="${PROJECT_DIR}/.env"
CONFIG_DIR="${PROJECT_DIR}/config/nifi"
TEMPLATES_DIR="${CONFIG_DIR}/templates"
STATE_DIR="${PROJECT_DIR}/volumes/nifi"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

NIFI_USERNAME=$(grep '^NIFI_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"")
NIFI_PASSWORD=$(grep '^NIFI_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"")

sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

render_template() {
  local content
  content="$(<"$1")"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value//\"/}"
    content="${content//\{\{ ${key} \}\}/${value}}"
  done < "$ENV_FILE"
  printf '%s\n' "$content"
}

if [ -d "$STATE_DIR" ]; then
    echo ""
    echo "State folder already exists at $STATE_DIR"
    echo "Skipping state folder extraction."
else
    echo "Creating state folder and copying directories from image..."
    mkdir -p "$STATE_DIR"
    chmod 777 "$STATE_DIR"

    # Run a temporary container to copy directories
    docker run --rm \
        -e "SINGLE_USER_CREDENTIALS_USERNAME=${NIFI_USERNAME}" \
        -e "SINGLE_USER_CREDENTIALS_PASSWORD=${NIFI_PASSWORD}" \
        -v "${STATE_DIR}":/target \
        --entrypoint /bin/bash \
        all-in-wonder/nifi:latest \
        -c "cp -r /opt/nifi/nifi-current/conf /target/ && \
            cp -r /opt/nifi/nifi-current/database_repository /target/ && \
            cp -r /opt/nifi/nifi-current/flowfile_repository /target/ && \
            cp -r /opt/nifi/nifi-current/content_repository /target/ && \
            cp -r /opt/nifi/nifi-current/provenance_repository /target/ && \
            cp -r /opt/nifi/nifi-current/state /target/"

    echo "State folder created successfully."
fi

