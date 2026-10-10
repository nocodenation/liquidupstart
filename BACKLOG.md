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

**~~`timeout -k` on the bounded docker runs.~~** *Done 2026-09-14, and this entry was wrong.*
Suggested in the third review of #11 as an optional improvement to N1, and deferred here on the
grounds that the situation justifying it could not be produced. It produced itself two days later: a
suite run hung fifteen minutes on the N1 case itself, a hand-run of the same command sat attached to
a live container for eight minutes, and an outer `timeout 40` around the whole thing did not return
either — GNU timeout waits for its child after signalling. In that window three of four attempts
needed the kill (rc 137 after the grace) rather than the signal (rc 124). It is **intermittent and
state-dependent**: an hour later, four of four ended at SIGTERM in eight seconds, same host, same
stack, and the four control runs of the case passed without `-k`. So the rate is not a property of
the system, and no cause was established. What is established is that the bound can fail to return
at all, and that without `-k` the start then hangs forever. The lesson is not about `-k`:
**"I cannot reproduce it" is a statement about the attempt, not about the system**, and it is a weak
reason to defer something whose cost was one flag.


**The start waits on one missing deploy key at a time, and the panel shows it that way.**
Proposed by the operator on 2026-09-18, watching the queue: *"die 1. Karte wird zu schnell von der
2. überdeckt ... vielleicht wäre eine Anordnung als Tabs sinnvoller"*. The immediate complaint is
fixed -- the panel now stays on the repository that was skipped for five seconds, and the queue
advances afterwards -- but the shape underneath is what produced it.

`git.sh` waits **sequentially**: `lu_wait_for_operator` for repository 1, and only when that is
settled does it look at repository 2. So an operator who registers the second key while the start is
waiting on the first sees nothing happen until the first is skipped or registered. Tabs over a
sequential wait would promise a freedom the process does not have, which is worse than a queue that
shows its order honestly.

The improvement is the other way round: **wait on every outstanding key at once**, cloning each the
moment its own key appears, in whatever order the operator works. The panel then becomes a set of
equals rather than a queue, and tabs are the honest presentation of that rather than decoration.

Not built here because it changes M-A9's wait, which was signed off as a queue, and because four
questions have to be answered first -- by the operator, before any case is written:

1. **The budget.** It is one deadline for the whole start, refreshed whenever the operator acts. With
   three keys outstanding at once, does one registration refresh it for all three? Probably yes, but
   it is a decision.
2. **The sign-ins.** Claude, Codex, Copilot and Grok wait the same way and are also sequential. Do
   they join the same tabs -- one place for everything the start is waiting on -- or stay separate?
   They differ in kind: a sign-in has a flow with a code to paste, a deploy key has a page to visit.
3. **What "done" means.** With a queue, the panel closes when the last one is settled. With a set,
   does the panel close as each is settled, or stay until all are, with settled ones marked?
4. **The log.** The markers were designed for a queue (`::aiw-git-key-required::<slug>`, last one
   wins). A set needs per-repository state in the log, or the panel and the log will disagree -- which
   is the shape of half the findings this feature has already produced.

Recorded 2026-09-18.

---

## `operator.admin` is reachable from any container on the stack network

**Not a defect of the git integration, and not of the pairing recovery either — it predates both.**
Raised by the reviewer on 2026-09-28 against #9's base `e33d1e6`, measured live, and recorded here at
their request. It is a design question, and the answer changes nginx.

**Rewritten 2026-10-02, and what stood here was wrong about this branch's own feature.** The entry
existed on two branches: this one from 2026-09-30, and #19, which carried the decision taken later
that day. The #19 copy is removed — approving a harness fix should not also sign off a trust boundary —
and this is now the only one. The version it replaces proposed *"set `X-Forwarded-User` only for
requests arriving from the host rather than from the stack's network, or do not route the agents to the
`openclaw.localhost` vhost at all"* and called that the direction that answers the finding. **It would
break the recovery path #15 exists to provide**, which runs its CLI inside that network and through
that vhost. The catch is below, and it is why the decision went to a named address instead.

nginx attaches one constant identity to every request it forwards —
`X-Forwarded-User "user@nocodenation.org"` — and the proxy's address is in OpenClaw's
`trustedProxies`. So a container on the stack network that connects to OpenClaw through nginx with a
fresh device key, presenting itself as the Control UI, is auto-approved with `operator.admin` and no
human involved:

```
security audit: trusted-proxy browser device auto-approved user=user@nocodenation.org device=…
  scopes=operator.admin,operator.approvals,operator.pairing,operator.questions,operator.read,operator.talk,operator.write
```

