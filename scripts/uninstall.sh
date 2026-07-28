#!/usr/bin/env bash
set -euo pipefail

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

resolve_path() {
  local p="$1" d b
  if readlink -f / >/dev/null 2>&1; then
    readlink -f "$p" 2>/dev/null
    return
  fi
  while [ -L "$p" ]; do
    d="$(dirname "$p")"
    p="$(readlink "$p")"
    case "$p" in /*) ;; *) p="${d}/${p}" ;; esac
  done
  d="$(cd "$(dirname "$p")" 2>/dev/null && pwd)" || return 1
  b="$(basename "$p")"
  printf '%s/%s\n' "$d" "$b"
}

if [ -z "${LU_UNINSTALL_DIR:-}" ]; then
  SOURCE="${BASH_SOURCE[0]}"
  while [ -L "$SOURCE" ]; do
    SDIR="$(cd "$(dirname "$SOURCE")" && pwd)"
    SOURCE="$(readlink "$SOURCE")"
    case "$SOURCE" in /*) ;; *) SOURCE="${SDIR}/${SOURCE}" ;; esac
  done
  SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  LU_UNINSTALL_TMP="$(mktemp -d)"
  cp "$SOURCE" "${LU_UNINSTALL_TMP}/uninstall.sh"
  LU_UNINSTALL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
  export LU_UNINSTALL_DIR LU_UNINSTALL_TMP
  cd /
  exec bash "${LU_UNINSTALL_TMP}/uninstall.sh" "$@"
fi

PROJECT_DIR="$LU_UNINSTALL_DIR"
cd /
trap 'rm -rf "${LU_UNINSTALL_TMP:-}"' EXIT

ASSUME_YES=0
KEEP_IMAGES=""
for arg in "$@"; do
  case "$arg" in
    -y|--yes)      ASSUME_YES=1 ;;
    --keep-images) KEEP_IMAGES="--keep-images" ;;
    *) die "Unknown option: ${arg}" ;;
  esac
done

[ -d "$PROJECT_DIR" ] || die "Install directory not found: ${PROJECT_DIR}"

cat <<EOF

This removes Liquid Upstart from this machine:

  * stops the stack and removes its containers
  * deletes all persisted data in ${PROJECT_DIR}/volumes/ (databases, files, flows)
  * deletes .env, rendered config$([ -n "$KEEP_IMAGES" ] && echo "" || echo ", and the built/pulled images")
  * removes the 'liquidupstart' command
  * deletes ${PROJECT_DIR}

This cannot be undone.
EOF

if [ "$ASSUME_YES" -ne 1 ]; then
  { : >/dev/tty; } 2>/dev/null \
    || die "No terminal to confirm on. Re-run with --yes to uninstall non-interactively."
  printf 'Type "uninstall" to continue: ' >/dev/tty
  read -r reply </dev/tty || reply=""
  [ "$reply" = uninstall ] || { echo "Aborted — nothing was removed."; exit 0; }
fi

if docker version >/dev/null 2>&1; then
  if [ -f "${PROJECT_DIR}/cleanup.sh" ]; then
    log "Stopping the stack and removing data"
    bash "${PROJECT_DIR}/cleanup.sh" ${KEEP_IMAGES} \
      || warn "Cleanup reported errors — continuing with the file removal."
  else
    warn "cleanup.sh not found — skipping the docker teardown."
  fi

  log "Removing helper containers"
  for c in liquidupstart-dashboard $(docker ps -a --format '{{.Names}}' 2>/dev/null \
             | grep -E '^aiw-toolbox-' || true); do
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  ok "Helper containers removed"
else
  warn "Docker is not running — its containers and images cannot be removed and are"
  warn "left behind. Everything on disk, volumes/ included, is still deleted below."
  warn "To clear the containers and images too, start Docker and run cleanup.sh first."
fi

log "Removing the 'liquidupstart' command"
removed_link=0
for launcher in /usr/local/bin/liquidupstart "${HOME}/.local/bin/liquidupstart"; do
  [ -L "$launcher" ] || continue
  target="$(resolve_path "$launcher" 2>/dev/null || true)"
  case "$target" in
    "${PROJECT_DIR}"/*) ;;
    *) warn "Leaving ${launcher} — it points at ${target:-an unknown target}"; continue ;;
  esac
  if rm -f "$launcher" 2>/dev/null; then
    removed_link=1
  elif command -v sudo >/dev/null 2>&1 && sudo rm -f "$launcher"; then
    removed_link=1
  else
    warn "Could not remove ${launcher} — remove it by hand."
  fi
done
[ "$removed_link" -eq 1 ] && ok "Launcher removed" || ok "No launcher of this install found"

log "Deleting ${PROJECT_DIR}"
if ! rm -rf "$PROJECT_DIR" 2>/dev/null; then
  warn "Plain removal failed (files owned by another UID); retrying with sudo..."
  if command -v sudo >/dev/null 2>&1; then
    sudo rm -rf "$PROJECT_DIR"
  else
    die "Cannot remove ${PROJECT_DIR} and sudo is unavailable."
  fi
fi
[ -d "$PROJECT_DIR" ] && die "Failed to remove ${PROJECT_DIR}."
ok "Install directory deleted"

cat <<EOF

------------------------------------------------------------------
Liquid Upstart has been removed.

Docker itself was left installed. The shell environment block added
at install time (if any) is still in your ~/.bashrc or ~/.zshrc,
marked with "# >>> rootless docker >>>".
------------------------------------------------------------------
EOF
