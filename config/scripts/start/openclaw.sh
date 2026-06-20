#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
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

# Read a KEY=value from the project-root .env (empty if unset).
# `|| true`: a missing key makes grep exit 1, aborting under set -e/pipefail.
get_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true
}

APP_ID="$(get_env APP_ID)"; [[ -z "$APP_ID" ]] && APP_ID=0
OPENCLAW_IMAGE="liquidupstart/openclaw:${APP_ID}"

# Render config/openclaw/.env from the template, then inject model-provider keys
# from the root .env. The template is the contract: only keys it already declares
# (as a commented `# KEY=` line) are supported; others are ignored. A supported
# key with a non-empty value gets uncommented; empty keys stay commented so
# OpenClaw falls back to its other auth sources.
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
  # Skip keys the template does not declare — OpenClaw doesn't support them.
  grep -qE "^#[[:space:]]*${key}=" "$OPENCLAW_ENV" || continue
  value="$(get_env "$key")"
  [[ -z "$value" ]] && continue
  # Uncomment the template line `# KEY=...`, anchored on `KEY=` so `_1`/`_KEYS`/
  # `LIVE_*` variants aren't touched. `|` delimiter avoids clashing with key chars.
  sed_inplace -E "s|^#[[:space:]]*${key}=.*|${key}=${value}|" "$OPENCLAW_ENV"
  echo "  set ${key} (uncommented from root .env)"
done

# Pre-create the host dirs OpenClaw bind-mounts (see compose.yml): under
# rootless/userns-remapped Docker they then map to the host UID that owns them,
# instead of the daemon creating them root-owned (EACCES on first write).
STATE_DIR="${PROJECT_DIR}/volumes/_openclaw"
WORKSPACE_DIR="${STATE_DIR}/workspace"
SECRETS_DIR="${PROJECT_DIR}/volumes/_openclaw-auth-profile-secrets"
# Persists the Claude Code CLI login (mounted at /home/node/.claude). Created
# unconditionally so the bind mount is never root-created; only used when
# OPENCLAW_ENABLE_CLAUDE_CLI=1.
CLAUDE_DIR="${PROJECT_DIR}/volumes/_openclaw-claude"

for dir in "${STATE_DIR}" "${WORKSPACE_DIR}" "${SECRETS_DIR}" "${CLAUDE_DIR}"; do
  mkdir -p "$dir"
  chmod 777 "$dir"
done

# When 1, OpenClaw uses the Claude Code CLI backend and OPENCLAW_PRIMARY_MODEL
# is ignored.
ENABLE_CLAUDE_CLI="$(get_env OPENCLAW_ENABLE_CLAUDE_CLI)"
[[ -z "$ENABLE_CLAUDE_CLI" ]] && ENABLE_CLAUDE_CLI=0
CLAUDE_CLI_MODEL="$(get_env OPENCLAW_CLAUDE_CLI_MODEL)"
[[ -z "$CLAUDE_CLI_MODEL" ]] && CLAUDE_CLI_MODEL="anthropic/claude-opus-4-8"

# When 1, OPENCLAW_COPILOT_MODEL becomes primary (OPENCLAW_PRIMARY_MODEL ignored).
# Precedence when several are set: claude-cli > copilot > primary.
ENABLE_COPILOT="$(get_env OPENCLAW_ENABLE_COPILOT)"
[[ -z "$ENABLE_COPILOT" ]] && ENABLE_COPILOT=0
COPILOT_MODEL="$(get_env OPENCLAW_COPILOT_MODEL)"
[[ -z "$COPILOT_MODEL" ]] && COPILOT_MODEL="github-copilot/gpt-4.1"

ENABLE_CODEX="$(get_env OPENCLAW_ENABLE_CODEX)"
[[ -z "$ENABLE_CODEX" ]] && ENABLE_CODEX=0
CODEX_MODEL="$(get_env OPENCLAW_CODEX_MODEL)"
[[ -z "$CODEX_MODEL" ]] && CODEX_MODEL="openai/gpt-5.5"

