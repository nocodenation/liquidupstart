# Hermes Agent — Custom Skills, Tools & Instructions

Research into how the **Hermes Agent** (`nousresearch/hermes-agent`, the `hermes`
service in `compose.yml`) supports customization, and how the existing **OpenCode**
skills/tools/instructions in `config/opencode/` map onto it.

Findings are based on the **running container** (`docker exec hermes …`, image built
2025‑06‑02, source under `/opt/hermes`), its bundled documentation skills
(`hermes-agent-skill-authoring`, `native-mcp`), and the official plugin guide:
`https://hermes-agent.nousresearch.com/docs/guides/build-a-hermes-plugin`.

---

## TL;DR

| Concept | OpenCode | Hermes | Portability |
|---|---|---|---|
| **Instructions** | `instructions.md` referenced in `opencode.json` | `SOUL.md` (persona) + `config.yaml` (`personalities`, behavior) | Persona ports to `SOUL.md`; the env/URL "rule book" is better expressed as a Hermes **skill** |
| **Skills** | `skills/<name>/SKILL.md` (Anthropic Agent‑Skills format) | `skills/<category>/<name>/SKILL.md` (**same** Agent‑Skills format, richer frontmatter) | **Near 1:1** — add a `metadata.hermes` block, adjust env var names |
| **Tools** | TypeScript `@opencode-ai/plugin` `tool()` modules | **Python plugins** (`plugin.yaml` + `register(ctx)` → `ctx.register_tool(...)`) — the direct analog. Also: MCP servers, skill‑bundled `scripts/`, built‑in `terminal`/`code_execution` | **Conceptual 1:1**, but a **TS→Python rewrite** |

**Headline:** Hermes natively speaks the same `SKILL.md` "Agent Skills" standard as
OpenCode (and Claude Code) — the 9 OpenCode skills are almost directly reusable. And
contrary to an earlier draft of this doc, Hermes **does** have a first‑class custom‑tool
mechanism: the **plugin system** (`~/.hermes/plugins/<name>/`), which is the true
counterpart to OpenCode's `@opencode-ai/plugin` `tool()` modules. The two OpenCode
*tools* (`text_extensions.ts`, `ingest_pdf.ts`) port as a **Hermes plugin** — same
shape (name, description, JSON‑schema args, handler), rewritten from TypeScript to
Python.

---

## 1. How the Hermes service is wired today

From `compose.yml` (service `hermes`, lines ~605‑624):

```yaml
hermes:
  image: nousresearch/hermes-agent
  container_name: hermes
  volumes:
    - ./volumes/hermes:/opt/data        # ← single data/state volume
  environment:
    API_SERVER_ENABLED: true
    API_SERVER_HOST: 0.0.0.0
    API_SERVER_KEY: ${HERMES_API_KEY}
    API_SERVER_CORS_ORIGINS: '*'
    HERMES_DASHBOARD: 1
    HERMES_DASHBOARD_TUI: 1
    HERMES_DASHBOARD_INSECURE: 1
  command: ["gateway", "run"]
  ports:
    - "8642:8642"   # API / gateway
    - "9119:9119"   # dashboard
```

Key runtime facts discovered in the container:

- The **`hermes` user** (`uid 10000`) has home `**/opt/data**`. Everything the docs
  call `~/.hermes/...` therefore resolves to `**/opt/data/...**`, which is the mounted
  volume. **All customization is reachable from the host at `volumes/hermes/`.**
- `command` is `gateway run` — it runs the multi‑platform gateway (API server + any
  configured chat platforms), not the interactive TUI.
- It is currently **un‑customized**: `SOUL.md` is the stock commented template,
  `config.yaml` is the stock 60 KB default, no `mcp_servers`, no user skills, empty
  `memories/`.
- Runtimes available inside the image: **Node v22**, **Python 3.13** (`/opt/hermes/.venv`),
  **`uvx`/`npx`**. The Python `mcp` package is **not** installed yet (needed for the
  native MCP client — `pip install mcp`).

### `/opt/data` layout (the customization surface)

