#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE" ]]; do
  DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ "$SOURCE" != /* ]] && SOURCE="${DIR}/${SOURCE}"
done
SCRIPT_DIR="$(cd "$(dirname "$SOURCE")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
RESULT_FILE="${SCRIPT_DIR}/.install-result"
IMAGE="liquidupstart/dashboard:latest"
PORT=7777
PORT_FILE="${SCRIPT_DIR}/.dashboard-port"

usage() {
  local me; me="$(basename "$0")"
  cat <<EOF
${me} — Liquid Upstart launcher

USAGE
  ${me}
  ${me} --update
  ${me} --cleanup [--keep-images]
  ${me} --help

WHAT IT DOES
  With no arguments, builds and runs the web dashboard, then opens it in your
  browser. From the dashboard you configure .env, build images, and start/stop
  the stack, and see every service URL & credential. It looks for a free port
  starting at ${PORT} and takes the first available one.

  Press Ctrl-C here, or click Quit in the app, to stop the dashboard. That does
  NOT stop the stack — services keep running until you stop them.

OPTIONS
  -u, --update    Update Liquid Upstart to the latest release by re-running the
                  hosted installer (curl https://liquidupstart.com/install.sh).
                  Your .env and volumes/ are preserved; built images are
                  refreshed, so the next start rebuilds.
  -c, --cleanup   Full reset instead of launching: stops the stack and removes
                  all containers, volumes/ (persisted data), .env, and built
                  images. Pass --keep-images to keep images and build cache.
  -h, --help      Show this help and exit.

INSTALL LOCATION
  The project (compose.yml, config/, volumes/, .env) lives in:
    ${SCRIPT_DIR}
  cd into it to work with it directly:
    cd "${SCRIPT_DIR}"

EXAMPLES
  ${me}                          # launch the dashboard
  ${me} --update                 # update to the latest release
  ${me} --cleanup                # tear down and wipe everything (does not restart)
  ${me} --cleanup --keep-images  # same, but keep images & build cache for a faster rebuild
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--cleanup) shift; exec "${SCRIPT_DIR}/cleanup.sh" "$@" ;;
    -u|--update)
      command -v curl >/dev/null 2>&1 || { echo "Error: curl is required to update." >&2; exit 1; }
      exec bash -c 'curl -fsSL https://liquidupstart.com/install.sh | bash' ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if ! docker version >/dev/null 2>&1; then
  echo "Error: Docker is not running (or not installed)." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "${SCRIPT_DIR}/.env.example" "$ENV_FILE"
  echo "No .env found - created one from .env.example."
fi

CONTAINER="liquidupstart-dashboard"

if [[ -n "$(docker ps -q --filter "name=^${CONTAINER}$")" ]]; then
  echo "Error: the dashboard is already running. Stop it first with:" >&2
  echo "  docker rm -f ${CONTAINER}" >&2
  exit 1
fi

# Host-side docker socket path (differs under rootless docker). The UI's
# Build/Start buttons spawn the toolbox container, which needs the socket and
# the project at its real host path so nested bind mounts resolve on the engine.
DOCKER_SOCK="${DOCKER_HOST:-}"
if [[ -z "$DOCKER_SOCK" ]]; then
  DOCKER_SOCK="$(docker context inspect --format '{{.Endpoints.docker.Host}}' 2>/dev/null || true)"
fi
DOCKER_SOCK="${DOCKER_SOCK#unix://}"
[[ -z "$DOCKER_SOCK" || "$DOCKER_SOCK" == *"://"* ]] && DOCKER_SOCK="/var/run/docker.sock"

echo "Building the dashboard image..."
docker build -q -t "$IMAGE" "${SCRIPT_DIR}/dashboard" >/dev/null

rm -f "$RESULT_FILE" "$PORT_FILE"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -f "$PORT_FILE"; }
trap cleanup INT TERM

# Find a free port by trying to publish it: the bind happens on the docker
# engine (the real host), so this also works from inside the Windows toolbox
# container where probing host ports directly is impossible. A taken port makes
# `docker run` fail with a bind error — then try the next one.
MAX_PORT=$((PORT + 100))
while :; do
  URL="http://localhost:${PORT}"
  # ORIGIN must match the browser URL: SvelteKit rejects cross-origin form
  # posts, blocking random sites from writing .env or triggering builds.
  set +e
  RUN_ERR="$(docker run -d --rm --name "$CONTAINER" \
    -p "127.0.0.1:${PORT}:3000" \
    -e "ORIGIN=${URL}" \
    -e "ENV_DIR=${SCRIPT_DIR}" \
    -e "HOST_DOCKER_SOCK=${DOCKER_SOCK}" \
    -v "${SCRIPT_DIR}:${SCRIPT_DIR}" \
    -v "${DOCKER_SOCK}:/var/run/docker.sock" \
    "$IMAGE" 2>&1 >/dev/null)"
  RUN_RC=$?
  set -e
  [[ $RUN_RC -eq 0 ]] && break
  if echo "$RUN_ERR" | grep -qiE 'port is already allocated|address already in use|bind for'; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    echo "Port ${PORT} is taken - trying $((PORT + 1))..."
    PORT=$((PORT + 1))
    if (( PORT > MAX_PORT )); then
      echo "Error: no free port found between $((MAX_PORT - 100)) and ${MAX_PORT}." >&2
      exit 1
    fi
    continue
  fi
  echo "Error: failed to start the dashboard container:" >&2
  echo "$RUN_ERR" >&2
  exit 1
done

# Read by the Windows browser watcher (run.ps1), which can't know the chosen port.
echo "$PORT" > "$PORT_FILE"

echo ""
echo "Liquid Upstart dashboard is running:  ${URL}"
echo "Manage the stack from there (configure / build / start / stop)."
echo "Ctrl-C here, or the app's Quit button, stops the dashboard (not the stack)."
echo ""

# Best-effort browser open; on Windows neither exists, so the printed URL serves.
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1; xdg-open "$URL" >/dev/null 2>&1) &
elif command -v open >/dev/null 2>&1; then
  (sleep 1; open "$URL" >/dev/null 2>&1) &
fi

docker wait "$CONTAINER" >/dev/null 2>&1 || true
trap - INT TERM
rm -f "$RESULT_FILE" "$PORT_FILE"

echo "Dashboard stopped. The stack keeps whatever state it was in"
echo "(run ./run.sh again - or scripts/linux/{start,down}.sh - to manage it)."
