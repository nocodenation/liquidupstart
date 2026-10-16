#!/usr/bin/env bash
# The builder needs no preparation, and this script exists for one notice.
#
# Until 2026-10-10 `compose.yml` mounted `volumes/nar_builder/m2` read-write as
# the shared Maven cache. It is gone: each build resolves into its own local
# repository under its work directory, discarded with the build, and reads a
# read-only seed baked into the image (B1's fourth leg, 2026-10-01 review).
#
# An installation that ran before the move still has the directory, holding tens
# of megabytes and looking authoritative while being read by nobody. It is named
# once rather than deleted -- removing a directory the operator may have copied
# something into is not this script's call. Same shape, and the same reason, as
# the `liquid.sh` notice about `volumes/liquid/api`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
STALE="${PROJECT_DIR}/volumes/nar_builder/m2"

if [ -d "$STALE" ]; then
    size="$(du -sh "$STALE" 2>/dev/null | cut -f1)"
    echo ""
    echo "Note: volumes/nar_builder/m2 (${size:-unknown size}) is left over from before"
    echo "  2026-10-10 and is no longer mounted. Each build now resolves into its own"
    echo "  repository and reads the seed inside the builder image, so nothing reads the"
    echo "  directory above; you can delete it."
fi
