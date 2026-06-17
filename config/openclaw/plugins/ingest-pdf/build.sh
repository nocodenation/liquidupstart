#!/usr/bin/env bash
# Build the ingest-pdf OpenClaw plugin into a self-contained ESM bundle
# (dist/index.mjs) and refresh the manifest metadata.
# Why bundle: the image ships only typebox + the openclaw SDK, NOT unpdf /
# js-tiktoken, so inlining every dep (incl. the SDK helper defineToolPlugin)
# lets the plugin run with no node_modules at runtime. Because the SDK helper
# is inlined, build with the SAME image tag the gateway runs. dist/index.mjs is
# committed; runtime never needs network or a build step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMG="${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}"

# --network host: throwaway container needs npm registry access. --user 0:0:
# write dist/ back to the bind mount under rootless/userns-remapped Docker.
docker run --rm --network host --user 0:0 \
  -v "${SCRIPT_DIR}:/plugin" \
  --entrypoint sh "$IMG" -c '
    set -e
    cd /tmp
    npm init -y >/dev/null 2>&1
    echo "installing bundler + missing deps (unpdf, js-tiktoken)..."
    npm i --no-audit --no-fund esbuild@^0.24 unpdf@^0.12 js-tiktoken@^1 >/tmp/build.log 2>&1 \
      || { echo "npm install failed:"; tail -20 /tmp/build.log; exit 1; }

    mkdir -p /plugin/dist
    echo "bundling src/index.ts -> dist/index.mjs ..."
    # openclaw + typebox from the image; unpdf/js-tiktoken/esbuild from the temp install.
    NODE_PATH=/app/node_modules:/tmp/node_modules \
      /tmp/node_modules/.bin/esbuild /plugin/src/index.ts \
        --bundle --format=esm --platform=node --target=node22 \
        --outfile=/plugin/dist/index.mjs --log-level=warning

    echo "refreshing manifest metadata (openclaw plugins build) ..."
    node /app/dist/index.js plugins build --root /plugin --entry ./dist/index.mjs

    echo "validating ..."
    node /app/dist/index.js plugins validate --root /plugin --entry ./dist/index.mjs
  '

echo "Built ${SCRIPT_DIR}/dist/index.mjs"