```
/opt/data/
├── config.yaml          # main config (model, toolsets, skills, mcp_servers, memory…)
├── SOUL.md              # persona / tone — loaded fresh every message
├── skills/              # bundled skill library, by category (see §3)
│   ├── <category>/<skill>/SKILL.md  (+ references/ templates/ scripts/ assets/)
│   └── .bundled_manifest            # checksum manifest of shipped skills
├── hooks/               # lifecycle hooks
├── cron/                # scheduled-job state (cronjob tools)
├── memories/            # long-term memory store (empty today)
├── kanban.db            # built-in kanban/task tool state
├── home/  workspace/    # agent working dirs
├── sessions/ plans/ pairing/ skins/
└── logs/                # gateway.log, agent.log, errors.log, …
```

---

## 2. Instructions

### OpenCode model
`config/opencode/entrypoint.sh` writes `opencode.json` with
`"instructions": ["/opencode/instructions.md"]`, and `instructions.md` is mounted
read‑only. That one file is the always‑loaded "environment map + global rules +
skill router."

### Hermes model
Hermes splits "instructions" across three places:

1. **`SOUL.md`** (`/opt/data/SOUL.md`) — persona and tone. *"This file is loaded
   fresh each message — no restart needed."* It is meant for *personality*, not a
   large rule book. Stock content is an empty commented template.

2. **`config.yaml › agent.personalities`** + the `/personality` command — named
   personas selectable at runtime (helpful, concise, technical, …). `reasoning_effort`,
   `max_turns`, `verbose`, etc. also live here.

3. **Skills** — the right home for procedural/global rules (the OpenCode
   `instructions.md` "Services table / URL rules / env‑var table / skill router" is
   really a *skill*, not a persona). Hermes loads skill *descriptions* into context and
   pulls the full `SKILL.md` on demand.

> **Mapping:** Put a short project identity/tone in `SOUL.md`. Convert the body of
> `config/opencode/instructions.md` (the environment map, port‑resolution rule, URL
> rule, env‑var table, "where user data lives" rule) into a **`webdb-playground`
> skill** (or a `references/environment.md` shared by the other skills). Don't dump
> the whole rule book into `SOUL.md` — that's not what it's for.

---

## 3. Skills — the strongest alignment

Hermes' skill system **is** the Anthropic "Agent Skills" standard, the same one
OpenCode uses. Both expect `SKILL.md` with YAML frontmatter and a markdown body, and
both support a per‑skill directory of supporting files.

### Two skill trees (both honored at load time)

| Tree | Path (in container) | Host path | Purpose |
|---|---|---|---|
| **Bundled** | `/opt/data/skills/<category>/<name>/` | `volumes/hermes/skills/` | Ships with the image; curated, has `.bundled_manifest` |
| **User‑local** | `~/.hermes/skills/<name>/` → `/opt/data/skills/` | same volume | Created via the `skill_manage` tool |
| **External (read‑only)** | any path in `config.yaml › skills.external_dirs` | a host dir you mount | **Share skills without copying into the data volume** ← best fit for us |

From `config.yaml`:

```yaml
skills:
  creation_nudge_interval: 15
  # external_dirs:
  #   - ~/.agents/skills
  #   - /home/shared/team-skills
```

> `external_dirs` is the clean way to inject our own skills: mount a host directory
> read‑only and point `external_dirs` at it. *"External dirs are read‑only; skill
> creation always writes to `~/.hermes/skills/`. Local skills take precedence when
> names collide."*

### Required frontmatter (validated by `tools/skill_manager_tool.py`)

Hard requirements: file **starts at byte 0 with `---`**, closes with `\n---\n`,
parses as a YAML mapping, has `name` and `description` (`description ≤ 1024 chars`),
non‑empty body, total file `≤ 100 000 chars`. Peer‑matched shape:

```yaml
---
name: my-skill-name            # lowercase, hyphens, ≤64 chars
description: Use when <trigger>. <one-line behavior>.   # ≤1024 chars
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [short, descriptive, tags]
    related_skills: [other-skill]
platforms: [linux, macos, windows]
---
```

`version/author/license/metadata/platforms` are **not** enforced but every shipped
skill has them.

### OpenCode → Hermes frontmatter diff

OpenCode skills (e.g. `config/opencode/skills/postgrest-api/SKILL.md`) use only:

```yaml
---
name: postgrest-api
description: Make REST and RPC calls against the PostgREST API …
---
```

