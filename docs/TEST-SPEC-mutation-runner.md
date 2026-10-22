# Test specification — the mutation runner's own cases

The runner is a validator, so its cases are recursive by necessity: **it must be shown to fail when it
cannot run.** A mutation runner that silently skips would be the worst instance of the defect the whole
practice exists to remove, because it would be wearing the uniform of the cure. Every case below exists
because something answered quietly once.

**Where the rest is.** The practice — why mutation control, what the 2026-09-19 sample measured, the
four outcomes and the registry's contract — is `docs/PROCEDURE-mutation-control.md` beside this file.
MU-1 to MU-12 were specified before the work, in `docs/TEST-SPEC-test-mutation.md`, and listed here
as well so that `mutate.sh --gaps` could see them on a branch that did not carry that file: the report
reads case ids out of `TEST-SPEC-*.md`, and a case with no row is invisible to the tool that counts
coverage. That is why this file exists at all — a reviewer found that the runner's own cases, MU-13
upward, were in no specification. Since 2026-10-09 MU-1 to MU-12 are specified here only, because A1
of the 2026-10-01 re-review of #17 found the two copies disagreeing.

**The `MU-FR*` and `MU-NFR*` ids the traceability table below uses are defined in §8 of
`docs/FEATURE-test-mutation.md`, and only there.** The table's labels are short forms of that wording,
so the table reads on its own; where a label and §8 differ, §8 is right. *Rewritten 2026-10-21, R1 of
that day's re-review of #17, which brought the feature document into this tree. Until then this
paragraph said neither document was here and restated the wording for that reason — finding 9 of the
2026-10-01 re-review had named the dangling reference. Six labels were brought into line with §8 at
the same time: MU-FR3, MU-FR4, MU-FR6, MU-FR7, MU-NFR1 and MU-NFR2. MU-5, MU-11, MU-14 and MU-59 are in no
row of the table; that is older than this paragraph and recorded on #45, because which requirement
each serves is a judgement the table's author made for the others.*

**Level.** Every case here is integration: each one runs `tests/mutate.sh` as a process against a
throwaway directory holding one subject and a spec. A unit test of the loader would assert the shape of
a row, which is not what goes wrong; what goes wrong is what the whole tool answers.

