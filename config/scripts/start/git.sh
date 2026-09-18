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

# Seeded from github.com, and only when something is declared. Both halves are
# finding 4 of the #9 review: this ran before the declaration was read and
# `exit 1`ed when the network was unavailable, which under `set -e` ended
# start.sh -- 120 lines after down.sh had stopped the stack. A fresh, offline
# installation therefore lost its whole stack over a section of .env it had
# never filled in, against .env.example's promise that nothing in the git
# section is needed to get started.
#
# It returns a reason instead of exiting. The refusals stay refusals: what
# cannot be verified is not written, and what is not written means no clone is
# attempted, because StrictHostKeyChecking=yes could then only fail.
seed_known_hosts() {  # prints the reason and returns 1
  [[ -f "$KNOWN_HOSTS" ]] && return 0
  local scanned published fp
  scanned="$(mktemp)"
  if ! ssh-keyscan -T 20 github.com 2>/dev/null > "$scanned" || [[ ! -s "$scanned" ]]; then
    rm -f "$scanned"
    printf '%s' "could not reach github.com to seed known_hosts"
    return 1
  fi
  published="$(curl -s --max-time 20 https://api.github.com/meta \
    | grep -oE '"SHA256_[A-Z0-9]+": *"[^"]+"' \
    | sed -E 's/.*: *"/SHA256:/; s/"$//' || true)"
  if [[ -z "$published" ]]; then
    rm -f "$scanned"
    printf '%s' "could not fetch GitHub's published host key fingerprints"
    return 1
  fi
  while read -r _ fp _; do
    [[ -n "$fp" ]] || continue
    if ! grep -qxF "$fp" <<<"$published"; then
      rm -f "$scanned"
      printf '%s' "github.com offered host key ${fp}, which GitHub does not publish"
      return 1
    fi
  done < <(ssh-keygen -l -f "$scanned")
  mv "$scanned" "$KNOWN_HOSTS"
  chmod 644 "$KNOWN_HOSTS"
  echo "Seeded known_hosts with verified github.com host keys"
  return 0
}

json_escape() {
  printf '%s' "$1" | tr -d '\n\r\t' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

PARSED="$(lu_git_parse "$DECLARATION")"
lu_git_keys "$SECRETS_DIR" "$DECLARATION" >/dev/null

# Only now, with the declaration read, and only when a github.com repository is
# among what was declared: a stack that declares nothing -- or nothing on GitHub
# -- has no use for GitHub's host keys and must not be stopped by their absence.
SEED_ERROR=""
if printf '%s\n' "$PARSED" | awk -F'\t' '$3 == "github.com" { found = 1 } END { exit !found }'; then
  if ! SEED_ERROR="$(seed_known_hosts)"; then
    echo "Warning: ${SEED_ERROR}" >&2
  else
    SEED_ERROR=""
  fi
fi

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
R_KEY=(); R_MOUNTKEY=(); R_DEST=(); R_CLONED=(); R_ERROR=(); R_SSH=(); R_ASKKEY=()

# One repository out of the whole declaration, for the dashboard's Test button.
# It passes every declared entry so that the folder rule sees the same names a
# full start sees, and names the one to act on here. Finding 1 of the #9 review.
ONLY_SLUG="${GIT_ONLY_SLUG:-}"

# One run prepares one repository at a time.
#
# `git clone` creates dest/.git and writes the remote into it within 20ms, long
# before it knows whether the remote will answer. A start that is waiting for a
# deploy key retries that clone every five seconds -- so a dashboard Test landing
# inside one of those windows found a .git whose origin matched and adopted it.
# On 2026-09-18 the card told the operator a repository that does not exist was
# reachable. Nothing on disk, nothing in the manifest, and the message was wrong
# in the one direction that matters.
#
# It cannot be settled by looking harder: a clone in flight and a finished clone
# of an *empty* repository are the same thing on disk -- a repository with a
# remote and no commits. So the two runs are kept apart instead.
#
# mkdir, because it is the atomic primitive every filesystem has. The pid goes
# inside, so a lock whose process is gone can be told from one that is held: a
# run killed between mkdir and its trap must not seal the repository forever.
LOCKS_DIR="${SECRETS_DIR}/locks"
mkdir -p "$LOCKS_DIR"
HELD=()

release_locks() {
  local d
  for d in ${HELD[@]+"${HELD[@]}"}; do
    rm -rf "$d"
  done
}
trap release_locks EXIT

lu_take_lock() {  # lu_take_lock <slug>; 0 when this run may work on it
  local dir="${LOCKS_DIR}/$1" holder
  if mkdir "$dir" 2>/dev/null; then
    printf '%s' "$$" > "${dir}/pid"
    HELD+=("$dir")
    return 0
  fi
  holder="$(cat "${dir}/pid" 2>/dev/null || true)"
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    return 1
  fi
  # Nobody is behind it: take it over rather than leaving the repository sealed.
  rm -rf "$dir"
  if mkdir "$dir" 2>/dev/null; then
    printf '%s' "$$" > "${dir}/pid"
    HELD+=("$dir")
    return 0
  fi
  return 1
}

# --- Pass 1: try every clone, and remember what failed ----------------------
while IFS=$'\t' read -r name url host path access policy slug dir; do
  [[ -n "${slug:-}" ]] || continue
  [[ -z "$ONLY_SLUG" || "$slug" == "$ONLY_SLUG" ]] || continue
  key="${SECRETS_DIR}/repos/${slug}/id_ed25519"
  mount_key="${SECRETS_MOUNT}/repos/${slug}/id_ed25519"
  dest="${REPOS_DIR}/${dir}"
  cloned=false
  error=""
  askkey=false
  # Decided once per repository and carried into the second pass: the retry after
  # a key is registered must use the same isolation as the first attempt, and a
  # second copy of these options is a second thing to keep in step. A3c-8 counts
  # them for exactly that reason.
  clone_ssh="ssh -F /dev/null -i ${key} -o IdentitiesOnly=yes -o IdentityAgent=none -o UserKnownHostsFile=${KNOWN_HOSTS} -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o BatchMode=yes"

  # What is already at the destination decides, and only the last branch may
  # delete anything. Both halves were found by review on 2026-09-16:
  #
  #   -d "${dest}/.git" missed a worktree, whose .git is a *file*, and missed a
  #   directory that is not a clone at all. Either made `git clone` fail with
  #   "destination path already exists", and the failure branch then ran
  #   `rm -rf "$dest"` over work that existed before this start.
  #
  #   And any .git counted as the declared repository, so the declared key,
  #   access, policy and insteadOf were written into whatever clone was there.
  #   Rename a repository in the declaration and the old clone is adopted: every
  #   fetch and publish goes to the old remote with a key nobody registered
  #   there, while the manifest and the dashboard both say "cloned".
  if ! lu_take_lock "$slug"; then
    # Held by a start that is waiting, or by another Test. Saying so is the whole
    # point: the alternative was reading a half-written clone and reporting it.
    error="another run is preparing volumes/repos/${dir} right now; wait for it to finish, then try again"
    echo "Warning: ${error}" >&2
  elif [[ -e "${dest}/.git" ]]; then
    # --get, not `git remote get-url`: get-url applies insteadOf rewrites, and
    # this stack writes such a rewrite into every clone it adopts -- so get-url
    # would answer with the declared URL for a clone of something else, which is
    # precisely the case under test.
    origin="$(git -C "$dest" config --get remote.origin.url 2>/dev/null || true)"
    if [[ "$origin" == "$url" ]]; then
      cloned=true
    else
      error="volumes/repos/${dir} is a clone of ${origin:-nothing}, not ${url}; move it away, then start again"
      echo "Warning: ${error}" >&2
    fi
  elif [[ -e "$dest" ]]; then
    error="volumes/repos/${dir} already exists and is not a clone; move it away, then start again"
    echo "Warning: ${error}" >&2
  elif [[ -n "$SEED_ERROR" ]]; then
    # No verified host keys, so a clone could only fail on host key verification
    # -- a message that would send the operator after a deploy key, which is not
    # what is wrong.
    error="$SEED_ERROR"
  elif ! ssh-keygen -F "$host" -f "$KNOWN_HOSTS" >/dev/null 2>&1; then
    # The parser accepts any SSH host; this stack seeds host keys for github.com
    # only. A clone here could therefore only fail on host key verification -- a
    # message about a key, for a limit of this stack, which sent the operator to
    # a settings page that cannot help. Finding 5 of the #9 review.
    #
    # Asked of known_hosts rather than compared against the literal "github.com":
    # the answer is then read from the state that actually decides, so seeding a
    # second host is all it takes to support one, and this line cannot go stale
    # when that happens.
    error="only github.com host keys are trusted so far; ${host} cannot be cloned yet -- no host key for it is in known_hosts"
    echo "Warning: ${error}" >&2
  else
    if out="$(with_timeout 300 env GIT_SSH_COMMAND="$clone_ssh" git clone --quiet "$url" "$dest" 2>&1)"; then
      cloned=true
      echo "Cloned ${url} into ${dest}"
    else
      # Only here: this branch created the directory, so this branch may remove
      # it. git leaves the partial checkout in place when a clone fails.
      rm -rf "$dest"
      error="$(printf '%s' "$out" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
      error="${error:-clone failed}"
      # The original wording, kept verbatim: A8-19 and A3c-7 were signed off
      # against it, and rewriting another milestone's assertion so that my own
      # text passes would empty the assertion of its worth.
      echo "Warning: could not clone ${url}: ${error}" >&2
      # The only failure a deploy key can mend, and therefore the only one that
      # may stop the start to ask for one.
      askkey=true
    fi
  fi

  R_NAME+=("$name"); R_URL+=("$url"); R_HOST+=("$host"); R_PATH+=("$path")
  R_ACCESS+=("$access"); R_POLICY+=("$policy"); R_SLUG+=("$slug"); R_DIR+=("$dir")
  R_KEY+=("$key"); R_MOUNTKEY+=("$mount_key"); R_DEST+=("$dest")
  R_CLONED+=("$cloned"); R_ERROR+=("$error"); R_SSH+=("$clone_ssh"); R_ASKKEY+=("$askkey")
done <<< "$PARSED"

# Written twice: once here, once when the waits are over. Everything the
# dashboard's repository card renders is decided by the end of pass 1 -- every
# clone has been attempted -- and writing the manifest only at the end left the
# card describing the *previous* start while this one was waiting. The operator
# saw it on 2026-09-17: the panel said "Add a deploy key to continue -- 1 of 2"
# and the card below it said "1 of 4 prepared repositories could not be reached
# ... Start the stack so it gets one", during that start. Neither was wrong; they
# were two moments in one screen.
lu_write_manifest() {
  ENTRIES=""
  local i name url host path access policy slug dir mount_key cloned error entry
  for (( i = 0; i < ${#R_SLUG[@]}; i++ )); do
    name="${R_NAME[$i]}"; url="${R_URL[$i]}"; host="${R_HOST[$i]}"; path="${R_PATH[$i]}"
    access="${R_ACCESS[$i]}"; policy="${R_POLICY[$i]}"; slug="${R_SLUG[$i]}"; dir="${R_DIR[$i]}"
    mount_key="${R_MOUNTKEY[$i]}"
    cloned="${R_CLONED[$i]}"; error="${R_ERROR[$i]}"
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

  {
    printf '{\n  "generated": "%s",\n  "repositories": [\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [[ -n "$ENTRIES" ]] && printf '%s\n' "$ENTRIES"
    printf '  ]\n}\n'
  } > "$MANIFEST"
  chmod 644 "$MANIFEST"
}

# The provisional record: what pass 1 decided, before anyone waits. Not during a
# dashboard Test, though -- there the arrays hold the one repository named by
# GIT_ONLY_SLUG, so this write would put a one-entry manifest on disk for the
# length of the Test. `git-repo-info` in the containers would then answer "not
# declared in this stack" for every other repository, and the card would list
# them as having no deploy key. The Test's own entry reaches the manifest through
# the dashboard, which merges it into the one it read first. Finding 1 of the
# 2026-09-18 follow-up, and a regression this write introduced the day before.
[[ -n "$ONLY_SLUG" ]] || lu_write_manifest

# --- Pass 2: ask for the keys that are missing, all of them known up front ---
# The count guards below are not decoration: bash 3.2 (what macOS ships) treats
# the expansion of an empty array under `set -u` as an unbound variable, and a
# stack that declares no repository has exactly that.
# Only the repositories a deploy key would actually help. A destination that is
# occupied, a clone of another repository, a host whose keys are not trusted --
# none of those is mended by registering a key, so none of them stops the start
# to ask for one.
#
# And none at all during a dashboard Test. The Test *is* the retry: an operator
# is in front of it, waiting for it to answer. Waiting for that operator to
# register a key while they wait for the answer is a deadlock, and the dashboard
# put a seven-minute timer on it -- so the answer was "did not finish within
# seven minutes" for a repository whose key is simply not registered, which is
# the one thing the Test exists to report. Finding 2 of the 2026-09-18 follow-up.
PENDING=()
if [[ -z "$ONLY_SLUG" ]]; then
  for (( i = 0; i < ${#R_SLUG[@]}; i++ )); do
    [[ "${R_ASKKEY[$i]}" == true ]] && PENDING+=("$i")
  done
fi

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
done

for existing in "$REPOS_DIR"/*/; do
  [[ -d "${existing}.git" ]] || continue
  git -C "$existing" config core.hooksPath "$HOOKS_MOUNT"
done

# The record that counts: a key registered during the wait, or a skip, has had
# its say by now.
lu_write_manifest
