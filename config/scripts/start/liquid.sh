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
# **777, and it is the exposure M2 of the 2026-10-01 review actually names.**
#
# Anything on this host can write `volumes/liquid/api/runtime`, and `nar-build`
# reads that record to decide which nifi-api it compiles against. The reviewer
# asked for the values to be validated against a version pattern; that narrows
# what can be written to something which still parses and stops nothing, because
# a host-side writer can choose a valid version as easily as an invalid one.
#
# **The mode cannot be narrowed here, measured 2026-10-09.** NiFi runs as uid 1000
# inside the container, and under rootless Docker -- the arrangement CLAUDE.md
# documents -- the host user maps to container root, so a 755 directory owned by
# the operator appears root-owned inside and uid 1000 cannot write it. That is the
# same reason the drop directory below is 777, and the reason `$STATE_DIR` itself
# is. The exposure is structural to "state in a browsable host directory, written
# by a container process under a different uid", and not to this line.
#
# **The obvious alternative does not exist either.** The builder already talks to
# Liquid over HTTPS, so it could ask for the version instead of reading a file --
# measured, `/nifi-api/flow/about` and `/nifi-api/system-diagnostics` both answer
# **401**, and the builder deliberately holds no credentials (FR25).
#
# What contains it today is downstream and only partly: a bundle compiled against
# the wrong API is judged at deployment against the classes the running Liquid
# loads (FR36). A version that is too **high** produces references the index does
# not have and is refused; one that is too **low** resolves and deploys, compiled
# against an older API than the instance runs. That asymmetry is read out of
# `narcheck.py:396`, where a reference whose package is not in the judged set is
# skipped, rather than run.
#
# What would close it, and it is a decision rather than an oversight: carry this
# directory as a volume shared between `liquid` and `nar_builder` instead of a
# host bind, the way `nar_extensions` already is. That contradicts CLAUDE.md's
# "all state lives in browsable ./volumes/ bind mounts; never use named Docker
# volumes", so it is in BACKLOG.md for the operator rather than taken here.
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

