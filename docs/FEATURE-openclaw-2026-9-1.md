# Migrating the stack to OpenClaw 2026.9.1

**Status: analysis complete, nothing implemented.** This document establishes what must change and
why, before any code is written. The test cases are in `TEST-SPEC-openclaw-2026-9-1.md` and are
signed off before implementation begins.

Branch `feature/openclaw-2026-9-1`, cut from `fix/openclaw-2026-9-1` (#11) with
`fix/bun-runner-health` (#12) merged. The baseline it is measured against is `PROCEDURE-baseline-cold-start.md`,
verified 2026-09-05: `verification/RESULT-baseline-cold-start.md`.

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

**Proposal:** enable auto-approval with the **least scopes that make the Control UI usable**, and
determine that set by measurement rather than by guessing. `operator.admin` is excluded unless a
case proves the interface unusable without it, in which case it moves to `gateway.auth.identityScopes`
for the single configured identity. The available scopes are `operator.read`, `operator.write`,
`operator.talk`, `operator.pairing`, `operator.approvals`, `operator.questions`, `operator.admin`.

This is the one place where the migration adds a security decision rather than a translation, and it
is flagged here so it is reviewed as one.

### 5.4 Trusted proxy attribution · **already repaired, kept**

**How it worked.** `gateway.trustedProxies` listed loopback plus the three RFC1918 ranges, and had
since 2026-06-06.

**What changed.** 2026.9.1 rejects proxy-shaped traffic it cannot attribute — HTTP 403,
`proxy_attribution_required`, with the gateway logging *"observed unattributable proxy-shaped traffic
from 172.18.0.21"*. A list that wide is refused **even when the peer falls inside it**: measured in
#11, the proxy at `172.18.0.21` sits within `172.16.0.0/12` and was still refused. A single `/16` is
accepted, so "narrowly" means one network, not one address — measured too.

**What must be adapted: nothing.** #11 kept this fix because it was worth having regardless of
version. `gateway.trustedProxies` now names this stack's own docker network, resolved from the
network name, and `scripts/linux/start.sh` corrects it after `docker compose up` on a cold start,
where the network does not exist yet. It is valid on both versions. **Zero footprint**, and it needs
a regression case rather than a change.

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
from `main`. Recorded in `verification/RESULT-baseline-cold-start.md`.

**The `ingest-pdf` plugin's error text** naming `memorySearch.provider`, now stale. A diagnostic
string only; correcting it means rebuilding a checked-in `dist/index.mjs` bundle, which is more risk
than the papercut warrants.

**The 815 keys added in 2026.9.1** that this stack does not use. New channels, agent ownership,
media models, browser SSRF policy. Adopting any of them is a feature decision, not a migration.
