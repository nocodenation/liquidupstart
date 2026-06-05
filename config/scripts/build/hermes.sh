#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"

# Enable --no-cache only when passed in (e.g. by build.sh).
NO_CACHE=""
for arg in "$@"; do
    [ "$arg" = "--no-cache" ] && NO_CACHE="--no-cache"
done

docker image rm "all-in-wonder/hermes:latest" >/dev/null 2>&1 || true
echo "Building all-in-wonder/hermes:latest from ${PROJECT_DIR}/config/hermes..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "all-in-wonder/hermes:latest" "${PROJECT_DIR}/config/hermes"

