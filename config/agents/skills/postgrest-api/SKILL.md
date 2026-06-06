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
  the Swagger UI link at `http://swagger.localhost:PORT` (PORT = resolved `$SYSTEM_HTTP_PORT`).
- Re-fetch the OpenAPI spec after any schema change in this session. PostgREST
  auto-reloads via the `pgrst_watch` event trigger, but you still need the new spec to
  construct the right request.
- For schema changes (CREATE TABLE / CREATE FUNCTION), prefer the **create-table** and
  **create-db-function** skills over raw SQL.

## JWT Authentication Pitfalls & Workarounds

The `$POSTGREST_API_KEY` environment variable contains a JWT that may have formatting issues:

- **Malformed JWT**: In this environment the JWT sometimes has only 2 parts (missing signature segment) or contains invisible newlines. PostgREST may reject it with cryptic errors like `JWT cryptographic operation failed` or `Expected 3 parts in JWT; got 4` / `got 2`.

- **Reliable pattern (bash)**: Use `printenv POSTGREST_API_KEY` to capture the raw value without trailing newlines, then interpolate directly into the curl command:
  ```bash
  KEY=$(printenv POSTGREST_API_KEY)
  curl -s "http://postgrest_app:3000/rag_chunks?select=content&limit=10" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json"
  ```

- **Avoid**: Writing the key to a file and reading it back via command substitution (`$(cat key.txt)`) — this often introduces a trailing newline that breaks the JWT structure.

- **Python subprocess**: When using Python's `subprocess.run()`, pass the key as a list element (not shell=True) to avoid shell escaping issues:
  ```python
  auth = 'Authorization: Bearer *** + os.environ.get('POSTGREST_API_KEY', '')
  subprocess.run(['curl', '-s', url, '-H', auth, '-H', 'Content-Type: application/json'], ...)
  ```

- **Verify auth works first**: Before complex RPC calls, test with a simple `GET /rag_chunks?limit=1` to confirm the JWT is accepted.

- **Never paste secret VALUES inline — reference the env var by name.** Keep the literal
  command as `-H "Authorization: Bearer $KEY"` (or `$POSTGREST_API_KEY`) and let the
  shell expand it. If you ever substitute the actual token text into a command, secret-
  masking can replace it with `***` mid-string, which silently corrupts shell quoting and
  produces baffling `unexpected EOF while looking for matching` / `syntax error near
  unexpected token` failures that look like a quoting bug but are really a masking
  artifact. Same applies to embedding queries and any other secret. When a command with
  inline-looking secrets fails to parse, suspect masking first: rewrite it to reference
  `$VAR`, or for heavily-quoted curl (nested JSON + jq) write the command to a `.sh`
  file via the file tool and `bash` it, which is immune to both masking and shell-escaping
  headaches.
