#!/usr/bin/env bash

set -e

NIFI_BASE_DIR="${NIFI_BASE_DIR:-/opt/nifi}"
NIFI_HOME="${NIFI_HOME:-${NIFI_BASE_DIR}/nifi-current}"
# Two directories, and the split is the point. The inbox is the bind mount --
# ./volumes/nar_extensions -- that the operator, the agents and nar-build all
# write to. The load directory is inside the container, it is what
# nifi.nar.library.autoload.directory names, and nothing outside writes to it.
#
# They were the same directory until 2026-09-29, so a bundle copied in by hand
# was loaded by the auto-loader within seconds without being judged: measured
# refused by narcheck, dropped ~35s after start, loaded ~5s later. Item 11 of the
# 2026-09-28 review. A bundle reaches the catalogue by passing the check now, on
# both routes.
DROP_DIR="${NIFI_HOME}/nar_inbox"
LOAD_DIR="${NIFI_HOME}/nar_extensions"
# Where a bundle goes when it is refused: a subdirectory of the inbox, so the
# operator can see it on the host, and out of their way without being deleted.
REFUSED_DIR="${DROP_DIR}/refused"
LIB_DIR="${NIFI_HOME}/lib"
NAR_CHECK="$(cd "$(dirname "$0")" && pwd)/narcheck.py"
NAR_WATCH="$(cd "$(dirname "$0")" && pwd)/nar-watch.sh"

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
        echo "Found $NAR_COUNT NAR file(s) in the inbox"
        echo "Judging them, and copying what passes into the load directory..."

        FAILED=0
        STUCK=0
        for NAR in "$DROP_DIR"/*.nar; do
            if ! REFUSAL="$(python3 "$NAR_CHECK" check "$NAR" "$LIB_DIR" 2>&1)"; then
                FAILED=$((FAILED + 1))
                echo "NAR DEPLOYMENT FAILED: ${NAR} did not reach ${LOAD_DIR}/" >&2
                echo "$REFUSAL" >&2
                # Out of the drop directory, not merely out of lib/. Refusing to
                # copy was never a refusal: nifi.nar.library.autoload.directory
                # points at this directory, so NiFi loads whatever stays here at
                # runtime, without a restart and without lib/ -- measured
                # 2026-09-09, and the reason this whole path was reopened. The
                # auto-loader skips a subdirectory: "Skipping non-nar file
                # refused", measured 2026-09-14.
                if mkdir -p "$REFUSED_DIR" && mv "$NAR" "${REFUSED_DIR}/"; then
                    echo "  Moved to ${REFUSED_DIR}/: nothing here deletes it." >&2
                else
                    STUCK=$((STUCK + 1))
                    echo "  WARNING: it could not be moved out of ${DROP_DIR}. It is not loaded --" >&2
                    echo "  the inbox is not the load path -- but it will be judged again on every" >&2
                    echo "  pass. Remove it by hand." >&2
                fi
                continue
            fi
            if cp -v "$NAR" "${LOAD_DIR}/"; then
                continue
            fi
            FAILED=$((FAILED + 1))
            echo "NAR DEPLOYMENT FAILED: ${NAR} did not reach ${LOAD_DIR}/" >&2
        done

        if [ "$FAILED" -gt 0 ]; then
            echo "NAR DEPLOYMENT FAILED: ${FAILED} of ${NAR_COUNT} NAR file(s) did not reach ${LOAD_DIR}/." >&2
            echo "This message is the only record of why, and the next step depends on which it was:" >&2
            if [ "${STUCK:-0}" -gt 0 ]; then
                # Said separately, because the operator has to clear these by
                # hand; they are not loaded either way.
                echo "  Refused AND STILL IN THE INBOX: ${STUCK} bundle(s) could not be moved to" >&2
                echo "    ${REFUSED_DIR}. They are in ${DROP_DIR}, which is not the load path, so" >&2
                echo "    they are not loaded -- but they will be judged again on every pass." >&2
                echo "    Remove them by hand. On Linux this is usually the inbox being owned by" >&2
                echo "    root while Liquid runs as nifi." >&2
            fi
            echo "  Refused: the bundle is in ${REFUSED_DIR} and was not loaded. Correct it and drop" >&2
            echo "    it in again -- ${DROP_DIR} is watched, and a bundle that passes is loaded" >&2
            echo "    within seconds." >&2
            echo "  Copy failed: the bundle passed the check and could not be copied into" >&2
            echo "    ${LOAD_DIR}/, so it is not loaded. That directory is inside the container and" >&2
            echo "    is written by Liquid alone, so this means its filesystem is full or read-only." >&2
            echo "Liquid is starting anyway, because every other flow it hosts depends on it." >&2
        else
            echo "NAR deployment complete: ${NAR_COUNT} file(s) copied to ${LOAD_DIR}/"
        fi
    else
        echo "No NAR files found in the inbox"
    fi
else
    echo "the NAR inbox is not mounted at ${DROP_DIR}"
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
    if [ -z "$NIFI_VERSION" ] || [ -z "$JAVA_VERSION" ]; then
        # The builder falls back to the log, which works until the file rotates.
        echo "Warning: could not read the runtime versions from ${LIB_DIR}" >&2
        echo "  The NAR builder falls back to the startup line in the log." >&2
    elif printf 'nifi_version=%s\njava_version=%s\n' "$NIFI_VERSION" "$JAVA_VERSION" \
            > "${API_DIR}/runtime" 2>/dev/null; then
        echo "Published the runtime versions for the NAR builder: NiFi ${NIFI_VERSION}, Java ${JAVA_VERSION}"
    else
        # **This write used to kill Liquid.** It was unguarded under `set -e`, so
        # an api/ that exists and cannot be written ended the entrypoint -- and
        # under `restart: unless-stopped` the container then looped, sub-second
        # at first and backing off to about 13s, with nothing in the log but
        # bash's own "Permission denied" line. Measured: RestartCount 1 to 9 in
        # 29 seconds. S8 of the 2026-10-01 review.
        #
        # It is not fatal, for the reason the index write above is not: Liquid
        # reads lib/ directly and needs none of this. What needs it is the
        # builder, and `build.sh` refuses a bundle it cannot judge rather than
        # deploying one unchecked (D2), so the failure stays closed at the place
        # where it matters.
        #
        # The message does **not** promise the log fallback here. `build.sh`
        # prefers the record whenever it parses and reads the log only when the
        # record gave nothing -- so a stale record that still parses defeats the
        # fallback, and saying otherwise would send the operator looking in the
        # wrong place.
        echo "Warning: could not write ${API_DIR}/runtime, so the NAR builder has no" >&2
        echo "  record of the versions this instance runs. Liquid is unaffected and" >&2
        echo "  starts normally; nar-build will refuse until this is fixed." >&2
        echo "  ${API_DIR} has to be writable by the nifi user, which" >&2
        echo "  config/scripts/start/liquid.sh arranges. If the stack was brought up" >&2
        echo "  with docker compose directly, run ./scripts/linux/start.sh instead." >&2
        ls -ld "$API_DIR" >&2 2>/dev/null || echo "  (${API_DIR} could not be listed either)" >&2
    fi
fi

# The same judgement, for everything that arrives after this point. Without it
# the split would only move the hole: the inbox is watched by nobody and a
# hand-dropped bundle would sit there unloaded and unexplained.
#
# Started before NiFi so nothing can be dropped into a gap, and in the
# background so it outlives this shell's exec. If it dies, nothing is promoted
# and nothing loads -- the failure is closed, and visible in the log.
if [ -x "$NAR_WATCH" ] && [ -d "$DROP_DIR" ]; then
    "$NAR_WATCH" &
else
    echo "Warning: ${NAR_WATCH} is not there; bundles dropped in while Liquid runs" >&2
    echo "  will not be judged and will not be loaded. Restart Liquid to deploy them." >&2
fi

echo "Starting Liquid..."
exec "${NIFI_BASE_DIR}/scripts/start.sh" "$@"
