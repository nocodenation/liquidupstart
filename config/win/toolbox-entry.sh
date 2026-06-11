#!/usr/bin/env bash
set -euo pipefail

# The project is bind-mounted from the Windows filesystem, where the Unix
# executable bit is not tracked. The orchestration scripts invoke one another
# directly (e.g. build.sh -> config/scripts/build/*.sh), which needs +x, so we
# restore it here before handing control to the requested script. (No-ops on a
# share that already presents files as executable.)
chmod +x ./*.sh 2>/dev/null || true
find ./config -name '*.sh' -type f -exec chmod +x {} + 2>/dev/null || true

exec "$@"
