# Test specification — where the suite can run, and the cases that have to ask

Nine cases and one error in the default tier were one defect: a case reading state that exists only
in a particular kind of checkout, and saying so nowhere. It passed or failed on which directory the
suite was started from, which is the one thing its header did not mention.

**There is no directory to prescribe, and that is why this is values rather than a rule.** Measured
2026-10-08:

| Where | Has | Lacks | The tier gave |
|---|---|---|---|
| a feature worktree | `.git` | the started state, `dashboard/node_modules` | **9 fail / 1 error** over 561 |
| the release installation, `~/.liquidupstart` | the started state | `.git`, `dashboard/node_modules` | 10 fail / 1 error — measured while that installation carried #10's overlay rather than `main`, so it is the *shape* and not a figure to compare |
| the operator's checkout, after a start | everything | — | green |

**The pair that counts, both from a pristine worktree with no `volumes/` and no
`dashboard/node_modules`, on a quiet machine:**

```
main                       552 pass / 0 skip / 9 fail / 1 error   over 561 in 114 files
fix/suite-preconditions    566 pass / 4 skip / 0 fail / 0 error   over 570 in 115 files
```

*Corrected 2026-10-09, and how the first version of this went wrong is the better half of the
argument for this branch.* It gave the baseline as **7 fail / 1 error**, from one run in a worktree
where `A3-3` (twice), `A4-16` and `A1-4` did not fail. They fail when run alone there, and they fail
in a pristine worktree, so during that one run something created `volumes/_git-secrets` against the
repository root before those files ran and removed it after. **The order-dependence this branch
exists against falsified the measurement of its own baseline.** The direction was favourable — the
problem was understated — but a published number a reviewer cannot reproduce is a defect, so the pair
above is measured under stated conditions instead.

Neither of the first two satisfies the whole suite, so no instruction of the form "run it from X"
is true. CLAUDE.md's rule applies exactly: **prefer a computed answer to a rule an agent has to
remember.** A computed answer reads current state, so it cannot go stale when the system changes; it
is unambiguous, so there is nothing to misread; and it removes the reasoning step rather than making
it easier.

**Level.** Unit. `tests/lib/preconditions.ts` exports each discriminator as a function of a root as
well as a constant for this checkout, so both answers can be put to it against throwaway
directories. The cases that *use* the preconditions are not re-tested here — they are the existing
milestone-A cases, and what is new about them is a skip, which SP-2 checks as text.

**Rigour.** Full branch coverage of the three discriminators, because each is a two-answer decision
and a wrong answer is silent: a discriminator stuck on `false` skips everything and reads exactly
like a suite that ran.

## Overview

