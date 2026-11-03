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
#
# The removal is printed, not run (FR43, #32). #10's entrypoint handed the tree
# to the build user, and on rootless Docker that uid is one the host user cannot
# delete as; the same uid inside a container is root over it, so the command is
# a `docker run` of the builder's own image -- the one image this script, running
# under LIQUID_ON alone, can count on being local -- with the project's resolved
# path, quoted. `rmdir` for the mount point the container cannot remove.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
STALE="${PROJECT_DIR}/volumes/nar_builder/m2"

if [ -d "$STALE" ]; then
    size="$(du -sh "$STALE" 2>/dev/null | cut -f1)"
    echo ""
    echo "Note: volumes/nar_builder/m2 (${size:-unknown size}) is left over from before 2026-10-10"
    echo "  and is no longer mounted. Each build now resolves into its own repository and"
    echo "  reads the seed inside the builder image, so nothing reads the directory above."
    echo "  On rootless Docker a plain rm is refused: the tree belongs to the build user's"
    echo "  mapped uid, not to you. A container with the directory mounted removes it, and"
    echo "  rmdir takes the empty parent the container cannot remove:"
    echo "    docker run --pull never --rm --entrypoint rm -v \"${PROJECT_DIR}/volumes/nar_builder:/v\" liquidupstart/nar-builder:latest -rf /v/m2"
    echo "    rmdir \"${PROJECT_DIR}/volumes/nar_builder\""
fi
