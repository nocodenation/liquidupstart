#!/usr/bin/env bash

set -e

echo "Liquid Playground - Starting..."

if [ -d "/opt/nifi/nifi-current/nar_extensions" ]; then
    NAR_COUNT=$(find /opt/nifi/nifi-current/nar_extensions -maxdepth 1 -name "*.nar" 2>/dev/null | wc -l)

    if [ "$NAR_COUNT" -gt 0 ]; then
        echo "Found $NAR_COUNT NAR file(s) in nar_extensions directory"
        echo "Copying NARs to lib directory..."

        cp -v /opt/nifi/nifi-current/nar_extensions/*.nar /opt/nifi/nifi-current/lib/ 2>/dev/null || true

        echo "NAR deployment complete"
    else
        echo "No NAR files found in nar_extensions directory"
    fi
else
    echo "nar_extensions directory not mounted"
fi

echo "Starting Liquid..."
exec /opt/nifi/scripts/start.sh "$@"
