# Test specification — the mid-term memory, M-M1

**This document was missing until 2026-10-13, and `TR-1` is what said so.** The milestone had a
feature document and twenty-three passing scenarios and no test specification at all, so no row
declared any of `M1-1` to `M1-11`. `TR-1` arrived on this branch with the merge of `main` on
2026-10-12 and named all eleven on the first run. Nothing here is new work on the tests; it is the
eleven cases written down so a reviewer can sign them off, or challenge them, without reading the
implementation — which is what this project requires and what a one-line test name does not give.

**Written against the test file**, reading the titles out of
`tests/component/m-m1.memory-config.test.ts` rather than from recollection. That rule exists because
an earlier pass elsewhere described one test per case and missed seven of thirteen.

**Level.** Component. The subject is `config/scripts/start/openclaw.sh`'s configuration writer, driven
through `tests/lib/openclaw-writer.ts`, which runs the writer inside the OpenClaw image and can call
the image's own schema validation. Two images are in play: `2026.9.1`, which has the memory keys, and
`2026.7.1`, which rejects what it does not know.

**Rigour.** Full branch coverage of the gate, because it is real decision logic with four branches —
provider unset or `openai`, `github-copilot` with the harness on, `github-copilot` with it off, and
anything else — and because a wrong answer is silent: the operator's setting is overwritten and the
log line says something true-sounding about credentials.

**What makes these cases worth anything is the image's own answer.** `M1-7` asks the plugin's
`session-policy.js`, inside 2026.9.1, whether it is active for an agent. Asserting `.enabled === true`
was green throughout the defect that blocker 1 of the 2026-09-28 review found, which is the
*looks the same whether it ran or not* trap §2.1 of the feature document describes.

## Overview

| # | Sign | Scenario |
|---|---|---|
| **M1-1** | positive | On the 2026.9 shape, `active-memory` is enabled |
| **M1-1** | positive | `memory.search` is on, and reads memory files rather than transcripts |
| **M1-1** | positive | …and the result is a config 2026.9.1 accepts |
| **M1-3** | **negative** | No embedding provider is written here — the Copilot branch owns it, and writing one would win or lose by block order |
| **M1-6** | **negative** | An installation with no embedding credential does not get the memory switched on |
| **M1-6** | positive | …but the guards are written anyway, because they are what keeps transcripts out whenever it *is* switched on |
| **M1-6** | positive | …and it is still a config 2026.9.1 accepts |
| **M1-2** | **negative** | The 2026.7 shape carries neither key, because that version rejects what it does not know |
| **M1-4** | positive | With Copilot on, the provider is `github-copilot` and the rest still applies |
| **M1-5** | positive | An operator setting on the plugin entry survives the start |
| **M1-5** | **negative** | …and a persisted `"sessions"` is taken back out |
| **M1-5** | positive | …and an unrelated memory setting is not disturbed |
| **M1-7** | positive | The plugin is **active** for the default agent, asked of the image's own policy module |
| **M1-7** | **negative** | …and it still does not recall transcripts to get there |
| **M1-7** | positive | …and an agent list the operator set is left alone |
| **M1-7** | positive | …and it is active for an agent that is not called `main` — *N1 of 2026-10-13* |
| **M1-7** | positive | …and with two agents it covers both, not whichever is first |
| **M1-7** | positive | …and an operator list is still left alone |
| **M1-7** | **negative** | …and the probe agrees with the runtime when the operator has switched it off globally — *N2 of 2026-10-13* |
| **M1-7** | **negative** | …and a denied plugin is not active, whatever the entry says |
| **M1-8** | **negative** | A per-agent override does not bring transcripts back: the guard reaches `agents.list` too |
| **M1-8** | **negative** | …and `agents.entries`, which is the shape that persists — *C1 of 2026-10-13* |
| **M1-8** | **negative** | …and `experimental.sessionMemory`, a third route to the same outcome with `rememberAcrossConversations` already false |
| **M1-8** | **negative** | …and the stack's own upgrade path, 2026.7.1 → `doctor --fix` → writer, does not open it either |
| **M1-8** | positive | …and an unrelated per-agent setting survives |
| **M1-9** | positive | `ollama` on a key-less install keeps `memory.search.enabled` as it was |
| **M1-9** | **negative** | …while `openai` with no key is still switched off |
| **M1-12** | positive | An own OpenAI-compatible endpoint is not switched off for having no env key — *N3 of 2026-10-13* |
| **M1-12** | **negative** | …and no key anywhere is still no credential, a blank one included |
| **M1-10** | **negative** | A leftover `github-copilot` from a harness that is off is removed, and the gate falls back to the OpenAI question |
| **M1-10** | positive | …and with Copilot on it is kept and used |
| **M1-11** | positive + **negative** | The key in `.env` becomes the flag, and its absence does not |
| **M1-11** | positive | …and the writer is actually handed it |

