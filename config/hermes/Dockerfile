FROM ubuntu:24.04

USER 0:0

RUN apt update && apt install -y ripgrep curl git xz-utils ca-certificates build-essential libxml2-utils jq git
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh > /install.sh
RUN chmod +x /install.sh
RUN /install.sh --non-interactive --skip-setup

# Build the dashboard web UI at image-build time so the container does not
# build it (and stall/loop) on every startup. npm ci installs the workspace
# deps (skipped by --skip-setup); the build outputs to hermes_cli/web_dist,
# which the dashboard serves and then treats as up-to-date.
RUN cd /usr/local/lib/hermes-agent && npm ci && cd web && npm run build

RUN npx playwright install-deps chromium

# ingest_pdf plugin deps: PDF parsing + tokenizer for the RAG ingester, installed
# into the Hermes venv via the bundled uv (the venv has no pip). Pre-warm the
# tiktoken cl100k_base cache so chunk tokenization works offline at runtime.
ENV TIKTOKEN_CACHE_DIR=/usr/local/lib/hermes-agent/.tiktoken_cache
RUN /root/.hermes/bin/uv pip install --python /usr/local/lib/hermes-agent/venv \
        pypdf==6.13.0 tiktoken==0.13.0 \
    && /usr/local/lib/hermes-agent/venv/bin/python -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"

COPY ./entrypoint.sh /opt/entrypoint.sh

VOLUME [ "/root/.hermes" ]

ENTRYPOINT ["/opt/entrypoint.sh"]