# Bootstrap baseline config + workspace in the state volume, only when
# openclaw.json is missing (subsequent starts may carry user edits). `setup`
# (no --wizard) is non-interactive. openclaw-cli shares the gateway's netns, so
# Compose starts openclaw-gateway as a dependency. The model patch below still
# runs every start, keeping .env the source of truth for the primary model.
CONFIG_JSON="${STATE_DIR}/openclaw.json"
if [[ ! -f "$CONFIG_JSON" ]]; then
  cd "${PROJECT_DIR}"
  docker compose run --rm --user 0:0 openclaw-cli setup
  docker compose rm -sf openclaw-gateway >/dev/null 2>&1 || true
else
  echo "OpenClaw config already present at ${CONFIG_JSON}; skipping setup."
fi

# Patch openclaw.json on every start so the gateway works behind the proxy:
#   1. gateway.auth (trusted-proxy) — auth delegated to nginx; the gateway trusts
#      the X-Forwarded-User header only from trusted proxy IPs (private Docker
#      subnets + loopback; loopback keeps the shared-netns openclaw-cli working).
#      mode:"none" isn't possible (gateway fail-closes on a non-loopback bind).
#      This is why the gateway must never publish host ports — the header is only
#      trustworthy because nothing but the proxy/CLI can reach the gateway.
#   2. gateway.controlUi.allowedOrigins=["*"] — otherwise the dashboard's WebSocket
#      origin is rejected. Safe (only a CSRF-style guard); no env var exists.
#   3. gateway.controlUi.dangerouslyDisableDeviceAuth — behind the proxy the gateway
#      sees the proxy IP not localhost, so allowInsecureAuth (localhost-only) can't
#      apply and every browser would otherwise be forced to pair.
#   4. agents.defaults.model.primary — overrides `setup`'s placeholder.
#      Precedence: claude-cli > copilot > OPENCLAW_PRIMARY_MODEL.
#
# `|| true`: a missing key makes grep exit 1, aborting under set -e/pipefail;
# tolerate it and fall through to the guard below.
PRIMARY_MODEL="$(grep -E '^OPENCLAW_PRIMARY_MODEL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d "'\"" || true)"

# Build a `provider/*` wildcard allowlist from the provider tokens that are set,
# so the model picker shows every credentialed provider's models, not just the
# primary. Maps each token to its OpenClaw provider id (GEMINI/GOOGLE both map to
# "google"; node patch dedupes by key). Plain loop for bash 3.2 (macOS) compat.
MODEL_WILDCARDS=""
for _tp in \
  "ANTHROPIC_API_KEY:anthropic" \
  "OPENAI_API_KEY:openai" \
  "OPENROUTER_API_KEY:openrouter" \
  "GEMINI_API_KEY:google" \
  "GOOGLE_API_KEY:google" \
  "ZAI_API_KEY:zai" \
  "AI_GATEWAY_API_KEY:vercel-ai-gateway" \
  "MINIMAX_API_KEY:minimax" \
  "SYNTHETIC_API_KEY:synthetic" \
  "TOKENHUB_API_KEY:tokenhub" \
  "LKEAP_API_KEY:lkeap"; do
  if [[ -n "$(get_env "${_tp%%:*}")" ]]; then
    MODEL_WILDCARDS="${MODEL_WILDCARDS:+${MODEL_WILDCARDS},}${_tp##*:}/*"
  fi
done

if [[ "$ENABLE_CODEX" == "1" && ",${MODEL_WILDCARDS}," != *",openai/*,"* ]]; then
  MODEL_WILDCARDS="${MODEL_WILDCARDS:+${MODEL_WILDCARDS},}openai/*"
fi

if [[ ! -f "$CONFIG_JSON" ]]; then
  echo "Warning: ${CONFIG_JSON} not found after setup; cannot patch config." >&2
