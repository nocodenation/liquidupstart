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
    # Counted the way the loop below iterates. `find -name "*.nar"` matches
    # dot-files that the `"$DROP_DIR"/*.nar` glob skips, so a directory holding
    # good.nar, .x.nar and a refused bad.nar reported "1 of 3" for two bundles.
    # Minor of the 2026-09-28 review.
    NAR_COUNT=0
    for NAR in "$DROP_DIR"/*.nar; do
        [ -f "$NAR" ] && NAR_COUNT=$((NAR_COUNT + 1))
    done

    if [ "$NAR_COUNT" -gt 0 ]; then
        echo "Found $NAR_COUNT NAR file(s) in nar_extensions directory"
        echo "Copying NARs to lib directory..."

        FAILED=0
        STUCK=0
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
                    STUCK=$((STUCK + 1))
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
            if [ "${STUCK:-0}" -gt 0 ]; then
                # Said separately, because it is the opposite of the line below:
                # the bundle is still in the load path and will be loaded.
                echo "  Refused AND STILL IN PLACE: ${STUCK} bundle(s) could not be moved to" >&2
                echo "    ${REFUSED_DIR}. They are in ${DROP_DIR} and the auto-loader will load" >&2
                echo "    them within seconds. Remove them by hand. On Linux this is usually the" >&2
                echo "    drop directory being owned by root while Liquid runs as nifi." >&2
            fi
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

# And the two versions a bundle is compiled against, recorded beside the index.
#
# The builder read them from the `Starting NiFi ... using Java ...` line in
# nifi-app.log. NiFi's stock logback rotates that file hourly and keeps 30, so
# about thirty hours after a start the line is gone and every nar-build and
# --target answered "ask the operator to restart Liquid" -- against the promise
# that deploying a bundle needs no restart. Item 7 of the 2026-09-28 review.
#
# The distribution carries both facts without the log: lib/ names the NiFi
# version in its own jars, and the JVM reports its build. Written on every
# start, like the index, so the record belongs to the instance that is running.
if [ -d "$API_DIR" ]; then
    NIFI_VERSION=""
    for JAR in "${LIB_DIR}"/nifi-runtime-*.jar "${LIB_DIR}"/nifi-framework-api-*.jar; do
        [ -f "$JAR" ] || continue
        NIFI_VERSION="$(basename "$JAR" .jar | sed -n 's/^nifi-\(runtime\|framework-api\)-//p')"
        [ -n "$NIFI_VERSION" ] && break
    done
    # The build string, which is what java.version reports and therefore what
    # the log line carried: 21.0.12+10-LTS, not 21.0.12.
    JAVA_VERSION="$(java -version 2>&1 | sed -n 's/.*(build \([^)]*\)).*/\1/p' | head -1)"
    if [ -n "$NIFI_VERSION" ] && [ -n "$JAVA_VERSION" ]; then
        printf 'nifi_version=%s\njava_version=%s\n' "$NIFI_VERSION" "$JAVA_VERSION" \
            > "${API_DIR}/runtime"
        echo "Published the runtime versions for the NAR builder: NiFi ${NIFI_VERSION}, Java ${JAVA_VERSION}"
    else
        # The builder falls back to the log, which works until the file rotates.
        echo "Warning: could not read the runtime versions from ${LIB_DIR}" >&2
        echo "  The NAR builder falls back to the startup line in the log." >&2
    fi
fi

echo "Starting Liquid..."
exec "${NIFI_BASE_DIR}/scripts/start.sh" "$@"
