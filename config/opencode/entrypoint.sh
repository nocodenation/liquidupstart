#!/usr/bin/env sh
set -e

mkdir -p "/root/.config/opencode"

OPENCODE_PORT="${OPENCODE_SERVER_PORT:-4096}"
OPENCODE_OLLAMA_URL="${OPENCODE_OLLAMA_HOST:-http://ollama:11434}"
_TIMEOUT="${OPENCODE_TIMEOUT:-600000}"
_CHUNK_TIMEOUT="${OPENCODE_CHUNK_TIMEOUT:-120000}"

# Parse model: if it contains '/', use as-is (provider/model); otherwise assume ollama
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

if [ -n "${OPENCODE_ANTHROPIC_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"anthropic\": {
      \"options\": {
        \"apiKey\": \"${OPENCODE_ANTHROPIC_KEY}\",
        \"timeout\": ${_TIMEOUT},
        \"chunkTimeout\": ${_CHUNK_TIMEOUT}
      }
    }"
fi

if [ -n "${OPENCODE_OPENAI_KEY}" ]; then
    _PROVIDERS="${_PROVIDERS},
    \"openai\": {
      \"options\": {
        \"apiKey\": \"${OPENCODE_OPENAI_KEY}\",
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

# curl hard-codes *.localhost -> 127.0.0.1 (RFC 6761), so inside this container
# names like nextcloud.localhost never reach the proxy. Route any request to the
# system HTTP/HTTPS ports through the proxy container instead, keeping the
# original Host header so nginx vhost routing still works. Scoped to the ports,
# so external traffic is untouched. Rewritten each start so it tracks the env.
SYSTEM_HTTP_PORT="${SYSTEM_HTTP_PORT:-8888}"
SYSTEM_HTTPS_PORT="${SYSTEM_HTTPS_PORT:-8833}"
{
    printf 'connect-to = ":%s:proxy:%s"\n' "$SYSTEM_HTTP_PORT" "$SYSTEM_HTTP_PORT"
    printf 'connect-to = ":%s:proxy:%s"\n' "$SYSTEM_HTTPS_PORT" "$SYSTEM_HTTPS_PORT"
} > /root/.curlrc

echo "Starting opencode web on port $OPENCODE_PORT (model: $OPENCODE_FULL_MODEL)"
exec opencode web
