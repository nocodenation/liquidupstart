# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

## Open findings

**Liquid autoloads from the drop directory, and everything this feature says about deployment is
built on the assumption that it does not.**
Measured 2026-09-09, while a red check in `tests/verify/m-b4.sh` refused to be explained. It is the
largest open question this feature has.

```
nifi.nar.library.autoload.directory=/opt/nifi/nifi-current/nar_extensions
```

**The measurement.** A NAR named `b4-autoload-nar-1.0.0.nar` was built into
`volumes/nar_extensions` and nothing else was done — no restart, no copy. After **20 seconds**
`org.nocodenation.probe.AutoloadProbe` was listed by `/nifi-api/flow/processor-types`, the container's
`StartedAt` was unchanged, and the NAR was **not** in `lib/`. Independently, the catalogue was already
listing `ProbeA` and `ProbeB` — B3-3's concurrency fixtures, which the suite writes into the drop
directory and deletes again, which were never in `lib/`, and which no restart followed. NiFi loads
them and does not unload them.

**What that puts in question, none of it settled:**

- **FR36 and M-B4.** The guard refuses to copy a mismatched bundle into `lib/`. NiFi loads it from the
  drop directory anyway, about twenty seconds later. The milestone is built, its 32 cases are green,
  and it guards a path that is not the one that loads. This is why §4's check 3 stayed red through two
  repairs of the check.
- **FR29, and what `nar-build` prints to an agent.** *"Liquid loads NARs from /nar_extensions at
  startup only. Ask the operator to restart it"* — the restart is not required. That sentence reaches
  every agent that builds a NAR.
- **FR30.** *"On start, every `*.nar` in it is copied into `lib/`"* holds, and appears to be
  redundant: the autoload directory would have reached the load path without it.
- **M-B3's check 3.** It established that Liquid lists what `nar-build` produces. It never separated
  whether that was the copy into `lib/` or the autoload directory.
- **Where the setting lives.** `volumes/liquid/conf/nifi.properties:37` — persistent local state. The
  stock `apache/nifi:2.11.0` image says `./extensions`. Nothing in `config/liquid/`, `compose.yml`,
  `.env.example` or a `NIFI_*` variable sets it, so **a fresh installation may not behave the way this
  one does**, and no branch carries the difference.

**Deliberately not repaired on 2026-09-09.** Two explanations for the red check were offered and
withdrawn that day — a leftover unpacked bundle, and an answer from the instance being replaced — and
the third is the first that rests on a measured configuration value rather than on reasoning about
behaviour. The right next step is to decide what the deployment path *should* be, not to adjust a
guard until a check goes green.

**Nothing in the stack notices a NAR built against an API Liquid does not provide.**
Established by B3-2 on 2026-09-08, and the reason FR23 was rewritten the same day. A NAR compiled
against `nifi-api` 2.11.0, referencing a class the loaded 2.10.0 jar does not contain, is accepted:
the bundle loads, the processor is listed in the catalogue, and `nifi-app.log` says nothing. The
break waits for the first run of the processor — inferred from how the JVM resolves method
signatures, and **not yet tested**.

`nar-build` prevents it at the source by resolving the API through `nifi-utils`, which is FR27, and
that covers every NAR this stack builds. It does not cover a NAR built elsewhere and dropped into
`volumes/nar_extensions` by hand, which is a documented path in the `liquid` skill.

**The first half was done on 2026-09-09, and the inference was wrong about when.** A mismatched
processor was added from the canvas against a stack built from this branch. It fails at
**instantiation**, not at trigger: `POST /nifi-api/process-groups/<id>/processors` answers **500**
with `java.lang.NoClassDefFoundError: org/apache/nifi/controller/NodeConnectionState`. The processor
never reaches the canvas, so it never runs — the predicted error type was right and the predicted
moment was not. The control ran beside it flawlessly: the same processor built against the resolved
2.10.0 reached 4,114,541 invocations in five minutes.

**Two things came out of it that are worse than the original finding.** The error is written to
`nifi-user.log` and **not** to `nifi-app.log`, which is where every check in this repository looks —
so "the framework says nothing" was a conclusion drawn from one log rather than an observation. And
the UI turns the 500 into `/nifi/#/error` reading *"Your session has expired. Please click on the
Home button to renew the session."* That is false, and it points the operator at re-authentication,
which reproduces the failure. Both are recorded in B3-2 and in §4, and §4 now reads both logs.

**What is still open is the deployment-time check.** The entrypoint already walks every `*.nar` on
its way into `lib/`, and comparing the API a bundle links against with the one the distribution ships
is the same `javap` comparison §4 check 4b performs. It would turn a 500 with a misleading message
into a refusal at the moment of deployment, which is where an operator can act on it. Left because
this is a new requirement rather than a repair, and M-B3 is closed.