else
  if [[ -z "$PRIMARY_MODEL" ]]; then
    echo "Note: OPENCLAW_PRIMARY_MODEL not set in ${ENV_FILE}; leaving openclaw.json model untouched." >&2
  fi
  # Patch the JSON with the image's bundled node (no host jq/node, no gateway —
  # a throwaway container mounting only the state dir).
  docker run --rm --user 0:0 \
    -v "${STATE_DIR}:/state" \
    -e PRIMARY_MODEL="${PRIMARY_MODEL}" \
    -e ENABLE_CLAUDE_CLI="${ENABLE_CLAUDE_CLI}" \
    -e CLAUDE_CLI_MODEL="${CLAUDE_CLI_MODEL}" \
    -e ENABLE_COPILOT="${ENABLE_COPILOT}" \
    -e COPILOT_MODEL="${COPILOT_MODEL}" \
    -e ENABLE_CODEX="${ENABLE_CODEX}" \
    -e CODEX_MODEL="${CODEX_MODEL}" \
    -e PLUGIN_PATHS="/home/node/openclaw-plugins/ingest-pdf" \
    -e MODEL_WILDCARDS="${MODEL_WILDCARDS}" \
    --entrypoint node \
    ghcr.io/openclaw/openclaw:latest \
    -e '
      const fs = require("fs");
      const p = "/state/openclaw.json";
      const c = JSON.parse(fs.readFileSync(p, "utf8"));

      c.gateway = c.gateway || {};

      // Delegate auth to nginx (sets X-Forwarded-User); trust it only from these
      // proxy IPs. allowLoopback keeps the shared-netns openclaw-cli working.
      c.gateway.auth = c.gateway.auth || {};
      c.gateway.auth.mode = "trusted-proxy";
      c.gateway.auth.trustedProxy = c.gateway.auth.trustedProxy || {};
      c.gateway.auth.trustedProxy.userHeader = "x-forwarded-user";
      c.gateway.auth.trustedProxy.allowLoopback = true;
      c.gateway.trustedProxies = ["127.0.0.1/32", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

      // Allow any browser origin (proxy guards access; only a CSRF-style guard).
      c.gateway.controlUi = c.gateway.controlUi || {};
      c.gateway.controlUi.allowedOrigins = ["*"];

      // Disable per-browser device pairing (see header comment): allowInsecureAuth
      // is localhost-only and useless behind the proxy.
      c.gateway.controlUi.dangerouslyDisableDeviceAuth = true;

      // Model selection. Precedence: claude-cli > copilot > OPENCLAW_PRIMARY_MODEL
      // (the first two ignore PRIMARY_MODEL; an empty value leaves the placeholder).
      const enableClaudeCli = process.env.ENABLE_CLAUDE_CLI === "1";
      const enableCopilot = process.env.ENABLE_COPILOT === "1";
      const enableCodex = process.env.ENABLE_CODEX === "1";
      if (enableClaudeCli && enableCopilot) {
        console.log("openclaw.json: both claude-cli and copilot enabled — using claude-cli (copilot ignored).");
      }
      const CLAUDE_CLI_MODEL = process.env.CLAUDE_CLI_MODEL || "anthropic/claude-opus-4-8";
      const COPILOT_MODEL = process.env.COPILOT_MODEL || "github-copilot/gpt-4.1";
      const CODEX_MODEL = process.env.CODEX_MODEL || "openai/gpt-5.5";
      if (enableClaudeCli) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = CLAUDE_CLI_MODEL;
        // Attach the claude-cli runtime to that model ref.
        c.agents.defaults.models = c.agents.defaults.models || {};
        c.agents.defaults.models[CLAUDE_CLI_MODEL] = c.agents.defaults.models[CLAUDE_CLI_MODEL] || {};
        c.agents.defaults.models[CLAUDE_CLI_MODEL].agentRuntime = { id: "claude-cli" };
        // Run the CLI through our wrapper, which re-injects CLAUDE_CONFIG_DIR,
        // IS_SANDBOX, and an optional OAuth token that OpenClaw otherwise strips.
        c.agents.defaults.cliBackends = c.agents.defaults.cliBackends || {};
        c.agents.defaults.cliBackends["claude-cli"] = c.agents.defaults.cliBackends["claude-cli"] || {};
        c.agents.defaults.cliBackends["claude-cli"].command = "/usr/local/bin/openclaw-claude";
      } else if (enableCopilot) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = COPILOT_MODEL;
      } else if (enableCodex) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = CODEX_MODEL;
        c.agents.defaults.models = c.agents.defaults.models || {};
        c.agents.defaults.models[CODEX_MODEL] = c.agents.defaults.models[CODEX_MODEL] || {};
        c.agents.defaults.models[CODEX_MODEL].agentRuntime = { id: "codex" };
      } else if (process.env.PRIMARY_MODEL) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.model = c.agents.defaults.model || {};
        c.agents.defaults.model.primary = process.env.PRIMARY_MODEL;
      }

      // Copilot embeddings for the RAG tools: expose /v1/embeddings and point
      // memorySearch at github-copilot. Independent of the chat-model precedence.
      if (enableCopilot) {
        c.gateway = c.gateway || {};
        c.gateway.http = c.gateway.http || {};
        c.gateway.http.endpoints = c.gateway.http.endpoints || {};
        c.gateway.http.endpoints.chatCompletions = c.gateway.http.endpoints.chatCompletions || {};
        c.gateway.http.endpoints.chatCompletions.enabled = true;
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        // Keep the github-copilot catalog selectable whenever Copilot is enabled,
        // even when claude-cli is the primary model.
        c.agents.defaults.models = c.agents.defaults.models || {};
        if (!c.agents.defaults.models["github-copilot/*"]) c.agents.defaults.models["github-copilot/*"] = {};
        c.agents.defaults.memorySearch = c.agents.defaults.memorySearch || {};
        c.agents.defaults.memorySearch.provider = "github-copilot";
        if (!c.agents.defaults.memorySearch.model) c.agents.defaults.memorySearch.model = "text-embedding-3-small";
      }

      if (enableCodex) {
        c.plugins = c.plugins || {};
        c.plugins.entries = c.plugins.entries || {};
        c.plugins.entries.codex = c.plugins.entries.codex || {};
        c.plugins.entries.codex.enabled = true;
        if (Array.isArray(c.plugins.allow) && !c.plugins.allow.includes("codex")) {
          c.plugins.allow.push("codex");
        }
      }

      // Model picker allowlist: add a `provider/*` wildcard per credentialed
      // provider (from MODEL_WILDCARDS) so the picker is not limited to the primary.
      // Idempotent and additive: existing entries (e.g. the claude-cli ref) survive.
      const modelWildcards = (process.env.MODEL_WILDCARDS || "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      if (modelWildcards.length) {
        c.agents = c.agents || {};
        c.agents.defaults = c.agents.defaults || {};
        c.agents.defaults.models = c.agents.defaults.models || {};
        for (const w of modelWildcards) {
          if (!c.agents.defaults.models[w]) c.agents.defaults.models[w] = {};
        }
      }

      // Register local plugin dirs. Our plugins ship a self-contained dist/*.mjs
      // bundle, so no node_modules is needed at runtime.
      const pluginPaths = (process.env.PLUGIN_PATHS || "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      if (pluginPaths.length) {
        c.plugins = c.plugins || {};
        c.plugins.load = c.plugins.load || {};
        // REPLACE, not append: the start script owns this list. OpenClaw validates
        // every load.path at startup and aborts if one is missing, so stale entries
        // (e.g. an old path persisted in openclaw.json) must be dropped.
        c.plugins.load.paths = pluginPaths;
      }

      fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
      console.log("openclaw.json: auth.mode =", c.gateway.auth.mode, "; trustedProxies =", JSON.stringify(c.gateway.trustedProxies));
      console.log("openclaw.json: allowedOrigins =", JSON.stringify(c.gateway.controlUi.allowedOrigins));
      console.log("openclaw.json: dangerouslyDisableDeviceAuth =", c.gateway.controlUi.dangerouslyDisableDeviceAuth);
      if (pluginPaths.length) {
        console.log("openclaw.json: plugins.load.paths =", JSON.stringify(c.plugins.load.paths));
      }
      if (modelWildcards.length) {
        console.log("openclaw.json: model allowlist wildcards =", JSON.stringify(modelWildcards));
      }
      if (enableClaudeCli) {
        console.log("openclaw.json: set agents.defaults.model.primary =", CLAUDE_CLI_MODEL, "(claude-cli runtime; OPENCLAW_PRIMARY_MODEL ignored)");
      } else if (enableCopilot) {
        console.log("openclaw.json: set agents.defaults.model.primary =", COPILOT_MODEL, "(github-copilot; OPENCLAW_PRIMARY_MODEL ignored)");
      } else if (enableCodex) {
        console.log("openclaw.json: set agents.defaults.model.primary =", CODEX_MODEL, "(codex harness; OPENCLAW_PRIMARY_MODEL ignored)");
      } else if (process.env.PRIMARY_MODEL) {
        console.log("openclaw.json: set agents.defaults.model.primary =", process.env.PRIMARY_MODEL);
      }
      if (enableCopilot) {
        console.log("openclaw.json: enabled gateway /v1/embeddings + memorySearch.provider = github-copilot (model", c.agents.defaults.memorySearch.model + ") for RAG embeddings");
      }
      if (enableCodex) {
        console.log("openclaw.json: enabled bundled codex plugin (ChatGPT/Codex subscription harness for openai/* turns)");
      }
    '