| # | Sign | Scenario | Why it is a separate scenario |
|---|---|---|---|
| **SP-1** | positive + **negative** | A started checkout is told apart from one where nothing has run — and `volumes/repos`, which the obvious discriminator would have used, is present in the one that has not |
| **SP-1** | **negative** | …and an **empty** `volumes/_git-secrets` is not a start either, which is what it used to be — *2026-10-14* |
| **SP-1** | positive + **negative** | A directory that is no git repository is told apart from one that is |
| **SP-1** | positive + **negative** | A dashboard without its dependencies is told apart from one with them |
| **SP-1** | positive | The exported constants describe *this* checkout, and `preconditions()` names it |
| **SP-2** | positive | Each dependent file names the precondition it skips on, in its header, and uses it — and the DOM files are **computed**, not listed |
| **SP-2** | positive | …the computation is over something: at least three DOM files, the card file among them |
| **SP-2** | **negative** | …and each DOM file files its voiced skip under `SP-2`, not under a case id |
| **SP-2** | positive | …and the files gated on a registry are computed too, and found — *finding 6 of the local review of 2026-10-21* |
| **SP-2** | **negative** | …while the file that tests the function is not counted as one that needs it |
| **SP-3** | **negative** | An unreachable host answers false — against `.invalid`, which RFC 2606 reserves so it cannot resolve |
| **SP-3** | positive | And the real registry answers true — gated by an **independent** probe, so an implementation that always says no fails here instead of skipping itself |
| **SP-3** | positive | The answer is memoised per url: a second ask of the same url leaves the process **no second time**, counted rather than compared |
| **SP-3** | **negative** | …and a machine without `curl` answers false, rather than throwing while bun collects the file — *finding 5 of the local review of 2026-10-21* |
| **SP-4** | **negative** | A Docker VM below the free-space floor stops the run, and the message names the cause and the remedy — *2026-10-15* |
| **SP-4** | **negative** | …and a reading that is merely low stops it too |
| **SP-4** | positive | …while a reading **at** the floor proceeds, which is where an off-by-one would live |
| **SP-4** | positive | …and plenty of room proceeds, saying how much |
| **SP-4** | positive | …and a reading that could not be taken proceeds, because "cannot measure" is not "no space" |
| **SP-4** | **negative** | The guard throws with that message when the VM is empty |
| **SP-4** | positive | …and does not throw when it is healthy |
| **SP-4** | positive | The live reading is of the VM and is a number, or an honest `null` |
| **SP-5** | **negative** | A build stopped by its own timeout is an interruption, whatever it exits with | bun 1.4.3's budget kills with SIGTERM and docker then exits 255 and says nothing, so only a timeout the helper set is known to have fired |
| **SP-5** | **negative** | …and `sh()` reports that timeout from a real child | The flag is only as good as the helper that sets it |
| **SP-5** | **negative** | A child a signal ended is an interruption, from a real child | The OOM killer leaves no exit code, which `sh()` reports as -1 — and -1 satisfies `OC-16`'s first assertion |
| **SP-5** | **negative** | SIGINT is an interruption: 130, and the words docker prints for it | What an operator's Ctrl-C produces, and what bun 1.3.13's budget produced on 2026-10-09 |
| **SP-5** | positive | …while an ordinary failure is **not** called an interruption, on given data and on a real child | The counterpart that carries the weight: `OC-16` exists to see a build fail, so a guard that called every failure an interruption would swallow the case it protects |
| **SP-5** | positive | …and neither is success, not even one whose log mentions a cancellation | The words are read only for a non-zero exit |
| **SP-5** | **negative** | The guard throws for a build past its own timeout, naming that timeout and that the run measured nothing | *2026-10-22, item 1 of the review of #42.* Until then only its call sites were read, and the guard could be emptied or inverted with every case green |
| **SP-5** | **negative** | …and for a build cut off by SIGINT, with its exit | |
| **SP-5** | positive | …and lets an ordinary failure and a success through | A guard that refused every finished build would only show in a real build with network, which `SP-3` skips on an offline machine |
| **SP-5** | positive | A published port is read out of `docker port`'s answer: one mapping, two lines, IPv6, IPv4-mapped IPv6, and the bare `:::` form | A parser stricter than docker is the same defect from the other side |
| **SP-5** | **negative** | …and the empty answer, the two error answers docker gives, a zero port, a fraction, hex, a port past 65535 and prose ending in a number are no port | `Number()` of the last colon's tail read `127.0.0.1:1.5` as 1.5 |
| **SP-5** | positive | The wait returns a mapping that appears on the third ask, having asked by the id it was given | |
| **SP-5** | **negative** | …and one that never appears stops at the deadline, with the last answer | |
| **SP-5** | **negative** | …and a slow `docker` cannot multiply the wait, because the bound is the clock | Forty attempts at a 60 s timeout each was forty minutes |
| **SP-5** | positive | …and a deadline used up before the second ask still gets three asks | Three dashboards started side by side run their synchronous `docker` calls between each other's asks |
| **SP-5** | positive | `startDashboard` goes by the id `docker run` returned, for the port, the logs and the stop | The id names exactly the container this `docker run` made, whatever the names do |
| **SP-5** | positive | `OC-15` and `OC-16` each carry a budget of at least ten minutes, read from the case itself | Read per case, so either layout — `test(title, fn, N)` or `#24`'s `test.skipIf(…)(title, fn, N)` — is understood |
| **SP-5** | positive | …and their build stops on its own timeout inside that budget | |
| **SP-5** | positive | …and in each, the guard runs **before** the verdict | Order is the point for `OC-16`: its first assertion is satisfied by an interrupted build |

## Detail

### SP-1 — a discriminator nobody has seen say "no"