## Detail

### M1-1 / M1-3 — the 2026.9 shape, switched on and still valid

| | |
|---|---|
| **Premise** | The start writes the memory keys only where the schema has them. Three things have to hold together: the plugin is enabled, search reads memory files and not transcripts, and the file the writer produces is one the running version accepts — the third because an invalid config is a failed start, not a warning. |
| **Component** | `openclaw.sh`'s writer, run in `2026.9.1`, validated by the image's own `validate()`. |
| **Steps** | Write a config with `OC_SCHEMA_NEW=1` and `MEMORY_OPENAI_KEY=1`; read `plugins.entries["active-memory"].enabled`, `memory.search`, and the validator's exit status. |
| **Test data** | `MEMORY_OPENAI_KEY: '1'`, the flag the shell computes from `OPENAI_API_KEY`. `memory.search.sources` must hold `"memory"` and must **not** hold `"sessions"`. |
| **Expected** | `enabled: true`; `sources` without `"sessions"`; validator exit 0; and **no** `memory.search.provider` key. |
| **What it found** | Green. `M1-3` is the negative counterpart and it is the one with an argument behind it: the provider is deliberately not written, because the Copilot branch above owns it and a value written here would silently win or lose depending on the order of two blocks. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-1, M1-3, F1, F3. |

### M1-6 — no credential, and the guards still written

| | |
|---|---|
| **Premise** | The guards and the switch are separate things. Whether memory is *on* depends on a credential; whether transcripts stay *out* must not. |
| **Component** | The writer with `MEMORY_OPENAI_KEY=0`. |
| **Steps** | Write with the flag at `0`; read the enabled state, the guards, and the validator. |
| **Test data** | `MEMORY_OPENAI_KEY: '0'`, no provider seeded. |
| **Expected** | Not switched on; `rememberAcrossConversations: false` and the `sources` guard present anyway; validator exit 0. |
| **What it found** | Green. The middle scenario is the one that matters: a run that wrote the switch and skipped the guards would pass a test that only looked at the switch. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-6, F1, NFR-M1. |

### M1-2 — the version that knows neither key

| | |
|---|---|
| **Premise** | 2026.7.1 treats an unknown key as a failed start rather than a warning (§5.1), so the keys must be absent there, not merely unused. |
| **Component** | The writer with the old-schema path, validated in `2026.7.1`. |
| **Steps** | Write without `OC_SCHEMA_NEW`; assert the memory keys and the plugin entry are absent and that the result validates on the old image. |
| **Test data** | A seeded config carrying `memory.search` and `active-memory`, so the case measures **removal** and not mere absence. |
| **Expected** | Both swept, the sweep logged, old-image validation exit 0. |
| **What it found** | Green, and one half of it had to be corrected: the control `validate(newShape, IMAGE_OLD) != 0` fails on 2026.7.1 over `deviceAutoApprove` alone, so it said nothing about the memory keys — finding 5 of the 2026-09-28 review. The seeded-removal half is the real check and is untouched. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-2, F4, §5.1. |

### M1-4 / M1-9 / M1-10 — the gate speaks only for providers it knows

