---
name: vector-search
description: Embed text and run K-nearest-neighbour similarity search over pgvector columns. Use for semantic search, "find documents like X", building a RAG corpus, or any time you need to query a vector column.
---

End-to-end vector workflow: generate embeddings, store them, index them, search them.
Embeddings are 4096-dim floats from a local model reached via an OpenAI-compatible
API; storage uses `vector(4096)`; indexing uses an HNSW index on the binary-quantized
form (Hamming distance) for speed; search reranks the binary candidates with exact
cosine distance for precision.

## Retrieval rule: semantic search MUST go through `find_closest_vectors`

To search a RAG corpus or answer a question over `rag_chunks` (or any table with a
`vector` column), you **MUST** embed the query and call the **`find_closest_vectors`**
RPC (see **Search**, step 4 below). That is the only correct retrieval path here.

Do **NOT** substitute a direct PostgREST/SQL query on the table — e.g.
`GET /rag_chunks?content=ilike.*term*`, `=like.`, `=fts.`, or `select=...` with column
filters — for semantic retrieval. Those are **lexical** matches: they hit only literal
substrings and miss paraphrases, synonyms, and conceptually related passages, so for a
natural-language question they return poor or empty results. Scanning/`select`-ing many
`rag_chunks` rows to read them yourself is also wrong — it bypasses ranking, blows the
context window, and still isn't semantic.

The query-embedding steps are **required, not optional**: read the corpus's model from
`rag_documents.metadata`, embed the query with that same backend+model, right-pad to
4096, then call `find_closest_vectors`. Don't skip them because a direct query looks
simpler. The only acceptable non-vector query is an explicit exact-string/keyword lookup
the user asked for, or a genuine fallback when the embedding service is down — and you
should say so when you do that.

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

## Match the corpus's embedding model (CRITICAL for search)

Embeddings from different models live in **different vector spaces** and are NOT
comparable — e.g. `llama-embed-nemotron-8b` (4096-dim) vs OpenAI
`text-embedding-3-large` (3072-dim, zero-padded to 4096). A query embedded with
model A returns garbage against a corpus embedded with model B. So **a query MUST
be embedded with the same backend+model the corpus was built with**, and padded to
4096 the same way.

`ingest_pdf` records this in each `rag_documents` row's `metadata`. Read it before
searching:

```bash
curl -s "http://proxy:8888/rag_documents?select=metadata&order=id.asc&limit=1" \
  -H "Host: postgrest.localhost:8888" \
  | jq -r '.[0].metadata | "\(.embed_backend)\t\(.embed_model)"'
# e.g. "copilot  text-embedding-3-large"  or  "self_hosted  llama-embed-nemotron-8b"
```

Then embed the query with THAT backend/model and **right-pad to 4096** (no-op for a
4096-dim model; adds 1024 zeros for a 3072-dim OpenAI/OpenRouter model). The jq
filter below pads automatically:

```bash
# copilot:     http://127.0.0.1:18789/v1/embeddings (OpenClaw gateway, github-copilot auth)
# self_hosted: $OPENCODE_EMBEDDING_HOST + $OPENCODE_EMBEDDING_MODEL
# openai:      https://api.openai.com/v1/embeddings  (Authorization: Bearer <openai key>)
# openrouter:  https://openrouter.ai/api/v1/embeddings (Authorization: Bearer <openrouter key>)
VEC=$(curl -s -X POST "$EMBED_URL" \
  -H "Content-Type: application/json" ${AUTH:+-H "Authorization: Bearer $AUTH"} \
  -d "{\"model\": \"$EMBED_MODEL\", \"input\": \"query text\"}" \
  | jq -r '(.data[0].embedding // .embedding) as $e
           | ($e + [range(4096 - ($e|length)) | 0])
           | "[" + (map(tostring) | join(",")) + "]"')
```

For the **copilot** backend (available when `OPENCLAW_ENABLE_COPILOT=1`),
embed through the OpenClaw gateway — it reuses the github-copilot auth, so no API
key. Send `model: "openclaw"` plus the gateway `X-Forwarded-User` identity; the
result is `text-embedding-3-large` (3072-dim), padded to 4096 by the same jq:

```bash
VEC=$(curl -s -X POST "http://127.0.0.1:18789/v1/embeddings" \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-User: user@nocodenation.org" \
  -d '{"model": "openclaw", "input": "query text"}' \
  | jq -r '(.data[0].embedding // .embedding) as $e
           | ($e + [range(4096 - ($e|length)) | 0])
           | "[" + (map(tostring) | join(",")) + "]"')
```

Use the API-key env var that matches your runtime (provider-native
`OPENAI_API_KEY` / `OPENROUTER_API_KEY`, or the `OPENCODE_*` equivalents — whichever
is present). If the corpus's model is no longer available, say so rather than
silently embedding the query with a different model.

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

Embed the query text **with the corpus's own embedding model** (see "Match the
corpus's embedding model" above — get `$VEC` padded to 4096), then:

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
chosen backend (copilot/self-hosted/openai/openrouter), and inserts rows.

End-to-end flow that works (verified):

1. **Discover the source files in Nextcloud**, not the filesystem. "Books"/"PDFs"
   live in Nextcloud — PROPFIND to list them (see **nextcloud-webdav**). `/data` and
   `find /` are NOT discovery surfaces.
2. **Download each PDF into `/data/<name>.pdf`** over WebDAV (it's the staging mount
   `ingest_pdf` can read). Verify with `head -c 5 file` → `%PDF-`.
3. **Call `ingest_pdf`** with `skip_existing=true` (so re-runs don't duplicate).
   - When only one backend is configured the tool uses it automatically.
   - **If the tool returns `needs_backend_choice` / a `NEEDS USER INPUT` message**
     (more than one backend configured — Copilot included), it did NO work on
     purpose. You
     MUST stop and ask the user which backend to use: present the listed options
     and wait for their reply. Do NOT pick one yourself, and do NOT re-call
     `ingest_pdf` until they answer — then re-run with `embedding_backend` set to
     their choice. This is a deliberate exception to "make reasonable assumptions
     to unblock progress": the backend choice is the user's, not yours.
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

- Retrieval is semantic: to answer a question over a corpus, embed the query and call
  `find_closest_vectors`. NEVER substitute a direct `rag_chunks` `ilike`/`like`/`fts`
  query or a `select`-and-read-rows scan for semantic retrieval (see the retrieval rule
  at the top). Lexical queries are only for explicit exact-string lookups or a stated
  embedding-service-down fallback.
- Backend choice is the user's, not yours: when `ingest_pdf` reports
  `needs_backend_choice` / `NEEDS USER INPUT`, never auto-select a backend to
  "unblock progress" — present the options, ask, and wait for the reply.
- One corpus = one embedding model. Embed queries with the SAME backend+model the
  corpus was built with (read `rag_documents.metadata.embed_backend`/`embed_model`)
  and pad to 4096. Never mix models in a table; if the model is unavailable, say so.
- Vectors are always 4096-dim — anything else won't fit `vector(4096)` or the index.
  If the model dimension changes, the schema needs to change too.
- Never binary-quantize on the client side. The index does it.
- Prefer "load then index" for sizeable batches — building the index after data is
  loaded avoids the rebuild churn of indexing as rows land.

## Practical Notes from Production Use

- **Embedding endpoint reliability**: The self-hosted embedding service at `$OPENCODE_EMBEDDING_HOST` (OpenAI-compatible `/v1/embeddings`) works reliably. The model `llama-embed-nemotron-8b` returns 4096-dim vectors as expected.

- **Lexical lookup is NOT a retrieval substitute**: a direct `content=ilike.*term*`
  query is a *keyword* match, not semantic search. Use it ONLY for an explicit
  exact-phrase/string lookup the user asked for, or as a genuine last resort when the
  embedding service is down (and say so). It is never the default for answering questions
  over the corpus — for that, embed the query and call `find_closest_vectors` (see the
  retrieval rule at the top). Example exact-string lookup:
  ```bash
  curl -s "http://proxy:8888/rag_chunks?content=ilike.*exact%20phrase*&limit=20" -H "Host: postgrest.localhost:8888"
  ```

- **Bit-type HNSW confirmed working**: The binary quantization → `binary_quantize(embedding)::bit(4096)` → HNSW with `bit_hamming_ops` approach works end-to-end. (The embedding column stays `vector(4096)`; cosine is applied only in the rerank stage, not on the bit index.) Vector search returns meaningful similarity scores (e.g., 0.78–0.85 for relevant chunks).
