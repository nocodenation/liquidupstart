# Feature: an image records the inputs it was built from, and a start says when they changed

Status: **specified on 2026-11-04, not implemented; revised the same day for the operator's answers
to §7 and again for the independent review of `4468779`.** Written against the code of `main` at
`da9a85c`, with the measurements in §8 taken that day. Nothing in the product changes until the
operator signs this off.
Branch: `fix/issue-34-image-inputs`
Issue: #34, and the general class it was folded into (the comment on #34 of 2026-10-16). The test
specification is `docs/TEST-SPEC-image-inputs.md`.

## 1. Purpose

Six product images are built locally and tagged `:latest`, the dashboard builds a seventh for itself
(the toolbox), and nothing compares a built image with the checkout that should have built it. An
operator who updates the checkout and starts without building runs the old image, and the only sign
is whatever the old image does differently. The class has struck at least five times:

- 2026-09-07, `liquidupstart/openclaw:latest` built from another branch, a start that hung
  (`BACKLOG.md`, *A locally built image can belong to another branch*);
- the same day, `liquidupstart/opencode:latest` without `ssh`, A3-7 red against it;
- 2026-10-07, four M-B5 files green against a `nar-builder` image two days older than the user they
  were testing (`tests/lib/builderimage.ts`, its opening comment);
- 2026-10-16, the case #34 names: a `nar-builder` image from before #25 runs its baked-in `build.sh`
  with `-Dmaven.repo.local=/m2`, and with the compose mount gone the container's own `/m2` becomes a
  cache shared across builds -- the old behaviour, without the directory that made it visible;
- the privacy proxy, whose image `build.sh` skips while it is off, so turning it on runs whatever is
  there (`BACKLOG.md`, *Turning the privacy proxy on asks for no build*), and #50's three cousins of
  that (`docs/FEATURE-component-switches.md` §3).

**Measured on this host on 2026-11-04 (§8.7):** `liquidupstart/nar-builder:latest`, built on
2026-10-27, has the seed #34's probe would look for, and is stale all the same: its `build.sh`,
`BuildServer.java` and `entrypoint.sh` differ from the tree, there is no `builder2` user, and
`/home/builder` is `builder 750` where the tree builds `root 555`. #31's isolation is silently
missing from it. A seed-only probe would print nothing. `liquidupstart/opencode:latest`'s entrypoint
differs from the tree too. No image on the machine carries a label of this project's.

So the answer is the general one: every locally built image carries a label holding a digest of the
inputs that reach it, the start computes the same digest from the checkout and says, per image, when
the two differ, and the dashboard says the same on its card. That is a computed answer in place
of a probe per symptom, which is what the comment on #34 asked for and what `CLAUDE.md` prefers.

### 1.1 Use cases

- **UC1, update and start.** The operator pulls the checkout, or runs the installer's update, and
  starts without building. For every image whose inputs changed, the start prints one line naming
  what the image was built from and the rebuild command, and then starts as before. Nothing is
  refused: the operator chose to start, and an old image is a working stack in most cases.
- **UC2, switching branches.** The operator checks out another branch whose templates or
  entrypoints differ and starts. Same as UC1: the lines name the branch's checkout the images came
  from.
- **UC3, a pre-#25 image.** A `nar-builder` image built before this feature carries no label. The
  start says it was built before images recorded their inputs, and that a rebuild makes it
  checkable. This is #34's case; the old `/m2` behaviour is one of the things such an image may do.
- **UC4, a dashboard start.** The launchpad's cards, which today say that images do not exist, also
  say which images were built from other inputs and which carry no record, and Start stays enabled:
  the card is the CLI's notice in the browser. The toolbox image, which the dashboard builds for
  itself, is rebuilt by the dashboard when it is stale, as it is today when it is missing.
- **UC5, nothing changed.** An image built from this checkout with this `.env` is passed over in
  silence, by the start and by the dashboard. This is #34's positive acceptance item, and the one
  that carries the weight: a notice that fires on every start is ignored on every start.
- **UC6, a build setting changes while the component is off.** Liquid is off,
  `LIQUID_SYSTEM_DEPENDENCIES` changes, the stack is rebuilt, Liquid is switched on. The image from
  before the change is there and is stale, and the start and the dashboard both say so (§3 of the
  switches feature, now covered).

## 2. Decisions

Decisions 1 to 8 were taken by the operator on 2026-11-04, as recommended, and decision 4 was
changed by the operator later that day, answering §7. Decisions 9 to 17 are taken here, against the
code, and §6 lists the ones that refine what was decided; 15 and 17 are the operator's own answers,
to §7 and to the review of `4468779`.

1. **One change.** `BACKLOG.md`'s entry *A locally built image can belong to another branch* is
   re-opened, and #34, §3 of `docs/FEATURE-component-switches.md` and **the inputs half** of
   *Turning the privacy proxy on asks for no build* are answered together. That entry has two
   halves, and only one is this feature's: an image `build.sh` skipped while the proxy was off and
   whose inputs (`ENABLE_ANTHROPIC_CLAUDE_CODE`, the rendered Dockerfile) changed since, which the
   digest covers; and an image whose released base, `ghcr.io/nocodenation/privacy-proxy:latest`,
   moved underneath it -- 0.1.2 refusing 0.8.0's `.env` on that day -- which is drift of the base
   image (§3) and is **not** covered. The operator decided on 2026-11-04, answering the review of
   `4468779`, that the base-drift half stays open in `BACKLOG.md` and that no label of the base
   image's identity is added here. The re-opened entry's premise was wrong and is corrected there:
   `.liquidupstart-version` and `.liquidupstart-manifest` are the installer's files (`install.sh`,
   `update.sh`, `install-local.sh` write them), absent from a plain checkout, and neither says
   anything about an image. `run.sh` falls back to `checkout-<sha>` for the same reason. No product
   image carries a label of ours; local images do inherit upstream labels, for example
   `org.opencontainers.image.revision` on `liquidupstart/openclaw:latest` from OpenClaw itself
   (§8.3), so this feature uses a namespace of its own.
2. **What "stale" means: a digest of the inputs that reach the image**, and nothing else. The
   rendered Dockerfile as `docker build` receives it, the `--build-arg` values, and the bytes of
   every file a `COPY` or `ADD` names. Not the whole build context: `config/scripts/start/openclaw.sh`
   writes `config/openclaw/.env` into OpenClaw's context on every start, and the skills, plugins and
   tools directories under the agents' contexts are bind-mounted into the running containers rather
   than copied in, so a whole-context digest would change on every start and on every skill edit
   while the image would not. A digest that flaps is worse than none: a rebuild costs up to half an
   hour (`docs/FEATURE-component-switches.md` §1), and a notice that asks for one without cause is
   ignored the next time it has cause. The digest is defined to the byte in §4, IM-FR1.