**Nothing sweeps a staging file the builder abandoned.**
Introduced by M-B3's own fix on 2026-09-08, and recorded because it is a property the milestone
changed rather than one it found. `config/nar_builder/build.sh` used to stage into
`${DROP}/.${base}.part`, a name derived from the artifact alone: two concurrent builds of one source
wrote into a single file, which is the defect B3-4 exists for. The staging path is now private to the
build process, `${DROP}/.${base}.$$.part` — and with that, the old name's one accidental virtue is
gone. A leftover used to be overwritten by the next build of the same artifact; now every abandoned
attempt keeps a name of its own and nothing ever touches it again. The `trap` covers `INT` and
`TERM`, so a `SIGKILL`, a container stop mid-copy or a `docker compose down` during a build leaves a
file in `volumes/nar_extensions` for good.

**It is litter, not a hazard, and that was checked rather than assumed.** Liquid's entrypoint counts
with `find -name "*.nar"` and iterates `"$DROP_DIR"/*.nar`; a name with a leading dot and a `.part`
suffix matches neither, so nothing reaches `lib/`. B3-4 asserts the directory is clean after a normal
pair, which is the case that matters for the fix; nothing asserts it after an abandoned build,
because nothing cleans up after one.

**Left because the cheap fix is not obviously the right one.** A sweep of `.*.part` at the start of
`build_command` would delete the staging file of a build running concurrently — the very situation
this milestone made safe. Sweeping only files older than some age reintroduces a criterion that
depends on when you look, which this project has already removed once. The honest options are an age
the builder itself owns, or leaving the directory's hygiene to `cleanup.sh`, and neither is worth
deciding under a milestone that is otherwise closed.

**A locally built image can belong to another branch, and nothing on this one says so.**
Met on 2026-09-07, during the first dashboard-driven start this project has ever performed. This
branch pins `ghcr.io/openclaw/openclaw:2026.7.1` and its start script writes the configuration that
version takes. The image on the machine, `liquidupstart/openclaw:latest`, was **2026.9.1** — built
eight hours earlier from `feature/openclaw-2026-9-1`, because images live on the host and not in the
branch. The start wrote a `cliBackends` key, a 2026.9.1 binary answered *"Unrecognized key"*, and
under a pty it asked `Run "openclaw doctor --fix" now? [Y/n]` in a one-shot container with no stdin.

**The only symptom was a container that did not come back.** Nothing compared the pin against the
image; nothing named a version at all. Removing the container by hand let the start continue, and it
then completed: the gateway migrated the legacy key away by itself, reported `restarts=0` and
`healthy`, and the stack came up with all twenty containers. So the failure mode after the hang is
worse than the hang — an installation that looks entirely correct while running a version this branch
does not pin, silently rewriting its own configuration on every start.

**The answer already exists one branch over.** `feature/openclaw-2026-9-1` reads
`openclaw --version` out of the built image and `meta.lastTouchedVersion` out of the state, and
refuses rather than guessing — *facts are computed, conduct is taught*, applied to exactly this. On
`main` and on this branch that probe does not exist, so the check arrives whenever #13 lands.

**And it is not OpenClaw's problem.** Four images are built locally, all tagged `:latest`, and
nothing anywhere compares a built image against the branch that should have built it. The same class
struck twice in one day: `liquidupstart/opencode:latest` had to be rebuilt while M-A8 ran, because
OC-20 had built it from a `main`-shaped checkout and it carried no `ssh`, so A3-7 failed against it.
A cheap first move is a start-time line naming what each locally built image was built from —
`.liquidupstart-version` and the build manifest already exist for exactly this kind of question.

**The toolbox image had no `git` and no `openssh`, and the start script's git step runs inside it.**
*Observed and fixed 2026-09-07. Kept because how it was found is the point.*
`scripts/linux/start.sh` runs `config/scripts/start/git.sh` at line 139; the dashboard's Build and
Start buttons run those scripts in the **toolbox** container
(`dashboard/src/routes/run/+server.ts`), and `config/toolbox/Dockerfile` installed bash,
ca-certificates, curl, gnupg, openssl, gawk, sed, grep, coreutils, procps, a JRE and the Docker CLI
on `debian:bookworm-slim` — none of which brings `git`, `ssh` or `ssh-keygen`.

**It was first written here as a reading, not an observation**, and deliberately left that way: the
toolbox image is not built while writing tests, so nobody had watched it fail. The entry named the
two steps to take. Both were taken the same day. The image was built and asked — `git: ABSENT`,
`ssh: ABSENT`, `ssh-keygen: ABSENT` — and then `git.sh` was run inside it against a throwaway
project: `line 17: ssh-keygen: command not found`, `EXIT=127`.

