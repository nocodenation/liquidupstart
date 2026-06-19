# Project Instructions

This is the **Liquid Upstart** — a Docker Compose environment on the
`nocodenation_liquid_upstart_network`. All `X.localhost:PORT` service URLs resolve
from within this container and from the user's browser — use them everywhere.

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
| `postgrest_app` | `http://postgrest_app:3000` | PostgREST — REST API auto-generated from `public`; use direct container URL for your own calls |
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

**Only use the URLs listed in the Services table above.** No other addresses exist
as far as you are concerned.

- Never construct or use bare container hostnames such as `proxy`, `nextcloud`,
  `pgadmin`, `openproject-web`, `bun_runner`, `swagger`, or `opencode` as HTTP
  hosts — those are internal Docker names that are not in the table.
- Never use `proxy:8888` (the internal nginx container name) with a `Host:` header
  as a roundabout way to reach a service. Each service already has its own URL in
  the table; use that directly.
- For PostgREST your own `curl`/API calls use `http://postgrest_app:3000` (the
  table URL). Never quote that address to the user — point them to
  `http://swagger.localhost:PORT` instead (PORT = resolved `$SYSTEM_HTTP_PORT`).
- Every URL you show the user must be an `X.localhost:PORT` URL from the table.

---

## Environment variables

These are injected into this container. Never ask the user for them, never echo their
values back in responses or logs.

| Var | Purpose |
|---|---|
| `$POSTGREST_API_KEY` | Bearer token for PostgREST calls |
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
| `liquid-api` | You're building or managing a Liquid data flow, starting/stopping processors, setting up an HTTP ingress, or routing data between services |
