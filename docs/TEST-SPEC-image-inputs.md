# Test specification: an image records its inputs, and a start says when they changed

Status: **specified on 2026-11-04, not implemented.** Written against the code of `main` at
`da9a85c`; every *What it found* row is empty until the case runs, and the blocks say what the
implementation records there. Feature: `docs/FEATURE-image-inputs.md` (IM-FR1 to IM-FR8, IM-NFR1
to IM-NFR3). Issue: #34, on which the implementation is answered.

Files are named `tests/<level>/m-im.<subject>.test.ts`, and headers open `M-IM · <Level> · …` with
the block of `docs/TEST-SPEC-git-integration.md` §4.2. `./tests/run.sh im` runs them. The prefix
`IM` is new: no row of any `TEST-SPEC-*.md` and no test title on `main` at `da9a85c` carries it
(measured over both readers of `tests/contract/m-tr.case-ids.test.ts`, which found the prefixes
`A0`–`A17`, `A3b`–`A3e`, `B1`–`B7`, `CM`, `CS`, `CU`, `M`, `M1`, `MU`, `OC`, `RO`, `SP`, `SR`, `TC`
and `TR`). `TR-1` reads the rows here as it reads any document's, so nothing has to be registered
for the prefix; `TR-4` needs no `SPANS_FILES` entry, because every block below names every file
that carries its id in its *Implemented by* row, which is the computed route.

## 1. What is being tested, and at which level

| Component | Level | Rigour |
|---|---|---|
| The digest, `lu_image_inputs_digest`, and the reader of `COPY`/`ADD`, `lu_copy_sources` | unit | **Full branch coverage.** They decide whether an image is called stale, and a wrong answer either asks for a half-hour build without cause or passes a stale image in silence. Every accepted form and every refused form has a row |
| The source and the notice, `lu_image_source` and `lu_image_notice` | unit | Every branch: the three sources, the four lines and the silence |
| The seven build scripts | contract, integration against a stub engine | Every script both ways: the label on its build line, and `--inputs` answering without docker |
| `start.sh`'s pre-flight | integration, stub engine | Every outcome of IM-FR5, and the order against `down.sh` |
| A real image, through docker | integration | One throwaway image, labelled and judged, both ways; the tree-built builder image's label against the script's answer |
| `stackState()` and `imagesNote()` | component, unit | Every list both ways, `needBuild` on both sides of the operator's line (missing asks, stale and unlabelled do not), and the one shape that counts as neither |
| The run route's toolbox | integration, stub engine | Missing, stale and matching |
| Documentation | contract where a sentence is a claim (A0-11), none otherwise | — |

Nothing here depends on a model. IM-M1 is a documented operator check of the end-to-end path.

## 2. Overview