| | |
|---|---|
| **Premise** | The credential gate can answer for two providers: `openai`, where the question is whether `OPENAI_API_KEY` is set, and `github-copilot`, where it is whether the harness is on. The schema allows four more. Blocker 3 of 2026-09-28: `enabled` was written on **every** start, so an operator on `ollama` had memory search switched off each time with a log line claiming there was no embedding credential — and for key-less installs that was a regression too, since the runtime defaults the key to `true`. |
| **Component** | The writer's four gate branches. |
| **Steps** | Four writes: Copilot on; `ollama` with no key; `openai` with no key; a leftover `github-copilot` with Copilot off, and the same with it on. |
| **Test data, both sides** | What must be respected: a seeded `memory.search.enabled` under `provider: "ollama"`, which the start must leave exactly as it found it. What must not survive: a `provider: "github-copilot"` left by a harness that is now off, which has no auth and must not be counted as a credential. |
| **Expected** | `ollama` untouched and the step-back logged; `openai` with no key off; leftover Copilot removed and the gate falling back to the OpenAI question; Copilot on, provider kept and used. |
| **What it found** | Green, 5 scenarios. The `ollama` case is the repair for blocker 3 and the `openai`-with-no-key case beside it is what keeps it from being "the gate never does anything". The supported-provider boundary is a decision of 2026-10-13 and is stated in §2.4 of the feature document; extending it is in `BACKLOG.md`, one measurement per provider. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-4, M1-9, M1-10, F1. |

### M1-5 — the writer inherits an installation, not a blank file

| | |
|---|---|
| **Premise** | The plugin manifest declares 29 config keys with `additionalProperties: false`, so a fresh object discards everything an operator tuned, silently, on the next start. F2 of 2026-09-22. |
| **Component** | The writer against a seeded config. |
| **Steps** | Seed a plugin setting under `entry.config`, a persisted `"sessions"` in `sources`, and an unrelated `memory` setting; write; read all three back. |
| **Test data** | The operator's setting must be **under `entry.config`**. The first version of this case seeded `{enabled, mode: "always", timeoutMs: 9000}` on the entry itself — a shape 2026.9.1 rejects with `plugins.entries.active-memory: Unrecognized keys: "mode", "timeoutMs"` — so it proved the merge on a config that cannot exist and never called `validate()`. Finding 5 of 2026-09-28; it validates now. |
| **Expected** | The operator's `entry.config` setting survives; `"sessions"` is taken back out; the unrelated setting is untouched. |
| **What it found** | Green. The middle scenario is a negative on purpose: a value that is only *defaulted* is not an invariant, and a `"sessions"` that reached the file once survived every start after it until this was written. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-5, F2, NFR-M1. |

### M1-7 / M1-8 — enabled is not acting, and the guard has to reach every level

