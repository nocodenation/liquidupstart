# Test specification — OpenClaw 2026.9.1 migration

For review and sign-off **before** implementation. Cases derive from
`FEATURE-openclaw-2026-9-1.md` §5; every part there has at least one positive case and one negative
counterpart, because a rule that only refuses is as useless as one that only permits.

Baseline: `verification/RESULT-cold-start-2026.7.1.md` (2026-09-05, all seven checks green on
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

**Suite 2 was executed on 2026-09-07** on `integration/oc-2026-9-1` — this branch merged with #9 and
#10 — and passed: 424 cases, 0 failures, plus the 27 dashboard cases. The record is in
`verification/RESULT-openclaw-2026-9-1.md`.

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
| OC-3 | contract | **negative** | Every unattended `docker run` in the start script is bounded, or is a named exception with a reason — **replaced 2026-09-07**, see below |
| OC-4 | system | positive | On **2026.7.1**, with `cliBackends` absent, Claude requests still run through the wrapper |
| OC-5 | component | positive | With Copilot enabled on 2026.9.1, the config carries `memory.search.*` and validates |
| OC-6 | component | **negative** | `agents.defaults.memorySearch` on 2026.9.1 is rejected |
| OC-7 | component | **negative** | `memory.search` on **2026.7.1** is rejected — proving the two cannot share one configuration |
| OC-8 | system, **manual** | positive | On 2026.9.1 with `deviceAutoApprove` enabled, a first-time browser reaches the Control UI without pairing |
| OC-9 | system, **manual** | **negative** | On 2026.9.1 **without** it, the same browser is asked to pair — proving the setting is what fixes it |
| OC-10 | system | **negative** | `deviceAutoApprove.scopes` including `operator.admin` makes the **gateway** log its security warning |
| OC-11 | system | positive | With the chosen scopes, it does not, and `doctor` raises no critical finding |
| OC-12 | component | positive | `gateway.controlUi.dangerouslyDisableDeviceAuth` is not written on 2026.9.1; `doctor` reports no legacy key |
| OC-13 | system | positive | `gateway.trustedProxies` naming the proxy address: a client inside the stack network **and** one on the host both answer 200 |
| OC-14 | system | **negative** | The client's own range in the list: 403 `proxy_attribution_required`, which is what makes the single address a decision |
| OC-15 | component | positive | The image built on 2026.9.1 runs `claude --version` |
| OC-16 | component | **negative** | The same build **without** `--allow-scripts` on npm 12 fails at the version check instead of shipping |
| OC-17 | unit | positive | The version probe reports `2026.9.1` for the 2026.9.1 image |
| OC-18 | unit | positive | The version probe reports `2026.7.1` for the 2026.7.1 image |
| OC-19 | unit | **negative** | A probe that cannot determine the version refuses rather than writing a config for a guess |
| OC-20 | system, **manual** | positive | A full cold start on 2026.9.1: all seven checks — **passed 2026-09-07**, `verification/RESULT-cold-start-2026.9.1.md` |
| OC-21 | system | **negative** | After 2026.9.1 has written the state directory, 2026.7.1 refuses to start — the one-way door, documented |
| OC-22 | system | positive | `claude-cli/claude-opus-5` is offered with its 1M context window intact |
| **OC-28** | system, **manual** | **negative** | Starting 2026.9.1 against a state directory written by 2026.7.1 **fails** until the workspace is migrated — the upgrade path, which no cold start can reach |
| **OC-29** | system | positive | After the migration, that same upgraded stack starts and passes the OC-20 acceptance |
| **OC-30** | system | **negative** | The acceptance sweep reports a crash-looping service as a failure, whenever it is sampled |
| **OC-31** | component + system | **negative** | A plugin 2026.9.1 enables by itself, and cannot load, does not stay enabled — and the removal is what silences the error |
| **OC-32** | contract | positive | The stack's network exists before `openclaw.sh` writes the configuration, so one writer suffices |
| **OC-33** | system, **manual** | **negative** | A start on a host with nothing foreign on the network never writes the wide RFC1918 list, and prints no narrowing line |
| **OC-34** | contract | **negative** | No `docker compose restart` in the start scripts drags its dependants along |
| **OC-35** | contract | **negative** | Every network the start creates is one the stack actually uses |
| **OC-36** | contract + unit | **negative** | `with_timeout` is never handed a shell function, because `timeout` cannot see one |
| **N1b** | unit | **negative** | A host without GNU coreutils still has a bound: the fallback ran the command unbounded, which is every macOS host, the operator's included |
| **OC-37** | contract | **negative** | A version probe that fails does not take the start down with it |
| **OC-38** | system, **manual** | **negative** | Without `operator.admin` in the cap, a freshly approved browser cannot connect at all |
| **OC-39** | contract | positive | The start writes `gateway.auth.identityScopes` for the identity nginx actually sets — **built 2026-09-19** |
| **OC-40** | contract | **negative** | The identity is never written twice, and a template with none or two stops the start — **built 2026-09-19** |
| **OC-41** | system, **manual** | positive | The CLI sent **through** nginx is authenticated and can approve a pending request |
| **OC-42** | system, **manual** | **negative** | Identity scopes do **not** release a repair: the browser is still refused, so nobody proposes this as the cure again |
| **OC-43** | contract | positive | The dashboard draws a card only when something is pending, and it offers one control — **built 2026-09-19** |
| **OC-44** | contract | **negative** | The id is read when the button is pressed, never taken from what the page rendered — **built 2026-09-19** |
| **OC-45** | contract | **negative** | A `requestId` that is not a uuid never reaches a shell — **built 2026-09-19** |
| **OC-46** | system, **manual** | positive | With admin granted per identity instead of in the cap, a fresh browser still connects — **run and passed 2026-09-19** |
| **OC-47** | system, **manual** | positive | The whole way back, walked: revoke → refused browser → card → Approve → connected. **Run 2026-09-19**, and it found a defect no automated case had |

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
| **Expected** | OC-1: `jq -e '.agents.defaults.cliBackends'` finds nothing, and `openclaw config validate` exits 0. OC-2: validate exits non-zero naming `agents.defaults: Unrecognized key: "cliBackends"`. OC-3: see the replacement below. |
| **Failure** | OC-1: the key is present, or validation fails for another reason. OC-2: validation passes — the key would then be harmless and §5.1 would be wrong. |

##### OC-3, replaced 2026-09-07: assert the guard, not the hazard

| | |
|---|---|
| **What it was** | Reproduce the September hang: an invalid config under a pty produces `Run "openclaw doctor --fix" now? [Y/n]` and never returns. |
| **Why it was abandoned** | Attempted four times. The prompt sits behind two earlier checks — an unauthenticated container bails at `Claude CLI is not authenticated on this host`, and `--profile` reads a different config directory entirely — so provoking it needs **a valid Claude login inside a throwaway container**. A run of exactly that shape had already overwritten the operator's credentials once that same day. A case that periodically risks the operator's login is not worth the finding. |
| **And it was the wrong subject** | It would assert *upstream's* behaviour rather than our protection against it. If OpenClaw stopped prompting tomorrow the case would go red while nothing about this stack had got better or worse. What protects the start is that our own calls are bounded — a property of `config/scripts/start/openclaw.sh`, deterministic and free. |
| **What replaced it** | A contract case: every `docker run` / `docker compose run` in the start script is bounded by `with_timeout`, **or** appears in a named exception list carrying the reason it may wait. Plus an assertion that each exception still exists, since a stale allowance is a hole that hides its successor; and that the timed helpers name their container and force-remove it, because `timeout` kills the docker client and not the container. |
| **What it found immediately** | Four unbounded non-interactive calls, two of them added the day before by this very migration — the state-version probe and the state migration — and two making **network requests**, the local-LLM discovery and the OpenRouter model list, either of which could hang a start indefinitely. And three more: `copilot_authed`, `codex_authed` and `grok_authed` are the same shape as the Claude probe #11 bounded, and were left unbounded when it was. All seven are bounded now. |
| **The hazard stays documented** | The hang was observed for real on 2026-09-05 and is recorded verbatim in #11's commit message. It moves from an automated case to a deliberate omission with a reason, which §5 of this document provides for. |
| **What it found on 2026-09-08: bounded was not enough** | The state migration hung on a start of this branch — five minutes of a silent terminal, no output, no error, until it was resumed by hand with `SIGCONT`. The call *was* bounded. GNU `timeout` runs its command in **its own process group**, so it leaves the terminal's foreground group; `docker compose run` attaches stdin; and a background process reading the terminal is stopped by `SIGTTIN`. Line 178 redirected stdout and stderr to `/dev/null` and left stdin attached. It bites only where GNU coreutils is on `PATH` — without `timeout`, `with_timeout` runs the command in the foreground group and nothing stops it — which is why no earlier start met it, and why it is the same shape as A8-13 on #9: green everywhere except on the operator's `PATH`. Whether the 600s bound would have fired against a **stopped** child was not measured, because the process was resumed after about five minutes; the honest statement is that the bound was never seen to save it. |
| **The fix, and where it belongs** | In `with_timeout`, not at the call site: every caller of it is by construction an unattended step — the script says so itself, *"no unattended step may wait forever on input that cannot arrive"* — and the interactive siblings `claude_cli`, `copilot_cli`, `codex_cli` and `grok_cli` deliberately do not go through it. Each of its three invocations now reads from `/dev/null`, which is also better than the bound it complements: the read returns EOF at once rather than stalling until a timer kills it. The case gained an assertion over the body of `with_timeout`, and the control was run — with the redirect removed it goes red. |
| **What it found on 2026-09-17: on this host there was no bound at all** | `with_timeout` ended in `else "$@"`. On a machine with neither `timeout` nor `gtimeout` — which is every macOS host, both being GNU coreutils — that branch ran the command **unbounded**, and nothing said so: the call site reads `with_timeout 60 docker run …`, what ran was `docker run …`. So on the operator's own machine, the one the stack is started from, none of the eleven bounded calls was bounded. Measured three times in one afternoon while running the suite: the probe container of this very case — bounded at 8s with a 10s grace — stood for **13 minutes**, then for over a minute, then for over a minute again, each time until something else removed it. Its control is in the same session: the old shape given a 3-second bound on a 6-second command returned after **6.01s with rc 0**; the replacement returns after **3.04s with rc 124**. |
| **Why the case could not report it** | It hung rather than going red. `sh()` spawns synchronously and bun cannot interrupt a synchronous spawn, so the `}, 90_000)` on the behaviour half never fired and the whole suite stopped there. It had also been silently skipping: the case returns early when `liquidupstart/openclaw:latest` is absent, and the image had only just been built on this machine. A case that can hang the suite is worse than one that fails, and this is why the replacement is asserted at the unit tier, against a command of the case's own, where nothing can hang for minutes. |
| **The second fix** | `config/scripts/start/lib/with-timeout.sh`, one implementation for both start scripts — `openclaw.sh` and `git.sh` each carried their own copy, so the unbounded fallback existed twice. Where coreutils is present it is still used, because it is the better instrument and every container here has it. Where it is not, the command runs in the background under a watchdog that sends SIGTERM at the limit and SIGKILL after the grace, and the helper answers **124**, the number coreutils uses, so a caller cannot tell the two hosts apart. N1b covers it: the expiry, the counterpart of a command that finishes, output captured through `$( )`, the command's own stderr kept while the shell's job bookkeeping is not, `0` still meaning unbounded, and a stub named `timeout` on `PATH` proving coreutils is still preferred. |
| **Covers** | OC-G4, §5.1 |
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

### OC-13 / OC-14 — proxy attribution: membership, not width

| | |
|---|---|
| **Premise** | Re-founded 2026-09-16. These cases asserted that a *wide* `trustedProxies` is refused and a *narrow* one accepted, and both observations were real. The rule behind them is not width: `resolveForwardedClientIp` walks `X-Forwarded-For` right to left, discards every hop that is loopback or trusted, and refuses the request when nothing is left. What decides is whether the **client** is in the list. |
| **Component** | The running stack: nginx, the gateway, and its live `trustedProxies`. |
| **Test data** | OC-13: what the start script wrote, read from the live config — `["127.0.0.1/32", "<SYSTEM_PROXY_IP>/32"]`. Two clients: a container on the stack network, and the host. OC-14: `["127.0.0.1/32", "<SYSTEM_NETWORK_SUBNET>"]`, which is exactly what this repository wrote until 2026-09-16. |
| **Expected** | OC-13: both clients `HTTP 200`. OC-14: the client inside the subnet `HTTP 403` with `"type":"proxy_attribution_required"`, and the gateway log line `observed unattributable proxy-shaped traffic from <proxy ip>`. |
| **Failure** | OC-14 answering 200 would mean the single address is no longer load-bearing. OC-13's in-network half answering 403 is the defect itself: every agent in this stack reaches the gateway that way. |
| **Why the host alone was not enough** | The old OC-13 asked only the host. On Docker Desktop that client is `192.168.65.1`, outside the stack subnet, so it answered 200 while every container got 403 — and on rootless docker with the `builtin` port driver the host arrives as `10.99.0.1`, inside it, and even a browser gets 403. A case that asks one kind of client cannot see the rule. |
| **What it found** | **Run 2026-09-16.** Before the fix, with the subnet trusted: host `192.168.65.1` → 200, container `10.99.0.11` → **403**. After it, with `10.99.0.2/32` trusted: container `10.99.0.136` → **200**, host → 200, and no further `unattributable` line in the gateway log. The negative half reproduces the 403 on demand by putting the subnet back. |
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
| **What it found** | **Passed**, including the browser half. All seven checks green, `doctor` free of critical findings, legacy keys and codex errors, and no tag moved during the run. On a state directory twenty minutes old the Control UI loaded with **no pairing prompt**, the model could be set — the same action answered `model not allowed` that morning — and a turn returned the exact probe string in five seconds. The interactive sign-in was exercised rather than restored, which is the choice §1 of the procedure asks for. |
| **Test data** | The procedure in `PROCEDURE-cold-start.md`. It no longer names a version: it reads the pin out of `config/openclaw/templates/Dockerfile` and requires the container to report *that*, so the same document serves OC-BASE and OC-20 and whatever is pinned next. Its corrected step 4 has never been run — this is its first execution. |
| **Expected** | The same seven checks, with two differences from the 2026-09-05 run: OpenClaw reports **2026.9.1**, and the Control UI answers 200 **without any browser having paired**. `openclaw config validate` valid, `doctor` free of critical findings and legacy keys, the Claude CLI at 2.1.x, `bun_runner` healthy, and every service running with **zero restarts and every healthcheck green** — check 6 is the restart-aware one from OC-30, not the sweep that reported a crash-looping gateway as sound. |
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
| **Covers** | §1, and the return path in `PROCEDURE-cold-start.md` §1 |

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
| **Component** | The acceptance sweep in `PROCEDURE-cold-start.md` step 5. |
| **Test data** | A container in a restart loop — reproducible with the OC-28 state, which crash-loops on purpose. |
| **Expected** | The sweep reports a failure **on every sample**, not only on the lucky ones. Achieved by reading `RestartCount` and the health status per container rather than the one-line `Status` string: a freshly started stack has `RestartCount` 0, and any container with a healthcheck must reach `healthy`, not sit in `starting`. |
| **Failure** | Any sample during a crash loop that reports the stack as sound. |
| **Why it is here rather than quietly fixed** | Every "all services running" claim in this repository's records was made with the old sweep, including the baseline run of 2026-09-05. Those results are not invalidated — the stack was genuinely sound, and `bun_runner` was the only thing it ever caught — but the confidence they carry is lower than it reads, and that belongs on the record rather than in a silent edit. |
| **Covers** | OC-G4, and the acceptance in `PROCEDURE-cold-start.md` |

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
`verification/RESULT-cold-start-2026.7.1.md`.

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
| **OC-G5** a way back that needs no terminal | OC-39 to OC-47, and OC-47 is the one that walks it end to end |
| §9 R1 the grant the recovery rests on | OC-39, OC-40, OC-41, OC-42 |
| §9 R2 the card the operator uses | OC-43, OC-44, OC-45 |
| §9 R3 where admin is granted | OC-46, with OC-38 as its control |

### OC-32 / OC-33 — the configuration is written once, by someone who can see the network

*Timur's F2 in #11, measured on 2026-09-10 before anything was changed.*

| | |
|---|---|
| **Premise** | `scripts/linux/start.sh` runs `down.sh` at line 16, which removes the compose network, and `config/scripts/start/openclaw.sh` at line 144, which looks the network up at line 344 to write `gateway.trustedProxies`. With the network gone the lookup is empty and the **wide RFC1918 list** is written; a block after `docker compose up` then rewrites the gateway's configuration and restarts it. The comment above that block says *"on every ordinary start it already matches and nothing happens"*, which is the opposite of what was measured. Two writers race: the correction and the gateway's own startup write, which stamps `meta.lastTouchedVersion` and `modelPolicy`. |
| **Component** | OC-32: `scripts/linux/start.sh` as text. OC-33: a real start, end to end. |
| **Test data** | The measurement this case is built on, from `/tmp/start-3-clean.log` of 2026-09-10: line 83 `Network nocodenation_liquid_upstart_network_8888 Removed`; line 110 `trustedProxies = ["127.0.0.1/32","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]`; line 240 `Narrowing OpenClaw trustedProxies to 172.18.0.0/16 (the network exists only now)...`. Those three lines in one run are the defect. |
| **Expected** | OC-32: the network is created before `openclaw.sh` is invoked, and no post-`up` narrowing block remains. OC-33: after a start, `gateway.trustedProxies` is exactly `["127.0.0.1/32", "<the stack's subnet>"]`, the run's output contains **no** narrowing line, and the gateway was not restarted after `up` — its `StartedAt` is not later than the services `up` brought with it. |
| **Precondition OC-33 must assert, not assume** | That **no container outside this branch's `compose.yml` is attached to the network** before the start. On 2026-09-10 the defect was invisible across two full starts because `nar_builder`, an orphan from `feature/liquid-java-extensions`, held the network open: `docker compose down` reported `Resource is still in use`, the network survived, the lookup succeeded, and the wide list was never written. Three explanations were offered for that and the first two were wrong. A case that does not assert the precondition will one day report this defect as fixed when it is merely hidden. |
| **Covers** | OC-G3, F2 of the #11 review. |

**OC-33, run by hand.** It needs a full `start.sh`, which tears the whole stack down; no other system
case does that, so it stays out of the suite for the same reason OC-20 and OC-28 do.

```bash
cd /Users/christof/repos/liquidupstart
source .env

# The precondition, asserted rather than assumed. Anything on the network that
# this branch's compose.yml does not declare keeps `down` from removing it, the
# lookup then succeeds, and the defect is invisible. That is what happened on
# 2026-09-10, twice, before it was noticed.
NET="nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT:-8888}"
docker network inspect "$NET" --format '{{range .Containers}}{{.Name}}{{"\n"}}{{end}}' 2>/dev/null \
  | grep -v '^$' | sort > /tmp/oc33-onnet.txt
docker compose config --services | sort > /tmp/oc33-declared.txt
comm -23 /tmp/oc33-onnet.txt /tmp/oc33-declared.txt
# Expect no output. Anything listed is an orphan: remove it before going on,
# or this check reports a defect as absent that is merely hidden.

./scripts/linux/start.sh 2>&1 | tee /tmp/oc33.log

grep -c 'Narrowing OpenClaw trustedProxies' /tmp/oc33.log        # expect 0
grep -o 'trustedProxies = \[[^]]*\]' /tmp/oc33.log              # expect the stack subnet, not RFC1918
python3 - <<'EOF'
import json
d = json.load(open('volumes/_openclaw/openclaw.json'))
print('trustedProxies:', d['gateway']['trustedProxies'])
EOF
# Expect ["127.0.0.1/32", "<this stack's subnet>"] and nothing wider.

# And the gateway was not restarted after `up`: its StartedAt is not later than
# a service `up` brought with it.
for c in postgres proxy openclaw-gateway; do
  printf '%-18s %s\n' "$c" "$(docker inspect -f '{{.State.StartedAt}}' "$(docker compose ps -q $c)")"
done
```

**What the run of 2026-09-10 produced before the repair**, for comparison: `Network ... Removed`,
then `trustedProxies = ["127.0.0.1/32","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]`, then
`Narrowing OpenClaw trustedProxies to 172.18.0.0/16 (the network exists only now)...`, and
`proxy` restarted at `08:17:13` against `postgres` at `08:16:13`.

### OC-34 — a restart that takes the proxy with it

*Timur's F7, and it is the same start.*

| | |
|---|---|
| **Premise** | `docker compose restart <service>` restarts that service's dependants from Compose v2.20 on; `--no-deps` is the opt-out. `proxy` declares `depends_on: openclaw-gateway`, so narrowing the trusted proxies bounces nginx — and the next line's `nginx -s reload` runs against a proxy that is still coming back, swallowed by `|| true`. The URL table is printed two lines later, and the dashboard reports success. |
| **Component** | `scripts/linux/start.sh` and `config/scripts/start/*.sh` as text. |
| **Test data** | The container start times measured on 2026-09-10 after a clean start: `postgres` and `liquid` at `08:16:13`, `proxy` at `08:17:13`, `openclaw-gateway` at `08:17:16`. The proxy restarted a minute after the stack came up and **three seconds before** the gateway it was supposed to be a bystander to — Compose restarts dependants first. |
| **Expected** | Every `docker compose restart` in the start path either carries `--no-deps` or is named here as a deliberate exception with its reason, in the shape OC-3 established for unbounded calls. `docker restart <container>` is permitted: it addresses one container and knows nothing of `depends_on`. |
| **Unhappy** | The positive counterpart is the exception list itself: a restart that *should* take its dependants along is allowed and must say so, otherwise the case reads as a ban rather than a decision. |
| **Covers** | OC-G3, F7 of the #11 review. |
| **Note** | If F2's fix removes the post-`up` block entirely, this case has nothing left to catch **in that block** — and it stays, because it is about the shape of every restart in the start path, not about this one. |

### OC-35 — a network nobody joins

*Found on 2026-09-10 while measuring F2, and not part of the #11 review.*

| | |
|---|---|
| **Premise** | `scripts/linux/start.sh:147` creates `nocodenation_playground_network_${HTTP_PORT}` on every start. `compose.yml:851` names the stack's network `nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT}`. Nothing joins the first: on the host it was measured on it held **0 containers** and had been sitting there long enough that nobody remembers creating it. The name comes from an earlier name for this project. The intention — have the network before the containers — was right and is what F2's fix needs; it simply names a network that does not exist in `compose.yml` and does it three lines *after* `openclaw.sh` has already looked one up. |
| **Component** | `scripts/linux/start.sh` and `compose.yml` as text, plus the live daemon. |
| **Test data** | The exact strings: `compose.yml` declares `name: nocodenation_liquid_upstart_network_${SYSTEM_HTTP_PORT:-8888}`; `start.sh` creates `nocodenation_playground_network_${HTTP_PORT}`. On the measured host both existed, the second with `0 Container`. |
| **Expected** | Every network name the start scripts create or inspect appears in `compose.yml`'s `networks:` block. A name that appears in neither fails the case and is named in the failure, so the next stray one is found by the same assertion rather than by somebody reading line 147 for another reason. |
| **Unhappy** | The counterpart is that the case must still pass once the name is corrected — a case that only forbids would be satisfied by deleting the creation altogether, which is the opposite of what F2 needs. |
| **Note** | This is why the defect survived: a leftover network is invisible. It costs nothing, breaks nothing, and answers `docker network ls` like any other. It was found only because F2 sent someone to read the lines around the network lookup. |
| **Covers** | OC-G3. |

### OC-36 — a bound that cannot run what it is given

*Timur's F1 in #11, reproduced on 2026-09-10 before anything was changed.*

| | |
|---|---|
| **Premise** | `with_timeout` passes its argument to coreutils `timeout`, which **execs** it. A shell function is not a program, so `timeout 5 copilot_cli` fails with `failed to run command: No such file or directory` and exit **127**. `copilot_authed`, `codex_authed` and `grok_authed` each wrap such a call, capture its output with `2>&1`, and decide by `grep`. The 127 never surfaces: the error text lands *inside* the captured string, the grep does not match, and the helper answers **false**. A valid persisted login reads as "not signed in". |
| **Component** | `config/scripts/start/openclaw.sh` as text, plus the behaviour of `timeout` itself. |
| **Test data** | `bash -c 'f(){ echo x; }; timeout 5 f; echo $?'` → `timeout: failed to run command ‘f’: No such file or directory`, `127`. Against `timeout 5 echo x` → `x`, `0`. Both measured on 2026-09-10 with GNU coreutils on `PATH`; without `timeout` installed, `with_timeout` runs the argument in the current shell and the function is found, which is why this never showed on a host without coreutils. |
| **Expected** | Every argument `with_timeout` is given is a program on the `PATH` or an absolute path, never a name defined as a shell function in the same file. The unit half asserts the underlying fact — that `timeout` cannot exec a function — so the contract half is not resting on a claim about a tool nobody re-checked. |
| **Impact if unfixed** | With `ENABLE_GITHUB_COPILOT=1` and a valid login, every start prints `::aiw-copilot-auth-required::`, loops `until copilot_authed` for the full 900 s, then continues with "sign-in not completed". With a TTY and Codex or Grok enabled, an interactive sign-in is forced on every start and reported as failed afterwards. |
| **Covers** | OC-G4, F1 of the #11 review. |

### OC-37 — a failing probe does not take the start down with it

*Timur's F4, and it is the same silence one layer over.*

| | |
|---|---|
| **Premise** | `openclaw_version` ends its `docker run` with `\|\| return 0` and its caller tolerates an empty answer. `openclaw_state_version` does neither: no `\|\| return 0` inside, no `\|\| true` on `STATE_VERSION="$(openclaw_state_version)"`. Under `set -euo pipefail` a failing `docker run` — image absent, daemon erroring, `timeout` returning 124 or 125 — ends the script at that assignment. `2>/dev/null` has already discarded the reason, and `start.sh` ran `down.sh` a hundred lines earlier, so the stack is left down with no explanation and no message. |
| **Component** | `config/scripts/start/openclaw.sh` as text. |
| **Test data** | `bash -c 'set -euo pipefail; f(){ timeout 5 false 2>/dev/null; }; V="$(f)"; echo reached'` prints nothing — measured 2026-09-10. And the two functions side by side: line 51 carries `\|\| return 0`, line 147 does not. |
| **Expected** | Every `"$(…)"` assignment in the start scripts whose right-hand side may fail either tolerates the failure or is named as an exception with the reason a failure should stop the start. The message at lines 195 to 198 — *"Build the image first"* — must be reachable, which today it is not. |
| **Unhappy** | The counterpart is that a probe which *should* abort the start is allowed to: the exception list is what distinguishes a decision from an oversight. |
| **Covers** | OC-G4, F4 of the #11 review. |

### OC-38 — the scopes are a cap, and a browser that is not capped in is locked out

*Timur's F3, measured on 2026-09-10. It is the case §5.3 of the feature document asked for and did
not have: "operator.admin is excluded unless a case proves the interface unusable without it."*

| | |
|---|---|
| **Premise** | The Control UI requests `operator.admin` among its default scopes. `deviceAutoApprove.scopes` is a **cap on what an approval may grant**, not the set a device receives. Leave admin out and the effect is not a degraded interface — the approval never completes. |
| **Component** | The gateway's device approval, through the browser. Manual: it requires revoking a device and reconnecting, and a wrong turn locks the operator out of the UI. |
| **Test data** | The six non-admin scopes as `config/scripts/start/openclaw.sh` wrote them until 2026-09-10 — `operator.read, write, talk, pairing, approvals, questions` — against a browser whose device has been revoked from the Devices page. |
| **Expected, and measured** | The browser does **not** connect. It shows *"Role upgrade pending. This browser is already known, but the requested access changed and needs a fresh approval."* The gateway logs `security audit: device access upgrade requested reason=role-upgrade device=<id>` on each attempt and never approves. With `operator.admin` added to the cap and the gateway restarted, a **new** device — a private window, since revocation is sticky per device — connects, and the gateway logs `SECURITY WARNING: gateway.auth.trustedProxy.deviceAutoApprove.scopes includes operator.admin`, which is what OC-10 asserts. |
| **What must not be trusted** | An existing device. The one in use on 2026-09-10 carried `operator.admin` from a grant made under 2026.7.1's `dangerouslyDisableDeviceAuth` and kept it — while `operator.talk`, which *was* configured, was absent from the same device. Every page worked and a `config.patch` write from the UI succeeded. **Only a fresh approval exercises the cap.** A run that checks the interface with the device it already has proves nothing, which is why this went unnoticed through the whole migration. |
| **The recovery is part of the case** | The interface names `openclaw devices approve <id>`. It answers `unauthorized` from inside the gateway container and from `openclaw-cli`, which shares the gateway's network namespace: `trusted-proxy` mode wants a header the CLI does not send. `gateway.auth.identityScopes` was tried and changes nothing — it grants scopes to an identity, while what blocks is the cap on the approval. The way back is to add the scope to the cap, restart the gateway, and connect from a browser with no stored device identity. Anyone running this case should know that before running it. |
| **Corrected 2026-09-19** | The row above is right about the browser and wrong about the CLI, and the error matters because this row is what justified granting `operator.admin`. The CLI is refused because it reaches the gateway **directly**. Sent through nginx — `--url ws://openclaw.localhost:8888` — it is authenticated by the same header the browser gets, and with `identityScopes` granting `operator.pairing` it approves the request. Measured 2026-09-19; OC-41 and OC-42 are the pair that hold it. |
| **Covers** | OC-G1, OC-G3, F3 of the #11 review, §5.3. |

### OC-39 / OC-40 — the identity is written once, or it is written wrong

*Specified and **built** 2026-09-19. `tests/contract/m-oc.identity-scopes.test.ts`, six tests, run
against the unfixed script first: **five of the six were red**, and the one that passed is the half
asserting the nginx template sets a single identity, which was already true.*

| | |
|---|---|
| **Premise** | The recovery of §9 works only while `gateway.auth.identityScopes` names **exactly** the identity nginx injects. Today's grant is a hand edit of `volumes/_openclaw/openclaw.json`, and `config/scripts/start/openclaw.sh` rewrites that file on every start — so the next `./scripts/linux/start.sh` removes the way back without saying anything. The second hazard is subtler: an identity spelled in two files is an identity that will one day differ in one of them, and the failure is silent — the grant simply never matches, and the CLI is refused for a reason that looks like a scope problem. |
| **Component** | OC-39: `config/scripts/start/openclaw.sh` and the configuration it produces. OC-40: that file together with `config/nginx/templates/nginx.conf`, as text. |
| **Test data** | The header, as the template sets it today: `proxy_set_header X-Forwarded-User "user@nocodenation.org";` — three times, for `openclaw.localhost`, `bridge.openclaw.localhost` and `msteams.openclaw.localhost`. The config key that must match it: `gateway.auth.identityScopes["user@nocodenation.org"]`. The scopes written: `operator.admin, operator.read, operator.write, operator.talk, operator.pairing, operator.approvals, operator.questions` — the same list `deviceAutoApprove.scopes` carries, until R3 changes both. |
| **Expected** | OC-39: after the start script has run, the written configuration contains `gateway.auth.identityScopes` with at least `operator.pairing` for the proxy's identity, and `openclaw config validate` accepts it. OC-40: the identity string appears in the repository in **one** place, and both the nginx template and the start script derive it from there. A change to one that is not reflected in the other fails the case and names both files. |
| **Unhappy** | OC-40 is the negative half and it is the one that earns its place: OC-39 alone is satisfied by writing any identity at all, including one no request will ever carry. The counterpart the pair needs is that a **matching** identity passes — otherwise the rule could be met by refusing everything. |
| **Why a case and not a comment** | The same shape has already cost this project twice: `trustedProxies` written from a lookup that was empty (OC-32), and a subnet pinned to the one range docker hands out first. A value that two files must agree on is a fact to compute, not a string to remember. |
| **How it was built** | `config/scripts/start/openclaw.sh` reads the identity out of `config/nginx/templates/nginx.conf` with awk, refuses to start when the template holds none or more than one, and passes it to the config writer as `LU_PROXY_IDENTITY`. The grant is written inside the `schemaNew` branch and deleted in the other, because `identityScopes` is not a key 2026.7.1 knows. The case asserts the identity string appears in **no** literal form in the script, which is the assertion that would have caught a second copy. |
| **What it found while being built** | A defect of its own, and one worth carrying: the whole config writer is a single-quoted bash string, so the apostrophe in a comment reading *"what OpenClaw's own warning recommends"* **ended the string** and the start script stopped parsing at `bash -n`. Two more apostrophes had been written into the same block. The rule is now in the block itself, and the check is one line: `bash -n config/scripts/start/openclaw.sh` before trusting any edit to that program. |
| **Covers** | OC-G5, §9 R1. |

### OC-41 / OC-42 — the way back exists, and it is not the one that was tried

*Measured 2026-09-19 against the live stack. OC-41 passed; OC-42 is the negative result that keeps §9 honest.*

| | |
|---|---|
| **Premise** | `gateway.auth.mode` is `trusted-proxy`, so identity comes only from nginx's header. A CLI inside the gateway container sends no such header and is refused. The same CLI **through** nginx is authenticated, because nginx sets the header for whatever arrives on that route. What it then lacks is a scope, and `identityScopes` supplies it. OC-42 is the other half: that grant does **not** release a device whose token was revoked, because the device gate is evaluated before identity scopes are applied. |
| **Component** | The running gateway, nginx, and the `openclaw` CLI from `liquidupstart/openclaw:latest`. Manual: it needs a device in the repair state, which means revoking one. |
| **Test data** | The call, exactly: `docker run --rm --network nocodenation_liquid_upstart_network_8888 --add-host openclaw.localhost:<proxy ip> -e OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 liquidupstart/openclaw:latest openclaw devices list --url ws://openclaw.localhost:8888 --token unused --timeout 20000`. Each part is load-bearing: without `--add-host` the name does not resolve inside the network; without the environment variable the CLI refuses plaintext `ws://` to a non-loopback address; without `--token` it refuses `--url` outright. **The token's value is never checked** — `unused` is the literal string that was measured, and it is chosen to say so. The device in the repair state on the measuring host: `a26aab16fdf39295924c5e2497dbc9c6b08920f5a2af8d4eef7e3fe744e5b435`, revoked 2026-09-10 12:35:16, approved again 2026-09-19 09:39:52. |
| **Expected, and measured** | OC-41: without the grant the call answers `missing scope: operator.pairing` — authentication already succeeded. With the grant it prints the device table, and the gateway logs `security audit: identity scope grant elevated connection identity=user@nocodenation.org addedScopes=…`. Approving then prints `Approved <device id> (<request id>)`, and the browser's next connection logs `[ws] webchat connected client=openclaw-control-ui remote=10.99.0.2`. OC-42: with the same grant in place and the gateway restarted, a browser whose device is in the repair state is **still** refused, logging `reason=role-upgrade roleFrom=<none> roleTo=operator`. |
| **Unhappy** | OC-42 *is* the unhappy half, and it exists because the opposite was proposed twice — on 2026-09-10 and again on 2026-09-19 — as the fix for the browser. Without it, §9's R1 reads like a cure and the next person spends an afternoon rediscovering that it is only an enabler. |
| **What must not be trusted** | `missing scope` as evidence that authentication failed. It is the opposite: the refusal that proves the header arrived. The 2026-09-10 attempt recorded `unauthorized` from a CLI that never went through the proxy and generalised it to "no path back". |
| **Covers** | OC-G5, §9 R1, and the correction to §5.3. |

### OC-43 / OC-44 / OC-45 — the card an operator can actually use

*Specified and **built** 2026-09-19. `tests/contract/m-oc.pairing-card.test.ts`, seventeen tests.*

| | |
|---|---|
| **Premise** | The operator's own words are the requirement: deleting site data is not a recovery a user performs. The dashboard already carries the pattern — the deploy-key queue of M-A9 — and the same place is where someone looks when a service will not open. The one mechanism this card must respect is the id churn: a refused browser retries and **mints a new request id every time**, so an id rendered into a page is stale before it is clicked. |
| **Component** | The dashboard's server route and the CLI behind it. Integration: no browser, but a real gateway. |
| **Test data** | Four request ids observed for one device within thirty minutes on 2026-09-19: `e626a793-ea03-4672-b21c-868a7fd5268c`, `0e4e2a95-2bac-480e-9500-1b50f1117bdd`, `53176b95-6c01-4e92-9d23-14d888066ab3`, `09cc464f-690a-4a51-9ac9-c97b7011eb34`. The last is the one that was approved; the first is the one the browser had printed for copying and is what a careful operator would have pasted. The listing shape the route must return: `{ "pending": [ { "requestId", "deviceId", "clientId", "isRepair", "requestedAt" } ] }`, read from the CLI's `--json` output at `.pending[0].requestId`. |
| **Expected** | OC-43: with a pending request present, the route lists it; pressing approve re-reads the current id, approves it, and the device's stored token is valid afterwards rather than revoked. OC-44: approving an id that is no longer pending answers with the CLI's own refusal and a 502 — never a quiet success, and never a message this project invented. OC-45: a `requestId` failing `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` is rejected before any command is built, with the same shape as `start-skip`'s step guard. |
| **Unhappy** | OC-44 and OC-45 are the negative halves; OC-43 is their counterpart and is what stops the guard from being satisfied by a route that refuses everything. OC-45 needs both signs in the same run — a well-formed id passes the guard and reaches the command, a malformed one does not. |
| **Test data, both sides** | Must be accepted: `09cc464f-690a-4a51-9ac9-c97b7011eb34`, a real id from the measurement. Must be refused: `"; docker rm -f openclaw-gateway; #`, `09cc464f-690a-4a51-9ac9-c97b7011eb34 extra` — because a guard that only looks for a prefix is the usual way this kind of check is written wrong — `x09cc464f-…`, the empty string, `latest-ish`, and the same id in upper case. |
| **How it was built** | `config/scripts/openclaw-pairing.sh` holds the docker invocation, the way `git.sh` holds the clone the retry reuses; `dashboard/src/lib/server/pairing.ts` spawns it and parses the CLI JSON, because the dashboard container has `docker` and `bash` but **no `jq`**, and a shell that reshapes JSON is a second place for the shape to be wrong. The card posts the literal `latest` and the route resolves it against what is pending at that moment. The card draws nothing at all while nothing is waiting. |
| **The control that earns the green** | The churn rule was broken on purpose — the card changed to post `req.requestId`, the id it had rendered — and the case went **red**, naming that assertion. Restored afterwards. Without that, seventeen passing tests would only have shown that the file says what it says. |
| **OC-47 · the whole mechanism, walked · manual** | Run 2026-09-19 on the operator machine, and the only run that exercises all of §9 at once. A device was **revoked on purpose** — the same act that caused the incident on 2026-09-10 — so a browser in the repair state existed to look at. Timeline: `devices revoke` at 16:03:10 through nginx; the private window reloaded and showed *"Role upgrade pending"*; the dashboard drew the card, naming `openclaw-control-ui`, **returning**, `8349140452f9`; **Approve** pressed; gateway logged `device pairing approved device=8349… role=operator` at 16:06:53; the private window reloaded and `webchat connected` at 16:07:27. No terminal, no request id carried by hand, no site data deleted. |
| **And what walking it found** | **The confirmation disappeared with the card.** Approving empties the pending list, the card is drawn only while something is pending, and the result line lived inside it — so the operator pressed the button and the card simply vanished. That is the operator own finding of 2026-09-18 about the skip panel, reintroduced one component later by the person who had just fixed it. The card is now held open while it has an answer to show, and the list, the explanation and the button are what disappear. This is the case that would have caught it: `{#if loaded && (pending.length > 0 \|\| result)}`. |
| **Covers** | OC-G5, §9 R2, §9.4. |

### OC-46 — whether admin still has to be in the cap

*Specified and **run** 2026-09-19, in a private window on the operator's own machine. **It passes**,
so R3 is built: `operator.admin` is out of the cap and granted per identity.*

| | |
|---|---|
| **Premise** | `operator.admin` sits in `deviceAutoApprove.scopes` because of OC-38: without it a freshly approved browser could not connect, and there was no way back. §9 removes the second half of that reason. What is not known is the first half — whether a browser whose auto-approval is capped below admin can connect once `identityScopes` grants admin to the identity. §9.2's M4 proved identity scopes do not release a **repair**; it says nothing about a **fresh** device, whose approval does complete. The two are different paths and must not be argued from one another. |
| **Component** | The gateway and a browser with no stored device identity. Manual, and the one case in this set that can lock the operator out of the UI while it runs. |
| **Test data** | `deviceAutoApprove.scopes` reduced to the six non-admin scopes — `operator.read, write, talk, pairing, approvals, questions` — with `identityScopes["user@nocodenation.org"]` carrying all seven including `operator.admin`. Run from a private window, since revocation and pairing are both sticky per device. The control is OC-38's measurement of 2026-09-10: the same six scopes, no identity grant, browser refused. |
| **Expected** | The browser connects **on the first try, with nobody approving anything** — the operator's requirement of 2026-09-19, and the bar this case is measured against rather than "connects eventually". Every admin-gated page works, and the gateway logs **no** `SECURITY WARNING` naming `operator.admin`, the absence of that line being the observable that says the trade was actually taken rather than merely intended. |
| **If it fails** | R3 is refused, `operator.admin` stays in `deviceAutoApprove.scopes`, and its justification is rewritten: not *"there is no way back"*, which is false, but *"the cap is the only place the Control UI's own request can be satisfied"* — which OC-38 and this case together would then have measured. A refusal here is a result, not a failure of the milestone. |
| **Unhappy** | OC-38 is the counterpart and it already ran. This case is only meaningful beside it: one shows the six scopes failing without an identity grant, the other shows them passing with one — and if it does not, the pair still answers the question, which is why it is worth running either way. |
| **Before running it** | Read §9.2. A device in the repair state cannot be released from the browser, and until R1 is written into the start script the recovery depends on a hand edit that `./scripts/linux/start.sh` will remove. |
| **What it found** | **It passes, and it passes through the mechanism rather than past it.** Three audit lines within twelve milliseconds: `trusted-proxy browser device auto-approved … scopes=operator.approvals,operator.pairing,operator.questions,operator.read,operator.write` — five scopes, no admin — then `identity scope grant elevated connection identity=user@nocodenation.org addedScopes=operator.admin`, then `webchat connected client=openclaw-control-ui`. The device row in `device_pairing_paired` carries the five, not six. The operator confirmed the admin-gated surfaces render: *Gateway auth*, *Exec policy*, the tool profile switcher and *Pair device* on the Privacy & Security page. And the `SECURITY WARNING` naming `operator.admin` is gone from the startup log for the first time since 2026-09-10. |
| **Why the device row matters more than the screenshot** | A browser that connects proves the cap admits it; only the stored scope set proves the cap is what admitted it. Without that row the same result would be explained equally well by the configuration change never having taken effect — which is the failure shape this project has met three times, where a check that could not run looked exactly like a check that ran. |
| **Covers** | OC-G5, §9 R3, and reverses OC-10 / OC-11. |

