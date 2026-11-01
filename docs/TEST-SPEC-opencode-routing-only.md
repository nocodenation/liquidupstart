# Test specification: OpenCode under `PRIVACY_PROXY_ROUTING=only`

Status: **signed off on 2026-11-01, and implemented on this branch.** Each block's *What it found*
comes from the run after `642601b`, the commit that adds the code, and each block's *Shown able to
fail* from `./tests/mutate.sh --case`, which refuses a subject with uncommitted changes. All runs
started and ended on a clean tree at `642601b`, one at a time:

- **RO tier.** `./tests/run.sh ro` gave 21 pass and 0 fail across five files, in 18.5 s.
- **Mutations.** Eleven registered, eleven validated: RO-1 six, RO-2 one, RO-3 two, RO-4 one, RO-5
  one.
- **Full default tier.** 1486 pass, 8 skip and 0 fail across 194 files, in 27 minutes. The 45
  stack-level files were left out, as always. The dashboard gave 45 pass and 0 fail.
- **Routing.** `scripts/tests/privacy-routing.test.sh`, TC-821 to TC-826, passed.

The full tier's stderr carried the two messages known before it: the builder sweep reporting an
image that a concurrent case's container still held, which it reports by design and which was gone
afterwards, and the TypeError of `GitRepositories.svelte` recorded in `BACKLOG.md`.
Feature: `docs/FEATURE-opencode-routing-only.md` (RO-FR1 to RO-FR5, RO-NFR1, RO-NFR2).

Files are named `tests/<level>/m-ro.<subject>.test.ts`. Their headers open with `M-RO · <Level> · …`
and follow the block of `docs/TEST-SPEC-git-integration.md` §4.2. `./tests/run.sh ro` runs them.

## 1. What is being tested, and at which level

| Component | Level | Rigour |
|---|---|---|
| The default and the allowlist in `config/opencode/entrypoint.sh` | unit | **Full branch coverage.** Every step of RO-FR1's chain, both modes, a provider that registers and one that does not, and a key that reached the container anyway |
| `opt-in` and the proxy off | unit | **Byte comparison** with the entrypoint of `ed7fd46`, in both configurations |
| The routing-only override | contract | No branch coverage: this is configuration. Both compose files are read |
| OpenCode 1.19.5 reading the file | integration, real image | One run per mode |
| The running stack | system, operator check | Once, recorded |

Nothing here depends on a model's answer, so no case is a manual model check. RO-6 is an operator
check because only the browser shows the model picker.

## 2. Overview

| Case | Level | Sense | Scenario |
|---|---|---|---|
| **RO-1** | Unit | positive | under `only`, with every privacy route on offer, the default is `privacy-anthropic/` plus the first id the proxy lists, and the start line names it |
| **RO-1** | Unit | positive | …with `privacy-anthropic` refused (401) and the CLI on, it is `privacy/private-claude`, and the start line names it |
| **RO-1** | Unit | positive | …with the proxy not answering at all and the CLI on, it is still `privacy/private-claude` |
| **RO-1** | Unit | positive | …with the CLI off as well, it is `privacy-openai/` plus the newest registered id, which is neither the first nor the last listed, and the start line names it |
| **RO-1** | Unit | **negative** | …and an id the entrypoint's filter drops never wins, although the two highest `created` values belong to such ids |
| **RO-1** | Unit | positive | …and from a list without `created`, the first registered id wins |
| **RO-1** | Unit | positive | …with no privacy route at all, it is the local LLM's first model |
| **RO-1** | Unit | **negative** | …with nothing discovered anywhere, there is no `model` key, and the start line says `<none discovered>` |
| **RO-2** | Unit | positive | under `opt-in`, with every privacy route on offer, `opencode.json` is byte for byte what `ed7fd46` writes, with `model` `llamacpp/particle-ai/particle-1` |
| **RO-2** | Unit | positive | …and with the proxy off, likewise |
| **RO-2** | Unit | positive | …and the start line names the default together with its provider |
| **RO-2** | Unit | positive | …and the fixture of `ed7fd46` is that commit's file, byte for byte, where the history is there |
| **RO-3** | Unit | positive | under `only`, `enabled_providers` names `llamacpp`, `privacy-openai`, `privacy-anthropic` and `privacy`, in that order |
| **RO-3** | Unit | **negative** | …and leaves out `privacy-anthropic` when the proxy refuses it |
| **RO-3** | Unit | **negative** | …and leaves out `openai` when `OPENAI_API_KEY` reached the container anyway, although its provider block is written |
| **RO-3** | Unit | **negative** | under `opt-in` there is no `enabled_providers` |
| **RO-4** | Contract | positive | `compose.routing-only.yml` gives `opencode` `PRIVACY_ROUTING: "only"` |
| **RO-4** | Contract | **negative** | `compose.yml` gives `opencode` no `PRIVACY_ROUTING` |
| **RO-5** | Integration | positive | under `only`, the real OpenCode offers exactly `llamacpp`, `privacy-openai` and `privacy`, and its default `privacy/private-claude` is one of the models it offers |
| **RO-5** | Integration | **negative** | …and offers neither `opencode` (Zen) nor `openai`, although `OPENAI_API_KEY` reached the container |
| **RO-5** | Integration | positive | under `opt-in`, the same OpenCode does offer `opencode` and `openai`, so the check can see them |
| **RO-6** | System | positive | operator check: after a build, under `only`, the start line and the browser's picker show only the local LLM and the privacy providers, with `privacy/private-claude` chosen |
| **RO-6** | System | positive | …and back under `opt-in`, Zen and `openai` are offered again and the default is the local LLM's first model |
| **RO-6** | System | **negative** | …and a model of `openai` chosen in the browser under `opt-in` is not what a new session uses under `only`: what the browser shows is recorded, whichever it is |

