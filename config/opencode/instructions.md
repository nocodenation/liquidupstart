# Project Instructions

This is the **WebDB Playground** — a Docker Compose environment on the
`nocodenation_all_in_wonder_network`. All `X.localhost:8888` service URLs resolve
from within this container and from the user's browser — use them everywhere.

Detailed how-tos live in skills under `~/.config/opencode/skills/`. This file is the
small, always-loaded index — environment map, global rules that apply across every
skill, and a router that says which skill to invoke for what.

---

## Services

| Service | URL | Purpose |
|---|---|---|
| `postgres` | `postgres:5432` | Postgres 17 with pgvector. User: `api_user`, DB: `postgres` |
| `postgrest_app` | `http://postgrest_app:3000` | PostgREST — REST API auto-generated from `public`; use direct container URL for your own calls |
| `pgadmin` | `http://pgadmin.localhost:8888` | pgAdmin 4 web UI |
| `swagger` | `http://swagger.localhost:8888` | Swagger UI for PostgREST |
| `opencode` | `http://opencode.localhost:8888` | OpenCode web interface |
| `bun_runner` | `http://app.localhost:8888` | SSR React app runner (serves `/app`) |
| `openproject-web` | `http://openproject.localhost:8888` | OpenProject — work packages, projects, wikis, time tracking |
| `nextcloud` | `http://nextcloud.localhost:8888` | Nextcloud file storage |
| `nifi` | `https://nifi.localhost:8888` | Apache NiFi — data flow automation, pipelines, ingress on ports 8900–8999 |

---

## Where user data lives — hard rule

**The source of truth for user files (uploads, PDFs, images, documents, books,
exports — anything the user might say "I have" or "is in the system") is Nextcloud.**

When the user asks about *what exists* — "what books are available", "list my files",
"show me the PDFs", "what data do I have", "find all images" — the answer comes from
a Nextcloud PROPFIND (see the **nextcloud-webdav** skill), **not** from `find /data`,
`ls /data`, or any other filesystem listing inside this container. Always.

`/data` is a one-way scratch mount used only when handing a *specific, named* file
from this container to an app in `/app` (see the **bun-app** skill). It is empty by
default, it does not contain the user's content, and it should never be used as a
discovery surface.

---

## URL rule — hard rule

**Only use the URLs listed in the Services table above.** No other addresses exist
as far as you are concerned.

- Never construct or use bare container hostnames such as `proxy`, `nextcloud`,
  `pgadmin`, `openproject-web`, `bun_runner`, `swagger`, or `opencode` as HTTP
  hosts — those are internal Docker names that are not in the table.
- Never use `proxy:8888` with a `Host:` header as a roundabout way to reach a
  service. Each service already has its own URL in the table; use that directly.
- For PostgREST your own `curl`/API calls use `http://postgrest_app:3000` (the
  table URL). Never quote that address to the user — point them to
  `http://swagger.localhost:8888` instead.
- Every URL you show the user must be an `X.localhost:8888` URL from the table.

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
| `$NIFI_USERNAME` | NiFi single-user login — use to generate an API bearer token |
| `$NIFI_PASSWORD` | NiFi single-user password — use to generate an API bearer token |

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
| `/logs/bun_runner` | Bun Runner — dependency install, build, and runtime logs for the app in `/app` |

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
| `bun-app` | You're creating or modifying the SSR React app in `/app` |
| `nifi-api` | You're building or managing a NiFi data flow, starting/stopping processors, setting up an HTTP ingress, or routing data between services |
