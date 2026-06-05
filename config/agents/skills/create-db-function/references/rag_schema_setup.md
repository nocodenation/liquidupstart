# RAG Schema Setup — Reference Implementation

This documents the exact schema, functions, and indexes created for the `$100M Offers` RAG pipeline. Use as a template for future RAG deployments.

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
embedding       bit(4096)       -- binary-quantized vector
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
    embedding bit(4096),
    token_count int,
    created_at timestamptz DEFAULT now()
  );
  RETURN jsonb_build_object('status', 'done', 'tables', ARRAY['rag_documents', 'rag_chunks']);
END;
```

### `create_rag_vector_index()` → `jsonb`
Creates HNSW index on `rag_chunks.embedding` (bit type, cosine ops).

```plpgsql
BEGIN
  CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw_idx
    ON rag_chunks USING hnsw (embedding bit_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  RETURN jsonb_build_object('status', 'done', 'index', 'rag_chunks_embedding_hnsw_idx');
END;
```

### `create_vector_index(p_table_name text, p_embedding_column_name text)` → `jsonb`
Generic version for any table/column.

```plpgsql
BEGIN
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS %I ON %I USING hnsw (%I bit_cosine_ops) WITH (m = 16, ef_construction = 64)',
    p_table_name || '_' || p_embedding_column_name || '_hnsw_idx',
    p_table_name,
    p_embedding_column_name
  );
  RETURN jsonb_build_object('status', 'done', 'index', p_table_name || '_' || p_embedding_column_name || '_hnsw_idx');
END;
```

## Ingestion Results (live data)

| Metric | Value |
|--------|-------|
| Document ID | 1 |
| Filename | `$100M_Offers-How_To_Make_Offers_So_Good_People_Feel_Stupid_Saying_No.pdf` |
| Chunks created | 157 (each ~400 tokens, 50-token overlap) |
| Embedding model | `llama-embed-nemotron-8b` via `$OPENCODE_EMBEDDING_HOST` |
| Vector dimension | 4096 → binary quantized to bit(4096) |
| Index type | HNSW on bit type with `vector_cosine_ops` |

## Verification Queries

```bash
# Check document exists
curl -s "http://postgrest_app:3000/rag_documents?id=eq.1" \
  -H "Authorization: Bearer ***"

# Count chunks
curl -s "http://postgrest_app:3000/rag_chunks?document_id=eq.1&select=id,chunk_index,token_count" \
  -H "Authorization: Bearer ***"

# Vector search (requires embedding query first)
curl -s -X POST http://postgrest_app:3000/rpc/find_closest_vectors \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "rag_chunks", "p_embedding_column": "embedding", "p_query": "[...4096 floats...]", "p_k": 5, "p_rerank_factor": 4}'
```

## Test Search Results

Query: `"grand slam offer"` → 5 results, cosine similarity scores 0.78–0.85.

Query: `"King of Pop" / "Michael Jackson"` → match in Chunk 134:
> `"ABC, Easy as 123 Ah, simple as doh reh mi" — Michael Jackson, "ABC"`