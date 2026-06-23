#!/usr/bin/env sh
set -e

mkdir -p "/root/.config/opencode"

OPENCODE_PORT="${OPENCODE_SERVER_PORT:-4096}"
OPENCODE_OLLAMA_URL="${LOCAL_LLM_API_BASE:-http://ollama:11434}"
_TIMEOUT=21600000
_CHUNK_TIMEOUT=3600000

_LLM_KEY_FIELD=""
if [ -n "${LOCAL_LLM_API_KEY:-}" ]; then
    _LLM_KEY_FIELD="
        \"apiKey\": \"${LOCAL_LLM_API_KEY}\","
fi

# Discover models from the gateway's OpenAI-compatible /v1/models. Chat models are
# every id that doesn't look like an embedding model; the first becomes the default.
# The probe also reveals whether the endpoint requires a token (401/403).
_MODELS_URL="${OPENCODE_OLLAMA_URL}/v1/models"
_BODY=/tmp/llm_models.json
_fetch_models() {
    if [ -n "${LOCAL_LLM_API_KEY:-}" ]; then
        curl -s -o "$_BODY" -w '%{http_code}' -H "Authorization: Bearer ${LOCAL_LLM_API_KEY}" "$_MODELS_URL" 2>/dev/null || true
    else
        curl -s -o "$_BODY" -w '%{http_code}' "$_MODELS_URL" 2>/dev/null || true
    fi
}
_MODELS_JSON=""
_code=000
_try=0
while [ "$_try" -lt 10 ]; do
    _code="$(_fetch_models)"
    [ "$_code" = "200" ] && { _MODELS_JSON="$(cat "$_BODY" 2>/dev/null || true)"; break; }
    if [ "$_code" = "401" ] || [ "$_code" = "403" ]; then
        if [ -n "${LOCAL_LLM_API_KEY:-}" ]; then
            echo "WARNING: ${_MODELS_URL} rejected LOCAL_LLM_API_KEY (HTTP ${_code}) — check the token." >&2
        else
            echo "WARNING: ${_MODELS_URL} requires authentication (HTTP ${_code}) — set LOCAL_LLM_API_KEY." >&2
        fi
        break
    fi
    _try=$((_try + 1)); sleep 3
done

_CHAT_IDS="$(printf '%s' "$_MODELS_JSON" | jq -r '.data[].id | select(test("embed";"i") | not)' 2>/dev/null || true)"
[ -z "$_CHAT_IDS" ] && echo "WARNING: no chat models discovered at ${OPENCODE_OLLAMA_URL}/v1/models — OpenCode will start without a model." >&2

# Build the provider's models map from every discovered chat model.
_MODELS_MAP=""
for _m in $_CHAT_IDS; do
    [ -z "$_MODELS_MAP" ] || _MODELS_MAP="${_MODELS_MAP},"
    _MODELS_MAP="${_MODELS_MAP}
        \"${_m}\": {
          \"name\": \"llamacpp: ${_m}\",
          \"modalities\": {
            \"input\": [\"text\", \"image\"],
            \"output\": [\"text\"]
          }
        }"
done

_DEFAULT_MODEL="$(printf '%s\n' $_CHAT_IDS | head -n1)"
_MODEL_FIELD=""
[ -n "$_DEFAULT_MODEL" ] && _MODEL_FIELD="
  \"model\": \"llamacpp/${_DEFAULT_MODEL}\","

# Build providers JSON block — the self-hosted llamacpp provider is always included
_PROVIDERS="    \"llamacpp\": {
      \"npm\": \"@ai-sdk/openai-compatible\",
      \"name\": \"llamacpp\",
      \"options\": {
        \"baseURL\": \"${OPENCODE_OLLAMA_URL}/v1\",${_LLM_KEY_FIELD}
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      },
      \"models\": {${_MODELS_MAP}
      }
    }"

if [ -n "${ANTHROPIC_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"anthropic\": {
      \"options\": {
        \"apiKey\": \"${ANTHROPIC_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${OPENAI_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"openai\": {
      \"options\": {
        \"apiKey\": \"${OPENAI_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${OPENROUTER_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"openrouter\": {
      \"options\": {
        \"apiKey\": \"${OPENROUTER_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

# The providers below are resolved from the bundled models.dev registry (npm
# package + base URL come from there), so only the apiKey is supplied — same as
# the blocks above. Google accepts either GOOGLE_API_KEY or GEMINI_API_KEY.
_GOOGLE_KEY="${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}"
if [ -n "${_GOOGLE_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"google\": {
      \"options\": {
        \"apiKey\": \"${_GOOGLE_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${ZAI_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"zai\": {
      \"options\": {
        \"apiKey\": \"${ZAI_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${AI_GATEWAY_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"vercel\": {
      \"options\": {
        \"apiKey\": \"${AI_GATEWAY_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${MINIMAX_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"minimax\": {
      \"options\": {
        \"apiKey\": \"${MINIMAX_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${SYNTHETIC_API_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"synthetic\": {
      \"options\": {
        \"apiKey\": \"${SYNTHETIC_API_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

printf '{%s
  "instructions": ["/opencode/instructions.md"],
  "provider": {
%s
  },
  "server": {
    "port": %s,
    "hostname": "0.0.0.0",
    "mdns": false
  }
}\n' "$_MODEL_FIELD" "$_PROVIDERS" "$OPENCODE_PORT" > "/root/.config/opencode/opencode.json"

echo "Starting opencode web on port $OPENCODE_PORT (model: ${_DEFAULT_MODEL:-<none discovered>})"
exec opencode web
