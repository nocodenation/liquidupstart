# Project Instructions

This is the **WebDB Playground** — a Docker Compose environment on the
`nocodenation_playground_network`. Services are reachable from this container by
their Docker name; user-facing surfaces are reachable from the host browser on
`localhost:81xx`.

Detailed how-tos live in skills under `~/.config/opencode/skills/`. This file is the
small, always-loaded index — environment map, global rules that apply across every
skill, and a router that says which skill to invoke for what.

---

## Services

| Service | Internal URL | External URL (browser) | Purpose |
|---|---|---|---|
| `postgres` | `postgres:5432` | — | Postgres 17 with pgvector. User: `api_user`, DB: `postgres` |
| `postgrest_app` | `http://postgrest_app:3000` | — | PostgREST — REST API auto-generated from `public` |
| `pgadmin` | `http://pgadmin:80` | `http://localhost:8100` | pgAdmin 4 web UI |
| `swagger` | `http://swagger:8080` | `http://localhost:8102` | Swagger UI for PostgREST |
| `opencode` | `http://opencode:4096` | `http://localhost:8103` | OpenCode web interface |
| `bun_runner` | `http://bun_runner:3000` | `http://localhost:8104` | SSR React app runner (serves `/app`) |
| `openproject` (via `proxy`) | `http://proxy:8105` | `http://localhost:8105` | OpenProject — work packages, projects, wikis, time tracking |
| `nextcloud` (via `proxy`) | `http://proxy:8106` | `http://localhost:8106` | Nextcloud file storage |

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

## Internal vs external URLs — hard rule

There are two URL spaces and they are **not** interchangeable:

- **Internal URLs** (`http://proxy:…`, `http://postgrest_app:3000`,
  `http://bun_runner:3000`, etc.) resolve only inside the Docker network. Use them
  for **your own outbound calls** — `curl`, HTTP clients, container-to-container.
- **External URLs** (`http://localhost:81xx`) are what the user's browser can reach.
  Use them for **anything you quote, paste, or hand back to the user** — chat replies,
  markdown links, "open this here" instructions, links embedded in OpenProject work
  packages, generated UI text, log lines a user will read.

**Hard rule:** every URL in a message *to the user* must start with
`http://localhost:`. If you're about to send a string containing `proxy:`,
`postgrest_app:`, `pgadmin:`, `swagger:`, `opencode:`, `bun_runner:`,
`openproject-web:`, or `nextcloud:` to the user, stop and rewrite to the matching
`localhost:` form using the table above.

This includes **supplementary info** — do not list "internal URL: …" or "container
URL: …" alongside an external URL "for completeness". The user does not need it and
cannot use it. The published `localhost:81xx` URL **is** the one they reach the
service on; never hedge with phrases like "may need to be configured" — the host
ports in the table above are already mapped by `docker compose`.

Wrong (user-facing): `http://proxy:8106/remote.php/dav/files/user@example.org/foo.pdf`
Right (user-facing): `http://localhost:8106/apps/files/files/12345?dir=/Documents&openfile=true&editing=false`

The boundary is **"will the user's browser load this URL?"**, not "which container is
this code in":

- Your own `curl` / HTTP-client calls from this container → **internal** (`proxy:`,
  `postgrest_app:`, etc.). The browser is not involved.
- Anything you quote, paste, or hand back to the user in chat, markdown, work-package
  descriptions, etc. → **external** (`localhost:81xx`). The browser will load it.
- **Generated bun-app code straddles both.** Server-side fetches inside the bun app
  (SSR data loading, API routes) → **internal**. URLs that end up as `src=` / `href=`
  / browser `fetch()` in the HTML/JS shipped to the browser → **external**. See the
  **bun-app** skill for the full server-vs-client pattern.

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
