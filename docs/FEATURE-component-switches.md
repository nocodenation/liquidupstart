# Feature: switch Liquid, OpenClaw and OpenCode on and off

Status: **signed off on 2026-10-29, and implemented on this branch; revised on 2026-10-30 for the
review on #56.** §7 records where implementing it corrected the specification, and what the review
changed.
Branch: `feature/component-switches`
Issue: #50. The test specification is `docs/TEST-SPEC-component-switches.md`.

## 1. Purpose

Every build produces every image and every start runs every service. An operator who uses only part
of the stack still waits for all of it: on 2026-10-27 a cold `build.sh` took 32 minutes, of which
Liquid took 7:55, OpenClaw 6:32, the NAR builder 2:41 and OpenCode 2:10 (#50 has the table).
Nothing supported leaves a component out. Hermes is left out by commenting it out in five places,
and that is the pattern this feature replaces.

Three switches in `.env` decide which of the three large components exist on this installation. A
switched-off component is not built and not started, and nothing else in the stack fails or waits
because it is missing.

### 1.1 Use cases

- **UC1, the agents without Liquid.** An operator who works only with the AI agents switches Liquid
  off. The build skips `liquidupstart/liquid` and `liquidupstart/nar-builder`, the start leaves out
  `liquid` and `nar_builder`, and the launchpad shows the Liquid tile as switched off.
- **UC2, one agent.** An operator who uses OpenClaw switches OpenCode off, or the reverse. The other
  agent works as before.
- **UC3, no agent.** An operator who uses Liquid, the databases and NextCloud switches both agents
  off. The places that only matter with an agent stay visible and say that nothing will use them:
  the Git integration card and section, the privacy proxy, and the local LLM.
- **UC4, back on.** A component that is switched on again needs its image. When the image is
  missing, the dashboard asks for a build; when it is still there, a start is enough. Its state in
  `volumes/` was never touched.
- **UC5, an existing installation.** An `.env` written before this feature has none of the three
  keys, and builds and starts exactly as it did.
- **UC6, a hand-edited value.** `ENABLE_LIQUID=yes` in `.env` stops the build and the start before
  anything is stopped, and says which key holds what.
- **UC7, an image that is not there.** OpenClaw is switched on and saved while the stack runs, before
  any build; or an update has removed the images; or a dashboard tab stays open across either.
  Whatever asks for a `liquidupstart/*` image that is not built is told so, or stays silent where
  there is nothing to show. Nothing fetches such an image from a registry: they are built here, and
  no registry this stack trusts carries them.

## 2. Decisions

Decisions 1 to 4 were ruled by the project owner on 2026-10-27 and are quoted from #50. Decisions
5 to 7 were taken by the operator on 2026-10-29. Decisions 8 to 13 are taken here, against the
code, and four of them refine the issue's proposal; §6 lists those, all signed off as proposed.

1. **No Claude sign-in when OpenClaw is off.** The start does not wait for the Claude login, and the
   dashboard does not offer it. The only sign-in vehicle (`openclaw-claude` inside the OpenClaw
   image) is not there. A Claude login that already exists in `volumes/_openclaw-claude` keeps
   working for the privacy proxy's Claude route; without one, that route has no credential. This
   is accepted, and the save does not block it.
2. **The switches live in their own visible section, and OpenClaw is on by default.**
3. **A field hidden because its switch is off keeps its saved value.**
4. **Agent-dependent places are not hidden; they warn.**
5. **nginx resolves every upstream at request time** (`resolver 127.0.0.11` and variable
   upstreams), for every server block. The alternative was a renderer that drops the blocks of
   switched-off services. One mechanism covers all switches, and it repairs two faults of today's
   template along the way:
   - the privacy vhost names `privacy-proxy:8080` while `PRIVACY_PROXY_ENABLE=0` starts no such
     container;
   - an address resolved once at start goes stale when a container is recreated.

   It also leaves the template's text unchanged where `lu_proxy_identity` reads it. Dropping the
   OpenClaw blocks at render time would have removed the only `X-Forwarded-User` lines, and every
   start would then refuse at its pre-flight.
6. **All three default to `1`.** A key that is absent or empty reads as `1`, so an existing `.env`
   keeps today's behaviour.
7. **Hermes is not part of this feature.** It stays commented out, and `BACKLOG.md` gets one line.
   Behind a switch it would have to build and run again, and nobody has checked that since it was
   disabled. Deleting it is a decision of its own.
8. **The section is `# 0. WHICH APPS TO RUN`, at the top of `.env.example`.** A section inserted
   anywhere else would renumber the file's sections after it, and privacy-proxy's own contract test
   reads `# 7. PRIVACY PROXY` by its exact text. Appending it as `# 14.` would keep the numbers but
   put the first decision an operator makes at the bottom of the page. The page numbers what it
   shows (A8-38), so it displays as `1. WHICH APPS TO RUN` and the rest move down by one.
9. **A value other than `1`, `0` or empty is refused.** This follows `PRIVACY_PROXY_ROUTING`: an
   unknown value stops the build and the start before anything is stopped, names the key and the
   value, and emits `::aiw-error::` for the dashboard's banner. The dashboard writes only `0` or `1`
   (the keys are checkboxes), so such a value comes only from a hand edit.
10. **The switches are not "build-affecting".** The issue proposed adding them to
    `isBuildAffecting`, which makes the save redirect with `rebuild=1`. But turning a component off
    needs no build, and a Rebuild rebuilds every image that is on, which costs up to half an hour.
    Turning one on needs a build only when its image is missing. `stackState()` already computes
    `needBuild` from whether the images exist, so `builtImages()` takes the switches into account
    and the build is asked for exactly when it is needed (UC4). This is a computed answer instead
    of a flag.
11. **§8, OPENCLAW CONFIGURATION, is not hidden wholesale when OpenClaw is off.** The issue
    proposed hiding it. It holds four keys, and one of them is read elsewhere:
    `ENABLE_ANTHROPIC_CLAUDE_CODE` is read by OpenCode (`config/opencode/entrypoint.sh:157`) and by
    the privacy-proxy build (`config/scripts/build/privacy-proxy.sh:27`). So the three OpenClaw-only
    sign-ins (`ENABLE_GITHUB_COPILOT`, `ENABLE_OPENAI_CODEX`, `ENABLE_XAI_GROK`) are hidden while
    OpenClaw is off. `ENABLE_ANTHROPIC_CLAUDE_CODE` stays, with a note that carries decision 1.
12. **The page for a switched-off vhost names both possibilities.** At request time nginx cannot
    tell a service that is switched off from one that has not started or has crashed, and telling
    them apart would bring back the per-switch rendering decision 5 avoids. The page for the vhost
    of a switchable service says that it does not answer, and that it is either switched off under
    *Which apps to run* or not running. It is still a 502.
13. **`config/scripts/start/opencode.sh` always runs.** Despite its name, it creates the log
    directories of postgres, pgadmin_db, pgadmin, proxy and swagger, and `volumes/data`. It has
    nothing to do with OpenCode, so `ENABLE_OPENCODE=0` does not skip it. Renaming it is outside
    this feature.

Decisions 14 to 16 answer Timur's review on #56 of 2026-10-30. The operator signed them off that
day.

14. **No local-only image is ever pulled.** The six `liquidupstart/*` images are built here and exist
    on no registry this stack trusts. Nobody owns Docker Hub's namespace `liquidupstart`: every lookup
    answered 404 on 2026-10-30. So a `docker run` or `compose up` that finds no image would pull
    whatever anyone had put there and run it on the stack network. Before the switches, a running
    stack implied that the images existed. Now OpenClaw can be switched on in a saved `.env` before
    its image was ever built, and the launchpad then ran that image every fifteen seconds (the
    review's first point). So:
    - every `docker run` of the shipped scripts and the dashboard says `--pull never`;
    - every compose service of such an image says `pull_policy: never`;
    - what the dashboard runs on its own first asks whether the image is there.

    Claiming the namespace on Docker Hub would also protect installations that never get this
    change. That decision lies outside the code.
15. **`openclaw-gateway` carries the CLI's profiles as well as its own.** `docker compose run --rm
    openclaw-cli …` is the usual way to reach OpenClaw's CLI. `run` does not enable a dependency's
    profile (CS-0), so with the gateway behind `openclaw` alone it answered `no such service:
    openclaw-gateway` (the review's second point). With `cli` and `full` on the gateway as well,
    naming `openclaw-cli` enables both. Measured on 2026-10-30 with compose 5.6.1 against this file;
    CS-8 now holds it. The costs:
    - `--profile cli` or `--profile full` also starts the gateway, and nothing in the repository
      passes either;
    - with OpenClaw switched off, an operator's `docker compose run --rm openclaw-cli …` starts
      the gateway too. Its `restart: unless-stopped` keeps it running until the next start's
      `down.sh`, while the launchpad says it is switched off. That is what the command asks for,
      since the CLI runs inside the gateway's network. If the image was never built,
      `pull_policy: never` stops it at `No such image` (the local review of 2026-10-30). The alternative was a README rule to set
    `COMPOSE_PROFILES=openclaw` first, which every operator would have to remember.
16. **`PRIVACY_PROXY_ENABLE` is read by the switches' rule, by every reader.** `1` is on and anything
    else off, as before. What changes is how the value is taken from its line. Before:
    - the dashboard read the last line with double quotes removed;
    - the build and the start read the first line with both kinds of quote removed and a comment
      kept;
    - the routing check read the first line with the comment cut.

    So with `PRIVACY_PROXY_ENABLE='1'` the dashboard offered a Start that the start then refused for
    a missing image (the review's third point). CS-FR2's rule is already implemented in both
    languages and held to one table, so this key uses it: `lu_privacy_proxy_on` in the shell,
    `privacyProxyOn` in the dashboard.

## 3. What this does not cover, deliberately

- **Hermes** (decision 7).
- **Shorter builds without switches.** Keeping the BuildKit cache between rebuilds, not removing the
  previous image before each build, parallel builds, and trimming Liquid's `python3 python3-pip`
  are #50's *related, not in scope* list, and stay there.
- **Removing a switched-off component's image or state.** Switching off leaves the image and
  `volumes/` as they are. `cleanup.sh` remains the reset.
- **Live hiding in the browser.** Which fields are hidden follows the saved `.env`, so a switch
  changed on the page takes effect on the page after Save. Hiding as the box is ticked would
  change which fields a submit carries, which is the risk decision 3 exists for.
- **Dependencies between the switched components beyond those named in §4.** Liquid off leaves
  the agents' Liquid skills and `nar-build` without a target. That is documented in the README
  (CS-FR14), and `nar-build` says so when it is called (CS-FR7). The agents are not reconfigured.
- **bun_runner** stays always on. Its build takes under a minute.
- **Registering Docker Hub's `liquidupstart` namespace** (decision 14). It would also protect
  installations that never receive `--pull never`, and deciding it is the project owner's job.
- **The readers of every other key.** Decision 16 brings one more key under CS-FR2's rule.
  `BACKLOG.md`'s entry on the readers still holds for the rest of `.env`.
- **A registry prefix no pull can reach**, such as `localhost/liquidupstart/…`. It would protect
  every caller of the images at once, the ones decision 14 lists and any command copied from a
  document, with no flag to remember. The local review of 2026-10-30 proposed it. It renames
  every image, and so the build scripts, `compose.yml`, `builtImages()`, `update.sh` and the
  tests that name them, and an update would have to retag or rebuild the images of every existing
  installation. That is a change of its own. `--pull never` and CS-22 hold the line until then.
- **An image that is stale rather than missing.** The build skips a component that is off, so an
  image built before its build settings changed is still there when the component is switched on
  again, and `needBuild` sees only whether an image exists. An example: Liquid is off,
  `LIQUID_SYSTEM_DEPENDENCIES` changes and the stack is rebuilt; switched on, Liquid runs the image
  from before the change, and nothing asks for a build. The privacy proxy has the same gap today
  (the update test's second entry in `BACKLOG.md`). A label on each image carrying a hash of its build
  inputs, compared with `.env` by `stackState()`, would cover both; it is left to a change of its own,
  as the operator decided when signing off decision 10 on 2026-10-29, and `BACKLOG.md` has a line.

## 4. Requirements

**CS-FR1 — the switches.** `.env.example` gains the visible section `# 0. WHICH APPS TO RUN` at its
top, holding `ENABLE_LIQUID=1`, `ENABLE_OPENCLAW=1` and `ENABLE_OPENCODE=1`, each with help text
saying what turning it off leaves out. A key that is absent or empty reads as on, `1` as on, and
`0` as off. Quotes and a trailing comment are read by CS-FR2's rule. Any other value is refused by
CS-FR2's readers.

| Switch | Images | Services | Compose profile |
|---|---|---|---|
| `ENABLE_LIQUID` | `liquidupstart/liquid`, `liquidupstart/nar-builder` | `liquid`, `nar_builder` | `liquid` |
| `ENABLE_OPENCLAW` | `liquidupstart/openclaw` | `openclaw-gateway` (and `openclaw-cli`, which only `openclaw.sh` and an operator's `docker compose run` run) | `openclaw`; the gateway also carries `cli` and `full` (decision 15) |
| `ENABLE_OPENCODE` | `liquidupstart/opencode` | `opencode` | `opencode` |

**CS-FR2 — one reader per language, and they agree.**
- `config/scripts/start/lib/components.sh` is the shell reader, used by `build.sh` and `start.sh`.
- `dashboard/src/lib/component-switches.ts` is the dashboard's. Not `components.ts`: `src/lib/components/`
  is the directory of the Svelte components, and `$lib/components` would name both.
- On every value that CS-FR1 accepts, both give the same answer.
- **Both take a key's last occurrence**, as `parseEnvValues` does and as docker compose reads a
  dotenv file. `env_value` takes the first (`head -n1`), so the shell reader does not call it.
- **Both apply one rule to the same text, the text after `=`:** trim it; a quote, single or double,
  that closes on the line gives what lies between, whatever follows it; otherwise the value ends at
  the first blank followed by `#`; trim again. A blank is one of the six ASCII ones, named in both
  readers: bash's `[[:space:]]` depends on the locale and JavaScript's `\s` takes U+00A0, so a
  no-break space before a comment read off in the dashboard and was refused by the start. The dashboard reader does not use `parseEnvValues`'
  `value`, which removes double quotes only and cuts a comment at a space and not at a tab. The
  first version of this specification had the readers follow `env_value` and `splitValue`
  respectively, and the local review of 2026-10-29 found five lines they disagreed on: a tab before
  the comment, a blank inside the quotes on either side, a comment straight after the closing quote,
  and single quotes inside double ones. All five are in CS-2's table.
- On a refused value, the shell reader stops and the dashboard reader treats the component as on.
  The dashboard has no refusal path, the start reports the refusal in the dashboard's banner, and
  "on" is the side on which nothing is hidden.

**CS-FR3 — the build.**
- `scripts/linux/build.sh` checks the three values before building anything, and stops on a
  refused value with no image touched. `scripts/linux/rebuild.sh`, the dashboard's Rebuild, checks
  them before its `down.sh`, so a refusal there stops nothing either.
- It then runs only the build scripts of components that are on: `liquid.sh` and `nar-builder.sh`
  for Liquid, `openclaw.sh` for OpenClaw and `opencode.sh` for OpenCode. `bun-runner.sh` always
  runs, and the privacy proxy keeps its own switch.
- An existing image of a switched-off component is left in place.

**CS-FR4 — the start.** `scripts/linux/start.sh`:
- checks the three values among its pre-flights, before `down.sh`, so a refused value stops
  nothing;
- checks, also before `down.sh`, that the image of every component that is on exists, `bun-runner`'s
  and, with `PRIVACY_PROXY_ENABLE=1`, the privacy proxy's included, and stops naming the missing ones
  and asking for a build. Without it, switching a component on whose image was never built and
  pressing Restart emptied the stack, and `compose up` then tried to pull a local-only image (the
  local review of 2026-10-29);
- exports `COMPOSE_PROFILES` with the profiles of the components that are on **before the
  per-service start steps run**, because `openclaw.sh` runs `docker compose run` and
  `docker compose rm` against `openclaw-gateway`. It sets the variable rather than appending to one
  the caller's shell exports, which would otherwise start a component `.env` switches off. The
  privacy-proxy profile is appended as it is today;
- after `compose up`, asks docker whether the proxy's optional dependencies of what is on held their
  conditions -- `opencode` and `nar_builder` running, `openclaw-gateway` healthy -- and exits 1
  naming any that did not. `required: false` (CS-FR5) lets the proxy start beside a dependency that
  failed as well as beside one that is switched off: measured on compose 5.6.1, an unhealthy
  dependency with `required: false` leaves `up -d` at 0, where `required` made it refuse (the second
  local review of 2026-10-29; CS-0 records it);
- with `PRIVACY_PROXY_ENABLE=1`, creates `volumes/_openclaw-claude` with mode 700, which the proxy
  mounts and which only `openclaw.sh` created before, so docker does not create it while OpenClaw is
  off;
- with Liquid off, skips `config/scripts/start/liquid.sh`, `config/scripts/start/nar-builder.sh` and
  the keystore half of `config/scripts/start/nginx.sh` (`LIQUID_KEYSTORE_PASSWORD`, the PKCS#12
  keystore and truststore). It keeps the self-signed certificate, which every HTTPS server block
  of nginx needs;
- with OpenClaw off, skips `config/scripts/start/openclaw.sh` and `check_copilot_auth`, so the start
  never waits for a Claude, Copilot, Codex or Grok sign-in;
- runs `config/scripts/start/opencode.sh` regardless (decision 13);
- prints the URL, credential and endpoint lines of components that are on, and no line naming a
  component that is off. That reaches two lines that are not a component's own: the *Node app* line
  names the agent that can build the app, as the launchpad tile does (CS-FR13), and the warning for
  `SYSTEM_BIND_ADDRESS` off this machine leaves out the OpenClaw gateway while OpenClaw is off.

**CS-FR5 — compose.**
- `liquid` and `nar_builder` carry `profiles: ["liquid"]`, `openclaw-gateway` carries
  `profiles: ["openclaw", "cli", "full"]`, and `opencode` carries `profiles: ["opencode"]`.
- `openclaw-cli` keeps `cli` and `full`, so `docker compose run --rm openclaw-cli …` enables the
  gateway it runs inside without `COMPOSE_PROFILES` (decision 15).
- The proxy's `depends_on` entries for `opencode`, `nar_builder` and `openclaw-gateway` gain
  `required: false`, and keep their conditions: `service_started`, `service_started`,
  `service_healthy`.
- With all three profiles active, `docker compose config` yields the same services and the same
  dependency conditions as today.
- The proxy carries `dns: ["127.0.0.1"]`. nginx resolves its upstreams per request (CS-FR6), and
  docker passes a name it does not know -- a service that is switched off or not running -- to the
  host's DNS, so a device on the LAN calling itself `opencode` would receive the operator's
  requests, identity headers included. Measured on 2026-10-29: nginx proxied a request for the bare
  name `uz` to that domain's public address; with the setting, the name does not resolve, and the
  stack's own names still do. Found by the local review of that day.

  The review on #56 asked whether, since Docker 26, a rootful engine reaches a loopback `--dns`
  server from the host's network namespace instead. A resolver on the host's 127.0.0.1 would then
  answer the names this setting exists to keep unresolved. Two sources say it does not:
  - Docker's documentation, in its table of DNS flags: *"DNS requests will be forwarded from the
    container's network namespace so, for example, `--dns=127.0.0.1` refers to the container's
    own loopback address"* (docs.docker.com/engine/network). Docker 26.0's change on the host's
    loopback resolvers concerns the internal resolver's upstreams read from the host's
    `resolv.conf`, such as systemd's 127.0.0.53, on internal networks (CVE-2024-29018). It does not
    concern `--dns`.
  - A measurement on 2026-10-30 with Docker Desktop's rootful engine 29.9.2. A resolver listening
    in the engine's own namespace, on 127.0.0.1 and on all addresses, received nothing, and the
    container got SERVFAIL at once.

  A rootful engine on Linux, the case the review names, is not measured here. `BACKLOG.md` has a
  line for it.
- Every service whose image is `liquidupstart/…` declares `pull_policy: never` (CS-FR15):
  `opencode`, `bun_runner`, `nar_builder`, `liquid`, `openclaw-gateway`, `openclaw-cli` and
  `privacy-proxy`.
- `openclaw-gateway` has no `build:`. Its `build: .`, a leftover from 2026-06-06, pointed at the
  repository's root, which has no Dockerfile, so `up` with the image missing tried a build there and
  failed with `failed to read dockerfile`. `config/scripts/build/openclaw.sh` builds the image.
- `down.sh` already passes `COMPOSE_PROFILES='*'`, so a switched-off service that is still running
  is stopped by the next start.

**CS-FR6 — nginx at request time.**
- The template declares `resolver 127.0.0.11 valid=10s ipv6=off;` and every `proxy_pass` names its
  upstream through a variable, including the hundred Liquid ingress blocks that `nginx.sh`
  generates.
- Each `proxy_pass` is followed by the `proxy_redirect` nginx derived from the literal form,
  `proxy_redirect <scheme>://<host>:<port>/ /;`, because a variable turns that default off and a
  redirect naming the upstream would otherwise reach the browser as it was sent (the local review of
  2026-10-29, measured; CS-10 holds it).
- The rendered configuration passes `nginx -t` with none of the upstreams resolvable.
- The vhosts of switchable services answer a missing upstream with a 502 whose body names the
  service and says it is either switched off under *Which apps to run* in Configuration or not
  running. These are `opencode`, `nar-builder`, the three `openclaw` hosts, `liquid` and `privacy`.
  The privacy page names *Privacy proxy* instead.
- The hundred Liquid ingress vhosts, `8900.liquid.localhost` to `8999.liquid.localhost`, answer a
  missing upstream with a page of their own, because a port that no flow listens on gets the same
  502 from a running Liquid: `Liquid does not answer on port <port>: it is either switched off under
  Which apps to run in Configuration, or not running, or no flow listens on this port.` Before the
  review on #56 they answered nginx's stock 502, which the README's promise did not cover. Like
  every other block, they are rendered whatever the switch says (decision 5).
- Every vhost that answers today answers the same way with all components on.

**CS-FR7 — `nar-build` without a builder.** `config/agents/bin/nar-build.sh` reports an HTTP 502
from the proxy with its existing message that the builder did not answer, extended by the line
`It may be switched off: ENABLE_LIQUID=0 leaves the builder out.` Today a curl failure gets that
message, and a status nginx answers for an absent upstream would be printed as the builder's own
refusal. Only 502 is read this way, because the builder answers 503 and 504 itself
(`config/nar_builder/BuildServer.java:91`, `:137`, `:199`, `:202`) and never 502. A builder that
drops the connection mid-build also gets nginx's 502, and the message fits it too: the builder did
not answer, and the hint says *may*.

**CS-FR8 — the dashboard asks for a build exactly when one is needed.**
- `builtImages()` in `dashboard/src/lib/server/project.ts` takes the `.env` values and leaves out
  the images of components that are off. It names the privacy proxy's image while
  `PRIVACY_PROXY_ENABLE=1`, because the start's pre-flight requires it, and a dashboard that did not
  would offer a Start the start refuses. That key is read by CS-FR16's rule, as the start and the
  launchpad's privacy tile read it, so the dashboard asks for the image exactly when the start
  requires it.
- `builtImages()`, the image pre-flight in `start.sh` and the build steps of `build.sh` are three
  lists of the same images, kept by hand in two languages. CS-23 asks all three for every
  combination of the switches and the privacy proxy, and requires one answer.
- `stackState().needBuild` is true when an image of a component that is on is missing, as it is
  today for all five.
- The three keys are not in `isBuildAffecting` (decision 10).

**CS-FR9 — the launchpad.**
- With a component off, its tiles and extras carry the note
  `switched off — enable it under Which apps to run in Configuration` and no `url` and no
  credentials. This is the shape `privacy-tile.ts` already uses.
- Liquid owns the *Liquid.MX* tile and the *Liquid ingresses* extra.
- OpenClaw owns the *OpenClaw* tile and the *OpenClaw node bridge* and *OpenClaw MS Teams endpoint*
  extras.
- OpenCode owns the *OpenCode* tile.

**CS-FR10 — OpenClaw pairing.**
- With OpenClaw off, the launchpad does not mount `OpenClawPairing`.
- `GET /openclaw-pairing` answers `{ ok: true, disabled: true, pending: [], revoked: [] }` without
  running `config/scripts/openclaw-pairing.sh`, so a tab opened before the switch neither polls an
  image that is gone nor shows its error.
- `POST` answers 409 with `{ ok: false, message }`, the message being CS-FR11's.
- With OpenClaw on and its image not there, the pairing script runs nothing.
  `config/scripts/openclaw-pairing.sh` asks `docker image inspect` for its image first. When the
  image is missing, it exits 3 with `liquidupstart/openclaw:latest is not built here.` on stderr.
  `GET` answers that exit as it answers OpenClaw off: `disabled: true` with empty lists, which leaves
  the card silent. The dashboard takes it as that answer only when both the status and the line
  match, so an exit 3 of the CLI itself still reaches the card as an error. Timur's case is this one:
  OpenClaw switched on and saved before a build, with the card mounted from the saved `.env`.
- An engine that fails otherwise -- `docker image inspect` answering anything but `No such image`
  -- is said as it is, exit 1 with docker's words, so the card shows it rather than going silent
  (the local review of 2026-10-30).
- `POST` against an image that is not built answers 409 with `OpenClaw is switched on, but its
  image is not built yet — run Build first.`, and so does one whose image goes away between the
  listing and the press. Before, it answered that nothing was waiting for approval, which names
  the wrong cause.
- The card is still mounted by the switch alone. The script computes the image's presence at each
  poll, which covers a tab that stays open while an update removes the image; a check when the page
  loads would not. The run itself says `--pull never` (CS-FR15).

**CS-FR11 — the sign-in routes.**
- With OpenClaw off, `GET` on `/claude-auth`, `/copilot-auth`, `/codex-auth` and `/grok-auth`
  answers `{ needed: false }` without running a container, so no sign-in panel appears.
- With OpenClaw on and its image not there, `GET` answers `{ needed: false }` too, having run
  `docker image inspect` and nothing else. Only `/claude-auth` did this before. The other three
  asked `volumes/_openclaw/openclaw.json`, which survives the image, and their probe then ran the
  image. An engine that fails the inspect reads the same way: no panel is offered for a sign-in
  that could not run.
- `POST` answers 409 with `OpenClaw is switched off — turn it on under Which apps to run in
  Configuration first.`
- Each gate is written once, in `dashboard/src/lib/server/openclaw-image.ts`. `openclawRunnable()`
  answers GET's question and `refusedWhileOff()` gives POST's refusal. The four routes used to carry
  a copy each.

**CS-FR12 — the configuration page hides what has no reader, and keeps its values.**
- `dashboard/src/lib/env-meta.ts` declares which section, subheading or field depends on which
  switch. While that switch is off in the saved `.env`, the configuration view does not show it.
  The table:

  | Hidden while off | Switch |
  |---|---|
  | section *Liquid AUTHENTICATION* (`LIQUID_USERNAME`, `LIQUID_PASSWORD`, `LIQUID_KEYSTORE_PASSWORD`) | Liquid |
  | subheading *Liquid* of *PER-IMAGE OVERRIDES* | Liquid |
  | fields `ENABLE_GITHUB_COPILOT`, `ENABLE_OPENAI_CODEX`, `ENABLE_XAI_GROK` | OpenClaw |
  | subheading *OpenClaw* of *PER-IMAGE OVERRIDES* | OpenClaw |
  | subheading *OpenCode* of *PER-IMAGE OVERRIDES* | OpenCode |

- A subheading goes with its fields: one that depends on a switch that is off is not shown, and nor
  is one whose fields are all hidden, with the paragraphs under it. Section 8's *Use GitHub Copilot*
  is the second kind. A subheading with no field under it stays, so nothing shown today disappears.
- On save, a field whose switch is off **in the `.env` the page was rendered from** keeps its
  current value, whatever the form carried. A checkbox is included, since today an unsubmitted
  checkbox is written as `0`.
- A field whose switch is on takes the submitted value as before.
- The rendered state travels with the form: the page carries `__components`, the switches it was
  drawn with, and the save judges by that field, falling back to the `.env` as it is when the field
  is missing. Judging by the file alone let another tab, or a hand edit, switch OpenClaw on between
  render and save, and the hidden sign-ins were then written `0` (the local review of 2026-10-29).
- A switch is shown with the value the readers read, so an empty one, or `'1'`, is ticked. Shown
  unticked, it was saved as `0` by a Save that changed something else. A value the start refuses is
  shown ticked as well, as the dashboard reads it, and carries a note naming it, since the next Save
  writes what the box shows. Only a switch carries that note.
- A page rendered before the switches existed carries neither them nor `__components`. Its save
  keeps the three switches as the start reads them -- `'1'` is written `1`, a refused value as it
  was; written as unticked checkboxes, they would all have become `0`.
- Switching a component on and off in the same save therefore changes no hidden field.
- The section's description ends: `A change takes effect at the next Start; the launchpad shows it
  from the Save on.` The launchpad follows the saved `.env`, which is spec-chosen, so a switch saved
  off while the stack still runs takes the tile, the pairing card and the sign-ins away before the
  service goes. The review on #56 asked for the note.

**CS-FR13 — agent-dependent places warn (decision 4).** When both agents are off:
- the Git integration card, where something is declared, and the *GIT INTEGRATION* section each
  say: `OpenClaw and OpenCode are both switched off, so nothing will use these repositories.`;
- the privacy tile and the *PRIVACY PROXY* section say:
  `OpenClaw and OpenCode are both switched off; the privacy providers are offered only to them.`;
- the *SELF-HOSTED LOCAL LLM* section says:
  `OpenClaw and OpenCode are both switched off; only the privacy proxy can use the local LLM.`

Two more notes do not need both agents off:
- When OpenClaw is off, the `ENABLE_ANTHROPIC_CLAUDE_CODE` field says:
  `OpenClaw is switched off, so no Claude sign-in is offered. A login that already exists keeps
  working for the privacy proxy.`
- The *Node app* tile names the agent that can build the app: OpenClaw when it is on, otherwise
  OpenCode when it is on. With neither on, it says `no agent is switched on to build one — enable
  one under Which apps to run in Configuration`.

The privacy tile carries its note as `warning`, beside its link or its own *switched off* note, and
the repositories card as `notice`, which the launchpad's `load` adds to `gitCard()`'s data.

With either agent on, none of the both-agents-off notes appears.

**CS-FR14 — documentation.**
- `README.md` has a section on the three switches. For each, it says what turning it off leaves
  out:
  - Liquid off: `nar-build` and the Liquid skills in the agents have no target;
  - OpenClaw off: no Claude sign-in, so the privacy proxy's Claude route keeps only an existing
    login;
  - either agent off: the other one is unaffected.
- The same section says that a change to a switch takes effect at the next Start.
- The README's *Five images are built locally* sentence says that four of them are built only when
  their component is on: `liquid` and `nar-builder` with Liquid, `openclaw` and `opencode` with theirs.
- `CLAUDE.md`'s *Services & images* paragraph says the same in one line, and `docs/SPECIFICATION.md`
  §3 and §4 say which services run under the profiles and that nginx resolves per request.

**CS-FR15 — no local-only image is pulled (decision 14).**
- Every `docker run` in the shipped shell scripts is written `docker run --pull never`, with the flag
  straight after `run`. In the dashboard's code it is written `'run', '--pull', 'never'`. The fixed
  place lets a reader, and CS-22, see the flag at a glance.
- The exceptions run an image from a public registry by design, and each is named:
  - `eclipse-temurin:17-jre-jammy`, for `keytool` in `config/scripts/start/nginx.sh`;
  - `hello-world`, twice in `scripts/install/install.sh`.
- The two `ingest-pdf` build scripts under `config/openclaw/` are no exception any more. They
  defaulted to `ghcr.io/openclaw/openclaw:latest`, while their comment asks for the image the
  gateway runs. Now they take the remedy `BACKLOG.md` left for whoever next edited them: the image
  must be named, `${OPENCLAW_IMAGE:?set it to the image this stack runs, …}`, and its run says
  `--pull never` like every other. A public image is pulled by hand first, if one is wanted (the
  local reviews of 2026-10-30).
- Every service in `compose.yml` whose image is `liquidupstart/…` declares `pull_policy: never`
  (CS-FR5). Measured on 2026-10-30 with compose 5.6.1 in a throwaway project:
  - without it, `up` and `pull` both go to the registry for a missing image;
  - with it, `up` stops at `No such image` and `pull` skips the service.

  CS-0 holds both.
- The image checks before a run (CS-FR10, CS-FR11) and the start's pre-flight (CS-FR4) say what is
  missing. `--pull never` is what holds when a check is missing or loses a race.

**CS-FR16 — one rule for `PRIVACY_PROXY_ENABLE` (decision 16).**
- The shell reads it with `lu_privacy_proxy_on FILE` in `components.sh`. The function applies CS-FR2's
  rule to the key's last line and answers on only for `1`. Its callers are:
  - `build.sh`;
  - `recreate-privacy-proxy.sh`;
  - `privacy_routing_mode` in `privacy-routing.sh`.

  `openclaw.sh` and `start.sh` take the value from `privacy_routing_mode`'s answer, which is `off`
  exactly when the switch is. `start.sh` takes it once, so its image pre-flight and its profile
  cannot read two different files.
- The dashboard reads it with `privacyProxyOn(values)` in `component-switches.ts`, in `stackState()`,
  in the launchpad's privacy tile, and on the configuration page. The page shows the box ticked
  exactly when the key is on. Shown unticked, a `'1'` that the start runs was written `0` by the
  next Save, which would have turned `PRIVACY_PROXY_ROUTING=only` off without a word (the local
  review of 2026-10-30).
- The two agree on every line of CS-2's privacy table, `'1'` and a doubled line among them.

**CS-NFR1 — nothing changes with the switches on.** With the three keys absent, or all at `1`:
- `build.sh` runs the same build scripts in the same order;
- the start brings up the same containers with the same dependency conditions;
- every vhost answers as it does today;
- the full suite is as green as on `main`.

**CS-NFR2 — a refusal costs nothing.** A refused value stops the build before any image is
removed, and the start before `down.sh` (UC6).

## 5. Data structures and interfaces

**Shell, `config/scripts/start/lib/components.sh`.** It reads a key's last occurrence and applies
CS-FR2's rule to the text after `=`, as `switchValue` does in TypeScript.
It names each key literally, because OC-79 counts a key as read only where it appears as a whole
word.

| Function | Answers |
|---|---|
| `lu_component_state <env-file> <KEY>` | prints `on` or `off`, exit 0; for a refused value it prints `Error: <KEY>=<value> in .env is not a switch value; use 1 (on) or 0 (off).` and `::aiw-error::<KEY> must be 1 or 0, not '<value>'. Fix it under Which apps to run in Configuration and try again.` to stderr, exit 1 |
| `lu_components_check <env-file>` | exit 0 when all three are readable, otherwise 1 after `lu_component_state`'s messages for each refused key |
| `lu_component_on <env-file> <KEY>` | exit 0 when on, 1 when off. On a refused value it prints `lu_component_state`'s two messages and exits the calling shell with 1. Every caller runs `lu_components_check` first, and a later one that did not would otherwise read a typo as off without a word (the review on #56). Called inside `$(…)`, as `lu_component_profiles` is, the exit ends only the subshell, so the caller checks the status: `start.sh` reads the profiles once, right after the check, with `|| exit 1` |
| `lu_component_profiles <env-file>` | prints the profiles of the components that are on, comma-separated, in the order `liquid,openclaw,opencode`; empty when all are off |
| `lu_privacy_proxy_on <env-file>` | exit 0 when `PRIVACY_PROXY_ENABLE`'s value, read by the same rule, is `1`, otherwise 1 (CS-FR16) |

**TypeScript, `dashboard/src/lib/component-switches.ts`.** It is shared by server and page code, and
also holds the note texts of CS-FR9, CS-FR11 and CS-FR13 and `nodeAppNote(on)`:

```ts
export type Component = 'liquid' | 'openclaw' | 'opencode';
export const COMPONENT_KEYS: Record<Component, string> = {
  liquid: 'ENABLE_LIQUID', openclaw: 'ENABLE_OPENCLAW', opencode: 'ENABLE_OPENCODE'
};
// '0' is off; anything else, absent included, is on (CS-FR2).
export function switchValue(afterEquals: string): string;     // CS-FR2's rule
export function componentsOn(raw: (key: string) => string | undefined): Record<Component, boolean>;
export function componentsFrom(values: Map<string, { value: string; raw?: string }>): Record<Component, boolean>;
export const RENDERED_FIELD = '__components';
export function encodeComponents(on: Record<Component, boolean>): string;  // liquid=1,openclaw=0,opencode=1
export function decodeComponents(text: string | null | undefined): Record<Component, boolean> | null;
export function switchOf(key: string): Component | null;
export function privacyProxyOn(values: Map<string, { value: string; raw?: string }>): boolean;  // CS-FR16
```

**TypeScript, `dashboard/src/lib/server/openclaw-image.ts`.** It serves the four sign-in routes
(CS-FR11, CS-FR15):

```ts
export function openclawImage(): string;   // OPENCLAW_IMAGE, or liquidupstart/openclaw:latest; read per call
export async function openclawRunnable(values: Map<string, { value: string; raw?: string }>): Promise<boolean>;
                                            // OpenClaw on, and `docker image inspect` finds the image
export function refusedWhileOff(dir: string): Response | null;   // CS-FR11's 409 while off, else null
```

**`builtImages(on: Record<Component, boolean>, privacyProxy = false): string[]`.** It returns
`liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`, minus the images of the
components that are off, and `liquidupstart/privacy-proxy:latest` after them while `privacyProxy`
is true (CS-FR8). `stackState()` passes `installedComponents()`, which reads `.env` through
`envValues()`. `componentsAt(dir = envDir())` reads the `.env` of the directory asked for at the
moment of the call, for the routes and the pairing module, which must not depend on the directory
`project.ts` captured on its first load; `pairing.ts` exports `openclawOn()` on top of it, because
OC-72 maps `$lib/server/pairing` alone and the route can import nothing else.

**Launchpad data.** `load` in `dashboard/src/routes/+page.server.ts` adds `components:
Record<Component, boolean>` to what it returns, and `+page.svelte` mounts `OpenClawPairing` only
when `components.openclaw` is true.

**Pairing route.** `GET /openclaw-pairing` adds `disabled?: true` to its body. `pendingRequests()`
in `pairing.ts` returns it with empty lists when `openclaw-pairing.sh` exits 3 and its stderr holds
`is not built here.` (CS-FR10). The sign-in routes call `openclawRunnable(env)` in GET, after their
own cheap gates and before any probe, and `refusedWhileOff(ENV_DIR)` after the origin check in POST.

**`config/scripts/openclaw-pairing.sh`.** Exit 3 means that the image is not built. Exit 1 with
docker's words means that `docker image inspect` failed otherwise. The script's other exits are
unchanged: 2 for a usage error, and the CLI's own status otherwise. `pairing.ts` exports
`OPENCLAW_NOT_BUILT`, the text of the route's 409. `approve()` answers the same exit and line with
`{ ok: false, status: 409, message: OPENCLAW_NOT_BUILT }`, beside its 200, 400 and 502.

**Configuration metadata, `env-meta.ts`.**

```ts
export const SECTION_DEPENDS_ON: [RegExp, Component][];     // matched against the full title
export const SUBHEADING_DEPENDS_ON: [RegExp, Component][];  // matched against the subheading text
export const FIELD_DEPENDS_ON: Record<string, Component>;   // by key
export function dependsOn(sectionTitle: string, subheading: string | null, key: string): Component | null;
export function dependentFields(sections: Section[]): Map<string, Component>;  // key → its switch
export function visibleItems(sectionTitle: string, items: SectionItem[], on: Record<Component, boolean>): SectionItem[];
export function sectionNote(title: string, on: Record<Component, boolean>): string;
export function fieldNote(key: string, on: Record<Component, boolean>): string;
```

`load` drops a section `dependsOn` names while its component is off and passes every other section's
items through `visibleItems`, and `actions.save` keeps the current value of every field
`dependentFields` names in the same case. The notes of CS-FR13 are computed in `load` as `note` on a
section or a field, and the view renders them in the `.autogen-note` style.

**Compose profiles.** `liquid`, `openclaw` and `opencode`, beside the existing `privacy-proxy`,
`cli` and `full`. `openclaw-gateway` carries `openclaw`, `cli` and `full`.

**nginx variables.** Each server block sets `$lu_upstream` to its upstream's `host:port` and passes
to `http://$lu_upstream` (or `https://` for Liquid). The switchable vhosts declare
`error_page 502 @lu_unavailable;` and a named location that returns the CS-FR6 text as
`text/plain`, the hundred ingress blocks included. They use 502 alone because a 504 that nginx generates is a timeout, which this page
would misname. And since `proxy_intercept_errors` stays off, an upstream's own 502 passes through
unchanged.

## 6. Signed off

The decisions here that change #50's proposal or fill a gap in it. The operator signed off all five
on 2026-10-29, as recommended, with the third carrying the limit recorded in §3:

1. **Decision 8:** the section is file section `0`, so no existing file number moves.
2. **Decision 9:** a value other than `1`, `0` or empty is refused.
3. **Decision 10:** the switches are not build-affecting; `needBuild` is computed.
4. **Decision 11:** §8 is hidden field by field, because `ENABLE_ANTHROPIC_CLAUDE_CODE` is read by
   OpenCode and the privacy proxy.
5. **Decision 12:** the 502 page names both possibilities, where my one-line description of the
   nginx option on 2026-10-29 promised a page saying *switched off*.

And one measurement that has to come first, because the design leans on it. Today's README, the
agents' skills and `nar_builder`'s messages tell the operator to run `docker compose logs liquid`,
`docker compose exec nar_builder …` or `docker compose restart liquid`, and so does the system tier
(`tests/lib/stack.ts`, `narfixture.ts`). Compose documents that a service which is named on the
command line has its profiles enabled for that call. If compose 5.6.1 does that for `logs`, `exec`,
`restart` and `start`, those commands keep working without `COMPOSE_PROFILES`. If it does not,
profiles are the wrong vehicle and this specification comes back before any code is written. The
measurement is **CS-0** in the test specification.

**On 2026-10-30, for the review on #56**, the operator signed off decisions 14 to 16, as recommended,
together with the scope of the answer:
- Timur's three points before the merge;
- of his seven further points:
  - the ingress page (CS-FR6);
  - fixtures in place of the history that two tests read;
  - a wider CS-20, run against the stack;
  - the note on the next Start (CS-FR12);
  - CS-23 for the image lists and one sign-in gate (CS-FR11);
  - `lu_component_on` failing loudly (§5).

The `dns` point is answered under CS-FR5 and not changed.

**Measured on 2026-10-29, compose 5.6.1: it does.** `logs`, `exec`, `restart`, `stop`, `start` and
`ps` naming a profiled service all succeeded without `COMPOSE_PROFILES`. `required: false` let a
service start with its dependency profiled out, and the dependency's `service_healthy` condition
held when it was present. `docker compose run` does **not** enable a dependency's profile (`no such
service`). That is why CS-FR4 exports the profiles before the start steps.

## 7. Process log

- **2026-10-27** — #50 opened by Timur, with decisions 1 to 4 ruled by the project owner.
- **2026-10-29** — the operator chose request-time resolution, `1` for all three and Hermes out of
  scope (decisions 5 to 7), and asked for the specification first. It was written against the code:
  three read-only sweeps of the dashboard, the stack scripts and the test conventions, and the
  carrying facts were checked by hand:
  - `ENABLE_ANTHROPIC_CLAUDE_CODE`'s readers;
  - `opencode.sh`'s content;
  - `lu_proxy_identity`'s input;
  - `submittedForm`'s treatment of an unshown checkbox;
  - the order of `openclaw.sh` and the profile export in `start.sh`.
- **2026-10-29** — the operator signed off the five points of §6 as recommended; the third with the
  limit for a stale image, now in §3. Implementing it corrected the specification in six places, each
  above:
  - the dashboard reader is `component-switches.ts`, because `$lib/components` is a directory;
  - the pairing body carries `revoked`, which is what the route returns, not `others`;
  - CS-FR14 said three images follow a switch, and four do;
  - CS-FR4's *no line naming a component that is off* reaches the *Node app* line and the
    `SYSTEM_BIND_ADDRESS` warning, which named OpenClaw;
  - CS-FR12 needed a rule for subheadings, or *Use GitHub Copilot* would have stood over nothing;
  - `componentsAt()` and `openclawOn()` exist because `project.ts` freezes its directory on first
    load, which a route test cannot steer.

  And it measured the property decision 5 rests on before writing it down: nginx reaches an upstream
  named `bun_runner` through docker's DNS at request time, underscore and all. CS-10 holds it.
- **2026-10-29** — the local review before the first commit found fourteen points, and the ones that
  hold changed the specification: the proxy's `dns` setting (CS-FR5), `proxy_redirect` (CS-FR6), the
  image pre-flight, the profiles set rather than appended and the Claude login directory (CS-FR4),
  one reader rule for both readers (CS-FR2), and the rendered state and the shown value of a switch
  (CS-FR12). Each is above, with the measurement where one was taken. Left as they are: the
  dependencies matched by heading text, which CS-19 pins over the real file so that a rename shows,
  and `nar-build`'s 502 for a builder that dropped the connection (CS-FR7).
- **2026-10-29** — a second local review over those repairs found ten more, and six held: `required:
  false` hid an unhealthy gateway from the start (CS-FR4's check after `up`, measured); an old
  configuration page would have switched everything off (CS-FR12); a refused value was undone by the
  next Save without a word (CS-FR12's note); Rebuild refused only after its `down.sh` (CS-FR3); the
  privacy proxy's image was required by the start and not asked for by the dashboard (CS-FR8, which
  also answers half of the update test's second `BACKLOG.md` entry); and a line ending in a lone `\r`
  was skipped by the dashboard's line pattern (CS-FR2). Left as they are: the seven copies of the 502
  page and of the sign-in guard, which CS-9 and CS-15 hold to one text each; and one list of required
  images computed from compose, which would replace three hand-kept ones and is a change of its own.
- **2026-10-29** — a third, narrow review over the second round found three more in it, all held: the
  refusal note was written for every field and printed a password field's value in the clear; the
  dashboard read `PRIVACY_PROXY_ENABLE` otherwise than the scripts that act on it; and an old page
  kept a switch in a form that, re-rendered, the start refused. Each is above, and each has a case
  that is red without its repair.
- **2026-10-29** — a fourth pass over those three found the dashboard reading `PRIVACY_PROXY_ENABLE`
  two ways in one response, because the third round had copied the scripts' rule for it alone. That
  was taken back: the dashboard reads the key one way, and the difference from the scripts is a
  sentence in `BACKLOG.md`'s entry on the readers. It also found the no-break space (CS-FR2) and two
  untested branches of the old-page save, now CS-17 (j) and (k). Left open, with its reason: one
  hidden list of the checkboxes a page drew would replace the save's three special cases, the
  switches, the hidden fields and the old page, with one rule, and is a change of its own.
- **2026-10-30** — Timur's review on #56 asked for changes. He confirmed that the two readers agree
  on 22 more lines of his own, and found three points that block the merge:
  - the pairing card and three sign-in probes could pull `liquidupstart/openclaw:latest` from Docker
    Hub (decision 14, CS-FR10, CS-FR11, CS-FR15);
  - `docker compose run --rm openclaw-cli` failed with OpenClaw on (decision 15);
  - `PRIVACY_PROXY_ENABLE` was read two ways (decision 16, CS-FR16).

  Each was measured before it was written down. The namespace answered 404. `pull_policy: never`
  and `run` were tried in a throwaway project, and the second in `--dry-run` against this file.
  Nothing was created.

  Of his further points:
  - **Taken:**
    - the ingress vhosts' missing page (CS-FR6);
    - the tests that read `da4e2d1` with `git show`, which fail in a shallow clone or the release
      archive; they read fixtures now;
    - CS-20's narrow live coverage;
    - the note on the next Start (CS-FR12);
    - the duplicated sign-in gate (CS-FR11) and the three image lists, held to one answer by CS-23
      rather than merged, since they are in two languages;
    - `lu_component_on` reading a refused value as off.
  - **Answered:**
    - `dns`: the documentation and a measurement on Docker Desktop, with rootful Linux left as a
      `BACKLOG.md` line (CS-FR5);
    - the ingress blocks rendered with Liquid off (decision 5);
    - the seven copies of `@lu_unavailable`, which CS-9 holds to one text per service.

  Measuring for the first point found one more: `openclaw-gateway`'s `build: .` (CS-FR5).
- **2026-10-30** — the local review before the commit found twelve points over the answer. These
  held and changed the specification:
  - the configuration page still showed `PRIVACY_PROXY_ENABLE` by the old reading, so the next
    Save would undo what decision 16 made every other reader agree on (CS-FR16);
  - the `ingest-pdf` builds could be pointed at the stack's own image without the flag (CS-FR15);
  - the pairing script read any failure of the engine as an image that is not built, and an
    approval against such an image was told that nothing was waiting (CS-FR10);
  - `start.sh` read the profiles in `$(…)`, where `lu_component_on`'s exit ends only the
    subshell, and read the privacy switch three times (§5, CS-FR16);
  - decision 15's cost for an operator's `run` with OpenClaw off was not recorded;
  - two blocks of the test specification described a mutation that had moved, and a case without
    its negative row.

  The registry prefix is recorded in §3 and not taken. Two points were not taken, with reasons:
  - having `pendingRequests()` ask `docker image inspect` itself, in place of the script's exit
    3. OC-72 and CS-14 call the route in-process with no docker stub, so their cases would then
    depend on the images of the machine they run on. The script's line and the dashboard's
    reading of it are each pinned by a test (CS-14);
  - reusing `dockerExitCode()` from `project.ts` in `openclaw-image.ts`. It spawns in the
    directory `project.ts` froze on its first load, which under `bun test` belongs to whichever
    file loaded it first (`envDir()`'s comment). A probe that needs no directory should not
    inherit that.
- **2026-10-30** — a second, narrow pass over those repairs found fourteen more. These held:
  - the `ingest-pdf` builds missed the local image when it was spelled with a registry, such as
    `docker.io/liquidupstart/openclaw:latest`, and CS-22 checked them as text only;
  - an approval whose image went away after the listing still answered 502 (CS-FR10);
  - a CS-17 row claimed a mutation registered for another file;
  - overview rows were missing for four tests that exist, and traceability for CS-16 and CS-17;
  - the pairing script's header misstated its exits;
  - CS-FR16 named `start.sh` as a caller it is not, and §5 gave `builtImages()` without its
    second argument;
  - the not-built row of CS-14 wrote its marker and never read it.

  Recorded in `BACKLOG.md`'s entry on the readers, since it holds on `main` too: the
  configuration page shows every other checkbox by `parseEnvValues`' value, so a hand-quoted
  `'1'` there is shown unticked and saved as `0`.

  Not taken, with reasons:
  - exporting the routing answer to the start steps. Every step reads `.env` again for its own
    keys, so a file changed during a start reaches all of them; the one reading made once here is
    the one the pre-flight and the profile share;
  - building the profiles from the three flags instead of reading them a second time. One
    function computes them and CS-1 holds it, the second read follows the first within
    microseconds, and `|| exit 1` stops the start on a disagreement rather than running on;
  - sourcing `components.sh` once in `start.sh`. `privacy-routing.sh` loads it too, and the switch
    check names its own dependency rather than resting on another library's;
  - classifying the run's own `No such image` in place of the inspect before it. The run's stderr
    carries the CLI's lines, which the dashboard reads, and the inspect costs one local call per
    poll.
- **2026-10-30** — a third pass over those repairs found fourteen points, and these held:
  - the `ingest-pdf` test read only the first argument after `run`, so `--pull always` passed;
  - the pattern that recognised the local image was a special case copied into two scripts.

    `BACKLOG.md`'s remedy for them, left for whoever next edited them, removes both: the image is
    required and never pulled (CS-FR15);
  - the approval's exit 3 had no counterpart, and its race row could not show that `approve()`
    answered; the stub now leaves a marker on `approve`, and an exit 3 without the line answers
    502 with the CLI's words;
  - CS-22's and CS-14's blocks no longer described their own steps, data or mutations, CS-22's
    overview merged rows, CS-16's data named values only in its expectation, and §5 left out
    `approve()`'s 409;
  - the second pass's count did not match its list, which is complete now;
  - the test ran each build through its exec bit, which an archive without modes loses; it runs
    them through `bash` now.

  Every point held. The pattern's reach beyond Docker Hub, the last of them, went with the
  pattern.
