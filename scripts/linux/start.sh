#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"
ENV_FILE="${PROJECT_DIR}/.env"
NGINX_TEMPLATES_DIR="${PROJECT_DIR}/config/nginx/templates"
NGINX_OUTPUT_DIR="${PROJECT_DIR}/config/nginx"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

"${PROJECT_DIR}/config/scripts/start/git.sh" "${PROJECT_DIR}" --check-declaration

# One reader for .env, tolerant and quote-agnostic. Two failures it removes:
# a key that is absent makes grep exit 1, pipefail passes it through and set -e
# ends the start without a word, after down.sh has already emptied the stack; and
# `tr -d '"'` left single quotes in place, which compose accepts and this script
# then carried into a network name. openclaw.sh has had this shape all along, and
# the two scripts now agree because they derive the same network name.
get_env() {
  grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d "'\"" || true
}

HTTP_PORT="$(get_env SYSTEM_HTTP_PORT)"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="$(get_env SYSTEM_HTTPS_PORT)"
HTTPS_PORT="${HTTPS_PORT:-8833}"

# --- Pre-flight: the pinned network range has to be available ----------------
# Before down.sh, not after. A range that is already taken ends this script, and
# by then down.sh has emptied the stack -- which is how the previous version of
# this block failed: it created the network at line 191 with no error handling.
#
# main's start script creates nocodenation_playground_network_<port> with no
# --subnet, so docker hands it the first free range: 172.18.0.0/16 on an ordinary
# host, which is exactly what this stack pinned until 2026-09-14. Nothing joins
# that network and nothing removes it, so every host that ever ran main kept a
# collision lying in wait.
# Remove main's leftover when nothing is attached to it. Nothing joins it: it is
# created under a name no service in this compose file references.
lu_drop_legacy_network() {  # lu_drop_legacy_network <name>
  docker network inspect "$1" >/dev/null 2>&1 || return 0
  [[ "$(docker network inspect "$1" --format '{{len .Containers}}' 2>/dev/null)" == "0" ]] || return 0
  echo "Removing $1: main's start script left it behind and nothing is attached."
  docker network rm "$1" >/dev/null 2>&1 || true
}

# Ask docker whether the range is free instead of reimplementing its pool
# arithmetic: create a throwaway network on it, then remove it again. Skipped
# when the stack's own network already holds exactly that range -- the ordinary
# case, which would otherwise be reported as overlapping with itself.
lu_require_free_subnet() {  # lu_require_free_subnet <own-network> <cidr>
  local own="$1" cidr="$2" have probe err
  have="$(docker network inspect "$own" --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}' 2>/dev/null | awk '{print $1}')"
  [[ "$have" == "$cidr" ]] && return 0
  probe="lu-subnet-probe-$$-${RANDOM}"
  if ! err="$(docker network create --subnet "$cidr" "$probe" 2>&1)"; then
    echo "Error: the network range ${cidr} is not available on this host." >&2
    echo "  docker: ${err}" >&2
    echo "  Something else holds it: another project, a VPN, or a network an earlier" >&2
    echo "  version of this stack left behind. Nothing has been stopped -- the stack" >&2
    echo "  is as it was." >&2
    echo "  Pick a free range for SYSTEM_NETWORK_SUBNET in .env, for example:" >&2
    echo "    SYSTEM_NETWORK_SUBNET=10.99.1.0/24" >&2
    echo "  'docker network ls' and 'docker network inspect <name>' show what is taken." >&2
    return 1
  fi
  docker network rm "$probe" >/dev/null 2>&1 || true
  return 0
}

LU_NETWORK="nocodenation_liquid_upstart_network_${HTTP_PORT}"
LU_SUBNET_CIDR="$(get_env SYSTEM_NETWORK_SUBNET)"
LU_SUBNET_CIDR="${LU_SUBNET_CIDR:-10.99.0.0/24}"
LU_PROXY_IP="$(get_env SYSTEM_PROXY_IP)"
LU_PROXY_IP="${LU_PROXY_IP:-10.99.0.2}"

# The proxy takes a fixed address so the gateway can name it in trustedProxies.
# Two keys that have to agree: compose refuses an ipv4_address outside the
# network's subnet, and it refuses it at `up`, long after down.sh has emptied the
# stack -- with a message that names neither key. Checked here instead, before
# anything is stopped.
#
# Arithmetic rather than bit operations: macOS awk has no and()/compl().
lu_ip_in_cidr() {  # lu_ip_in_cidr <ip> <cidr>
  awk -v ip="$1" -v cidr="$2" '
    function toint(a,  p) { split(a, p, "."); return p[1]*16777216 + p[2]*65536 + p[3]*256 + p[4] }
    BEGIN {
      split(cidr, c, "/")
      bits = c[2] + 0
      if (bits < 0 || bits > 32) exit 1
      size = 2 ^ (32 - bits)
      base = int(toint(c[1]) / size) * size
      v = toint(ip)
      exit (v >= base && v < base + size) ? 0 : 1
    }'
}

