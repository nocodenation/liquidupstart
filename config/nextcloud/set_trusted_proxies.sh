#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"

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
${PHP_BIN} -f "${OCC}" config:app:set richdocuments public_wopi_url  --value="http://nextcloud.localhost:8888"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments wopi_allowlist   --value="172.0.0.0/8"
${PHP_BIN} -f "${OCC}" config:app:set richdocuments doc_format       --value="ooxml"
${PHP_BIN} -f "${OCC}" richdocuments:activate-config || true

echo "trusted_proxies, overwriteprotocol, and richdocuments configured"