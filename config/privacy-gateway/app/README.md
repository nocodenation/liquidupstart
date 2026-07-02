# privacy-gateway

Local anonymize → cloud LLM → de-anonymize gateway (Milestone 0). See
`docs/privacy-gateway.md` (spec) and `docs/privacy-gateway-milestone-0.md` (build plan).

Python is pinned to `>=3.11,<3.13` because `presidio-analyzer` excludes 3.14 and spaCy
lacks 3.14 wheels; uv manages a 3.12 interpreter independent of the host.

## Develop

```bash
uv sync --extra models-md        # libs + spaCy md models (en/de/fr/es/it/pt)
uv run pytest -q                 # unit + corpus (skip live LLM with -m "not integration")
uv run uvicorn privacy_gateway.main:app --port 8080
curl localhost:8080/healthz
```

`models-md` is the default NER footprint; an `_lg` extra can be added later behind the
pluggable engine interface without touching `core/`.

## Logging

Logs go to stdout (captured by `docker logs`). Level via `PRIVACY_GATEWAY_LOG_LEVEL`
(default `INFO`; use `DEBUG` for per-field detail). Logs record entity **types, counts,
language, timing, conversation id, and the upstream host only** — never original values or
surrogates (`tests/test_logging.py` enforces this).

## Container (M0 local build only)

`templates/Dockerfile` carries the `__SYSTEM_DEPENDENCIES__` / `# POST_INSTALL_COMMANDS`
markers; the M1 build pipeline renders it via `config/scripts/build/lib/dockerfile-render.sh`.
To build locally, render then build with `config/privacy-gateway/` as the context:

```bash
source config/scripts/build/lib/dockerfile-render.sh
SYSTEM_DEPENDENCIES="" POST_INSTALLATION_COMMANDS="" \
  render_dockerfile config/privacy-gateway/templates/Dockerfile /tmp/Dockerfile.pg
docker build -f /tmp/Dockerfile.pg -t liquidupstart/privacy-gateway:m0 config/privacy-gateway
docker run --rm -p 8088:8080 liquidupstart/privacy-gateway:m0
curl http://127.0.0.1:8088/healthz
```

Stack registration (compose, build/start orchestrators, nginx, agent base-URL wiring) is M1.
