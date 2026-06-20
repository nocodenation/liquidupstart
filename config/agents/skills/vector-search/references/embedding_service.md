# Embedding Service — Backends & Self-Hosted Verification

## Endpoint Details

| Property | Value |
|----------|-------|
| Base URL | `$OPENCODE_EMBEDDING_HOST` (e.g., `http://embedding_host:8801`) |
| Endpoint | `/v1/embeddings` (OpenAI-compatible) |
| Model | `llama-embed-nemotron-8b` (from `$OPENCODE_EMBEDDING_MODEL`) |
| Output dimension | 4096 |
| Response format | OpenAI-style: `{ "data": [{ "embedding": [...] }] }` |

## Verified Working Curl

```bash
curl -s -X POST "$OPENCODE_EMBEDDING_HOST/v1/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$OPENCODE_EMBEDDING_MODEL\", \"input\": \"test query\"}" \
  | jq '.data[0].embedding | length'
# Returns: 4096
```

## Generating Pgvector Literal for Storage

```bash
curl -s -X POST "$OPENCODE_EMBEDDING_HOST/v1/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$OPENCODE_EMBEDDING_MODEL\", \"input\": \"text to embed\"}" \
  | jq -r '(.data[0].embedding // .embedding) | "[" + (map(tostring) | join(",")) + "]"'
# Output: "[0.0123,-0.0456,...,0.0789]"
```

## Integration with RAG Pipeline

The `ingest_pdf` tool auto-selects an embedding backend from whatever is configured.
Every non-self-hosted vector is zero-padded to fill the shared `vector(4096)` column:

| Backend | Credential | Default model (native dims) | Endpoint |
|---------|-----------|------------------------------|----------|
| **self_hosted** | `OPENCODE_EMBEDDING_HOST` + `OPENCODE_EMBEDDING_MODEL` | host model (4096) | `$OPENCODE_EMBEDDING_HOST/v1/embeddings` |
| **copilot** | `OPENCLAW_ENABLE_COPILOT=1` (signed in) | text-embedding-3-small (1536) | OpenClaw gateway `/v1/embeddings` |
| **openai** | `OPENAI_API_KEY` | text-embedding-3-large (3072) | api.openai.com/v1/embeddings |
| **openrouter** | `OPENROUTER_API_KEY` | openai/text-embedding-3-large (3072) | openrouter.ai/api/v1/embeddings |
| **google** | `GEMINI_API_KEY` / `GOOGLE_API_KEY` | gemini-embedding-001 (3072) | generativelanguage.googleapis.com/v1beta/openai/embeddings |
| **zai** | `ZAI_API_KEY` | embedding-3 (2048) | api.z.ai/api/paas/v4/embeddings |
| **vercel** | `AI_GATEWAY_API_KEY` | openai/text-embedding-3-large (3072) | ai-gateway.vercel.sh/v1/embeddings |
| **synthetic** | `SYNTHETIC_API_KEY` | hf:nomic-ai/nomic-embed-text-v1.5 (768) | api.synthetic.new/openai/v1/embeddings |
| **lkeap** | `LKEAP_API_KEY` | adp-text-embedding-0.5b | api.lkeap.cloud.tencent.com/v1/embeddings |
| **minimax** | `MINIMAX_API_KEY` (+ `MINIMAX_GROUP_ID`) | embo-01 (1536) | api.minimax.io/v1/embeddings (non-OpenAI shape) |

All except `minimax` are OpenAI-compatible (`{"model","input"}` → `data[].embedding`,
`Authorization: Bearer`). `minimax` uses `{"model","type","texts"}` → `vectors[]` with an
optional `?GroupId=`.

Selection: if only one is configured it is used automatically; if **more than one** is
configured the tool asks you to choose (pass `embedding_backend` set to one of the names
above and re-run); if none is configured it does no work and explains why.

When the self-hosted backend is used it handles:
1. PDF text extraction (page-by-page)
2. Chunking (~400 tokens, 50-token overlap)
3. Embedding each chunk via this endpoint
4. Insert into `rag_chunks` with the raw `vector(4096)` embedding (NOT bit — bit is index-only; see SKILL.md)

## Performance Notes

- **First request latency**: ~2-3 seconds (model warm-up)
- **Subsequent requests**: ~500-800ms per embedding
- **Batch throughput**: Sequential (tool embeds one chunk at a time)
- **157 chunks** (from $100M Offers PDF): ~2-3 minutes total ingestion

## Fallback: Direct Table Query for Text Search

When vector search is unavailable or exact phrase matching is needed:

```bash
# Case-insensitive substring match
curl -s "http://proxy:8888/rag_chunks?content=ilike.*Michael Jackson.*&limit=20" -H "Host: postgrest.localhost:8888"

# Or retrieve all and grep locally (faster for small corpuses)
curl -s "http://proxy:8888/rag_chunks?select=content,chunk_index&document_id=eq.1&limit=200" \
  -H "Host: postgrest.localhost:8888" \
  | jq -r '.[] | "\(.chunk_index)\t\(.content)"' \
  | grep -i "jackson"
```