FROM python:3.12-slim

ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates __SYSTEM_DEPENDENCIES__ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.22 /uv /uvx /bin/

WORKDIR /app
COPY app/ /app/
RUN uv sync --frozen --no-dev --extra models-md

# POST_INSTALL_COMMANDS

EXPOSE 8080 443
ENTRYPOINT ["/app/.venv/bin/python", "-m", "privacy_gateway.serve"]
