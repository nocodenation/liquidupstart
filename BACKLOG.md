# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

## Open findings

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
