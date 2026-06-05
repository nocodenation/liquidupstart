#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
CONFIG_DIR="${PROJECT_DIR}/config/nifi"
STATE_DIR="${PROJECT_DIR}/volumes/nifi"
TEMPLATES_DIR="${CONFIG_DIR}/templates"

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
NIFI_SYSTEM_DEPENDENCIES="${NIFI_SYSTEM_DEPENDENCIES:-}"
NIFI_POST_INSTALLATION_COMMANDS="${NIFI_POST_INSTALLATION_COMMANDS:-}"

# Build the final list of additional packages from NIFI_SYSTEM_DEPENDENCIES
ADDITIONAL_PACKAGES_STR=""
if [ -n "$NIFI_SYSTEM_DEPENDENCIES" ]; then
    IFS=',' read -r -a __DEPS <<< "$NIFI_SYSTEM_DEPENDENCIES"
    __DEPS_TRIMMED=()
    for d in "${__DEPS[@]}"; do
        trimmed=$(echo "$d" | xargs)
        if [ -n "$trimmed" ]; then
            __DEPS_TRIMMED+=("$trimmed")
        fi
    done
    ADDITIONAL_PACKAGES_STR="${__DEPS_TRIMMED[*]}"
fi

# Create a temporary copy of the Dockerfile
cp "${TEMPLATES_DIR}/Dockerfile" "${CONFIG_DIR}/Dockerfile"

# If additional packages are provided, append them to the apt-get install line
if [ -n "$ADDITIONAL_PACKAGES_STR" ]; then
    # Escape special characters in the replacement string
    ESCAPED_PACKAGES=$(echo "$ADDITIONAL_PACKAGES_STR" | sed 's/[\/&]/\\&/g')

    # Determine sed in-place flag for GNU vs BSD (macOS)
    if sed --version >/dev/null 2>&1; then
        # GNU sed
        SED_INPLACE=(-i)
    else
        # BSD sed (macOS) requires a backup suffix (empty string to avoid backup files)
        SED_INPLACE=(-i '')
    fi

    # Find the line with apt-get install and append the additional packages
    sed "${SED_INPLACE[@]}" -e 's/\(RUN apt-get install -y python3 python3-pip\)/\1 '"$ESCAPED_PACKAGES"'/' "${CONFIG_DIR}/Dockerfile"
fi

# If post installation commands provided, inject them under the marker in Dockerfile
if [ -n "$NIFI_POST_INSTALLATION_COMMANDS" ]; then
    # Build the block of RUN commands from comma-separated list
    IFS=',' read -r -a __CMDS <<< "$NIFI_POST_INSTALLATION_COMMANDS"
    POST_INSTALL_BLOCK=""
    for c in "${__CMDS[@]}"; do
        # trim whitespace around the command
        trimmed=$(echo "$c" | xargs)
        if [ -n "$trimmed" ]; then
            POST_INSTALL_BLOCK+="RUN $trimmed\n"
        fi
    done

    # Insert the block right after the line that has the marker
    awk -v block="$POST_INSTALL_BLOCK" '
      {
        print $0
        if ($0 ~ /# POST_INSTALL_COMMANDS/) {
          n = split(block, lines, "\\n");
          for (i = 1; i <= n; i++) if (length(lines[i]) > 0) print lines[i];
        }
      }
    ' "${CONFIG_DIR}/Dockerfile" > "${CONFIG_DIR}/Dockerfile.__new" && mv "${CONFIG_DIR}/Dockerfile.__new" "${CONFIG_DIR}/Dockerfile"
fi

# Remove existing image if it exists
# Suppress error if the image doesn't exist and silence output
docker image rm "all-in-wonder/nifi:latest" >/dev/null 2>&1 || true

echo "Building all-in-wonder/nifi:latest from ${PROJECT_DIR}/config/nifi..."
docker build ${NO_CACHE:+--no-cache} --progress=plain -t "all-in-wonder/nifi:latest" "${PROJECT_DIR}/config/nifi"
