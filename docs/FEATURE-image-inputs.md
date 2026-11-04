# Feature: an image records the inputs it was built from, and a start says when they changed

Status: **specified on 2026-11-04, not implemented.** Written against the code of `main` at
`da9a85c`, with the measurements in §8 taken that day. Nothing in the product changes until the
operator signs this off.
Branch: `fix/issue-34-image-inputs`
Issue: #34, and the general class it was folded into (the comment on #34 of 2026-10-16). The test
specification is `docs/TEST-SPEC-image-inputs.md`.

## 1. Purpose

Six images are built locally and tagged `:latest`, and nothing compares a built image with the
checkout that should have built it. An operator who updates the checkout and starts without
building runs the old image, and the only sign is whatever the old image does differently. The class
has struck at least five times:

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
- **UC4, a dashboard start.** The launchpad's not-running card, which today says that images do
  not exist, also says which images were built from other inputs and which carry no record, and
  Start stays enabled: the card is the CLI's notice in the browser. The toolbox image, which the
  dashboard builds for itself, is rebuilt by the dashboard when it is stale, as it is today when it
  is missing.
- **UC5, nothing changed.** An image built from this checkout with this `.env` is passed over in
  silence, by the start and by the dashboard. This is #34's positive acceptance item, and the one
  that carries the weight: a notice that fires on every start is ignored on every start.
- **UC6, a build setting changes while the component is off.** Liquid is off,
  `LIQUID_SYSTEM_DEPENDENCIES` changes, the stack is rebuilt, Liquid is switched on. The image from
  before the change is there and is stale, and the start and the dashboard both say so (§3 of the
  switches feature, now covered).

## 2. Decisions

Decisions 1 to 8 were taken by the operator on 2026-11-04, as recommended, and decision 4 was
changed by the operator later that day, answering §7. Decisions 9 to 15 are taken here, against the
code, and §6 lists the ones that refine what was decided; 15 is the operator's own answer to §7.

1. **One change.** `BACKLOG.md`'s entry *A locally built image can belong to another branch* is
   re-opened, and #34, the stale half of *Turning the privacy proxy on asks for no build* and §3 of
   `docs/FEATURE-component-switches.md` are answered together. Its premise was wrong and is
   corrected there: `.liquidupstart-version` and `.liquidupstart-manifest` are the installer's files
   (`install.sh`, `update.sh`, `install-local.sh` write them), absent from a plain checkout, and
   neither says anything about an image. `run.sh` falls back to `checkout-<sha>` for the same
   reason. No product image carries a label of ours; local images do inherit upstream labels, for
   example `org.opencontainers.image.revision` on `liquidupstart/openclaw:latest` from OpenClaw
   itself (§8.3), so this feature uses a namespace of its own.
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
   sources it, the rest use `load_env_file`), and a port would have to reproduce both.
10. **The digest's function is shared, in `config/scripts/build/lib/image-inputs.sh`.** The build
    scripts, `start.sh` and the test harness source it. The dashboard runs the build scripts with
    `--inputs` in its own container, which carries bash and the project at its host path (§8.5
    measured that the rendering gives the same bytes there as on the host and in the toolbox).
11. **The build script of `liquidupstart/<name>:latest` is `config/scripts/build/<name>.sh`.** That
    holds for all seven images once the toolbox has a script of its own (decision 12), so the start
    and the dashboard compute the name and keep no list.
12. **The toolbox gets a build script, `config/scripts/build/toolbox.sh`.** It is built today by
    `dashboard/src/routes/run/+server.ts` from an argv assembled there, with a buildx fallback. A
    script of the shape of `bun-runner.sh` builds it with the labels and answers `--inputs` like the
    others, and the route runs the script in place of its argv, when the image is missing or stale.
    `build.sh` does not run it: the toolbox is the dashboard's, and a CLI installation never needs
    it. The buildx fallback goes: the dashboard image installs `docker-cli-buildx`, and `docker
    build` on 29.9.2 keeps a label whether buildx or the classic builder runs it (§8.2).
    **The rebuild stays automatic after decision 4 changed**, and this is why: the toolbox is the
    dashboard's own tool, not a service the operator chose, and the dashboard already builds it
    without asking when it is missing. A notice in its place would leave the operator running
    `start.sh` inside a toolbox with the wrong userland -- the failure A8-19 was written against --
    with no way to rebuild it but the dashboard itself, since no shipped script builds it. Its cost
    is minutes, streamed into the same log the task writes, and it carries no state. Decision 4
    concerns the product images, which Start runs as they are; the toolbox is what runs Start.
