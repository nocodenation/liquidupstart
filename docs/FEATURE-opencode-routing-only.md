# Feature: OpenCode under `PRIVACY_PROXY_ROUTING=only`

Status: **signed off on 2026-11-01, and implemented on this branch.**
Branch: `feature/opencode-routing-only`
Found: `BACKLOG.md`, the entry *One key sets both the proxy's judge and the agents' local provider*,
measured on 2026-10-31. This feature takes the part of that entry which does not wait for the
operator's decision. The test specification is `docs/TEST-SPEC-opencode-routing-only.md`.

## 1. Purpose

`.env.example` §7 says what `only` promises: *your AI tools are offered the privacy providers and
your local AI (Self-hosted local LLM) and nothing else.* OpenClaw keeps that promise. With routing
set to `only`, `config/scripts/start/openclaw.sh` drops a primary model that sits on a removed route
and pins the first privacy model in its place. OpenCode breaks it in two ways. Both were measured on
OpenCode 1.19.5, in the stack running from `feature/component-switches`.

1. **Its default model is whatever the local LLM lists first, in every mode.** The line responsible
   is `config/opencode/entrypoint.sh:63`. On 2026-10-31, with OpenRouter configured as the local
   LLM, that model was `particle-ai/particle-1`, the first of 420 hosted models. Anyone who opens
   OpenCode without choosing a model sends everything to it unmasked.
2. **It offers OpenCode Zen.** Zen is OpenCode's own provider, `opencode`, and its free models need
   no key, so blanking the provider keys does not take it away. On 2026-10-31 an OpenCode started on
   the stack's own configuration listed `opencode` with `big-pickle` and seven `*-free` models. The
   container held no `auth.json` and no `OPENCODE_API_KEY`.

Leaving the default out makes things worse. Measured on 2026-10-31: OpenCode without a `model`
falls back to the first provider in its own list, which was the direct `openai` provider, with
`opencode` next. Version 1.19.5 does not ask which model to use.

### 1.1 Use cases

- **UC1, `only` with an Anthropic key.** OpenCode opens on `privacy-anthropic` with the first model
  the proxy lists.
- **UC2, `only` with the Claude subscription and no Anthropic key.** This is the installation the
  findings were measured on. `privacy-anthropic` cannot be discovered, because the proxy answers its
  model list with 401. OpenCode opens on `privacy/private-claude`, the door onto the Claude CLI.
- **UC3, `only` with an OpenAI key only.** OpenCode opens on `privacy-openai` with the newest model.
- **UC4, `only` when the proxy offers nothing.** This covers no key with the CLI switched off, and
  an unreachable proxy with the CLI switched off. OpenCode opens on the local LLM's first model, as
  OpenClaw does. `start.sh` already warns, without stopping, that `only` leaves the agents without a
  cloud model (TC-822).
- **UC4a, `only` with the CLI on while the proxy does not answer yet.** OpenCode opens on
  `privacy/private-claude` even so. That provider is written from a fixed list, as it is today, and
  a privacy default that fails until the proxy answers is better than an unmasked one. OpenClaw
  behaves the same way: it writes its privacy providers from the bundled manifests, without asking
  the proxy.
- **UC5, `opt-in`, or the proxy off.** `opencode.json` stays as it is. Only the start line changes:
  it now names the provider as well (RO-FR5).
- **UC6, the picker under `only`.** Zen, and any other provider OpenCode would add on its own, is not
  offered. Switching back to `opt-in` brings it back.

## 2. Decisions

1. **The rule OpenClaw follows: a privacy model first, the local LLM after that.** Decisions 4 and 5
   say where OpenCode's steps differ from OpenClaw's, and why. Under `opt-in` the default stays as it is today. The operator ruled this on
   2026-11-01. The alternative was a privacy default in both modes, and it was rejected for the
   following reason. With a local LLM that really is local, today's `opt-in` default sends nothing
   off the machine. A privacy default would send masked data to a cloud model and cost API money.
   Telling a truly local LLM from a hosted one is the decision the BACKLOG entry leaves to the
   operator.
2. **Zen is part of this change.** The operator ruled this on 2026-11-01. It is the same file and
   the same question: what OpenCode sends unmasked under `only`.
