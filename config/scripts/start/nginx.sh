#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
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

STORE_PASSWORD="$(grep -E '^NIFI_KEYSTORE_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

echo "Generating NiFi keystore (PKCS12)..."
rm -f "${CERTS_DIR}/nifi.keystore.p12"
openssl pkcs12 -export \
    -in "${CERTS_DIR}/nifi.localhost.crt" \
    -inkey "${CERTS_DIR}/nifi.localhost.key" \
    -out "${CERTS_DIR}/nifi.keystore.p12" \
    -name "nifi-ingress" \
    -passout "pass:${STORE_PASSWORD}"

echo "Generating NiFi truststore (PKCS12)..."
rm -f "${CERTS_DIR}/nifi.truststore.p12"
# keytool is a Java tool: it decodes file paths/argv with the locale's charset
# (sun.jnu.encoding). On a non-UTF-8 locale - the toolbox's Debian default is
# ANSI_X3.4-1968 - a non-ASCII project path (e.g. ".../Geschäft/...") is mangled
# to "?" and keytool can't find the cert. Force a UTF-8 locale so paths survive.
if command -v keytool &>/dev/null; then
    LC_ALL=C.UTF-8 keytool -importcert -trustcacerts \
        -alias "nifi-ingress" \
        -file "${CERTS_DIR}/nifi.localhost.crt" \
        -keystore "${CERTS_DIR}/nifi.truststore.p12" \
        -storetype PKCS12 \
        -storepass "${STORE_PASSWORD}" \
        -noprompt
else
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        -e LC_ALL=C.UTF-8 \
        -v "${CERTS_DIR}:/certs" \
        eclipse-temurin:17-jre-jammy \
        keytool -importcert -trustcacerts \
            -alias "nifi-ingress" \
            -file "/certs/nifi.localhost.crt" \
            -keystore "/certs/nifi.truststore.p12" \
            -storetype PKCS12 \
            -storepass "${STORE_PASSWORD}" \
            -noprompt
fi
chmod 644 "${CERTS_DIR}/nifi.keystore.p12" "${CERTS_DIR}/nifi.truststore.p12"
echo "Keystore/truststore generated. Password: ${STORE_PASSWORD}"


API_KEY="$(grep -E '^API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="$(grep -E '^SYSTEM_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTPS_PORT="$(grep -E '^SYSTEM_HTTPS_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="${HTTPS_PORT:-8833}"

for template in "${TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  mkdir -p "$CONFIG_DIR"
  outfile="${CONFIG_DIR}/${filename}"
  echo "Rendering nginx template: ${filename}"
  rm -rf "$outfile"
  render_template "$template" > "$outfile"
  sed_inplace "s|API_KEY_PLACEHOLDER|${API_KEY}|g" "${CONFIG_DIR}/${filename}"
  sed_inplace "s|SYSTEM_HTTP_PORT|${HTTP_PORT}|g" "${CONFIG_DIR}/${filename}"
  sed_inplace "s|SYSTEM_HTTPS_PORT|${HTTPS_PORT}|g" "${CONFIG_DIR}/${filename}"
done


NGINX_CONF="${CONFIG_DIR}/nginx.conf"

if [[ -f "$NGINX_CONF" ]]; then
    echo "Generating NiFi ingress server blocks in nginx config..."

    ingress_blocks=$(mktemp)

    for port in $(seq 8900 8999); do
        cat >> "$ingress_blocks" <<EOF

server {
    listen ${HTTPS_PORT} ssl;

    server_name ${port}.nifi.localhost;

    ssl_certificate     /etc/nginx/certs/nifi.localhost.crt;
    ssl_certificate_key /etc/nginx/certs/nifi.localhost.key;
    ssl_protocols       TLSv1.3;

    location / {
        proxy_pass https://nifi:${port};
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_ssl_name \$host;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_http_version 1.1;

        proxy_read_timeout 300s;
        client_max_body_size 0;
    }
}
EOF
    done

    awk -v blocks="$ingress_blocks" '
        /# NIFI INGRESS/ {
            print
            while ((getline line < blocks) > 0) print line
            next
        }
        { print }
    ' "$NGINX_CONF" > "${NGINX_CONF}.tmp" && mv "${NGINX_CONF}.tmp" "$NGINX_CONF"

    rm -f "$ingress_blocks"
    echo "NiFi ingress server blocks generated."
fi
