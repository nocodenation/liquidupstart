FROM ghcr.io/openclaw/openclaw:latest

USER root

RUN apt update && apt install -y libxml2-utils jq git ripgrep curl git xz-utils ca-certificates __SYSTEM_DEPENDENCIES__

# CLAUDE_CLI_INSTALL

# Claude CLI backend wrapper (active only when OPENCLAW_ENABLE_CLAUDE_CLI=1).
# Re-injects CLAUDE_CONFIG_DIR / IS_SANDBOX / CLAUDE_CODE_OAUTH_TOKEN that
# OpenClaw strips from the child env. See config/openclaw/openclaw-claude.sh.
COPY ./openclaw-claude.sh /usr/local/bin/openclaw-claude
RUN chmod 0755 /usr/local/bin/openclaw-claude

# POST_INSTALL_COMMANDS

USER node
