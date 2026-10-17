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

| # | Sign | Scenario |
|---|---|---|
| **SP-1** | positive + **negative** | A started checkout is told apart from one where nothing has run — and `volumes/repos`, which the obvious discriminator would have used, is present in the one that has not |
| **SP-1** | positive + **negative** | A directory that is no git repository is told apart from one that is |
| **SP-1** | positive + **negative** | A dashboard without its dependencies is told apart from one with them |
| **SP-1** | positive | The exported constants describe *this* checkout, and `preconditions()` names it |
| **SP-2** | positive | Each of the eight dependent files names the precondition it skips on, in its header, and uses it |
| **SP-4** | **negative** | A Docker VM below the free-space floor stops the run, and the message names the cause and the remedy — *2026-10-15* |
| **SP-4** | **negative** | …and a reading that is merely low stops it too |
| **SP-4** | positive | …while a reading **at** the floor proceeds, which is where an off-by-one would live |
| **SP-4** | positive | …and plenty of room proceeds, saying how much |
| **SP-4** | positive | …and a reading that could not be taken proceeds, because "cannot measure" is not "no space" |
| **SP-4** | **negative** | The guard throws with that message when the VM is empty |
| **SP-4** | positive | …and does not throw when it is healthy |
| **SP-4** | positive | The live reading is of the VM and is a number, or an honest `null` |
| **SP-5** | **negative** | A child that was cut off is told apart from one that failed — exit 130, and docker's two wordings for a cancelled build | A cut-off run says nothing about the code, and two cases read it as if it did |
| **SP-5** | positive | …while an ordinary failure is **not** called an interruption | The counterpart that carries the weight: `OC-16` exists to see a build fail, so a guard that called every failure an interruption would swallow the case it protects |
| **SP-5** | positive | …and neither is success | |
| **SP-5** | positive | A published port is read out of `docker port`'s answer, including two-line answers | `startDashboard` asked once, got nothing, and reported that the container had published nothing |
| **SP-5** | **negative** | …and the empty answer, a zero port and anything else are no port | The empty answer is the measured one: the mapping was not visible yet |
| **SP-5** | positive | `OC-15` and `OC-16` carry a budget of their own, at least ten minutes | Without it the repair is one quiet machine away from coming back |
| **SP-5** | positive | …and the interruption guard runs **before** each verdict | Order is the point for `OC-16`: its first assertion is satisfied by an interrupted build |
| **SP-5** | positive | …and the dashboard waits for the mapping rather than asking once | |

## Detail

### SP-1 — a discriminator nobody has seen say "no"

| | |
|---|---|
| **Premise** | Three questions decide whether a case can run here: has a start run (`volumes/_git-secrets`, which `config/scripts/start/git.sh:60-61` is the only thing that creates); is this a git repository at all (a release installation is not); are the dashboard's dependencies installed (the component tier needs a DOM). |
| **Component** | `tests/lib/preconditions.ts`, as three pure functions of a root. |
| **Steps** | Build three throwaway roots — one bare, one carrying `volumes/_git-secrets`, one carrying `dashboard/node_modules` — plus a `git init`ed one, and ask each discriminator about each. Then ask whether the exported constants agree with the same functions applied to `repoRoot`. |
| **Test data, and why `volumes/repos` is in it** | The bare root is given `volumes/repos` on purpose. That is what the obvious discriminator would have tested, and it is wrong: `m-a5.nested-clone`, `m-a10.fixture-ceiling` and `gitfixture` all create it, so it is there after any run of the suite and says nothing about a start. A guard checked only against something invented is not shown to accept anything real, so the git case uses a real `git init` rather than a fabricated `.git`. |
| **Expected** | `false` for the bare root and `true` for the prepared one, in each of the three; and the constants equal to the functions applied to `repoRoot`. |
| **What it found** | Green, 4 scenarios. The fourth exists because the first three are measured against throwaway roots only: without it, nothing says the exported constants are about the place the suite is actually in. |
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

### SP-5 — a run that was cut off is not a verdict on the code

