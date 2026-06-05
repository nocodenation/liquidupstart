#!/usr/bin/env bash

# Seed the Hermes config from a mounted default if the persistent volume
# doesn't already have one. /root/.hermes is a volume, so this only copies
# on first run (or after the volume is reset).
if [ -f /opt/config.yaml ] && [ ! -f /root/.hermes/config.yaml ]; then
    mkdir -p /root/.hermes
    cp /opt/config.yaml /root/.hermes/config.yaml
fi
hermes dashboard --host 0.0.0.0 --port 9119 --no-open --insecure
