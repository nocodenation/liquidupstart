# Result — the migration to OpenClaw 2026.9.1

Branch `feature/openclaw-2026-9-1`. Analysis in `../FEATURE-openclaw-2026-9-1.md`, cases in
`../TEST-SPEC-openclaw-2026-9-1.md`, measured against the baseline in
`RESULT-cold-start-2026.7.1.md` (2026-09-05, 2026.7.1, all seven checks green).

**The stack runs on OpenClaw 2026.9.1, and the blocker that stopped this in September is gone.**

## What the stack does now

| | |
|---|---|
| OpenClaw in the container | `2026.9.1 (ad6fe23)` |
| Control UI through the proxy | `HTTP 200` |
| Live configuration | valid |
| Claude CLI in the image | `2.1.263 (Claude Code)` |
| `claude-cli/claude-opus-5` | offered, context window `1000000` |
| `gateway.trustedProxies` | `["127.0.0.1/32","172.18.0.0/16"]` |
| Services | all running, **zero restarts**, every healthcheck green |

**OC-8 — the blocker, observed.** The operator opened `http://openclaw.localhost:8888` and the
Control UI loaded fully: sidebar, sessions, the Claude Code and Codex entries, the identity `user`
from the proxy's `X-Forwarded-User`. **No pairing prompt.** A `Session not found` panel appeared for
a session id from the 2026.7.1 state, which the migration moved into SQLite — expected, and not a
fault.

## The automated cases

**41 pass, 0 fail** across six files (plus the 27 dashboard cases). Covering OC-1, OC-2, OC-5, OC-6,
OC-7, OC-10, OC-11, OC-12, OC-13, OC-14, OC-15, OC-17, OC-18, OC-19, OC-21, OC-22, OC-28, OC-31,
and the config sweep.

The implementation is small, as §6 predicted: the version is read from the built image, and the
config writer branches on it. Two of the five affected parts needed no work at all.

## What the run found that the analysis did not

Seven things. Two are product defects of 2026.9.1, one is a defect in the acceptance criterion this
project has used for months, and four are cases that asserted the wrong thing.

### 1. The upgrade path fails, and the fix is not where the message points · OC-28

The first 2026.9.1 start against a state directory written by 2026.7.1 **failed**. `start.sh` exited
1, `docker compose up` reported `dependency failed to start: container openclaw-gateway is
unhealthy`, and the gateway crash-looped ten times until its own restart-loop breaker tripped:

```
Gateway failed to start: Legacy workspace setup state requires migration for
/home/node/.openclaw/workspace; run openclaw doctor --fix.
```

`openclaw doctor --fix` **refuses while any config error stands**, and the standing error was

```
plugins.load.paths: plugin: plugin path not found: /home/node/openclaw-plugins/ingest-pdf
```

That path is not a mount. The gateway's own `command:` copies it from `/opt/plugins` at startup, so
it exists in no other container — and not in the gateway either while it is crash-looping. The
migration is therefore **not reachable by any documented route**. It was performed with a container
that replicates the copy first:

```bash
docker compose run --rm -T --user 0:0 --entrypoint /bin/sh openclaw-gateway -lc '
  mkdir -p /home/node/openclaw-plugins
  cp -a /opt/plugins/. /home/node/openclaw-plugins/
  chmod -R go-w /home/node/openclaw-plugins
  openclaw doctor --fix'
```

After that the second start succeeded. **A cold start cannot find this** — it deletes the state
first — which is why every case in the specification missed it while being the only situation every
existing installation is actually in.

Our three configuration keys survived doctor's rewrite: `deviceAutoApprove` intact, `cliBackends` and
`dangerouslyDisableDeviceAuth` absent.

**Fixed, and verified against the state that produced it.** The start script now reads
`meta.lastTouchedVersion` out of the state — OpenClaw's own record of which version last wrote it —
compares it with the version the image reports, and migrates when the image is newer. It replicates
the plugin copy first, because that is what makes `doctor --fix` willing to run at all.