| | |
|---|---|
| **Premise** | Two cases build an image inside the suite's 60-second budget and reach the network doing it. They failed twice on 2026-10-09 — `Received: 130` and `this test timed out after 60000ms` — and passed in two later runs on a quiet machine. A case whose colour depends on the load is the worse of the two findings, because it is how red stops meaning anything. |
| **And they read the interruption in opposite directions, both wrong** | `OC-15` expects exit 0, so a cut-off build reads as a verdict on `--allow-scripts`. `OC-16` expects a **non-zero** exit, so a cut-off build satisfies its first assertion by accident — only its second, that npm named the script it refused to run, keeps it honest. One defect, two opposite false readings. |
| **Component** | `wasInterrupted` in `tests/lib/shell.ts`; `parsePublishedPort` and `awaitPublishedPort` in `tests/lib/dashboardserver.ts`; the budgets and the guard in `tests/component/m-oc.allow-scripts.test.ts`. |
| **Test data, both sides, and why these** | Interruptions: exit **130** (SIGINT, the budget firing), and docker's two wordings for a cancelled build — `failed to solve: context canceled` and `signal: interrupt` — because they differ between versions and the exit code is not always 130 when the daemon gives up. Not interruptions: **exit 1 with `install.cjs` in the output**, which is `OC-16`'s real failure and the counterpart that matters, and exit 0 with a version string. Ports: `127.0.0.1:55047`, and `0.0.0.0:32768\n[::]:32768` for the two-line answer; **the empty answer**, which is the measured one, plus `127.0.0.1:0` and `nonsense`. |
| **Expected** | Only interruptions are called interruptions; only a real mapping parses as a port; both build cases carry at least a ten-minute budget; the guard appears **before** each `expect(r.code…)`; and the dashboard helper no longer asks once. |
| **Measured** | 2026-10-09 for the two load failures and the two quiet-machine passes, recorded in `BACKLOG.md`. 2026-10-17 for the third instance: `no published port for lu-a8-unprepared` with an empty answer while a second suite was running, and the container publishing `127.0.0.1:55047->3000` seconds afterwards. |
| **Shown able to fail** | `wasInterrupted` always true reddens **2** — both counterparts, which is the proof that the guard cannot swallow `OC-16`; always false reddens **3**; the budgets removed, **1**; the dashboard asking once again, **1**. |
| **Why no new precondition** | A skip would remove the coverage on a slow link, which is where the flag matters most. The paragraph below used to offer only a budget or a precondition; the third option — make the cut-off say so — is the one that removes the false reading rather than the red. |
| **Implemented by** | `tests/unit/m-sp.load-dependent.test.ts`. |
| **Covers** | SP-5, SP-FR1. |

## What is deliberately not here

**No case asserts that a skipped case would have passed.** That is what running it in a place where
the precondition holds does, and it is how the counterpart was measured rather than asserted:
`bun install` in this worktree's `dashboard/` and the two component files go from 2 passes with 9
cases absent to **9 pass / 2 skip / 0 fail**. A machine can check that a case asked about its
environment; only a run in that environment can check the case.

**The fourth precondition, the machine's load, is answered since 2026-10-17 — and by neither of the
two ways this paragraph used to offer.** It said the choice was between a larger budget and a
precondition of its own, and both leave the real defect standing: an interrupted run **reported a
verdict on the code**. `OC-15` expects exit 0, so a cut-off build read as *"expected 0, received
130"*; `OC-16` expects a non-zero exit, so a cut-off build satisfied its first assertion by accident.

So: a budget of ten minutes each, because a `docker build --no-cache` with an `npm install` in it does
not belong in a figure meant for cases that never reach the network — **and** `wasInterrupted`, which
makes a cut-off run say so instead of returning a judgement. A precondition was deliberately *not*
added: skipping these two on a slow link would remove the coverage exactly where the flag matters
most. `SP-5` holds all of it, including the order of the guard and the budget, so the 60-second
default cannot creep back.

A third instance of the same class came with it, found by walking into it on 2026-10-17:
`startDashboard` asked `docker port` **once**, immediately after `docker run -d`, and threw *"no
published port"*. The container was up and publishing `127.0.0.1:55047->3000` seconds later. It waits
now — forty attempts at 50 ms where there was one — and the parse is a pure function so both answers
can be measured without docker.

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
| SP-FR1 each precondition is computed from current state, never assumed | SP-1, **SP-4**, **SP-5** |
| SP-FR4 a condition of the machine is never reported as a verdict on the code | **SP-5** |
| SP-FR2 each discriminator is shown to answer both ways | SP-1 |
| SP-FR3 a case that depends on one names it where a reviewer reads, and a skip is never silent | SP-2 |
