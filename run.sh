#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
RESULT_FILE="${SCRIPT_DIR}/.install-result"
IMAGE="all-in-wonder/dashboard:latest"
PORT=8808

usage() {
  echo "Usage: $0 [--port N]"
  echo "Runs the web dashboard: configure .env, build, start/stop the stack,"
  echo "and see every service URL & credential (default port: ${PORT})."
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

rm -f "$RESULT_FILE"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup INT TERM

URL="http://localhost:${PORT}"
# ORIGIN must match the URL in the browser: SvelteKit rejects form posts from
# any other origin, which keeps random websites from writing into .env (or
# triggering builds) while the installer is up.
docker run -d --rm --name "$CONTAINER" \
  -p "127.0.0.1:${PORT}:3000" \
  -e "ORIGIN=${URL}" \
  -e "ENV_DIR=${SCRIPT_DIR}" \
  -e "HOST_DOCKER_SOCK=${DOCKER_SOCK}" \
  -v "${SCRIPT_DIR}:${SCRIPT_DIR}" \
  -v "${DOCKER_SOCK}:/var/run/docker.sock" \
  "$IMAGE" >/dev/null

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
rm -f "$RESULT_FILE"

echo "Dashboard stopped. The stack keeps whatever state it was in"
echo "(run ./run.sh again - or scripts/linux/{start,down}.sh - to manage it)."
