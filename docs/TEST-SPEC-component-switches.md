# Test specification: switch Liquid, OpenClaw and OpenCode on and off

Status: **signed off on 2026-10-29, and implemented on this branch.** Each block's *What it found*
records the run; *Shown able to fail* names the mutation registered for the case in
`tests/mutations.json` and what `./tests/mutate.sh --case` answered.
Feature: `docs/FEATURE-component-switches.md` (CS-FR1 to CS-FR14, CS-NFR1, CS-NFR2). Issue: #50.

Files are named `tests/<level>/m-cs.<subject>.test.ts`, and headers open `M-CS · <Level> · …` with
the block of `docs/TEST-SPEC-git-integration.md` §4.2. `./tests/run.sh cs` runs them.

## 1. What is being tested, and at which level

| Component | Level | Rigour |
|---|---|---|
| The two readers, `components.sh` and `components.ts` | unit, contract | **Full branch coverage.** They decide what is built and started, and a reader that misreads `0` either costs a 30-minute build or leaves a service out without a word |
| `build.sh` and `start.sh` per switch | integration, against a stub engine | **Every switch both ways**, and the all-on case against today's order |
| `dependsOn` and the save rule in the dashboard | unit, component | **Full branch coverage.** The save writes `.env`, and a wrong branch writes `0` over a value the operator set |
| The launchpad, pairing, sign-in routes and notes | component, integration | Each switch both ways, positive and negative |
| `compose.yml` and the nginx template | contract, integration | No branch coverage: this is configuration. Every profiled service and every `proxy_pass` is checked, and nginx is run against the rendered file |
| The running stack | system (opt-in) | Two configurations: all off, and all on |
| Documentation | contract where a sentence is a claim (A0-11), none otherwise | — |

Nothing here depends on a model, so no case is a manual model check. CS-21 is a documented
operator check of the browser path, which no other level covers end to end.

## 2. Overview

| Case | Level | Sense | Scenario |
|---|---|---|---|
| **CS-0** | Integration | positive | compose 5.6.1 starts a service with `depends_on: {b: {required: false}}` while `b`'s profile is inactive |
| **CS-0** | Integration | positive | …and keeps `condition: service_healthy` when `b`'s profile is active |
| **CS-0** | Integration | positive | …and `logs`, `exec`, `restart`, `stop`, `start` and `ps` naming a running profiled service work without `COMPOSE_PROFILES` |
| **CS-0** | Integration | **negative** | …and `docker compose run` of a service whose dependency's profile is inactive: the answer is recorded, whichever it is |
| **CS-0** | Integration | **negative** | …and with the dependency present and unhealthy, `required` makes `up` fail while `required: false` does not: recorded |
| **CS-0** | Integration | **negative** | …and without `required: false` compose refuses the project, naming the dependency |
| **CS-1** | Unit | positive | the shell reader reads `1`, an absent key, an empty value, `"1"` and `1 # on` as on |
| **CS-1** | Unit | **negative** | …and `0`, `'0'`, `0 # off` and `0` with a carriage return as off |
| **CS-1** | Unit | **negative** | …and refuses `yes`, `O`, `2`, `off` and `true`, naming key and value, with `::aiw-error::` |
| **CS-1** | Unit | positive | …and takes the last of two occurrences |
| **CS-1** | Unit | **negative** | …and reads `0` with a tab before the comment, `" 0"`, `"0 "`, `"0"#x`, `0` and a lone `\r`, and `0\r\r\n` as off, and refuses `"'0'"`, `"0` and `0` with a no-break space before the comment |
| **CS-1** | Unit | **negative** + positive | …and the check names every refused key, and passes a valid file silently |
| **CS-1** | Unit | positive + **negative** | …and `lu_component_profiles` lists exactly the profiles of what is on, empty when nothing is |
| **CS-2** | Contract | positive | the shell and dashboard readers agree on every accepted line of one table |
| **CS-2** | Contract | **negative** | …and on a refused line the shell refuses and the dashboard reads on |
| **CS-3** | Integration | positive | `build.sh` with no switch key runs today's five build scripts in today's order |
| **CS-3** | Integration | **negative** | …and leaves out `liquid.sh` and `nar-builder.sh`, `openclaw.sh`, or `opencode.sh` per switch |
| **CS-3** | Integration | **negative** | …and builds only `bun-runner.sh` with all three off, plus `privacy-proxy.sh` when that is on |
| **CS-3** | Integration | **negative** | …and refuses a refused value with nothing built |
| **CS-3** | Integration | **negative** | …and through `rebuild.sh` refuses it before `down.sh` |
| **CS-3** | Integration | positive | …and a valid rebuild runs `down.sh` and then the steps |
| **CS-4** | Integration | **negative** | `start.sh` with a refused value exits 1 before `down.sh`, with no `compose up` |
| **CS-4** | Integration | **negative** | …and with an image of a component that is on missing exits 1 before `down.sh`, naming it |
| **CS-4** | Integration | positive | …and with the image of a component that is off missing starts as usual |
| **CS-4** | Integration | positive | …and with valid values runs `down.sh` and `compose up` |
| **CS-5** | Integration | positive | `start.sh` with no switch key exports `liquid,openclaw,opencode` and runs today's start steps |
| **CS-5** | Integration | positive | …and the profiles are already exported when `openclaw.sh` runs |
| **CS-5** | Integration | **negative** | …and per switch leaves out its profile and its start steps, the Copilot check included |
| **CS-5** | Integration | positive | …and runs `opencode.sh` with OpenCode off |
| **CS-5** | Integration | **negative** | …and a `COMPOSE_PROFILES=liquid` the caller exported does not bring Liquid back |
| **CS-5** | Integration | **negative** | …and a gateway that is on but unhealthy fails the start after `compose up` |
| **CS-5** | Integration | positive | …and with OpenClaw off the gateway is not asked about |
| **CS-5** | Integration | positive | …and with the privacy proxy on and OpenClaw off creates `volumes/_openclaw-claude` with mode 700 |
| **CS-5** | Integration | **negative** | …and prints no line naming a component that is off |
| **CS-5** | Integration | positive | …and with all on prints every line `main` prints, and runs the Copilot check |
| **CS-6** | Integration | **negative** | `nginx.sh` with Liquid off writes the certificate and no keystore or truststore |
| **CS-6** | Integration | positive | …and with Liquid on writes all three, and the rendered file is the same both ways |
| **CS-7** | Contract | positive | `compose.yml` profiles `liquid`, `nar_builder`, `openclaw-gateway`, `opencode` as CS-FR5 says, and `openclaw-cli` keeps `cli` and `full` |
| **CS-7** | Contract | **negative** | …and no other service gains a profile |
| **CS-7** | Contract | positive | …and the proxy's three entries are `required: false` with today's conditions |
| **CS-7** | Contract | positive | …and the proxy has `dns: ["127.0.0.1"]` |
| **CS-7** | Contract | positive | …and an always-on dependency stays required |
| **CS-8** | Integration | positive | `docker compose config --services` with all three profiles equals today's list |
| **CS-8** | Integration | **negative** | …and with none leaves out exactly the four, and still resolves |
| **CS-8** | Integration | positive | …and the routing-only override resolves with the agents' profiles inactive |
| **CS-9** | Contract | **negative** | the nginx template has no `proxy_pass` naming a host literally, the ingress heredoc in `nginx.sh` included |
| **CS-9** | Contract | positive | …and each `proxy_pass` is followed by the `proxy_redirect` the literal form had |
| **CS-9** | Contract | positive | …and declares the resolver, and each switchable vhost its 502 page naming its switch |
| **CS-9** | Contract | **negative** | …and the always-on vhosts carry no such page |
| **CS-9** | Contract | positive | …and `lu_proxy_identity` reads the same single identity from it |
| **CS-10** | Integration | positive | the rendered configuration passes `nginx -t` on a network with no upstream |
| **CS-10** | Integration | **negative** | …and `main`'s template, rendered the same way, does not |
| **CS-10** | Integration | positive | …and a running nginx answers `opencode.localhost` with the 502 page naming *Which apps to run* |
| **CS-10** | Integration | **negative** | …and answers `pgadmin.localhost` with nginx's own 502, not that page |
| **CS-10** | Integration | positive | …and reaches an upstream that is there, named `bun_runner`, at request time |
| **CS-10** | Integration | positive | …and a redirect naming the upstream reaches the browser rewritten |
| **CS-10** | Integration | **negative** | …and with the proxy's `dns` setting a name docker does not know does not resolve |
| **CS-10** | Integration | positive | …while the stack's own names still do |
| **CS-11** | Unit | **negative** | `nar-build` reads a 502 as an absent builder and names `ENABLE_LIQUID=0` |
| **CS-11** | Unit | positive | …and passes the builder's own 503 through as the builder's refusal, without the hint |
| **CS-11** | Unit | positive | …and prints a 200's body and exits 0 |
| **CS-12** | Unit | positive + **negative** | `builtImages()` names the five with all on and leaves out each component's images when it is off |
| **CS-12** | Unit | positive | …and names the privacy proxy's image while it is on |
| **CS-12** | Component | **negative** | …and `stackState()` asks docker only for the images of what is on |
| **CS-12** | Component | positive + **negative** | …and asks for the privacy proxy's image while it is on, as the launchpad shows it, and not while it is off |
| **CS-13** | Component | **negative** | the launchpad's tiles and extras of a component that is off carry the note and no link or credentials |
| **CS-13** | Component | positive | …and with it on carry today's link and credentials |
| **CS-14** | Integration | **negative** | `GET /openclaw-pairing` with OpenClaw off answers `disabled` and never runs the pairing script |
| **CS-14** | Integration | positive | …and with OpenClaw on runs it |
| **CS-14** | Component | **negative** | …and the launchpad page mounts no pairing card with OpenClaw off |
| **CS-14** | Component | positive | …and mounts it with OpenClaw on |
| **CS-15** | Integration | **negative** | the four sign-in routes answer `needed: false` with OpenClaw off and run no container; `POST` answers 409 |
| **CS-15** | Integration | positive | …and with OpenClaw on ask docker as they do today |
| **CS-16** | Component | positive | the configuration page opens with `1. WHICH APPS TO RUN` and its three checkboxes |
| **CS-16** | Component | **negative** | …and hides the fields of a switched-off component |
| **CS-16** | Component | positive | …and shows them all with the switches on |
| **CS-16** | Component | positive | …and shows an empty switch, and one written `'1'`, ticked |
| **CS-16** | Component | **negative** | …and shows a refused value ticked, with a note naming it |
| **CS-16** | Component | **negative** | …and no field but that switch carries the note, and no note shows a value |
| **CS-17** | Component | **negative** | saving with OpenClaw off keeps its hidden sign-in checkboxes at `1` |
| **CS-17** | Component | **negative** | …and switching OpenClaw on in the same save keeps them too |
| **CS-17** | Component | positive | …and with OpenClaw on, a shown checkbox left unticked is still written `0` |
| **CS-17** | Component | positive | …and switching OpenClaw off in the same save takes the value the form carried, `0` where the file held `1` |
| **CS-17** | Component | **negative** | …and changing a switch redirects with `rebuild=0` |
| **CS-17** | Component | **negative** | …and another tab switching OpenClaw on before the save does not wipe the hidden sign-ins |
| **CS-17** | Component | positive | …and without the rendered field, the `.env` as it is now decides |
| **CS-17** | Component | **negative** | …and an empty switch, shown ticked, is saved as `1` |
| **CS-17** | Component | **negative** | …and a page from before the switches keeps all three as they are |
| **CS-17** | Component | **negative** | …and does not believe a switch such a form carries |
| **CS-17** | Component | **negative** | …and leaves a value the start refuses refused |
| **CS-17** | Component | **negative** | …and keeps them as the start reads them, `'1'` as `1` and `0` with a tab-separated comment as `0`, not re-quoted into a refusal |
| **CS-18** | Component | positive | with both agents off, the Git card and five other places carry their notes |
| **CS-18** | Component | **negative** | …and with OpenClaw off only, no both-agents-off note appears, the Claude note does, and the Node app tile names OpenCode |
| **CS-18** | Component | **negative** | …and with both on, no note appears and the Node app tile reads as today |
| **CS-19** | Unit | positive + **negative** | `dependsOn` over the real `.env.example` names exactly the stated keys per switch, and no other |
| **CS-20** | System | **negative** | the stack with all three off runs none of the four, nginx answers, and no sign-in is waited for |
| **CS-20** | System | positive | …and with all three on runs as today |
| **CS-21** | Manual | positive + **negative** | the operator switches OpenClaw off and on again in the dashboard |