fi

# The Claude CLI backend needs a Claude Code login. The wrapper pins
# CLAUDE_CONFIG_DIR to /home/node/.claude, so login state lands in ${CLAUDE_DIR}.
# If not authenticated, run interactive sign-in — but only with a terminal
# attached (CI falls back to printing the command). A long-lived
# CLAUDE_CODE_OAUTH_TOKEN skips login and is forwarded to the CLI.
if [[ "$ENABLE_CLAUDE_CLI" == "1" ]]; then
  OAUTH_TOKEN="$(get_env CLAUDE_CODE_OAUTH_TOKEN)"

  # Install instructions.md as Claude Code's global ~/.claude/CLAUDE.md. Copied
  # (not bind-mounted) because a nested single-FILE mount in the .claude volume
  # fails on Docker Desktop/macOS. Re-copied each start so edits propagate.
  INSTRUCTIONS_SRC="${PROJECT_DIR}/config/agents/instructions.md"
  if [[ -f "$INSTRUCTIONS_SRC" ]]; then
    cp -f "$INSTRUCTIONS_SRC" "${CLAUDE_DIR}/CLAUDE.md"
    echo "Claude CLI: installed instructions.md -> ${CLAUDE_DIR}/CLAUDE.md"
  else
    echo "Warning: ${INSTRUCTIONS_SRC} not found; Claude Code will have no global CLAUDE.md." >&2
  fi

  # Clear stale config backups from aborted runs: Claude Code fails hard when
  # .claude.json is gone but a backup remains. Only when there's no live login.
  if [[ ! -f "${CLAUDE_DIR}/.credentials.json" && ! -f "${CLAUDE_DIR}/.claude.json" \
        && -d "${CLAUDE_DIR}/backups" ]]; then
    echo "Claude CLI: clearing stale config backups in ${CLAUDE_DIR}/backups (no live login present)."
    rm -rf "${CLAUDE_DIR}/backups"
  fi

  # Run the bundled claude through the wrapper in a throwaway container with the
  # credential volume mounted (no gateway needed). First arg is extra `docker run`
  # flags (e.g. "-it"); the rest are passed to claude.
  claude_cli() {
    local docker_flags="$1"; shift
    docker run --rm ${docker_flags} --user 0:0 \
      -e HOME=/home/node \
      -v "${CLAUDE_DIR}:/home/node/.claude" \
      --entrypoint /usr/local/bin/openclaw-claude \
      "${OPENCLAW_IMAGE}" "$@"
  }

  if [[ -n "$OAUTH_TOKEN" ]]; then
    echo "Claude CLI: using CLAUDE_CODE_OAUTH_TOKEN from .env (forwarded to the CLI; no interactive login needed)."
  elif claude_cli "" auth status >/dev/null 2>&1; then
    echo "Claude CLI: already authenticated (login persists in ${CLAUDE_DIR})."
  elif [[ -t 0 && -t 1 ]]; then
    echo "Claude CLI: not authenticated — starting interactive Claude Code sign-in."
    echo "  A sign-in URL appears below. Open it, authorize, then paste the code here."
    echo "  Claude reads the code without echoing it (looks like nothing happened —"
    echo "  worse through the Windows wrapper's nested terminal), so we capture it"
    echo "  ourselves and show one '*' per character. Press Enter when done."
    echo "  Login persists in ${CLAUDE_DIR}."

    # Read a secret from /dev/tty, echoing a '*' per char so a paste is visibly
    # confirmed even when the underlying prompt doesn't echo. Uses /dev/tty
    # directly (independent of echo state); handles backspace and a trailing CR.
    read_masked() {  # $1=prompt  $2=output-var-name
      local __p="$1" __out="$2" ch acc=""
      printf '%s' "$__p" > /dev/tty
      while IFS= read -rsn1 ch < /dev/tty; do
        [[ -z "$ch" || "$ch" == $'\r' ]] && break
        if [[ "$ch" == $'\177' || "$ch" == $'\b' ]]; then
          [[ -n "$acc" ]] && { acc="${acc%?}"; printf '\b \b' > /dev/tty; }
          continue
        fi
        acc+="$ch"; printf '*' > /dev/tty
      done
      printf '\n' > /dev/tty
      printf -v "$__out" '%s' "$acc"
    }

    # Drive `claude auth login` but feed the pasted code ourselves (via a FIFO on
    # stdin) so we control the echo. `-i` only: `-t` can't combine with FIFO stdin.
    # Open the FIFO read-write (3<>) so open() doesn't block if claude bails early.
    login_with_masked_paste() {
      local fifo code rc=0
      fifo="$(mktemp -u)"; mkfifo "$fifo"
      claude_cli "-i" auth login --claudeai < "$fifo" &
      local pid=$!
      exec 3<> "$fifo"
      # If claude exits immediately it likely needs a real TTY — bail so the
      # caller falls back to the plain interactive login.
      sleep 1
      if ! kill -0 "$pid" 2>/dev/null; then
        exec 3>&-; rm -f "$fifo"; return 1
      fi
      read_masked "Paste the authorization code (shown as *): " code
      printf '%s\n' "$code" >&3 2>/dev/null || true
      exec 3>&-
      rm -f "$fifo"
      wait "$pid" || rc=$?
      return $rc
    }

    if login_with_masked_paste || claude_cli "" auth status >/dev/null 2>&1; then
      echo "Claude CLI: login complete."
    elif claude_cli "-it" auth login --claudeai; then
      # Fallback when masked-paste didn't complete: run claude's own login directly.
      echo "Claude CLI: login complete."
    else
      echo "Warning: Claude Code sign-in did not complete; OpenClaw requests will fail until you authenticate." >&2
      echo "  Retry interactively:" >&2
      echo "    docker compose exec -it openclaw-gateway openclaw-claude auth login --claudeai" >&2
      echo "  Or generate a long-lived token and set it in .env as CLAUDE_CODE_OAUTH_TOKEN:" >&2
      echo "    docker compose exec -it openclaw-gateway openclaw-claude setup-token" >&2
    fi
  else
    # No terminal attached — tell the user how to authenticate manually.
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

  # Register the ingest_pdf stdio MCP server at user scope so every claude-cli
  # invocation can call it; written to CLAUDE_CONFIG_DIR so it persists. remove+add
  # keeps it idempotent across restarts. Works only while the claude-cli backend
  # is NOT in bundleMcp mode (default); bundleMcp forces --strict-mcp-config and
  # ignores user scope.
  CLAUDE_MCP_JSON='{"type":"stdio","command":"node","args":["/home/node/.claude-tools/ingest-pdf/dist/index.mjs"]}'
  claude_cli "" mcp remove -s user ingest-pdf >/dev/null 2>&1 || true
  if claude_cli "" mcp add-json -s user ingest-pdf "$CLAUDE_MCP_JSON" >/dev/null 2>&1; then
    echo "Claude CLI: registered ingest_pdf MCP tool (user scope)."
  else
    echo "Warning: failed to register the ingest_pdf MCP tool; it will be unavailable to claude." >&2
  fi
