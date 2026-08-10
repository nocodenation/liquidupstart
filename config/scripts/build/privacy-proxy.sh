#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_DIR="${PROJECT_DIR}/config/privacy-proxy"
TEMPLATES_DIR="${CONFIG_DIR}/templates"

source "${SCRIPT_DIR}/lib/dockerfile-render.sh"

NO_CACHE=""
for arg in "$@"; do
    [ "$arg" = "--no-cache" ] && NO_CACHE="--no-cache"
done

load_env_file "${PROJECT_DIR}/.env"

SYSTEM_DEPENDENCIES="${SYSTEM_DEPENDENCIES:-}"
POST_INSTALLATION_COMMANDS="${POST_INSTALLATION_COMMANDS:-}"

resolve_image_settings "PRIVACY_PROXY"

DOCKERFILE="$(mktemp)"
trap 'rm -f "${DOCKERFILE}"' EXIT
render_dockerfile "${TEMPLATES_DIR}/Dockerfile" "${DOCKERFILE}"

CLAUDE_CLI="${ENABLE_ANTHROPIC_CLAUDE_CODE:-0}"
if [ "${CLAUDE_CLI}" = "1" ]; then
    echo "ENABLE_ANTHROPIC_CLAUDE_CODE=1: installing Claude Code CLI into the image."
fi

IMAGE="liquidupstart/privacy-proxy:latest"
docker image rm "$IMAGE" >/dev/null 2>&1 || true
echo "Building $IMAGE from ${CONFIG_DIR}..."
docker build ${NO_CACHE:+--no-cache} --pull --progress=plain \
    --build-arg ENABLE_ANTHROPIC_CLAUDE_CODE="${CLAUDE_CLI}" \
    -t "$IMAGE" -f "${DOCKERFILE}" "${CONFIG_DIR}"
