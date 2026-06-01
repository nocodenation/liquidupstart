# Project Instructions

## Environment

This is the **WebDB Playground** — a Docker Compose environment running inside the
`nocodenation_playground_network`. All services below are reachable from this
container by their Docker service name.

---

## Services

| Service | Internal URL                                                  | Purpose |
|---|---------------------------------------------------------------|---|
| `postgres` | `postgres:5432`                                               | Main PostgreSQL 17 database (pgvector). User: `api_user`, DB: `postgres` |
| `postgrest_app` | `http://postgrest_app:3000`                                   | PostgREST — REST API auto-generated from the `public` schema |
| `pgadmin` | `http://pgadmin:80`                                           | pgAdmin 4 web UI |
| `proxy` | `http://proxy:8100` (pgAdmin), `http://proxy:8101` (PostgREST) | nginx reverse proxy |
| `swagger` | `http://swagger:8080`                                         | Swagger UI for PostgREST OpenAPI spec |
| `openproject` (via `proxy`) | `http://proxy:8105`                                 | OpenProject — work packages, projects, wikis, time tracking (API v3 at `/api/v3`) |

External ports on the host: pgAdmin → 8100, PostgREST → 8101, Swagger → 8102, OpenCode → 8103, OpenProject → 8105.

---

## Authentication

All PostgREST requests require a JWT bearer token. It is available as an environment variable:

```bash
echo $POSTGREST_API_KEY
```

Use it as: `Authorization: Bearer <token>`

---

## PostgREST API

### Fetch the OpenAPI spec

Always fetch the live spec before constructing any request — it reflects the current
database schema including all user-created tables and functions.

```bash
curl -s http://postgrest_app:3000/ \
  -H "Authorization: Bearer <token>" \
  -H "Accept: application/json"
```

### Call an RPC function

```bash
curl -s -X POST http://postgrest_app:3000/rpc/<function_name> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ ...params... }'
```

### Query a table

```bash
curl -s http://postgrest_app:3000/<table_name> \
  -H "Authorization: Bearer <token>"
```

---

## Built-in RPC Functions

### `create_table` — create a new table

```bash
curl -s -X POST http://postgrest_app:3000/rpc/create_table \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_table_name": "my_table",
    "p_columns": {"id": "seqnumber", "name": "string", "score": "number", "created_at": "datetime"},
    "p_primary_keys": ["id"]
  }'
```

Supported column types: `string` → text, `number` → numeric, `datetime` → timestamp,
`vector` → vector(4096), `seqnumber` → numeric with auto-increment sequence.
See the **Embeddings** section below for how `vector` columns are populated.

### `create_vector_index` — add an HNSW index on a vector column

```bash
curl -s -X POST http://postgrest_app:3000/rpc/create_vector_index \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "my_table", "p_embedding_column_name": "embedding"}'
```

### `find_closest_vectors` — K-nearest-neighbour search over a `vector` column

Two-stage similarity search over any table with a `vector(4096)` column:
1. Fast pre-filter using pgvector's binary-quantized HNSW index (Hamming distance)
   to fetch `p_k * p_rerank_factor` candidates.
2. Rerank those candidates by exact cosine distance, returning the top `p_k`.

`p_query` is a pgvector literal `"[v1,v2,...,v4096]"` of 4096 floats — the raw
embedding output (no binarization needed; see the **Embeddings** section).

```bash
curl -s -X POST http://postgrest_app:3000/rpc/find_closest_vectors \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"p_table_name": "docs", "p_embedding_column": "embedding", "p_query": "[0.12,-0.34,...]", "p_k": 5, "p_rerank_factor": 4}'
```

`p_rerank_factor` defaults to 4 (so 20 binary candidates → 5 cosine-reranked
results); raise it for better recall at the cost of more cosine computations.

Returns a JSON array of the `p_k` nearest rows — the embedding column is omitted
and a `distance` field (cosine, lower = more similar) is added.

### `deploy_function` — create or replace a PostgreSQL function and expose it via PostgREST

This is the primary way to add new database functions at runtime without direct DB access.
The new function is immediately available as `POST /rpc/<function_name>`.

```bash
curl -s -X POST http://postgrest_app:3000/rpc/deploy_function \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "function_name": "my_function",
    "function_params": "p_input text",
    "return_type": "jsonb",
    "function_language": "plpgsql",
    "function_body": "BEGIN\n  RETURN jsonb_build_object(''result'', p_input);\nEND;",
    "replace_existing": true
  }'
```