## 3. Test data

The unit cases run the entrypoint on the host with stubs first on `PATH`. `curl` answers by URL
from files, `sleep` returns at once, and `opencode` prints its arguments and exits 0. A copy of the
entrypoint is taken for each run, with `/root/.config/opencode` and `/tmp/` pointed into a fresh
`mktemp -d` tree, so a mutation of the real file reaches every run.

**The environment.**

- `LOCAL_LLM_API_BASE=http://local_llm:8080`, with `LOCAL_LLM_API_KEY` unset.
- `PRIVACY_PROXY_URL=http://privacy-proxy:8080`, unset for the proxy-off row.
- `PRIVACY_ROUTING=only`, unset for `opt-in`.
- `ENABLE_ANTHROPIC_CLAUDE_CODE`: `1`, or `0` where a row says the CLI is off.
- No provider key, except `OPENAI_API_KEY=sk-ro-stray` in the rows that say a key reached the
  container, and in every `opt-in` row.

**The answers.**

| URL | Status | Body |
|---|---|---|
| `http://local_llm:8080/v1/models` | 200 | `{"data":[{"id":"particle-ai/particle-1"},{"id":"text-embedding-3-small"},{"id":"google/gemma-4-31b-it"}]}` |
| `http://privacy-proxy:8080/openai/v1/models` | 200 | `{"data":[{"id":"gpt-5.6-luna","created":1781000000},{"id":"gpt-3.5-turbo-0125","created":1706140800},{"id":"gpt-6.1-terra","created":1790000000},{"id":"gpt-5-mini","created":1754500000}]}` |
| the same, with dropped ids | 200 | `{"data":[{"id":"gpt-5.6-luna","created":1781000000},{"id":"gpt-3.5-turbo-0125","created":1706140800},{"id":"gpt-6.1-terra","created":1790000000},{"id":"gpt-6.2-2026-10-30","created":1793000000},{"id":"gpt-image-2","created":1795000000},{"id":"gpt-5-mini","created":1754500000}]}` |
| the same, without `created` | 200 | `{"data":[{"id":"gpt-5.6-luna"},{"id":"gpt-3.5-turbo-0125"},{"id":"gpt-6.1-terra"},{"id":"gpt-5-mini"}]}` |
| `http://privacy-proxy:8080/anthropic/v1/models` | 200 | `{"data":[{"id":"claude-sonnet-5","created_at":"2026-09-01T00:00:00Z"},{"id":"claude-opus-5","created_at":"2026-08-01T00:00:00Z"}]}` |
| the same, refused | 401 | `{"detail":"no ANTHROPIC_API_KEY"}` |
| any, unreachable | `000` | none |

**Why the data is shaped this way.**

- The local list starts with `particle-ai/particle-1`, the model measured first on OpenRouter on
  2026-10-31. Its embedding entry shows that the existing filter still applies.
- The OpenAI list carries the order measured on 2026-10-31: `gpt-5.6-luna` first and
  `gpt-3.5-turbo-0125` near the top. The newest id it registers, `gpt-6.1-terra`, sits in the
  middle, so neither "first" nor "last" can pass for "newest".
