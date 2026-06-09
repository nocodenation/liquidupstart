#!/bin/sh
# Wrapper used as OpenClaw's claude-cli backend command (see
# config/scripts/start/openclaw.sh, which points cliBackends["claude-cli"].command
# here when OPENCLAW_ENABLE_CLAUDE_CLI=1).
#
# OpenClaw deliberately strips a set of Claude/Anthropic env vars from the child
# process before spawning the CLI (its CLAUDE_CLI_CLEAR_ENV list), so passing
# them via compose `environment:` has no effect. This wrapper re-injects the few
# that this containerized, run-as-root setup needs, right before exec'ing the
# real CLI:
#
#   - CLAUDE_CONFIG_DIR -> keep ALL Claude Code state (incl. .claude.json and
#     .credentials.json) inside the mounted /home/node/.claude volume so the
#     login persists across container recreation. Without this, .claude.json
#     lands at $HOME/.claude.json (not mounted) and is lost on recreate.
#   - IS_SANDBOX        -> allow `--dangerously-skip-permissions` (which OpenClaw
#     always passes) while the container runs as root; Claude Code otherwise
#     refuses that flag for root/sudo.
#   - CLAUDE_CODE_OAUTH_TOKEN -> optional headless auth, forwarded from the
#     non-cleared OPENCLAW_CLAUDE_OAUTH_TOKEN alias when provided.
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-/home/node/.claude}"
export IS_SANDBOX=1
if [ -n "${OPENCLAW_CLAUDE_OAUTH_TOKEN:-}" ]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$OPENCLAW_CLAUDE_OAUTH_TOKEN"
fi
exec claude "$@"