LU_NETWORK_POOL="$(get_env SYSTEM_NETWORK_POOL)"
LU_NETWORK_POOL="${LU_NETWORK_POOL:-10.99.0.128/25}"

# Inside the pool docker allocates by itself, so a pinned address there is a
# collision waiting for the right start order -- and the proxy starts last,
# because everything else is its dependency.
if lu_ip_in_cidr "$LU_PROXY_IP" "$LU_NETWORK_POOL"; then
  echo "Error: SYSTEM_PROXY_IP ${LU_PROXY_IP} is inside SYSTEM_NETWORK_POOL ${LU_NETWORK_POOL}." >&2
  echo "  That range is what docker hands out on its own; an address pinned there" >&2
  echo "  is taken by whichever container starts first, and the proxy starts last." >&2
  echo "  Measured 2026-09-16: 'Address already in use', with eurooffice holding it." >&2
  echo "  Pick an address outside the pool -- for ${LU_SUBNET_CIDR} with the default" >&2
  echo "  pool, anything from .2 to .127. Nothing has been stopped." >&2
  exit 1
fi

if ! lu_ip_in_cidr "$LU_PROXY_IP" "$LU_SUBNET_CIDR"; then
  echo "Error: SYSTEM_PROXY_IP ${LU_PROXY_IP} is not inside SYSTEM_NETWORK_SUBNET ${LU_SUBNET_CIDR}." >&2
  echo "  The proxy takes that address on the stack network, and the OpenClaw gateway" >&2
  echo "  trusts exactly it; the two keys have to agree or nothing starts." >&2
  echo "  Change one of them in .env so the address falls inside the range -- for" >&2
  echo "  ${LU_SUBNET_CIDR}, the first address docker leaves free is the .2." >&2
  echo "  Nothing has been stopped; the stack is as it was." >&2
  exit 1
fi

lu_drop_legacy_network "nocodenation_playground_network_${HTTP_PORT}"
lu_require_free_subnet "$LU_NETWORK" "$LU_SUBNET_CIDR" || exit 1

"${PROJECT_DIR}/scripts/linux/down.sh"

# --- Pre-flight: the host ports the proxy publishes must be free -------------
# If SYSTEM_HTTP_PORT / SYSTEM_HTTPS_PORT are taken, `docker compose up` leaves
# a half-started stack. Probe each via a throwaway container: the bind happens
# on the real host, so this works from inside the toolbox container too. Our
# proxy was just stopped by down.sh, so a conflict here is some other process.
LOCAL_LLM_API_BASE="$(get_env LOCAL_LLM_API_BASE)"
LOCAL_LLM_HOST="${LOCAL_LLM_API_BASE#*://}"
LOCAL_LLM_HOST="${LOCAL_LLM_HOST%%[:/]*}"
export LOCAL_LLM_HOST="${LOCAL_LLM_HOST:-local_llm}"
PROBE_IMAGE=""
for _img in nginx:latest liquidupstart/liquid:latest liquidupstart/openclaw:latest \
            liquidupstart/bun-runner:latest liquidupstart/opencode:latest \
            liquidupstart/toolbox:latest; do
  if docker image inspect "$_img" >/dev/null 2>&1; then PROBE_IMAGE="$_img"; break; fi
done

port_owner() {
  local port="$1" line
  if command -v ss >/dev/null 2>&1; then
    line="$(ss -lptn "sport = :${port}" 2>/dev/null | tail -n +2 | head -1)"
    [[ -n "$line" ]] || { printf 'unknown'; return; }
    case "$line" in
      *users:*) printf '%s' "$line" \
        | sed -E 's/.*users:\(\("([^"]+)",pid=([0-9]+).*/\1 (pid \2), owned by you/' ;;
      *) printf 'a process owned by another user' ;;
    esac
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null \
      | awk 'NR==2 {print $1" (pid "$2"), owned by "$3; f=1} END {if (!f) print "unknown"}'
  else
    printf 'unknown'
  fi
}

host_port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -lnt "sport = :${port}" 2>/dev/null | tail -n +2 | grep -q .
  elif command -v lsof >/dev/null 2>&1 \
       && lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    return 0
  elif command -v netstat >/dev/null 2>&1; then
    # macOS/BSD netstat lists every listener regardless of owner.
    netstat -an -p tcp 2>/dev/null | grep -qE "[.:]${port}[[:space:]]+.*LISTEN"
  else
    return 1
  fi
}

