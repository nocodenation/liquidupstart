#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
ENV_FILE="${PROJECT_DIR}/.env"
CONFIG_DIR="${PROJECT_DIR}/config/nginx"
TEMPLATES_DIR="${CONFIG_DIR}/templates"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

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

CERTS_DIR="${PROJECT_DIR}/volumes/nginx/certs"
mkdir -p "$CERTS_DIR"

if [[ -f "${CERTS_DIR}/nifi.localhost.crt" && -f "${CERTS_DIR}/nifi.localhost.key" ]]; then
    rm "${CERTS_DIR}/nifi.localhost.crt"
    rm "${CERTS_DIR}/nifi.localhost.key"
    echo "Removed old certificates"
fi
echo "Generating self-signed TLS certificate for nifi.localhost..."
openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "${CERTS_DIR}/nifi.localhost.key" \
    -out "${CERTS_DIR}/nifi.localhost.crt" \
    -days 3650 \
    -subj "/CN=nifi.localhost" \
    -addext "subjectAltName=DNS:nifi.localhost,DNS:*.nifi.localhost"
echo "Certificate generated at ${CERTS_DIR}."


for template in "${TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  mkdir -p "$CONFIG_DIR"
  outfile="${CONFIG_DIR}/${filename}"
  echo "Rendering nginx template: ${filename}"
  rm -rf "$outfile"
  render_template "$template" > "$outfile"
  # Replace API_KEY_PLACEHOLDER with API_KEY from .env
  API_KEY="$(grep -E '^API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
  sed_inplace "s|API_KEY_PLACEHOLDER|${API_KEY}|g" "${CONFIG_DIR}/${filename}"
done
