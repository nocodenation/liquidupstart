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
| OC-3 | contract | **negative** | Every unattended `docker run` in the start script is bounded, or is a named exception with a reason. **Live, and the only case asserting that rule** — `describe('OC-3 every unattended docker call in the start script is bounded')` in `tests/contract/m-oc.bounded-calls.test.ts`. It carries no registry entry; see *OC-60 / OC-61 / OC-62* in §4 |
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
| **OC-60** | contract | **negative** | Every bounded `docker run` **can actually be bounded**: each carries `--init`, without which `timeout` frees the client and leaves the container, and the bound comes back within its limit plus the grace |
| **OC-61** | contract | **negative** | A named container is removed when its run does not end by itself: every `docker run` whose container is named `"$name"` or `"$cname"` is followed by a `docker rm -f` of that name, because `timeout` kills the docker client, not the container. It asserts that the removal is there, not the condition it runs under |
| **OC-62** | unit | **negative** | A host without GNU coreutils still has a bound: the fallback ran the command unbounded, which is every macOS host, the operator's included |
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
| **OC-75** | component | positive + **negative** | …and the written configuration says so: `operator.admin` is **not** in `deviceAutoApprove.scopes`, and it **is** in the identity grant — *renumbered from `OC-46` on 2026-10-14, B6 of 2026-10-01* |
| **OC-47** | system, **manual** | positive | The whole way back, walked: revoke → refused browser → card → Approve → connected. **Run 2026-09-19**, and it found a defect no automated case had |
| **OC-48** | unit | **negative** | Approve never means a request that is not a Control UI browser asking for operator access — **2026-09-29 review, finding 2** |
| **OC-49** | unit | positive | One browser retrying is still approved, at its newest id. The counterpart to OC-48 and OC-50 |
| **OC-50** | unit | **negative** | Two different browsers pending is a question, not a guess |
| **OC-51** | unit | **negative** | A refusal carries the reason, not the CLI usage footer — **finding 3** |
| **OC-52** | component | **negative** | A listing that failed is said out loud — **finding 4** |
| **OC-53** | component | positive | An empty queue still draws nothing. The counterpart to OC-52 |
| **OC-54** | component | positive | The operator's browser gets the button, with role, address and scopes on the row |
| **OC-54** | **negative** | …and the node host is named and gets none — one button, for the one device the card can approve |
| **OC-54** | positive | …and pressing it names that **device**, never a request id the page had rendered |
| **OC-55** | component | positive | A request arriving after mount shows without a reload — **finding 5** |
| **SP-2** | component | **negative** | The card file's cases need a DOM, and when it is absent that is reported under `SP-2` rather than under a case id — *added 2026-10-13* |
| **OC-65** | unit | **negative** | A JSON answer is read as JSON, not as its first line: a transport failure says what failed rather than `{` — *A1 of 2026-10-01* |
| **OC-65** | **negative** | …and the `reason` is carried, because it is the half that names the remedy |
| **OC-65** | positive | …and plain text still goes through the line reader, which is finding 3 of 2026-09-29 and must not be undone |
| **OC-65** | positive | …and something that is neither falls back rather than throwing |
| **OC-66** | integration **unhappy** | A script whose grandchild outlives the budget is stopped, grandchild and all — *A2 of 2026-10-01* |
| **OC-66** | positive | …and a script that answers at once is not reported as timed out |
| **OC-67** | component **negative** | With the stack down the card does not ask at all, and draws nothing — *A3 of 2026-10-01* |
| **OC-67** | **negative** | …nor while a task holds the page: a start, a teardown or a rebuild |
| **OC-67** | positive | …the counterpart: with the stack up it asks, once |
| **OC-67** | **negative** | …and two triggers while one request is unfinished make no second request |
| **OC-68** | component | With nothing pending and a revoked Control UI token, the card is still drawn — *A4 of 2026-10-01* |
| **OC-68** | positive | …and it names the one thing that brings the request back: reload OpenClaw in that browser |
| **OC-68** | **negative** | …a paired browser with live tokens draws nothing |
| **OC-68** | positive | …and a pending request still wins the heading |
| **OC-68** | integration | The revocation is read out of the listing itself: the newest `revokedAtMs` of a Control UI device |
| **OC-68** | **negative** | …live tokens are not a revocation, and a revoked token on a node host is not ours |
| **OC-69** | component | A scope refusal is turned into the one thing that fixes it: start the stack once — *A5 of 2026-10-01* |
| **OC-69** | **negative** | …and another refusal gets no restart instruction |
| **OC-69** | unit | The observed network, address and port win over `.env` |
| **OC-69** | **negative** | …an answer that is not an observation is ignored |
| **OC-69** | positive | …and with no proxy at all the `.env` values stand |
| **OC-70** | integration | The requester address is read from `remoteIp`, the field the gateway emits — *B1 of 2026-10-01* |
| **OC-70** | **negative** | …and the old field name is not accepted, because accepting it kept a fixture alive that no gateway produces |
| **OC-70** | **negative** | No retry count is shown: it could only ever be one |
| **OC-70** | positive | …and the row says whose words the client and the role are, with the address ahead of them — *B2* |
| **OC-71** | component | The card says approving grants full operator access **including administrative rights** — *B3 of 2026-10-01* |
| **OC-71** | positive | …and says why nothing here can narrow it, because the CLI has no way to |
| **OC-72** | integration | A GET whose `Origin` names another site is refused — *C3 and B5 of 2026-10-01* |
| **OC-72** | **negative** | …and so is the shape that sends no `Origin` at all: a cross-origin `<img>` |
| **OC-72** | **negative** | …and a `no-cors` fetch from such a page, which also sends none |
| **OC-72** | positive | …while the card's own GET, which sends no `Origin` either, is served |
| **OC-72** | positive | …and a client that is not a browser is still served |
| **OC-72** | **negative** | A POST from another origin, and one with no `Origin`, are both refused |
| **OC-72** | **negative** | A listing that failed answers 502 rather than approving blind |
| **OC-72** | **negative** | Two devices waiting is 409, because only the operator can answer it |
| **OC-72** | **negative** | A `requestId` that is pending but not ours is refused, not approved |
| **OC-72** | **negative** | With nothing of ours waiting, an empty body says so |
| **OC-72** | positive | A body naming nothing resolves to the one device waiting |
| **OC-72** | positive | …and an unparseable body behaves as an empty one, not as a crash |
| **OC-72** | positive | …and the device named in the body is approved |
| **OC-73** | component | The approval is still readable once the queue it emptied is gone — *B5 of 2026-10-01, the property retired with `OC-43`'s source pattern* |
| **OC-74** | integration | One identity is extracted from the nginx template — *B5 of 2026-10-01* |
| **OC-74** | positive | …and the same identity on several hosts is still that one identity |
| **OC-74** | **negative** | Two different identities stop the start, and both are named |
| **OC-74** | **negative** | A template with no identity stops the start |
| **OC-74** | **negative** | An **empty** identity beside a real one stops the start, rather than picking the real one |
| **OC-74** | positive | …and the template this repository ships yields exactly one |
| **OC-74** | **negative** | A spelling nginx accepts and this does not — single quotes, a lower-case header, an unquoted variable, an unquoted literal — is refused **out loud**, with the line quoted back — *C4 of 2026-10-01* |
| **OC-74** | **negative** | …and a quoted line beside an unquoted one refuses instead of dropping one — *C5* |
| **OC-74** | positive | The verdict is asked **before** `down.sh`, so a template it cannot read does not end the start with the stack emptied — *C4* |
| **OC-74** | positive | …and both callers ask the same function rather than carrying a copy of the extraction |
| **OC-76** | unit | A stale `deviceId` with another browser waiting says so, and does not claim the queue is empty — *C1 of 2026-10-01* |
| **OC-76** | positive | …and it counts them, so two waiting browsers do not read as one |
| **OC-76** | **negative** | …while with nothing waiting at all, the empty answer is still the right one |
| **OC-76** | **negative** | …and with only a request it cannot approve, that is what the refusal says |
| **OC-77** | integration | Valid JSON on stdout with a warning on stderr beside it is still parsed — *C2 of 2026-10-01* |
| **OC-77** | **negative** | …and output that really is not JSON is still reported as that |
| **OC-56** | component | **negative** | No identity named, nothing granted — and no key `"undefined"` — **minor** |
| **OC-57** | component | positive | A hand-added identity survives a start — **minor** |
| **OC-58** | unit | positive | A single-quoted port in `.env` is read like a double-quoted one — **minor** |
| ~~**OC-43**~~ | contract | positive | The card has a condition on it at all, and a result that outlives the list. **Retired 2026-10-14** — the first half is `OC-52`/`OC-53`, the second had no counterpart at all and is now `OC-73` |
| ~~**OC-59**~~ | contract | **negative** | A GET from another origin is refused too — **minor**. **Retired 2026-10-14**, replaced by `OC-72`: it read the route's source, and what it signed off was that an absent `Origin` is *not* refused — which is exactly the `<img>` shape the check existed to stop |
| **OC-63** | contract | **negative** | The embedded node programs survive the shell that carries them: a `-e` program reaches node as one argument and nothing inside it is re-split |
| **OC-64** | contract | positive | The proxy address is one default, written the same in every place that carries it |