To port: **keep `name`+`description` as‑is, append the `metadata.hermes` /
`version` / `author` / `license` block.** The markdown body (curl recipes, rules)
needs only env/URL touch‑ups (§5).

### Supporting files & where the logic can live
Shipped skills bundle real code under `scripts/` — e.g.
`skills/productivity/google-workspace/scripts/{google_api.py, gws_bridge.py}`. A
skill's `SKILL.md` tells the agent to **run** those scripts via the `terminal` /
`code_execution` tool. This is the pattern we reuse to port `ingest_pdf.ts` (§4).

### Authoring/management
- `skill_manage` tool: `create` (writes to `~/.hermes/skills/`), `patch`, `edit`,
  `write_file` (enforces a `references/ templates/ scripts/ assets/` subdir allowlist).
- **Gotcha:** the skill loader is initialized at session start — a newly added skill
  is **not visible in the current session**, only in a fresh one. Not a bug.

### Bundled skill catalog (context for what already exists)
26 categories under `/opt/data/skills/`, ~90 skills, including: `software-development/*`
(github‑*, codebase‑inspection, codex, claude-code, hermes‑agent‑skill‑authoring),
`mcp/native-mcp`, `productivity/*` (google-workspace, notion, linear, airtable,
ocr-and-documents, nano-pdf), `data-science/jupyter-live-kernel`, `research/arxiv`,
`devops`, `red-teaming`, `creative/*`, `social-media/xurl`, `smart-home/openhue`, etc.
**Check for overlap before porting** (e.g. `nano-pdf`/`ocr-and-documents` overlap
with our `ingest_pdf`).

---

## 4. Tools — the plugin system (the real analog)

