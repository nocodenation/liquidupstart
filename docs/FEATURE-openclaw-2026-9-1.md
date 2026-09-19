# Migrating the stack to OpenClaw 2026.9.1

**Status: analysis complete, nothing implemented.** This document establishes what must change and
why, before any code is written. The test cases are in `TEST-SPEC-openclaw-2026-9-1.md` and are
signed off before implementation begins.

Branch `feature/openclaw-2026-9-1`, cut from `fix/openclaw-2026-9-1` (#11) with
`fix/bun-runner-health` (#12) merged. The baseline it is measured against is `PROCEDURE-cold-start.md`,
verified 2026-09-05: `verification/RESULT-cold-start-2026.7.1.md`.

---

## 1. Why this exists

On 2026-09-05 `ghcr.io/openclaw/openclaw:latest` moved to 2026.9.1 and broke four things in a stack
whose own code had not changed since June. The repair (#11) was to **pin** to 2026.7.1, so that
moving off it becomes a decision rather than an event. This document is that decision, prepared.

Three of the four faults were repaired for 2026.9.1 in #11's history and then deliberately reverted
when the pin was chosen. **One was never solved**, and it is the one that makes the interface
unusable: browsers demand a device pairing whose approval path is unreachable in this deployment.
That is the centre of this work.

The two versions, by registry digest — measured, not inferred:

```
ghcr.io/openclaw/openclaw:2026.7.1   sha256:6a31d44b2944e7adcd2b582bf6fb463111264ebca97a0201795b799135bd102c
ghcr.io/openclaw/openclaw:2026.9.1   sha256:6afe42854c87471188b9c4f8dce6bbc14005a48d8e1592846548b32508754f84
ghcr.io/openclaw/openclaw:latest     sha256:6afe42854c87471188b9c4f8dce6bbc14005a48d8e1592846548b32508754f84
```

`:latest` and `:2026.9.1` are bit-identical. That `:latest` serves 2026.9.1 was previously an
inference; it is now a comparison of two digests.

## 2. Goals

| | |
|---|---|
| **OC-G1** | Every feature of this stack works on OpenClaw 2026.9.1 without restriction. |
| **OC-G2** | As much as possible stays backward-compatible, so few of our own mechanisms have to be raised to the new version's level. |
| **OC-G3** | The footprint of the change is as small as full usability permits — and no smaller. |
| **OC-G4** | The change does not break what works today (`main`), nor the two features in flight: **A** the git integration (#9) and **B** the Liquid Java extensions (#10). |
| **OC-G5** | An operator who cannot reach the Control UI has a way back that does not require a terminal, a device id, or knowledge that device tokens exist — and that way is exercised rather than assumed. Added 2026-09-19; see §9. |

OC-G4 is why there are **two** suites. See §7.

## 3. How the analysis was done

Two computed comparisons, not a reading of release notes:

**The configuration schema of each version, diffed.** `openclaw config schema` run in a stock
container of each version, flattened to key paths, and compared:

```bash
docker run --rm --entrypoint openclaw ghcr.io/openclaw/openclaw:2026.7.1 config schema
docker run --rm --entrypoint openclaw ghcr.io/openclaw/openclaw:latest    config schema
```

3808 key paths in 2026.7.1, 3700 in 2026.9.1: **923 removed, 815 added.** A large release, of which
almost nothing concerns this stack. The part that does was found by intersecting that diff with the
**keys our own start script writes**, extracted from `config/scripts/start/openclaw.sh` rather than
remembered.

**The shipped bundle of each version, searched.** `/app/dist` in both images, for the behaviour the
schema cannot show. This mattered: **the schema tells you what is accepted, not what is honoured.**
Two of the four faults are invisible in a schema diff, because the keys involved are still valid —
they are simply no longer read.

Neither method relies on a changelog, and neither can go stale the way a remembered rule does.

## 4. What our stack writes, and what became of it

Every configuration key `config/scripts/start/openclaw.sh` writes, checked against both schemas:

| Key we write | 2026.7.1 | 2026.9.1 | |
|---|:---:|:---:|---|
| `agents.defaults.cliBackends` | yes | **no** | **retired — hard failure** |
| `agents.defaults.memorySearch{,.model,.provider}` | yes | **no** | **relocated — hard failure** |
| `gateway.controlUi.dangerouslyDisableDeviceAuth` | yes | yes | **still valid, no longer honoured** |
| `gateway.trustedProxies` | yes | yes | valid; **enforcement changed** |
| `gateway.auth.mode` · `.trustedProxy.userHeader` · `.allowLoopback` | yes | yes | unchanged |
| `gateway.controlUi.allowedOrigins` | yes | yes | unchanged |
| `gateway.http.endpoints.chatCompletions.enabled` | yes | yes | unchanged |
| `agents.defaults.models` · `models.providers.*` | yes | yes | unchanged |
| `plugins.load.paths` · `plugins.entries.{codex,xai}.enabled` | yes | yes | unchanged |

**Of everything this stack configures, exactly two keys are gone and one is a hollow survivor.** The
rest is untouched by the release. That is the measured basis for OC-G3: the footprint is small
because the surface we depend on barely moved.

---

## 5. The five affected parts

Each in the required three-part view: how it worked, what changed, what must be adapted.

### 5.1 The Claude CLI backend command · **hard failure**

**How it worked.** OpenClaw strips Claude/Anthropic environment variables before spawning the CLI
(`CLAUDE_CLI_CLEAR_ENV`), so `config/openclaw/openclaw-claude.sh` re-injects `CLAUDE_CONFIG_DIR`,
`IS_SANDBOX` and an optional OAuth token, then execs the real binary. The stack pointed OpenClaw at
that wrapper with

```js
c.agents.defaults.cliBackends["claude-cli"].command = "/usr/local/bin/openclaw-claude";
```

**What changed.** `agents.defaults.cliBackends` is **not a configuration key in 2026.9.1 at all** —
it does not appear anywhere in the schema. Writing it fails validation outright:

```
openclaw.json:3 - agents.defaults: Unrecognized key: "cliBackends"
```

And the failure is worse than an error message. `register_anthropic_cli_profile` runs `openclaw
models auth login` under a pty, which `models auth login` requires; with a pty attached, OpenClaw
answers an invalid config by offering `Run "openclaw doctor --fix" now? [Y/n]`. No stdin is
connected to a one-shot container, so an unattended start **hangs indefinitely**.

The bundled anthropic plugin now owns the backend and resolves the CLI itself; its
`resolveCliExecutionTarget` dispatches on `backendId === "claude-cli"` and offers no command
override.

**What must be adapted.** Stop writing the key. The interposition already exists by another route:
the image installs the wrapper as `/home/node/.local/bin/claude`, which precedes `/usr/local/bin` on
PATH, and the wrapper execs `/usr/local/bin/claude` by absolute path so it cannot re-enter itself.
**That Dockerfile step is already on this branch** — #11 kept it.

**Open question, and it decides whether this costs anything at all.** The PATH wrapper works on
2026.7.1 too. If it does the whole job there, the config key can simply be dropped for **both**
versions and this part has zero version-specific code. That is a hypothesis, not a conclusion — it
is case **OC-4** in the test specification.

### 5.2 Memory search relocation · **hard failure, only with Copilot**

**How it worked.** With `ENABLE_GITHUB_COPILOT=1` the stack exposed `/v1/embeddings` and pointed
memory search at Copilot via `agents.defaults.memorySearch.{provider,model}`.

**What changed.** The whole subtree moved to top-level **`memory.search.*`**. The old path is gone
from the schema: the same hard validation failure and the same hang as 5.1.

**What must be adapted.** Write `memory.search.*` instead. **Not backward-compatible in either
direction:** `memory.search` does not exist in 2026.7.1's schema, and `agents.defaults.memorySearch`
does not exist in 2026.9.1's. This is the one place where a single configuration cannot satisfy both
versions.

**Never triggered in this installation** — `ENABLE_GITHUB_COPILOT=0`. A Copilot user would have hit
the identical hang. It is a latent break, which is why it needs a test rather than an observation.

### 5.3 Control UI device pairing · **the blocker**

**How it worked.** `gateway.controlUi.dangerouslyDisableDeviceAuth = true` switched off per-browser
device identity. It was necessary because `allowInsecureAuth` is localhost-only, and behind the
proxy the gateway sees the proxy's address rather than localhost. In 2026.7.1 the flag is read and
acted on — the bundle contains `dangerouslyDisableDeviceAuth ? null : params.deviceRaw`.

**What changed.** In 2026.9.1 the flag survives in the schema — so there is **no validation error to
warn you** — but it appears in the bundle only inside `legacy-*.js`, carrying its own epitaph:

> `dangerouslyDisableDeviceAuth is retired and ignored. Control UI browsers pair through the normal
> device flow; run "openclaw doctor --fix" to remove the legacy key.`

The consequence is that every browser is asked for a one-time approval, and the approval path the
interface names does not work here: `openclaw devices approve <id>` ends in `unauthorized`, because
`gateway.auth.mode` is `trusted-proxy`, no `gateway.auth.token` is configured, and `gateway.remote`
is empty. Without `--url` the CLI is unauthorized; with `--url` it demands `--token` or `--password`.

**This is what stopped the migration in September and is still unsolved.**

**What must be adapted.** 2026.9.1 ships a designed replacement, found in the bundle:

```
gateway.auth.trustedProxy.deviceAutoApprove: { enabled: boolean, scopes: string[] }
```

> *"Automatically approves new browser operator devices and same-key scope upgrades after the reverse
> proxy authenticates an allowed user. Default: false. Grants are capped by `deviceAutoApprove.scopes`
> and the proxy's `x-openclaw-scopes` header when present."*

It applies **only when `gateway.auth.mode === "trusted-proxy"`** — this stack's mode — and it exists
only in 2026.9.1.

**And it needs a decision, not just a setting.** Our nginx does not authenticate anyone: it sets a
constant identity header.

```nginx
proxy_set_header X-Forwarded-User "user@nocodenation.org";
```

Enabling auto-approval therefore means *anyone who can reach the proxy gets an operator device*.
Two things make that defensible and one makes it dangerous:

- It is **the same posture the stack already has** on 2026.7.1, where `dangerouslyDisableDeviceAuth`
  removes the check entirely. This is not a new exposure; it is the old one, expressed in the new
  version's vocabulary.
- The stack binds to localhost on a single host by design.
- But **the scopes matter.** Granting `operator.admin` makes OpenClaw log a security warning and
  `doctor` raise a **critical** finding: *"every proxy-authenticated user can auto-approve a new
  browser device with full admin, and requests without scopes receive full admin automatically.
  Remove `operator.admin` and grant admin per identity via `gateway.auth.identityScopes` instead."*

**Decided by measurement on 2026-09-10, and it is the opposite of what was proposed here.** The
proposal was the least scopes that make the Control UI usable, with `operator.admin` excluded *unless
a case proves the interface unusable without it*. That case now exists, it was run, and it does not
prove a degraded interface — it proves no interface at all.

**What was measured.** With the six non-admin scopes configured, the operator's device was revoked
from the Devices page and the browser reconnected. It did not lose the admin-gated pages; it did not
connect:

> *Role upgrade pending. This browser is already known, but the requested access changed and needs a
> fresh approval.*

The Control UI requests `operator.admin` among its default scopes, and this list is a **cap on what an
auto-approval may grant**, not the set a device receives — so the upgrade stays pending forever. The
gateway logs `security audit: device access upgrade requested reason=role-upgrade` on every attempt
and nothing approves it.

**And the documented way back does not work here.** The interface names
`openclaw devices approve <id>`; it answers `unauthorized` from inside the gateway container **and**
from `openclaw-cli`, which shares the gateway's network namespace, for the reason this section
already gives above — `trusted-proxy` mode wants a header the CLI does not send.

> **Corrected 2026-09-19.** This section used to end *"an operator who revokes their own device has
> no path back through any documented route"*. That is false, and it was false when it was written.
> The CLI is refused because it reaches the gateway **directly**, where no header is set. Sent
> **through nginx** instead, the same CLI is authenticated — nginx sets `X-Forwarded-User` for
> anything that arrives on that route, whoever sends it. What was missing was not a path but a
> scope, and `gateway.auth.identityScopes` supplies it. Measured, and specified in §9.

**Why the earlier measurement missed it.** The device in use had been granted `operator.admin` under
2026.7.1's `dangerouslyDisableDeviceAuth` and kept it: `scopes: … operator.admin` on a configuration
that never granted it, while `operator.talk` — which *was* configured — is absent from the same
device. Every page worked, a `config.patch` write from the UI succeeded, and the interface looked
sound. Only a **fresh** approval exercises the cap, and until 2026-09-10 nobody had asked for one.

**So `operator.admin` is in `deviceAutoApprove.scopes`**, written by
`config/scripts/start/openclaw.sh`. `gateway.auth.identityScopes` was tried first, as this section
suggested, and changes nothing **for the browser**: it grants scopes to an identity, while what
blocks is the cap on the device approval. Re-measured on 2026-09-19 with the same result, so this
half stands.

> **What that sentence got wrong, corrected 2026-09-19.** *Changes nothing* was read as a verdict on
> the setting. It is a verdict on one of its two uses. The same grant makes the **CLI** usable
> through the proxy, which is the whole recovery path — see §9. A measurement that answers one
> question was filed as the answer to the other.

The trade is stated rather than hidden. The gateway logs a SECURITY WARNING naming `operator.admin`
whenever it is in this list, which is exactly what OC-10 asserts, and that warning is now expected
output rather than a finding. It restores the posture 2026.7.1 had; the migration gave that up by
accident, not by decision, and this is where the accident was found.

This is the one place where the migration adds a security decision rather than a translation, and it
is flagged here so it is reviewed as one — now with the measurement that decided it.

### 5.4 Trusted proxy attribution · **repaired again 2026-09-16 — the rule was misread**

**How it worked.** `gateway.trustedProxies` listed loopback plus the three RFC1918 ranges, and had
since 2026-06-06.

**What changed.** 2026.9.1 rejects proxy-shaped traffic it cannot attribute — HTTP 403,
`proxy_attribution_required`, with the gateway logging *"observed unattributable proxy-shaped traffic
from 172.18.0.21"*.

**The rule this section stated was wrong, and was corrected on 2026-09-16.** It read: *"a list that
wide is refused even when the peer falls inside it … a single /16 is accepted, so narrowly means one
network, not one address."* Both measurements were real; the rule drawn from them was not. The
mechanism is **membership, not width**. `resolveForwardedClientIp` walks `X-Forwarded-For` right to
left and discards every hop that is loopback or listed in `trustedProxies`; whatever remains is the
client, and **if nothing remains the request is refused**. A wide list and a narrow list differ only
in whether they happen to contain the client.

On Docker Desktop a request from the host arrives as `192.168.65.1` — inside the old wide list
(`192.168.0.0/16`), outside the stack's own subnet. Narrowing therefore fixed it here by coincidence,
and the coincidence was read as a mechanism. Two consequences were invisible from this host:

- **On rootless docker with the `builtin` port driver the host arrives as `10.99.0.1`**, inside the
  stack subnet, so the Control UI answers 403 to a browser and OpenClaw never comes up at all. Found
  by Timur on 2026-09-16 (#9, review point 5), on a host this repository had never run on.
- **Every container in this stack was already affected here**, and nobody noticed. Measured
  2026-09-16 with the subnet trusted: from the host `192.168.65.1` → 200, from a stack container
  `10.99.0.11` → 403. The gateway had been logging the rejection since 2026-09-15.

**What must be adapted: trust the proxy, not the network it sits in.** `compose.yml` gives the proxy
a fixed `ipv4_address` from `SYSTEM_PROXY_IP`, and `openclaw.sh` writes
`trustedProxies = ["127.0.0.1/32", "<that address>/32"]`. One address is discarded as a hop; every
other client survives the walk and is attributed. Verified 2026-09-16: the container client went from
403 to 200, the host client stayed at 200, and the gateway logged nothing further.

A third key comes with it. Docker allocates from the bottom of the subnet and the proxy starts last —
every other service is its dependency — so a pinned `.2` was already taken and the start failed with
*"Address already in use"*. `SYSTEM_NETWORK_POOL` declares the range docker may allocate from
(`ip_range`), leaving the rest for pinned addresses. `start.sh` refuses a proxy address inside the
pool, or outside the subnet, **before** `down.sh` empties the stack.

### 5.5 The npm major version · **already repaired, kept**

**How it worked.** `@anthropic-ai/claude-code` fetches its native binary in a `postinstall`.

**What changed.** 2026.9.1's base image ships **npm 12**, which blocks install scripts unless
`allowScripts` names the package. The install succeeds with a warning and the image ships a launcher
with nothing to launch — the start then reports success, prints every URL and password, and OpenClaw
cannot serve a single request.

This is not an OpenClaw change at all. It rides along in the base image, and it is the reason the
first symptom looked like a stack defect.

**What must be adapted: nothing.** The rendered line already passes `--allow-scripts` for that
package and ends in `claude --version`, so an install producing nothing fails instead of shipping.
Measured on the baseline: 2026.7.1 ships **npm 11.13.0**, where the flag does not exist and merely
warns —

```
npm warn Unknown cli config "--allow-scripts". This will stop working in the next major version of npm.
2.1.261 (Claude Code)
```

— so the same line is correct on both. **Zero footprint**, and again a regression case rather than a
change.

---

## 6. The resulting footprint

| Part | Work | Backward-compatible with 2026.7.1 |
|---|---|---|
| 5.1 Claude CLI backend | Stop writing one key | **Probably yes, unconditionally** — pending OC-4 |
| 5.2 Memory search | Write `memory.search.*` | **No.** Neither path exists in both |
| 5.3 Device pairing | Add `deviceAutoApprove` + choose scopes | **No.** Key absent from 2026.7.1 |
| 5.4 Trusted proxies | none | yes, already |
| 5.5 npm allowScripts | none | yes, already |

Two of five parts cannot be expressed in a single version-neutral configuration, because the
replacement keys simply do not exist in the older schema. So OC-G2 forces a choice:

**Option A — pin to 2026.9.1 and write only the new keys.** Smallest diff, no version logic. Cost:
the stack can no longer run 2026.7.1, and the fallback that #11 bought us is gone.

**Option B — probe the version at start and write accordingly.** `openclaw --version` is one line in
a container the start script already runs. Cost: one branch in the config writer and both paths need
testing.

**Recommended: B.** Not for the sake of supporting old versions, but because the last incident cost a
day and the ability to step back was what ended it. It is also this project's own doctrine — a value
read at the moment it is needed cannot go stale, whereas a pin plus a comment can. The extra code is
one probe and two branches; the extra tests are cases we would want anyway.

**Whichever is chosen, the base image stays pinned to an exact version.** The move is from one pin
to another, never back to `:latest`.

### 6.1 The bound, repaired again 2026-09-17 — it did not exist on the operator's host

The start bounds eleven `docker run` calls through `with_timeout`, which is the protection that
replaced OC-3 and the reason the September hang cannot come back. It ended in `else "$@"`: on a host
with neither `timeout` nor `gtimeout` — both GNU coreutils, and macOS ships neither — the command ran
**unbounded**, with nothing said. The call site reads `with_timeout 60 docker run …`; what ran was
`docker run …`. So on the machine the operator actually starts the stack from, none of the eleven was
bounded.

It was found by running the suite, three times in one afternoon: N1's own probe container, bounded at
8s with a 10s grace, stood for 13 minutes and then twice for over a minute. The case could not report
it — a bun test cannot interrupt a synchronous spawn, so the suite hung instead of going red, and it
had been skipping silently before that because the probe image did not exist on this machine yet.

`config/scripts/start/lib/with-timeout.sh` is now the one implementation for both start scripts;
`openclaw.sh` and `git.sh` each had a copy, so the fallback existed twice. Coreutils is still
preferred where present. Where it is not, the command runs under a watchdog — SIGTERM at the limit,
SIGKILL after the grace — and the helper answers 124, the number coreutils uses, so a caller cannot
tell the two hosts apart. Control in the same session: the old shape, given a 3-second bound on a
6-second command, returned after 6.01s with rc 0; the replacement returns after 3.04s with rc 124.

## 7. Two suites, because there are two questions

OC-G4 asks two different things, and one suite cannot answer both.

**Suite 1 — the baseline suite**, on this branch. Does 2026.9.1 break what `main` already does? It
runs against `main` + #11 + #12 and knows nothing about the git integration or the NAR work.

**Suite 2 — the compatibility suite**, on an integration branch carrying this branch **plus A
(#9) plus B (#10)**. Do the changes coexist with the features in flight?

The second cannot run here: `git-repo-info` and `nar-build` do not exist on a branch cut from `main`,
and asserting their absence is how a passing cold start gets failed. Both suites are **specified**
here, and each is **run where its subject exists**. Claiming compatibility without executing the
second would be exactly the kind of unbacked assertion this project's method exists to prevent.

## 8. What is deliberately not in scope

**Repairing `start.sh`'s sign-in instructions.** The baseline run found that when no terminal is
attached, the script tells the operator to run `docker compose exec -it openclaw-gateway …` at a
point where no container exists. That is a defect of the released stack and belongs in a repair cut
from `main`. Recorded in `verification/RESULT-cold-start-2026.7.1.md`.

**The `ingest-pdf` plugin's error text** naming `memorySearch.provider`, now stale. A diagnostic
string only; correcting it means rebuilding a checked-in `dist/index.mjs` bundle, which is more risk
than the papercut warrants.

**The 815 keys added in 2026.9.1** that this stack does not use. New channels, agent ownership,
media models, browser SSRF policy. Adopting any of them is a feature decision, not a migration.

## 9. The pairing dead end, and the way back · **specified 2026-09-19, not yet built**

On the morning of 2026-09-19 the operator could not open OpenClaw. Their browser was shown *"Role
upgrade pending — this browser is already known, but the requested access changed and needs a fresh
approval"*, and the three commands the page offered could not be run in this stack. The remedy that
worked was *delete the site data for `openclaw.localhost:8888` and reload*, at which point the
operator said the sentence this section exists for:

> **"das würde kein user von sich aus tun."**

That is the requirement. A recovery which assumes the person knows that device tokens exist, that a
browser stores one, and where a browser keeps them, is not a recovery. **OC-G5.**

### 9.1 Why it happened, which is not what anyone guessed

The device was paired, held role `operator` with every scope — and its token had been **revoked on
2026-09-10 at 12:35:16**. A paired device without a valid token asks for a *repair*, and
§5.3's auto-approval deliberately does not grant repairs: `pendingRecord.isRepair` is one of the two
conditions under which the approval path returns `null`. That is correct behaviour. A revocation
that any returning browser could undo by itself would not be a revocation.

**The revocation was ours.** It is the measurement §5.3 records — *"the operator's device was revoked
from the Devices page and the browser reconnected"* — and the browser profile that carried the
revoked identity did not come back for nine days. Today's incident is that measurement's residue, not
a new defect. Nothing in the stack revokes tokens on its own, and no case has ever asserted what
happens to a device that returns *after* a revocation.

### 9.2 What was measured on 2026-09-19

Every row was run against the live stack before any of it was written down. Two of the four are
negative results, and they are the reason this section is short on promises.

| | Measured | Result |
|---|---|---|
| **M1** | `openclaw devices list` inside the gateway container | `unauthorized … reason=trusted_proxy_user_missing` — as §5.3 records |
| **M2** | The same CLI sent **through nginx**: `--url ws://openclaw.localhost:8888`, with a deliberately wrong `--token unused` | `missing scope: operator.pairing` — **authentication succeeded**, only authorisation was absent. The token is never checked; `--url` merely refuses to run without one |
| **M3** | `gateway.auth.identityScopes` granting that identity the seven operator scopes, then M2 again | The device table printed. Gateway logged `identity scope grant elevated connection identity=user@nocodenation.org addedScopes=operator.admin,…` |
| **M4** | With M3 in place, the operator reloaded the Control UI | **Still refused.** `reason=role-upgrade roleFrom=<none> roleTo=operator`. The device gate is evaluated before identity scopes are applied, so this does **not** prevent the dead end |

M2 is the finding. M4 is the one that had to be run to stop this section from claiming a cure, and it
agrees with the 2026-09-10 attempt §5.3 already records — the same setting, measured twice, nine days
apart, with the same answer for the browser and the opposite answer for the CLI.

The repair itself then worked, and is the proof that the path is real:

```
approving 09cc464f-690a-4a51-9ac9-c97b7011eb34
Approved a26aab16fdf39295924c5e2497dbc9c6b08920f5a2af8d4eef7e3fe744e5b435 (09cc464f-…)
[ws] webchat connected client=openclaw-control-ui remote=10.99.0.2
```

**And a fifth thing was measured without being looked for.** The request id changes on **every**
retry: `e626a793` → `0e4e2a95` → `53176b95` → `09cc464f` within thirty minutes, because the refused
browser keeps knocking. The id the red box offers for copying is stale within seconds, so any remedy
that has a human carry an id from one window to another is broken by construction.

### 9.3 What will be built

Three parts. The first is the enabler, the second is what the operator actually sees, and the third
re-opens a decision whose justification has expired.

| | | |
|---|---|---|
| **R1** · **built 2026-09-19** | `gateway.auth.identityScopes` is written by `config/scripts/start/openclaw.sh` | The recovery exists only while that key is in the configuration, and the start script rewrites `volumes/_openclaw/openclaw.json` on every run. The identity is **read out of the nginx template** rather than typed a second time, and a template carrying none or more than one stops the start. Cases OC-39 and OC-40 |
| **R2** | A card in the dashboard: pending pairing requests, with an approve button | This is the half that answers OC-G5. It reads the request id at the moment the button is pressed, never from what was rendered — see the id churn above. Same shape as the deploy-key queue of M-A9, for the same reason: the operator already looks there when something is wrong |
| **R3** · **built 2026-09-19** | `operator.admin` moves out of `deviceAutoApprove.scopes` and is granted per identity | §5.3 put it in the cap because *"an operator who revokes their own device has no path back"*. With R1 that premise is gone, and what remains is the gateway standing advice, logged at every start since 2026-09-10 and read by nobody. **OC-46 passed**, so it is built rather than merely permitted |

**R3 was a decision, not a consequence**, and the operator set the bar on 2026-09-19: *"a brand new
browser should connect right away."* That made R3 conditional on OC-46 rather than planned — and
**OC-46 was run the same day and passed**, so it is built.

What was measured, in a private window, within twelve milliseconds:

```
security audit: trusted-proxy browser device auto-approved  scopes=approvals,pairing,questions,read,write
security audit: identity scope grant elevated connection    addedScopes=operator.admin
[ws] webchat connected  client=openclaw-control-ui  remote=10.99.0.2
```

The device is stored with five scopes and no admin; the **connection** is elevated by the identity
grant. The admin-gated pages render, and the `SECURITY WARNING` naming `operator.admin` is gone from
the startup log for the first time since 2026-09-10. Had it failed, `operator.admin` would have
stayed in `deviceAutoApprove.scopes` with its justification rewritten, because the one it carried is
false (§5.3, corrected) — a refusal would have been a result too.

The requirement is now explicit and outranks the security warning: **a browser that has never been
here connects on the first try, without meeting a card, without an operator approving anything.**
R2's card exists for the browser that is *refused*, which is a different situation and the only one
that was ever stuck.

### 9.4 The interface R2 needs

The dashboard cannot call the gateway CLI directly: it has no Docker socket, and the CLI must arrive
through nginx to be authenticated at all. The call therefore takes the shape the git integration
already uses — a server route that runs one command and hands the script's own words back.

| | |
|---|---|
| **Route** | `POST /openclaw-pairing` with `{ "requestId": "<id>" }`; `GET` is the listing, shaped `{ "pending": [ { "requestId", "deviceId", "clientId", "isRepair", "requestedAt" } ] }` |
| **Guard** | `requestId` is matched against `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` before it reaches a shell, exactly as `start-skip` guards a step name |
| **Transport** | `ws://openclaw.localhost:8888` with `--token unused`, from inside the compose network, with `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1`. Each of those three is load-bearing and each is measured in §9.2 |
| **Failure** | A non-zero exit becomes a 502 carrying the CLI's own message, never a message this project invented. An approval attempt against an id that is no longer pending must say so rather than succeeding quietly |

### 9.5 Deliberately not in scope

**Preventing the revocation.** Nothing in the stack revokes tokens by itself; the one revocation on
record was a measurement. A guard against a thing that has happened once, on purpose, would be
ceremony.

**Removing device identity altogether.** `dangerouslyDisableDeviceAuth` is retired (§5.3) and asking
2026.9.1 to behave like 2026.7.1 is how the migration got into this in the first place.

**Making the gateway's own error text correct.** The red box names a command this stack cannot run
and an id that is already stale. That is upstream's to fix; what we can do is make sure an operator
never has to read it.

### 9.6 What the operator decided, 2026-09-19

**1. A brand-new browser connects right away.** This is a requirement now, not a preference, and it
constrained R3 rather than deciding it: admin could leave the cap only if OC-46 showed a fresh
browser still connecting immediately with the grant coming from the identity instead. **It did**, the
same day, so the requirement and the gateway advice turned out not to conflict at all — the conflict
everyone assumed was there rested on the false half of the 2026-09-10 finding.

**2. The dashboard needs no authentication of its own for this.** Whoever reaches it can already
start and stop the whole stack, so approving a pairing request adds no exposure that is not already
there. Recorded rather than assumed, which is the point of asking.

**3. The branch, and what it costs.** Everything this work touches was compared across the two
candidates on 2026-09-19: both OpenClaw documents, `config/scripts/start/openclaw.sh`, the four
`X-Forwarded-User` blocks in `config/nginx/templates/nginx.conf`, and the whole of `dashboard/` are
**byte-identical on #9 and #10**. #10's 16,855 added lines are the Java extensions and their tests,
none of which this work reads or changes.

So it goes on its own branch, cut from **`feature/git-integration` (#9)**, with its pull request
based on #9 — the same stacking #10 already uses, so its diff shows only its own work and GitHub
retargets it when #9 lands. Gateway auth does not end up inside the Java feature's history, and the
work does not inherit a 66-file diff it has nothing to do with.

**The cost is named rather than hidden:** these two documents will then exist on three branches —
the new one, #10, and the stale copy on #11. That is the shape this project has already been bitten
by, when a promoted procedure left two copies and every repair went into the one nobody was reading.
The rule that keeps it honest is the one the handover already states: **the current copy is the one
on the branch that last touched it**, and after this branch lands it is merged forward into #10 like
everything else.

### 9.7 What this section is worth if nothing is built

The correction in §5.3 stands on its own. *"No path back through any documented route"* was written
with confidence, survived nine days, and was wrong — and it was wrong in the direction that cost the
most, because it is the sentence that justified granting full admin to every browser automatically.
It took one measurement to break: send the same command through the proxy instead of around it.

**A conclusion that closes a door deserves the same scrutiny as one that opens it.** This one had
less, because it agreed with what everyone already believed.