13. **A digest that cannot be computed fails the build and is noticed by the start.** A `COPY` form
    the reader does not understand (§4, IM-FR1) is a defect of the tree. The build stops with
    `::aiw-error::` before it removes the old image, because building an unlabelled image would
    recreate the state this feature exists against. The start, which refuses nothing here, prints
    that the image could not be checked and goes on; the dashboard logs it and puts the image in
    none of its three lists, because a card line about a defect of the tree would be wrong at every
    load and a rebuild could not clear it.
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

## 3. What this does not cover, deliberately

- **Drift of the base image.** `FROM ghcr.io/nocodenation/liquid-nifi:latest`, `FROM node:lts-slim`
  and `FROM oven/bun:latest` move under the stack whenever upstream publishes, and `FROM
  ghcr.io/openclaw/openclaw:2026.9.1` moves when the pin is edited. The pin is in the Dockerfile's
  bytes and so in the digest; what the tag points at is not, and `docker build` resolves it at
  build time. Comparing the image's base digest with the registry's is a network question and a
  change of its own.
- **The contents of `PRIVACY_PROXY_DEV_SRC`.** With it set, `privacy-proxy.sh` first builds
  `liquidupstart/privacy-proxy-base:dev` from that checkout and then the product image on top. The
  base image's name enters the digest as the value of `PRIVACY_PROXY_BASE_IMAGE`; the checkout it
  was built from does not. That is the developer's own tree, and `.env.example` §13 says it is for
  working on the service itself.
- **The dashboard image** (decision 5).
- **Hermes.** `config/scripts/build/hermes.sh` is disabled (`docs/FEATURE-component-switches.md`,
  decision 7) and renders into its context rather than into a temporary file. It is left as it is;
  re-enabling it is a feature of its own, and that feature adds the label.
- **A single list of images** (decision 7).
- **`update.sh`'s `.needs-rebuild` marker.** The updater removes the built images and drops the
  marker; the missing images already make `needBuild` true, and the marker is advisory. It stays.
- **Relabelling an image without a rebuild.** A label is written by `docker build`. A rebuild of an
  image whose inputs did not change is seconds, because a changed label invalidates no layer
  (§8.1), so a `--relabel` path would save nothing.
