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

- **The hook is copied into the shared hooks directory, not pointed at.** *Corrected 2026-10-20; the
  first answer here was wrong in the way it ruled out.* It said the path should be written absolute
  against the main working tree, on the grounds that a path into a *worktree* dies with that worktree
  and `core.hooksPath` pointing at a directory that no longer exists **does not fail** — git finds no
  hooks and proceeds, so the guard is off and nothing says so. That reasoning is right, and it
  condemns the main working tree too: `<main tree>/scripts/hooks` is **content of a checkout**, so the
  moment the main tree checks out a branch that predates the guard the directory is empty and the same
  silent-off state is reached from every worktree at once. The reviewer reproduced it on 2026-10-20 —
  install, add a worktree, `git checkout e3a391a` in the main tree, and the worktree committed `both
  are merged and resolved: #18` with rc 0. Every other open branch of this repository predates
  `scripts/hooks`, so `gh pr checkout <n>` in the main clone was enough to disarm it.

  `$(git rev-parse --git-common-dir)/hooks` is shared by every worktree and belongs to no checkout, so
  nothing a branch does can empty it. `install.sh` copies the hook there, and `core.hooksPath` is then
  not needed at all; an earlier setting that points into a checkout is migrated away and said out loud,
  and a foreign one is still refused. The price of a copy is that it can fall behind its source, and
  that price is **computed rather than remembered**: the installer writes the source blob id beside the
  copy, and the hook compares it with `origin/main:config/agents/hooks/commit-msg` on every run, printing one
  line on stderr when they differ. A clone with no such ref — an agent clone in the stack — says
  nothing.

- **Whether the guard is on is a question, not a memory.** `scripts/hooks/install.sh --check` exits 0
  only when the hook git will actually run for this clone refuses the self-test message. This exists
  because the author's own comment on #35 reported the guard as off on their machine, which at the time
  could only be recalled rather than asked. `CLAUDE.md` names the command.

- **An override, and a loud one.** A commit may legitimately close an issue; that is what the keywords
  are for. `ALLOW_CLOSING_KEYWORD=1 git commit` passes, and says on stderr which line it let through.
  A guard that forbids a real workflow gets worked around — `--no-verify`, or deleted — rather than
  used, and then it protects nothing.

- **A guard that cannot read the message refuses it.** *Added 2026-10-20, and it was the most
  serious defect this feature had.* It failed **open**: under a UTF-8 locale — the operator's normal
  state in Terminal.app — one byte invalid in that locale makes BSD `sed` exit with `RE error: illegal
  byte sequence`, `body` was then empty, nothing matched, and the message was **permitted**. Measured
  on git 2.48.1: a message with one Latin-1 byte in its subject and the incident's own sentence, pure
  ASCII, in its body commits with rc 0 under `LC_ALL=en_US.UTF-8` and is refused under `LC_ALL=C`. GNU
  sed handles the same file, so the hole belonged to the machine the guard was written and reviewed on
  — and `tests/lib/shell.ts` pins `LC_ALL=C` for every case, which is why no test could see it in
  either direction.

  Two answers, because the locale is one cause and not the class. The hook exports `LC_ALL=C`, so both
  tools work on bytes, which is what a pattern of ASCII keywords wants. And **every step's status is
  read**: a failure to look is not a finding of nothing. A commit refused because the guard could not
  read it costs a rephrase and says so in those words; a commit permitted because the guard broke
  costs what this hook exists to prevent. `CM-7` holds it across three locales, setting them itself.

- **Refuse, rather than rewrite.** A hook that edited the message would decide for the author where
  the word belongs. The message is the author's; the hook's job is to say that this one would do
  something it probably does not intend, and to name the line.

- **The scissors are not message; comment lines are.** *Corrected 2026-10-20.* This said that git
  strips `#`-comments as well, so neither the forge nor the hook sees them. **Git strips them only
  under `--cleanup=strip`, which is the default when the message comes from an editor.** With `-m` or
  `-F` the default is `whitespace` and the lines are stored verbatim — and `-m`/`-F` is how an agent
  commits. Measured by the reviewer: `git commit -m 'docs: x' -m '#18 is merged, and this closes #20'`
  committed with rc 0 and the line intact, as did the same text through `-F`. A paragraph wrapped at 72
  columns starts a line with `#NN` often enough for that to matter, and `core.commentChar` can be
  something else again.

  So the hook reads every line and cuts only below `------------------------ >8 `, which keeps
  `git commit --verbose` committable. Editor mode is unaffected: git's template carries no keyword in
  front of a reference. Verified across all **510** non-merge messages on `main` — the verdicts are
  unchanged and the single refusal is still `5aa5bc9`, now reported at its real line `10:` rather than
  shifted by however many `#` lines had been dropped above it.

