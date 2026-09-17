#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$(cd "${SCRIPT_DIR}/../../.." && pwd)}"
MODE="${2:-}"

# start.sh runs down.sh as its second action, 123 lines before this script. A
# declaration it refuses therefore used to cost the whole running stack: every
# container removed, and the abort here long before `docker compose up`. Observed
# on 2026-09-08 during A8-16, from the dashboard's own Start button. So start.sh
# calls this first, with nothing torn down yet, and the refusal is the parser's
# own -- one reader, one message, whichever way it is reached.
if [[ "$MODE" == "--check-declaration" ]]; then
  # shellcheck source=lib/git-repos.sh
  source "${SCRIPT_DIR}/lib/git-repos.sh"
  declaration="${GIT_REPOSITORIES:-}"
  if [[ -z "$declaration" && -f "${PROJECT_DIR}/.env" ]]; then
    declaration="$(grep -E '^GIT_REPOSITORIES=' "${PROJECT_DIR}/.env" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
  fi
  lu_git_parse "$declaration" >/dev/null
  exit 0
fi

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

# shellcheck source=lib/git-repos.sh
source "${SCRIPT_DIR}/lib/git-repos.sh"

SECRETS_MOUNT="${GIT_SECRETS_MOUNT:-/git-secrets}"
REPOS_MOUNT="${GIT_REPOS_MOUNT:-/repos}"
HOOKS_DIR="${SECRETS_DIR}/hooks"
HOOKS_MOUNT="${SECRETS_MOUNT}/hooks"
GITCONFIG="${SECRETS_DIR}/gitconfig"
MANIFEST="${SECRETS_DIR}/repositories.json"
ENV_FILE="${PROJECT_DIR}/.env"

mkdir -p "$HOOKS_DIR"
chmod 755 "$HOOKS_DIR"
install -m 755 "${SCRIPT_DIR}/../../agents/hooks/pre-push" "${HOOKS_DIR}/pre-push"

cat > "$GITCONFIG" <<EOF
[core]
	hooksPath = ${HOOKS_MOUNT}
EOF
chmod 644 "$GITCONFIG"

DECLARATION="${GIT_REPOSITORIES:-}"
if [[ -z "$DECLARATION" && -f "$ENV_FILE" ]]; then
  DECLARATION="$(grep -E '^GIT_REPOSITORIES=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
fi

# -k: the same helper in openclaw.sh was measured on 2026-09-14 failing to return
# at all -- SIGTERM went nowhere and GNU timeout waits for its child after
# signalling, so the bound outlived its limit by minutes and the start with it.
# That was a `docker run`, and nothing here reproduces it for `git clone`: this
# flag is insurance, not a repair. It is taken because the failure it forecloses
# is a start that never comes back, and because a kill after a grace period costs
# nothing when the signal already worked.
with_timeout() {
  local secs="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout -k 10 "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout -k 10 "$secs" "$@"
  else
    "$@"
  fi
}

# Announce, poll, allow a skip, stop at a deadline -- the same helper the
# OpenClaw sign-ins use, so the deploy key waits like every other credential.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/wait-for-operator.sh"

