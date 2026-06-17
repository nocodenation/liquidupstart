#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOGS_DIR="${PROJECT_DIR}/volumes/logs"
DATA_DIR="${PROJECT_DIR}/volumes/data"

# Log dirs must be writable by containers that run as non-root.
for svc in postgres pgadmin_db pgadmin proxy swagger; do
  mkdir -p "${LOGS_DIR}/${svc}"
  chmod 0777 "${LOGS_DIR}/${svc}"
done

mkdir -p "${DATA_DIR}"
chmod 777 "${DATA_DIR}"
