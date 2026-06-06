---
name: create-table
description: Create a new Postgres table via the create_table RPC and have it instantly exposed by PostgREST. Use for any "make me a table" or "add a table to store X" request.
---

The `create_table` RPC creates a table in the `public` schema, owned by `api_user`,
which PostgREST then exposes as a REST endpoint automatically (schema reload is wired
up via the `pgrst_watch` event trigger).

## Call

```bash
curl -s -X POST http://postgrest_app:3000/rpc/create_table \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_table_name": "my_table",
    "p_columns": {
      "id": "seqnumber",
      "name": "string",
      "score": "number",
      "created_at": "datetime"
    },
    "p_primary_keys": ["id"]
  }'
```

## Supported column types

| Logical type | Postgres type | Notes |
|---|---|---|
| `string` | `text` | |
| `number` | `numeric` | |
| `datetime` | `timestamp` | |
| `jsonb` | `jsonb` | Structured JSON (objects/arrays) — use for metadata, tags, nested data |
| `vector` | `vector(4096)` | 4096-dim raw-float pgvector column; see **vector-search** skill |
| `seqnumber` | `numeric` + auto-increment sequence | Use for primary-key IDs |

> **Embeddings are `vector`, never `bit`.** The `vector` type creates a `vector(4096)`
> column of raw floats. `bit(4096)` is **not** a column type here — it only appears
> inside the HNSW index expression (`binary_quantize(col)::bit(4096)`). Declaring an
> embedding column as `bit` breaks similarity search. See **vector-search** for why.

## After creating

Re-fetch the OpenAPI spec to confirm the table is exposed:

```bash
curl -s http://postgrest_app:3000/ \
  -H "Authorization: Bearer $POSTGREST_API_KEY" | jq '.paths | keys' | grep <table_name>
```

Then `POST`/`GET`/`PATCH`/`DELETE` at `http://postgrest_app:3000/<table_name>` — see
the **postgrest-api** skill.

## Rules

- Lowercase, snake_case table names (`my_table`, not `MyTable`).
- Always include a primary key. `seqnumber` is the simplest choice for an
  auto-incrementing `id`.
- For vector storage, use the `vector` type and follow the **vector-search** skill for
  indexing and querying.
