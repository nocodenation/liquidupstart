#!/usr/bin/env bash
set -euo pipefail

# docker compose resolves compose.yml from the cwd - run from the project root
# regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

echo "Stopping existing containers..."
docker compose down
