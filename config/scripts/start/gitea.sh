#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

sed_inplace() {
  if sed --version >/dev/null 2>&1; then sed -i "$@"; else sed -i '' "$@"; fi
}

get_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true
}

set_env() {
  if grep -qE "^${1}=" "$ENV_FILE"; then
    sed_inplace -E "s|^${1}=.*|${1}=${2}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

echo "Preparing Gitea..."

# Pre-create the bind mount so it's owned by the host user, not root-created by
# the daemon (see the rootless-Docker notes for the other services).
mkdir -p "${PROJECT_DIR}/volumes/_gitea/data"
chmod 777 "${PROJECT_DIR}/volumes/_gitea/data"

ADMIN_USER="$(get_env GITEA_ADMIN_USER)";   [[ -z "$ADMIN_USER" ]]  && { ADMIN_USER="aiw-admin";              set_env GITEA_ADMIN_USER "$ADMIN_USER"; }
ADMIN_EMAIL="$(get_env GITEA_ADMIN_EMAIL)"; [[ -z "$ADMIN_EMAIL" ]] && { ADMIN_EMAIL="user@nocodenation.org"; set_env GITEA_ADMIN_EMAIL "$ADMIN_EMAIL"; }

ADMIN_PASSWORD="$(get_env GITEA_ADMIN_PASSWORD)"
if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="$(openssl rand -hex 24)"
  set_env GITEA_ADMIN_PASSWORD "$ADMIN_PASSWORD"
  echo "  generated GITEA_ADMIN_PASSWORD"
fi

# Start Gitea on its own so it can be seeded; the later `docker compose up -d`
# is a no-op for the already-running, healthy container.
docker compose up -d gitea

echo "  waiting for Gitea to accept commands..."
gitea_cli() { docker compose exec -T --user git gitea gitea "$@"; }
deadline=$(( $(date +%s) + 120 ))
until gitea_cli admin user list >/dev/null 2>&1; do
  if (( $(date +%s) >= deadline )); then
    echo "Warning: Gitea did not become ready in time; skipping admin/token seeding." >&2
    exit 0
  fi
  sleep 3
done

if gitea_cli admin user list 2>/dev/null | awk 'NR>1 {print $2}' | grep -qx "$ADMIN_USER"; then
  echo "  admin user '${ADMIN_USER}' already exists."
else
  gitea_cli admin user create --admin --username "$ADMIN_USER" \
    --password "$ADMIN_PASSWORD" --email "$ADMIN_EMAIL" --must-change-password=false
  echo "  created admin user '${ADMIN_USER}'."
fi

TOKEN="$(get_env GITEA_OPENCLAW_TOKEN)"
if [[ -z "$TOKEN" || "$TOKEN" == generate_this_with_shell_script ]]; then
  if NEW_TOKEN="$(gitea_cli admin user generate-access-token --username "$ADMIN_USER" \
        --token-name openclaw --scopes all --raw 2>/dev/null | tr -d '[:space:]')"; then
    set_env GITEA_OPENCLAW_TOKEN "$NEW_TOKEN"
    echo "  minted GITEA_OPENCLAW_TOKEN for OpenClaw."
  else
    echo "Warning: could not mint the OpenClaw Gitea token (one named 'openclaw' may already exist)." >&2
    echo "  Create a token in the Gitea UI and set GITEA_OPENCLAW_TOKEN in .env." >&2
  fi
fi