fi

# The github-copilot provider needs a login in the auth store. The gateway
# discovers provider catalogs at boot, so the login must exist BEFORE `docker
# compose up` — otherwise the gateway boots token-less and never lists Copilot
# models. So we block here until the user signs in (via the dashboard panel)
# rather than restarting the gateway afterwards.
if [[ "$ENABLE_COPILOT" == "1" ]]; then
  # Run an openclaw CLI command against the shared auth store without the gateway.
  # The plugins mount is required: openclaw validates the full config (including
  # plugins.load.paths) before any subcommand.
  copilot_cli() {
    docker run --rm --user 0:0 --entrypoint openclaw \
      -e HOME=/home/node -e OPENCLAW_HOME=/home/node \
      -e OPENCLAW_STATE_DIR=/home/node/.openclaw \
      -e OPENCLAW_CONFIG_DIR=/home/node/.openclaw \
      -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json \
      -v "${STATE_DIR}:/home/node/.openclaw" \
      -v "${SECRETS_DIR}:/home/node/.config/openclaw" \
      -v "${PROJECT_DIR}/config/openclaw/plugins:/home/node/openclaw-plugins:ro" \
      "${OPENCLAW_IMAGE}" "$@"
  }
  copilot_authed() { copilot_cli models auth list 2>/dev/null | grep -qi github-copilot; }

  if copilot_authed; then
    echo "GitHub Copilot: already authenticated (login persists in ${STATE_DIR})."
  else
    # Emit the marker the dashboard watches for (opens the Copilot sign-in panel),
    # plus a human-readable note for terminal/CI runs.
    echo "::aiw-copilot-auth-required::"
    echo ""
    echo "========================= GITHUB COPILOT SIGN-IN NEEDED ========================="
    echo "OpenClaw is set to use GitHub Copilot (OPENCLAW_ENABLE_COPILOT=1) but isn't"
    echo "authenticated yet. Sign in via the dashboard's 'GitHub Copilot sign-in' panel."
    echo "Waiting for sign-in (up to 15 minutes) before starting the services…"
    echo "================================================================================="

    _deadline=$(( $(date +%s) + 900 ))
    until copilot_authed; do
      if (( $(date +%s) >= _deadline )); then
        echo "Warning: GitHub Copilot sign-in not completed in time; starting without it." >&2
        echo "  Copilot models won't be listed until you sign in and start again." >&2
        break
      fi
      sleep 8
    done
    copilot_authed && echo "GitHub Copilot: sign-in detected — continuing startup."
  fi