**The reading understated it.** It said an operator "reaches key generation with no `ssh-keygen`",
which sounds like a missing key. `start.sh` sets `set -euo pipefail` on line 2 and calls `git.sh`
unguarded on line 139, fourteen lines before `docker compose up -d`. The failure did not cost the git
step; it cost **the whole start** — no services, no stack, one line of output. And `git.sh` does not
exist on `main`, so the defect arrived with this feature and broke the path `CLAUDE.md` calls
recommended. It survived because every start in this project's history was typed into a terminal.

Fixed by adding `git openssh-client`, and covered by **A8-19**, which runs the git step inside the
image rather than listing what the image should contain — so the next start script to grow a
dependency fails there too. The same gap existed in `dashboard/Dockerfile` and was fixed by M-A8, and
M-A3 found it in the agent images. Three images, one mistake, three separate discoveries: nothing
compares what the scripts invoke against what the images carry.

**nginx appends to `X-Forwarded-For` instead of overwriting it.**
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` has been in this repository since
2026-06-01, arriving with the original webdb-playground base, and appears seventeen times: sixteen in
`config/nginx/templates/nginx.conf` and once in the generator that emits the hundred Liquid ingress
blocks. It preserves whatever the client sent and appends the real address, so a request arriving with
its own `X-Forwarded-For` has that value passed downstream as the first hop.

**Not a defect anyone has demonstrated.** It surfaced on 2026-09-05 while repairing OpenClaw's
`proxy_attribution_required`, and was changed to `$remote_addr` on the assumption it was part of that
fix. It was not: measured afterwards, appending with a narrow `gateway.trustedProxies` answers HTTP
200 exactly as overwriting does. The change was reverted, because a hotfix for a released stack
should carry only what the break requires.

What would settle it: whether anything downstream reads the first entry and trusts it — NextCloud,
OpenProject and pgAdmin all have their own trusted-proxy handling, and none has been checked. Against
that stands a real cost: overwriting discards the true client address for an operator who puts their
own reverse proxy in front of this stack. Decide it on those two facts, not on the tidiness of the
directive.

**`cleanup.sh` asks for a sudo password in the middle of a long run, and need not ask at all.**
Noticed during A7-5 on 2026-09-05. Under rootless Docker the host user maps to container root, so
files the containers wrote belong to subordinate UIDs and the host user cannot remove them; the plain
`rm -rf volumes/` fails and the script falls back to `sudo`.

Deleting from inside a container avoids the prompt entirely — there the ownership is root's own:

    docker run --rm -v "${PROJECT_DIR}/volumes:/v" alpine sh -c 'rm -rf /v/..?* /v/.[!.]* /v/*'

The script already has the shape for it: plain removal, then a fallback. The container attempt
belongs between the two, with `sudo` kept as the last resort for a host without a working Docker.

And if `sudo` is still reached, the prompt belongs at the **start** of the script rather than four
minutes in, where it arrives long after the operator has looked away — and where missing it leaves a
half-cleared directory. `cleanup.sh` lives on `main`, so this is stack work rather than this
feature's, and is recorded rather than fixed here.

**The Claude CLI install could not fail, and shipped a broken image.** *Fixed 2026-09-05.*
Found by A7-5's cold start — the first rebuild of `liquidupstart/openclaw:latest` in weeks. The start
reported `EXIT=0`, printed every URL and password, and OpenClaw could not serve a single request:
`Error: claude native binary not installed`.

**npm 12 blocks install scripts by default.** `@anthropic-ai/claude-code` fetches its native binary
in a `postinstall` (`node install.cjs`), and npm's new `allowScripts` mechanism skipped it with a
warning while the install itself succeeded. The image shipped a launcher with nothing to launch. The
base image `ghcr.io/openclaw/openclaw:latest` is one of the seven moving tags A7-5 lists and was
pulled that morning, bringing node 24.19.0 and npm 12.0.2 — so the stack's build broke because
something upstream changed a default, which is exactly the failure mode A7-5 was written to surface
and the only place in this repository where it could have surfaced.

The rendered line is now
`RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code && claude --version`.
The first half makes it work; the second makes the next silent failure loud, in the manner of the
`|| true` removed from Liquid's entrypoint in M-B2. Verified in the running container: the install
then reports `changed 2 packages` and `claude --version` answers `2.1.261 (Claude Code)`.

**Two corrections to this entry's first version, kept because how the wrong answer was reached
matters.** It blamed `optionalDependencies` being silently skipped — the package does declare eight
platform packages, none was installed, and that looked sufficient. It is not what happened:
`install.cjs` fetches the binary itself, and no platform package is installed even now that it works.
And it ruled out blocked scripts by reading `npm config get ignore-scripts`, which is `false` —
the wrong knob entirely, since npm 12 blocks through `allowScripts` instead. A cause was excluded by
checking something adjacent to it, and the remaining theory was then written down as fact. Re-running
the install is what corrected it, which is the same discipline this project applies everywhere else:
reproduce before concluding.

**`bun_runner` reports unhealthy with no app, and says nothing about it.** *The first half was fixed by #12 on 2026-09-06; the second half stands.*
Seen during A7-5 on 2026-09-05, thirty minutes into a cold start. Its healthcheck probes port 3000;
`volumes/bun_app` is empty because the reset removed it, so nothing listens and the container is
marked unhealthy. Its log is **completely empty** — not a line about starting, about finding no app,
or about what would change it.

**And the healthcheck hides it for exactly as long as anyone is watching.** `start_period` is 5m, so
for the first five minutes after every start Docker reports `health: starting` rather than
`unhealthy`. That is the window in which an operator still has the terminal in front of them: they
see "starting", read it as warming up, and turn away. The unhealthy state appears afterwards, when
nobody is looking. It is a plausible reason this has gone unnoticed, and it means "check right after
the start" is not a way to find it.

Whether idle-without-an-app should report unhealthy is a judgement for whoever owns the service. What
is not a judgement is that the state is **indistinguishable from broken**: the first thing a new
operator does is a cold start, and it ends with one of nineteen services red and nothing anywhere
that explains it. One line on startup — "no application in /bun_app; serving nothing until one is
added" — would settle it either way.

Not this feature's, so recorded rather than fixed. The causal chain is strongly suggested by the
empty directory, the port the check probes and the silent log, but has not been confirmed by watching
the service become healthy once an app exists.

**#12 closed the part that makes a working stack look broken.** The check no longer probes port 3000
when `/bun_app/package.json` is absent, so a stack with no application deployed reports healthy —
five cases in `docs/CASES-bun-runner-health.md` on that branch, signed off before the one line
changed. This branch does not carry the fix; it is cut from `main` alongside it.

What is left is the silence: the log still says nothing, and the check still infers the state instead
of reading one the entrypoint publishes. That alternative is on `feature/openclaw-2026-9-1`'s
`BACKLOG.md`, where #12's own record could reach a backlog file.

**The harness models one precondition where there are two.**
Found during A7-5 on 2026-09-05, in the window between `cleanup.sh` and the first `start.sh`. Four
cases fail there that `--no-system` does not skip: A3-3 twice (`known_hosts` seeded), A4-16 (the
shared hook present and executable) and A1-4 (the live workspace). None of them needs the containers
running; all of them need **the start script to have run at least once**, because they assert its
output. `stackGuard` covers "containers are up" and nothing covers "the start has produced its
files", so `--no-system` promises a suite that runs without the stack and does not deliver one.

The cost is not only the broken promise. On a machine that has never started, these fail with
`expected true, received false`, while the system cases fail with *"stack not running … Start the
stack with ./scripts/linux/start.sh"* — the same difference between a refusal that names the next
step and one that does not, which FR20 exists to remove. A second guard asserting the start's
artefacts, with that message, would fix both halves.

Deferred rather than fixed because it is harness work discovered mid-procedure, and A7-5's own record
should carry it once the case completes.

**One unreproduced intermittent failure in the full suite.**
Recorded in the amendment to A5-3's detail block. The M-A5 fixture failed to build once during the
operator's second verification run and has not reproduced since — four consecutive runs, the
aside-and-restore sequence repeated by hand, and the setup executed by hand in the container were all
green. No cause is claimed. Two changes narrowed its surface: the probe directory is now unique per
run, and the setup's output is asserted before its exit code, so the next occurrence will say what
git said instead of only `received: 1`.

**The proof of passage is per clone, not per publication.**
Found by A7-4 on 2026-09-04, and recorded rather than fixed. `git-publish` writes
`.git/liquidupstart-publish` immediately before pushing and removes it afterwards whether or not the
push was accepted, and the hook consumes whatever it finds there. With two publications in flight in
one clone, the permission one mints can therefore be consumed by the other's hook or removed by the
other's cleanup. It **fails closed** — the loser is refused in the hook's words and nothing reaches
the remote, which is what FR18 asks for — so this is not a defect; but which of two well-behaved
publications succeeds is decided by timing. A per-invocation permission (a token naming the process,
or the ref and sha it was minted for, checked by the hook) would remove the interaction. It is
deferred because it changes the mechanism M-A6 signed off, and no requirement asks for it.

**The `git config` error in the A5-9 transcript is inferred, not observed.**
OpenClaw showed `Bash failed: run git config` and the exact argument list is not in the screenshots.
The reading — a `git config --get` on an unset key, which exits 1 — follows from the clone carrying
no local `user.name` or `user.email` and the identity coming from the environment. Expanding the
`Tool error Bash` row in OpenClaw would confirm or refute it. Low value, recorded so the inference is
not later read as an observation.