*These two were documented on 2026-10-09, after the fact, and **renumbered from OC-40 and OC-42 on
2026-10-12**.*

> **Why they moved, and why it was these two rather than the other pair.** #15 specified `OC-39` to
> `OC-59` on 2026-09-19 and has carried `OC-40` and `OC-42` ever since, with two signed detail blocks,
> a traceability row, test headers and a comment in `config/scripts/start/openclaw.sh` naming them.
> These two ids were assigned here on 2026-10-09 while back-filling rows for tests that had none, with
> no knowledge of that branch — so the same two numbers came to mean four different cases, and
> `OC-40` collided between two **automated** tests: `m-oc.identity-scopes` on #15 and
> `m-oc.bound-arguments` here. A merge of either branch into the other would have produced a document
> with one id and two meanings, which is the defect A1 on #17 was.
>
> The later and cheaper pair moves. Six places here against roughly twelve there, and renumbering
> mid-review on a branch under eleven open findings costs the reviewer more than it costs this file.
> **The new numbers were computed rather than chosen**: the highest `OC-` id anywhere in the stack is
> `OC-62` (the renamed N1b on #17), which `mutate.sh --gaps` is what established — a check by hand had
> twice reported `OC-60` to `OC-62` as free because `git grep <ref>` was silently returning nothing. Their tests carried ids that no row
here declared, which `--gaps` cannot see and a reviewer cannot sign. `TR-1` in
`docs/TEST-SPEC-case-id-traceability.md` is what stops this recurring; the same had happened to
eleven cases in `TEST-SPEC-git-integration.md`.

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
| **The second fix** | `config/scripts/start/lib/with-timeout.sh`, one implementation for both start scripts — `openclaw.sh` and `git.sh` each carried their own copy, so the unbounded fallback existed twice. Where coreutils is present it is still used, because it is the better instrument and every container here has it. Where it is not, the command runs in the background under a watchdog that sends SIGTERM at the limit and SIGKILL after the grace, and the helper answers **124**, the number coreutils uses, so a caller cannot tell the two hosts apart. OC-62 covers it: the expiry, the counterpart of a command that finishes, output captured through `$( )`, the command's own stderr kept while the shell's job bookkeeping is not, `0` still meaning unbounded, and a stub named `timeout` on `PATH` proving coreutils is still preferred. |
| **Covers** | OC-G4, §5.1 |
| **Covers** | OC-G1, §5.1 |

### OC-60 / OC-61 / OC-62 — a bound that can bound, and a container that does not outlive it

*Written 2026-10-21. The three cases had overview rows and no detail block; the reasoning lived in the
test files' headers and in a note that sat inside the overview table and broke its rendering from
`OC-62` down. Items N1 and N2 of the 2026-10-21 re-review of #17, and the local review of that day.*

**OC-3, OC-60 and OC-61 are three rules, not one replaced by two.** OC-3 asserts that every unattended
`docker run` in the start script is bounded or a named exception. OC-60 asserts that a bounded run *can*
be bounded. OC-61 asserts that a container a helper named is removed when its run did not end by
itself. OC-62 asserts that the bound exists on a host without GNU coreutils. *Corrected 2026-10-09, A3
of the 2026-10-01 re-review of #17:* the OC-60 row had described OC-3's rule, and the OC-3 row had
said OC-3 was "replaced 2026-09-07 by OC-60 and OC-61"; `describe('OC-3 every unattended docker call in
the start script is bounded')` in `tests/contract/m-oc.bounded-calls.test.ts` was never touched and
still carries OC-3.

| | |
|---|---|
| **Premise** | `timeout` signals the docker *client*, not the container. Reproduced 2026-09-11: `timeout 15 docker run --rm --name X --entrypoint node <image> -e 'setInterval(()=>{},1000)' </dev/null` was still blocked after two minutes with the container up; the same with `--init` came back with rc 124 after 16 s. On 2026-09-14 the `--init` form hung a suite run for 15 minutes, and an hour later four of four ended at SIGTERM within eight seconds — intermittent, cause not established. So the property is not "returns 124". It is that the bound returns at all, within its limit plus the grace, with a status the caller reads as failure, and that nothing is left running. On 2026-09-17 the bound turned out to be absent altogether on a host without coreutils; see *What it found on 2026-09-17* in OC-3's block above. |
| **Component** | OC-60 and OC-61: `config/scripts/start/openclaw.sh` read as text, and `with_timeout` from `config/scripts/start/lib/with-timeout.sh` run against a real docker. OC-62: `with-timeout.sh` alone, under a `PATH` the case builds. |
| **Steps** | **OC-60:** collect every non-comment line of `openclaw.sh` matching `with_timeout <secs> docker run` and check each for `--init`; then source `with-timeout.sh` and run `with_timeout 8 docker run --rm --init --name lu-bound-probe-<run id> <fixture labels> --entrypoint node liquidupstart/openclaw:latest -e 'setInterval(()=>{},1000)'`, timed, followed by `docker rm -f` of that name. **OC-61:** for every `docker run … --name "$name"` (or `"$cname"`) line, look for `docker rm -f "$name"` in that line and the fourteen after it; for every `local rc=0 cname=`, look for `rc=$?` and `return $rc` in that line and the sixteen after it. **OC-62:** run the helper with `PATH=<scratch dir>:/usr/bin:/bin` and `LU_TIMEOUT_GRACE=2`. |
| **Expected** | **OC-60:** more than four bounded runs found; none without `--init`; the probe comes back with rc 124 or 137 in under 45 s — an 8 s limit and a 10 s grace, with room for a loaded machine. **OC-61:** more than two named runs found, each followed by its forced removal; no helper declares `rc` or `cname` without using them. **OC-62:** `command -v timeout gtimeout` finds neither; under `with_timeout 3`, `sh -c 'while :; do sleep 1; done'` comes back with 124 in under 20 s; `with_timeout 10 sh -c 'echo alive; exit 3'` returns 3 and prints `alive`; `echo captured` is still read through `$( )`; `echo mine >&2` survives an expiry while `Terminated` does not appear; `echo hello \| { with_timeout 0 cat; }` prints `hello`; and with a stub `timeout` on `PATH` that prints `stub-timeout $*` and exits 124, the output carries `stub-timeout` and `-k 2 3 sh -c`, and the status is 124. |
| **Test data** | The image `liquidupstart/openclaw:latest`, built by `./scripts/linux/build.sh`; the container name `containerName('lu-bound-probe')` — `lu-bound-probe-<pid>-<six random characters>`, per run so that two runs cannot take each other's — carrying `fixtureLabels()` from `tests/lib/dashboardserver.ts`, so that a container an interrupted run leaves behind is one the sweep can find (since #19); the commands and the stub above, each asserted on its literal output. |
| **What each case does not hold** | Measured 2026-10-21 by the reviewer, and again here: with both `docker rm -f "$name"` in `openclaw.sh` replaced by `true`, every OC-60 test stays green, and only OC-61's *every helper that names a container also force-removes it on failure* and OC-3's *the timed helpers force-remove their container, because timeout does not* go red. Measured 2026-10-09 by the reviewer: with the `with_timeout 60` removed from the state-version read — the `docker run … --entrypoint node "${OPENCLAW_IMAGE}" -e '…'` that was line 173 on that day's tree — all five OC-60 and OC-61 tests stay green and only OC-3's *each call is bounded, or is a named exception* goes red. So the bounding rule is OC-3's, the removal rule is OC-61's and OC-3's, and OC-60's is `--init` and the bound returning. And neither OC-61 nor OC-3 holds **when** the removal runs: with the three helpers' `if (( rc != 0 ))` — two removing `"$name"`, one `"$cname"` — turned into `if (( rc == 0 ))`, so that a container is removed only after a run that succeeded, all ten tests of the two files stay green. Nor does OC-61 see a run named anything else: with the `docker rm -f "$_mig"` after the state migration's `docker compose run --rm --name "$_mig"` replaced by `true`, OC-61 stays green and only OC-3's *the timed helpers force-remove their container* goes red. Both measured 2026-10-21, local review. |
| **Registry** | OC-60 is registered: `docker run --rm --init --entrypoint openclaw` turned into `docker run --rm --entrypoint openclaw` must redden *each carries --init, without which timeout only frees the client*. OC-3, OC-61 and OC-62 have no entry, and `mutate.sh --gaps` lists all three as missing. |
| **Three limits of the tests, not repaired here** | OC-61 and OC-3 do not hold the condition of the removal, and OC-61 sees only two names; both measured in the row above. When `liquidupstart/openclaw:latest` is absent, OC-60's behaviour half asserts an object equal to itself and **passes**, where it should skip. And on a Linux host OC-62's first test is **red**: `/usr/bin` holds a `timeout` there — in `liquidupstart/dashboard:latest` it is busybox's — so the `PATH` the case builds still finds one and the branch the case exists for never runs. All three are recorded on `docs/suite-fixture-findings` (#45) with their measurements, not repaired here. |
| **Covers** | OC-G4, §5.1. |

**OC-60, OC-61 and OC-62 were N1, N4 and N1b until 2026-09-30.** They were labelled with the
finding ids from the review that produced them, and every other case in this repository is
`PREFIX-number`. That is not cosmetic: `mutate.sh --gaps` reads case ids out of these tables and its
pattern requires the hyphen, so three cases were invisible to the coverage report -- neither counted as
specified nor reported as missing -- and the registry entry for OC-60 had to name `OC-3`, whose row then
said it was replaced. A reviewer found the entry pointing at a case that no longer existed; the link from the
id to the test lived only in a header comment.


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
| **What these two need before they can run, added 2026-10-20** | Both do a real `npm install -g` inside a `docker build --no-cache`, so they need a **package registry** and they need **time**. The registry is `SP-3` in [TEST-SPEC-suite-preconditions.md](TEST-SPEC-suite-preconditions.md) — `registryReachable()`, which skips them on an offline machine rather than reddening there. The time is a per-case budget of **600 s**, `BUILD_BUDGET_MS`, measured in `SP-5`, which is theirs and not the suite's 60s: they failed twice by timing out at 60s and passed twice on a quiet machine, and the quiet build itself is 14s on one machine and 45s on another. Without both, these two are a case whose colour depends on the load, which is how red stops meaning anything. |
| **A build that was cut off, added 2026-10-21** | Neither case is judged on it. Each build carries a timeout of its own, `BUILD_TIMEOUT_MS`, 30 s inside the case's budget `BUILD_BUDGET_MS`, and a build stopped by it, or by SIGINT, fails the case with *"this run measured nothing"* before either assertion runs — so `OC-15` cannot read it as a verdict on the flag and `OC-16` cannot pass on it. Its own timeout and not bun's, because bun 1.4.3 ends a case's spawn with SIGTERM and docker then exits 255 without saying why. The budget is **600 s**; the figure and its measurement are `SP-5`'s. Held by `SP-5` in [TEST-SPEC-suite-preconditions.md](TEST-SPEC-suite-preconditions.md). |
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
| §9 R2 the card the operator uses | OC-43, OC-44, OC-45, OC-48 to OC-55, OC-58, OC-72 (OC-59 retired into it) |
| §9 R3 where admin is granted | OC-46 (manual) and OC-75 (the written config), with OC-38 as its control; OC-56 and OC-57 for what the grant must not do; OC-71 for what approving through the card actually grants |

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
| **Test data** | The header, as the template sets it today: `proxy_set_header X-Forwarded-User "user@nocodenation.org";` — three times, for `openclaw.localhost`, `bridge.openclaw.localhost` and `msteams.openclaw.localhost`. The config key that must match it: `gateway.auth.identityScopes["user@nocodenation.org"]`. The scopes written: `operator.admin, operator.read, operator.write, operator.talk, operator.pairing, operator.approvals, operator.questions` — the same list `deviceAutoApprove.scopes` carries. **"Until R3 changes both" was true when this was written and is not now** — R3 shipped, and `OC-71` records what it settled: admin is granted per identity, `devices approve` has no way to narrow a scope set, and `OC-56`/`OC-57` hold what the grant must not do. B6 of the 2026-10-01 review. |
| **Expected** | OC-39: the start script derives the identity from `config/nginx/templates/nginx.conf`, carries it as `LU_PROXY_IDENTITY`, and the config writer grants that identity at least `operator.pairing`. OC-40: the script refuses to start when the template holds no identity, or more than one. |
| **And what these two do *not* assert, named rather than implied** | This block expected `openclaw config validate` to accept the written configuration and a mismatch to "fail the case and naming both files". **Neither is automated, and neither ever was** — B6 of the 2026-10-01 review. `config validate` against a 2026.9.1 container is `OC-1`/`OC-2`'s business and is not run for the grant; the one-place rule is held as *"the identity string appears nowhere in the script"*, which catches a copy and does not name two files. Both cases read the script as text, which is what `OC-74` was written for: it executes the extraction against six templates, the shipped one among them. |
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

*Specified and **built** 2026-09-19. `tests/contract/m-oc.pairing-card.test.ts`, **sixteen** tests as of
2026-10-14 — it was eighteen when this line said seventeen, and two source-pattern cases have since
been retired into `OC-72` and `OC-73`. B6 of the 2026-10-01 review; the count is read out of a run
rather than carried forward.*

| | |
|---|---|
| **Premise** | The operator's own words are the requirement: deleting site data is not a recovery a user performs. The dashboard already carries the pattern — the deploy-key queue of M-A9 — and the same place is where someone looks when a service will not open. The one mechanism this card must respect is the id churn: a refused browser retries and **mints a new request id every time**, so an id rendered into a page is stale before it is clicked. |
| **Component** | **Three tiers, and this block's own file is the weakest of them.** `tests/contract/m-oc.pairing-card.test.ts` reads the card, the route and the server module as **text**; `tests/component/m-oc.pairing-card.test.ts` mounts the card with a stubbed `fetch`; `tests/integration/m-oc.pairing-route.test.ts` drives the route against the real `$lib/server/pairing` and a stub script. It said *"Integration: no browser, but a real gateway"*, which was true of the manual run `OC-47` and of nothing automated here — B6 of the 2026-10-01 review. A real gateway appears only in `OC-47` and in the system level. |
| **Test data** | Four request ids observed for one device within thirty minutes on 2026-09-19: `e626a793-ea03-4672-b21c-868a7fd5268c`, `0e4e2a95-2bac-480e-9500-1b50f1117bdd`, `53176b95-6c01-4e92-9d23-14d888066ab3`, `09cc464f-690a-4a51-9ac9-c97b7011eb34`. The last is the one that was approved; the first is the one the browser had printed for copying and is what a careful operator would have pasted. The listing shape the route must return: `{ "pending": [ { "requestId", "deviceId", "clientId", "isRepair", "requestedAt" } ] }`, read from the CLI's `--json` output at `.pending[0].requestId`. |
| **Expected** | OC-43: with a pending request present, the route lists it; pressing approve re-reads the current id and approves it. **The stored token being valid afterwards is `OC-47`, by hand**, and no automated case asserts it — it needs a real gateway and a real browser; it was specified here as though it were automated, which is B6 of the 2026-10-01 review. OC-44: approving an id that is no longer pending answers with the CLI's own refusal and a 502 — never a quiet success, and never a message this project invented. OC-45: a `requestId` failing `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` is rejected before any command is built, with the same shape as `start-skip`'s step guard. |
| **Unhappy** | OC-44 and OC-45 are the negative halves; OC-43 is their counterpart and is what stops the guard from being satisfied by a route that refuses everything. OC-45 needs both signs in the same run — a well-formed id passes the guard and reaches the command, a malformed one does not. |
| **Test data, both sides** | Must be accepted: `09cc464f-690a-4a51-9ac9-c97b7011eb34`, a real id from the measurement. Must be refused: `"; docker rm -f openclaw-gateway; #`, `09cc464f-690a-4a51-9ac9-c97b7011eb34 extra` — because a guard that only looks for a prefix is the usual way this kind of check is written wrong — `x09cc464f-…`, the empty string, `latest-ish`, and the same id in upper case. |
| **How it was built** | `config/scripts/openclaw-pairing.sh` holds the docker invocation, the way `git.sh` holds the clone the retry reuses; `dashboard/src/lib/server/pairing.ts` spawns it and parses the CLI JSON, because the dashboard container has `docker` and `bash` but **no `jq`**, and a shell that reshapes JSON is a second place for the shape to be wrong. The card posts **`{deviceId}`** and the route resolves that device's current request — it posted the literal `latest` until 2026-09-29, when finding 2 of that review showed `latest` resolving to the newest request of *any* device, so a request arriving 55 ms after the card was drawn took the operator's click. B6 of the 2026-10-01 review for the sentence that still said `latest`. The card draws nothing at all while nothing is waiting. |
| **The control that earns the green** | The churn rule was broken on purpose — the card changed to post `req.requestId`, the id it had rendered — and the case went **red**, naming that assertion. Restored afterwards. Without that, the passing tests would only have shown that the file says what it says. And that is the limit of this control: the 2026-10-01 review broke the id guard, `latest`, the result line and the Origin check in turn and the file stayed green through all four, which is what `OC-72`, `OC-73` and the component tier were written for. |
| **OC-47 · the whole mechanism, walked · manual** | Run 2026-09-19 on the operator machine, and the only run that exercises all of §9 at once. A device was **revoked on purpose** — the same act that caused the incident on 2026-09-10 — so a browser in the repair state existed to look at. Timeline: `devices revoke` at 16:03:10 through nginx; the private window reloaded and showed *"Role upgrade pending"*; the dashboard drew the card, naming `openclaw-control-ui`, **returning**, `8349140452f9`; **Approve** pressed; gateway logged `device pairing approved device=8349… role=operator` at 16:06:53; the private window reloaded and `webchat connected` at 16:07:27. No terminal, no request id carried by hand, no site data deleted. |
| **And what walking it found** | **The confirmation disappeared with the card.** Approving empties the pending list, the card is drawn only while something is pending, and the result line lived inside it — so the operator pressed the button and the card simply vanished. That is the operator own finding of 2026-09-18 about the skip panel, reintroduced one component later by the person who had just fixed it. The card is now held open while it has an answer to show, and the list, the explanation and the button are what disappear. This is the case that would have caught it: `{#if loaded && (pending.length > 0 \|\| result)}`. |
| **Implemented by** | `tests/contract/m-oc.pairing-card.test.ts` for all three, and `tests/unit/m-oc.pairing-env.test.ts` additionally for **OC-45** — its last-point guard, which holds that a malformed `requestId` is refused where the command is built rather than only where the route receives it. *Row added 2026-10-20:* this block had no *Implemented by* at all, so `TR-4` could not tell that OC-45's two files are one case at two levels and reported it as an unjudged collision. Item 1 of the first review of #28. |
| **Covers** | OC-G5, §9 R2, §9.4. |

### OC-48 to OC-59 — the 2026-09-29 review of the recovery path

The review of #15 at `6b1d7e9`: five "should fix" and four minors, and one measurement that is not a
defect of this work (finding 1, `operator.admin` through nginx — see FEATURE §5.3, which now says so
plainly instead of treating the gateway's warning as resolved).

**Finding 6 is the one that decided the shape of these cases.** The card's own test read the source as
text, and the reviewer showed what that was worth: it stayed 18/18 with the id guard removed, with
`latest` picking the oldest request, with the result line deleted, and with the Origin check replaced
by `if (false)`. Four defects, no red. So the card is mounted and driven here, and the two contract
cases that asserted its `{#if}` conditions are gone, with a note in their place saying where the claim
moved to.

| # | Level | Case | Expectation |
|---|---|---|---|
| **OC-48** | unit | **negative** | A pending request that is not a Control UI browser asking for operator access is never what Approve means — not when it is newest, and not when its id is named. Finding 2: `openclaw node run` from a container leaves a `role: node` request, and the reviewer's run approved it |
| **OC-49** | unit | positive | One browser retrying is still approved without a question, and its **newest** id is the one used. The counterpart: four ids for one device within thirty minutes are not four browsers |
| **OC-50** | unit | **negative** | Two different browsers pending is a 409 naming how many, not a guess |
| **OC-51** | unit | **negative** | A refusal carries `Reason: missing scope: operator.pairing`, not the CLI's usage footer. Finding 3: `firstLine()` returned the **last** line |
| **OC-52** | component | **negative** | A listing that failed is said out loud with the CLI's words. Finding 4: `ok` and `message` were ignored, so the card stayed silent and the operator was locked out with no hint |
| **OC-53** | component | positive | An empty queue still draws nothing. The counterpart — a card always on the page is a card nobody reads |
| **OC-54** | component | positive | The operator's browser gets a button showing role, address and scopes |
| **OC-54** | **negative** | …and the node host is named and gets none: one button, for the one device the card can approve |
| **OC-54** | positive | …and the press names the **device**, never a request id the page had rendered | 
| **OC-55** | component | positive | A request that arrives after mount appears on `focus`, with no reload. Finding 5: one read at mount |
| **OC-56** | component | **negative** | With no `LU_PROXY_IDENTITY`, nothing is granted — and certainly not under the literal key `"undefined"`. Minor, and the reason the old assertion (`OC-46` then, `OC-75` since 2026-10-14) passed over it: it read `Object.values(...)[0]` |
| **OC-57** | component | positive | An identity the operator granted by hand survives a start. Minor: the line replaced the whole map while the rest of the writer preserves edits |
| **OC-58** | unit | positive | `SYSTEM_HTTP_PORT='9999'` gives the same network, host and address as `"9999"` and `9999`. Minor: single quotes were not stripped, so the network name carried them |
| ~~**OC-59**~~ | contract | **negative** | A GET from another origin is refused as well as a POST. Minor: a GET spawns one `docker run` per request. **Retired 2026-10-14** — see `OC-72` |

#### Detail per case

##### OC-48 / OC-49 / OC-50 — which request Approve means

| | |
|---|---|
| **Premise** | The operator presses Approve to let **their own browser** back in. `latest` approved `pending[0]`, the newest request of any device, and anything on the stack's network can put one there. So the click let in the wrong thing **and** left the operator locked out, because their own request was still pending — and the card's copy, "Approving gives it back what it had", was false for such a request. `toRequest` dropped `role` as well, so neither the rule nor the operator could tell the two apart. |
| **Component** | `chooseRequest` in `dashboard/src/lib/server/pairing.ts`, called directly. The rule lives there rather than in `openclaw-pairing.sh` because that is where the list is parsed; the script keeps its id guard and has no jq in any case. |
| **Test data** | Two devices in the queue. `dev-alpha-aaaaaaaaaaaa`: `requestId 09cc464f-690a-4a51-9ac9-c97b7011eb34` — the real id approved on 2026-09-19 — `clientId openclaw-control-ui`, `role operator`, scopes `operator.read, operator.write`, from `10.99.0.2`, `isRepair: true`, ts 945. `dev-bravo-bbbbbbbbbbbb`: `requestId 22222222-2222-2222-2222-222222222222`, `clientId node-host`, `role node`, scopes `node.run`, ts 1000 — 55 ms later, the gap the reviewer measured. For OC-49, two ids of the **same** device at ts 900 and 990. For OC-50, a second control-ui device `dev-charlie-cccccccccccc` at ts 1200. |
| **Expected** | OC-48: alpha's id is chosen although bravo is newer; naming bravo's id gives 409 with "not a Control UI browser"; with only bravo pending, 409 naming what **is** there and pointing at the CLI. OC-49: the newest id of the one device, and a named device resolved to its own newest. OC-50: 409 saying "2 different browsers". |
| **Failure** | A rule that refuses whenever anything is ambiguous, which would break the case this card exists for — one browser retrying. OC-49 is what stops it. |
| **Covers** | OC-48, OC-49, OC-50, §9 R2. |
| **Implemented by** | `tests/unit/m-oc.pairing-choice.test.ts`. |
| **What it found** | Red: with the eligibility filter removed all three OC-48 assertions fail, and with the two-device check removed OC-50 fails alone. The reviewer's own run: `POST {"requestId":"latest"}` → `200 "Approved dev-bravo-bbbbbbbbbbbb"`, alpha still pending; and `openclaw node run --host openclaw.localhost` from a container was approved with `device pairing approved … role=node`. |

##### OC-51 — a refusal carries the reason

| | |
|---|---|
| **Premise** | This card is read while something is wrong, so the message is the whole product at that moment. |
| **Component** | `cliMessage` in `pairing.ts`. |
| **Test data** | The CLI's refusal as captured live on 2026-09-29, five lines: `[openclaw] Gateway call failed: devices.approve`, `[openclaw] Reason: missing scope: operator.pairing`, `[openclaw] The gateway requires operator.pairing for this method.`, `[openclaw] Usage: openclaw devices approve <requestId>`, `[openclaw] Help: openclaw --help`. And a one-line answer, `[openclaw] Request 09cc464f is no longer pending.` |
| **Expected** | The reason survives and the usage footer does not; the one-line answer passes through unchanged; an empty output stays empty so the caller can say its own thing. |
| **Failure** | Taking the first line unconditionally would be as arbitrary as taking the last; the one-line case is what keeps the repair honest, since it is the ordinary answer here — a request id goes stale within seconds. |
| **Covers** | OC-51, §9 R2. |
| **Implemented by** | `tests/unit/m-oc.pairing-choice.test.ts`. |
| **What it found** | Red: `firstLine()` used `.slice(-1)`, so the operator was handed `[openclaw] Help: openclaw --help` and `Reason: missing scope: operator.pairing` was lost. The same line fed `throw error(502, …)` in the route. |

##### OC-73 — the answer outlives the thing it is about

| | |
|---|---|
| **Premise** | B5 of the 2026-10-01 review asked for `OC-43`'s source pattern to go: it read the card's markup for `{#if loaded &&` and for `|| result)}`. Retiring it turned out to cost a property nothing else held. The component tier has `OC-52` for a failed listing, `OC-53` for an empty queue, `OC-54` for the buttons and `OC-55` for the re-read on focus — **read out of the file, not recalled** — and none of them presses Approve and then looks at what is left. The defect the clause guards against is the operator's own finding of 2026-09-18 in the deploy-key panel: a confirmation that leaves with the thing it confirms was never read. |
| **Component** | `OpenClawPairing.svelte`, mounted: the section's condition and the result paragraph. |
| **Steps** | Serve a listing with one operator request, mount, press *Approve this browser*, and have the next listing come back empty — which is what a successful approval really produces. |
| **Test data, both sides** | The queue is `[OPERATOR]` and then `[]`, the same `OPERATOR` fixture `OC-54` uses. What must be readable afterwards: `Approved.` and `Reload that browser and it is in.` What must **not**: `asking for the role`, so the case cannot pass merely because the card failed to re-read and still shows the old row. |
| **Expected** | The card is still drawn, the confirmation is in it, the follow-up instruction appears because the queue is empty, and the approved request is gone from the list. |
| **What it found** | Green, 1 scenario. It exists because retiring a check should not quietly reduce what is held: the pattern was worth little, and the property behind it was worth keeping. |
| **Controls** | `|| result` removed from the section's condition → `OC-73` red, alone. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts`. |
| **Covers** | OC-73, §9 R2. Replaces the second half of the retired `OC-43`. |

##### OC-74 — the identity extraction, executed

| | |
|---|---|
| **Premise** | **Three findings meet in one function.** B5: *"OC-40 — with both `exit 1`s in the identity check replaced by `true` and the last identity taken instead of the first, the file stays 6 / 6. No test runs the awk extraction. By hand against four templates it is correct."* C4: single quotes, a lower-case header and `$remote_user` are valid nginx and were all refused as *"no identity found"* — **after `down.sh` had emptied the stack**, because `start.sh` calls the teardown before the OpenClaw step. C5: a template mixing a quoted and an unquoted line dropped the unquoted one **silently**. |
| **Component** | `lu_proxy_identity` in `config/scripts/start/lib/proxy-identity.sh`, sourced in a bash process and called on a fabricated template. **It became a library for C4.** The identity may not be repeated in the start script (OC-39); `openclaw.sh` needs the *value* and runs after the teardown; `start.sh` needs the *verdict* before it. One function, asked twice — rather than a value carried across a teardown, which would be a second place for it to be stale. The first form of this work extracted the block out of `openclaw.sh` by its own anchors and ran that; the library makes the anchors unnecessary. |
| **What C4 and C5 changed about the answer, and what they did not** | The strictness stays: reading every spelling nginx accepts means re-implementing a slice of its parser, for a file this repository generates from its own template. **What was wrong was being strict quietly.** Every line that sets this header at all is now counted, however it is spelled, and a template with more such lines than the reader can parse is refused with the offending line quoted back and the one spelling it does read shown beside it. So C4's three spellings stop the start with an accurate sentence instead of *"no identity found"* about a file that plainly sets one, and C5's mixed template refuses instead of granting the line it happened to match. |
| **Steps** | Source the library, call `lu_proxy_identity` on a fabricated template, read its stdout and exit code. Then against the template this repository ships. The ordering pair instead computes the two positions out of `scripts/linux/start.sh` — the call and `down.sh` — rather than quoting line numbers, which go stale on the next edit. |
| **Test data, both sides** | Each template carries the directive **and a comment above it that mentions `X-Forwarded-User` in prose**, so a regex that matched the sentence would be caught. What must extract: one identity `proxy@liquidupstart.local`; the same identity on three vhosts (`openclaw`, `openclaw-gateway`, `openclaw-cli`), which is the real template's shape — and the case the first form of this fix broke, because it compared unique *values* against a count of *lines*, so three identical lines read as a refusal and every real start would have stopped. What must refuse: that identity plus `other@liquidupstart.local`; a template that discusses the header and never sets it; `X-Forwarded-User ""` beside the real one; and the four spellings of C4 — `'proxy@liquidupstart.local'` in single quotes, `x-forwarded-user` lower case, `$remote_user` unquoted, `proxy@liquidupstart.local` unquoted — plus C5's quoted line beside an unquoted one. The last run is the shipped `config/nginx/templates/nginx.conf` itself, so the eight fabricated ones are not the only thing the reader is known to work on. |
| **Expected** | Exit 0 with the identity in the three extracting cases; non-zero in the three refusing ones, with both identities named in the two-identity message. |
| **What it found** | Green, 13 scenarios — and it answered the reviewer's second control rather than assuming it. **Taking the last identity instead of the first is behaviour-preserving on every ordinary path**, which is why no test caught it and is not a gap: `sort -u` leaves one line, and two distinct identities exit before the choice is made, so `head` and `tail` cannot be told apart. They differ in exactly one shape, found by measuring: a template setting `X-Forwarded-User ""` next to a real identity produces two lines of which `grep -c .` counts **one** — the empty line is not a match — so the two-identity guard does not fire. `head` then takes the empty value and the start stops; `tail` takes the real one and starts a stack in which some vhost vouches for nobody. Refusing is right, and the sixth scenario is that case. |
| **A wording that was wrong, and is now fixed** | In that case the operator read *"no X-Forwarded-User identity found"* although the template did set one, empty. This was first recorded here as deliberately left, on the grounds that `OC-40` asserted the string. C4's repair made the distinction free — the reader already counts the strict lines — so the refusal now says *"sets an empty X-Forwarded-User identity"* and explains that a vhost sending an empty header attributes nothing. The scenario asserts the new sentence. |
| **Controls** | Four. Both of the reviewer's, run against the final shape: the refusals turned into successes → **10 red**, where the text-only file stayed 6 / 6; `head -n 1` replaced by `tail -n 1` → 1 red, the empty-identity scenario, and green before that scenario existed. Then C4/C5's own: the loud refusal removed, so unreadable spellings are skipped again → 5 red; the pre-flight removed from `start.sh` → 2 red, the ordering pair. |
| **And writing it overwrote `run.sh`** | The first form of this case ran the extracted block by writing a small bash runner into the directory under test and naming it **`run.sh`** — and one scenario passes `repoRoot`, so it wrote over the project's own launcher: 183 lines gone, caught by `git status` and restored from `HEAD`. Nothing in the suite noticed, because nothing in the suite reads `run.sh`. The runner is now named `ask.sh` and goes into the scenario's own `mkdtemp` directory, with only reads pointing at `repoRoot`. Recorded because it is the same shape as the two `git checkout` accidents in `HANDOFF.md`: a test that writes into the checkout it is run from can destroy work, and the damage is invisible to the thing that caused it. |
| **And it reddened two cases that were not controls** | `OC-40`'s remaining two text assertions read `config/scripts/start/openclaw.sh` for `no X-Forwarded-User identity found` and `sets more than one X-Forwarded-User identity`. Those strings moved into the library, so the cases went red on the refactor — correctly, since they were reading a file that no longer holds them. They are **retired** rather than repointed: a text check over a function that is now executed adds nothing, and the one reason left to read the source there is where a thing sits relative to another thing, which is what the ordering scenario does. |
| **Implemented by** | `tests/integration/m-oc.identity-extraction.test.ts`. |
| **Covers** | OC-74, OC-40, §9 R3. |

##### OC-72 — the route, driven rather than read

| | |
|---|---|
| **Premise** | B5 of the 2026-10-01 review — *"the route has no behavioural test: the Origin checks, the 409 from a `chooseRequest` refusal, the 502, the empty-body POST. OC-59 is a pattern over the source"* — together with C3 of the same review, which is the defect that pattern signed off. |
| **Component** | `dashboard/src/routes/openclaw-pairing/+server.ts`, both handlers, driven through the real `$lib/server/pairing` and a stub `openclaw-pairing.sh`. |
| **The measurement that chose the remedy** | C3's obvious fix — refuse a GET with no `Origin`, as POST does — is wrong, and the first form of this work shipped it before a measurement caught it. Measured 2026-10-14, headless Chrome 152, two servers on `localhost:7901` and `:7902`: the dashboard's own same-origin `fetch` GET sends **no `Origin` header at all**, so that check would have answered 403 to every operator. A cross-origin `<img>` and a `no-cors` fetch send none either. The one header that separates them is `Sec-Fetch-Site`: `same-origin` for the card, `same-site` for the attacker. Checked against `same-origin` rather than for `cross-site`, because both probes were on `localhost` and a port does not make a different site — a check written against `cross-site` passes every case here and misses the realistic one, another service on another local port. `Origin` keeps the POST check, where a browser does send it. |
| **Steps** | Import the route (through a variable path, so bun's transpile-time resolution of a literal `import()` does not run before the `$lib` plugin registers), then call `GET` and `POST` with the measured header sets and the stub rewritten per scenario. |
| **Test data, both sides** | Four listings, stated in full in the file's header: `WAITING` (one Control UI browser, `dev-alpha-aaaaaaaaaaaa`, request `09cc464f-690a-4a51-9ac9-c97b7011eb34`, `remoteIp` `10.99.0.9`); `AMBIGUOUS` (that one plus `dev-beta-bbbbbbbbbbbb`); `NOT_OURS` (the node host — `openclaw-node`, role `node` — which is pending and must **not** be approvable from this card); `BROKEN` (exit 1, `Gateway call failed: devices.list` on stderr). `ORIGIN` is `http://dash.example`, the foreign origin `http://evil.example`. The header sets are the measurement rather than an invention, which is why `NOT_OURS` is the node host and not a made-up client: a refusal checked only against something invented is not shown to accept anything real. |
| **Expected** | 403 for a foreign `Origin` on either verb, for a POST with none, and for the two cross-origin GET shapes that send none; 200 for the card's own GET and for a non-browser client; 502 when the listing failed; 409 for two devices, for an id that is pending but not ours, and when nothing of ours is waiting; 200 for an empty body with one device waiting, and the same for an unparseable one. |
| **What it found** | Green, 13 scenarios — after reddening three things that were not the route. **It caught my own first fix for C3**, as above. **Two of my own expectations were wrong**: an empty body with one device waiting is OC-50's signed behaviour and approves, not refuses, and the ambiguity message carries the count rather than the device names, because naming them is the card's job. And it surfaced a defect in the suite itself, recorded under *"What the file's own arrival found"* below. |
| **Controls** | Six, each reddening only its own cases. C3 reverted → 1 red. The GET check removed entirely → 2 red. The POST check removed → 1 red. `if (!ok) throw error(502, …)` disabled → 1 red. `.catch(() => null)` on the body removed → 1 red. The `chooseRequest` refusal ignored → 3 red. |
| **What the file's own arrival found** | Adding it reddened `OC-66`, `OC-68` and `OC-70` — **and those five scenarios were already red under `tests/run.sh` before this file existed**, verified by holding it back and re-running: the branch's baseline was 9 red, 5 of them these. `tests/run.sh` passes every level to **one** `bun test` process, and `$lib/server/project` read `process.env.ENV_DIR` once, on its first load. The unit level loads first and `m-oc.pairing-choice.test.ts` imports `$lib/server/pairing` there, so the capture happened before any fixture set the variable, and every fixture that set it afterwards set something nothing would read again. `OPENCLAW_PAIRING_BUDGET_MS` was frozen the same way, which is why `OC-66` ran against 60 seconds while its own header said 2000ms — and waited out the full minute to say so. Three signed cases passing in isolation and dead in the suite, which is the same shape of defect as B5 itself: green over nothing. |
| **And the repair** | `project.ts` gained `envDir()` and `pairing.ts` reads the directory and the budget **at the moment it needs them** rather than at import. That is the repository's own rule — *prefer a computed answer to a value an agent, or a module, has to remember* — applied to the module instead of to the agent. `ENV_DIR` stays for the consumers that derive paths at module scope; nothing changes for the running dashboard, where the environment does not move after start. `tests/lib/pairingproject.ts` now owns the one directory the pairing files share, as `dashboardfixture.ts` does for the A3/A8/A10/A16 family, so the two no longer disagree about which directory is theirs. **Controls:** the frozen `ENV_DIR` restored, with the unit level loading first → 7 red (3 of OC-72, 4 of OC-66/68/70); the budget frozen at module load → `OC-66` red at 60007ms. **After:** `674 pass / 7 skip / 0 fail` under `./tests/run.sh`, plus the dashboard suite `32 pass / 0 fail`, where the same command gave 9 failures before. The four extra skips are the worktree cases that `SP-1`'s tightened discriminator now skips honestly. |
| **Covers** | OC-72, §9 R2. Retires OC-59. |
| **Implemented by** | `tests/integration/m-oc.pairing-route.test.ts`. |

##### OC-76 — a device that is gone is not the same as an empty queue

| | |
|---|---|
| **Premise** | C1 of the 2026-10-01 review, run by the reviewer: `chooseRequest([charlie], { deviceId: 'dev-alpha' })` with an eligible `charlie` answered 409 with *"Nothing is waiting for approval."* — while charlie was waiting and the card beside that sentence was listing him. The cause is arithmetic: `others` counts only the requests this cannot approve, so with an eligible request for a *different* device it is 0 and the message falls through to the emptiest of three. |
| **Component** | `chooseRequest` in `dashboard/src/lib/server/pairing.ts`. |
| **Why it is an ordinary path rather than a corner** | A refused browser makes one attempt and stops; the gateway drops a request it has not heard from after about five minutes (A4). A card left open therefore carries a button for a device that is gone, and pressing it is the normal way to reach this branch — with the operator's *other* browser listed right there. |
| **Steps** | Ask for a device that is not in the list, with one eligible request present; then with two; then with none; then with only a request that is not a Control UI browser. |
| **Test data, both sides** | Asked for: `dev-alpha-aaaaaaaaaaaa`, which is not in any of the lists. Present: `dev-charlie-cccccccccccc` (request `33333333-…`) and, for the counting scenario, `dev-delta-dddddddddddd`. What must **not** appear in the message: the string `Nothing is waiting`, which is the sentence that was wrong. What must still produce it: an empty list, so the fix is not a message that never says the queue is empty. |
| **Expected** | 409 naming that the browser is no longer waiting and how many others are, with the count agreeing with the list; `Nothing is waiting for approval.` only when nothing is; and the existing *"not a Control UI browser"* message unchanged when that is what is pending. |
| **What it found** | Green, 4 scenarios. Three of the four exist to keep the repair from overshooting: the branch that was wrong is one of three, and each of the other two is still the right answer for its own case. |
| **Controls** | The new branch removed → 2 red, and the two counterparts stay green, which is what says the other branches were not disturbed. |
| **Implemented by** | `tests/unit/m-oc.pairing-choice.test.ts`. |
| **Covers** | OC-76, §9 R2. |

##### OC-77 — a warning on stderr does not make the answer unreadable

| | |
|---|---|
| **Premise** | C2 of the 2026-10-01 review. `run()` appended **both** streams to one string and that string was handed to `JSON.parse`, so one line on stderr beside valid JSON on stdout and exit 0 answered *"The gateway answered something that is not JSON."* The reviewer found no real trigger in about sixty runs and called it harmless on those grounds; that is the measure of the odds, not of the consequence — the card would say the gateway is broken because something wrote a deprecation notice. |
| **Component** | `run()` and `pendingRequests()` in `dashboard/src/lib/server/pairing.ts`. |
| **The measurement that makes it real** | Captured 2026-10-14 against the running stack: `devices list --json` with the grant missing writes the JSON answer to **stdout** and five `[openclaw] …` lines to **stderr** in the same call. So the two shapes this module reads arrive on different streams by design, and joining them lost the one that parses. The same capture is `OC-51`'s fixture. |
| **Steps** | A stub that writes a warning to stderr, valid JSON to stdout and exits 0; then one that writes something that is not JSON at all. |
| **Test data, both sides** | The warning is `WARNING: daemon is not using the overlay2 storage driver` — a line docker really writes on this machine, rather than an invented one, so the case is run against something that happens. The listing beside it is one eligible request, `dev-alpha-aaaaaaaaaaaa`. What must still fail: `not json at all` on stdout. |
| **Expected** | `ok: true`, no message, the request parsed; and for the second, `ok: false` with *"The gateway answered something that is not JSON."* |
| **What it found** | Green, 2 scenarios. The messages now read `stdout` first and `stderr` second — a `--json` failure puts its message in stdout (A1) while the `[openclaw] …` prose goes to stderr, and either can be the only one there. |
| **Controls** | `JSON.parse(stdout + stderr)` restored → 1 red, and the counterpart stays green. |
| **Implemented by** | `tests/integration/m-oc.pairing-budget.test.ts`. |
| **Covers** | OC-77, §9 R2. |

##### OC-71 — what approving actually grants

| | |
|---|---|
| **Premise** | B3 of the 2026-10-01 review. The card said *"Approving gives that browser back what it had"*. Measured by the reviewer: before revocation the device held five scopes without admin; after approval through this card its record and token held six, with `operator.admin` and `approvedVia: owner`. That is not R3's *"the device is stored with five scopes and no admin"*. |
| **Component** | The card's instruction paragraph. |
| **The measurement that chose the remedy** | The reviewer offered two: correct the sentence, or approve with a scope list without admin **if the CLI allows one**. Measured 2026-10-14 against `liquidupstart/openclaw:latest` (OpenClaw 2026.9.1): `devices approve --help` takes `--json`, `--latest`, `--password`, `--timeout`, `--token`, `--url` and nothing else, and **no command in the `devices` group** — approve, clear, join-code, list, reject, remove, rename, revoke, rotate — accepts a scope set. The scopes come from `gateway.auth.identityScopes`, which is per identity rather than per device, so this card has nothing to narrow with. The stronger remedy is unavailable, and that was established before the weaker one was taken. |
| **Expected** | The card names *full operator access* and *administrative* rights, no longer says *back what it had*, and says there is *nothing here to narrow*. |
| **What it found** | Green, 2 scenarios. The second exists because a sentence that only said "it grants admin" would leave an operator hunting for the setting that narrows it — there is none, and saying so is the difference between a warning and a dead end. |
| **Controls** | The old sentence restored → 2 red. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts`. |
| **Covers** | OC-71, §9 R3. |

##### OC-70 — the address is read, the claims are labelled, and the count that could not change is gone

| | |
|---|---|
| **Premise** | B1 and B2 of the 2026-10-01 review, taken together because the reviewer's fix for the second needs the first. `toRequest` read `remoteAddress` while the gateway writes **`remoteIp`**, so the route always returned `''` and the card said "role operator" with no address — checked against the pinned 2026.9.1 image, where `remoteAddress` occurs nowhere in the pairing or devices CLI code. The row also read *"asked N times"*, and N was always 1: the gateway keeps **one** pending request per device and the request id stayed the same across retries. And eligibility rests on `clientId` and `role`, which are connect parameters the requester chooses — `client.id = opts.clientName`, `role = opts.role` in the client bundle — so anything that can open a gateway connection can file a request declaring them, and it appeared on the card next to the operator's own browser. |
| **Component** | `toRequest` in `dashboard/src/lib/server/pairing.ts`, and the card's request row. |
| **Steps** | Drive the real `pendingRequests()` against a listing carrying `remoteIp`, then against one carrying the old name; and mount the card to read the row. |
| **Test data, both sides** | The reviewer's own capture, `"remoteIp": "10.123.45.3"`. What must **not** work: the same request with `remoteAddress` instead, which must yield `''`. |
| **Expected** | `remoteIp` reaching the card as the address; the old name yielding nothing; no `asked N times`; and the row saying *both its own words* for client and role, with the address appearing **before** them. |
| **What it found** | Green, 4 scenarios. **The card's own scenarios cannot see the field fix**, because they stub `fetch` and hand in the route's output shape, where the field *is* called `remoteAddress` — the same blindness a control found for OC-68, so the field half is driven through the real parse. `OC-54` went red on the wording and was pulled to the new text; its property is unchanged, and it is the case the reviewer named as passing only because its fixture used the old field. |
| **Why the old name is refused rather than accepted as well** | Accepting both would keep alive a fixture no gateway produces, which is exactly how this hid through two review rounds. A guard checked only against something invented is not shown to accept anything real. |
| **Controls** | The server reading `remoteAddress` again → 2 red. The claims not labelled → 1 red. The count returning → 1 red. |
| **Implemented by** | `tests/integration/m-oc.pairing-budget.test.ts` and `tests/component/m-oc.pairing-card.test.ts`. |
| **Covers** | OC-70, §9 R2. |

##### OC-69 — a refusal the operator can act on, and values read from the stack that is running

| | |
|---|---|
| **Premise** | A5 of the 2026-10-01 review, and it has two halves. `config/scripts/start/openclaw.sh` writes `gateway.auth.identityScopes` **only at start**, and `./run.sh` rebuilds the dashboard without restarting the stack — so a gateway still running on the configuration `main` wrote has no grant, every listing comes back `missing scope: operator.pairing`, and the card said only that. A sentence naming a scope nobody can grant by hand here, because the CLI that would do it is the one being refused. The same class: `.env` can describe a stack that is not the one running, so a changed port or proxy address made this script join a network that does not exist. |
| **Component** | the card's derived `remedy`, and `config/scripts/openclaw-pairing.sh`'s network, address and port. |
| **Steps** | Serve the scope refusal and then an unrelated one; and run the script against a stale `.env` with a stub `docker` answering `inspect` three ways — a real observation, noise, and nothing. |
| **Test data, both sides** | The scope message is the CLI's own: `Gateway call failed: devices.list — Reason: missing scope: operator.pairing`. The unrelated one is `connect ECONNREFUSED 10.99.0.2:8833`, which must get **no** restart instruction. The stale `.env` says port `9999` and `10.99.0.5`; the observation says `nocodenation_liquid_upstart_network_8888 10.99.0.2`, which is what the running proxy actually answered here. |
| **Expected** | The gateway's words kept verbatim with the remedy beside them; no remedy for the other message; the observed values winning including the port, which comes out of the observed network's **own name** so one fact carries both; noise ignored; and the `.env` values standing when there is no proxy, because there is nothing to pair against then and the CLI's "the gateway did not answer" is true and is the point. |
| **What it found** | Green, 5 scenarios — **and the first version of the script half broke `OC-58` immediately.** That case drives this script with a stub `docker` that echoes its arguments, so the repair took `inspect` for a network name. The observation is validated now, against the shape of a network name and of an IPv4 address: an answer that does not look like what it claims to be is noise, not an observation. An existing case caught a new change, which is the whole purpose of having it. |
| **Controls** | The remedy removed → 1 red. The observation removed → 1 red. **The validation removed → 4 red**: the three `OC-58` scenarios and this file's own noise counterpart, which is what says the validation is load-bearing rather than decorative. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts` and `tests/unit/m-oc.pairing-env.test.ts`. |
| **Covers** | OC-69, §9 R2, U11. |

##### OC-68 — a browser that was refused and stopped asking

| | |
|---|---|
| **Premise** | A4 of the 2026-10-01 review. A refused Control UI makes **one** attempt and stops, and the gateway drops a pending request after five minutes. The reviewer measured it: token revoked, the tab left open for 450 s and polled every 30 s — after the drop there was no card and no hint, while OpenClaw still showed *"Role upgrade pending"*. An operator reaching the dashboard later than five minutes saw nothing at all: the dead end §9 exists to remove, one step along. |
| **Component** | `toRevoked`/`pendingRequests` in `dashboard/src/lib/server/pairing.ts`, the route that passes `revoked` through, and the card. |
| **Steps** | Four scenarios against the card with `revoked` served, and three against `pendingRequests()` with a stub script printing the listing the CLI prints. |
| **Test data** | `{ deviceId: 'dev-alpha-aaaaaaaaaaaa', clientId: 'openclaw-control-ui', tokens: [{ revokedAtMs: 1700000000000 }, { revokedAtMs: 1700000999000 }] }` — two tokens, so the case shows the **newest** revocation wins. What must *not* count: a Control UI device whose tokens carry no `revokedAtMs`, and a `node-host` device that has one. The second is deliberate: §9's way back is about the operator's browser, and a node host is not something they can reload, so a card about it would have no next step. |
| **Expected** | The card drawn with a heading that says *has stopped asking* rather than claiming something waits; the remedy named (*reload it once*); nothing drawn when no token is revoked; a pending request winning the heading when both states hold; and the parse reporting the newest revocation, nothing for live tokens, nothing for a node host. |
| **What it found** | Green, 7 scenarios — **after a control found the first four could not fail on the fix.** The card's scenarios stub `fetch`, so they hand `revoked` in ready-made: with the server's parse of `paired[].tokens[].revokedAtMs` removed entirely, **nothing went red**. That is the shape B5 is about, found here in my own work by running the control rather than by reading it, and the three integration scenarios are what close it. Re-run after: the same control reddens *a revoked token on a Control UI device is reported*. |
| **Controls** | `revoked` removed from the card's render condition → 2 red. The server's parse removed → 0 red **before** the integration scenarios existed, 1 red after. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts` and `tests/integration/m-oc.pairing-budget.test.ts`. |
| **Covers** | OC-68, §9 R2, §9.2. |

##### OC-67 — the card asks nothing while there is nothing it could mean

| | |
|---|---|
| **Premise** | A3 of the 2026-10-01 review: a `docker run` every 15 s in every open tab, stack up or down, with no in-flight guard. **The card sits outside the page's `{#if data.running}` block** — `+page.svelte:112`, where the conditional spans 26–108 — so "stack down" is the dashboard's ordinary first state and it polled there. With the gateway stopped one GET took **19.2 s**, longer than the interval, so requests piled up; every poll wrote three lines into the gateway log, among them a scope-grant audit line; and returning to a tab fires `visibilitychange` **and** `focus`, so two loads ran and the later answer won — which may be the older one. |
| **Component** | `OpenClawPairing.svelte`, mounted with props, and `+page.svelte` which passes them. |
| **Steps** | Mount with `running: false`; with `running: true, busy: true`; with `running: true`; and then, with one request held open, dispatch both `focus` and `visibilitychange`. Count the fetches each time. |
| **Test data, and why one scenario stubs fetch itself** | `serve()` answers synchronously, so it cannot hold a request open — and an in-flight guard can only be measured against a request that is still in flight. That one scenario stubs `globalThis.fetch` directly and restores it through the file's own `restore` hook. The others use `serve` with a counting function. |
| **Expected** | Zero fetches in the first two and an empty card in the first; exactly one in the third, with the heading drawn; and still one after both triggers. |
| **What it found** | Green, 4 scenarios. The repair is two guards and one prop pair: `running` and `busy` come from the page (`data.running`, `activeTask !== ''`) rather than from the card's position in the markup, because the card is also the way back when OpenClaw refuses a browser and must keep its place; and `inFlight` drops a second trigger rather than queueing it. |
| **What it cost the other cases** | Every mount in that file now passes `running: true`. That is the honest form: those five scenarios are about what the card does when there *is* something to ask, and they say so at the mount instead of relying on a default. |
| **Controls** | The `running`/`busy` guard removed → 2 red, the first two scenarios. The in-flight guard removed → 1 red, the fourth. The counterpart stays green in both, which is what says the guards do not simply switch the card off. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts`. |
| **Covers** | OC-67, §9 R2, U11. |

##### OC-66 — the budget bounds the request, and reaches what bash started

| | |
|---|---|
| **Premise** | A2 of the 2026-10-01 review, and worse than first reported. `setTimeout(() => child.kill(), …)` signalled `bash` alone; the `docker run` bash had started was reparented and kept the stdio pipes, and `'close'` waits for the **pipes** rather than for the child. The reviewer measured a 3-second budget against a stub `docker run … sleep 20`: bash died at 3 s, the container was still running at 5 s, and `run()` resolved at about **22 s**. The budget did not bound the HTTP request at all, and a wedged docker held it open indefinitely — the case the budget's own comment says it exists for. |
| **Component** | `run()` in `dashboard/src/lib/server/pairing.ts`, driven through `pendingRequests()`. |
| **Steps** | One throwaway project whose pairing script is rewritten per scenario; `OPENCLAW_PAIRING_BUDGET_MS=2000` so the timeout path runs in seconds. Call `pendingRequests()`, read the clock, then ask the operating system whether the grandchild still exists. |
| **Test data, and the seam it uses** | The stub stands in for `docker run`: `sleep 60 &`, its PID written to a file, then `wait`. **The PID file is the point** — asserting only that `pendingRequests()` returned in time would have passed against the defect, because the promise did eventually resolve. One project directory, not two: `$lib/server/project` captures `ENV_DIR` at load, and a query string on the import specifier breaks the module's own relative imports (measured: `Cannot find module './project'`). `SCRIPT()` is a function and `spawn` reads the file at each call, so rewriting the script is the seam that actually exists. |
| **Expected** | Settled within the budget plus a margin rather than at the grandchild's 60 s; the message says it did not finish and that nothing was approved; and `process.kill(pid, 0)` throws, so the grandchild is gone. |
| **What it found** | Green, 2 scenarios, 2.4 s. The repair is three things because any one alone leaves it open: `detached: true` for a process **group**, a **named** container removed on timeout (killing the group stops the local CLI, not a container the daemon is already running, and `--rm` only fires when that CLI exits normally), and settling **at the budget** instead of on `'close'`. |
| **Controls** | `process.kill(-child.pid)` back to `child.kill()` → red, the grandchild survives. Not settling at the budget → red. In both, the counterpart stays green. |
| **On the budget override** | `OPENCLAW_PAIRING_BUDGET_MS` is **not** in `.env.example`, and that is the opposite of M3 on #10 rather than an oversight: `run.sh:147-149` hands the dashboard container three explicit `-e` values and not the env file, so a key in the contract would be a setting that does nothing. Checked, not assumed. |
| **Implemented by** | `tests/integration/m-oc.pairing-budget.test.ts`. |
| **Covers** | OC-66, §9 R2, U11. |

##### OC-65 — a JSON answer is read as JSON

| | |
|---|---|
| **Premise** | A1 of the 2026-10-01 review. `openclaw devices … --json` reports a failure as **pretty-printed** JSON on stdout with a non-zero exit, so the first non-empty line is `{` — and `cliMessage` returned the first line. The card read *"OpenClaw could not be asked what is waiting: {"*, and Approve answered 502 carrying the same character. |
| **Component** | `cliMessage` in `dashboard/src/lib/server/pairing.ts`, called directly. |
| **Steps** | Pass each of the two JSON shapes the reviewer captured, then the plain-text refusal, then inputs that are neither. |
| **Test data, and why these shapes** | Both are the reviewer's live captures rather than inventions: `{ "ok": false, "error": { "type": "gateway_transport_error", "message": "connect ECONNREFUSED 10.99.0.2:8833" } }` and the same with `"type": "forbidden"`, `"message": "device approval refused"` and `"reason": "missing scope: operator.pairing"`. The `reason` is the half that was lost, and it is the sentence that tells an operator the grant is absent rather than the gateway being down. |
| **Expected** | The message, with the reason appended when it differs; plain text unchanged; `''`, `not json at all` and `[]` returned as they are rather than throwing. |
| **What it found** | Reproduced against the unfixed function first: both JSON shapes returned `"{"`. **`OC-52` passed throughout**, because its fixture is the non-JSON string — which is the reviewer's point, and the reason this case exists at the unit level instead of being bolted onto the card's. |
| **Controls** | The JSON path removed → the two JSON scenarios red, **the plain-text counterpart and the fallback green**. That asymmetry is what says the counterpart measures something else rather than repeating the first. |
| **Implemented by** | `tests/unit/m-oc.pairing-choice.test.ts`. |
| **Covers** | OC-65, §9 R2. |

##### OC-52 / OC-53 / OC-54 / OC-55 — the card, mounted and driven

> **Precondition: `DASHBOARD_DEPS`** — the scenario is its own row above, under `SP-2`, because the
> skip belongs to the rule and not to the case it covers. Added 2026-10-13, **corrected the same day**:
> it was first filed under `OC-52`, which put a *pass* under `OC-52` in a bare checkout's JUnit report
> beside the real `OC-52`, skipped. N1 of that day's re-review. These four mount a Svelte component, so they
> need a DOM, and `tests/lib/mount.ts` resolves happy-dom and svelte out of `dashboard/node_modules`.
> Without them the file produced **five failures** reading
> `Cannot find module .../@happy-dom/global-registrator/lib/index.js`, which is red for a reason that
> has nothing to do with the code — the failure mode #22 exists against. Its repair covered the eight
> milestone-A files and could not reach this one, because this file arrives with #15; on `main` the
> only two files that use `lib/mount.ts` already carry the guard.
>
> **Both halves are measured, because a case that only ever skips is not shown to pass:**
>
> ```
> no dashboard/node_modules          1 pass / 5 skip / 0 fail
> after bun install in dashboard/    5 pass / 1 skip / 0 fail
> ```
>
> The case that passes in the first reading is a skip with a voice: it asserts the **absence** of
> `dashboard/node_modules` rather than carrying a label, so a run in that state says why five tests under four ids are
> missing instead of leaving a silent gap. That is `SP-2`'s rule, applied here by hand because `SP-2`
> enumerates eight files and this is not one of them — which is itself worth noting as the limit of
> that case.

| | |
|---|---|
| **Premise** | Finding 6. Every claim about this card was read out of its source, and four defects passed that reading. |
| **Component** | `OpenClawPairing.svelte` mounted in the component tier, with `globalThis.fetch` replaced — so what the card does with an answer is what is under test, rather than the route. |
| **Test data, and why the refusal is plain text here** | `OC-65` covers the JSON shape at the unit level, where `cliMessage` lives; this file drives the card against a message the server has already turned into text, which is what the card actually receives. Keeping a JSON blob here would test the parser twice and the card not at all. Three answers. `{ok: false, pending: [], message: 'Gateway call failed: devices.list — Reason: missing scope: operator.pairing'}`; `{ok: true, pending: []}`; and the two-device queue of OC-48. For OC-55 an answer that is empty at mount and holds the operator's request afterwards, with a `focus` event dispatched. |
| **Expected** | OC-52: "could not be asked" and the reason. OC-53: nothing drawn at all. OC-54: `openclaw-control-ui`, `role operator`, `from 10.99.0.2`, `node-host` named with "does not approve", and **one** button; pressing it posts `{deviceId: 'dev-alpha-aaaaaaaaaaaa'}`. OC-55: the request appears after the focus event. |
| **Failure** | A card drawn on every load, which OC-53 prevents; and an Approve button offered for a request the server will refuse, which OC-54's button count prevents. |
| **Covers** | OC-52, OC-53, OC-54, OC-55, §9 R2, U11. |
| **Implemented by** | `tests/component/m-oc.pairing-card.test.ts`. |
| **What it found** | Red: with `ok`/`message` ignored the card renders empty against a failed listing (OC-52), and with the focus and visibility listeners removed a request arriving after mount is never shown (OC-55). If the identity grant is missing because the stack started before it existed, **every** listing fails — so the old card was silent exactly when the operator was locked out, which is the dead end §9 exists to remove, reached by a different road. |

##### OC-56 / OC-57 / OC-58 / OC-59 — the four minors

| | |
|---|---|
| **Premise** | Each is small and each is the kind of thing nobody notices: a grant to nobody that reads as a grant, an edit silently lost, a port that stops working when it is quoted, and a GET that does work for anyone who asks. |
| **Component** | The config writer out of `config/scripts/start/openclaw.sh`, run in `ghcr.io/openclaw/openclaw:2026.9.1`; `config/scripts/openclaw-pairing.sh` with a stub `docker`; the route, read as text. |
| **Test data** | OC-56: the writer with `LU_PROXY_IDENTITY` empty. OC-57: a state file already holding `{"gateway":{"auth":{"identityScopes":{"ops@example.invalid":["operator.read"]}}}}`. OC-58: three `.env` files with `SYSTEM_HTTP_PORT` as `'9999'`, `"9999"` and `9999`, each with `SYSTEM_PROXY_IP` quoted to match, and a stub `docker` on PATH printing its arguments. OC-59: the route source. |
| **Expected** | OC-56: no key at all, and `"undefined"` not among them. OC-57: `ops@example.invalid` keeps `operator.read` **and** the proxy identity gets `operator.admin`. OC-58: all three give `--network nocodenation_liquid_upstart_network_9999`, `--add-host openclaw.localhost:10.99.0.5` and `ws://openclaw.localhost:9999`, with no quote anywhere. OC-59: the GET handler consults the Origin check, and an absent Origin is not what it refuses — a same-origin GET from the address bar sends none, and refusing that would make the card unreachable. |
| **Failure** | OC-58's unquoted form is the counterpart: a repair that stripped a leading character unconditionally would break it, which is the usual way this is written wrong. |
| **Covers** | OC-56, OC-57, OC-58, OC-59, §9 R2, R3. |
| **Implemented by** | `tests/component/m-oc.config-shape.test.ts` (OC-56, OC-57), `tests/unit/m-oc.pairing-env.test.ts` (OC-58), `tests/contract/m-oc.pairing-card.test.ts` (OC-59). |
| **What it found** | Red: replacing the map again reddens OC-56 and OC-57 together; stripping only double quotes reddens OC-58's single-quoted case alone; removing the GET check reddens OC-59. OC-58 is also why the harness in `m-oc.config-shape.test.ts` now passes `LU_PROXY_IDENTITY` at all — it never did, so the grant it asserted was the one written under the key `"undefined"`. |

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
| **And its automated half is `OC-75`, not this id** | What can be checked without a browser is the configuration this run depended on: `operator.admin` absent from `deviceAutoApprove.scopes` and present in the identity grant. That case lives in `tests/component/m-oc.config-shape.test.ts` and carried **`OC-46`** until 2026-10-14, so a report could show a pass under this id for a run in which no browser connected — B6 of the 2026-10-01 review. It is now `OC-75`, on the precedent of `OC-40`/`OC-42` becoming `OC-63`/`OC-64`: the manual run keeps the id it was signed off under and the later case moves. The two are a pair and neither replaces the other — this one proves the cap admits the browser, `OC-75` proves the cap is still shaped the way it was when it did. |

