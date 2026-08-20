# Liquid Upstart — Technical Specification

Version of record: source tree at `liquidupstart@a92777d` (`0.6.2-6-ga92777d`), branch
`feature/privacy-gateway`.

This document specifies the stack's structure and control flow. For usage see `README.md`; for
conventions see `CLAUDE.md`; for the privacy service itself see
`../privacy-proxy/docs/SPECIFICATION.md`.

---

## 1. What it is

A single-host Docker Compose stack ("WebDB Playground") that assembles a data layer, application
services, a data-flow engine and AI coding agents behind one nginx reverse proxy, plus a SvelteKit
dashboard that configures, builds, starts and stops the whole thing from a browser.

Design invariants:

- **One instance per host.** The compose project is named `liquidupstart` and every container has a
  fixed `container_name` — no per-instance suffixes.
- **`.env` is the single source of configuration**, and `.env.example` is its *schema*.
- **All state is host bind mounts under `volumes/`** — never named volumes, so a reset is `rm -rf`.
- **Generated files are never edited** — `config/nginx/nginx.conf` and the per-service Dockerfiles
  are rendered from `templates/`.
- **Rootless Docker assumed**: the host user maps to container root, so containers run as root and
  no `--user $(id -u)` is used.

---

## 2. Repository layout

| Path | Contents |
|---|---|
| `compose.yml` | every service; one network `nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT}` |
| `.env.example` | the configuration schema: 11 numbered sections, comment runs as help text |
| `run.sh` | launcher — builds and runs the dashboard image, plus `--stop/--update/--cleanup/--uninstall/--version` |
| `scripts/linux/{build,start,down,cleanup}.sh` | CLI equivalents of the dashboard buttons |
| `config/scripts/build/*.sh` | per-service image builds; render Dockerfiles via `lib/dockerfile-render.sh` |
| `config/scripts/start/*.sh` | per-service pre-start preparation (config rendering, key generation) |
| `config/<service>/` | per-service configuration, `templates/`, themes, agent skills and plugins |
| `dashboard/` | SvelteKit (Svelte 5, `adapter-node`); `bun test src` |
| `volumes/` | all runtime state, browsable |
| `docs/` | this document and stack-level notes |

---

## 3. Service inventory

All services join one bridge network and are reached through the nginx `proxy` at
`http://<name>.localhost:${SYSTEM_HTTP_PORT}` (default 8888); Liquid additionally over HTTPS on
`${SYSTEM_HTTPS_PORT}` (default 8833). The proxy publishes **only on `127.0.0.1`**.

### 3.1 Data layer

| Service | Image | Role |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | application database, pgvector enabled; init SQL creates `api_user` / `api_anon` roles |
| `postgrest_app` | `postgrest/postgrest` | auto-generated REST API over the `public` schema, JWT-secured |
| `swagger` | `swaggerapi/swagger-ui` | OpenAPI browser pointed at PostgREST |
| `pgadmin` | `dpage/pgadmin4` | DB admin; servers pre-seeded from `config/pgadmin/servers.json` |
| `pgadmin_db` | `postgres:17` | pgAdmin's own metadata store, kept separate from application data |

Both Postgres instances run with `logging_collector=on` into `volumes/logs/<service>/`, which is
mounted read-only into the agent containers so an agent can read its own error messages.

### 3.2 Applications

| Service | Image | Role |
|---|---|---|
| `openproject-{db,cache,web,worker,cron,seeder}` | `openproject/*`, `postgres:17`, `memcached` | project management, six containers |
| `nextcloud` + `nextcloud-db` + `nextcloud-redis` | official images | file storage; `/var/www/html` is a bind mount (`volumes/nextcloud/html`) |
| `eurooffice` | Collabora-derived | in-browser document editing for Nextcloud |
| `bun_runner` | `liquidupstart/bun-runner:latest` | runs user-built Bun apps from `volumes/bun_app`, served at `app.localhost` |

### 3.3 Flow and agents

| Service | Image | Role |
|---|---|---|
| `liquid` | `liquidupstart/liquid:latest` | Apache NiFi-based data-flow engine, HTTPS only, single-user credentials |
| `opencode` | `liquidupstart/opencode:latest` | AI coding agent (OpenCode), server on :4096 |
| `openclaw-gateway` / `openclaw-cli` | `liquidupstart/openclaw:latest` | AI coding agent (OpenClaw) gateway plus a CLI companion |
| `privacy-proxy` | `liquidupstart/privacy-proxy:latest` | **profile-gated**, see §7 |
| `hermes` | — | **disabled**: commented out in `compose.yml`, `build.sh`, `start.sh` and the nginx template; config remains in the tree |

