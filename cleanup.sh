#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${PROJECT_DIR}"

# Stop and remove containers.
"${PROJECT_DIR}/scripts/linux/down.sh"

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

# Remove dangling layers and build cache.
echo "Pruning build cache..."
docker builder prune --force

echo "Cleanup complete."
