#!/usr/bin/env bash
#
# update.sh — update an existing Liquid Upstart install to the latest release.
#
#   curl -fsSL <raw-url>/update.sh | bash
#
# Operates on the install at ~/.liquidupstart. When a newer release exists it
# stops the stack, drops the built images and their build cache, removes any
# leftover APP_ID-suffixed containers/images from older installs, flags the
# dashboard to rebuild on next start, then downloads and unpacks the new release
# over the existing folder (keeping .env and volumes/). If you already have the
# latest version it does nothing.
#
set -euo pipefail

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

REPO="nocodenation/liquidupstart"
DEST="${HOME}/.liquidupstart"
VERSION_FILE="${DEST}/.liquidupstart-version"
REBUILD_MARKER="${DEST}/.needs-rebuild"
BUILT_IMAGES="opencode bun-runner liquid openclaw"

require() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed."; }

# Echo the hex sha256 of a file using whichever tool is available.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else return 1; fi
}

# Verify $1 against the sha256 published at $2. Releases predating this feature
# have no checksum asset (curl 404s) — skip rather than fail those.
verify_checksum() {
  local file="$1" url="$2" expected actual
  expected="$(curl -fsSL "$url" 2>/dev/null | awk 'NR==1{print $1}')"
  if [ -z "$expected" ]; then
    warn "No published checksum for this release — skipping integrity check."
    return 0
  fi
  actual="$(sha256_of "$file")" \
    || { warn "No sha256 tool found — skipping integrity check."; return 0; }
  [ "$expected" = "$actual" ] || die "Checksum mismatch for $(basename "$file").
  expected: ${expected}
  actual:   ${actual}
  The download may be corrupted or tampered with; aborting."
  ok "Checksum verified (sha256)"
}

# Compare two MAJOR.MINOR.PATCH versions (leading 'v' and any pre-release suffix
# ignored). Echoes: gt if $1>$2, lt if $1<$2, eq if equal.
ver_cmp() {
  local a="${1#v}" b="${2#v}" i x y
  local -a A B
  IFS=. read -r -a A <<EOF
$a
EOF
  IFS=. read -r -a B <<EOF
$b
EOF
  for i in 0 1 2; do
    x="${A[i]:-0}"; y="${B[i]:-0}"
    x="${x%%[!0-9]*}"; y="${y%%[!0-9]*}"
    x=$((10#${x:-0})); y=$((10#${y:-0}))
    if   [ "$x" -gt "$y" ]; then echo gt; return
    elif [ "$x" -lt "$y" ]; then echo lt; return
    fi
  done
  echo eq
}

resolve_latest() {
  local api t
  api="https://api.github.com/repos/${REPO}/releases/latest"
  t="$(curl -fsSL "$api" | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [ -n "$t" ] || die "Could not determine the latest release tag."
  printf '%s\n' "$t"
}

# Drop the locally-built images and build cache so the rebuild is clean, and
# remove deprecated APP_ID-suffixed containers/images left by older installs so
# they can't cause name or image conflicts.
remove_legacy() {
  local svc bases alt stale imgs

  log "Removing built images and build cache"
  for svc in $BUILT_IMAGES; do
    docker image rm -f "liquidupstart/${svc}:latest" >/dev/null 2>&1 || true
  done
  docker builder prune --force >/dev/null 2>&1 || true

  log "Removing deprecated APP_ID containers and images"
  bases="$(grep -E '^[[:space:]]*container_name:' "${DEST}/compose.yml" 2>/dev/null | awk '{print $2}')"
  bases="${bases} hermes liquidupstart-dashboard openclaw-grok-login openclaw-codex-login"
  alt="$(printf '%s\n' ${bases} | sort -u | paste -sd'|' -)"
  stale="$(docker ps -a --format '{{.Names}}' \
    | grep -E "^((${alt})-[0-9]{14}|aiw-toolbox-[a-z0-9]+-[0-9]{14})$" || true)"
  [ -n "$stale" ] && printf '%s\n' "$stale" | xargs docker rm -f >/dev/null 2>&1 || true

  imgs="$(docker images --filter "reference=liquidupstart/*" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null \
    | grep -E ':[0-9]{14}$' || true)"
  [ -n "$imgs" ] && printf '%s\n' "$imgs" | xargs docker rmi -f >/dev/null 2>&1 || true

  docker image prune --force >/dev/null 2>&1 || true
}

main() {
  local installed tag tmp extracted

  [ -d "$DEST" ] || die "No installation found at ${DEST}. Run install.sh first."
  require curl; require unzip; require docker

  installed=""
  [ -f "$VERSION_FILE" ] && installed="$(tr -d '[:space:]' < "$VERSION_FILE")"

  log "Checking for a newer release"
  tag="$(resolve_latest)"

  if [ -n "$installed" ]; then
    case "$(ver_cmp "$tag" "$installed")" in
      eq) ok "You already have the latest version (${installed#v}). Nothing to do."; exit 0 ;;
      lt) ok "Your version (${installed#v}) is newer than the latest release (${tag#v}). Nothing to do."; exit 0 ;;
      gt) log "Updating ${installed#v} → ${tag#v}" ;;
    esac
  else
    warn "No recorded version at ${VERSION_FILE}; updating to ${tag#v}."
  fi

  cd "$DEST"

  log "Stopping the stack"
  docker compose down --remove-orphans || warn "docker compose down reported an issue; continuing."

  # --ignore-pull-failures: the four liquidupstart/* images are built locally and
  # aren't in any registry, so pulling them fails harmlessly; base images update.
  log "Pulling latest base images"
  docker compose pull --ignore-pull-failures || warn "docker compose pull reported an issue; continuing."

  remove_legacy

  : > "$REBUILD_MARKER"
  ok "Flagged a rebuild for the next dashboard start"

  tmp="$(mktemp -d)"
  local zip_url="https://github.com/${REPO}/releases/download/${tag}/liquidupstart-${tag}.zip"
  log "Downloading liquidupstart-${tag}.zip"
  curl -fsSL "$zip_url" -o "${tmp}/release.zip"
  verify_checksum "${tmp}/release.zip" "${zip_url}.sha256"
  log "Extracting over ${DEST}"
  unzip -q "${tmp}/release.zip" -d "$tmp"
  extracted="${tmp}/liquidupstart-${tag}"
  [ -d "$extracted" ] \
    || extracted="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  cp -a "${extracted}/." "${DEST}/"
  printf '%s\n' "$tag" > "$VERSION_FILE"
  rm -rf "$tmp"

  cat <<EOF

------------------------------------------------------------------
Updated to ${tag#v}.

The images need rebuilding. Start the dashboard and use Rebuild → Start:

cd ${DEST}
./run.sh
------------------------------------------------------------------
EOF
}

main "$@"