*Corrected 2026-10-09, because the sentence above described a fixture that does not exist.* It said
"a throwaway git repository holding one subject and a two-test spec", and three things in that were
wrong. *(The quotation itself was wrong until 2026-10-15 — it read "a two-git repository", which no
version of this document ever said. N9 of the fourth re-review: a correction that misquotes what it
corrects leaves a reader unable to check either.)*
The shared spec holds **four** tests — `the policy is protected`, `the mode is 600`, `field A is
carried` and `field B is carried` — which is what gives every case a survivor to point at. The
directory becomes a **git repository only when MU-7 runs `git init`** in it, so cases before MU-7 and
cases after it see different state; the runner's uncommitted-changes check is skipped where there is no
repository, which is why MU-7 is the case that needs one. And **these do not use the fixture at
all**: MU-8's pair at `and it reads the real specifications of whatever branch it runs on` and `and
an entry no specification mentions is reported as orphaned` run `--gaps` against this checkout, MU-8's
`--root` scenario builds a tree of its own, and MU-59 reads this document and the test file from the
repository. Finding 9 of the 2026-10-01 re-review.

*Corrected 2026-10-21.* This said the count scenario ran against the checkout as well. It passes
`--root` with a fixture specification of its own, which is what lets it expect `specified=3` exactly.
Finding 13 of the local review of 2026-10-21, which also found the four other places in this file
where the stated data did not match the test: they are corrected where they stand, each marked.

**Runner and hosts.** `bun test tests/integration/m-mu.runner.test.ts`. Run on bun 1.3.13 as uid 501 on
macOS and on bun 1.4.2 as uid 0 on Linux, because two of these cases were green on one of those and red
on the other — see MU-25 and MU-26, where the cause was the uid. MU-41 is the one place a *version*
difference ever reached a verdict, and it is gone.

## Overview

| # | Sign | Case |
|---|---|---|
| **MU-1** | positive | A mutation that reddens its named test, with a survivor, is validated |
| **MU-2** | **negative** | A `from` that is not in the subject is refused and named |
| **MU-3** | **negative** | A `from` that occurs more than once is refused, unless `"all": true` says every one is meant |
| **MU-4** | **negative** | A mutation that reddens a sibling and not the named test is **failed**, not validated |
| **MU-5** | **negative** | A mutation that reddens every test is refused as a broken file, not credited as a control. **The missing-spec refusal in the same group is MU-58** |
| **MU-6** | positive | The subject is byte-identical after the run, whatever the outcome. **The interrupt half is MU-39** |
| **MU-7** | **negative** | It does not run over a subject with uncommitted changes |
| **MU-7** | **negative** | …and not over one reached **through a link** whose target has them, which is the SIGKILL backstop — *N7 of 2026-10-14* |
| **MU-8** | positive | `--gaps` counts specified cases against registered ones |
| **MU-8** | positive | …and reports a row whose id is not of the registered shape instead of passing over it — *N8 of 2026-10-14; the one repair whose control stayed green* |
| **MU-8** | positive | …and `--root` alone reads the registry of that tree, not this checkout's — *the local review of 2026-10-21, finding 11* |
| **MU-9** | **negative** | An entry whose `file` is a test is refused: the registry mutates subjects, never assertions |
| **MU-11** | **negative** | A mutation that reddens nothing is **unresolved**, never a finding |
| **MU-12** | positive | The named test red **and** a sibling green is the shape that validates |
| **MU-13** | **negative** | A run that validated nothing says so, rather than reporting success over an empty registry |
| **MU-14** | positive | A file holding a single test is validated when that test reddens: a survivor is required only where one can exist. **`--case` naming nothing is MU-55** |
| **MU-19** | **negative** | An empty `to` — which is what a deletion looks like — stays its own field on the wire |
| **MU-20** | **negative** | A spec path matching no file is refused, and the message is the baseline's — "did not run in". **The `no test executed` branch is MU-57** |
| **MU-21** | **negative** | The subject guard is about the file being a **test**, not about living under `tests/` |
| **MU-22** | **negative** | The named test is matched as a whole name, not as a substring |
| **MU-23** | **negative** | A backup that could not be taken stops the mutation, and the subject is untouched |
| **MU-24** | **negative** | A named test that is already red before the mutation validates nothing |
| **MU-25** | **negative** | An edit that leaves the subject unchanged is refused |
| **MU-26** | positive | A restore that failed keeps its backup, and says where it is |
| **MU-27** | **negative** | A sibling whose name ends with the named test does not stand in for it |
| **MU-28** | **negative** | The guard covers helpers, snapshots and every test-file shape — and still admits `tests/run.sh` |
| **MU-29** | **negative** | `--gaps` cannot answer quietly either |
| **MU-30** | **negative** | A spec that threw at import measured nothing, and is refused rather than failed |
| **MU-31** | **negative** | The spec is a path, not a substring filter over every test file |
| **MU-32** | **negative** | A registry the runner cannot read stops it, with a message and exit 2 |
| **MU-33** | **negative** | A baseline refusal takes its backup with it |
| **MU-34** | positive | An exemption is a registered decision: reported with its reason, counted apart, and subject to the same checks |
| **MU-35** | positive | `"all": true` is a declaration — every occurrence replaced, and a second one refused without it |
| **MU-36** | **negative** | `--gaps` prints each exemption's reason, and an orphaned entry is an error |
| **MU-37** | **negative** | The whole run is bounded, not only each test in it; a spec made to hang is refused and the subject goes back |
| **MU-37** | **negative** | …and an async hang that the bun timeout ends is refused, not counted as a kill — *the local review of 2026-10-21, finding 2* |
| **MU-37** | positive | …while a test that awaits and then fails its assertion is still validated |
| **MU-38** | positive | While an ordinary run is not slowed or refused by the bound |
| **MU-39** | **negative** | A signal stops the run rather than being acted on once the run is over |
| **MU-39** | **negative** | …and a restore that fails under the signal says so, rather than that the subject is back — *the local review of 2026-10-21, finding 9* |
| **MU-39** | **negative** | …and an earlier entry's failed restore does not make a later clean one read as failed — *the second pass over the 2026-10-21 repair* |
| **MU-40** | **negative** | A test that was skipped, todo or inside a skipped block is refused, never read as green |
| **MU-41** | positive | The describe path is the one bun prints, on either version; the reversed `classname` order is refused |
| **MU-41** | **negative** | …and part of a parent name is not a block of its own, even where the name carries the separator — *the local review of 2026-10-21, finding 4* |
| **MU-42** | positive | A case that is a describe block stands for the tests under it, and a name is still never matched by part of another |
| **MU-43** | **negative** | A subject `cmp` cannot open is not a mutation that landed |
| **MU-43** | **negative** | …and a write that fails partway is refused rather than run against — *the local review of 2026-10-21, finding 5* |
| **MU-43** | **negative** | …and so is one whose `from` the baseline removed, rather than an edit somewhere else |
| **MU-44** | **negative** | A baseline that did not load says so, rather than reporting the name as misspelt |
| **MU-45** | positive | The console differs between a person and an agent on one machine, which is why the record is read |
| **MU-46** | **negative** | A test name that resolves to more than one test is refused before the mutation, and the refusal names the remedy |
| **MU-47** | **negative** | A describe block whose name is also a test name is the same ambiguity, and naming it in full resolves it |
| **MU-48** | **negative** | A run the budget stops takes bun with it, and leaves no record behind |
| **MU-49** | **negative** | A signal while the subject is mutated takes bun with it, and nothing writes the record afterwards |
| **MU-49** | **negative** | …including a spec that **handles** TERM, which survived the signal path — *N6 of 2026-10-14* |
| **MU-50** | **negative** | `MUTATE_RUN_BUDGET_MS` is milliseconds: zero, a word and a unit are each refused with exit 2, while a whole number is accepted |
| **MU-50** | **negative** | …and a leading zero with them: bash reads `08` as octal, the comparison then fails open, and the run was unbounded — *N4 of 2026-10-14* |
| **MU-50** | **negative** | …and the bun `--timeout` is held to the same rule — *the local review of 2026-10-21, finding 6* |
| **MU-51** | **negative** | A signal during the baseline leaves neither the backup nor the record behind |
| **MU-52** | **negative** | The counts come from the JUnit record, so a line the spec itself prints cannot change a verdict |
| **MU-53** | **negative** | A subject is judged by where it leads: a link to a test file, a directory link into `tests/lib` and an upper-case test name are refused, and a link to an ordinary file is not |
| **MU-54** | **negative** | A spec that is red before the mutation is refused and its red tests are named, rather than the mutation being blamed |
| **MU-55** | **negative** | `--case` naming nothing is an error, not a run that found nothing |
| **MU-56** | positive | A mutation may span several lines: a `from` carrying a newline is applied byte-exactly, and a multi-line `from` that is absent is still refused |
| **MU-57** | **negative** | A mutation that stops the tests registering at all is `no test executed`, not a test that passed |
| **MU-58** | **negative** | A spec that does not exist is refused before anything is mutated |
| **MU-59** | positive | This document and the test file name the same scenarios, in both directions |
| **MU-59** | positive | …and the reader sees a test at column zero after a closing brace, and behind a modifier — *the local review of 2026-10-21, findings 7 and 14* |
| **MU-60** | positive | An ordinary run ends with the gap line, it agrees with `--gaps`, and it does not change what the run concluded |
| **MU-61** | **negative** | Two nested blocks with one name are refused, not credited to either — *N1 of 2026-10-14* |
| **MU-61** | positive | …and the remedy the refusal names resolves it |
| **MU-61** | **negative** | …and two blocks whose names join to the same text — `a > b`, and `b` inside `a` — are still two blocks — *the second pass over the 2026-10-21 repair* |
| **MU-61** | positive | …and naming the test in full still resolves that shape |
| **MU-62** | **negative** | A top-level block whose name repeats deeper is **that** block, so a mutation reddening the other one is `FAILED` and not `VALIDATED` |
| **MU-62** | positive | …and the nested one is still reachable by its path |
| **MU-62** | **negative** | A bare leaf name does **not** outrank a nested block of that name — *B1 of 2026-10-16, which the round before introduced* |
| **MU-62** | positive | …and the remedy resolves that shape too |
| **MU-62** | positive | …and a **full** name is still exact, so the repair did not take away the precedence `f1t` was given |
| **MU-62** | positive | …and a top-level block still holds the tests nested deeper inside it — *the local review of 2026-10-21, finding 1* |
| **MU-62** | positive | …and one holding only nested blocks keeps its precedence |
| **MU-63** | **negative** | A named test the mutation skips is refused, not `UNRESOLVED` — *the local review of 2026-10-21, finding 3* |
| **MU-63** | **negative** | …and a sibling reddening beside it does not turn that into `FAILED` |
| **MU-63** | **negative** | …and a name the mutation makes ambiguous is refused, not judged |

## Scenarios

One row per case above; one row per **scenario** here, because a case usually holds several and a
guard that only refuses is as useless as one that only permits. A reader cannot tell from a single
line which half was tested.

**This table is generated from the test file**, by `tests/scenario-table.ts`, and `MU-59` keeps it
that way: it runs the generator in `--check` mode, so a hand edit to the block below fails. It also
holds the two things a derivation cannot — that every test in the file carries an id, and that the
overview above names the same cases as the scenarios here.

*Until 2026-10-15 this said "generated" and there was no generator.* The table was written by hand and
`MU-59` compared it with the file in both directions, which is a check and not a derivation — N9 of
the fourth re-review, which offered the choice of correcting the word or committing the generator.
The generator is committed, because CLAUDE.md asks for a computed answer where there is one and the
scenarios *are* the test titles. What stays hand-written is the overview, whose positive/negative
label and reason are judgements, and the detail blocks. Renaming a test is now one file plus
`bun tests/scenario-table.ts --write`.

That is the answer to finding 9 of the 2026-10-01 re-review, which was eight drifts found by one
human comparison that nothing repeated.

<!-- scenario-table: generated by tests/scenario-table.ts; do not edit by hand -->
| Case | Scenarios, named as the tests are named |
|---|---|
| **MU-1** | the named test goes red and a survivor remains |
| **MU-2** | a `from` that is not in the subject is refused, and says the subject moved |
| **MU-3** | a `from` that occurs twice is refused, and says how often<br>and neither left the subject changed |
| **MU-4** | a red test that is not the named one is a failure, not a pass |
| **MU-5** | a mutation that reddens every test is refused as a broken file |
| **MU-6** | after a validated run, a failed run and an unresolved run alike<br>and the backup file is not left behind either |
| **MU-7** | a tracked subject with local changes stops the entry<br>an uncommitted edit behind a link stops the entry |
| **MU-8** | the report counts specified cases, registered ones and the difference<br>and a row whose id is not of the registered shape is reported, not passed over<br>and it reads the real specifications of whatever branch it runs on<br>and an entry no specification mentions is reported as orphaned<br>and --root alone reads the registry of that tree, not this one |
| **MU-9** | an entry naming a test file is refused before anything runs |
| **MU-11** | a mutation that changes nothing observable is unresolved<br>and it is neither validated nor failed, so nothing is concluded from it |
| **MU-12** | and a mutation that also reddens a sibling is still validated |
| **MU-13** | an empty registry is reported, not printed as four zeros |
| **MU-14** | but a file holding one test is validated when that test reddens |
| **MU-19** | a deletion mutation validates, and for its own reason<br>and an empty `from` is refused before anything is touched |
| **MU-20** | a spec that matches no file is refused, not called quiet |
| **MU-21** | a test file reached by a roundabout path is still refused<br>and a test file outside tests/ is refused too<br>while a script that merely lives under tests/ is a subject |
| **MU-22** | a sibling whose name merely contains the needle does not stand in<br>and the named test itself still validates |
| **MU-23** | an impossible backup refuses, and the subject is untouched |
| **MU-24** | a named test failing for its own reasons is refused<br>and a mustFail nobody answers to is refused as well |
| **MU-25** | an edit that leaves the subject unchanged is refused<br>the counterpart: an edit that does land is measured |
| **MU-26** | the backup survives and the run says where it is |
| **MU-27** | a sibling whose name ends with it does not stand in |
| **MU-28** | test infrastructure is refused whatever it is called<br>while a runner script under tests/ is still a subject<br>and a path that climbs out of the tree is refused |
| **MU-29** | a registry it cannot parse is an error, not a silence |
| **MU-30** | an import-time throw is refused, not called a failure |
| **MU-31** | a sibling file is not counted into the tally |
| **MU-32** | a normal run says so and exits 2 |
| **MU-33** | neither refusal path leaves a copy behind |
| **MU-34** | it is reported with its reason and counted apart<br>and the same checks apply to it as to everything else<br>and an entry that is both is a contradiction, not an exemption |
| **MU-35** | without it, a `from` that occurs twice is still refused<br>with it, every occurrence is replaced and the subject goes back<br>and a non-boolean `all` is an error rather than a guess |
| **MU-36** | an exemption is listed with its reason<br>and a registered case no specification mentions is an error |
| **MU-37** | a mutation that makes the spec hang is refused, and the subject goes back<br>and a spec that is already too slow unmutated is refused before anything is touched<br>and an async hang that the bun timeout ends is refused, not validated<br>and a test that awaits and then fails its assertion is still validated |
| **MU-38** | the counterpart: a normal entry still validates |
| **MU-39** | SIGTERM ends it mid-run, the subject goes back, and no verdict is printed<br>and a restore that fails under the signal says so, not that the subject is back<br>and an earlier failed restore does not make a later clean one read as failed |
| **MU-40** | skip, todo and a skipped block are all refused, not read as green |
| **MU-41** | the name bun prints is the name that matches<br>and the reversed order is refused, on either bun<br>and a parent whose own name carries the separator is still matched<br>and part of a parent name is not a block of its own |
| **MU-42** | the block name is enough, which is how A10-14 is written<br>and a name is still never matched by part of another |
| **MU-43** | a spec that removes its own subject is refused<br>and a write that fails partway is refused, not run against<br>and a from the baseline removed is refused, not written somewhere else |
| **MU-44** | an import-time throw before the mutation names the error |
| **MU-45** | the record is read because of that, not because of a version |
| **MU-46** | the same test name in two blocks is refused, and the remedy is named |
| **MU-47** | a block whose name is also a test name is refused too<br>and naming it in full resolves the ambiguity rather than only reporting it |
| **MU-48** | a run stopped by the budget leaves no bun behind, and no record either |
| **MU-49** | a TERM while the subject is mutated takes bun with it, and nothing writes the record afterwards<br>and a spec that handles TERM is still taken with it |
| **MU-50** | a budget of zero is refused before anything runs<br>a budget that is not a number at all is refused before anything runs<br>a budget carrying a unit is refused before anything runs<br>and a leading zero is refused, because it is read as octal<br>and so is one that would otherwise be read as a smaller number<br>and a whole number is still accepted, so the check refuses only what it should<br>and the bun timeout is held to the same rule |
| **MU-51** | TERM while the unmutated spec runs leaves no backup and no record |
| **MU-52** | a spec printing a pass line does not get a survivor it has not got<br>and a spec printing an error line is still read as the control it is |
| **MU-53** | a link to a test file is refused, and the refusal says where it led<br>a directory link into tests/lib is refused too<br>and an upper-case test name is refused, which was reasoned rather than run<br>the counterpart: a link to an ordinary file is still a subject |
| **MU-54** | a red sibling is named, and the mutation is not blamed for it<br>and a correct mutation over a red sibling is refused for the right reason<br>the counterpart: a green baseline is still measured rather than refused |
| **MU-55** | and a --case that matches nothing is an error |
| **MU-56** | a from carrying a newline is applied, and the subject goes back<br>and a multi-line from that is not there is still refused |
| **MU-57** | is refused as a run that did not happen, not as a test that passed |
| **MU-58** | and a spec that does not exist is refused before anything is mutated |
| **MU-59** | every scenario in this file has a row in the specification<br>and the specification lists no scenario this file does not have<br>and the table is what the generator produces, not a copy of it<br>and every test in this file carries an id<br>and the reader sees a test at column zero after a closing brace, and behind a modifier<br>and the overview names the same cases as the scenarios<br>and the comparison is over something, so an empty read fails |
| **MU-60** | an ordinary run ends with the gap line, and it agrees with --gaps<br>and the line does not change what the run concluded |
| **MU-61** | two nested blocks with one name are refused, not credited to either<br>and the remedy resolves it, which is what makes the refusal useful<br>and two blocks whose names join to the same text are still two blocks<br>and naming the test in full still resolves the joined shape |
| **MU-62** | a top-level block whose name repeats deeper is that block, not an ambiguity<br>and the nested one is still reachable by its path<br>a bare leaf name does not outrank a nested block of that name<br>and the remedy resolves the leaf shape too<br>and a full name is still exact, which is the rule f1t was given<br>and a top-level block still holds the tests nested deeper inside it<br>and a top-level block holding only nested blocks keeps its precedence |
| **MU-63** | a named test the mutation skips is refused, not unresolved<br>and a sibling reddening beside it does not turn that into failed<br>and a name the mutation makes ambiguous is refused, not judged |
<!-- end scenario-table -->

**What the blocks below do not carry, and that is a decision.** They are per group — the fixture and
the reasoning are shared, and repeating them for every scenario in the table above would bury the
differences. *(This gave a count, 103, while the file held 106; the table is the count now. Finding 13
of the local review of 2026-10-21.)* They do not carry
per-scenario steps or dependencies, which the reviewer also asked for. The steps for every scenario
here are the same three: write a registry, run `tests/mutate.sh` against the fixture, read the verdict
and the subject; the dependency is bun and a POSIX shell, stated under *Runner and hosts*. Where a
scenario needs more than that — a git repository, a signal, a private `TMPDIR`, the real checkout — the
block says so. If that turns out to be too thin for signing off, the per-scenario blocks are the next
thing to write and not a disagreement.

## Detail per group

The blocks below follow the `describe` groups in the test file, which is where the per-case premise,
given/when/then and covered requirements are written out in full. What is here is what a reviewer needs
in order to sign a case off or challenge it without opening the implementation.

### MU-1, MU-4, MU-5, MU-11, MU-12 — the four outcomes, on the same fixture

| | |
|---|---|
| **Premise** | Everything else rests on these four verdicts meaning what they say. A tool that answers `validated` when the mutation reddened a sibling, or `unresolved` when the entry is simply wrong, is worse than no tool: it produces a coverage number that cannot be questioned. |
| **Component** | `tests/mutate.sh` as a process, against a fixture tree. |
| **Test data** | `subject.sh` holding `POLICY="protected"`, `MODE=600`, `FIELDS="A B C"`, `UNUSED="spare"` and `TWICE="here"` **twice on purpose** — MU-3 needs a `from` that cannot be located uniquely, and a string that happens to be unique today would make that case pass for the wrong reason tomorrow. A spec with four tests over that file. The entry mutates `POLICY="protected"` to `POLICY="public"` and names `the policy is protected`. |
| **Expected** | `VALIDATED` with a red named test and a green survivor; `FAILED` when a sibling reddens and the named test does not; `UNRESOLVED` when nothing reddens, and never reported as a finding; a multi-line `from` accepted. |
| **Unhappy** | MU-11 is the one that matters. A green run reads as *"no case protects this rule"*, which is the discovery this tool exists to make — and in the 2026-09-19 sample that reading was wrong **four times in thirteen attempts**. So it is a question, not a finding. |
| **Covers** | MU-FR1, MU-FR2, MU-FR4. |

### MU-2, MU-3, MU-19, MU-23, MU-25, MU-32, MU-33 — what it refuses to do quietly

| | |
|---|---|
| **Premise** | Each of these was a silent pass once, and each would have produced a validated entry that measured nothing. |
| **Test data** | A `from` that is absent; one that occurs twice; an empty `to`; `TMPDIR` pointed at a directory that does not exist, so `mktemp` fails; an entry whose `to` equals its `from`; a registry file holding `[{"case": "A-1",` and nothing more; and a registry driven through both baseline refusals with `TMPDIR` pointed at an empty directory. |
| **Expected** | `REFUSED` with the reason named, a non-zero exit, and the subject byte-identical. MU-33 additionally requires the directory to be empty afterwards. |
| **Unhappy** | MU-26 is the counterpart to MU-33: when the **restore** fails the backup has to stay, so "delete it" cannot be the rule. Both are needed or one of them is satisfied by the wrong behaviour. |
| **Covers** | MU-FR3, MU-FR5, MU-FR7. |
| **What they found** | MU-19: tab is IFS whitespace, so an empty `to` collapsed the delimiter and shifted every later field — the `must` became empty and an empty needle matches any failing line, so the entry read VALIDATED over a mutation that had tested nothing. MU-23: with no `set -e`, a failed `mktemp` left `BACKUP` empty, `cp` failed, `SUBJECT` was set anyway, and `restore` requires a `BACKUP` — so the tracked file stayed mutated with nothing to put it back. MU-32: in bun 1.3.13 a program calling `require()` runs as CJS and an uncaught error there exits **0 with no message**, so `bun -e … \|\| exit 2` never fired and a malformed registry produced an empty row set, reported as "registry is empty". |

### MU-6, MU-39 — the subject goes back, and a signal is obeyed

| | |
|---|---|
| **Premise** | A tool that leaves a deliberately broken line in the working tree is worse than one that does not run. |
| **Test data** | The subject's SHA-256 before and after. *(This also named `git status --porcelain` for it, and no scenario reads that; corrected 2026-10-21, finding 13 of the local review.)* MU-39 uses a spec that sleeps 40 seconds **only once the mutation has landed**, so the baseline is quick and the signal arrives while the mutated subject is on disk. |
| **Expected** | Byte-identical after a validated run, a failed run and a stopped one. MU-39 additionally: stopped within 15 seconds of the signal, a non-zero exit, no verdict printed, and the message *"no entry was judged past this point, and the subject is back."* |
| **Why SIGTERM and not SIGINT** | A background command started by a non-interactive shell inherits SIGINT ignored, and a signal ignored on entry cannot be trapped — an INT-based case would measure bash rather than this runner. Ctrl-C in a terminal signals the whole foreground process group, so bun dies and the run ends; that path was never affected. A supervisor or a task runner sending TERM to the script was. |
| **Covers** | MU-FR5, MU-NFR2. |
| **What MU-39 found** | 2026-09-30, and it took carrying out MU-6's interrupt half as the **manual check** its specification calls for. The subject always came back and the exit code was always 143; the run did not **stop**. `out="$(run_spec …)"` put the run inside a command substitution and bash defers a trap until the current foreground command completes, so the signal was acted on after the spec had finished by itself — 40 seconds against a spec that sleeps 40, and the entry then printed `VALIDATED`, a verdict the run had not earned. Two seconds now. The 15-second bound in the case is between the two, so it says which behaviour is present. |
| **Widened 2026-10-21 for finding 9 of the local review** | The handler's last line said *"…and the subject is back"* whatever `restore` had just found. Measured before the repair with a subject whose copy back failed under TERM: exit 143, `could not restore …; the backup is kept at …` on one line, *"the subject is back"* on the next, and `POLICY="public"` still on disk. That last line is the one a supervisor reads. It now says *"the subject could NOT be put back — see the line above"* when the restore failed. *Test data:* `doomed/subject.sh`, the shared subject's content, and `spec/doomed-under-mutation.test.ts`, which removes `doomed/` once it reads `POLICY="public"` and then sleeps 40 seconds; TERM goes once the directory is gone. Removal rather than `chmod`, because root ignores a permission staging. *Expected:* non-zero exit, both failure lines, no *"and the subject is back"*, no `VALIDATED`, and the `lu-mutate.*` backup still in the scenario's own `TMPDIR`. The first MU-39 scenario is the counterpart: a restore that works still says the subject is back. *Control:* the message made unconditional again → this scenario red, the other green. |
| **Widened again by the second pass over that repair** | The repair above read the run's total of failed restores, so an earlier entry's failure made a clean restore under the signal print *"could NOT be put back — see the line above"*, pointing at a line about another file. Measured with two entries: the second subject was back on disk and the last line said it was not. The handler now compares with the count from before its own restore, and says when an earlier one failed: *"…and the subject is back; an earlier one could not be put back — see above."* *Test data:* entry `FX-1` on `fragile2/subject.sh`, MU-26's shape, so its restore fails and its backup stays; entry `FX-2` on the shared subject with `spec/calm-under-mutation.test.ts`, which sleeps 40 seconds once mutated; TERM goes when the shared subject reads `POLICY="public"`. *Expected:* both lines as above, no *"the subject could NOT be put back"*, the shared subject byte-identical. *Control:* the comparison back to the run's total → this scenario red, the other two MU-39 scenarios green. |

### MU-7, MU-9, MU-21, MU-28 — what may be a subject

| | |
|---|---|
| **Premise** | A tool that can rewrite the assertions can make anything pass; and restoration means putting back what was there, so it cannot run over somebody else's uncommitted work. |
| **Test data** | Refused: `tests/lib/helper.ts`, `spec/__snapshots__/x.snap`, `spec/x.test.tsx`, `spec/y_test.ts`, `spec/z.spec.js`, `tests/mutations.json`, and `spec/../../outside.sh`. Accepted: `tests/run.sh`. A tracked subject with a local edit, for MU-7. |
| **Expected** | Each refused entry named, exit non-zero, nothing run. `tests/run.sh` **not** refused. MU-7 refuses only the entry whose own subject is dirty. |
| **Unhappy** | MU-28's second half is the counterpart, and the reason the rule is not a prefix: restoring a blanket `tests/` refusal would take A0-4 with it, since `tests/run.sh` is a subject in its own right and nothing asserts against its contents. |
| **Widened 2026-10-15 for N7 of the fourth re-review** | The uncommitted-changes guard asked git about the path **as the registry wrote it**, not about where it leads. With `viaLink.sh -> src/real.sh` and an uncommitted edit in `src/real.sh`, the entry ran: the link has no changes. Nothing is lost on the ordinary path — the backup is of the current content and the restore puts it back — so what the defect costs is the **backstop the procedure names for SIGKILL**: a killed run leaves the target mutated and the next run must refuse rather than mutate on top of it, and it did not. One line, `$rel` for `$file`, which is the rule the rest of this group already applies. *Test data:* `viaLink.sh` → `src/real.sh`, committed, then an edit in the target only. The counterpart asserts the guard does **not** fire with the target clean, and asserts `UNRESOLVED` rather than `VALIDATED` — because the fixture spec reads `../subject.sh` while the entry mutates `src/real.sh`, so nothing it asserts changes. Expecting `VALIDATED` was this scenario's first reading and it was wrong about its own fixture. *Control:* the guard asked about `$file` again → 1 red. |
| **Covers** | MU-FR6, MU-NFR3. |

### MU-8, MU-29, MU-36 — the coverage report

| | |
|---|---|
| **Premise** | A hundred validated entries say nothing while three hundred cases carry none. The gap has to be a number, and the number has to be computed rather than counted by hand. |
| **Test data** | A fixture `docs/TEST-SPEC-fixture.md` holding rows for `FX-1`, `**FX-2**` (bolded, because the tables bold some ids) and `FX-3`, plus prose mentioning `FX-9` which must not count because it is not a row. A registry registering `FX-1` only; then one holding an exemption; then one whose case is in no specification. |
| **Expected** | `specified=3 registered=1 missing=2 orphaned=0`, exit 0. An exemption printed as `exempt:   <id>  <reason>`. An orphan reported and exit non-zero. A malformed registry an error rather than a silence. |
| **Unhappy** | Missing entries deliberately stay exit 0: a gap is the ordinary state of a registry being filled in. An orphan is not — it means a case was renamed or deleted and the entry outlived it, so the registry claims to cover something that is not there. |
| **Widened 2026-10-15 for N8 of the fourth re-review** | The Minor of 2026-10-01 — a row whose id has no trailing number, like a manual `A16-M1`, is reported rather than silently skipped — **was fixed in code and held by nothing**. The reviewer replaced its `console.log` with `if (false)` and MU-8, MU-29, MU-36 and MU-60 were all green: the one repair in the round whose control stayed green. *Test data:* `docs/TEST-SPEC-manual.md` with `FX-1` (counted), `FX-M1` and a bolded `FX-M2` (neither counted). *Expected:* both named with their file in the `not counted, their ids are not of the registered shape` line, and **neither in the `missing:` list** — because a reader comparing the number against the registry would otherwise read them as missing. Asserted relationally rather than as an absolute `specified=`, since the scenario above writes its own specification into the same root; expecting `specified=1` was this scenario's first version and it was measuring the other fixture. |
| **Covers** | MU-FR7, MU-NFR1. |
| **What MU-36 found** | Exemptions were counted as covered and their reason never printed — the one thing a reader can disagree with was the one thing hidden. |
| **Widened 2026-10-21 for finding 11 of the local review** | The registry defaulted to this checkout's **before** `--root` was read, so `--root D --gaps` compared this repository's registry with D's specifications, and an ordinary run would mutate D's files from the wrong registry's entries. It defaults after the arguments now. *Test data:* a tree of its own with `docs/TEST-SPEC-own.md` declaring `OW-1` and `tests/mutations.json` holding one exempt entry, `OW-2`, which nothing in that tree declares — so reading that registry shows as an orphan, and this checkout's registry cannot supply the name by accident. *Expected:* `specified=1 registered=1`, `orphaned: OW-2`, non-zero exit. The orphan scenario above is the counterpart: an explicit `--registry` still wins. *Control:* the default moved back above the argument loop → this scenario red with `specified=1 registered=0 missing=1 orphaned=0`, the other four MU-8 scenarios green. |

### MU-13, MU-14, MU-20, MU-24, MU-30, MU-31, MU-63 — a run that did not happen is not a result

| | |
|---|---|
| **Premise** | Five of the six blocking findings of the 2026-09-22 review were one omission wearing five coats, and the root is here: the spec was never run **unmutated**, so a test that is red for its own reasons — a stack that is down, a timeout, a flake — was credited to the mutation and any edit at all read VALIDATED. |
| **Test data** | An empty registry; `--case` naming an id that is not in it; a spec with no tests; a spec whose named test fails for its own reason (`expect('broken env').toBe('ok')`); a spec that throws at import; and a sibling file `x.test.tsx` beside `x.test.ts`, for MU-31. |
| **Expected** | Each refused with its own message and a non-zero exit — "registry is empty", "no entry for case", "no test executed", "already red before the mutation", "did not load", and for MU-31 a tally that counts one file rather than two. |
| **Covers** | MU-FR4, MU-FR7. |
| **What they found** | MU-24 subsumes "a `mustFail` nobody answers to": the baseline asks whether the named test exists, whether it ran, and whether it was green, so a typo, a rename or a `test.skip` is refused instead of leaving the run UNRESOLVED and exit 0. MU-30: bun 1.4.2 reports an import-time throw as `0 pass / 1 fail / 1 error`, so the tally is not empty and the run came back FAILED — saying the entry does not protect what it claims, when nothing ran. MU-31: a bare path is a substring filter over every test file under the root, so a sibling was counted into the tally and each run scanned `volumes/` as well. |
| **Widened 2026-10-21 for finding 3 of the local review: MU-63** | The baseline asks three things of the named test — does it exist, did it run, was it green — and the run after the mutation asked only whether it failed. So a named test the mutation skipped or stopped registering was simply not red: measured before the repair, `UNRESOLVED … nothing went red`, exit 0, and with a sibling reddening beside it `FAILED … 1 test(s) red but not 'the policy is protected'`, which tells the author the entry protects something else when its test never ran. A test generated from the subject's own content vanishes that way when the mutation removes what it was generated from. The mutated run now gets the baseline's questions: `none` and `ambiguous` are refused, **after** the *did not load* and *no test executed* checks, so those keep their own messages. *Test data:* `spec/skipped-when-mutated.test.ts`, whose named test is `test.skipIf(!s.includes('POLICY="protected"'))` beside `the mode is 600`; `spec/skipped-beside-red.test.ts`, the same plus `the policy line is there`, which the mutation reddens; `spec/doubled-when-mutated.test.ts`, holding `a > x` and, only under the mutation, `b > x`. *Expected:* each refused with *did not run under the mutation* or *resolves to more than one test under the mutation*, never `UNRESOLVED`, `FAILED` or `VALIDATED`. MU-1 is the positive counterpart and is deliberately not duplicated: a named test that runs both times and reddens is validated, and every `VALIDATED` in this file holds that. *Controls:* the `none` branch disabled → the first two red, and MU-30, MU-40 and MU-57 green, so the ordering keeps their messages; the `ambiguous` branch disabled → the third red alone. |

### MU-22, MU-26, MU-27 — matching a name, and the two versions of bun

| | |
|---|---|
| **Premise** | The verdict for an entry is "did *this* test go red". Everything about how that is read turned out to be either a regular expression or a property of the installed bun. |
| **Test data** | A spec holding `field A is carried` **and** `not field A is carried`, so a suffix match admits the wrong one. For MU-26, a spec that removes the subject's parent directory while it runs, so `cp` has nowhere to copy back to. |
| **Expected** | The named test's own verdict, by exact name; and a restore that failed keeping its backup and saying where it is. |
| **Covers** | MU-FR4, MU-FR5. |
| **What they found, and why the hosts are named** | `bun test -t` is a regular expression matched anywhere in the full name, so a name carrying `(`, `[`, `+` or `*` was refused as "did not run" and a sibling containing the named test dragged its own verdict in; anchoring does not settle it, because `-t` matches the describe and test names joined by a space. Reading the named test's line off the console does not settle it either: **with `CLAUDECODE` set, bun names only the failing tests; without it, passing ones get a line too** — measured on a two-test file, both ways, on 1.3.13 and 1.4.2 — so the reviewer's suggested repair worked in a plain shell and refused 18 of 41 entries in an agent's. *Corrected 2026-10-01: this said the difference was between the two bun versions. The measurement behind that ran 1.3.13 in an agent shell and 1.4.2 in a container without one, so it compared two things and named the wrong one. The corrected reason is the stronger one — a person and an agent get different consoles on the same machine, which does not expire with the next release. MU-45 measures it in place.* The verdict comes from `--reporter=junit`, which both versions write and which names every case exactly, with a `<failure>` child for the red ones. MU-25 and MU-26 staged their failures with `chmod`, which **root ignores**, so both were red in the container and on CI while the runner was working as intended; they stage without permissions now. |
| **Corrected 2026-10-21 for finding 10 of the local review** | MU-26's spec removed `fragile/` **unconditionally**, so the directory was already gone after the baseline: the write failed, the entry was refused as *the mutation did not reach*, and the failing restore ran with nothing mutated. The assertion held, and the path the case is named for — the restore after a mutated run — was never reached; it duplicated MU-43. The spec now removes the directory only once it reads `POLICY="public"`, and the case asserts that the mutated run was measured — `VALIDATED FX-1` and no *did not reach* — beside the kept backup. *Controls:* the unconditional removal restored → red, on *did not reach*; `restore` made to delete the backup when the copy back fails → red, on the empty `TMPDIR`. |

### MU-40 to MU-45 — what the JUnit record means

| | |
|---|---|
| **Premise** | Reading the record instead of the console removed a dependence on which shell the run happened in, and introduced a smaller family of its own: four things in that record mean something other than what the first reader took them for. One of the four is older than the reader, and one is about a tally nobody read. |
| **Test data** | A spec whose named test is `test.skip`, one where it is `test.todo`, one where it sits under `describe.skip`. A spec with `describe('outer', …)` holding `describe('inner', …)`, and a second parent literally named `a & b > "c"` holding `deep` — the separator, an ampersand and quotes inside one segment. A block named `A10-14 a checked-in template is not a credential` whose tests are generated from `['.env.example', '.env.sample']`, which is the shape of the two entries on #17 that could not be registered. A spec that reads its subject and then removes it, so the baseline is green and `cmp` has nothing to open. A spec that throws at import. And one two-test file run twice, with `CLAUDECODE` set and unset. |
| **Expected** | Each skipped form refused as "did not run"; the printed path validating and the reversed one refused; the block name standing for its loop-generated tests while `reaches the remote` matches nothing; `the mutation did not reach sub/subject.sh`; `did not load before the mutation`; and the green test named for a person and not for an agent. |
| **Unhappy** | MU-42's second half is what keeps the block rule from undoing MU-27: a block name stands for the tests under it, and segments are still compared whole. MU-45 is a measurement rather than a guard — it is in the suite so the claim in the procedure cannot go stale unnoticed, which is exactly how the version claim it replaces survived for two days. |
| **Covers** | MU-FR4, MU-FR7, MU-NFR3. |
| **Implemented by** | `tests/integration/m-mu.runner.test.ts`. |
| **What they found** | All six reproduced against `dab826e` first. The skipped forms came back `UNRESOLVED`, **exit 0** — finding 8 of the first review again, for the variant the refusal message itself names. `classname` is innermost-first and bun 1.3.13 escapes it twice (`inner &amp;gt; outer` for `outer > inner`), which was the last place a verdict depended on the version. `cmp` answers 2 for a file it cannot open and only 0 refused. And the baseline reported a spec that threw at import as a misspelt name, which sends the author to the name instead of the error. |
| **Widened 2026-10-21 for finding 4 of the local review: MU-41** | A block prefix was found with `path.startsWith(want + " > ")`, a comparison of strings, so `a & b` matched the path `a & b > "c" > deep` although no block is called `a & b` — the separator inside one segment is exactly what reaches it. Measured before the repair: `VALIDATED FX-1  a & b  (1 red, 1 green)`, exit 0, **a false VALIDATED** for a name that is no block and no test. The prefix is compared segment by segment now. *Test data:* the existing `spec/nested.test.ts`, entry `mustFail: "a & b"`. *Expected:* *did not run in*, no `VALIDATED`, non-zero exit. The scenario before it is the counterpart: the whole parent name `a & b > "c" > deep > quoted parents` still validates. *Control:* the string comparison restored → this scenario red, the other five MU-41 and MU-42 scenarios green. |
| **Widened 2026-10-21 for finding 5 of the local review: MU-43** | The writer's exit status was discarded with `\|\| true`, and `cmp` only proves the file changed, not that it holds the mutation. Two ways that gave **a false VALIDATED**, both measured before the repair. A write that fails partway: `ulimit -f 4` caps a file at 4096 bytes (macOS bash 3.2 and Linux bash 5.2 as root alike), `writeFileSync` truncates the subject, writes 4096 bytes and reports `EFBIG` — and the runner ran the spec against the truncated file and printed `VALIDATED` for an entry whose whole write gives `UNRESOLVED`. And a `from` the spec removed during the baseline: the count is taken before the baseline, the writer then got −1 from `indexOf`, and `slice(0, -1) + to` wrote a different edit, which was measured and credited. The writer refuses at −1 now and its failure is read, with its reason appended to *the mutation did not reach … whole*. *Test data:* `big/subject.sh`, 1536 bytes — `#!/bin/sh`, `PAD="` and 1500 `a`, then `POLICY="protected"` **last**, so a truncation removes it — with `from: "a"`, `to: "aaa"`, `"all": true`, run under `ulimit -f 4`; and `moving/subject.sh`, with a spec that on its first run only (a marker file) rewrites `POLICY="protected"` to `POLICY_GONE`. *Expected:* refused with `EFBIG`, and with *the from is no longer in the subject*; no `VALIDATED`; the subject byte-identical afterwards. *Controls:* the exit status ignored again → both red with `VALIDATED`, which also shows the halves need each other — with the −1 check in place and its exit ignored, `cmp` still passes, because the baseline had already changed the file; the −1 check removed alone → the second red with `VALIDATED`. **MU-43's own scenario** is now refused one step earlier, by the writer, which cannot read a subject that is gone; the `cmp` check stays behind it and is reachable only by a race. |

### MU-34, MU-35, MU-37, MU-38 — what came from #17

| | |
|---|---|
| **Premise** | The registry on `feature/test-mutation-control` needs `all` and `exempt`, which only that branch's older copy of this runner had. Both branches add the same four files, so leaving them there meant an add/add conflict whose resolution could silently restore every defect fixed here. |
| **Test data** | An exemption with a reason; one with a newline in the reason; one with an empty case; one carrying both an exemption and a mutation; a `from` occurring twice with and without `"all": true`; a non-boolean `all`; a spec made to hang by the mutation; and an ordinary entry, for MU-38. |
| **Expected** | An exemption reported as `EXEMPT` with its reason and counted apart; every malformed shape exit 2; `"all": true` replacing every occurrence with the subject restored; a hang refused with the budget named; an ordinary entry still validated. |
| **Unhappy** | MU-38 is the counterpart that mattered while building MU-37: a budget that ended a healthy run would make every entry REFUSED, which is the direction this tool must never fail in. |
| **Covers** | MU-FR3, MU-FR4, MU-NFR2. |
| **What they found** | The exempt path returned **before** the loader's checks, so a newline in the reason produced a phantom entry, an empty case gave `REFUSED   -  no such subject: -`, and an entry carrying both was silently exempted with its mutation never run — a case that stopped being proven, with nobody deciding that. And MU-10 had been specified since 2026-09-19 and never built: `bun --timeout` ends a test that awaits too long and cannot end one that never yields, so `while (true) {}` hung the runner for ever, while an async hang came back **validated** because bun reddened the test and the run carried on. |
| **Corrected and widened 2026-10-21 for finding 2 of the local review** | The row above says an async hang came back `validated` and the budget ended that. **The budget never saw it**: the per-test limit `mutate.sh` hands bun — `--timeout`, 120 seconds unless set — fires before the 300-second run budget, bun writes the test red with `<failure type="TimeoutError"`, and that was counted as a kill. Measured before the repair with a 3-second limit and a named test that awaits forever under the mutation and asserts nothing about the subject: `VALIDATED FX-1  the policy is protected  (1 red, 1 green)`, exit 0. The reader now marks a red that is only a timeout as `hang`, and that is refused — *was stopped by the bun timeout under the mutation, not by an assertion*. bun 1.3.13, 1.4.2 and 1.4.3 all write `type="TimeoutError"`, measured on each. One red by assertion in a block is still a kill. *Test data:* `spec/async-hang.test.ts`, `await new Promise(() => {})` once it reads `POLICY="public"`; and as the counterpart `spec/async-assert.test.ts`, `await Bun.sleep(50)` and then the POLICY assertion — an awaiting test is not a hanging one. Both under `--timeout 3000`. *Controls:* the reader's `hang` collapsed into `fail` → the hang scenario red with `VALIDATED`; the verdict's `hang` branch disabled → red with `FAILED`. The counterpart green both times. |

### MU-46, MU-47, MU-61, MU-62 — a name that resolves to more than one thing

| | |
|---|---|
| **Premise** | Finding 1 of the third re-review, then **N1 of the fourth**, which is the same defect one level up. A `mustFail` name is matched against the record, and the predicate was widened on purpose so that a `describe` standing for generated tests counts as one thing (MU-42). What it did not do is ask **what** the name resolved to, so "red if any is red" credited whichever test happened to redden. On the leaf side two blocks could share a test name; on the block side a block was identified by *the name the caller typed*, so two different blocks collapsed into one. |
| **What was measured, and it is the worst shape a verdict can take** | At `0018c6d`, leaf side: `VALIDATED FX-1  rejects a bad value  (1 red, 2 green)`, exit 0, with the policy test green throughout. At `b8b608b`, block side, reproduced here before the repair: `VALIDATED F1N  checks  (1 red, 2 green)`, exit 0, same story. **A false VALIDATED is the one verdict this tool must never print**, because every case that relies on the registry then rests on it. |
| **Component** | `named_state` in `tests/mutate.sh`, driven through the whole runner against throwaway fixtures. |
| **Test data, both sides** | Four specs, each with a subject carrying `POLICY="protected"` and `MODE=600`, and each mutation `MODE=600` → `MODE=777`, so the named thing is about POLICY and the mutation is about MODE — the mismatch is what a false VALIDATED hides. `spec/samename.test.ts`: `policy > rejects a bad value` and `mode > rejects a bad value`. `spec/blockandtest.test.ts`: a `describe('rejects a bad value')` and a top-level `test` of the same name. `spec/f1n.test.ts`: `policy > checks > p` and `mode > checks > m`, the reviewer's shape. `spec/f1t.test.ts`: a **top-level** `describe('checks')` beside `mode > checks`. `spec/nl.test.ts`: `policy > checks > p` beside a nested **test** `mode > checks` — a leaf and a block of one name, which is `f1n`'s shape with one side changed to the kind the leaf branch read as exact. `spec/tl.test.ts`: a **top-level** `test('checks')` asserting `MODE=600`, beside `policy > checks > p` asserting POLICY, so a leaf whose own full name is `checks` still wins and the mutation it names is the one that reddens. What must still work: `mode > checks` (in both `f1n` and `nl`), `rejects a bad value > under the block`, and `tl`'s top-level `checks` resolve, so the remedy the refusal offers is shown to be a remedy. |
| **Expected** | Refusal naming `resolves to more than one test` for the three ambiguous shapes, with the remedy quoted; `VALIDATED` when the full path is given. For `f1t`, where the top-level block's own full name **is** `checks` and no spelling is more precise, an exact path takes precedence: the entry means that block, the mutation reddens the other, and the verdict is `FAILED  …  1 test(s) red but not 'checks'`. |
| **Why precedence rather than a refusal for `f1t`** | The reviewer left the choice open. A refusal there would have to say "this is ambiguous and there is nothing you can write", which leaves the author no way to express either block; precedence leaves both expressible — `checks` for the top-level one, `mode > checks` for the other. |
| **The sentence that used to stand here was wrong, and it was wrong in the direction that costs most** | It read *"and still cannot produce a false VALIDATED, because the named block either reddened or it did not"* — an argument about the **block** branch, offered as if it covered the whole precedence rule. It did not cover the leaf branch, where `exact` was set whenever a leaf's *own* name matched, and there the rule produced exactly the verdict the sentence ruled out. `B1` of the fifth re-review, found by the reviewer at `59272f5` within one round of the sentence being written. What makes the claim true is narrow and worth stating as such: precedence is earned by a **full** name — a whole describe chain, or a top-level name that is already whole — and a partial match of any kind, leaf or segment, earns none. Then two things that a name cannot tell apart are still two things, and the refusal fires. |
| **What the leaf branch was measured doing** | `spec/nl.test.ts`, entry `mustFail: "checks"`, mutation `MODE=600` → `MODE=777`: **`VALIDATED FX-nl  checks  (1 red, 2 green)`** at `59272f5`, with `policy > checks > p` green throughout — and `REFUSED … name it in full` at `b8b608b`, before the precedence existed. A repair that reintroduces a defect an earlier revision did not have is the argument for the control column below. |
| **What it found** | Green, 11 scenarios. Eight found the two ambiguity defects they were written for. The three added on 2026-10-20 found the third, `B1`: the leaf-side precedence, which the reviewer reproduced at `59272f5` and which no scenario then held — the eight were green across it, because none of them put a leaf and a block of one name in the same spec. MU-42 is the positive counterpart for the widened predicate and is deliberately not duplicated here: if a repair had closed the ambiguity by narrowing back to exact leaf names, MU-42 would be red. It is green, and all 91 earlier MU scenarios stayed green across all three repairs. |
| **Not asserted, because it cannot be** | That the refusal happens *before* the mutation rather than after. A test comparing the subject's hash after the run was written and the control removed it: it was green in both worlds, because every path restores the subject, so the hash cannot tell a baseline refusal from a validated entry. The message is the evidence, and MU-33 holds the restore itself. |
| **Controls** | The leaf identity reverted to the typed name → the leaf scenarios red. The block identity reverted to `"block@" + want` → MU-61 red, printing the false `VALIDATED` again. The exact-path precedence removed → MU-62's first scenario red, refusing where it should resolve. Each of the five MU-62 scenarios was then reverted against on 2026-10-20, one expression at a time, and each reddened **only itself**: `exact = full === want` → `exact = true` reddens the `nl` negative with the false `VALIDATED` the reviewer measured; → `exact = false` reddens the `tl` positive; `exact = true` dropped from the path branch reddens the `f1t` negative (and MU-60, which reads this repository's own registry); and `|| full === want` dropped from the leaf branch reddens the `nl` resolution, which is the one scenario no `exact` change can touch, because a single hit is a single identity whatever its rank. That last one is why the column is worth filling in per scenario rather than per case: two of the five are held by a different expression than the one the case is named after. |
| **Implemented by** | `tests/integration/m-mu.runner.test.ts`. |
| **Covers** | MU-46, MU-47, MU-61, MU-62, MU-FR4. |
| **Widened 2026-10-21 for finding 1 of the local review** | Precedence was decided from a test's **direct** parent, so for `checks` the test `checks > direct` was exact and `checks > sub > nested` a mere segment match, and the filter kept only the first. Measured before the repair: `spec/f1d.test.ts` — `checks > direct` (POLICY), `checks > sub > nested` (MODE) and `mode > checks > m` (FIELDS) — gave `FAILED FX-1  1 test(s) red but not 'checks'` though the entry's own block had reddened; and `spec/f1o.test.ts` — a top-level `checks` holding only `sub > p` (MODE), beside `mode > checks > m` (POLICY) — gave `REFUSED … resolves to more than one test; name it in full`, for a name that already is the full name. Neither is a false VALIDATED; both are wrong. A whole name is now any block the test sits in, at any depth, whose path from the top **is** the name — the rule stated under *The sentence that used to stand here was wrong*, applied to blocks as it was to leaves. Both new scenarios expect `VALIDATED FX-1  checks`; the `f1t` negative is their counterpart and stayed green. *Control:* exactness restored to the direct parent only → both new scenarios red with the messages above, every other scenario of MU-46, MU-47, MU-61 and MU-62 green — twelve, measured again after the second pass. |
| **Widened again by the second pass over that repair** | Identities were the joined path, so a block literally named `a > b` and a block `b` inside a block `a` were both `block@a > b`: one thing, never ambiguous, and *red if any is red* credited the nested one. Measured at this branch's head and after the repair above alike: `spec/joined.test.ts` — `a > b > p` (POLICY) beside `a` › `b` › `m` (MODE) — entry `a > b`, mutation on MODE, gave `VALIDATED FX-1  a > b  (1 red, 2 green)`, exit 0, with `p` green: **a false VALIDATED**, N1's defect reached through the separator inside a name, which MU-41 already shows can be there. An identity is the segment list now, serialised, so the two are two things and the refusal fires. The counterpart is `a > b > m`, which names one test only and validates. *Control:* identities back to the joined string → the refusal scenario red with that `VALIDATED`, the counterpart green. |

### MU-48 to MU-51 — the bound and the signal reach bun, and the budget is a setting

| | |
|---|---|
| **Premise** | Finding 2 and finding 4 of the third re-review. `( … bun test … ) &` put a **subshell** between the runner and bun, so `$!` was the subshell and neither the budget nor the signal handler reached the process doing the work. And the budget itself is a setting that could be wrong in three ways, two of them silent. |
| **What was measured** | At `0018c6d`, a 3000 ms budget against a mutation that makes the named test spin: `REFUSED … did not finish`, the subject restored — and `bun test` still at **98.7% CPU five seconds later**. The suite's own MU-37 and MU-39 left three such processes behind on every run. **The sharpest consequence is not the CPU**: the orphan still holds `--reporter-outfile`, so it writes the record *after* the handler removed it — `lu-mutate-junit.XXXXXX` reappeared in `TMPDIR` eight seconds after the runner had gone, and that file is where every later entry reads its verdict. For the budget: `5m` gave an arithmetic error on every poll, **no bound at all**, and still printed `VALIDATED` with exit 0 — a verdict from a run nothing was watching; `abc` killed the runner with `unbound variable`, no report, and left two temporary files behind; `0` refused every entry, which is wrong but visible. |
| **Component** | The spawn and the budget poll in `tests/mutate.sh`, and its TERM handler. |
| **Test data, both sides** | Specs named for what they do: `spins-when-mutated` runs `while (true) {}` once the mutation is applied, for the budget (MU-48); `slow-when-mutated` sleeps 8 seconds once it is applied and `slow-always` sleeps 8 seconds in the baseline too, so the signal lands at both stages (MU-49, MU-51). *(This said both `slow-*` specs spin; they sleep. Corrected 2026-10-21, finding 13 of the local review.)* The three bad budgets are **the reviewer's own values**, kept rather than invented, so his reproduction and this case measure the same things: `5m`, `abc`, `0`. What must still be accepted: a plain whole number, so the check refuses only what it should. The signal scenarios send TERM while the subject is mutated and while the unmutated spec runs. |
| **Expected** | No `bun` process left behind, no `lu-mutate*` file in `TMPDIR` afterwards, the subject restored, and no record written after the handler ran. Each bad budget refused **before anything runs**; a whole number accepted. |
| **What it found** | Green, 9 scenarios. The three bad-budget titles are written out rather than looped **because `MU-59` compares this document with the test file and a title built by interpolation cannot be compared** — a constraint the drift check imposes on how cases are written, which is worth knowing before adding more. |
| **What it still does not reach, and it is in the backlog** | A process the **spec itself** started. The subject is `exec`ed inside the subshell, so the signal reaches bun; a grandchild of bun needs a process group. Recorded in `BACKLOG.md` — which N3 of the fourth re-review found was not true when first claimed, and now is. |
| **Controls** | The `exec` removed, restoring the subshell → the orphan scenarios red. Each budget check removed in turn → its own scenario red, and the whole-number counterpart stays green. |
| **Implemented by** | `tests/integration/m-mu.runner.test.ts`. |
| **Widened 2026-10-15 for N4 and N6 of the fourth re-review** | **N4:** `08` and `09` are all digits, so they passed the character check — and then `(( RUN_BUDGET_MS <= 0 ))` raised `value too great for base`, a failed `(( ))` returns 1, and the `if` read that as false. The budget was accepted and **nothing was bounded**: the reviewer killed a spinning entry from outside after 246 arithmetic errors with no verdict, and a healthy entry printed `VALIDATED` with three errors on stderr. `010` got through as octal 8 — a budget asked for as 10 ms was 8 ms. A leading zero is now refused rather than normalised with `10#`, because the string means two different things to two readers; plain `0` is left to the comparison so that branch stays live. **N6:** the signal path sent TERM and nothing more, while the budget path sends TERM, waits and sends KILL, so a spec with `process.on("SIGTERM", () => {})` survived it — exit 143, subject restored, bun alive, and the record written back nine seconds later. The fixture is `slow-when-mutated` with a handler added, so the handler is the only difference between the two scenarios. |
| **And closing N6 exposed a race in the fix itself** | The first repair signalled `$CHILD_PID` only, and `bun … &` and `CHILD_PID=$!` are two statements: a signal arriving between them found the variable empty or holding the previous entry, so nothing was signalled and bun ran to completion — the same outcome through a different door. It failed about one run in five that way, with `left=[lu-mutate-junit.XXXXXX]` and the subject correctly restored. `interrupted` now signals every background job via `jobs -p`, which covers the window because it lists what the shell actually started. Five consecutive clean runs after. A process the **spec** itself started is still out of reach and is in `BACKLOG.md`. *Controls:* the KILL removed → the handler scenario red; the leading-zero refusal removed → its two scenarios red, with the whole-number counterpart green. |
| **Covers** | MU-48 to MU-51, MU-FR5, MU-NFR2. |
| **Widened 2026-10-21 for finding 6 of the local review: MU-50** | `--timeout` went to bun unchecked. With `5m` bun exits at once with `Invalid timeout` and writes no record, and every entry was refused as *renamed, skipped, or misspelt* — measured — which sends the author to the name. It is held to the budget's rule now: a whole number above zero, else exit 2 before anything runs. *Test data:* `--timeout 5m` after the `--timeout 30000` every scenario passes, with a private `TMPDIR`. *Expected:* exit 2, the message naming `'5m'`, no *did not run in*, the `TMPDIR` empty and the subject unchanged. The positive counterpart is every other scenario in the file, each of which passes `--timeout 30000`. *Control:* the check disabled → this scenario red, the other six MU-50 scenarios green. |

### MU-52, MU-53, MU-54 — the numbers come from the record, and the subject is where it leads

| | |
|---|---|
| **Premise** | Findings 6, 7 and 5 of the third re-review. `tally` matched `^ *N pass|fail|error$` over combined stdout and stderr — **and a test can print such a line**. A subject could be a symlink, so what was judged and what was mutated were two different paths. And a spec that was already red before the mutation had the mutation blamed for it. |
| **What was measured** | At `0018c6d`: a two-test spec where both redden under the mutation, with one test doing `console.log(" 3 pass")`, printed `VALIDATED FX-6a  the policy is protected  (2 red, 3 green)`, exit 0 — **a false VALIDATED produced by the subject under test**, which is the worst shape a measurement can take. A test doing `console.log(" 1 error")` printed `REFUSED … did not load before the mutation — 1 error(s)`. |
| **Component** | `counts` and `named_state` reading `<testsuites tests= failures= skipped=>`; the subject resolution; the baseline check. |
| **Test data, both sides** | For MU-52: specs printing ` 3 pass` and ` 1 error` from inside a test, which is the only way to prove the numbers cannot come from the console. For MU-53: `alias-to-spec.sh` → the spec file, `lnk/helper.ts` → `tests/lib`, `UPPER.TEST.ts` by name — each must be refused and the refusal must say **where it led**, not merely that it was odd — and `alias-to-plain.sh` → an ordinary file, which must still be accepted, so the guard is not "refuse every link". For MU-54: a spec with a red sibling before any mutation, and a correct mutation over that red sibling, which must be refused *for the right reason*; plus a green baseline, which must be measured rather than refused. |
| **Expected** | The counts taken from the record in every case; the console-printed lines ignored for counting while the error signal still has to agree with a record showing nothing ran. Links and the upper-case name refused with the destination named. A red baseline refused and named, never blamed on the mutation. |
| **What it found** | Green, 11 scenarios. The upper-case name was *reasoned* rather than run in the earlier round and is now run, which the case says of itself. MU-30 and MU-44 are the counterparts for the record-reading and are deliberately not duplicated. |
| **Controls** | The console `tally` restored → MU-52 red with the false `VALIDATED` again. The link resolution removed → MU-53's three refusals red, the ordinary-link counterpart green. The baseline check removed → MU-54 red. |
| **Implemented by** | `tests/integration/m-mu.runner.test.ts`. |
| **Covers** | MU-52, MU-53, MU-54, MU-FR4, MU-NFR3. |

### MU-55 to MU-60 — what the run says about itself

| | |
|---|---|
| **Premise** | The remaining findings of the third re-review and the author's own additions: a `--case` that matches nothing printed a clean report, a mutation spanning several lines could not be expressed, a mutation that stops the tests registering read as a test that passed, a missing spec was discovered after the subject had been mutated, this document and the test file could drift apart unnoticed, and the gap line was documented but only printed with `--gaps`. |
| **Component** | The argument handling, the mutation application, the report, and the drift check — which reads **this repository** rather than a fixture, as MU-8's `--gaps` scenarios do. |
| **Test data, both sides** | A `--case` naming an id no registry row carries, which must be an error rather than an empty success. A `from` carrying a newline, applied and then taken back out — with the counterpart of a multi-line `from` that is **not** present, which must still be refused, so the feature is not "accept anything multi-line". A spec that registers its two tests only while the subject still carries `POLICY="protected"`, so under the mutation nothing registers at all. *(This said the mutation leaves `while (true) {}` at module scope, which would hit the budget instead; corrected 2026-10-21, finding 13 of the local review.)* A spec path that does not exist, which must be refused **before** anything is mutated. For MU-59: this document and `tests/integration/m-mu.runner.test.ts`, compared in both directions, with a third scenario asserting the comparison is over something, so an empty read fails rather than passes. |
| **Expected** | An error for the unmatched `--case`; the multi-line mutation applied and reverted, and the absent one refused; the non-registering spec refused as a run that did not happen; the missing spec refused with the subject untouched; the two documents agreeing in both directions; and the gap line on **every** run, agreeing with `--gaps` and changing no verdict. |
| **What it found** | Green, 12 scenarios — and `MU-59` earned itself immediately: adding `MU-61` and `MU-62` to the test file turned it red until their rows were written here, which is the drift it exists to catch, caught on the first occasion after it was built. |
| **What MU-59 does not read, stated because the reviewer asked** | It compares **scenario titles**, in both directions. It cannot see a missing *traceability* row — which is how fifteen cases came to have no requirement mapping at all (N2) — nor a missing detail block, nor a row whose wording drifted from what the case asserts. Those are read by a person, and the blocks above are what that person reads. |
| **Controls** | Each check removed in turn → its own scenario red. For MU-59, the comparison fed an empty document → its third scenario red, which is what keeps a green from meaning "nothing was compared". |
| **Implemented by** | `tests/integration/m-mu.runner.test.ts`. |
| **Widened 2026-10-15 for N5 and N9 of the fourth re-review** | **N9:** this document claimed three times that the scenario table is *generated* and there was no generator — it was hand-written and `MU-59` compared it, which is a check, not a derivation. `tests/scenario-table.ts` now writes that block and `MU-59` runs it in `--check`, so the claim is true and a hand edit still fails. **N5:** the reviewer measured what `MU-59` could and could not see — a reworded title or row, a deleted row and a duplicate id all caught; an unlabelled test, an `it(`, double quotes, backticks, `test.each` and a deleted **overview** row all invisible. Two scenarios close that: every test in the file must carry an id, and the overview must name the same cases as the scenarios. The first is how eleven scenarios lost their ids; the second is how N2's fifteen rows went through. |
| **What writing the generator found about its own reader** | Twice. It read the `test('…')` lines **inside the fixture specs**, which are template literals holding real tests — `the policy is protected`, `in inner`, `quoted parents` — and reported them as unlabelled tests; they are test data, and one of them beginning with `MU-` would have landed in this table. Blanking template contents then broke the titles themselves, because a title quotes code in backticks (`a \`from\` that is not in the subject`) and the blanker read those as template openers, rewriting them to `a \`    \``. The scanner now skips comments and quoted strings before looking for templates. Both measured, neither reasoned. |
| **Covers** | MU-55 to MU-60, MU-FR4, MU-FR5, MU-FR7, MU-NFR1. |
| **Widened 2026-10-21 for findings 7 and 14 of the local review: MU-59** | Two readers of one thing. The generator's reader anchored at `^\s+`, which with the `m` flag reaches over a blank line but not over `});`, so a top-level `test(` right after a closing brace was invisible to the table and to *every test carries an id* — and so were `.skip`, `.only`, `.each` and `.todo`. `m-tr.case-ids` on `main` corrected the same anchor on 2026-10-12, after it had missed seven ids. And MU-59 compared the table with a **second**, narrower reader of its own — single quotes only — so a title the generator put into the table could be one MU-59 did not see, and a correct table would fail. The reader is `^[ \t]*` with any chain of modifiers now, and MU-59 uses the generator's. *Test data:* a source string holding a `test(` at column 0 after `});`, one after a blank line, and `test.skip`, `test.each([1])`, `test.only`, `test.todo` and `it(`; the scenario's own title is written in **double quotes** on purpose, the shape the narrow reader missed. *Expected:* all eight titles, in order. *Controls:* the old anchor restored → this scenario red alone; the narrow reader restored → *the specification lists no scenario this file does not have* red alone, on this scenario's title. |

## Traceability

*Rows for MU-46 to MU-62 added 2026-10-14.* **N2 of the fourth re-review: the fifteen cases of the
third round had overview rows, scenario rows and no traceability at all**, so nothing said which
requirement any of them served and `MU-59` — which compares this document with the test file — cannot
see a missing traceability row, only a missing scenario. The mapping is the reviewer's, checked
against each case rather than taken on trust, with `MU-57` added under MU-FR4 and `MU-56` under
MU-FR5 because a mutation that stops the tests registering, and one spanning several lines, are both
about the named test failing and the subject going back.


| Requirement | Covered by |
|---|---|
| MU-FR1 an entry names case, file, from, to and the test that must fail | MU-1, MU-19, MU-32 |
| MU-FR2 one entry at a time, only the owning test file, restored | MU-1, MU-6, MU-31 |
| MU-FR3 a `from` that does not occur exactly once fails and names the entry, unless `all` declares every occurrence meant | MU-2, MU-3, MU-35 |
| MU-FR4 the named test must fail, and at least one other must pass, unless the file holds a single test | MU-4, MU-12, MU-22, MU-24, MU-27, MU-30, MU-40, MU-41, MU-42, MU-44, MU-45, **MU-46, MU-47, MU-52, MU-54, MU-57, MU-61, MU-62, MU-63** |
| MU-FR5 restored on success, on failure and on interrupt | MU-6, MU-23, MU-25, MU-26, MU-33, MU-37, MU-39, MU-43, **MU-48, MU-49, MU-51, MU-56** |
| MU-FR6 it refuses the entry whose subject has uncommitted changes, and carries on with the rest | MU-7 |
| MU-FR7 the report lists each entry's outcome, case and named test, and ends every run with the gap | MU-8, MU-13, MU-20, MU-29, MU-34, MU-36, **MU-55, MU-58, MU-60** |
| MU-NFR1 the gap is computed, not counted — its other half, running in the milestone cycle, is not built | MU-8, MU-36, **MU-60** |
| MU-NFR2 the run is bounded, and an entry that does not finish is refused | MU-37, MU-38, MU-39, **MU-48, MU-49, MU-50, MU-51** |
| MU-NFR3 the registry may not edit the assertions | MU-9, MU-21, MU-28, **MU-53** |
