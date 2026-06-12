#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
RESULT_FILE="${SCRIPT_DIR}/.install-result"
IMAGE="all-in-wonder/dashboard:latest"
PORT=7777
PORT_FILE="${SCRIPT_DIR}/.dashboard-port"

usage() {
  echo "Usage: $0 [--port N]"
  echo "Runs the web dashboard: configure .env, build, start/stop the stack,"
  echo "and see every service URL & credential. Starts looking for a free"
  echo "port at ${PORT} (or N) and takes the first available one."
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?--port needs a value}"; shift 2 ;;
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

# APP_ID identifies this installation (creation timestamp of the .env) and is
# appended to every container name so checkouts don't collide. Stamp it when
# the .env was just created — or backfill it into a pre-existing .env.
APP_ID="$(grep -E '^APP_ID=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d '"' || true)"
if [[ -z "$APP_ID" ]]; then
  APP_ID="$(date +%Y%m%d%H%M%S)"
  if grep -qE '^APP_ID=' "$ENV_FILE"; then
    sed -i.bak "s/^APP_ID=.*/APP_ID=${APP_ID}/" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    printf '\nAPP_ID=%s\n' "$APP_ID" >> "$ENV_FILE"
  fi
  echo "Stamped APP_ID=${APP_ID} into .env."
fi

CONTAINER="all-in-wonder-dashboard-${APP_ID}"

if [[ -n "$(docker ps -q --filter "name=^${CONTAINER}$")" ]]; then
  echo "Error: the dashboard is already running. Stop it first with:" >&2
  echo "  docker rm -f ${CONTAINER}" >&2
  exit 1
fi

# Host-side docker socket path (differs under rootless docker). The UI's
# Build/Start buttons spawn the toolbox helper container, which needs the
# socket and the project mounted at its real host path so that nested bind
# mounts (compose.yml, build contexts) resolve identically on the engine.
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

# Find a free port by simply trying to publish it: the bind happens on the
# docker engine (i.e. the real host), so this also works when run.sh itself
# executes inside the Windows toolbox container, where probing host ports
# directly is impossible. A port taken by another dashboard instance (another
# checkout) or any other process makes `docker run` fail with a bind error —
# then try the next one.
MAX_PORT=$((PORT + 100))
while :; do
  URL="http://localhost:${PORT}"
  # ORIGIN must match the URL in the browser: SvelteKit rejects form posts
  # from any other origin, which keeps random websites from writing into .env
  # (or triggering builds) while the dashboard is up.
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

# Read by the Windows-side browser watcher (run.ps1), which cannot know which
# port the scan above settled on.
echo "$PORT" > "$PORT_FILE"

echo ""
echo "All-In-Wonder dashboard is running:  ${URL}"
echo "Manage the stack from there (configure / build / start / stop)."
echo "Ctrl-C here, or the app's Quit button, stops the dashboard (not the stack)."
echo ""

# Best-effort browser open; on Windows (toolbox container) neither exists and
# the printed URL is the instruction.
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
