# Test specification — OpenClaw 2026.9.1 migration

For review and sign-off **before** implementation. Cases derive from
`FEATURE-openclaw-2026-9-1.md` §5; every part there has at least one positive case and one negative
counterpart, because a rule that only refuses is as useless as one that only permits.

Baseline: `verification/RESULT-baseline-cold-start.md` (2026-09-05, all seven checks green on
2026.7.1). Every claim below is a **difference from that run**.

---

## 1. Two suites

| | Runs on | Answers |
|---|---|---|
| **Suite 1 — baseline** | this branch: `main` + #11 + #12 | Does 2026.9.1 break what the released stack already does? |
| **Suite 2 — compatibility** | an integration branch: this + **A** (#9) + **B** (#10) | Do the changes coexist with the two features in flight? |

Suite 2 cannot run here. `git-repo-info` and `nar-build` do not exist on a branch cut from `main`,
and the baseline procedure explicitly fails a run that checks for them. Both suites are specified
here; each is executed where its subject exists.

## 2. Levels and rigour

| Component | Level | Rigour |
|---|---|---|
| The config writer's version branch | unit / component | **100% branch coverage** — it is decision logic and it decides whether the stack starts |
| Scope selection for `deviceAutoApprove` | system | Measured, not assumed. The chosen set is whatever the interface proves it needs |
| Image build (`--allow-scripts`) | component | Both outcomes: with and without the flag on npm 12 |
| Proxy attribution | system | Both outcomes: narrow list and wide list on 2026.9.1 |
| Cold start | system, manual | One run, whole path |
| Suite 2 | system | Existing A and B suites, re-run against a 2026.9.1 stack |

## 3. Overview

### Suite 1 — baseline

| ID | Level | Sign | Case |
|---|---|---|---|
| OC-1 | component | positive | On 2026.9.1 the written config contains **no** `agents.defaults.cliBackends`, and `config validate` passes |
| OC-2 | component | **negative** | On 2026.9.1 a config that **does** contain it is rejected by `config validate` |
| OC-3 | component | **negative** | On 2026.9.1 that same rejection, under a pty, produces the `doctor --fix? [Y/n]` prompt — the hang, reproduced |
| OC-4 | system | positive | On **2026.7.1**, with `cliBackends` absent, Claude requests still run through the wrapper |
| OC-5 | component | positive | With Copilot enabled on 2026.9.1, the config carries `memory.search.*` and validates |
| OC-6 | component | **negative** | `agents.defaults.memorySearch` on 2026.9.1 is rejected |
| OC-7 | component | **negative** | `memory.search` on **2026.7.1** is rejected — proving the two cannot share one configuration |
| OC-8 | system, **manual** | positive | On 2026.9.1 with `deviceAutoApprove` enabled, a first-time browser reaches the Control UI without pairing |
| OC-9 | system, **manual** | **negative** | On 2026.9.1 **without** it, the same browser is asked to pair — proving the setting is what fixes it |
| OC-10 | system | **negative** | `deviceAutoApprove.scopes` including `operator.admin` makes the **gateway** log its security warning |
| OC-11 | system | positive | With the chosen scopes, it does not, and `doctor` raises no critical finding |
| OC-12 | component | positive | `gateway.controlUi.dangerouslyDisableDeviceAuth` is not written on 2026.9.1; `doctor` reports no legacy key |
| OC-13 | system | positive | `gateway.trustedProxies` naming the docker network: Control UI answers 200 |
| OC-14 | system | **negative** | The wide RFC1918 list on 2026.9.1: Control UI answers 403 `proxy_attribution_required` |
| OC-15 | component | positive | The image built on 2026.9.1 runs `claude --version` |
| OC-16 | component | **negative** | The same build **without** `--allow-scripts` on npm 12 fails at the version check instead of shipping |
| OC-17 | unit | positive | The version probe reports `2026.9.1` for the 2026.9.1 image |
| OC-18 | unit | positive | The version probe reports `2026.7.1` for the 2026.7.1 image |
| OC-19 | unit | **negative** | A probe that cannot determine the version refuses rather than writing a config for a guess |
| OC-20 | system, **manual** | positive | A full cold start on 2026.9.1: the OC-BASE acceptance, all seven checks |
| OC-21 | system | **negative** | After 2026.9.1 has written the state directory, 2026.7.1 refuses to start — the one-way door, documented |
| OC-22 | system | positive | `claude-cli/claude-opus-5` is offered with its 1M context window intact |
| **OC-28** | system, **manual** | **negative** | Starting 2026.9.1 against a state directory written by 2026.7.1 **fails** until the workspace is migrated — the upgrade path, which no cold start can reach |
| **OC-29** | system | positive | After the migration, that same upgraded stack starts and passes the OC-20 acceptance |
| **OC-30** | system | **negative** | The acceptance sweep reports a crash-looping service as a failure, whenever it is sampled |
| **OC-31** | component + system | **negative** | A plugin 2026.9.1 enables by itself, and cannot load, does not stay enabled — and the removal is what silences the error |

### Suite 2 — compatibility

| ID | Level | Sign | Case |
|---|---|---|---|
| OC-23 | system | positive | On a 2026.9.1 stack, `git-repo-info` answers inside the OpenClaw container |
| OC-24 | system | **negative** | On the same stack, `git-publish`'s guardrails still refuse what they must |
| OC-25 | system | positive | On the same stack, `nar-build` answers |
| OC-26 | system | positive | The full A suite (`tests/`, git integration) runs green against a 2026.9.1 stack |
| OC-27 | system | positive | The full B suite (Liquid Java extensions) runs green against a 2026.9.1 stack |

---

## 4. Detail blocks

### OC-1 / OC-2 / OC-3 — the retired backend key

| | |
|---|---|
| **Premise** | `agents.defaults.cliBackends` is not a configuration key in 2026.9.1 at all. OC-1 shows we stopped writing it; OC-2 shows that mattered; OC-3 shows what it cost, because an error message and an indefinite hang are different failures and only one of them was survivable. |
| **Component** | `config/scripts/start/openclaw.sh`'s config writer, and `openclaw config validate` in a 2026.9.1 container. |
| **Test data** | OC-1: the config the start script writes with `ENABLE_ANTHROPIC_CLAUDE_CODE=1` against a 2026.9.1 image. OC-2 and OC-3: that same file with the single key added back, verbatim as 2026.7.1 wrote it — `{"agents":{"defaults":{"cliBackends":{"claude-cli":{"command":"/usr/local/bin/openclaw-claude"}}}}}` merged in. |
| **Expected** | OC-1: `jq -e '.agents.defaults.cliBackends'` finds nothing, and `openclaw config validate` exits 0. OC-2: validate exits non-zero naming `agents.defaults: Unrecognized key: "cliBackends"`. OC-3: the same file, with the command run under `script` so a pty is attached, produces `Run "openclaw doctor --fix" now? [Y/n]` and does **not** return on its own — asserted with a bounded wait, and the container force-removed. |
| **Failure** | OC-1: the key is present, or validation fails for another reason. OC-2: validation passes — the key would then be harmless and §5.1 would be wrong. OC-3: no prompt appears, which would mean the hang had another cause and the timeout guards in #11 were aimed at the wrong thing. |
| **Covers** | OC-G1, §5.1 |

### OC-4 — does the wrapper alone suffice on 2026.7.1?

| | |
|---|---|
| **Premise** | **This case decides the footprint of §5.1.** The wrapper is installed as `/home/node/.local/bin/claude`, ahead of `/usr/local/bin` on PATH, and 2026.7.1 additionally has the config key pointing at `/usr/local/bin/openclaw-claude`. If PATH alone does the job on 2026.7.1, the key can be dropped for both versions and this part needs no version-specific code at all. If not, it does. Nobody has looked. |
| **Component** | A 2026.7.1 stack whose config has had `agents.defaults.cliBackends` removed. |
| **Test data** | The stack as the baseline run left it, with that one key deleted from `volumes/_openclaw/openclaw.json` and the gateway restarted. A prompt through the Control UI that provokes a Claude CLI call. |
| **Expected** | The call succeeds **and runs through the wrapper** — asserted on the wrapper's effect, not its presence: `CLAUDE_CONFIG_DIR` is `/home/node/.claude`, which only the wrapper sets. Read from the spawned process rather than inferred, e.g. by having the wrapper leave a marker file per invocation for the duration of this case. |
| **Failure** | The call fails, or succeeds without the wrapper's environment — in which case the config key is load-bearing on 2026.7.1 and Option B must write it there. |
| **Covers** | OC-G2, OC-G3, §5.1 |

### OC-5 / OC-6 / OC-7 — memory search, and why one configuration cannot serve both

| | |
|---|---|
| **Premise** | The relocation is a hard failure that **no one in this installation has ever hit**, because `ENABLE_GITHUB_COPILOT=0`. A latent break needs a test, not an observation. OC-7 is the case that proves the incompatibility is symmetric, and therefore that a version branch is unavoidable rather than merely convenient. |
| **Component** | The config writer with `ENABLE_GITHUB_COPILOT=1`, and `openclaw config validate` in both images. |
| **Test data** | OC-5: the written config on 2026.9.1, expected to carry `memory.search.provider = "github-copilot"` and `memory.search.model` set to whatever the writer selects. OC-6: that config with the subtree moved back to `agents.defaults.memorySearch`. OC-7: the 2026.9.1-shaped config, validated against a **2026.7.1** container. |
| **Expected** | OC-5: validate exits 0 and `jq -e '.memory.search.provider'` returns `github-copilot`. OC-6: validate exits non-zero naming `memorySearch`. OC-7: validate exits non-zero — `memory.search` is not in 2026.7.1's schema. |
| **Failure** | OC-7 passing would mean the new path is accepted by both, the incompatibility is one-directional, and Option A becomes materially cheaper. That would change the recommendation, which is why the case is here rather than assumed away. |
| **Covers** | OC-G2, §5.2 |

### OC-8 / OC-9 — the blocker, and the proof that the fix is the fix

| | |
|---|---|
| **Premise** | This is the fault that stopped the migration. OC-9 is written and run **first**: without it, OC-8 proves only that something works, not that `deviceAutoApprove` is what made it work. |
| **Component** | A 2026.9.1 stack behind the nginx proxy, reached as a browser that has never paired. |
| **Test data** | A request carrying **no** device credentials — a fresh cookie jar, i.e. `curl` with no stored state, through the proxy with `Host: openclaw.localhost`. OC-9's config omits `gateway.auth.trustedProxy.deviceAutoApprove` entirely; OC-8's sets `{"enabled": true, "scopes": [...]}` with the scope set from OC-11. Everything else identical. |
| **Why these are manual — measured, not assumed** | The specification required OC-9 to run first so its observed refusal would become OC-8's fixture rather than a guess. It ran first, and what it found was that **there is no refusal to observe without a browser.** Probed on the running 2026.9.1 stack, with and without `deviceAutoApprove`, these were byte-for-byte identical: `/` → 200, `/healthz` → 200, `/api/*` and `/rpc` → 404, `/control-ui-config.json` → 200. The WebSocket upgrade succeeds in both cases and the gateway sends the same first frame in both: `{"type":"event","event":"connect.challenge","payload":{"nonce":"…"}}`. The pairing decision happens *after* the client signs that challenge, so reaching it means implementing OpenClaw's device authentication — a reimplementation of the product inside its own test. This is the same rule this project already applies to model-dependent behaviour, for the same reason: **behaviour reachable only through a real client is a documented manual check, never an automated assertion.** Writing OC-8 against `/` → 200 would have produced a green case proving nothing, which is exactly the failure this specification exists to prevent. |
| **Procedure** | With the stack on 2026.9.1: open `http://openclaw.localhost:8888` in a browser profile that has never paired with this gateway (a private window is enough). Record whether the interface loads or asks for a one-time device approval. Then remove `gateway.auth.trustedProxy.deviceAutoApprove` from `volumes/_openclaw/openclaw.json`, `docker compose restart openclaw-gateway`, and repeat in a fresh private window. Restore the key afterwards, or run `./scripts/linux/start.sh`, which rewrites it. |
| **Expected** | OC-8: the Control UI loads and is usable, with no pairing prompt. OC-9: the pairing demand from the September observation returns — *"Device pairing required — This browser needs one-time approval"*. |
| **Failure** | OC-8 showing the pairing demand means `deviceAutoApprove` does not cover this path and the migration is not possible. OC-9 *not* showing it would mean pairing is not enforced here at all, and §5.3 is wrong about what the blocker was. |
| **What automation still covers** | That the configuration carries the setting with the intended scopes, that no retired key survives beside it, that the gateway accepts the configuration, and that the WebSocket transport the Control UI uses is reachable and issues a challenge. What it cannot cover is the answer to that challenge. |
| **Covers** | OC-G1, §5.3 |

### OC-10 / OC-11 — the scopes are a decision, so they are measured

| | |
|---|---|
| **Premise** | `deviceAutoApprove` auto-approves whoever the proxy claims, and our proxy claims a constant: `X-Forwarded-User: "user@nocodenation.org"`. The exposure equals what 2026.7.1 already had with the device check switched off — but the scopes decide how far an auto-approved device reaches, and that part is new. OC-10 keeps the guard honest; OC-11 records what was actually granted. |
| **Component** | `openclaw doctor` against the live configuration on 2026.9.1. |
| **Test data** | OC-10: `scopes: ["operator.admin"]`. OC-11: the set the start script writes — `operator.read`, `operator.write`, `operator.talk`, `operator.pairing`, `operator.approvals`, `operator.questions` — read from the live configuration rather than retyped. |
| **Corrected 2026-09-06, by running it** | This block expected `doctor` to report `gateway.trusted_proxy_device_auto_approve_admin` at severity **critical**. **It does not.** The check exists in the bundle, but across repeated runs against this configuration doctor never surfaced it. What does fire, every time and verbatim, is a gateway log line at startup: `SECURITY WARNING: gateway.auth.trustedProxy.deviceAutoApprove.scopes includes operator.admin; every proxy-authenticated user can auto-approve a new browser device with full admin, and requests without scopes receive full admin automatically. Remove operator.admin and grant admin per identity via gateway.auth.identityScopes instead.` The case asserts the log. Had it kept asserting doctor, we would have shipped a guard that never fires — worse than no guard, because it reads like one. |
| **Expected** | OC-10: the gateway logs that line after a restart with `operator.admin` in the scopes. OC-11: it does not, with the scopes the start script writes, and `doctor` reports no critical finding. |
| **Both are scoped to their own restart.** | The gateway log is a rolling buffer, so a warning from an earlier case or an operator probing by hand is still in it. Each case records the moment its restart began and reads only from there — the first version greped the last 300 lines and read a ten-minute-old line from a manual probe as its own result. |
| **Failure** | OC-10 not producing the line would mean the guard we rely on to keep us honest does not exist. OC-11 needing `operator.admin` is not a failure but a **decision point**: it moves to `gateway.auth.identityScopes` for the single identity, as the warning itself instructs. |
| **Covers** | OC-G1, OC-G3, §5.3 |

### OC-12 — the hollow survivor is removed

| | |
|---|---|
| **Premise** | `dangerouslyDisableDeviceAuth` still validates on 2026.9.1, so nothing forces its removal and it would quietly persist — a key that looks like it is doing something and is not. That is worse than an error. |
| **Test data** | The config the writer produces on 2026.9.1. |
| **Expected** | `jq -e '.gateway.controlUi.dangerouslyDisableDeviceAuth'` finds nothing, and `openclaw doctor` reports no legacy config key. |
| **Failure** | The key is present — the configuration would then carry a claim about device auth that the running version ignores. |
| **Covers** | §5.3 |

### OC-13 / OC-14 — proxy attribution, kept rather than changed

| | |
|---|---|
| **Premise** | #11 already narrowed `gateway.trustedProxies` and kept it through the downgrade. Nothing changes here, so what is needed is a **regression** case — and its negative counterpart, because "we narrowed it" is only interesting if the wide list actually still fails on 2026.9.1. |
| **Test data** | OC-13: `["127.0.0.1/32", "<this stack's docker network>/16"]`, resolved from the network. OC-14: `["127.0.0.1/32","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]` — the list this repository carried from 2026-06-06 until #11, stated as a literal because after the change it is not read from anywhere. |
| **Expected** | OC-13: `HTTP 200`. OC-14: `HTTP 403` with `"type":"proxy_attribution_required"`, and the gateway log line `observed unattributable proxy-shaped traffic from <proxy ip>`. |
| **Failure** | OC-14 answering 200 would mean 2026.9.1 no longer enforces this and the narrowing is no longer load-bearing — worth knowing, and it would relax `start.sh`'s post-`up` correction. |
| **Covers** | §5.4 |

### OC-15 / OC-16 — the npm major version

| | |
|---|---|
| **Premise** | This break is not OpenClaw's; it rides in on the base image. On 2026.7.1's npm 11 the `--allow-scripts` flag is inert and merely warns; on 2026.9.1's npm 12 it is what stands between a working CLI and an image that ships a launcher with nothing to launch. OC-16 is what shows the flag is load-bearing rather than decorative. |
| **Component** | `config/scripts/build/openclaw.sh` against a 2026.9.1 base. |
| **Test data** | OC-15: the rendered line as it stands — `RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code && claude --version`. OC-16: the same line with `--allow-scripts=@anthropic-ai/claude-code` removed, built against the same base. |
| **Expected** | OC-15: the build ends with a version string (`2.1.x (Claude Code)`) and exits 0. OC-16: the build **fails** at `claude --version`, non-zero, no image produced. |
| **Failure** | OC-16 succeeding would mean npm 12 does not block the postinstall in this image and the flag can go — a smaller footprint, and worth knowing rather than assuming. |
| **Covers** | §5.5 |

### OC-17 / OC-18 / OC-19 — the version probe

| | |
|---|---|
| **Premise** | Only needed under **Option B**. It is the project's own doctrine applied: the version is a determinable fact, so it is read at the moment it is needed rather than written into a comment that a later pin change makes false. The negative case is the important one — a probe that fails silently and writes a config for the wrong version reproduces the exact failure this whole exercise came from. |
| **Component** | The probe, as a shell function, called with a controllable image reference. |
| **Test data** | OC-17: `ghcr.io/openclaw/openclaw:2026.9.1`, expecting `2026.9.1`. OC-18: `ghcr.io/openclaw/openclaw:2026.7.1`, expecting `2026.7.1`. OC-19: an image reference that does not exist — `ghcr.io/openclaw/openclaw:0.0.0-does-not-exist`, chosen so no registry can supply it by accident. |
| **Expected** | OC-17 and OC-18: the exact version string, parsed from `openclaw --version` (note 2026.9.1 appends a commit: `OpenClaw 2026.9.1 (ad6fe23)` — the parser must tolerate it, and OC-17 asserts that it does). OC-19: the start **refuses and says so**, naming the image it could not identify. It must not fall back to a default, because a default is a guess and a wrong guess is the hang. |
| **Failure** | OC-19 falling back to either version's config shape. |
| **Covers** | OC-G2, §6 |

### OC-20 — a cold start on 2026.9.1 · **manual**

| | |
|---|---|
| **Premise** | Every other case runs against a stack that is already up. This is the path a new operator takes, on the new version, and the counterpart to the baseline run of 2026-09-05 — every claim in the feature document is a difference from that run, and this is where the difference is actually measured. |
| **Component** | The whole stack, from a reset checkout. |
| **Test data** | The procedure in `PROCEDURE-baseline-cold-start.md`, with the pin moved to 2026.9.1. Its corrected step 4 has never been run — this is its first execution, which is stated in that document. |
| **Expected** | The same seven checks, with two differences: OpenClaw reports **2026.9.1**, and the Control UI answers 200 **without any browser having paired**. `openclaw config validate` valid, `doctor` free of critical findings and legacy keys, the Claude CLI at 2.1.x, `bun_runner` healthy, every service running. |
| **Failure** | Any of the seven, or a device-pairing demand. |
| **Covers** | OC-G1, all of §5 |

### OC-21 — the one-way door

| | |
|---|---|
| **Premise** | Found while downgrading in September and worth a case rather than a footnote, because anyone repeating this needs to know it **before** they try. It is also what makes the backup in the baseline procedure load-bearing rather than cautious. |
| **Component** | A `volumes/_openclaw` state directory last written by 2026.9.1, started against a 2026.7.1 image. |
| **Test data** | The state directory as OC-20 leaves it, and the 2026.7.1 image. |
| **Expected** | The gateway **refuses to start**, with `Refusing to run automatic gateway startup migrations`. |
| **Failure** | It starts — the downgrade would then be a plain tag change and the backup unnecessary. Worth knowing either way; the current belief rests on one observation. |
| **Covers** | §1, and the return path in `PROCEDURE-baseline-cold-start.md` §1 |

### OC-22 — the model survives the move

| | |
|---|---|
| **Premise** | A migration that leaves the interface reachable but the model degraded has not succeeded. #11's verification recorded `claude-cli/claude-opus-5` as default with its 1M context intact on 2026.7.1; the same must hold after. |
| **Test data** | The model list as OpenClaw reports it on the running 2026.9.1 stack. |
| **Expected** | `claude-cli/claude-opus-5` present and selectable, context window `1000000`. |
| **Failure** | Absent, or a reduced context window. |
| **Covers** | OC-G1 |

### OC-28 / OC-29 — the upgrade path · **added 2026-09-06, after the first 2026.9.1 start**

| | |
|---|---|
| **Premise** | **These cases exist because the specification was missing them and the run found out.** Every case above either starts from an empty state directory or from one 2026.9.1 already owns. Nobody had asked what happens to a state directory that 2026.7.1 wrote — which is the only situation every existing installation is actually in. A cold start cannot reach it by construction: it deletes the state first. |
| **What happened** | The gateway refused to start, ten times, until the restart-loop breaker tripped: `Gateway failed to start: Legacy workspace setup state requires migration for /home/node/.openclaw/workspace; run openclaw doctor --fix.` `docker compose up` failed with `dependency failed to start: container openclaw-gateway is unhealthy`, and `start.sh` exited 1. |
| **And the repair is not where the message points.** | `openclaw doctor --fix` refuses while any config error stands, and the standing error was `plugins.load.paths: plugin path not found: /home/node/openclaw-plugins/ingest-pdf`. That path is not a mount: the gateway's own `command:` copies it from `/opt/plugins` at startup, so it exists in no other container and not in the gateway either while it is crash-looping. The migration therefore cannot be performed by any documented route — it needs a container that replicates the copy first. |
| **Component** | A `volumes/_openclaw` written by 2026.7.1, and the 2026.9.1 image. |
| **Test data** | The state directory as the 2026-09-05 baseline run left it — preserved as `liquidupstart-backups/_openclaw.bak-2026.7.1`, which makes this case repeatable rather than a one-off observation. |
| **Expected** | OC-28: the gateway refuses to start and names the workspace migration. OC-29: after the migration, the stack starts and passes OC-20's acceptance, with `deviceAutoApprove`, and without `cliBackends` or `dangerouslyDisableDeviceAuth`, surviving the doctor rewrite. |
| **Failure** | OC-29 leaving any of those three keys in the state doctor rewrote. |
| **What this changes** | The start script must perform this migration itself, or say plainly that an upgrade needs it and how. A stack that crash-loops after an upgrade with the fix reachable only by reconstructing a container's startup copy is not a migration anyone can follow. |
| **Covers** | OC-G1, OC-G4 |

### OC-31 — 2026.9.1 enables a plugin it cannot load · **added 2026-09-06, found in a screenshot**

| | |
|---|---|
| **Premise** | The operator's screenshot confirming OC-8 showed a warning badge on CODEX in the sidebar, with `ENABLE_OPENAI_CODEX=0`. It was not a rendering artefact. `plugins.entries.codex.enabled = true` is **absent** from the 2026.7.1 state and **present** after the first 2026.9.1 boot; this stack's start script writes it only when the flag is on. 2026.9.1's own startup migration added it — and then cannot load it: `@openai/codex` is bundled in `ghcr.io/openclaw/openclaw:2026.7.1` and gone from `:2026.9.1`. |
| **Component** | The config writer's sweep, and a running gateway. |
| **Test data** | `{"plugins":{"entries":{"codex":{"enabled":true}}}}` — the exact shape 2026.9.1 wrote by itself, observed rather than invented. The assertion string is the plugin loader's own: `ERROR codex:`. |
| **Expected** | Component: with `ENABLE_OPENAI_CODEX=0` the writer removes `plugins.entries.codex`, whoever put it there — and with the flag **on** it leaves it, so the sweep fixes the symptom rather than breaking the feature. System: doctor reports `Errors: 1 — ERROR codex: Plugin "codex" cannot load because required dependencies are missing: @openai/codex, smol-toml` with the key present, and nothing with it absent. |
| **Why the system half exists** | The component case proves the key is removed. Only the running gateway proves that removing it is what silences the error — measured as an A/B on the live stack rather than inferred from the error having disappeared. |
| **Failure** | The error persisting with the key absent would mean the config entry is not what enables the load attempt, and the fix is aimed at the wrong thing. |
| **Covers** | OC-G1, OC-G4 |

### OC-30 — the acceptance sweep must not pass a crash loop

| | |
|---|---|
| **Premise** | While the gateway was restarting for the tenth time, the sweep this project has used since A7-5 reported *"all running, none unhealthy."* It was sampled in the window between two crashes, where `docker compose ps` shows `running` and the health status is `starting` rather than `unhealthy`. The filter is not wrong, it is **timing-dependent** — and a criterion that depends on when you look is not a criterion. |
| **Component** | The acceptance sweep in `PROCEDURE-baseline-cold-start.md` step 5. |
| **Test data** | A container in a restart loop — reproducible with the OC-28 state, which crash-loops on purpose. |
| **Expected** | The sweep reports a failure **on every sample**, not only on the lucky ones. Achieved by reading `RestartCount` and the health status per container rather than the one-line `Status` string: a freshly started stack has `RestartCount` 0, and any container with a healthcheck must reach `healthy`, not sit in `starting`. |
| **Failure** | Any sample during a crash loop that reports the stack as sound. |
| **Why it is here rather than quietly fixed** | Every "all services running" claim in this repository's records was made with the old sweep, including the baseline run of 2026-09-05. Those results are not invalidated — the stack was genuinely sound, and `bun_runner` was the only thing it ever caught — but the confidence they carry is lower than it reads, and that belongs on the record rather than in a silent edit. |
| **Covers** | OC-G4, and the acceptance in `PROCEDURE-baseline-cold-start.md` |

### OC-23 / OC-24 / OC-25 — the features in flight still work

| | |
|---|---|
| **Premise** | The git integration and the NAR work both live **inside** the OpenClaw container. A version change to their host is exactly the kind of thing that breaks them without touching their code. OC-24 is the negative: a guardrail that still exists but no longer refuses is worse than one that is gone. |
| **Component** | An integration branch carrying this branch plus #9 plus #10, on a 2026.9.1 stack. |
| **Test data** | OC-23: `git-repo-info` for the declared repository `nocodenation/agent-skills`, expecting its declared mode `read|protected`. OC-24: a push attempt that bypasses `git-publish` — a direct `git push` in a clone, which the `pre-push` hook must refuse with `did not come through git-publish`. OC-25: `nar-build` answering on its health route. |
| **Expected** | OC-23 and OC-25: the commands answer as they do on 2026.7.1. OC-24: the push is refused, in the hook's own words. |
| **Failure** | Any of them behaving differently than on the 2026.7.1 baseline. |
| **Covers** | OC-G4 |

### OC-26 / OC-27 — the existing suites, re-run

| | |
|---|---|
| **Premise** | The cheapest and strongest compatibility evidence available: 349 cases already exist and already pass on 2026.7.1. Running them against a 2026.9.1 stack asks the whole question at once. |
| **Component** | `./tests/run.sh` on the integration branch, against a stack started from it. |
| **Test data** | The suites as they stand: 349 pass / 0 fail plus 27 dashboard cases, which is what they reported on 2026-09-05. |
| **Expected** | The same counts, or a strictly explained difference per case. |
| **Failure** | Any case that passes on 2026.7.1 and fails on 2026.9.1 — each one is a compatibility defect and gets its own entry here. |
| **Covers** | OC-G4 |

---

## 5. Deliberate omissions

**No case asserts model output.** Behaviour that depends on a model is a documented manual check,
never an automated assertion. OC-4 asserts the wrapper's *environment*, not what Claude replied.

**No negative counterpart for OC-13** beyond OC-14 — the two are already the pair.

**No case for the 815 keys added in 2026.9.1** that this stack does not configure. Adopting any of
them is a feature decision, not a migration, and a case would be testing OpenClaw rather than us.

**No case for `start.sh`'s broken sign-in instruction** found by the baseline run. It is a defect of
the released stack, belongs in a repair cut from `main`, and is recorded in
`verification/RESULT-baseline-cold-start.md`.

## 6. Traceability

| Requirement | Covered by |
|---|---|
| OC-G1 full usability on 2026.9.1 | OC-1, OC-5, OC-8, OC-11, OC-20, OC-22 |
| OC-G2 backward compatibility where possible | OC-4, OC-7, OC-17, OC-18, OC-19 |
| OC-G3 smallest footprint that still works | OC-4, OC-11, OC-16 |
| OC-G4 does not break `main`, A or B | OC-13, OC-15, OC-23, OC-24, OC-25, OC-26, OC-27 |
| §5.1 backend command | OC-1, OC-2, OC-3, OC-4 |
| §5.2 memory search | OC-5, OC-6, OC-7 |
| §5.3 device pairing | OC-8, OC-9, OC-10, OC-11, OC-12 |
| §5.4 proxy attribution | OC-13, OC-14 |
| §5.5 npm allowScripts | OC-15, OC-16 |
