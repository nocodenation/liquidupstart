FROM ghcr.io/openclaw/openclaw:latest

USER root

RUN apt update && apt install -y libxml2-utils jq git ripgrep curl git xz-utils ca-certificates socat __SYSTEM_DEPENDENCIES__

# CLAUDE_CLI_INSTALL

# Claude CLI backend wrapper (active only when ENABLE_ANTHROPIC_CLAUDE_CODE=1).
# Re-injects CLAUDE_CONFIG_DIR / IS_SANDBOX / CLAUDE_CODE_OAUTH_TOKEN that
# OpenClaw strips from the child env. See config/openclaw/openclaw-claude.sh.
COPY ./openclaw-claude.sh /usr/local/bin/openclaw-claude
RUN chmod 0755 /usr/local/bin/openclaw-claude

RUN set -e; \
    f="$(grep -rlF 'PAGE_SIZE_DEFAULT = 20' /app/dist || true)"; \
    if [ -n "$f" ]; then \
      sed -i 's/PAGE_SIZE_DEFAULT = 20/PAGE_SIZE_DEFAULT = 100/g' $f; \
      echo "patched /models default page size 20 -> 100 in: $f"; \
    else \
      echo "WARN: 'PAGE_SIZE_DEFAULT = 20' not found in /app/dist; /models page-size patch skipped (OpenClaw upstream changed)"; \
    fi

# POST_INSTALL_COMMANDS

USER node