## 3. Detail

### CS-0 — compose does what the profile design leans on

| | |
|---|---|
| **Premise** | Before this feature, only the privacy proxy runs under a profile. This design moves four everyday services behind profiles, and three things it relies on come from compose's documentation, not from measurement here: that `required: false` accepts a dependency left out by its profile, that a condition still holds when the dependency is present, and that a command naming a profiled service enables its profile for that call. The last carries the README's, the skills' and `nar_builder`'s instructions (`docker compose logs liquid`, `exec nar_builder`, `restart liquid`) and the system tier's helpers. Measured first; if it fails, the specification returns (FEATURE §6). |
| **Component** | docker compose 5.6.1 itself, in a throwaway project, not this repository's `compose.yml`. |
| **Steps** | In a `mkdtemp` project write the `compose.yml` below. (1) `up -d` with `COMPOSE_PROFILES` unset; (2) `down`, then `up -d` with `COMPOSE_PROFILES=bp`; (3) with `b` running from (2), unset `COMPOSE_PROFILES` and run `logs b`, `exec -T b true`, `restart b`, `stop b`, `start b`, `ps b`; (4) `run --rm c true` with `COMPOSE_PROFILES` unset; (5) `down` with `COMPOSE_PROFILES='*'`. |
| **Test data, both sides** | Project name `lu-cs0-<pid>`, so no real project can be touched. `compose.yml`: service `a` from `nginx:latest`, `command: ["sleep", "infinity"]`, `depends_on: {b: {condition: service_healthy, required: false}}`; service `b` from `nginx:latest`, `profiles: ["bp"]`, a healthcheck `["CMD", "true"]` at 1 s; service `c` from `nginx:latest`, `profiles: ["cp"]`, `depends_on: [b]`. **Must exist:** `nginx:latest` locally, which `start.sh` already uses as its probe image. **Must not:** any container of the project before step 1. |
| **Expected** | (1) rc 0, `a` running, no container for `b`. (2) rc 0, `b` healthy before `a` is created, from `docker inspect`'s `State.StartedAt`. (3) each rc 0. (4) recorded either way, rc and message, because `openclaw.sh` runs `openclaw-cli` that way. The design is safe on both answers: `start.sh` exports `openclaw` before `openclaw.sh` runs (CS-5). |
| **Dependencies** | docker with compose 5.6.1. The file calls `docker compose`, so `run.sh` classes it as stack tier: it runs with `--system`. |
| **Shown able to fail** | `required: false` removed from `a` → (1) refuses with compose's message naming `b`. |
| **What it found** | **Measured by hand on 2026-10-29, compose 5.6.1, before the case is written as a test.** (1) `a` running alone. (2) `b` started at 09:16:53.87Z and was healthy before `a` started at 09:16:55.45Z. (3) All six commands rc 0, so naming a profiled service enables its profile for that call, and `ps` without a name lists `b` while it runs. (4) rc 1, `no such service: b`: a dependency's profile is **not** enabled by `run`, which is why CS-FR4 exports the profiles before `openclaw.sh`. Without `required: false`, compose refused the project with `service "a" depends on undefined service "b": invalid compose project`, which is the shown-able-to-fail mutation, observed. In that script the exit codes of (1), (2) and the mutation were a pipeline's, so the outcomes are read from the containers' state and compose's message. The test reads each rc directly. Run as a test on 2026-10-29 at `3ace2c5`: 6 / 0, the unhealthy pair included, which the second local review asked for and which holds as measured: `required` makes `up` exit non-zero, `required: false` exits 0 with `a` running. |
| **Implemented by** | `tests/integration/m-cs.compose-profiles.test.ts`. |
| **Covers** | CS-FR5, CS-NFR1. |

### CS-1 — the shell reader

