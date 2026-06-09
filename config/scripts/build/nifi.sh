#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
CONFIG_DIR="${PROJECT_DIR}/config/nifi"
STATE_DIR="${PROJECT_DIR}/volumes/nifi"
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

# Apply NIFI_* per-image overrides (add/override) on top of the generic values.
resolve_image_settings "NIFI"

# Render the Dockerfile from the template, injecting the deps/commands.
render_dockerfile "${TEMPLATES_DIR}/Dockerfile" "${CONFIG_DIR}/Dockerfile"

# Remove existing image if it exists
# Suppress error if the image doesn't exist and silence output
docker image rm "all-in-wonder/nifi:latest" >/dev/null 2>&1 || true

echo "Building all-in-wonder/nifi:latest from ${PROJECT_DIR}/config/nifi..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "all-in-wonder/nifi:latest" "${PROJECT_DIR}/config/nifi"
