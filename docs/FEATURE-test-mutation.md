# Proving a test can fail

**Status: specification, nothing implemented.** Written 2026-09-19, before any code, as this project
requires. The cases are in `TEST-SPEC-test-mutation.md` and are signed off before implementation
begins.

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
controlled experiment.

## 5. The runner, and the four rules that make it worth having

`tests/mutate.sh` applies each entry, runs only the test file that owns the case, requires the named
test to fail, and restores the subject.

**A `from` that no longer matches is an error, not a skip.** This is the whole point turned on the
validator itself: a registry that silently ignores stale entries is a check that cannot run,
reporting as a check that ran. If the subject has moved, the run fails and names the entry.

**The named test must fail, and the rest of that file must not.** Otherwise a mutation that breaks
compilation would "pass" every entry in the registry at once.

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

**M-MU1 · The registry, the runner, and its own cases.** Including the recursive ones: the runner
must be shown to fail when it cannot run. *Done when* MU-1 to MU-7 pass and the report is readable.

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

**What compensates is already in the design rather than added for it.** §7 puts the mutation in the
detail block of the test specification, beside what makes the case green. So the second pair of eyes
is the **reviewer at review time** — the mutation is a thing Timur can challenge on a pull request,
which is exactly what he cannot do today. The blind spot is not removed; it is moved to where
somebody else looks.

### D3 · Backfill per milestone, for speed

*"The second for speed."* M-MU2 becomes work each milestone carries as it is next touched, rather
than one pass over 543 cases.

**The cost of that choice is a number nobody knows**, for as long as the backfill runs — and this
project has been bitten by exactly that: a suite whose green said nothing about the paths it had
never walked. **MU-8 is what keeps the debt visible**, and D3 promotes it from a nicety to the thing
that makes this decision safe: the report prints the count of specified cases, the count with an
entry, and the list without one, on every run. The unknown stays unknown, but it stops being
invisible, and its size is readable on any day somebody wants to know.
