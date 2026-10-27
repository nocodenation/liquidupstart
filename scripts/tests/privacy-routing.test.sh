#!/usr/bin/env bash
# Tests for the privacy proxy's routing mode, PRIVACY_PROXY_ROUTING (opt-in | only).
#
# What it checks, one case per test case document
#   TC-821  privacy_routing_mode reads the mode only with the switch on, accepts opt-in and only
#           in the forms .env holds them, and rejects any other value with an error naming the key.
#   TC-822  start.sh stops with exit 1 on an unknown value before it stops the running stack, and
#           warns, without stopping, when only leaves the agents without a cloud model.
#   TC-823  in only, OpenClaw's stored sign-ins are moved out of its state directory and come back
#           unchanged on the next start in another mode; openclaw.json stays where it is.
#   TC-824  in only, the openclaw.json patch keeps the privacy and local providers and removes every
#           direct provider, picker entry, runtime and plugin an earlier start wrote; in opt-in it
#           leaves them.
#   TC-825  in only, openclaw.sh writes no provider key into config/openclaw/.env.
#   TC-826  with the only override, compose gives the agent containers no provider key, no Claude
#           login and no Claude session, while the privacy-proxy service keeps its keys and login.
#           Needs `docker compose`; skipped without it.
#
# How it works
#   The scripts resolve the project root from their own location, so each case copies what it
#   needs into a fresh `mktemp -d` tree and runs it there, with a stub `docker` first on PATH where
#   a script would call Docker. Nothing in the checkout is written. TC-824 runs the config writer,
#   extracted from openclaw.sh, with the host's node.
#
# Usage
#   bash scripts/tests/privacy-routing.test.sh     (from the liquidupstart root)
#
# Exit status
#   0 when every assertion holds; 1 at the first that does not, with its message on stderr.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LIB="config/scripts/start/lib/privacy-routing.sh"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "${TMP_ROOT}"' EXIT
SKIPPED=()

# fail MESSAGE
#   Print MESSAGE as a failed assertion and stop the test with status 1.
fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# new_tree
#   Create an empty project tree under TMP_ROOT holding the routing library, and print its path.
new_tree() {
  local tree
  tree="$(mktemp -d "${TMP_ROOT}/tree.XXXX")"
  mkdir -p "${tree}/config/scripts/start/lib"
  cp "${REPO_DIR}/${LIB}" "${tree}/${LIB}"
  echo "${tree}"
}

# stub_docker DIR
#   Put an executable `docker` into DIR that does nothing and succeeds, and record each call in
#   DIR/docker.log, so that a script under test runs without Docker. A call asking for a version
#   answers "OpenClaw 2026.9.1", the shape openclaw.sh reads from its image before it writes the
#   configuration.
stub_docker() {
  mkdir -p "$1"
  printf '#!/usr/bin/env bash\necho "$*" >> "%s/docker.log"\ncase " $* " in *" --version "*) echo "OpenClaw 2026.9.1";; esac\nexit 0\n' "$1" > "$1/docker"
  chmod +x "$1/docker"
}

# --- TC-821: reading the mode -------------------------------------------------
tree="$(new_tree)"
# shellcheck source=../../config/scripts/start/lib/privacy-routing.sh
. "${tree}/${LIB}"
env="${tree}/.env"
mode_of() { printf '%s\n' "$@" > "${env}"; privacy_routing_mode "${env}"; }
[[ "$(mode_of PRIVACY_PROXY_ENABLE=0 PRIVACY_PROXY_ROUTING=only)" == off ]] || fail "TC-821: switch off is not off"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=0 PRIVACY_PROXY_ROUTING=bogus)" == off ]] || fail "TC-821: routing read with the switch off"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=1)" == opt-in ]] || fail "TC-821: absent key is not opt-in"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=)" == opt-in ]] || fail "TC-821: empty key is not opt-in"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=opt-in)" == opt-in ]] || fail "TC-821: opt-in not read"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=only)" == only ]] || fail "TC-821: only not read"
[[ "$(mode_of 'PRIVACY_PROXY_ENABLE="1"' 'PRIVACY_PROXY_ROUTING="only"')" == only ]] || fail "TC-821: quoted values not read"
[[ "$(mode_of PRIVACY_PROXY_ENABLE=1 'PRIVACY_PROXY_ROUTING=only # opt-in | only')" == only ]] \
  || fail "TC-821: inline comment not dropped"