Constraints: `function_name` must be lowercase alphanumeric + underscores; only
`plpgsql` and `sql` languages are allowed. The new function is automatically owned
by `api_user` so PostgREST exposes it immediately (schema reload is automatic via
the `pgrst_watch` event trigger).

**Workflow when asked to "create a function":**
1. Fetch the OpenAPI spec to understand existing tables and types.
2. Draft the function body.
3. Call `deploy_function` to create it.
4. Verify by calling the new endpoint: `POST /rpc/<function_name>`.

---

## Embeddings

A text-embedding model runs on a separate server and is reachable from this
container via an OpenAI-compatible API. The endpoint and model name are
environment variables:

```bash
echo $OPENCODE_EMBEDDING_HOST    # e.g. http://embedding_host:8801
echo $OPENCODE_EMBEDDING_MODEL   # e.g. llama-embed-nemotron-8b
```

The model returns **4096-dimensional** float vectors. They are stored as
`vector(4096)` — the raw floats — and pgvector applies **binary quantization at
index time** via an expression HNSW index over `binary_quantize(embedding)::bit(4096)`.
This sidesteps HNSW's 2000-dim limit on the `vector` type (the `bit` type supports
up to 64000 dims) while keeping the full vectors available for cosine reranking.

### Generate an embedding

```bash
curl -s -X POST "$OPENCODE_EMBEDDING_HOST/v1/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\": \"$OPENCODE_EMBEDDING_MODEL\", \"input\": \"text to embed\"}" \
  | jq -r '(.data[0].embedding // .embedding) | "[" + (map(tostring) | join(",")) + "]"'
```

This prints a pgvector literal `"[v1,v2,...,v4096]"` — store it directly in a
`vector` column. The `(.data[0].embedding // .embedding)` filter accepts both
OpenAI-style (`/v1/embeddings`) and llama.cpp-native (`/embedding`) response shapes.

### Vector search workflow

1. Create a table with a `vector` column (`create_table` maps `vector` → `vector(4096)`):
   ```json
   {"p_table_name": "docs", "p_columns": {"id": "seqnumber", "content": "string", "embedding": "vector"}, "p_primary_keys": ["id"]}
   ```
2. For each row, embed its text and insert the resulting `"[v1,v2,...]"` literal
   into the `embedding` column. No binarization on the client side.
3. Add an HNSW index with `create_vector_index` — it indexes
   `binary_quantize(embedding)::bit(4096)` with `bit_hamming_ops` so the 4096-dim
   `vector` column is searchable despite HNSW's 2000-dim limit on float vectors.
4. To search, embed the query text the same way, then call `find_closest_vectors`
   with the vector literal. It does a two-stage search: binary Hamming prefilter
   for speed, exact cosine rerank for precision.
   ```bash
   curl -s -X POST http://postgrest_app:3000/rpc/find_closest_vectors \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d "{\"p_table_name\": \"docs\", \"p_embedding_column\": \"embedding\", \"p_query\": \"$VEC\", \"p_k\": 5}"
   ```
   It returns the nearest rows ordered by `distance` (cosine; lower = more similar).

---

## OpenProject API

OpenProject exposes a HAL+JSON REST API (v3) at `http://proxy:8105/api/v3`.
Use it for work packages, projects, users, wikis, time entries, queries, and attachments.

### Authentication — ask the user for an API token

The OpenProject API requires a per-user API token. **You do not have one by default.**
The first time you need to call the OpenProject API in a session, ask the user to provide
one with this exact wording:

