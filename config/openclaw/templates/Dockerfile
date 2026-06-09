FROM ghcr.io/openclaw/openclaw:latest

USER root

RUN apt update && apt install -y libxml2-utils jq git ripgrep curl git xz-utils ca-certificates __SYSTEM_DEPENDENCIES__

# POST_INSTALL_COMMANDS

USER node
