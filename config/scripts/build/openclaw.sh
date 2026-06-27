#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CONFIG_DIR="${PROJECT_DIR}/config/openclaw"
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

# Apply OPENCLAW_* per-image overrides (add/override) on top of the generic values.
resolve_image_settings "OPENCLAW"

# Render the Dockerfile from the template, injecting the deps/commands.
DOCKERFILE="$(mktemp)"
trap 'rm -f "${DOCKERFILE}"' EXIT
render_dockerfile "${TEMPLATES_DIR}/Dockerfile" "${DOCKERFILE}"

# Optionally install the Claude Code CLI into the image. When
# ENABLE_ANTHROPIC_CLAUDE_CODE=1 the "# CLAUDE_CLI_INSTALL" marker in the rendered
# Dockerfile is turned into a `RUN npm install -g @anthropic-ai/claude-code`
# step (still running as root, before the trailing `USER node`). The companion
# start script (config/scripts/start/openclaw.sh) then points OpenClaw at the
# claude-cli runtime. When the flag is unset/0 the marker stays a comment, so
# the image is unchanged.
sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

if [ "${ENABLE_ANTHROPIC_CLAUDE_CODE:-0}" = "1" ]; then
    echo "ENABLE_ANTHROPIC_CLAUDE_CODE=1: installing Claude Code CLI into the image."
    sed_inplace -e 's|^# CLAUDE_CLI_INSTALL$|RUN npm install -g @anthropic-ai/claude-code|' "${DOCKERFILE}"
fi

IMAGE="liquidupstart/openclaw:latest"
docker image rm "$IMAGE" >/dev/null 2>&1 || true
echo "Building $IMAGE from ${CONFIG_DIR}..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "$IMAGE" -f "${DOCKERFILE}" "${CONFIG_DIR}"
