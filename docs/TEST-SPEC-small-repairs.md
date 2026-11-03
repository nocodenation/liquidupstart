# Test specification: seven small repairs from `BACKLOG.md`

Status: **signed off on 2026-11-03.** SR-1 to SR-5 are implemented on `fix/small-backlog-repairs`
(#60), and the record below is theirs; SR-6 is implemented on `fix/opencode-refused-key-warning` (#63),
and its block records its own runs. Each block's *What it found* for SR-1 to SR-5 comes from the runs
after `c38fd78`, the commit that adds the code, and `1c8dd3b`, which gave SR-3 its control; each
block's *Shown able to fail* from `./tests/mutate.sh --case`, which refuses a subject with
uncommitted changes. All runs started and ended on a clean tree, one at a time; the
tiers and SR-5 ran at `1c8dd3b`:

- **SR tier.** `./tests/run.sh sr` gave 29 pass, 3 skip and 0 fail across four files, in 70 s. The
  three skips are the named notices for a missing OpenClaw image and missing dashboard dependencies,
  which skip where both are present.
- **Mutations.** Twenty registered, all validated: SR-1 fifteen and SR-2 two at `c38fd78`, SR-3 two
  at `1c8dd3b`, SR-4 one at `c38fd78`. SR-3's were refused at `c38fd78`, as below.
- **Full default tier.** 1759 pass, 19 skip and 0 fail across 218 files, in 29 minutes, with the
  dashboard dependencies installed and the 48 stack-level files left out as always; the dashboard
  gave 45 pass and 0 fail. Its stderr carried one message, the builder sweep reporting an image a
  concurrent case's container still held, which it reports by design and which was gone afterwards.
  The TypeError of `GitRepositories.svelte` is no longer printed.
- **Routing.** `scripts/tests/privacy-routing.test.sh`, TC-821 to TC-826, passed.
- **SR-5.** Passed on the worktree's stack on 2026-11-03; its block has the details.
- **After merging `main` with #61, at `1a4c1ca`.** `tests/mutations.json` conflicted and was resolved
  as the union, 171 entries; `./tests/mutate.sh --gaps` reports no orphan. The SR tier gave 29 pass,
  3 skip, 0 fail again, and `privacy-routing.test.sh` passed. `m-tr.case-ids` and the four files #61
  added or changed gave 63 pass and 2 fail: the two B7-10 cases under `bash -O compat42`, which fail
  on `main` at `6f892f7` the same way on this host, whose bash is 3.2.57 and has no `compat42`. The
  full tier was not run again on the merge.


Feature: `docs/FEATURE-small-repairs.md` (SR-FR1 to SR-FR8).

Files are named `tests/<level>/m-sr.<subject>.test.ts`. Their headers open with `M-SR · <Level> · …`
and follow the block of `docs/TEST-SPEC-git-integration.md` §4.2. `./tests/run.sh sr` runs them.

## 1. What is being tested, and at which level

| Component | Level | Rigour |
|---|---|---|
| The primary model's record in the config writer of `openclaw.sh` | component, real OpenClaw image | **Full branch coverage.** Under `only`: a drop with and without a record, no drop with and without one. In any other mode: a record and none, the primary as an object and as a string, and each way a record can be unusable. In any mode: a record that cannot be written or removed |
| `catalogOf()` in the same writer | component, real OpenClaw image | Both providers it serves, against the manifests the image ships |
| The redirect in `config/nginx/templates/nginx.conf` | unit, rendered by `nginx.sh` | Two ports, so that neither can pass as a constant |
| The null check in `GitRepositories.svelte` | component, mounted card | The state that threw, and the result line that follows it |
| The round trip on the running stack | system, operator check | Once, recorded |
| The 401 warning in `_discover_ids` of `config/opencode/entrypoint.sh` | unit, the real script run by #59's fixture; integration, one row in the image | **Full branch coverage** of the new decision: the proxy's own answer and a provider's, for both providers OpenCode asks; each kind of body taken for neither; no 401 at all; the body removed on both ways out |
| `.env.example` §8 and `README.md` | none | **No test.** Comments and prose; a test would assert a sentence and protect nothing (`CLAUDE.md`, *Coverage where it bites*). The pull request shows the text |

Nothing here depends on a model's answer. SR-5 is an operator check because only a real start under
both modes shows the round trip on an installation's own state.

## 2. Overview

| Case | Level | Sense | Scenario |
|---|---|---|---|
| **SR-1** | Component | positive | a start under `only` drops `anthropic/claude-opus-5`, pins `privacy-anthropic/claude-opus-5`, and records the dropped model |
| **SR-1** | Component | positive | …and the next start under `opt-in` restores `anthropic/claude-opus-5` and removes the record |
| **SR-1** | Component | positive | …and so does the next start with the proxy off |
| **SR-1** | Component | positive | …and so it does when the default was set to `privacy-openai/gpt-5.6-sol` under `only` |
| **SR-1** | Component | **negative** | a second start under `only` leaves the first start's record as it was |
| **SR-1** | Component | **negative** | a start under `only` that drops `openai/gpt-5.5` while a record is there keeps the record |
| **SR-1** | Component | **negative** | a start under `only` that drops nothing, with no record, writes none |
| **SR-1** | Component | **negative** | a start under `opt-in` with no record leaves `privacy-anthropic/claude-opus-5` as it is |
| **SR-1** | Component | positive | when `only` had nothing to pin, the next start under `opt-in` restores `openai/gpt-5.5` before the default block runs, which then pins nothing |
| **SR-1** | Component | positive | a primary written as a string, `"anthropic/claude-opus-5"`, is dropped and recorded under `only` |
| **SR-1** | Component | positive | a primary written as a string, `"privacy-anthropic/claude-opus-5"`, is replaced by the record's model under `opt-in` |
| **SR-1** | Component | **negative** | a record whose `dropped` is a list restores nothing, is removed with a line in the output, and the start succeeds |
| **SR-1** | Component | **negative** | …and likewise one whose `dropped` is an empty string |
| **SR-1** | Component | **negative** | …and likewise a record that is `null` |
| **SR-1** | Component | **negative** | …and likewise a record cut off mid-write |
| **SR-1** | Component | positive | a start under `only` that drops a model while an unusable record is there replaces it |
| **SR-1** | Component | **negative** | a start under `only` that drops nothing removes an unusable record as well, with the line in the output |
| **SR-1** | Component | **negative** | a directory where the record belongs, which cannot be removed, does not stop a start under `opt-in`, and the output says so |
| **SR-1** | Component | **negative** | …nor a drop under `only`, which cannot write over it, and no temporary file is left |
| **SR-2** | Component | **negative** | with the proxy on, `privacy-anthropic` offers neither `200k` nor `1m`, which the manifest of 2026.9.1 holds under `contextWindows` |
| **SR-2** | Component | positive | …and offers exactly the ten models of the anthropic manifest, `claude-opus-4-7`, `claude-sonnet-4-6` and `claude-opus-4-6` among them, which the manifest lists under `claude-cli` alone |
| **SR-2** | Component | positive | …and `privacy-openai` offers the nine models of the openai manifest, as before |
| **SR-2** | Component | positive | with the Claude subscription on, the `claude-cli` provider pins the same six models as before |
| **SR-3** | Unit | positive | rendered with `SYSTEM_HTTPS_PORT=9443`, `liquid.localhost` on HTTP answers `return 301 https://liquid.localhost:9443;` |
| **SR-3** | Unit | positive | …and with `SYSTEM_HTTPS_PORT=8833`, `return 301 https://liquid.localhost:8833;` |
| **SR-3** | Unit | **negative** | …and neither rendering contains `8889` |
| **SR-3** | Unit | positive | the control: the rendering with `9443` serves `liquid.localhost` over HTTPS on 9443 |
| **SR-4** | Component | **negative** | while a repository test is waiting for its answer, the card raises no error |
| **SR-4** | Component | positive | …and once the answer arrives, its line is shown |
| **SR-5** | System | positive | operator check: on the running stack, a start under `only` and one under `opt-in` bring OpenClaw back to the primary model it had |
| **SR-6** | Unit | positive | the proxy answers Anthropic's list with its own 401, `provider_key_missing`: the warning says the proxy holds no key, and nothing of a refusal |
| **SR-6** | Unit | positive | …and likewise for OpenAI's list, whose answer `_discover_ids` writes to a file of its own |
| **SR-6** | Unit | positive | OpenAI's list answers 401 with OpenAI's refusal: the warning says the provider refused the key, and nothing of a missing key |
| **SR-6** | Unit | positive | …and likewise Anthropic's list with Anthropic's refusal |
| **SR-6** | Unit | **negative** | …and neither refusal's message reaches stderr, stdout or `opencode.json`: not `Incorrect API key`, not `lu-sr-no***-key`, not `invalid x-api-key` |
| **SR-6** | Unit | **negative** | a 401 whose body is `Unauthorized`, not JSON, is taken for neither: the line names both |
| **SR-6** | Unit | **negative** | …nor is `{"error":"provider_key_missing"} junk`, valid JSON with more after it, which `jq` cannot read whole |
| **SR-6** | Unit | **negative** | …nor a body shaped like a wrapped missing-key answer, `{"detail":{"error":"provider_key_missing"}}` |
| **SR-6** | Unit | **negative** | …nor an `error` object of a shape no provider was measured giving, `{"error":{"code":"provider_key_missing"}}` |
| **SR-6** | Unit | **negative** | …nor a 401 with an empty body |
| **SR-6** | Unit | **negative** | with every list answered 200, stderr carries no `HTTP 401` line |
| **SR-6** | Unit | positive | after the first and third rows' answers the provider is still left out of `opencode.json`, and the start carries on |
| **SR-6** | Unit | **negative** | …and after the same answers the list is not asked again: one `HTTP 401` line, and no `unreachable` |
| **SR-6** | Unit | **negative** | after either provider's refusal its body is not left in `/tmp`, while the list that answered is |
| **SR-6** | Unit | **negative** | …nor is the body of a list that answered 403 ten times and was given up as unreachable |
| **SR-6** | Integration | positive | in the OpenCode image, under its own `sh` and `jq`, the missing-key line reaches the container log |

Every case has its negative counterpart above except SR-5. A start that must *not* restore is shown
at component level by row 8 of §3.1. Repeating it on the stack would show nothing the component
case does not.

SR-6 has no check on the stack. Its bodies are the ones the running proxy and the two providers
gave, the unit runs the real script, and its integration row runs it in the real image; a check on
the stack would add only a refused key, which this change does not set on anyone's installation.

## 3. Test data

### 3.1 SR-1: the config writer

The writer is taken from `openclaw.sh` by `configWriter()` in `tests/lib/openclaw-writer.ts`, and
run with `node` in `ghcr.io/openclaw/openclaw:2026.9.1`, with a temporary state directory mounted at
`/state`. A row with several starts runs them on one state directory, so the record one start leaves
is the record the next start finds.

**The environment**, on top of `BASE_ENV` in `tests/lib/openclaw-writer.ts`, set as `openclaw.sh`
sets it for each mode:

| Mode | `PRIVACY_ROUTING` | `ENABLE_CLAUDE_CLI` | `ENABLE_CODEX` | `PRIVACY_OPENAI`, `PRIVACY_ANTHROPIC` |
|---|---|---|---|---|
| `opt-in` | `opt-in` | `1` | `0` | `1`, `1` |
| proxy off | `off` | `1` | `0` | `0`, `0` |
| `only` | `only` | `0` | `0` | `1`, `1` |

Always `OC_SCHEMA_NEW=1`, the 2026.9 shape the stack writes, and
`PRIVACY_PROXY_URL=http://privacy-proxy:8080`. `ENABLE_LOCAL` stays `0` from `BASE_ENV`, so no local
LLM is offered. Row 9 deviates, and says how.

**Starting point A** is `{}`, run once under `opt-in`. With the Claude subscription on, that pins
`anthropic/claude-opus-5`, today's behaviour and the state measured on 2026-10-31. **"After row 1"**
means a copy of the state directory as row 1 left it, made afresh for each row that names it, so no
row sees what another row did.

| Row | Before the start | Start |
|---|---|---|
| 1 | starting point A | `only` |
| 2 | after row 1 | `opt-in` |
| 3 | after row 1 | proxy off |
| 4 | after row 1, with `agents.defaults.model.primary` set to `privacy-openai/gpt-5.6-sol` | `opt-in` |
| 5 | after row 1 | `only` |
| 6 | after row 1, with `agents.defaults.model.primary` set to `openai/gpt-5.5` | `only` |
| 7 | `{"agents":{"defaults":{"model":{"primary":"privacy-anthropic/claude-opus-5"}}}}`, no record | `only` |
| 8 | the same, no record | `opt-in` |
| 9 | `{}` run under `opt-in` with `ENABLE_CLAUDE_CLI=0`, `ENABLE_CODEX=1` and both privacy providers `0`, which pins `openai/gpt-5.5`; then a start under `only` with both privacy providers `0` | `opt-in`, with `ENABLE_CODEX=1` |
| 10 | `{"agents":{"defaults":{"model":"anthropic/claude-opus-5"}}}`, no record | `only` |
| 11 | `{"agents":{"defaults":{"model":"privacy-anthropic/claude-opus-5"}}}`, record `{"dropped":"anthropic/claude-opus-5"}` | `opt-in` |
| 12 | primary `privacy-anthropic/claude-opus-5`; record `{"dropped":["anthropic/claude-opus-5"]}` | `opt-in` |
| 13 | primary `privacy-anthropic/claude-opus-5`; record `{"dropped":""}` | `opt-in` |
| 14 | primary `privacy-anthropic/claude-opus-5`; record `null` | `opt-in` |
| 15 | primary `privacy-anthropic/claude-opus-5`; record `{"dropped":` | `opt-in` |
| 16 | starting point A; record `{"dropped":` | `only` |
| 17 | primary `privacy-anthropic/claude-opus-5`; record `{"dropped":` | `only` |
| 18 | primary `privacy-anthropic/claude-opus-5`; an empty directory named `privacy-routing-primary.json` | `opt-in` |
| 19 | starting point A; an empty directory named `privacy-routing-primary.json` | `only` |

**Why the data is shaped this way.**

- `anthropic/claude-opus-5` to `privacy-anthropic/claude-opus-5` is the change measured on
  2026-10-31.
- Row 4's `privacy-openai/gpt-5.6-sol` is offered under `only`, so the operator could really have set
  it there. It is the UC2 case: a default set under `only` does not outlast it.
- Row 6's `openai/gpt-5.5` is on a route `only` removes, and differs from row 1's dropped model, so
  a record that was replaced rather than kept shows.
- Rows 7 and 8 are UC5, an installation that went through `only` before this change, once per mode.
  They are the counterparts that show writing and restoring depend on a drop and on a record, not on
  a privacy model alone.
- Row 9 is decision 4. Under `only` with no privacy provider and no local LLM there is nothing to pin,
  so the primary is missing. Its starting point runs with both privacy providers `0` as well, because
  the writer keeps a `privacy-*` provider it wrote earlier, and a stale one would be pinned. Under
  `opt-in` with the subscription on, the writer would pin `anthropic/claude-opus-5`, so the restored
  `openai/gpt-5.5` can only come from the record. The last start keeps Codex on, as the installation
  had it, so the restored model has its route; the local review of the implementation noted that the
  first version ended with Codex off and so restored a model nothing served.
- Rows 10 and 11 put the string form on each side. On the way back the primary is an object whenever
  this writer pinned it, so row 11 needs the string written by hand to reach that branch.
- Rows 12 to 15 are decision 5's unusable records, one per way the check can be incomplete. Row 12's
  list is not empty and not `""`, so only a check of the type refuses it, whatever form the check for
  emptiness takes. A type check alone passes row 13. `null` is the one value other than an object on
  which reading `dropped` throws; a list, a string or a number gives `undefined` there, which the
  type check refuses. A parse without a guard fails row 15.
- Row 16 is decision 3's exception: the cut-off record of row 15 holds nothing to bring back, so the
  drop of `anthropic/claude-opus-5` must replace it.
- Row 17 is decision 5 under `only`: with nothing dropped, the cut-off record goes as it would in
  another mode.
- Rows 18 and 19 are decision 7. A directory stands where the record belongs, so reading it fails,
  removing it with a file's removal fails, and renaming a file onto it fails: once on the way out,
  under `opt-in`, and once on the way in, under `only` with a drop. Both were found by the local
  review of the implementation.

### 3.2 SR-2: the manifests

Two starts under `opt-in` in the same image, on `{}`:

- **start a:** `ENABLE_CLAUDE_CLI=0`, both privacy providers `1`, as `openclaw.sh` sets them with an
  OpenAI and an Anthropic key in `.env`;
- **start b:** as start a, with `ENABLE_CLAUDE_CLI=1`.

Measured on 2026-11-02 in `ghcr.io/openclaw/openclaw:2026.9.1`, deduplicated to the widest entry per
id as `catalogOf()` does:

- **anthropic, today:** `claude-opus-5`, `200k`, `1m`, `claude-sonnet-5`, `claude-fable-5-1`,
  `claude-fable-5`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6`,
  `claude-mythos-5`, `claude-haiku-4-5`.
- **anthropic, read from `modelCatalog.providers.*.models`:** the same without `200k` and `1m`, in
  that order, ten ids.
- **openai, both ways:** `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.5-pro`,
  `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`.
- **`claude-cli`, both ways:** `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1`,
  `claude-fable-5`, `claude-opus-4-8`, `claude-mythos-5`.

### 3.3 SR-3: the rendering

`config/scripts/start/nginx.sh` and `lib/components.sh` are copied into a fresh `mktemp -d` tree with
today's template, and run there, as `tests/integration/m-cs.nginx-starts.test.ts` does. `.env` is
`exampleEnv()` from `tests/lib/startfixture.ts` with `ENABLE_LIQUID=0`, `SYSTEM_HTTP_PORT=8888`, and
`SYSTEM_HTTPS_PORT` set to `9443` in one run and `8833` in the other. `9443` is neither the default
nor the old literal, so only the placeholder can produce it. `ENABLE_LIQUID=0` spares the keystore,
which needs Docker or `keytool`. The HTTP block for `liquid.localhost` is rendered either way.

### 3.4 SR-4: the card

The card is mounted with `mountComponent()` from `tests/lib/mount.ts`, with the repository of
`tests/component/m-a16.result-line.test.ts`: `github.com_nocodenation_agent-skills`, not cloned,
`Permission denied (publickey).`, `canRetry: true`. `fetch` is stubbed with a promise the case
resolves itself, so the card stays in the state where `results[slug]` is `null` for as long as the
case looks. The answer it then resolves with is `{"ok":false,"message":"…still unreachable…"}`, the
text m-a16 uses. Errors are collected from `console.error` and from errors raised outside the case
while it runs.

### 3.5 SR-6: the answers to the model lists

The entrypoint runs through `runEntrypoint()` of `tests/lib/opencodefixture.ts` (#59), with
`BASE_ENV`, `PRIVACY_ROUTING` unset and `ENABLE_ANTHROPIC_CLAUDE_CODE=0`. The local list answers
`LOCAL` with 200. The list under test answers 401 with one of the bodies below, 403 in row 15; the
other proxy list answers `OPENAI` or `ANTHROPIC` with 200. Row 11 answers all three lists with 200,
`ALL_ON`. Rows 5, 12, 13 and 14 read the runs of rows 1, 3 and 4 again rather than repeat them; a
run is made when a row first needs it, so one that throws fails the rows reading it, not the file.

- **The proxy's own answer, Anthropic:** `{"error":"provider_key_missing","provider":"anthropic"}`,
  as the running proxy 0.3.0 gave it on 2026-11-03. It is the fixture's `ANTHROPIC_KEY_MISSING`,
  which the RO cases use as well.
- **The proxy's own answer, OpenAI:** `{"error":"provider_key_missing","provider":"openai"}`, the
  same handler with `openai` in place of `anthropic`. The installation it was measured on holds an
  OpenAI key, so the proxy could not be made to give it without changing that key.
- **OpenAI's refusal:**
  `{"error":{"message":"Incorrect API key provided: lu-sr-no***-key. You can find your API key at https://platform.openai.com/account/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}`,
  OpenAI's answer to `lu-sr-not-a-key` on 2026-11-03. The key is made up and shaped so that nothing
  takes it for a real one; the fragment OpenAI echoes is what row 5 looks for. Row 15 sends the same
  body with 403, a pairing invented on purpose: a provider's status for a key without permission.
- **Anthropic's refusal:**
  `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_011Cgg9ReqgB89TncJDxGBcD"}`,
  Anthropic's answer to the same key on the same day.
- **Not JSON:** `Unauthorized`. **More after it:** `{"error":"provider_key_missing"} junk`, which
  `jq` reads as `missing` and then fails on. **Wrapped:** `{"detail":{"error":"provider_key_missing"}}`.
  **Unmeasured object:** `{"error":{"code":"provider_key_missing"}}`. **Empty:** a 401 without a
  body. All on Anthropic's list, and all invented on purpose: shapes a changed proxy or provider
  could send, which nothing measured. The three that carry `provider_key_missing` show that the
  string alone, out of place or followed by more, is not taken for the proxy's answer.

The case compares whole lines, from `WARNING:` to `provider skipped.`, each with the URL it names.
The line naming both begins as the missing-key line does, so a prefix would let it pass for one.

The stub `curl` empties its output file for an answer without a body, as curl 8.14.1 does, and a run
reports the files it left in its `/tmp`.

The integration row runs on RO-5's two containers (`tests/integration/m-ro.opencode-reads.test.ts`):
`liquidupstart/opencode:latest`, the working tree's entrypoint mounted, the same stub `curl`, and the
Anthropic list answering `KEY_MISSING`. It reads the `only` container's `docker logs`. It lives in
RO-5's file, so `./tests/run.sh ro` runs it and `./tests/run.sh sr` does not.

## 4. Cases

### SR-1 — the primary model after `only`

| | |
|---|---|
| **Premise** | A start under `only` replaces a primary model on a removed route with a privacy model. The next start in another mode must bring the operator's model back, as the sign-ins come back (SR-FR1, SR-FR2). Today the privacy model stays. |
| **Component** | The config writer in `config/scripts/start/openclaw.sh`, run in the real image as §3.1 describes. |
| **Steps** | The nineteen rows of §3.1. After each start, read the writer's exit status and output, `agents.defaults.model` from `openclaw.json`, and the record `privacy-routing-primary.json` beside it. |
| **Test data, both sides** | §3.1. |
| **Expected** | Row 1: primary `privacy-anthropic/claude-opus-5`, and the record holds `{"dropped":"anthropic/claude-opus-5"}`. Rows 2, 3 and 4: primary `anthropic/claude-opus-5`, no record. Row 5: primary `privacy-anthropic/claude-opus-5`, and the record byte for byte as row 1 left it. Row 6: primary `privacy-anthropic/claude-opus-5`, and the record byte for byte as row 1 left it. Rows 7 and 8: primary `privacy-anthropic/claude-opus-5`, no record. Row 9: after the `only` start, no primary and the record `{"dropped":"openai/gpt-5.5"}`; after the `opt-in` start, primary `openai/gpt-5.5`, no record, the output contains `restored primary model openai/gpt-5.5`, and it does not contain `pinned default primary model`. Row 10: primary `privacy-anthropic/claude-opus-5`, and the record holds `{"dropped":"anthropic/claude-opus-5"}`. Row 11: primary `anthropic/claude-opus-5`, no record. Rows 12 to 15: exit status 0, primary `privacy-anthropic/claude-opus-5`, no record, and the output contains `removed an unusable privacy-routing-primary.json`. Row 16: primary `privacy-anthropic/claude-opus-5`, and the record holds `{"dropped":"anthropic/claude-opus-5"}`. Row 17: exit status 0, primary `privacy-anthropic/claude-opus-5`, no record, and the output contains `removed an unusable privacy-routing-primary.json`. Row 18: exit status 0, primary `privacy-anthropic/claude-opus-5`, and the output contains `could not remove privacy-routing-primary.json`. Row 19: exit status 0, primary `privacy-anthropic/claude-opus-5`, and the output contains `could not record primary model anthropic/claude-opus-5`. In every row, no file whose name starts with `privacy-routing-primary` is left beside `openclaw.json` other than the record where one is expected, so no temporary file of decision 6 stays behind. |
| **Dependencies** | Docker, `ghcr.io/openclaw/openclaw:2026.9.1` present locally. Skipped without the image, and the skip names it. |
| **Shown able to fail** | Fifteen registered, all validated at `c38fd78`, each under the row it is registered for; the counts are of nineteen rows. The record not written, row 1: 8 red, the rows that expect a record or a restore from one (1 to 4, 9, 10, 16 and 19). The restore removed, row 2: 5 red (2, 3, 4, 9, 11). A record already there replaced, row 6: 1 red. An unusable record kept on a drop, row 16: 2 red, 16 and the directory of 19. A record written on every start under `only` that has no usable one, row 7: 2 red, 7 and 17. The record kept after an `opt-in` start, row 2: 5 red. The restore moved after the default block, row 9: 1 red. The string form not handled on the way back, row 11: 1 red. The check that `dropped` is a string removed, row 12; that it is not empty, row 13; for `null`, row 14: 1 red each. The parse left unguarded, row 15: 5 red, 15 to 19, since a directory cannot be read either. The unusable record kept under `only`, row 17: 1 red. The removal left unguarded, row 18: 11 red, every row that removes a record, because the `finally` the mutation puts in has no error to name. The writing left unguarded, row 19: 5 red, every row that writes one. Row 8 has no mutation of its own: it holds on the code before this change as well, and is there as the counterpart of row 2. **Decision 6 has no row.** A failure between the restore and the write of `openclaw.json` cannot be brought about without changing the writer, and in a run that succeeds both orders leave the same files; the order is read in review. |
| **What it found** | Run at `c38fd78` on a clean tree: 19 / 0. The local review of the implementation added rows 17 to 19, decision 7 and row 9's Codex: a directory at the record's path aborted the start after `openclaw.json` was written, an unusable record outlived an `only` start that dropped nothing, and row 9 restored a model nothing served. It also found `scripts/tests/privacy-routing.test.sh`'s TC-824 passing through the restore, which the feature's §11 records. |
| **Implemented by** | `tests/component/m-sr.primary-restored.test.ts`. |
| **Covers** | SR-FR1, SR-FR2, UC1 to UC5. |

### SR-2 — the models `privacy-anthropic` offers

| | |
|---|---|
| **Premise** | `catalogOf()` reads the context options of four models as models of their own (SR-FR3). The repair reads the models the manifest declares. It must not lose a model, nor change the other provider it serves or the Claude CLI's list. |
| **Component** | The config writer, run in the real image, with the image's own manifests. |
| **Steps** | Starts a and b of §3.2. Read the ids of `models.providers["privacy-anthropic"].models` and `["privacy-openai"].models` after start a, and of `["claude-cli"].models` after start b. |
| **Test data, both sides** | §3.2. |
| **Expected** | `privacy-anthropic`: the ten ids of §3.2, in that order, with neither `200k` nor `1m`. `privacy-openai`: the nine ids. `claude-cli`: the six ids. |
| **Dependencies** | As SR-1. |
| **Shown able to fail** | Registered twice, for rows 1 and 2: the walk over every node put back in place of the structural read. Validated at `c38fd78`: rows 1 and 2 red, 3 and 4 green. |
| **What it found** | Run at `c38fd78` on a clean tree: 4 / 0. |
| **Implemented by** | `tests/component/m-sr.catalog-models.test.ts`. |
| **Covers** | SR-FR3. |

### SR-3 — the redirect from `http://liquid.localhost`

| | |
|---|---|
| **Premise** | The redirect must lead to the port Liquid is served on, which is `SYSTEM_HTTPS_PORT` (SR-FR4). Today it names 8889 whatever the setting. |
| **Component** | `config/nginx/templates/nginx.conf`, rendered by `config/scripts/start/nginx.sh` as §3.3 describes. |
| **Steps** | Render twice. In each rendering, find the server block with `server_name liquid.localhost;` that listens on the HTTP port, and read its `return` line. Search the whole rendering for `8889`. In the first rendering, find the block for `liquid.localhost` that listens on `9443 ssl`. |
| **Test data, both sides** | §3.3. |
| **Expected** | `return 301 https://liquid.localhost:9443;` and `return 301 https://liquid.localhost:8833;`. No `8889` in either rendering. The HTTPS block on 9443 is there. |
| **Dependencies** | `bash`, `openssl`. |
| **Shown able to fail** | Registered twice, for rows 1 and 3: the placeholder put back to `8889`. Validated at `1c8dd3b`: rows 1 to 3 red, the control green. At `c38fd78`, before the control existed, `tests/mutate.sh` refused both: every test in the file went red, which a broken file does as well. |
| **What it found** | Run at `1c8dd3b` on a clean tree: 4 / 0. |
| **Implemented by** | `tests/unit/m-sr.liquid-redirect.test.ts`. |
| **Covers** | SR-FR4. |

### SR-4 — the repositories card while a test runs

| | |
|---|---|
| **Premise** | While a repository test waits for its answer, `results[slug]` is `null`, and the effect that drops contradicted lines must not read through it (SR-FR5). Today it throws *TypeError: null is not an object*, which m-a16's cases print without failing. |
| **Component** | `dashboard/src/lib/components/GitRepositories.svelte`, mounted as §3.4 describes. |
| **Steps** | Mount the card. Press *Test this repository* while `fetch` has not answered, and let the card settle. Resolve the answer, and let it settle again. |
| **Test data, both sides** | §3.4. |
| **Expected** | No error collected while the answer is pending. Once it has arrived, the card shows `is still unreachable`. |
| **Dependencies** | `DASHBOARD_DEPS`, as every component case of the card. |
| **Shown able to fail** | Registered and validated at `c38fd78`: the check removed, row 1 red and row 2 green. Row 1's failure carried `TypeError: null is not an object (evaluating '$.get(results)[slug].cloned')`, the error the BACKLOG entry describes. |
| **What it found** | Run at `c38fd78` on a clean tree: 2 / 0. The worktree had no `dashboard/node_modules` at first, and the file then ran only its notice; the dependencies were installed before any run recorded here. With the check, `m-a16.result-line.test.ts` no longer prints the TypeError. |
| **Implemented by** | `tests/component/m-sr.result-line-null.test.ts`. |
| **Covers** | SR-FR5. |

### SR-5 — the round trip on the running stack

| | |
|---|---|
| **Premise** | SR-1 runs the writer on its own. Only a real start shows that `openclaw.sh` hands it the mode, that the record survives between starts in `volumes/_openclaw`, and that OpenClaw starts with the restored model. |
| **Component** | The running stack: `openclaw.sh`, `openclaw-gateway` and the browser. |
| **Steps** | With OpenClaw's primary at `anthropic/claude-opus-5` and the proxy on: set `PRIVACY_PROXY_ROUTING=only`, start, and read the primary in OpenClaw and in `volumes/_openclaw/openclaw.json`, and the record. Set `opt-in`, start, and read both again. |
| **Test data, both sides** | The worktree's installation, whose primary was set back by hand to `anthropic/claude-opus-5` on 2026-10-31. |
| **Expected** | Under `only`: `privacy-anthropic/claude-opus-5` and the record of SR-1 row 1. Under `opt-in`: `anthropic/claude-opus-5`, no record, and OpenClaw answering. |
| **Dependencies** | The worktree's stack, with the Claude subscription on. |
| **What it found** | Run on 2026-11-03 on the worktree's stack, `../liquidupstart-wt-50`, with the proxy and the Claude subscription on and routing at `opt-in`. For the two starts, `config/scripts/start/openclaw.sh` of `1c8dd3b` was copied over the worktree's, the only file of the start that differs, and put back afterwards. Before: `anthropic/claude-opus-5` in `openclaw.json` and in `openclaw config get agents.defaults.model` inside `openclaw-gateway`, and no record. **`only`:** `start.sh` exited 0 and printed `dropped primary model anthropic/claude-opus-5` and `pinned default primary model = privacy-anthropic/claude-opus-5`; the file and the gateway named `privacy-anthropic/claude-opus-5`, and the record held `{"dropped":"anthropic/claude-opus-5"}`. **`opt-in`:** `start.sh` exited 0 and printed `restored primary model anthropic/claude-opus-5`; the file, the gateway and `openclaw models status` named `anthropic/claude-opus-5`, the record was gone, the gateway was healthy and `openclaw.localhost` answered 200. Its allowed models listed `privacy-anthropic` without `200k` and `1m`, which is SR-2 on the stack. No sign-in moved: this installation has no file `openclaw_login_paths` lists, and its `auth_profile_store` is empty. The Claude login sits in `volumes/_openclaw-claude`, which the override replaces under `only` and does not move; its `.credentials.json` was refreshed at 13:49 during the run, as the CLI refreshes it, with a token valid for eight hours. Both starts warned, as every start there does, that three declared repositories cannot be cloned while their deploy keys are unregistered. |
| **Covers** | SR-FR1, SR-FR2, UC1. |

### SR-6 — OpenCode's warning for a refused key

| | |
|---|---|
| **Premise** | On a 401 the warning must say what the proxy's answer says: no key held, or a key the provider refused, and both where the answer is of none of the measured shapes (SR-FR8). No body may be printed or left behind. Today it says no key in every case, and leaves the body in `/tmp`. |
| **Component** | `_discover_ids` in `config/opencode/entrypoint.sh`, run whole by `runEntrypoint()`, with `curl` answering from §3.5; and once in the OpenCode image. |
| **Steps** | Run the entrypoint once per answer of §3.5. Read stderr, stdout, the exit code, `opencode.json` and the files left in the sandbox's `/tmp`. In the image, read the container log. |
| **Test data, both sides** | §3.5. |
| **Expected** | Rows 1 and 2: the missing-key line for `…/anthropic/v1/models` and `…/openai/v1/models`, and no `refused` anywhere on stderr. Rows 3 and 4: the refusal line, and no `holds no key`. Row 5: none of the three message fragments on stderr, on stdout or in `opencode.json`. Rows 6 to 10: the line naming both, for `…/anthropic/v1/models`. Row 11: no `HTTP 401`. Row 12: exit code 0 both times; `opencode.json`'s `provider` holds no `privacy-anthropic` after row 1's answers and no `privacy-openai` after row 3's, and holds the other, which answered 200, each time. Row 13: after either run, exactly one line of stderr contains `HTTP 401`, and none contains `unreachable`. Row 14: after OpenAI's refusal `/tmp` holds `privacy_models.json` and no `privacy_openai_models.json`, after Anthropic's the reverse. Row 15: stderr carries `…/openai/v1/models unreachable (HTTP 403)`, and `/tmp` holds no `privacy_openai_models.json`. Row 16: the container log holds the missing-key line for `…/anthropic/v1/models`. |
| **Dependencies** | `sh`, `jq`; the fixture refuses to run without `jq`. Row 16: Docker and `liquidupstart/opencode:latest`, skipped without them as RO-5 is, with a notice naming both. |
| **Shown able to fail** | Twenty registered, all validated at `d4224cd`, each under the row it is registered for; the unit counts are of fifteen rows, the image row's of RO-5's file, four. The missing-key branch removed: rows 1 and 2, 2 red each (1 and 2), and row 16, 1 red. The refusal branch removed: rows 3 and 4, 2 red each (3 and 4). OpenAI's shape removed from it, row 3, and Anthropic's, row 4: 1 red each. Any other body read as a refusal, as first specified, rows 6 to 10: 5 red each (6 to 10). Any `error` object read as a refusal, as the second draft had it, row 9: 1 red. `jq`'s failure ignored, row 7: 1 red. The default file read in place of `$_f`, row 2: 2 red. The body printed to stderr, row 5: 1 red; to stdout, row 5: 11 red, since the body then lands in `opencode.json`, which no longer parses, and every row reading those runs fails. The `return` removed, row 13: 1 red. The body kept after a 401, row 14, and after the last try, row 15: 1 red each. The first local review found the `return` mutation surviving the first eight rows, which is why row 13 exists. Rows 11 and 12 have no mutation of their own: they hold on the code before this change as well, and are there as the counterparts of the warning rows. |
| **What it found** | Run at `d4224cd` on a clean tree, one at a time: `./tests/run.sh sr` gave 44 pass, 3 skip and 0 fail, SR-6's fifteen rows among them; `./tests/run.sh ro` gave 33 pass and 0 fail, row 16 among them. The full default tier gave 1843 pass, 19 skip and 2 fail across 229 files: the two B7-10 cases under `bash -O compat42`, which fail on `main` the same way on this host, whose bash is 3.2.57. After merging `main` with #62 at `7c0f998`, which changed documents only: `./tests/run.sh sp` 73 / 0, and `m-tr.case-ids`, `m-cu.remove-volumes` and this file 57 / 0. Before any of it ran, the local reviews of the implementation changed the specification: a 401 asked again after its warning went unseen (row 13); a drafted limit, a stale file read after an empty 401, was measured false, since curl empties the file; #59's 401 body was invented; any body but the proxy's was read as a refusal, then any `error` object (rows 6 to 10); the body stayed in `/tmp` (rows 14 and 15); `jq`'s failure was ignored (row 7); stdout and `opencode.json` were not checked (row 5). |
| **Implemented by** | `tests/unit/m-sr.refused-key.test.ts` (rows 1 to 15) and `tests/integration/m-ro.opencode-reads.test.ts` (row 16). |
| **Covers** | SR-FR8. |