| | |
|---|---|
| **Premise** | Three questions decide whether a case can run here: has a start run (`volumes/_git-secrets/id_ed25519`, generated by `config/scripts/start/git.sh:55` on every run — **tightened 2026-10-14**, see the block below); is this a git repository at all (a release installation is not); are the dashboard's dependencies installed (the component tier needs a DOM). |
| **Component** | `tests/lib/preconditions.ts`, as three pure functions of a root. |
| **Steps** | Build three throwaway roots — one bare, one carrying `volumes/_git-secrets`, one carrying `dashboard/node_modules` — plus a `git init`ed one, and ask each discriminator about each. Then ask whether the exported constants agree with the same functions applied to `repoRoot`. |
| **Test data, and why `volumes/repos` is in it** | The bare root is given `volumes/repos` on purpose. That is what the obvious discriminator would have tested, and it is wrong: `m-a5.nested-clone`, `m-a10.fixture-ceiling` and `gitfixture` all create it, so it is there after any run of the suite and says nothing about a start. A guard checked only against something invented is not shown to accept anything real, so the git case uses a real `git init` rather than a fabricated `.git`. |
| **Expected** | `false` for the bare root and `true` for the prepared one, in each of the three; and the constants equal to the functions applied to `repoRoot`. |
| **What it found** | Green, 4 scenarios. The fourth exists because the first three are measured against throwaway roots only: without it, nothing says the exported constants are about the place the suite is actually in. |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`. |
| **Covers** | SP-FR1, SP-FR2. |

### SP-1, tightened 2026-10-14 — the directory existed where no start had run

| | |
|---|---|
| **Premise** | `startedIn` asked for `volumes/_git-secrets` on the reasoning that `start/git.sh` is the only thing that creates it. In the worktree `wt-15` that directory exists and is **empty**, and no start has ever run there. The four cases that trust the answer then read state that is not present: `A3-3` twice (`known_hosts` exists; every seeded key is one GitHub publishes), `A4-16` (the shared hook is present and executable) and `A1-4` (`volumes/repos` exists and is mode 777). Four red cases in every worktree, each reporting a defect that does not exist — which is the failure this module was written against, arriving through the module itself. |
| **Component** | `startedIn` in `tests/lib/preconditions.ts`. |
| **How the marker was chosen** | Measured rather than reasoned. In the installation `volumes/_git-secrets` holds `gitconfig`, `hooks`, `id_ed25519`, `id_ed25519.pub` and `known_hosts`; in the worktree it holds nothing. `id_ed25519` is what `git.sh:55` generates on every start, and nothing in the suite writes one under `repoRoot` — the fixtures that make key pairs make them in throwaway project directories. It is also **not** what any of the four gated cases assert, so the discriminator and the things it gates stay independent artefacts of the same start. `docker inspect` was considered and rejected as the discriminator: asked on 2026-10-14 it answered `/Users/christof/.liquidupstart`, which is a true statement about the *running* stack and the wrong question for cases that read a directory. |
| **Steps** | Build a root carrying `volumes/_git-secrets` and nothing inside it, and ask `startedIn`. |
| **Test data, both sides** | What must answer `true`: a root with `volumes/_git-secrets/id_ed25519` holding `not a key\n` — shaped so it cannot be mistaken for one, since the discriminator reads presence and never contents. What must answer `false`: the same directory empty, which is the real worktree's state. The positive scenario above was moved onto the key for the same reason. |
| **Expected** | `false` for the hollow root; `true` only once the key is there. |
| **What it found** | Green. It is a regression scenario rather than a discovery: the defect was found by four unrelated cases going red, and without this the tighter marker would read as a preference rather than as something that went wrong once. |
| **Controls** | The discriminator put back to the bare directory → this scenario red, and the four gated cases red again in a worktree. |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`. |
| **Covers** | SP-FR1, SP-FR2. |

### SP-2 — a case that needs a precondition says so

