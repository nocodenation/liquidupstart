#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"

docker image rm "all-in-wonder/bun-runner:latest" >/dev/null 2>&1 || true
echo "Building all-in-wonder/bun-runner:latest from ${PROJECT_DIR}/config/bun_runner..."
docker build --no-cache -t "all-in-wonder/bun-runner:latest" "${PROJECT_DIR}/config/bun_runner"

