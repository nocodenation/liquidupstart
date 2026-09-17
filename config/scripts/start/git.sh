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

# The same bound openclaw.sh uses, from the same file: a second copy here was
# how the unbounded fallback came to exist twice.
. "${SCRIPT_DIR}/lib/with-timeout.sh"

# Announce, poll, allow a skip, stop at a deadline -- the same helper the
# OpenClaw sign-ins use, so the deploy key waits like every other credential.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/wait-for-operator.sh"

json_escape() {
  printf '%s' "$1" | tr -d '\n\r\t' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PARSED="$(lu_git_parse "$DECLARATION")"
lu_git_keys "$SECRETS_DIR" "$DECLARATION" >/dev/null

# Three passes rather than one, since 2026-09-17. One pass discovered each
# failure only when it reached it, so the start could not say how many
# repositories were waiting on a key, or which -- it learned about the second one
# only after the first had been dealt with. An operator was told "add this key",
# did it, and was shown another screen with no warning that it was coming.
#
# Now every clone is attempted first. That also stops a reachable repository from
# queueing behind an unreachable one: what can be cloned is cloned immediately.
#
# Arrays and index loops rather than mapfile: macOS ships bash 3.2, which has
# neither mapfile nor readarray.
ENTRIES=""
R_NAME=(); R_URL=(); R_HOST=(); R_PATH=(); R_ACCESS=(); R_POLICY=(); R_SLUG=(); R_DIR=()
R_KEY=(); R_MOUNTKEY=(); R_DEST=(); R_CLONED=(); R_ERROR=(); R_SSH=()

# --- Pass 1: try every clone, and remember what failed ----------------------
while IFS=$'\t' read -r name url host path access policy slug dir; do
  [[ -n "${slug:-}" ]] || continue
  key="${SECRETS_DIR}/repos/${slug}/id_ed25519"
  mount_key="${SECRETS_MOUNT}/repos/${slug}/id_ed25519"
  dest="${REPOS_DIR}/${dir}"
  cloned=false
  error=""
  # Decided once per repository and carried into the second pass: the retry after
  # a key is registered must use the same isolation as the first attempt, and a
  # second copy of these options is a second thing to keep in step. A3c-8 counts
  # them for exactly that reason.
  clone_ssh="ssh -F /dev/null -i ${key} -o IdentitiesOnly=yes -o IdentityAgent=none -o UserKnownHostsFile=${KNOWN_HOSTS} -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o BatchMode=yes"

  if [[ -d "${dest}/.git" ]]; then
    cloned=true
  else
    if out="$(with_timeout 300 env GIT_SSH_COMMAND="$clone_ssh" git clone --quiet "$url" "$dest" 2>&1)"; then
      cloned=true
      echo "Cloned ${url} into ${dest}"
    else
      rm -rf "$dest"
      error="$(printf '%s' "$out" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
      error="${error:-clone failed}"
      # The original wording, kept verbatim: A8-19 and A3c-7 were signed off
      # against it, and rewriting another milestone's assertion so that my own
      # text passes would empty the assertion of its worth.
      echo "Warning: could not clone ${url}: ${error}" >&2
    fi
  fi

  R_NAME+=("$name"); R_URL+=("$url"); R_HOST+=("$host"); R_PATH+=("$path")
  R_ACCESS+=("$access"); R_POLICY+=("$policy"); R_SLUG+=("$slug"); R_DIR+=("$dir")
  R_KEY+=("$key"); R_MOUNTKEY+=("$mount_key"); R_DEST+=("$dest")
  R_CLONED+=("$cloned"); R_ERROR+=("$error"); R_SSH+=("$clone_ssh")
done <<< "$PARSED"

# --- Pass 2: ask for the keys that are missing, all of them known up front ---
# The count guards below are not decoration: bash 3.2 (what macOS ships) treats
# the expansion of an empty array under `set -u` as an unbound variable, and a
# stack that declares no repository has exactly that.
PENDING=()
for (( i = 0; i < ${#R_SLUG[@]}; i++ )); do
  [[ "${R_CLONED[$i]}" == true ]] || PENDING+=("$i")
done

if (( ${#PENDING[@]} > 0 )); then
  # The whole list up front, in one line the dashboard can read: the count and
  # the names have to be known before the first wait, or the panel can only ever
  # say "this one" and the operator learns about the second repository after
  # dealing with the first. ::aiw-git-key-required:: keeps its meaning -- the one
  # being waited on now -- so nothing that reads it has to change.
  PENDING_SLUGS=""
  for i in "${PENDING[@]}"; do PENDING_SLUGS="${PENDING_SLUGS:+${PENDING_SLUGS} }${R_SLUG[$i]}"; done
  echo "" >&2
  echo "::aiw-git-keys-pending::${PENDING_SLUGS}" >&2
  echo "=============================== ACTION REQUIRED ===============================" >&2
  if (( ${#PENDING[@]} == 1 )); then
    echo "One declared repository could not be cloned with the key this stack holds." >&2
  else
    echo "${#PENDING[@]} declared repositories could not be cloned with the keys this stack holds:" >&2
    for i in "${PENDING[@]}"; do
      echo "  - ${R_HOST[$i]}/${R_PATH[$i]}" >&2
    done
  fi
  echo "Each is asked for in turn below. The whole start waits at most $(lu_wait_seconds)s for all" >&2
  echo "of them together, so an unattended start is bounded however many there are." >&2
  echo "To skip every one of them at once: touch $(lu_skip_dir)/git-key-all" >&2
  echo "===============================================================================" >&2
  echo "" >&2
fi

nth=0
for (( n = 0; n < ${#PENDING[@]}; n++ )); do
  i="${PENDING[$n]}"
  nth=$(( n + 1 ))
  slug="${R_SLUG[$i]}"; url="${R_URL[$i]}"; dest="${R_DEST[$i]}"; key="${R_KEY[$i]}"
  clone_ssh="${R_SSH[$i]}"

  echo "::aiw-git-key-required::${slug}" >&2
  echo "" >&2
  # Not "could not clone" a second time: pass 1 already said that, verbatim, for
  # every repository it could not reach. This block says what to do about it.
  echo "--- Repository ${nth} of ${#PENDING[@]}: ${url}" >&2
  echo "  ${R_ERROR[$i]}" >&2
  echo "" >&2
  echo "Add this public key as a deploy key:" >&2
  echo "" >&2
  sed -e 's/^/    /' "${key}.pub" >&2 2>/dev/null || echo "    (missing ${key}.pub)" >&2
  echo "" >&2
  # Computed, not assembled by hand: the host and path are already in the
  # declaration. Review point 3 of #9.
  echo "  https://${R_HOST[$i]}/${R_PATH[$i]}/settings/keys/new" >&2
  if [[ "${R_ACCESS[$i]}" == "write" ]]; then
    # The checkbox is off by default, and a key added without it clones fine and
    # fails on push much later, inside an agent session. Review point 4.
    echo "" >&2
    echo "  This repository is declared with write access, so tick" >&2
    # No asterisks: this is a terminal log, and the operator saw the markdown
    # rather than the emphasis -- reported 2026-09-17 from the running dashboard.
    echo "  \"Allow write access\" on that form. Without it the clone works" >&2
    echo "  and the first push fails, in an agent session, much later." >&2
  fi
  echo "" >&2
  echo "$(lu_skip_hint "git-key-${slug}")" >&2
  echo "-------------------------------------------------------------------------------" >&2
  echo "" >&2

  # `|| _wait_rc=$?` and not a bare call: the helper returns 1 for a skip and 2
  # for the deadline, and a bare command with a non-zero status ends the script
  # under `set -e`.
  _wait_rc=0
  LU_SKIP_GROUP=git-key-all lu_wait_for_operator "git-key-${slug}" 5 \
    env GIT_SSH_COMMAND="$clone_ssh" git clone --quiet "$url" "$dest" || _wait_rc=$?
  case $_wait_rc in
    0) R_CLONED[$i]=true
       R_ERROR[$i]=""
       echo "Cloned ${url} into ${dest}" ;;
    1) rm -rf "$dest"
       echo "Warning: ${url} was skipped; it is not cloned." >&2 ;;
    *) rm -rf "$dest"
       echo "Warning: ${url} was not cloned: the deploy key is still not registered." >&2
       echo "  The start continues; register it and start again." >&2 ;;
  esac
  echo "::aiw-git-key-done::${slug}" >&2
done

# --- Pass 3: configure what was cloned, and record every repository ----------
for (( i = 0; i < ${#R_SLUG[@]}; i++ )); do
  name="${R_NAME[$i]}"; url="${R_URL[$i]}"; host="${R_HOST[$i]}"; path="${R_PATH[$i]}"
  access="${R_ACCESS[$i]}"; policy="${R_POLICY[$i]}"; slug="${R_SLUG[$i]}"; dir="${R_DIR[$i]}"
  mount_key="${R_MOUNTKEY[$i]}"; dest="${R_DEST[$i]}"
  cloned="${R_CLONED[$i]}"; error="${R_ERROR[$i]}"

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
done

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
