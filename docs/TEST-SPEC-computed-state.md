# Test specification — the state of the work is asked for, not remembered

Covers `scripts/state.sh`: one command that prints where the work stands — `main`'s head, the open
pull requests with their author and the forge's own review state, whether each open branch still
merges into its base, and the worktrees.

**Level: contract.** The script's subject is what it asks of `gh` and `git` and what it does with the
answers. The cases run a copy of it inside a **fixture repository whose `origin` is a local bare
repository**, with a **stub `gh` on PATH** — the idiom `B6-3` established for `mvn` and `A11-11` for
`docker`. No network is reached and nothing of the operator's checkout is read or written: the first
version fetched `origin main` from the operator's own clone over SSH, at file load, outside any
timeout, and failed in any checkout without an `origin/main`.

**Test file:** `tests/contract/m-a17.computed-state.test.ts`.

**Host requirements of the tool itself:** `gh`, and git **2.38 or newer** for
`git merge-tree --write-tree`. Ubuntu 22.04 ships 2.34.1, which answers `fatal: unknown rev
--write-tree` with exit 128 (measured 2026-10-20 in `ubuntu:22.04`); the script says so once instead
of putting that line under every branch.

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
| A17-1 | Precondition: a `jq` that runs | Precondition | Found on PATH and answering `--version` |
| A17-1 | The forge's answer is reported | Positive | `#9001` and `#9004` appear with label, date, author and branch |
| A17-1 | …in order of number | Positive | `#9001` … `#9004` in that order, although the forge answered `9002, 9001, 9004, 9003` |
| A17-1 | An unset decision | Positive | `""` reads `first review open`; `CHANGES_REQUESTED` reads `changes requested` |
| A17-1 | A review that only commented | Positive | `reviewed, no decision` — not `first review open` |
| A17-1 | `main`'s head | Positive | The fixture origin's own head line, read from git |
| A17-1 | A diverged branch touching another file | Positive | `clean` |
| A17-1 | A branch colliding with main | **Negative** | `CONFLICT: shared.txt` |
| A17-1 | A stacked branch | Positive | `clean  (into lu-a17/collides)` — judged against its base, where against main it conflicts |
| A17-1 | A branch that cannot be fetched | **Negative** | `CANNOT TELL: could not fetch it`, although a stale ref that would merge clean is lying there |
| A17-1 | No `gh` on PATH | **Negative** | Exit 2, the message naming the tool, and **no** pull request section |
| A17-1 | A forge that refuses | **Negative** | Exit 3, gh's own message, and neither the table nor the merge section |
| A17-1 | A forge that stops answering mid-run | **Negative** | Exit 0 and a merge row for every branch in the table |
| A17-1 | A forge that answers nothing open | Positive | Exit 0, `none`, and `main`'s line still standing |
| A17-1 | A list as long as the limit | **Negative** | `asked for at most 100; there may be more` |
| A17-1 | A shorter list | Positive | No such line |
| A17-1 | A git without `merge-tree --write-tree` | **Negative** | One `CANNOT TELL for any branch` naming 2.38 and the version found, and no branch judged |
| A17-2 | Precondition: this git can `merge-tree --write-tree` | Precondition | A tree id |
| A17-2 | Two branches editing one line | **Negative** | `CONFLICT: shared.txt` |
| A17-2 | A modify/delete conflict | **Negative** | `CONFLICT: doomed.txt` — not `CONFLICT: tree.` |
| A17-2 | The same conflict under a German locale | **Negative** | `CONFLICT: shared.txt` — not `CANNOT TELL`; skipped where git has no German catalogue |
| A17-2 | A diverged branch touching another file | Positive | `clean` — without it, "always conflict" passes the rows above |
| A17-2 | A ref this host does not have | **Negative** | `CANNOT TELL (git exited 1)`, neither clean nor a conflict |

## Detail

### A17-1 — the state of the work, computed

