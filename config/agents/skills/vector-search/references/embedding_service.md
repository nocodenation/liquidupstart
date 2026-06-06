# Embedding Service Verification — Self-Hosted Endpoint

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

The `ingest_pdf` tool uses this endpoint automatically when:
- `OPENCODE_EMBEDDING_HOST` is set
- `OPENCODE_EMBEDDING_MODEL` is set
- No `OPENCODE_OPENAI_KEY` is present (or `embedding_backend: self_hosted` specified)

It handles:
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