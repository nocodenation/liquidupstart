# Test specification — the commit message that closed a pull request

Covers `scripts/hooks/commit-msg` and `scripts/hooks/install.sh`, specified in
`docs/FEATURE-commit-message-guard.md`.

## 1. What is being tested, and at which level

The hook is a text decision: message in, exit status and a named line out. It touches no container,
no network and no stack, so it belongs at the **unit** level and runs in the default tier — a guard
that only runs when someone remembers `--system` is not a guard.

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
| **CM-1** | **negative** | …and the refusal names line 4 and the text `resolved: #18` |
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
| **CM-2** | positive | A `#`-comment line carrying the exact offending pattern |
| **CM-2** | positive | Text under the verbose-commit scissors carrying it |
| **CM-3** | positive | `ALLOW_CLOSING_KEYWORD=1` passes the refused message **and** says so on stderr |
| **CM-3** | **negative** | Any other value of that variable does not pass it |
| **CM-3** | positive | The tracked hook is executable, so a fresh clone can run it |

## 3. Detail

### CM-1 — the forms that close something

| | |
|---|---|
| **Premise** | GitHub applies `close`, `fix` and `resolve`, in every inflection, in any case, with an optional colon, to the reference that follows, and it does so for pull requests as well as issues. A message is prose to its author and an instruction to the forge. |
| **Component** | `scripts/hooks/commit-msg`, invoked as git invokes it. |
| **Steps** | Write each message to a file in a `mkdtemp` directory; run the hook with that path; read the exit status and both streams. |
| **Test data, and why this one** | The first scenario's message is **the real one**, kept verbatim rather than paraphrased: the six lines of `5aa5bc9` ending `both are merged and resolved: #18, where both sides appended an`. A case about prose that reads as an instruction has to be run against the prose that did it, or it only proves the pattern matches an invention. The remaining seven are the keyword and reference forms GitHub documents, one scenario each, with numbers (`#5`, `#7`, `#12`, `#19`) that are not the incident's so a false pass cannot borrow its text. The ninth row is the second assertion on the first scenario rather than a tenth message: the line it names. |
| **Expected** | `rc=1` in every scenario. For the first, the output contains `resolved: #18` and a line beginning `4:`. |
| **What it found** | Green on first run, 2026-10-16, against the hook written earlier the same day. The hook had already been measured by hand against the same real message before this file existed; these cases are that measurement made repeatable. |
| **Shown able to fail** | With the hook replaced by `#!/bin/sh\nexit 0`, 10 of the 17 cases redden — every scenario of CM-1 and CM-3's negative. |
| **Implemented by** | `tests/unit/m-cm.commit-message-guard.test.ts`. |
| **Covers** | CM-FR1, CM-FR2. |

### CM-2 — the counterpart, which is where the worth of this is decided

| | |
|---|---|
| **Premise** | A guard that refused every `#12` would pass all nine of CM-1 perfectly and make this repository uncommittable: `HANDOFF.md`, every backlog entry and most commit messages here name pull requests. The refusals are only worth having if the permissions hold. |
| **Component** | The same script. |
| **Steps** | As CM-1, reading the exit status, and asserting on the output when it is non-zero so a failure says why. |
| **Test data, both sides** | Four shapes that must pass, each chosen against a way the pattern could be written too greedily: **`the #18 conflict, answered on #19, resolved in BACKLOG.md`** — the wording this repository now uses, and it contains the word `resolved` followed later by a reference; **`see #18 and #19 for the rounds this answers`** — references with no keyword at all; **`this closes the gap #18 left open`** — a keyword and a reference in one sentence with a word between them, which is the boundary the pattern decides; and the **correction commit's own message**, which discusses the keyword in prose and would be refused by a guard that matched the word anywhere. Plus two shapes git removes before the forge sees them: a `#`-comment line and text under `------------------------ >8 `, both carrying the exact offending pattern. |
| **Expected** | `rc=0` in all six. |
| **What it found** | Green. The comment-line scenario is the one that was not obvious: without it, `git commit --verbose` would be refused for the diff it appends. |
| **Shown able to fail** | With the hook replaced by `#!/bin/sh\nexit 1`, 8 of the 17 redden — every scenario of CM-2 and CM-3's positive. |
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
| **What it found** | Green. The `yes` scenario exists because `[ "$v" = "1" ]` and "is it set at all" are a one-character difference in shell, and the second would make `ALLOW_CLOSING_KEYWORD=0` disable the guard. |
| **Implemented by** | `tests/unit/m-cm.commit-message-guard.test.ts`. |
| **Covers** | CM-FR4. |

## 4. What is deliberately not here

- **That the hook is wired into this clone.** `core.hooksPath` is local configuration, so an
  assertion on it would be red in every clone that has not run the installer and green for a reason
  that has nothing to do with the code. The installer computes it instead, at the moment it matters,
  and fails loudly: it runs the hook against a message that must be refused and one that must pass.
  **`CM-FR5` is therefore covered by `scripts/hooks/install.sh` itself rather than by a case here**,
  which is stated so the gap reads as a decision.
- **Pull request descriptions.** The same keywords close the same references from a description and
  no local hook can see one. It stays conduct, and `docs/FEATURE-commit-message-guard.md` §3 says so.
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
| CM-FR5 enabling it is computed, not claimed | `scripts/hooks/install.sh` self-test — see §4 |
