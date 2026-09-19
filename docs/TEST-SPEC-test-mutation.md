# Test specification — proving a test can fail

For review and sign-off **before** implementation. Cases derive from `FEATURE-test-mutation.md`;
every rule there has at least one positive case and one negative counterpart, because a rule that
only refuses is as useless as one that only permits.

The subject here is a validator, so the cases are recursive by necessity: **the runner must be shown
to fail when it cannot run.** A mutation runner that silently skips is the fourth instance of the
defect this milestone was commissioned to remove, and it would be the worst one, because it would be
wearing the uniform of the cure.

---

## 1. Levels and rigour

| Component | Level | Rigour |
|---|---|---|
| The registry format | unit | Both outcomes: a well-formed entry and each way of being malformed |
| The runner's decision logic | unit / component | **100% branch coverage.** It decides whether a case counts as validated, and a wrong answer is worse than no answer |
| The runner end to end | integration | Against a real test file and a real subject, not a mocked one |
| The report | contract | Read as text: the shape a reader relies on |
| Backfill coverage | contract | Which specified cases have an entry, computed rather than counted by hand |

## 2. Overview

| ID | Level | Sign | Case |
|---|---|---|---|
| **MU-1** | integration | positive | A registered mutation turns **its own** named test red, and the run reports it as validated |
| **MU-2** | integration | **negative** | A `from` that does not occur in the subject fails the run and names the entry — it is never skipped |
| **MU-3** | integration | **negative** | A `from` that occurs twice fails the run, because a mutation that could land in two places is not a controlled experiment |
| **MU-4** | integration | **negative** | A mutation whose named test still passes fails the run, even when other tests in the file went red |
| **MU-5** | integration | **negative** | A mutation that reddens the whole file — a syntax error — is refused rather than counted as a pass |
| **MU-6** | integration | positive | The subject is byte-identical after the run: on success, on failure, and after an interrupt |
| **MU-7** | contract | **negative** | The runner refuses to start when a subject has uncommitted changes |
| **MU-8** | contract | positive | The report lists every specified case **without** an entry, so the gap is a number rather than an impression |
| **MU-9** | unit | **negative** | An entry whose `file` is a test file is refused: the registry mutates subjects, never assertions |
| **MU-10** | integration | **negative** | An entry that hangs is bounded, fails, and the subject is still restored |
| **MU-11** | integration | **negative** | A mutation that reddens nothing is reported **unresolved**, never as a finding — added 2026-09-19 after the sample |
| **MU-12** | integration | positive | An entry whose mutation reddens its named test **and a sibling** is accepted — corrected 2026-09-19, same sample |

---

## 3. Detail blocks

### MU-1 / MU-4 / MU-5 — the named test must fall, and not everything with it

| | |
|---|---|
| **Premise** | The point of an entry is that *this* rule is what *this* case protects. A run that accepts "some test went red" proves nothing: a mutation that breaks the file's syntax reddens every test in it, and would validate every entry at once — the same shape as a broken query satisfying an assertion that something is absent (M-B3). |
| **Component** | `tests/mutate.sh` and the registry, against a real case. |
| **Test data** | The entry measured by hand on 2026-09-19, which is why it is the fixture: `case: OC-44`, `file: dashboard/src/lib/components/OpenClawPairing.svelte`, `from: "requestId: 'latest'"`, `to: "requestId: req.requestId"`, `mustFail: "the card posts \`latest\` rather than an id it rendered"`. Measured result: that test red, the other sixteen in the file green. MU-4's fixture is the same entry with `mustFail` pointing at a sibling test that the mutation does not affect — *"the guard accepts a real id"*. MU-5's fixture mutates `from: "let pending = $state([]);"` to `to: "let pending = $state([;"`, which is a syntax error. |
| **Expected** | MU-1: the named test fails, at least one test in the file still passes, the entry is reported **validated**. MU-4: the named test passes, so the entry is reported **not validated**, and the run fails. MU-5: **every** test in the file fails, so the entry is **refused** with the reason, rather than counted. |
| **Unhappy** | MU-4 and MU-5 are the negatives and they carry the weight: MU-1 alone is satisfied by a runner that reports success whenever anything at all goes red. |
| **Corrected 2026-09-19 by the sample** | The rule was *"the remaining tests must pass"*. Four of ten sampled entries reddened a sibling as well — a rule covered from both sides by two tests, which is the shape this project asks for everywhere else. Requiring the rest to stay green would have refused honest entries, so MU-5's bar moved from *more than one fails* to *all of them fail*, which is still exactly the syntax-error mutation it was written to catch. MU-12 is the positive counterpart. |
| **Covers** | MU-FR1, MU-FR4. |

