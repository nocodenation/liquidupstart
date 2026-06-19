# Project Instructions

This is the **Liquid Upstart** — a Docker Compose environment on the
`nocodenation_liquid_upstart_network`. The `X.localhost:PORT` service URLs below are
**user-facing** — they resolve in the user's browser. They do **not** resolve
reliably from inside these containers, so your own network calls (curl, server-side
`fetch`, a processor's HTTP request) must go through the nginx `proxy` with a `Host:`
header instead — see the **URL rule** below.

Detailed how-tos live in skills under `~/.config/opencode/skills/`. This file is the
small, always-loaded index — environment map, global rules that apply across every
skill, and a router that says which skill to invoke for what.

---

## Port resolution — hard rule

`PORT` and `HTTPS_PORT` used throughout these instructions and every skill are
**not** literal values — they must be resolved from the environment every time
before any URL is shown to the user or used in a response.

**Run these commands and use the printed values:**

```bash
PORT=$(echo $SYSTEM_HTTP_PORT)
HTTPS_PORT=$(echo $SYSTEM_HTTPS_PORT)
```

**Never** substitute a guessed or remembered default. **Never** output a URL
containing the literal text `PORT`, `HTTPS_PORT`, `${SYSTEM_HTTP_PORT}`, or
`${SYSTEM_HTTPS_PORT}` to the user.

---

## Services

`PORT` = resolved `$SYSTEM_HTTP_PORT` · `HTTPS_PORT` = resolved `$SYSTEM_HTTPS_PORT` (see above)

| Service | URL | Purpose |
|---|---|---|
| `postgres` | `postgres:5432` | Postgres 17 with pgvector. User: `api_user`, DB: `postgres` |
| `postgrest_app` | `http://postgrest.localhost:8888` | PostgREST — REST API auto-generated from `public`. For your own calls reach it through the proxy (`http://proxy:8888` + `-H "Host: postgrest.localhost:8888"`); no auth header needed — see **URL rule** |
| `pgadmin` | `http://pgadmin.localhost:PORT` | pgAdmin 4 web UI |
| `swagger` | `http://swagger.localhost:PORT` | Swagger UI for PostgREST |
| `opencode` | `http://opencode.localhost:PORT` | OpenCode web interface |
| `bun_runner` | `http://app.localhost:PORT` | SSR React app runner (serves `/bun_app`) |
| `openproject-web` | `http://openproject.localhost:PORT` | OpenProject — work packages, projects, wikis, time tracking |
| `nextcloud` | `http://nextcloud.localhost:PORT` | Nextcloud file storage |
| `liquid` | `https://liquid.localhost:HTTPS_PORT` | Liquid — data flow automation, pipelines, ingress on subdomains `https://{port}.liquid.localhost:HTTPS_PORT` (ports 8900–8999) |

---

## Where user data lives — hard rule

**The source of truth for user files (uploads, PDFs, images, documents, books,
exports — anything the user might say "I have" or "is in the system") is Nextcloud.**

When the user asks about *what exists* — "what books are available", "list my files",
"show me the PDFs", "what data do I have", "find all images" — the answer comes from
a Nextcloud PROPFIND (see the **nextcloud-webdav** skill), **not** from `find /data`,
`ls /data`, or any other filesystem listing inside this container. Always.

`/data` is a one-way scratch mount used only when handing a *specific, named* file
from this container to an app in `/bun_app` (see the **bun-app** skill). It is empty by
default, it does not contain the user's content, and it should never be used as a
discovery surface.

---

## URL rule — hard rule

There are two contexts, and they use two different forms. Get this right every time.

### A. User-facing — the `X.localhost:PORT` form

Any URL you **show the user**, and any **client-side / browser** code in a Bun app,
uses the `X.localhost:PORT` (or `https://liquid.localhost:HTTPS_PORT`) URLs from the
Services table. These resolve in the user's browser via the host port mapping. Every
URL you put in a response to the user must be one of these.

### B. Your own network calls — go through `proxy`, route with a `Host:` header

Any request that is **not** rendered to the user and **not** run in the browser — a
`curl` in a tool/shell call, a server-side `fetch()` in a Bun app, an LLM tool fetch,
a Liquid processor's HTTP call — must **not** target the `X.localhost` names directly:
they do not resolve reliably from inside the containers. Instead connect to the nginx
`proxy` container and carry the service name in a `Host:` header:

| To reach | Connect to | Add header |
|---|---|---|
| any HTTP service | `http://proxy:PORT` | `Host: <service>.localhost:PORT` |
| Liquid (HTTPS) | `https://proxy:HTTPS_PORT` (with `-k`) | `Host: liquid.localhost:HTTPS_PORT` |

`PORT` = `$SYSTEM_HTTP_PORT` (default 8888), `HTTPS_PORT` = `$SYSTEM_HTTPS_PORT`
(default 8833) — the proxy listens on those same ports internally.

The `Host:` value is a bare `hostname:port` — **no `http://` / `https://` scheme.**
nginx routes on the hostname (the `:port` part is ignored for routing and may be
omitted), so the host must be one of the service names in the table.

```bash
# PostgREST — the proxy injects the bearer token, so no auth header is needed
curl -s http://proxy:8888/ -H "Host: postgrest.localhost:8888"
curl -s http://proxy:8888/my_table -H "Host: postgrest.localhost:8888"

# Nextcloud WebDAV
curl -s -u "$PGADMIN_DEFAULT_EMAIL:$NC_APP_PASSWORD" \
  -X PROPFIND -H "Depth: 1" \
  -H "Host: nextcloud.localhost:${SYSTEM_HTTP_PORT}" \
  "http://proxy:${SYSTEM_HTTP_PORT}/remote.php/dav/files/$PGADMIN_DEFAULT_EMAIL/"

# Liquid — self-signed cert, so -k
curl -sk https://proxy:${SYSTEM_HTTPS_PORT}/nifi-api/flow/status \
  -H "Host: liquid.localhost:${SYSTEM_HTTPS_PORT}" \
  -H "Authorization: Bearer $LIQUID_TOKEN"
```

- **Never show the `proxy:PORT` address or the `Host:` header trick to the user** — it
  is a pure internal transport. User-facing links are always the `X.localhost:PORT`
  form. For the PostgREST API specifically, never quote any of its addresses to the
  user — point them at `http://swagger.localhost:PORT` (PORT = resolved
  `$SYSTEM_HTTP_PORT`; PostgREST has no UI of its own).
- **Never use bare container names** (`nextcloud:80`, `openproject-web:8080`,
  `postgrest_app:3000`, etc.) as the host for these calls. They bypass nginx — which
  means no auth-header injection (Nextcloud / OpenProject SSO) and no PostgREST bearer
  token. Always go through `proxy` so nginx adds them.

---

## Environment variables

These are injected into this container. Never ask the user for them, never echo their
values back in responses or logs.

| Var | Purpose |
|---|---|
| `$PGADMIN_DEFAULT_EMAIL` | Nextcloud WebDAV username (also pgAdmin SSO email) |
| `$OPENCODE_EMBEDDING_HOST` | Base URL of the OpenAI-compatible embedding server |
| `$OPENCODE_EMBEDDING_MODEL` | Embedding model name |
| `$LIQUID_USERNAME` | Liquid single-user login — use to generate an API bearer token |
| `$LIQUID_PASSWORD` | Liquid single-user password — use to generate an API bearer token |
| `$SYSTEM_HTTP_PORT` | External HTTP port — resolve with `echo $SYSTEM_HTTP_PORT`; use the result as `PORT` in every URL |
| `$SYSTEM_HTTPS_PORT` | External HTTPS port — resolve with `echo $SYSTEM_HTTPS_PORT`; use the result as `HTTPS_PORT` in every Liquid URL |

---

## Logs

When asked about logs, check `/logs`:

| Path | Service |
|---|---|
| `/logs/postgres` | PostgreSQL |
| `/logs/pgadmin_db` | pgAdmin metadata DB |
| `/logs/pgadmin` | pgAdmin web UI |
| `/logs/proxy` | nginx reverse proxy |
| `/logs/swagger` | Swagger UI |
| `/logs/bun_runner` | Bun Runner — dependency install, build, and runtime logs for the app in `/bun_app` |

---

## Skills — when to use which

Invoke the relevant skill when the task matches; don't try to reconstruct its content
from memory.

| Skill | Use it when… |
|---|---|
| `postgrest-api` | You need to query, insert, update, delete from a Postgres table, or call any RPC, via HTTP |
| `create-table` | You're asked to create a new table |
| `create-db-function` | You're asked to add a new database function |
| `vector-search` | You're embedding text, indexing vectors, or doing similarity search |
| `openproject-api` | You're touching work packages, projects, queries, users, time entries (read or write) |
| `nextcloud-webdav` | You're reading, writing, listing, or deleting a file in Nextcloud |
| `nextcloud-user-link` | You need to give the user a link to a Nextcloud file/folder, or embed a Nextcloud reference in a chat reply or a work package |
| `bun-app` | You're creating or modifying the SSR React app in `/bun_app` |
| `liquid-api` | You need the Liquid REST API mechanics — auth token, CRUD calls, starting/stopping processors, setting up an HTTP ingress, routing data between services, or the user-facing canvas/ingress links |
| `liquid` | You're **designing or building** a Liquid flow — laying out processors/funnels/connections, termination & cleanup rules, visual layout standards, or building and deploying a custom processor / NAR (pairs with `liquid-api` for the actual calls) |
