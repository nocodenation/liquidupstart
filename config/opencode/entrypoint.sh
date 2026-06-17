#!/usr/bin/env sh
set -e

mkdir -p "/root/.config/opencode"

OPENCODE_PORT="${OPENCODE_SERVER_PORT:-4096}"
OPENCODE_OLLAMA_URL="${OPENCODE_OLLAMA_HOST:-http://ollama:11434}"
_TIMEOUT="${OPENCODE_TIMEOUT:-600000}"
_CHUNK_TIMEOUT="${OPENCODE_CHUNK_TIMEOUT:-120000}"

# Model with '/' is provider/model; otherwise assume ollama.
_MODEL_RAW="${OPENCODE_MODEL:-llama3.1:8b}"
case "$_MODEL_RAW" in
    */*)
        OPENCODE_FULL_MODEL="$_MODEL_RAW"
        OPENCODE_OLLAMA_MODEL="${_MODEL_RAW#ollama/}"
        ;;
    *)
        OPENCODE_FULL_MODEL="ollama/$_MODEL_RAW"
        OPENCODE_OLLAMA_MODEL="$_MODEL_RAW"
        ;;
esac

# Build providers JSON block — ollama is always included
_PROVIDERS="    \"llamacpp\": {
      \"npm\": \"@ai-sdk/openai-compatible\",
      \"name\": \"llamacpp\",
      \"options\": {
        \"baseURL\": \"${OPENCODE_OLLAMA_URL}/v1\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      },
      \"models\": {
        \"${OPENCODE_OLLAMA_MODEL}\": {
          \"name\": \"llamacpp: ${OPENCODE_OLLAMA_MODEL}\",
          \"modalities\": {
            \"input\": [\"text\", \"image\"],
            \"output\": [\"text\"]
          }
        }
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

printf '{
  "model": "%s",
  "instructions": ["/opencode/instructions.md"],
  "provider": {
%s
  },
  "server": {
    "port": %s,
    "hostname": "0.0.0.0",
    "mdns": false
  }
}\n' "$OPENCODE_FULL_MODEL" "$_PROVIDERS" "$OPENCODE_PORT" > "/root/.config/opencode/opencode.json"

echo "Starting opencode web on port $OPENCODE_PORT (model: $OPENCODE_FULL_MODEL)"
exec opencode web