### MU-11 / MU-12 — a green run is a question, and a reddened sibling is not a failure

*Both added 2026-09-19, after the sample of §12 in the feature document. **MU-11 is the most
important case in this specification.***

| | |
|---|---|
| **Premise** | When a mutation is applied and nothing goes red, that reads as *"no case protects this rule"* — the discovery this whole milestone exists to make. **In the sample it was wrong four times out of thirteen.** The mutation was too narrow, or landed at the wrong site, or replaced one of two occurrences; each time the run was green and each time it looked exactly like a finding. MU-2 and MU-3 catch *not found* and *found twice*; the fourth shape — **found once, applied, and still ineffective** — cannot be caught mechanically at all. So the runner must refuse to conclude, rather than conclude wrongly. |
| **Component** | The runner and its report. |
| **Test data** | MU-11 uses the sample's own bad attempt, kept for the purpose: `file: config/scripts/start/lib/git-repos.sh`, `from: "      protected\|direct) ;;"`, `to: "      protected\|direct\|anything) ;;"` — applied cleanly, matching exactly once, and changing behaviour only for a word no case uses. The good entry beside it is the same file with the rejection line removed, which reddens A3c-3. MU-12 uses `file: config/scripts/start/git.sh`, `from: "GIT_ONLY_SLUG"`, which reddens A13-2 and two A13-3 tests together. |
| **Expected** | MU-11: the entry is reported **unresolved**, counted as neither validated nor failed, and the report names it as needing a second mutation of a different shape. The run's exit status does not treat it as a discovery. MU-12: the entry is **validated**, because its named test failed and a passing test remains in the file. |
| **Unhappy** | MU-11 is the negative and MU-12 the positive, and they must be read together: a runner that marks everything unresolved would satisfy MU-11 alone, and one that accepts any reddening would satisfy MU-12 alone. |
| **What must not be trusted** | The word *unresolved* becoming a place things go to be forgotten. MU-8's report lists unresolved entries separately from missing ones, because they mean different work: a missing entry needs writing, an unresolved one needs a **better** mutation or is a real finding nobody has confirmed yet. |
| **Covers** | MU-FR4, MU-FR7, and §11 D2 of the feature document — with no second reader, this is the mechanical compensation for the author marking their own homework. |

### MU-2 / MU-3 — a mutation that cannot be applied is a failure, not a silence

| | |
|---|---|
| **Premise** | **This is the case the whole milestone exists to earn.** A registry entry whose `from` no longer appears in the subject — because the code was refactored, renamed, or reformatted — describes an experiment that cannot be run. Skipping it, or reporting it as passed, reproduces exactly the defect this work removes, inside the tool built to remove it. The same applies to a `from` that matches twice: the runner cannot say which occurrence carried the rule. |
| **Component** | The runner, with a registry seeded for the purpose. |
| **Test data** | MU-2: an entry whose `from` is `requestId: 'yesterday'`, a string that occurs nowhere in the repository and cannot occur by accident. MU-3: an entry whose `from` is `pending` against the same component, which occurs twenty-plus times. |
| **Expected** | Both fail the run, with a message naming the entry, the file, and which of the two conditions was violated — *not found* against *found N times*, because the repairs differ. The exit status is non-zero. |
| **Unhappy** | The positive counterpart is MU-1's entry, whose `from` occurs exactly once: without it the rule could be met by a runner that refuses every entry. |
| **What must not be trusted** | A quiet run. A run that reports "0 entries validated, 0 failures" over an empty or unreadable registry is indistinguishable from a healthy one, which is why MU-8 requires the count to be printed and compared against the specifications. |
| **Covers** | MU-FR3, MU-NFR1. |

### MU-6 / MU-10 — the subject goes back, however the run ends

