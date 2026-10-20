# Test specification — the commit message that closed a pull request

Covers `scripts/hooks/commit-msg` and `scripts/hooks/install.sh`, specified in
`docs/FEATURE-commit-message-guard.md`.

## 1. What is being tested, and at which level

The hook is a text decision: message in, exit status and a named line out. It touches no container,
no network and no stack, so that part belongs at the **unit** level and runs in the default tier — a
guard that only runs when someone remembers `--system` is not a guard.

**And a second level was added on 2026-10-20, because two defects lived exactly where a unit case
cannot look.** A unit case hands the hook a file; it cannot see which lines git will *store*, and it
cannot see whether git will run the hook at all. Both of those were wrong, and both reached the same
state — the guard silently off. `CM-4` and `CM-5` are therefore **integration** cases that clone this
repository into a temporary directory, run `install.sh` as an operator runs it, and then commit.
`CM-6` is a **contract** case in `m-a4.hooks-path`, which drives the real start script, because the
agents in the stack get the hook from there.

**Full branch coverage is required here.** This is real decision logic, in the terms
`CLAUDE.md` uses: it either refuses or permits, and both answers are consequential. The two arms are
measured, and so is the override.

**The component under test is the tracked script**, reached through `repoRoot`, invoked exactly as
git invokes it: one argument, a path to a file holding the message. Nothing mocks `git`; there is
nothing to mock.

## 2. Overview

| Case | Sense | Scenario |
|---|---|---|
| **CM-1** | **negative** | The real message of `5aa5bc9` — the one that closed #18 — is refused |
| **CM-1** | **negative** | …and the refusal names line **10** and the text `resolved: #18` |
| **CM-1** | **negative** | `fixes #19` — the bare form, no colon |
| **CM-1** | **negative** | `closes: #7` — with a colon |
| **CM-1** | **negative** | `RESOLVES #5` — uppercase, since GitHub does not care |
| **CM-1** | **negative** | `Closed GH-7` — the `GH-` reference form |
| **CM-1** | **negative** | `fixed nocodenation/liquidupstart#12` — the cross-repository form |
| **CM-1** | **negative** | `closes https://…/issues/7` — the issue URL form |
| **CM-1** | **negative** | `resolve https://…/pull/18` — the pull URL form |
| **CM-2** | positive | This repository's own prose, which uses `resolved` about a **file** |
| **CM-2** | positive | A bare `#18` with no keyword anywhere |
| **CM-2** | positive | A keyword with a word between it and the number — `closes the gap #18 left open` |
| **CM-2** | positive | The correction commit that followed the incident, which talks about the keyword |
| **CM-1** | **negative** | A keyword ending one line and its reference opening the next — the incident's own sentence, wrapped two words earlier |
| **CM-1** | **negative** | `(fixes #12)` — so the word boundary does not swallow punctuation |
| **CM-1** | **negative** | A body line **beginning** with `#18 is merged, and this closes #20`, which `-m` stores |
| **CM-1** | **negative** | …and the named line is the line in the file, not one shifted by dropped lines |
| **CM-1** | **negative** | …and the refusal names the file git actually used, not `.git/COMMIT_EDITMSG` |
| **CM-2** | positive | Git's own editor template, which is what the `#` rule was really for |
| **CM-2** | positive | `this closes` / `the gap #18 left open` on adjacent lines — the pair pass's counterpart |
| **CM-2** | positive | `hotfix #12`, `the unresolved #12 thread`, `disclosed: #12, enclosed #13, suffixed #14` |
| **CM-2** | positive | Text under the verbose-commit scissors carrying the pattern |
| **CM-3** | positive | `ALLOW_CLOSING_KEYWORD=1` passes the refused message **and** says so on stderr |
| **CM-3** | **negative** | Any other value of that variable does not pass it |
| **CM-3** | positive | The tracked hook is executable, so a fresh clone can run it |
| **CM-4** | positive | `install.sh` puts the hook in the **shared** hooks directory and self-tests |
| **CM-4** | positive | …and records the source blob id beside it, so staleness is computable |
| **CM-4** | positive | …and a second run is idempotent |
| **CM-4** | **negative** | …and a foreign `core.hooksPath` is refused and left unchanged |
| **CM-4** | **negative** | …and a sabotaged copy fails the self-test instead of reporting success |
| **CM-4** | positive | `--check` answers whether the guard is on, so nobody has to remember |
| **CM-5** | **negative** | Git itself refuses a `-m` body that would close a reference |
| **CM-5** | **negative** | …including a line beginning with `#`, which `-m` stores and the hook used to drop |
| **CM-5** | **negative** | …and the same through `-F`, the other way an agent commits |
| **CM-5** | positive | …while ordinary prose naming the same numbers commits |
| **CM-5** | **negative** | **The main tree moves to a commit with no `scripts/hooks`, and a worktree still refuses** |
| **CM-5** | **negative** | …and a local `git merge -m` message is read too, with its own positive counterpart |
| **CM-6** | positive | The agents' shared hooks directory carries the guard, executable |
| **CM-6** | positive + **negative** | …and it refuses there what it refuses here, and passes what it passes |