- In the list with dropped ids, the two highest `created` values belong to ids the filter drops:
  `gpt-image-2` (`image`) and `gpt-6.2-2026-10-30` (a dated snapshot). Newest therefore has to mean
  newest among the registered ids. That row has a list of its own so that it can fail on its own:
  the plain list carries no dropped id, and the row reading it stays green when only the restriction
  to registered ids is broken.
- The list without `created` is the plain list with the field removed. The rule then has to fall
  back to the order listed, which begins with `gpt-5.6-luna`.
- The Anthropic list puts `claude-sonnet-5` before `claude-opus-5`, the reverse of alphabetical
  order, so "first listed" cannot pass as "sorted".

## 4. Cases

### RO-1 — the default under `only`

| | |
|---|---|
| **Premise** | Under `only` the default must be a privacy model whenever the proxy offers one, in the order of decision 4, and the local LLM's first model only when it offers none. Today the default is always `llamacpp/<first id>`. |
| **Component** | `config/opencode/entrypoint.sh`, with the stubs and copy of §3. |
| **Steps** | Eight runs with `PRIVACY_ROUTING=only`, one per row. Each reads `model` from the written `opencode.json` and the start line from stdout. |
| **Test data, both sides** | Row 1: all three answers 200, CLI on. Row 2: Anthropic 401, CLI on. Row 3: OpenAI and Anthropic `000`, CLI on. Row 4: Anthropic 401, CLI off, the plain OpenAI list. Row 5: as row 4, the list with dropped ids. Row 6: as row 4, the list without `created`. Row 7: OpenAI and Anthropic `000`, CLI off. Row 8: every URL `000`, CLI off. |
| **Expected** | Row 1: `privacy-anthropic/claude-sonnet-5`, and the start line ends `(model: privacy-anthropic/claude-sonnet-5)`. Rows 2 and 3: `privacy/private-claude`, and row 2's start line ends `(model: privacy/private-claude)`. Row 4: `privacy-openai/gpt-6.1-terra`, and the start line ends `(model: privacy-openai/gpt-6.1-terra)`. Row 5: `privacy-openai/gpt-6.1-terra`, neither `gpt-image-2` nor `gpt-6.2-2026-10-30`. Row 6: `privacy-openai/gpt-5.6-luna`. Row 7: `llamacpp/particle-ai/particle-1`. Row 8: no `model` key, and the start line ends `(model: <none discovered>)`. |
| **Dependencies** | `/bin/sh`, `jq`. |
| **Shown able to fail** | Six registered, all validated. The `privacy-anthropic` step skipped: row 1 red (1 red, 7 green). The CLI step made `elif false`, registered once for row 2 and once for row 3: both red (2 red, 6 green). The sort by `created` removed: rows 4 and 5 red. The restriction to registered ids removed: row 5 alone (1 red, 7 green), which is why that row has a list of its own. The start line left on the bare id (`${_DEFAULT_MODEL#*/}`): 4 red, rows 1, 2 and 4 as specified, and row 8 as well, whose `<none discovered>` that form also loses. |
| **What it found** | Run on 2026-11-01 at `642601b` on a clean tree, with the host's `/bin/sh` and jq 1.7.1: 8 / 0. Nothing failed while it was written. |
| **Implemented by** | `tests/unit/m-ro.default-model.test.ts`. |
| **Covers** | RO-FR1, RO-FR5, UC1 to UC4a. |

### RO-2 — `opt-in` and the proxy off write what they wrote before

| | |
|---|---|
| **Premise** | Decision 1 leaves `opt-in` as it is. The strongest form of that claim is that the file is the same, byte for byte, so the comparison is against the entrypoint as it stood before this feature. |
| **Component** | `config/opencode/entrypoint.sh` and `tests/fixtures/ed7fd46/opencode-entrypoint.sh`, each run with the same stubs and answers. |
| **Steps** | Run both under `opt-in` with all three answers 200 and the CLI on, then both with `PRIVACY_PROXY_URL` unset. Compare the two `opencode.json` files byte for byte, and read the start line. Where `.git` is present, compare the fixture with `git show ed7fd46:config/opencode/entrypoint.sh`. |
| **Test data, both sides** | §3, with `OPENAI_API_KEY=sk-ro-stray`. |
| **Expected** | The files are equal in both configurations, and `model` is `llamacpp/particle-ai/particle-1`. The start line ends `(model: llamacpp/particle-ai/particle-1)`. The fixture equals the commit's file. |
| **Dependencies** | `/bin/sh`, `jq`. The history, for the last row only, which is skipped without it. |
| **Shown able to fail** | Registered and validated: the test for `only` made `if true` reddens the `opt-in` row, the proxy-off row and the start line row (3 red); the fixture row stays green. |
| **What it found** | Run on 2026-11-01 at `642601b` on a clean tree: 4 / 0, the fixture row included, since the history holds `ed7fd46`. On the running stack (RO-6), the new image wrote under `opt-in` the same `opencode.json` as the old one, apart from the model lists, which the upstreams had changed overnight. |
| **Implemented by** | `tests/unit/m-ro.opt-in-unchanged.test.ts`. |
| **Covers** | RO-FR2, RO-FR5, UC5. |

