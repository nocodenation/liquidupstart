#!/usr/bin/env bash
#
# install.sh — Docker bootstrap for Liquid Upstart
#
# Linux/WSL2: as a normal user it sets up a rootless Docker Engine (systemd-enabled);
#   as root it installs the system (rootful) Docker daemon. Supports Debian/Ubuntu,
#   Fedora/RHEL, Arch, and openSUSE families.
# macOS: reuses an already-running Docker (Desktop/Colima/OrbStack); otherwise
#   installs Colima or Docker Desktop via Homebrew.
#
# Run as your normal user for rootless Docker (recommended), or as root for the
# system daemon. As a normal user the script invokes sudo only where needed.
#
#   chmod +x install.sh && ./install.sh [version]
#
# Also safe to pipe:
#   curl -fsSL <raw-url>/install.sh | bash
#   curl -fsSL <raw-url>/install.sh | bash -s -- 1.2.3   # pin a version
#
# The installed version is recorded in ~/.liquidupstart/.liquidupstart-version.
# Re-running upgrades in place (keeping .env and volumes/); it skips when the
# target equals the installed version and refuses to downgrade.
#
set -euo pipefail

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

detect_family() {
  case "$DISTRO_ID" in
    ubuntu|debian|linuxmint|pop|elementary|zorin|kali|raspbian) echo debian ;;
    fedora|rhel|centos|rocky|almalinux|ol)                      echo fedora ;;
    arch|manjaro|endeavouros|cachyos|garuda)                    echo arch ;;
    opensuse*|sles|sled)                                        echo suse ;;
    *)
      case " ${DISTRO_LIKE} " in
        *debian*|*ubuntu*)        echo debian ;;
        *fedora*|*rhel*|*centos*) echo fedora ;;
        *arch*)                   echo arch ;;
        *suse*)                   echo suse ;;
        *)                        echo unknown ;;
      esac ;;
  esac
}

# ----------------------------------------------------------------------------
# Per-distro install (remove conflicts → prereqs → repo → Docker CE)
# ----------------------------------------------------------------------------
install_debian() {
  export DEBIAN_FRONTEND=noninteractive
  local arch codename repo_distro pkg
  arch="$(dpkg --print-architecture)"
  case "$DISTRO_ID" in
    debian) repo_distro=debian; codename="${VERSION_CODENAME:-}" ;;
    *)      repo_distro=ubuntu; codename="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}" ;;
  esac
  [ -n "$codename" ] || die "Could not determine codename from /etc/os-release."

  log "Removing conflicting packages (if present)"
  for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    sudo apt-get remove -y "$pkg" >/dev/null 2>&1 || true
  done

  log "Installing prerequisites"
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl unzip uidmap dbus-user-session slirp4netns

  log "Configuring Docker apt repository"
  sudo install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    sudo curl -fsSL "https://download.docker.com/linux/${repo_distro}/gpg" -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${repo_distro} ${codename} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq

  log "Installing Docker CE packages"
  sudo apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin \
    docker-ce-rootless-extras
}

install_fedora() {
  local repo_distro
  case "$DISTRO_ID" in
    rhel|ol)                repo_distro=rhel ;;
    centos|rocky|almalinux) repo_distro=centos ;;
    *)                      repo_distro=fedora ;;
  esac

  log "Removing conflicting packages (if present)"
  sudo dnf -y remove docker docker-client docker-client-latest docker-common \
    docker-latest docker-latest-logrotate docker-logrotate docker-engine \
    podman-docker runc >/dev/null 2>&1 || true

  log "Installing prerequisites"
  sudo dnf -y install curl unzip ca-certificates dnf-plugins-core \
    slirp4netns fuse-overlayfs shadow-utils

  log "Configuring Docker repository"
  sudo curl -fsSL "https://download.docker.com/linux/${repo_distro}/docker-ce.repo" \
    -o /etc/yum.repos.d/docker-ce.repo

  log "Installing Docker CE packages"
  sudo dnf -y install \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin \
    docker-ce-rootless-extras
}

install_arch() {
  log "Installing Docker + rootless extras (official repos)"
  sudo pacman -Sy --needed --noconfirm \
    docker docker-buildx docker-compose \
    curl unzip slirp4netns fuse-overlayfs
}

