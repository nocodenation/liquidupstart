#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname $(dirname $(dirname "${SCRIPT_DIR}")))"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: .env file not found at ${ENV_FILE}" >&2
  exit 1
fi

sed_inplace() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}

# Read a KEY=value from the project-root .env (empty string if unset/missing).
# `|| true`: a missing key makes grep exit 1, which under `set -o pipefail` +
# `set -e` would otherwise abort the whole script.
get_env() {
  grep -E "^${1}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2- | tr -d "'\"" || true
}

# Render config/hermes/.env from the template, then inject the model-provider
# keys from the project-root .env. The template is the contract: only keys it
# already declares (as a commented `# KEY=` line) are supported by Hermes — any
# other keys in the root .env are ignored. For a supported key with a non-empty
# value we uncomment its line and substitute the value; empty keys stay
# commented so Hermes falls back to its other auth sources.
HERMES_DIR="${PROJECT_DIR}/config/hermes"
HERMES_ENV_TEMPLATE="${HERMES_DIR}/templates/env_template"
HERMES_ENV="${HERMES_DIR}/.env"

if [[ ! -f "$HERMES_ENV_TEMPLATE" ]]; then
  echo "Error: Hermes env template not found at ${HERMES_ENV_TEMPLATE}" >&2
  exit 1
fi

echo "Rendering Hermes env: ${HERMES_ENV}"
cp "$HERMES_ENV_TEMPLATE" "$HERMES_ENV"

for key in ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY \
           GEMINI_API_KEY GOOGLE_API_KEY ZAI_API_KEY AI_GATEWAY_API_KEY \
           TOKENHUB_API_KEY LKEAP_API_KEY MINIMAX_API_KEY SYNTHETIC_API_KEY; do
  # Skip keys the template does not declare — Hermes does not support them.
  grep -qE "^#[[:space:]]*${key}=" "$HERMES_ENV" || continue
  value="$(get_env "$key")"
  [[ -z "$value" ]] && continue
  # Match the commented template line `# KEY=...` (anchored on `KEY=` so the
  # variant names are not touched) and replace it with the uncommented
  # assignment. `|` delimiter avoids clashing with key characters.
  sed_inplace -E "s|^#[[:space:]]*${key}=.*|${key}=${value}|" "$HERMES_ENV"
  echo "  set ${key} (uncommented from root .env)"
done