port_probe_hint() {
  if command -v ss >/dev/null 2>&1; then
    printf "sudo ss -lptn 'sport = :%s'" "$1"
  else
    printf 'sudo lsof -nP -iTCP:%s -sTCP:LISTEN' "$1"
  fi
}

describe_port_conflict() {
  local pair port name owner
  for pair in "SYSTEM_HTTP_PORT:${HTTP_PORT}" "SYSTEM_HTTPS_PORT:${HTTPS_PORT}"; do
    port="${pair##*:}"; name="${pair%%:*}"
    host_port_busy "$port" || continue
    owner="$(port_owner "$port")"
    if [[ "$owner" == unknown ]]; then
      echo "  port ${port} (${name}) is already in use" >&2
    else
      echo "  port ${port} (${name}) is already in use — held by ${owner}" >&2
    fi
  done
  echo "" >&2
  echo "Docker here runs per user — rootless Docker on Linux, a per-user VM (Docker Desktop" >&2
  echo "or Colima) on macOS — so another user's stack holding these ports will NOT show up" >&2
  echo "in your 'docker ps'. To see the owner across all users:" >&2
  echo "    $(port_probe_hint "${HTTP_PORT}")" >&2
}

port_taken() {
  # 0 = taken, 1 = free (or undeterminable — never block on that).
  local port="$1" out rc
  set +e
  out="$(docker run --rm --entrypoint true -p "${port}:1" "$PROBE_IMAGE" 2>&1)"
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    return 1
  elif printf '%s' "$out" | grep -qiE 'already allocated|address already in use|bind for|failed to (bind|set up)'; then
    return 0
  else
    return 1
  fi
}

if [[ -n "$PROBE_IMAGE" ]]; then
  _taken=""
  for _pair in "SYSTEM_HTTP_PORT:${HTTP_PORT}" "SYSTEM_HTTPS_PORT:${HTTPS_PORT}"; do
    if port_taken "${_pair##*:}"; then
      echo "Error: port ${_pair##*:} (${_pair%%:*}) is already in use on this machine." >&2
      _taken="${_taken:+${_taken}, }${_pair##*:} (${_pair%%:*})"
    fi
  done
  if [[ -n "$_taken" ]]; then
    describe_port_conflict
    echo "" >&2
    echo "Another program — or another user's copy of this stack — is holding the port(s)" >&2
    echo "above, so the services can't start. Stop whatever is using them and start again." >&2
    echo "These ports are fixed after the initial setup, so the stack must use them." >&2
    # ::aiw-error:: lines: the dashboard turns these into an on-screen error banner.
    echo "::aiw-error::Ports already in use: ${_taken}. Another program — or another user's copy of this stack — is holding them. Docker runs per user (rootless on Linux, a per-user VM on macOS), so another user's containers won't appear in your 'docker ps'; check with: $(port_probe_hint "${HTTP_PORT}"). Stop whatever is using those ports and start again; the ports are fixed after initial setup." >&2
    exit 1
  fi
fi
# ----------------------------------------------------------------------------

"${PROJECT_DIR}/config/scripts/start/generate_api_key.sh"
"${PROJECT_DIR}/config/scripts/start/pgadmin.sh"
"${PROJECT_DIR}/config/scripts/start/opencode.sh"
"${PROJECT_DIR}/config/scripts/start/git.sh"
"${PROJECT_DIR}/config/scripts/start/nextcloud.sh"
"${PROJECT_DIR}/config/scripts/start/nginx.sh"
"${PROJECT_DIR}/config/scripts/start/liquid.sh"
# hermes disabled: not started
# "${PROJECT_DIR}/config/scripts/start/hermes.sh"
# No network is created here any more. It existed only so openclaw.sh could read
# the subnet off the live network before compose brought it up; openclaw.sh reads
# SYSTEM_NETWORK_SUBNET from .env now, which is the same value compose declares as
# ipam, so compose can create the network at `up` like any other. That also
# removes the ordering dependency between this script and openclaw.sh.

"${PROJECT_DIR}/config/scripts/start/openclaw.sh"


echo "Starting containers..."
set +e
docker compose up -d
UP_RC=$?
set -e
if [[ $UP_RC -ne 0 ]]; then
  echo "" >&2
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx proxy \
     && { host_port_busy "$HTTP_PORT" || host_port_busy "$HTTPS_PORT"; }; then
    echo "Error: the proxy could not bind its host ports." >&2
    describe_port_conflict
    echo "::aiw-error::The proxy could not bind port ${HTTP_PORT}/${HTTPS_PORT} — they are already in use. Docker runs per user (rootless on Linux, a per-user VM on macOS), so another user's containers won't appear in your 'docker ps'; check with: $(port_probe_hint "${HTTP_PORT}")." >&2
  else
    echo "Error: 'docker compose up' failed — see the output above." >&2
    echo "::aiw-error::Starting the stack failed. See the log above for the failing service." >&2
  fi
  exit $UP_RC
