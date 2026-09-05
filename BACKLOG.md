# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

## Open findings

**The Claude CLI install could not fail, and shipped a broken image.**
Found by A7-5 on 2026-09-05 — the first rebuild of `liquidupstart/openclaw:latest` in weeks. The
start reported `EXIT=0`, printed every URL and password, and OpenClaw could not serve a single
request: `Error: claude native binary not installed`.

The cause is exact. `@anthropic-ai/claude-code` declares eight platform packages as
**optionalDependencies** — including `@anthropic-ai/claude-code-linux-arm64`, the one this container
needs — and its `bin` is `bin/claude.exe`, a launcher that locates the native binary in whichever
platform package installed. None of the eight was present: `/usr/local/lib/node_modules/@anthropic-ai/`
held only `claude-code` itself. The two causes the error message names were both ruled out on the
running container — `ignore-scripts` is `false`, `omit` is `dev`, and there is no `.npmrc` anywhere.
An optional dependency that fails to install is skipped **silently**, by design, so
`RUN npm install -g @anthropic-ai/claude-code` succeeded over a broken result.

**Fixed by making the build check its own work:** the rendered line is now
`RUN npm install -g @anthropic-ai/claude-code && claude --version`, so a rebuild fails where it used
to ship. It is the same shape as the `|| true` removed from Liquid's entrypoint in M-B2 — a step that
could not report its own failure — this time in our own Dockerfile and hitting the component
everything else depends on.

**What is not established:** why the optional dependency did not install. The base image
`ghcr.io/openclaw/openclaw:latest` is one of the seven moving tags A7-5 lists and was pulled fresh
that morning, bringing node 24.19.0 and npm 12.0.2; a registry hiccup during the build would produce
the same result and leave no trace. The fix makes either cause loud rather than silent, which is what
matters; the diagnosis stays open.

**`bun_runner` reports unhealthy with no app, and says nothing about it.**
Seen during A7-5 on 2026-09-05, thirty minutes into a cold start. Its healthcheck probes port 3000;
`volumes/bun_app` is empty because the reset removed it, so nothing listens and the container is
marked unhealthy. Its log is **completely empty** — not a line about starting, about finding no app,
or about what would change it.

Whether idle-without-an-app should report unhealthy is a judgement for whoever owns the service. What
is not a judgement is that the state is **indistinguishable from broken**: the first thing a new
operator does is a cold start, and it ends with one of nineteen services red and nothing anywhere
that explains it. One line on startup — "no application in /bun_app; serving nothing until one is
added" — would settle it either way.

Not this feature's, so recorded rather than fixed. The causal chain is strongly suggested by the
empty directory, the port the check probes and the silent log, but has not been confirmed by watching
the service become healthy once an app exists.

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
