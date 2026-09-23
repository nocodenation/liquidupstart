#!/usr/bin/env bash

set -e

NIFI_BASE_DIR="${NIFI_BASE_DIR:-/opt/nifi}"
NIFI_HOME="${NIFI_HOME:-${NIFI_BASE_DIR}/nifi-current}"
DROP_DIR="${NIFI_HOME}/nar_extensions"
# Where a bundle goes when it is refused: a subdirectory, because the auto-loader
# skips those, and out of the operator's way without being deleted.
REFUSED_DIR="${DROP_DIR}/refused"
LIB_DIR="${NIFI_HOME}/lib"
NAR_CHECK="$(cd "$(dirname "$0")" && pwd)/narcheck.py"

echo "Liquid Playground - Starting..."

if [ -d "$DROP_DIR" ]; then
    NAR_COUNT=$(find "$DROP_DIR" -maxdepth 1 -name "*.nar" 2>/dev/null | wc -l | tr -d "[:space:]")

    if [ "$NAR_COUNT" -gt 0 ]; then
        echo "Found $NAR_COUNT NAR file(s) in nar_extensions directory"
        echo "Copying NARs to lib directory..."

        FAILED=0
        for NAR in "$DROP_DIR"/*.nar; do
            if ! REFUSAL="$(python3 "$NAR_CHECK" check "$NAR" "$LIB_DIR" 2>&1)"; then
                FAILED=$((FAILED + 1))
                echo "NAR DEPLOYMENT FAILED: ${NAR} did not reach ${LIB_DIR}/" >&2
                echo "$REFUSAL" >&2
                # Out of the drop directory, not merely out of lib/. Refusing to
                # copy was never a refusal: nifi.nar.library.autoload.directory
                # points at this directory, so NiFi loads whatever stays here at
                # runtime, without a restart and without lib/ -- measured
                # 2026-09-09, and the reason this whole path was reopened. The
                # auto-loader skips a subdirectory: "Skipping non-nar file
                # refused", measured 2026-09-14.
                if mkdir -p "$REFUSED_DIR" && mv "$NAR" "${REFUSED_DIR}/"; then
                    echo "  Moved to ${REFUSED_DIR}/: nothing here deletes it, and while it" >&2
                    echo "  sat in ${DROP_DIR} the auto-loader would have loaded it anyway." >&2
                else
                    echo "  WARNING: it could not be moved out of ${DROP_DIR}, where the" >&2
                    echo "  auto-loader will pick it up within seconds. Remove it by hand." >&2
                fi
                continue
            fi
            if cp -v "$NAR" "${LIB_DIR}/"; then
                continue
            fi
            FAILED=$((FAILED + 1))
            echo "NAR DEPLOYMENT FAILED: ${NAR} did not reach ${LIB_DIR}/" >&2
        done

        if [ "$FAILED" -gt 0 ]; then
            echo "NAR DEPLOYMENT FAILED: ${FAILED} of ${NAR_COUNT} NAR file(s) did not reach ${LIB_DIR}/." >&2
            echo "This message is the only record of why, and the next step depends on which it was:" >&2
            echo "  Refused: the bundle is in ${REFUSED_DIR}, out of the load path. Correct it and" >&2
            echo "    drop it in again -- Liquid auto-loads from ${DROP_DIR} within seconds." >&2
            echo "  Copy failed: the bundle is still in ${DROP_DIR}, so the auto-loader will load it" >&2
            echo "    anyway; the copy into ${LIB_DIR}/ is the older, redundant path. If you want it" >&2
            echo "    there too, fix the cause above, then: docker compose restart liquid" >&2
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

# Publish what the nar_builder needs to make the same decision this entrypoint
# makes: not the jars, an index of them. 1512 class names and 49 API packages,
# 70KB of text, written by narcheck.py itself so the writer and the reader cannot
# drift apart.
#
# Handing over the nifi-api jar alone was the first design and it was wrong:
# `check` resolves references against *every* jar in lib/ while judging only the
# API's packages, and 85 classes live in an API package without being in the API
# jar. A builder holding only that jar would refuse bundles this Liquid loads --
# a false refusal, which is worse than no check at all.
#
# Written on every start rather than baked into the image: the index belongs to
# the distribution that is running.
API_DIR="${NIFI_HOME}/api"
if [ -d "$API_DIR" ]; then
    if OUT="$(python3 "$NAR_CHECK" index "$LIB_DIR" "$API_DIR" 2>&1)"; then
        echo "Published the load index for the NAR builder: ${OUT}"
    else
        # Not fatal for Liquid, which reads lib/ directly. It is fatal for the
        # builder, which refuses everything without it -- and says so there.
        echo "Warning: could not write the load index to ${API_DIR}: ${OUT}" >&2
        echo "  The NAR builder cannot judge bundles and will refuse them all." >&2
    fi
else
    echo "api directory not mounted; the NAR builder has nothing to judge bundles against" >&2
fi

echo "Starting Liquid..."
exec "${NIFI_BASE_DIR}/scripts/start.sh" "$@"
