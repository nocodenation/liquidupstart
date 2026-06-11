#!/usr/bin/env bash

set -e

echo "Liquid Playground - Starting..."

# Check if nar_extensions directory exists and has NAR files
if [ -d "/opt/nifi/nifi-current/nar_extensions" ]; then
    NAR_COUNT=$(find /opt/nifi/nifi-current/nar_extensions -maxdepth 1 -name "*.nar" 2>/dev/null | wc -l)

    if [ "$NAR_COUNT" -gt 0 ]; then
        echo "Found $NAR_COUNT NAR file(s) in nar_extensions directory"
        echo "Copying NARs to lib directory..."

        # Copy all NAR files from nar_extensions to lib
        cp -v /opt/nifi/nifi-current/nar_extensions/*.nar /opt/nifi/nifi-current/lib/ 2>/dev/null || true

        echo "NAR deployment complete"
    else
        echo "No NAR files found in nar_extensions directory"
    fi
else
    echo "nar_extensions directory not mounted"
fi

# Execute the original NiFi start script
echo "Starting NiFi..."
exec /opt/nifi/scripts/start.sh "$@"