The proof is an A/B on the same starting state, not an argument. `volumes/_openclaw` was replaced
with `liquidupstart-backups/_openclaw.bak-2026.7.1` — the directory the 2026-09-05 baseline left —
and `./scripts/linux/start.sh` run once:

```
OpenClaw: state was written by 2026.7.1, image is 2026.9.1 — migrating before start.
OpenClaw: state migrated.
openclaw: image reports 2026.9.1; writing the 2026.9 config shape.
start.sh EXIT=0
```

`restarts=0`, `health=healthy`, 19 services, Control UI 200, configuration valid. **The identical
state produced ten crash-loops and `EXIT=1` an hour earlier.**

The order matters and is deliberate: migrate first, write our configuration second. Doctor rewrites
the config as part of the migration — it is what added `plugins.entries.codex` — so anything we care
about has to be written after it, not before. Verified in the same run: `deviceAutoApprove` enabled,
`cliBackends` absent, `dangerouslyDisableDeviceAuth` absent, `plugins.entries.codex` absent,
`trustedProxies` narrowed, and zero `ERROR codex:` occurrences.

**And the same check closes the other direction.** An image *older* than the state is a downgrade,
which OpenClaw refuses with `Refusing to run automatic gateway startup migrations` — again as a
crash loop rather than a message. The start script now refuses first, names both versions, and says
how to recover. That turns OC-21 from an observation into a guard.

### 2. 2026.9.1 enables a plugin it cannot load · OC-31 · **fixed**

`plugins.entries.codex.enabled = true` was **absent** from the 2026.7.1 state and **present** after
the first 2026.9.1 boot. Our start script writes it only when `ENABLE_OPENAI_CODEX=1`, and it is `0`
here — so 2026.9.1's own startup migration added it. It then cannot load the plugin:

```
ERROR codex: Plugin "codex" cannot load because required dependencies are missing:
@openai/codex, smol-toml.
```

Measured: `@openai/codex` is present in `ghcr.io/openclaw/openclaw:2026.7.1` and **absent** from
`:2026.9.1`. The operator sees a permanent error badge in the Control UI for a feature they switched
off — visible in the screenshot that confirmed OC-8.

Fixed by extending the sweep: when `ENABLE_OPENAI_CODEX` is 0, `plugins.entries.codex` is removed,
whoever wrote it. The same for `xai`. OC-31's counterpart asserts it stays when the operator *did*
ask for it, so the sweep fixes the symptom rather than breaking the feature.

### 3. The acceptance sweep is timing-dependent · OC-30

While the gateway was on its tenth restart, the sweep this project has used since A7-5 reported
**"all running, none unhealthy"** — and it was reported to the operator as such. `docker compose ps`
shows a crash-looping container as `running` with health `starting` in the window between two
crashes. The filter is not wrong; it depends on when you look, which is not a criterion.

`tests/lib/health.ts` reads status, `RestartCount` and health per container: it runs, it has not
restarted, and if it declares a healthcheck it has reached `healthy` rather than sitting in
`starting`.

Every "all services running" claim in this repository was made with the old sweep, the 2026-09-05
baseline included. Those results are not invalidated — the stack was sound and `bun_runner` is the
only thing the sweep ever caught — but they carry less confidence than they read, and that belongs
on the record.

### 4. Four cases that asserted the wrong thing

**OC-8 and OC-9 cannot be automated.** OC-9 ran first, as the specification required, so its observed
refusal would be OC-8's fixture rather than a guess. It found there is **no refusal to observe
without a browser**: with and without `deviceAutoApprove` the stack answers identically on `/`,
`/healthz`, `/api/*`, `/rpc` and `/control-ui-config.json`, and the WebSocket sends the same first
frame in both — `{"type":"event","event":"connect.challenge","payload":{"nonce":"…"}}`. The decision
happens after the client signs that challenge. Writing OC-8 against `/` → 200 would have been green
and worthless. They are documented manual checks now, and OC-8 has been performed.

