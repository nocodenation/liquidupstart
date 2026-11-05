# Test specification: an image records its inputs, and a start says when they changed

Status: **specified on 2026-11-04, not implemented; revised the same day for the operator's answers
to the feature's §7 and for the independent review of `4468779`.** Written against the code of
`main` at `da9a85c`; every *What it found* row is empty until the case runs, and the blocks say what
the implementation records there. Feature: `docs/FEATURE-image-inputs.md` (IM-FR1 to IM-FR9,
IM-NFR1 to IM-NFR3). Issue: #34, on which the implementation is answered.

Files are named `tests/<level>/m-im.<subject>.test.ts`, and headers open `M-IM · <Level> · …` with
the block of `docs/TEST-SPEC-git-integration.md` §4.2. `./tests/run.sh im` runs them. The prefix
`IM` is new: no row of any `TEST-SPEC-*.md` and no test title on `main` at `da9a85c` carries it
(measured over both readers of `tests/contract/m-tr.case-ids.test.ts`, which found the prefixes
`A0`–`A17`, `A3b`–`A3e`, `B1`–`B7`, `CM`, `CS`, `CU`, `M`, `M1`, `MU`, `OC`, `RO`, `SP`, `SR`, `TC`
and `TR`). `TR-1` reads the rows here as it reads any document's, so nothing has to be registered
for the prefix; `TR-4` needs no `SPANS_FILES` entry, because every block below names every file
that carries its id in its *Implemented by* row, which is the computed route.