## 3. Detail

### CM-1 — the forms that close something

| | |
|---|---|
| **Premise** | GitHub applies `close`, `fix` and `resolve`, in every inflection, in any case, with an optional colon, to the reference that follows, and it does so for pull requests as well as issues. A message is prose to its author and an instruction to the forge. |
| **Component** | `scripts/hooks/commit-msg`, invoked as git invokes it. |
| **Steps** | Write each message to a file in a `mkdtemp` directory; run the hook with that path; read the exit status and both streams. |
| **Test data, and why this one** | The first scenario's message is **the real one, whole**: all 24 lines of `5aa5bc9` as `git log -1 --format=%B` prints them, with `both are merged and resolved: #18, where both sides appended an` as line **10**. A case about prose that reads as an instruction has to be run against the prose that did it, or it only proves the pattern matches an invention. The remaining forms are the keywords and references GitHub documents, one scenario each, with numbers (`#5`, `#7`, `#12`, `#19`) that are not the incident's so a false pass cannot borrow its text. |
| **The fixture was an excerpt while three documents called it verbatim** | *Corrected 2026-10-20, A6 of the first review.* It held six lines: the first body paragraph of `5aa5bc9` was dropped and its last line re-ended as `because it closes it.`, where the message continues `because it closes it -- that section is`. So the case asserted line `4:` for a line that is `10:` in what was committed, and the test header, this block and the pull request body all said "kept verbatim". The fixture is the whole message now and the expected line number is read from a named constant, so the two cannot drift apart again. |
| **Three scenarios added 2026-10-20 for repairs of the pattern** | A keyword ending one line with its reference opening the next — the incident's own sentence wrapped two words earlier, which `grep` could not see. `(fixes #12)`, so the new left word boundary does not swallow punctuation. And a body line **beginning** with `#18 is merged, and this closes #20`, which `-m` and `-F` store and the hook used to drop. Two further assertions came with them: that the named line is the line in the **file** (a `#` line above the offending one used to shift every number below it), and that the refusal names the file git actually used rather than the templated `.git/COMMIT_EDITMSG`, which is wrong in a worktree, where `.git` is a file. |
| **Expected** | `rc=1` in every scenario. For the first, the output contains `resolved: #18` and a line beginning `10:`. |
| **What it found** | Green on first run, 2026-10-16, against the hook written earlier the same day. The hook had already been measured by hand against the same real message before this file existed; these cases are that measurement made repeatable. The 2026-10-20 scenarios were **red when written**, which is the point of them. |
| **Shown able to fail** | With the hook replaced by `#!/bin/sh\nexit 0`, **15 of the 26** unit cases redden — 13 of CM-1 and 2 of CM-3. With `exit 1`, **14** redden: 10 of CM-2, CM-3's positive, and **3 of CM-1** — the ones that assert on the output, which a bare `exit 1` no longer produces. That asymmetry is worth recording rather than rounding: a refusal and a *useful* refusal are different properties, and only the second is held by the three. |
| **Implemented by** | `tests/unit/m-cm.commit-message-guard.test.ts`. |
| **Covers** | CM-FR1, CM-FR2. |

### CM-2 — the counterpart, which is where the worth of this is decided