| | |
|---|---|
| **Premise** | Two copies of one fact, and only one of them changes when something merges. The tool that replaces the narrated copy has to be right about what it reports and loud about what it could not measure — otherwise it is the same defect with a command in front of it. |
| **Component** | `scripts/state.sh`, a copy run from `work/scripts/` inside the fixture, so that its `cd` to its own project lands in the fixture. |
| **Steps** | Build the fixture (below). Write a stub `gh` into a fresh directory and put it first on PATH. Run the script with the fixture as working directory. Split the output at its `=== … ===` headings and assert per section — never over the whole output, so a line in one section cannot satisfy an assertion about another. |
| **Test data — the repository** | A bare `origin.git` and a clone `work`. Base commit `lu-a17 base`: `shared.txt` = `original`, `other.txt` = `untouched`, `doomed.txt` = `kept`. From it: `lu-a17/collides` sets `shared.txt` to `theirs`; `lu-a17/stacked`, on top of that, adds `stacked.txt` = `on top`; `lu-a17/agrees` sets `other.txt` to `changed elsewhere`; `lu-a17/deletes` removes `doomed.txt`. Then `main` moves on: `lu-a17 fixture head` sets `shared.txt` to `ours` and `doomed.txt` to `changed on main` — so `agrees` has **diverged** from main rather than descending from it. All five are pushed. Finally `refs/remotes/origin/lu-a17/gone` is pointed at `lu-a17/agrees`'s commit while origin has no such branch: the stale ref a branch deleted upstream leaves behind, and one that would merge clean. |
| **Test data — the forge** | The JSON `gh pr list --json number,author,reviewDecision,reviews,headRefName,baseRefName,updatedAt` returns, in the order `9002, 9001, 9004, 9003`: `#9002` `probe-ours` `CHANGES_REQUESTED` with one `CHANGES_REQUESTED` review, `lu-a17/collides` into `main`; `#9001` `probe-ours`, decision `""`, no reviews, `lu-a17/agrees` into `main`; `#9004` `probe-theirs`, decision `""`, no reviews, `lu-a17/gone` into `main`; `#9003` `probe-ours`, decision `""`, one `COMMENTED` review, `lu-a17/stacked` into `lu-a17/collides`. **The numbers and names are invented on purpose**: the first version used `#41 fix/teardown-orphans` and `#15 feature/openclaw-pairing-recovery`, and `main`'s head line is `Merge pull request #N from nocodenation/<branch>` — while `c99044c` (#15) was the head, the order assertion passed with the sort removed. |
| **The stub** | Takes the `--jq` argument the script passes and runs it through a real `jq -r` over that JSON, so the script's own expression is exercised. `gh --jq` is gojq inside `gh`; the expression uses only `if`, `//`, `length`, `ascii_downcase`, `gsub`, slicing and `join`, which both implement alike. Three modes: answer; refuse every call (`HTTP 401: Bad credentials`, exit 1); answer once and refuse after — a rate limit hitting mid-run. Further stubs: an empty answer `[]`; 100 copies of `#9001` numbered `9100`–`9199`; and a `git` wrapper that answers `merge-tree … --write-tree` with `fatal: unknown rev --write-tree` and exit 128 and `--version` with `git version 2.34.1`, as Ubuntu 22.04's git did on 2026-10-20, and is real git otherwise. |
| **The PATH for the absent `gh`** | A directory holding symlinks to `bash` and `dirname` and nothing else. `bash` because the shebang is `#!/usr/bin/env bash` and `env` searches PATH — with no bash the case measures the shebang, walked into on 2026-10-17. `dirname` because the script needs it before the check. **`/usr/bin` is not on it**: GitHub's own `.deb` and Debian's `gh` package both install `/usr/bin/gh` (measured 2026-10-20 from `gh_2.102.1_linux_amd64.deb` and `apt-get download gh` in `debian:bookworm-slim`), so the first version found the real `gh` on every Linux host that has it. The case asserts that `command -v gh` fails on that PATH before it believes the refusal. |
| **Expected** | Rows as in the overview. Exit 0 wherever the forge answered; 2 without `gh`; 3 when the forge refused. |
| **Dependencies** | `git` 2.38 or newer and `bash` on the test host; a `jq` that **runs** — checked by its own precondition case. On this host the first `jq` on PATH, `/usr/local/bin/jq`, is an x86_64 build from 2022 with no Rosetta to run it; zsh silently falls through to `/usr/bin/jq` where bash does not, so the case searches PATH for one that answers `--version`. No network, no forge, nothing of the operator's. |
| **Shown able to fail** (measured 2026-10-20, each reverted alone) | The single `gh` call split back into a second, unchecked one for the walk: **1** red, the mid-run case. Judging every branch against `main`: **1**, the stacked case. A failed fetch swallowed again: **1**, the stale-ref case. The `COMMENTED` arm removed: **1**. The `//` trap restored: **7** — the empty label is also an empty field, and bash's tab split shifts every column after it, so the walk breaks too. The sort removed: **1**. The `gh` check removed: **1**. A refused forge carried on as an empty answer: **1**. The limit line removed: **1**. The old-git probe removed: **1**. |
| **What it found** | Its first version was reviewed on 2026-10-20 and fifteen findings were checked against the real system before anything was changed. Among them: the absent-`gh` case would have failed on every Linux host with `gh` installed; the forge's second answer was never checked; a stacked pull request was judged against the wrong base; a review that only commented read as no review at all. |
| **What it does not cover** | That the reported state is *correct*. The forge is the authority; this asks it and prints the answer. A case asserting a particular number of open pull requests would be the stale-copy defect, in a test. |
| **Implemented by** | `tests/contract/m-a17.computed-state.test.ts`. |
| **Covers** | A17-1. |

