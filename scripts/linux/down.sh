#!/usr/bin/env bash
set -euo pipefail

# docker compose resolves compose.yml from the cwd, so run from the project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "Stopping existing containers..."
# Toolbox containers are started with `docker run`, outside compose, so `down`
# never sees them; remove them here, sparing the one this script may run in.
docker ps --filter 'name=^aiw-toolbox-' --format '{{.ID}} {{.Names}}' \
  | awk -v self="$(hostname)" '$1 != self { print $1 }' \
  | xargs -r docker rm -f >/dev/null

# Every profile is passed so a service that only runs under one (privacy-proxy)
# is stopped too, whether or not .env still enables it.
# --remove-orphans: a bare `down` acts only on the services the current
# compose.yml declares, so another branch's container (nar_builder, 2026-09-08)
# survived it and compose warned about it on every call. This removes the
# project's containers for services the file does not declare; their state is in
# ./volumes/. A one-off `docker compose run` container that is still running is
# not removed -- measured 2026-10-20. A11-11 holds every teardown to the flag.
COMPOSE_PROFILES="$(docker compose config --profiles 2>/dev/null | paste -sd, -)" \
  docker compose down --remove-orphans
