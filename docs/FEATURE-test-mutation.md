# Proving a test can fail

**Status: specified, signed off, and M-MU1 built the same day.** Written 2026-09-19 before any code,
as this project requires; the cases are in `TEST-SPEC-test-mutation.md`. M-MU1 -- the registry, the
runner and its own twelve cases -- is in. M-MU2, the backfill, runs per milestone and is by design
never finished; §13 carries the first number.

Branch `feature/test-mutation-control`, cut from `feature/git-integration` (#9), because that is
where the suite it validates lives: 123 test files against 19 on `main`, and the testing skill this
work amends exists on #9 and not on `main`.

---

## 1. Why this exists

The operator asked it in one sentence on 2026-09-19:

> *"siehst du eine Möglichkeit, solche Tests vorher zu prüfen, ob sie auch tatsächlich das testen was
> sie sollen? Quasi eine Validierung eines Tests."*

The question came out of a measurement that had nothing to do with tests. The stack's own memory
consolidation had been running daily for nine days and writing *"Ranked 0 candidate(s) for durable
promotion"* — and a pipeline that cannot gather candidates produces exactly that line, as does one
that gathered and found nothing. **Both exit cleanly. Both look like a healthy system.**

This project has met that shape four times already, and written it down each time:

| | Where |
|---|---|
| `if ! emit` suspended `errexit`, so a failed pipeline stage produced a stub snapshot that was stamped as the reference | OpenClaw #11, F10 |
| A deployment guard was added to `build.sh` and the image was not rebuilt, so the first "green" proof run proved nothing | M-B4 |
| A negative control could not stage its own fixture, said so into `/dev/null`, and reported the silence as a finding about NiFi | `tests/verify/m-b4.sh` |
| A check answered *"Liquid does not list our processor"* over a NAR that was byte-identical in `lib/` | M-B3 |

The standing question the handover draws from them is **"what would I see if this never ran?"** — and
if the answer is "the same thing", the output is decoration.

**That question has never been asked of the suite itself.** 543 cases pass. Not one of them has been
shown to be capable of failing, except the handful written after a defect and run against the
unfixed code first.

## 2. What is missing, exactly

This project already has the practice: *write the case, run it against the unfixed code, watch it go
red, then fix.* It is in the milestone cycle and it works — **for regressions.** A defect supplies
the broken state for free.

**For new code there is no broken state**, and then nothing stands between a real assertion and one
that would pass over any implementation. Today's own work is the example: seventeen cases were
written for the pairing card and all seventeen were green the moment they were written, because the
card had just been written to satisfy them. Their greenness said nothing until one rule was broken
on purpose — `requestId: 'latest'` changed to `requestId: req.requestId` — and the case went red
naming that assertion.

That is the whole mechanism, and it took thirty seconds. What it is not is **repeatable, recorded,
or required**: it lives in a transcript, it was done because the author happened to think of it, and
nothing notices when the next author does not.

**By this project's own commandment that is the wrong category.** Whether a case can fail is
*determinable*. Facts are computed; conduct is taught. This is a fact filed as conduct.

## 3. Two controls, and they answer different questions

The distinction matters more than the tooling, and half of it already exists here.

| | Asks | Example in this repository |
|---|---|---|
| **Positive control** | Can the measurement see anything at all? | The NAR checks count `GenerateFlowFile`, a processor every NiFi ships, before drawing any conclusion, and refuse to conclude when it is absent |
| **Negative control — the mutation** | Can the assertion refuse anything at all? | Breaking `requestId: 'latest'` and requiring OC-44 to go red |

A case with neither is a claim. A case with only the first can still assert something no
implementation could violate. A case with only the second can still be measuring the wrong subject.
**This milestone builds the second and makes both legible**; it does not replace the first.

## 4. The registry

The mutation is **data, not a paragraph**. It lives next to the suite, and every entry names four
things:

```js
{
  case: 'OC-44',
  file: 'dashboard/src/lib/components/OpenClawPairing.svelte',
  from: "requestId: 'latest'",
  to:   'requestId: req.requestId',
  mustFail: 'the card posts `latest` rather than an id it rendered'
}
```

| Field | Why it is there |
|---|---|
| `case` | Ties the entry to the row in the test specification, so a reader can judge whether it is the *right* mutation |
| `file`, `from`, `to` | The smallest edit to the **subject** that should break the rule. Never an edit to the test |
| `mustFail` | The name of the test that must go red. Not "some test": a mutation that reddens ten cases proves nothing about the one |

`from` must occur **exactly once** in the file. A mutation that could land in two places is not a
controlled experiment. It may span several lines: `from` and `to` travel base64-encoded, which the
first implementation did not allow and MU-5 caught -- see §13. One field the sketch above omits and
the implementation needs: **`spec`**, the test file that owns the case, since the runner runs that
file and nothing else.

## 5. The runner, and the five rules that make it worth having

`tests/mutate.sh` applies each entry, runs only the test file that owns the case, requires the named
test to fail, and restores the subject.

**A `from` that no longer matches is an error, not a skip.** This is the whole point turned on the
validator itself: a registry that silently ignores stale entries is a check that cannot run,
reporting as a check that ran. If the subject has moved, the run fails and names the entry.

**The named test must fail, and at least one test in the file must still pass.** Otherwise a
mutation that breaks compilation would "pass" every entry in the registry at once. The rule was
*"and the rest must not fail"* until the sample of §12 measured it: **four of ten entries reddened
more than one test**, every time a sibling asserting the same rule from the other side. Requiring
the rest to stay green would refuse honest entries, so the guard keeps only what it was for —
catching the mutation that reddens everything.

**A green run is a question, not a finding.** This is the rule the sample forced, and it is the one
that matters most. When a mutation is applied and no case goes red, that reads as *"no case protects
this rule"* — the exact thing this milestone was built to discover. In the sample it was wrong four
times out of thirteen, and it was wrong in a way nothing could see: the mutation was too narrow,
landed at the wrong site, or replaced one of two occurrences. **A green mutation is therefore
recorded as unresolved and never as a finding, until a second mutation of a different shape shows
the same thing.** The runner marks it `unresolved` and the run does not count it either way.

**The subject is restored however the run ends**, including `Ctrl-C`. `tests/verify/m-b2.sh` shipped
a `trap … INT` that ran its handler and then resumed, so the goal that commissioned it — *"everything
restored including on Ctrl-C"* — had never been tried. Here the failure is worse: an interrupted run
leaves a deliberately broken line in the working tree.

**The run refuses to start on a dirty working tree**, for the same reason: it cannot distinguish its
own edit from the operator's, and "restore" would then mean "discard their work".

## 6. Where this applies, and where it would be ceremony

`CLAUDE.md` already draws the line and this milestone does not move it: **full branch coverage is
required for real decision logic; it is not demanded of configuration, mounts, or Markdown.**

| | Needs a mutation | Why |
|---|---|---|
| A guard that refuses input (`REQUEST_ID`, the skip-step rule, the secret scan) | **yes** | It is the assertion doing work |
| A rule about which value is written where (`identityScopes` naming nginx's identity) | **yes** | Two files must agree; the case is what notices when they stop |
| A case asserting a mount exists in `compose.yml` | no | The mutation and the assertion would be the same edit |
| Behaviour that depends on a model | **never** | Already a documented manual check, because such assertions are non-deterministic |

Cost is the reason for the line, not taste: one entry costs one test-file run. Thirty
decision-carrying cases are minutes; 543 would be a day.

## 7. The rule that makes it stick

**A case may not be recorded as passing in a test specification unless its mutation is registered.**
The detail block then says what makes it red, beside what makes it green — and a reviewer can
challenge the mutation, which is the part they cannot do today.

That is one line in `CLAUDE.md` § Development rules and one section in
`config/agents/skills/testing/SKILL.md`, so the agents working inside the stack are held to the same
standard as the agents building it.

**Adopted as a block rather than a note** (D1), with the signal that would retire it written down in
§11 — because a rule whose cost nobody can demonstrate is a rule nobody can ever take back out. And
since the author writes their own mutation (D2), the detail block is not decoration: it is the only
point at which a second person sees the experiment at all.

## 8. Requirements

**Functional**

- **MU-FR1** A registry entry names case, file, `from`, `to` and the test that must fail.
- **MU-FR2** The runner applies one entry at a time, runs only the owning test file, and restores.
- **MU-FR3** A `from` that does not occur exactly once fails the run and names the entry.
- **MU-FR4** The run fails unless **the named test** fails; other tests in the file must still pass.
- **MU-FR5** The subject is restored on success, on failure, and on interrupt.
- **MU-FR6** The runner refuses to start when the working tree has uncommitted changes to a subject.
- **MU-FR7** The report lists, per entry, the case, the mutation and the outcome — and separately the
  cases in the specification that carry **no** entry.

**Non-functional**

- **MU-NFR1 · It is a tool that is run.** A mutation registry nobody executes is the third copy of
  the mistake this milestone exists for. It runs in the milestone cycle, at the same point as the
  suite.
- **MU-NFR2 · Bounded.** Each entry has a timeout; an entry that hangs fails rather than stalling the
  run, and the subject is restored.
- **MU-NFR3 · It never edits a test.** The registry mutates the subject under test and nothing else.
  A tool that can rewrite the assertions can make anything pass.

## 9. Milestones

**M-MU1 · The registry, the runner, and its own cases — built 2026-09-19.** `tests/mutations.json`,
`tests/mutate.sh`, and `tests/integration/m-mu.runner.test.ts` with sixteen tests covering MU-1 to
MU-12. The registry opens with the ten entries the sample measured, so M-MU2 starts at ten rather
than nought. What building it found is §13.

**M-MU2 · Backfill, per milestone as each is next touched** (D3). Every case that carries a decision
gets an entry when its milestone is worked on again, and the ones deliberately exempt are listed with
the reason. **It is therefore never "done"**, which is the price of the speed, and MU-8's report is
what stops that from becoming invisible: the gap is printed on every run rather than discovered
later. The number, whenever it is first read, is a finding in its own right — it is the first time
anyone will know how many of 543 cases can be shown to fail.

**M-MU3 · The rule into the documents.** `CLAUDE.md` § Development rules and
`config/agents/skills/testing/SKILL.md`, plus the detail-block format in the test specifications.

## 10. Deliberately not in scope

**Automatic mutation testing of the Stryker kind.** Generating mutants across the source tree is
expensive, and most of this suite asserts over *text* — shell scripts, rendered configuration,
Svelte components read as source — where generated mutants are mostly noise. A named mutation per
decision is smaller, slower to write, and says something a generated one cannot: **that this
particular rule is what the case protects.**

**Coverage percentages.** They measure which lines ran, which this project has already found to be a
claim about routes rather than about correctness: 334 cases passed while the dashboard's Start button
could not bring up a stack.

## 11. What the operator decided, 2026-09-19

All three were answered the day this was written.

### D1 · Blocking, with a way back

**A missing mutation blocks.** *"We try blocking first. If that hinders the workflow too much we will
relax it to report."*

So §7 stands as written. What that sentence needs, and gets here, is **a signal** — otherwise "too
much" is a feeling, and a rule nobody can show to be costly is a rule nobody can retire. The relaxation
is considered when either of these is observed, and both are cheap to read off the report M-MU1
already produces:

| | The signal |
|---|---|
| **Cost** | A milestone is held up by mutations for longer than it took to write the cases themselves |
| **Quality** | Entries start appearing that exist to satisfy the rule — a mutation that reddens its case for a reason unrelated to what the case is about |

The second is the dangerous one and it is the reason blocking is worth trying first rather than
instead: a rule that must be satisfied produces satisfying behaviour. If the entries stay honest
under blocking, the rule is earning its cost; if they turn into ceremony, the rule has become the
thing it was built to prevent, and the report is where that will be visible.

### D2 · The author writes it, because there is no second reader

*"Author writes it as we do not have a second pair of eyes."* That is the real constraint here, and
it removes the mitigation §11 originally hoped for: the author of a case is the person least likely
to think of the mutation the case fails to catch.

**What compensates is partly in the design and partly a rule this decision makes mandatory.** §7 puts
the mutation in the detail block of the test specification, beside what makes the case green, so the
second pair of eyes is the **reviewer at review time** — a thing Timur can challenge on a pull
request, which is exactly what he cannot do today.

**But §12 showed that is not enough on its own.** A reviewer sees the mutation that was *registered*
— the one that worked. They never see the four that came before it and produced false greens, and
the author is the person least able to notice that their own mutation was the weak part rather than
the case. With no second reader, the compensation has to be **mechanical**: that is why *a green run
is a question, not a finding* (§5) is a rule rather than good practice here. D2 is what makes it
load-bearing.

### D3 · Backfill per milestone, for speed

*"The second for speed."* M-MU2 becomes work each milestone carries as it is next touched, rather
than one pass over 543 cases.

**The cost of that choice is a number nobody knows**, for as long as the backfill runs — and this
project has been bitten by exactly that: a suite whose green said nothing about the paths it had
never walked. **MU-8 is what keeps the debt visible**, and D3 promotes it from a nicety to the thing
that makes this decision safe: the report prints the count of specified cases, the count with an
entry, and the list without one, on every run. The unknown stays unknown, but it stops being
invisible, and its size is readable on any day somebody wants to know.

## 12. The sample, run 2026-09-19 before anything was built

Ten cases, stratified over tier and milestone, mutated by hand between **20:10:19 and 20:13:45**.
The interpretation was written down *before* the run, so that no number could be read favourably
afterwards.

| # | Case | Tier | What was mutated | Attempts | Result |
|---|---|---|---|---|---|
| 1 | A4-7 | unit | `pre-push`, the private-key pattern | 1 | named test red, 2 green |
| 2 | A3c-3 | unit | `lib/git-repos.sh`, the policy rejection removed | **2** | named test red, 9 green |
| 3 | A9-1 | contract | `git.sh`, the shared wait helper renamed | **2** | named test red, 11 green |
| 4 | A4-13 | contract | `git.sh`, `core.hooksPath` at both sites | **2** | named test red, 2 green |
| 5 | A6-11 | contract | `pre-push`, one next-step line removed | 1 | named test red, 2 green |
| 6 | A8-4 | component | `server/git.ts`, fingerprint format | 1 | named test red, 6 green |
| 7 | A10-16 | component | `server/git.ts`, the exit-status check disabled | 1 | **2 red**, 1 green |
| 8 | A5-2 | integration | `lib/git-repos.sh`, per-repository key mode | **2** | named test red, 3 green |
| 9 | A13-2/3 | integration | `git.sh`, `GIT_ONLY_SLUG` renamed | 1 | **3 red**, 4 green |
| 10 | A10-18 | integration | `git.sh`, the untrusted-host guard disabled | 1 | **2 red**, 3 green |

**Ten of ten could be made to fail.** Nothing in the sample asserts something no implementation could
violate — which was the outcome that would have overturned D3, and did not.

**Thirteen attempts for ten entries, and every bad attempt ran green.** That is the finding:

| Bad attempt | What was wrong | What it looked like |
|---|---|---|
| 2 | Widened the rule with a word no case uses | *no case caught it* |
| 3 | The `from` did not occur in the file at all | *no case caught it* |
| 4 | One of two occurrences replaced; the other governed the fixture | *no case caught it* |
| 8 | Hit the shared key's `chmod`, not the per-repository one | *no case caught it* |

**So the most common failure of this method is not the case that proves nothing. It is the mutation
that breaks nothing — and it is indistinguishable from a discovery.** MU-2 and MU-3 catch two of the
four shapes; the fourth, *applied once and still ineffective*, cannot be caught mechanically at all.
That is why §5 now says a green run is unresolved rather than a finding, and why §11 D2 leans on that
rule rather than on a reviewer.

### What it changed, and what it did not

| | |
|---|---|
| **D1 · blocking** | **Unchanged, and better supported.** ~20 seconds per entry is far below the cost signal that would retire the rule |
| **D2 · the author writes it** | **Unchanged as a decision, stronger as a risk.** Its compensation moved from social to mechanical — see §11 |
| **D3 · per-milestone backfill** | **Unchanged.** Zero non-mutable cases means the debt is small in quality, so spreading it is safe |
| **The runner's second rule** | **Changed**: "the rest must pass" became "at least one must pass" |
| **The estimate** | **Changed by an order of magnitude.** Two to three hours for a full backfill, against the sixteen hours predicted an hour earlier |

That last row is worth keeping as a caution rather than a triumph. The sixteen-hour figure was
extrapolated from a single observation, in the same message that warned against extrapolating from a
single observation — the same mistake the handover records about the bound that was called reliable
after one lucky measurement. **Ten measurements cost three minutes and replaced it.**

### What the sample does not cover

It is ten cases from the M-A milestones on one branch. It contains **no Java case, no system-tier
case, and nothing docker-backed** — and those are the tiers where a single test file runs in minutes
rather than milliseconds. The two-to-three hour figure carries that assumption openly, and the first
milestone that backfills a docker-backed tier will correct it.

## 13. What building it found, 2026-09-19

Three defects, all in the runner rather than in the suite, and each found by the thing meant to find
it.

**The first would have condemned every case in the repository.** bun names a test on its own line
only when it **fails**; passing ones appear solely in the tally at the end. The first runner counted
`(pass)` lines, found none, and classified the very first entry — A4-7, whose mutation had been
measured by hand an hour earlier — as *"every test in the file failed; that is a broken file, not a
control"*. Run over the whole registry it would have reported ten broken files and no validated
cases, which reads as a catastrophe rather than as a parsing bug.

**The second was a limit nobody had noticed deciding.** The registry travelled from JSON to bash as
tab-separated fields, so a value carrying a newline was refused — and that quietly made **multi-line
mutations impossible**. A rule spanning two lines is exactly the kind worth breaking. It was found by
MU-5, whose fixture has to empty a whole file to redden every test, and it is now lifted: `from` and
`to` travel base64-encoded.

**The third was in the replacement itself.** The mutation was applied with `String.replace`, which
interprets `$&`, `$1` and friends in the replacement — in a repository whose subjects are shell
scripts full of `$` it would have corrupted the file it was restoring afterwards. It uses an index
and two slices now.

### And one finding that is not about the runner

The first `--gaps` run answered:

```
specified=251 registered=10 missing=241 orphaned=0
```

**251 specified cases on this branch, ten of which have ever been shown to be capable of failing.**
That is the number §2 said nobody knew, and it is now printed on demand. It is not a verdict on the
suite — 10 of 10 sampled cases *could* be made to fail, so the missing 241 are unmeasured rather than
suspect. The point is that the difference between *unmeasured* and *sound* is now visible instead of
being a matter of confidence.