**OC-10 asserted `doctor`.** It expected `gateway.trusted_proxy_device_auto_approve_admin` at severity
critical. Doctor never surfaced it. What fires every time, verbatim, is a gateway log line at
startup. Asserting doctor would have shipped a guard that never fires — worse than none, because it
reads like one.

**OC-22 read the wrong object.** `agents.defaults.models` routes provider wildcards to a runtime and
carries no context window; the pinned windows live in `models.providers["claude-cli"].models`.
Nothing had regressed — the case had.

**Both log assertions read someone else's result.** The first version greped the last 300 lines,
which still held a `SECURITY WARNING` from a manual probe ten minutes earlier. Each case now records
the moment its own restart began and reads only from there.

### 5. Three floating image references, and one npm major

`config/scripts/start/openclaw.sh` ran its three helper containers on
`ghcr.io/openclaw/openclaw:latest` — using the image only as a `node` runtime, but pulling whatever
`:latest` is and writing the config for a gateway running something else. #11 pinned the Dockerfile
and left these behind. They now use the image the gateway actually runs, which is also what makes the
version probe mean anything.

And 2026.9.1's base image ships **npm 12**, where `--allow-scripts` is load-bearing; 2026.7.1 ships
npm 11, where it is inert and merely warns. The same line is correct on both — measured on the
baseline and again here, where the build ended in `2.1.263 (Claude Code)`.

### 9. 2026.9.1 runs the anthropic backend in-process, so the wrapper is off the model path · OC-4

**OC-4 is answered, and inverted.** It asked whether the PATH wrapper alone suffices on 2026.7.1,
so that the retired `cliBackends` key could be dropped for both versions. The real answer is that on
**2026.9.1 the wrapper is not used for model turns at all.**

2026.9.1 replaced spawning the `claude` binary with the **Claude Agent SDK, running inside the
gateway process**. Measured in both images — `extensions/anthropic/` carries **0** agent-sdk files in
2026.7.1 and **5** in 2026.9.1 — and observed in every run: the wrapper, instrumented to log each
invocation, was never called, while the turn reached the backend and completed.

```
[agent/cli-backend] cli exec: provider=claude-cli model=claude-opus-5
[CLAUDE_SDK_CAN_USE_TOOL_SHADOWED] Warning: canUseTool will not be invoked …
[agent/cli-backend] cli turn: durationMs=3388 outBytes=23 outHash=245696534a34
liquidupstart-oc4-probe
```

**Nothing had to be built for this.** The wrapper injected three things, and each turns out to be
either already satisfied or unnecessary on 2026.9.1: `CLAUDE_CONFIG_DIR` is redundant because the
gateway runs with `HOME=/home/node` and the credential mount is at `/home/node/.claude`;
`IS_SANDBOX` proved unnecessary, since the turn completed as root without it; and the
`CLAUDE_CODE_OAUTH_TOKEN` forwarding still works where it is used, because the start script's own
CLI containers name the wrapper as their entrypoint explicitly rather than relying on PATH.

That distinction is the precise statement: **the wrapper is off the gateway's model path and still on
the start script's explicit path.** It is not dead code; it is code with a smaller job.

**And it was nearly a repair of a problem that did not exist.** The first turn failed with `Failed to
authenticate: OAuth session expired and could not be refreshed`, and the reasoning above — wrapper
bypassed, therefore environment not injected, therefore authentication broken — is coherent and was
wrong. The operator signed in again and the identical command returned
`liquidupstart-oc4-probe`. The cause was only the expired session. Measuring first cost one message;
building first would have added an environment variable against nothing.

**No API billing is involved, and none was proposed.** The route is `claude-cli`, not `anthropic`:
the failure named an OAuth session rather than a key, the fallback decision recorded `next=none`, and
`ANTHROPIC_API_KEY` is empty in `.env`. What 2026.9.1 changed is where the code runs, not what it
bills.

### 10. The OpenClaw CLI cannot reach its own gateway here