### RO-3 — under `only`, the providers OpenCode may offer

| | |
|---|---|
| **Premise** | The allowlist has to name what the mode keeps, the local LLM and each privacy provider that registered, and must not be built from whatever happens to have been written. |
| **Component** | As RO-1. |
| **Steps** | Three runs under `only` and one under `opt-in`. Each reads `enabled_providers` and the keys of `provider`. |
| **Test data, both sides** | Row 1: all three answers 200, CLI on. Row 2: Anthropic 401, CLI on. Row 3: as row 1, with `OPENAI_API_KEY=sk-ro-stray`. Row 4: `opt-in`, as row 1. |
| **Expected** | Row 1: `["llamacpp","privacy-openai","privacy-anthropic","privacy"]`. Row 2: `["llamacpp","privacy-openai","privacy"]`. Row 3: as row 1. Its `provider` holds `openai`, which is what makes the row test the allowlist rather than a missing block; that the block is written is not a property this feature wants, and the feature's §5 says why it is left. Row 4: no `enabled_providers`. |
| **Dependencies** | `/bin/sh`, `jq`. |
| **Shown able to fail** | Two registered, both validated. The allowlist built without the privacy providers: rows 1 to 3 red, the `opt-in` row green. `openai` added to it in its own block: row 3 alone (1 red, 3 green). |
| **What it found** | Run on 2026-11-01 at `642601b` on a clean tree: 4 / 0. |
| **Implemented by** | `tests/unit/m-ro.enabled-providers.test.ts`. |
| **Covers** | RO-FR3, UC6. |

### RO-4 — the override tells OpenCode the mode

| | |
|---|---|
| **Premise** | The entrypoint can only act on a mode it is told. The override is added only under `only` (`scripts/linux/start.sh:368`), so it is the place that says so. |
| **Component** | `config/privacy-proxy/compose.routing-only.yml` and `compose.yml`, read as text through `serviceBlock()` of `tests/lib/compose-file.ts`. |
| **Steps** | Read the `opencode` block of each file. |
| **Test data, both sides** | The two files as committed. |
| **Expected** | The override's block holds the line `PRIVACY_ROUTING: "only"` outside a comment. The block in `compose.yml` holds no `PRIVACY_ROUTING`. |
| **Dependencies** | bun. |
| **Shown able to fail** | Registered and validated: the line deleted from the override reddens the positive row, and the negative stays green. |
| **What it found** | Run on 2026-11-01 at `642601b` on a clean tree: 2 / 0. RO-6 showed why the case matters: started with the override of a checkout that lacks the line, the container got no `PRIVACY_ROUTING`, and OpenCode wrote the `opt-in` file. |
| **Implemented by** | `tests/contract/m-ro.routing-override.test.ts`. |
| **Covers** | RO-FR4. |

### RO-5 — OpenCode 1.19.5 reads the file as meant