json_escape() {
  printf '%s' "$1" | tr -d '\n\r\t' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PARSED="$(lu_git_parse "$DECLARATION")"
lu_git_keys "$SECRETS_DIR" "$DECLARATION" >/dev/null

ENTRIES=""
while IFS=$'\t' read -r name url host path access policy slug dir; do
  [[ -n "${slug:-}" ]] || continue
  key="${SECRETS_DIR}/repos/${slug}/id_ed25519"
  mount_key="${SECRETS_MOUNT}/repos/${slug}/id_ed25519"
  dest="${REPOS_DIR}/${dir}"
  cloned=false
  error=""

  if [[ -d "${dest}/.git" ]]; then
    cloned=true
  else
    clone_ssh="ssh -F /dev/null -i ${key} -o IdentitiesOnly=yes -o IdentityAgent=none -o UserKnownHostsFile=${KNOWN_HOSTS} -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o BatchMode=yes"
    if out="$(with_timeout 300 env GIT_SSH_COMMAND="$clone_ssh" git clone --quiet "$url" "$dest" 2>&1)"; then
      cloned=true
      echo "Cloned ${url} into ${dest}"
    else
      rm -rf "$dest"
      error="$(printf '%s' "$out" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
      error="${error:-clone failed}"

      # Shown here, in the flow, rather than left for the operator to find in the
      # dashboard card later: this is the same kind of thing as a sign-in, and the
      # sign-ins stop and wait. Review point 1 of #9.
      #
      # The marker is what the dashboard watches for, like ::aiw-codex-auth-required::.
      # The original wording, kept verbatim: A8-19 and A3c-7 were signed off
      # against it, and rewriting another milestone's assertion so that my own
      # text passes would empty the assertion of its worth.
      echo "Warning: could not clone ${url}: ${error}" >&2
      echo "::aiw-git-key-required::${slug}" >&2
      echo "" >&2
      echo "=============================== ACTION REQUIRED ===============================" >&2
      echo "Could not clone ${url}" >&2
      echo "  ${error}" >&2
      echo "" >&2
      echo "Add this public key as a deploy key:" >&2
      echo "" >&2
      sed -e 's/^/    /' "${key}.pub" >&2 2>/dev/null || echo "    (missing ${key}.pub)" >&2
      echo "" >&2
      # Computed, not assembled by hand: the host and path are already in the
      # declaration. Review point 3 of #9.
      echo "  https://${host}/${path}/settings/keys/new" >&2
      if [[ "$access" == "write" ]]; then
        # The checkbox is off by default, and a key added without it clones fine
        # and fails on push much later, inside an agent session. Review point 4.
        echo "" >&2
        echo "  This repository is declared with write access, so tick" >&2
        echo "  **Allow write access** on that form. Without it the clone works" >&2
        echo "  and the first push fails, in an agent session, much later." >&2
      fi
      echo "" >&2
      echo "$(lu_skip_hint "git-key-${slug}")" >&2
      echo "===============================================================================" >&2
      echo "" >&2

      # Retry rather than ask the operator to start again: the clone is the
      # condition, so registering the key ends the wait by itself.
      # `|| _wait_rc=$?` and not a bare call: the helper returns 1 for a skip and
      # 2 for the deadline, and a bare command with a non-zero status ends the
      # script under `set -e`. A sign-in nobody completed would have taken the
      # whole start down with it -- found by the case below on 2026-09-17.
      _wait_rc=0
      lu_wait_for_operator "git-key-${slug}" 5 \
        env GIT_SSH_COMMAND="$clone_ssh" git clone --quiet "$url" "$dest" || _wait_rc=$?
      case $_wait_rc in
        0) cloned=true
           echo "Cloned ${url} into ${dest}" ;;
        1) rm -rf "$dest"
           echo "Warning: ${url} was skipped; it is not cloned." >&2 ;;
        *) rm -rf "$dest"
           echo "Warning: ${url} was not cloned: the deploy key is still not registered." >&2
           echo "  The start continues; register it and start again." >&2 ;;
      esac
    fi
  fi

  if [[ "$cloned" == true ]]; then
    git -C "$dest" config core.sshCommand "ssh -F /dev/null -i ${mount_key} -o IdentitiesOnly=yes -o IdentityAgent=none -o UserKnownHostsFile=${SECRETS_MOUNT}/known_hosts -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o BatchMode=yes"
    git -C "$dest" config core.hooksPath "$HOOKS_MOUNT"
    git -C "$dest" config liquidupstart.identity "$mount_key"
    git -C "$dest" config liquidupstart.access "$access"
    git -C "$dest" config liquidupstart.policy "$policy"
    git -C "$dest" config "url.${url}.insteadOf" "https://${host}/${path}"
  fi

  entry="$(cat <<JSON
    {
      "name": "$(json_escape "$name")",
      "url": "$(json_escape "$url")",
      "host": "$(json_escape "$host")",
      "path": "$(json_escape "$path")",
      "access": "$(json_escape "$access")",
      "policy": "$(json_escape "$policy")",
      "slug": "$(json_escape "$slug")",
      "keyDir": "volumes/_git-secrets/repos/$(json_escape "$slug")",
      "publicKeyFile": "volumes/_git-secrets/repos/$(json_escape "$slug")/id_ed25519.pub",
      "clonePath": "volumes/repos/$(json_escape "$dir")",
      "containerKey": "$(json_escape "$mount_key")",
      "containerClone": "${REPOS_MOUNT}/$(json_escape "$dir")",
      "cloned": ${cloned},
      "error": $(if [[ -n "$error" ]]; then printf '"%s"' "$(json_escape "$error")"; else printf 'null'; fi)
    }
JSON
)"
  ENTRIES="${ENTRIES:+${ENTRIES},
}${entry}"
done <<< "$PARSED"

for existing in "$REPOS_DIR"/*/; do
  [[ -d "${existing}.git" ]] || continue
  git -C "$existing" config core.hooksPath "$HOOKS_MOUNT"
done

{
  printf '{\n  "generated": "%s",\n  "repositories": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [[ -n "$ENTRIES" ]] && printf '%s\n' "$ENTRIES"
  printf '  ]\n}\n'
} > "$MANIFEST"
chmod 644 "$MANIFEST"
