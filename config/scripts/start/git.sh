#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
REPOS_DIR="${PROJECT_DIR}/volumes/repos"

mkdir -p "$REPOS_DIR"
chmod 777 "$REPOS_DIR"
