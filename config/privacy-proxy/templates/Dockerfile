ARG PRIVACY_PROXY_BASE_IMAGE=ghcr.io/nocodenation/privacy-proxy:latest

FROM python:3.12-slim AS claude-cli
ARG ENABLE_ANTHROPIC_CLAUDE_CODE=0
ARG CLAUDE_CODE_VERSION=latest
RUN <<'SH'
set -e
mkdir -p /out
if [ "$ENABLE_ANTHROPIC_CLAUDE_CODE" = "1" ]; then
python3 - <<'PY'
import hashlib, json, os, platform, urllib.request
base = "https://downloads.claude.ai/claude-code-releases"
version = os.environ.get("CLAUDE_CODE_VERSION", "latest")
if version == "latest":
    version = urllib.request.urlopen(base + "/latest", timeout=60).read().decode().strip()
arch = {"x86_64": "x64", "aarch64": "arm64"}[platform.machine()]
target = f"linux-{arch}"
manifest = json.load(urllib.request.urlopen(f"{base}/{version}/manifest.json", timeout=60))
expected = manifest["platforms"][target]["checksum"]
data = urllib.request.urlopen(f"{base}/{version}/{target}/claude", timeout=600).read()
if hashlib.sha256(data).hexdigest() != expected:
    raise SystemExit(f"claude {version} {target}: checksum mismatch")
with open("/out/claude", "wb") as f:
    f.write(data)
os.chmod("/out/claude", 0o755)
print(f"claude {version} {target}: {len(data)} bytes, checksum verified")
PY
fi
SH

FROM ${PRIVACY_PROXY_BASE_IMAGE}

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates __SYSTEM_DEPENDENCIES__ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=claude-cli /out/ /usr/local/bin/

# POST_INSTALL_COMMANDS
