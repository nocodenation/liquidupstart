#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
LOGS_DIR="${PROJECT_DIR}/volumes/logs"
DATA_DIR="${PROJECT_DIR}/volumes/data"

# 5. Ensure log directories exist and are writable by containers that
#    run as non-root (pgadmin_db, postgrest, nginx workers).
for svc in postgres pgadmin_db pgadmin proxy swagger; do
  mkdir -p "${LOGS_DIR}/${svc}"
  chmod 0777 "${LOGS_DIR}/${svc}"
done

mkdir -p "${DATA_DIR}"
chmod 777 "${DATA_DIR}"