Triggering a turn from inside the container fails both ways: without `--local` the gateway answers
`unauthorized`, and with `--local` it refuses because a gateway is running for the same state
directory. The first is the same root cause as the September `openclaw devices approve` failure —
`gateway.auth.mode` is `trusted-proxy`, there is no `gateway.auth.token`, and the CLI sends no
identity header. `openclaw doctor` names it: *"Gateway identity-header auth has no configured
token/password path for machine clients."*

Worked around here by stopping the gateway and running `--local` in a throwaway container. Not fixed:
giving the gateway a token is a change to the authentication model, not part of this migration.
`.env.example` already declares `OPENCLAW_GATEWAY_TOKEN` and **nothing reads it** — dangling contract
surface, and the obvious place to start if this is ever taken up.

### 11. The long-lived token would not have worked · **measured, and not built**

The Claude login expired **three times on 2026-09-06/07**, and each expiry turns an unattended start
into a blocking prompt — twice it also produced a wrong diagnosis, because the prompt is written to
`/dev/tty` and never reaches the log, so a run that is waiting for a code looks exactly like a run
that has hung.

A long-lived `CLAUDE_CODE_OAUTH_TOKEN` looked like the answer, and the design was worked out in
full: three declarations (`.env.example`, the OpenClaw env template, the start script's injection
list) so the token would reach the gateway process through the same `env_file` that already carries
`OPENAI_API_KEY`, plus a validity probe and four new cases.

**None of it was built, because the deciding assumption was measured first and turned out false.**

| Run | File login | Token in env | Result |
|---|:---:|:---:|---|
| negative control | — | — | `Not logged in · Please run /login` |
| **the case** | — | ✓ | **`Not logged in · Please run /login`** |
| CLI control | — | ✓ | `loggedIn: true` |

The third row is what makes the second mean something. **The same token and the same empty
credential directory**: the Claude CLI accepts it, the in-process Agent SDK does not. The token is
valid; the SDK simply does not authenticate from it in this configuration.

**And the bundle had said otherwise, or seemed to.** `CLAUDE_CODE_OAUTH_TOKEN` appears in the
agent-sdk files and in a list of auth environment variables, which was read as *the SDK takes the
token as a credential*. With the measurement in hand the same line reads differently:

```js
if (!p && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) m = await refresh();
```

The token **suppresses the refresh path** rather than supplying credentials. So it is not merely
useless there — it could prevent a refresh that would otherwise have succeeded.

**Leaving it in `.env` would have been actively harmful**, and this is the part worth keeping. The
start script branches on it:

```
if [[ -n "$OAUTH_TOKEN" ]]; then
  echo "Claude CLI: using CLAUDE_CODE_OAUTH_TOKEN from .env (… no interactive login needed)."
```

With the token set, the start skips the interactive sign-in *even when the file login has expired* —
and the SDK cannot use the token. The result is a start that reports success while OpenClaw can
answer nothing: the loud failure traded for a silent one. That is exactly the failure mode the
proposed validity probe was designed to prevent, and adopting the token without building the probe
would have introduced it. The token was removed from `.env`, and the copy of `.env` that held it was
deleted rather than kept as a backup.

**What remains open:** the login still expires, and the credentials file is the only source the SDK
accepts. One idea is untested and stated as an idea: the CLI *does* accept the token, so a CLI call
made with it might materialise a `.credentials.json` the SDK then reads, which would give the start
an unattended path to valid credentials. Nobody has measured that. `BACKLOG.md`.

**The cost of measuring first was one command.** The cost of building first would have been three
contract changes, a probe, four cases, and a stack that fails quietly the next time the login
lapses. This is the second time in two days that a coherent inference from a minified bundle was
wrong, and the second time measuring caught it.

## Suite 2 — the compatibility question, executed