| | |
|---|---|
| **Premise** | One function decides on and off for `build.sh` and `start.sh`. `start.sh`'s `get_env` keeps a ` # comment` in the value and `env_value` takes the first occurrence, so neither is the reader here. |
| **Component** | `config/scripts/start/lib/components.sh`, sourced in `bash -c`, as OC-79 sources `dockerfile-render.sh`. |
| **Steps** | For each `.env` below, call `lu_component_state <file> ENABLE_LIQUID`; then `lu_component_profiles` over the combinations. |
| **Test data, both sides** | One file per line. **On:** `ENABLE_LIQUID=1`; a file holding only `ENABLE_OPENCLAW=1`, so the key is absent; `ENABLE_LIQUID=`; `ENABLE_LIQUID="1"`; `ENABLE_LIQUID=1 # on`. **Off:** `ENABLE_LIQUID=0`; `ENABLE_LIQUID='0'`; `ENABLE_LIQUID=0 # off`; `ENABLE_LIQUID=0` followed by `\r\n`. **Refused:** `ENABLE_LIQUID=yes`, `ENABLE_LIQUID=O` (the capital letter, shaped to look like zero), `ENABLE_LIQUID=2`, `ENABLE_LIQUID=off`, `ENABLE_LIQUID=true`. **Two occurrences:** `ENABLE_LIQUID=0` then `ENABLE_LIQUID=1`, read as on. **Added after the local review of 2026-10-29, where the two readers disagreed:** off -- `ENABLE_LIQUID=0` with a tab before `# off`, `ENABLE_LIQUID=" 0"`, `ENABLE_LIQUID="0 "`, `ENABLE_LIQUID="0"#x`; refused -- `ENABLE_LIQUID="'0'"`, named `'0'`, and `ENABLE_LIQUID="0`, a quote that never closes, named `"0`. The rows live in `tests/lib/component-values.ts`, twenty-four in all, the lone `\r`, `\r\r\n` and the no-break space among them. **Profiles:** no key → `liquid,openclaw,opencode`; `ENABLE_LIQUID=0` → `openclaw,opencode`; `ENABLE_OPENCLAW=0` → `liquid,opencode`; `ENABLE_OPENCODE=0` → `liquid,openclaw`; all three `0` → the empty string. |
| **Expected** | On and off: stdout `on` or `off`, rc 0, stderr empty. Refused: rc 1, stdout empty, stderr holds `Error: ENABLE_LIQUID=yes in .env is not a switch value; use 1 (on) or 0 (off).` (with the value at hand, which is the value after the quotes come off) and a line starting `::aiw-error::ENABLE_LIQUID must be 1 or 0, not '<value>'.`. The check, over `ENABLE_LIQUID=yes`, `ENABLE_OPENCLAW=1` and `ENABLE_OPENCODE=off`, names both refused keys and not the valid one; over a valid file it is silent and exits 0. |
| **Dependencies** | bash 3.2 and 5.x; the macOS and Linux runs both count. |
| **Shown able to fail** | Registered: `tail -n1` → `head -n1` in `lu_component_value` reddens the two-occurrence row. Validated by `./tests/mutate.sh --case CS-1`. The refusal turned into "anything but 0 is on" is not registered: it would redden the eight refused rows, which are its own negative. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 31 / 0. The table had fifteen rows when the case was written; the local reviews of that day added nine more. Eight are lines the first readers disagreed on (CS-2); the ninth, `"0`, a quote that never closes, came in with them as a refused row they already agreed on. |
| **Implemented by** | `tests/unit/m-cs.component-reader.test.ts`. |
| **Covers** | CS-FR1, CS-FR2. |

### CS-2 — the two readers agree

| | |
|---|---|
| **Premise** | The dashboard decides what it shows from `components.ts` and the start decides what runs from `components.sh`. Where they differ, the page and the stack disagree about the installation, which is the kind of disagreement `A12` was about for the repositories card. |
| **Component** | Both readers over one table: `tests/lib/component-values.ts`, which lists each line and its expected answer. |
| **Steps** | For each row, write the line to a file, run `lu_component_state`, then `componentsOn` of `dashboard/src/lib/component-switches.ts` over `parseEnvValues` of the same file. |
| **Test data, both sides** | CS-1's twenty-four rows, unchanged. The table is the only list, so the readers cannot be tested against different values. `ENABLE_LIQUID='0'` is in it on purpose: `splitValue` handles only double quotes. So are the six rows the local review of 2026-10-29 found: with the first readers, the tab row read off in the shell and on in the dashboard, and four quoted rows were refused by the shell and read off by the dashboard, which hid the Liquid tiles of a stack that ran Liquid. The dashboard side is `componentsFrom`, which `installedComponents()` calls. |
| **Expected** | For every on or off row, both readers give the expected answer. For every refused row, the shell refuses and the dashboard reads on (CS-FR2). |
| **Dependencies** | bash and bun. |
| **Shown able to fail** | Registered, both validated: `componentsFrom` handed `value` instead of the text after `=` reddens `"'0'"`; the line pattern back to `(.*)$` reddens the two rows whose `\r` no `\n` follows, the lone `\r` and `\r\r\n` -- `0\r\n` stays green, since the line split takes that `\r` -- and the registry names the second. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 24 / 0. Eight rows disagreed between the first readers. Of review 1's five, the tab and `"'0'"` were the dashboard's errors, a reader that took `parseEnvValues`' value, and `" 0"`, `"0 "` and `"0"#x` were the shell's, which refused them; review 2's two rows, a lone `\r` and `\r\r\n`, the dashboard's line pattern; review 4's no-break space, JavaScript's `\s`, while the shell refused it. |
| **Implemented by** | `tests/contract/m-cs.readers-agree.test.ts`. |
| **Covers** | CS-FR2. |

### CS-3 — the build runs what is on

| | |
|---|---|
| **Premise** | The build is where the half hour goes. A switch that the build ignores saves nothing. A build that skips a component that is on fails the next start, which `stackState()` would then report as a missing image. |
| **Component** | `scripts/linux/build.sh`, copied with `components.sh` into a `mkdtemp` tree at their real relative paths. The six build scripts under `config/scripts/build/` are stubs, each appending its own name to `build.log`. |
| **Steps** | Run `build.sh` once per `.env` below, and read `build.log` and the exit status. |
| **Test data, both sides** | **Today's order** (from `build.sh` at `da4e2d1`): `opencode bun-runner nar-builder liquid openclaw`. `.env` files: `PRIVACY_PROXY_ENABLE=0` alone; `ENABLE_LIQUID=0`; `ENABLE_OPENCLAW=0`; `ENABLE_OPENCODE=0`; all three `0`; all three `0` plus `PRIVACY_PROXY_ENABLE=1`; `ENABLE_OPENCODE=yes`. |
| **Expected** | In the same order, for those files: `opencode bun-runner nar-builder liquid openclaw`; `opencode bun-runner openclaw`; `opencode bun-runner nar-builder liquid`; `bun-runner nar-builder liquid openclaw`; `bun-runner`; `bun-runner privacy-proxy`; rc 1 and **no `build.log`**, with stderr naming `ENABLE_OPENCODE=yes`. |
| **Dependencies** | bash. No docker: the build scripts are stubs. |
| **Shown able to fail** | Registered, both validated: the Liquid condition moved off `nar-builder.sh` makes the Liquid-off row list it; `rebuild.sh`'s check replaced by `false` makes the rebuild row run `down`. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 9 / 0. The rebuild rows came from the second review, which found `rebuild.sh` running `down.sh` before `build.sh` could refuse. |
| **Implemented by** | `tests/integration/m-cs.build-switches.test.ts`. |
| **Covers** | CS-FR3, CS-NFR1, CS-NFR2. |

### CS-4 — a refused value costs the start nothing