fi

PGADMIN_DEFAULT_EMAIL="$(get_env PGADMIN_DEFAULT_EMAIL)"
LIQUID_USERNAME="$(get_env LIQUID_USERNAME)"
LIQUID_PASSWORD="$(get_env LIQUID_PASSWORD)"
# hermes disabled: HERMES_API_KEY="$(grep -E '^HERMES_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

# Colors only when stdout is a terminal (stays plain when piped/redirected).
if [[ -t 1 ]]; then
  HDR=$'\033[1;32m'   # bold green  - section headers
  SVC=$'\033[1m'      # bold        - service names
  URL=$'\033[36m'     # cyan        - URLs
  CRED=$'\033[1;33m'  # bold yellow - passwords/tokens
  DIM=$'\033[2m'      # dim         - secondary info
  WARN=$'\033[1;31m'  # bold red    - what did not come up
  RST=$'\033[0m'
else
  HDR='' SVC='' URL='' CRED='' DIM='' WARN='' RST=''
fi

url_line() { printf "  ${SVC}%-13s${RST} ${URL}%s${RST}\n" "$1" "$2"; }

unreachable_repositories() {
  local manifest="${PROJECT_DIR}/volumes/_git-secrets/repositories.json"
  [[ -f "$manifest" ]] || return 0
  awk -F'"' '
    /"host":/          { host = $4 }
    /"path":/          { path = $4 }
    /"publicKeyFile":/ { key  = $4 }
    /"error":/         { err = $4 }
    /"cloned": *false/ { bad = 1 }
    /^    \}/          { if (bad) printf "%s/%s\t%s\t%s\n", host, path, key, err; bad = 0; err = "" }
  ' "$manifest"
}

echo ""
echo "${HDR}=== Web interfaces = Storage =====================================${RST}"
url_line "NextCloud"   "http://nextcloud.localhost:${HTTP_PORT}"
url_line "pgAdmin"     "http://pgadmin.localhost:${HTTP_PORT}"
url_line "REST API"    "http://postgrest.localhost:${HTTP_PORT}"
url_line "Swagger UI"  "http://swagger.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Web interfaces = Applications ================================${RST}"
url_line "Liquid"        "https://liquid.localhost:${HTTPS_PORT}"
url_line "Node app"    "http://app.localhost:${HTTP_PORT}        - build an app using OpenClaw first"
url_line "OpenProject" "http://openproject.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Web interfaces = AI Harnesses ================================${RST}"
# hermes disabled: url_line "Hermes"      "http://hermes.localhost:${HTTP_PORT}"
url_line "OpenClaw"    "http://openclaw.localhost:${HTTP_PORT}   - recommended"
url_line "OpenCode"    "http://opencode.localhost:${HTTP_PORT}"
echo ""
echo "${HDR}=== Logins, passwords & tokens ===================================${RST}"
# hermes disabled: echo "  Hermes API/Webhooks token:  ${CRED}${HERMES_API_KEY}${RST}"
echo "  NextCloud admin password:   ${CRED}${PGADMIN_DEFAULT_EMAIL}${RST}"
echo "  Liquid username:              ${CRED}${LIQUID_USERNAME}${RST}"
echo "  Liquid password:              ${CRED}${LIQUID_PASSWORD}${RST}"
echo ""
echo "${HDR}=== Additional endpoints =========================================${RST}"
# hermes disabled: echo "  ${DIM}Hermes API:                 ${URL}http://api.hermes.localhost:${HTTP_PORT}${RST}"
# hermes disabled: echo "  ${DIM}Hermes webhooks:            ${URL}http://webhooks.hermes.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}Liquid ingresses: ports 8900-8999, served on https://PORT.liquid.localhost:${HTTPS_PORT}${RST}"
echo "  ${DIM}OpenClaw node bridge:       ${URL}http://bridge.openclaw.localhost:${HTTP_PORT}${RST}"
echo "  ${DIM}OpenClaw MS Teams endpoint: ${URL}http://msteams.openclaw.localhost:${HTTP_PORT}${RST}"
echo ""

ATTENTION="$(unreachable_repositories)"
if [[ -n "$ATTENTION" ]]; then
  echo "${WARN}=== Needs your attention =========================================${RST}"
  while IFS=$'\t' read -r label key err; do
    [[ -n "$label" ]] || continue
    echo "  ${WARN}${label} is not reachable${RST}"
    [[ -n "$err" ]] && echo "    ${DIM}${err}${RST}"
    echo "    Register ${URL}${key}${RST} as a deploy key, then test it on the dashboard."
  done <<< "$ATTENTION"
  echo ""
fi
