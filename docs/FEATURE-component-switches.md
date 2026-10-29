# Feature: switch Liquid, OpenClaw and OpenCode on and off

Status: **signed off on 2026-10-29, and implemented on this branch.** §7 records where implementing it
corrected the specification.
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
| `ENABLE_OPENCLAW` | `liquidupstart/openclaw` | `openclaw-gateway` (and `openclaw-cli`, which only `openclaw.sh` runs) | `openclaw` |
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
  `profiles: ["openclaw"]`, and `opencode` carries `profiles: ["opencode"]`.
- `openclaw-cli` keeps `cli` and `full`.
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
  would offer a Start the start refuses. That key is read as the launchpad's privacy tile reads it,
  so one page gives one answer. `build.sh` and `start.sh` read it by a rule of their own, which
  differs for a hand-quoted or doubled line; `BACKLOG.md`'s entry on the readers has it.
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

**CS-FR11 — the sign-in routes.**
- With OpenClaw off, `GET` on `/claude-auth`, `/copilot-auth`, `/codex-auth` and `/grok-auth`
  answers `{ needed: false }` without running a container, so no sign-in panel appears.
- `POST` answers 409 with `OpenClaw is switched off — turn it on under Which apps to run in
  Configuration first.`

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
- The README's *Five images are built locally* sentence says that four of them are built only when
  their component is on: `liquid` and `nar-builder` with Liquid, `openclaw` and `opencode` with theirs.
- `CLAUDE.md`'s *Services & images* paragraph says the same in one line, and `docs/SPECIFICATION.md`
  §3 and §4 say which services run under the profiles and that nginx resolves per request.

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
| `lu_component_on <env-file> <KEY>` | exit 0 when on, 1 when off; only after `lu_components_check` |
| `lu_component_profiles <env-file>` | prints the profiles of the components that are on, comma-separated, in the order `liquid,openclaw,opencode`; empty when all are off |

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
```

**`builtImages(on: Record<Component, boolean>): string[]`.** It returns
`liquidupstart/{opencode,bun-runner,liquid,openclaw,nar-builder}:latest`, minus the images of the
components that are off. `stackState()` passes `installedComponents()`, which reads `.env` through
`envValues()`. `componentsAt(dir = envDir())` reads the `.env` of the directory asked for at the
moment of the call, for the routes and the pairing module, which must not depend on the directory
`project.ts` captured on its first load; `pairing.ts` exports `openclawOn()` on top of it, because
OC-72 maps `$lib/server/pairing` alone and the route can import nothing else.

**Launchpad data.** `load` in `dashboard/src/routes/+page.server.ts` adds `components:
Record<Component, boolean>` to what it returns, and `+page.svelte` mounts `OpenClawPairing` only
when `components.openclaw` is true.

**Pairing route.** `GET /openclaw-pairing` adds `disabled?: true` to its body. The sign-in routes
call `componentsAt(ENV_DIR)` first, in GET and after the origin check in POST.

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
`cli` and `full`.

**nginx variables.** Each server block sets `$lu_upstream` to its upstream's `host:port` and passes
to `http://$lu_upstream` (or `https://` for Liquid). The switchable vhosts declare
`error_page 502 @lu_unavailable;` and a named location that returns the CS-FR6 text as
`text/plain`. They use 502 alone because a 504 that nginx generates is a timeout, which this page
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