- **File modes and times.** The digest reads bytes and paths (IM-FR1). A release archive loses
  modes (`docs/TEST-SPEC-suite-preconditions.md`, SP-5's build row), so a digest over modes would
  differ between the installer's copy and a checkout of the same tree; and every Dockerfile here
  sets the modes it needs with `chmod`.
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
   -- the file itself, or every file under a directory, walked depth-first with the entries of
   every directory sorted bytewise (`LC_ALL=C`) -- `file` NUL `<path>` NUL `<bytes>` NUL, where
   `<path>` is the file's path relative to the context with any leading `./` removed.

The three section names keep a file's bytes from being read as the Dockerfile's or an argument's.
NUL is the separator because it is the one byte a path cannot hold.

**The reader of `COPY` and `ADD`**, `lu_copy_sources <dockerfile>`, prints one source per line, in
that order, with any leading `./` removed, and exits 0. It joins lines continued with a trailing
`\`, reads the instruction word case-insensitively, skips the body of a heredoc (`<<` on any
instruction, to its terminator), accepts the flags `--chown=`, `--chmod=` and `--link`, and skips an
instruction carrying `--from=` entirely, since its source is another stage whose inputs are already
in the Dockerfile and the arguments. It exits 1 and prints
`Error: <dockerfile>:<line>: <instruction> is not a form the image-inputs digest can read` to stderr,
with the instruction's text, on any of: the JSON array form; a source holding `*`, `?` or `[`; a
URL; a heredoc as a source; `--parents` or `--exclude=`; a source naming the context itself (`.` or
`./`); a source that does not exist under the context, or leads out of it (`..`); a symlink; fewer
than two arguments. The forms refused are the ones whose set of bytes this function cannot
determine from the Dockerfile and the directory alone. On this tree every Dockerfile a build script
uses is accepted, and `dashboard/Dockerfile` alone is refused, at its `COPY . .` (decision 5). No
build context holds a symlink (§8.8).

**IM-FR2 -- the labels.** Every build of the seven images passes to `docker build`:

- `--label io.liquidupstart.inputs=<digest>`, IM-FR1's answer for that build;
- `--label io.liquidupstart.source=<source>`, where `<source>` is the first line of
  `.liquidupstart-version` with surrounding whitespace removed when the file exists and that line
  is not empty; otherwise `checkout-<short sha>`, with `-dirty` appended when `git status
  --porcelain` prints anything, when `git` is on `PATH` and `git rev-parse --is-inside-work-tree`
  answers yes in the project directory; otherwise `unknown`. This is `run.sh`'s `version()` rule,
  and `lu_image_source [project-dir]` in the library computes it. A git that refuses the directory
  -- `dubious ownership` inside a rootful container, where the host's files belong to another uid
  -- gives `unknown`, which is a true statement about what could be read (decision 14).

The namespace `io.liquidupstart.` is this project's; no upstream image uses it (§8.3). The label
values are read with `docker image inspect -f '{{index .Config.Labels "io.liquidupstart.inputs"}}'
<image>`: `index` answers the empty string on an image with no labels at all, where
`.Config.Labels.x` is an error (§8.3), and an image that does not exist is docker's exit 1.

**IM-FR3 -- every build labels, or stops.** `config/scripts/build/{opencode,bun-runner,nar-builder,
liquid,openclaw,privacy-proxy,toolbox}.sh` each:

- source `lib/image-inputs.sh`;
- compute the digest after rendering and after their own edits of the rendered file, and before
  `docker image rm "$IMAGE"`;
- on a digest that cannot be computed, print the reader's error, then
  `::aiw-error::The inputs of <image> could not be computed: <reader's message>. The build was not started.`
  to stderr, and exit 1 with no image removed and none built;
- pass both labels of IM-FR2 to `docker build`, written
  `--label "io.liquidupstart.inputs=${DIGEST}" --label "io.liquidupstart.source=${SOURCE}"` on the
  `docker build` line, so a reader and IM-3 see them at a glance.

`privacy-proxy.sh` with `PRIVACY_PROXY_DEV_SRC` set computes the digest of the product image with
`PRIVACY_PROXY_BASE_IMAGE=liquidupstart/privacy-proxy-base:dev`, and labels the product image only;
the base image is the developer's (§3).

**IM-FR4 -- the computed answer: `--inputs`.** Each of the seven scripts, given the argument
`--inputs`, does everything a build does up to and including the digest -- reads `.env`, renders,
edits, assembles its arguments -- prints the digest as one line on stdout and exits 0, having run no
`docker` command: no `image rm`, no `build`, and for `privacy-proxy.sh` no build of the dev base
image. On a digest that cannot be computed it exits 1 with the reader's error on stderr and nothing
on stdout. The other arguments (`--no-cache`) are accepted and ignored with `--inputs`.

**IM-FR5 -- the start's notice.** `scripts/linux/start.sh`, in its pre-flight after the
missing-image check of CS-4 and before `down.sh`, for every image in `LU_IMAGES` -- the images of
what is on, the privacy proxy's included while it is on -- in that order:

- computes the expected digest with `"${PROJECT_DIR}/config/scripts/build/${_image}.sh" --inputs`;
- reads the image's `io.liquidupstart.inputs` and `io.liquidupstart.source` labels;
- prints, on stdout, exactly one of:
  - nothing, when the two digests are equal;
  - `Note: liquidupstart/<name>:latest was built before images recorded their inputs; rebuild to make this checkable: ./scripts/linux/build.sh`
    when the inputs label is empty;
  - `Note: liquidupstart/<name>:latest was built from <source> and its inputs have changed since. Rebuild it: ./scripts/linux/build.sh`
    when the two differ and the source label is not empty;
  - the same line with `an unrecorded source` in place of `<source>` when the inputs label is set
    and the source label is empty -- an image nobody's build script made;
  - `Note: the inputs of liquidupstart/<name>:latest could not be computed (<first line of the script's stderr>), so it is not checked.`
    when `--inputs` exits non-zero;

and then continues to `down.sh` whatever it printed. The three comparisons are one function,
`lu_image_notice <image> <expected> <found-inputs> <found-source>`, which prints the line for its
arguments or nothing, so it can be put to stated values without an engine. An image missing at
this point does not arise: CS-4 has exited already. An image of a component that is off is not
asked about, as it is not in `LU_IMAGES`.

**IM-FR6 -- the dashboard.**

- `stackState()` in `dashboard/src/lib/server/project.ts` returns
  `{ running, needBuild, images: { missing: string[]; stale: string[]; unlabelled: string[] } }`.
  For each image `builtImages()` names it runs, in parallel, `docker image inspect -f '{{index
  .Config.Labels "io.liquidupstart.inputs"}}' <image>` and `bash config/scripts/build/<name>.sh
  --inputs` in `ENV_DIR`. Docker's exit 1 puts the image in `missing`; an empty label in
  `unlabelled`; a label differing from the script's answer in `stale`. A script that exits non-zero
  is logged once to the server's stderr with its first line and puts the image in none of the three
  (decision 13). `needBuild` is true when `missing` is non-empty, or the rebuild marker is set --
  exactly as today (decision 4, as changed). `stale` and `unlabelled` never enter it.
- The launchpad's `load` computes `imagesNote: string` from `images` with `imagesNote()` in
  `dashboard/src/lib/image-inputs.ts`, and `+page.svelte` renders it in the not-running card in
  place of today's fixed sentence when it is not empty. The texts, each listing the images
  comma-separated, in `builtImages()`' order:
  - `These images are not built yet: <list>. Run Build once before starting.`
  - `These images were built from other inputs than this checkout and its .env: <list>. Start runs them as they are; Rebuild brings them up to date.`
  - `These images were built before images recorded their inputs: <list>. Start runs them as they are; Rebuild makes them checkable.`
  Several apply at once as several lines, missing first. With all three lists empty the card says
  what it says today.
- Start is gated as today and no more: `TaskRunner.svelte` disables it while `needBuild` holds and
  no build has run in the page, which is the missing case alone. A stale or unlabelled image leaves
  Start enabled beside its line, as the CLI's notice leaves the start to run (decision 3). Rebuild
  is offered on the card whenever `needBuild` is false, as today (`showRebuild={!data.needBuild}`),
  so the line's remedy is a button on the same card.
- `dashboard/src/routes/run/+server.ts`, before running a task in the toolbox, asks docker for
  `liquidupstart/toolbox:latest`'s inputs label and `bash config/scripts/build/toolbox.sh --inputs`
  for the expected one. When the image is missing or the two differ, it runs `bash
  config/scripts/build/toolbox.sh`, streaming its output as it streams the build today, after the
  line `Helper toolbox image is missing or was built from other inputs - building it...`. The
  `docker buildx` argv and its fallback go (decision 12). A failed script is reported as the failed
  build is today, with its exit code.

**IM-FR7 -- the harness builds labelled images.** `builderImage()` in `tests/lib/builderimage.ts`
passes both labels of IM-FR2 beside its own three, computed by the library's functions over
`config/nar_builder/Dockerfile`, `config/nar_builder` and no arguments -- exactly what
`nar-builder.sh --inputs` computes -- so a tree-built builder image is labelled as the product's
would be and cases that read the label can run against it. Its tag stays
`tree-<builderContextDigest()>`: the tag isolates one checkout's image from another's, for which
hashing the whole context is the safe over-approximation, and the label answers what reaches the
image. On `config/nar_builder` the two read the same six files, the Dockerfile and its five `COPY`
sources, and IM-6 holds that so a file added to the context without a `COPY` is noticed.

**IM-FR8 -- documentation.**

- `README.md`'s section on the build says that each built image records a digest of its inputs,
  that a start names every image whose inputs have changed since it was built and the rebuild
  command, and that it starts anyway.
- `docs/SPECIFICATION.md`'s paragraph on the six images says the same in one sentence, with the
  label names.
- `CLAUDE.md`'s *Services & images* paragraph gains one line.

**IM-NFR1 -- cost.** The pre-flight adds under one second to a start and under one second to a
launchpad load: seven whole contexts hash in 0.31 s, one script's render-and-hash path takes 54 ms,
and six label reads take 0.19 s (§8.6).

**IM-NFR2 -- the digest does not flap.** Over one checkout and one `.env`, the digest of an image is
the same on every computation: from the host, from the dashboard's container and from the toolbox;
before and after a start, which writes `config/openclaw/.env`; after an edit under
`config/agents/skills`, `config/opencode/skills`, `config/opencode/tools`, `config/openclaw/plugins`
or `config/openclaw/claude_tools`; after a `touch` or a `chmod` of a source; and wherever the
checkout lives. It changes when, and only when, the rendered Dockerfile, an argument or a copied
byte changes.

**IM-NFR3 -- nothing changes for a matching image.** With every image labelled and matching, the
start prints exactly the lines it prints today, in the same order, and the launchpad reads as
today. The full suite is as green as on `main`.

## 5. Data structures and interfaces

**Shell, `config/scripts/build/lib/image-inputs.sh`.** Sourced; bash 3.2 and 5.x; depends on
`sha256sum` or `shasum`, `find`, `sort` and `git` (the last only for the source).

| Function | Answers |
|---|---|
| `lu_copy_sources <dockerfile>` | the `COPY`/`ADD` sources, one per line, in order, leading `./` removed; exit 1 with IM-FR1's error on a form it cannot read |
| `lu_image_inputs_digest <rendered-dockerfile> <context> [KEY=VALUE ...]` | IM-FR1's 64-hex digest on stdout; exit 1 with the reader's error when a source cannot be read |
| `lu_image_source [project-dir]` | IM-FR2's source string; never fails |
| `lu_image_found_inputs <image>` | the image's `io.liquidupstart.inputs` label, empty when unlabelled; docker's exit status, so 1 for a missing image |
| `lu_image_found_source <image>` | the same for `io.liquidupstart.source` |
| `lu_image_notice <image> <expected> <found-inputs> <found-source>` | IM-FR5's line for those values on stdout, or nothing; exit 0 either way |

**Build scripts.** Each of the seven accepts `--inputs` beside `--no-cache`; sets `DIGEST` and
`SOURCE` before its `docker build` line; carries the two `--label` arguments on that line (IM-FR3).
`config/scripts/build/toolbox.sh` is new: `IMAGE="liquidupstart/toolbox:latest"`, context
`config/toolbox`, no rendering, no arguments, the shape of `bun-runner.sh`.

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
export function imagesNote(images: ImageState): string;  // IM-FR6's lines, joined with '\n'; '' when all empty
```

**Labels.** `io.liquidupstart.inputs`: 64 lower-case hex characters. `io.liquidupstart.source`: the
first line of `.liquidupstart-version`, or `checkout-<7 hex>` optionally followed by `-dirty`, or
`unknown`.

**Harness, `tests/lib/builderimage.ts`.** `builderLabels()` returns its three labels and the two of
IM-FR2; `productInputsLabels(dockerfile, context, args)` computes the two through the library with
`bash -c`, so the harness does not re-implement the digest.

## 6. Signed off, and what refines the decisions

The decisions here that refine what the operator decided on 2026-11-04, each with its reason, for
sign-off before any code is written:

1. **Decision 9**: the digest is computed by the build scripts themselves through `--inputs`,
   rather than by a function the start calls with the rendered file. The operator's wording was
   *one shared shell function on the build's own render path*; this is that function, reached
   through the script that owns the render, because the render is not the only edit a script makes
   (`openclaw.sh`'s `sed`) and `.env` is read two ways.
2. **Decision 12**: the toolbox gets a build script. The operator covered the toolbox; the script is
   how it is covered without a second way of building an image in TypeScript.
3. **Decision 13**: what a digest that cannot be computed does on each path. The operator's
   decisions did not reach it.
4. **IM-FR6**: the dashboard distinguishes missing, stale and unlabelled in what it says, and names
   the images, where the operator's decision named only `needBuild`. The fixed sentence *The
   service images don't exist yet* would be false for a stale image.
5. **IM-FR6**: an image whose digest cannot be computed is in none of the three lists. The
   fixture projects of the component tier copy `config/scripts/start` and not
   `config/scripts/build`, so every existing `stackState()` case runs with no build script, and this
   is also what keeps them green (`docs/TEST-SPEC-image-inputs.md` §4).
6. **IM-FR7**: the harness keeps its tag and adds the label, rather than switching the tag to the
   product digest.
7. **Decision 12, kept after decision 4 changed**: the toolbox is still rebuilt without asking, for
   the reason given there.

## 7. Open questions for the operator

None open. The three this specification raised on 2026-11-04 were answered by the operator the same
day, and each answer is recorded where it applies:

1. a stale image does not disable Start in the dashboard -- decision 4, as changed, and IM-FR6;
2. `config/opencode/Dockerfile` is deleted as part of the implementation -- decision 15, and
   IM-2's tree row;
3. `-dirty` stays in the source label and in the notice -- decision 14.

macOS stays with IM-M1 (§3).

## 8. Measurements, 2026-11-04

All on this host: Linux, Docker Engine 29.9.2, buildx v0.38.1, bash 5.x, GNU sed. Throwaway images
were tagged `lu-im-probe:*` and removed afterwards; nothing of the installation was touched.

1. **A label costs no layer.** A throwaway `FROM oven/bun:1-alpine` with one `RUN` writing a
   timestamp and one `COPY`, built twice, with `--label io.liquidupstart.inputs=aaaa` and then
   `=bbbb`: the second build reported both steps `CACHED`, `.RootFS.Layers` were identical, the
   image ids differed (the config differs), and the `RUN`'s file was byte-identical in both. So a
   rebuild that changes only the label is seconds, and labelling never invalidates a cache.
2. **`docker buildx build --load` keeps labels**, both of them, read back with `index`.
3. **Label reads.** `{{index .Config.Labels "io.liquidupstart.inputs"}}` on an image with no
   `Labels` map at all prints an empty line and exits 0; `.Config.Labels.x` on the same image is a
   template error. On this host `toolbox`, `opencode` and `privacy-proxy` have no `Labels` map;
   `bun-runner`, `nar-builder`, `liquid` and `openclaw` carry upstream OCI labels
   (`org.opencontainers.image.*`, `maintainer`), none in `io.liquidupstart.`. A missing image exits
   1 with `No such image`. One `inspect` over several images, one of them missing, prints the
   others and exits 1, so the start reads one image per call.
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
   path for `openclaw`, `.env.example` loaded and settings resolved: 54 ms. Six label reads in one
   `inspect`: 0.19 s.
7. **The installed images are stale, and a seed probe would not say so.** All built 2026-10-27.
   `nar-builder:latest` has `/opt/builder/m2-seed`; `build.sh`, `BuildServer.java` and
   `entrypoint.sh` differ from the tree; `id builder2` answers *no such user*; `/home/builder` is
   `builder 750`. `opencode:latest`'s `/usr/local/bin/entrypoint.sh` differs from the tree.
8. **No build context holds a symlink.** `find … -type l` over the eight directories under
   `config/` that are contexts: none.

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
  kept, with its reason written there.