install_suse() {
  log "Removing conflicting packages (if present)"
  sudo zypper --non-interactive remove -u docker-stable podman-docker >/dev/null 2>&1 || true

  log "Installing Docker + prerequisites"
  sudo zypper --non-interactive install \
    docker docker-buildx docker-compose \
    curl unzip slirp4netns fuse-overlayfs
  sudo zypper --non-interactive install docker-rootless-extras \
    || warn "docker-rootless-extras unavailable; rootless setuptool may be missing."
}

# ----------------------------------------------------------------------------
# macOS: reuse a running Docker, else install Colima or Docker Desktop
# ----------------------------------------------------------------------------
ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    ok "Homebrew present"
    return
  fi
  log "Homebrew not found — installing"
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$p" ] && eval "$("$p" shellenv)" && break
  done
  command -v brew >/dev/null 2>&1 || die "Homebrew install failed."
  ok "Homebrew installed"
}

choose_runtime() {
  command -v colima >/dev/null 2>&1 && { echo colima; return; }
  [ -d /Applications/Docker.app ] && { echo desktop; return; }
  local ans=""
  if [ -r /dev/tty ]; then
    {
      printf '\nNo Docker runtime found. Which should I install?\n'
      printf '  1) Colima         — CLI-only, lightweight (recommended)\n'
      printf '  2) Docker Desktop — GUI app\n'
      printf 'Enter 1 or 2 [1]: '
    } >/dev/tty
    read -r ans </dev/tty || ans=""
  fi
  case "$ans" in
    2|d|desktop|Desktop|DESKTOP) echo desktop ;;
    *)                           echo colima ;;
  esac
}

setup_colima() {
  if command -v colima >/dev/null 2>&1; then
    ok "Colima already installed"
  else
    log "Installing Colima + Docker CLI via Homebrew"
    brew install colima docker docker-compose
    ok "Colima installed"
  fi
  mkdir -p "${HOME}/.docker/cli-plugins"
  ln -sfn "$(brew --prefix)/opt/docker-compose/bin/docker-compose" \
    "${HOME}/.docker/cli-plugins/docker-compose" 2>/dev/null || true
  log "Starting Colima"
  colima status >/dev/null 2>&1 || colima start
  ok "Colima started"
}

setup_desktop() {
  if [ -d /Applications/Docker.app ]; then
    ok "Docker Desktop already installed"
  else
    log "Installing Docker Desktop via Homebrew"
    brew install --cask docker
    ok "Docker Desktop installed"
  fi
  log "Launching Docker Desktop"
  open -a Docker
  warn "Docker Desktop is starting — first launch can take a minute."
}

wait_for_docker() {
  local tries=0
  until docker info >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -gt 90 ] && return 1
    sleep 2
  done
}

run_macos() {
  log "macOS detected"

  if docker info >/dev/null 2>&1; then
    ok "Docker already running ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo up)) — skipping install"
    return
  fi
  command -v docker >/dev/null 2>&1 \
    && warn "docker CLI found but engine not responding — will try to start a runtime"

  ensure_homebrew

  case "$(choose_runtime)" in
    colima)  setup_colima ;;
    desktop) setup_desktop ;;
  esac

  log "Waiting for the Docker engine to come up"
  if wait_for_docker; then
    ok "Docker engine is up"
  else
    warn "Docker engine did not come up in time. Start it manually, then re-run."
    return
  fi

  echo
  if docker run --rm hello-world >/dev/null 2>&1; then
    ok "hello-world ran successfully — Docker is working."
  else
    warn "hello-world did not run. Open a NEW shell and retry: docker run --rm hello-world"
  fi
}

