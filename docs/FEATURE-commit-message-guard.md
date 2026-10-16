# Feature: a commit message must not close what it only names

A `commit-msg` hook, tracked in `scripts/hooks/`, that refuses a message in which GitHub's closing
keywords fall in front of an issue or pull request reference.

## 1. Purpose

On **2026-10-16** a documentation commit on `main`, `5aa5bc9`, carried this line in its message:

```
BACKLOG.md, and both are merged and resolved: #18, where both sides appended an
```

It was prose. It described two pull requests whose `BACKLOG.md` conflicts had been merged. GitHub
read `resolved: #18` as an instruction, and **closed pull request #18** — the mutation runner, with
four answered review rounds on it — at 09:58:04Z, 38 minutes after #10 merged.

Three things made it expensive out of proportion to the typo:

1. **The attribution pointed at a person.** GitHub names whoever pushed as the actor of the close.
   The timeline read `closed by cdilcher`, the operator had not touched the pull request, and the
   session believed the timeline. `HANDOFF.md` carried that accusation for an hour.
2. **Nothing surfaced it at the moment it happened.** The commit was one of five that afternoon. The
   closure was noticed only because a routine count of open pull requests came out one short.
3. **The evidence was there from the start and was not read.** The `closed` event carries a
   `commit_id`. One API call —
   `gh api /repos/<owner>/<repo>/issues/18/timeline --jq '.[] | select(.event=="closed")'` — returns
   `5aa5bc9` and settles it. It took three wrong readings to make that call.

The repair is not a rule to remember. `CLAUDE.md` is explicit about which of the two to reach for:
*"Prefer a computed answer to a rule an agent has to remember… A computed answer reads current state,
so it cannot go stale… and it removes the reasoning step rather than making it easier."* The message
is on disk before the commit exists, the pattern is decidable, and `git` already offers the hook that
reads it. So the answer is computed.

## 2. Decisions

- **`commit-msg`, not `pre-commit`.** It is the only hook that is handed the message. It runs before
  the commit object exists, so a refusal costs nothing and the message survives in
  `.git/COMMIT_EDITMSG`.

- **Tracked in `scripts/hooks/`, enabled by `core.hooksPath`.** Git does not version `.git/hooks`, so
  a hook that lives only there protects one machine and no clone. The script is therefore repository
  content, and `scripts/hooks/install.sh` sets `core.hooksPath` for a clone. That setting is local by
  nature and cannot be committed; one run per clone covers every worktree of it.

- **The path is written absolute, against the main working tree.** Two alternatives were rejected for
  reasons that are states this repository is actually in. A path into a *worktree* dies with that
  worktree, and `core.hooksPath` pointing at a directory that no longer exists **does not fail** —
  git finds no hooks and proceeds, so the guard would be off and nothing would say so. A *relative*
  `scripts/hooks` makes each worktree use its own copy, and the nine branches open when this was
  written carry none, so committing on any of them would be unguarded. The installer refuses, with
  the reason, when the main tree does not carry the script yet.

- **An override, and a loud one.** A commit may legitimately close an issue; that is what the keywords
  are for. `ALLOW_CLOSING_KEYWORD=1 git commit` passes, and says on stderr which line it let through.
  A guard that forbids a real workflow gets worked around — `--no-verify`, or deleted — rather than
  used, and then it protects nothing.

- **Refuse, rather than rewrite.** A hook that edited the message would decide for the author where
  the word belongs. The message is the author's; the hook's job is to say that this one would do
  something it probably does not intend, and to name the line.

- **Comment lines and the scissors are not message.** `git` strips `#`-comments and everything under
  `------------------------ >8 ` before it stores the message, so the forge never sees them, and
  neither does the hook. Without that, `git commit --verbose` would be refused for the diff it shows.

## 3. What this does not cover, deliberately

- **Pull request descriptions.** The same keywords close the same references from a description, and
  no local hook can see one. It stays conduct: write *"the #18 conflict"* or *"on #18"*. Recorded
  here rather than left implicit, because a reader who assumes the guard covers both has a false
  sense of the gap.
- **Comments.** Keywords in an issue or pull request comment do not close anything; nothing is needed
  there.
- **The forge's own behaviour.** Nothing here changes what GitHub does, nor can it recover a
  reference already closed. `gh pr reopen <n>` restores the state, and the review decision and head
  survive the round trip, which was measured on #18.
- **Other forges.** The keyword list and the reference forms are GitHub's. A different forge needs its
  own pattern.

## 4. Requirements

- **CM-FR1 — A message that would close a reference is refused before the commit exists.** Every
  keyword GitHub honours (`close`, `fix`, `resolve`, and their `-s`/`-d`/`-es` forms, any case, with
  or without a colon) against every reference form it honours (`#12`, `GH-12`, `owner/repo#12`, and
  full `issues/` or `pull/` URLs).
- **CM-FR2 — The refusal names the offending line.** A count or a verdict alone leaves the author
  hunting; the line number and the text are what make the fix a single edit.
- **CM-FR3 — Text that names a reference without instructing anything passes.** Including the word
  `resolved` used as ordinary English about something that is not a reference. A guard that refused
  every `#12` would make this repository's own documentation uncommittable, and would pass every
  negative case perfectly.
- **CM-FR4 — Closing on purpose remains possible, and is not silent.** One environment variable,
  reported on stderr when it is used.
- **CM-FR5 — Enabling it is computed, not claimed.** The installer verifies its own effect by running
  the hook against a message that must be refused and one that must pass, and fails if either answers
  wrongly. It also reports which hooks under `.git/hooks` the setting switches off.

## 5. Enabling it

```bash
./scripts/hooks/install.sh      # once per clone, from the main working tree
git config --get core.hooksPath  # /…/liquidupstart/scripts/hooks
```

The run prints the path it set and the result of its own self-test. Where `core.hooksPath` already
points somewhere else, it refuses rather than overwrite, and prints the command that would.

## 6. Process log

- **2026-10-16** — #18 closed by `resolved: #18` in `5aa5bc9`; found via the `closed` event's
  `commit_id` after three wrong readings, one of which was written into `HANDOFF.md` and blamed the
  operator. Reopened with `gh pr reopen 18`; `CHANGES_REQUESTED` and the head `59272f5` survived.
  A machine-local hook was written and tested against the real message the same day; this is that
  hook, made the repository's.
