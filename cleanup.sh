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

# Remove dangling layers and build cache.
echo "Pruning build cache..."
docker builder prune --force

echo "Cleanup complete."
