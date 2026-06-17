#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"
PGADMIN_TEMPLATES_DIR="${PROJECT_DIR}/config/pgadmin/templates"
PGADMIN_OUTPUT_DIR="${PROJECT_DIR}/config/pgadmin"
NGINX_TEMPLATES_DIR="${PROJECT_DIR}/config/nginx/templates"
NGINX_OUTPUT_DIR="${PROJECT_DIR}/config/nginx"
NIFI_TEMPLATES_DIR="${PROJECT_DIR}/config/nifi/templates"
NIFI_OUTPUT_DIR="${PROJECT_DIR}/config/nifi"
NEXTCLOUD_TEMPLATES_DIR="${PROJECT_DIR}/config/nextcloud/templates"
NEXTCLOUD_OUTPUT_DIR="${PROJECT_DIR}/config/nextcloud"
HERMES_TEMPLATES_DIR="${PROJECT_DIR}/config/hermes/templates"
HERMES_OUTPUT_DIR="${PROJECT_DIR}/config/hermes"
OPENCLAW_TEMPLATES_DIR="${PROJECT_DIR}/config/openclaw/templates"
OPENCLAW_OUTPUT_DIR="${PROJECT_DIR}/config/openclaw"

# Remove rendered pgadmin config files
for template in "${PGADMIN_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  rm -rf "${PGADMIN_OUTPUT_DIR}/${filename}"
  echo "Removed: config/pgadmin/${filename}"
done

# Remove rendered nginx config files
for template in "${NGINX_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  rm -rf "${NGINX_OUTPUT_DIR}/${filename}"
  echo "Removed: config/nginx/${filename}"
done

# Remove rendered nextcloud config files
for template in "${NEXTCLOUD_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  rm -rf "${NEXTCLOUD_OUTPUT_DIR}/${filename}"
  echo "Removed: config/nextcloud/${filename}"
done

# Remove rendered nifi config files
for template in "${NIFI_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(basename "$template")"
  rm -rf "${NIFI_OUTPUT_DIR}/${filename}"
  echo "Removed: config/nifi/${filename}"
done

# Map a template basename to its rendered filename. Most are same-named, but
# env_template renders to .env.
rendered_name() {
  case "$1" in
    env_template) echo ".env" ;;
    *) echo "$1" ;;
  esac
}

# Remove rendered hermes config files
for template in "${HERMES_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(rendered_name "$(basename "$template")")"
  rm -rf "${HERMES_OUTPUT_DIR}/${filename}"
  echo "Removed: config/hermes/${filename}"
done

# Remove rendered openclaw config files
for template in "${OPENCLAW_TEMPLATES_DIR}"/*; do
  [[ -f "$template" ]] || continue
  filename="$(rendered_name "$(basename "$template")")"
  rm -rf "${OPENCLAW_OUTPUT_DIR}/${filename}"
  echo "Removed: config/openclaw/${filename}"
done
