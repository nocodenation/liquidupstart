#!/usr/bin/env bash
# Build the ingest-pdf MCP server into a self-contained ESM bundle (dist/index.mjs).
# Why bundle: the server is mounted read-only and run with `node dist/index.mjs`;
# inlining all deps means no node_modules / network / build step at runtime.
# dist/index.mjs is committed. Rebuild after editing src/index.ts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMG="${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}"

# --network host: throwaway container needs npm registry access. --user 0:0:
# write dist/ back to the bind mount under rootless/userns-remapped Docker.
docker run --rm --network host --user 0:0 \
  -v "${SCRIPT_DIR}:/tool" \
  --entrypoint sh "$IMG" -c '
    set -e
    cd /tmp
    npm init -y >/dev/null 2>&1
    echo "installing bundler + deps (@modelcontextprotocol/sdk, unpdf, js-tiktoken)..."
    npm i --no-audit --no-fund \
      esbuild@^0.24 @modelcontextprotocol/sdk@^1 unpdf@^0.12 js-tiktoken@^1 \
      >/tmp/build.log 2>&1 \
      || { echo "npm install failed:"; tail -20 /tmp/build.log; exit 1; }

    mkdir -p /tool/dist
    echo "bundling src/index.ts -> dist/index.mjs ..."
    NODE_PATH=/tmp/node_modules \
      /tmp/node_modules/.bin/esbuild /tool/src/index.ts \
        --bundle --format=esm --platform=node --target=node22 \
        --outfile=/tool/dist/index.mjs --log-level=warning

    node --check /tool/dist/index.mjs && echo "syntax OK"
  '

echo "Built ${SCRIPT_DIR}/dist/index.mjs"
