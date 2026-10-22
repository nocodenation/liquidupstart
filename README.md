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
- 🪟 **Windows via WSL2** — run the same Linux scripts inside an Ubuntu WSL2 distro.
- ☕ **Java extensions for Liquid** — write a NiFi processor in the workspace, run one command, and
  the running instance loads it; a controller service brings its own `pom.xml`. Checked against the
  version Liquid actually runs before anything is deployed.
- 💾 **Browsable state** — state persists in host `./volumes/` bind mounts. Liquid also keeps two
  Docker volumes, an index it rewrites and the bundles it has loaded;
  [Data & persistence](#data--persistence) says what clears them.

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

## Sandbox by design

Liquid Upstart is a prototyping sandbox. All services bind to `localhost` by default:
the stack is self-contained, and you can safely run agent tools inside it without
exposing anything to your network. It is not meant to be a production system.

> **This was not true before PR #20.** The sentence above was written on 2026-07-17 and the proxy
> published its two ports on every interface from that same day until that change merged — so for
> everyone who installed in between, the stack was reachable from the local network while this section
> said it was not. `SYSTEM_BIND_ADDRESS` in `.env` is the default now, and a test asserts the published
> address, so the promise and the behaviour cannot part company again without something going red. Set
> it to `0.0.0.0` if you need the OpenClaw node bridge or the Teams endpoint; `.env.example` says what
> that costs, and the gateway's admin identity is part of it. When a
prototype earns its keep, deploy it to [Liquid.PM](https://liquid.pm) — the managed
platform that adds security, backups, and operations, in the cloud or on-premise.

Running Liquid Upstart on a remote server anyway? Use an SSH tunnel instead of opening
ports — forward the dashboard port (`7777`) and the stack port (`8888` by default):

```bash
ssh -L 7777:localhost:7777 -L 8888:localhost:8888 user@your-server
```

Then open `http://localhost:7777` on your local machine. Add `-L` flags for any other
ports you use.

## Prerequisites

- **Linux / macOS:** Docker + Docker Compose (the one-line installer sets this up if missing).
- **Windows:** WSL2 with a Linux distro (Ubuntu recommended) and Docker running **inside** WSL2.
  Follow the WSL2 setup below — everything then runs as on Linux. This avoids the filesystem
  IO issues of running off the Windows filesystem.
- **Memory:** 16 GB RAM on Linux/macOS; 32 GB on Windows, since WSL2 itself needs a large
  share. Below these numbers the stack will not start reliably.

### Windows: install WSL2 + Ubuntu first

If you're on Windows, set up WSL2 before anything else. in a Terminal app:

```powershell
wsl --install
```

**Reboot your computer when prompted.** After the restart, open the Terminal app again and continue with:

```powershell
wsl --install -d Ubuntu 
```

> `wsl --install` is supposed to install Ubuntu by default, but on some Windows builds it only
> enables the WSL2 feature and you have to install the distro explicitly — so run
> `wsl --install -d Ubuntu` to be sure (run `wsl --list --online` to see all available distros).
> After Ubuntu boots, set your Linux username/password and continue inside that Ubuntu shell.

### One-line install (Linux / WSL2 / macOS)

```bash
curl -fsSL https://liquidupstart.com/install.sh | bash
```

The installer is deliberately boring and inspectable. What it does:

1. Sets up Docker if you do not have it — **rootless Docker Engine** on Linux/WSL2
   (Ubuntu/Debian, Fedora/RHEL, Arch, or openSUSE; systemd required), **Colima or
   Docker Desktop** via Homebrew on macOS (it asks which one).
2. Downloads the latest release into `~/.liquidupstart`.
3. Links `/usr/local/bin/liquidupstart` to `~/.liquidupstart/run.sh`, so you can start
   the dashboard from anywhere. Prefer no launcher? Skip it and run
   `~/.liquidupstart/run.sh` directly.

To pin a specific version, pass it as an argument:

```bash
curl -fsSL https://liquidupstart.com/install.sh | bash -s -- 1.2.3
```

(Or, if you downloaded the script: `./install.sh 1.2.3`.)

If Liquid Upstart is already installed (`~/.liquidupstart`), re-running the installer
automatically hands off to the **updater** below instead of reinstalling.

Run it as your **normal user** for rootless Docker (recommended), or as **root** to install
the system (rootful) daemon. WSL needs systemd enabled (Ubuntu image has it enabled by default)
— and run `wsl --shutdown` first if you haven't.

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

1. **Run the dashboard:** run `liquidupstart` from anywhere (if you installed via the
   one-line installer), or `./run.sh` from inside the project folder (on Windows, run it inside
   your WSL2 shell). Then open the printed URL (first free port from `7777` up). On the first
   run it shows the configuration form (secrets left empty are generated for you); afterwards it
   shows the service dashboard: tiles with every URL & credential when the stack runs,
   **Build** / **Start** / **Stop** buttons with a live log, and a **Configuration** button to
   change `.env` anytime. Run `liquidupstart --help` for all options.

   *(Manual alternative: copy `.env.example` to `.env`, edit it by hand, and use the CLI scripts below.)*

2. **Or drive it from the terminal:**

   | | Build | Start | Stop | Clean rendered config |
   |---|---|---|---|---|
   | **Linux / macOS / Windows (WSL2)** | `./scripts/linux/build.sh` | `./scripts/linux/start.sh` | `./scripts/linux/down.sh` | `./scripts/linux/cleanup.sh` |

   On Windows, run these inside your WSL2 shell.

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
| **NAR builder** | `nar_builder:8770` (internal) | Compiles Java extensions for Liquid, for `nar-build` in the agent containers. Refused from the host and the LAN; inside the stack network it is not limited to the agents — see [Java extensions](#java-extensions-for-liquid) |
| **Postgres** | `postgres:5432` (internal) | Postgres 17 with pgvector — user `api_user`, db `postgres` |

Five images are built locally — `liquidupstart/{opencode,bun-runner,nar-builder,liquid,openclaw}` —
the rest are pulled. (`hermes` exists in config but is disabled.)

## Configuration

`.env` (copied from `.env.example`) is the **single source of configuration**. The dashboard
edits it for you; you can also edit it by hand. It's organized into sections:

| Section | What it controls |
|---|---|
| 1. Networking | `SYSTEM_HTTP_PORT` / `SYSTEM_HTTPS_PORT`, the `*.localhost` scheme, and `SYSTEM_BIND_ADDRESS` — the host address those ports are published on, `127.0.0.1` by default |
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

### Subscription login (OAuth) or API keys?

- **Recommended: OAuth / subscription login.** If you already pay for a ChatGPT, Claude,
  or similar subscription, log in with it inside the agent after the stack starts. Flat
  monthly cost, no per-token surprises.
- **API keys are for the gaps.** Use them where OAuth is not an option — for example
  OpenAI's embeddings endpoint (needed for the `vector-search` / RAG skill, and cheap
  even without a subscription), or providers like OpenRouter that are API-only.

The `.env` section 5 configures API keys; the OAuth login happens inside the respective
agent. Both can coexist.

## Java extensions for Liquid

Liquid is Apache NiFi, so what it cannot already do you can add as a **NAR**. The stack builds them
for you, from a source directory in the agents' workspace, inside a container that holds a Maven
toolchain so you need no Java on the host.

```bash
# in an agent container (OpenClaw or OpenCode)
cd /repos/<repository>/<your-processor>
nar-build --target      # which NiFi and Java the build will target, and where that was read from
nar-build               # compile, judge, deploy
```

**Who can ask for a build.** `nar-build` posts to the builder through the proxy. The proxy refuses
the host and the LAN, so no page in the operator's browser can start one; inside the stack network
any container can, and directly on `nar_builder:8770` as well — the `X-Liquid-Agent` header the
command sends is a marker, not authentication. A shared secret for the agents is deferred, with the
reason, in `BACKLOG.md`.

**A processor builds from its source alone; anything else brings its own `pom.xml`.** Without one,
the directory needs Java under `src/main/java` and a
`src/main/resources/META-INF/services/org.apache.nifi.processor.Processor` descriptor, and
`nar-build` synthesises a processors module and a NAR module around them, with NiFi's API as
`provided` so your bundle does not carry a second copy of the framework. A controller service, or a
bundle that needs a parent NAR such as `nifi-standard-services-api-nar`, needs a `pom.xml` of its
own, and **that one is used unchanged**.

**The target is read from the running instance.** `nar-build --target` reads NiFi's and Java's
versions from the record Liquid writes on every start, and resolves the `nifi-api` that NiFi version
was built against through Maven, from `org.apache.nifi:nifi-utils`. The two differ by design: NiFi
2.11.0 ships `nifi-api` 2.10.0. A synthesised project is compiled against those; your own `pom.xml`
is compiled against what it declares, and the check below is what holds it to the running instance.

**Nothing is deployed unjudged.** Before a built bundle reaches the load path, its class references
are checked against the classes the running Liquid actually loads. `./volumes/nar_extensions` is an
**inbox**: a watcher inside the Liquid container judges every `.nar` that arrives at its top level
and copies what passes into the load path, which lives inside the container. A bundle that cannot
link is moved to `./volumes/nar_extensions/refused/`, and the refusal says which reference failed. A
new bundle is loaded within seconds, without a restart.

**Replacing or removing a loaded bundle takes a restart.** NiFi keeps a bundle it has loaded for the
life of the process, and a synthesised bundle is always version `1.0.0` — so rebuilding one that is
already loaded deploys the new file while the running Liquid goes on serving the old classes, until
`docker compose restart liquid`. Deleting a bundle from `./volumes/nar_extensions` unloads nothing:
the loaded copy is in the container's load path, an anonymous volume that survives a restart and a
recreate by `docker compose up`; after `docker compose down` the next start begins from an empty one. Taking one out means removing both copies, because every start judges the inbox again and
copies what passes back into the load path:

```bash
docker compose exec liquid ls -A /opt/nifi/nifi-current/nar_extensions
rm ./volumes/nar_extensions/<bundle>.nar
docker compose exec liquid rm -f /opt/nifi/nifi-current/nar_extensions/<bundle>.nar
docker compose restart liquid
```

A restart interrupts every flow the instance is running, which is why it is the operator's step and
never one `nar-build` takes.

**Two limits, and they are deliberate.** A single bundled dependency over **256 MiB**, or a declared
class total over **512 MiB**, is refused rather than unpacked. Native machine-learning libraries are
the realistic way to meet them — one artefact can ship binaries for four platforms — and the refusal
names both limits and the two ways out. Neither is configurable from `.env`: both are constants in
`config/liquid/narcheck.py`. The builder mounts that file, but the `liquid` image carries its own
copy, so raising one means rebuilding that image and recreating the container —
`./config/scripts/build/liquid.sh`, then `docker compose up -d liquid` — or the builder passes a
bundle the watcher then refuses.

**For light logic, prefer Python.** Liquid 2.x runs native Python processors: drop a module into
`./volumes/python_extensions` and restart the container. Reserve the NAR path for what needs Java
libraries, a controller service, or the SPI descriptor.

The design, the limits and what they refuse are in `docs/FEATURE-liquid-java-extensions.md`; the
agent-side workflow is §6.3–6.5 of the `liquid` skill.

## Data & persistence

All state lives in browsable host bind mounts under `./volumes/` (Postgres data, Nextcloud
files, Liquid repositories, etc.). Two Docker volumes are not under it, and both are Liquid's:
`liquidupstart_liquid_api`, the API index Liquid writes on every start for the NAR builder, and an
anonymous volume at its NAR load path, `/opt/nifi/nifi-current/nar_extensions`, which holds the
bundles it has loaded and is only ever added to. Deleting a directory under `./volumes/` clears
neither, so a bundle in the load path survives it. `docker compose down` leaves the load-path volume
behind, unattached, and the next start gives Liquid an empty one, into which it copies what the
inbox holds; the old one stays on disk until `docker volume prune`. `docker compose down --volumes`,
which `liquidupstart --cleanup` (`./cleanup.sh`) runs, removes both. To reset:

- `./scripts/linux/down.sh` — stop the stack (data preserved).
- `./scripts/linux/cleanup.sh` — remove rendered config (templates are re-rendered on next build).
- Delete the relevant `./volumes/<service>/` directory to wipe a service's data.
- `liquidupstart --cleanup` (or `./cleanup.sh`) — **full reset:** stops the stack and removes all
  containers, `volumes/`, `.env`, and the built images. Add `--keep-images` to keep images and
  build cache. The install itself stays in place.
- `liquidupstart --uninstall` — everything `--cleanup` does, **plus** removing the
  `liquidupstart` command and the whole install directory (`~/.liquidupstart`). Asks for
  confirmation; add `--yes` to skip the prompt. Docker itself is left installed, as is the
  `# >>> rootless docker >>>` block the installer added to your shell rc.

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
`.env.example` as the contract, state on bind mounts rather than named volumes, minimal code
comments) are documented in
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
