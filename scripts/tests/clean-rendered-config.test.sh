#!/usr/bin/env bash
# Test for scripts/linux/clean-rendered-config.sh and the root cleanup.sh's call to it.
#
# What it checks
#   1. The rendered-config cleanup deletes the rendered copy of every template of the six
#      template directories it reads, and nothing else: templates and unrelated files stay.
#   2. `env_template` is rendered as `.env`, so `.env` is what is deleted for it.
#   3. It prints a "Removed:" line for exactly the files it deleted: all nine when everything is
#      rendered, only those present when some are, and none, but one "No rendered configuration
#      files found." line, when nothing is rendered; it exits 0 in every case.
#   4. Every `"${PROJECT_DIR}/scripts/…"` path the root cleanup.sh runs exists, and the old
#      name scripts/linux/cleanup.sh is gone, so the two scripts no longer share a name.
#
# How it works
#   The script under test resolves the project root from its own location, so it is copied
#   into a fresh `mktemp -d` tree with fixture files and run there. No Docker, no network, and
#   nothing in the checkout is touched.
#
# Usage
#   bash scripts/tests/clean-rendered-config.test.sh     (from the liquidupstart root)
#
# Exit status
#   0 when every assertion holds; 1 at the first that does not, with its message on stderr.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="scripts/linux/clean-rendered-config.sh"

# fail MESSAGE
#   Print MESSAGE as a failed assertion and stop the test with status 1.
fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# make_tree
#   Create a temporary project tree holding a copy of the script under test and, for each
#   template directory it reads, the real template names.
#   Prints the tree's path. The caller removes it.
make_tree() {
  local tree
  tree="$(mktemp -d)"
  mkdir -p "${tree}/scripts/linux"
  [[ -f "${REPO_DIR}/${SCRIPT}" ]] || fail "${SCRIPT} does not exist"
  cp "${REPO_DIR}/${SCRIPT}" "${tree}/${SCRIPT}"
  # Template names as they are in config/*/templates/ today.
  local spec service file
  for spec in pgadmin:config_distro.py pgadmin:pgpass nginx:nginx.conf liquid:Dockerfile \
              nextcloud:set_trusted_proxies.sh hermes:Dockerfile hermes:env_template \
              openclaw:Dockerfile openclaw:env_template; do
    service="${spec%%:*}"
    file="${spec#*:}"
    mkdir -p "${tree}/config/${service}/templates"
    echo "template" > "${tree}/config/${service}/templates/${file}"
  done
  echo "${tree}"
}

# render TREE
#   Create the rendered copy of every template, as a build would, plus a file per service
#   that no template produces.
render() {
  local tree="$1" template service name
  for template in "${tree}"/config/*/templates/*; do
    service="$(basename "$(dirname "$(dirname "${template}")")")"
    name="$(basename "${template}")"
    [[ "${name}" == env_template ]] && name=".env"
    echo "rendered" > "${tree}/config/${service}/${name}"
    echo "keep" > "${tree}/config/${service}/keep.txt"
  done
}

# removed_lines OUTPUT
#   Print the paths of the "Removed:" lines of OUTPUT, sorted, one per line.
removed_lines() {
  sed -n 's/^Removed: //p' <<< "$1" | sort
}

ALL_RENDERED="$(printf '%s\n' config/hermes/.env config/hermes/Dockerfile config/liquid/Dockerfile \
  config/nextcloud/set_trusted_proxies.sh config/nginx/nginx.conf config/openclaw/.env \
  config/openclaw/Dockerfile config/pgadmin/config_distro.py config/pgadmin/pgpass | sort)"

# Cases 1 and 2: rendered files removed, templates and unrelated files kept, each removal reported.
tree="$(make_tree)"
trap 'rm -rf "${tree}"' EXIT
render "${tree}"
output="$(bash "${tree}/${SCRIPT}")"
[[ "$(removed_lines "${output}")" == "${ALL_RENDERED}" ]] || fail "the Removed: lines are not the nine rendered files"
for rendered in pgadmin/config_distro.py pgadmin/pgpass nginx/nginx.conf liquid/Dockerfile \
                nextcloud/set_trusted_proxies.sh hermes/Dockerfile hermes/.env \
                openclaw/Dockerfile openclaw/.env; do
  [[ ! -e "${tree}/config/${rendered}" ]] || fail "config/${rendered} was not removed"
done
for kept in pgadmin nginx liquid nextcloud hermes openclaw; do
  [[ -f "${tree}/config/${kept}/keep.txt" ]] || fail "config/${kept}/keep.txt was removed"
done
[[ -f "${tree}/config/nginx/templates/nginx.conf" ]] || fail "a template was removed"
[[ -f "${tree}/config/openclaw/templates/env_template" ]] || fail "env_template was removed"

# Case 3a: some rendered - only those are reported.
rm -rf "${tree}"
tree="$(make_tree)"
echo "rendered" > "${tree}/config/nginx/nginx.conf"
echo "rendered" > "${tree}/config/openclaw/.env"
output="$(bash "${tree}/${SCRIPT}")" || fail "the script failed with two files to remove"
[[ "$(removed_lines "${output}")" == "$(printf '%s\n' config/nginx/nginx.conf config/openclaw/.env)" ]] \
  || fail "with two files rendered, the Removed: lines are not exactly those two"

# Case 3b: nothing rendered - exit 0, no "Removed:" line, and the script says so.
rm -rf "${tree}"
tree="$(make_tree)"
output="$(bash "${tree}/${SCRIPT}")" || fail "the script failed with nothing to remove"
[[ -z "$(removed_lines "${output}")" ]] || fail "Removed: lines printed with nothing rendered"
grep -qx 'No rendered configuration files found.' <<< "${output}" || fail "nothing rendered, but no line says so"

# Case 4: the root cleanup.sh calls only scripts that exist, and the old name is gone.
called="$(grep -o '"${PROJECT_DIR}/scripts/[^"]*"' "${REPO_DIR}/cleanup.sh" | sed 's/"${PROJECT_DIR}\///; s/"$//')"
[[ -n "${called}" ]] || fail "cleanup.sh calls no script under scripts/"
while read -r path; do
  [[ -f "${REPO_DIR}/${path}" ]] || fail "cleanup.sh calls ${path}, which does not exist"
done <<< "${called}"
[[ ! -e "${REPO_DIR}/scripts/linux/cleanup.sh" ]] || fail "scripts/linux/cleanup.sh still exists"

echo "PASS: clean-rendered-config.sh (5 cases)"