`exec.approvals.get` then succeeds. Every condition of the auto-approval is either under the client's
control or true for every request: `clientId: openclaw-control-ui` is a connect parameter with no
provenance check, `allowedOrigins` is `["*"]`, and `clientBuildId: "dev"` is accepted because it is a
cache-bust guard rather than a boundary.

**The finding is about the agents.** Admin in the Control UI is expected — it is the operator's own
machine. The agents run on the same network, and `operator.admin` covers `exec.approvals.set` —
whether an agent's shell commands need the operator's approval — as well as `config.apply`,
`terminal.open` and `plugins.install`. An agent steered by a prompt injection in a page or a
repository it read can switch off the step that is meant to supervise it.

**The local network is a second thing, and not what the decision below is about.** The proxy port was
published on every host interface, so anything on the LAN could do the same. That was a promise
`README.md` had made since 2026-07-17 and the compose file did not keep; **#20 repairs it**, with
`SYSTEM_BIND_ADDRESS` defaulting to `127.0.0.1`. Read the identity rule below as doing nothing about
the LAN, and the binding as doing nothing about the agents.

They are not independent, though, and the reviewer's measurement of 2026-10-01 is why: on rootless
Docker a request to `127.0.0.1` and a request to the host's LAN address both reached nginx with the
same `$remote_addr`, the bridge gateway (`10.231.7.1`), while a container on the network arrived as
`10.231.7.3`. So any rule that keys on the address cannot tell the operator's own browser from the LAN
until the port is bound. **#20 is a precondition of the direction below**, not a smaller thing beside
it.

**What #15 changed, and did not.** It moved admin out of the device auto-approval cap into
`gateway.auth.identityScopes`. That removes a pairing step a container could script and stops the
gateway logging its SECURITY WARNING; it leaves the exposure as it is, because the identity is what
nginx asserts for everything.

**The direction, decided by the operator on 2026-09-30:** nginx asserts the identity for the host and
for one named address on the stack network, and for nothing else. It sets `X-Forwarded-User`
unconditionally in three vhosts today — `openclaw.localhost`, `bridge.openclaw.localhost` and
`msteams.openclaw.localhost`, at lines 92, 114 and 136 of
**`config/nginx/templates/nginx.conf`**. That file, not `config/nginx/nginx.conf`: the rendered one is
generated and is not in the repository, and editing it is how a fix survives until the next render.

An address is a position on a network, not a principal. Whoever holds it gets the identity, so the
rule is only as strong as the guarantee that nothing else can hold it — which is the next paragraph,
and the reason this is not one line.

**The catch that shaped the decision.** The obvious form — *"only for requests from the host"* —
breaks the recovery path #15 exists to provide. `config/scripts/openclaw-pairing.sh` runs a throwaway
OpenClaw CLI **inside the stack network** (`--network "$NETWORK"`, with
`--add-host openclaw.localhost:${PROXY_IP}`), because a CLI reaching the gateway directly sends no
identity header and is refused — the dead end of 2026-09-19. So a stack-network client has to keep the
identity, and the question is what nginx can tell that container apart by.

*Two answers were weighed:*

1. **A fixed address.** nginx sets the identity for the host and that address alone. **Chosen.**
2. **A shared secret in a header.** More flexible, and it adds a secret to generate, mount, rotate and
   keep out of logs. Rejected: this stack's argument is that a fact you can read beats one you have to
   remember.

**What the fixed address costs, which an earlier version of this entry understated.** It said the
choice "introduces nothing new to keep". That was false, and the reviewer's #15 review of 2026-10-01
is what corrected it:

- **The pairing helper has no fixed address today.** It runs `docker run --network "$NETWORK"` with no
  `--ip`, so docker assigns one from the pool. A pinned address means a new `.env.example` key, a new
  variable in the nginx template, and an `--ip` on that `docker run` — three things to keep in step,
  not none.
- **Two concurrent helper runs collide.** With the address pinned, the second `docker run` fails with
  *address already in use*. Today they simply get different addresses.
- **An orphaned helper holds the address.** A run killed before its cleanup keeps the container, and
  the next one cannot have the address until something removes it.
- **In its favour, and unsaid until now:** `ip_range: ${SYSTEM_NETWORK_POOL:-10.99.0.128/25}` in
  `compose.yml:898` keeps docker's dynamic pool above `.128`, so a pinned address below it cannot be
  handed to anything else. That is the guarantee the rule needs, and it already exists — **and it is
  enforced rather than assumed**: `lu_ip_in_cidr` in `scripts/linux/start.sh` refuses a
  `SYSTEM_PROXY_IP` that falls inside the pool, and does it before `down.sh` runs, which
  `m-oc.env-reads` holds in four cases. Extending that guard to a second pinned key is the known
  shape of the work, not new ground. It is also where the cost sits: the pool is a variable with a
  default, so two keys have to agree and nothing checks the new one until the guard is extended. That
  is the lesson of the subnet pin, one layer along — ask what else knows the number you just wrote
  down.

