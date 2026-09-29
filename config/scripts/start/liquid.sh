#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env"
CONFIG_DIR="${PROJECT_DIR}/config/liquid"
TEMPLATES_DIR="${CONFIG_DIR}/templates"
STATE_DIR="${PROJECT_DIR}/volumes/liquid"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

IMAGE="liquidupstart/liquid:latest"
LIQUID_USERNAME=$(grep '^LIQUID_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"")
LIQUID_PASSWORD=$(grep '^LIQUID_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"")

sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

render_template() {
  local content
  content="$(<"$1")"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value//\"/}"
    content="${content//\{\{ ${key} \}\}/${value}}"
  done < "$ENV_FILE"
  printf '%s\n' "$content"
}

if [ -d "$STATE_DIR" ]; then
    echo ""
    echo "State folder already exists at $STATE_DIR"
    echo "Skipping state folder extraction."
else
    echo "Creating state folder and copying directories from image..."
    mkdir -p "$STATE_DIR"
    chmod 777 "$STATE_DIR"

    docker run --rm \
        -e "SINGLE_USER_CREDENTIALS_USERNAME=${LIQUID_USERNAME}" \
        -e "SINGLE_USER_CREDENTIALS_PASSWORD=${LIQUID_PASSWORD}" \
        -v "${STATE_DIR}":/target \
        --entrypoint /bin/bash \
        "$IMAGE" \
        -c "cp -r /opt/nifi/nifi-current/conf /target/ && \
            cp -r /opt/nifi/nifi-current/database_repository /target/ && \
            cp -r /opt/nifi/nifi-current/flowfile_repository /target/ && \
            cp -r /opt/nifi/nifi-current/content_repository /target/ && \
            cp -r /opt/nifi/nifi-current/provenance_repository /target/ && \
            cp -r /opt/nifi/nifi-current/state /target/"

    echo "State folder created successfully."
fi

# After the branch above, never before it. Creating this directory also creates
# STATE_DIR, so `[ -d "$STATE_DIR" ]` was always true and a fresh install never
# seeded anything: volumes/liquid held `api/` alone, the empty conf/ was mounted
# over the image's, and NiFi exited 2 with `sed: can't read .../nifi.properties`
# on a loop under `restart: unless-stopped`. Blocker 1 of the 2026-09-28 review.
#
# It stays unconditional otherwise: an installation that predates this directory
# would have docker create it as root on the first mount, which the nifi user in
# the container cannot write.
mkdir -p "${STATE_DIR}/api"
chmod 777 "${STATE_DIR}/api"

# The drop directory and the quarantine beside it, made here for the same
# reason. On Linux rootless Docker the bind mount is owned by container root
# while Liquid runs as nifi (uid 1000), so the entrypoint could not create
# `refused/` itself: `mkdir: cannot create directory ... Permission denied`.
# A refused bundle then stayed in the drop directory, where the auto-loader
# picks it up within seconds -- while the summary said it had been moved out.
# Blocker 4 of the 2026-09-28 review.
DROP_DIR="${PROJECT_DIR}/volumes/nar_extensions"
mkdir -p "${DROP_DIR}/refused"
chmod 777 "$DROP_DIR" "${DROP_DIR}/refused"

