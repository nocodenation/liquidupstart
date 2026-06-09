#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Read a KEY=value from the project-root .env (empty string if unset/missing).
# `|| true`: a missing key makes grep exit 1, which under `set -o pipefail` +
# `set -e` would otherwise abort the whole script.
get_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true
}

# Render config/openclaw/.env from the template, then inject the model-provider
# keys from the project-root .env. The template is the contract: only keys it
# already declares (as a commented `# KEY=` line) are supported by OpenClaw —
# any other keys in the root .env are ignored. For a supported key with a
# non-empty value we uncomment its line and substitute the value; empty keys
# stay commented so OpenClaw falls back to its other auth sources.
OPENCLAW_DIR="${PROJECT_DIR}/config/openclaw"
OPENCLAW_ENV_TEMPLATE="${OPENCLAW_DIR}/templates/env_template"
OPENCLAW_ENV="${OPENCLAW_DIR}/.env"

if [[ ! -f "$OPENCLAW_ENV_TEMPLATE" ]]; then
  echo "Error: OpenClaw env template not found at ${OPENCLAW_ENV_TEMPLATE}" >&2
  exit 1
fi

echo "Rendering OpenClaw env: ${OPENCLAW_ENV}"
cp "$OPENCLAW_ENV_TEMPLATE" "$OPENCLAW_ENV"

for key in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY \
           GEMINI_API_KEY GOOGLE_API_KEY ZAI_API_KEY AI_GATEWAY_API_KEY \
           TOKENHUB_API_KEY LKEAP_API_KEY MINIMAX_API_KEY SYNTHETIC_API_KEY; do
  # Skip keys the template does not declare — OpenClaw does not support them.
  grep -qE "^#[[:space:]]*${key}=" "$OPENCLAW_ENV" || continue
  value="$(get_env "$key")"
  [[ -z "$value" ]] && continue
  # Match the commented template line `# KEY=...` (anchored on `KEY=` so the
  # `_1`/`_KEYS`/`LIVE_*` variants are not touched) and replace it with the
  # uncommented assignment. `|` delimiter avoids clashing with key characters.
  sed_inplace -E "s|^#[[:space:]]*${key}=.*|${key}=${value}|" "$OPENCLAW_ENV"
  echo "  set ${key} (uncommented from root .env)"
done

# OpenClaw bind-mounts these host dirs into the gateway/CLI containers
# (see compose.yml). Create them up front so that under rootless/userns-remapped
# Docker they map back to the host UID that owns them, instead of letting the
# daemon create them root-owned, which causes EACCES on first write to
# /home/node/.openclaw/state.
STATE_DIR="${PROJECT_DIR}/volumes/_openclaw"
WORKSPACE_DIR="${STATE_DIR}/workspace"
SECRETS_DIR="${PROJECT_DIR}/volumes/_openclaw-auth-profile-secrets"
# Persists the Claude Code CLI login (mounted at /home/node/.claude via
# $CLAUDE_CONFIG_DIR; see compose.yml) so it survives container recreation.
# Created unconditionally so the bind mount is never root-created; only used
# when OPENCLAW_ENABLE_CLAUDE_CLI=1.
CLAUDE_DIR="${PROJECT_DIR}/volumes/_openclaw-claude"

for dir in "${STATE_DIR}" "${WORKSPACE_DIR}" "${SECRETS_DIR}" "${CLAUDE_DIR}"; do
  mkdir -p "$dir"
  chmod 777 "$dir"
done

