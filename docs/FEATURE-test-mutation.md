# Proving a test can fail

**Status, as of 2026-10-21.** Written 2026-09-19 before any code, as this project requires.

- **M-MU1 -- the runner and its own cases -- is on `main`.** It was built on #18,
  `feature/mutation-registry`, which merged on 2026-10-21; its cases are specified in
  `docs/TEST-SPEC-mutation-runner.md`. This branch carries the **registry** and the backfill.
- **M-MU2, the backfill**, runs per milestone and is by design never finished. §15 carries the
  figures as last recorded, each with the tree it was measured on; every run of `tests/mutate.sh`
  ends with the gap as it is now.
- **M-MU3 is not built.** D1's "a missing mutation blocks" is enforced nowhere: see §7.

Branch `feature/test-mutation-control`. It was cut from `feature/git-integration` (#9) because that
is where the suite it validates lived. #9 is merged; from 2026-10-09 the pull request was based on #18
so that the two would not collide over `tests/mutations.json`, and since #18 merged it is based on
`main`.

*The paragraph this replaces said M-MU1 was "in" here, gave the branch as cut from #9 as though #9
were open, and said the testing skill "exists on #9 and not on `main`". All three stopped being true.
B1 of the 2026-10-01 re-review. Brought up to date again 2026-10-21, N3 of that day's re-review: it
said the runner was "on #18, not here" with "91 scenarios", after #18 had merged, and pointed at §9
for a status §9 did not give. No scenario count is printed here any more, because the runner's own
specification is where that number lives.*

---

## 1. Why this exists

The operator asked it in one sentence on 2026-09-19:

> *"siehst du eine Möglichkeit, solche Tests vorher zu prüfen, ob sie auch tatsächlich das testen was
> sie sollen? Quasi eine Validierung eines Tests."*
>
> — *"do you see a way of checking such tests beforehand, whether they really test what they are
> supposed to? A validation of a test, as it were."* Translated 2026-10-09: the project's language is
> English and a reader should not have to guess at the sentence the whole milestone came from. The
> original is kept because it is a quotation.

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

`from` must occur **exactly once** in the file — **unless `"all": true` declares that every
occurrence is meant**. A mutation that could land in two places is not a controlled experiment unless
the entry says it is one. It may span several lines: `from` and `to` travel base64-encoded, which the
first implementation did not allow and MU-5 caught -- see §13.

**The contract is `docs/PROCEDURE-mutation-control.md`, and this table is the sketch it grew out
of.** *Rewritten 2026-10-09, B1 of the 2026-10-01 re-review, which found three things wrong with the
sketch rather than with the runner:*

| Field | What it is | Where it is specified |
|---|---|---|
| `case` | ties the entry to its row | PROCEDURE §*The registry* |
| `file`, `from`, `to` | the smallest edit to the **subject** | the same |
| `spec` | the test file that owns the case; the runner runs that file and nothing else. **Required**, not the afterthought the sketch made it | the same |
| `mustFail` | the test that must go red — **or a describe block, which stands for every test under it: red if any is red** | the same, and MU-42 |
| `all` | every occurrence of `from` is meant. Three entries use it: A3c-5, A3c-8 and A6-12 | MU-35 |
| `exempt` | a registered decision not to mutate, with its reason. One entry uses it: A3-3 | MU-34, MU-36 |

The sketch said `mustFail` is "the name of the test ... not 'some test'", and three entries — A10-10,
A10-14 and A10-20 — name a block. That is not "some test": a block is a case whose tests are
generated, and the rule is written down in the PROCEDURE rather than here.

*Corrected 2026-10-21.* The `all` row said four entries use it, and three did on the day it was
written as they do now; the paragraph above said two entries name a block, and A10-10 — registered in
the same round — made it three. The entries are named now rather than counted, so a reader can check
them against `tests/mutations.json` in one look. The MU ids are on `main` since #18 merged, so "on
#18" went from the table. Item 5 of the local review of 2026-10-21, and N3 of that day's re-review.

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

**The run refuses to work on a subject that has uncommitted changes**, for the same reason: it cannot
distinguish its own edit from the operator's, and "restore" would then mean "discard their work".
*Corrected 2026-09-30 -- this said the run refuses to start on a dirty working tree.* It is judged per
subject, not per tree: a checkout with unrelated work in progress still runs every entry whose own
subject is clean, and only those entries are refused.

## 6. Where this applies, and where it would be ceremony

`CLAUDE.md` already draws the line and this milestone does not move it: **full branch coverage is
required for real decision logic; it is not demanded of configuration, mounts, or Markdown.**

| | Needs a mutation | Why |
|---|---|---|
| A guard that refuses input (`REQUEST_ID`, the skip-step rule, the secret scan) | **yes** | It is the assertion doing work |
| A rule about which value is written where (`identityScopes` naming nginx's identity) | **yes** | Two files must agree; the case is what notices when they stop |
| A case asserting a mount exists in `compose.yml` | **yes, where the mount carries a rule** | *Corrected 2026-10-09.* The row said no, and A6-12 — every agent container mounts `git-publish` **read-only at the same place on PATH** — is registered and validates `(1 red, 2 green)`. What the row was reaching for is a mount assertion with nothing to decide: that a path appears. `read-only`, `at the same place`, and `all three containers` are rules, and §6's own test is whether a reader could get the assertion wrong in a way the mutation would catch |
| Behaviour that depends on a model | **never** | Already a documented manual check, because such assertions are non-deterministic |

Cost is the reason for the line, not taste: one entry costs one test-file run. Thirty
decision-carrying cases are minutes; 543 would be a day.

## 7. The rule that makes it stick

**A case may not be recorded as passing in a test specification unless its mutation is registered.**
The detail block then says what makes it red, beside what makes it green — and a reviewer can
challenge the mutation, which is the part they cannot do today.

That would be one line in `CLAUDE.md` § Development rules and one section in
`config/agents/skills/testing/SKILL.md`, so the agents working inside the stack are held to the same
standard as the agents building it.

> **Not built, and nothing enforces it.** *Written 2026-10-09, A2 of the 2026-10-01 re-review.*
> `grep -ci mutation` was **0** in `CLAUDE.md`, **0** in `config/agents/skills/testing/SKILL.md`, and
> **0** in both `docs/TEST-SPEC-git-integration.md` and `docs/TEST-SPEC-openclaw-2026-9-1.md` — so
> not one registered case had its mutation in its detail block, which is the reviewer's only view of
> the experiment and the thing D2 below rests on. The sentence above is the intention. What holds
> today is weaker: the mutation is in `tests/mutations.json`, which a reviewer sees in the pull
> request's diff, and nowhere beside the case.
>
> *Measured again 2026-10-21.* `CLAUDE.md` and `SKILL.md` are still at 0. Three detail blocks now
> carry their registered mutation, written while answering that day's review: A4-6 and A13-8 in
> `docs/TEST-SPEC-git-integration.md`, and OC-60 in `docs/TEST-SPEC-openclaw-2026-9-1.md`. The other
> 29 non-exempt entries have theirs in the registry only. That is three cases done by hand, not the
> rule: nothing asks for the block, and nothing notices when one is missing. *The note said "31
> registered cases" when the registry held 32 non-exempt entries; N3 of the 2026-10-21 re-review.*

**Adopted as a block rather than a note** (D1), with the signal that would retire it written down in
§11 — because a rule whose cost nobody can demonstrate is a rule nobody can ever take back out. And
since the author writes their own mutation (D2), the detail block is not decoration: it is the only
point at which a second person sees the experiment at all.

## 8. Requirements

**Functional**

- **MU-FR1** A registry entry names case, file, `from`, `to` and the test that must fail.
- **MU-FR2** The runner applies one entry at a time, runs only the owning test file, and restores.
- **MU-FR3** A `from` that does not occur exactly once fails the run and names the entry, **unless
  `"all": true` declares that every occurrence is meant**. *Corrected 2026-10-21 -- this gave "exactly
  once" with no exception, while MU-35 is that exception.* The entry is refused and the rest still run;
  the run's exit status is non-zero.
- **MU-FR4** The run fails unless **the named test** fails, and **at least one** other test in the file
  must still pass. *Corrected 2026-09-30 -- this said "other tests in the file must still pass".* All of
  them passing is not the rule and never was buildable: a mutation often reddens a sibling that reads the
  same line, which is a fact about the file rather than a defect in the entry. A file holding a single
  test waives the rule entirely, because it reddens whole when that test reddens.
- **MU-FR5** The subject is restored on success, on failure, and on interrupt.
- **MU-FR6** The runner refuses **the entry** whose subject has uncommitted changes, and carries on
  with the rest. *Corrected 2026-10-21 -- this said it "refuses to start when the working tree has
  uncommitted changes to a subject", which §5 already contradicted and MU-7 holds the opposite of: a
  checkout with unrelated work in progress still runs every entry whose own subject is clean.*
- **MU-FR7** The report lists, per entry, the outcome, the case and the test that must fail, and ends
  every run with the gap: how many cases in the specification carry **no** entry. *Corrected
  2026-10-21 -- this said the report lists "the mutation" per entry. It prints the case and
  `mustFail`, as `VALIDATED A4-6  <mustFail>  (1 red, 0 green)`; the mutation is in the registry. The
  gap has been on every run since MU-60, and `--gaps` lists the cases.*

**Non-functional**

- **MU-NFR1 · It is a tool that is run.** A mutation registry nobody executes is the third copy of
  the mistake this milestone exists for. It runs in the milestone cycle, at the same point as the
  suite, and the gap it reports is computed, not counted: the specified case ids are read out of the
  `TEST-SPEC-*.md` tables and the registered ones out of `tests/mutations.json`. *Annotated
  2026-10-21.* The second half is built — MU-8, MU-36 and MU-60. **The first is not**: nothing but
  its own test file runs `tests/mutate.sh` — not `tests/run.sh`, not a script under `scripts/`, not the
  cycle in `HANDOFF.md` — so the registry runs when somebody remembers it. A traceability table that
  gives only *"the gap is computed, not counted"* for this id gives the half that holds; the 2026-10-09
  rewording in `TEST-SPEC-test-mutation.md` had dropped the other half as being "about when and not
  about what", and a requirement that is not met is kept and marked, not reworded until it is.
- **MU-NFR2 · Bounded.** Each test has a timeout and each spec run a budget; an entry that does not
  finish is **refused** rather than stalling the run, and the subject is restored. *Corrected
  2026-10-21 -- this said such an entry "fails". `failed` means the named test passed under the
  mutation; a run that did not finish measured nothing, and a test red only because bun timed it out
  is not an assertion failing. Agreed with the reviewer on 2026-10-01.*
- **MU-NFR3 · It never edits a test.** The registry mutates the subject under test and nothing else.
  A tool that can rewrite the assertions can make anything pass.

**A note on the MU numbers, 2026-09-30.** This branch and `feature/mutation-registry` each carried a
copy of the runner and its cases, and the numbering diverged: what was MU-16, MU-17 and MU-18 here is
MU-19, MU-21 and MU-34 on the copy that survives. The references above are to the surviving numbers.
Every case from MU-13 upward is specified in `docs/TEST-SPEC-mutation-runner.md`, on `main` since #18 merged --
written because a reviewer found the runner had cases in no specification at all, which made them
invisible to `--gaps`, the very report that counts coverage.

## 9. Milestones

**M-MU1 · The registry, the runner, and its own cases — built 2026-09-19.** `tests/mutations.json`,
`tests/mutate.sh`, and `tests/integration/m-mu.runner.test.ts`. The registry opens with the ten entries
the sample measured, so M-MU2 starts at ten rather than nought. What building it found is §13.

*Corrected 2026-09-30.* This said "sixteen tests covering MU-1 to MU-12", and neither number held: the
file carried 25 tests by the time it was reviewed, and MU-10 was specified and never built. **The runner
moved to `feature/mutation-registry` (#18), which merged into `main` on 2026-10-21** -- this branch
keeps the registry, the specification and this document, and dropped its own copy of the runner. The
reason was structural: both branches added the same four files, so `git merge-tree` gave add/add
conflicts on all of them, and resolving them toward this branch would silently have restored every
defect the other one fixed. That is why #18 had to merge first, and it did; this branch's merge of
`main` leaves the runner, its test file and the PROCEDURE identical to `main`'s.

**M-MU2 · Backfill, per milestone as each is next touched** (D3). Every case that carries a decision
gets an entry when its milestone is worked on again, and the ones deliberately exempt are listed with
the reason. **It is therefore never "done"**, which is the price of the speed, and MU-8's report is
what stops that from becoming invisible: the gap is printed on every run rather than discovered
later. The number, whenever it is first read, is a finding in its own right — it is the first time
anyone will know how many of 543 cases can be shown to fail.

**M-MU3 · The rule into the documents.** `CLAUDE.md` § Development rules and
`config/agents/skills/testing/SKILL.md`, plus the detail-block format in the test specifications.
**Not built** as of 2026-10-21: §7's note has the measurement, and D1's "a missing mutation blocks"
is enforced nowhere.

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

> *Not as built, 2026-10-21.* §7 is not built, so the mutation sits beside its case for three of the
> 32 non-exempt entries, written by hand (§7's note), and for the rest the reviewer sees it only in
> `tests/mutations.json` in the pull request's diff. The compensation that holds without anyone's
> attention is the mechanical one below.

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

> **True since 2026-10-09, and it was not before.** A2 of the 2026-10-01 re-review found this
> sentence describing something that did not happen: `--gaps` printed the gap, an ordinary run did
> not, and `--gaps` exits 0 with a gap of any size. So a reader took the backfill decision to be safe
> because the debt showed on every run, and it showed on no run anybody makes. The operator chose to
> make the sentence true rather than to narrow it: an ordinary run now ends with
> `gap: specified=... registered=... missing=... orphaned=... exempt=... -- mutate.sh --gaps lists
> them`, from the same computation `--gaps` uses, held by **MU-60**. It is informational and
> does not touch the exit status — the error is an orphan, which `--gaps` enforces. **D1's "blocks"
> is still not built**, and §7 now says so.

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

**The first would have condemned every case in the repository.** *Corrected 2026-10-09: what follows
was wrong about the cause, and #18 established the right one at `0018c6d` — it is the **agent's
shell** that changes what bun prints, not the bun version. MU-45 there measures the console with the
marker set and unset on one machine. The conclusion this paragraph draws is unaffected; its reason
was.* bun names a test on its own line
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

## 14. What the first backfill found, 2026-09-20

Twenty-one entries registered, `missing` from 241 to 230 — and **four defects in the runner**, none
of which reading it would have shown. Each was found by pointing it at a real case.

| | What it was | Found registering |
|---|---|---|
| **A spec with one test could never be validated** | The survivor rule — the named test fails and at least one still passes — has no survivor to ask for in a single-test file, so the runner called every honest entry against one a *broken file* | A4-6 |
| **An empty `to` shifted every later field** | Tab is IFS whitespace and bash collapses a run of it into one delimiter. A deletion mutation — which is what an empty `to` is — moved the `all` flag into `to` and the test name into the flag. It still ran, against the wrong strings, and reported a clean result | A3c-8 |
| **A rule asserted in several places could not be mutated at all** | "Exactly once" is there because nobody can say which occurrence carried the rule. Some rules are deliberately repeated — two ssh invocations in one script, three service declarations in `compose.yml` — and had no expressible mutation | A3c-8 |
| **The suite runner counted as an assertion** | *Half corrected 2026-10-09: `tests/run.sh` is a subject in its own right and `tests/mutate.sh` is not — the corrected guard refuses it by name, along with `tests/lib/` and `tests/mutations.json`, because a mutation of the runner is a mutation of the instrument. MU-28 holds both halves.* The guard refused any `file` under `tests/`. `tests/run.sh` and `tests/mutate.sh` are subjects in their own right; the rule is that the file is a **test**, not where it lives | A0-4 |

The second is the one worth dwelling on: **it did not fail, it answered.** The entry ran, matched
nothing meaningful, and produced a verdict — exactly the class of defect this milestone exists to
remove, inside the tool built to remove it, three days after it was specified. MU-19 holds it now.

The third became `"all": true`, which is a **declaration rather than a loosening**: the ambiguity the
"exactly once" rule guards against is *which* occurrence mattered, and an entry saying "every one of
them" has answered that question rather than dodged it. A0-4 is the counterpart — its `from` occurred
twice, once as a default and once in a flag handler, and the refusal there was right.

### What it cost, measured rather than predicted

Eleven entries in roughly forty minutes, including four reworks and four tool repairs. The second
data point after the sample of §12, and the shape holds: **the writing is minutes, the reworks are
where the time goes, and the reworks are also where the findings are.**

### And three entries needed a second attempt for the same reason

A3-1 mutated the per-repository keygen while its case exercises the shared one; A5-2 did the same in
the sample; A9-2 named a `return 2` that occurs three times. **The dominant error is still aiming at
the wrong site, and every one of them presents as a green run.** That is what MU-11 is for, and it
earned its place four more times today.

## 15. The second backfill, and the first real finding

**Thirty-three entries, as of `02c7e4b` plus the 2026-10-09 corrections: 32 validated, 1 exempt,
nothing failed, refused or unresolved,** measured with #18's runner at `b8b608b` against this tree:

```
validated=32 failed=0 refused=0 unresolved=0 exempt=1      exit 0
gap: specified=262 registered=33 missing=229 orphaned=0 exempt=1
```

*Every number here carries its tree, because the old sentence did not and went stale twice.* It read
"Thirty-two entries: 31 validated, 1 exempt. `missing` from 230 to 219", and B1 of the 2026-10-01
re-review found that neither figure matched anything: the reviewer's merged tree gave 271 missing and
the pull request description said 242. **`specified` is a count of rows in whichever `TEST-SPEC-*.md`
the tree holds**, so it changes when a branch is merged in, when a milestone adds cases, and when a
specification is corrected — this tree lost twelve when A1 deleted the duplicated MU rows. A number
without a tree beside it is not a measurement.

The entry count rose from 32 to 33 because B2 registered **A10-10**: A3-3's exemption had said the
rule under it needed no mutation, and the rule — `seed_known_hosts` refusing a host key GitHub does
not publish — is a refusing guard that §6 says does need one. A10-10 drives it with stubs and
validates `(1 red, 7 green)`.

### A4-10 could not be made to fail, and that was correct

The case asserts that a repository declared `access read` refuses a push *before any branch rule is
consulted*. Three mutations left it green — disabling the rule, forcing the value, and then a manual
run to see what actually happened:

```
pre-push refused: this push did not come through git-publish.
git-publish is the one way work leaves this stack: it reads the declaration, …
```

With the access rule gone the push is still refused — by a different rule — and the assertion was
`expect(r.output).toContain('read')`. **The four letters matched "reads the declaration."** The case
passed over a hook that had lost the rule it exists to protect, and would have kept passing.

It asserts the whole sentence now, `declared with access read`, plus the counterpart that the
git-publish gate is *not* what refused. The mutation then reddens it.

**This is the first case shown to be unable to fail *by this tool***, and it took three attempts and a
manual probe to establish. *Corrected 2026-09-30 -- it read "the first case in this repository shown to
be unable to fail", and that is false.* `22d23d5`, in this branch's own history and eleven days earlier,
records OC-12's case as vacuous; and when the sentence was written, this branch's own MU-6 backup case
could not fail either. The claim was about the tool and was written as a claim about the repository,
which is the kind of sentence a reviewer is right to check — which is exactly why *"a green run is a question"* is a rule and
not a preference. Any of the first two attempts, reported as a finding, would have been wrong for a
different reason each time.

### A3-3 cannot have a mutation, and says so

`A3-3 known_hosts is seeded with github.com entries` reads
`volumes/_git-secrets/known_hosts` — a file a start wrote days ago. Mutating the `ssh-keyscan` that
produced it changes nothing about what the case reads, so no mutation of the code can redden it.

That is §6's line, met in practice for the first time: the *test* asserts an **artefact**, so no
mutation of the code can redden it. The registry gained a form for it — `"exempt"` with a reason —
reported as `EXEMPT` and counted separately. **An exemption without a reason is refused**, because
"exempt" with nothing after it is how a gap becomes invisible, which is what the report exists to
prevent. MU-34.

*Corrected 2026-10-21, N3 of that day's re-review.* This subsection showed the reason as first
written, *"asserts the generated known_hosts, not the code that writes it"*, and called A3-3 an
assertion "not about decision logic". B2 of the 2026-10-01 re-review had withdrawn that: it read as
though the **rule** needed no mutation, when only this test cannot carry one. The rule under the
artefact — `seed_known_hosts` refusing a host key GitHub does not publish — is a refusing guard,
which §6 says does need one, and A10-10 is registered with it. The reason in `tests/mutations.json`
says both halves; it opens *"its test reads the generated volumes/_git-secrets/known_hosts, which a
start wrote days ago, so it cannot fail against the code"*.

### What still dominates

Of eleven entries in this batch, **six needed a second attempt**, and five of those six aimed at the
wrong site — a rule asserted in two places, a lookup rather than its use, a per-repository key rather
than the shared one. Every one presented as a green run.

The ratio has not improved with practice, and that is the finding worth carrying: **choosing the
mutation is the skilled part, and the tool cannot do it.** What the tool does is refuse to let a bad
choice masquerade as a discovery.
