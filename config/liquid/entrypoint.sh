#!/usr/bin/env bash

set -e

NIFI_BASE_DIR="${NIFI_BASE_DIR:-/opt/nifi}"
NIFI_HOME="${NIFI_HOME:-${NIFI_BASE_DIR}/nifi-current}"
DROP_DIR="${NIFI_HOME}/nar_extensions"
LIB_DIR="${NIFI_HOME}/lib"

echo "Liquid Playground - Starting..."

if [ -d "$DROP_DIR" ]; then
    NAR_COUNT=$(find "$DROP_DIR" -maxdepth 1 -name "*.nar" 2>/dev/null | wc -l)

    if [ "$NAR_COUNT" -gt 0 ]; then
        echo "Found $NAR_COUNT NAR file(s) in nar_extensions directory"
        echo "Copying NARs to lib directory..."

        FAILED=0
        for NAR in "$DROP_DIR"/*.nar; do
            if cp -v "$NAR" "${LIB_DIR}/"; then
                continue
            fi
            FAILED=$((FAILED + 1))
            echo "NAR DEPLOYMENT FAILED: ${NAR} did not reach ${LIB_DIR}/" >&2
        done

        if [ "$FAILED" -gt 0 ]; then
            echo "NAR DEPLOYMENT FAILED: ${FAILED} of ${NAR_COUNT} NAR file(s) did not reach ${LIB_DIR}/." >&2
            echo "The processors they carry will not appear in Liquid, and this message is the only" >&2
            echo "record of why. Fix the cause above, then: docker compose restart liquid" >&2
            echo "Liquid is starting anyway, because every other flow it hosts depends on it." >&2
        else
            echo "NAR deployment complete: ${NAR_COUNT} file(s) copied to ${LIB_DIR}/"
        fi
    else
        echo "No NAR files found in nar_extensions directory"
    fi
else
    echo "nar_extensions directory not mounted"
fi

echo "Starting Liquid..."
exec "${NIFI_BASE_DIR}/scripts/start.sh" "$@"
