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
# If an install already exists, this script hands off to the hosted updater
# (https://liquidupstart.com/update.sh) instead of reinstalling.
#
set -euo pipefail

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  ! \033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# readlink -f only exists on macOS 12.3+; resolve by hand where it does not.
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
brew_writable() {
  local prefix cellar
  prefix="$(brew --prefix 2>/dev/null)" || return 1
  [ -n "$prefix" ] || return 1
  cellar="${prefix}/Cellar"
  [ -d "$cellar" ] || cellar="$prefix"
  [ -w "$cellar" ]
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    if brew_writable; then
      ok "Homebrew present"
      return
    fi
    die "Homebrew is installed at $(brew --prefix) but is not writable by $(id -un).

  Homebrew supports only one user per installation — everything is owned by the
  account that installed it, so 'brew install' from a second account fails. Either:

    * ask that account (or an administrator) to run:
          brew install colima docker docker-compose
    * or have an administrator share the installation:
          sudo chgrp -R admin \$(brew --prefix)
          sudo chmod -R g+w \$(brew --prefix)

  then re-run this script."
  fi
  log "Homebrew not found — installing"
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  for p in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    [ -x "$p" ] && eval "$("$p" shellenv)" && break
  done
  command -v brew >/dev/null 2>&1 \
    || die "Homebrew install failed. Installing it needs an administrator account —
  ask an admin to install Homebrew (or Colima directly), then re-run this script."
  ok "Homebrew installed"
}

