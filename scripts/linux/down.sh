#!/usr/bin/env bash
set -euo pipefail

# docker compose resolves compose.yml from the cwd, so run from the project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "Stopping existing containers..."

# --remove-orphans: a bare `down` acts only on the services the current
# compose.yml declares, so another branch's container (nar_builder, 2026-09-08)
# survived it and compose warned about it on every call. This removes the
# project's containers for services the file does not declare; their state is in
# ./volumes/. A one-off `docker compose run` container that is still running is
# not removed -- measured 2026-10-20. A11-11 holds every teardown to the flag.
# COMPOSE_PROFILES='*': a service that runs only under a profile (privacy-proxy)
# is not "declared" for a bare `down` and survives it, flag or not -- measured
# 2026-10-27 on compose 5.6.1. The wildcard enables every profile for this call
# alone, so it is stopped whether or not .env still enables it.
COMPOSE_PROFILES='*' \
  docker compose down --remove-orphans
