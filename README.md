# Liquid Upstart

**A self-hosted data + apps + AI-agent playground you launch with one command.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)

Liquid Upstart bundles a full backend playground — a Postgres data layer with an
auto-generated REST API, project management, file storage, data-flow automation, and
AI coding agents — into a single Docker Compose stack behind one nginx reverse proxy.
A browser **dashboard** configures, builds, starts, and stops everything; you never
have to hand-edit YAML or remember a dozen URLs.

<!-- TODO: add a dashboard screenshot at docs/dashboard.png and uncomment:
![Liquid Upstart dashboard](docs/dashboard.png)
-->

## Why

Standing up a realistic environment — database, REST API, admin tools, a place to put
files, a task tracker, somewhere to run flows, and an AI agent that can actually touch
all of it — normally means stitching together a dozen containers, secrets, and reverse-proxy
rules by hand. Liquid Upstart does that wiring for you:

- **One command to run** — `./run.sh` opens a dashboard; secrets you leave blank are generated.
- **Everything on one network, one proxy** — services live at predictable `*.localhost` subdomains.
- **AI agents that know the stack** — OpenClaw / OpenCode ship with skills for the database,
  REST API, data flows, and file storage, so an agent can build against the platform out of the box.
- **Runs anywhere** — Linux, macOS, and Windows (via WSL2).

It's aimed at developers, data tinkerers, and self-hosters who want a batteries-included
sandbox they can spin up, throw away, and spin up again.

## Features

- 🚀 **One-command launch** via a SvelteKit dashboard (config form → build → start/stop → live logs).
- 🔐 **Auto-generated secrets** — empty values in `.env` are filled with strong random ones on first save.
- 🧩 **Batteries included** — Postgres + pgvector, PostgREST, Swagger, pgAdmin, OpenProject,
  Nextcloud + Collabora, Liquid (data flows), and AI agents.
- 🤖 **AI coding agents with skills** — pre-wired to Postgres/pgvector RAG, PostgREST, Liquid, Nextcloud, and OpenProject.
- 🪟 **Windows via WSL2** — run the same Linux scripts inside an Ubuntu WSL2 distro. (The legacy `.bat` toolbox wrappers are **deprecated**.)
- 💾 **Browsable state** — everything persists in host `./volumes/` bind mounts; no hidden named volumes.

## Architecture

```
        Browser ──▶ nginx proxy ──▶  *.localhost services on one Docker network
                       │
   ┌───────────────────┼───────────────────────────────────────────────┐
   │  Data             │  Apps / PM            │  Flow      │  AI agents  │
   │  Postgres+pgvector│  OpenProject          │  Liquid    │  OpenClaw   │
   │  PostgREST        │  Nextcloud+Collabora  │            │  OpenCode   │
   │  Swagger, pgAdmin │  bun_runner (apps)    │            │             │
   └───────────────────────────────────────────────────────────────────┘
```

Everything is reached through the nginx `proxy` at `http(s)://<service>.localhost:<port>`.

> **URL rule (important):** `<service>.localhost` only resolves **in your browser**.
> Calls made *between containers* (or server-side) must go through the proxy with a
> `Host:` header, e.g. `curl http://proxy:8888 -H "Host: postgrest.localhost:8888"`.

## Prerequisites

- **Linux / macOS:** Docker + Docker Compose.
- **Windows:** WSL2 with a Linux distro (Ubuntu recommended) and Docker running **inside** WSL2.
  Follow the WSL2 setup below — everything then runs as on Linux. This avoids the filesystem
  IO issues of running off the Windows filesystem.

### Windows: install WSL2 + Ubuntu first

If you're on Windows, set up WSL2 before anything else. In an **Administrator** PowerShell:

```powershell
wsl --install            # enable WSL2 (reboot when prompted)
wsl --install -d Ubuntu  # install the Ubuntu distribution
```

`wsl --install` is supposed to install Ubuntu by default, but on some Windows builds it only
enables the WSL2 feature and you have to install the distro explicitly — so run
`wsl --install -d Ubuntu` to be sure (run `wsl --list --online` to see all available distros).
After Ubuntu boots, set your Linux username/password and continue inside that Ubuntu shell.

### WSL2: one-line install

On a fresh, systemd-enabled WSL2 distro (Ubuntu/Debian, Fedora/RHEL, Arch, or openSUSE),
this bootstrap installs **rootless Docker**, applies the rootless tweaks, and downloads the
latest release into `~/.liquidupstart`:

```bash
curl -fsSL https://liquidupstart.com/install.sh | bash
```

To pin a specific version, pass it as an argument:

```bash
curl -fsSL https://liquidupstart.com/install.sh | bash -s -- 1.2.3
```

(Or, if you downloaded the script: `./install.sh 1.2.3`.)

Re-running the installer **upgrades in place** — it downloads the newer release over
`~/.liquidupstart` while leaving your `.env` and `volumes/` untouched. It records the
installed version (in `~/.liquidupstart/.liquidupstart-version`), does nothing if you already
have that version, and refuses to downgrade to an older one.

Run it as your **normal user** for rootless Docker (recommended), or as **root** to install
the system (rootful) daemon. When it finishes, `cd ~/.liquidupstart` and continue
with the Quickstart below. WSL needs systemd enabled — add `[boot]\nsystemd=true` to
`/etc/wsl.conf` and run `wsl --shutdown` first if you haven't.

### Updating

To move an existing install to the latest release:

```bash
curl -fsSL https://liquidupstart.com/update.sh | bash
```

It stops the stack, clears the built images and any leftovers from old versions, unpacks the
new release over `~/.liquidupstart` (keeping your `.env` and `volumes/`), and flags a rebuild.
On next start the dashboard prompts you to **Rebuild → Start**. If you're already on the
latest version it does nothing.

## Quickstart

1. **Run the dashboard:** `./run.sh` (on Windows, run it inside your WSL2 shell), then open the
   printed URL (first free port from `7777` up). On the first run it shows the configuration
   form (secrets left empty are generated for you); afterwards it shows the service dashboard:
   tiles with every URL & credential when the stack runs, **Build** / **Start** / **Stop**
   buttons with a live log, and a **Configuration** button to change `.env` anytime.

   *(Manual alternative: copy `.env.example` to `.env`, edit it by hand, and use the CLI scripts below.)*

2. **Or drive it from the terminal:**

   | | Build | Start | Stop | Clean rendered config |
   |---|---|---|---|---|
   | **Linux / macOS / Windows (WSL2)** | `./scripts/linux/build.sh` | `./scripts/linux/start.sh` | `./scripts/linux/down.sh` | `./scripts/linux/cleanup.sh` |

   On Windows, run these inside your WSL2 shell. The legacy `scripts\windows\*.bat` wrappers
   are **deprecated** — prefer WSL2.

   `./scripts/linux/rebuild.sh` rebuilds the custom images from scratch. `start.sh`
   prints the full list of service URLs and credentials when it finishes.

## Services

Default HTTP port is `8888` (`SYSTEM_HTTP_PORT`); Liquid is served over HTTPS on `8833`
(`SYSTEM_HTTPS_PORT`). `PORT` / `HTTPS_PORT` below are those resolved values.

| Service | URL | What it is |
|---|---|---|
| **pgAdmin** | `http://pgadmin.localhost:PORT` | pgAdmin 4 web UI for Postgres |
| **PostgREST** | `http://postgrest.localhost:PORT` | REST API auto-generated from the `public` schema |
| **Swagger** | `http://swagger.localhost:PORT` | Swagger UI for the PostgREST API |
| **OpenProject** | `http://openproject.localhost:PORT` | Work packages, projects, wikis, time tracking |
| **Nextcloud** | `http://nextcloud.localhost:PORT` | File storage (+ Collabora for online editing) |
| **App runner** | `http://app.localhost:PORT` | SSR React app host (`bun_runner`) |
| **OpenCode** | `http://opencode.localhost:PORT` | OpenCode AI agent web interface |
| **Liquid** | `https://liquid.localhost:HTTPS_PORT` | Data-flow automation (Apache NiFi-based); HTTP ingress on `https://{port}.liquid.localhost` (ports 8900–8999) |
| **Postgres** | `postgres:5432` (internal) | Postgres 17 with pgvector — user `api_user`, db `postgres` |

Four images are built locally — `liquidupstart/{opencode,bun-runner,liquid,openclaw}` —
the rest are pulled. (`hermes` exists in config but is disabled.)

## Configuration

`.env` (copied from `.env.example`) is the **single source of configuration**. The dashboard
edits it for you; you can also edit it by hand. It's organized into sections:

| Section | What it controls |
|---|---|
| 1. Networking | `SYSTEM_HTTP_PORT` / `SYSTEM_HTTPS_PORT` and the `*.localhost` scheme |
| 2. Auto-generated secrets | Internal passwords/tokens — generated automatically if left empty |
| 3. User-settable credentials | Logins you may want to set before first start |
| 4. Script-generated secrets | Managed by scripts; not shown in the UI |
| 5. LLM provider API keys | Shared keys used by the AI agents (all optional) |
| 6. OpenClaw configuration | Model & backend selection for the OpenClaw agent |
| 7. OpenCode configuration | Model, Ollama endpoint, and timeout settings |
| 8. Liquid authentication | Login + TLS keystore credentials for Liquid |
| 9. Image build configuration | Extra packages/commands baked into the custom images |

> **Contract rule:** start scripts only inject a root `.env` key into a service if that
> service's template already declares it. To add a new key, add it to `.env.example` first.

**Supported LLM provider keys** (set any you have; agents enable accordingly):
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_API_KEY`,
`GEMINI_API_KEY`, `MINIMAX_API_KEY`, `ZAI_API_KEY`, `AI_GATEWAY_API_KEY`,
`SYNTHETIC_API_KEY`, `TOKENHUB_API_KEY`, `LKEAP_API_KEY`.

## AI agents & skills

Two coding agents run inside the stack and can operate the platform directly:

- **OpenClaw** — the recommended harness (configured in `.env` section 6).
- **OpenCode** — a web-based agent UI at `opencode.localhost` (section 7).

Both ship with **skills** that encode how to use this environment:

| Skill | Purpose |
|---|---|
| `create-table`, `create-db-function` | Build Postgres schema objects |
| `postgrest-api` | Call the auto-generated REST API |
| `vector-search` | pgvector embeddings / RAG retrieval |
| `liquid`, `liquid-api` | Design and drive Liquid data flows |
| `nextcloud-webdav`, `nextcloud-user-link` | Read/write user files in Nextcloud |
| `openproject-api` | Manage projects and work packages |
| `bun-app` | Hand files to / run apps in the app runner |

Add at least one LLM provider key (section 5) to enable the agents.

## How the Windows wrappers work (deprecated)

> **Deprecated.** The `.bat` wrappers are no longer the recommended way to run on Windows —
> use WSL2 (see [Prerequisites](#prerequisites)) to avoid filesystem IO issues. They are kept
> for now but may be removed in a future release.

The `.bat` files run the exact same `.sh` scripts as Linux — no separate Windows codebase
to maintain. On first use they build a small helper "toolbox" container
(`config/win/Dockerfile.toolbox`) that has bash + the tools the scripts expect, and run the
scripts inside it against the Docker engine.

## Data & persistence

All state lives in browsable host bind mounts under `./volumes/` (Postgres data, Nextcloud
files, Liquid repositories, etc.) — there are no hidden named Docker volumes. To reset:

- `./scripts/linux/down.sh` — stop the stack (data preserved).
- `./scripts/linux/cleanup.sh` — remove rendered config (templates are re-rendered on next build).
- Delete the relevant `./volumes/<service>/` directory to wipe a service's data.

## Troubleshooting

- **Port already in use** — `run.sh` automatically picks the next free port from `7777`; for
  the stack itself, change `SYSTEM_HTTP_PORT` / `SYSTEM_HTTPS_PORT` in `.env`.
- **Browser TLS warning on `liquid.localhost`** — Liquid uses a self-signed certificate
  generated at start; accept it in the browser to proceed.
- **`*.localhost` won't resolve** — most OSes resolve `*.localhost` to `127.0.0.1` automatically;
  if yours doesn't, add the subdomains to your hosts file.
- **AI agent does nothing** — make sure at least one LLM provider key is set in `.env`.

## Contributing

Issues and pull requests are welcome. The repo conventions (autogenerated nginx config,
`.env.example` as the contract, no named volumes, minimal code comments) are documented in
[`CLAUDE.md`](CLAUDE.md).

## License

Liquid Upstart is licensed under the [Apache License 2.0](LICENSE).

This repository is an orchestration layer: the scripts, dashboard, Compose file,
Dockerfiles, and configuration are our own work. It does not bundle or
redistribute the third-party software it deploys — those components are pulled as
container images on your machine, each under its own license. Running the stack
means accepting those licenses, notably **Nextcloud (AGPL-3.0)**,
**OpenProject (GPL-3.0)**, and **Collabora Online (MPL-2.0)**. See [NOTICE](NOTICE)
for the full list.
