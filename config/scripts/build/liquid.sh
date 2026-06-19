#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_DIR="${PROJECT_DIR}/config/liquid"
STATE_DIR="${PROJECT_DIR}/volumes/liquid"
TEMPLATES_DIR="${CONFIG_DIR}/templates"

# Shared template renderer (SYSTEM_DEPENDENCIES / POST_INSTALLATION_COMMANDS).
source "${SCRIPT_DIR}/lib/dockerfile-render.sh"

# Enable --no-cache only when passed in (e.g. by build.sh).
NO_CACHE=""
for arg in "$@"; do
    [ "$arg" = "--no-cache" ] && NO_CACHE="--no-cache"
done

# Load environment variables from .env file if it exists
if [ -f "${PROJECT_DIR}/.env" ]; then
    # Export variables from .env file, ignoring comments and empty lines
    set -a
    source "${PROJECT_DIR}/.env"
    set +a
fi

# Use environment variables (with defaults if not set)
SYSTEM_DEPENDENCIES="${SYSTEM_DEPENDENCIES:-}"
POST_INSTALLATION_COMMANDS="${POST_INSTALLATION_COMMANDS:-}"

# Apply LIQUID_* per-image overrides (add/override) on top of the generic values.
resolve_image_settings "NIFI"

# Render the Dockerfile from the template, injecting the deps/commands.
render_dockerfile "${TEMPLATES_DIR}/Dockerfile" "${CONFIG_DIR}/Dockerfile"

IMAGE="liquidupstart/liquid:${APP_ID:-0}"
docker image rm "$IMAGE" >/dev/null 2>&1 || true
echo "Building $IMAGE from ${PROJECT_DIR}/config/liquid..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "$IMAGE" "${PROJECT_DIR}/config/liquid"
