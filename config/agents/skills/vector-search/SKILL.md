---
name: vector-search
description: Embed text and run K-nearest-neighbour similarity search over pgvector columns. Use for semantic search, "find documents like X", building a RAG corpus, or any time you need to query a vector column.
---

End-to-end vector workflow: generate embeddings, store them, index them, search them.
Embeddings are 4096-dim floats from a local model reached via an OpenAI-compatible
API; storage uses `vector(4096)`; indexing uses an HNSW index on the binary-quantized
form (Hamming distance) for speed; search reranks the binary candidates with exact
cosine distance for precision.

## Env vars

```bash
echo $OPENCODE_EMBEDDING_HOST    # e.g. http://embedding_host:8801
echo $OPENCODE_EMBEDDING_MODEL   # e.g. llama-embed-nemotron-8b
```

## Generate an embedding

The model returns a 4096-dim float vector. Convert it to a pgvector literal in one
shot:

```bash
curl -s -X POST "$OPENCODE_EMBEDDING_HOST/v1/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$OPENCODE_EMBEDDING_MODEL\", \"input\": \"text to embed\"}" \
  | jq -r '(.data[0].embedding // .embedding) | "[" + (map(tostring) | join(",")) + "]"'
```

This prints `"[v1,v2,...,v4096]"` — store it directly in a `vector` column. The
`(.data[0].embedding // .embedding)` filter accepts both the OpenAI-style
(`/v1/embeddings`) and llama.cpp-native (`/embedding`) response shapes. **Do not**
binarize on the client side — pgvector does that at index time.

## End-to-end workflow

### 1. Create a table with a vector column

(See **create-table**.) Map `vector` → `vector(4096)`:

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

This indexes `binary_quantize(embedding)::bit(4096)` with `bit_hamming_ops`, sidestepping
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

- Vectors are always 4096-dim — anything else won't fit `vector(4096)` or the index.
  If the model dimension changes, the schema needs to change too.
- Never binary-quantize on the client side. The index does it.
- Prefer "load then index" for sizeable batches — building the index after data is
  loaded avoids the rebuild churn of indexing as rows land.

## Practical Notes from Production Use

- **Embedding endpoint reliability**: The self-hosted embedding service at `$OPENCODE_EMBEDDING_HOST` (OpenAI-compatible `/v1/embeddings`) works reliably. The model `llama-embed-nemotron-8b` returns 4096-dim vectors as expected.

- **Text search fallback**: When vector search is unavailable or you need exact matching, plain text search via PostgREST is a viable fallback:
  ```bash
  curl -s "http://postgrest_app:3000/rag_chunks?content=ilike.*query.*&limit=20"
  ```

- **JWT issues affect vector RPCs too**: The `find_closest_vectors` and `create_vector_index` RPCs use the same PostgREST JWT authentication. See **postgrest-api** for the authentication pitfalls and workarounds.

- **Bit-type HNSW confirmed working**: The binary quantization → `bit(4096)` → HNSW with `vector_cosine_ops` approach works end-to-end. Vector search returns meaningful similarity scores (e.g., 0.78–0.85 for relevant chunks).
