# Test specification — the state of the work is asked for, not remembered

Covers `scripts/state.sh`: one command that prints where the work stands — `main`'s head, the open
pull requests with the forge's own review state, whether each open branch still merges, and the
worktrees.

**Level: contract.** The script's subject is what it asks of `gh` and `git` and what it does with the
answers, so the cases run it with a **stub `gh` on PATH** — the idiom `B6-3` established for `mvn` and
`A11-11` for `docker`. No network, no forge, and nothing of the operator's is read but `git`.

**Test file:** `tests/contract/m-a17.computed-state.test.ts`.

## Why it exists

`HANDOFF.md` carried the state of every pull request in prose, and prose does not keep up:

| When | What the document said | What was true |
|---|---|---|
| 2026-10-16 | #21 *"never reviewed"*, in two tables | a review of #21 was being answered that day |
| 2026-10-17 | *"Nine of ours are open"*, in its own current section | **twelve** were, hours after it was written |

The first was raised by the reviewer as `F4` of his round on #21 — so a reader did trust it, which is
the answer to any argument that a dated section cannot mislead. `CLAUDE.md` is explicit about which
of the two to reach for: *"prefer a computed answer to a rule an agent has to remember… A computed
answer reads current state, so it cannot go stale."* A count of open pull requests is a fact, not a
judgement.

## Overview

| # | Scenario | Kind | Expectation |
|---|---|---|---|
| A17-1 | The forge's answer is reported | Positive | Both stubbed pull requests appear, with their review state |
| A17-1 | …in order of number | Positive | `#15` before `#41`, although the stub printed them the other way round |
| A17-1 | `main`'s head | Positive | Read from `git`, so a forge that answers nothing still leaves that line standing |
| A17-1 | No `gh` on PATH | **Negative** | Non-zero exit, a message naming the tool, and **no** pull request section — *"cannot measure" is not "nothing is open"* |
| A17-1 | An unset review decision | Positive | Tested for the empty string, not left to `//` |
| A17-2 | Two branches editing one line | **Negative** | Reported as conflicting, with the file named |
| A17-2 | A branch touching another file | Positive | Reported clean — without this, "always conflict" passes the row above |
| A17-2 | A ref this host does not have | **Negative** | Neither clean nor a conflict: it says it cannot tell |

## Detail

### A17-1 — the state of the work, computed

| | |
|---|---|
| **Premise** | Two copies of one fact, and only one of them changes when something merges. The document's own convention says to believe the newest dated section, and that convention failed in practice: the reviewer read the old one and asked for it to be corrected. |
| **Component** | `scripts/state.sh`. |
| **Test data, both sides** | A stub `gh` printing two tab-separated rows — `#41 first review open … fix/teardown-orphans` and `#15 changes requested … feature/openclaw-pairing-recovery`, deliberately out of order — and, for the negative, a PATH holding an empty directory plus `/usr/bin:/bin`, which has `bash` and no `gh`. |
| **Why the system directories stay on PATH for the negative** | Walked into on 2026-10-17: with a PATH of nothing at all, the script's own `#!/usr/bin/env bash` cannot be resolved, so the case measures the shebang instead of the refusal. `gh` lives in `/opt/homebrew/bin` on this host and in `/usr/local/bin` elsewhere; neither is on that PATH. |
| **Expected** | Exit 0 with both rows and the real `main` head for the stubbed run; a non-zero exit, `needs the gh CLI`, the *"cannot measure"* sentence, and **no** `open pull requests` heading for the other. |
| **The third case reads the script's text, and says so** | `gh`'s `--jq` runs inside `gh`, so a stub cannot exercise the expression. That expression carries a trap worth a case of its own: an unset `reviewDecision` arrives as an **empty string**, not as null, so `.reviewDecision // "first review open"` keeps the empty string and every pull request reads as reviewed. Walked into on 2026-10-17 in a hand-run that marked all eleven open pull requests as having a decision. |
| **Why `merge-tree` and not the forge's `mergeable` field** | The forge computes it lazily and answers `UNKNOWN` for minutes after a push — measured repeatedly on 2026-10-16, where every branch read `UNKNOWN` while `git merge-tree` answered immediately and correctly. |
| **Shown able to fail** | Removing the `gh` check reddens **1** — the script then prints a picture with the pull requests silently missing, which is the defect it exists against. Removing the `sort` reddens **1**. Putting the `//` trap back reddens **1**. |
| **What it does not cover** | That the reported state is *correct*. The forge is the authority; this asks it and prints the answer. A case asserting a particular number of open pull requests would be the stale-copy defect, in a test. |
| **Implemented by** | `tests/contract/m-a17.computed-state.test.ts`. |
| **Covers** | A17-1. |

