#!/usr/bin/env bash
set -euo pipefail

# Windows bind mounts don't track the Unix executable bit, but the orchestration
# scripts invoke one another directly and need +x; restore it before handing off.
chmod +x ./*.sh 2>/dev/null || true
find ./scripts ./config -name '*.sh' -type f -exec chmod +x {} + 2>/dev/null || true

exec "$@"
