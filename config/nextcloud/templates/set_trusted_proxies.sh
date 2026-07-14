#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"

# Each `php -f occ` call is slow on Windows bind mounts (~7-10s). Settings below
# are idempotent/persisted, so on success drop a marker and skip future starts.
# Marker lives in the bind-mounted config dir to survive container recreation.
MARKER="/var/www/html/config/.aiw_eurooffice_configured"
if [ -f "${MARKER}" ]; then
  echo "trusted_proxies/eurooffice already configured (marker present); skipping"
  exit 0
fi

# trusted_proxies so X-Forwarded-* headers are honored (adjust if subnet differs).
${PHP_BIN} -f "${OCC}" config:system:set trusted_proxies 0 --value="172.0.0.0/8"

${PHP_BIN} -f "${OCC}" config:system:set overwriteprotocol --value="http"

# Activate the custom filesystem theme (themes/aiw); CSS loads additively.
${PHP_BIN} -f "${OCC}" config:system:set theme --value="aiw"

if ${PHP_BIN} -f "${OCC}" app:list --output=json | grep -q '"eurooffice"'; then
  echo "Euro-Office connector already installed"
  INSTALLED=1
else
  echo "Installing Euro-Office connector..."
  INSTALLED=0
  for i in 1 2 3 4 5; do
    if ${PHP_BIN} -f "${OCC}" app:install eurooffice; then
      echo "Euro-Office connector installed"
      INSTALLED=1
      break
    fi
    echo "Install failed, retrying in 10s... (attempt ${i}/5)"
    sleep 10
  done
fi

${PHP_BIN} -f "${OCC}" app:disable richdocuments 2>/dev/null || true

${PHP_BIN} -f "${OCC}" config:app:set eurooffice DocumentServerUrl         --value="http://eurooffice.localhost:SYSTEM_HTTP_PORT/"
${PHP_BIN} -f "${OCC}" config:app:set eurooffice DocumentServerInternalUrl --value="http://eurooffice:80/"
${PHP_BIN} -f "${OCC}" config:app:set eurooffice StorageUrl                --value="http://nextcloud.localhost:SYSTEM_HTTP_PORT/"
${PHP_BIN} -f "${OCC}" config:app:set eurooffice jwt_secret                --value="eurooffice-liquidupstart-local-jwt-secret-0123456789abcdef"

if [ "${INSTALLED}" = "1" ]; then
  touch "${MARKER}"
else
  echo "WARNING: eurooffice app install did not complete; configuration will re-run on next start."
fi

echo "trusted_proxies, overwriteprotocol, and eurooffice configured"