# Docker Desktop links /usr/local/bin/docker into the installing user's
# ~/Library/Group Containers, so for any other account the CLI is unusable.
foreign_docker_cli() {
  local cli target
  cli="$(command -v docker 2>/dev/null)" || return 1
  [ -n "$cli" ] || return 1
  target="$(resolve_path "$cli" 2>/dev/null)" || return 1
  case "$target" in
    "${HOME}"/*) return 1 ;;
    /Users/*)    printf '%s\n' "$target"; return 0 ;;
    *)           return 1 ;;
  esac
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

  local runtime="" foreign=""
  foreign="$(foreign_docker_cli || true)"
  if [ -n "$foreign" ]; then
    warn "The 'docker' command resolves into another user's home:"
    warn "    ${foreign}"
    warn "Docker Desktop on macOS is per-user and cannot be shared between accounts,"
    warn "so Colima will be installed for $(id -un) instead."
    runtime=colima
  fi

  ensure_homebrew

  case "${runtime:-$(choose_runtime)}" in
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
docker_ready() {
  command -v docker >/dev/null 2>&1 || return 1
  if [ -z "${DOCKER_HOST:-}" ] && [ -S "/run/user/$(id -u)/docker.sock" ]; then
    export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
  fi
  docker info >/dev/null 2>&1
}

engine_matches_mode() {
  [ "$IS_ROOT" -eq 1 ] && return 0
  docker info --format '{{println .SecurityOptions}}' 2>/dev/null | grep -q 'name=rootless'
}

detect_sudo() {
  SUDO_OK=1
  [ "$IS_ROOT" -eq 1 ] && return 0
  if ! command -v sudo >/dev/null 2>&1; then
    SUDO_OK=0
  elif ! sudo -n true >/dev/null 2>&1; then
    log "Requesting sudo access (needed for the system-wide parts of the setup)"
    sudo -v || SUDO_OK=0
  fi
  [ "$SUDO_OK" -eq 1 ] || warn "No sudo rights for ${TARGET_USER} — continuing without them."
  return 0
}

rootless_pkgs_ok() {
  command -v dockerd-rootless-setuptool.sh >/dev/null 2>&1 \
    && command -v newuidmap >/dev/null 2>&1
}

subid_ok() {
  grep -q "^${TARGET_USER}:" /etc/subuid 2>/dev/null \
    && grep -q "^${TARGET_USER}:" /etc/subgid 2>/dev/null
}

ensure_subid() {
  subid_ok && return 0
  [ "$SUDO_OK" -eq 1 ] || return 1
  log "No subordinate UID/GID range for ${TARGET_USER} — allocating one"
  local start end
  start="$(awk -F: 'NF>=3 && $2 ~ /^[0-9]+$/ { e=$2+$3; if (e>m) m=e } END { print (m<100000 ? 100000 : m) }' \
    /etc/subuid /etc/subgid 2>/dev/null)"
  end=$((start + 65535))
  sudo usermod --add-subuids "${start}-${end}" --add-subgids "${start}-${end}" "$TARGET_USER" \
    >/dev/null 2>&1 \
    || {
      printf '%s:%s:65536\n' "$TARGET_USER" "$start" | sudo tee -a /etc/subuid >/dev/null
      printf '%s:%s:65536\n' "$TARGET_USER" "$start" | sudo tee -a /etc/subgid >/dev/null
    }
  subid_ok || return 1
  ok "Allocated ${start}-${end} to ${TARGET_USER}"
}

user_session_ok() {
  [ -d "/run/user/$(id -u)" ] || return 1
  systemctl --user show-environment >/dev/null 2>&1
}

die_no_session() {
  die "No systemd user session for ${TARGET_USER} (/run/user/$(id -u) or 'systemctl --user' is unavailable).

  Rootless Docker runs as a user service and needs a real login session. If you got here
  through 'su' or 'sudo -i' from another account, log in as ${TARGET_USER} directly
  (console or ssh) and re-run this script.

  If ${TARGET_USER} never logs in interactively, an administrator can run:

      loginctl enable-linger ${TARGET_USER}

  then re-run this script as ${TARGET_USER}."
}

die_no_sudo() {
  local pkgs
  case "$FAMILY" in
    debian) pkgs="apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras uidmap dbus-user-session slirp4netns" ;;
    fedora) pkgs="dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras shadow-utils slirp4netns fuse-overlayfs" ;;
    arch)   pkgs="pacman -S --needed docker docker-buildx docker-compose slirp4netns fuse-overlayfs" ;;
    suse)   pkgs="zypper install docker docker-buildx docker-compose docker-rootless-extras slirp4netns fuse-overlayfs" ;;
  esac
  die "Rootless Docker needs to be installed, but ${TARGET_USER} has no sudo rights.

  Ask an administrator to run (as root):

      ${pkgs}
      usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${TARGET_USER}
      loginctl enable-linger ${TARGET_USER}

  then re-run this script as ${TARGET_USER}. No docker group membership is needed —
  rootless Docker runs entirely as your own user."
}

start_existing_docker() {
  command -v docker >/dev/null 2>&1 || return 1
  if [ "$IS_ROOT" -eq 0 ]; then
    [ -f "${HOME}/.config/systemd/user/docker.service" ] || return 1
    log "Rootless service found but not running — starting it"
    systemctl --user start docker >/dev/null 2>&1 || true
  else
    log "docker CLI found but the engine is not responding — starting the system daemon"
    sudo systemctl start docker.service >/dev/null 2>&1 || true
  fi
  docker_ready
}

persist_shell_env() {
  local RC="${HOME}/.bashrc" MARKER="# >>> rootless docker >>>"
  [ -n "${ZSH_VERSION:-}" ] && RC="${HOME}/.zshrc"
  log "Configuring shell environment"
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

configure_rootless() {
  command -v dockerd-rootless-setuptool.sh >/dev/null 2>&1 \
    || die "dockerd-rootless-setuptool.sh not found — rootless extras missing for ${FAMILY}."

  ensure_subid || die "${TARGET_USER} has no range in /etc/subuid and /etc/subgid, which
  rootless Docker requires. An administrator can grant one with:

      usermod --add-subuids 100000-165535 --add-subgids 100000-165535 ${TARGET_USER}

  (pick a range that does not overlap any existing entry), then re-run this script."

  if [ "$SUDO_OK" -eq 0 ]; then
    warn "No sudo rights — skipping system-wide tweaks (rootful daemon, cgroup delegation, sysctl)."
    warn "Rootless Docker still works; container CPU/memory limits and ports below 1024 will not."
    configure_rootless_user
    return
  fi

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

  configure_rootless_user
}

configure_rootless_user() {
  # --- Run the rootless setup tool (UNPRIVILEGED — no sudo) ---
  log "Running rootless setup tool as ${TARGET_USER}"
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  dockerd-rootless-setuptool.sh install
  ok "Rootless daemon configured"

  # --- Enable the user service + linger (survives shell/session exit in WSL) ---
  log "Enabling user service and linger"
  systemctl --user enable --now docker
  if loginctl enable-linger "$TARGET_USER" >/dev/null 2>&1; then
    ok "Service enabled, linger on"
  elif [ "$SUDO_OK" -eq 1 ] && sudo loginctl enable-linger "$TARGET_USER"; then
    ok "Service enabled, linger on"
  else
    warn "Could not enable linger — Docker will stop when your last session ends."
    warn "Ask an administrator for: loginctl enable-linger ${TARGET_USER}"
  fi

  # --- Persist shell environment ---
  persist_shell_env
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
  fi

  if docker_ready && engine_matches_mode; then
    ok "Docker already running ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo up)) — skipping install"
    [ "$IS_ROOT" -eq 1 ] || persist_shell_env
    return
  fi

  if start_existing_docker && engine_matches_mode; then
    ok "Docker engine started ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo up)) — skipping install"
    [ "$IS_ROOT" -eq 1 ] || persist_shell_env
    return
  fi

  if [ "$IS_ROOT" -eq 1 ]; then
    warn "Running as root — installing the system (rootful) Docker daemon, not rootless."
  elif docker_ready; then
    unset DOCKER_HOST
    warn "A rootful Docker daemon is reachable, but this installer sets up rootless Docker"
    warn "for ${TARGET_USER}. The system daemon will be disabled in favour of the user one."
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

  detect_sudo
  [ "$IS_ROOT" -eq 1 ] || user_session_ok || die_no_session

  # --- Per-distro install ---
  if [ "$IS_ROOT" -eq 0 ] && rootless_pkgs_ok; then
    ok "Docker Engine with rootless extras already present — skipping package install"
  elif [ "$SUDO_OK" -eq 0 ]; then
    die_no_sudo
  else
    case "$FAMILY" in
      debian) install_debian ;;
      fedora) install_fedora ;;
      arch)   install_arch ;;
      suse)   install_suse ;;
    esac
    ok "Docker installed"
  fi

  if [ "$IS_ROOT" -eq 1 ]; then
    configure_rootful
  else
    configure_rootless
  fi

  verify_docker
}

# ----------------------------------------------------------------------------
# Shared: download a release
# ----------------------------------------------------------------------------
LAUNCHER_DIR="/usr/local/bin"
LAUNCHER="${LAUNCHER_DIR}/liquidupstart"

link_launcher() {
  local src="${DEST}/run.sh" existing
  chmod +x "$src" 2>/dev/null || true

  if [ -e "$LAUNCHER" ] || [ -L "$LAUNCHER" ]; then
    existing="$(resolve_path "$LAUNCHER" 2>/dev/null || true)"
    if [ -n "$existing" ] && [ "$existing" != "$(resolve_path "$src")" ]; then
      warn "${LAUNCHER} already points at ${existing} (another install) — not touching it."
      link_launcher_user "$src"
      return 0
    fi
  fi

  log "Linking the 'liquidupstart' command into ${LAUNCHER_DIR}"
  if [ -d "$LAUNCHER_DIR" ] && [ -w "$LAUNCHER_DIR" ]; then
    ln -sfn "$src" "$LAUNCHER"
  elif [ "${SUDO_OK:-1}" -eq 1 ] && command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p "$LAUNCHER_DIR" && sudo ln -sfn "$src" "$LAUNCHER"
  else
    link_launcher_user "$src"
    return 0
  fi
  if [ -L "$LAUNCHER" ]; then
    ok "Run 'liquidupstart' from any directory"
  else
    link_launcher_user "$src"
  fi
}

link_launcher_user() {
  local src="$1" dir="${HOME}/.local/bin"
  mkdir -p "$dir" || { warn "Start the app with: ${src}"; return 0; }
  ln -sfn "$src" "${dir}/liquidupstart"
  ok "Linked ${dir}/liquidupstart (personal copy)"
  case ":${PATH}:" in
    *":${dir}:"*) ok "Run 'liquidupstart' from any directory" ;;
    *) warn "${dir} is not on your PATH — add it, or start the app with: ${src}" ;;
  esac
}

print_done() {
  cat <<EOF

------------------------------------------------------------------
Done.

Liquid Upstart is installed at ${1}.

Start it from anywhere with:

    liquidupstart
------------------------------------------------------------------
EOF
}

REPO="nocodenation/liquidupstart"
DEST="${HOME}/.liquidupstart"
VERSION_FILE="${DEST}/.liquidupstart-version"
UPDATE_URL="https://liquidupstart.com/update.sh"

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

# An install already exists — hand off to the hosted updater instead of
# reinstalling, then exit with its status.
run_update() {
  local tmp rc
  log "Liquid Upstart is already installed at ${DEST} — running the updater."
  command -v curl >/dev/null 2>&1 || die "curl is required to run the updater."
  tmp="$(mktemp)"
  curl -fsSL "$UPDATE_URL" -o "$tmp" \
    || die "Could not download the updater from ${UPDATE_URL}."
  bash "$tmp"
  rc=$?
  rm -f "$tmp"
  exit "$rc"
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
  verify_checksum "${tmp}/${asset}" "${url}.sha256"
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

  link_launcher
  print_done "$DEST"
}

# ----------------------------------------------------------------------------
# main — update if already installed, else install fresh
# ----------------------------------------------------------------------------
main() {
  [ -f "$VERSION_FILE" ] && run_update

  case "$(uname -s)" in
    Darwin) run_macos ;;
    Linux)  run_linux ;;
    *)      die "Unsupported OS: $(uname -s). This installer supports Linux/WSL2 and macOS." ;;
  esac

  download_release "${1:-}"
}

# install-local.sh sources this file for the Docker bootstrap and the launcher
# helpers, and supplies its own copy step in place of download_release.
[ -n "${LU_INSTALL_LIB:-}" ] || main "$@"