# ----------------------------------------------------------------------------
# Linux/WSL2: rootless Docker Engine
# ----------------------------------------------------------------------------
configure_rootless() {
  command -v dockerd-rootless-setuptool.sh >/dev/null 2>&1 \
    || die "dockerd-rootless-setuptool.sh not found — rootless extras missing for ${FAMILY}."

  # --- Disable the system-wide rootful daemon ---
  log "Disabling rootful system daemon"
  sudo systemctl disable --now docker.service docker.socket >/dev/null 2>&1 || true
  ok "Rootful daemon disabled"

  # --- cgroup v2 controller delegation (needed for --cpus / --memory limits) ---
  log "Setting up cgroup v2 delegation"
  sudo mkdir -p /etc/systemd/system/user@.service.d
  cat <<'EOF' | sudo tee /etc/systemd/system/user@.service.d/delegate.conf >/dev/null
[Service]
Delegate=cpu cpuset io memory pids
EOF
  sudo systemctl daemon-reload
  ok "Delegation drop-in written (full effect after WSL restart)"

  # --- Optional: unprivileged low ports + container ping ---
  log "Applying rootless sysctl tweaks (low ports + ping)"
  cat <<'EOF' | sudo tee /etc/sysctl.d/99-rootless-docker.conf >/dev/null
# Allow rootless containers to bind ports >= 80
net.ipv4.ip_unprivileged_port_start = 80
# Allow ICMP (ping) from inside rootless containers
net.ipv4.ping_group_range = 0 2147483647
EOF
  sudo sysctl --quiet -p /etc/sysctl.d/99-rootless-docker.conf || true
  ok "sysctl tweaks applied"

  # --- Run the rootless setup tool (UNPRIVILEGED — no sudo) ---
  log "Running rootless setup tool as ${TARGET_USER}"
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  dockerd-rootless-setuptool.sh install
  ok "Rootless daemon configured"

  # --- Enable the user service + linger (survives shell/session exit in WSL) ---
  log "Enabling user service and linger"
  systemctl --user enable --now docker
  sudo loginctl enable-linger "$TARGET_USER"
  ok "Service enabled, linger on"

  # --- Persist shell environment ---
  log "Configuring shell environment"
  RC="${HOME}/.bashrc"
  [ -n "${ZSH_VERSION:-}" ] && RC="${HOME}/.zshrc"
  MARKER="# >>> rootless docker >>>"
  if ! grep -qF "$MARKER" "$RC" 2>/dev/null; then
    cat >>"$RC" <<EOF

${MARKER}
export PATH=/usr/bin:\$PATH
export DOCKER_HOST=unix:///run/user/\$(id -u)/docker.sock
# <<< rootless docker <<<
EOF
    ok "Appended env block to $RC"
  else
    ok "Env block already present in $RC"
  fi
  export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
}

configure_rootful() {
  log "Enabling the system Docker daemon"
  sudo systemctl enable --now docker.service
  ok "Docker daemon enabled and started"
}

verify_docker() {
  log "Verifying installation"
  [ "$IS_ROOT" -eq 1 ] || docker context use rootless >/dev/null 2>&1 || true
  docker info 2>/dev/null | grep -iE 'rootless|cgroup' || true

  echo
  if docker run --rm hello-world >/dev/null 2>&1; then
    ok "hello-world ran successfully — Docker is working."
  elif [ "$IS_ROOT" -eq 1 ]; then
    warn "hello-world did not run yet. Check the daemon with: systemctl status docker"
  else
    warn "hello-world did not run yet. Open a NEW shell (to load DOCKER_HOST) and retry:"
    warn "    docker run --rm hello-world"
  fi
}

run_linux() {
  TARGET_USER="$(id -un)"
  IS_ROOT=0
  [ "$(id -u)" -eq 0 ] && IS_ROOT=1

  # --- Preflight checks ---
  log "Preflight checks"

  if [ "$IS_ROOT" -eq 1 ]; then
    sudo() { "$@"; }
    warn "Running as root — installing the system (rootful) Docker daemon, not rootless."
  fi

  grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null \
    || warn "This doesn't look like WSL — continuing anyway."

  if ! pidof systemd >/dev/null 2>&1 && [ ! -d /run/systemd/system ]; then
    die "systemd is not running as PID 1. Add the following to /etc/wsl.conf:

    [boot]
    systemd=true

  then run 'wsl --shutdown' from PowerShell, reopen, and re-run this script."
  fi
  ok "systemd is active"

  [ -r /etc/os-release ] || die "Cannot read /etc/os-release — unable to detect distro."
  . /etc/os-release
  DISTRO_ID="${ID:-}"
  DISTRO_LIKE="${ID_LIKE:-}"

  FAMILY="$(detect_family)"
  if [ "$FAMILY" = unknown ]; then
    warn "Unsupported distribution: ${PRETTY_NAME:-${DISTRO_ID:-unknown}} (ID_LIKE=${DISTRO_LIKE:-none})."
    warn "This installer supports the debian, fedora, arch, and suse families only."
    warn "On WSL, install a supported image (e.g. Ubuntu) and re-run. Exiting without changes."
    exit 0
  fi
  ok "Detected ${PRETTY_NAME:-$DISTRO_ID} — package family: ${FAMILY}"

  # --- Per-distro install ---
  case "$FAMILY" in
    debian) install_debian ;;
    fedora) install_fedora ;;
    arch)   install_arch ;;
    suse)   install_suse ;;
  esac
  ok "Docker installed"

  if [ "$IS_ROOT" -eq 1 ]; then
    configure_rootful
  else
    configure_rootless
  fi

  verify_docker
}