| | |
|---|---|
| **Premise** | `start.sh` runs `down.sh` early, and every check that came after it once cost a running installation (A8-21, A10-7). A typo in a switch must not join them. |
| **Component** | `scripts/linux/start.sh` in the start fixture of CS-5. |
| **Steps** | Run it with each `.env`; read the docker log and the step log. |
| **Test data, both sides** | `ENABLE_LIQUID=yes` (refused); `ENABLE_LIQUID=1` (accepted). **The image pre-flight, added after the local review of 2026-10-29:** `ENABLE_LIQUID=1` and `PRIVACY_PROXY_ENABLE=1` while the stub `docker` reports `liquidupstart/liquid:latest` and `liquidupstart/privacy-proxy:latest` absent; `ENABLE_LIQUID=0` while it reports the Liquid image absent. Every other key from `.env.example`. |
| **Expected** | Refused: rc 1, `down` not in the step log, no `compose up` in the docker log, stderr naming `ENABLE_LIQUID=yes` and saying nothing was stopped. Missing images: rc 1, the step log holds git's declaration pre-flight and nothing after it, stderr holds `Error: these images are not built: liquidupstart/liquid:latest liquidupstart/privacy-proxy:latest` and an `::aiw-error::Not built yet:` line. The absent image of a component that is off: rc 0, `down`, `compose up` with `openclaw,opencode`. Accepted: `down`, then `compose up -d`. |
| **Dependencies** | As CS-5. |
| **Shown able to fail** | Registered, both validated: the switch check replaced by `false` makes the refused row run `down.sh`; the image check replaced by `false` makes the missing-image row reach `compose up`. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 16 / 0, with CS-5. The image rows came from the first review: switching Liquid on with no image and pressing Restart emptied the stack. |
| **Implemented by** | `tests/integration/m-cs.start-switches.test.ts`. |
| **Covers** | CS-FR4, CS-NFR2. |

### CS-5 — the start activates what is on, and only that

| | |
|---|---|
| **Premise** | The start has to agree with compose about which services exist. The profiles must be exported before `openclaw.sh` runs, because it calls `docker compose run` and `rm` against `openclaw-gateway`; today the privacy profile is exported only after the start steps. What the start prints is what the operator reads, so it must not list a URL that answers 502. |
| **Component** | `scripts/linux/start.sh`, run whole in a fixture tree. **New fixture, `tests/lib/startfixture.ts`.** It copies `start.sh`, its libraries and the real nginx template. `down.sh` and every script under `config/scripts/start/` are stubs, each appending its name and `COMPOSE_PROFILES` to `steps.log`. A stub `docker` first on `PATH` logs its argv with `COMPOSE_PROFILES` and `COMPOSE_FILE` and answers success, printing nothing for `inspect`. |
| **Steps** | Run once per `.env`, then read `steps.log`, the docker log and stdout. |
| **Test data, both sides** | `.env.example` with `SYSTEM_SIGNIN_WAIT_SECONDS=0`, then: the three keys removed, with `ENABLE_GITHUB_COPILOT=1` so the Copilot check runs; `ENABLE_LIQUID=0`; `ENABLE_OPENCLAW=0` with `ENABLE_GITHUB_COPILOT=1` and `SYSTEM_BIND_ADDRESS=0.0.0.0`, so the warning that names the OpenClaw gateway is reached; `ENABLE_OPENCODE=0`; all three `0` with `PRIVACY_PROXY_ENABLE=1`; and `ENABLE_LIQUID=0` while the caller's shell exports `COMPOSE_PROFILES=liquid`. **Today's steps** (from `start.sh` at `da4e2d1`): `git(--check-declaration) generate_api_key pgadmin opencode git nextcloud nginx liquid nar-builder openclaw`. |
| **Expected** | `COMPOSE_PROFILES` at `compose up`, in the same order: `liquid,openclaw,opencode`; `openclaw,opencode`; `liquid,opencode`; `liquid,openclaw`; `privacy-proxy`. The `openclaw` step logs the same value as `compose up`. Steps: today's for the first; without `liquid` and `nar-builder` for the second; without `openclaw`, and with no `exec openclaw-gateway` in the docker log, for the third; **with** `opencode` for the fourth. Stdout: the first holds the lines `Liquid`, `Liquid username:`, `Liquid password:`, `Liquid ingresses`, `OpenClaw`, `OpenClaw node bridge`, `OpenClaw MS Teams endpoint` and `OpenCode`, and its docker log an `exec openclaw-gateway`; in the second no line contains `Liquid`, in the third none `OpenClaw` -- the *Node app* line names OpenCode and the network warning leaves the gateway out -- and in the fourth none `OpenCode`; in the fifth none of the three. The inherited `liquid` reaches neither a start step nor `compose up`: both see `openclaw,opencode`. The fifth row leaves `volumes/_openclaw-claude` with mode 700, and the first, with the privacy proxy off and `openclaw.sh` a stub, leaves none. |
| **Dependencies** | bash. No docker engine. |
| **Shown able to fail** | Registered, both validated: the `liquid` step left unconditional makes the Liquid-off row list it; the gateway check replaced by `false` lets the unhealthy row exit 0. The export left after the start steps was tried by hand while writing: the `openclaw` step logged an empty value. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 16 / 0, with CS-4. TC-822's own first run, not this fixture, moved CS-4's switch check after the libraries: TC-822 stubs `wait-for-operator.sh` to stop the start (§4). The unhealthy-gateway rows came from the second review, measured first in CS-0. |
| **Implemented by** | `tests/integration/m-cs.start-switches.test.ts`, with CS-4. |
| **Covers** | CS-FR4, CS-NFR1. |

### CS-6 — nginx.sh keeps the certificate and drops the keystore

| | |
|---|---|
| **Premise** | Every HTTPS server block of nginx names `liquid.localhost.crt`, Liquid or not, while the PKCS#12 keystore and truststore exist only for Liquid. Writing those without Liquid needs `LIQUID_KEYSTORE_PASSWORD`, which CS-FR12 hides while Liquid is off. |
| **Component** | `config/scripts/start/nginx.sh` in a `mkdtemp` tree with the real template. Real `openssl`; stub `keytool` and `docker`, each writing the file it was asked for. |
| **Steps** | Run with `ENABLE_LIQUID=0`, then in a fresh tree with `ENABLE_LIQUID=1`. |
| **Test data, both sides** | `LIQUID_KEYSTORE_PASSWORD=cs6-keystore-pass` in both runs, so the off run shows the password is not used, not that it is missing. |
| **Expected** | Off: `volumes/nginx/certs/liquid.localhost.crt` and `.key` exist; `liquid.keystore.p12` and `liquid.truststore.p12` do not. On: all four exist. The rendered `config/nginx/nginx.conf` is byte-identical between the two runs and holds 100 ingress blocks. |
| **Dependencies** | `openssl` (LibreSSL on macOS counts). |
| **Shown able to fail** | Registered and validated: the keystore half left unconditional makes the off run write the `.p12` files. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 3 / 0. |
| **Implemented by** | `tests/integration/m-cs.nginx-keystore.test.ts`. |
| **Covers** | CS-FR4. |

### CS-7 — compose.yml declares the profiles

| | |
|---|---|
| **Premise** | Which services a profile governs is configuration, and it can be read without docker. CS-8 confirms what compose makes of it. |
| **Component** | `compose.yml`, read through `tests/lib/compose-file.ts`'s `serviceBlock()`. |
| **Steps** | Read each service's `profiles:` and the proxy's `depends_on`. |
| **Test data, both sides** | **Profiled services, exactly:** `liquid` and `nar_builder` → `liquid`; `openclaw-gateway` → `openclaw`; `opencode` → `opencode`; `openclaw-cli` → `cli`, `full`; `privacy-proxy` → `privacy-proxy`. **Unprofiled, among the rest:** `proxy`, `bun_runner`, `postgres`, `nextcloud`. Proxy entries: `opencode` `service_started`, `nar_builder` `service_started`, `openclaw-gateway` `service_healthy`, each with `required: false`; `bun_runner` `service_started` without it. The proxy's `dns: ["127.0.0.1"]`, added after the local review of 2026-10-29. |
| **Expected** | As stated; the set of profiled services equals the six; the proxy's block holds the `dns` line. |
| **Dependencies** | None. |
| **Shown able to fail** | Registered, both validated: `required: false` removed from `openclaw-gateway`, and the proxy's `dns` line removed. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 5 / 0. Its first run was red for the test's own reason: the services block was cut at a comment in column 0. The `dns` row came from the first review. |
| **Implemented by** | `tests/contract/m-cs.compose-profiles.test.ts`. |
| **Covers** | CS-FR5. |

### CS-8 — compose resolves every combination