> I need an OpenProject API token to call the OpenProject API on your behalf.
> Open OpenProject (http://localhost:8105) → click your avatar (top-right) → **Account settings**
> → **Access tokens** → **API** → **+ Generate** (or copy an existing one), then paste the
> token here. I will keep it only for this session.

Once the user provides it, keep it in memory for the rest of the session — do not write it
to disk and do not echo it back in responses or logs.

The token is used as HTTP Basic Auth with the **literal** username `apikey` and the token
as the password. Most tools accept the `user:password` form directly:

```bash
# $OP_TOKEN is the value the user pasted
curl -s -u "apikey:$OP_TOKEN" \
  -H "Accept: application/json" \
  http://proxy:8105/api/v3
```

If the user has not yet provided a token and is not available to ask (e.g. an autonomous
run), stop and report that an OpenProject API token is required before continuing — do not
attempt to call the API anonymously or invent a token.

### Discovering endpoints

The API root returns a HAL document linking to every available collection. Start there
when unsure which endpoint to use:

```bash
curl -s -u "apikey:$OP_TOKEN" http://proxy:8105/api/v3 | jq '._links | keys'
```

Common endpoints:

| Resource | Path |
|---|---|
| Projects | `GET /api/v3/projects` |
| Work packages (global) | `GET /api/v3/work_packages` |
| Work packages in a project | `GET /api/v3/projects/{id}/work_packages` |
| Single work package | `GET /api/v3/work_packages/{id}` |
| Users | `GET /api/v3/users` |
| Current user | `GET /api/v3/users/me` |
| Statuses / Types / Priorities | `GET /api/v3/statuses`, `/types`, `/priorities` |
| Time entries | `GET /api/v3/time_entries` |

### Filtering, paging, sorting

`filters` is a JSON-encoded array of filter objects. URL-encode it before sending.

```bash
# All open work packages in project 3, page 1, 25 per page, newest first
curl -s -u "apikey:$OP_TOKEN" \
  --get http://proxy:8105/api/v3/projects/3/work_packages \
  --data-urlencode 'filters=[{"status_id":{"operator":"o","values":[]}}]' \
  --data-urlencode 'pageSize=25' \
  --data-urlencode 'offset=1' \
  --data-urlencode 'sortBy=[["updatedAt","desc"]]'
```

### Creating a work package

OpenProject uses HAL `_links` to reference related resources (project, type, status, etc.)
by their API URI. `Content-Type` **must** be `application/json`.

```bash
curl -s -u "apikey:$OP_TOKEN" \
  -X POST http://proxy:8105/api/v3/projects/3/work_packages \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "New task from OpenCode",
    "description": {"format": "markdown", "raw": "Created via API."},
    "_links": {
      "type":     {"href": "/api/v3/types/1"},
      "priority": {"href": "/api/v3/priorities/8"}
    }
  }'
```

### Updating a work package

Updates require the current `lockVersion` (optimistic concurrency). Fetch the work package
first, then PATCH with the `lockVersion` you received:

```bash
curl -s -u "apikey:$OP_TOKEN" \
  -X PATCH http://proxy:8105/api/v3/work_packages/42 \
  -H "Content-Type: application/json" \
  -d '{
    "lockVersion": 7,
    "subject": "Updated subject",
    "_links": {"status": {"href": "/api/v3/statuses/3"}}
  }'
```

### Response shape

Every response is HAL+JSON: payload fields at the top level, related-resource URIs under
`_links`, and embedded sub-resources under `_embedded`. Collections expose items at
`_embedded.elements` and paging info at the top level (`total`, `count`, `pageSize`,
`offset`).

```bash
curl -s -u "apikey:$OP_TOKEN" http://proxy:8105/api/v3/work_packages \
  | jq '._embedded.elements[] | {id, subject, status: ._links.status.title}'
```

### Errors

Errors return a HAL document with `_type: "Error"`, an `errorIdentifier`, and a
human-readable `message`. `422` typically means a validation failure (check `_embedded.details`).
`409` on PATCH means the `lockVersion` is stale — re-fetch the resource and retry.

---

## Logs

When asked about logs for any service, check `/logs`:

| Path               | Service                                                                            |
|--------------------|------------------------------------------------------------------------------------|
| `/logs/postgres`   | PostgreSQL                                                                         |
| `/logs/pgadmin_db` | pgAdmin metadata database                                                          |
| `/logs/pgadmin`    | pgAdmin web UI                                                                     |
| `/logs/proxy`      | nginx reverse proxy                                                                |
| `/logs/swagger`    | Swagger UI                                                                         |
| `/logs/bun_runner` | Bun Runner (Node Application, Bun Application, UI, Bun UI, Built Application) logs |

---

## Application

When asked to create or update application, UI, node app, bun app or something like that - create an SSR React application and put that into `/app` folder.
Each edit should increase "version" in `package.json` file of that app.
If user asks about issues of the application check logs located in `/logs/bun_runner` the see issues with installing dependencies, building application or running application
When working (creating or modifying) with `package.json` file - put it into `/tmp/package.json` first, and only when all creations and edits are done copy it to `/app/package.json` - it should be the last file edited (or created) in `/app`.
`/data` directory, that is mounted to this container, is also mounted as `/data` to a nodejs app runner container.
---

## Data

When asked about working or manipulating any data (For example, reading PDFs, images, etc), check `/data` directory. This directory is used by user to upload files for you and for node application runner