| Case | Level | Sense | Scenario |
|---|---|---|---|
| **IM-1** | Unit | positive | the digest of the stated fixture is its stated literal, 64 lower-case hex characters |
| **IM-1** | Unit | positive | …and the same over a copy of the fixture at another path |
| **IM-1** | Unit | positive | …and unchanged after `.env` and a skill file, which no `COPY` names, are written |
| **IM-1** | Unit | positive | …and unchanged after a `touch` and a `chmod` of a source |
| **IM-1** | Unit | positive | …and unchanged when the directory's entries were created in another order |
| **IM-1** | Unit | **negative** | …and changed by one byte appended to `entrypoint.sh` |
| **IM-1** | Unit | **negative** | …and changed by one line of the Dockerfile |
| **IM-1** | Unit | **negative** | …and changed by an argument added, by its value, and by the order of two |
| **IM-1** | Unit | **negative** | …and two files whose bytes concatenate to the same string give different digests |
| **IM-1** | Unit | **negative** | …and a renamed source changes it, since the path is hashed |
| **IM-1** | Unit | positive | …and a `--from=` source that does not exist in the context is passed over |
| **IM-1** | Unit | **negative** | …and a Dockerfile the reader refuses makes the digest exit 1 with its error and print nothing |
| **IM-2** | Unit | positive | the reader accepts each supported form and prints the sources in order, `./` removed |
| **IM-2** | Unit | positive | …and skips a `--from=` instruction and a heredoc body holding a `COPY` line |
| **IM-2** | Unit | **negative** | …and refuses each of the fourteen unsupported forms, naming file, line and instruction |
| **IM-2** | Contract | positive + **negative** | …and over every tracked Dockerfile accepts all but `dashboard/Dockerfile`, refused at its `COPY . .`, and names exactly the stated sources of each |
| **IM-2** | Contract | **negative** | …and `config/opencode/Dockerfile`, the un-templated leftover the implementation deletes, is not in the tree, so `config/opencode` holds one Dockerfile |
| **IM-3** | Contract | positive | each of the seven build scripts carries both labels on its `docker build` line |
| **IM-3** | Contract | **negative** | …and the set of scripts with the labels is the set `build.sh` runs plus `toolbox.sh`, so a new script without them is reported |
| **IM-3** | Integration | positive | each script with `--inputs` prints one 64-hex line, exits 0 and runs no docker |
| **IM-3** | Integration | positive | …and the `--inputs` answer equals the `io.liquidupstart.inputs` value the same script passes to `docker build` |
| **IM-3** | Integration | **negative** | …and `ENABLE_ANTHROPIC_CLAUDE_CODE=1` changes `openclaw.sh`'s and `privacy-proxy.sh`'s answers and no other's |
| **IM-3** | Integration | **negative** | …and `OPENCODE_SYSTEM_DEPENDENCIES`, `LIQUID_SYSTEM_DEPENDENCIES_MODE=override` and `POST_INSTALLATION_COMMANDS` each change the answer of the scripts that read them |
| **IM-3** | Integration | **negative** | …and `privacy-proxy.sh --inputs` with `PRIVACY_PROXY_DEV_SRC` set runs no docker and answers differently |
| **IM-3** | Integration | **negative** | …and a build whose digest cannot be computed exits 1 with `::aiw-error::` before `docker image rm` |
| **IM-4** | Unit | positive | the source is `.liquidupstart-version`'s first line when the file has one |
| **IM-4** | Unit | positive | …and `checkout-<sha>` in a clean repository, `-dirty` with a change, and it agrees with `run.sh --version` on this checkout |
| **IM-4** | Unit | **negative** | …and `unknown` where there is neither |
| **IM-4** | Unit | positive | the notice prints nothing for equal digests |
| **IM-4** | Unit | **negative** | …and the unlabelled line, the stale line naming the source, and the stale line for an unrecorded source |
| **IM-5** | Integration | positive | `start.sh` with every image matching prints no `Note: liquidupstart/` line and runs `down.sh` and `compose up` |
| **IM-5** | Integration | **negative** | …and with one image unlabelled prints its line and still starts |
| **IM-5** | Integration | **negative** | …and with one image stale prints its line, naming the source, and still starts |
| **IM-5** | Integration | **negative** | …and with one script's `--inputs` failing prints the could-not-compute line and still starts |
| **IM-5** | Integration | **negative** | …and with an image missing exits before `down.sh` with no `Note:` line, as CS-4 |
| **IM-5** | Integration | positive | …and does not ask about the image of a component that is off |
| **IM-5** | Integration | positive | …and prints the lines after the missing check and before `down.sh`, in `LU_IMAGES`' order |
| **IM-6** | Integration | positive | a throwaway image built through the library carries the label the library computes, and the notice is silent |
| **IM-6** | Integration | **negative** | …and after one byte of its source changes, the notice names it stale with its source |
| **IM-6** | Integration | positive | the tree-built builder image carries `io.liquidupstart.inputs` equal to `nar-builder.sh --inputs` |
| **IM-6** | Integration | positive | …and `builderContextDigest()` and the product digest read the same six files of `config/nar_builder` |
| **IM-7** | Component | positive | `stackState()` with every image matching answers `needBuild: false` and three empty lists |
| **IM-7** | Component | **negative** | …and names a missing image in `missing`, with `needBuild: true`, as today |
| **IM-7** | Component | **negative** | …and names a stale image in `stale` and an unlabelled one in `unlabelled`, each with `needBuild: false`, so Start stays enabled |
| **IM-7** | Component | positive | …and does not ask about the images of a component that is off |
| **IM-7** | Component | positive | …and an image whose script fails is in no list and does not ask for a build |
| **IM-7** | Unit | positive + **negative** | `imagesNote()` is empty for three empty lists and gives the stated lines otherwise, missing first |
| **IM-8** | Integration | **negative** | the run route builds the toolbox through `toolbox.sh` when the image is missing, and when its label differs |
| **IM-8** | Integration | positive | …and runs the task without a build when the label matches |
| **IM-M1** | Manual | positive + **negative** | the operator updates the checkout, starts, sees the lines, rebuilds, sees nothing |

## 3. Detail

### IM-1 — the digest

