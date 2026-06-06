# RAG Schema Setup — Reference Implementation

This documents the schema, functions, and indexes for the `$100M Offers` RAG pipeline.
It is a **historical record**, not a recipe to copy.

> **Don't redeploy these functions.** `setup_rag_schema()` and `create_rag_vector_index()`
> below are one-off wrappers that are now fully covered by the built-in RPCs. For a new
> RAG deployment: create the tables with **`create_table`** (`metadata` → `jsonb`,
> `embedding` → `vector`), then index with the built-in **`create_vector_index`**, and
> search with **`find_closest_vectors`**. Only deploy a new function if the built-ins
> genuinely can't express what you need — and make it generic, not table-specific. See
> the **create-db-function** and **vector-search** skills.

> **Data-type correction (important).** The embedding **column** is `vector(4096)` (raw
> floats), **not** `bit(4096)`. `bit(4096)` only appears as an *index/query* projection
> `binary_quantize(embedding)::bit(4096)`, and the bit HNSW opclass is **`bit_hamming_ops`**
> — pgvector has no `bit_cosine_ops`, and `vector_cosine_ops` is invalid on a bit column.
> Cosine is applied only when reranking the raw `vector` column. Declaring `embedding` as
> `bit` breaks `find_closest_vectors` (it calls `binary_quantize(col)`, which needs a
> `vector` input). The authoritative definitions are `create_table` / `create_vector_index`
> / `find_closest_vectors` in `config/postgres/init-db.sql`; see the **vector-search** skill.
> The snippets below have been corrected to match those.

## Tables

### `rag_documents`
```sql
id            bigserial PRIMARY KEY
filename      text NOT NULL
source_path   text
metadata      jsonb DEFAULT '{}'::jsonb
created_at    timestamptz DEFAULT now()
```

### `rag_chunks`
```sql
id              bigserial PRIMARY KEY
document_id     bigint REFERENCES rag_documents(id) ON DELETE CASCADE
chunk_index     int NOT NULL
content         text NOT NULL
embedding       vector(4096)    -- raw float embedding; bit(4096) is index-only
token_count     int
created_at      timestamptz DEFAULT now()
```

## Functions Deployed

### `setup_rag_schema()` → `jsonb`
Creates both tables, FK, converts `metadata` to `jsonb`. Idempotent.

```plpgsql
BEGIN
  CREATE TABLE IF NOT EXISTS rag_documents (
    id bigserial PRIMARY KEY,
    filename text NOT NULL,
    source_path text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS rag_chunks (
    id bigserial PRIMARY KEY,
    document_id bigint REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index int NOT NULL,
    content text NOT NULL,
    embedding vector(4096),
    token_count int,
    created_at timestamptz DEFAULT now()
  );
  RETURN jsonb_build_object('status', 'done', 'tables', ARRAY['rag_documents', 'rag_chunks']);
END;
```

### `create_rag_vector_index()` → `jsonb`
Creates an HNSW index over the binary-quantized form of `rag_chunks.embedding`
(`vector(4096)` column → `bit(4096)` projection, Hamming ops).

```plpgsql
BEGIN
  CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx
    ON rag_chunks USING hnsw ((binary_quantize(embedding)::bit(4096)) bit_hamming_ops)
    WITH (m = 16, ef_construction = 64);
  RETURN jsonb_build_object('status', 'done', 'index', 'rag_chunks_embedding_hnsw_idx');
END;
```

### `create_vector_index(p_table_name text, p_embedding_column_name text)` → `jsonb`
Generic version for any table/column.

```plpgsql
BEGIN
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I USING hnsw ((binary_quantize(%I)::bit(4096)) bit_hamming_ops) WITH (m = 16, ef_construction = 64)',
    p_table_name || '_' || p_embedding_column_name || '_hnsw_idx',
    p_table_name,
    p_embedding_column_name
  );
  RETURN jsonb_build_object('status', 'done', 'index', p_table_name || '_' || p_embedding_column_name || '_hnsw_idx');
END;
```
> Note: the deployed generic `create_vector_index` in `config/postgres/init-db.sql` names
> the index `<table>_embedding_idx` and uses `m = 4, ef_construction = 10`. Prefer calling
> that RPC over redefining this.

## Ingestion Results (live data)

| Metric | Value |
|--------|-------|
| Document ID | 1 |
| Filename | `$100M_Offers-How_To_Make_Offers_So_Good_People_Feel_Stupid_Saying_No.pdf` |
| Chunks created | 157 (each ~400 tokens, 50-token overlap) |
| Embedding model | `llama-embed-nemotron-8b` via `$OPENCODE_EMBEDDING_HOST` |
| Vector dimension | 4096 (stored as `vector(4096)`; index projects to `bit(4096)`) |
| Index type | HNSW on `binary_quantize(embedding)::bit(4096)` with `bit_hamming_ops` |

## Verification Queries

```bash
# Check document exists
curl -s "http://proxy:8888/rag_documents?id=eq.1" -H "Host: postgrest.localhost:8888"

# Count chunks
curl -s "http://proxy:8888/rag_chunks?document_id=eq.1&select=id,chunk_index,token_count" -H "Host: postgrest.localhost:8888"

# Vector search (requires embedding query first)
curl -s -X POST http://proxy:8888/rpc/find_closest_vectors \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "rag_chunks", "p_embedding_column": "embedding", "p_query": "[...4096 floats...]", "p_k": 5, "p_rerank_factor": 4}'
```

## Test Search Results

Query: `"grand slam offer"` → 5 results, cosine similarity scores 0.78–0.85.

Query: `"King of Pop" / "Michael Jackson"` → match in Chunk 134:
> `"ABC, Easy as 123 Ah, simple as doh reh mi" — Michael Jackson, "ABC"`