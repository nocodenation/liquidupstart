#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
REPOS_DIR="${PROJECT_DIR}/volumes/repos"
SECRETS_DIR="${PROJECT_DIR}/volumes/_git-secrets"
KEY="${SECRETS_DIR}/id_ed25519"
KNOWN_HOSTS="${SECRETS_DIR}/known_hosts"

mkdir -p "$REPOS_DIR"
chmod 777 "$REPOS_DIR"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

if [[ ! -f "$KEY" ]]; then
  ssh-keygen -t ed25519 -N '' -C 'liquidupstart-agent' -f "$KEY" >/dev/null
  echo "Generated agent deploy key: ${KEY}.pub"
fi
chmod 600 "$KEY"
chmod 644 "${KEY}.pub"

if [[ ! -f "$KNOWN_HOSTS" ]]; then
  scanned="$(mktemp)"
  if ! ssh-keyscan -T 20 github.com 2>/dev/null > "$scanned" || [[ ! -s "$scanned" ]]; then
    rm -f "$scanned"
    echo "Error: could not reach github.com to seed known_hosts" >&2
    exit 1
  fi
  published="$(curl -s --max-time 20 https://api.github.com/meta \
    | grep -oE '"SHA256_[A-Z0-9]+": *"[^"]+"' \
    | sed -E 's/.*: *"/SHA256:/; s/"$//' || true)"
  if [[ -z "$published" ]]; then
    rm -f "$scanned"
    echo "Error: could not fetch GitHub's published host key fingerprints" >&2
    exit 1
  fi
  while read -r _ fp _; do
    [[ -n "$fp" ]] || continue
    if ! grep -qxF "$fp" <<<"$published"; then
      rm -f "$scanned"
      echo "Error: github.com offered host key ${fp}, which GitHub does not publish" >&2
      exit 1
    fi
  done < <(ssh-keygen -l -f "$scanned")
  mv "$scanned" "$KNOWN_HOSTS"
  chmod 644 "$KNOWN_HOSTS"
  echo "Seeded known_hosts with verified github.com host keys"
fi