3. **An allowlist (`enabled_providers`), not `disabled_providers: ["opencode"]`.** Both were
   measured on 1.19.5 on 2026-11-01, each on an OpenCode started with its own configuration and
   state directories. `enabled_providers: ["llamacpp", "privacy-openai", "privacy"]` offered exactly
   those three. `disabled_providers: ["opencode"]` offered `openai`, `llamacpp`, `privacy-openai` and
   `privacy`. The allowlist also keeps out what the entrypoint never writes but OpenCode finds by
   itself: a provider it recognises from an environment variable, or a login stored with
   `opencode auth login`. A denylist names only what is known today.
4. **The order is `privacy-anthropic`, then `privacy`, then `privacy-openai`.** It puts Anthropic
   before OpenAI, as OpenClaw does (`openclaw.sh:1110`). OpenClaw has no `privacy` step: with the CLI
   on it registers `privacy-anthropic` from the bundled manifest, without discovery. OpenCode
   discovers `privacy-anthropic` from the proxy, which answers 401 when there is no Anthropic key.
   For that case OpenCode has the `privacy` provider, the door onto the Claude CLI that
   `docs/SPECIFICATION.md` §7.5 describes. On this installation the two agents therefore pick
   different ids that lead to the same route, the Claude subscription. Measured on 2026-10-31,
   OpenClaw pinned `privacy-anthropic/claude-opus-5`; OpenCode will pick `privacy/private-claude`.
5. **For `privacy-openai`, the newest model counts, judged by `created`.** OpenClaw takes
   `models[0]` from a curated manifest. OpenCode takes its list from OpenAI's API, which lists models
   in no useful order. On 2026-10-31, after the entrypoint's own filter, the list started with
   `gpt-5.6-luna`, `gpt-5-mini` and `gpt-3.5-turbo-0125`, while the newest by `created` was
   `gpt-6.1-terra`. Only an id the provider is registered with can win. An id without `created`
   counts as oldest, and of several ids with the same `created` the one listed first wins. When no id
   carries `created` at all, that rule picks the first one listed. For `privacy-anthropic` the first
   id listed counts. Anthropic documents its model list as newest first. Whether the proxy keeps that
   order was not measured here: this installation has no Anthropic key, and the proxy answers with
   401.
6. **The mode reaches OpenCode as `PRIVACY_ROUTING=only`, set in
   `config/privacy-proxy/compose.routing-only.yml`.** `openclaw.sh:506` already passes that name to
   its writer. Only the override sets it, so nothing reaches OpenCode under `opt-in`.
7. **The model list keeps its order.** Only the default is chosen by `created`. Re-sorting the list
   would change the file written under `opt-in`, and RO-FR2 forbids that.

## 3. Requirements

| Id | Requirement |
|---|---|
| **RO-FR1** | Under `only`, the `model` in `opencode.json` is the first of these that applies: (1) `privacy-anthropic/<first id the proxy lists>`, when that provider is registered; (2) `privacy/private-claude`, when `ENABLE_ANTHROPIC_CLAUDE_CODE=1`, whether or not the proxy answered (UC4a); (3) `privacy-openai/<newest>`, when that provider is registered, where newest is the highest `created` among the ids it is registered with, an id without `created` counting as oldest and a tie going to the id listed first; (4) `llamacpp/<first id the local LLM lists>`, as today. When none applies, there is no `model` key. |
| **RO-FR2** | Under `opt-in`, and with the proxy off, `opencode.json` is byte for byte what the entrypoint of `ed7fd46` writes from the same answers. |
| **RO-FR3** | Under `only`, `opencode.json` carries `enabled_providers` naming `llamacpp` and each privacy provider the entrypoint registered, in the order they were written, and nothing else. |
| **RO-FR4** | `compose.routing-only.yml` gives the `opencode` service `PRIVACY_ROUTING: "only"`. `compose.yml` gives it no `PRIVACY_ROUTING`. |
| **RO-FR5** | The start line names the default together with its provider, for example `Starting opencode web on port 4096 (model: privacy/private-claude)`. |
| **RO-NFR1** | POSIX `sh`, using only the tools the entrypoint already calls (`curl`, `jq`, `grep`, `head`). Nothing new goes into the image. |
| **RO-NFR2** | The change reaches an installation with the next build of `liquidupstart/opencode`, because the Dockerfile copies the entrypoint into the image (`config/opencode/templates/Dockerfile:13`). |

## 4. Data

The file written under `only`, for UC2. The values come from this installation: the CLI is on, an
OpenAI key is set, and there is no Anthropic key. The `provider` blocks are as today and are
shortened here.

