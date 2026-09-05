#!/bin/sh
# Wrapper for the Claude Code CLI, installed both as /usr/local/bin/openclaw-claude
# (used as a container entrypoint by config/scripts/start/openclaw.sh) and, when
# ENABLE_ANTHROPIC_CLAUDE_CODE=1, as /home/node/.local/bin/claude — the first
# `claude` on PATH. Since OpenClaw 2026.9.1 the bundled anthropic plugin owns the
# claude-cli backend and hardcodes `command: "claude"`, so shadowing PATH is the
# only remaining way to interpose.
#
#   - CLAUDE_CONFIG_DIR -> keep all Claude Code state in the mounted
#     /home/node/.claude volume; otherwise .claude.json lands at $HOME (unmounted)
#     and login is lost on recreate.
#   - IS_SANDBOX        -> allow `--dangerously-skip-permissions` while running as
#     root; Claude Code otherwise refuses it for root.
#   - CLAUDE_CODE_OAUTH_TOKEN -> optional headless auth, forwarded from the
#     non-cleared OPENCLAW_CLAUDE_OAUTH_TOKEN alias (OpenClaw strips the real name
#     via CLAUDE_CLI_CLEAR_ENV before spawning the CLI).
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-/home/node/.claude}"
export IS_SANDBOX=1
if [ -n "${OPENCLAW_CLAUDE_OAUTH_TOKEN:-}" ]; then
  export CLAUDE_CODE_OAUTH_TOKEN="$OPENCLAW_CLAUDE_OAUTH_TOKEN"
fi
exec /usr/local/bin/claude "$@"
