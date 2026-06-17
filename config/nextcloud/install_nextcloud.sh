#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"
CONFIG_DIR="/var/www/html/config"

# Nothing to do once installed (normal case: the entrypoint auto-installs first).
if ${PHP_BIN} -f "${OCC}" status --output=json 2>/dev/null | grep -q '"installed":true'; then
  echo "Nextcloud already installed"
  exit 0
fi

# The entrypoint auto-installs only when no version.php exists; an interrupted
# first install leaves version.php behind and it then skips install forever,
# wedging later occ hooks. Install here (same env) so the first start completes.
echo "Nextcloud is not installed yet - running maintenance:install..."

# Normally written by pre_install.sh (only run on the entrypoint's install
# path); place it here so no user gets default skeleton files.
if [ ! -f "${CONFIG_DIR}/no_skeleton.config.php" ] && [ -f /tmp/no_skeleton.config.php ]; then
  cp /tmp/no_skeleton.config.php "${CONFIG_DIR}/no_skeleton.config.php"
  chmod 644 "${CONFIG_DIR}/no_skeleton.config.php"
fi

${PHP_BIN} -f "${OCC}" maintenance:install \
  --database pgsql \
  --database-name "${POSTGRES_DB}" \
  --database-host "${POSTGRES_HOST}" \
  --database-user "${POSTGRES_USER}" \
  --database-pass "${POSTGRES_PASSWORD}" \
  --admin-user "${NEXTCLOUD_ADMIN_USER}" \
  --admin-pass "${NEXTCLOUD_ADMIN_PASSWORD}"

# CAN_INSTALL must not survive install — it triggers an admin security warning.
rm -f "${CONFIG_DIR}/CAN_INSTALL"

# Replicate NEXTCLOUD_TRUSTED_DOMAINS (index 0 = localhost from maintenance:install).
if [ -n "${NEXTCLOUD_TRUSTED_DOMAINS:-}" ]; then
  idx=1
  for domain in ${NEXTCLOUD_TRUSTED_DOMAINS}; do
    ${PHP_BIN} -f "${OCC}" config:system:set trusted_domains "${idx}" --value="${domain}"
    idx=$((idx + 1))
  done
fi

echo "Nextcloud installation complete"
