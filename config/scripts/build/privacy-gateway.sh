#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_DIR="${PROJECT_DIR}/config/privacy-gateway"
TEMPLATES_DIR="${CONFIG_DIR}/templates"

source "${SCRIPT_DIR}/lib/dockerfile-render.sh"

NO_CACHE=""
for arg in "$@"; do
    [ "$arg" = "--no-cache" ] && NO_CACHE="--no-cache"
done

if [ -f "${PROJECT_DIR}/.env" ]; then
    set -a
    source "${PROJECT_DIR}/.env"
    set +a
fi

SYSTEM_DEPENDENCIES="${SYSTEM_DEPENDENCIES:-}"
POST_INSTALLATION_COMMANDS="${POST_INSTALLATION_COMMANDS:-}"

resolve_image_settings "PRIVACY_GATEWAY"

DOCKERFILE="$(mktemp)"
trap 'rm -f "${DOCKERFILE}"' EXIT
render_dockerfile "${TEMPLATES_DIR}/Dockerfile" "${DOCKERFILE}"

IMAGE="liquidupstart/privacy-gateway:latest"
docker image rm "$IMAGE" >/dev/null 2>&1 || true
echo "Building $IMAGE from ${CONFIG_DIR}..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "$IMAGE" -f "${DOCKERFILE}" "${CONFIG_DIR}"
