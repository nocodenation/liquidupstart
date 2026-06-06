---
name: vector-search
description: Embed text and run K-nearest-neighbour similarity search over pgvector columns. Use for semantic search, "find documents like X", building a RAG corpus, or any time you need to query a vector column.
---

End-to-end vector workflow: generate embeddings, store them, index them, search them.
Embeddings are 4096-dim floats from a local model reached via an OpenAI-compatible
API; storage uses `vector(4096)`; indexing uses an HNSW index on the binary-quantized
form (Hamming distance) for speed; search reranks the binary candidates with exact
cosine distance for precision.

## Data types: `vector(4096)` (column) vs `bit(4096)` (index) — read this first

These are two different representations at two different layers. Conflating them is the
single most common mistake, so be precise:

- **Storage = `vector(4096)`.** The embedding *column* is always `vector(4096)` and
  holds raw floats. `create_table`'s `vector` logical type maps to exactly this. You
  insert and query embeddings as pgvector float literals: `[v1,v2,...,v4096]`.
- **Index = `bit(4096)`, internal only.** `bit(4096)` is **never a column type in this
  system.** It exists only as a transient projection — `binary_quantize(embedding)::bit(4096)` —
  computed *inside* the HNSW index and the search query. You never declare, insert into,
  or read back a `bit` column.

Why the split: pgvector's HNSW indexes `vector` opclasses only up to 2000 dimensions, so
a 4096-dim float vector cannot be HNSW-indexed directly. Binary-quantizing to `bit(4096)`
(HNSW supports `bit` up to 64000 dims) sidesteps the limit for the fast pre-filter, while
the exact cosine rerank still runs against the raw `vector(4096)` column.

Therefore, do **NOT**:
- declare an embedding column as `bit(4096)`. It breaks `find_closest_vectors`, which
  calls `binary_quantize(col)` (that function needs a `vector` input) and computes cosine
  distance `col <=> $1::vector(4096)` (needs a `vector` column).
- put a cosine opclass on the bit index. The index uses **`bit_hamming_ops`**; pgvector's
  `bit` type has no `bit_cosine_ops` (and `vector_cosine_ops` is invalid on a bit column).
  Cosine is applied only in the `vector` rerank stage.
- binary-quantize on the client side. The database does it at index/query time.

Rule of thumb: **the column type you create and write is `vector`; `bit` is an
implementation detail of the index you never touch directly.**

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
curl -s -X POST http://proxy:8888/rpc/create_vector_index \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "docs", "p_embedding_column_name": "embedding"}'
```

This indexes `binary_quantize(embedding)::bit(4096)` with `bit_hamming_ops`, sidestepping
HNSW's 2000-dim limit on the `vector` type (the `bit` type supports up to 64000 dims).

### 4. Search

Embed the query text (same recipe as above into `$VEC`), then:

```bash
curl -s -X POST http://proxy:8888/rpc/find_closest_vectors \
  -H "Host: postgrest.localhost:8888" \
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

## Building a RAG corpus from PDFs with `ingest_pdf`

For "import these books/PDFs to RAG", don't hand-roll embedding loops — use the
`ingest_pdf` tool. It parses, chunks (~400 tok, 50 overlap), embeds via the
self-hosted endpoint, and inserts rows.

End-to-end flow that works (verified):

1. **Discover the source files in Nextcloud**, not the filesystem. "Books"/"PDFs"
   live in Nextcloud — PROPFIND to list them (see **nextcloud-webdav**). `/data` and
   `find /` are NOT discovery surfaces.
2. **Download each PDF into `/data/<name>.pdf`** over WebDAV (it's the staging mount
   `ingest_pdf` can read). Verify with `head -c 5 file` → `%PDF-`.
3. **Call `ingest_pdf`** with `skip_existing=true` (so re-runs don't duplicate).
   - On the FIRST call in a fresh environment the RAG tables won't exist yet: the tool
     returns `needs_schema=true` and does no work. Create them, then re-run.
   - The required schema is exactly two tables — create via `create_table`:
     - `rag_documents`: `id seqnumber (pk)`, `filename string`, `source_path string`,
       `metadata jsonb`
     - `rag_chunks`: `id seqnumber (pk)`, `document_id number`, `chunk_index number`,
       `content string`, `token_count number`, `metadata jsonb`, `embedding vector`
     (the `vector` logical type → `vector(4096)`; the FK on `document_id` is optional —
     ingest works without it).
4. **After ingest, add the HNSW index** via `create_vector_index` on
   `rag_chunks.embedding` (step 3 of the workflow above). Ingest does NOT index for you.
5. **Verify**: embed a query and call `find_closest_vectors` — relevant chunks should
   come back with cosine distances roughly 0.35–0.45 for on-topic matches.

A ~165-page PDF yields ~260 chunks and ingests in a couple of minutes.

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
  curl -s "http://proxy:8888/rag_chunks?content=ilike.*query.*&limit=20" -H "Host: postgrest.localhost:8888"
  ```

- **Bit-type HNSW confirmed working**: The binary quantization → `binary_quantize(embedding)::bit(4096)` → HNSW with `bit_hamming_ops` approach works end-to-end. (The embedding column stays `vector(4096)`; cosine is applied only in the rerank stage, not on the bit index.) Vector search returns meaningful similarity scores (e.g., 0.78–0.85 for relevant chunks).