**One scenario per overview row.** A row is one thing that is asserted, labelled positive or
negative; a case with a table of values (IM-2's accepted forms, for instance) is one scenario over
that table, as CS-1's rows are. The first version of this document had rows holding two or three
scenarios and rows labelled *positive + negative*; the review of `4468779` named them, and they are
split below.

## 1. What is being tested, and at which level

| Component | Level | Rigour |
|---|---|---|
| The digest, `lu_image_inputs_digest`, and the reader of `COPY`/`ADD`, `lu_copy_sources` | unit | **Full branch coverage.** They decide whether an image is called stale, and a wrong answer either asks for a half-hour build without cause or passes a stale image in silence. Every accepted form and every refused form has a row |
| The source and the notice, `lu_image_source` and `lu_image_notice` | unit | Every branch: the three sources, the four lines, the silence, and the order of precedence |
| The seven build scripts, `build.sh --inputs` and `rebuild.sh` | contract, integration against a stub engine | Every script both ways: the label on its build line, and `--inputs` answering without docker; the environment reset; `openclaw.sh`'s new reader on the two values the old one could not take |
| `start.sh`'s pre-flight | integration, stub engine | Every outcome of IM-FR5, and the order against `down.sh` |
| A real image, through docker | integration | One throwaway image, labelled and judged, both ways; the tree-built builder image's label against the script's answer |
| `stackState()`, `imagesNote()` and the two `load`s | component, unit | Every list both ways, `needBuild` on both sides of the operator's line (missing asks, stale and unlabelled do not), the precedence of docker's answer over a script's failure, and the one shape that counts as neither |
| The run route's toolbox | integration, stub engine | Missing, stale, unlabelled, matching, and a script that cannot answer with and without an image |
| Documentation | contract where a sentence is a claim (A0-11), none otherwise | — |

Nothing here depends on a model. IM-M1 is a documented operator check of the end-to-end path.

## 2. Overview

| Case | Level | Sense | Scenario |
|---|---|---|---|
| **IM-1** | Unit | positive | the digest of the stated fixture is its stated literal, 64 lower-case hex characters |
| **IM-1** | Unit | **negative** | …and is not the per-directory walk's literal, so the whole-path order is the one in force |
| **IM-1** | Unit | positive | …and the same over a copy of the fixture at another path |
| **IM-1** | Unit | positive | …and unchanged after `.env` and a skill file, which no `COPY` names, are written |
| **IM-1** | Unit | positive | …and unchanged after a `touch` and a `chmod` of a source |
| **IM-1** | Unit | positive | …and unchanged when the directory's entries were created in another order |
| **IM-1** | Unit | **negative** | …and changed by one byte appended to `entrypoint.sh`, to its stated literal |
| **IM-1** | Unit | **negative** | …and changed by one line of the Dockerfile |
| **IM-1** | Unit | **negative** | …and changed by an argument added, to its stated literal |
| **IM-1** | Unit | **negative** | …and changed by that argument's value |
| **IM-1** | Unit | **negative** | …and changed by the order of two arguments |
| **IM-1** | Unit | **negative** | …and two files whose bytes concatenate to the same string give different digests |
| **IM-1** | Unit | **negative** | …and a renamed source changes it, since the path is hashed |
| **IM-1** | Unit | positive | …and a `--from=` source of a declared stage that does not exist in the context is passed over |
| **IM-1** | Unit | **negative** | …and a Dockerfile the reader refuses makes the digest exit 1 with its error and print nothing |
| **IM-2** | Unit | positive | the reader accepts each supported form and prints the sources in order, `./` removed |
| **IM-2** | Unit | positive | …and skips a `--from=` naming a stage the file declares |
| **IM-2** | Unit | positive | …and skips a heredoc body holding a `COPY` line |
| **IM-2** | Unit | **negative** | …and refuses each of the fourteen unsupported instruction forms, naming file, line and instruction |
| **IM-2** | Unit | **negative** | …and refuses a `--from=` naming an image the file declares no stage for |
| **IM-2** | Unit | **negative** | …and refuses any instruction carrying `--mount=` |
| **IM-2** | Unit | **negative** | …and refuses a heredoc no terminator closes |
| **IM-2** | Unit | **negative** | …and refuses a context holding a `.dockerignore`, before reading any instruction |
| **IM-2** | Contract | positive | …and over every tracked Dockerfile but the dashboard's, passed its own context, names exactly the stated sources |
| **IM-2** | Contract | **negative** | …and refuses `dashboard/Dockerfile`, for its `.dockerignore` first |
| **IM-2** | Contract | **negative** | …and `config/opencode/Dockerfile`, the un-templated leftover the implementation deletes, is not in the tree |
| **IM-3** | Contract | positive | each of the seven build scripts carries both labels on its `docker build` line |
| **IM-3** | Contract | **negative** | …and a script under `config/scripts/build/` without them is reported by name |
| **IM-3** | Integration | positive | each script with `--inputs` prints one 64-hex line, exits 0 and runs no docker |
| **IM-3** | Integration | positive | …and with `ENABLE_ANTHROPIC_CLAUDE_CODE=1` and with `PRIVACY_PROXY_DEV_SRC` set, where the scripts print progress, stdout is still exactly that one line |
| **IM-3** | Integration | positive | …and the progress lines are on stderr |
| **IM-3** | Integration | positive | …and the `--inputs` answer equals the `io.liquidupstart.inputs` value the same script passes to `docker build` |
| **IM-3** | Integration | **negative** | …and `ENABLE_ANTHROPIC_CLAUDE_CODE=1` changes `openclaw.sh`'s and `privacy-proxy.sh`'s answers |
| **IM-3** | Integration | positive | …and leaves the other five unchanged |
| **IM-3** | Integration | **negative** | …and `OPENCODE_SYSTEM_DEPENDENCIES` changes `opencode.sh`'s answer alone |
| **IM-3** | Integration | **negative** | …and `LIQUID_SYSTEM_DEPENDENCIES_MODE=override` changes `liquid.sh`'s alone |
| **IM-3** | Integration | **negative** | …and `POST_INSTALLATION_COMMANDS` changes the four templated scripts' and none of the other three |
| **IM-3** | Integration | **negative** | …and `privacy-proxy.sh --inputs` with `PRIVACY_PROXY_DEV_SRC` set runs no docker and answers differently |
| **IM-3** | Integration | positive | …and a build-affecting key exported by the caller and absent from `.env` changes no answer |
| **IM-3** | Integration | **negative** | …and a build whose digest cannot be computed exits 1 with `::aiw-error::` naming the template, before `docker image rm` |
| **IM-3** | Integration | positive | `build.sh --inputs` prints one digest per image that is on, in build order, and runs no docker |
| **IM-3** | Integration | **negative** | …and `rebuild.sh` with a refused Dockerfile exits 1 before `down.sh` |
| **IM-3** | Integration | positive | …and with a readable tree runs `down.sh` and then the build |
| **IM-3** | Integration | positive | `openclaw.sh --inputs` reads a value holding `$` as text and answers |
| **IM-3** | Integration | **negative** | …and a value holding `$(…)` is not run |
| **IM-3** | Integration | positive | …and is read, since it changes the answer |
| **IM-3** | Integration | positive | …and the Claude install line OC-15 reads out of the script is still there |
| **IM-4** | Unit | positive | the source is `.liquidupstart-version`'s first line with its whitespace removed |
| **IM-4** | Unit | positive | …and a first line holding inner blanks gives them removed, as `run.sh` does |
| **IM-4** | Unit | **negative** | …and a file holding only whitespace counts as absent and falls through to git |
| **IM-4** | Unit | positive | …and a clean repository gives `checkout-<sha>` |
| **IM-4** | Unit | **negative** | …and an uncommitted change adds `-dirty` |
| **IM-4** | Unit | **negative** | …and neither gives `unknown` |
| **IM-4** | Unit | positive | …and on this checkout it equals `run.sh --version`'s word |
| **IM-4** | Unit | positive | the notice prints nothing for equal digests |
| **IM-4** | Unit | positive | …and nothing for equal digests with no source label |
| **IM-4** | Unit | **negative** | …and the unlabelled line for an empty inputs label |
| **IM-4** | Unit | **negative** | …and the stale line naming the source |
| **IM-4** | Unit | **negative** | …and the stale line for an unrecorded source |
| **IM-4** | Unit | **negative** | …and the could-not-compute line when the expected value is not a digest |
| **IM-4** | Unit | **negative** | …and that line wins over an empty inputs label |
| **IM-5** | Integration | positive | `start.sh` with every image matching prints no `Note:` line about images and runs `down.sh` and `compose up` |
| **IM-5** | Integration | **negative** | …and with one image unlabelled, the rest matching, prints its line and still starts |
| **IM-5** | Integration | **negative** | …and with one image stale, the rest matching, prints its line naming the source and still starts |
| **IM-5** | Integration | **negative** | …and with one script's `--inputs` failing, the rest matching, prints the could-not-compute line and still starts |
| **IM-5** | Integration | **negative** | …and with an image missing, the rest matching, exits before `down.sh` with no `Note:` line, as CS-4 |
| **IM-5** | Integration | positive | …and does not ask about the images of a component that is off |
| **IM-5** | Integration | positive | …and prints the lines after the missing check and before `down.sh`, in `LU_IMAGES`' order |
| **IM-6** | Integration | positive | a throwaway image built through the library carries the label the library computes, and the notice is silent |
| **IM-6** | Integration | **negative** | …and after one byte of its source changes, the notice names it stale with its source |
| **IM-6** | Integration | positive | the tree-built builder image carries `io.liquidupstart.inputs` equal to `nar-builder.sh --inputs` |
| **IM-6** | Integration | positive | …and `builderContextDigest()` and the product digest read the same six files of `config/nar_builder` |
| **IM-7** | Component | positive | `stackState()` with every image matching answers `needBuild: false` and three empty lists |
| **IM-7** | Component | **negative** | …and names a missing image in `missing`, with `needBuild: true`, as today |
| **IM-7** | Component | **negative** | …and names a stale image in `stale`, with `needBuild: false`, so Start stays enabled |
| **IM-7** | Component | **negative** | …and names an unlabelled image in `unlabelled`, with `needBuild: false` |
| **IM-7** | Component | positive | …and does not ask about the images of a component that is off |
| **IM-7** | Component | positive | …and an image whose script fails is in no list and does not ask for a build |
| **IM-7** | Component | **negative** | …and an image that is missing while its script fails is in `missing`, with `needBuild: true` |
| **IM-7** | Component | positive | …and the launchpad's `load` and `/done`'s `load` each return the lines |
| **IM-7** | Unit | positive | `imagesNote()` is empty for three empty lists |
| **IM-7** | Unit | **negative** | …and gives the missing line then the stale line for one of each |
| **IM-7** | Unit | **negative** | …and the unlabelled line alone for an unlabelled image |
| **IM-8** | Integration | **negative** | the run route builds the toolbox through `toolbox.sh` when the image is missing |
| **IM-8** | Integration | **negative** | …and when its label differs |
| **IM-8** | Integration | **negative** | …and when its label is empty |
| **IM-8** | Integration | positive | …and runs the task without a build when the label matches |
| **IM-8** | Integration | positive | …and when `toolbox.sh --inputs` fails with the image there, says so and runs the task with it |
| **IM-8** | Integration | **negative** | …and when it fails with the image missing, neither builds nor runs the task |
| **IM-M1** | Manual | positive | the operator updates the checkout, starts, sees the lines, rebuilds, sees nothing |

## 3. Detail

### IM-1 — the digest

| | |
|---|---|
| **Premise** | The digest decides stale. Too wide and it says stale on every start (the whole-context digest would, since the start writes into OpenClaw's context); too narrow and a changed entrypoint passes. So every input the definition names has a row that changes it, and every thing it excludes has a row that does not. |
| **Component** | `lu_image_inputs_digest` in `config/scripts/build/lib/image-inputs.sh`, sourced in `bash -c`, as CS-1 sources `components.sh`. |
| **Steps** | Write the fixture below into a `mkdtemp` directory; call the function with its `Dockerfile`, the directory and no arguments; compare with the literal. Then each variation in a fresh copy, and compare with the base. |
| **Test data, both sides** | **The fixture `lu-im1`:** `Dockerfile` holding the four lines `FROM scratch AS build`, `COPY entrypoint.sh /usr/local/bin/entrypoint.sh`, `COPY --chown=1000:1000 ./tools /opt/tools`, `COPY --from=build /app/out /opt/out`; `entrypoint.sh` holding `#!/bin/sh` and `exit 0`; `tools/b.txt` holding `b`, `tools/a.txt` holding `a`, `tools/B.txt` holding `B`, `tools/sub/c.txt` holding `c`, **`tools/a/x` holding `x`** -- a directory `a` beside a file `a.txt`, so the order of the walk shows; and two files no `COPY` names, `.env` holding `OPENCLAW_PROBE=1` and `skills/probe/SKILL.md` holding `probe`. Every file ends in one newline. *(The first version's Dockerfile opened `FROM scratch`; the review of `4468779` made `--from=` require a declared stage, so the fixture declares `build` on its first line.)* **The literal:** `0d16b6625d213bf22848b6e1829a1866209964ebf18a3d5bfc38f9b3e8d7f700`, and with the one argument `ENABLE_ANTHROPIC_CLAUDE_CODE=0`, `bfe5449c50b7bdf7f42a765ba83f57cfbe3d21579fca86f9db08c5319ac0eb28`. Both were computed on 2026-11-04 by a reference implementation of IM-FR1 written in Python from the definition alone, in the scratchpad and not in the tree, so the shell function is held to an independent reading of the words and not to itself. The walk it took, whole paths sorted bytewise: `entrypoint.sh`, `tools/B.txt`, `tools/a.txt`, `tools/a/x`, `tools/b.txt`, `tools/sub/c.txt` -- `B` before `a`, and `a.txt` before `a/x` because `.` is 0x2E and `/` is 0x2F. **The order's negative:** a per-directory walk puts `tools/a/x` before `tools/a.txt` and gives `1609af64b8816308a231c113a4550b957ec2eceecf1167859a809274ba22524e`, which the function must not answer (the feature's §8.10). **Variations, and the side each is on.** Unchanged: the fixture copied to a second `mkdtemp` path; `.env` rewritten to `OPENCLAW_PROBE=2` and `skills/probe/SKILL.md` to `probe edited`; `touch` of `entrypoint.sh` and `chmod 755` of it (the fixture writes it `644`); `tools/` recreated with its five files written in the order `sub/c.txt`, `b.txt`, `a/x`, `B.txt`, `a.txt`. Changed: one `\n` appended to `entrypoint.sh`, expected `efda77841c232d86022e82e0ec6f3154fe153e45a6067617572af5c4fa27ccbc`; the Dockerfile's first line changed to `FROM scratch AS build # x`; the argument `ENABLE_ANTHROPIC_CLAUDE_CODE=0` added (the second literal); its value `1`; the two arguments `A=1 B=2` against `B=2 A=1`; `tools/a.txt` renamed `tools/d.txt`. **The boundary:** two contexts whose Dockerfile is `FROM scratch` and `COPY a b /x/`, one with `a` holding `xy` and `b` holding `z`, the other `a` holding `x` and `b` holding `yz`, no newlines: `ff3f99d93bae475316ea4f3919abd19a981dcc826333c28051eb778434087960` and `6ecbbce4e125e4997907ea16d2ae78b56aef65042b2f1a6901c3d909a647823d`, which differ, so the separators carry. **The `--from=` row:** the fixture as it is, where `/app/out` exists nowhere and `build` is declared, is the row: it is accepted. **The refused row:** the Dockerfile with `COPY . /x` appended: exit 1, stdout empty, stderr holding `Dockerfile:5: COPY . /x is not a form the image-inputs digest can read`. |
| **Expected** | As stated: the literal, and not the per-directory one; equality for the unchanged rows; inequality, and the stated literal where one is given, for the changed rows; the boundary pair unequal; the refused row's exit, stdout and stderr. Every digest matches `/^[0-9a-f]{64}$/`. |
| **Dependencies** | bash 3.2 and 5.x; `sha256sum` or `shasum`. No docker. |
| **Shown able to fail** | To register: the `file` section's path dropped reddens the renamed-source row; the arguments ignored reddens the three argument rows; the whole-path sort replaced by a per-directory walk reddens the literal row and the order's negative. **Not registered, with the reason:** the NUL after each content removed reddens the literal row only -- the boundary pair stays apart because the next `file` header follows the content, which the first version of this block claimed otherwise; and the sort removed altogether reddens the literal row on any filesystem but the creation-order row only where the filesystem lists in creation order, which is not every filesystem, so that row is a guard for the machines where it bites and not a registered control. The literal row is the one that catches a change to the byte layout, which is a deliberate change: it updates the literal and this block says so. |
| **What it found** | *Empty until the case runs. The implementation records the run's figures and the mutations' results here.* |
| **Implemented by** | `tests/unit/m-im.digest.test.ts`. |
| **Covers** | IM-FR1, IM-NFR2. |

### IM-2 — the reader of `COPY` and `ADD`

| | |
|---|---|
| **Premise** | The reader decides which bytes are inputs. A form it misreads is a silent gap: a `COPY` with a glob read literally would hash a file that does not exist, or nothing, and the digest would pass whatever the glob brought in; a `RUN --mount=type=bind` reads the context without a `COPY`; a `.dockerignore` makes docker copy less than the digest hashed. So every form it cannot determine is refused by name, and every form on this tree is accepted. |
| **Component** | `lu_copy_sources <dockerfile> <context>` in `config/scripts/build/lib/image-inputs.sh`, in `bash -c`; and the tree's Dockerfiles, read through it with their build contexts. |
| **Steps** | For each stated Dockerfile in a `mkdtemp` context holding the files it names, call the reader with the file and the context, and read stdout, stderr and the exit status. Then for every file `git ls-files` lists whose basename is `Dockerfile`, call it with the file and its context: the file's own directory, or its parent where that directory is named `templates`. |
| **Test data, both sides** | **Accepted, one Dockerfile per line, each with the files `a` and `b` and the directory `d/` holding `e` in the context, and the expected output after the arrow:** `COPY a /x` → `a`; `COPY ./a /x` → `a`; `copy a /x` → `a`; `COPY --chown=1000:1000 a /x` → `a`; `COPY --chmod=755 a /x` → `a`; `COPY --link a /x` → `a`; `ADD a /x` → `a`; `COPY a b /x/` → `a` then `b`; `COPY d /x` → `d`; `COPY a \` on one line and `/x` on the next → `a`; `FROM scratch` with no `COPY` → nothing, exit 0. **The stage skip:** `FROM scratch AS build` then `COPY --from=build /app /x` → nothing, with no `/app` anywhere. **The heredoc skip:** `RUN <<'SH'`, `COPY planted /x`, `SH` on three lines → nothing, and `planted` exists nowhere. **Refused, each the only instruction after `FROM scratch`, so each message says `:2:`, with the instruction quoted:** `COPY ["a","/x"]`; `COPY a* /x`; `COPY a? /x`; `COPY [ab] /x`; `ADD https://example.invalid/a /x`; `COPY <<EOF /x` followed by `EOF`; `COPY --parents a /x`; `COPY --exclude=b a /x`; `COPY . /x`; `COPY ./ /x`; `COPY ../a /x`; `COPY missing /x`; `COPY l /x` where `l` is a symlink to `a`; `COPY a`. Fourteen rows. `.invalid` is reserved by RFC 2606, so the URL row can resolve nowhere. **Refused, the forms the review of `4468779` added:** `COPY --from=ghcr.io/example/image:latest /a /x` with no `AS` anywhere → refused at `:2:`, since the name declares no stage; `RUN --mount=type=bind,source=a,target=/a cat /a` → refused at `:2:`; `RUN --mount=type=cache,target=/root/.cache true` → refused at `:2:`; `RUN <<'SH'` followed by `echo open` and no terminator → refused, the message naming line 2 and `<<'SH'`; a context holding `.dockerignore` with the one line `b` and the Dockerfile `COPY a /x` → refused with `Error: <context>/.dockerignore: a .dockerignore changes what docker copies, and the image-inputs digest cannot read it`, before any source is printed. **The tree, measured 2026-11-04 at `da9a85c`:** ten tracked files named `Dockerfile`, **nine once the implementation deletes `config/opencode/Dockerfile`** (feature decision 15), and the row is written for nine, each with its context. Accepted, with their sources: `config/bun_runner/Dockerfile` → `entrypoint.sh`; `config/hermes/templates/Dockerfile`, context `config/hermes` → `entrypoint.sh`; `config/liquid/templates/Dockerfile`, context `config/liquid` → `entrypoint.sh`, `narcheck.py`, `nar-watch.sh`; `config/nar_builder/Dockerfile` → `build.sh`, `BuildServer.java`, `lifecycle-pins.xml`, `seed.sh`, `entrypoint.sh`; `config/openclaw/templates/Dockerfile`, context `config/openclaw` → `openclaw-claude.sh`; `config/opencode/templates/Dockerfile`, context `config/opencode` → `entrypoint.sh`; `config/privacy-proxy/templates/Dockerfile`, context `config/privacy-proxy` → nothing, its one `COPY` being `--from=claude-cli`, a stage its line 3 declares, and its `RUN <<'SH'` heredoc holding a Python program that is not read and closing at `SH`; `config/toolbox/Dockerfile` → `toolbox-entry.sh`. Refused: `dashboard/Dockerfile`, context `dashboard`, for `dashboard/.dockerignore` -- the one context in the tree that holds one -- and the message names that path; its `COPY . .` at line 7 is the second reason, which the `.dockerignore` check reaches first; the one image decision 5 excludes. **Must not exist:** `config/opencode/Dockerfile` -- the reader would accept it (it did on 2026-11-04, with `entrypoint.sh`), which is why its absence is a row rather than a remark: a second Dockerfile in a build context is a second thing a reader can take for the inputs. The templates are read unrendered here, because the reader does not care about the tokens; `__SYSTEM_DEPENDENCIES__` sits on a `RUN` line. |
| **Expected** | As stated: stdout, exit 0 for the accepted rows; exit 1, empty stdout and `Error: Dockerfile:2: <instruction> is not a form the image-inputs digest can read` on stderr for the refused instruction rows, the `.dockerignore` line for that row; on the tree, exactly the nine files, exactly the sources listed, exactly one refusal naming `dashboard/.dockerignore`, and no file at `config/opencode/Dockerfile`. The tree row asserts the count of Dockerfiles found is at least nine, so an empty `git ls-files` cannot pass it. |
| **Dependencies** | bash, git. No docker. |
| **Shown able to fail** | To register: the stage check removed (any `--from=` skipped) reddens the external-image row; the glob check removed reddens the three glob rows; the heredoc skip removed reddens its accepted row with `planted` as a missing source; the terminator check removed reddens the unterminated row; the `--mount=` check removed reddens its two rows; the `.dockerignore` check removed reddens its row and makes `dashboard/Dockerfile` refused for `COPY . .` instead, which the tree row's message assertion catches; the context-root check removed reddens `COPY . /x`. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/unit/m-im.copy-reader.test.ts` (the forms), `tests/contract/m-im.tree-dockerfiles.test.ts` (the tree). |
| **Covers** | IM-FR1. |

### IM-3 — every build labels, answers `--inputs` without an engine, and reads `.env` alone

| | |
|---|---|
| **Premise** | The check is only as good as the label the build wrote and the answer the start computes, and both come from the build script. A script that forgot the label makes every start say *built before images recorded their inputs*; one whose `--inputs` path differs from its build path makes every start say *stale* against a fresh image; one that reads the caller's environment gives three answers on three machines; one whose stdout carries a progress line gives the start a digest that is no digest. So the two are compared through the same script, and the script is run where it will be run. |
| **Component** | The seven scripts under `config/scripts/build/`, the library, `scripts/linux/build.sh` and `scripts/linux/rebuild.sh` -- as text, and run in a copy of the tree with a stub `docker`. |
| **Steps** | Text: for each script, find its `docker build` line and the two `--label` arguments; read `build.sh` for the scripts it runs. Run: copy `config/` without `volumes/`, `scripts/linux/{build,rebuild,down}.sh`, and the library into a `mkdtemp` tree at their real paths; put a stub `docker` first on `PATH` that appends its argv to `docker.log`, exits 0, and prints nothing; `down.sh` is a stub appending `down` to `steps.log`; write `.env`; run each script with `--inputs`, then each script without it, and read stdout, stderr, `docker.log` and the exit status. |
| **Test data, both sides** | **The seven:** `opencode bun-runner nar-builder liquid openclaw privacy-proxy toolbox`. `build.sh` runs the first six (CS-3's order, `privacy-proxy` under its switch); `toolbox.sh` is the dashboard's and is in this set by name. **The build line:** matches `/^docker build .*--label "io\.liquidupstart\.inputs=\$\{DIGEST\}" --label "io\.liquidupstart\.source=\$\{SOURCE\}"/m` after joining continued lines. **The negative of the text row:** a script `probe.sh` written into the copy's `config/scripts/build/` with a `docker build` line and no label is reported by name; the real tree, `hermes.sh` and `lib/` left out, reports nothing. **`.env`:** `.env.example` with `SYSTEM_DEPENDENCIES="jq"`, `ENABLE_ANTHROPIC_CLAUDE_CODE=0`, `PRIVACY_PROXY_ENABLE=1`. **One stdout line, where the scripts print progress:** `openclaw.sh --inputs` with `ENABLE_ANTHROPIC_CLAUDE_CODE=1` (its `:54` line), `privacy-proxy.sh --inputs` with `ENABLE_ANTHROPIC_CLAUDE_CODE=1` (its `:29`) and with `PRIVACY_PROXY_DEV_SRC=<mkdtemp dir holding a one-line Dockerfile FROM scratch>` (its `:48`): stdout is one line matching `/^[0-9a-f]{64}$/` and nothing else, and stderr holds the progress line, `ENABLE_ANTHROPIC_CLAUDE_CODE=1: installing Claude Code CLI into the image.` for the first two. **Variations, each against that base:** `ENABLE_ANTHROPIC_CLAUDE_CODE=1` -- changes `openclaw.sh` (its `sed` writes two `RUN` lines) and `privacy-proxy.sh` (its argument) and none of the other five; `OPENCODE_SYSTEM_DEPENDENCIES="ripgrep"` -- changes `opencode.sh` only; `LIQUID_SYSTEM_DEPENDENCIES_MODE="override"` with `LIQUID_SYSTEM_DEPENDENCIES=""` -- changes `liquid.sh` only, since the generic `jq` then goes; `POST_INSTALLATION_COMMANDS="echo im3"` -- changes the four templated scripts and none of `bun-runner`, `nar-builder`, `toolbox`; `PRIVACY_PROXY_DEV_SRC=<the directory above>` -- changes `privacy-proxy.sh` and runs no docker (the dev base is built only on a build). **The environment reset (decision 16):** the base `.env`, and the caller's environment exporting `OPENCODE_SYSTEM_DEPENDENCIES=ripgrep`, `PRIVACY_PROXY_SYSTEM_DEPENDENCIES=ffmpeg` and `ENABLE_ANTHROPIC_CLAUDE_CODE=1`: every script's answer equals the base's. Its counterpart is the variation rows, where the same keys in `.env` do change the answers. `PRIVACY_PROXY_SYSTEM_DEPENDENCIES` is chosen because it is in no `.env.example` and `resolve_image_settings PRIVACY_PROXY` reads it, so only the environment could have supplied it. **The equality row:** for each script, the `--inputs` answer, and then the value after `--label io.liquidupstart.inputs=` in the `build` line of `docker.log` from a run without `--inputs`; the stub makes `image rm` and `build` succeed without an engine. **The refused row:** `config/openclaw/templates/Dockerfile` in the copy with `COPY . /planted` appended: `openclaw.sh` exits 1, `docker.log` holds no `image rm` and no `build`, stdout is empty, stderr holds `COPY . /planted is not a form the image-inputs digest can read` and the line `::aiw-error::The inputs of liquidupstart/openclaw:latest could not be computed: ` which goes on to hold `The Dockerfile was rendered from config/openclaw/templates/Dockerfile.` -- the template's path and not the rendered temporary file's, and no line number of the template is claimed, because the rendered file's numbering is shifted by the `RUN` lines `render_dockerfile` inserts. **`build.sh --inputs`:** with the base `.env`, stdout is six lines matching `/^[0-9a-f]{64}$/` in the order `opencode bun-runner nar-builder liquid openclaw privacy-proxy`, each equal to that script's own `--inputs` answer, rc 0, `docker.log` empty; with the refused template, rc 1 and the `::aiw-error::` line on stderr. **`rebuild.sh`:** with the refused template, rc 1, `steps.log` holds no `down`, stderr holds the `::aiw-error::` line and `Nothing has been stopped; the stack is as it was.`; with the base tree, `steps.log` holds `down` and `docker.log` holds six `build` lines after it. **`openclaw.sh`'s reader (IM-FR9), the two values `source` could not take:** `OPENCLAW_SYSTEM_DEPENDENCIES="ab$cd"` -- `openclaw.sh --inputs` exits 0 with one 64-hex line, where `source` under `set -u` aborts with *cd: unbound variable* (measured by the review of `4468779`, and the row is red on the tree before the change); `OPENCLAW_POST_INSTALLATION_COMMANDS="$(touch im3-executed)"` -- after `--inputs`, no file `im3-executed` exists in the copy's root or in `config/openclaw`, and the answer differs from the base's, so the value was read as text and not run; and the counterpart that the reader still reads what a build needs: `OPENCLAW_POST_INSTALLATION_COMMANDS="echo im3-plain"` changes the answer. **The install line:** `config/scripts/build/openclaw.sh` still matches the pattern `tests/component/m-oc.allow-scripts.test.ts:77-79` reads it with, so OC-15's datum survives the change of reader. |
| **Expected** | Text: all seven match; `probe.sh` is reported and nothing else is. Run: for each script, `--inputs` prints one line matching `/^[0-9a-f]{64}$/`, exits 0, and `docker.log` holds nothing; the one-line rows hold with their progress line on stderr; the equality row holds for all seven; each variation changes exactly the scripts named and leaves the others' answers equal to the base; the reset row's answers equal the base's; the refused row, `build.sh --inputs`, `rebuild.sh` and the reader rows as stated. |
| **Dependencies** | bash, git for the source label (the copy is not a repository, so the source is `unknown`, which is fine here). No docker engine. The run rows take a few seconds: each script renders and hashes, 54 ms measured for one. |
| **Shown able to fail** | To register: `--label "io.liquidupstart.inputs=…"` removed from `opencode.sh` reddens the text row; the `--inputs` exit moved after `docker image rm` in `bun-runner.sh` reddens its no-docker row; `openclaw.sh` computing the digest before its `sed` reddens the `ENABLE_ANTHROPIC_CLAUDE_CODE=1` row for it; `privacy-proxy.sh` leaving `ENABLE_ANTHROPIC_CLAUDE_CODE` out of its arguments reddens that row for it; `lu_build_env_reset`'s call removed from `privacy-proxy.sh` reddens the reset row -- `privacy-proxy.sh` and not `opencode.sh`, because `.env.example` sets `OPENCODE_SYSTEM_DEPENDENCIES=""` and `load_env_file` exports that over the caller's value, so the mutation in `opencode.sh` would change nothing, while `PRIVACY_PROXY_SYSTEM_DEPENDENCIES` is in no `.env.example` and only the reset stands between the environment and the render (the re-review of `b079c05`); `openclaw.sh`'s `:54` echo left on stdout under `--inputs` reddens its one-line row; `rebuild.sh`'s pre-check removed reddens its refused row; `openclaw.sh` back to `source` reddens the `ab$cd` row. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/contract/m-im.build-labels.test.ts` (text), `tests/integration/m-im.build-inputs.test.ts` (run). |
| **Covers** | IM-FR3, IM-FR4, IM-FR9, IM-NFR2. |

### IM-4 — the source, and the notice

| | |
|---|---|
| **Premise** | The source is what the notice names; a wrong one sends the operator to the wrong checkout, and one that differs from `run.sh --version` by a blank is two answers to one question. The notice is the one line the operator reads, four of its five shapes are refusals of a kind, and they are ordered, so each has a row, the silence has two, and the order has one. |
| **Component** | `lu_image_source` and `lu_image_notice` in `config/scripts/build/lib/image-inputs.sh`, in `bash -c`; `run.sh --version` for the agreement row. |
| **Steps** | Source: `mkdtemp` directories -- ones holding `.liquidupstart-version` with each stated content; one made by `git init` with one commit, then with an uncommitted file, then with the whitespace-only version file; one with neither -- and the repository root. Notice: the function on stated values. |
| **Test data, both sides** | **Source.** `.liquidupstart-version` holding ` v0.9.0 ` and a second line `ignored`: expected `v0.9.0`, so the first-line rule shows. Holding `v0.9 .0` on its first line: expected `v0.9.0`, because `run.sh:19` removes every whitespace character (`tr -d '[:space:]'`) and not only the ends -- the row that holds the library to `run.sh` rather than to a trim. The git directory: expected `checkout-` followed by `git rev-parse --short HEAD`'s answer, whatever its length; after `touch dirty.txt`, the same with `-dirty`; and with a version file holding `  \n` written into it, `checkout-<sha>` again, since what remains after the removal is empty and the file counts as absent. The empty directory: `unknown`. The repository root: the function's answer equals the word after `liquidupstart ` on the first line of `./run.sh --version`, which runs no docker (`run.sh:93`). **Notice**, with `E` = sixty-four `a`, `F` = sixty-four `b`, and the image `liquidupstart/opencode:latest`: (`E`, `E`, `checkout-5bc0468`) → nothing; (`E`, `E`, empty) → nothing, since equal digests are equal whatever the source says; (`E`, empty, empty) → `Note: liquidupstart/opencode:latest was built before images recorded their inputs; rebuild to make this checkable: ./scripts/linux/build.sh`; (`E`, `F`, `checkout-5bc0468-dirty`) → `Note: liquidupstart/opencode:latest was built from checkout-5bc0468-dirty and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`; (`E`, `F`, empty) → the same with `an unrecorded source`; (`Error: Dockerfile:5: COPY . /x is not a form the image-inputs digest can read`, `E`, `checkout-5bc0468`) → `Note: the inputs of liquidupstart/opencode:latest could not be computed (Error: Dockerfile:5: COPY . /x is not a form the image-inputs digest can read), so it is not checked.`; and the precedence, (that `Error:` line, empty, empty) → the same could-not-compute line and not the unlabelled one. Each exits 0. |
| **Expected** | As stated, compared whole, line for line. |
| **Dependencies** | bash, git. No docker. |
| **Shown able to fail** | To register: the `-dirty` suffix dropped reddens the dirty row; `tr -d` replaced by a trim reddens the inner-blank row; the comparison inverted in the notice reddens the silence row and the stale row at once; the unlabelled branch merged into the stale one reddens the unlabelled row; the digest-shape check removed reddens the could-not-compute rows, which then read as stale. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/unit/m-im.source-and-notice.test.ts`. |
| **Covers** | IM-FR2, IM-FR5. |

### IM-5 — the start notices, and does not refuse

| | |
|---|---|
| **Premise** | #34's two acceptance items are here: a stale image is named with the rebuild command, and a current one is passed over in silence. And the notice is a notice: `start.sh` goes on to `down.sh` and `compose up` whatever it printed, which is what distinguishes it from CS-4's refusal one loop earlier. |
| **Component** | `scripts/linux/start.sh` in the start fixture of CS-5, `tests/lib/startfixture.ts`, extended: `StartOptions.labels?: Record<string, { inputs: string; source: string }>` makes the stub `docker` answer `image inspect -f <format> <image>` by printing the named label's value for that image, empty when the image is not in the map, and exit 1 for an image in `missing`; stub build scripts under `config/scripts/build/<name>.sh` for the seven names, each printing `${IM5_EXPECTED:-aaaa…a}` -- sixty-four `a` when the variable is unset -- on `--inputs` and exiting 0, unless the name is in `StartOptions.inputsFail`, when it prints `Error: im5: cannot read` to stderr and exits 1. The default digest is there for every other case that runs the fixture (CS-4, CS-5, A8-21's and TC-822's kin): with it, those cases run the start against the state every installation is in after the upgrade -- scripts that answer, images that carry no label -- and print the unlabelled lines; without it, an empty expected value would take IM-FR5's first branch and every such row would print *could not be computed ()*, which is a defect of the fixture and not a state of any installation (the re-review of `b079c05`); and `stepStub` prints its basename to stdout as well as appending it to `steps.log`, so stdout carries the order of the notice lines against `down`. The library is copied real, beside `components.sh`. |
| **Steps** | Run `start.sh` once per row and read stdout, `steps.log` and `docker.log`. |
| **Test data, both sides** | `.env.example` with `SYSTEM_SIGNIN_WAIT_SECONDS=0` and `PRIVACY_PROXY_ENABLE=1`, so `LU_IMAGES` is `opencode bun-runner nar-builder liquid openclaw privacy-proxy`. `IM5_EXPECTED` = sixty-four `a`; a stale label = sixty-four `b`; sources `checkout-5bc0468`. **In every row, every image not named is labelled `a…` with that source, so the row's one difference is the only thing that can print.** Rows: (matching) every image labelled `a…`; (unlabelled) `opencode` with an empty inputs label; (stale) `liquid` labelled `b…`; (failing) `inputsFail: ['openclaw']`; (missing) `missing: ['liquidupstart/nar-builder:latest']`; (off) `ENABLE_LIQUID=0` with `liquid` and `nar-builder` labelled `b…`; (order) `opencode` and `privacy-proxy` both labelled `b…`. |
| **Expected** | (matching) no line of stdout starts with `Note: liquidupstart/` or `Note: the inputs of`; `steps.log` holds `down`; `docker.log` holds `compose up -d`. (unlabelled) stdout holds IM-4's unlabelled line for `liquidupstart/opencode:latest`, and `down` and `compose up -d` follow. (stale) IM-4's stale line for `liquidupstart/liquid:latest` naming `checkout-5bc0468`; `down` and `compose up -d` follow. (failing) `Note: the inputs of liquidupstart/openclaw:latest could not be computed (Error: im5: cannot read), so it is not checked.`; `down` and `compose up -d` follow. (missing) rc 1, no `down`, no `compose up`, stderr naming `liquidupstart/nar-builder:latest` as CS-4 says, and no `Note:` line at all. (off) no `Note:` line. (order) on stdout, the `opencode` line, then the `privacy-proxy` line, then `down`. |
| **Dependencies** | bash. No docker engine. |
| **Shown able to fail** | To register: the notice loop moved after `down.sh` reddens the order row; the loop's `continue` on a failing script replaced by `exit 1` reddens the failing row (the start then refuses); the loop given `exit 1` on a stale image reddens the stale and unlabelled rows, which is the refusal decision 3 rules out. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.start-notice.test.ts`. |
| **Covers** | IM-FR5, IM-NFR3. |

### IM-6 — a real image, labelled and judged

| | |
|---|---|
| **Premise** | Everything above holds the pieces against stated values. This holds the label against docker: that `docker build --label` writes what the function computed, that `index .Config.Labels` reads it back unchanged, and that the tree-built builder image -- the one every M-B case runs against -- carries the product's label, so the harness and the product agree about what `config/nar_builder` is. |
| **Component** | `docker build`, `lu_image_inputs_digest`, `lu_image_found_inputs`, `lu_image_notice`; `builderImage()`, `builderLabels()`, `productInputsLabels()` and `builderContextDigest()` in `tests/lib/builderimage.ts`. |
| **Steps** | (1) In a `mkdtemp` context write `Dockerfile` and `probe.txt`; compute the digest; build with the two product labels, passed explicitly beside `builderLabels()`' three; read the label back; call the notice. (2) Change `probe.txt`; compute again; call the notice with the image's labels. (3) Read `io.liquidupstart.inputs` off `builderImage()`; run `config/scripts/build/nar-builder.sh --inputs` on the repository. (4) List the files `builderContextDigest()` walks and the files `lu_copy_sources config/nar_builder/Dockerfile config/nar_builder` names plus `Dockerfile`. |
| **Test data, both sides** | (1) `Dockerfile`: `FROM <builderImage()'s tag>` and `COPY probe.txt /probe.txt` -- the base is the image the harness has just built or found, so no registry is needed and `SP-3` does not apply; `probe.txt` holding `probe` and a newline; the source label `im6`; the tag `liquidupstart/nar-builder:im6-<BUILDER_RUN_ID>` under `TAG_PREFIX`, with `builderLabels()` so an abandoned one is swept by `sweepAbandonedBuilderObjects` after two hours, and `afterAll` removes it by tag. The product labels are passed by the case, not by `builderLabels()`, which stays at three (IM-FR7, `B6-41`). (2) `probe.txt` holding `probe2` and a newline. (3) The repository as it stands; both answers are the same 64-hex string when `builderImage()` passes what IM-FR7 says. (4) **Must be equal:** `Dockerfile build.sh BuildServer.java lifecycle-pins.xml seed.sh entrypoint.sh` -- the six tracked files, measured 2026-11-04. A seventh file in the context would make the tag's set larger than the label's, which this row names. |
| **Expected** | (1) the label equals the computed digest; the notice prints nothing. (2) the new digest differs; the notice prints `Note: liquidupstart/nar-builder:im6-… was built from im6 and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`. (3) equal. (4) the two sets equal. |
| **Dependencies** | docker; the builder image, built by `builderImage()` -- 0.7 s warm, minutes cold, and the cold build reaches the network, as every M-B file accepts. A bare `docker build` and no `docker compose`, so `run.sh` classes the file as default tier. |
| **Shown able to fail** | To register: `builderImage()` without the two product labels reddens (3); `lu_image_found_inputs` reading `io.liquidupstart.source` instead of `inputs` reddens (1). (2) is (1)'s negative. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.real-image.test.ts`. |
| **Covers** | IM-FR2, IM-FR7, IM-NFR2. |

### IM-7 — the dashboard asks for a build for a missing image, and names a stale or unlabelled one

| | |
|---|---|
| **Premise** | `needBuild` is what disables Start until a build, and the operator decided on 2026-11-04 that only a missing image does that (feature decision 4, as changed): every existing installation is unlabelled after the upgrade, and a `needBuild` that read stale would have blocked Start everywhere for a half-hour rebuild. So the rows hold both halves: a missing image still asks for a build, and a stale or unlabelled one is named in its list with `needBuild: false`. A wrong `true` is the half-hour; a wrong empty list runs the stale image the whole feature exists against without a word. The order is IM-FR5's, the same as the CLI notice's and the run route's: docker's answer first -- a script that cannot answer must not hide a missing image, and the dashboard container is where that happens (`PRIVACY_PROXY_DEV_SRC` outside the project is not mounted there) -- then the script's, then the label, then the comparison. Each list has a row that fills it and the silence has one; and the one shape that fills no list, a script that cannot answer, has a row with the label left empty, so the row also shows that the script is judged before the label -- which is what keeps every existing `stackState()` case green in a fixture project that has no build scripts and a stub docker that prints an empty label. |
| **Component** | `stackState()` in `dashboard/src/lib/server/project.ts`, `imagesNote()` in `dashboard/src/lib/image-inputs.ts`, and the `load` functions of `dashboard/src/routes/+page.server.ts` and `dashboard/src/routes/done/+page.server.ts`. A stub `docker` first on `PATH`, as CS-12's, that answers `image inspect -f <format> <image>` from a table file `labels.tsv` of `image<TAB>inputs<TAB>source`, exit 1 for an image not in it, and logs its argv; and stub build scripts written into the fixture project's `config/scripts/build/<name>.sh`, each printing `${IM7_EXPECTED}` on `--inputs`, except where the row says it fails. |
| **Steps** | Write `labels.tsv` and the stubs per row, call `stackState()` with the row's `.env`, and read its answer and `docker.log`. Call the two `load`s through `tests/lib/dashboardfixture.ts` with the stale row's table. Then call `imagesNote()` on stated lists. |
| **Test data, both sides** | `.env` from `envFrom()` with every switch on and `PRIVACY_PROXY_ENABLE=0`, so the images are `liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`. `IM7_EXPECTED` = sixty-four `a`; stale = sixty-four `b`. In every row, every image not named is in the table with `a…`. Rows: (matching) all five with `a…`; (missing) `liquidupstart/liquid:latest` absent from the table; (stale) `liquidupstart/opencode:latest` with `b…`; (unlabelled) `liquidupstart/nar-builder:latest` with an empty inputs column; (off) `ENABLE_LIQUID=0`, `liquid` and `nar-builder` with `b…`; (failing) `openclaw.sh` exiting 1 with `Error: im7: cannot read` on stderr **and `liquidupstart/openclaw:latest` in the table with an empty inputs column**, so that a reading of the label before the script would put it in `unlabelled`; (missing and failing) `liquidupstart/liquid:latest` absent from the table **and** `liquid.sh` exiting 1 with that line -- the dashboard-container case of decision 13. (loads) the stale row's table: the launchpad's `load` and `/done`'s `load`. **`imagesNote()`:** `{missing: [], stale: [], unlabelled: []}` → `[]`; `{missing: ['liquidupstart/liquid:latest'], stale: ['liquidupstart/opencode:latest'], unlabelled: []}` → `['These images are not built yet: liquidupstart/liquid:latest. Run Build once before starting.', 'These images were built from other inputs than this checkout and its .env: liquidupstart/opencode:latest. They run as they are; Rebuild brings them up to date.']`; `{missing: [], stale: [], unlabelled: ['liquidupstart/nar-builder:latest']}` → `['These images were built before images recorded their inputs: liquidupstart/nar-builder:latest. They run as they are; Rebuild makes them checkable.']`. |
| **Expected** | (matching) `needBuild: false`, three empty lists. (missing) `needBuild: true`, `missing: ['liquidupstart/liquid:latest']`, the others empty. (stale) **`needBuild: false`**, `stale: ['liquidupstart/opencode:latest']`, the others empty. (unlabelled) **`needBuild: false`**, `unlabelled: ['liquidupstart/nar-builder:latest']`, the others empty. (off) `needBuild: false`, three empty lists, and `docker.log` names neither `liquid` nor `nar-builder`. (failing) `needBuild: false`, three empty lists, and the server's stderr holds one line naming `liquidupstart/openclaw:latest` and `Error: im7: cannot read`. (missing and failing) `needBuild: true`, `missing: ['liquidupstart/liquid:latest']`, the others empty. (loads) each returns `imagesNote` equal to `imagesNote()` of the stale row's lists, one element. `imagesNote()` as stated, compared whole as arrays. |
| **Dependencies** | bun; the component tier for `stackState()` and the loads, importing `tests/lib/dashboardfixture.ts` before `project.ts` as CS-12 does. No docker engine. No DOM: the pages render the array, and the array is what is held. |
| **Shown able to fail** | To register: `stale` added to `needBuild`'s disjunction -- the first version of this specification -- reddens the stale row, which is the row the operator's change exists for; the comparison with the script's answer removed (`stale` always empty) reddens the stale row's list; `unlabelled` merged into `stale` reddens the unlabelled row's list; a failing script counted as stale reddens the failing row and would, on the tree, redden every CS-12 row too; the label read before the script's failure (`unlabelled` for an empty label whatever the script said) reddens the failing row; the script's failure read before docker's exit reddens the missing-and-failing row. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/component/m-im.stack-state.test.ts` (`stackState()` and the loads), `tests/unit/m-im.images-note.test.ts` (`imagesNote()`). |
| **Covers** | IM-FR6. |

### IM-8 — the toolbox follows its own Dockerfile

| | |
|---|---|
| **Premise** | The toolbox is built once and then only replaced when something removes it (`BACKLOG.md`, *The toolbox image does not follow its own Dockerfile*). The route that builds it when missing is where a stale or unlabelled one is rebuilt, through the script that labels it, and the image that works is not removed before the build that may fail. |
| **Component** | `POST /run` in `dashboard/src/routes/run/+server.ts`, imported in-process with a stub `docker` first on `PATH` that answers `image inspect -f <format> liquidupstart/toolbox:latest` from a table as IM-7's, logs every argv, and exits 0 for `run` and `build`; and `config/scripts/build/toolbox.sh` in the fixture project, real or, for the failing rows, a stub exiting 1 with `Error: im8: cannot read` on `--inputs`. |
| **Steps** | For each row, set the table and the script, post `task=down` (the cheapest task), read the streamed text and `docker.log`. |
| **Test data, both sides** | The expected digest is the real `toolbox.sh --inputs`'s answer over the fixture project's `config/toolbox`, copied from the tree, read by the case first. Rows: (missing) the image absent from the table; (stale) present with sixty-four `b`; (unlabelled) present with an empty inputs column; (matching) present with the expected digest; (failing, present) the stub script and the image present **with an empty inputs column**, so the row shows the script judged before the label, as IM-FR5's order says; (failing, missing) the stub script and the image absent. |
| **Expected** | (missing), (stale), (unlabelled): the stream holds `Helper toolbox image is missing or was built from other inputs - building it...`, and `docker.log` holds a `build` line with `-t liquidupstart/toolbox:latest` and `--label io.liquidupstart.inputs=<expected>` before the `run … liquidupstart/toolbox:latest` line, and **no `image rm`** line. (matching): no `build` line, and the `run` line. (failing, present): the stream holds `Helper toolbox image could not be checked: Error: im8: cannot read. Running the task with the image that is there.`, no `build` line, and the `run` line. (failing, missing): the stream holds `Error: im8: cannot read` and `[toolbox build not attempted: its inputs could not be computed]`, and `docker.log` holds neither `build` nor `run`. |
| **Dependencies** | bun, bash in the test host for `toolbox.sh`. No docker engine. The route is already driven in-process by no case; `tests/integration/m-a8.toolbox-start-path.test.ts` drives the real image instead and changes with this (§4). |
| **Shown able to fail** | To register: the route comparing nothing and building only when `inspect` fails reddens the stale and unlabelled rows; the route passing its old argv instead of the script reddens the label assertion of the three build rows; `toolbox.sh` given `bun-runner.sh`'s `docker image rm` line reddens the `image rm` assertion; the route building on a failed `--inputs` reddens the failing-missing row. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.toolbox-route.test.ts`. |
| **Covers** | IM-FR6. |

### IM-M1 — the operator's path (manual)

| | |
|---|---|
| **Premise** | No automated case runs a real build of a product image and a real start against it end to end; the pieces are held separately. This is the walk through UC1 and UC5. |
| **Steps** | (1) On a checkout with the stack built from it and the feature in, `./scripts/linux/start.sh`: no `Note: liquidupstart/` line. (2) Append one comment line to `config/opencode/entrypoint.sh`, start again: one line, naming `liquidupstart/opencode:latest`, `checkout-<sha>-dirty` and `./scripts/linux/build.sh`, and the stack starts. (3) Open the dashboard: the running card carries the line *These images were built from other inputs than this checkout and its .env: liquidupstart/opencode:latest. They run as they are; Rebuild brings them up to date.* above its buttons; after `./scripts/linux/down.sh` the not-running card carries the same line, Start is enabled, and pressing it starts the stack with the line of (2) in its log. (4) `./scripts/linux/build.sh`, then start: no line; the dashboard's cards as before the change. The line of (2) names `checkout-<sha>-dirty`, since the edit is uncommitted (feature decision 14). (5) On a macOS host, the same (1), and `config/scripts/build/opencode.sh --inputs` on the host against the same answer from `docker run --rm -v <checkout>:<checkout> liquidupstart/toolbox:latest bash -c 'cd <checkout> && config/scripts/build/opencode.sh --inputs'` -- the cross-platform agreement §3 of the feature could not measure. |
| **Expected** | As stated at each step. (5) equal. |
| **What it found** | *Recorded by the operator, with the date, bash and sed versions of the host.* |
| **Covers** | IM-FR5, IM-FR6, IM-NFR2, IM-NFR3. |

## 4. Existing cases that change

| Case | File | Change |
|---|---|---|
| CS-4, CS-5 | `tests/lib/startfixture.ts`, `tests/integration/m-cs.start-switches.test.ts` | The fixture's stub `docker` answers `image inspect -f` with a label (IM-5), empty by default, and its stub build scripts answer a default digest of sixty-four `a` when `IM5_EXPECTED` is unset, so every CS-4 and CS-5 row runs with scripts that answer and images that carry no label -- the state of every installation after the upgrade -- and the start prints the unlabelled lines of IM-FR5 (the reason for the default is in IM-5's *Component* row); `stepStub` prints its basename to stdout for IM-5's order row; the fixture copies the real library and gains the stub build scripts. The cases assert on `steps.log` and the docker log and are unchanged; CS-5's stdout assertions are on lines that contain `Liquid`, `OpenClaw` or `OpenCode`, and the unlabelled lines contain `liquidupstart/liquid:latest` and `liquidupstart/openclaw:latest`, so CS-5's *no line contains `Liquid`* and *none `OpenClaw`* rows are read case-sensitively, as written, and the lower-case image names do not match them |
| CS-12 | `tests/component/m-cs.stack-state.test.ts` | `stackState()` returns `images` beside `needBuild`; the rows assert `needBuild` and the `image inspect` argv as before. The fixture project has no `config/scripts/build`, so every script fails, and the script is judged before the label (IM-FR5's order, applied by IM-FR6), so each image is in no list although the stub docker prints an empty label with exit 0; `needBuild: false` stays where the rows expect it. The argv assertion changes shape: one `image inspect -f … <image>` per image instead of one call naming all five, so the row reads the set of images named across the calls |
| CS-23 | `tests/integration/m-cs.image-lists.test.ts` | No change. The image-to-script rule of decision 11 is by name, so it adds no fourth list for it to compare; IM-3's set row holds the scripts to the labels |
| A8-19 | `tests/integration/m-a8.toolbox-start-path.test.ts` | It builds `liquidupstart/toolbox:latest` by hand when missing, which would leave an unlabelled image the dashboard then rebuilds. It runs `bash config/scripts/build/toolbox.sh` instead, when the image is missing **or** its `io.liquidupstart.inputs` label differs from `toolbox.sh --inputs`, so the image it drives is the one the dashboard would run |
| A8-27, B5-3 | `tests/unit/m-a8.built-images.test.ts`, `tests/unit/m-b5.fresh-install.test.ts` | No change. `update.sh`'s `BUILT_IMAGES` is as it was |
| A0-11 | `tests/contract/m-a0.readme-promises.test.ts` | Asserts the README sentence of IM-FR8: that a start names an image whose inputs changed and starts anyway |
| B1-9, B7-5 | `tests/integration/m-b1.dependency-cache.test.ts`, `tests/integration/m-b7.unseeded-dependency.test.ts` | No change. Their `SEEDED_IMAGE` skip reads the running container and stays (decision 8); the general check names such an image at start time, which they cannot |
| B6-41 | `tests/unit/m-b6.builder-image-tag.test.ts` | No change. It asserts that `builderLabels()` returns exactly three `--label` arguments (`:178-186`), and IM-FR7 leaves that function as it is: the product labels are added by `builderImage()` alone |
| OC-60 | `tests/contract/m-oc.bounded-calls.test.ts` | No change, decided here: it reads `config/scripts/start/openclaw.sh` (`:66`), not `scripts/linux/start.sh`, so the pre-flight's `docker image inspect` calls are outside what it bounds |
| OC-15 | `tests/component/m-oc.allow-scripts.test.ts` | No change. It reads the Claude install line out of `config/scripts/build/openclaw.sh` (`:77-79`); IM-FR9 changes the script's `.env` reader and not that line, and IM-3's last row holds the pattern |
| OC-80 | `tests/contract/m-oc.env-file-read.test.ts` | Its header's *Purpose* names the Liquid, OpenCode and privacy-proxy builds as the ones #5 moved to `load_env_file`; the OpenClaw build joins them (IM-FR9), and the header says so. The assertions, on `load_env_file` itself, are unchanged |
| CS-14 | `tests/component/m-cs.pairing-mount.test.ts` | Its `page()` (`:82-90`) mounts the launchpad's `+page.svelte` with a hand-written `data` object -- `running`, `needBuild`, `groups`, `extras`, `git`, `components` -- and the page renders `data.imagesNote` from IM-FR6 on. The object gains `imagesNote: []`. The field is added to the fixture rather than defaulted in the page (`data.imagesNote ?? []`): the page's `data` is typed from `load`, which makes the field required, so a fixture without it is a type error a reader sees, while a default in the page would let a `load` that forgot the field render a card with no lines and no error. It is the only mount in the tree that builds the launchpad's data by hand: `git grep -n 'needBuild: ' -- tests` on 2026-11-05 finds this file, `m-cs.stack-state`, which reads `stackState()`'s answer and mounts nothing, and `m-b5.fresh-install`, in comments |
| TR-1, TR-4 | `tests/contract/m-tr.case-ids.test.ts` | No change. `IM-` rows are read like any; no id spans files |

## 5. What is deliberately not here

- **A real build of a product image with a real `.env` change.** IM-6 builds a throwaway image from
  the builder's; a product image costs minutes to half an hour. IM-3 holds the scripts' answers
  without an engine and IM-M1 is the real walk.
- **The base image's drift** (feature §3): no case pulls.
- **The dashboard image**: excluded by decision 5, and IM-2's tree row is where its refusal shows.
- **`hermes.sh`**: disabled; IM-3's set leaves it out by name.
- **macOS**: IM-M1 (5).
- **A mounted test of the cards' paragraphs.** The lines are computed by `imagesNote()` and
  returned by the two `load`s as an array, which IM-7 holds without a DOM file, so the `SP-2` list
  in `TR-4` does not grow. That each page renders the array as one `<p class="warn">` per element
  is a template line, read by nobody but the operator in IM-M1 (3).

## 6. Traceability

| Requirement | Covered by |
|---|---|
| IM-FR1 the digest and the reader | IM-1, IM-2 |
| IM-FR2 the labels | IM-4, IM-6 |
| IM-FR3 every build labels, or stops; the environment reset; `rebuild.sh`'s pre-check | IM-3 |
| IM-FR4 `--inputs` | IM-3 |
| IM-FR5 the start's notice | IM-4, IM-5, IM-M1 |
| IM-FR6 the dashboard | IM-7, IM-8, IM-M1 |
| IM-FR7 the harness | IM-6 |
| IM-FR8 documentation | A0-11 (changed) |
| IM-FR9 `openclaw.sh` reads `.env` with `load_env_file` | IM-3 |
| IM-NFR1 cost | the feature's §8.6; no case bounds elapsed time, for SP-5's reason |
| IM-NFR2 the digest does not flap | IM-1, IM-3, IM-6, IM-M1 |
| IM-NFR3 nothing changes for a matching image | IM-5, IM-M1, the full suite |
