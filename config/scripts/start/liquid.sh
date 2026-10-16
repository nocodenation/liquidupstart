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

# **`api/` is no longer created here, and that closes a hazard as well as a gap.**
#
# It was `mkdir -p "${STATE_DIR}/api"` followed by `chmod 777`, and both are gone
# since 2026-10-09: the directory is a volume shared between `liquid` and
# `nar_builder` now, created by docker and owned by nifi because both images carry
# the path. See the note at the foot of `compose.yml`.
#
# What the mode cost was M2 of the 2026-10-01 review -- anything on this host could
# write the runtime record `nar-build` compiles against -- and measurement showed
# the mode could not be narrowed while the directory was a host bind, because under
# rootless Docker the host user maps to container root while Liquid runs as nifi.
#
# The hazard it carried is worth recording because it was a blocker. The `mkdir`
# had to come **after** the seeding branch above, since creating `${STATE_DIR}/api`
# also creates `${STATE_DIR}` -- so with the two in the other order
# `[ -d "$STATE_DIR" ]` was always true, a fresh install seeded nothing,
# `volumes/liquid` held `api/` alone, the empty `conf/` was mounted over the
# image's, and NiFi exited 2 with `sed: can't read .../nifi.properties` on a loop
# under `restart: unless-stopped`. Blocker 1 of the 2026-09-28 review. With no
# `mkdir` here at all, no ordering can reintroduce it, and B5-1 asserts the
# directory is **not** created rather than that it is.

# An installation that ran before the move still has the old directory on disk,
# and it now looks authoritative while being read by nobody -- edit
# `volumes/liquid/api/runtime` there and nothing changes, which is the kind of
# quiet trap this project spends its time removing. So it is named once, and not
# deleted: removing a directory the operator may have copied something into is not
# this script's call.
if [ -d "${STATE_DIR}/api" ]; then
    echo ""
    echo "Note: ${STATE_DIR}/api is left over from before 2026-10-09 and is no longer"
    echo "  used. The load index and the runtime record live in the liquid_api volume,"
    echo "  shared with nar_builder. Nothing reads the directory above; you can delete it."
fi

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