if err="$(mode_of PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=Only 2>&1 >/dev/null)"; then
  fail "TC-821: an unknown value was accepted"
fi
grep -q "PRIVACY_PROXY_ROUTING=Only" <<< "${err}" || fail "TC-821: the error does not name the key and value"
grep -q "opt-in or only" <<< "${err}" || fail "TC-821: the error does not name the allowed values"

# --- TC-822: start.sh stops early on an unknown value, warns on no cloud model -------
tree="$(new_tree)"
mkdir -p "${tree}/scripts/linux"
cp "${REPO_DIR}/scripts/linux/start.sh" "${tree}/scripts/linux/start.sh"
# The first step after the routing check is sourcing wait-for-operator.sh, ahead of the
# pre-flight checks and down.sh. A stand-in that leaves a marker and stops start.sh there:
# whatever start.sh does before it is what this case looks at, and the marker says the start
# went past the routing check -- which is what "stopped the stack" would need first.
mkdir -p "${tree}/config/scripts/start/lib"
printf 'touch "%s/down-ran"\nexit 7\n' "${tree}" > "${tree}/config/scripts/start/lib/wait-for-operator.sh"
printf '%s\n' PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=onyl > "${tree}/.env"
status=0; bash "${tree}/scripts/linux/start.sh" > /dev/null 2>&1 || status=$?
[[ "${status}" -eq 1 ]] || fail "TC-822: unknown value exited ${status}, not 1"
[[ ! -e "${tree}/down-ran" ]] || fail "TC-822: the stack was stopped before the unknown value was rejected"
printf '%s\n' PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=only OPENAI_API_KEY= ANTHROPIC_API_KEY= \
  ENABLE_ANTHROPIC_CLAUDE_CODE=0 > "${tree}/.env"
status=0; err="$(bash "${tree}/scripts/linux/start.sh" 2>&1 >/dev/null)" || status=$?
[[ "${status}" -eq 7 && -e "${tree}/down-ran" ]] || fail "TC-822: the warning stopped the start (exit ${status})"
grep -q "no cloud model" <<< "${err}" || fail "TC-822: no warning when only leaves no cloud model"
rm -f "${tree}/down-ran"
printf '%s\n' PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=only OPENAI_API_KEY=sk-x > "${tree}/.env"
err="$(bash "${tree}/scripts/linux/start.sh" 2>&1 >/dev/null || true)"
! grep -q "no cloud model" <<< "${err}" || fail "TC-822: warned although OPENAI_API_KEY is set"

# --- TC-823: stored sign-ins set aside and restored -------------------------------
tree="$(new_tree)"
. "${tree}/${LIB}"
state="${tree}/volumes/_openclaw"
withheld="${tree}/volumes/_openclaw-withheld-logins"
mkdir -p "${state}/credentials" "${state}/agents/main/agent" "${state}/agents/work/agent"
echo '{"github-copilot":"tok"}' > "${state}/credentials/oauth.json"
echo '{"profiles":{"openai-codex":{}}}' > "${state}/agents/main/agent/auth-profiles.json"
echo '{"xai":"state"}' > "${state}/agents/work/agent/auth-state.json"
echo '{"models":[]}' > "${state}/agents/main/agent/models.json"
echo '{"gateway":{}}' > "${state}/openclaw.json"
withhold_openclaw_logins "${state}" "${withheld}" > /dev/null
[[ -z "$(openclaw_login_paths "${state}")" ]] || fail "TC-823: a sign-in is still in the state directory"
[[ -f "${withheld}/credentials/oauth.json" && -f "${withheld}/agents/main/agent/auth-profiles.json" \
   && -f "${withheld}/agents/work/agent/auth-state.json" ]] || fail "TC-823: a sign-in was not set aside"
[[ -f "${state}/openclaw.json" && -f "${state}/agents/main/agent/models.json" ]] \
  || fail "TC-823: a file that holds no sign-in was moved"
