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

"${PROJECT_DIR}/scripts/linux/down.sh"

# --- Pre-flight: the host ports the proxy publishes must be free -------------
# If SYSTEM_HTTP_PORT / SYSTEM_HTTPS_PORT are taken, `docker compose up` leaves
# a half-started stack. Probe each via a throwaway container: the bind happens
# on the real host, so this works from inside the toolbox container too. Our
# proxy was just stopped by down.sh, so a conflict here is some other process.
HTTP_PORT="$(grep -E '^SYSTEM_HTTP_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTP_PORT="${HTTP_PORT:-8888}"
HTTPS_PORT="$(grep -E '^SYSTEM_HTTPS_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
HTTPS_PORT="${HTTPS_PORT:-8833}"

LOCAL_LLM_API_BASE="$(grep -E '^LOCAL_LLM_API_BASE=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' || true)"
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
"${PROJECT_DIR}/config/scripts/start/nextcloud.sh"
"${PROJECT_DIR}/config/scripts/start/nginx.sh"
"${PROJECT_DIR}/config/scripts/start/liquid.sh"
# hermes disabled: not started
# "${PROJECT_DIR}/config/scripts/start/hermes.sh"
"${PROJECT_DIR}/config/scripts/start/openclaw.sh"


docker network inspect nocodenation_playground_network_${HTTP_PORT} >/dev/null 2>&1 \
  || docker network create nocodenation_playground_network_${HTTP_PORT}

PRIVACY_PROXY_ENABLE="$(grep -E '^PRIVACY_PROXY_ENABLE=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true)"
if [[ "${PRIVACY_PROXY_ENABLE:-0}" = 1 ]]; then
  PP_PORT="$(grep -E '^PRIVACY_PROXY_PORT=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"")"
  PP_PORT="${PP_PORT:-8080}"
  export COMPOSE_PROFILES="${COMPOSE_PROFILES:+${COMPOSE_PROFILES},}privacy-proxy"
  export PRIVACY_PROXY_URL="http://privacy-proxy:${PP_PORT}"
fi

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

PGADMIN_DEFAULT_EMAIL="$(grep -E '^PGADMIN_DEFAULT_EMAIL=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
LIQUID_USERNAME="$(grep -E '^LIQUID_USERNAME=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
LIQUID_PASSWORD="$(grep -E '^LIQUID_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"
# hermes disabled: HERMES_API_KEY="$(grep -E '^HERMES_API_KEY=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"')"

# Colors only when stdout is a terminal (stays plain when piped/redirected).
if [[ -t 1 ]]; then
  HDR=$'\033[1;32m'   # bold green  - section headers
  SVC=$'\033[1m'      # bold        - service names
  URL=$'\033[36m'     # cyan        - URLs
  CRED=$'\033[1;33m'  # bold yellow - passwords/tokens
  DIM=$'\033[2m'      # dim         - secondary info
  RST=$'\033[0m'
else
  HDR='' SVC='' URL='' CRED='' DIM='' RST=''
fi

url_line() { printf "  ${SVC}%-13s${RST} ${URL}%s${RST}\n" "$1" "$2"; }

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
[[ "${PRIVACY_PROXY_ENABLE:-0}" = 1 ]] && \
  url_line "Privacy settings" "http://privacy.localhost:${HTTP_PORT}/policy/ui"
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

_copilot_reauth() {
  echo "  ${CRED}GitHub Copilot: $1.${RST}"
  local cmd="docker exec -it openclaw-gateway openclaw infer model auth login --provider github-copilot"
  if [[ -t 0 ]]; then
    read -r -p "  Authorize GitHub Copilot now? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] && eval "$cmd"
  else
    echo "  ${DIM}To authorize, run:${RST} ${URL}${cmd}${RST}"
  fi
}

check_copilot_auth() {
  local enabled probe i=0
  enabled="$(grep -E '^ENABLE_GITHUB_COPILOT=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"")"
  [[ "${enabled:-0}" == "1" ]] || return 0
  while ! docker exec openclaw-gateway true 2>/dev/null && [ "$i" -lt 30 ]; do i=$((i+1)); sleep 1; done
  probe="$(docker exec -i openclaw-gateway node 2>/dev/null <<'NODE'
const db=require('node:sqlite'),fs=require('fs'),cp=require('child_process');
const base='/home/node/.openclaw/agents';
let tok=null;
try{for(const a of fs.readdirSync(base)){
  const p=base+'/'+a+'/agent/openclaw-agent.sqlite';
  if(!fs.existsSync(p))continue;
  const d=new db.DatabaseSync(p,{readOnly:true});
  for(const r of d.prepare('select * from auth_profile_store').all()){
    const m=JSON.stringify(r).match(/ghu_[A-Za-z0-9]+/);if(m){tok=m[0];break}
  }
  if(tok)break;
}}catch(e){}
if(!tok){console.log('none');process.exit(0)}
try{
  const out=cp.execSync("curl -s -m 10 -o /dev/null -w '%{http_code}' -H 'authorization: token "+tok+"' https://api.github.com/copilot_internal/v2/token").toString().trim();
  console.log(out==='200'?'valid':'invalid');
}catch(e){console.log('unknown')}
NODE
)"
  echo "${HDR}=== GitHub Copilot ===============================================${RST}"
  case "${probe:-unknown}" in
    valid)   echo "  ${SVC}GitHub Copilot:${RST} authorized" ;;
    none)    _copilot_reauth "no saved login found" ;;
    invalid) _copilot_reauth "saved token expired or revoked" ;;
    *)       echo "  ${DIM}GitHub Copilot: auth check skipped (openclaw-gateway or GitHub unreachable)${RST}" ;;
  esac
  echo ""
}

check_copilot_auth
