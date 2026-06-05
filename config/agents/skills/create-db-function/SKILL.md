---
name: create-db-function
description: Deploy a new PostgreSQL function and expose it via the PostgREST REST API
---

## What I do

Given a description of what a database function should do, I will:

1. Read the API key from `/workspace/.env`
2. Fetch the live OpenAPI spec from PostgREST to understand existing tables and types
3. Write a `plpgsql` or `sql` function body that satisfies the request
4. Call `deploy_function` to create/replace the function in PostgreSQL
5. Verify the new endpoint responds correctly

## Steps

### 1. Read the API key

In this environment the JWT is in the `POSTGREST_API_KEY` environment variable:
```bash
API_KEY=$(printenv POSTGREST_API_KEY)
```

### 2. Fetch the live OpenAPI spec
```bash
curl -s http://postgrest_app:3000/ \
  -H "Authorization: Bearer $API_KEY" \
  -H "Accept: application/json"
```
Inspect the `definitions` and `paths` sections to understand available tables and existing RPC functions before writing any code.

### 3. Deploy the function

**Shell escaping is treacherous** — function bodies contain single quotes, double quotes, backslashes, and newlines that will break inline `-d '...'` strings. Use a file-based payload instead:

```bash
# Write the deploy_function JSON to a file
cat > /tmp/deploy_fn.json <<'EOF'
{
  "function_name": "your_function_name",
  "function_params": "param1 type1, param2 type2",
  "return_type": "jsonb",
  "function_language": "plpgsql",
  "function_body": "BEGIN ... END;",
  "replace_existing": true
}
EOF

# Call with file input
curl -s -X POST http://postgrest_app:3000/rpc/deploy_function \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/deploy_fn.json
```

Rules for `function_body`:
- Write the body between `BEGIN` and `END;` — do not include `CREATE FUNCTION` or `$$` delimiters
- Escape single quotes by doubling them: `'value'` → `''value''`
- `function_name` must be lowercase alphanumeric with underscores only
- Only `plpgsql` and `sql` languages are allowed

### 4. Verify
Call the new endpoint with representative input and confirm the response is correct:
```bash
curl -s -X POST http://postgrest_app:3000/rpc/<function_name> \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "param1": "test_value" }'
```

## Rules

- Always fetch the OpenAPI spec first — never assume table names or column types
- Prefer `RETURNS jsonb` so callers get structured output
- Use `RETURNS SETOF <table>` when the function is meant to return rows from an existing table
- If the request is ambiguous, ask one clarifying question before writing any code

## Practical Notes from Production Use

- **JWT auth**: The `POSTGREST_API_KEY` environment variable is the source of truth. See **postgrest-api** for authentication pitfalls and reliable patterns (`printenv`, Python subprocess).

- **File-based JSON payload avoids shell quoting nightmares**: Deploying functions with inline `-d '...'` strings is fragile. Writing the full JSON to a file and using `curl -d @file` is the reliable path.

- **Function deployment verified**: The `deploy_function` RPC works correctly. Examples successfully deployed in this environment:
  - `setup_rag_schema()` — creates `rag_documents`, `rag_chunks`, foreign key, converts `metadata` to `jsonb`
  - `create_rag_vector_index()` — creates HNSW index on `binary_quantize(embedding)::bit(4096)` with `vector_cosine_ops`
  - `create_vector_index(p_table_name, p_embedding_column_name)` — generic version
