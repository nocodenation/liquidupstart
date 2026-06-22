---
name: vector-search
description: Embed text and run K-nearest-neighbour similarity search over pgvector columns. Use for semantic search, "find documents like X", building a RAG corpus, or any time you need to query a vector column.
---

End-to-end vector workflow: generate embeddings, store them, index them, search them.
Embeddings are 2560-dim floats from a local model reached via an OpenAI-compatible
API; storage uses `vector(2560)`; indexing uses an HNSW index on the binary-quantized
form (Hamming distance) for speed; search reranks the binary candidates with exact
cosine distance for precision.

## Env vars

```bash
echo $LOCAL_LLM_API_BASE    # e.g. http://local_llm:8080
EMBED_MODEL=$(curl -s -H "Authorization: Bearer $LOCAL_LLM_API_KEY" "$LOCAL_LLM_API_BASE/v1/models" | jq -r '.data[].id | select(test("embed";"i"))' | head -1)   # discover the embedding model from /v1/models
```

## Generate an embedding

The model returns a 2560-dim float vector. Convert it to a pgvector literal in one
shot:

```bash
curl -s -X POST "$LOCAL_LLM_API_BASE/v1/embeddings" \
  -H "Authorization: Bearer $LOCAL_LLM_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$EMBED_MODEL\", \"input\": \"text to embed\"}" \
  | jq -r '(.data[0].embedding // .embedding) | "[" + (map(tostring) | join(",")) + "]"'
```

This prints `"[v1,v2,...,v2560]"` — store it directly in a `vector` column. The
`(.data[0].embedding // .embedding)` filter accepts both the OpenAI-style
(`/v1/embeddings`) and llama.cpp-native (`/embedding`) response shapes. **Do not**
binarize on the client side — pgvector does that at index time.

## Match the corpus's embedding model (CRITICAL for search)

Embeddings from different models are NOT comparable (e.g. `the embedding model reported by /v1/models`
2560-dim vs OpenAI `text-embedding-3-large` 3072-dim fit (padded/truncated) to 2560). A query
MUST be embedded with the SAME backend+model the corpus was built with, and padded
to 2560 the same way — otherwise search returns garbage.

`ingest_pdf` records this per document. Read it before searching:

```bash
curl -s "http://postgrest_app:3000/rag_documents?select=metadata&order=id.asc&limit=1" \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  | jq -r '.[0].metadata | "\(.embed_backend)\t\(.embed_model)"'
```

Embed the query with that backend/model (self_hosted: `$LOCAL_LLM_API_BASE`;
openai: `https://api.openai.com/v1/embeddings`; openrouter:
`https://openrouter.ai/api/v1/embeddings`, with the matching API key) and right-pad
to 2560 — the jq filter does it automatically:

```bash
... | jq -r '(.data[0].embedding // .embedding) as $e
             | (($e[:2560]) + [range(2560 - ($e[:2560]|length)) | 0])
             | "[" + (map(tostring) | join(",")) + "]"'
```

If the corpus's model is no longer available, say so rather than embedding the query
with a different model.

## End-to-end workflow

### 1. Create a table with a vector column

(See **create-table**.) Map `vector` → `vector(2560)`:

```json
{
  "p_table_name": "docs",
  "p_columns": {"id": "seqnumber", "content": "string", "embedding": "vector"},
  "p_primary_keys": ["id"]
}
```

### 2. Insert rows

For each row, embed its text and insert the pgvector literal into the `embedding`
column via PostgREST (see **postgrest-api**).

### 3. Add the HNSW index

```bash
curl -s -X POST http://postgrest_app:3000/rpc/create_vector_index \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "docs", "p_embedding_column_name": "embedding"}'
```

This indexes `binary_quantize(embedding)::bit(2560)` with `bit_hamming_ops`, sidestepping
HNSW's 2000-dim limit on the `vector` type (the `bit` type supports up to 64000 dims).

### 4. Search

Embed the query text (same recipe as above into `$VEC`), then:

```bash
curl -s -X POST http://postgrest_app:3000/rpc/find_closest_vectors \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"p_table_name\": \"docs\", \"p_embedding_column\": \"embedding\", \"p_query\": \"$VEC\", \"p_k\": 5, \"p_rerank_factor\": 4}"
```

Two-stage search:
1. Fast pre-filter via binary HNSW (Hamming distance) → `p_k * p_rerank_factor` candidates.
2. Rerank by exact cosine distance → top `p_k`.

`p_rerank_factor` defaults to 4 (so 20 binary candidates → 5 cosine-reranked results).
Raise it for higher recall at the cost of more cosine computations.

Returns a JSON array of nearest rows ordered by `distance` (cosine; lower = more
similar). The embedding column is omitted from the response.

## Rules

- Backend choice is the user's, not yours: when `ingest_pdf` reports
  `needs_backend_choice` / `NEEDS USER INPUT` (more than one embedding backend
  configured), never auto-select a backend to "unblock progress" — present the
  options, ask the user, and wait for their reply before re-running with
  `embedding_backend` set.
- One corpus = one embedding model. Embed queries with the SAME backend+model the
  corpus was built with (read `rag_documents.metadata.embed_backend`/`embed_model`)
  and pad to 2560. Never mix models in a table; if the model is unavailable, say so.
- Vectors are always 2560-dim — anything else won't fit `vector(2560)` or the index.
  If the model dimension changes, the schema needs to change too.
- Never binary-quantize on the client side. The index does it.
- Prefer "load then index" for sizeable batches — building the index after data is
  loaded avoids the rebuild churn of indexing as rows land.