| | |
|---|---|
| **Premise** | The runner deliberately writes a broken line into a file that is under version control and mounted into running containers. An interrupted run that leaves it there is worse than no runner: the next suite run measures the mutant, and the dashboard image would be built from it. `tests/verify/m-b2.sh` shipped a `trap … INT` that ran its handler and then *resumed*, so the promise of restoration on `Ctrl-C` had never once been exercised — that is the precedent, and it is why this is a case rather than a comment. |
| **Component** | The runner, the real file, and `git diff` as the judge. |
| **Test data** | `dashboard/src/lib/components/OpenClawPairing.svelte`, with its SHA-256 taken before the run and compared after. Three runs: one where the entry validates, one where it fails (MU-4's fixture), and one interrupted with `SIGINT` while the test file is executing. MU-10 uses an entry whose mutation makes the test loop — `to` replaces the fetch with `while (true) {}` — against a two-second bound. |
| **Expected** | The file's SHA-256 is unchanged after all four runs, `git status --porcelain` is empty for it, and MU-10 additionally reports the entry as failed-by-timeout rather than hanging the run. |
| **Unhappy** | This case is itself a negative: it asserts the absence of damage. Its positive counterpart is MU-1, which requires the mutation to have been genuinely applied — otherwise "the file is unchanged" is satisfied by a runner that does nothing at all. **The two must be run together or neither means anything.** |
| **Covers** | MU-FR5, MU-NFR2. |

### MU-7 — it does not run over uncommitted work

| | |
|---|---|
| **Premise** | Restoration is implemented by putting back what was there. If the operator has uncommitted changes in a subject, the runner cannot tell its own edit from theirs, and "restore" becomes "discard their work". |
| **Component** | The runner and `git status`. |
| **Test data** | A subject with one uncommitted line added; and, as the counterpart, the same tree with that change stashed. |
| **Expected** | With the change present the runner exits non-zero before touching anything, naming the file. With the tree clean it proceeds. |
| **Unhappy** | The counterpart is the clean tree: a guard that refuses always would satisfy the first half. |
| **Covers** | MU-FR6. |

### MU-8 — the gap is a number

| | |
|---|---|
| **Premise** | The registry's own coverage is the thing nobody will notice going stale. A hundred validated entries mean nothing if three hundred decision-carrying cases have none, and the only honest way to know is to compute it rather than to feel it. |
| **Component** | The report, against the case tables in the four test specifications. |
| **Test data** | The overview tables of `TEST-SPEC-git-integration.md`, `TEST-SPEC-liquid-java-extensions.md`, `TEST-SPEC-openclaw-2026-9-1.md` and this document, parsed for their case ids; the registry, for the ids it carries. |
| **Expected** | The report prints the count of specified cases, the count with an entry, and the list without one. A case deliberately exempt under §6 of the feature document is listed as **exempt with its reason**, never silently absent — the distinction between a decision and an oversight is the entire value of the list. |
| **Unhappy** | The negative half: a case id present in the registry but absent from every specification also fails, because it means a case was renamed or deleted and its entry outlived it. |
| **Covers** | MU-FR7. |

### MU-9 — the registry may not edit the assertions

| | |
|---|---|
| **Premise** | A tool that can rewrite tests can make anything pass. The registry mutates the **subject**; an entry pointing at a test file is either a mistake or the beginning of a very bad habit, and the check is one line. |
| **Component** | The registry loader. |
| **Test data** | Refused: an entry with `file: tests/contract/m-oc.pairing-card.test.ts`. Accepted: the same entry pointing at the component the case is about. |
| **Expected** | The loader refuses any `file` under `tests/`, names the entry, and exits non-zero before running anything. |
| **Unhappy** | Both sides in one run, as above: the refusal is only meaningful beside the acceptance. |
| **Covers** | MU-NFR3. |

---

## 4. Deliberate omissions

**No case asserts that a mutation is the *right* mutation.** That is a judgement — whether
`requestId: 'latest'` is the rule OC-44 exists to protect — and judgements belong to the reviewer,
which is why §7 of the feature document puts the mutation in the detail block where it can be
challenged. A machine can check that the experiment was run; only a reader can check that it was the
experiment worth running.

**No case measures how long the full backfill takes.** M-MU2 will produce that number by running,
and a predicted number would be the kind of claim this project has stopped making.

## 5. Traceability

| Requirement | Covered by |
|---|---|
| MU-FR1 the entry format | MU-1, MU-9 |
| MU-FR2 one entry, one file, restored | MU-1, MU-6 |
| MU-FR3 an unapplicable mutation fails | MU-2, MU-3 |
| MU-FR4 the named test, and one survivor | MU-1, MU-4, MU-5, MU-11, MU-12 |
| MU-FR5 restored however it ends | MU-6, MU-10 |
| MU-FR6 not over uncommitted work | MU-7 |
| MU-FR7 the report names the gaps | MU-8, MU-11 |
| MU-NFR1 it is a tool that is run | MU-2, MU-8 |
| MU-NFR2 bounded | MU-10 |
| MU-NFR3 never edits a test | MU-9 |