**424 pass, 0 fail**, plus the 27 dashboard cases, on a 2026.9.1 stack carrying the git integration
(#9), the Java extensions (#10) and this migration at the same time.

Run on `integration/oc-2026-9-1`, which exists for exactly this and is **not a branch to merge**.
`git-repo-info` and `nar-build` do not exist on a branch cut from `main`, so the claim that the
migration does not break the two features in flight could only be *executed* where its subject lives.
It has been.

The stack it ran against: `git-repo-info` at `/usr/local/bin/`, one `nar_builder` container,
`OpenClaw 2026.9.1 (ad6fe23)`, every service running with zero restarts and every healthcheck green.
The image carries both halves — the 2026.9.1 pin and the `openssh-client` the git integration needs.

The three named cases, asserted under their own identifiers:

| | |
|---|---|
| **OC-23** | `git-repo-info nocodenation/agent-skills` → exit 0, `branch policy protected`, `clone status cloned` |
| **OC-24** | A direct `git push` on a clone is refused: `pre-push refused: this push did not come through git-publish.` followed by git's own `error: failed to push some refs`. The guardrail still bites on 2026.9.1 |
| **OC-25** | `nar-build` answers with its usage |

**OC-24 is the one that matters.** A guardrail that still exists but no longer refuses is worse than
one that is gone, and a version change to the harness it lives in is exactly the kind of thing that
could have hollowed it out without touching its code.

### The first run was red, and the reason is worth keeping

420 pass, **4 fail** — A3e-7 twice and A4-14 twice, all in the git integration. Not a compatibility
defect: `volumes/repos` was empty because the clone failed with `Permission denied (publickey)`. The
deploy keys in use had been generated **that morning**, by the first start of a git-integration-shaped
branch since 2026-09-05; the keys registered with GitHub were the older ones. `git.sh` generates keys
when it finds none, and the migration never touched `volumes/_git-secrets`.

**The feature reported it correctly**, which is the part worth recording:

```
clone status   not cloned — git@github.com: Permission denied (publickey)
The declaration is in place; the clone itself failed. The operator has to
register the deploy key above with the repository host and start the stack
again. Report that rather than cloning it yourself.
```

That is what M-A3e was built to say. The operator registered the two public keys, both authenticated
against GitHub before the stack was touched again, one restart produced both clones, and the four
cases went green.

It is also a reminder that the precondition A7-5 documented is not a one-off: **switching between a
`main`-shaped branch and a feature-shaped one silently invalidates the deploy keys**, because the
key material lives under `volumes/` while the code that uses it lives on the branch.

### 12. `:latest` moved again, and the version string does not identify the image

Found on 2026-09-07 by the first run of `scripts/linux/image-digests.sh`, which exists because the
operator asked what step 1 of the cold-start procedure actually requires of them — it said "use the
block from step 6", which is not something anyone can run.

```
2026-09-05   ghcr.io/openclaw/openclaw:latest   sha256:6afe42854c87…
2026-09-07   ghcr.io/openclaw/openclaw:latest   sha256:a8604855b76c…
```

Both that image and `:2026.9.1` report **`OpenClaw 2026.9.1 (ad6fe23)`** — same version, same
commit, different bits. `:latest` was **rebuilt**, not bumped.

**The version string does not identify the image.** A rebuild can change the base layers underneath
an unchanged version, which is precisely how npm went from 11 to 12 and shipped an image whose
Claude CLI had no binary while the build reported success. Anything that depends on the environment
rather than on OpenClaw itself can move without a version number moving with it.

**And the pin is doing its job.** `:2026.9.1` resolves to the same digest it did on 2026-09-05,
while the floating tag moved twice in three days. That is the argument for pinning, restated as a
measurement rather than as a principle.

The snapshot is kept as `liquidupstart-backups/digests-20260907-latest-moved.txt`.

## What is not done

- **OC-3**, **OC-4**, **OC-16**, **OC-20** are specified and not run. OC-4 is the interesting one:
  it decides whether the `cliBackends` key is needed on 2026.7.1 at all, and could remove one branch
  from the version split.
- **Suite 2** — OC-23 to OC-27 — needs an integration branch carrying #9 and #10.
- Two `${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}` fallbacks remain in the `ingest-pdf`
  plugin build scripts. Neither `build.sh` nor `start.sh` invokes them, and the plugin's bundle is
  checked in, so rebuilding it carries more risk than the papercut warrants.