| | |
|---|---|
| **Premise** | A guard that refused every `#12` would pass all nine of CM-1 perfectly and make this repository uncommittable: `HANDOFF.md`, every backlog entry and most commit messages here name pull requests. The refusals are only worth having if the permissions hold. |
| **Component** | The same script. |
| **Steps** | As CM-1, reading the exit status, and asserting on the output when it is non-zero so a failure says why. |
| **Test data, both sides** | Shapes that must pass, each chosen against a way the pattern could be written too greedily: **`the #18 conflict, answered on #19, resolved in BACKLOG.md`** — the wording this repository now uses, and it contains the word `resolved` followed later by a reference; **`see #18 and #19 for the rounds this answers`** — references with no keyword at all; **`this closes the gap #18 left open`** — a keyword and a reference in one sentence with a word between them, which is the boundary the pattern decides; the **correction commit's own message**, which discusses the keyword in prose and would be refused by a guard that matched the word anywhere; **git's own editor template**, eight lines of `# Please enter the commit message…`; **`this closes` / `the gap #18 left open` on adjacent lines**, the counterpart to the pair pass; **`hotfix #12 landed this morning`**, **`the unresolved #12 thread stays open`** and **`disclosed: #12, enclosed #13, suffixed #14`**, each measured as *refused* before the left word boundary was added; and text under `------------------------ >8 ` carrying the exact offending pattern. |
| **Expected** | `rc=0` in all of them. |
| **What it found** | Green — and two of these groups exist because the review found the premise behind them wrong. The scenario *"a comment line passes, because git strips it"* **was deleted**: git strips `#` lines only under `--cleanup=strip`, the editor default, and with `-m` or `-F` they are stored, so that row encoded a false premise and is now a **refusal** in CM-1. What survives of the intent is the editor template, which passes because it carries no keyword in front of a reference — not because it is ignored. The word-boundary group was simply not covered: the reviewer's mutation adding the boundary left all 17 cases green, so nothing decided it either way. |
| **Shown able to fail** | With the hook replaced by `#!/bin/sh\nexit 1`, **14 of the 26** redden: all 10 of CM-2, CM-3's positive, and 3 of CM-1 (see that block). With the left boundary removed, the three word-ending scenarios redden; with the pair pass removed, the adjacent-lines **refusal** in CM-1 reddens and this block's adjacent-lines counterpart stays green, which is what tells the two apart. |
| **Implemented by** | `tests/unit/m-cm.commit-message-guard.test.ts`. |
| **Covers** | CM-FR3. |

### CM-3 — the way out, and that it is not silent

| | |
|---|---|
| **Premise** | A commit may mean to close an issue. A guard that forbids it gets `--no-verify`'d or deleted, and then protects nothing. |
| **Component** | The same script, with `ALLOW_CLOSING_KEYWORD` in its environment. |
| **Steps** | Run the refused message with the variable set to `1`, then to `yes`. |
| **Test data** | The real message again, so the override is shown against something the guard genuinely refuses rather than against a message that would have passed anyway. |
| **Expected** | With `1`: `rc=0`, and the output names both the variable and the line it let through. With `yes`: `rc=1` — the override is one exact value, so a stray truthy-looking setting cannot switch the guard off. |
| **The third scenario, described here for the first time** | *A6 of the first review: the overview carried "the tracked hook is executable" and this block said nothing about it.* **Premise:** `core.hooksPath` makes git run `commit-msg` from a tracked directory, and git refuses to run a hook that is not executable — silently, as far as the committer is concerned, because an unrunnable hook is indistinguishable from no hook. The mode is repository content, so it is reviewable, and losing it is a plausible accident (a copy through an editor, a `tar` without permissions). **Data:** `scripts/hooks/commit-msg` itself, through `repoRoot`. **Expected:** `statSync(hook).mode & 0o111` is non-zero. **What it would miss:** that the *installed copy* is executable, which `CM-4` asserts of the file in the shared hooks directory. |
| **What it found** | Green. The `yes` scenario exists because `[ "$v" = "1" ]` and "is it set at all" are a one-character difference in shell, and the second would make `ALLOW_CLOSING_KEYWORD=0` disable the guard. |
| **Implemented by** | `tests/unit/m-cm.commit-message-guard.test.ts`. |
| **Covers** | CM-FR4. |

### CM-4 — the installer, and whether the guard is on at all