# Build/start control flag (read directly from the root .env, like
# OPENCLAW_PRIMARY_MODEL below). When 1, OpenClaw is pointed at the Claude Code
# CLI backend and OPENCLAW_PRIMARY_MODEL is ignored.
ENABLE_CLAUDE_CLI="$(get_env OPENCLAW_ENABLE_CLAUDE_CLI)"
[[ -z "$ENABLE_CLAUDE_CLI" ]] && ENABLE_CLAUDE_CLI=0

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
#      ("openclaw-default"). When OPENCLAW_ENABLE_CLAUDE_CLI=1 we force the latest
#      Claude Code Opus (anthropic/claude-opus-4-8) on the claude-cli runtime and
#      ignore OPENCLAW_PRIMARY_MODEL; otherwise we override with
#      OPENCLAW_PRIMARY_MODEL when set.
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
    -e ENABLE_CLAUDE_CLI="${ENABLE_CLAUDE_CLI}" \
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

      // Model selection. When the Claude CLI backend is enabled, force the
      // latest Claude Code Opus on the claude-cli runtime and IGNORE
      // OPENCLAW_PRIMARY_MODEL. Otherwise set the primary from PRIMARY_MODEL
      // when provided (an empty value leaves the placeholder/manual choice).
      const enableClaudeCli = process.env.ENABLE_CLAUDE_CLI === "1";
      const CLAUDE_CLI_MODEL = "anthropic/claude-opus-4-8"; // latest Opus available via Claude Code
      if (enableClaudeCli) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = CLAUDE_CLI_MODEL;
        // Attach the claude-cli runtime to that model ref.
        c.agents.defaults.models = c.agents.defaults.models || {};
        c.agents.defaults.models[CLAUDE_CLI_MODEL] = c.agents.defaults.models[CLAUDE_CLI_MODEL] || {};
        c.agents.defaults.models[CLAUDE_CLI_MODEL].agentRuntime = { id: "claude-cli" };
        // Run the CLI through our wrapper (see config/openclaw/openclaw-claude.sh):
        // it re-injects CLAUDE_CONFIG_DIR (persist login in the volume), IS_SANDBOX
        // (allow --dangerously-skip-permissions as root), and an optional OAuth
        // token — all of which OpenClaw otherwise strips from the child env.
        c.agents.defaults.cliBackends = c.agents.defaults.cliBackends || {};
        c.agents.defaults.cliBackends["claude-cli"] = c.agents.defaults.cliBackends["claude-cli"] || {};
        c.agents.defaults.cliBackends["claude-cli"].command = "/usr/local/bin/openclaw-claude";
      } else if (process.env.PRIMARY_MODEL) {
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
      if (enableClaudeCli) {
        console.log("openclaw.json: set agents.defaults.model.primary =", CLAUDE_CLI_MODEL, "(claude-cli runtime; OPENCLAW_PRIMARY_MODEL ignored)");
      } else if (process.env.PRIMARY_MODEL) {
        console.log("openclaw.json: set agents.defaults.model.primary =", process.env.PRIMARY_MODEL);
      }
    '
fi

# When the Claude CLI backend is enabled, OpenClaw drives `claude -p` inside the
# container (through /usr/local/bin/openclaw-claude), which needs a Claude Code
# login. The wrapper pins CLAUDE_CONFIG_DIR to /home/node/.claude, so all state
# (.claude.json + .credentials.json) lands in ${CLAUDE_DIR}. If not yet
# authenticated, we run the interactive sign-in for the user — but only when a
# terminal is attached (a non-interactive start, e.g. CI, falls back to printing
# the command). A long-lived token in CLAUDE_CODE_OAUTH_TOKEN (from
# `claude setup-token`) skips login entirely; it is forwarded to the CLI via
# OPENCLAW_CLAUDE_OAUTH_TOKEN.
if [[ "$ENABLE_CLAUDE_CLI" == "1" ]]; then
  OAUTH_TOKEN="$(get_env CLAUDE_CODE_OAUTH_TOKEN)"

  # Clear stale config backups left by aborted/previous runs. Claude Code
  # fails hard ("config file not found, but a backup exists") when the main
  # .claude.json is gone yet a backup remains — which is exactly the state a
  # failed first run leaves behind. Only clear when there is no live login.
  if [[ ! -f "${CLAUDE_DIR}/.credentials.json" && ! -f "${CLAUDE_DIR}/.claude.json" \
        && -d "${CLAUDE_DIR}/backups" ]]; then
    echo "Claude CLI: clearing stale config backups in ${CLAUDE_DIR}/backups (no live login present)."
    rm -rf "${CLAUDE_DIR}/backups"
  fi

  # Run the image's bundled claude (through the wrapper, so CLAUDE_CONFIG_DIR /
  # IS_SANDBOX match runtime) in a throwaway container with the credential volume
  # mounted — no running gateway required. First arg is extra `docker run` flags
  # (e.g. "-it"); the rest are passed to claude.
  claude_cli() {
    local docker_flags="$1"; shift
    docker run --rm ${docker_flags} --user 0:0 \
      -e HOME=/home/node \
      -v "${CLAUDE_DIR}:/home/node/.claude" \
      --entrypoint /usr/local/bin/openclaw-claude \
      all-in-wonder/openclaw:latest "$@"
  }

  if [[ -n "$OAUTH_TOKEN" ]]; then
    echo "Claude CLI: using CLAUDE_CODE_OAUTH_TOKEN from .env (forwarded to the CLI; no interactive login needed)."
  elif claude_cli "" auth status >/dev/null 2>&1; then
    echo "Claude CLI: already authenticated (login persists in ${CLAUDE_DIR})."
  elif [[ -t 0 && -t 1 ]]; then
    echo "Claude CLI: not authenticated — starting interactive Claude Code sign-in."
    echo "  Open the printed URL, authorize, and paste the code back. Login persists in ${CLAUDE_DIR}."
    if claude_cli "-it" auth login --claudeai; then
      echo "Claude CLI: login complete."
    else
      echo "Warning: Claude Code sign-in did not complete; OpenClaw requests will fail until you authenticate." >&2
      echo "Retry with: docker compose exec -it openclaw-gateway openclaw-claude auth login --claudeai" >&2
    fi
  else
    # No terminal attached — cannot prompt; tell the user how to do it manually.
    echo "" >&2
    echo "=============================== ACTION REQUIRED ===============================" >&2
    echo "OpenClaw is set to use the Claude Code CLI, but it is not authenticated yet" >&2
    echo "and this start run has no terminal attached for interactive sign-in." >&2
    echo "Authenticate once (login persists in ${CLAUDE_DIR}):" >&2
    echo "" >&2
    echo "    docker compose exec -it openclaw-gateway openclaw-claude auth login --claudeai" >&2
    echo "" >&2
    echo "Headless alternative — generate a long-lived token:" >&2
    echo "    docker compose exec -it openclaw-gateway openclaw-claude setup-token" >&2
    echo "then put it in .env as CLAUDE_CODE_OAUTH_TOKEN and restart OpenClaw." >&2
    echo "===============================================================================" >&2
    echo "" >&2
  fi

  # Register the Claude-native ingest_pdf tool (a stdio MCP server, the Claude
  # Code port of the OpenClaw ingest-pdf plugin) at user scope, so every
  # claude-cli invocation can call it. The server bundle is mounted read-only at
  # /home/node/.claude-tools/ingest-pdf (see compose.yml) and inherits the
  # PostgREST/embedding env from the claude process. Written to the user config
  # in CLAUDE_CONFIG_DIR (the credential volume), so it persists. remove+add
  # makes the command/path idempotent across restarts. This is the right channel
  # only while the claude-cli backend is NOT in bundleMcp mode (the default); a
  # bundleMcp backend forces --strict-mcp-config and would ignore user scope.
  CLAUDE_MCP_JSON='{"type":"stdio","command":"node","args":["/home/node/.claude-tools/ingest-pdf/dist/index.mjs"]}'
  claude_cli "" mcp remove -s user ingest-pdf >/dev/null 2>&1 || true
  if claude_cli "" mcp add-json -s user ingest-pdf "$CLAUDE_MCP_JSON" >/dev/null 2>&1; then
    echo "Claude CLI: registered ingest_pdf MCP tool (user scope)."
  else
    echo "Warning: failed to register the ingest_pdf MCP tool; it will be unavailable to claude." >&2
  fi
fi
