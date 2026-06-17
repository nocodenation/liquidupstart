#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"

# Each `php -f occ` call is slow on Windows bind mounts (~7-10s). Settings below
# are idempotent/persisted, so on success drop a marker and skip future starts.
# Marker lives in the bind-mounted config dir to survive container recreation.
MARKER="/var/www/html/config/.aiw_proxies_configured"
if [ -f "${MARKER}" ]; then
  echo "trusted_proxies/richdocuments already configured (marker present); skipping"
  exit 0
fi

# trusted_proxies so X-Forwarded-* headers are honored (adjust if subnet differs).
${PHP_BIN} -f "${OCC}" config:system:set trusted_proxies 0 --value="172.0.0.0/8"

${PHP_BIN} -f "${OCC}" config:system:set overwriteprotocol --value="http"

# Activate the custom filesystem theme (themes/aiw); CSS loads additively.
${PHP_BIN} -f "${OCC}" config:system:set theme --value="aiw"

if ${PHP_BIN} -f "${OCC}" app:list --output=json | grep -q '"richdocuments"'; then
  echo "Nextcloud Office already installed"
else
  echo "Installing Nextcloud Office..."
  for i in 1 2 3 4 5; do
    if ${PHP_BIN} -f "${OCC}" app:install richdocuments; then
      echo "Nextcloud Office installed"
      break
    fi
    echo "Install failed, retrying in 10s... (attempt ${i}/5)"
    sleep 10
  done
fi

# Collabora / richdocuments config.
# wopi_url: internal address Nextcloud uses; public_wopi_url: browser address (via nginx).
${PHP_BIN} -f "${OCC}" config:app:set richdocuments wopi_url        --value="http://collabora:9980"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments public_wopi_url  --value="http://nextcloud.localhost:SYSTEM_HTTP_PORT"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments wopi_allowlist   --value="172.0.0.0/8"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments doc_format       --value="ooxml"
# WOPI discovery reaches out to Collabora; if it's unreachable the call hangs
# and Apache never starts (502), and `|| true` can't catch a hang. Bound it with
# a timeout; config above is persisted so activation can re-run later.
if timeout 30 ${PHP_BIN} -f "${OCC}" richdocuments:activate-config; then
  # Full success: skip this script on future starts.
  touch "${MARKER}"
else
  echo "WARNING: richdocuments:activate-config did not complete (Collabora unreachable/slow); continuing startup."
  echo "Marker not written; configuration will re-run on next start."
fi

echo "trusted_proxies, overwriteprotocol, and richdocuments configured"