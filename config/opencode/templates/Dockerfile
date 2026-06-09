FROM node:lts-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git libxml2-utils jq __SYSTEM_DEPENDENCIES__
#    && rm -rf /var/lib/apt/lists/*
#RUN apt-get install -y nodejs python3-pip yt-dlp
#RUN pip3 install openai-whisper --break-system-packages
#RUN npm install -g ytdl-core
RUN npm install -g opencode-ai

# POST_INSTALL_COMMANDS

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

WORKDIR /workspace
EXPOSE 4096

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
