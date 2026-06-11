#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"

# Every `php -f occ` call boots Nextcloud and reads thousands of files, which
# is expensive on Windows bind mounts (~7-10s per call). All settings below are
# idempotent and persisted (DB/config.php), so once the script has completed
# successfully we drop a marker and skip it on subsequent starts. The marker
# lives in the bind-mounted config dir so it survives container recreation.
MARKER="/var/www/html/config/.aiw_proxies_configured"
if [ -f "${MARKER}" ]; then
  echo "trusted_proxies/richdocuments already configured (marker present); skipping"
  exit 0
fi

# Configure trusted_proxies so X-Forwarded-* headers are honored
# Docker network (adjust if your subnet differs)
${PHP_BIN} -f "${OCC}" config:system:set trusted_proxies 0 --value="172.0.0.0/8"

# Ensure https is used in generated URLs
${PHP_BIN} -f "${OCC}" config:system:set overwriteprotocol --value="http"

# Activate the custom filesystem theme (themes/aiw, mounted read-only).
# CSS in themes/aiw/core/css/server.css loads additively on top of defaults.
${PHP_BIN} -f "${OCC}" config:system:set theme --value="aiw"

# Install Nextcloud Office (richdocuments) if not already installed
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

# Collabora / richdocuments configuration
# wopi_url: internal Docker address Nextcloud uses to reach Collabora
# public_wopi_url: address the browser uses to reach Collabora (through nginx)
${PHP_BIN} -f "${OCC}" config:app:set richdocuments wopi_url        --value="http://collabora:9980"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments public_wopi_url  --value="http://nextcloud.localhost:SYSTEM_HTTP_PORT"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments wopi_allowlist   --value="172.0.0.0/8"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments doc_format       --value="ooxml"
# This reaches out to Collabora (wopi_url) for WOPI discovery. It runs in a
# before-starting hook, so if Collabora isn't reachable yet the call can block
# indefinitely and Apache never starts (HTTP 502) — `|| true` doesn't help a
# hang, only a non-zero exit. Bound it with a timeout so startup always proceeds;
# the config values above are already persisted and activation can re-run later.
if timeout 30 ${PHP_BIN} -f "${OCC}" richdocuments:activate-config; then
  # Full success: skip this script on future starts.
  touch "${MARKER}"
else
  echo "WARNING: richdocuments:activate-config did not complete (Collabora unreachable/slow); continuing startup."
  echo "Marker not written; configuration will re-run on next start."
fi

echo "trusted_proxies, overwriteprotocol, and richdocuments configured"