### A17-2 — a conflict is reported as a conflict

| | |
|---|---|
| **Premise** | The merge check is the half of this tool that replaces a judgement, so it has to be right in both directions. It was not, three times, and each one was shell error semantics meeting another. |
| **Repair 1, found by using it on 2026-10-20** | The check grepped `merge-tree`'s output inside a pipeline. `git merge-tree` **exits 1 on conflict**, `set -o pipefail` hands the pipeline that 1, and the `if` took the else arm — so **every conflicting branch was reported clean**. It called #16 clean while the forge called it `CONFLICTING`, three days after this tool was written to replace a stale narrative with a computed one. The status is the authority now. |
| **Repair 2, found by the case below within minutes** | A ref this host does not have **also** exits 1 — `merge-tree: <ref> - not something we can merge` — so a missing branch was reported as a conflict in a file called nothing. The status says *that* it failed; only the output says *which kind*. |
| **Repair 3, found by the same case** | `named="$(… | grep -i '^CONFLICT' | …)"` — grep exits 1 when it finds nothing, pipefail hands that to the assignment, and `set -e` aborted the function **before** it printed `clean`. A clean merge produced an empty answer. `|| true` on the grep. |
| **Component** | `lu_merge_state` in `scripts/state.sh`, evaluated out of the script by the case — the idiom `B6-3` established, so the case cannot pass against a reimplementation. |
| **Test data, both sides** | A `mkdtemp` git repository built by the case: a base commit with `shared.txt` and `other.txt`; a branch that rewrites `shared.txt`'s only line while `main` rewrites it differently; a branch that changes `other.txt` instead; and `origin/nothing-like-this`, which does not exist. Three answers, three distinct states. |
| **Expected** | `CONFLICT` naming `shared.txt`; `clean`; and `CANNOT TELL` that is not `clean`. |
| **What this case is worth** | It caught repairs 2 and 3 immediately, which is the argument for writing it rather than fixing repair 1 and moving on. A function whose three bugs all hid in error handling is not one to trust by reading. |
| **Implemented by** | `tests/contract/m-a17.computed-state.test.ts`. |
| **Covers** | A17-2. |

## What is deliberately not here

- **Splitting `HANDOFF.md`'s lessons into their own document.** The backlog entry asks for it, and it
  stays open: four other documents cite the handover as the place a rule lives, twelve pull requests
  are open, and #19 carries an older copy of that file on its branch. Moving files under a reviewer
  mid-review is how a review gets read twice. What this change does instead is remove the half that
  **goes stale** — the state — so the file holds the map and the lessons, which do not.
- **A command that writes the state into the document.** That would make a third copy and a fourth
  way for it to disagree. The document points at the command.

## Traceability

| Requirement | Covered by |
|---|---|
| The state of the work is computed from the forge and from git, never narrated | A17-1 |
| A conflict is reported as a conflict, and an unanswerable question as unanswerable | **A17-2** |
| A tool that cannot measure says so and prints nothing | **A17-1** negative |
| An unset review decision is not read as a decision | A17-1 |