| | |
|---|---|
| **Premise** | `install.sh` carries five outcomes and had no case. §4 of this document explained why it asserts nothing *about the reviewer's own clone* — `core.hooksPath` is local configuration — and that reasoning was sound and was also used to avoid testing the installer **anywhere**. A5 of the first review drew the line: a throwaway clone is not the reviewer's clone. The pull request's own comment reported the guard as off on the author's machine, and that fact could only be remembered. |
| **Component** | `scripts/hooks/install.sh`, run as an operator runs it, in a `git clone` of this repository under `mkdtemp`. |
| **Steps** | Clone; copy this working tree's two hook files in and commit them, so the case measures the code under review rather than whatever the clone's HEAD carried; run the installer; then each outcome in turn, restoring the state after each. |
| **Test data, both sides** | **What must exist:** the clone's own `.git/hooks` as the shared directory, and `scripts/hooks/commit-msg` in the checkout as the source. **What must not:** `/elsewhere` as a foreign `core.hooksPath`, which cannot exist, so the refusal cannot pass by accident; and `#!/bin/sh` + `exit 0` written over the installed copy, which is a hook that is present, executable and useless — the exact shape a copy that has gone stale or been tampered with takes. The self-test messages are the installer's own: `test: this resolves #9999` must be refused and `test: the #9999 conflict, answered on #9998` must pass, with `#9999` chosen so no real reference can be touched. |
| **Expected** | Install: `rc=0`, the hook at `<common dir>/hooks/commit-msg`, a 40-character blob id beside it equal to `git hash-object` of the source, and the self-test line in the output. Second run: `rc=0`, unchanged. Foreign path: `rc=2`, the path named, and `core.hooksPath` still `/elsewhere` afterwards. Sabotaged copy: `--check` gives `rc=1` and `OFF or broken`. Healthy: `--check` gives `rc=0` and `guard: on`. |
| **What it found** | Green, six scenarios, 2026-10-20. Writing them is what established that the migration branch is needed at all: a clone that had run the *old* installer carries `core.hooksPath` pointing into a checkout, and silently leaving that in place would have left exactly the defect `CM-5`'s last scenario is about. |
| **Shown able to fail** | The blob-id line removed → the staleness scenario reddens. The migration branch removed → a clone with the old setting keeps it and `--check` answers about the wrong file. `install -m 755` reduced to `cp` → nothing reddens here, because `cp` preserves the source mode; that is why `CM-3`'s executable-mode scenario exists on the tracked file. |
| **Implemented by** | `tests/integration/m-cm.guard-installed.test.ts`. |
| **Covers** | CM-FR5, **CM-FR6**. |

### CM-5 — git refuses it, which is the only thing that makes it a guard

| | |
|---|---|
| **Premise** | Everything above hands the hook a file. **Two defects lived precisely where that cannot look**, and both ended with the guard silently off: the hook dropped lines that `-m` and `-F` actually store, and the installed path lived in a checkout, so moving the main tree to an older branch disarmed every worktree at once. A hook is a guard only if git runs it on the message git stores. |
| **Component** | `git commit` itself, in the clone `CM-4` built, with the hook installed by `install.sh`. |
| **Steps** | Commit with `-m` subject and body; with `-F` from a file; the counterpart with prose; then `git checkout e3a391a` in the main tree and commit **from the worktree**, with its own counterpart in that same state; then a real `git merge --no-ff -m`, refused and then accepted. |
| **Test data, both sides, and why these** | Refused: `both are merged and resolved: #18` as a `-m` body — the incident's own sentence; `#18 is merged, and this closes #20`, a body line **beginning** with a reference, which is the shape `-m` stores and the hook used to drop, measured by the reviewer at rc 0 with the line committed intact; and `Merge cm-side, fixes #21` as a merge message. Must commit: `the #18 conflict, answered on #19`, and `Merge cm-side, the #21 round`. The commit the main tree moves to is **`e3a391a`**, this branch's merge base — chosen because it is the newest commit in this repository's history carrying no `scripts/hooks`, so the scenario is the repository's real state rather than a constructed one. |
| **Expected** | Non-zero and `commit-msg refused this message` for each refused message; `rc=0` for each counterpart; and the refusal holding while the main tree carries no `scripts/hooks` at all. |
| **What it found** | Green, six scenarios, 2026-10-20 — and the merge scenario was **green for the wrong reason** when first written: `cm-side` was branched at `HEAD`, so `git merge` answered *"Already up to date"*, made no commit and ran no hook. It is a real divergence now, with a side commit, which is the difference between measuring the merge and measuring nothing. |
| **Shown able to fail** | `sed -e '/^#/d'` restored → the `#`-line scenarios redden, both `-m` and `-F`. The installer pointed back at `${MAIN_ROOT}/scripts/hooks` → the checkout scenario reddens, which is the reviewer's reproduction turned into a case. |
| **Implemented by** | `tests/integration/m-cm.guard-installed.test.ts`. |
| **Covers** | CM-FR1, **CM-FR6**. |

