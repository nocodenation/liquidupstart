#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"

KEEP_IMAGES=0
for arg in "$@"; do
  case "${arg}" in
    --keep-images) KEEP_IMAGES=1 ;;
    *) echo "Unknown option: ${arg}" >&2; exit 1 ;;
  esac
done

# Stop and remove containers. cleanup is the full reset; down.sh stays
# non-destructive and is not used here.
echo "Stopping existing containers..."
docker compose down --volumes --remove-orphans

# Older installs named containers <service>-<APP_ID> (a 14-digit timestamp) under
# a per-checkout compose project, so `docker compose down` above can't reach them.
# Force-remove any such leftovers — including from checkouts in other folders — by
# matching our known service names with a timestamp suffix.
echo "Removing outdated APP_ID-suffixed containers..."
bases="$(grep -E '^[[:space:]]*container_name:' "${PROJECT_DIR}/compose.yml" | awk '{print $2}')"
bases="${bases} hermes liquidupstart-dashboard openclaw-grok-login openclaw-codex-login"
alt="$(printf '%s\n' ${bases} | sort -u | paste -sd'|' -)"
stale="$(docker ps -a --format '{{.Names}}' \
  | grep -E "^((${alt})-[0-9]{14}|aiw-toolbox-[a-z0-9]+-[0-9]{14})$" || true)"
if [[ -n "${stale}" ]]; then
  echo "${stale}" | xargs docker rm -f
else
  echo "No outdated containers found."
fi

# Remove rendered config files.
"${PROJECT_DIR}/scripts/linux/cleanup.sh"

# Remove persisted data. Container processes may write files owned by
# subordinate UIDs the host user can't delete directly, so fall back to sudo.
echo "Removing volumes/..."
if ! rm -rf "${PROJECT_DIR}/volumes" 2>/dev/null; then
  echo "Plain removal failed (files owned by another UID); retrying with sudo..."
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -rf "${PROJECT_DIR}/volumes"
  else
    echo "ERROR: cannot remove volumes/ and sudo is unavailable." >&2
    exit 1
  fi
fi

# Remove the generated environment file.
echo "Removing .env..."
rm -f "${PROJECT_DIR}/.env"

if [[ "${KEEP_IMAGES}" -eq 1 ]]; then
  echo "Keeping images and build cache (--keep-images)."
  echo "Cleanup complete."
  exit 0
fi

# Remove project-built images.
echo "Removing liquidupstart/* images..."
# The toolbox image (Windows helper) may be in use when this runs inside it, so
# tolerate a removal failure rather than aborting.
images="$(docker images --filter "reference=liquidupstart/*" --quiet | sort -u)"
if [[ -n "${images}" ]]; then
  for image in ${images}; do
    docker rmi --force "${image}" || true
  done
else
  echo "No liquidupstart/* images found."
fi

# Remove every other image referenced in compose.yml (skips commented-out and
# already-handled liquidupstart/* lines).
echo "Removing base images referenced in compose.yml..."
grep -E '^[[:space:]]*image:' "${PROJECT_DIR}/compose.yml" \
  | awk '{print $2}' \
  | grep -v 'liquidupstart/' \
  | sort -u \
  | while read -r image; do
      [[ -n "${image}" ]] || continue
      docker rmi --force "${image}" || true
    done

# Remove the base images the custom images are built FROM. These aren't service
# `image:` entries, so the compose.yml pass above never sees them (e.g.
# ghcr.io/openclaw/openclaw, ghcr.io/nocodenation/liquid-nifi, node, oven/bun).
echo "Removing build base images (Dockerfile FROM)..."
grep -rhE '^FROM ' \
    "${PROJECT_DIR}"/config/*/Dockerfile \
    "${PROJECT_DIR}"/config/*/templates/Dockerfile 2>/dev/null \
  | awk '{print $2}' \
  | grep -v 'liquidupstart/' \
  | sort -u \
  | while read -r image; do
      [[ -n "${image}" ]] || continue
      docker rmi --force "${image}" || true
    done

# Remove dangling images left behind by old builds (here or in other folders),
# then dangling layers and build cache.
echo "Pruning dangling images..."
docker image prune --force
echo "Pruning build cache..."
docker builder prune --force

echo "Cleanup complete."