```json
{
  "model": "privacy/private-claude",
  "enabled_providers": ["llamacpp", "privacy-openai", "privacy"],
  "instructions": ["/opencode/instructions.md"],
  "provider": {
    "llamacpp": { "…": "…" },
    "privacy-openai": { "…": "…" },
    "privacy": { "…": "…" }
  },
  "server": { "port": 4096, "hostname": "0.0.0.0", "mdns": false }
}
```

The entrypoint writes the privacy providers in the order `privacy-openai`, `privacy-anthropic`,
`privacy`, and `enabled_providers` keeps that order. Under `opt-in` both keys are written as today:
`model` is `llamacpp/<first id>`, and there is no `enabled_providers`.

## 5. Where this stops

- **`opt-in` with a hosted "local" LLM** still opens on that LLM's first model. Whether the stack
  needs two keys or a warning is the operator's decision in the BACKLOG entry.
- **The local LLM provider under `only`** stays, because the mode keeps *your local AI*. If that LLM
  is hosted, the same decision applies.
- **OpenClaw's primary model after switching from `only` back to `opt-in`** has its own BACKLOG
  entry.
- **A model chosen in a session.** The default is what OpenCode uses when nobody has chosen a model.
  RO-6 measured the other case on 2026-11-01. A model of `openai` was chosen in the browser under
  `opt-in` and stored there as the recent one. Under `only`, a new session and the same draft both
  opened on `privacy/private-claude`.
- **The web UI under `opt-in` does not open on the configured model.** RO-6 found this on
  2026-11-01 without looking for it. `GET /config` answered `llamacpp/particle-ai/particle-1`, but a
  new session opened once on `openai`'s default and once on Zen's, with nothing stored in the
  browser. Under `only` the configured `privacy/private-claude` held every time. The cause was not
  established. For this feature, it means the default holds in the web UI where it matters, and
  `enabled_providers` would keep the picker inside the mode even if it did not. For `opt-in` it
  corrects the BACKLOG entry. Whoever opens the web UI without choosing a model reaches `openai`
  or Zen unmasked, while `particle-ai/particle-1` is what `opencode run` uses. That part stays with
  the operator's decision.
- **A proxy slower than discovery.** `opencode` does not wait for `privacy-proxy` in compose, and
  each model list is asked for ten times, three seconds apart. A proxy that has not answered by then
  leaves `privacy-openai` and `privacy-anthropic` unregistered until OpenCode is started again. With
  the CLI off, the local LLM is then the default, as in UC4. This is how discovery has always worked;
  only the consequence for the default is new.
- **A project's own `opencode.json`.** OpenCode merges a project's configuration over the one written
  here, so a repository under `/repos`, or an agent writing into one, can name other providers.
  `only` decides what the stack offers. It does not confine an agent that writes its own
  configuration, and the container has network access either way.
- **A newest model that only the Responses API serves.** `privacy-openai` speaks chat completions
  (`@ai-sdk/openai-compatible`). OpenAI's list carries no capability field, so the newest id cannot be
  checked for that. On 2026-10-31 the five newest after the filter were `gpt-6.1-terra`,
  `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-sol` and `gpt-6-astra`. This only matters in UC3.
- **A key that reaches the container anyway.** Under `only` the override withholds the provider keys
  (TC-826). If one still arrives, the entrypoint writes its provider block as it does today, and
  `enabled_providers` keeps that provider out of the picker. Leaving the block out would add no
  protection: the key is already in the container's environment, where every process can read it.
- **Small tasks such as titles.** Read from the 1.19.5 binary on 2026-11-01: `getSmallModel` looks
  only at the main model's own provider and falls back to the main model. Zen is used for this only
  when Zen is the main provider. Nothing needs to change.

## 6. Files

| File | Change |
|---|---|
| `config/opencode/entrypoint.sh` | the default under `only` (RO-FR1), `enabled_providers` (RO-FR3), the start line (RO-FR5) |
| `config/privacy-proxy/compose.routing-only.yml` | `PRIVACY_ROUTING: "only"` for `opencode` (RO-FR4). The comment above the blanked keys, which says that blanking them leaves only the privacy providers and the local LLM, is corrected: Zen needs no key, so `enabled_providers` is what restricts the picker |
| `docs/SPECIFICATION.md` §7.5 | one paragraph on OpenCode under `only` |
| `tests/…/m-ro.*.test.ts`, `tests/fixtures/ed7fd46/opencode-entrypoint.sh`, `tests/mutations.json` | `docs/TEST-SPEC-opencode-routing-only.md` |
