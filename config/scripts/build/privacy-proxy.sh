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

BASE_IMAGE="ghcr.io/nocodenation/privacy-proxy:latest"
PULL="--pull"
DEV_SRC="${PRIVACY_PROXY_DEV_SRC:-}"

if [ -n "${DEV_SRC}" ]; then
    case "${DEV_SRC}" in
        /*) ;;
        *) DEV_SRC="${PROJECT_DIR}/${DEV_SRC}" ;;
    esac
    if [ ! -f "${DEV_SRC}/Dockerfile" ]; then
        echo "Error: PRIVACY_PROXY_DEV_SRC=${PRIVACY_PROXY_DEV_SRC} has no Dockerfile — it is not a privacy-proxy checkout." >&2
        echo "::aiw-error::PRIVACY_PROXY_DEV_SRC does not point at a privacy-proxy checkout: no Dockerfile in ${DEV_SRC}." >&2
        exit 1
    fi
    BASE_IMAGE="liquidupstart/privacy-proxy-base:dev"
    PULL=""
    echo "PRIVACY_PROXY_DEV_SRC set: building ${BASE_IMAGE} from ${DEV_SRC} instead of pulling the release image."
    docker build ${NO_CACHE:+--no-cache} --progress=plain \
        --build-arg MODELS_EXTRA="${PRIVACY_PROXY_DEV_MODELS_EXTRA:-models-permissive}" \
        --build-arg SOURCE_OFFER_CONTACT="${PRIVACY_PROXY_DEV_SOURCE_OFFER_CONTACT:-dev@localhost}" \
        -t "${BASE_IMAGE}" "${DEV_SRC}"
fi

IMAGE="liquidupstart/privacy-proxy:latest"
echo "Building $IMAGE from ${CONFIG_DIR} on top of ${BASE_IMAGE}..."
docker build ${NO_CACHE:+--no-cache} ${PULL} --progress=plain \
    --build-arg PRIVACY_PROXY_BASE_IMAGE="${BASE_IMAGE}" \
    --build-arg ENABLE_ANTHROPIC_CLAUDE_CODE="${CLAUDE_CLI}" \
    -t "$IMAGE" -f "${DOCKERFILE}" "${CONFIG_DIR}"