# A second start in only: what OpenClaw wrote in the meantime goes, the set-aside copy stays.
echo '{"profiles":{}}' > "${state}/agents/main/agent/auth-profiles.json"
withhold_openclaw_logins "${state}" "${withheld}" > /dev/null
[[ ! -e "${state}/agents/main/agent/auth-profiles.json" ]] || fail "TC-823: a file made in only mode stayed readable"
grep -q openai-codex "${withheld}/agents/main/agent/auth-profiles.json" || fail "TC-823: the set-aside sign-in was replaced"
restore_openclaw_logins "${state}" "${withheld}" > /dev/null
grep -q openai-codex "${state}/agents/main/agent/auth-profiles.json" || fail "TC-823: the sign-in did not come back"
grep -q github-copilot "${state}/credentials/oauth.json" || fail "TC-823: the OAuth directory did not come back"
[[ ! -e "${withheld}" ]] || fail "TC-823: the set-aside directory was left behind"

# --- TC-824: the openclaw.json patch in only and in opt-in -------------------------
if command -v node > /dev/null; then
  # The writer is inline in openclaw.sh, as the body of the `-e '...'` argument that names
  # /state/openclaw.json; tests/lib/openclaw-writer.ts extracts it the same way.
  WRITER="${TMP_ROOT}/writer.js"
  awk '
    /^[[:space:]]*-e '"'"'[[:space:]]*$/ { body = ""; inside = 1; next }
    inside && /^[[:space:]]*'"'"'/ { if (body ~ /\/state\/openclaw\.json/) { printf "%s", body; exit } inside = 0; next }
    inside { body = body $0 "\n" }
  ' "${REPO_DIR}/config/scripts/start/openclaw.sh" > "${WRITER}"
  [[ -s "${WRITER}" ]] || fail "TC-824: the config writer was not found in openclaw.sh"
  stale='{"agents":{"defaults":{"model":{"primary":"anthropic/claude-opus-5"},"models":{
    "anthropic/*":{"agentRuntime":{"id":"claude-cli"}},"openai/*":{"agentRuntime":{"id":"codex"}},
    "github-copilot/*":{},"openrouter/x/y":{},"local/*":{},"privacy-openai/*":{}}}},
    "models":{"providers":{"claude-cli":{"models":[]},"openrouter":{},"local":{"models":[{"id":"m"}]},
    "privacy-openai":{"models":[{"id":"gpt-5"}]}}},
    "memory":{"search":{"provider":"github-copilot"}},
    "plugins":{"entries":{"codex":{"enabled":true},"xai":{"enabled":true}},"allow":["codex","xai","openai"]},
    "gateway":{}}'
  run_patch() {  # MODE -> prints the patched JSON
    local json="${TMP_ROOT}/openclaw.json"
    echo "${stale}" > "${json}"
    OPENCLAW_JSON="${json}" PRIVACY_ROUTING="$1" PLUGIN_PATHS=/p MODEL_WILDCARDS="local/*,privacy-openai/*" \
      OC_SCHEMA_NEW=1 OPENCLAW_VERSION=test LU_NETWORK_SUBNET=10.99.0.0/24 \
      node "${WRITER}" > /dev/null 2>&1
    cat "${json}"
  }
  only_json="$(run_patch only)"
  node -e '
    const c = JSON.parse(process.argv[1]);
    const fail = (m) => { console.error("FAIL: TC-824: " + m); process.exit(1); };
    const providers = Object.keys(c.models.providers).sort().join(",");
    if (providers !== "local,privacy-openai") fail("providers left: " + providers);
    const refs = Object.keys(c.agents.defaults.models).sort().join(",");
    if (refs !== "local/*,privacy-openai/*") fail("picker entries left: " + refs);
    const primary = (c.agents.defaults.model || {}).primary;
    if (primary !== "privacy-openai/gpt-5") fail("primary is " + primary);
    if (c.memory && c.memory.search && c.memory.search.provider === "github-copilot") fail("Copilot memory search kept");
    if (c.plugins.entries.codex.enabled || c.plugins.entries.xai.enabled) fail("codex or xai plugin still enabled");
    if (c.plugins.allow.includes("codex") || c.plugins.allow.includes("xai")) fail("codex or xai still allowed");
  ' "${only_json}" || exit 1
  optin_json="$(run_patch opt-in)"
  node -e '
    const c = JSON.parse(process.argv[1]);
    for (const id of ["claude-cli", "openrouter"]) if (!c.models.providers[id]) { console.error("FAIL: TC-824: opt-in removed " + id); process.exit(1); }
    if (c.agents.defaults.model.primary !== "anthropic/claude-opus-5") { console.error("FAIL: TC-824: opt-in changed the primary"); process.exit(1); }
  ' "${optin_json}" || exit 1
