#!/usr/bin/env bash
# Build the ingest-pdf OpenClaw plugin into a single self-contained ESM bundle
# (dist/index.mjs) and refresh the manifest metadata.
#
# Why a bundle: a plugin loaded from `plugins.load.paths` resolves its imports
# from its own location by normal Node rules — the OpenClaw image only ships
# `typebox` + the `openclaw` SDK, NOT `unpdf` / `js-tiktoken`. Bundling inlines
# every dependency (incl. the SDK helper `defineToolPlugin`) so the plugin needs
# no node_modules and no symlinks at runtime.
#
# Because the SDK helper is inlined, build with the SAME image tag the gateway
# runs, and rebuild whenever you bump that image. The produced dist/index.mjs is
# committed to the repo; runtime never needs network or a build step.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMG="${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}"

# --network host: the throwaway container needs npm registry access to fetch the
# bundler + the two missing deps. --user 0:0: write dist/ back to the bind mount
# under rootless/userns-remapped Docker (see compose.yml for the same pattern).
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
    # Resolve openclaw + typebox from the image (/app/node_modules); unpdf,
    # js-tiktoken, esbuild from the temp install (/tmp/node_modules).
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
