#!/usr/bin/env bash
# Pending OpenClaw device pairing requests: list them, and approve one.
#
#   openclaw-pairing.sh <project-dir> list
#   openclaw-pairing.sh <project-dir> approve <request-id>
#
# Why this exists at all. `gateway.auth.mode` is trusted-proxy, so the gateway
# takes identity from the X-Forwarded-User header nginx sets and from nothing
# else. A CLI run inside the gateway container reaches it directly, sends no such
# header, and is refused with `trusted_proxy_user_missing` -- which is why the
# recovery the Control UI prints ("run openclaw devices approve on the Gateway
# host") cannot be followed in this stack, and why a browser whose device token
# had been revoked was unrecoverable on 2026-09-19 without deleting its site
# data. See §9 of docs/FEATURE-openclaw-2026-9-1.md.
#
# So the CLI is sent THROUGH nginx instead. Three things are load-bearing and
# each was measured:
#
#   --add-host      openclaw.localhost does not resolve inside the network, and
#                   nginx routes by server_name -- the first block on the port is
#                   pgadmin, so connecting by IP lands on the wrong service.
#   OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1
#                   the CLI refuses plaintext ws:// to a non-loopback address.
#   --token         --url is refused outright without a credential. Its VALUE is
#                   never checked here: a deliberately wrong token still got
#                   through to `missing scope: operator.pairing`, which is the
#                   refusal that proves the header arrived. `unused` says so.
#
# The scope it then needs comes from gateway.auth.identityScopes, written by
# config/scripts/start/openclaw.sh. Without that grant this script authenticates
# and can do nothing.
set -euo pipefail

PROJECT_DIR="${1:?project directory required}"
VERB="${2:?list or approve}"
REQUEST_ID="${3:-}"

ENV_FILE="${PROJECT_DIR}/.env"

# Read a key out of .env without sourcing it: a value with a space or a quote
# would otherwise become several words, and one with a backtick would run.
get_env() {
  [[ -f "$ENV_FILE" ]] || return 0
  awk -F= -v k="$1" '
    $0 ~ "^[[:space:]]*#" { next }
    $1 == k { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }
  ' "$ENV_FILE"
}

HTTP_PORT="$(get_env SYSTEM_HTTP_PORT)"; HTTP_PORT="${HTTP_PORT:-8888}"
PROXY_IP="$(get_env SYSTEM_PROXY_IP)";   PROXY_IP="${PROXY_IP:-10.99.0.2}"
# Both from the same places compose reads them, so a stack on another port or
# another subnet needs no edit here.
NETWORK="nocodenation_liquid_upstart_network_${HTTP_PORT}"
IMAGE="liquidupstart/openclaw:latest"
HOST="openclaw.localhost:${HTTP_PORT}"

run_cli() {
  docker run --rm \
    --network "$NETWORK" \
    --add-host "openclaw.localhost:${PROXY_IP}" \
    -e OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 \
    --entrypoint openclaw \
    "$IMAGE" \
    "$@" --url "ws://${HOST}" --token unused --timeout 20000
}

case "$VERB" in
  list)
    # The CLI's own JSON, unchanged. The caller parses it: this container has no
    # jq, and a shell that reshapes JSON is a second place for the shape to be
    # wrong.
    run_cli devices list --json
    ;;
  approve)
    if [[ -z "$REQUEST_ID" ]]; then
      echo "approve needs a request id" >&2
      exit 2
    fi
    # Guarded again here rather than trusting the caller: this is the last point
    # before the value reaches a command line, and the route that calls it is not
    # the only thing that ever will.
    if [[ ! "$REQUEST_ID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      echo "not a request id: ${REQUEST_ID}" >&2
      exit 2
    fi
    run_cli devices approve "$REQUEST_ID"
    ;;
  *)
    echo "unknown verb: ${VERB}" >&2
    exit 2
    ;;
esac
