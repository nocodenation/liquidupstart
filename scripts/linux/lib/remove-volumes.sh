#!/usr/bin/env bash
# lu_remove_volumes <project-dir>: step 4 of cleanup.sh, the removal of volumes/.
# Sourced by cleanup.sh; defines the function and runs nothing.
#
# Four legs, each tried only when the one before left the directory in place:
# plain rm; rm from a container that is already local, never pulled; sudo rm;
# an error. Under rootless Docker a container's files belong to a mapped uid the
# host user cannot delete as, and the same uid is root inside any container the
# daemon starts, so the container leg removes them with no privilege the operator
# does not already hold -- it sits before sudo so a reset need not ask for a
# password. The container mounts the project directory, not volumes/: a mount
# point cannot be removed from inside. Success is the directory being gone, never
# a leg's exit status. docs/FEATURE-reset.md, #32.
#
# The argument is resolved to its physical directory before anything else, and
# the legs act on the resolved path: `/.`, `//.`, `/tmp/..` and a symlink to `/`
# all passed a comparison of the string with `/`, and each is `/volumes` to the
# kernel (CU-FR5, review of #32). `cd -P` rather than `realpath -m`, which is
# GNU-only; bash's `pwd -P` answers `//` for `//.`, hence the trim after it.

lu_remove_volumes() {
  local dir="${1:-}" root="" why="" target image c tried
  local candidates=("nginx:latest" "liquidupstart/bun-runner:latest")

  if [[ -z "$dir" || "$dir" != /* ]]; then
    why="not an absolute path below /."
  elif ! root="$(cd -P -- "$dir" 2>/dev/null && pwd -P)"; then
    why="not an existing directory."
  else
    while [[ "$root" == */ && "$root" != "/" ]]; do root="${root%/}"; done
    [[ "$root" != "/" ]] || why="not an absolute path below /."
  fi
  if [[ -n "$why" ]]; then
    echo "ERROR: refusing to remove volumes/ under '${dir}': ${why}" >&2
    return 1
  fi
  target="${root}/volumes"

  echo "Removing volumes/..."
  rm -rf "$target" 2>/dev/null || true
  [[ -e "$target" ]] || return 0

  echo "Plain removal failed (files owned by another UID); retrying from a container..."
  image=""
  if command -v docker >/dev/null 2>&1; then
    for c in "${candidates[@]}"; do
      if docker image inspect "$c" >/dev/null 2>&1; then image="$c"; break; fi
    done
  fi
  if [[ -n "$image" ]]; then
    echo "Removing volumes/ from a container (${image})..."
    docker run --pull never --rm --entrypoint rm -v "${root}:/v" "$image" -rf /v/volumes || true
    if [[ ! -e "$target" ]]; then
      echo "volumes/ removed from a container."
      return 0
    fi
    echo "Container removal failed (${image}); retrying with sudo..."
  else
    tried="$(printf '%s, ' "${candidates[@]}")"
    echo "No local image to run the removal from (tried ${tried%, }); retrying with sudo..."
  fi

  if ! command -v sudo >/dev/null 2>&1; then
    echo "ERROR: cannot remove volumes/ and sudo is unavailable." >&2
    return 1
  fi
  sudo rm -rf "$target" || true
  if [[ -e "$target" ]]; then
    echo "ERROR: volumes/ is still present after sudo rm -rf." >&2
    return 1
  fi
  echo "volumes/ removed with sudo."
  return 0
}