else
  SKIPPED+=("TC-824 (no node)")
fi

# --- TC-825: openclaw.sh writes no provider key in only ----------------------------
tree="$(new_tree)"
mkdir -p "${tree}/config/scripts/start" "${tree}/config/openclaw/templates" "${tree}/config/agents" \
         "${tree}/config/nginx/templates" "${tree}/volumes/_openclaw"
cp "${REPO_DIR}/config/scripts/start/openclaw.sh" "${tree}/config/scripts/start/openclaw.sh"
# openclaw.sh sources its helpers from start/lib and reads the identity nginx vouches for from
# the nginx template.
cp -R "${REPO_DIR}/config/scripts/start/lib/." "${tree}/config/scripts/start/lib/"
cp "${REPO_DIR}/config/nginx/templates/nginx.conf" "${tree}/config/nginx/templates/nginx.conf"
cp "${REPO_DIR}/config/openclaw/templates/env_template" "${tree}/config/openclaw/templates/env_template"
echo '{"gateway":{}}' > "${tree}/volumes/_openclaw/openclaw.json"
stub_docker "${tree}/bin"
keys="OPENAI_API_KEY=sk-openai-sentinel ANTHROPIC_API_KEY=sk-ant-sentinel OPENROUTER_API_KEY=sk-or-sentinel GEMINI_API_KEY=gem-sentinel"
# shellcheck disable=SC2086
printf '%s\n' PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=only ${keys} > "${tree}/.env"
PATH="${tree}/bin:${PATH}" bash "${tree}/config/scripts/start/openclaw.sh" > /dev/null 2>&1 \
  || fail "TC-825: openclaw.sh failed in only mode"
! grep -q sentinel "${tree}/config/openclaw/.env" || fail "TC-825: a provider key was written in only mode"
! grep -q -- "-sentinel" "${tree}/bin/docker.log" || fail "TC-825: a provider key was passed to a container in only mode"
# shellcheck disable=SC2086
printf '%s\n' PRIVACY_PROXY_ENABLE=1 PRIVACY_PROXY_ROUTING=opt-in ${keys} > "${tree}/.env"
PATH="${tree}/bin:${PATH}" bash "${tree}/config/scripts/start/openclaw.sh" > /dev/null 2>&1 \
  || fail "TC-825: openclaw.sh failed in opt-in mode"
grep -q '^OPENAI_API_KEY=sk-openai-sentinel' "${tree}/config/openclaw/.env" || fail "TC-825: opt-in no longer writes the keys"

# --- TC-826: the rendered compose configuration with the only override --------------
if docker compose version > /dev/null 2>&1; then
  envf="${TMP_ROOT}/compose.env"
  sed -E 's/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|OPENROUTER_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|ZAI_API_KEY|AI_GATEWAY_API_KEY|MINIMAX_API_KEY|SYNTHETIC_API_KEY|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_AI_SESSION_KEY)=.*/\1=secret-sentinel/' \
    "${REPO_DIR}/.env.example" > "${envf}"
  render() {  # SERVICE -> prints its rendered configuration as JSON
    (cd "${REPO_DIR}" && COMPOSE_PROFILES=privacy-proxy,cli \
      docker compose --env-file "${envf}" -f compose.yml -f config/privacy-proxy/compose.routing-only.yml \
      config --format json "$1")
  }
  for svc in opencode openclaw-gateway openclaw-cli; do
    out="$(render "${svc}")" || fail "TC-826: compose config failed for ${svc}"
    ! grep -q secret-sentinel <<< "${out}" || fail "TC-826: ${svc} still receives a key or login"
    ! grep -q '_openclaw-claude"' <<< "${out}" || fail "TC-826: ${svc} still mounts the Claude login"
  done
  out="$(render privacy-proxy)" || fail "TC-826: compose config failed for privacy-proxy"
  [[ "$(grep -o secret-sentinel <<< "${out}" | wc -l)" -ge 3 ]] || fail "TC-826: privacy-proxy lost its keys"
  grep -q '_openclaw-claude"' <<< "${out}" || fail "TC-826: privacy-proxy lost the Claude login"
else
  SKIPPED+=("TC-826 (no docker compose)")
fi

echo "PASS: privacy-routing (TC-821 to TC-826)${SKIPPED[*]:+, skipped: ${SKIPPED[*]}}"