| | |
|---|---|
| **Premise** | The unit cases prove what the file says. Whether OpenCode accepts `enabled_providers`, offers what it names and nothing else, and finds the default among what it offers is OpenCode's behaviour, and only OpenCode can show it. Decision 3 rests on that measurement. |
| **Component** | The image `liquidupstart/opencode:latest`, running the working tree's `config/opencode/entrypoint.sh`, mounted read-only, with a stub `curl` first on `PATH` for the entrypoint alone. The case queries OpenCode's own `GET /config/providers` with the image's `/usr/bin/curl`. |
| **Steps** | Start one container per mode, wait for `/config/providers` to answer, read the provider ids and the written `model`, then remove the container. |
| **Test data, both sides** | §3's answers with Anthropic 401 and the CLI on, and `OPENAI_API_KEY=sk-ro-stray`. Then `PRIVACY_ROUTING=only` once, and unset once. |
| **Expected** | `only`: the ids are exactly `llamacpp`, `privacy-openai` and `privacy`, with no `opencode` and no `openai`. `model` is `privacy/private-claude`, and `private-claude` is among the `privacy` provider's models. `opt-in`: the ids include `opencode` and `openai`. |
| **Dependencies** | Docker and the image, otherwise skipped with that reason. The container gets Docker's default network. The 1.19.5 binary carries a catalogue of its own, but whether OpenCode starts without any network has not been measured. |
| **Shown able to fail** | Registered and validated: `enabled_providers` left out under `only` reddens the negative row and the positive row (2 red), and the `opt-in` row stays green. |
| **What it found** | Run on 2026-11-01 at `642601b` on a clean tree, against `liquidupstart/opencode:latest` with OpenCode 1.19.5: 3 / 0 in 7 s. The first version hung until its 200-second hook limit: a `curl` without `-m` blocked inside `spawnSync` while OpenCode was starting, so the deadline was never checked. It got `-m 5` before the commit. Started by hand, the same container answered after 20 s with exactly `llamacpp`, `privacy-openai` and `privacy`. |
| **Implemented by** | `tests/integration/m-ro.opencode-reads.test.ts`. |
| **Covers** | RO-FR1, RO-FR3, UC2, UC6. |

### RO-6 — the running stack, an operator check

| | |
|---|---|
| **Premise** | Only the browser shows the model picker, and that is where a user would meet Zen or the old default. |
| **Component** | The stack, with `liquidupstart/opencode:latest` built from this branch. |
| **Steps** | Build OpenCode. Under `opt-in`, open `http://opencode.localhost:8888`, choose a model of `openai` and send nothing. Recreate only the `opencode` service with what `start.sh` would export under `only`: `PRIVACY_PROXY_URL=http://privacy-proxy:8080 COMPOSE_FILE=compose.yml:config/privacy-proxy/compose.routing-only.yml docker compose up -d --no-deps opencode`. `start.sh` exports `PRIVACY_PROXY_URL` and does not write it to `.env` (`scripts/linux/start.sh:357`), so without it the container would get no proxy at all. OpenClaw and its sign-ins are not touched. Read the start line, reload the page, open a new session and the model picker. Then recreate the service with `PRIVACY_PROXY_URL` and without the override, and look again. |
| **Test data, both sides** | This installation: the CLI on, an OpenAI key, no Anthropic key, OpenRouter as the local LLM. |
| **Expected** | `only`: the start line ends `(model: privacy/private-claude)`, the picker holds the local LLM, `privacy-openai` and `privacy` only, and the new session does not run on the `openai` model chosen before. What the page shows for that earlier choice is recorded as found. `opt-in`: the start line ends `(model: llamacpp/particle-ai/particle-1)`, and the picker holds Zen and `openai` again. |
| **Dependencies** | The running stack and a browser. |
| **Shown able to fail** | No mutation: this is a manual check. RO-5 is the automated counterpart. |
| **What it found** | Run on 2026-11-01 on the stack of `feature/component-switches`, with the OpenCode image built from `642601b`, through Claude in Chrome. **`opt-in`:** the start line ended `(model: llamacpp/particle-ai/particle-1)`. **`only`:** the start line ended `(model: privacy/private-claude)`, and the picker held the groups `llamacpp`, `privacy` and `privacy-openai`, with no Zen entry and no OpenAI group. **The earlier choice:** under `opt-in`, GPT-6.1 Terra of `openai` was chosen explicitly, and the browser stored it as the recent model (`opencode.global.dat:model`). Under `only`, both a new session and that same draft showed `privacy: private-claude`. **Back under `opt-in`:** `/config/providers` listed `openai`, `opencode`, `llamacpp`, `privacy-openai` and `privacy` again. The first `only` attempt took the override of the stack's own checkout, which lacks the line, so the container got no `PRIVACY_ROUTING`; it was repeated with this branch's override, given by absolute path in `COMPOSE_FILE`. **Beyond the specification:** under `opt-in` the web UI did not open on the configured model. `GET /config` answered `llamacpp/particle-ai/particle-1`, yet one new session showed GPT-5.6 Terra Pro, `openai`'s default, and the next showed Big Pickle, Zen's. Nothing was stored in the browser at either point. Under `only` it opened on `privacy/private-claude` every time: two new sessions and two drafts. The cause was not established. The feature's §5 says what follows from it. Afterwards the OpenCode image was rebuilt from `feature/component-switches` and recreated under `opt-in`, and the test's entries were removed from the browser. |
| **Implemented by** | Operator check, recorded here. |
| **Covers** | UC2, UC5, UC6. |