> **Correction:** an earlier draft claimed Hermes had "no equivalent plugin slot."
> That was wrong. Hermes has a full **plugin system** documented at
> `https://hermes-agent.nousresearch.com/docs/guides/build-a-hermes-plugin` and
> present in the running image. It is the direct counterpart to OpenCode's tool
> plugins. The reason my filesystem sweep missed it: **no user plugins are installed
> yet** (`~/.hermes/plugins/` doesn't exist), and the bundled ones live under the
> source tree, not the data volume.

### OpenCode model
Custom tools are TypeScript modules using `@opencode-ai/plugin`:

```ts
import { tool } from "@opencode-ai/plugin"
export default tool({ description, args: { … }, async execute(args, ctx) { … } })
```

Dropped into `/root/.config/opencode/tools/`, declared in `package.json`. We have two:
`text_extensions.ts` (trivial "is this a text file") and `ingest_pdf.ts` (substantial:
PDF→text→chunk→embed→PostgREST RAG insert).

### Hermes model — **Python plugins** (preferred path)
A plugin is a **Python package** that registers custom **tools, hooks, slash
commands, CLI subcommands, and/or skills** through a `register(ctx)` entry point.

**Locations (verified in the container):**

| Tree | Path (in container) | Host path | Notes |
|---|---|---|---|
| **User** | `~/.hermes/plugins/<name>/` → `/opt/data/plugins/<name>/` | `volumes/hermes/plugins/` | On the mounted volume — drop‑in target. Empty today. |
| **Bundled** | `/opt/hermes/plugins/<name>/` | — (in image) | e.g. `disk-cleanup`, `google_meet`, `kanban`, `memory`, `image_gen`, `context_engine`, `platforms/*` |
| **pip** | installed package w/ entry point | — | `[project.entry-points."hermes_agent.plugins"]` → auto‑discovered at startup |

**Plugin directory layout** (matches bundled `disk-cleanup`):

```
~/.hermes/plugins/pdf-rag/
├── plugin.yaml      # manifest: name, version, description, provides_tools, hooks, requires_env
├── __init__.py      # register(ctx) — wires schemas→handlers, registers hooks/commands/skills
├── schemas.py       # JSON-schema tool definitions (what the LLM sees)
└── tools.py         # handlers: def handler(args: dict, **kwargs) -> str   (must return a JSON string)
```

`plugin.yaml` (verified shape):

```yaml
name: pdf-rag
version: 1.0.0
description: "Ingest a PDF/folder into the PostgREST RAG store (chunk + embed + insert)."
provides_tools:
  - ingest_pdf
requires_env:                 # optional — gates install, prompts interactively
  - name: POSTGREST_API_KEY
    description: "Bearer token for PostgREST"
    secret: true
```

`__init__.py` registration API (`ctx.*`):

```python
from . import schemas, tools

def register(ctx):
    ctx.register_tool(
        name="ingest_pdf",
        toolset="pdf-rag",            # groups the tool; appears as a selectable toolset
        schema=schemas.INGEST_PDF,    # {"name","description","parameters": <JSON Schema>}
        handler=tools.ingest_pdf,     # def handler(args: dict, **kwargs) -> str
        # check_fn=lambda: bool(os.getenv("OPENCODE_EMBEDDING_HOST")),  # hide if unavailable
        # override=True,              # only to replace a built-in tool
    )
    # ctx.register_hook("post_tool_call", fn)
    # ctx.register_command("ingest", handler=..., description=...)   # in-session /ingest
    # ctx.register_cli_command(name="pdf-rag", setup_fn=..., handler_fn=...)
    # ctx.register_skill("pdf-rag", Path(__file__).parent / "skills/pdf-rag/SKILL.md")
```

**Handler contract:** signature `def handler(args: dict, **kwargs) -> str`; **must
return a JSON string** (even on error — `json.dumps({"error": ...})`); never raise;
accept `**kwargs` for forward compat. Can call other tools via
`ctx.dispatch_tool("delegate_task", {...})`.

**Lifecycle / mgmt:** `register(ctx)` runs **once at startup**. Manage with
`hermes plugins list` / `enable <name>` / `disable <name>`; in‑session `/plugins`;
debug discovery with `HERMES_PLUGINS_DEBUG=1 hermes plugins list`. Bundled plugins
ship **disabled** by default (`not enabled`) — must be explicitly enabled.

#### OpenCode `tool()` → Hermes plugin mapping

| OpenCode (`@opencode-ai/plugin`) | Hermes plugin |
|---|---|
| `tool({...})` default export, file in `tools/` | `ctx.register_tool(...)` inside `register(ctx)` in `__init__.py` |
| `description` | `schema["description"]` |
| `args: { x: tool.schema.string()... }` (Zod‑like) | `schema["parameters"]` (raw **JSON Schema**) |
| `async execute(args, context) { return string }` | `def handler(args, **kwargs) -> str` (return **JSON string**) |
| `context.directory` / `context.worktree` | `kwargs` (task_id, workspace via parent ctx) |
| TypeScript / Node | **Python** (the only rewrite cost) |

### Alternative paths (when a plugin is overkill)
- **MCP server** (`config.yaml › mcp_servers`, stdio/HTTP, registered as
  `mcp_<server>_<tool>`) — best for bridging an *external* tool server. Needs
  `pip install mcp` (not installed). Overkill for our own logic.
- **Skill + bundled `scripts/`** — the agent runs a script via `terminal`. Good for
  *workflows*, not for a typed always‑available tool. Node 22 is present, so the
  existing `ingest_pdf.ts` could run nearly as‑is here.
- **Drop‑in hooks** (`~/.hermes/hooks/<name>/HOOK.yaml`+`handler.py`) and **shell
  hooks** (`config.yaml › hooks:`) — for event reactions, not tools.
- **Inline** via `terminal`/`code_execution` — for one‑off logic.

### Recommendation per existing tool

| OpenCode tool | Recommended Hermes home | Why |
|---|---|---|
| `ingest_pdf.ts` | **Python plugin** `pdf-rag` (`provides_tools: [ingest_pdf]`) | Direct analog; typed, always‑available, identical ergonomics to OpenCode. Rewrite TS→Python; chunking/embedding/PostgREST logic ports 1:1. |
| `text_extensions.ts` | Fold into the same plugin as a second tool, **or drop** | Trivial; `register_tool("is_text_file", ...)` is ~10 lines, but arguably not worth shipping |

A single plugin can also **bundle our ported skills** (`ctx.register_skill`) and
hooks — so one `webdb-playground` plugin could carry the `ingest_pdf` tool + the 9
ported skills + the environment instructions in one installable unit.

---

## 5. Applying our existing OpenCode artifacts to Hermes

### 5.1 Skills to port (9, near 1:1)
`postgrest-api`, `create-table`, `create-db-function`, `vector-search`,
`openproject-api`, `nextcloud-webdav`, `nextcloud-user-link`, `bun-app`, `nifi-api`.

Steps for each:
1. Copy `SKILL.md`, prepend the `metadata.hermes` + `version/author/license` block.
2. Body edits:
   - Service URLs (`http://postgrest_app:3000`, `*.localhost:PORT`) are unchanged —
     **Hermes is on the same `nocodenation_all_in_wonder_network`** so the internal
     hostnames resolve. ⚠️ **Verify** the hermes service joins that network — see
     §6 (today it's on `nocodenation_all_in_wonder_network` already).
   - **Env var names:** the OpenCode skills read `$POSTGREST_API_KEY`,
     `$SYSTEM_HTTP_PORT`, `$NIFI_USERNAME`, etc. Those env vars are injected into the
     **opencode** container, **not** hermes. Either (a) add the same vars to the
     `hermes` service `environment:`, or (b) hard‑code/parameterize in the ported
     skill. Pick (a) to keep skills identical.
3. Place under a category, e.g. `software-development/postgrest-api`,
   `data-science/vector-search`, `productivity/openproject-api`.

### 5.2 Instructions to port
- `instructions.md` body → a `webdb-playground` skill (environment map, port
  resolution, URL rules, "user data lives in Nextcloud" rule) **and/or** a shared
  `references/environment.md`. The "Skills router" table becomes the
  `related_skills`/tags network plus a short overview skill.
- Persona/tone (minimal here) → `SOUL.md`.

### 5.3 Tools to port
- `ingest_pdf.ts` → **Python plugin** `pdf-rag` (`provides_tools: [ingest_pdf]`) in
  `volumes/hermes/plugins/pdf-rag/`. Rewrite the `tool()` wrapper as
  `register_tool` + a `handler(args, **kwargs) -> str`; the chunking/embedding/
  PostgREST logic ports near‑verbatim (Python has `tiktoken`, `pypdf`/`unpdf`‑equiv,
  `requests`). Read config from env (same vars the OpenCode tool reads — see §5.1
  about renaming `OPENCODE_*`). Then `hermes plugins enable pdf-rag` + restart gateway.
- `text_extensions.ts` → second tool in the same plugin, or drop (trivial).

---

## 6. Proposed wiring (mirrors the OpenCode read‑only‑mount pattern)

OpenCode mounts each customization file read‑only and generates config in an
entrypoint. Apply the same discipline to Hermes. Suggested host layout:

```
config/hermes/
├── SOUL.md                     # persona
├── skills/                     # our skills (external_dirs target, read-only)
│   ├── postgrest-api/SKILL.md
│   ├── vector-search/SKILL.md
│   └── webdb-playground/SKILL.md       # ported instructions.md
└── plugins/                    # custom tools (Python plugin system)
    └── pdf-rag/
        ├── plugin.yaml
        ├── __init__.py         # register(ctx) → register_tool("ingest_pdf", …)
        ├── schemas.py
        └── tools.py            # ported ingest_pdf logic (TS → Python)
```

> A plugin can also bundle the skills (`ctx.register_skill`) — so `config/hermes/skills/`
> and `config/hermes/plugins/pdf-rag/` could collapse into one `webdb-playground`
> plugin if you prefer a single installable unit over the `external_dirs` route.

Two ways to apply config, with trade‑offs:

**Option A — edit the in‑volume `config.yaml` once** (simplest): add `external_dirs`
and `mcp_servers` to `volumes/hermes/config.yaml`, mount `config/hermes/skills` and
`config/hermes/SOUL.md` read‑only. Downside: `config.yaml` is runtime state in the
volume; a stock‑config reset loses the edits.

**Option B — own the config (mirrors OpenCode)**: mount our `config.yaml` and
`SOUL.md` read‑only over the defaults. Heavier (60 KB file to maintain), but
declarative and reproducible.

Illustrative `compose.yml` additions (Option A, skills via `external_dirs`):

```yaml
hermes:
  environment:
    # …existing…
    # so ported skills find the same vars they used under opencode:
    POSTGREST_API_KEY: ${API_KEY:-}
    SYSTEM_HTTP_PORT: ${SYSTEM_HTTP_PORT:-8888}
    SYSTEM_HTTPS_PORT: ${SYSTEM_HTTPS_PORT:-8833}
    PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-}
    NIFI_USERNAME: ${NIFI_USERNAME:-}
    NIFI_PASSWORD: ${NIFI_PASSWORD:-}
    OPENCODE_EMBEDDING_HOST: ${OPENCODE_EMBEDDING_HOST:-}
    OPENCODE_EMBEDDING_MODEL: ${OPENCODE_EMBEDDING_MODEL:-}
  volumes:
    - ./volumes/hermes:/opt/data
    - ./config/hermes/skills:/opt/custom-skills:ro              # external_dirs target
    - ./config/hermes/SOUL.md:/opt/data/SOUL.md:ro              # persona
    - ./config/hermes/plugins/pdf-rag:/opt/data/plugins/pdf-rag:ro   # custom tool plugin
```

Then in `config.yaml` (volume or mounted):

```yaml
skills:
  external_dirs:
    - /opt/custom-skills
```

After first install, enable the plugin and restart the gateway:

```bash
docker exec hermes hermes plugins enable pdf-rag
docker compose restart hermes
```

> **Plugin install needs no extra deps** — the plugin system is built in and Python is
> the venv runtime; just place files under `/opt/data/plugins/<name>/` and enable.
> Only the **MCP route** would need `pip install mcp` (derived image / entrypoint,
> analogous to `config/opencode/Dockerfile`) — which is why the plugin path is
> preferred for porting our own tools.

---

## 7. Open questions / verify before implementing

1. **Network:** confirm `hermes` is attached to `nocodenation_all_in_wonder_network`
   so `postgrest_app:3000`, `nextcloud`, `openproject-web`, `nifi`, embedding host all
   resolve from inside it (compose currently lists it on that network — good; the
   embedding host is reached via an `extra_hosts` alias in the opencode service, which
   hermes lacks → add the same `extra_hosts` if porting `ingest_pdf`).
2. **Skill/plugin reload:** new skills *and* plugins are loaded at session/startup —
   plan a gateway restart (and `hermes plugins enable <name>`) after first install.
3. **Config persistence:** decide Option A vs B (in‑volume edit vs mounted config).
4. **Plugin vs MCP vs skill‑script** for `ingest_pdf` — **plugin is preferred**
   (typed, always‑available, no new deps, direct OpenCode analog; cost = TS→Python
   rewrite). MCP only if we want an external server (needs `pip install mcp`).
   Skill+script only if we want a workflow rather than a tool.
5. **Bundled overlap:** `productivity/nano-pdf` & `ocr-and-documents` may already
   cover part of `ingest_pdf`; review before duplicating.
6. **Env‑var naming:** the `OPENCODE_*` embedding vars are oddly named for a non‑
   OpenCode service — consider renaming to `HERMES_EMBEDDING_*` (or neutral
   `EMBEDDING_*`) when porting, and update the ported skill/MCP accordingly.

---

## Appendix — commands used

```bash
docker exec hermes sh -c 'ls -la /opt/data && find /opt/data -maxdepth 3'
docker exec hermes sh -c 'cat /opt/data/SOUL.md'
docker exec hermes sh -c 'grep -nE "^[a-zA-Z_]+:" /opt/data/config.yaml'   # top-level keys
docker exec hermes sh -c 'cat /opt/data/skills/mcp/native-mcp/SKILL.md'
docker exec hermes sh -c 'cat /opt/data/skills/software-development/hermes-agent-skill-authoring/SKILL.md'
docker exec hermes sh -c 'ls /opt/hermes/tools'                            # built-in tool inventory
docker exec hermes sh -c 'getent passwd hermes'                            # home = /opt/data
docker exec hermes sh -c 'node -v; python3 -V; command -v uvx'            # runtimes
docker exec hermes sh -c 'cd /opt/data && hermes plugins list'             # plugin system + bundled plugins
docker exec hermes sh -c 'ls /opt/hermes/plugins'                          # bundled plugin sources
docker exec hermes sh -c 'cat /opt/hermes/plugins/disk-cleanup/plugin.yaml'# manifest shape
```