3. **A notice, not a refusal, for every image, with no exception for `nar-builder`.** One line per
   image, naming what the image was built from and `./scripts/linux/build.sh`. It runs in
   `start.sh`'s pre-flight, after the missing-image check (CS-4) and before `down.sh`. #34 proposed
   a notice, and the stale-directory notice in `config/scripts/start/nar-builder.sh` is the shape.
4. **The dashboard reports a stale image and keeps Start enabled.** As first decided on
   2026-11-04, `stackState().needBuild` was to become *missing or stale*. **Changed by the operator
   the same day, answering this specification's §7:** `needBuild` stays true for missing images
   only, as it is today, and a stale or unlabelled image is a notice on the launchpad card, through
   `images.stale`, `images.unlabelled` and `imagesNote()`, which does not disable Start. The reason:
   every existing installation is unlabelled after the upgrade, so `needBuild` would have blocked
   Start everywhere until a rebuild of up to half an hour; and the CLI only notices (decision 3),
   so the two paths now agree. The digest must still not flap (decision 2): a notice that fires
   without cause is ignored when it has cause.
5. **The images covered are `build.sh`'s set plus the toolbox.** `liquidupstart/{opencode,bun-runner,
   nar-builder,liquid,openclaw,privacy-proxy}:latest`, each when its switch is on, and
   `liquidupstart/toolbox:latest`, which the dashboard builds for its own Build and Start buttons.
   **The dashboard image is excluded.** Its Dockerfile says `COPY . .` over the whole `dashboard/`
   directory -- `node_modules`, `.svelte-kit` and `build` included, whatever `.dockerignore` leaves
   -- so no digest of named sources describes it, and it needs none: `run.sh` runs `docker build`
   for it on every launch, so it follows its inputs by construction.
6. **The notice is plain log text.** No new `::aiw-*::` marker; the dashboard parses only
   `::aiw-error::` (`TaskRunner.svelte`), and that raises an error banner, which a notice is not.
7. **A single image list is out of scope.** The images are named by hand in four places
   (`builtImages()`, `start.sh`'s `LU_IMAGES`, `build.sh`, `update.sh`'s `BUILT_IMAGES`), CS-23
   holds three of them to one answer, and this feature adds no fifth list: the build script of an
   image is found from the image's name (decision 11).
8. **#34's own seed probe is dropped.** The general check covers it: a pre-#25 image is unlabelled
   and is named at every start. `B1-9` and `B7-5` keep their `SEEDED_IMAGE` skips, because they
   drive the running stack and skip for their own reason. #34 is closed by hand once the
   implementation lands.
9. **The digest is computed by the build script itself, on the path the build takes.** Each build
   script gains the argument `--inputs`: it reads `.env` as it does for a build, renders the
   Dockerfile, applies its own edits (`openclaw.sh`'s `sed` for `ENABLE_ANTHROPIC_CLAUDE_CODE`),
   assembles its build arguments, prints the digest and exits without touching docker. A build runs
   the same lines and then builds with the label. So the start, the dashboard and the build cannot
   disagree about what the inputs are, because there is one place that knows. The alternative, a
   second implementation of the rendering in TypeScript for the dashboard, is where divergence
   would start: the two build scripts that read `.env` already read it differently (`openclaw.sh`
   sources it, the rest use `load_env_file`; decision 17 ends that), and a port would have to
   reproduce both. Under `--inputs`, **stdout is the digest and nothing else**: the scripts print
   progress lines today (`openclaw.sh:54`, `privacy-proxy.sh:29` and `:48`) and the renderer's
   `print_warning` writes to stderr, so a caller that read "the first line" would read a progress
   line. IM-FR4 puts every other line on stderr.
10. **The digest's function is shared, in `config/scripts/build/lib/image-inputs.sh`.** The build
    scripts, `start.sh` and the test harness source it. The dashboard runs the build scripts with
    `--inputs` in its own container, which carries bash and the project at its host path (§8.5
    measured that the rendering gives the same bytes there as on the host and in the toolbox).
11. **The build script of `liquidupstart/<name>:latest` is `config/scripts/build/<name>.sh`.** That
    holds for all seven images once the toolbox has a script of its own (decision 12), so the start
    and the dashboard compute the name and keep no list.
12. **The toolbox gets a build script, `config/scripts/build/toolbox.sh`.** It is built today by
    `dashboard/src/routes/run/+server.ts` from an argv assembled there, with a buildx fallback. A
    script builds it with the labels and answers `--inputs` like the others, and the route runs the
    script in place of its argv, when the image is missing or stale. `build.sh` does not run it: the
    toolbox is the dashboard's, and a CLI installation never needs it. The buildx fallback goes: the
    dashboard image installs `docker-cli-buildx`, and `docker build` on 29.9.2 keeps a label under
    BuildKit and under the classic builder alike (§8.2, both measured). What the script does
    differently from `bun-runner.sh`: **it does not remove the old image before building.** The
    other scripts run `docker image rm "$IMAGE"` first; the toolbox is what runs every dashboard
    task, and a build that fails offline (its `apt-get` reaches the network) would otherwise leave
    the dashboard with no way to run anything. `docker build -t` moves the tag only on success, so
    the working image stays until a new one exists, and the old one becomes dangling. **The rebuild
    stays automatic after decision 4 changed**, and this is why: the toolbox is the dashboard's own
    tool, not a service the operator chose, and the dashboard already builds it without asking when
    it is missing. A notice in its place would leave the operator running `start.sh` inside a
    toolbox with the wrong userland -- the failure A8-19 was written against -- with no way to
    rebuild it but the dashboard itself, since no shipped script builds it. Its cost is minutes,
    streamed into the same log the task writes, and it carries no state. Decision 4 concerns the
    product images, which Start runs as they are; the toolbox is what runs Start. **So the first
    task after the upgrade, Stop included, rebuilds the toolbox once**, because every existing
    toolbox is unlabelled; the line in the stream says why.
13. **A digest that cannot be computed fails the build and is noticed by the start.** A `COPY` form
    the reader does not understand (§4, IM-FR1) is a defect of the tree. The build stops with
    `::aiw-error::` before it removes the old image, because building an unlabelled image would
    recreate the state this feature exists against. The start, which refuses nothing here, prints
    that the image could not be checked and goes on; the dashboard logs it and puts the image in
    none of its three lists, because a card line about a defect of the tree would be wrong at every
    load and a rebuild could not clear it. **Docker's answer comes first:** whether an image is
    missing is decided by `docker image inspect` alone, and a script that cannot answer never hides
    a missing image. The real case: `PRIVACY_PROXY_DEV_SRC` naming a directory outside the project
    is mounted into the toolbox at its host path and into the dashboard container not at all
    (`run.sh:150` mounts the project directory only), so `privacy-proxy.sh` exits 1 in the dashboard
    at its *has no Dockerfile* check (`:44-46`) while the image may well be missing.
14. **The source label is display only, and `-dirty` stays in it.** `io.liquidupstart.source`
    names where the image came from in the words `run.sh --version` uses, so the notice can say
    *was built from checkout-5bc0468-dirty*. It does not enter the digest and is never compared:
    two checkouts with the same inputs build the same image, and the digest says so where the
    source would not. The operator decided on 2026-11-04 that the `-dirty` suffix stays and appears
    in the notice as the version line prints it.
15. **`config/opencode/Dockerfile` is deleted as part of the implementation.** It sits beside
    `config/opencode/templates/Dockerfile`, which `opencode.sh` renders; no script reads the
    un-templated one, it was last touched in `30e7f11`, and it differs from the template
    (`openssh-client` and the `__SYSTEM_DEPENDENCIES__` token are missing). A second Dockerfile in a
    build context is a second thing a reader can take for the inputs. The operator decided the
    deletion on 2026-11-04; IM-2's tree row asserts its absence.
16. **`.env` alone decides the render.** The build scripts read their settings as
    `${SYSTEM_DEPENDENCIES:-}` after `load_env_file`, so a key absent from `.env` takes whatever
    the caller's environment exports, and `PRIVACY_PROXY_SYSTEM_DEPENDENCIES`, which
    `resolve_image_settings PRIVACY_PROXY` reads, is in no `.env.example` at all. The host, the
    toolbox and the dashboard container have different environments, so the same `.env` could give
    three digests, against IM-NFR2. Each build script therefore unsets the build-affecting keys
    (IM-FR3 lists them) before it loads `.env`, in both modes. `CLAUDE.md` says `.env` is the single
    configuration source; this makes it so for the build.
17. **`openclaw.sh` reads `.env` with `load_env_file`, as `opencode.sh` does.** Decided by the
    operator on 2026-11-04, answering the review of `4468779` (its B6, option a). Today the script
    runs `set -a; source .env` under `set -euo pipefail`, so a value `ab$cd` aborts the build with
    *cd: unbound variable* and a value `$(…)` is executed. #5 moved the Liquid, OpenCode and
    privacy-proxy builds to `load_env_file` (OC-80); the OpenClaw build is the one product build
    that stayed, and `BACKLOG.md`'s entry on the readers of `.env` names it. It moves in this
    change, because `--inputs` is run by the start and the dashboard on every `.env` the operator
    writes, and a reader that executes the file is not one to run that often. `hermes.sh` stays as
    it is, disabled, and the `BACKLOG.md` note keeps its half.

## 3. What this does not cover, deliberately

- **Drift of the base image.** `FROM ghcr.io/nocodenation/liquid-nifi:latest`, `FROM node:lts-slim`
  and `FROM oven/bun:latest` move under the stack whenever upstream publishes, and `FROM
  ghcr.io/openclaw/openclaw:2026.9.1` moves when the pin is edited. The pin is in the Dockerfile's
  bytes and so in the digest; what the tag points at is not, and `docker build` resolves it at
  build time. Comparing the image's base digest with the registry's is a network question and a
  change of its own; the privacy-proxy `BACKLOG.md` entry keeps that half open (decision 1).
- **The contents of `PRIVACY_PROXY_DEV_SRC`.** With it set, `privacy-proxy.sh` first builds
  `liquidupstart/privacy-proxy-base:dev` from that checkout and then the product image on top. The
  base image's name enters the digest as the value of `PRIVACY_PROXY_BASE_IMAGE`; the checkout it
  was built from does not. That is the developer's own tree, and `.env.example` §13 says it is for
  working on the service itself.
- **The dashboard image** (decision 5).
- **Hermes.** `config/scripts/build/hermes.sh` is disabled (`docs/FEATURE-component-switches.md`,
  decision 7), renders into its context rather than into a temporary file, and still sources
  `.env`. It is left as it is; re-enabling it is a feature of its own, and that feature adds the
  label and the reader.
- **A single list of images** (decision 7).
- **`update.sh`'s `.needs-rebuild` marker.** The updater removes the built images and drops the
  marker; the missing images already make `needBuild` true, and the marker is advisory. It stays.
- **Relabelling an image without a rebuild.** A label is written by `docker build`. A rebuild of an
  image whose inputs did not change is seconds, because a changed label invalidates no layer
  (§8.1), so a `--relabel` path would save nothing.
- **File modes and times.** The digest reads bytes and paths (IM-FR1). A release archive loses
  modes (`docs/TEST-SPEC-suite-preconditions.md`, SP-5's build row), so a digest over modes would
  differ between the installer's copy and a checkout of the same tree. What this leaves unseen: a
  mode change on a copied file that the Dockerfile does not reset. The executable bits the images
  need are set by `chmod` in the Dockerfiles (`nar_builder`, `toolbox`, `openclaw` do so on the
  scripts they run); files that are only read, such as `BuildServer.java` and
  `lifecycle-pins.xml`, need the read bits every checkout and archive gives them.
- **The running container.** The check reads the image's label and never asks a container what it
  runs. A container recreated from an image that was rebuilt since is `compose up`'s job, and
  `start.sh` always runs `down.sh` first.
- **macOS.** The rendering was measured identical on three Linux environments (§8.5) and not on
  macOS's bash 3.2 and BSD sed; IM-M1 in the test specification asks for that run.

## 4. Requirements

**IM-FR1 -- the digest.** `lu_image_inputs_digest <rendered-dockerfile> <context> [KEY=VALUE ...]`
in `config/scripts/build/lib/image-inputs.sh` prints the lower-case hex SHA-256, 64 characters, of
the byte string below, and nothing else, on stdout. The hash is `sha256sum` where it exists and
`shasum -a 256` otherwise, as `install.sh`'s `sha256_of` chooses.

The byte string is the concatenation, in this order, of:

1. `dockerfile` NUL, then the bytes of `<rendered-dockerfile>` as `docker build -f` will read them,
   then NUL. For the four templated images that is the file `render_dockerfile` wrote and the build
   script then edited; for `bun-runner`, `nar-builder` and the toolbox it is `Dockerfile` in the
   context.
2. For each `KEY=VALUE` argument, in the order given: `arg` NUL `KEY` `=` `VALUE` NUL. The build
   script passes exactly the `--build-arg` values it passes to `docker build`, in the same order.
   Today only `privacy-proxy.sh` passes any: `PRIVACY_PROXY_BASE_IMAGE=<value>` then
   `ENABLE_ANTHROPIC_CLAUDE_CODE=<0|1>`. Defaults declared by `ARG` in the Dockerfile are in its
   bytes already.
3. For each source of each `COPY` and `ADD` in the rendered Dockerfile, in the order of the
   instructions and of the sources within one instruction: for each regular file under that source
   -- the file itself, or every regular file under a directory, **the files' context-relative
   paths sorted bytewise as whole strings (`find … -type f | LC_ALL=C sort`)** -- `file` NUL
   `<path>` NUL `<bytes>` NUL, where `<path>` is the file's path relative to the context with any
   leading `./` removed. A whole-path sort and a per-directory walk differ when a name holds a byte
   below `/` (0x2F), such as `.`: `tools/a.txt` sorts before `tools/a/x` as whole paths and after
   it directory by directory. The whole-path sort is what the shell's `find | sort` gives, so it is
   the definition; §8.10 measured the two digests apart on the IM-1 fixture.

The three section names keep a file's bytes from being read as the Dockerfile's or an argument's.
NUL is the separator because it is the one byte a path cannot hold.

**The reader of `COPY` and `ADD`**, `lu_copy_sources <dockerfile> <context>`, takes the Dockerfile
to read and the context its sources are resolved against -- two arguments, because a templated
Dockerfile is rendered into a temporary file (`opencode.sh:29-31`) and its context is
`config/<image>`, not the temporary file's directory. It prints one source per line, in that order,
with any leading `./` removed, and exits 0. It joins lines continued with a trailing `\`, reads the
instruction word case-insensitively, skips the body of a heredoc (`<<` on any instruction, to its
terminator), accepts the flags `--chown=`, `--chmod=` and `--link`, and skips a `COPY`/`ADD`
carrying `--from=<stage>` entirely when `<stage>` is a name an earlier `FROM … AS <stage>` in the
same file declares, since its source is another stage whose inputs are already in the Dockerfile
and the arguments. It exits 1 and prints
`Error: <dockerfile>:<line>: <instruction> is not a form the image-inputs digest can read` to stderr,
with the instruction's text, on any of: the JSON array form; a source holding `*`, `?` or `[`; a
URL; a heredoc as a source; a heredoc that no terminator closes before the end of the file;
`--parents` or `--exclude=`; `--from=` naming anything but a declared stage, which is an external
image; any instruction carrying `--mount=`, whose bind and cache mounts read the context or the
host outside the digest; a source naming the context itself (`.` or `./`); a source that does not
exist under the context, or leads out of it (`..`); a symlink; fewer than two arguments. Before
any instruction is read, a `.dockerignore` in the context is refused, with the line
`Error: <context>/.dockerignore: a .dockerignore changes what docker copies, and the image-inputs digest cannot read it`,
because it would make docker copy less than the digest hashed. The forms refused are the ones
whose set of bytes this function cannot determine from the Dockerfile and the directory alone. On
this tree every Dockerfile a build script uses is accepted -- the two `--from=` instructions name
the stages `claude-cli` and `build`, declared in their files; no Dockerfile carries `--mount=`; no
build context holds a `.dockerignore` or a symlink (§8.8) -- and `dashboard/Dockerfile` alone is
refused, for `dashboard/.dockerignore` first and for its `COPY . .` had the context passed
(decision 5). A `POST_INSTALLATION_COMMANDS` value can put `<<` into a rendered Dockerfile; an
unterminated one is refused by the rule above, and a terminated one is a `RUN` whose body is
skipped.

**IM-FR2 -- the labels.** Every build of the seven images passes to `docker build`:

- `--label io.liquidupstart.inputs=<digest>`, IM-FR1's answer for that build;
- `--label io.liquidupstart.source=<source>`, where `<source>` is the first line of
  `.liquidupstart-version` with every whitespace character removed (`tr -d '[:space:]'`) when the
  file exists and what remains is not empty; otherwise `checkout-<short sha>`, the sha as `git
  rev-parse --short HEAD` prints it (seven characters on this repository today, more when git needs
  them), with `-dirty` appended when `git status --porcelain` prints anything, when `git` is on
  `PATH` and `git rev-parse --is-inside-work-tree` answers yes in the project directory; otherwise
  `unknown`. This is `run.sh`'s `version()` rule, line for line (`run.sh:17-25`), and
  `lu_image_source [project-dir]` in the library computes it; IM-4 holds the two to one answer. A
  git that refuses the directory -- `dubious ownership` inside a rootful container, where the
  host's files belong to another uid -- gives `unknown`, which is a true statement about what
  could be read (decision 14).

The namespace `io.liquidupstart.` is this project's; no upstream image uses it (§8.3). The label
values are read with `docker image inspect -f '{{index .Config.Labels "io.liquidupstart.inputs"}}'
<image>`, and not with `{{.Config.Labels.io…}}`: the dotted form prints the text `<no value>` for an
absent key, on an image with no labels and on one with other labels alike (§8.3, measured), and a
reader would take those words for a label's value; `index` prints the empty string in both cases.
An image that does not exist is docker's exit 1 with `No such image`.

**IM-FR3 -- every build labels, or stops.** `config/scripts/build/{opencode,bun-runner,nar-builder,
liquid,openclaw,privacy-proxy,toolbox}.sh` each:

- source `lib/image-inputs.sh`;
- before reading `.env`, in both modes, call `lu_build_env_reset`, which unsets
  `SYSTEM_DEPENDENCIES`, `POST_INSTALLATION_COMMANDS`, every variable named `*_SYSTEM_DEPENDENCIES`,
  `*_SYSTEM_DEPENDENCIES_MODE`, `*_POST_INSTALLATION_COMMANDS` or `*_POST_INSTALLATION_COMMANDS_MODE`,
  `ENABLE_ANTHROPIC_CLAUDE_CODE`, `PRIVACY_PROXY_DEV_SRC`, `PRIVACY_PROXY_DEV_MODELS_EXTRA` and
  `PRIVACY_PROXY_DEV_SOURCE_OFFER_CONTACT` (decision 16), so that `.env` alone decides the render
  and the arguments;
- compute the digest after rendering and after their own edits of the rendered file, and before
  any `docker` command: before `docker image rm "$IMAGE"` in the five scripts that have one, and in
  `privacy-proxy.sh`, which has none, before the `docker build` of the dev base image that
  `PRIVACY_PROXY_DEV_SRC` asks for (`toolbox.sh` has no `image rm` either, decision 12);
- on a digest that cannot be computed, print the reader's error, then
  `::aiw-error::The inputs of <image> could not be computed: <reader's message>. The Dockerfile was rendered from <template path>. The build was not started.`
  to stderr -- the template path, because the reader's line numbers are the rendered file's, which
  `render_dockerfile` shifts by the `RUN` lines it inserts after `# POST_INSTALL_COMMANDS`, and the
  rendered file is a temporary one; for the three unrendered images the sentence names the
  Dockerfile itself -- and exit 1 with no image removed and none built;
- pass both labels of IM-FR2 to `docker build`, written
  `--label "io.liquidupstart.inputs=${DIGEST}" --label "io.liquidupstart.source=${SOURCE}"` on the
  `docker build` line, so a reader and IM-3 see them at a glance.

`privacy-proxy.sh` with `PRIVACY_PROXY_DEV_SRC` set computes the digest of the product image with
`PRIVACY_PROXY_BASE_IMAGE=liquidupstart/privacy-proxy-base:dev`, and labels the product image only;
the base image is the developer's (§3). **`scripts/linux/rebuild.sh` asks before it stops
anything:** it runs `build.sh --inputs` -- which, since `build.sh` passes its arguments through to
every script it runs, prints one digest per image that is on and exits non-zero when any cannot be
computed; `build.sh` sends its closing `Done.` to stderr when its arguments hold `--inputs`, so its
stdout is the digests alone, as IM-FR4 asks of each script -- before `down.sh`, with stdout
discarded, and on a non-zero exit prints the scripts'
stderr and `Nothing has been stopped; the stack is as it was.` and exits 1. Without it a refused
Dockerfile would be found after `down.sh` had emptied the stack, which is the shape CS-3 removed for
a refused switch value.

**IM-FR4 -- the computed answer: `--inputs`.** Each of the seven scripts, given the argument
`--inputs`, does everything a build does up to and including the digest -- resets the environment,
reads `.env`, renders, edits, assembles its arguments -- and then:

- prints **exactly one line on stdout, the digest**, and exits 0, having run no `docker` command:
  no `image rm`, no `build`, and for `privacy-proxy.sh` no build of the dev base image;
- writes every other line it or the renderer would print -- the progress lines, the renderer's
  `print_warning` lines -- to stderr;
- on a digest that cannot be computed, prints nothing on stdout, the reader's `Error:` line and the
  `::aiw-error::` line of IM-FR3 on stderr, and exits 1.

The other arguments (`--no-cache`) are accepted and ignored with `--inputs`. A caller that succeeds
discards stderr; one that fails quotes the first stderr line that starts with `Error:`, or the
first line when none does.

**IM-FR5 -- the start's notice.** `scripts/linux/start.sh`, in its pre-flight after the
missing-image check of CS-4 and before `down.sh`, for every image in `LU_IMAGES` -- the images of
what is on, the privacy proxy's included while it is on -- in that order:

- computes the expected digest with `"${PROJECT_DIR}/config/scripts/build/${_image}.sh" --inputs`,
  stdout captured, stderr captured to a temporary file; when the script exits non-zero, the
  expected value handed on is the first stderr line starting with `Error:`, or the first line;
- reads the image's `io.liquidupstart.inputs` and `io.liquidupstart.source` labels;
- prints `lu_image_notice <image> <expected> <found-inputs> <found-source>`'s answer on stdout.

`lu_image_notice` decides in this order, and prints exactly one of:

1. when `<expected>` does not match `^[0-9a-f]{64}$`, it is the reason the digest could not be
   computed:
   `Note: the inputs of liquidupstart/<name>:latest could not be computed (<expected>), so it is not checked.`;
2. when `<found-inputs>` is empty:
   `Note: liquidupstart/<name>:latest was built before images recorded their inputs; rebuild to make this checkable: ./scripts/linux/build.sh`;
3. when the two digests are equal: nothing;
4. otherwise, with `<found-source>` not empty:
   `Note: liquidupstart/<name>:latest was built from <source> and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`,
   and with it empty the same line with `an unrecorded source` in place of `<source>` -- an image
   nobody's build script made.

It exits 0 whatever it printed, and the start continues to `down.sh` whatever was printed. An image
missing at this point does not arise: CS-4 has exited already. An image of a component that is off
is not asked about, as it is not in `LU_IMAGES`.

**IM-FR6 -- the dashboard.**

- `stackState()` in `dashboard/src/lib/server/project.ts` returns
  `{ running, needBuild, images: { missing: string[]; stale: string[]; unlabelled: string[] } }`.
  For each image `builtImages()` names it runs, in parallel, `docker image inspect -f '{{index
  .Config.Labels "io.liquidupstart.inputs"}}' <image>` and `bash config/scripts/build/<name>.sh
  --inputs` in `ENV_DIR`, stderr discarded on success. **The order of the checks is the one
  `lu_image_notice` applies (IM-FR5), everywhere an image is judged -- here, in the CLI notice and
  in the run route:** docker's answer first, then the script's, then the label, then the
  comparison. So: docker's exit 1 puts the image in `missing`, whatever the script said. For an
  image that exists, a script that exits non-zero is logged once to the server's stderr with its
  `Error:` line and puts the image in none of the three (decision 13), whatever its label says;
  otherwise an empty label puts it in `unlabelled`; otherwise a label differing from the script's
  answer puts it in `stale`. `needBuild` is true when `missing` is
  non-empty, or the rebuild marker is set -- exactly as today (decision 4, as changed). `stale` and
  `unlabelled` never enter it.
- `imagesNote(images): string[]` in `dashboard/src/lib/image-inputs.ts` gives the lines, missing
  first, each listing its images comma-separated in `builtImages()`' order, and an empty array when
  the three lists are empty:
  - `These images are not built yet: <list>. Run Build once before starting.`
  - `These images were built from other inputs than this checkout and its .env: <list>. They run as they are; Rebuild brings them up to date.`
  - `These images were built before images recorded their inputs: <list>. They run as they are; Rebuild makes them checkable.`
  The launchpad's `load` and `/done`'s `load` each return `imagesNote: string[]`, and the pages
  render **one `<p class="warn">` per line** -- not one paragraph with newlines, which HTML
  collapses to spaces. Where: on the launchpad's not-running card, in place of today's fixed
  sentence when the array is not empty; on the launchpad's running card, above its `TaskRunner`,
  because a stale image is stale whether or not containers run from it and the Restart there would
  run it again; and on `/done`, under its existing `rebuild`/`needBuild` paragraphs, because that
  page is where a save sends the operator to build or start. The sentences are worded for all
  three places. With all three lists empty, each page says what it says today.
- Start is gated as today and no more: `TaskRunner.svelte` disables it while `needBuild` holds and
  no build has run in the page, which is the missing case alone. A stale or unlabelled image leaves
  Start enabled beside its line, as the CLI's notice leaves the start to run (decision 3). Rebuild
  is offered whenever `needBuild` is false, as today (`showRebuild={!data.needBuild}`), so the
  line's remedy is a button on the same card.
- `dashboard/src/routes/run/+server.ts`, before running a task in the toolbox, asks docker for
  `liquidupstart/toolbox:latest`'s inputs label and `bash config/scripts/build/toolbox.sh --inputs`
  for the expected one, and decides in the order of IM-FR5 -- docker, the script, the label, the
  comparison:
  - image missing and `--inputs` exiting non-zero: writes the script's `Error:` line and
    `[toolbox build not attempted: its inputs could not be computed]`, and does not run the task,
    since the build would fail at the same point (IM-FR3);
  - image missing otherwise: runs `bash config/scripts/build/toolbox.sh`, streaming its output as it
    streams the build today, after the line
    `Helper toolbox image is missing or was built from other inputs - building it...`; a failed
    script is reported as the failed build is today, with its exit code, and the task does not run;
  - image present and `--inputs` exiting non-zero, whatever the label says: writes
    `Helper toolbox image could not be checked: <Error: line>. Running the task with the image that is there.`
    and runs the task;
  - image present with an empty label, or a label differing from the script's answer: builds as
    above, then runs the task. The first task after the upgrade, Stop included, takes this path
    once (decision 12);
  - label matching: runs the task.

**IM-FR7 -- the harness builds labelled images.** `builderImage()` in `tests/lib/builderimage.ts`
passes, beside `builderLabels()`' three, the two labels of IM-FR2 as `productInputsLabels()` computes
them through the library over `config/nar_builder/Dockerfile`, `config/nar_builder` and no
arguments -- exactly what `nar-builder.sh --inputs` computes -- so a tree-built builder image is
labelled as the product's would be and cases that read the label can run against it.
**`builderLabels()` itself is unchanged**, three labels: `B6-41` asserts exactly three, and the
function labels the containers the harness runs (`builderserver.ts:38`, five M-B6 and M-B7 files),
which carry no inputs. The tag stays `tree-<builderContextDigest()>`: the tag isolates one
checkout's image from another's, for which hashing the whole context is the safe
over-approximation, and the label answers what reaches the image. On `config/nar_builder` the two
read the same six files, the Dockerfile and its five `COPY` sources, and IM-6 holds that so a file
added to the context without a `COPY` is noticed.

**IM-FR8 -- documentation.**

- `README.md`'s section on the build says that each built image records a digest of its inputs,
  that a start names every image whose inputs have changed since it was built and the rebuild
  command, and that it starts anyway.
- `docs/SPECIFICATION.md`'s paragraph on the six images says the same in one sentence, with the
  label names.
- `CLAUDE.md`'s *Services & images* paragraph gains one line.

**IM-FR9 -- `openclaw.sh` reads `.env` as the other builds do (decision 17).**
`config/scripts/build/openclaw.sh` replaces its `set -a; source "${PROJECT_DIR}/.env"; set +a` with
`load_env_file "${PROJECT_DIR}/.env"` from `dockerfile-render.sh`, which it already sources. So a
value holding `$`, in or out of quotes, is read as text (OC-80's rule), a `$(…)` is never run, and
the script's `${ENABLE_ANTHROPIC_CLAUDE_CODE:-0}` and `resolve_image_settings OPENCLAW` read what
`load_env_file` exported. The install line IM-3 and `OC-15` read out of the script is unchanged.

**IM-NFR1 -- cost.** The pre-flight adds under one second to a start and under one second to a
launchpad load: seven whole contexts hash in 0.31 s, one script's render-and-hash path takes 54 ms,
and six single `docker image inspect` calls, one per image as the design makes them, take 0.30 s
(§8.6).

**IM-NFR2 -- the digest does not flap.** Over one checkout and one `.env`, the digest of an image is
the same on every computation: from the host, from the dashboard's container and from the toolbox,
whatever each environment exports; before and after a start, which writes `config/openclaw/.env`;
after an edit under `config/agents/skills`, `config/opencode/skills`, `config/opencode/tools`,
`config/openclaw/plugins` or `config/openclaw/claude_tools`; after a `touch` or a `chmod` of a
source; and wherever the checkout lives. It changes when, and only when, the rendered Dockerfile,
an argument or a copied byte changes.

**IM-NFR3 -- nothing changes for a matching image.** With every image labelled and matching, the
start prints exactly the lines it prints today, in the same order, on stdout and on stderr, and the
launchpad reads as today. The full suite is as green as on `main`.

## 5. Data structures and interfaces

**Shell, `config/scripts/build/lib/image-inputs.sh`.** Sourced; bash 3.2 and 5.x; depends on
`sha256sum` or `shasum`, `find`, `sort` and `git` (the last only for the source).

| Function | Answers |
|---|---|
| `lu_copy_sources <dockerfile> <context>` | the `COPY`/`ADD` sources, one per line, in order, leading `./` removed, resolved against `<context>`; exit 1 with IM-FR1's error on a form it cannot read, or on a `.dockerignore` in the context |
| `lu_image_inputs_digest <rendered-dockerfile> <context> [KEY=VALUE ...]` | IM-FR1's 64-hex digest on stdout; exit 1 with the reader's error when a source cannot be read |
| `lu_build_env_reset` | unsets IM-FR3's build-affecting keys in the calling shell; never fails |
| `lu_image_source [project-dir]` | IM-FR2's source string; never fails |
| `lu_image_found_inputs <image>` | the image's `io.liquidupstart.inputs` label, empty when unlabelled; docker's exit status, so 1 for a missing image |
| `lu_image_found_source <image>` | the same for `io.liquidupstart.source` |
| `lu_image_notice <image> <expected> <found-inputs> <found-source>` | IM-FR5's line for those values on stdout, or nothing, in IM-FR5's order of precedence; exit 0 either way |

**Build scripts.** Each of the seven accepts `--inputs` beside `--no-cache`; calls
`lu_build_env_reset` before reading `.env`; sets `DIGEST` and `SOURCE` before its `docker build`
line; carries the two `--label` arguments on that line (IM-FR3); under `--inputs`, prints the digest
alone on stdout. `config/scripts/build/toolbox.sh` is new: `IMAGE="liquidupstart/toolbox:latest"`,
context `config/toolbox`, no rendering, no arguments, the shape of `bun-runner.sh` without its
`docker image rm` (decision 12). `scripts/linux/rebuild.sh` runs `build.sh --inputs` before
`down.sh` (IM-FR3).

**`start.sh`.** After CS-4's loop, one more loop over `LU_IMAGES` (IM-FR5). It sources
`config/scripts/build/lib/image-inputs.sh` beside the libraries it already sources.

**TypeScript.**

```ts
// dashboard/src/lib/server/project.ts
export type ImageState = { missing: string[]; stale: string[]; unlabelled: string[] };
export async function stackState(values?: Map<string, { value: string; raw?: string }>):
  Promise<{ running: boolean; needBuild: boolean; images: ImageState }>;
export function buildScriptOf(image: string): string;   // liquidupstart/<name>:latest → config/scripts/build/<name>.sh

// dashboard/src/lib/image-inputs.ts, shared by server and page
export const INPUTS_LABEL = 'io.liquidupstart.inputs';
export const SOURCE_LABEL = 'io.liquidupstart.source';
export function imagesNote(images: ImageState): string[];  // IM-FR6's lines, missing first; [] when all empty
```

`load` of `/` and of `/done` return `imagesNote: string[]`; `+page.svelte` of each renders
`{#each imagesNote as line}<p class="warn">{line}</p>{/each}` where IM-FR6 says.

**Labels.** `io.liquidupstart.inputs`: 64 lower-case hex characters. `io.liquidupstart.source`: the
first line of `.liquidupstart-version` without whitespace, or `checkout-<short sha>` optionally
followed by `-dirty`, or `unknown`.

**Harness, `tests/lib/builderimage.ts`.** `builderLabels()` is unchanged and returns its three
labels. `productInputsLabels(dockerfile, context, args)` computes IM-FR2's two through the library
with `bash -c`, so the harness does not re-implement the digest, and `builderImage()` passes both
sets to its `docker build`.

## 6. Signed off, and what refines the decisions

The decisions here that refine what the operator decided on 2026-11-04, each with its reason, for
sign-off before any code is written:

1. **Decision 9**: the digest is computed by the build scripts themselves through `--inputs`,
   rather than by a function the start calls with the rendered file. The operator's wording was
   *one shared shell function on the build's own render path*; this is that function, reached
   through the script that owns the render, because the render is not the only edit a script makes
   (`openclaw.sh`'s `sed`) and `.env` is read two ways. Under `--inputs` stdout is the digest alone.
2. **Decision 12**: the toolbox gets a build script. The operator covered the toolbox; the script is
   how it is covered without a second way of building an image in TypeScript. It does not remove
   the working image before building.
3. **Decision 13**: what a digest that cannot be computed does on each path, with docker's answer
   deciding *missing* first. The operator's decisions did not reach it.
4. **IM-FR6**: the dashboard distinguishes missing, stale and unlabelled in what it says, and names
   the images, where the operator's decision named only `needBuild`. The fixed sentence *The
   service images don't exist yet* would be false for a stale image. The lines show on the running
   card and on `/done` as well as on the not-running card.
5. **IM-FR6**: an image whose digest cannot be computed is in none of the three lists, whatever
   its label says, because the script is judged before the label (IM-FR5's order). The
   fixture projects of the component tier copy `config/scripts/start` and not
   `config/scripts/build`, so every existing `stackState()` case runs with no build script, and this
   is also what keeps them green (`docs/TEST-SPEC-image-inputs.md` §4).
6. **IM-FR7**: the harness keeps its tag and adds the label through `builderImage()` alone, with
   `builderLabels()` unchanged, rather than switching the tag to the product digest.
7. **Decision 12, kept after decision 4 changed**: the toolbox is still rebuilt without asking, for
   the reason given there.
8. **Decision 16**: `.env` alone decides the render; the build scripts unset the build-affecting
   keys from their environment first.
9. **IM-FR3's `rebuild.sh` pre-check**, so a refused Dockerfile is found before `down.sh`.

## 7. Open questions for the operator

None open. The three this specification raised on 2026-11-04 were answered by the operator the same
day, and each answer is recorded where it applies:

1. a stale image does not disable Start in the dashboard -- decision 4, as changed, and IM-FR6;
2. `config/opencode/Dockerfile` is deleted as part of the implementation -- decision 15, and
   IM-2's tree row;
3. `-dirty` stays in the source label and in the notice -- decision 14.

The review of `4468779` asked two more, and the operator answered them the same day: the
privacy-proxy entry's base-drift half stays open (decision 1), and `openclaw.sh` moves to
`load_env_file` in this change (decision 17). macOS stays with IM-M1 (§3).

## 8. Measurements, 2026-11-04

All on this host: Linux, Docker Engine 29.9.2, buildx v0.38.1, bash 5.x, GNU sed. Throwaway images
were tagged `lu-im-probe:*` and removed afterwards; nothing of the installation was touched.

1. **A label costs no layer.** A throwaway `FROM oven/bun:1-alpine` with one `RUN` writing a
   timestamp and one `COPY`, built twice, with `--label io.liquidupstart.inputs=aaaa` and then
   `=bbbb`: the second build reported both steps `CACHED`, `.RootFS.Layers` were identical, the
   image ids differed (the config differs), and the `RUN`'s file was byte-identical in both. So a
   rebuild that changes only the label is seconds, and labelling never invalidates a cache.
2. **Both builders keep labels.** `docker buildx build --load --label …` kept both labels, read
   back with `index`; and the classic builder, `DOCKER_BUILDKIT=0 docker build --label
   io.liquidupstart.inputs=dddd`, printed `Successfully built` and the label read back `dddd`.
   *The second half was measured for the review of `4468779`, which found this entry citing a
   measurement of buildx alone.*
3. **Label reads.** `{{index .Config.Labels "io.liquidupstart.inputs"}}` prints an empty line and
   exits 0 both on an image with no `Labels` map at all and on one with other labels and not this
   one. `{{.Config.Labels.x}}` prints the text `<no value>` and exits 0 in both cases, so a reader
   using it would take those eight characters for a label's value; that, and not an error, is why
   `index` is the form. *Corrected for the review of `4468779`: the first version of this entry said
   the dotted form is a template error, which was a misreading of a different template.* On this
   host `toolbox`, `opencode` and `privacy-proxy` have no `Labels` map; `bun-runner`, `nar-builder`,
   `liquid` and `openclaw` carry upstream OCI labels (`org.opencontainers.image.*`, `maintainer`),
   none in `io.liquidupstart.`. A missing image exits 1 with `No such image`. One `inspect` over
   several images, one of them missing, prints the others and exits 1, so the start reads one image
   per call.
4. **Rendering is stable.** `render_dockerfile` over `config/opencode/templates/Dockerfile` with
   `SYSTEM_DEPENDENCIES="jq, ripgrep"` and `POST_INSTALLATION_COMMANDS="echo a, echo b"` twice:
   `f387733712ff416a…` both times; with `ffmpeg` added, `6bf2746d0e08cad6…`. The temporary file's
   name is not in its bytes.
5. **Rendering is the same in three environments.** The four templates, rendered with the same
   values on the host, in `liquidupstart/dashboard:latest` (busybox sed, which answers `--version`
   with exit 0 -- *This is not GNU sed version 4.0* -- so `render_dockerfile` takes its GNU `-i`
   path; bash 5.3) and in `liquidupstart/toolbox:latest` (GNU sed 4.9, bash 5.2): four pairs of
   equal hashes. macOS is not measured (§3).
6. **Cost.** Hashing all seven contexts whole, with paths and contents: 0.31 s. One render-and-hash
   path for `openclaw`, `.env.example` loaded and settings resolved: 54 ms. Six `docker image
   inspect` calls, one per image: 0.30 s (one call over all six, which the design does not use
   because of 3, took 0.19 s).
7. **The installed images are stale, and a seed probe would not say so.** All built 2026-10-27.
   `nar-builder:latest` has `/opt/builder/m2-seed`; `build.sh`, `BuildServer.java` and
   `entrypoint.sh` differ from the tree; `id builder2` answers *no such user*; `/home/builder` is
   `builder 750`. `opencode:latest`'s `/usr/local/bin/entrypoint.sh` differs from the tree.
8. **No build context holds a symlink or a `.dockerignore`**, and no Dockerfile in the tree carries
   `--mount=`. `find … -type l` over the eight directories under `config/` that are contexts: none;
   `git ls-files | grep dockerignore`: `dashboard/.dockerignore` alone; `grep -rn 'mount='` over
   the ten Dockerfiles: nothing.
9. **`run.sh --version` answers without docker** (`run.sh:93`, before the engine check), so IM-4
   can compare the library's source with it.
10. **The walk order matters.** On the IM-1 fixture with `tools/a/x` beside `tools/a.txt`, the
    reference implementation gives `0d16b662…` with the whole-path sort and `1609af64…` with a
    per-directory walk, because `.` (0x2E) sorts before `/` (0x2F). The definition is the
    whole-path sort (IM-FR1).

## 9. Process log

- **2026-10-16** -- #34 opened by Timur during the review of #25, with a seed probe for
  `nar-builder`; his comment the same day pointed at the general class in `BACKLOG.md` and asked
  for the two together.
- **2026-10-26** -- the `BACKLOG.md` entry was settled against the cut line of the review series,
  with a start-time line per image *recorded and not raised again*.
- **2026-10-29** -- signing off decision 10 of the switches feature, the operator deferred the stale
  image to a change of its own, to be built with the privacy proxy's stale half.
- **2026-11-04** -- the operator took decisions 1 to 8 as recommended, and asked for this
  specification first. Written against the code: the build scripts, the renderer, every Dockerfile
  in the tree, `start.sh`'s pre-flight, `stackState()`, the run route, the installers' version
  files and the harness's builder image; the facts of §8 were measured before the design leaned on
  them.
- **2026-11-04, later** -- the operator answered §7: decision 4 changed so that `needBuild` stays
  for missing images only and a stale or unlabelled image is a notice with Start enabled, because
  every existing installation is unlabelled after the upgrade; the stray `config/opencode/Dockerfile`
  is deleted by the implementation (decision 15); `-dirty` stays (decision 14); macOS stays with
  IM-M1. Decision 12's automatic toolbox rebuild was re-examined against the changed decision 4 and
  kept, with its reason written there. The operator committed the specification as `4468779`.
- **2026-11-04, the review of `4468779`** -- an independent review asked for changes, and every
  finding was verified against the code before it was applied. What changed: the reader takes the
  context (IM-FR1); `--inputs` prints the digest alone (IM-FR4, decision 9); the harness labels
  through `builderImage()` and leaves `builderLabels()` at three (IM-FR7); docker decides *missing*
  before a script's failure (decision 13, IM-FR6); the whole-path walk order, measured apart from
  the per-directory one (IM-FR1, §8.10); the `<no value>` reading and the classic builder,
  re-measured (§8.2, §8.3); the source rule aligned with `run.sh` character for character (IM-FR2);
  `lu_image_notice`'s precedence (IM-FR5); the toolbox's build-then-replace, its behaviour when its
  inputs cannot be computed, and the first task after the upgrade (decision 12, IM-FR6); four more
  refused forms (IM-FR1); `/done` and the running card (IM-FR6); one paragraph per line (IM-FR6);
  `.env` alone deciding the render (decision 16); `rebuild.sh`'s pre-check (IM-FR3); and the
  operator's two decisions on it, the base-drift half left open (decision 1) and `openclaw.sh`
  moving to `load_env_file` (decision 17, IM-FR9). The test specification's overview was rewritten
  to one scenario per row.