| | |
|---|---|
| **Premise** | The drift this exists against is what the findings were: a case reading the installation while its header described something else. A reviewer signing a case off has to see the dependency without running it. |
| **Component** | The eight dependent test files, read as text. |
| **Steps** | For each, read the header comment and assert it names the precondition; then assert the file actually uses `skipIf(!<name>)`, so the header is not a claim about nothing. |
| **Test data** | `m-a3.known-hosts`, `m-a4.clones-governed` and `m-a1.workspace-dir` against `STARTED`; `m-a5.nested-clone`, `m-a6.operator-repository` and `m-a16.text-only` against `IN_GIT_REPO`; `m-a16.result-line` and `m-a16.skip-panel` against `DASHBOARD_DEPS`. |
| **Expected** | Eight passes. |
| **What it found** | Green — and writing it found two things the guards alone did not cover, both in the component tier. A **skipped describe still has its body evaluated**, because bun has to run it to register the tests inside, and these bodies `await` a mount at that point; and `m-a16.skip-panel` calls `setupComponentTier()` at **file level**, where nothing inside a describe can reach it. Both now return early on the precondition, and the file-level hooks with them, because `task` is null without the dependencies. Two measurements had reported that failure as an unhandled error between tests without naming a case. |
| **And a silent skip is not acceptable either** | With the bodies returning early those files register nothing, so a run would not mention them at all. Each carries one test that runs **only** in that case and names it: `SP-2 the cases in this file need the dashboard dependencies, which are absent here`. It asserts the absence rather than nothing, so it is a reading and not a label. |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`. |
| **Covers** | SP-FR3. |

### SP-2, widened 2026-10-13 — the list is computed, and the skip belongs to the rule

| | |
|---|---|
| **Premise** | Two things went wrong at once when a ninth DOM file arrived with #15. **The list was enumerated by hand and did not grow**, so nothing held the new file's guard. And the voiced skip written in its place was titled `OC-52`, which put a **pass** under `OC-52` in a bare checkout's JUnit report, beside the real `OC-52` marked skipped — "OC-52 passed" for a run in which the card was never mounted. That is the silent green this rule exists to prevent, wearing the id of the defect it covers. N1 of the 2026-10-13 re-review, and the reviewer's own fix. |
| **Component** | `tests/unit/m-sp.preconditions.test.ts`. |
| **Steps** | Compute the DOM files with `git grep -l -E "^import .*lib/mount'" -- tests`; assert the computation found something; then, per file, the header names the precondition, the file uses `skipIf(!…)`, and its voiced skip is titled `SP-2 …`. |
| **Test data, and why the needle is a line shape** | It took three attempts. Grepping `lib/mount` matched **this file**, because the comment explaining the grep contains it. Narrowing to `lib/mount'` with its closing quote matched it again, one level down. **A computed answer whose input includes its own documentation is a computed answer about the wrong thing.** An anchored `^import` cannot be satisfied by prose, because prose here is indented or starts with `//`. The computation finds three files: the two `m-a16` ones and `m-oc.pairing-card`. |
| **Expected** | Three or more DOM files found, the card file among them, and every one of them filing its skip under `SP-2`. |
| **What it found** | Green, and the JUnit report of a bare checkout now reads five `SKIP` under `OC-52` to `OC-55` and one `PASS` under `SP-2` — read out of the report, which is where the defect was visible. |
| **Why this is narrow rather than a general rule** | `TR-1` cannot see it, because `OC-52` *is* declared. `TR-4` cannot either, because it compares ids across **files** and this is one id twice in one file — and widening it is not available: measured 2026-10-13, **86 files legitimately carry one id across several top-level blocks** (`A7-1` has six scenarios of one chain). So the check is about the one thing that is decidable: the skip that reports a precondition belongs to the rule, and the rule is `SP-2`. |
| **Controls** | The card file's skip renamed back to `OC-52` → red, that scenario alone. The computation's needle widened back to the bare path → red, because this file then demands a precondition it has no use for. |
| **Widened 2026-10-21 for finding 6 of the local review** | `m-oc.allow-scripts` joined the list by hand on 2026-10-20, with the note that `registryReachable()` is a call and leaves nothing for a grep to enumerate. The identifier does: `git grep -l -F registryReachable -- tests`, test files only, finds it. **Not an anchored import line**, unlike the DOM computation: the first version of this repair used `^import .*registryReachable`, and the second pass over it found that an import written over several lines — `m-sp.preconditions`' own — never matches, so a file importing that way would never be held, and the exclusion of `m-sp` was dead code. With the identifier every test file that names the function is asked to say so and to gate on it; one that only mentions it in prose is reported, which is the better failure. `m-sp.preconditions` is excluded by name, because it asks the function in order to test it and gates on `ONLINE`. *Test data:* the tree itself — `m-oc.allow-scripts` must be in the list; `m-sp.preconditions` must be **seen** by the search, since its import spans several lines, and must **not** be in the list; every entry must be a `.test.ts`. *Controls:* the import-line needle restored → the *not counted* scenario red, because the search no longer sees a multi-line import; the needle broken → the *found* scenario red, and the file runs **one test fewer**, because the per-file SP-2 scenario for `m-oc.allow-scripts` vanished without a word — the drop that scenario is there for; the exclusion removed → the *not counted* scenario red, and `m-sp.preconditions`' own SP-2 scenario with it. The first SP-2 block's *eight files* and *eight passes* are that day's figures and stand as such. |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`. |
| **Covers** | SP-2, SP-FR3. |
### SP-5 — a run that was cut off is not a verdict on the code

| | |
|---|---|
| **Premise** | Two cases build an image inside the suite's 60-second budget and reach the network doing it. They failed twice on 2026-10-09 — `Received: 130` and `this test timed out after 60000ms` — and passed in two later runs on a quiet machine. A case whose colour depends on the load is the worse of the two findings, because it is how red stops meaning anything. |
| **And they read the interruption in opposite directions, both wrong** | `OC-15` expects exit 0, so a cut-off build reads as a verdict on `--allow-scripts`. `OC-16` expects a **non-zero** exit, so a cut-off build satisfies its first assertion by accident — only its second, that npm named the script it refused to run, keeps it honest. One defect, two opposite false readings. |
| **Component** | `wasInterrupted`, `refuseInterrupted` and `sh()`'s timeout in `tests/lib/shell.ts`; `parsePublishedPort` and `awaitPublishedPort` in `tests/lib/dashboardserver.ts`; the budget, the build timeout and the guard's calls in `tests/component/m-oc.allow-scripts.test.ts`. |
| **Steps** | Hand `wasInterrupted` the measured results below, and run `sh()` against `sleep 5` with a 200 ms timeout, against `sh -c 'kill -9 $$'`, and against a command that fails at once. Hand `refuseInterrupted` the timed-out, the SIGINT, the failing and the successful result with a timeout of 570 000 ms. Hand `parsePublishedPort` each answer. Drive `awaitPublishedPort` with an injected probe: one that maps on its third ask and records the id it was asked for, one that never maps against a 300 ms deadline, one that takes 100 ms per ask against 250 ms, and one that takes 120 ms against 100 ms. No case bounds elapsed time from above: one written against load-dependent results must not depend on the load itself, and that the call returns is what shows it stops. Then read `m-oc.allow-scripts.test.ts` one case at a time — from each case's title to the next case — for its budget, resolving a named constant, and for the guard's position relative to its first `expect(r.code`, called with `BUILD_TIMEOUT_MS`; and read `dashboardserver.ts` for the wait by id. |
| **Test data, both sides, and where it comes from** | Measured 2026-10-21, docker 29.8.1, bun 1.4.3, against a `FROM alpine:3` / `RUN echo start && sleep 40 && echo end` build: **cut off by bun's 6 s budget** — exit **255**, no word about it in the output, which is why the case cannot rely on any sign but its own; **cut off by `spawnSync`'s own 4 s `timeout`** — exit 255 and `exitedDueToTimeout: true`; **sent SIGINT** — exit **130** and `ERROR: failed to build: failed to solve: Canceled: context canceled`. Not interruptions: exit 1 with `install.cjs`, which is `OC-16`'s real failure, and exit 0 with a version string, also with the SIGINT text pasted in front of it. A real child killed by `kill -9 $$`: exit code none, which `sh()` reports as -1, signal `SIGKILL`. Ports: `127.0.0.1:59685` (a real mapping that day), `0.0.0.0:32768\n[::]:32768`, `[::]:32768`, `[::ffff:127.0.0.1]:32768` and `:::32768`; and as no port, the empty answer, `no public port '3000' published for lu-f1-probe` (a container created and not started, measured) and `Error response from daemon: No such container: lu-f1-probe` (one removed, measured), plus `127.0.0.1:0`, `127.0.0.1:1.5`, `x:0x10`, `127.0.0.1:99999` and `nonsense:1`. `signal: interrupt`, which an earlier version listed as a docker wording, was never seen docker print and is gone. |
| **Expected** | Only interruptions are called interruptions; the guard throws for the timed-out result with `ran past its 570s timeout` and `this run measured nothing`, for the SIGINT one with `was interrupted (exit 130)`, and for neither of the others; only a real mapping parses as a port; the wait returns the mapping or the last answer, on the clock, and asks by id; each build case carries at least ten minutes and a build timeout inside it; the guard precedes the verdict in each case; and `startDashboard` asks by id. |
| **Dependencies** | `sleep` and `sh` on the test host, for the three `sh()` scenarios. No docker, no network. |
| **Measured** | 2026-10-09 for the two load failures and the two quiet-machine passes, recorded in `BACKLOG.md`. 2026-10-17 for the third instance: `no published port for lu-a8-unprepared` with an empty answer while a second suite was running. **What makes that answer empty is not established**: on 2026-10-21, under the stack's load, `docker port` answered at the first ask after `docker run -d` in 40 runs of 40, and the not-started and removed cases each answer with text. The one empty answer measured is a `docker` call that ran out of its timeout. So the wait stays, the message now says how the last attempt ended, and the wait asks by id, which names exactly the container this `docker run` made. |
| **Shown able to fail** (2026-10-21, sixteen reversals, each alone) | `wasInterrupted` ignoring its own timeout: **1** red. Ignoring a signal: **1**. The words read on a success too: **1**. Always true: **2** — both counterparts. Always false: **4**. `sh()` never reporting its timeout: **1**; never reporting a signal: **1**. The old `Number()` parse: **4**. The parser without the two IPv6 forms: **2**. The wait bounded by attempts instead of the clock: **2**. The wait without its minimum of asks: **1**. `startDashboard` asking by name: **1**; its logs and stop by name: **1**. The build without its own timeout: **1**. `OC-15`'s guard moved after its verdict: **1** — the earlier version stayed green here, because its check sliced from the guard to the end of the file and found `OC-16`'s verdict. `OC-16`'s budget removed: **1**. *Added 2026-10-22:* `refuseInterrupted` never refusing: **2** red; refusing every finished build instead: **3**. Before the guard had scenarios of its own, the review of 2026-10-22 measured both at **0** over `m-sp.load-dependent` and `m-sp.preconditions`. Two repairs no case holds, and they are messages rather than decisions: `docker()` now keeps the spawn error in its output, and each ask keeps its 60 s. |
| **What it found** | Reviewed on 2026-10-20 before this round was committed, and the repair reviewed again. The guard as first written recognised 130 and two phrases, and under bun 1.4.3 a build cut off by the budget gives **255** and neither phrase — measured — so it would not have fired once. A suggestion to end the build with SIGINT for a clean cancel was measured and dropped: with `spawnSync`'s own timeout, SIGINT and SIGTERM both give 255 and no text, and neither left an image behind. |
| **The budget, 600 s** | Measured on the review of 2026-10-22, rootless Docker on 16 cores: with the base image present, `OC-15` takes **45 s** quiet and **56 s** beside four parallel `docker build --no-cache` of the same Dockerfile, and `OC-16` 16 to 20 s; load barely moves it. What moves it is the base image: `ghcr.io/openclaw/openclaw:2026.9.1` is **4.97 GB**, and `docker build` pulls it inside the case's budget when it is missing. In a fresh buildx builder the `FROM` took **159 s**, so `OC-15` on a machine without the image comes to about **205 s**. 600 s covers that first run down to a link of about 80 Mbit/s, so a fresh checkout is not red on its first run. The cost is paid only when a build hangs, which then reports in 9.5 minutes. The build's own timeout is 30 s inside the budget, so it ends as *"ran past its 570s timeout"* and not as bun's kill. |
| **How this stands beside `SP-3`, and the duplication that had to be unpicked** | `SP-3` (PR #24, opened 2026-10-10) and this (PR #42, opened 2026-10-17) are two answers to one backlog line, written ten days apart without either seeing the other. The line said the choice was the operator's; #24 had already made it, and this document was then written claiming the choice had been made *"by neither of the two ways"* that line offered — while one of them sat open in review. **The division now:** `SP-3` is the owner of the machine with no registry, and it skips. `SP-5` is the owner of a run that was cut off **although** a registry answered, and it refuses to turn that into a verdict. Neither answers the other's case: a skip cannot help a build that started and was killed, and an honest interruption message cannot test a flag against a registry that is not there. |
| **Implemented by** | `tests/unit/m-sp.load-dependent.test.ts`. |
| **Covers** | SP-5, SP-FR4. |

## What is deliberately not here

**No case asserts that a skipped case would have passed.** That is what running it in a place where
the precondition holds does, and it is how the counterpart was measured rather than asserted:
`bun install` in this worktree's `dashboard/` and the two component files go from 2 passes with 9
cases absent to **9 pass / 2 skip / 0 fail**. A machine can check that a case asked about its
environment; only a run in that environment can check the case.

**The fourth precondition is covered now, and it took two answers rather than one.** *Written
2026-10-10, after the operator chose "a precondition of its own".*

`OC-15` and `OC-16` build an image with `npm install -g`, so `SP-3` asks whether a registry answers
and skips them where none does — an offline machine, which is a real and common case.

**That alone would not have prevented what was measured, and saying so is the point.** Those two
failed twice by *timing out* at the suite's 60 seconds and passed twice on a quiet machine: the
registry was reachable every time. The quiet build took **14 seconds** on the author's machine
(2026-10-10) and **45** on the reviewer's (2026-10-20), so 60 was between one and four times it
depending on where it ran. They carry their own budget of **600 s** now. The figure and its
measurement are in the SP-5 block.

So the precondition answers the offline machine and the budget answers the load. A case whose colour
depends on what else is running is what makes red stop meaning anything, and it is the half a
reachability check cannot reach.

**The machine's load is answered since 2026-10-17, and the registry since 2026-10-10 — two answers,
by two pull requests, to one line of the backlog.** That line offered a larger budget or a
precondition and left the choice open. `SP-3` took the precondition (#24). This took the third thing
neither offered: **make a cut-off run say so**, because a budget and a skip both leave the real defect
standing — an interrupted run **reporting a verdict on the code**. `OC-15` expects exit 0, so a
cut-off build read as *"expected 0, received 130"*; `OC-16` expects a non-zero exit, so a cut-off
build satisfied its first assertion by accident.

What this document said until 2026-10-20 was that a precondition had been *deliberately not* added,
on the grounds that skipping these two on a slow link removes the coverage where the flag matters
most. **The reasoning is sound and the claim was false**, because #24 had added one ten days earlier
and was in review as it was written. The argument survives as a limit on what `SP-3` may skip for —
no registry at all, not a slow one — and the sentence that read as a decision against a precondition
is withdrawn.

So, together: `SP-3` skips the two cases where nothing answers; a budget of ten minutes each, because
a `docker build --no-cache` with an `npm install` in it does not belong in a figure meant for cases
that never reach the network; and `wasInterrupted`, which makes a cut-off run say so instead of
returning a judgement. `SP-5` holds the last two, including the order of the guard, so the 60-second
default cannot creep back.

A third instance of the same class came with it, found by walking into it on 2026-10-17:
`startDashboard` asked `docker port` **once**, immediately after `docker run -d`, and threw *"no
published port"* with an empty answer. It waits now, by the container's id and against a clock, and
says how the last attempt ended — because what made that answer empty was never established, and
the detail block says what was measured instead.

### SP-3 — a registry answers, and what a precondition cannot fix

| | |
|---|---|
| **Premise** | `OC-15` and `OC-16` run `docker build --no-cache` over an `npm install -g`, so they need a registry. Without one they were simply red, with no case saying why. |
| **Component** | `registryReachable()` in `tests/lib/preconditions.ts`, and the two cases that call it. |
| **A function, not a constant** | It costs a network round trip, and a constant would charge every file importing that module for a question two cases ask. Memoised, so the two pay once between them. |
| **Test data** | `https://not-a-registry.invalid/` for the false half — **RFC 2606 reserves `.invalid` precisely so it cannot resolve**, which is why it is used rather than a name that might one day belong to somebody — and the real registry for the true half, which can only be taken where it answers. `https://memo-probe.invalid/` for the memoisation, a url no earlier ask can have answered. For the machine without curl, a directory holding only a link to `git`, used as the whole `PATH` of a child bun. |
| **Steps** | Ask `registryReachable('https://not-a-registry.invalid/')`. Where the independent `fetch` probe `ONLINE` found the registry, ask `registryReachable()` with its default url. Read `registryProbeCount()`, ask `memo-probe.invalid` twice, and read it after each ask. In a child bun whose `PATH` holds `git` and no `curl`, import the module and ask `.invalid` again. |
| **Expected** | `false`; `true`; probe counts **1** then **0**, with the two answers equal; the child prints `answer=false`, never `Executable not found`, and exits 0. *(Added 2026-10-21: this block had no Steps or Expected row, unlike SP-1, SP-2 and SP-4. Finding 7 of the local review.)* |
| **Which network it asks** | The host's, with the host's `curl`. The builds it gates ask from the Docker daemon, which can sit behind another proxy or resolver, and the base image may still have to be pulled; a host that answers does not prove the build will. What it settles is the offline machine, which is its job. Stated 2026-10-21 for finding 1 of the local review, which is right about the gap and is not repaired: asking from inside the daemon costs a container on every run. |
| **What writing it found, in my own function** | The first version memoised **one** answer regardless of the url. `skipIf` is evaluated at registration time, so the default url's `true` was already cached when the test for an unreachable host ran — and that test was **green against a host that does not exist**. It is a `Map` keyed by url now. The case caught its own helper, which is the argument for writing the false half first. |
| **What the review found, and it is the same mistake one turn later** | The positive half was gated on `registryReachable()` — the function it tests. An implementation that always answers false therefore **skipped its own counterpart**: the reviewer ran that mutant on 2026-10-20 and the file read *2 pass / 1 skip / 0 fail*, which is what an offline machine prints too. A precondition whose permitting half is gated on the precondition cannot refuse anything. It is gated on an independent module-level probe now — `fetch(…, {method: 'HEAD'})` against the registry, a **different mechanism** from the `curl` under test, so a curl-specific regression shows up as the two disagreeing. Re-measured here: against the always-false mutant the case **fails**, and the file is green against the real code. *(The figures given here were 15 pass / 1 fail and 16 / 0, while the file then held 20 tests; measured again 2026-10-21 on that tree, it is **19 / 1** against each of the two mutants and **20 / 0** against the real code. Finding 8 of the local review.)* |
| **And the memoisation row claimed a property nothing held** | It compared two answers, which agree whether or not anything is cached: with the `Map` lookup removed the case stayed green (*3 pass / 0 fail*, the reviewer's M2). The answer is not the observable — the **cost** is. `registryProbeCount()` is the seam, and the case asks about `https://memo-probe.invalid/`, a url no earlier run can have answered, so the counter is unambiguous: first ask 1, second ask 0. Against the cache-removed mutant it now fails. |
| **Widened 2026-10-21 for finding 5 of the local review** | `Bun.spawnSync` throws `Executable not found in $PATH` where there is no `curl`, and the helper let it through. `skipIf` runs at registration, so the whole of `m-oc.allow-scripts` errored while bun collected it — `installLine()`, which needs no network, with it — in place of two cases skipping. Measured before the repair with a `PATH` holding `git` and no `curl`. A machine that cannot ask now answers false — on `ENOENT` only, which is what bun throws for a missing `curl`, a non-executable one and one whose interpreter is gone, all three measured. Any other error is thrown, so a machine fault under load cannot pass for an offline machine; no scenario reaches that branch, because nothing on a `PATH` throws anything else. Such a machine skips OC-15 and OC-16, and says so loudly elsewhere: `ONLINE` still finds the registry, so SP-3's permitting half fails. *Control:* the `try` removed → the new scenario red alone, 22 / 1 of the file's 23. |
| **What it does not fix** | The measured failures. Both cases timed out at 60s twice and passed twice on a quiet machine, with the registry reachable every time. The quiet build takes **14s on the author's machine and 45s on the reviewer's** — two figures, because one machine's duration is not a budget. 60s failed twice under load on the first and held, unloaded, on the second. *(This said the spread between the two machines was why 60s held in one place and not the other; nothing measured the second machine under load. Corrected 2026-10-21 by the second pass of the local review.)* They carry 600 s now, measured in `SP-5`. The precondition answers an offline machine; the budget answers the load. Neither answers the other, and the specification says so rather than letting the precondition look like a repair. |
| **What is still not answered, and it is not this change's job** | A run that is cut off anyway — by the budget firing, or by docker cancelling the build — still reports *"expected 0, received 130"*, a statement about the machine in the shape of a verdict on `--allow-scripts`. That is `SP-5` on `fix/load-dependent-cases`, which narrowed to it once this PR was established as the owner of the offline case. *Answered since #42 merged `main` on 2026-10-21: `SP-5`, above, makes a cut-off build fail with "this run measured nothing" before either assertion, so this row describes the tree before it.* |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`, with `tests/component/m-oc.allow-scripts.test.ts` as the pair that asks. |
| **Covers** | SP-FR1, SP-FR2, SP-FR3. |

### SP-4 — a full Docker VM says so, instead of looking like a defect

> **Numbered `SP-3` first, which was already taken.** #24 has used `SP-3` since 2026-10-10 for the
> network-reachability precondition, and this case took it on 2026-10-15 — two different cases under
> one id, which is the defect `TR-4` on #28 exists for and which `TR-1` cannot see, so it merged
> cleanly everywhere and surfaced only as a conflict when #24 was brought up to date. The later case
> moves, as `OC-40`/`OC-42` moved to `OC-63`/`OC-64` and `M1-11` to `M1-12`. The irony is worth
> keeping: #24's own commit is titled *"the fourth precondition, the last duplicated case id, and
> three of my own mistakes"*.


| | |
|---|---|
| **Premise** | Twice — 2026-10-14 and 2026-10-15 — a Docker VM at **0 bytes free** was diagnosed as something else. The second time it surfaced as **34 failing cases** across M-B5 and M-B6: refusals that did not refuse, builds exiting 2, `AFTER=0` where a build should have succeeded, `B6-36` failing where it had previously skipped. Most of an incompatibility analysis between #10's cache-dependent cases and #25's no-cache design had been written before anybody probed the build by hand and read `java.nio.file.FileSystemException: /m2/org: No space left on device`. The morning before, the same condition was reported to a reviewer as a *"harness artifact"* in a review round. |
| **Why nothing already caught it** | `docker system df` does not say it. It reported *20% reclaimable* while the filesystem had nothing left, because it measures what images and containers occupy and not what the VM has free. The space was in the **build cache** — 39.7 GB — which no test accounts for and which `docker system df` lists separately from the number a reader looks at. The figure that matters comes from `df` **inside** a container, because on Docker Desktop the host's own `df` describes a different disk. |
| **Component** | `tests/lib/dockerspace.ts` — `vmFreeBytes`, `spaceVerdict`, `requireSpaceForDockerBuild` — and the pre-flight in `tests/run.sh`. |
| **Where it is asked, and why only there** | Once, in `tests/run.sh`, before any level runs. One sentence ahead of a run is worth more than the same condition arriving as forty different failures, and the four files on `main` that run `docker build` would each have needed the same line. The library is exported so a case that builds can ask directly. |
| **It fails, it does not skip** | A run that cannot measure must not look like a run that passed. Every other precondition here skips with a voice, because the thing it reports is a property of the checkout; a full disk is a property of the machine and is fixable in one command, so the honest answer is a refusal with the command in it. `exit 2`, and the words *"Nothing was run."* |
| **Steps** | Ask `spaceVerdict` for a reading of 0, 1 GiB, exactly the floor, 20 GiB and `null`; then `requireSpaceForDockerBuild` with an injected reader. Then take the live reading, to show the parse works at all. |
| **Test data, both sides** | What must refuse: `0` and `1 GiB` against a 2 GiB floor. What must proceed: exactly `2 GiB` — the boundary, where an off-by-one would live — `20 GiB`, and **`null`**, which is the reading when docker cannot be asked. The floor is injected rather than taken from the environment, so the cases do not depend on the machine they run on; the live-reading scenario asserts `> 0` rather than a figure, because a `0` there would mean the parse broke, which is how a guard like this starts refusing every run. |
| **Where 2 GiB comes from** | Measured, not chosen: one cold builder image build costs about **305 MB**, read from `df` inside a container either side of `docker build --no-cache` on 2026-10-15. The floor is several of those plus the Maven downloads a real build makes into a container filesystem. It is a floor from a measurement rather than a prediction of need, and `LU_DISK_FLOOR_BYTES` moves it deliberately. |
| **What it found** | Green, 8 scenarios. The failing path was run end to end: with the floor raised past the real reading, `./tests/run.sh m-tr` prints the sentence and exits **2** without running a case; with the floor as shipped it prints `disk: the Docker VM has 22497 MB free` and the run proceeds. |
| **Controls** | Three, each reddening exactly one scenario. An unknown reading treated as empty → the `null` scenario. The boundary made exclusive (`>` for `>=`) → the at-the-floor scenario. The remedy dropped from the message → the message scenario, which is what keeps the sentence from decaying into "disk full". |
| **Implemented by** | `tests/unit/m-sp.docker-space.test.ts`. |
| **Covers** | SP-4, SP-FR1. |

## Traceability

| Requirement | Covered by |
|---|---|
| SP-FR1 each precondition is computed from current state, never assumed | SP-1, **SP-3**, **SP-4**, B5-33, B5-34 — *the Liquid image's versions, read rather than assumed; added 2026-10-22* |
| SP-FR2 each discriminator is shown to answer both ways | SP-1, **SP-3** |
| SP-FR3 a case that depends on one names it where a reviewer reads, and a skip is never silent | SP-2, **SP-3** |
| SP-FR4 a condition of the machine is never reported as a verdict on the code | **SP-5** |

*`SP-3` added to all three rows 2026-10-20.* Its detail block claimed them and the table listed it
against none, so the document disagreed with itself one screen apart — the drift this PR fixed in
`m-a16.skip-panel`'s header, in the PR that fixed it. Raised as item 3 of the first review.
