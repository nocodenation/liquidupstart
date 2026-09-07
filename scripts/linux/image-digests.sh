#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

# Seven of the images this stack pulls hang on tags that can move, and one of
# them moved under us on 2026-09-05. Recording what every tag resolves to lets a
# later difference be attributed: this repository, or an upstream move. Digests
# come from the registry rather than from local images, so a base image BuildKit
# pulled without ever tagging it locally is covered too.
usage() { echo "Usage: $(basename "$0") [output-file]   (default: stdout)" >&2; }
case "${1:-}" in -h|--help) usage; exit 0 ;; esac

digest() {
  docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null || echo '(lookup failed)'
}

emit() {
  echo "# Registry digests, $(date -u +%Y-%m-%dT%H:%M:%SZ), branch $(git branch --show-current 2>/dev/null || echo '?')"

  echo "# Service images (compose.yml)"
  docker compose config --format json | jq -r '.services[].image' | sort -u | grep -v '^liquidupstart/' \
    | while read -r img; do printf '%s\t%s\n' "$img" "$(digest "$img")"; done

  echo "# Base images of the locally built ones"
  for f in config/*/Dockerfile config/*/templates/Dockerfile; do
    [ -f "$f" ] || continue
    b="$(grep -m1 '^FROM ' "$f" | awk '{print $2}')"
    [ -n "$b" ] && printf '%s\t%s\t%s\n' "$f" "$b" "$(digest "$b")"
  done

  # The pin, its predecessor and the floating tag, side by side. :latest is what
  # moved; keeping all three in one file is what turned "latest is presumably
  # 2026.9.1" into a comparison of two digests.
  echo "# OpenClaw tags side by side"
  for t in 2026.7.1 2026.9.1 latest; do
    printf 'ghcr.io/openclaw/openclaw:%s\t%s\n' "$t" "$(digest "ghcr.io/openclaw/openclaw:$t")"
  done
}

if [[ -n "${1:-}" ]]; then
  emit > "$1"
  echo "wrote $1"
else
  emit
fi
