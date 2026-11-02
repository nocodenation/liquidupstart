# shellcheck shell=bash
# Shared helpers for the privacy proxy's routing mode. Sourced, never run.
#
# What it is for
#   PRIVACY_PROXY_ROUTING decides whether the privacy providers are an extra choice beside every
#   other model provider ("opt-in") or the only cloud route the AI agents get ("only"). Several
#   start steps need the same answer: scripts/linux/start.sh, to stop on an unknown value and to
#   add the compose override that withholds keys and logins from the agents; and
#   config/scripts/start/openclaw.sh, to offer only the privacy and local providers and to set
#   stored sign-ins aside. Keeping the reading in one place means they cannot disagree.
#
# Functions
#   env_value FILE KEY            the value of KEY in FILE
#   privacy_routing_mode FILE     off | opt-in | only, or an error for an unknown value
#   openclaw_login_paths          the OpenClaw state paths that hold stored sign-ins
#   withhold_openclaw_logins      move those paths out of the state directory
#   restore_openclaw_logins       move them back
#
# Requires bash and components.sh beside it; no Docker call, no network.

# The switch itself is read by components.sh's rule, as the build, the start and the dashboard
# read it, so the routing check cannot call the proxy off while the start runs it (CS-FR16).
# shellcheck source=components.sh
. "$(dirname "${BASH_SOURCE[0]}")/components.sh"

# env_value FILE KEY
#   Print the value of the first `KEY=` line of FILE, with quotes removed, a trailing
#   ` # comment` dropped and surrounding blanks trimmed. Prints nothing when the key is absent.
#   Returns 0 in every case, so that it is safe under `set -euo pipefail`.
env_value() {
  local value
  value="$(grep -E "^${2}=" "$1" 2>/dev/null | head -n1 | cut -d'=' -f2- || true)"
  # An inline comment needs a blank before the `#`, as in .env.example's own lines.
  value="${value%%[[:space:]]#*}"
  value="$(tr -d "'\"" <<< "${value}")"
  # Trim leading and trailing blanks.
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

# privacy_routing_mode FILE
#   Print the routing mode the .env FILE asks for:
#     off     PRIVACY_PROXY_ENABLE is not 1, so PRIVACY_PROXY_ROUTING is not read at all;
#     opt-in  the switch is on and the routing key is opt-in, empty or absent;
#     only    the switch is on and the routing key is only.
#   Any other routing value, with the switch on, prints an error naming the key and the allowed
#   values on stderr (with the dashboard's ::aiw-error:: marker) and returns 1. A typo must stop
#   the start rather than fall back to opt-in, which would re-open the direct routes.
privacy_routing_mode() {
  local routing
  if ! lu_privacy_proxy_on "$1"; then
    echo off
    return 0
  fi
  routing="$(env_value "$1" PRIVACY_PROXY_ROUTING)"
  case "${routing}" in
    ""|opt-in) echo opt-in ;;
    only) echo only ;;
    *)
      echo "Error: PRIVACY_PROXY_ROUTING=${routing} in .env is not a routing mode; use opt-in or only." >&2
      echo "::aiw-error::PRIVACY_PROXY_ROUTING must be opt-in or only, not '${routing}'. Fix it in the Privacy Proxy settings and start again." >&2
      return 1
      ;;
  esac
}

# openclaw_login_paths STATE_DIR
#   Print, one per line and relative to STATE_DIR, every existing path where OpenClaw keeps a
#   stored sign-in: the OAuth directory `credentials/`, and each agent's `auth-profiles.json`,
#   `auth-state.json` and `auth.json` under `agents/<id>/agent/`. Prints nothing when there is none.
openclaw_login_paths() {
  local state="$1" path
  [[ -d "${state}/credentials" ]] && echo "credentials"
  for path in "${state}"/agents/*/agent/auth-profiles.json \
              "${state}"/agents/*/agent/auth-state.json \
              "${state}"/agents/*/agent/auth.json; do
    [[ -e "${path}" ]] && echo "${path#"${state}/"}"
  done
  return 0
}

# withhold_openclaw_logins STATE_DIR WITHHELD_DIR
#   Move every path openclaw_login_paths lists from STATE_DIR into WITHHELD_DIR, keeping its
#   relative path, so that no container that mounts STATE_DIR can read a stored sign-in. A path
#   already withheld by an earlier start is left where it is; the newer copy in STATE_DIR is then
#   removed, since it was made while the sign-ins were withheld. Prints one line per path moved.
#   WITHHELD_DIR must not be mounted into any container.
withhold_openclaw_logins() {
  local state="$1" withheld="$2" rel
  while IFS= read -r rel; do
    [[ -n "${rel}" ]] || continue
    if [[ -e "${withheld}/${rel}" ]]; then
      rm -rf "${state:?}/${rel}"
      continue
    fi
    mkdir -p "$(dirname "${withheld}/${rel}")"
    mv "${state}/${rel}" "${withheld}/${rel}"
    echo "  set aside stored sign-in: ${rel}"
  done < <(openclaw_login_paths "${state}")
  chmod 700 "${withheld}" 2>/dev/null || true
}

# restore_openclaw_logins STATE_DIR WITHHELD_DIR
#   Move every path withhold_openclaw_logins set aside back into STATE_DIR, replacing what was
#   made there in the meantime, and remove WITHHELD_DIR once it is empty. Does nothing when
#   WITHHELD_DIR does not exist. Prints one line per path restored.
restore_openclaw_logins() {
  local state="$1" withheld="$2" rel
  [[ -d "${withheld}" ]] || return 0
  while IFS= read -r rel; do
    [[ -n "${rel}" ]] || continue
    rm -rf "${state:?}/${rel}"
    mkdir -p "$(dirname "${state}/${rel}")"
    mv "${withheld}/${rel}" "${state}/${rel}"
    echo "  restored stored sign-in: ${rel}"
  done < <(openclaw_login_paths "${withheld}")
  # Leave nothing behind but empty directories, then remove them.
  find "${withheld}" -depth -type d -empty -delete 2>/dev/null || true
}