Five images are built locally: `opencode`, `bun-runner`, `liquid`, `openclaw`, and — only under the
privacy profile — `privacy-proxy`. `dashboard/src/lib/server/project.ts:builtImages()` lists the
first four as the prerequisite set for a start.

Both agents receive the same skill set from `config/agents/skills/` (Postgres/pgvector RAG,
PostgREST, Liquid, Nextcloud WebDAV, OpenProject) plus `config/agents/instructions.md`.

---

## 4. Reverse proxy

`config/nginx/nginx.conf` is **generated** from `config/nginx/templates/nginx.conf` by
`config/scripts/start/nginx.sh`, which substitutes `SYSTEM_HTTP_PORT` / `SYSTEM_HTTPS_PORT`. Editing
the rendered file is a no-op that survives until the next start.

Virtual hosts: a catch-all default server, then `pgadmin`, `postgrest`, `swagger`, `opencode`,
`openclaw`, `bridge.openclaw`, `msteams.openclaw`, `app`, `openproject`, `nextcloud`, `eurooffice`,
and `liquid` (HTTPS default server plus an HTTP redirect). Nextcloud gets the required
`/.well-known/{carddav,caldav}` redirects and a bypass for the Euro-Office download/track endpoints;
OpenProject gets a `^~ /custom-theme/` location served from a read-only theme mount.

**`privacy-proxy` is deliberately absent from nginx.** It is reached only container-to-container by
service name — see §7.3.

> **URL rule.** `<service>.localhost` resolves **only in the user's browser**. Server-side calls
> between containers must use the service name, or hit the `proxy` with an explicit `Host:` header.

---

## 5. Configuration model

`.env.example` is both documentation and schema. Its structure is machine-read by the dashboard:

- `# ====` banner blocks delimit **sections**; the title carries a behaviour marker.
- A contiguous run of `#` lines directly above a key is that key's **help text**.
- The value after `=` is the **default**; a trailing `# a | b | c` is preserved verbatim as an
  inline hint.

Section behaviour comes from marker suffixes in the title (`env-meta.sectionModeFromTitle`):

| Marker | Mode | Effect |
|---|---|---|
| `AUTOGENERATED ONCE IF VALUES ARE EMPTY` | `autogenerate` | blank values are filled with strong random secrets on first save |
| `DO NOT SHOW UI` | `hidden` | never rendered in the dashboard form |
| `USER CAN CHANGE ON FIRST RUN` | `normal` | shown, marked as first-run editable |
| *(none)* | `normal` | shown |

The eleven sections: 1 Networking, 2 autogenerated secrets, 3 first-run secrets, 4 script-generated
secrets (hidden), 5 shared LLM provider keys, 6 self-hosted local LLM, 7 **Privacy Proxy**, 8
OpenClaw, 9 Liquid authentication, 10 image build configuration, 11 developer options (hidden).

`SYSTEM_HTTP_PORT` / `SYSTEM_HTTPS_PORT` are empty in the example, seeded to 8888/8833 (or the next
free port) on first setup, and then **locked** — services are configured against the initial ports,
so changing them later breaks the install.

**The contract rule:** start scripts inject a root `.env` key into a service only if that service's
template already declares it. New keys go into `.env.example` first.

---

## 6. Control flow

### 6.1 `run.sh`

Resolves its own directory through symlinks, builds `liquidupstart/dashboard:latest`, finds the
first free port from 7777, runs the dashboard container and opens a browser. Ctrl-C stops the
dashboard, **not** the stack. Additional modes: `--stop` (compose down), `--update` (re-run the
hosted installer, preserving `.env` and `volumes/`), `--cleanup [--keep-images]` (full reset),
`--uninstall [--yes]`, `--version`.

### 6.2 `scripts/linux/build.sh`

Runs the per-service build scripts in order — `opencode`, `bun-runner`, `liquid`, `openclaw` — then,
**only if `PRIVACY_PROXY_ENABLE=1` in `.env`**, `config/scripts/build/privacy-proxy.sh`. All flags
(`--no-cache`) are forwarded. Each build script renders its Dockerfile from `templates/` via
`lib/dockerfile-render.sh`, substituting `__SYSTEM_DEPENDENCIES__` and appending
`POST_INSTALLATION_COMMANDS` from `.env` §10.

### 6.3 `scripts/linux/start.sh`

1. Runs the per-service start scripts: `generate_api_key`, `pgadmin`, `nextcloud`, `opencode`,
   `nginx`, `liquid`, `openclaw`.
