#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

# OpenClaw bind-mounts these host dirs into the gateway/CLI containers
# (see compose.yml). Create them up front so that under rootless/userns-remapped
# Docker they map back to the host UID that owns them, instead of letting the
# daemon create them root-owned, which causes EACCES on first write to
# /home/node/.openclaw/state.
STATE_DIR="${PROJECT_DIR}/volumes/_openclaw"
WORKSPACE_DIR="${STATE_DIR}/workspace"
SECRETS_DIR="${PROJECT_DIR}/volumes/_openclaw-auth-profile-secrets"

for dir in "${STATE_DIR}" "${WORKSPACE_DIR}" "${SECRETS_DIR}"; do
  mkdir -p "$dir"
  chmod 777 "$dir"
done

# Bootstrap baseline OpenClaw config + workspace inside the state volume.
# `setup` (without --wizard) is non-interactive: it only creates the config,
# workspace, and session folders. The openclaw-cli service shares the gateway's
# network namespace (network_mode: service:openclaw-gateway), so Compose starts
# openclaw-gateway as a dependency automatically.
#
# Only bootstrap when openclaw.json is missing. On subsequent starts the config
# already exists (and may carry user edits), so re-running `setup` is unnecessary.
# The model patch further below still runs every start, keeping .env's
# OPENCLAW_PRIMARY_MODEL the source of truth for agents.defaults.model.primary.
CONFIG_JSON="${STATE_DIR}/openclaw.json"
if [[ ! -f "$CONFIG_JSON" ]]; then
  cd "${PROJECT_DIR}"
  docker compose run --rm --user 0:0 openclaw-cli setup
else
  echo "OpenClaw config already present at ${CONFIG_JSON}; skipping setup."
fi

# Patch openclaw.json on every start so the gateway works behind the proxy:
#
#   1. gateway.auth (trusted-proxy mode) — auth is delegated to nginx so the
#      dashboard needs no token/password in the browser. mode:"none" is impossible
#      here (the gateway fail-closes on a non-loopback "lan" bind without auth, with
#      no override), so instead the gateway trusts the X-Forwarded-User header that
#      nginx injects, but only from trusted proxy IPs (gateway.trustedProxies). We
#      list the private Docker subnets plus loopback, and allow loopback so the
#      openclaw-cli (shared netns → 127.0.0.1) keeps working. This is why the
#      gateway must never publish host ports — the header is only trustworthy
#      because nothing but the proxy/CLI can reach the gateway.
#
#   2. gateway.controlUi.allowedOrigins — the dashboard's browser WebSocket origin
#      is rejected ("Browser origin not allowed") unless allowlisted. We set ["*"]
#      (any origin) so it stays correct regardless of host/port; the origin check is
#      only a CSRF-style guard. No env var exists — it must live in the config.
#
#   3. gateway.controlUi.dangerouslyDisableDeviceAuth — disables the per-browser
#      device-pairing check. Behind the proxy the gateway sees the proxy container's
#      IP, not localhost, so the milder allowInsecureAuth (localhost only) does not
#      apply and every browser would otherwise be forced to pair.
#
#   4. agents.defaults.model.primary — `setup` writes a placeholder
#      ("openclaw-default"); override it with OPENCLAW_PRIMARY_MODEL when set.
#
# `|| true`: when a key is absent grep exits 1, which under `set -o pipefail`
# + `set -e` would abort the whole script (and stop start.sh before it brings
# the stack up). Tolerate a missing key and fall through to the guard below.
PRIMARY_MODEL="$(grep -E '^OPENCLAW_PRIMARY_MODEL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"" || true)"

if [[ ! -f "$CONFIG_JSON" ]]; then
  echo "Warning: ${CONFIG_JSON} not found after setup; cannot patch config." >&2
else
  if [[ -z "$PRIMARY_MODEL" ]]; then
    echo "Note: OPENCLAW_PRIMARY_MODEL not set in ${ENV_FILE}; leaving openclaw.json model untouched." >&2
  fi
  # Patch the JSON with the image's bundled node (no host jq/node dependency, and
  # no gateway needed — a throwaway container mounting only the state dir).
  docker run --rm --user 0:0 \
    -v "${STATE_DIR}:/state" \
    -e PRIMARY_MODEL="${PRIMARY_MODEL}" \
    -e PLUGIN_PATHS="/home/node/.openclaw/plugins/ingest-pdf" \
    --entrypoint node \
    ghcr.io/openclaw/openclaw:latest \
    -e '
      const fs = require("fs");
      const p = "/state/openclaw.json";
      const c = JSON.parse(fs.readFileSync(p, "utf8"));

      c.gateway = c.gateway || {};

      // Delegate auth to the nginx proxy: the browser presents no token/password.
      // nginx sets X-Forwarded-User; the gateway trusts it only from these proxy
      // IPs (private Docker subnets + loopback). allowLoopback keeps openclaw-cli
      // (shared netns → 127.0.0.1) working.
      c.gateway.auth = c.gateway.auth || {};
      c.gateway.auth.mode = "trusted-proxy";
      c.gateway.auth.trustedProxy = c.gateway.auth.trustedProxy || {};
      c.gateway.auth.trustedProxy.userHeader = "x-forwarded-user";
      c.gateway.auth.trustedProxy.allowLoopback = true;
      c.gateway.trustedProxies = ["127.0.0.1/32", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

      // Allow any browser origin (the dashboard is proxied; the proxy now guards
      // access). Keeps working regardless of host/port.
      c.gateway.controlUi = c.gateway.controlUi || {};
      c.gateway.controlUi.allowedOrigins = ["*"];

      // Disable per-browser device pairing (see header comment). allowInsecureAuth
      // is localhost-only and useless behind the proxy, so use the break-glass key.
      c.gateway.controlUi.dangerouslyDisableDeviceAuth = true;

      // Set the primary model only when provided, so an empty env value does not
      // clobber a placeholder or a manual choice.
      if (process.env.PRIMARY_MODEL) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = process.env.PRIMARY_MODEL;
      }

      // Register local plugin dirs (idempotent add). A plugin loaded from
      // plugins.load.paths resolves its imports from its own location; our
      // plugins ship a self-contained dist/*.mjs bundle (see config/openclaw/
      // plugins/<id>/build.sh), so no node_modules is needed at runtime.
      const pluginPaths = (process.env.PLUGIN_PATHS || "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      if (pluginPaths.length) {
        c.plugins = c.plugins || {};
        c.plugins.load = c.plugins.load || {};
        const paths = Array.isArray(c.plugins.load.paths) ? c.plugins.load.paths : [];
        for (const pp of pluginPaths) if (!paths.includes(pp)) paths.push(pp);
        c.plugins.load.paths = paths;
      }

      fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
      console.log("openclaw.json: auth.mode =", c.gateway.auth.mode, "; trustedProxies =", JSON.stringify(c.gateway.trustedProxies));
      console.log("openclaw.json: allowedOrigins =", JSON.stringify(c.gateway.controlUi.allowedOrigins));
      console.log("openclaw.json: dangerouslyDisableDeviceAuth =", c.gateway.controlUi.dangerouslyDisableDeviceAuth);
      if (pluginPaths.length) {
        console.log("openclaw.json: plugins.load.paths =", JSON.stringify(c.plugins.load.paths));
      }
      if (process.env.PRIMARY_MODEL) {
        console.log("openclaw.json: set agents.defaults.model.primary =", process.env.PRIMARY_MODEL);
      }
    '
fi
