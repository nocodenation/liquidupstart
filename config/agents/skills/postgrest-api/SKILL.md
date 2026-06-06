---
name: postgrest-api
description: Make REST and RPC calls against the PostgREST API — fetch the live OpenAPI spec, query tables, call RPC functions, insert/update/delete rows. Use whenever you need to read from or write to the Postgres database via HTTP.
---

PostgREST exposes the `public` Postgres schema as a REST API. Reach it from inside the
containers through the nginx **proxy**: connect to `http://proxy:8888` and set
`-H "Host: postgrest.localhost:8888"` (the `X.localhost` name does not resolve in-container
— see the main instructions' **URL rule**). The proxy injects the bearer token for you,
so this endpoint requires **no authentication** — do not send an `Authorization` header.

## Fetch the live OpenAPI spec (do this first)

The spec reflects the current schema, including any tables and RPC functions created
during this session. Always read it before constructing a request — never assume
column names or types.

```bash
curl -s http://proxy:8888/ \
  -H "Host: postgrest.localhost:8888" \
  -H "Accept: application/json"
```

## Query a table

```bash
curl -s http://proxy:8888/<table_name> -H "Host: postgrest.localhost:8888"
```

PostgREST URL-style filters apply: `?col=eq.value`, `?col=gt.1`, `?order=col.desc`,
`?limit=20`, `?offset=40`. See PostgREST docs for the full operator list.

## Call an RPC function

```bash
curl -s -X POST http://proxy:8888/rpc/<function_name> \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d '{ "param1": "value1" }'
```

## Insert / update / delete

```bash
# Insert
curl -s -X POST http://proxy:8888/<table_name> \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{ "col": "value" }'

# Update (filter on the URL)
curl -s -X PATCH "http://proxy:8888/<table_name>?id=eq.42" \
  -H "Host: postgrest.localhost:8888" \
  -H "Content-Type: application/json" \
  -d '{ "col": "newval" }'

# Delete
curl -s -X DELETE "http://proxy:8888/<table_name>?id=eq.42" \
  -H "Host: postgrest.localhost:8888"
```

## Rules

- Always reach PostgREST through the proxy for your own calls — `http://proxy:8888` with
  `-H "Host: postgrest.localhost:8888"` (see the main instructions' **URL rule**). Never
  quote any PostgREST address back to the user — if they need to browse the API, give them
  the Swagger UI link at `http://swagger.localhost:PORT` (PORT = resolved `$SYSTEM_HTTP_PORT`).
- No auth header is needed — the proxy injects the bearer token, so requests through it
  are accepted unauthenticated from your side.
- Re-fetch the OpenAPI spec after any schema change in this session. PostgREST
  auto-reloads via the `pgrst_watch` event trigger, but you still need the new spec to
  construct the right request.
- For schema changes (CREATE TABLE / CREATE FUNCTION), prefer the **create-table** and
  **create-db-function** skills over raw SQL.

## Shell-quoting note for heavily-quoted curl

Keep secrets and queries referenced as `$VAR` rather than substituting literal values
inline. If you ever paste an actual token or other secret text into a command, secret-
masking can replace it with `***` mid-string, which silently corrupts shell quoting and
produces baffling `unexpected EOF while looking for matching` / `syntax error near
unexpected token` failures that look like a quoting bug but are really a masking artifact.
When a command with inline-looking secrets fails to parse, suspect masking first: rewrite
it to reference `$VAR`, or for heavily-quoted curl (nested JSON + jq) write the command to
a `.sh` file via the file tool and `bash` it, which is immune to both masking and
shell-escaping headaches.
