---
name: create-db-function
description: Deploy a new PostgreSQL function and expose it via the PostgREST REST API
---

## Prefer the built-in functions — deploy a new one only as a last resort

This database already ships generic, maintained RPC functions (defined in
`config/postgres/init-db.sql`). Use them as-is. Do **not** deploy bespoke,
single-purpose copies of them.

Built-in functions:
- `create_table(p_table_name, p_columns, p_primary_keys)` — create a table. Types:
  `string`, `number`, `datetime`, `jsonb`, `vector`, `seqnumber`. See **create-table**.
- `create_vector_index(p_table_name, p_embedding_column_name)` — HNSW index for a
  `vector(2560)` embedding column. See **vector-search**.
- `find_closest_vectors(p_table_name, p_embedding_column, p_query, p_k, p_rerank_factor)`
  — two-stage KNN vector search. See **vector-search**.
- `deploy_function(...)` — deploy a genuinely new function (this skill).

Decision order — stop at the first that works:
1. **Reuse a built-in as-is.** This includes RAG: build the tables with `create_table`
   and index them with `create_vector_index`. Do **NOT** deploy `setup_rag_schema()`,
   `create_rag_vector_index()`, or any `*_rag_*` / table-specific wrapper — they just
   duplicate the built-ins (and earlier hand-rolled copies shipped wrong column types
   and a nonexistent bit cosine opclass).
2. **Call a built-in with different arguments.** They are generic — pass your table /
   column names rather than wrapping them.
3. **Only if no built-in can do it**, deploy a new function via `deploy_function`. Make
   it **generic and reusable** (parameterise table/column names); never hard-code one
   table's name into a new function.

## What I do

Given a description of what a database function should do, I will:

1. Fetch the live OpenAPI spec from PostgREST to understand existing tables and types
2. Write a `plpgsql` or `sql` function body that satisfies the request
3. Call `deploy_function` to create/replace the function in PostgreSQL
4. Verify the new endpoint responds correctly

## Steps

### 1. Fetch the live OpenAPI spec
```bash
curl -s http://proxy:8888/ \
  -H "Host: postgrest.localhost:8888" \
  -H "Accept: application/json"
```
Inspect the `definitions` and `paths` sections to understand available tables and existing RPC functions before writing any code.

### 2. Deploy the function

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
curl -s -X POST http://proxy:8888/rpc/deploy_function \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d @/tmp/deploy_fn.json
```

Rules for `function_body`:
- Write the body between `BEGIN` and `END;` — do not include `CREATE FUNCTION` or `$$` delimiters
- Write single quotes normally: `RETURN 'ok';`, not `RETURN ''ok'';`. `deploy_function`
  wraps the body with `format(..., %L)` (see `config/postgres/init-db.sql`), which already
  quotes it as a SQL literal and doubles any inner quotes for you. Doubling them yourself
  produces `''ok''` (an empty string, then `ok`, then an empty string) and a syntax error.
- `function_name` must be lowercase alphanumeric with underscores only
- Only `plpgsql` and `sql` languages are allowed

### 3. Verify
Call the new endpoint with representative input and confirm the response is correct:
```bash
curl -s -X POST http://proxy:8888/rpc/<function_name> \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d '{ "param1": "test_value" }'
```

## Rules

- Always fetch the OpenAPI spec first — never assume table names or column types
- Prefer `RETURNS jsonb` so callers get structured output
- Use `RETURNS SETOF <table>` when the function is meant to return rows from an existing table
- If the request is ambiguous, ask one clarifying question before writing any code

## Practical Notes from Production Use

- **No auth needed**: Reached through the proxy (`http://proxy:8888` + `Host: postgrest.localhost:8888`), PostgREST accepts unauthenticated requests — the proxy injects the bearer token, so don't send an `Authorization` header. See **postgrest-api**.

- **File-based JSON payload avoids shell quoting nightmares**: Deploying functions with inline `-d '...'` strings is fragile. Writing the full JSON to a file and using `curl -d @file` is the reliable path.

- **`deploy_function` RPC works** — but reserve it for genuinely new, generic logic (see the decision order at the top).

- **Do not recreate these one-off RAG functions.** They were deployed here historically and are now superseded by the built-ins — recreating them is the anti-pattern this skill warns against:
  - `setup_rag_schema()` → instead build `rag_documents` / `rag_chunks` with the **`create_table`** RPC (use `jsonb` for `metadata`, `vector` for `embedding`).
  - `create_rag_vector_index()` → instead call the built-in **`create_vector_index(p_table_name, p_embedding_column_name)`** on the `vector(2560)` column.
