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
| **SP-3** | **negative** | An unreachable host answers false — against `.invalid`, which RFC 2606 reserves so it cannot resolve |
| **SP-3** | positive | And the real registry answers true, taken only where it does |
| **SP-3** | positive | The answer is memoised per url, so two asking cases pay for one round trip |

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
registry was reachable every time. The build takes **14 seconds** quiet, measured 2026-10-10 — so 60
was already four times it and still not enough under load. They carry their own **180-second** budget
now, thirteen times the measured duration, and the cost is stated where it is taken: a genuinely
broken build takes three minutes to say so.

So the precondition answers the offline machine and the budget answers the load. A case whose colour
depends on what else is running is what makes red stop meaning anything, and it is the half a
reachability check cannot reach.

### SP-3 — a registry answers, and what a precondition cannot fix

| | |
|---|---|
| **Premise** | `OC-15` and `OC-16` run `docker build --no-cache` over an `npm install -g`, so they need a registry. Without one they were simply red, with no case saying why. |
| **Component** | `registryReachable()` in `tests/lib/preconditions.ts`, and the two cases that call it. |
| **A function, not a constant** | It costs a network round trip, and a constant would charge every file importing that module for a question two cases ask. Memoised, so the two pay once between them. |
| **Test data** | `https://not-a-registry.invalid/` for the false half — **RFC 2606 reserves `.invalid` precisely so it cannot resolve**, which is why it is used rather than a name that might one day belong to somebody — and the real registry for the true half, which can only be taken where it answers. |
| **What writing it found, in my own function** | The first version memoised **one** answer regardless of the url. `skipIf` is evaluated at registration time, so the default url's `true` was already cached when the test for an unreachable host ran — and that test was **green against a host that does not exist**. It is a `Map` keyed by url now. The case caught its own helper, which is the argument for writing the false half first. |
| **What it does not fix** | The measured failures. Both cases timed out at 60s twice and passed twice on a quiet machine, with the registry reachable every time. The build takes 14s quiet, so 60 was four times it and not enough under load; they carry 180s now, thirteen times measured. The precondition answers an offline machine; the budget answers the load. Neither answers the other, and the specification says so rather than letting the precondition look like a repair. |
| **Implemented by** | `tests/unit/m-sp.preconditions.test.ts`, with `tests/component/m-oc.allow-scripts.test.ts` as the pair that asks. |
| **Covers** | SP-FR1, SP-FR2, SP-FR3. |

## Traceability

| Requirement | Covered by |
|---|---|
| SP-FR1 each precondition is computed from current state, never assumed | SP-1 |
| SP-FR2 each discriminator is shown to answer both ways | SP-1 |
| SP-FR3 a case that depends on one names it where a reviewer reads, and a skip is never silent | SP-2 |
