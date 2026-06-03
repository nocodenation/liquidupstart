#!/usr/bin/env bash
set -euo pipefail

echo "Stopping existing containers..."
docker compose down