2. Ensures the docker network exists.
3. **Privacy gate:** greps `PRIVACY_PROXY_ENABLE` out of `.env`; when `1`, appends `privacy-proxy`
   to `COMPOSE_PROFILES` and exports `PRIVACY_PROXY_URL` and `PRIVACY_GATEWAY_ANTHROPIC_URL`, both
   `http://privacy-proxy:${PRIVACY_PROXY_PORT:-8080}`.
4. `docker compose up -d`, with explicit diagnosis of host port conflicts (rootless Docker means
   another user's containers do not appear in `docker ps`).
5. Prints every service URL and credential.

### 6.4 `scripts/linux/down.sh`

Passes **every** profile (`docker compose config --profiles | paste -sd,`) so profile-gated services
stop too. A `down` without this leaves `privacy-proxy` running.

---

## 7. Privacy-proxy integration

The service's source lives in a separate, proprietary repository. This repo carries **deployment
wiring only**: a derived Dockerfile, a compose service, `.env.example` keys. Copying the source here
would violate the Apache-2.0/proprietary boundary.

### 7.1 The gate

`PRIVACY_PROXY_ENABLE=1` in the root `.env` is the single switch. The compose service carries
`profiles: ["privacy-proxy"]`, so it is invisible to `docker compose` without the exported profile —
`build.sh` skips the image, `start.sh` skips the service, `down.sh` stops it anyway.

### 7.2 The image — `config/scripts/build/privacy-proxy.sh`

Renders `config/privacy-proxy/templates/Dockerfile` and builds `liquidupstart/privacy-proxy:latest`
**on top of** `ghcr.io/nocodenation/privacy-proxy:latest`. Its only substantive job is installing
`@anthropic-ai/claude-code` when `ENABLE_ANTHROPIC_CLAUDE_CODE=1`: the released image deliberately
omits the CLI (proprietary, no redistribution grant), so it is installed on the operator's own
machine.

`PRIVACY_PROXY_DEV_SRC` (`.env` §11) redirects the base: given a path to a privacy-proxy checkout,
the script first builds `liquidupstart/privacy-proxy-base:dev` from that tree (validating that a
`Dockerfile` is present, with an `::aiw-error::` diagnostic if not) and derives from it instead of
pulling. `PRIVACY_PROXY_DEV_MODELS_EXTRA` and `PRIVACY_PROXY_DEV_SOURCE_OFFER_CONTACT` tune that
build.

### 7.3 Networking

Container-to-container by service name over the compose network. nginx is browser-only and is not on
this path. `extra_hosts` maps `${LOCAL_LLM_HOST}` to `${LOCAL_LLM_HOST_IP}` so the proxy can reach a
local LLM running on the host.

### 7.4 Mounts

| Mount | Purpose |
|---|---|
| `./volumes/privacy-proxy:/data` | the encrypted vault, its key, and `audit.jsonl` |
| `./volumes/_openclaw-claude:/root/.claude` | Claude CLI credentials, shared with the OpenClaw agent |
| `./config/agents/skills:/root/.claude/skills:ro` | the same skill set the agents get |

### 7.5 Consumers

**OpenCode** (`config/opencode/entrypoint.sh`) adds a `privacy` provider using
`@ai-sdk/openai-compatible` at `${PRIVACY_PROXY_URL}/v1` with models `private-default`,
`private-strict`, and — only when `ENABLE_ANTHROPIC_CLAUDE_CODE=1` — `private-claude`. It also sets
the Anthropic provider's `baseURL` to `PRIVACY_GATEWAY_ANTHROPIC_URL` when that is exported, routing
the native Anthropic dialect through the proxy.

**OpenClaw** (`config/scripts/start/openclaw.sh`) patches `models.providers.privacy` into
`openclaw.json` — same base URL, `apiKey: "local-no-auth"` — and allowlists a `privacy/*` model
wildcard. The generated model list is echoed at start so a misconfiguration is visible.

Note the asymmetry: OpenCode is handed `private-claude` only, while `models.py` also exposes
`private-claude-{opus,sonnet,fable}`; OpenClaw's wildcard picks up whatever `/v1/models` returns.

### 7.6 The four-place configuration contract

Every privacy-proxy setting must appear in `privacy_proxy/config.py`, `privacy-proxy/.env.example`,
this repo's `.env.example` §7, and this repo's `compose.yml` service block.
`privacy-proxy/tests/test_env_contract.py` enforces the agreement and parses both files
**positionally** — §7 by the exact header `# 7. PRIVACY PROXY`, the compose block by
`  privacy-proxy:` at that exact indent. Reformatting either breaks the test, which is the intended
tripwire.

Run it from the umbrella directory:

```bash
make -C privacy-proxy test LIQUIDUPSTART=../liquidupstart
```

A green run with *fewer* tests means the contract module skipped and the integration was never
checked.

---

## 8. Dashboard

SvelteKit with `adapter-node`, Svelte 5 runes, no CSS framework. It runs in its own container with
the project directory mounted; `ENV_DIR` defaults to the parent of `process.cwd()`.

### 8.1 Modules

| Module | Responsibility |
|---|---|
| `lib/env-file.ts` | parse `.env.example` into `Section[]` / `FieldSpec[]`; parse `.env` values; **re-render** `.env.example` with values substituted so comments, ordering and quoting are preserved. `.env`-only keys are appended verbatim. |
| `lib/env-meta.ts` | section modes from title markers; key-pattern classification for widget choice and the "needs rebuild" flag; `SYSTEM_PORT_DEFAULTS` |
| `lib/server/project.ts` | project paths (`ENV_FILE`, `EXAMPLE_FILE`, `RESULT_FILE`, `VERSION_FILE`, `REBUILD_MARKER`, `APP_PASSWORD_FILE`), `.env` read/write, `builtImages()`, docker-derived stack state, child-process spawning |
| `lib/server/origin.ts` | request-origin helpers |
| `lib/task-state.svelte.js` | client-side task/progress state |
| `lib/components/TaskRunner.svelte` | streams build/start output into the page |
| `lib/components/SecretValue.svelte` | reveal/copy for generated secrets |
| `lib/components/NextcloudAppPassword.svelte` | Nextcloud app-password flow |

### 8.2 Routes

| Route | Purpose |
|---|---|
| `/` | landing / status |
| `/config` | the generated configuration form (server load + form action) |
| `/run` (`+server.ts`) | streams `build.sh` / `start.sh` / `down.sh` output |
| `/done` | post-start summary: every URL and credential |
| `/port-check` | probes host port availability before locking `SYSTEM_*_PORT` |
| `/shutdown` | quits the dashboard container (not the stack) |
| `/app-password` | Nextcloud app password issuance |
| `/claude-auth`, `/codex-auth`, `/copilot-auth`, `/grok-auth` | agent credential capture flows |

Saving `.env` re-renders from the example, so the file the user ends up with is self-documenting.
Fields in an `autogenerate` section that are left blank are filled with strong random values on
first save; changing a key classified as build-affecting drops the `.needs-rebuild` marker.

Tests: `bun test src` — `env-file.test.ts` and `server/project.test.ts`.

---

## 9. State and reset

Everything persists under `volumes/`:

```
volumes/
  postgres/data          pgadmin_db/data        pgadmin/
  openproject_db/        nextcloud/{html,data}  nextcloud_db/
  liquid/{conf,*_repository,state,logs}
  bun_app/  data/  build_info/
  python_extensions/  nar_extensions/
  nginx/certs/
  dashboard/             (.app_password)
  _openclaw-claude/      (Claude CLI credentials)
  privacy-proxy/         (vault.enc, vault.key, audit.jsonl)
  logs/<service>/
```

`cleanup.sh` / `run.sh --cleanup` stops the stack and removes containers, `volumes/`, `.env` and the
built images (`--keep-images` preserves images and build cache).

Two directories deserve care on any reset: `volumes/privacy-proxy/` holds the plaintext↔surrogate
mapping for every conversation, and `volumes/_openclaw-claude/` holds live Claude credentials.

Nextcloud's `/var/www/html` is a bind mount by deliberate choice: the official image extracts ~30 000
small files into it on first boot, which is slow on Docker Desktop for Windows when the project sits
on a Windows filesystem — but keeping it on `volumes/` makes all state browsable and makes a reset a
directory deletion.

---

## 10. Line endings

LF everywhere, enforced at three levels: `* text=auto eol=lf` in all three repositories'
`.gitattributes`; `core.autocrlf=false` + `core.eol=lf` in each repository's local config (the global
config is `autocrlf=true`, which those overrides neutralize); and a root `.editorconfig` with
`end_of_line = lf` that also covers the submodules, neither of which has one.

CRLF in a shell script or in `.env` breaks the stack at runtime: `bash: \r: command not found`, and
the dashboard's env parser reads the `\r` as part of the value. Audit with:

```bash
git ls-files --eol | grep crlf
```
