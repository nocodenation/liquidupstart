#!/usr/bin/env bash
set -euo pipefail

# Seed the Hermes config from a mounted default if the persistent volume
# doesn't already have one. /root/.hermes is a volume, so this only copies
# on first run (or after the volume is reset).
if [ -f /opt/config.yaml ] && [ ! -f /root/.hermes/config.yaml ]; then
    mkdir -p /root/.hermes
    cp /opt/config.yaml /root/.hermes/config.yaml
fi

# This image is not s6-supervised, so `gateway run` won't auto-spawn the
# dashboard for us, and `hermes dashboard` doesn't read the HERMES_DASHBOARD*
# env vars on its own. Start both ourselves: the dashboard (web UI) in the
# background, and the API gateway in the foreground. The gateway reads the
# API_SERVER_* env vars (API_SERVER_ENABLED / API_SERVER_HOST / API_SERVER_KEY
# / API_SERVER_CORS_ORIGINS) and brings up the OpenAI-compatible API server on
# 0.0.0.0:8642 (API_SERVER_HOST + the gateway's DEFAULT_PORT).

dashboard_pid=""
gateway_pid=""

shutdown() {
    trap - TERM INT
    [ -n "$gateway_pid" ] && kill -TERM "$gateway_pid" 2>/dev/null || true
    [ -n "$dashboard_pid" ] && kill -TERM "$dashboard_pid" 2>/dev/null || true
}
trap shutdown TERM INT

# Match Hermes' own truthy set (utils.is_truthy_value): 1/true/yes/on.
is_truthy() {
    case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
        1|true|yes|on) return 0 ;;
        *) return 1 ;;
    esac
}

# Dashboard (background), configured entirely from the HERMES_DASHBOARD* env
# vars so it can be tuned from compose without editing this script:
#   HERMES_DASHBOARD          gate — only start the dashboard when truthy
#   HERMES_DASHBOARD_HOST     bind host (default 0.0.0.0 for container access)
#   HERMES_DASHBOARD_PORT     listen port (default 9119)
#   HERMES_DASHBOARD_INSECURE pass --insecure to allow non-localhost binding
if is_truthy "${HERMES_DASHBOARD:-}"; then
    dashboard_args=(
        --host "${HERMES_DASHBOARD_HOST:-0.0.0.0}"
        --port "${HERMES_DASHBOARD_PORT:-9119}"
        --no-open
    )
    if is_truthy "${HERMES_DASHBOARD_INSECURE:-}"; then
        dashboard_args+=(--insecure)
    fi
    hermes dashboard "${dashboard_args[@]}" &
    dashboard_pid=$!
else
    echo "HERMES_DASHBOARD not truthy; skipping dashboard startup." >&2
fi

# API gateway (background, but treated as the primary process). Honour any
# command passed from compose (e.g. ["gateway", "run"]); fall back to the
# default gateway invocation otherwise.
if [ "$#" -gt 0 ]; then
    hermes "$@" &
else
    hermes gateway run &
fi
gateway_pid=$!

# Exit as soon as any running service dies so the container (and Docker's
# restart policy) reflects an unhealthy state instead of silently losing one.
wait_pids=()
[ -n "$dashboard_pid" ] && wait_pids+=("$dashboard_pid")
[ -n "$gateway_pid" ] && wait_pids+=("$gateway_pid")
status=0
wait -n "${wait_pids[@]}" || status=$?

shutdown
wait || true
exit "$status"