### CM-6 — the agents in the stack write the same prose

| | |
|---|---|
| **Premise** | The agents in this stack push to declared GitHub repositories and write the same commit messages about pull requests. `FEATURE-commit-message-guard.md` §3 listed what is deliberately uncovered and they were not on the list — so they were neither guarded nor declared unguarded. A3 of the first review. |
| **Component** | `config/scripts/start/git.sh`, driven by `m-a4.hooks-path`'s existing fixture: a temporary project, two bare repositories declared in `.env`, and `M-A3c`'s ssh stand-in, so nothing crosses the network. |
| **Steps** | Run the start script, then read `/git-secrets/hooks` on the host side: the file is there and executable, and it is invoked against two messages. |
| **Test data, both sides** | Refused: `both are merged and resolved: #18`, the incident's sentence, so the agents' hook is measured against the same thing the operator's is. Must pass: `the #18 conflict, answered on #19` — because a hook that refused every agent commit would stop the stack's agents working, which is a worse failure than the one it guards. |
| **Expected** | `commit-msg` present in the shared hooks directory with an executable mode, `rc=1` and the refusal text for the first message, `rc=0` for the second. |
| **What it found** | Green, 2026-10-20, 5 / 0 on the file. One line in `git.sh` was enough because `core.hooksPath` there already points every agent clone at that directory — which is `A4-13`'s subject, so the two cases share a fixture rather than each building one. |
| **Why this is one `install` line and not a second mechanism** | The alternative on the table was to declare agents out of scope in §3. They are the population the incident came from: an agent wrote the message that closed #18. Declaring them uncovered would have been honest and useless. |
| **Implemented by** | `tests/contract/m-a4.hooks-path.test.ts`. |
| **Covers** | CM-FR1, CM-FR3. |

## 4. What is deliberately not here

- **That the hook is wired into *this* clone.** `core.hooksPath` is local configuration, so an
  assertion on it would be red in every clone that has not run the installer and green for a reason
  that has nothing to do with the code. That reasoning stands, and *until 2026-10-20 it was also used
  to avoid testing the installer at all*, which does not follow: a throwaway clone is not the
  reviewer's clone. `CM-4` and `CM-5` run the installer and `git commit` in one, so `CM-FR5` and
  `CM-FR6` are covered by cases now, and `scripts/hooks/install.sh --check` is what answers the
  question for a real clone at the moment it matters.
- **Pull request descriptions and titles.** The same keywords close the same references from either,
  and no local hook can see them. Both stay conduct, and `docs/FEATURE-commit-message-guard.md` §3
  says so — including why the **title** matters here, which is that this repository's
  `merge_commit_message` is `PR_TITLE`, so the merge button writes a title into a commit on `main`.
- **Whether GitHub honours a keyword split across a line break.** `CM-1` refuses that shape, and
  measuring what the forge does with it needs a commit pushed to a default branch. The decision is
  recorded as a cost comparison rather than a measurement: a false refusal costs a rephrase, a false
  pass costs a pull request. The same applies to `GH-12` as a closing form, which is refused on
  GitHub's documentation rather than on an observation.
- **A case per keyword inflection beyond the nine.** `closes`/`closed`/`close` share one branch in
  the pattern; the nine scenarios cover each keyword stem, each reference form, the colon and the
  case-insensitivity. Enumerating all twenty-seven products would add rows and no branch.

## 5. Traceability

| Requirement | Covered by |
|---|---|
| CM-FR1 a message that would close a reference is refused before the commit exists | **CM-1** |
| CM-FR2 the refusal names the offending line | **CM-1** |
| CM-FR3 text that names a reference without instructing anything passes | CM-2 |
| CM-FR4 closing on purpose remains possible, and is not silent | CM-3 |
| CM-FR5 enabling it is computed, not claimed | **CM-4**, and `install.sh --check` for a real clone |
| **CM-FR6 the guard git runs cannot be emptied by a checkout** | **CM-4**, **CM-5** |
| CM-FR1 in the stack's agent clones as well | **CM-6** |
