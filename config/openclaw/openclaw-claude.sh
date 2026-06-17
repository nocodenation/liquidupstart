#!/bin/sh
# Wrapper used as OpenClaw's claude-cli backend command (see
# config/scripts/start/openclaw.sh, gated on OPENCLAW_ENABLE_CLAUDE_CLI=1).
#
# OpenClaw strips Claude/Anthropic env vars before spawning the CLI
# (CLAUDE_CLI_CLEAR_ENV), so compose `environment:` has no effect. Re-inject the
# few this run-as-root container needs, right before exec'ing the real CLI:
#
#   - CLAUDE_CONFIG_DIR -> keep all Claude Code state in the mounted
#     /home/node/.claude volume; otherwise .claude.json lands at $HOME (unmounted)
#     and login is lost on recreate.
#   - IS_SANDBOX        -> allow `--dangerously-skip-permissions` (always passed by
#     OpenClaw) while running as root; Claude Code otherwise refuses it for root.
#   - CLAUDE_CODE_OAUTH_TOKEN -> optional headless auth, forwarded from the
#     non-cleared OPENCLAW_CLAUDE_OAUTH_TOKEN alias.
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-/home/node/.claude}"
export IS_SANDBOX=1
if [ -n "${OPENCLAW_CLAUDE_OAUTH_TOKEN:-}" ]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$OPENCLAW_CLAUDE_OAUTH_TOKEN"
fi
exec claude "$@"