fi

if [[ "$ENABLE_CODEX" == "1" ]]; then
  codex_cli() {
    local docker_flags="$1"; shift
    docker run --rm ${docker_flags} --user 0:0 --entrypoint openclaw \
      -e HOME=/home/node -e OPENCLAW_HOME=/home/node \
      -e OPENCLAW_STATE_DIR=/home/node/.openclaw \
      -e OPENCLAW_CONFIG_DIR=/home/node/.openclaw \
      -e OPENCLAW_CONFIG_PATH=/home/node/.openclaw/openclaw.json \
      -v "${STATE_DIR}:/home/node/.openclaw" \
      -v "${SECRETS_DIR}:/home/node/.config/openclaw" \
      -v "${PROJECT_DIR}/config/openclaw/plugins:/home/node/openclaw-plugins:ro" \
      "${OPENCLAW_IMAGE}" "$@"
  }
  codex_authed() { codex_cli "" models auth list --provider openai 2>/dev/null | grep -qi oauth; }

  if codex_authed; then
    echo "OpenAI Codex: already authenticated (ChatGPT/Codex login persists in ${STATE_DIR})."
  elif [[ -t 0 && -t 1 ]]; then
    echo "OpenAI Codex: not authenticated — starting interactive ChatGPT/Codex sign-in."
    echo "  A sign-in URL appears below. Open it in your browser and authorize; sign-in"
    echo "  completes automatically. Login persists in ${STATE_DIR}."
    if codex_cli "-it --network host" models auth login --provider openai && codex_authed; then
      echo "OpenAI Codex: login complete."
    elif codex_authed; then
      echo "OpenAI Codex: login complete."
    else
      echo "Warning: ChatGPT/Codex sign-in did not complete; OpenAI requests will fail until you authenticate." >&2
      echo "  Retry interactively:" >&2
      echo "    docker compose exec -it openclaw-gateway openclaw models auth login --provider openai" >&2
    fi
  else
    echo "::aiw-codex-auth-required::"
    echo ""
    echo "========================= OPENAI CODEX SIGN-IN NEEDED ==========================="
    echo "OpenClaw is set to use the Codex harness (OPENCLAW_ENABLE_CODEX=1) but isn't"
    echo "authenticated yet. Sign in via the dashboard's 'Sign in with ChatGPT' panel."
    echo "Waiting for sign-in (up to 15 minutes) before starting the services…"
    echo "================================================================================="

    _deadline=$(( $(date +%s) + 900 ))
    until codex_authed; do
      if (( $(date +%s) >= _deadline )); then
        echo "Warning: ChatGPT/Codex sign-in not completed in time; starting without it." >&2
        echo "  OpenAI models won't be listed until you sign in and start again." >&2
        break
      fi
      sleep 8
    done
    codex_authed && echo "OpenAI Codex: sign-in detected — continuing startup."
  fi
fi
