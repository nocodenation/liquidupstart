# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

Until 2026-09-14 each feature branch carried its own file and none repeated another. #11 merged into
`main` on that day, so the entries the OpenClaw 2026.9.1 migration deferred arrived here with it and
are kept under their own heading below rather than mixed in.

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

## Carried over from the 2026.9.1 migration

*Merged from `main` with #11 on 2026-09-14. Open against the same codebase, recorded separately so
their origin stays readable.*

**`down.sh` leaves behind every container the current branch does not declare.**
Met on 2026-09-08 while switching from `feature/liquid-java-extensions` to this branch: `nar_builder`
survived the teardown and kept running alongside a stack that has no such service, because
`docker compose down` acts on the services in the **current** `compose.yml` and that branch's service
is not in this one. It is the branch-shaped-stack problem from `HANDOFF.md`, one layer down — the
containers that come *up* are this branch's, and the ones that were already there are not
reconsidered.

**It is the one thing this week that announced itself.** Every compose invocation prints
`WARN Found orphan containers (nar_builder) for this project … you can run this command with the
--remove-orphans flag`. Nothing had to be diagnosed; the tool names the problem and the flag. That is
also the risk: a warning on every call that nobody acts on is how a project learns to read past
warnings, which is the failure `HANDOFF.md` records as *a check that cries wolf*.

**Not fixed here on purpose.** `scripts/linux/down.sh` is **byte-identical on `main`, #9, #10 and
#13** — one `docker compose down`, ten lines. Adding `--remove-orphans` on this branch alone leaves
the other three, and the same repair arriving separately in several places is how one file becomes
two that differ. It also changes what teardown means for every stack: `--remove-orphans` removes
whatever the current file does not declare, which is right here and worth a deliberate decision
rather than a drive-by. The orphan itself was removed by hand with `docker rm -f nar_builder`.

**The Claude login expires, and the one idea that might remove the expiry is unmeasured.**
The login lives only in `volumes/_openclaw-claude` and does not survive a reset; the migration cost
four interactive sign-ins in two days. A long-lived `CLAUDE_CODE_OAUTH_TOKEN` was measured and
**refused** — the in-process Agent SDK that serves turns on 2026.9.1 does not authenticate from it,
and leaving it in `.env` would make `start.sh` skip the sign-in, trading a loud failure for a silent
one. That measurement is final and is recorded in `docs/verification/RESULT-openclaw-2026-9-1.md`
§11.

What remains is an idea, stated as an idea: the Claude **CLI** does accept the token, so a CLI call
made with it might materialise a `.credentials.json` that the SDK then reads — which would give the
start an unattended path to valid credentials. Nobody has measured that, and the last two coherent
inferences about this bundle were both wrong. Measure before building: one command in a throwaway
container decides it.

**The `bun_runner` entrypoint should publish its own state instead of being inferred.**
*The finding itself is not here.* It is on `feature/git-integration` and
`feature/liquid-java-extensions` as *"`bun_runner` reports unhealthy with no app, and says nothing
about it"*, found by A7-5 on 2026-09-05 — and **#12 has since fixed the half that made a healthy
stack look broken**: the check no longer probes port 3000 when `/bun_app/package.json` is absent.
This entry is only what #12 deliberately did not do, recorded here because #12 is cut from `main` and
had no backlog to write into.

The check now answers "is something listening on 3000, if an app is deployed?" and infers the rest.
The faithful answer is for the entrypoint to write `waiting` / `building` / `serving` to a file the
check reads — a computed fact rather than an inference, and this project's own idiom. Rejected **for
that branch only**: it changes the entrypoint and therefore the image, on a repair of the released
stack whose whole value is being reviewable in two minutes.

It would also close the gap #12 leaves and states in numbers: while `bun install && bun run build`
runs, `package.json` exists and nothing listens yet, so the check fails. Bounded by `retries: 10` at
`interval: 30s` — a false negative of the same family, only narrower. And the empty log the original
finding named is still empty; one line on startup would settle what the state means either way.

**The OpenClaw CLI cannot reach its own gateway here, and `OPENCLAW_GATEWAY_TOKEN` is a dangling
contract key.** Triggering a turn from inside the container fails both ways: without `--local` the
gateway answers `unauthorized`, and with `--local` it refuses because a gateway is already running
for the same state directory. The cause is the same one behind the September `openclaw devices
approve` failure — `gateway.auth.mode` is `trusted-proxy`, there is no `gateway.auth.token`, and the
CLI sends no identity header. `openclaw doctor` names it: *"Gateway identity-header auth has no
configured token/password path for machine clients."*

Worked around by stopping the gateway and running `--local` in a throwaway container. Not fixed:
giving the gateway a token changes the authentication model, which is not what a version migration
should carry. `.env.example` line 53 already declares `OPENCLAW_GATEWAY_TOKEN` and **nothing reads
it** — the obvious place to start if this is taken up, and worth removing if it is not, because a
declared key nothing consumes is a promise the contract does not keep.

**`volumes/_openclaw-claude/skills` cannot be removed, and the cause was not established.**
An empty directory that resists deletion by its owner with a writable parent, by `rmdir`, and by `rm`
inside a privileged container, which answers `Operation not permitted`. It carries no macOS flags and
is not a mount point.

Sidestepped rather than solved: `docs/PROCEDURE-cold-start.md` §1 archives state with `tar` instead
of copying trees and refreshing them with `rm -rf`, so an archive is one file that gets overwritten
and the whole class of problem disappears. That is the right shape regardless of the cause, which is
why establishing the cause is worth little — recorded so that the next person to meet it does not
spend an hour on it as this run did.

**Two `:latest` fallbacks remain in the `ingest-pdf` plugin build scripts.**
`${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}`, in scripts neither `build.sh` nor `start.sh`
invokes. The plugin's bundle is checked in, so rebuilding it to remove a papercut carries more risk
than the papercut warrants. Every fallback on a path the stack actually walks was removed during the
migration; these two are what is left.

**`timeout -k` on the bounded docker runs.**
Suggested in the third review of #11 as an optional improvement to N1. Every bounded run in
`config/scripts/start/openclaw.sh` carries `--init` now, so PID 1 forwards SIGTERM and the container
ends; `-k 10` would add a SIGKILL after a grace period for a process that catches SIGTERM and refuses
to stop. Real, but the case that would justify it — a bounded run whose process ignores SIGTERM
*through* an init — is one this branch cannot currently produce, so it would be a change with no
control. Take it up with a reproduction, or not at all.
