#!/usr/bin/env bash
set -euo pipefail

# docker compose resolves compose.yml from the cwd, so run from the project root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "Stopping existing containers..."
COMPOSE_PROFILES="$(docker compose config --profiles 2>/dev/null | paste -sd, -)" \
  docker compose down
