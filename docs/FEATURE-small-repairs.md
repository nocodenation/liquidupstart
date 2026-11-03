# Feature: six small repairs from `BACKLOG.md`

Status: **signed off on 2026-11-03, and implemented on this branch.**
Branch: `fix/small-backlog-repairs`
Found: six `OPEN` entries of `BACKLOG.md`, each named under its section below. The operator approved
them as one package on 2026-10-31, to wait for #56, which has since merged. The test specification is
`docs/TEST-SPEC-small-repairs.md`.

## 1. Purpose

Each entry is a defect someone measured and a repair the entry already names. None of them needs a
decision about how the stack should behave. They go together because each is too small for a pull
request of its own.

| Section | `BACKLOG.md` entry | What changes |
|---|---|---|
| 2 | *Switching from `only` back to `opt-in` leaves OpenClaw on the privacy model* | The model `only` drops comes back |
| 3 | *OpenClaw offers `200k` and `1m` as models of `privacy-anthropic`* | The picker offers models only |
| 4 | *`http://liquid.localhost` redirects to port 8889, where nothing listens* | The redirect names `SYSTEM_HTTPS_PORT` |
| 5 | *The repositories card's result line throws when a repository is tested* | The null check |
| 6 | *`.env.example` says the cleaned Claude route has no tools* | The sentence says which tools |
| 7 | *The README gives the host's memory, but Docker Desktop's VM is what runs out* | The memory line names the VM |

**Not in this change: *OpenCode's warning for a refused key says that no key is set*.** It was part
of the package the operator approved. Its line, `config/opencode/entrypoint.sh:120`, sits in
`_discover_ids`, and #59 changes the two lines above it. A test of the warning would run the
entrypoint, and the fixture for that, `tests/lib/opencodefixture.ts`, exists only on #59. Built from
`main`, the repair would conflict with #59 and would need a second copy of that fixture. The operator
decided on 2026-11-03, when #59 was marked ready for review, that #59 stays as it is: once #59 has
merged and `main` is merged in here, the entry joins this change as a section of its own, specified
and tested like the others before any of it is built.

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

## 8. Requirements

| Id | Requirement |
|---|---|
| SR-FR1 | Under `only`, when the writer drops a primary model and no usable record is there, it records that model in `privacy-routing-primary.json` beside the `openclaw.json` it writes, whole or not at all. A usable record already there is kept |
| SR-FR2 | In any other mode, before a default model is pinned, the writer makes a usable record's model the primary model, and removes the record once `openclaw.json` is written. In any mode, a record that is not a JSON object with a non-empty string `dropped` restores nothing and is removed, or replaced by a drop under `only`. A record that cannot be written or removed is logged, and the start carries on. Each is announced in the start output |
| SR-FR3 | `catalogOf()` takes the models a manifest declares under `modelCatalog.providers`, and nothing else |
| SR-FR4 | `http://liquid.localhost` redirects to `https://liquid.localhost:` followed by `SYSTEM_HTTPS_PORT` |
| SR-FR5 | The repositories card raises no error while a repository test runs |
| SR-FR6 | `.env.example` §8 says that the cleaned route carries the app's own tools and not Claude Code's |
| SR-FR7 | `README.md`'s memory line says that on macOS Docker Desktop's memory setting is what counts |

## 9. Limits

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

## 10. Files

- `config/scripts/start/openclaw.sh`: sections 2 and 3
- `config/nginx/templates/nginx.conf`: section 4
- `dashboard/src/lib/components/GitRepositories.svelte`: section 5
- `.env.example`, `README.md`: sections 6 and 7
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
- `BACKLOG.md`: the six entries struck, as `DONE-ON-#N`