| | |
|---|---|
| **Premise** | The plugin acts before a reply only when `isEnabledForAgent` finds the agent in `config.agents`, or `shouldRememberAcrossConversations` is on. NFR-M1 keeps the second shut, and `config.agents` defaults to an empty list, which names nobody — so the entry said `enabled: true` and the plugin did nothing. Blocker 1 of 2026-09-28. And OpenClaw resolves these as `<agent>.memory.search.X ?? memory.search.X`, so a per-agent block brought transcripts straight back past a guard written only at the defaults level. Blocker 2. |
| **And blocker 2 was only half closed, which C1 of 2026-10-13 found** | The guard walked `agents.list`, and in 2026.9.1 that is the **legacy** roster: `listAgentEntries` reads `agents.entries` first, the validator reports `agents.list` problems under `agents.entries.<id>`, `config validate` warns about any `agents.list`, and the image documents `toAgentEntriesRecord` as converting either representation into *the canonical keyed shape*. So the guard protected the one representation that cannot persist and missed the one every tool writes — `openclaw agents add`, `config set`, and `doctor --fix` all produce `agents.entries`. **And the stack performs that migration itself**: `openclaw_migrate_state` runs `doctor --fix` before this writer whenever the state came from an older version, under the rule *"agents.list moved to keyed agents.entries"*. Reproduced before the repair: the keyed seed came through the writer untouched, the config validated, and the image resolver answered `remembers: true`. A third key with it — `experimental.sessionMemory` — turns transcript indexing on when `sessions` is among the agent's sources **even with `rememberAcrossConversations` false**, so forcing two keys left a route that `remembers` does not report. |
| **Component** | `openclaw.sh`'s writer, and **the image's own policy module**: `tests/lib/openclaw-writer.ts` imports the plugin's `session-policy.js` and `config.js` inside 2026.9.1 and reports the gates. |
| **The instrument was wrong, which N2 of 2026-10-13 found** | Only two of the three readings came from the image. `namesAgent` was a **copy** of the gate — `Boolean(entry.enabled) && agents.includes(agent)` — while the runtime calls `isEnabledForAgent(normalizePluginConfig(entry.config), agent)`, the *inner* flag; and `active` ignored `pluginEnabled` altogether. Two shapes where the probe said active and the runtime did not, both the reviewer's: an operator who has typed `/active-memory off --global`, which writes `config.enabled: false` and the writer preserves, and `plugins.deny: ["active-memory"]`. The probe now calls the image's own predicate, and the two shapes are scenarios — **because every M1 gate reading rests on this instrument**, and a probe wrong in that direction makes the rest green over a stack that is not working. |
| **And correcting it nearly produced a false report** | `isEnabledForAgent(config, agentId)` takes the **plugin** config, not the whole openclaw config: its body is `if (!config.enabled) return false; if (!agentId) return false; return config.agents.includes(agentId)`, read out of the image. Called with the whole config it answers `false` for every agent, which turned `M1-7` red and looked exactly like blocker 1 being open again. It was the call, not the product. Measured rather than reported, and recorded here because the failure mode — an image function given the wrong argument, failing like a defect — will happen again. |
| **Steps** | Write; ask the image whether the plugin is active for `main`; assert transcript recall is still off; seed an operator agent list and assert it survives. Then seed the per-agent block in **each** roster shape, write, and resolve again. For the migration scenario: seed a 2026.7.1-shaped `agents.list`, run `openclaw doctor --fix` in the image, feed **its output** to the writer, and resolve. |
| **Test data, both sides** | The per-agent seeds are the reviewer's own. Legacy: `"agents": {"list": [{"id": "main", "memory": {"search": {"rememberAcrossConversations": true, "sources": ["memory","sessions"]}}}]}`. Canonical: the same block under `"agents": {"entries": {"main": …}}`, which validated and resolved to `{"remember":true,"sources":["memory","sessions"]}` against the writer as reviewed. The third route adds `"experimental": {"sessionMemory": true}` with `rememberAcrossConversations` already **false**, so the scenario cannot pass on the key the other two force. The migration seed is a 2026.7.1 roster carrying all three. What must **not** change: an unrelated per-agent `maxResults: 9`, so forcing three keys is not rewriting the subtree. |
| **Why the `sessionMemory` scenario asserts the written config, not a gate** | `shouldRememberAcrossConversations` reads the other key, so a gate reading is `false` in both worlds and says nothing. The flag itself is the observable, which is the same reason the other scenarios read the gate rather than our own output. |
| **And the migration scenario reads what the migration did** | Whether `doctor --fix` moved the roster is the premise, so it is read out of the migrated config rather than assumed: if a later image stops moving it, the case says so instead of quietly exercising the legacy path twice. |
| **Expected** | Active for `main`; recall off; an operator-set agent list untouched; the per-agent override forced back; an unrelated per-agent setting surviving. |
| **What it found** | Green, 8 scenarios. **This is the pair that `.enabled === true` could not see**: `M1-1` and `M1-4` were green throughout blocker 1, because they asked our config and not the image's behaviour. And the first repair of blocker 2 was green here for the same kind of reason — the case seeded only the shape the guard happened to walk, so it measured the guard against its own assumption. |
| **Controls** | The `agents.entries` walk removed → 3 red, all three new scenarios. The `experimental.sessionMemory` clause removed → 1 red, only its own. Each half of the repair is therefore measured separately. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-7, M1-8, F1, NFR-M1. |

### M1-11 — the shell half, executed rather than read