# ----------------------------------------------------------------------------
# Shared: download a release (version-aware)
# ----------------------------------------------------------------------------
# Compare two MAJOR.MINOR.PATCH versions (a leading 'v' and any pre-release
# suffix are ignored). Echoes: gt if $1>$2, lt if $1<$2, eq if equal.
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

print_done() {
  cat <<EOF

------------------------------------------------------------------
Done.

The Liquid Upstart is at ${1}. Enter it and start with:

cd ${1}
./run.sh
------------------------------------------------------------------
EOF
}

REPO="nocodenation/liquidupstart"
DEST="${HOME}/.liquidupstart"
VERSION_FILE="${DEST}/.liquidupstart-version"

# Echo the target release tag: the explicit arg if given, else the latest
# release resolved from the GitHub API.
resolve_tag() {
  local t="${1:-}" api
  if [ -n "$t" ]; then printf '%s\n' "$t"; return; fi
  api="https://api.github.com/repos/${REPO}/releases/latest"
  t="$(curl -fsSL "$api" | grep -m1 '"tag_name"' \
    | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  [ -n "$t" ] || die "Could not determine the latest release tag."
  printf '%s\n' "$t"
}

# Decide what to do BEFORE any Docker work, based on the recorded version.
# Sets TARGET to the tag to install; exits 0 when it's already installed and
# dies on a downgrade. With no prior install it defers tag resolution to the
# download step (curl may not exist yet on a fresh machine).
gate_version() {
  local arg="${1:-}" installed
  installed=""
  [ -f "$VERSION_FILE" ] && installed="$(tr -d '[:space:]' < "$VERSION_FILE")"

  if [ -z "$installed" ]; then
    TARGET="$arg"
    return
  fi

  command -v curl >/dev/null 2>&1 || die "curl is required to check for updates."
  TARGET="$(resolve_tag "$arg")"
  case "$(ver_cmp "$TARGET" "$installed")" in
    eq) ok "${installed#v} is already installed at ${DEST} — nothing to do."
        print_done "$DEST"; exit 0 ;;
    lt) die "Installed version ${installed#v} is newer than ${TARGET#v}. Refusing to downgrade.
  Remove ${DEST} first if you really want ${TARGET#v}." ;;
    gt) log "Upgrading ${installed#v} → ${TARGET#v}" ;;
  esac
}

download_release() {
  local tag="${1:-}" asset url tmp extracted
  command -v unzip >/dev/null 2>&1 || die "unzip is required but not installed."
  tag="$(resolve_tag "$tag")"

  asset="liquidupstart-${tag}.zip"
  url="https://github.com/${REPO}/releases/download/${tag}/${asset}"

  tmp="$(mktemp -d)"
  log "Downloading ${asset}"
  curl -fsSL "$url" -o "${tmp}/${asset}"
  log "Extracting"
  unzip -q "${tmp}/${asset}" -d "$tmp"
  extracted="${tmp}/liquidupstart-${tag}"
  [ -d "$extracted" ] \
    || extracted="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d | head -n1)"

  if [ -d "$DEST" ]; then
    # Upgrade in place: overlay code, leaving .env and volumes/ untouched.
    cp -a "${extracted}/." "${DEST}/"
  else
    mkdir -p "$(dirname "$DEST")"
    mv "$extracted" "$DEST"
  fi
  printf '%s\n' "$tag" > "$VERSION_FILE"
  rm -rf "$tmp"
  ok "Installed ${tag#v} into $DEST"

  print_done "$DEST"
}

# ----------------------------------------------------------------------------
# main — gate on version, then dispatch by OS
# ----------------------------------------------------------------------------
main() {
  TARGET=""
  gate_version "${1:-}"

  case "$(uname -s)" in
    Darwin) run_macos ;;
    Linux)  run_linux ;;
    *)      die "Unsupported OS: $(uname -s). This installer supports Linux/WSL2 and macOS." ;;
  esac

  download_release "$TARGET"
}

main "$@"