| | |
|---|---|
| **Premise** | The digest decides stale. Too wide and it says stale on every start (the whole-context digest would, since the start writes into OpenClaw's context); too narrow and a changed entrypoint passes. So every input the definition names has a row that changes it, and every thing it excludes has a row that does not. |
| **Component** | `lu_image_inputs_digest` in `config/scripts/build/lib/image-inputs.sh`, sourced in `bash -c`, as CS-1 sources `components.sh`. |
| **Steps** | Write the fixture below into a `mkdtemp` directory; call the function with its `Dockerfile`, the directory and no arguments; compare with the literal. Then each variation in a fresh copy, and compare with the base. |
| **Test data, both sides** | **The fixture `lu-im1`:** `Dockerfile` holding the four lines `FROM scratch`, `COPY entrypoint.sh /usr/local/bin/entrypoint.sh`, `COPY --chown=1000:1000 ./tools /opt/tools`, `COPY --from=build /app/out /opt/out`; `entrypoint.sh` holding `#!/bin/sh` and `exit 0`; `tools/b.txt` holding `b`, `tools/a.txt` holding `a`, `tools/B.txt` holding `B`, `tools/sub/c.txt` holding `c`, each one line; and two files no `COPY` names, `.env` holding `OPENCLAW_PROBE=1` and `skills/probe/SKILL.md` holding `probe`. Every file ends in one newline. **The literal:** `02548ed262e1330a2e8c8955c1b547c7ca46418b34edaf976fce8b484b73bd5d`, and with the one argument `ENABLE_ANTHROPIC_CLAUDE_CODE=0`, `1ca7d659ebb6adbfbc7733246f7de3e5e08f92dbc882e2a5986724da29010d52`. Both were computed on 2026-11-04 by a reference implementation of IM-FR1 written in Python from the definition alone, in the scratchpad and not in the tree, so the shell function is held to an independent reading of the words and not to itself. The walk it took: `entrypoint.sh`, `tools/B.txt`, `tools/a.txt`, `tools/b.txt`, `tools/sub/c.txt` -- `B` before `a`, because the order is bytewise. **Variations, and the side each is on.** Unchanged: the fixture copied to a second `mkdtemp` path; `.env` rewritten to `OPENCLAW_PROBE=2` and `skills/probe/SKILL.md` to `probe edited`; `touch` of `entrypoint.sh` and `chmod 755` of it (the fixture writes it `644`); `tools/` recreated with its four files written in the order `sub/c.txt`, `b.txt`, `B.txt`, `a.txt`. Changed: one `\n` appended to `entrypoint.sh`, expected `3e4c350f71e8fd6c5cb371bd22d676aac738f15ce4f2357d68444085f3913d93`; the Dockerfile's first line changed to `FROM scratch # x`; the argument `ENABLE_ANTHROPIC_CLAUDE_CODE=0` added (the second literal); its value `1`; the two arguments `A=1 B=2` against `B=2 A=1`; `tools/a.txt` renamed `tools/d.txt`. **The boundary:** two contexts whose Dockerfile is `FROM scratch` and `COPY a b /x/`, one with `a` holding `xy` and `b` holding `z`, the other `a` holding `x` and `b` holding `yz`, no newlines: `ff3f99d93bae475316ea4f3919abd19a981dcc826333c28051eb778434087960` and `6ecbbce4e125e4997907ea16d2ae78b56aef65042b2f1a6901c3d909a647823d`, which differ, so the separators carry. **The `--from=` row:** the fixture as it is, where `/app/out` exists nowhere, is the row: it is accepted. **The refused row:** the Dockerfile with `COPY . /x` appended: exit 1, stdout empty, stderr holding `Dockerfile:5: COPY . /x is not a form the image-inputs digest can read`. |
| **Expected** | As stated: the literal; equality for the unchanged rows; inequality, and the stated literal where one is given, for the changed rows; the boundary pair unequal; the refused row's exit, stdout and stderr. Every digest matches `/^[0-9a-f]{64}$/`. |
| **Dependencies** | bash 3.2 and 5.x; `sha256sum` or `shasum`. No docker. |
| **Shown able to fail** | To register: the `file` section's path dropped (`h.update(relative…)` gone) reddens the renamed-source row; the sort removed from the walk reddens the creation-order row on a filesystem that lists in creation order, and the literal row on any; the NUL after each content removed reddens the boundary row; the arguments ignored reddens the three argument rows. The literal row is the one that catches a change to the byte layout, which is a deliberate change: it updates the literal and this block says so. |
| **What it found** | *Empty until the case runs. The implementation records the run's figures and the mutations' results here.* |
| **Implemented by** | `tests/unit/m-im.digest.test.ts`. |
| **Covers** | IM-FR1, IM-NFR2. |

### IM-2 — the reader of `COPY` and `ADD`

| | |
|---|---|
| **Premise** | The reader decides which bytes are inputs. A form it misreads is a silent gap: a `COPY` with a glob read literally would hash a file that does not exist, or nothing, and the digest would pass whatever the glob brought in. So every form it cannot determine is refused by name, and every form on this tree is accepted. |
| **Component** | `lu_copy_sources` in `config/scripts/build/lib/image-inputs.sh`, in `bash -c`; and the tree's Dockerfiles, read through it. |
| **Steps** | For each stated Dockerfile in a `mkdtemp` context holding the files it names, call the reader and read stdout, stderr and the exit status. Then for every file `git ls-files` lists whose basename is `Dockerfile`, call it against the file's own directory. |
| **Test data, both sides** | **Accepted, one Dockerfile per line, each with the files `a` and `b` and the directory `d/` holding `e` in the context, and the expected output after the arrow:** `COPY a /x` → `a`; `COPY ./a /x` → `a`; `copy a /x` → `a`; `COPY --chown=1000:1000 a /x` → `a`; `COPY --chmod=755 a /x` → `a`; `COPY --link a /x` → `a`; `ADD a /x` → `a`; `COPY a b /x/` → `a` then `b`; `COPY d /x` → `d`; `COPY a \` on one line and `/x` on the next → `a`; `COPY --from=build /app /x` → nothing; `RUN <<'SH'`, `COPY planted /x`, `SH` on three lines → nothing, and `planted` exists nowhere; `FROM scratch` with no `COPY` → nothing, exit 0. **Refused, each with the expected line number and the instruction quoted in the message:** `COPY ["a","/x"]`; `COPY a* /x`; `COPY a? /x`; `COPY [ab] /x`; `ADD https://example.invalid/a /x`; `COPY <<EOF /x` followed by `EOF`; `COPY --parents a /x`; `COPY --exclude=b a /x`; `COPY . /x`; `COPY ./ /x`; `COPY ../a /x`; `COPY missing /x`; `COPY l /x` where `l` is a symlink to `a`; `COPY a`. Fourteen rows, each the only instruction after `FROM scratch`, so each message says `:2:`. `.invalid` is reserved by RFC 2606, so the URL row can resolve nowhere. **The tree, measured 2026-11-04 at `da9a85c`:** ten tracked files named `Dockerfile`, **nine once the implementation deletes `config/opencode/Dockerfile`** (feature decision 15), and the row is written for nine. Accepted, with their sources: `config/bun_runner/Dockerfile` → `entrypoint.sh`; `config/hermes/templates/Dockerfile` → `entrypoint.sh`; `config/liquid/templates/Dockerfile` → `entrypoint.sh`, `narcheck.py`, `nar-watch.sh`; `config/nar_builder/Dockerfile` → `build.sh`, `BuildServer.java`, `lifecycle-pins.xml`, `seed.sh`, `entrypoint.sh`; `config/openclaw/templates/Dockerfile` → `openclaw-claude.sh`; `config/opencode/templates/Dockerfile` → `entrypoint.sh`; `config/privacy-proxy/templates/Dockerfile` → nothing, its one `COPY` being `--from=claude-cli`, and its `RUN <<'SH'` heredoc holding a Python program that is not read; `config/toolbox/Dockerfile` → `toolbox-entry.sh`. Refused: `dashboard/Dockerfile`, at line 7, `COPY . .`, the one image decision 5 excludes. **Must not exist:** `config/opencode/Dockerfile` -- the reader would accept it (it did on 2026-11-04, with `entrypoint.sh`), which is why its absence is a row rather than a remark: a second Dockerfile in a build context is a second thing a reader can take for the inputs. The templates are read unrendered here, because the reader does not care about the tokens; `__SYSTEM_DEPENDENCIES__` sits on a `RUN` line. |
| **Expected** | As stated: stdout, exit 0 for the accepted rows; exit 1, empty stdout and `Error: Dockerfile:2: <instruction> is not a form the image-inputs digest can read` on stderr for the refused rows; on the tree, exactly the nine files, exactly the sources listed, exactly one refusal, and no file at `config/opencode/Dockerfile`. The tree row asserts the count of Dockerfiles found is at least nine, so an empty `git ls-files` cannot pass it. |
| **Dependencies** | bash, git. No docker. |
| **Shown able to fail** | To register: the `--from=` skip removed reddens its accepted row (the source `/app` does not exist, so the function refuses) and the privacy-proxy row of the tree; the glob check removed reddens the three glob rows; the heredoc skip removed reddens its row with `planted` as a missing source; the context-root check removed reddens `COPY . /x` and makes `dashboard/Dockerfile` accepted, which is the tree row's negative. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/unit/m-im.copy-reader.test.ts` (the forms), `tests/contract/m-im.tree-dockerfiles.test.ts` (the tree). |
| **Covers** | IM-FR1. |

### IM-3 — every build labels, and answers `--inputs` without an engine

| | |
|---|---|
| **Premise** | The check is only as good as the label the build wrote and the answer the start computes, and both come from the build script. A script that forgot the label makes every start say *built before images recorded their inputs*; one whose `--inputs` path differs from its build path makes every start say *stale* against a fresh image. So the two are compared through the same script. |
| **Component** | The seven scripts under `config/scripts/build/`, the library, `scripts/linux/build.sh` -- as text, and run in a copy of the tree with a stub `docker`. |
| **Steps** | Text: for each script, find its `docker build` line and the two `--label` arguments; read `build.sh` for the scripts it runs. Run: copy `config/` without `volumes/`, `scripts/linux/build.sh`, and the library into a `mkdtemp` tree at their real paths; put a stub `docker` first on `PATH` that appends its argv to `docker.log`, exits 0, and prints nothing; write `.env`; run each script with `--inputs`, then each script without it, and read stdout, `docker.log` and the exit status. |
| **Test data, both sides** | **The seven:** `opencode bun-runner nar-builder liquid openclaw privacy-proxy toolbox`. `build.sh` runs the first six (CS-3's order, `privacy-proxy` under its switch); `toolbox.sh` is the dashboard's and is in this set by name. **The build line:** matches `/^docker build .*--label "io\.liquidupstart\.inputs=\$\{DIGEST\}" --label "io\.liquidupstart\.source=\$\{SOURCE\}"/m` after joining continued lines. **`.env`:** `.env.example` with `SYSTEM_DEPENDENCIES="jq"`, `ENABLE_ANTHROPIC_CLAUDE_CODE=0`, `PRIVACY_PROXY_ENABLE=1`. **Variations, each against that base:** `ENABLE_ANTHROPIC_CLAUDE_CODE=1` -- changes `openclaw.sh` (its `sed` writes two `RUN` lines) and `privacy-proxy.sh` (its argument) and none of the other five; `OPENCODE_SYSTEM_DEPENDENCIES="ripgrep"` -- changes `opencode.sh` only; `LIQUID_SYSTEM_DEPENDENCIES_MODE="override"` with `LIQUID_SYSTEM_DEPENDENCIES=""` -- changes `liquid.sh` only, since the generic `jq` then goes; `POST_INSTALLATION_COMMANDS="echo im3"` -- changes the four templated scripts and none of `bun-runner`, `nar-builder`, `toolbox`; `PRIVACY_PROXY_DEV_SRC=<mkdtemp dir holding a one-line Dockerfile FROM scratch>` -- changes `privacy-proxy.sh` and runs no docker (the dev base is built only on a build). **The equality row:** for each script, the `--inputs` answer, and then the value after `--label io.liquidupstart.inputs=` in the `build` line of `docker.log` from a run without `--inputs`; the stub makes `image rm` and `build` succeed without an engine. **The refused row:** `config/openclaw/templates/Dockerfile` in the copy with `COPY . /planted` appended: `openclaw.sh` exits 1, `docker.log` holds no `image rm` and no `build`, stderr holds `templates/Dockerfile` with the line number and `::aiw-error::The inputs of liquidupstart/openclaw:latest could not be computed`. **The negative of the text row:** a script `probe.sh` written into the copy's `config/scripts/build/` with a `docker build` line and no label is reported by name; the real tree reports nothing. |
| **Expected** | Text: all seven match; the set of matching scripts under `config/scripts/build/`, `hermes.sh` and `lib/` left out, equals the seven. Run: for each script, `--inputs` prints one line matching `/^[0-9a-f]{64}$/`, exits 0, and `docker.log` holds nothing; the equality row holds for all seven; each variation changes exactly the scripts named and leaves the others' answers equal to the base; the refused row as stated. |
| **Dependencies** | bash, git for the source label (the copy is not a repository, so the source is `unknown`, which is fine here). No docker engine. The run rows take a few seconds: each script renders and hashes, 54 ms measured for one. |
| **Shown able to fail** | To register: `--label "io.liquidupstart.inputs=…"` removed from `opencode.sh` reddens the text row; the `--inputs` exit moved after `docker image rm` in `bun-runner.sh` reddens its no-docker row; `openclaw.sh` computing the digest before its `sed` reddens the `ENABLE_ANTHROPIC_CLAUDE_CODE=1` row for it; `privacy-proxy.sh` leaving `ENABLE_ANTHROPIC_CLAUDE_CODE` out of its arguments reddens that row for it. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/contract/m-im.build-labels.test.ts` (text), `tests/integration/m-im.build-inputs.test.ts` (run). |
| **Covers** | IM-FR3, IM-FR4, IM-NFR2. |

### IM-4 — the source, and the notice

| | |
|---|---|
| **Premise** | The source is what the notice names; a wrong one sends the operator to the wrong checkout. The notice is the one line the operator reads, and three of its four shapes are refusals of a kind, so each has a row, and the silence has one. |
| **Component** | `lu_image_source` and `lu_image_notice` in `config/scripts/build/lib/image-inputs.sh`, in `bash -c`; `run.sh --version` for the agreement row. |
| **Steps** | Source: three `mkdtemp` directories -- one holding `.liquidupstart-version`; one made by `git init` with one commit, then with an uncommitted file; one with neither -- and the repository root. Notice: the function on stated values. |
| **Test data, both sides** | **Source.** `.liquidupstart-version` holding ` v0.9.0 ` and a second line `ignored`: expected `v0.9.0`, so the trim and the first-line rule both show. The git directory: expected `checkout-` followed by `git rev-parse --short HEAD`'s answer; after `touch dirty.txt`, the same with `-dirty`. The empty directory: `unknown`. The repository root: the function's answer equals the word after `liquidupstart ` on the first line of `./run.sh --version`, which runs no docker (`run.sh:93`). A version file holding only whitespace counts as absent and falls through to git: a row with a file holding `  \n`. **Notice**, with `E` = sixty-four `a`, `F` = sixty-four `b`, and the image `liquidupstart/opencode:latest`: (`E`, `E`, `checkout-5bc0468`) → nothing; (`E`, empty, empty) → `Note: liquidupstart/opencode:latest was built before images recorded their inputs; rebuild to make this checkable: ./scripts/linux/build.sh`; (`E`, `F`, `checkout-5bc0468`) → `Note: liquidupstart/opencode:latest was built from checkout-5bc0468 and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`; (`E`, `F`, empty) → the same with `an unrecorded source`; and (`E`, `E`, empty) → nothing, since equal digests are equal whatever the source says. Each exits 0. |
| **Expected** | As stated, compared whole, line for line. |
| **Dependencies** | bash, git. No docker. |
| **Shown able to fail** | To register: the `-dirty` suffix dropped reddens the dirty row; the comparison inverted in the notice reddens the silence row and the stale row at once; the unlabelled branch merged into the stale one reddens the unlabelled row. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/unit/m-im.source-and-notice.test.ts`. |
| **Covers** | IM-FR2, IM-FR5. |

### IM-5 — the start notices, and does not refuse

| | |
|---|---|
| **Premise** | #34's two acceptance items are here: a stale image is named with the rebuild command, and a current one is passed over in silence. And the notice is a notice: `start.sh` goes on to `down.sh` and `compose up` whatever it printed, which is what distinguishes it from CS-4's refusal one loop earlier. |
| **Component** | `scripts/linux/start.sh` in the start fixture of CS-5, `tests/lib/startfixture.ts`, extended: `StartOptions.labels?: Record<string, { inputs: string; source: string }>` makes the stub `docker` answer `image inspect -f <format> <image>` by printing the named label's value for that image, empty when the image is not in the map, and exit 1 for an image in `missing`; and stub build scripts under `config/scripts/build/<name>.sh` for the seven names, each printing `${IM5_EXPECTED}` on `--inputs` and exiting 0, unless the name is in `StartOptions.inputsFail`, when it prints `im5: cannot read` to stderr and exits 1. The library is copied real, beside `components.sh`. |
| **Steps** | Run `start.sh` once per row and read stdout, `steps.log` and `docker.log`. |
| **Test data, both sides** | `.env.example` with `SYSTEM_SIGNIN_WAIT_SECONDS=0` and `PRIVACY_PROXY_ENABLE=1`, so `LU_IMAGES` is `opencode bun-runner nar-builder liquid openclaw privacy-proxy`. `IM5_EXPECTED` = sixty-four `a`; a stale label = sixty-four `b`; sources `checkout-5bc0468`. Rows: (matching) every image labelled `a…`; (unlabelled) `opencode` with an empty inputs label; (stale) `liquid` labelled `b…` with the source; (failing) `inputsFail: ['openclaw']`; (missing) `missing: ['liquidupstart/nar-builder:latest']`, every other image matching; (off) `ENABLE_LIQUID=0` with `liquid` and `nar-builder` labelled `b…`; (order) `opencode` and `privacy-proxy` both labelled `b…`. |
| **Expected** | (matching) no line of stdout starts with `Note: liquidupstart/` or `Note: the inputs of`; `steps.log` holds `down`; `docker.log` holds `compose up -d`. (unlabelled) stdout holds IM-4's unlabelled line for `liquidupstart/opencode:latest`, and `down` and `compose up -d` follow. (stale) IM-4's stale line for `liquidupstart/liquid:latest` naming `checkout-5bc0468`; `down` and `compose up -d` follow. (failing) `Note: the inputs of liquidupstart/openclaw:latest could not be computed (im5: cannot read), so it is not checked.`; `down` and `compose up -d` follow. (missing) rc 1, no `down`, no `compose up`, stderr naming `liquidupstart/nar-builder:latest` as CS-4 says, and no `Note:` line at all. (off) no `Note:` line. (order) the `opencode` line before the `privacy-proxy` line, both before `down` appears in `steps.log`, read by interleaving stdout's lines with the step log's through a marker the stub `down.sh` prints to stdout. |
| **Dependencies** | bash. No docker engine. |
| **Shown able to fail** | To register: the notice loop moved after `down.sh` reddens the order row; the loop's `continue` on a failing script replaced by `exit 1` reddens the failing row (the start then refuses); the loop given `exit 1` on a stale image reddens the stale and unlabelled rows, which is the refusal decision 3 rules out. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.start-notice.test.ts`. |
| **Covers** | IM-FR5, IM-NFR3. |

### IM-6 — a real image, labelled and judged

| | |
|---|---|
| **Premise** | Everything above holds the pieces against stated values. This holds the label against docker: that `docker build --label` writes what the function computed, that `index .Config.Labels` reads it back unchanged, and that the tree-built builder image -- the one every M-B case runs against -- carries the product's label, so the harness and the product agree about what `config/nar_builder` is. |
| **Component** | `docker build`, `lu_image_inputs_digest`, `lu_image_found_inputs`, `lu_image_notice`; `builderImage()` and `builderContextDigest()` in `tests/lib/builderimage.ts`. |
| **Steps** | (1) In a `mkdtemp` context write `Dockerfile` and `probe.txt`; compute the digest; build with the two product labels and `builderLabels()`; read the label back; call the notice. (2) Change `probe.txt`; compute again; call the notice with the image's labels. (3) Read `io.liquidupstart.inputs` off `builderImage()`; run `config/scripts/build/nar-builder.sh --inputs` on the repository. (4) List the files `builderContextDigest()` walks and the files `lu_copy_sources config/nar_builder/Dockerfile` names plus `Dockerfile`. |
| **Test data, both sides** | (1) `Dockerfile`: `FROM <builderImage()'s tag>` and `COPY probe.txt /probe.txt` -- the base is the image the harness has just built or found, so no registry is needed and `SP-3` does not apply; `probe.txt` holding `probe` and a newline; the source label `im6`; the tag `liquidupstart/nar-builder:im6-<BUILDER_RUN_ID>` under `TAG_PREFIX`, with `builderLabels()`, so an abandoned one is swept by `sweepAbandonedBuilderObjects` after two hours and `afterAll` removes it by tag. (2) `probe.txt` holding `probe2` and a newline. (3) The repository as it stands; both answers are the same 64-hex string when the harness passes what IM-FR7 says. (4) **Must be equal:** `Dockerfile build.sh BuildServer.java lifecycle-pins.xml seed.sh entrypoint.sh` -- the six tracked files, measured 2026-11-04. A seventh file in the context would make the tag's set larger than the label's, which this row names. |
| **Expected** | (1) the label equals the computed digest; the notice prints nothing. (2) the new digest differs; the notice prints `Note: liquidupstart/nar-builder:im6-… was built from im6 and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`. (3) equal. (4) the two sets equal. |
| **Dependencies** | docker; the builder image, built by `builderImage()` -- 0.7 s warm, minutes cold, and the cold build reaches the network, as every M-B file accepts. A bare `docker build` and no `docker compose`, so `run.sh` classes the file as default tier. |
| **Shown able to fail** | To register: `builderLabels()` without the two product labels reddens (3); `lu_image_found_inputs` reading `io.liquidupstart.source` instead of `inputs` reddens (1). (2) is (1)'s negative. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.real-image.test.ts`. |
| **Covers** | IM-FR2, IM-FR7, IM-NFR2. |

### IM-7 — the dashboard asks for a build for a missing image, and names a stale or unlabelled one

| | |
|---|---|
| **Premise** | `needBuild` is what disables Start until a build, and the operator decided on 2026-11-04 that only a missing image does that (feature decision 4, as changed): every existing installation is unlabelled after the upgrade, and a `needBuild` that read stale would have blocked Start everywhere for a half-hour rebuild. So the rows hold both halves: a missing image still asks for a build, and a stale or unlabelled one is named in its list with `needBuild: false`. A wrong `true` is the half-hour; a wrong empty list runs the stale image the whole feature exists against without a word. Each list has a row that fills it and the silence has one; and the one shape that fills no list, a script that cannot answer, has a row, because it is also what keeps every existing `stackState()` case green in a fixture project that has no build scripts. |
| **Component** | `stackState()` in `dashboard/src/lib/server/project.ts` and `imagesNote()` in `dashboard/src/lib/image-inputs.ts`. A stub `docker` first on `PATH`, as CS-12's, that answers `image inspect -f <format> <image>` from a table file `labels.tsv` of `image<TAB>inputs<TAB>source`, exit 1 for an image not in it, and logs its argv; and stub build scripts written into the fixture project's `config/scripts/build/<name>.sh`, each printing `${IM7_EXPECTED}` on `--inputs`, except where the row says it fails. |
| **Steps** | Write `labels.tsv` and the stubs per row, call `stackState()` with the row's `.env`, and read its answer and `docker.log`. Then call `imagesNote()` on stated lists. |
| **Test data, both sides** | `.env` from `envFrom()` with every switch on and `PRIVACY_PROXY_ENABLE=0`, so the images are `liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`. `IM7_EXPECTED` = sixty-four `a`; stale = sixty-four `b`. Rows: (matching) all five in the table with `a…`; (stale) `liquidupstart/opencode:latest` with `b…`; (missing) `liquidupstart/liquid:latest` absent from the table; (unlabelled) `liquidupstart/nar-builder:latest` with an empty inputs column; (off) `ENABLE_LIQUID=0`, `liquid` and `nar-builder` with `b…`; (failing) `openclaw.sh` exiting 1 with `im7: cannot read` on stderr, the rest matching. **`imagesNote()`:** `{missing: [], stale: [], unlabelled: []}` → `''`; `{missing: ['liquidupstart/liquid:latest'], stale: ['liquidupstart/opencode:latest'], unlabelled: []}` → `These images are not built yet: liquidupstart/liquid:latest. Run Build once before starting.` then `These images were built from other inputs than this checkout and its .env: liquidupstart/opencode:latest. Start runs them as they are; Rebuild brings them up to date.`, joined by one newline; `{missing: [], stale: [], unlabelled: ['liquidupstart/nar-builder:latest']}` → `These images were built before images recorded their inputs: liquidupstart/nar-builder:latest. Start runs them as they are; Rebuild makes them checkable.` |
| **Expected** | (matching) `needBuild: false`, three empty lists. (missing) `needBuild: true`, `missing: ['liquidupstart/liquid:latest']`, the others empty. (stale) **`needBuild: false`**, `stale: ['liquidupstart/opencode:latest']`, the others empty. (unlabelled) **`needBuild: false`**, `unlabelled: ['liquidupstart/nar-builder:latest']`, the others empty. (off) `needBuild: false`, three empty lists, and `docker.log` names neither `liquid` nor `nar-builder`. (failing) `needBuild: false`, three empty lists, and the server's stderr holds one line naming `liquidupstart/openclaw:latest` and `im7: cannot read`. `imagesNote()` as stated, compared whole. |
| **Dependencies** | bun; the component tier for `stackState()`, importing `tests/lib/dashboardfixture.ts` before `project.ts` as CS-12 does. No docker engine. |
| **Shown able to fail** | To register: `stale` added to `needBuild`'s disjunction -- the first version of this specification -- reddens the stale row, which is the row the operator's change exists for; the comparison with the script's answer removed (`stale` always empty) reddens the stale row's list; `unlabelled` merged into `stale` reddens the unlabelled row's list; a failing script counted as stale reddens the failing row and would, on the tree, redden every CS-12 row too. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/component/m-im.stack-state.test.ts` (`stackState()`), `tests/unit/m-im.images-note.test.ts` (`imagesNote()`). |
| **Covers** | IM-FR6. |

### IM-8 — the toolbox follows its own Dockerfile

| | |
|---|---|
| **Premise** | The toolbox is built once and then only replaced when something removes it (`BACKLOG.md`, *The toolbox image does not follow its own Dockerfile*). The route that builds it when missing is where a stale one is rebuilt, through the script that labels it. |
| **Component** | `POST /run` in `dashboard/src/routes/run/+server.ts`, imported in-process with a stub `docker` first on `PATH` that answers `image inspect -f <format> liquidupstart/toolbox:latest` from a table as IM-7's, logs every argv, and exits 0 for `run`; and the real `config/scripts/build/toolbox.sh` in the fixture project, with the stub `docker` seeing its `build`. |
| **Steps** | For each row, set the table, post `task=down` (the cheapest task), read the streamed text and `docker.log`. |
| **Test data, both sides** | The expected digest is `toolbox.sh --inputs`'s answer over the fixture project's `config/toolbox`, copied from the tree, read by the case first. Rows: (missing) the image absent from the table; (stale) present with sixty-four `b`; (matching) present with the expected digest. |
| **Expected** | (missing) and (stale): the stream holds `Helper toolbox image is missing or was built from other inputs - building it...`, and `docker.log` holds a `build` line with `-t liquidupstart/toolbox:latest` and `--label io.liquidupstart.inputs=<expected>` before the `run … liquidupstart/toolbox:latest` line. (matching): no `build` line, and the `run` line. |
| **Dependencies** | bun, bash in the test host for `toolbox.sh`. No docker engine. The route is already driven in-process by no case; `tests/integration/m-a8.toolbox-start-path.test.ts` drives the real image instead and changes with this (§4). |
| **Shown able to fail** | To register: the route comparing nothing and building only when `inspect` fails reddens the stale row; the route passing its old argv instead of the script reddens the label assertion of both build rows. |
| **What it found** | *Empty until the case runs.* |
| **Implemented by** | `tests/integration/m-im.toolbox-route.test.ts`. |
| **Covers** | IM-FR6. |

### IM-M1 — the operator's path (manual)

| | |
|---|---|
| **Premise** | No automated case runs a real build of a product image and a real start against it end to end; the pieces are held separately. This is the walk through UC1 and UC5. |
| **Steps** | (1) On a checkout with the stack built from it and the feature in, `./scripts/linux/start.sh`: no `Note: liquidupstart/` line. (2) Append one comment line to `config/opencode/entrypoint.sh`, start again: one line, naming `liquidupstart/opencode:latest`, `checkout-<sha>-dirty` and `./scripts/linux/build.sh`, and the stack starts. (3) Open the dashboard: the not-running card, after `./scripts/linux/down.sh`, says *These images were built from other inputs than this checkout and its .env: liquidupstart/opencode:latest. Start runs them as they are; Rebuild brings them up to date.*, and Start is enabled; press it, and the stack starts with the line of (2) in its log. (4) `./scripts/linux/build.sh`, then start: no line; the dashboard's card as before the change. The line of (2) names `checkout-<sha>-dirty`, since the edit is uncommitted (feature decision 14). (5) On a macOS host, the same (1), and `config/scripts/build/opencode.sh --inputs` on the host against the same answer from `docker run --rm -v <checkout>:<checkout> liquidupstart/toolbox:latest bash -c 'cd <checkout> && config/scripts/build/opencode.sh --inputs'` -- the cross-platform agreement §3 of the feature could not measure. |
| **Expected** | As stated at each step. (5) equal. |
| **What it found** | *Recorded by the operator, with the date, bash and sed versions of the host.* |
| **Covers** | IM-FR5, IM-FR6, IM-NFR2, IM-NFR3. |

## 4. Existing cases that change

| Case | File | Change |
|---|---|---|
| CS-4, CS-5 | `tests/lib/startfixture.ts`, `tests/integration/m-cs.start-switches.test.ts` | The fixture's stub `docker` answers `image inspect -f` with a label (IM-5), empty by default, so every CS-4 and CS-5 row runs with every image unlabelled and the start prints the unlabelled lines. The cases assert on `steps.log` and the docker log and are unchanged; the fixture copies the real library and gains the stub build scripts |
| CS-12 | `tests/component/m-cs.stack-state.test.ts` | `stackState()` returns `images` beside `needBuild`; the rows assert `needBuild` and the `image inspect` argv as before. The fixture project has no `config/scripts/build`, so every script fails and counts as neither (IM-FR6), which leaves `needBuild: false` where the rows expect it. The argv assertion changes shape: one `image inspect -f … <image>` per image instead of one call naming all five, so the row reads the set of images named across the calls |
| CS-23 | `tests/integration/m-cs.image-lists.test.ts` | No change. The image-to-script rule of decision 11 is by name, so it adds no fourth list for it to compare; IM-3's set row holds the scripts to the labels |
| A8-19 | `tests/integration/m-a8.toolbox-start-path.test.ts` | It builds `liquidupstart/toolbox:latest` by hand when missing, which would leave an unlabelled image the dashboard then rebuilds. It runs `bash config/scripts/build/toolbox.sh` instead |
| A8-27, B5-3 | `tests/unit/m-a8.built-images.test.ts`, `tests/unit/m-b5.fresh-install.test.ts` | No change. `update.sh`'s `BUILT_IMAGES` is as it was |
| A0-11 | `tests/contract/m-a0.readme-promises.test.ts` | Asserts the README sentence of IM-FR8: that a start names an image whose inputs changed and starts anyway |
| B1-9, B7-5 | `tests/integration/m-b1.dependency-cache.test.ts`, `tests/integration/m-b7.unseeded-dependency.test.ts` | No change. Their `SEEDED_IMAGE` skip reads the running container and stays (decision 8); the general check names such an image at start time, which they cannot |
| OC-60's bound | `tests/contract/m-oc.bounded-calls.test.ts` | To check at implementation: the pre-flight's `docker image inspect` calls in `start.sh` are of the shape the case already exempts or bounds for CS-4's loop; the new loop adds the same shape |
| TR-1, TR-4 | `tests/contract/m-tr.case-ids.test.ts` | No change. `IM-` rows are read like any; no id spans files |

## 5. What is deliberately not here

- **A real build of a product image with a real `.env` change.** IM-6 builds a throwaway image from
  the builder's; a product image costs minutes to half an hour. IM-3 holds the scripts' answers
  without an engine and IM-M1 is the real walk.
- **The base image's drift** (feature §3): no case pulls.
- **The dashboard image**: excluded by decision 5, and IM-2's tree row is where its refusal shows.
- **`hermes.sh`**: disabled; IM-3's set leaves it out by name.
- **macOS**: IM-M1 (5).
- **A mounted-card test of the launchpad's text.** The text is computed in `load` through
  `imagesNote()` and rendered as a string, so the unit row holds it without a DOM file, and the
  `SP-2` list in `TR-4` does not grow.

## 6. Traceability

| Requirement | Covered by |
|---|---|
| IM-FR1 the digest and the reader | IM-1, IM-2 |
| IM-FR2 the labels | IM-4, IM-6 |
| IM-FR3 every build labels, or stops | IM-3 |
| IM-FR4 `--inputs` | IM-3 |
| IM-FR5 the start's notice | IM-4, IM-5, IM-M1 |
| IM-FR6 the dashboard | IM-7, IM-8, IM-M1 |
| IM-FR7 the harness | IM-6 |
| IM-FR8 documentation | A0-11 (changed) |
| IM-NFR1 cost | the feature's §8.6; no case bounds elapsed time, for SP-5's reason |
| IM-NFR2 the digest does not flap | IM-1, IM-3, IM-6, IM-M1 |
| IM-NFR3 nothing changes for a matching image | IM-5, IM-M1, the full suite |