| | |
|---|---|
| **Premise** | A configuration compose refuses is found at `up`, after `down.sh`. The routing-only override names `opencode`, `openclaw-gateway` and `openclaw-cli`, and it has to resolve when they are profiled out. |
| **Component** | `docker compose config` on this repository's `compose.yml`, with an `.env` copied from `.env.example` into a `mkdtemp` project directory, so the real installation's `.env` is not read. |
| **Steps** | `config --services` with `COMPOSE_PROFILES=liquid,openclaw,opencode`, then with it empty; `config --format json` with all three; `config -q` with `COMPOSE_FILE=compose.yml:config/privacy-proxy/compose.routing-only.yml` and `COMPOSE_PROFILES=privacy-proxy`. |
| **Test data, both sides** | **Today's services** (`docker compose config --services` on `da4e2d1`, to be recorded at the first run and pinned in the file): the 21 unprofiled services. **Without profiles:** those minus `liquid`, `nar_builder`, `openclaw-gateway` and `opencode`. |
| **Expected** | All three: today's list. None: rc 0, the 17. JSON: `services.proxy.depends_on.openclaw-gateway` is `{condition: service_healthy, required: false}`. Routing-only: rc 0. |
| **Dependencies** | docker compose 5.6.1. Stack tier by marker. |
| **Shown able to fail** | Registered and validated: `required: false` removed from `openclaw-gateway` makes the run with no profile refuse. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 4 / 0, with today's 21 services and the 17 as pinned. |
| **Implemented by** | `tests/integration/m-cs.compose-resolves.test.ts`. |
| **Covers** | CS-FR5, CS-NFR1. |

### CS-9 — the template resolves at request time

| | |
|---|---|
| **Premise** | Today every `proxy_pass` names its host literally, and nginx resolves each one at start, so a single missing container stops the proxy and with it every `*.localhost`. One literal left behind brings that back. |
| **Component** | `config/nginx/templates/nginx.conf` and the ingress heredoc in `config/scripts/start/nginx.sh`, read as text; `lu_proxy_identity` from `config/scripts/start/lib/proxy-identity.sh`. |
| **Steps** | Collect every `proxy_pass` line; find the `resolver` line; find each switchable vhost's `error_page` and named location; run `lu_proxy_identity` on the template. |
| **Test data, both sides** | **Switchable vhosts and the text each page names:** `opencode.localhost` → OpenCode; `nar-builder.localhost` → the NAR builder; `openclaw.localhost`, `bridge.openclaw.localhost`, `msteams.openclaw.localhost` → OpenClaw; `liquid.localhost` → Liquid, each with `Which apps to run`; `privacy.localhost` → `Privacy proxy`. **Must not carry the page:** `pgadmin.localhost`, `postgrest.localhost`, `swagger.localhost`, `app.localhost`, `openproject.localhost`, `nextcloud.localhost`, `eurooffice.localhost`. |
| **Expected** | Every `proxy_pass` matches `proxy_pass https?://\$lu_upstream;`, and the line after it is `proxy_redirect <scheme>://<the set line's host:port>/ /;`, in the template and in the heredoc; the resolver line is `resolver 127.0.0.11 valid=10s ipv6=off;`; the pages as stated; `lu_proxy_identity` prints the identity it prints for `da4e2d1`'s template, and rc 0. |
| **Dependencies** | bash. |
| **Shown able to fail** | Built in: `da4e2d1`'s template, whose 15 literal lines and the heredoc's one the predicate names. Registered and validated: one literal `proxy_pass` back, for pgAdmin. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 7 / 0. The `proxy_redirect` row came from the first review, measured: with a variable, an upstream's redirect to its own name reached the browser unchanged. |
| **Implemented by** | `tests/contract/m-cs.nginx-upstreams.test.ts`. |
| **Covers** | CS-FR6. |

### CS-10 — nginx starts with nothing behind it