- **A keyword is a word, and a wrapped line is still one sentence.** Two further repairs of the
  pattern, both from the same round. The alternation had no left boundary, so any word *ending* in a
  keyword counted: `prefix #12`, `hotfix #12`, `bugfix #12`, `the unresolved #12 thread`,
  `disclosed: #12`, `enclosed #12` and `suffixed #12` were all refused, and "unresolved" beside a
  reference is ordinary prose in this repository's reviews. And `grep` reads one line at a time, so the
  incident's own sentence wrapped two words earlier — `resolved:` ending one line, `#18, where both
  sides` opening the next — went straight through. A second pass over adjacent pairs runs only when the
  first finds nothing, and reports the **first** line of the pair, which is where the keyword is.
  Whether GitHub honours a keyword split across a line break is **not verified**: measuring it needs a
  commit pushed to a default branch. The costs decide it — a false refusal costs a rephrase, a false
  pass costs a pull request with its review rounds.

## 3. What this does not cover, deliberately

- **Pull request descriptions, and titles.** The same keywords close the same references from a
  description, and no local hook can see one. It stays conduct: write *"the #18 conflict"* or
  *"on #18"*. **Titles belong here too, and were missing until 2026-10-20** — A4 of the first review.
  Read out of the forge rather than recalled, 2026-10-20: `merge_commit_title: MERGE_MESSAGE`,
  `merge_commit_message: PR_TITLE`, `squash_merge_commit_title: COMMIT_OR_PR_TITLE`,
  `squash_merge_commit_message: COMMIT_MESSAGES`.

  So the **merge** button writes the pull request title into the commit **body** on `main`, which
  `3a2ef0f` shows — its body is PR #21's title — and the hook never sees it, because no commit is made
  locally. And the **squash** button writes the pull request title as the commit **subject** whenever
  the branch has more than one commit, which `COMMIT_OR_PR_TITLE` means: this branch has three, so it
  is in that population. A rebase merge carries the branch's own commits, which the hook has read.
  *Two of the three merge buttons can therefore put an unguarded title on `main`, and this paragraph
  said the squash path was covered.*

  **And a sentence that stood here was invented, so it is withdrawn.** It read *"which `3a2ef0f`
  shows: a title carrying `Fixes #12` closes #12 at merge"*. `3a2ef0f` carries no closing keyword at
  all, and the forge's own timeline for #12 reads `{event: closed, commit_id: null, actor: iztiev,
  created_at: 2026-09-08}` — closed by hand, 42 days before that merge, and by no commit in this
  repository. What `3a2ef0f` does show is true and sufficient on its own. The example was written from
  memory in a document whose own rules forbid exactly that, and a reader who checked it would have
  found the evidence missing. Recorded here rather than left implicit, because a reader who assumes the guard covers
  all three has a false sense of the gap.
- **Agents in the stack are covered since 2026-10-20**, and were neither covered nor named here before
  — A3 of the same review. They push to declared GitHub repositories and write the same prose, so
  `config/scripts/start/git.sh` installs this hook beside `pre-push` in `/git-secrets/hooks`, where
  `core.hooksPath` already points every agent clone. `CM-6` holds it, through the real start script.
- **Comments.** Keywords in an issue or pull request comment do not close anything; nothing is needed
  there.
- **`git revert`, `git cherry-pick` and `git rebase`.** *Added 2026-10-20; the omission was the
  defect.* git runs `commit-msg` for `git commit` and `git merge` and for nothing else. Measured with
  the hook installed: `git revert --no-edit <c>` of a commit whose subject is `feat: this closes #12`
  exits 0 and writes `Revert "feat: this closes #12"` — **the revert of a close re-closes** — and
  `git cherry-pick` carries the message over intact; neither ran the hook. `git commit --amend` and
  `git merge --no-ff -m` both do run it, verified. So the same text is refused through two doors and
  waved through three, and `CM-FR1`'s *"before the commit exists"* is true only of the two. The
  refusal's own advice names `git commit`, which is one of the guarded ones.

  Covering them needs a different mechanism — a server-side check, or a `pre-push` that reads the
  messages being pushed. `config/agents/hooks/pre-push` already exists for the agents and is where
  that would go. Named here rather than built, because this feature's claim has to match what it does.
- **The forge's own behaviour.** Nothing here changes what GitHub does, nor can it recover a
  reference already closed. `gh pr reopen <n>` restores the state, and the review decision and head
  survive the round trip, which was measured on #18.
- **Other forges.** The keyword list and the reference forms are GitHub's. A different forge needs its
  own pattern.

## 4. Requirements

- **CM-FR1 — A message that would close a reference is refused before the commit exists**, for
  `git commit` and `git merge`, which are the hooks git runs. §3 names the three commands it cannot
  reach.
   Every
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
  wrongly. `--check` asks the same question of an installation that already exists, so whether the
  guard is on is never a memory.
- **CM-FR7 — A guard that cannot read the message refuses it.** Whatever the locale, and whatever
  step failed. A guard that fails open is worse than no guard, because it is believed.
- **CM-FR6 — The guard git runs cannot be emptied by a checkout.** It lives in the directory every
  worktree of a clone shares, and its staleness against `main` is computed on every run rather than
  assumed.

## 5. Enabling it

```bash
./scripts/hooks/install.sh          # once per clone, from any worktree of it
./scripts/hooks/install.sh --check  # is the guard on? exit 0 only if it refuses
```

The run prints where it installed the hook, the source blob id it recorded, and the result of its own
self-test. Where `core.hooksPath` already points somewhere else it refuses rather than overwrite, and
prints the command that would; where it points into a checkout — this script's own earlier answer — it
migrates and says so. Agents in the stack need no step: the start script installs the same hook into
`/git-secrets/hooks`.

## 6. Process log

- **2026-10-16** — #18 closed by `resolved: #18` in `5aa5bc9`; found via the `closed` event's
  `commit_id` after three wrong readings, one of which was written into `HANDOFF.md` and blamed the
  operator. Reopened with `gh pr reopen 18`; `CHANGES_REQUESTED` and the head `59272f5` survived.
  A machine-local hook was written and tested against the real message the same day; this is that
  hook, made the repository's.