### A17-2 — a conflict is reported as a conflict

| | |
|---|---|
| **Premise** | The merge check is the half of this tool that replaces a judgement, so it has to be right in both directions, on any host it runs on. |
| **Component** | `lu_merge_state` in `scripts/state.sh`, evaluated out of the script — the idiom `B6-3` established, so the case cannot pass against a reimplementation — and called inside `$(...)` under `set -euo pipefail`, **as the script calls it**. |
| **Steps** | Build the A17-1 fixture. Assert this git can `merge-tree --write-tree`. Ask git once whether it prints `KONFLIKT` under the German locale. Then hand the function each pair below and compare its one line of output. |
| **Test data, both sides** | From the fixture: `main` against `lu-a17/collides` (both rewrote `shared.txt`'s one line), against `lu-a17/deletes` (it deleted `doomed.txt`, which main modified), against `lu-a17/agrees` (diverged, other file) and against `origin/nothing-like-this`, which does not exist. The German locale is `LC_ALL=de_DE.UTF-8`, `LANG=de_DE.UTF-8`, `LANGUAGE=de` — `LANGUAGE` too, because the suite's shell helper pins it to `C` and gettext reads it first. |
| **Expected** | `CONFLICT: shared.txt`; `CONFLICT: doomed.txt`; `CONFLICT: shared.txt` under German; `clean`; `CANNOT TELL (git exited 1)` that is not `clean`. |
| **Dependencies** | git 2.38 or newer — its own precondition case. The German case skips where git has no German catalogue, and asks git first rather than assuming: without the translation it would pass against English and prove nothing. On this host the catalogue is there and the case runs. |
| **History, corrected** | The first version had three repairs, each recorded as shell error semantics meeting another. Repair 1 was real: under `pipefail` a grep of `merge-tree`'s output inside an `if` reported **every conflicting branch as clean**, and called #16 clean while the forge called it `CONFLICTING`. Repair 2 was real: a missing ref also exits 1. **Repair 3 was not a defect of the script.** It added `|| true` because `set -e` aborted the function before it printed `clean` — but only in the case, which called the function bare. Bash clears `set -e` inside a command substitution, and the script only ever calls it inside one; measured under `/bin/bash` 3.2: bare, the function without `|| true` exits 1 and prints nothing; inside `$(...)` it prints `clean`. The case calls it the script's way now. |
| **Why the conflicted files come from the name list** | The first version read them out of git's `CONFLICT` messages with `grep '^CONFLICT' \| sed 's/.*in //'`. Those messages are translated — `KONFLIKT (Inhalt): Merge-Konflikt in shared.txt` under `de_DE`, and `CONFLIT` in French — so on a German-locale machine every real conflict read `CANNOT TELL`. They are also worded per kind: a modify/delete ends `…left in tree.`, and was reported as a conflict in a file called `tree.`. Both measured 2026-10-20. `--name-only` prints the paths between the tree id and the first blank line, untranslated and whole. |
| **Shown able to fail** (measured 2026-10-20) | The old grep-and-sed naming restored: **2** red — the modify/delete case and the German case. The tree-id check removed, so a status of 1 alone means conflict: **1**, the missing ref, which then reads as a conflict. |
| **Implemented by** | `tests/contract/m-a17.computed-state.test.ts`. |
| **Covers** | A17-2. |

## What is deliberately not here

- **Splitting `HANDOFF.md`'s lessons into their own document.** The backlog entry asks for it, and it
  stays open: four other documents cite the handover as the place a rule lives, and #19 carries an
  older copy of that file on its branch. Moving files under a reviewer mid-review is how a review gets
  read twice. What this change does instead is remove the half that **goes stale** — the state — so
  the file holds the map and the lessons, which do not.
- **A command that writes the state into the document.** That would make a third copy and a fourth
  way for it to disagree. The document points at the command.

## Traceability

| Requirement | Covered by |
|---|---|
| The state of the work is computed from the forge and from git, never narrated | A17-1 |
| A review decision is reported as the forge holds it, and a comment-only review as a review | A17-1 |
| Each branch is judged against its own base | A17-1 |
| A tool that cannot measure says so — no `gh`, a refusing forge, an unfetchable branch, an old git, a truncated list | **A17-1** negatives |
| A conflict is reported as a conflict, in any locale and of any kind, and an unanswerable question as unanswerable | **A17-2** |