| | |
|---|---|
| **Premise** | CS-9 reads the text; this case runs nginx on it. `nginx -t` resolves literal upstreams while it checks, which makes it the exact failure today's start would meet. |
| **Component** | `nginx:latest`, the image the proxy runs, against the configuration `nginx.sh` renders (CS-6's tree). |
| **Steps** | (1) `docker run --rm --network none` with the rendered file at `/etc/nginx/conf.d/default.conf` and its certificates at `/etc/nginx/certs`: `nginx -t`. (2) The same with `da4e2d1`'s template rendered the same way. (3) Create the network `lu-cs10-<pid>`, run nginx on it beside one upstream with the alias `bun_runner`, and from a third container on it request `Host: opencode.localhost`, `Host: pgadmin.localhost` and `Host: app.localhost` on `SYSTEM_HTTP_PORT`. (4) Remove the containers and the network. |
| **Test data, both sides** | `.env.example` with `ENABLE_LIQUID=0`, so no keystore tool is needed, `SYSTEM_HTTP_PORT=8888` and `SYSTEM_HTTPS_PORT=8833`. **Must not exist:** any container named `opencode` or `pgadmin` on `lu-cs10-<pid>`, which is new and holds only this file's three. **Must exist:** the upstream, `nginx:latest` listening on 3000 under the alias `bun_runner`, whose page carries `Welcome to nginx!` and whose `/redirect` answers 301 to `http://bun_runner:3000/target`. The proxy runs with the `dns` value read from its block in `compose.yml`, `127.0.0.1`. `uz` is a top-level domain with an address of its own: a single-label name the internet answers, and no container's. |
| **Expected** | (1) rc 0, `test is successful`. (2) rc ≠ 0, `host not found in upstream`. (3) `opencode.localhost` → 502 with a body naming OpenCode and `Which apps to run`; `pgadmin.localhost` → 502 whose body does not contain `Which apps to run`; `app.localhost` → 200 with `Welcome to nginx!`; `app.localhost/redirect` → `Location: http://app.localhost:8888/target`, as the literal form rewrote it. In a container with the proxy's `dns` setting, `getent ahosts uz` prints nothing and `getent ahosts bun_runner` names it. The `bun_runner` row was added during implementation, after measuring it by hand: it is the property decision 5 rests on, and an underscore in a name is what nginx's resolver could have refused. The redirect and `dns` rows came from the local review of 2026-10-29; without the setting, `uz` resolved to the domain's public address and nginx proxied to it, measured by hand that day and not asserted, since it needs the internet. |
| **Dependencies** | docker, `nginx:latest`. It uses `docker run` and `docker network`, not compose, so it stays in the default tier, as the bare `docker run` comment in `tests/run.sh` allows. |
| **Shown able to fail** | Built in: (2) is `da4e2d1`'s template. Registered, both validated: the `resolver` line removed reddens the `bun_runner` row, which then answers 502; `app.localhost`'s `proxy_redirect` removed reddens the redirect row. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 8 / 0. The `bun_runner` row held as measured by hand. The redirect row first expected `/target` and got `http://app.localhost:8888/target`, which is what the literal form produces, so the expectation was corrected and not the code. The `dns` rows came from the first review: without the setting, nginx proxied a request for `uz` to that domain's public address. |
| **Implemented by** | `tests/integration/m-cs.nginx-starts.test.ts`. |
| **Covers** | CS-FR6, CS-NFR1. |

### CS-11 — nar-build without a builder

| | |
|---|---|
| **Premise** | With the builder off, nginx answers 502, and `nar-build` today prints that body as if the builder had refused. The builder answers 503 and 504 itself, so only 502 can mean "not there". |
| **Component** | `config/agents/bin/nar-build.sh --target`, which skips the `/repos` check, with a stub `curl` first on `PATH` that writes a body to the `-o` file and prints a status. |
| **Steps** | Three runs, one per answer. |
| **Test data, both sides** | 502 with CS-10's page for `nar-builder.localhost`; 503 with the builder's own body from `BuildServer.java:91`, `nar-build refused: two builds are already running.` and `Wait for one to finish and run it again.`; 200 with `nifi 2.9.0`. |
| **Expected** | 502: rc 1; stderr holds `the builder did not answer` and `ENABLE_LIQUID=0`. 503: rc 1; stderr is the body, without `ENABLE_LIQUID`. 200: rc 0; stdout `nifi 2.9.0`. |
| **Dependencies** | `/bin/sh`. |
| **Shown able to fail** | Registered and validated: 502 dropped from the absent case leaves the first run's stderr without the hint. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 3 / 0. |
| **Implemented by** | `tests/unit/m-cs.nar-build-absent.test.ts`. |
| **Covers** | CS-FR7. |

### CS-12 — the dashboard asks for the images of what is on

| | |
|---|---|
| **Premise** | `stackState().needBuild` is true when any image `builtImages()` names is missing. Leaving a switched-off image in the list asks for a build forever, which is #50's own example. Leaving out one that is on lets a start fail on a missing image. This also replaces the two cases that read the list as text, A8-27's second half and B5-3's first. |
| **Component** | `builtImages()` and `stackState()` in `dashboard/src/lib/server/project.ts`. For `stackState()`, a stub `docker` first on `PATH` logs its argv and exits 0. |
| **Steps** | Call `builtImages()` with each combination, then `stackState()` against a project whose `.env` holds `ENABLE_LIQUID=0`. |
| **Test data, both sides** | All on → `liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`. Liquid off → without `liquid` and `nar-builder`. OpenClaw off → without `openclaw`. OpenCode off → without `opencode`. All off → `liquidupstart/bun-runner:latest` alone, and with the privacy proxy on, followed by `liquidupstart/privacy-proxy:latest`. For `stackState()`: `.env` from `envFrom()` with `ENABLE_LIQUID=0`, then `1`, each with `PRIVACY_PROXY_ENABLE=0`; and Liquid on with `PRIVACY_PROXY_ENABLE=1`. |
| **Expected** | As stated, in that order. `stackState()`'s `image inspect` argv, with Liquid off, names neither `liquid` nor `nar-builder` and does name `opencode`, `bun-runner` and `openclaw`; with Liquid on, all five; with the privacy proxy on, `liquidupstart/privacy-proxy:latest` as well, and with it off, not. |
| **Dependencies** | bun; the component tier for `stackState()`. |
| **Shown able to fail** | Registered, all three validated: the filter in `builtImages()` made to keep everything reddens the Liquid-off row; the privacy proxy's image left off reddens the unit privacy row; `stackState()`'s privacy flag fixed at `false` reddens the component privacy row. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 6 / 0 unit, 3 / 0 component. The privacy rows came from the second review: the start required the image and the dashboard did not ask for it. The third review's reading of the key by the scripts' rule was taken back by the fourth, which found it gave one page two answers. |
| **Implemented by** | `tests/unit/m-cs.built-images.test.ts`, `tests/component/m-cs.stack-state.test.ts`. Both import `tests/lib/dashboardfixture.ts` before `project.ts`, which captures `ENV_DIR` on its first load; so do A8-27 and B5-3 now (§4). |
| **Covers** | CS-FR8. |

### CS-13 — the launchpad says what is switched off

| | |
|---|---|
| **Premise** | A tile that links to a switched-off service is a dead link with the stack's name on it. |
| **Component** | `load` in `dashboard/src/routes/+page.server.ts`, through `launchpadData()` of `tests/lib/dashboardfixture.ts`. |
| **Steps** | For each switch off and then on, read the tile and the extras it owns. |
| **Test data, both sides** | Owners: *Liquid.MX* and *Liquid ingresses* (Liquid); *OpenClaw*, *OpenClaw node bridge* and *OpenClaw MS Teams endpoint* (OpenClaw); *OpenCode* (OpenCode). The note: `switched off — enable it under Which apps to run in Configuration`. With all on: *Liquid.MX* has `url` `https://liquid.localhost:8833` and the creds `LIQUID_USERNAME` and `LIQUID_PASSWORD`, valued as `.env.example` sets them: `liquid` and `liquidpassword`. |
| **Expected** | Off: the note, no `url`, no `creds`. On: today's values. `data.components` matches the switches. |
| **Dependencies** | bun, `dashboard/node_modules`. |
| **Shown able to fail** | Registered and validated: the OpenCode tile left unconditional gives the OpenCode-off row a `url`. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 4 / 0. |
| **Implemented by** | `tests/component/m-cs.launchpad.test.ts`. |
| **Covers** | CS-FR9. |

### CS-14 — no pairing without OpenClaw

| | |
|---|---|
| **Premise** | The card polls every 15 s, and each poll runs `docker run liquidupstart/openclaw:latest`. Without the image, every poll is an error on the launchpad. |
| **Component** | `GET /openclaw-pairing`, in-process as OC-72 calls it; and `dashboard/src/routes/+page.svelte` mounted through `tests/lib/mount.ts` with load data. |
| **Steps** | As OC-72 does, make the throwaway project's `config/scripts/openclaw-pairing.sh` a stub: it writes `ran` to a marker file and prints an empty list. Then GET with `ENABLE_OPENCLAW=0` and with `ENABLE_OPENCLAW=1`. Mount the page with `components.openclaw` false and true. |
| **Test data, both sides** | Marker file `pairing-ran` in the project. A `.env` with `ENABLE_OPENCLAW=0`, and one with `ENABLE_OPENCLAW=1`. |
| **Expected** | Off: status 200, `{ ok: true, disabled: true, pending: [], revoked: [] }`, no marker file; POST 409 with `{ ok: false, message }`, the message being CS-15's. On: the marker exists, and the body is the stub's. Mounted off: no element of the pairing card. Mounted on: the card's root element. |
| **Dependencies** | bun, `dashboard/node_modules`. The mounted half voices its skip under `SP-2`, and joins the SP-2 record (TR-4). |
| **Shown able to fail** | Registered and validated: the route's switch check replaced by `false` makes the marker appear in the off run. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 3 / 0 for the route, 2 / 0 and 1 SP-2 skip mounted. Run beside OC-72 it found that a component file leaving the shared project's `.env` with OpenClaw off turned OC-72's listing into the switched-off answer; `borrowSharedProject()` in `tests/lib/dashboardfixture.ts` gives the project back, and in the runner's order the twenty files that touch `ENV_DIR` pass on `main` and the thirty on this branch. |
| **Implemented by** | `tests/integration/m-cs.pairing-route.test.ts`, `tests/component/m-cs.pairing-mount.test.ts`. |
| **Covers** | CS-FR10. |

### CS-15 — no sign-in panel without OpenClaw

| | |
|---|---|
| **Premise** | Copilot, Codex and Grok check `openclaw.json`, not the image, so a leftover `volumes/_openclaw/openclaw.json` with a provider switched on makes their GET answer `needed: true`, and a sign-in panel appears for a service that is not there. |
| **Component** | `GET` and `POST` of `/claude-auth`, `/copilot-auth`, `/codex-auth` and `/grok-auth`, in-process; a stub `docker` first on `PATH` that logs its argv, exits 0 for `image inspect` and 1 for `auth status` and `models auth list`. |
| **Steps** | Per route, GET and POST `{ action: 'start' }` with OpenClaw off; GET with OpenClaw on. |
| **Test data, both sides** | Project `.env`: `ENABLE_ANTHROPIC_CLAUDE_CODE=1`, `ENABLE_GITHUB_COPILOT=1`, `ENABLE_OPENAI_CODEX=1`, `ENABLE_XAI_GROK=1`, `CLAUDE_CODE_OAUTH_TOKEN=` (empty), and `volumes/_openclaw/openclaw.json` holding `{}`, so that every gate before the new one passes. Then `ENABLE_OPENCLAW=0`, and `ENABLE_OPENCLAW=1`. |
| **Expected** | Off: GET `{ needed: false }` with an empty docker log; POST 409 with `OpenClaw is switched off — turn it on under Which apps to run in Configuration first.` On: GET `{ needed: true }`, and the docker log names `liquidupstart/openclaw:latest`. |
| **Dependencies** | bun. |
| **Shown able to fail** | Registered and validated: the check removed from `/copilot-auth` GET makes its off GET answer `needed: true`. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 12 / 0. |
| **Implemented by** | `tests/integration/m-cs.auth-routes.test.ts`. |
| **Covers** | CS-FR11. |

### CS-16 — the configuration page shows what has a reader

| | |
|---|---|
| **Premise** | Fields whose only reader is switched off invite edits that change nothing. Hiding them is decision 3's other half: hidden, and kept. |
| **Component** | `load` of `dashboard/src/routes/config/+page.server.ts`, through `configSections()` and `fieldsOf()`. |
| **Steps** | For each `.env`, read the sections and their fields. |
| **Test data, both sides** | All on; `ENABLE_LIQUID=0`; `ENABLE_OPENCLAW=0`; `ENABLE_OPENCODE=0`; and, appended to all on, `ENABLE_LIQUID=` and `ENABLE_OPENCODE='1'`. The hidden sets are CS-19's, and the subheadings that go with them are `Liquid`, `OpenClaw`, `OpenCode`, `Use GitHub Copilot`, `Use a ChatGPT subscription` and `Use a Grok (xAI) subscription`. |
| **Expected** | The first section is `1. WHICH APPS TO RUN`, holding `ENABLE_LIQUID`, `ENABLE_OPENCLAW` and `ENABLE_OPENCODE` of type `checkbox`, valued `1`. Each switch off: none of its keys is among the fields, and every other field is. With OpenClaw off, `ENABLE_ANTHROPIC_CLAUDE_CODE` is still shown. With Liquid off, *Liquid AUTHENTICATION* goes and the sections number 1 to 10. All on: every field of every shown section of `.env.example` is shown. The empty and the single-quoted switch are both valued `1`. With `ENABLE_LIQUID=O` appended, the Liquid switch is valued `1` and its note reads `ENABLE_LIQUID=O in .env is not a switch value, and the start refuses it. Tick or untick it and save to set it.`; it is the only field with a note, although every other field holds a `fixture-` value that is no switch value either, and no note contains `fixture-`. |
| **Dependencies** | bun. |
| **Shown able to fail** | Registered, all four validated: the section filter of `load` removed leaves the empty Liquid section and the numbering red; the normalised switch value removed reddens the ticked row; the refusal note removed reddens the refused row; the note's switch guard removed reddens the row that no other field carries it. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 10 / 0. The ticked rows came from the first review; the refused row from the second; the row that no other field carries the note from the third, which found the note on every field and a password's value printed in it. |
| **Implemented by** | `tests/component/m-cs.config-hiding.test.ts`. |
| **Covers** | CS-FR1, CS-FR12. |

### CS-17 — the save keeps what it did not show

| | |
|---|---|
| **Premise** | The save writes an unsubmitted checkbox as `0` (`config/+page.server.ts:101`), and `submittedForm()`, like a browser, submits only shown fields. So hiding a checkbox without the rule turns it off at the next save. |
| **Component** | `actions.save`, through `saveConfig(submittedForm(…))`; the written `.env` read back. |
| **Steps** | One save per row, (a) to (l). |
| **Test data, both sides** | (a) `.env`: `ENABLE_OPENCLAW=0`, `ENABLE_GITHUB_COPILOT=1`, `ENABLE_XAI_GROK=1`, `ENABLE_LIQUID=0`, `LIQUID_PASSWORD="kept-while-liquid-is-off"`; form as rendered. (b) As (a), form with `ENABLE_OPENCLAW` ticked. (c) `.env`: `ENABLE_OPENCLAW=1`, `ENABLE_GITHUB_COPILOT=1`; form with `ENABLE_GITHUB_COPILOT` unticked. (d) `.env`: `ENABLE_OPENCLAW=1`, `ENABLE_GITHUB_COPILOT=1`; form with `ENABLE_OPENCLAW` and Copilot both unticked. *Corrected during implementation:* the row first had Copilot ticked, and then keeping the file's `1` and taking the form's `1` give the same answer, so the row could not tell the two rules apart. (e) `.env` all on; form with `ENABLE_OPENCODE` unticked. (f) and (g), added after the local review of 2026-10-29: the page is rendered from (a)'s `.env`, then `ENABLE_OPENCLAW=1` is written to the file before that form is saved, with its hidden `__components` field (f), `liquid=0,openclaw=0,opencode=1`, and without it (g). (h) `ENABLE_LIQUID=` (empty), form as rendered. (i) `ENABLE_OPENCODE=0`, form without `__components` and without the three switches. (j) the same `.env`, form without `__components` and with `ENABLE_OPENCODE` ticked. (k) `ENABLE_LIQUID=O`, form as (i). (l) all on, then the lines `ENABLE_OPENCODE='1'` and `ENABLE_LIQUID=0`, a tab, `# off` appended, form as (i). The password is chosen to differ from `.env.example`'s `liquidpassword`, so a reset to the default shows. |
| **Expected** | (a) `ENABLE_GITHUB_COPILOT=1`, `ENABLE_XAI_GROK=1`, `LIQUID_PASSWORD="kept-while-liquid-is-off"`. (b) `ENABLE_OPENCLAW=1`, `ENABLE_GITHUB_COPILOT=1`, `ENABLE_XAI_GROK=1`. (c) `ENABLE_GITHUB_COPILOT=0`. (d) `ENABLE_OPENCLAW=0`, `ENABLE_GITHUB_COPILOT=0`. (e) the redirect is `/done?rebuild=0`. (f) `ENABLE_GITHUB_COPILOT=1`, `ENABLE_XAI_GROK=1`. (g) `ENABLE_GITHUB_COPILOT=0`: without the field the file as it is now decides, which is the race (f) closes. (h) `ENABLE_LIQUID=1`. (i) `ENABLE_LIQUID=1`, `ENABLE_OPENCLAW=1`, `ENABLE_OPENCODE=0`. (j) `ENABLE_OPENCODE=0`. (k) `ENABLE_LIQUID=O`. (l) `ENABLE_LIQUID=0`, `ENABLE_OPENCODE=1`. |
| **Dependencies** | bun. |
| **Shown able to fail** | Registered, all five validated: the keep rule for dependent fields removed reddens (a); the rendered field ignored reddens (f); the old-page rule turned off reddens (i); a kept switch written from its parsed value reddens (l); a refused value written as `1` reddens (k). |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 12 / 0. Row (d)'s first data could not tell the two rules apart, see above. The later rows came from the local reviews: (f), (g) and (h) from the first, the race and the shown value; (i) from the second, the old page; (l) from the third, the re-quoting; (j) and (k) from the fourth, the two branches of the old-page save left untested. |
| **Implemented by** | `tests/component/m-cs.config-save.test.ts`. |
| **Covers** | CS-FR12, CS-FR8 (decision 10). |

### CS-18 — places that need an agent say when there is none

| | |
|---|---|
| **Premise** | Decision 4: what only matters with an agent stays visible and says that nothing will use it. A note that also appears with an agent on is noise (A8-26's rule). |
| **Component** | `load` of the launchpad and of the configuration page; `GitRepositories.svelte` mounted over `gitCard()`, as A8-39 mounts it. |
| **Steps** | Three `.env`s, each read through both loads and the mounted card. |
| **Test data, both sides** | Declaration `PAIR_DECLARATION` from `tests/lib/gitproject.ts:209`, so the card is drawn. (a) `ENABLE_OPENCLAW=0`, `ENABLE_OPENCODE=0`. (b) `ENABLE_OPENCLAW=0`, `ENABLE_OPENCODE=1`. (c) both `1`. The texts are CS-FR13's. |
| **Expected** | (a) The card and *GIT INTEGRATION* carry the repositories note. The privacy tile and *PRIVACY PROXY* carry the providers note. *SELF-HOSTED LOCAL LLM* carries the local-LLM note. The Node app tile says no agent is switched on to build it. (b) None of those three notes; the Claude note on `ENABLE_ANTHROPIC_CLAUDE_CODE`; the Node app tile names OpenCode. (c) No note; the Node app tile reads `build an app using OpenClaw first`, as today. |
| **Dependencies** | bun, `dashboard/node_modules` for the mounted card; SP-2 as CS-14. |
| **Shown able to fail** | Registered and validated: the both-off condition replaced by OpenClaw-off gives (b) the repositories note. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 4 / 0 and 1 SP-2 skip. |
| **Implemented by** | `tests/component/m-cs.agent-notes.test.ts`. |
| **Covers** | CS-FR13. |

### CS-19 — exactly these keys depend on a switch

| | |
|---|---|
| **Premise** | `dependsOn` matches section titles and subheadings by pattern. A field added to a dependent section later is hidden too, which may or may not be meant. Pinning the resulting key sets over the real file makes that a visible change instead of a silent one. |
| **Component** | `dependsOn` in `dashboard/src/lib/env-meta.ts`, over every field `parseExample` finds in the real `.env.example`. |
| **Steps** | Group the fields by `dependsOn`'s answer. |
| **Test data, both sides** | **Liquid:** `LIQUID_USERNAME`, `LIQUID_PASSWORD`, `LIQUID_KEYSTORE_PASSWORD`, `LIQUID_SYSTEM_DEPENDENCIES`, `LIQUID_SYSTEM_DEPENDENCIES_MODE`, `LIQUID_POST_INSTALLATION_COMMANDS`, `LIQUID_POST_INSTALLATION_COMMANDS_MODE`. **OpenClaw:** `ENABLE_GITHUB_COPILOT`, `ENABLE_OPENAI_CODEX`, `ENABLE_XAI_GROK`, `OPENCLAW_SYSTEM_DEPENDENCIES`, `OPENCLAW_SYSTEM_DEPENDENCIES_MODE`, `OPENCLAW_POST_INSTALLATION_COMMANDS`, `OPENCLAW_POST_INSTALLATION_COMMANDS_MODE`. **OpenCode:** the four `OPENCODE_*` keys of the same shape. **Must answer null, among the rest:** `ENABLE_ANTHROPIC_CLAUDE_CODE` (decision 11), `SYSTEM_DEPENDENCIES` (shared), `GIT_REPOSITORIES` and `PRIVACY_PROXY_ENABLE` (decision 4), and the three switches themselves. |
| **Expected** | The three sets exactly; every other field null. |
| **Dependencies** | bun. |
| **Shown able to fail** | Registered and validated: the section pattern for §8 put in place of the three keys lands `ENABLE_ANTHROPIC_CLAUDE_CODE` in the OpenClaw set. |
| **What it found** | Run on 2026-10-29 at `3ace2c5`, a clean tree, compose 5.6.1, bash 3.2: 5 / 0. |
| **Implemented by** | `tests/unit/m-cs.depends-on.test.ts`. |
| **Covers** | CS-FR12. |

### CS-20 — the stack, all off and all on

| | |
|---|---|
| **Premise** | The levels below run each part against stubs. Only the stack shows that the parts agree: compose, nginx, the start and the dashboard's view of it. |
| **Component** | The installation in the repository, through `./scripts/linux/build.sh` and `./scripts/linux/start.sh`. `.env` is captured and restored through `tests/lib/installation.ts` (A11-9). |
| **Steps** | (a) Set all three to `0`, build, start; `docker ps`; request `Host: opencode.localhost` and `Host: pgadmin.localhost` through the proxy; grep the start log. (b) Restore all three to `1`, build, start, and request again. |
| **Test data, both sides** | **Must not run in (a):** `liquid`, `nar_builder`, `openclaw-gateway`, `opencode`. **Must run in (a):** `proxy`, `bun_runner`, `postgres`, `pgadmin`. The installation's own `.env` otherwise. |
| **Expected** | (a) the four absent, the four present; `opencode.localhost` → 502 with the page; `pgadmin.localhost` → today's answer; no `::aiw-claude-auth-required::` in the start log. (b) all eight running; `opencode.localhost` answers as it does on `main`. |
| **Dependencies** | The stack tier (`--system`), docker, about two builds and two starts of time. |
| **Shown able to fail** | Run (a) on `main`: the proxy does not start, because nginx cannot resolve `opencode`. |
| **What it found** | Not run. It builds and starts the stack of this checkout, and the compose project name is fixed, so on this machine it would replace the operator's running installation; it waits for the operator's word. |
| **Implemented by** | `tests/system/m-cs.stack-switches.test.ts`. |
| **Covers** | CS-FR3 to CS-FR6, CS-NFR1. |

### CS-21 — the operator's path in the browser (manual)

| | |
|---|---|
| **Premise** | The browser path from Save to the launchpad is covered piecewise above. Its sequence is not: the done page, the button it offers, the start's banner. |
| **Component** | The dashboard from `./run.sh`, on a stack that is running. |
| **Steps** | Untick OpenClaw under *Which apps to run* and Save. Note what the done page offers, then Start. Read the launchpad. Tick OpenClaw again, Save, Start. |
| **Test data, both sides** | The installation's `.env` with `ENABLE_GITHUB_COPILOT=1`, so a hidden field exists that must survive. |
| **Expected** | After the first Save, the done page asks for no rebuild. After Start, the OpenClaw tile says *switched off*, with no pairing card and no sign-in panel. In Configuration, Copilot is hidden and the Claude field carries its note. After the second Save and Start, the tile links again and `ENABLE_GITHUB_COPILOT` is still `1` in `.env`. |
| **Dependencies** | A browser. |
| **What it found** | Not run yet. |
| **Covers** | CS-FR8 to CS-FR12. |

## 4. Existing cases that change

| Case | File | Change |
|---|---|---|
| A8-27 | `tests/unit/m-a8.built-images.test.ts` | The dashboard half read `builtImages()`' literal list as text. It calls the function with all on instead, after importing `tests/lib/dashboardfixture.ts`: `project.ts` captures `ENV_DIR` on its first load, and a unit file that loaded it first would leave every component file of a milestone run on the wrong directory. Measured: `bun test` of `m-oc.pairing-choice` and `m-a8.config-view` together fails that way on `main` already, in either order. The `update.sh` half is unchanged: the updater still removes all five |
| B5-3 | `tests/unit/m-b5.fresh-install.test.ts` | The same, for `nar-builder` |
| A0-11 | `tests/contract/m-a0.readme-promises.test.ts` | It counted only build lines at column 0 of `build.sh`, and three components' steps are indented behind their switch now. It counts indented ones too, leaves the privacy proxy out as the sixth image the README names separately, and asserts the README sentence that says the build leaves out a switched-off component's images |
| A8-38, A8-1 | `tests/component/m-a8.config-view.test.ts`, `tests/unit/m-a8.number-shown.test.ts` | The page shows eleven sections, so `[1..11]`, and *GIT INTEGRATION* is `11.`. The file check adds `# 0. WHICH APPS TO RUN` beside `# 4.` and `# 7. PRIVACY PROXY` |
| TR-4 | `tests/contract/m-tr.case-ids.test.ts` | The SP-2 record names the new mounted files, `m-cs.pairing-mount` and `m-cs.agent-notes`, nine in all, and so do `docs/TEST-SPEC-case-id-traceability.md` and `docs/TEST-SPEC-suite-preconditions.md` |
| OC-79 | `tests/contract/m-oc.env-keys-read.test.ts` | No change. The three keys are read literally in `components.sh` and `components.ts`, which is what it asks for |
| TC-822 | `scripts/tests/privacy-routing.test.sh` | No change to the case, and one to `start.sh` for it. The case stubs `lib/wait-for-operator.sh` to stop the start right after the routing check, in a tree that holds no other library, so a switch check placed before that line found no `components.sh` and exited 1. The check sits after the libraries now, still before git's pre-flight and `down.sh`. *This row said "no change" for the case and missed the order; the first run found it* |
| TC-826 | the same file | Its `COMPOSE_PROFILES=privacy-proxy,cli` activated `openclaw-cli` while `openclaw-gateway` sat behind a profile of its own, and compose refused the project. It names `openclaw,opencode` as well now. *Not listed here before the first run, which found it* |

## 5. What is deliberately not here

- **Each switch alone at the system tier.** CS-20 runs all off and all on. A single switch off is
  covered by CS-3, CS-5 and CS-8 against stubs and compose, and running three more full starts
  would cost an hour for no new failure mode.
- **The agents without Liquid.** Whether an agent copes with `nar-build`'s message, or with Liquid
  skills that have no target, is a model's behaviour, so it is not asserted (CLAUDE.md). CS-11
  fixes what the agent is told.
- **Old images left behind.** Switching off leaves an image in place by design (FEATURE §3), so no
  case asserts its removal.
- **Hermes** (decision 7).

## 6. Traceability

| Requirement | Covered by |
|---|---|
| CS-FR1 the switches | CS-1, CS-16 |
| CS-FR2 the readers agree | CS-1, CS-2 |
| CS-FR3 the build | CS-3, CS-20 |
| CS-FR4 the start | CS-4, CS-5, CS-6, CS-20 |
| CS-FR5 compose | CS-0, CS-7, CS-8 |
| CS-FR6 nginx | CS-9, CS-10, CS-20 |
| CS-FR7 nar-build | CS-11 |
| CS-FR8 needBuild | CS-12, CS-17 |
| CS-FR9 launchpad | CS-13 |
| CS-FR10 pairing | CS-14 |
| CS-FR11 sign-in routes | CS-15 |
| CS-FR12 hidden and kept | CS-16, CS-17, CS-19 |
| CS-FR13 notes | CS-18 |
| CS-FR14 documentation | A0-11 (changed) |
| CS-NFR1 nothing changes when on | CS-3, CS-5, CS-8, CS-10, CS-20, the full suite |
| CS-NFR2 a refusal costs nothing | CS-3, CS-4 |
