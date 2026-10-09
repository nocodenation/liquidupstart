# Test specification — the mutation runner's own cases

The runner is a validator, so its cases are recursive by necessity: **it must be shown to fail when it
cannot run.** A mutation runner that silently skips would be the worst instance of the defect the whole
practice exists to remove, because it would be wearing the uniform of the cure. Every case below exists
because something answered quietly once.

**Where the rest is.** The practice — why mutation control, what the 2026-09-19 sample measured, the
four outcomes and the registry's contract — is `docs/PROCEDURE-mutation-control.md` beside this file.
MU-1 to MU-12 were specified before the work, in `docs/TEST-SPEC-test-mutation.md` on
`feature/test-mutation-control`, and are listed here as well so `mutate.sh --gaps` can see them: the
report reads case ids out of `TEST-SPEC-*.md`, and a case with no row is invisible to the tool that
counts coverage. That is why this file exists at all — a reviewer found that the runner's own cases,
MU-13 upward, were in no specification.

**That file is not in this tree, and neither is the feature document.** `docs/TEST-SPEC-test-mutation.md`
and `docs/FEATURE-test-mutation.md` live on `feature/test-mutation-control` (#17), which this branch is
not stacked on — it is cut from `main`. So the `MU-FR*` and `MU-NFR*` ids the traceability table below
uses cannot be looked up here. Their wording is restated in that table for exactly that reason: this
file is readable on its own, and a reader who wants the reasoning behind a requirement follows it to
#17. Finding 9 of the 2026-10-01 re-review named the dangling reference; it is a cross-branch fact and
not something this file can fix by itself.

**Level.** Every case here is integration: each one runs `tests/mutate.sh` as a process against a
throwaway directory holding one subject and a spec. A unit test of the loader would assert the shape of
a row, which is not what goes wrong; what goes wrong is what the whole tool answers.

*Corrected 2026-10-09, because the sentence above described a fixture that does not exist.* It said
"a two-git repository holding one subject and a two-test spec", and three things in that were wrong.
The shared spec holds **four** tests — `the policy is protected`, `the mode is 600`, `field A is
carried` and `field B is carried` — which is what gives every case a survivor to point at. The
directory becomes a **git repository only when MU-7 runs `git init`** in it, so cases before MU-7 and
cases after it see different state; the runner's uncommitted-changes check is skipped where there is no
repository, which is why MU-7 is the case that needs one. And **four cases do not use the fixture at
all**: MU-8's pair at `and it reads the real specifications of whatever branch it runs on` and `and an
entry no specification mentions is reported as orphaned` run `--gaps` against this checkout, as does
the count scenario, and MU-59 reads this document and the test file from the repository. Finding 9 of
the 2026-10-01 re-review.

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
| **MU-8** | positive | `--gaps` counts specified cases against registered ones |
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
| **MU-38** | positive | While an ordinary run is not slowed or refused by the bound |
| **MU-39** | **negative** | A signal stops the run rather than being acted on once the run is over |
| **MU-40** | **negative** | A test that was skipped, todo or inside a skipped block is refused, never read as green |
| **MU-41** | positive | The describe path is the one bun prints, on either version; the reversed `classname` order is refused |
| **MU-42** | positive | A case that is a describe block stands for the tests under it, and a name is still never matched by part of another |
| **MU-43** | **negative** | A subject `cmp` cannot open is not a mutation that landed |
| **MU-44** | **negative** | A baseline that did not load says so, rather than reporting the name as misspelt |
| **MU-45** | positive | The console differs between a person and an agent on one machine, which is why the record is read |
| **MU-46** | **negative** | A test name that resolves to more than one test is refused before the mutation, and the refusal names the remedy |
| **MU-47** | **negative** | A describe block whose name is also a test name is the same ambiguity, and naming it in full resolves it |
| **MU-48** | **negative** | A run the budget stops takes bun with it, and leaves no record behind |
| **MU-49** | **negative** | A signal while the subject is mutated takes bun with it, and nothing writes the record afterwards |
| **MU-50** | **negative** | `MUTATE_RUN_BUDGET_MS` is milliseconds: zero, a word and a unit are each refused with exit 2, while a whole number is accepted |
| **MU-51** | **negative** | A signal during the baseline leaves neither the backup nor the record behind |
| **MU-52** | **negative** | The counts come from the JUnit record, so a line the spec itself prints cannot change a verdict |
| **MU-53** | **negative** | A subject is judged by where it leads: a link to a test file, a directory link into `tests/lib` and an upper-case test name are refused, and a link to an ordinary file is not |
| **MU-54** | **negative** | A spec that is red before the mutation is refused and its red tests are named, rather than the mutation being blamed |
| **MU-55** | **negative** | `--case` naming nothing is an error, not a run that found nothing |
| **MU-56** | positive | A mutation may span several lines: a `from` carrying a newline is applied byte-exactly, and a multi-line `from` that is absent is still refused |
| **MU-57** | **negative** | A mutation that stops the tests registering at all is `no test executed`, not a test that passed |
| **MU-58** | **negative** | A spec that does not exist is refused before anything is mutated |
| **MU-59** | positive | This document and the test file name the same scenarios, in both directions |
| **MU-60** | positive | An ordinary run ends with the gap line, it agrees with `--gaps`, and it does not change what the run concluded |

## Scenarios

One row per case above; one row per **scenario** here, because a case usually holds several and a
guard that only refuses is as useless as one that only permits. A reader cannot tell from a single
line which half was tested.

**This table is generated from the test file and `MU-59` keeps it that way**, in both directions: a
scenario here that the file does not have fails, and a test the file has that is not here fails too.
That is the answer to finding 9 of the 2026-10-01 re-review, which was eight drifts found by one
human comparison that nothing repeated. Renaming a test is a two-file change now.

| Case | Scenarios, named as the tests are named |
|---|---|
| **MU-1** | the named test goes red and a survivor remains |
| **MU-2** | a `from` that is not in the subject is refused, and says the subject moved |
| **MU-3** | a `from` that occurs twice is refused, and says how often<br>and neither left the subject changed |
| **MU-4** | a red test that is not the named one is a failure, not a pass |
| **MU-5** | a mutation that reddens every test is refused as a broken file |
| **MU-6** | after a validated run, a failed run and an unresolved run alike<br>and the backup file is not left behind either |
| **MU-7** | a tracked subject with local changes stops the entry |
| **MU-8** | the report counts specified cases, registered ones and the difference<br>and it reads the real specifications of whatever branch it runs on<br>and an entry no specification mentions is reported as orphaned |
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
| **MU-37** | a mutation that makes the spec hang is refused, and the subject goes back<br>and a spec that is already too slow unmutated is refused before anything is touched |
| **MU-38** | the counterpart: a normal entry still validates |
| **MU-39** | SIGTERM ends it mid-run, the subject goes back, and no verdict is printed |
| **MU-40** | skip, todo and a skipped block are all refused, not read as green |
| **MU-41** | the name bun prints is the name that matches<br>and the reversed order is refused, on either bun<br>and a parent whose own name carries the separator is still matched |
| **MU-42** | the block name is enough, which is how A10-14 is written<br>and a name is still never matched by part of another |
| **MU-43** | a spec that removes its own subject is refused |
| **MU-44** | an import-time throw before the mutation names the error |
| **MU-45** | the record is read because of that, not because of a version |
| **MU-46** | the same test name in two blocks is refused, and the remedy is named |
| **MU-47** | a block whose name is also a test name is refused too<br>and naming it in full resolves the ambiguity rather than only reporting it |
| **MU-48** | a run stopped by the budget leaves no bun behind, and no record either |
| **MU-49** | a TERM while the subject is mutated takes bun with it, and nothing writes the record afterwards |
| **MU-50** | a budget of zero is refused before anything runs<br>a budget that is not a number at all is refused before anything runs<br>a budget carrying a unit is refused before anything runs<br>and a whole number is still accepted, so the check refuses only what it should |
| **MU-51** | TERM while the unmutated spec runs leaves no backup and no record |
| **MU-52** | a spec printing a pass line does not get a survivor it has not got<br>and a spec printing an error line is still read as the control it is |
| **MU-53** | a link to a test file is refused, and the refusal says where it led<br>a directory link into tests/lib is refused too<br>and an upper-case test name is refused, which was reasoned rather than run<br>the counterpart: a link to an ordinary file is still a subject |
| **MU-54** | a red sibling is named, and the mutation is not blamed for it<br>and a correct mutation over a red sibling is refused for the right reason<br>the counterpart: a green baseline is still measured rather than refused |
| **MU-55** | and a --case that matches nothing is an error |
| **MU-56** | a from carrying a newline is applied, and the subject goes back<br>and a multi-line from that is not there is still refused |
| **MU-57** | is refused as a run that did not happen, not as a test that passed |
| **MU-58** | and a spec that does not exist is refused before anything is mutated |
| **MU-59** | every scenario in this file has a row in the specification<br>and the specification lists no scenario this file does not have<br>and the comparison is over something, so an empty read fails |
| **MU-60** | an ordinary run ends with the gap line, and it agrees with --gaps<br>and the line does not change what the run concluded |

**What the blocks below do not carry, and that is a decision.** They are per group — the fixture and
the reasoning are shared, and repeating them 89 times would bury the differences. They do not carry
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
| **Test data** | The subject's SHA-256 before and after, plus `git status --porcelain` for it. MU-39 uses a spec that sleeps 40 seconds **only once the mutation has landed**, so the baseline is quick and the signal arrives while the mutated subject is on disk. |
| **Expected** | Byte-identical after a validated run, a failed run and a stopped one. MU-39 additionally: stopped within 15 seconds of the signal, a non-zero exit, no verdict printed, and the message *"no entry was judged past this point, and the subject is back."* |
| **Why SIGTERM and not SIGINT** | A background command started by a non-interactive shell inherits SIGINT ignored, and a signal ignored on entry cannot be trapped — an INT-based case would measure bash rather than this runner. Ctrl-C in a terminal signals the whole foreground process group, so bun dies and the run ends; that path was never affected. A supervisor or a task runner sending TERM to the script was. |
| **Covers** | MU-FR5, MU-NFR2. |
| **What MU-39 found** | 2026-09-30, and it took carrying out MU-6's interrupt half as the **manual check** its specification calls for. The subject always came back and the exit code was always 143; the run did not **stop**. `out="$(run_spec …)"` put the run inside a command substitution and bash defers a trap until the current foreground command completes, so the signal was acted on after the spec had finished by itself — 40 seconds against a spec that sleeps 40, and the entry then printed `VALIDATED`, a verdict the run had not earned. Two seconds now. The 15-second bound in the case is between the two, so it says which behaviour is present. |

### MU-7, MU-9, MU-21, MU-28 — what may be a subject

| | |
|---|---|
| **Premise** | A tool that can rewrite the assertions can make anything pass; and restoration means putting back what was there, so it cannot run over somebody else's uncommitted work. |
| **Test data** | Refused: `tests/lib/helper.ts`, `spec/__snapshots__/x.snap`, `spec/x.test.tsx`, `spec/y_test.ts`, `spec/z.spec.js`, `tests/mutations.json`, and `spec/../../outside.sh`. Accepted: `tests/run.sh`. A tracked subject with a local edit, for MU-7. |
| **Expected** | Each refused entry named, exit non-zero, nothing run. `tests/run.sh` **not** refused. MU-7 refuses only the entry whose own subject is dirty. |
| **Unhappy** | MU-28's second half is the counterpart, and the reason the rule is not a prefix: restoring a blanket `tests/` refusal would take A0-4 with it, since `tests/run.sh` is a subject in its own right and nothing asserts against its contents. |
| **Covers** | MU-FR6, MU-NFR3. |

### MU-8, MU-29, MU-36 — the coverage report

| | |
|---|---|
| **Premise** | A hundred validated entries say nothing while three hundred cases carry none. The gap has to be a number, and the number has to be computed rather than counted by hand. |
| **Test data** | A fixture `docs/TEST-SPEC-fixture.md` holding rows for `FX-1`, `**FX-2**` (bolded, because the tables bold some ids) and `FX-3`, plus prose mentioning `FX-9` which must not count because it is not a row. A registry registering `FX-1` only; then one holding an exemption; then one whose case is in no specification. |
| **Expected** | `specified=3 registered=1 missing=2 orphaned=0`, exit 0. An exemption printed as `exempt:   <id>  <reason>`. An orphan reported and exit non-zero. A malformed registry an error rather than a silence. |
| **Unhappy** | Missing entries deliberately stay exit 0: a gap is the ordinary state of a registry being filled in. An orphan is not — it means a case was renamed or deleted and the entry outlived it, so the registry claims to cover something that is not there. |
| **Covers** | MU-FR7, MU-NFR1. |
| **What MU-36 found** | Exemptions were counted as covered and their reason never printed — the one thing a reader can disagree with was the one thing hidden. |

### MU-13, MU-14, MU-20, MU-24, MU-30, MU-31 — a run that did not happen is not a result

| | |
|---|---|
| **Premise** | Five of the six blocking findings of the 2026-09-22 review were one omission wearing five coats, and the root is here: the spec was never run **unmutated**, so a test that is red for its own reasons — a stack that is down, a timeout, a flake — was credited to the mutation and any edit at all read VALIDATED. |
| **Test data** | An empty registry; `--case` naming an id that is not in it; a spec with no tests; a spec whose named test fails for its own reason (`expect('broken env').toBe('ok')`); a spec that throws at import; and a sibling file `x.test.tsx` beside `x.test.ts`, for MU-31. |
| **Expected** | Each refused with its own message and a non-zero exit — "registry is empty", "no entry for case", "no test executed", "already red before the mutation", "did not load", and for MU-31 a tally that counts one file rather than two. |
| **Covers** | MU-FR4, MU-FR7. |
| **What they found** | MU-24 subsumes "a `mustFail` nobody answers to": the baseline asks whether the named test exists, whether it ran, and whether it was green, so a typo, a rename or a `test.skip` is refused instead of leaving the run UNRESOLVED and exit 0. MU-30: bun 1.4.2 reports an import-time throw as `0 pass / 1 fail / 1 error`, so the tally is not empty and the run came back FAILED — saying the entry does not protect what it claims, when nothing ran. MU-31: a bare path is a substring filter over every test file under the root, so a sibling was counted into the tally and each run scanned `volumes/` as well. |

### MU-22, MU-26, MU-27 — matching a name, and the two versions of bun

| | |
|---|---|
| **Premise** | The verdict for an entry is "did *this* test go red". Everything about how that is read turned out to be either a regular expression or a property of the installed bun. |
| **Test data** | A spec holding `field A is carried` **and** `not field A is carried`, so a suffix match admits the wrong one. For MU-26, a spec that removes the subject's parent directory while it runs, so `cp` has nowhere to copy back to. |
| **Expected** | The named test's own verdict, by exact name; and a restore that failed keeping its backup and saying where it is. |
| **Covers** | MU-FR4, MU-FR5. |
| **What they found, and why the hosts are named** | `bun test -t` is a regular expression matched anywhere in the full name, so a name carrying `(`, `[`, `+` or `*` was refused as "did not run" and a sibling containing the named test dragged its own verdict in; anchoring does not settle it, because `-t` matches the describe and test names joined by a space. Reading the named test's line off the console does not settle it either: **with `CLAUDECODE` set, bun names only the failing tests; without it, passing ones get a line too** — measured on a two-test file, both ways, on 1.3.13 and 1.4.2 — so the reviewer's suggested repair worked in a plain shell and refused 18 of 41 entries in an agent's. *Corrected 2026-10-01: this said the difference was between the two bun versions. The measurement behind that ran 1.3.13 in an agent shell and 1.4.2 in a container without one, so it compared two things and named the wrong one. The corrected reason is the stronger one — a person and an agent get different consoles on the same machine, which does not expire with the next release. MU-45 measures it in place.* The verdict comes from `--reporter=junit`, which both versions write and which names every case exactly, with a `<failure>` child for the red ones. MU-25 and MU-26 staged their failures with `chmod`, which **root ignores**, so both were red in the container and on CI while the runner was working as intended; they stage without permissions now. |

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

### MU-34, MU-35, MU-37, MU-38 — what came from #17

| | |
|---|---|
| **Premise** | The registry on `feature/test-mutation-control` needs `all` and `exempt`, which only that branch's older copy of this runner had. Both branches add the same four files, so leaving them there meant an add/add conflict whose resolution could silently restore every defect fixed here. |
| **Test data** | An exemption with a reason; one with a newline in the reason; one with an empty case; one carrying both an exemption and a mutation; a `from` occurring twice with and without `"all": true`; a non-boolean `all`; a spec made to hang by the mutation; and an ordinary entry, for MU-38. |
| **Expected** | An exemption reported as `EXEMPT` with its reason and counted apart; every malformed shape exit 2; `"all": true` replacing every occurrence with the subject restored; a hang refused with the budget named; an ordinary entry still validated. |
| **Unhappy** | MU-38 is the counterpart that mattered while building MU-37: a budget that ended a healthy run would make every entry REFUSED, which is the direction this tool must never fail in. |
| **Covers** | MU-FR3, MU-FR4, MU-NFR2. |
| **What they found** | The exempt path returned **before** the loader's checks, so a newline in the reason produced a phantom entry, an empty case gave `REFUSED   -  no such subject: -`, and an entry carrying both was silently exempted with its mutation never run — a case that stopped being proven, with nobody deciding that. And MU-10 had been specified since 2026-09-19 and never built: `bun --timeout` ends a test that awaits too long and cannot end one that never yields, so `while (true) {}` hung the runner for ever, while an async hang came back **validated** because bun reddened the test and the run carried on. |

## Traceability

| Requirement | Covered by |
|---|---|
| MU-FR1 an entry names case, file, from, to and the test that must fail | MU-1, MU-19, MU-32 |
| MU-FR2 one entry at a time, only the owning test file, restored | MU-1, MU-6, MU-31 |
| MU-FR3 a `from` that does not occur exactly once fails and names the entry | MU-2, MU-3, MU-35 |
| MU-FR4 the named test must fail, and at least one other must pass | MU-4, MU-12, MU-22, MU-24, MU-27, MU-30, MU-40, MU-41, MU-42, MU-44, MU-45 |
| MU-FR5 restored on success, on failure and on interrupt | MU-6, MU-23, MU-25, MU-26, MU-33, MU-37, MU-39, MU-43 |
| MU-FR6 it refuses a subject with uncommitted changes | MU-7 |
| MU-FR7 the report lists each entry, its mutation and its outcome, and the gap separately | MU-8, MU-13, MU-20, MU-29, MU-34, MU-36 |
| MU-NFR1 the gap is computed, not counted | MU-8, MU-36 |
| MU-NFR2 the run is bounded | MU-37, MU-38, MU-39 |
| MU-NFR3 the registry may not edit the assertions | MU-9, MU-21, MU-28 |