| | |
|---|---|
| **Premise** | Finding 5 of 2026-09-28, and the only one the reviewer measured rather than traced: the tests injected `MEMORY_OPENAI_KEY` directly, so **deleting the shell's computation of it, or the `-e` line that passes it, left all 29 tests green**. Two links in the chain were untested and the suite could not tell. |
| **Component** | `openclaw.sh:292-293`, where `OPENAI_API_KEY` in `.env` becomes the flag, and `:439`, where the flag reaches the container. |
| **Steps** | Run the shell with a key in `.env` and without one, and read the flag it computed; then assert the `docker run` invocation carries it. |
| **Test data, both sides** | A key present (`OPENAI_API_KEY` set to a non-empty value) **and** absent, because a computation checked only one way is not shown to compute anything. |
| **Expected** | Flag `1` with the key, `0` without, and the flag present in what the writer is handed. |
| **What it found** | Green — and re-measured on 2026-10-13 with one control per half, in a detached worktree so the main one was not disturbed: removing the computation reddens *the key in .env becomes the flag, and its absence does not*; removing the `-e` line reddens *and the writer is actually handed it*. Each control reddens its own half and nothing else. |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-11, F1. |

## What is deliberately not here

**No mutation entry per case.** The rule adopted on 2026-09-19 is that a case may not be recorded as
passing without a registered mutation, and the registry lives on #17 and #18, which have not merged.
§2.4 of the feature document records the debt; `mutate.sh --gaps` will report these eleven as
`missing` once the registry is on `main`, which is the ordinary state of a registry being filled in
rather than an error.

**No case for the other four embedding providers.** `ollama` stands for all of them in `M1-9`, because
what is being tested is that the gate **steps back**, which is one behaviour and not four. Extending
the gate to answer *for* them needs a live backend per provider and is in `BACKLOG.md`.

### M1-12 — a credential the operator configured is a credential

| | |
|---|---|
| **Premise** | N3 of the 2026-10-13 re-review, and it is blocker 3 of 2026-09-28 for a configuration the schema supports. The gate read `MEMORY_OPENAI_KEY` — the environment — and nothing else, so an installation pointing `memory.search` at its own OpenAI-compatible endpoint (`provider: "openai"` with `remote.baseUrl` and `remote.apiKey`) and holding no `OPENAI_API_KEY` had memory search and the plugin switched **off on every start**, with a log line saying there was no embedding credential. There was one. We looked in the wrong place. |
| **Component** | the embedding-credential gate in `config/scripts/start/openclaw.sh`, driven through the real writer. |
| **Steps** | Write with `MEMORY_OPENAI_KEY=0` and an operator `remote.apiKey`; read `memory.search.enabled`, the plugin entry, the operator settings, and `config validate`. Then the same with a blank key. |
| **Test data, both sides** | What must be accepted: `provider: "openai"`, `remote.baseUrl: "http://embeddings.localhost:8080/v1"`, `remote.apiKey: "operator-own-key"`, with `MEMORY_OPENAI_KEY=0`. What must still be refused: the same with `apiKey: "   "` — three spaces, which is the shape a half-filled `.env` leaves and which must not count, because `.env.example:85` promises an installation with no keys at all is not given a failed embedding call per turn. |
| **Expected** | `memory.search.enabled` true and the plugin enabled in the first; the operator's `baseUrl` untouched; `config validate` exit 0. `enabled` false in the second. |
| **What it found** | Green, 2 scenarios. The counterpart is what keeps the repair from being *"always on"*, which would be blocker 3 facing the other way. |
| **The other half of N3, settled by decision rather than by code** | With a key present, an operator's explicit `memory.search.enabled: false` is turned back to `true` on every start. That is deliberate and it was simply not written down: NFR-M1 can only hold if the stack owns that switch, so §2.4 now says so, and says what the operator does keep — `/active-memory off --global`, which writes the plugin's inner `config.enabled: false` and the writer preserves (`M1-7`). |
| **Implemented by** | `tests/component/m-m1.memory-config.test.ts`. |
| **Covers** | M1-12, F3, NFR-M1. |

## Traceability

| Requirement | Covered by |
|---|---|
| F1 the start writes the memory keys where the schema has them | M1-1, M1-3, M1-4, M1-6, M1-9, M1-10, M1-11 |
| F2 an operator's tuning survives a start | M1-5 |
| F3 search reads memory files, not transcripts | M1-1, M1-6 |
| F4 the 2026.7 path carries neither key | M1-2 |
| NFR-M1 transcripts stay out until NFR-M4 redaction exists | M1-5, M1-6, M1-7, M1-8, M1-12 |
