#!/usr/bin/env bash
# Delete the rendered configuration files, so the next build or start renders them afresh.
#
# What it does
#   For each service with templates (pgadmin, nginx, nextcloud, liquid, hermes, openclaw), it
#   deletes from config/<service>/ the rendered copy of every file in config/<service>/templates/
#   and prints "Removed: config/<service>/<file>" for each copy that existed and was deleted. When
#   it deleted nothing, it prints "No rendered configuration files found." instead. A rendered file
#   has its template's name, except env_template, which renders to .env. Templates, the root .env,
#   volumes/, containers and images are never touched; there is no Docker call.
#
# Callers
#   The operator, to force a re-render without losing data, and the full reset ./cleanup.sh as
#   one of its steps.
#
# Usage
#   ./scripts/linux/clean-rendered-config.sh      (from anywhere; it changes into the project root)
#
# Exit status
#   0; a missing or empty template directory is not an error.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_DIR}"

# The services whose config/<service>/templates/ are rendered into config/<service>/.
SERVICES=(pgadmin nginx nextcloud liquid hermes openclaw)

# rendered_name TEMPLATE_BASENAME
#   Print the name a template is rendered to: its own name, except env_template, which becomes .env.
rendered_name() {
  case "$1" in
    env_template) echo ".env" ;;
    *) echo "$1" ;;
  esac
}

removed=0
for service in "${SERVICES[@]}"; do
  for template in "config/${service}/templates"/*; do
    # An empty or missing templates directory leaves the glob unexpanded; skip it.
    [[ -f "${template}" ]] || continue
    rendered="config/${service}/$(rendered_name "$(basename "${template}")")"
    # Report only what is really there. -e and -L together also catch a dangling symlink, and
    # rm -rf also removes a directory Docker creates when it bind-mounts a file that is missing.
    if [[ -e "${rendered}" || -L "${rendered}" ]]; then
      rm -rf "${rendered}"
      echo "Removed: ${rendered}"
      removed=$((removed + 1))
    fi
  done
done

if [[ "${removed}" -eq 0 ]]; then
  echo "No rendered configuration files found."
fi
