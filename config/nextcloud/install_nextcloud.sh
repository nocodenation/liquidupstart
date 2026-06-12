#!/usr/bin/env sh
set -eu

OCC="/var/www/html/occ"
PHP_BIN="php"
CONFIG_DIR="/var/www/html/config"

# Nothing to do once installed (the normal case: the official entrypoint
# auto-installs on a pristine html volume before before-starting hooks run).
if ${PHP_BIN} -f "${OCC}" status --output=json 2>/dev/null | grep -q '"installed":true'; then
  echo "Nextcloud already installed"
  exit 0
fi

# The official entrypoint only auto-installs when the html volume carries no
# version.php at all. A single failed/interrupted first install leaves
# version.php + config/CAN_INSTALL behind — after which the entrypoint skips
# installation forever and defers to the web installer, and the occ calls in
# the other before-starting hooks crash the container, wedging the whole
# stack start. Run the installation here instead, with the same env the
# entrypoint would use, so the first successful start always ends installed.
echo "Nextcloud is not installed yet - running maintenance:install..."

# Normally written by the pre-installation hook (config/nextcloud/
# pre_install.sh), which the entrypoint only runs on its own install path —
# ensure it is in place so no user gets default skeleton files.
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

# The web-installer marker must not survive a completed installation (it
# triggers a security warning in the admin panel).
rm -f "${CONFIG_DIR}/CAN_INSTALL"

# The entrypoint registers NEXTCLOUD_TRUSTED_DOMAINS only on its own install
# path; replicate it (index 0 is localhost, written by maintenance:install).
if [ -n "${NEXTCLOUD_TRUSTED_DOMAINS:-}" ]; then
  idx=1
  for domain in ${NEXTCLOUD_TRUSTED_DOMAINS}; do
    ${PHP_BIN} -f "${OCC}" config:system:set trusted_domains "${idx}" --value="${domain}"
    idx=$((idx + 1))
  done
fi

echo "Nextcloud installation complete"
