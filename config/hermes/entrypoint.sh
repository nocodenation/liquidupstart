#!/usr/bin/env bash
set -euo pipefail

# Seed config from the mounted default only on first run; /root/.hermes is a volume.
if [ -f /opt/config.yaml ] && [ ! -f /root/.hermes/config.yaml ]; then
    mkdir -p /root/.hermes
    cp /opt/config.yaml /root/.hermes/config.yaml
fi

cp /opt/.env /root/.hermes/.env
cp /opt/SOUL.md /root/.hermes/SOUL.md
mkdir -p /root/.hermes/plugins
cp -r /opt/plugins/ingest_pdf /root/.hermes/plugins/ingest_pdf

# curl hard-codes *.localhost -> 127.0.0.1 (RFC 6761), so route system HTTP/HTTPS
# ports through the proxy container, preserving Host so nginx vhost routing works.
# Scoped to those ports; rewritten each start to track the env.
SYSTEM_HTTP_PORT="${SYSTEM_HTTP_PORT:-8888}"
SYSTEM_HTTPS_PORT="${SYSTEM_HTTPS_PORT:-8833}"
{
    printf 'connect-to = ":%s:proxy:%s"\n' "$SYSTEM_HTTP_PORT" "$SYSTEM_HTTP_PORT"
    printf 'connect-to = ":%s:proxy:%s"\n' "$SYSTEM_HTTPS_PORT" "$SYSTEM_HTTPS_PORT"
} > /root/.curlrc

# Not s6-supervised, so start both ourselves: dashboard (background) + API gateway
# (foreground). Gateway reads API_SERVER_* env and serves the OpenAI-compatible API
# on 0.0.0.0:8642.

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

# Dashboard (background), configured from HERMES_DASHBOARD* env:
#   HERMES_DASHBOARD          gate — only start when truthy
#   HERMES_DASHBOARD_HOST     bind host (default 0.0.0.0)
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

# API gateway (primary process). Honour any command passed from compose,
# else the default gateway invocation.
if [ "$#" -gt 0 ]; then
    hermes "$@" &
else
    hermes gateway run &
fi
gateway_pid=$!

# Exit as soon as any service dies so Docker's restart policy can react.
wait_pids=()
[ -n "$dashboard_pid" ] && wait_pids+=("$dashboard_pid")
[ -n "$gateway_pid" ] && wait_pids+=("$gateway_pid")
status=0
wait -n "${wait_pids[@]}" || status=$?

shutdown
wait || true
exit "$status"
