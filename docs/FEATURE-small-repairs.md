# Feature: seven small repairs from `BACKLOG.md`

Status: **signed off on 2026-11-03.** Sections 2 to 7 are implemented on `fix/small-backlog-repairs`
(#60), section 8 on `fix/opencode-refused-key-warning` (#63). Section 8 was changed after the local
reviews of its implementation, as it records, and the changed version was signed off on 2026-11-03.
Found: seven `OPEN` entries of `BACKLOG.md`, each named under its section below. The operator approved
them as one package on 2026-10-31, to wait for #56, which has since merged. The test specification is
`docs/TEST-SPEC-small-repairs.md`.

## 1. Purpose

Each entry is a defect someone measured and a repair the entry already names. None of them needs a
decision about how the stack should behave. They were approved together because each is too small for
a pull request of its own; section 8 became one all the same, as below.

| Section | `BACKLOG.md` entry | What changes |
|---|---|---|
| 2 | *Switching from `only` back to `opt-in` leaves OpenClaw on the privacy model* | The model `only` drops comes back |
| 3 | *OpenClaw offers `200k` and `1m` as models of `privacy-anthropic`* | The picker offers models only |
| 4 | *`http://liquid.localhost` redirects to port 8889, where nothing listens* | The redirect names `SYSTEM_HTTPS_PORT` |
| 5 | *The repositories card's result line throws when a repository is tested* | The null check |
| 6 | *`.env.example` says the cleaned Claude route has no tools* | The sentence says which tools |
| 7 | *The README gives the host's memory, but Docker Desktop's VM is what runs out* | The memory line names the VM |
| 8 | *OpenCode's warning for a refused key says that no key is set* | The warning tells a missing key from a refused one |

**Section 8 came later.** Its line in `config/opencode/entrypoint.sh` sits in `_discover_ids`,
whose two lines above it #59 changed, and the fixture a test of it runs on,
`tests/lib/opencodefixture.ts`, came with #59. It therefore waited for #59, to join #60 as a section
of its own. #60 merged first, on 2026-11-03, and the operator decided the same day that section 8
becomes a pull request of its own.

## 2. The primary model after `only`

**What happens today.** Under `only`, the config writer in `config/scripts/start/openclaw.sh`
drops a primary model whose route `only` removes. A few lines further down it pins the first privacy
model in its place. On 2026-10-31 that turned `anthropic/claude-opus-5` into
`privacy-anthropic/claude-opus-5`. The next start in `opt-in` keeps it, because it is still a valid
model. The sign-ins `only` set aside come back, but the operator's model does not. On the Claude
subscription that changes what works: the cleaned route carries the client's tools, but not Claude
Code's own.

What the writer reads and writes is OpenClaw's default model, `agents.defaults.model.primary`.

**Use cases.**

- **UC1, `only` and back.** The operator works on `anthropic/claude-opus-5`, starts once under `only`
  and then again under `opt-in`. OpenClaw opens on `anthropic/claude-opus-5` again.
- **UC2, a default changed under `only`.** Under `only`, the operator sets the default to
  `privacy-openai/gpt-5.6-sol`. The next start under `opt-in` brings back `anthropic/claude-opus-5`
  all the same. What is set under `only` does not outlast it, just as a sign-in made under `only`
  does not.
- **UC3, `only` twice.** A second start under `only` finds the privacy model already pinned and
  drops nothing. The record of the first start stays as it is.
- **UC4, the proxy switched off.** For the writer that is a mode other than `only`, so it behaves as
  in UC1.
- **UC5, an installation that went through `only` before this change.** Nothing is recorded there, so
  nothing comes back. The one installation known to be affected, the worktree's, was set back by hand
  on 2026-10-31.

**Decisions.**

1. **The record is a file beside `openclaw.json`, in the directory of the file the writer writes:
   `volumes/_openclaw/privacy-routing-primary.json` on a stack.** The entry suggests keeping the
   model with the sign-ins `only` sets aside. The writer cannot reach that place. It runs in a
   container that mounts the state directory only, and the directory for the withheld sign-ins must
   not be mounted into any container (`privacy-routing.sh`, at `withhold_openclaw_logins`). Writing
   the record into `openclaw.json` itself is ruled out as well: OpenClaw's validator refuses a key it
   does not know, and the gateway then does not start. A model id is not a secret, so a file the agent
   containers can read is acceptable. Taking the directory from the path the writer writes keeps
   `scripts/tests/privacy-routing.test.sh` working, which runs the writer on a copy through
   `OPENCLAW_JSON`.
2. **The record comes back as the sign-ins do: unconditionally.** In any mode other than `only`, a
   usable record becomes the primary model, whatever the primary is by then, and the record is
   removed. That is what the entry proposes. The first draft of this specification restored only
   while the primary was still the model `only` had pinned, so that a default set under `only` would
   survive. The local review showed what that comparison costs: a `pinned` that turns stale when a
   later `only` start pins a model the first could not, a separate rule for `only` pinning nothing,
   and a branch each to test. Treating the default the way the sign-ins are treated needs none of it.
3. **A usable record already there is kept.** Under `only` a drop can only meet a record when the
   default was set, after the first drop, to a model on a removed route. The record already holds the
   model from before `only`, and that is the one to bring back. `withhold_openclaw_logins` does the
   same with a sign-in it already holds: the copy set aside first stays, and the newer one is removed.
   An unusable record (decision 5) holds nothing to bring back, so a drop replaces it.
4. **The restore runs before the writer pins a default model.** When `only` had nothing to pin, the
   primary is missing on the way back. The default block then finds the restored model and pins
   nothing, instead of pinning one, announcing it, and having it replaced.
5. **A record that cannot be used is removed, and nothing is restored, in any mode.** Under `only` a
   drop replaces it (decision 3), and without a drop it goes as it would elsewhere. It is usable
   when it is a JSON object whose `dropped` is a non-empty string. Anything else, a file cut off
   mid-write, `null`, or a `dropped` of another type or empty, is logged and removed, and the start
   carries on. The writer runs under `set -euo pipefail` in a `docker run` that nothing guards, so a
   parse error would abort the OpenClaw start; and a `dropped` of another type would become a primary
   model the validator refuses.
6. **The record is written whole, and removed only once `openclaw.json` is written.** The writer
   writes it to a temporary file beside it and renames that into place, so no reader meets half a
   record. It builds `openclaw.json` in memory and writes it at its very end. A record removed before
   that would be gone if the writer failed on the way, while `openclaw.json` still held the privacy
   model. So the restore only notes the record, and the writer removes it after `openclaw.json` is
   written.
7. **The record never stops a start.** Writing it or removing it can fail, for instance where a
   directory stands at its path. The writer then logs the failure, removes its temporary file, and
   carries on; OpenClaw starts with or without the record. The local review of the implementation
   found that case: the removal threw after `openclaw.json` was written, and under
   `set -euo pipefail` the OpenClaw start aborted.

**What the start prints.** A restore prints
`openclaw.json: privacy routing, restored primary model anthropic/claude-opus-5`. An unusable record
prints `openclaw.json: privacy routing, removed an unusable privacy-routing-primary.json`. A record that
cannot be written prints `openclaw.json: privacy routing, could not record primary model
anthropic/claude-opus-5 (…)`, and one that cannot be removed `openclaw.json: privacy routing, could
not remove privacy-routing-primary.json (…)`, each with the error. The drop keeps the line it prints
today.

**Data structure.** `privacy-routing-primary.json` beside `openclaw.json`, written by the writer
under `only`, read and removed by it in any other mode:

```json
{ "dropped": "anthropic/claude-opus-5" }
```

`dropped` is the primary model `only` removed, a non-empty string.

## 3. The model picker of `privacy-anthropic`

`catalogOf()` in `openclaw.sh` collects every node of a bundled plugin manifest that has a string
`id` and a numeric `contextWindow`. In the anthropic manifest of OpenClaw 2026.9.1, sixteen entries
under the `contextWindows` lists of four models have both, such as
`{"id":"200k","label":"200K","contextWindow":200000}`. They describe a model's context options, but
`catalogOf()` reads them as models.

**Decision.** `catalogOf()` reads the models a manifest declares, `modelCatalog.providers.*.models`,
across every provider in it. An entry still needs a string `id` and a numeric `contextWindow`, as
today: the entry the writer builds from it carries the context window, and the deduplication keeps
the widest. Measured on 2026-11-02, deduplicated as `catalogOf()` does:

- **2026.9.1:** the walk gives twelve ids for anthropic, `200k` and `1m` among them; the structural
  read gives the other ten, in the walk's order, `claude-opus-5` first. For openai both give the same
  nine.
- **2026.7.1:** both give the same ids for both manifests.

Skipping the key `contextWindows` would give the same ten today. It was the first draft, and the
local review of the specification turned it down: the next nested list whose entries carry an `id`
and a `contextWindow` would be read as models again. Reading only
`modelCatalog.providers.anthropic.models` would drop `claude-opus-4-7`, `claude-sonnet-4-6` and
`claude-opus-4-6`, which the manifest lists under `claude-cli` alone. The Claude CLI's list does not
change, because its filter admits `claude-…` ids only.

## 4. The redirect from `http://liquid.localhost`

The last server block of `config/nginx/templates/nginx.conf` answers
`return 301 https://liquid.localhost:8889;`. That port has been written literally since `f2b9806`
(2026-06-19). Liquid is served on `SYSTEM_HTTPS_PORT`, 8833 by default. `nginx.sh` replaces the
placeholder `SYSTEM_HTTPS_PORT` everywhere in the template, so writing the placeholder there is the
whole repair. The path is still not carried over, as before: the redirect goes to the root.

## 5. The repositories card while a test runs

`test()` in `dashboard/src/lib/components/GitRepositories.svelte` sets `results[slug]` to `null`
while the request runs. The `$effect` that drops a contradicted result line reads
`results[slug].cloned` without checking for `null`. That gives *TypeError: null is not an object*,
printed three times by a run of `tests/component/m-a16.result-line.test.ts`, although its four cases
pass. The repair is the check the entry names: `results[slug] && results[slug].cloned !== now.cloned`.

## 6. The cleaned Claude route in `.env.example`

Section 8, at `ENABLE_ANTHROPIC_CLAUDE_CODE`, says: *chat only — Claude tools are not available on
the cleaned route*. The privacy proxy 0.3.0 passes the client's own tools through over MCP. On
2026-10-29 OpenClaw's `write` ran that way. Only Claude Code's built-in tools are off. The sentence
becomes:

```
# messages are cleaned before they reach Claude. Claude can then use the tools
# of the app you work in, such as OpenClaw's, but not Claude Code's own.
```

## 7. Memory in the README

`README.md` asks for 16 GB of RAM on Linux and macOS. On macOS the containers run in Docker
Desktop's VM, which had 7.65 GiB on the machine the update test ran on. A tool request on the
Claude route got `privacy-proxy` OOM-killed there. With Docker Desktop's memory set to 16 GB it ran,
and the proxy held 2.8 GiB. The line gains:

```
  On macOS the containers run in Docker Desktop's virtual machine, so what counts is the
  memory Docker Desktop is given (Settings → Resources), not the Mac's own. With the
  privacy proxy on, a VM of 7.65 GiB ran out of memory in a measured run and one of
  16 GB did not; the proxy alone held 2.8 GiB. Apps switched off under
  *Which apps to run* need nothing.
```

## 8. OpenCode's warning for a refused key

`_discover_ids` in `config/opencode/entrypoint.sh` asks the privacy proxy for a provider's models.
On any 401 it prints *no key for that provider in .env section 5 — provider skipped*. On 2026-10-29
the key was set and OpenAI had refused it; a direct call with the same key answered 401 as well.

The proxy already tells the two apart, so the warning can read the answer rather than guess it.
Measured on the running proxy 0.3.0, which `liquidupstart/privacy-proxy:latest` derives from, and
read in its source, `privacy_proxy/api/routes/models.py`, which is the same at the tags 0.1.2, 0.2.0
and 0.3.0:

- **No key configured.** The proxy answers 401 itself, with
  `{"error":"provider_key_missing","provider":"anthropic"}` (measured for `anthropic` and `xai` on
  2026-11-03).
- **A key configured.** The proxy passes the provider's status and body through unchanged: its route
  returns the upstream response's bytes and status. That is read in the source, not measured through
  the proxy, which would need a refused key on an installation. With the made-up key
  `lu-sr-not-a-key` on 2026-11-03, OpenAI answered 401 with an `error` object whose `code` is
  `invalid_api_key`, and Anthropic answered 401 with
  `{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},…}`.

That missing-key answer is the only 401 the proxy gives of its own: across `privacy_proxy/api/` at
0.3.0 no other place answers 401. Any other 401 on this path is the provider's.

`curl` 8.14.1 in the OpenCode image writes its output file anew on every answer, an empty body
included (measured on 2026-11-03), so the body read is always that answer's. On a 401 the warning
recognises the answers that were measured, and nothing else:

- `.error` is the string `provider_key_missing`: the proxy holds no key;
- `.error.code` is `invalid_api_key`, as OpenAI answers, or `.error.type` is `authentication_error`,
  as Anthropic answers: the provider refused the key.

Any other body gets a line that names both, which is true either way: one that is not JSON, valid
JSON with more after it, which `jq` does not read whole, an empty one, and an `error` object of any
other shape. The proxy is pulled as `latest`, and a release that changed its answer, even only by
moving `provider_key_missing` into an object, would otherwise turn the common case, no Anthropic key
beside the Claude subscription, into a refusal that never happened.

The three lines describe what happened rather than tell the operator what to do, since running
without a provider's key is a choice the stack supports. Each keeps *provider skipped* and names
`.env` section 5, where the proxy's keys come from:

```
WARNING: <url> -> HTTP 401: the privacy proxy holds no key for that provider (.env section 5) — provider skipped.
WARNING: <url> -> HTTP 401: the provider refused the key the privacy proxy sent (.env section 5) — provider skipped.
WARNING: <url> -> HTTP 401: the privacy proxy holds no key for that provider, or the provider refused it (.env section 5) — provider skipped.
```

**The provider's message is neither printed nor kept.** OpenAI's names part of the key it refused:
for `lu-sr-not-a-key` it said `lu-sr-no***-key`, the first eight characters and the last four.
OpenCode's log is no place for that, nor is its `/tmp`, where agents with a shell work: a list's
file is removed whenever discovery gives up on it, after a 401 once it is read, and after ten tries
that never answered 200. The operator acts on which of the two it was, and the warning says that.

The specification as first signed off read every body other than `provider_key_missing` as a
refusal, told the operator to set or check the key, and kept the body. The second and third local
reviews of the implementation pointed out each of these, and this section was changed to answer
them.

Beyond that, nothing changes: a 200 is read as before, any other status is tried ten times, the
provider is left out either way, and the start carries on.

## 9. Requirements

| Id | Requirement |
|---|---|
| SR-FR1 | Under `only`, when the writer drops a primary model and no usable record is there, it records that model in `privacy-routing-primary.json` beside the `openclaw.json` it writes, whole or not at all. A usable record already there is kept |
| SR-FR2 | In any other mode, before a default model is pinned, the writer makes a usable record's model the primary model, and removes the record once `openclaw.json` is written. In any mode, a record that is not a JSON object with a non-empty string `dropped` restores nothing and is removed, or replaced by a drop under `only`. A record that cannot be written or removed is logged, and the start carries on. Each is announced in the start output |
| SR-FR3 | `catalogOf()` takes the models a manifest declares under `modelCatalog.providers`, and nothing else |
| SR-FR4 | `http://liquid.localhost` redirects to `https://liquid.localhost:` followed by `SYSTEM_HTTPS_PORT` |
| SR-FR5 | The repositories card raises no error while a repository test runs |
| SR-FR6 | `.env.example` §8 says that the cleaned route carries the app's own tools and not Claude Code's |
| SR-FR7 | `README.md`'s memory line says that on macOS Docker Desktop's memory setting is what counts |
| SR-FR8 | On a 401 from the privacy proxy's model list, OpenCode's warning says that the proxy holds no key when the body's `error` is `provider_key_missing`, that the provider refused the key when the body is a refusal in the shape OpenAI or Anthropic answer in (`error.code` `invalid_api_key`, `error.type` `authentication_error`), and that either is possible for any other body, one `jq` cannot read whole among them. It does not print the provider's message, and leaves no list's body in `/tmp` once discovery gives up on it |

## 10. Limits

- **UC5:** an installation that went through `only` before this change keeps its privacy model.
- **The model restored is not checked against what `opt-in` offers.** If the Claude subscription was
  switched off during the round trip, `anthropic/claude-opus-5` comes back without its route. That
  is the state the installation had before `only`, and `opt-in` does not check the primary model
  today either.
- **Section 4 keeps the redirect to the root.** Carrying the path over is a change of its own.
- **Picker and allowlist entries that `only` removed come back only as far as the writer writes
  them.** One added by hand, such as an allowlist entry for a single model, stays gone, and a
  restored primary that needed it is refused. `only` has removed such entries from the start; the
  restore makes it visible. Found by the local review of the implementation.
- **A temporary file left by a writer killed between writing the record and renaming it stays.**
  Nothing reads it, and the next drop writes over it.
- **Under `only`, the picker still lists `anthropic/*` and `claude-cli/*` with the Claude
  subscription on.** `openclaw.sh` builds `MODEL_WILDCARDS` from `ENABLE_ANTHROPIC_CLAUDE_CODE`
  before `only` takes the backend away, and the writer adds them back after removing them. Found by
  the local review of this specification, measured on the writer and not on a gateway. It is a
  `BACKLOG.md` entry of its own, outside this change.
- **Section 8 changes the 401 alone.** The proxy passes any status of the provider's through, and
  `_discover_ids` stops early only on 200 and 401. A 403 or a 429 is tried ten times, about 30
  seconds, and then reported as `unreachable`, which sends the operator to the network. Read from the
  code by the local review of section 8, not measured. It is a `BACKLOG.md` entry of its own.
- **The entrypoint knows the providers' refusal shapes.** Only the proxy knows whether a 401 is its
  own or passed through. A marker on the 401s it passes through, which is the proxy's own repository's
  to add, would make the two shapes unnecessary here. Raised by the local review.
- **A refusal in a shape not measured gets the line naming both.** OpenAI and Anthropic were asked
  with a made-up key only. A key they refuse for another reason, such as an OpenAI key restricted so
  that it may chat but not list models, may come back with another `code` or `type`; it is then
  reported as possibly missing, possibly refused, which is true. Raised by the local review, not
  measured.
- **A key xAI refuses answers 400, not 401** (measured on 2026-11-03). OpenCode does not ask the
  proxy for xAI's models, so this does not reach the warning.

## 11. Files

- `config/scripts/start/openclaw.sh`: sections 2 and 3
- `config/nginx/templates/nginx.conf`: section 4
- `dashboard/src/lib/components/GitRepositories.svelte`: section 5
- `.env.example`, `README.md`: sections 6 and 7
- `config/opencode/entrypoint.sh`: section 8
- `docs/SPECIFICATION.md` §7.5: the sentence *a 401 means no key for that provider* says that the
  warning tells a missing key from a refused one
- `tests/lib/opencodefixture.ts`, its three RO users and `docs/TEST-SPEC-opencode-routing-only.md`:
  RO's 401 answer is the proxy's measured missing-key body, and its constant is `KEY_MISSING`. It was
  `REFUSED`, holding `{"detail":"no ANTHROPIC_API_KEY"}`, which no release gives and which section 8
  would not read as a missing key, while the RO cases stand for one. No RO case reads more than the
  status. The stub `curl` empties its output file for an answer without a body, as curl does, and a
  run reports what it left in its `/tmp`. Found by the local reviews of section 8
- `tests/integration/m-ro.opencode-reads.test.ts`: SR-6's row in the image, on RO-5's containers
- `tests/lib/openclaw-writer.ts`: `startWriter()`, a start on a state directory kept across runs, for
  SR-1; `writeConfig()` is built on it
- `scripts/tests/privacy-routing.test.sh`: TC-824 removes the record before each run. The first draft
  of this specification said the file stayed unchanged, because the `opt-in` run restores the primary
  it expects anyway. The local review of the implementation pointed out that this was the problem:
  the check that `opt-in` leaves the primary alone then passed through the restore
- the tests and mutations in `docs/TEST-SPEC-small-repairs.md`
- `tests/contract/m-tr.case-ids.test.ts`, `docs/TEST-SPEC-case-id-traceability.md` and
  `docs/TEST-SPEC-suite-preconditions.md`: SP-2's record names SR-4's mounted card, whose voiced
  skip is filed under `SP-2` as the rule requires
- `BACKLOG.md`: the seven entries struck, as `DONE-ON-#N`. The entry on allowlist entries added by
  hand points to its limit as §10, where section 8 moved it. Two entries from the local reviews of
  section 8, outside it: a provider's 403 or 429 reported as unreachable, and discovery without a
  time limit per try