Narrowing `allowedOrigins` does not help: a non-browser client sends whatever `Origin` it likes.

**What had to be measured before any of it was written, and two of the four now are.** Whether nginx
can distinguish host traffic at all, and by what. The four combinations that matter are **rootless and
rootful, on Linux and on macOS**, with loopback and LAN read separately in each. The two that are
measured are the **diagonal** — they differ in both dimensions — and they agree:

| Measured | Loopback | The host's LAN address | A container on the stack network |
|---|---|---|---|
| Linux, **rootless**, reviewer, 2026-10-01 | `10.231.7.1` | `10.231.7.1` | `10.231.7.3` |
| macOS, **rootful** (Docker Desktop 4.93.0), 2026-10-10 | `192.168.65.1` | `192.168.65.1` | `10.99.0.148` |

Different mechanisms — a bridge gateway on one, a userland proxy on the other — and the same verdict.
**The rule splits into a half that works and a half that does not, and only the second is a problem:**

- **Host against container separates, on both.** That is the half the decision rests on, and it holds.
  nginx can tell a stack-network client from everything else.
- **Host against LAN does not separate, on either.** The address that identifies the operator's own
  browser identifies every machine that can reach the published port.

The macOS reading was taken six ways, because one reading of an address is a reading of a route and not
of a property: IPv4 loopback, IPv6 loopback (`openclaw.localhost` resolves to both here), the hostname,
the host's LAN address, and — to get a client out of the host's own network namespace — a container on
an unrelated docker network reaching the published port through `host-gateway` and through that LAN
address. **All six arrived as `192.168.65.1`.** The stack-network container was the only client that
arrived as itself.

**Still not measured, and stated rather than implied:** no reading was taken from a second physical
machine. Both rows above originate on the host under test, as did the reviewer's. What the six readings
establish is that the published port collapses the source address of every client that is not on the
stack network, which is the mechanism a LAN peer would also arrive through — but it is an inference from
the route, and the measurement that would close it is one `curl` from another machine.

**One thing was observed that had until now only been read.** `ip_range: ${SYSTEM_NETWORK_POOL:-10.99.0.128/25}`
is the guarantee the pinned address depends on, and the entry above argued it from `compose.yml`. The
container in the table arrived from `10.99.0.148` — inside the pool, where docker's dynamic assignment
belongs — while the proxy itself sits at `10.99.0.2`, below it. The guarantee is now a reading.

**What the pair above does to the decision.** It does not overturn the fixed address; it makes
**#20 a hard precondition rather than an ordering preference**, on two of two combinations measured and
by two unrelated mechanisms. And it exposes a coupling that no document has yet named: #20 makes the
binding a *variable*, `SYSTEM_BIND_ADDRESS`, defaulting to `127.0.0.1` and openable. An operator who
opens the port for a reason that has nothing to do with OpenClaw — reaching pgAdmin from a laptop —
would, once the identity rule is in, hand `operator.admin` to the LAN, silently, because the host
address the rule names is the address the LAN arrives as.

**So the rule cannot be written as a rule about an address alone.** The shape that fits this stack is
the one `lu_ip_in_cidr` already uses: a guard that refuses the combination. If `SYSTEM_BIND_ADDRESS` is
not a loopback address, either the start refuses, or nginx does not assert the identity at all and the
operator is told why. That is a computed answer where the alternative is an operator remembering that
two unrelated keys constrain each other — which is the thing this project does not rely on.

**That is the operator's decision and it is open.** It is written up for #15 rather than built.

**Not built in #9, #15 or #19** because it changes the stack's trust boundary rather than any of those
features, and every case for it has to be written against a live gateway.

Recorded 2026-09-30, direction decided the same day, corrected here 2026-10-02, second measurement
and the binding coupling added 2026-10-10.

---

## The toolbox image does not follow its own Dockerfile

Raised by the reviewer on 2026-09-30 as "not asked for", alongside the blocking finding it belongs to.
`update.sh` now removes the toolbox so an update replaces it (A8-27), and the git step refuses before the
teardown when the tools are missing (A8-24) — but the image still only changes when something removes
it.

The durable form is a label carrying a hash of `config/toolbox/Dockerfile` and `toolbox-entry.sh`. The
dashboard compares it to the image it finds and rebuilds when it differs, so the image follows its
recipe on every path — a checkout updated with `git pull`, an installer update, or a hand-built image.
That is the computed answer rather than the remembered rule: nothing has to know that this particular
update needs a rebuild.

Not built with the blocking fix because the two changes there are enough to merge, and this one touches
the dashboard's build path, which no case currently drives.

Recorded 2026-09-30.
