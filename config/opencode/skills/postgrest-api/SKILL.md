---
name: postgrest-api
description: Make REST and RPC calls against the PostgREST API — fetch the live OpenAPI spec, query tables, call RPC functions, insert/update/delete rows. Use whenever you need to read from or write to the Postgres database via HTTP.
---

PostgREST exposes the `public` Postgres schema as a REST API at the internal URL
`http://postgrest_app:3000`. Auth is a JWT bearer token in `$POSTGREST_API_KEY` — every
request must carry it.

## Fetch the live OpenAPI spec (do this first)

The spec reflects the current schema, including any tables and RPC functions created
during this session. Always read it before constructing a request — never assume
column names or types.

```bash
curl -s http://postgrest_app:3000/ \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Accept: application/json"
```

## Query a table

```bash
curl -s http://postgrest_app:3000/<table_name> \
  -H "Authorization: Bearer $POSTGREST_API_KEY"
```

PostgREST URL-style filters apply: `?col=eq.value`, `?col=gt.1`, `?order=col.desc`,
`?limit=20`, `?offset=40`. See PostgREST docs for the full operator list.

## Call an RPC function

```bash
curl -s -X POST http://postgrest_app:3000/rpc/<function_name> \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "param1": "value1" }'
```

## Insert / update / delete

```bash
# Insert
curl -s -X POST http://postgrest_app:3000/<table_name> \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{ "col": "value" }'

# Update (filter on the URL)
curl -s -X PATCH "http://postgrest_app:3000/<table_name>?id=eq.42" \
  -H "Authorization: Bearer $POSTGREST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "col": "newval" }'

# Delete
curl -s -X DELETE "http://postgrest_app:3000/<table_name>?id=eq.42" \
  -H "Authorization: Bearer $POSTGREST_API_KEY"
```

## Rules

- Always use the internal `http://postgrest_app:3000` host for your own calls. Never
  quote the PostgREST URL back to the user — if they need to browse the API, give them
  the Swagger UI link at `http://swagger.localhost:8888`.
- Re-fetch the OpenAPI spec after any schema change in this session. PostgREST
  auto-reloads via the `pgrst_watch` event trigger, but you still need the new spec to
  construct the right request.
- For schema changes (CREATE TABLE / CREATE FUNCTION), prefer the **create-table** and
  **create-db-function** skills over raw SQL.
