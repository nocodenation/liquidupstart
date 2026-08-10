FROM ghcr.io/nocodenation/privacy-proxy:latest

ARG ENABLE_ANTHROPIC_CLAUDE_CODE=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates __SYSTEM_DEPENDENCIES__ \
    && rm -rf /var/lib/apt/lists/*

RUN if [ "$ENABLE_ANTHROPIC_CLAUDE_CODE" = "1" ]; then \
        apt-get update \
        && apt-get install -y --no-install-recommends nodejs npm \
        && npm install -g @anthropic-ai/claude-code \
        && npm cache clean --force \
        && rm -rf /var/lib/apt/lists/*; \
    fi

# POST_INSTALL_COMMANDS
