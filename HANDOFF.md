# Handover — 2026-10-16

> **Committed on `main` since 2026-10-10.** It used to be kept staged-and-uncommitted here while the
> committed copy lived on #19. There is one copy now and it is this one: #19 still carries an older
> version on its branch, so a merge of #19 must resolve `HANDOFF.md` **toward `main`**. Two copies of
> one document with different content is the defect `A1` on #17 was — twelve rows specified twice,
> disagreeing in four places, and nobody could tell which they were holding.

Read this first. It is the map and the current state; the specifications are the documents in `docs/`.

**The state below is dated per section, and the current state is the first one.** *Where it stands,
2026-10-16* has the live picture. Read that and the review bodies it points to; the rest of this file
is the map and the lessons.

Everything after *What is being built* was written on 2026-09-09 and describes the end of 2026-09-08,
unless a paragraph carries its own later date. It still says "three features and two repairs, on five
branches"; there are nine of ours open now, and two have merged since. **Where an older section makes a claim about the present,
believe the dated one.**

## Where it stands, 2026-10-16

**The review latency broke today: `#10` and `#25` are both merged.** `b59d19c` took #10 in at
09:20Z and `9858651` took #25 in within the hour, both by `iztiev` and both without a comment — the
first of ours to go in after a review, and the second carrying `691dd2e`, the measurement written
this morning. So `B7-5`'s figures below reached `main` the same day they were taken. This section
opened with *"nothing merged today"* when it was written two hours earlier, which is why each claim
here now carries its time.

**Ten of ours are open**: #15, #16, #17, #18, #19, #20, #21, #24, #28 and #35. Five still read
`CHANGES_REQUESTED` from rounds that have been answered, so what they wait on is a re-read rather
than work, and `git merge-tree` reports all of them clean against `9858651`.

**#35 is the guard against what the next section describes**, opened today with the reviewer on it:
`scripts/hooks/commit-msg`, `scripts/hooks/install.sh`, `tests/unit/m-cm.commit-message-guard.test.ts`
at 17 pass, a feature document, a test specification carrying a row per scenario, and the conduct half
under `## GIT` in `CLAUDE.md`. Documents and tooling only, +510/−0 over six files, no product code.
Suite on that branch: 787 pass / 5 skip / 0 fail, plus the dashboard 32 pass.

### A commit message closed #18, and a word in it is all it took

**Written down because it took three wrong readings to find.** #18 went to `CLOSED` at 09:58:04Z,
38 minutes after #10 merged. The timeline named the operator as the actor, and this file said so for
an hour. The operator had not touched it. The `closed` event carries a `commit_id`, and it is
`5aa5bc9` — a documentation commit of this session's own, pushed to the default branch, whose message
contained the line *"both are merged and resolved: #18, where both sides appended an item"*.

**`resolved: #18` is a closing keyword.** GitHub applies `close`, `fix` and `resolve` in all their
forms, with an optional colon, to the reference that follows, and it applies them to pull requests as
well as issues, attributing the act to whoever pushed. So prose about a pull request, in a commit on
`main`, closed that pull request — and the attribution then pointed at the operator rather than at the
commit.

Reopened with `gh pr reopen 18`; `CHANGES_REQUESTED` and the head `59272f5` survived the round trip.
**And it is computed now rather than remembered.** `.git/hooks/commit-msg` reads the message before
the commit exists and refuses one that would close what it names — `close`, `fix` and `resolve` in
any form, with or without a colon, in front of `#12`, `GH-12`, `owner/repo#12` or a full issue or
pull URL. Git's comment lines and everything under the scissors are ignored. Verified against the
message of `5aa5bc9` itself, which it refuses on line 10, and against this section's own prose
(*"the #18 conflict, answered on #19, resolved in BACKLOG.md"*), which it passes. A commit that means
to close an issue says so with `ALLOW_CLOSING_KEYWORD=1 git commit`, because that is a real workflow
and a guard that forbids it would be worked around rather than used.

The hook lives in `.git/hooks`, so it is **this machine only** and is not in the repository; it does
reach every worktree, because hooks resolve through `GIT_COMMON_DIR` to this checkout's `.git/hooks`.
Making it the team's would mean a tracked script plus `core.hooksPath`, which is a change to everyone's
tooling and therefore the operator's to decide.

What stays as conduct is the wording: in a commit message or a pull request description, name a pull
request as *"the #18 conflict"* or *"on #18"*. The hook catches the slip; the habit avoids the
argument with it.

**#19's conflict was the other one**, and it is merged and resolved: `main` had appended an item next
to the `operator.admin` section that #19 **removes**, because #19 is what closes it. That section is
identical in `main` and in the merge base, so honouring the removal discarded nothing of `main`'s;
the commit message carries the lead-set counts that show it.

**#25 also settled the stacking question before it merged.** Once #10 was in, #25's base read
`main`, its surface was 16 files and +1146/−70, and it merged clean — the 13-to-101 file surface of
2026-10-14, when `main` went into a branch stacked on #10, cannot recur.

**`wt-10` and `wt-seed` are retired**, by the same rule as yesterday's two: `git merge-base
--is-ancestor` against `origin/main` for each branch first, then clean and fully pushed, then
`git worktree remove`. The table in the section below still lists them and is wrong about them from
today on. Six remain, for #15, #16, #18, #19, #24 and #28; #17, #20 and #21 have never had one.

**`B7-5`’s four remaining scenarios on #25 are measured, and so are `B1-9`’s four.** Both records
rested on a measurement taken by hand for the same single reason — no stack had ever been started from
a branch worktree — and that is what the section below made possible. Other hand measurements in the
specification stand for reasons of their own and are untouched: `B6-36` skips with a voice when Maven
Central is unreachable, and the row on a real Maven build says outright that the stack tier holds it. Against a stack
built and started from `wt-seed`, with `m2-seed` present in the running builder:

| Suite | Result |
|---|---|
| `./tests/run.sh m-b7 --system` | **12 pass / 1 skip / 0 fail** |
| `./tests/run.sh m-b1 --system` | **55 pass / 1 skip / 0 fail** across 12 files |

In both files the single skip is the deliberate reader of a seedless image, which only runs when the
seed is absent. The figures are in `docs/TEST-SPEC-liquid-java-extensions.md`: two builds, `rc=0`,
**`downloads 576` both times**, from **different** per-build repositories, the first one gone
afterwards, and all four unseeded jars inside the bundle. Two identical counts from two different
repositories is the reading the negative control exists for — nothing the first build fetched
outlived it.

**The measurement cost the installation’s containers for about an hour and nothing else.** The
operator agreed to that in advance. `/Users/christof/.liquidupstart` is not a git checkout, so the
branch cannot be measured in place; one stack runs per host, so the branch stack replaces it. What
made the restore exact rather than a second hour of rebuilding: **the two `:latest` images the branch
rebuilds were saved under `:pre-b7` first**, and the restore is `docker tag liquidupstart/liquid:pre-b7
liquidupstart/liquid:latest`, the same for `nar-builder`, then the installation’s own `start.sh`. Its
`volumes/` were never written — 1.4 GB before and after, and the builder is back on the image with no
seed. In `zsh`, write `${i}:latest` and never `$i:latest`: the latter is the `:l` modifier and it
silently created `liquidupstart/liquidatest`.

### Two suites at once on this host produce red that is not there

Both merges above were checked by running the full suite on each branch **at the same time**: #18 came
back 856 pass / 5 skip / **11 fail**, #19 762 pass / 5 skip / **2 fail**. Every one of the thirteen is
an artefact of the parallel run. Run serially, the same files are **28 pass / 0 fail** on #18 and
**3 pass / 0 fail** on #19, and the same file passes on `main`.

The two clusters say why, and one of them is an argument for #19. `B6-37` asserts what judging a
bundle **costs**, so a second suite competing for the machine breaks it — the identical case took
6.3 s on one branch and 10.3 s on the other. `B6-21` to `B6-23` collide over fixtures: they create
containers and nginx vhosts under fixed names, and two runs at once take each other’s. **#19 is the
branch that gives fixtures per-run names**, and #18 does not have that fix yet, which is exactly why
eight of the eleven were on #18.

So: one suite at a time on this host. The cost of ignoring it is thirteen red cases that look like a
product defect and are not, which is the same trap as the full disk and the stale mount.

### A single-file bind mount from a moved worktree can be stat-able and unreadable

**This is the one to know before starting a stack from a worktree that has just been moved.** The
first run of `B7-5` against the branch stack failed all four scenarios, and the refusal said the
bundle *"cannot link against the NiFi API the running Liquid loads"*. The build had succeeded. What
had failed was `python3 /opt/builder/narcheck.py`, which `compose.yml` supplies as a **single-file**
bind mount from `config/liquid/narcheck.py`.

In that state the file is there and is not readable: `[ -f ]` true, `stat` reporting 29910 bytes,
`ls` of the mounted directory **omitting the entry**, and `open()` returning `ENOENT` — from `python3`,
from `head`, from `cp`. A fresh `docker run` with the same source refused outright with
`error while creating mount source path '/host_mnt/…/narcheck.py': mkdir …: file exists`. Docker
Desktop had a `/host_mnt` placeholder for a path it could not resolve on the first mount, and the
placeholder then shadowed the real file. The same mount from `/Users/christof/.liquidupstart` worked
throughout, which is what proved it was the path and not the product.

**`docker desktop restart` clears it**, and the run went green afterwards with no change to any code.
It cost an hour of diagnosis, and it is a consequence of moving the worktrees yesterday — the price of
that move, paid once, and worth knowing rather than re-deriving.

**What the stack did wrong in that state is in `BACKLOG.md`, and since #25 merged it is on `main`.**
The gate is guarded by `[ -f "$NAR_CHECK" ]`, which stats; the honest message for an unavailable
checker is in the `else` arm of the same test. So a checker that exists and cannot be opened is
reported as a verdict on the author’s bundle. It went in unfixed, by decision: it decides what
reaches Liquid’s autoloader, and it needs its own negative control that makes the checker unreadable
and reads the message. That control is now `main`'s to write rather than a branch's.

### Starting a stack from a worktree: the two things that are not obvious

**The operator waits are skipped by a file, and it has to be written while the start is waiting.**
`lu_clear_skips` does `rm -rf` on `volumes/.start-skip` once per run, so a marker written beforehand
is deleted by the start itself — by design, because a skip is a decision about *this* run. The names
are `git-key-all` (the group covering every deploy key) and `claude`, `copilot`, `codex`, `grok`. A
fresh checkout has no deploy keys and no agent sign-ins, so without them a start sits for its full
`SYSTEM_SIGNIN_WAIT_SECONDS=900`. With them it comes up in about two minutes and ends with a *Needs
your attention* block naming each repository it could not clone, which is the correct outcome and not
a failure.

**A fresh checkout also needs a `.env`.** Copying the installation’s is right: identical ports and
subnet, and it was checked first for absolute paths — there are none, so the branch stack writes only
into its own `volumes/`, and the key sets of the two files match in both directions.

`wt-seed/volumes/` now holds 1.1 GB of a once-started stack. It is disposable; deleting it costs only
the next start’s first boot.

### A test leaked a container, not just an image

`festive_wescoff` was up for two days, holding `liquidupstart/nar-builder:run-47099-xoirn1` — a probe
container from one of my own earlier runs, from before the content-hash tagging landed. The sweep
built on #18 reclaims leaked **images**; a container that outlives its run pins one and is not swept.
Removed by hand. Worth a case in the same shape as the image sweep.

## Where it stands, 2026-10-15

**`main` is `f13c4ea`.** #27 merged as `0c7f0bf` — **the first thing here merged without a review**,
see below — and `f13c4ea` is the disk guard on top of it. `./tests/run.sh` on `main`: 590 pass /
2 skip / 0 fail, plus the dashboard suite 32 pass.

**Four review rounds were answered in a day**, and every finding across them is handed back. Nothing
a reviewer has asked for is open on our side; what remains is review latency.

| PR | Round answered | Head | Suite |
|---|---|---|---|
| #10 | re-review 3: N5 to N8, plus the image leak | `8befc13` | 755 / 5 skip / 0 fail |
| #15 | B5, B6 and all five minors C1–C5 | `9de173f` | 691 / 7 skip / 0 fail |
| #16 | C1 and the four non-blocking N1–N5 | `dbca74e` | 602 / 4 skip / 1 fail, the one being `A8-26` on `main` at the time |
| #18 | N1–N3, then N4–N9 | `61f9597` | 672 / 4 skip / 1 fail, same cause |
| #25 | base merged twice, entrypoint note | `8db3ded` | 761 / 5 skip / 0 fail |

**#27 was merged without a review, deliberately, and the note is on the pull request.** `A8-26` was
red on `main` — a failed apt install arriving as a product failure — and a red `main` is not local:
every branch inherits it, and it cost two diagnoses, once on #16 where the file had to be run on both
branches to establish the failure was not #16's. The change touched **no product code** (two files,
+75/−14: one test and its specification), the three renumbered ids were checked for collisions
individually, and the branch tier was 571 / 4 skip / 0 fail. `main` went from 3 pass / 1 fail on that
file to 5 pass / 0 fail. **It is not a review and the note says so**: if the reviewer disagrees with
any of it, it changes on `main` by follow-up rather than standing because it landed.

### The full Docker VM, twice, and what it looked like both times

**This is the lesson of the day.** The VM reached 100% with **0 bytes** free and a real Maven inside
the builder answered `java.nio.file.FileSystemException: /m2/org: No space left on device`. On
2026-10-15 that surfaced as **34 failing cases** across M-B5 and M-B6 — refusals that did not refuse,
builds exiting 2, `AFTER=0` where a build should have succeeded, `B6-36` failing where it had
previously skipped — and most of an incompatibility analysis between #10's cache-dependent cases and
#25's no-cache design had been written before anybody probed the build by hand. The morning before,
the same condition was reported to the reviewer as a *"harness artifact"*.

**`docker system df` is why nothing caught it.** It said *20% reclaimable* while the filesystem had
nothing left: it measures what images and containers occupy, not what the VM has free. The space was
in the **build cache** — 39.7 GB — which nothing in the suite accounts for, and `docker builder prune
-af` returned 33.6 GB. On Docker Desktop the host's own `df` describes a different disk, so the only
honest reading is `df` **inside** a container.

`tests/run.sh` now asks once before any level runs, and refuses with the cause and the command
(`SP-3`). It **fails rather than skips**, because a run that cannot measure must not look like a run
that passed — which is the opposite choice from every other precondition here, and the reason is that
a full disk is a property of the machine and fixable in one line. The floor is 2 GiB, from a
measurement: one cold builder image build costs about 305 MB.

**If a build fails for a reason that sounds like permissions, read the disk first.** Twice now the
output has been `AccessDeniedException` or an exit 2 with no explanation, and twice the answer was
space.

### The worktrees live under `~/repos/liquidupstart-worktrees/` since 2026-10-15

**Not under the session scratchpad any more, because that is in `/tmp`.** Measured rather than
remembered: `/usr/libexec/tmp_cleaner` deletes under **`/tmp` only** —
`daily_clean_tmps_dirs="/tmp"`, files matched by `-atime +3 -mtime +3 -ctime +3` and empty
directories by `-mtime +3`, with the three days coming from `CLEAN_FILES_OLDER_THAN_DAYS` in
`/System/Library/LaunchDaemons/com.apple.bsd.dirhelper.plist`. Nothing outside `/tmp` is touched by
it, so anywhere else will do and `~/repos/` is the obvious one: same filesystem as the checkout, next
to it, visible, and backed up by whatever backs up the home directory.

Eight were moved with `git worktree move`, which updates the administrative files — the directories
were not copied by hand. Two were **retired** instead, `fix/toolbox-tools-precondition` and
`fix/oc-id-collision`, because both are merged into `main`. Checked with
`git merge-base --is-ancestor` before removing anything, and every worktree was clean and pushed
first.

| Worktree | Branch |
|---|---|
| `wt-10` | `feature/liquid-java-extensions` |
| `wt-15b` | `feature/openclaw-pairing-recovery` |
| `wt-16` | `feature/memory-midterm` |
| `wt-18` | `feature/mutation-registry` |
| `wt-19` | `fix/fixture-names-per-run` |
| `wt-24` | `fix/fourth-precondition` |
| `wt-seed` | `feature/builder-seeded-cache` |
| `wt-uniq` | `fix/case-id-uniqueness` |

**The three-day rule above still applies to anything left in the scratchpad**, which is where
intermediate files belong and where they may be deleted under you. It is the *worktrees* that have
moved, because a working copy of a branch is not a temporary file.

**And this is also what makes the stack startable from a branch.** The reason `B7-5` on #25 was left
unmeasured was partly that starting a stack from a scratchpad checkout would have put the whole of
`volumes/` under that clock. From here it would not.

### Five worktrees were eaten, and nothing was lost

`wt-10`, `wt-17`, `wt-18`, `wt-pre` and `wt-tr` lost their `.git` to the `/tmp` cleaner — directory
mtimes at `Oct 14 00:00`, which is when it runs. Every one was a copy of a branch that had been
pushed, so **nothing was lost**, which is the rule in this file working. Checked rather than assumed:
each directory was diffed against its branch's archive before anything was pruned. The replacements
were recreated and `touch`ed to reset the three-day clock.

### A habit of mine the reviewer caught twice in one day

*"It is in `BACKLOG.md`"*, pointing at nothing. On #10 as N8 — two entries a reply claimed were
deferred there and were not — and on #18 as N3, two more. Four entries written since, one claim
withdrawn rather than back-filled, because the thing it described had been fixed on `main` and a
back-filled entry would have been a second false pointer. `PROCEDURE-mutation-control.md` already
said *"a pointer to a file the reader cannot open is worse than no pointer"*. **Before writing that a
thing is recorded somewhere, open the file.**

### Where the open work is

All eleven of ours are `OPEN` with `iztiev` requested. #10, #15, #16 and #18 have replies awaiting a
re-read; #17, #19, #20, #21, #24, #25 and #28 await a first or next review. #25 is stacked on #10 and
current with it; #28 carries `TR-4`, which is the check that would have caught the two id collisions
found on 2026-10-14, one of them mine.

One thing is deferred by decision and not forgotten: **`B7-5` on #25 is specified and not measured.**
It needs the builder image built from that branch and the stack started from its checkout. The entry
says so in those words and claims no result.

## Where it stands, 2026-10-13

**`main` is `de83bfc`.** #26 merged on 2026-10-12, the third thing to land since 0.7.0 after #22 and
#23.

**A conflict round, caused by our own merges.** #22 and #23 had touched `BACKLOG.md`, and five branches
had too, so #10, #15, #16, #17 and #24 all went `CONFLICTING` within a day. All five are resolved and
all six open pull requests are `MERGEABLE` again.

| PR | Branch | Conflict was | Resolved |
|---|---|---|---|
| ~~#26~~ | `fix/oc-id-collision` | — | **merged 2026-10-12** |
| #10 | `feature/liquid-java-extensions` | `BACKLOG.md`, one 400-line region | Union — the two sides were *different entries* in one list |
| #15 | `feature/openclaw-pairing-recovery` | an **OC id collision** | #26 moved `main`'s pair; the rest was a pure union |
| #16 | `feature/memory-midterm` | `BACKLOG.md`, the tail | `main` wins on `timeout -k`, which it has struck through and this branch still had open |
| #17 | `feature/test-mutation-control` | `tests/mutations.json`, add/add | Toward #17 — #18 ships it empty on purpose, #17 fills it |
| #24 | `fix/fourth-precondition` | `BACKLOG.md`, the head | Union |
| #25 | `feature/builder-seeded-cache` | — | cleared with #10 |

**Resolving a `BACKLOG.md` conflict is a union four times out of five**, because the file is a list of
independent entries and the two sides are usually different ones. The fifth case is the one to watch:
when both sides have *the same* entry with different verdicts, the newer verdict wins and the stale copy
goes, or the finding ends up recorded twice with opposite answers. #16 was that case.

**And once, counting nearly produced the wrong answer.** On #24 a count said `OC-15 and OC-16` appeared
twice, which is the shape of a stale copy surviving a merge. It is not one: the entry is a struck-through
header, the sentence *"The original entry follows."*, and then the original verbatim, which is how the
answered entries here are written. Reading it was the difference between a correct resolution and
deleting the record of what the finding had said.

### What the round found that nobody was looking for

- **`TR-1` could not see a case that followed `});`.** Its reader was anchored `^\s+` — "indented" — so
  a fixture spec inside a template literal at column 0 is not read as a case. But `\s` includes the
  newline, so under the `m` flag the anchor reached back over a *blank line* and matched a top-level
  `describe(` after all, while the same call after `});` stayed invisible. **Whether a case was checked
  depended on the blank line above it.** Measured: 253 id/file pairs seen against 260 anchored to
  columns — seven invisible, all seven ids declared, so the check was right for the wrong reason. Fixed
  in #26 with `TR-3` holding the reader. Found sideways: one renumbering control fired and its twin did
  not.
- **Nothing checks that a case id is used once.** That is why `OC-40` wore two meanings across #15 and
  `main` through two green suites, surfacing only as a merge conflict. In `BACKLOG.md`, with the
  argument that the check should be written against #26's **parent**, where a real collision still
  exists for it to be seen catching.
- **#22's precondition repair does not reach `m-oc.pairing-card`**, which exists only on #15 and uses
  `lib/mount.ts` without a `DASHBOARD_DEPS` guard, so five cases are red in any bare checkout. A branch
  off `main` was tried and removed again: `main`'s only two DOM files already carry the guard, and
  `main` cannot make an unguarded file on another branch skip. **The guard has to go on #15.**

### What is ours, and what is Timur's

Every open pull request has a review requested and a comment newer than its last review. **That does
not mean nothing is pending on our side.** Two substantive debts are:

1. **#15's eleven findings of 2026-10-01**, still to build. The largest piece of work outstanding.
2. **#16's review of 2026-09-28**, never answered. Deliberately after the 2026-10-01 round, and the
   date-based heuristic above now reports it as answered, which is why that rule gained a caveat.

Smaller: #25 records that a project bringing its own `pom.xml` cannot be given the lifecycle pins, so
its closure is re-fetched per build — the security property holds, the speed is **unmeasured**.

Waiting on Timur and never reviewed by him: **#24**. #20 and #21 were reviewed on 2026-10-16 and
both rounds are answered; #25 merged that day.

## Where it stands, 2026-10-10

**`main` is `c9a0567`.** #22 and #23 merged this morning, which is the first movement on `main` since
#9 went in as 0.7.0.

**Every review is answered except one.** The 2026-10-01 round — five parallel reviews, 48 findings —
is replied to on #10, #15, #17, #18 and #19. **#16's review of 2026-09-28 is the one outstanding
reply**, and it is deliberately outside this cycle.

| PR | Branch | Head | State |
|---|---|---|---|
| ~~#22~~ | `fix/suite-preconditions` | — | **merged 2026-10-10** — the suite computes where it is running |
| ~~#23~~ | `fix/case-id-traceability` | — | **merged 2026-10-10** — 13 unsigned case ids, and `TR-1` against a 14th |
| #10 | `feature/liquid-java-extensions` | `c2bc3c3` | 25 findings answered 10-09; the `/m2` retraction posted 10-10. With the reviewer |
| #15 | `feature/openclaw-pairing-recovery` | `a5d3c30` | **11 findings of 10-01 still to build.** The address measurement it was blocked behind was delivered 10-10 |
| #16 | `feature/memory-midterm` | — | **the one unanswered review**, 2026-09-28. Outside this cycle by decision |
| #17 | `feature/test-mutation-control` | `be75d5b` | answered; base retargeted to #18, so it cannot merge first |
| #18 | `feature/mutation-registry` | `b8b608b` | answered; verdict was *merge after fixes* |
| #19 | `fix/fixture-names-per-run` | — | answered 10-02. Carries an **older `HANDOFF.md`** — see the note at the top |
| #20 | `fix/bind-address` | — | never reviewed. **A precondition of #15's identity rule**, not a smaller thing beside it |
| #21 | `fix/manifest-atomic-write` | — | **reviewed 2026-10-16**: one blocking item and four follow-ups, answered the same day |
| #24 | `fix/fourth-precondition` | `c40606a` | opened 10-10 off `main`: `registryReachable()`, `A16-30`, and three of my own mistakes. `572 pass / 4 skip / 0 fail` |

### What is open, and whose it is

- **The operator's, priced and waiting:** `/m2` option (c). One second per build, a 67.7 MB image
  layer, 24 s of image build. Unmeasured: a real processor with a large closure, where a per-build
  repository means re-downloading on every build.
- **The operator's, newly sharpened on #15:** the identity rule cannot be a rule about an address
  alone. #20 makes the binding a *variable*, so opening the port for pgAdmin would hand
  `operator.admin` to the LAN. The recommendation is a guard refusing the combination, in the shape of
  `lu_ip_in_cidr`.
- **Mine:** #15's eleven findings. That is the largest piece of built work outstanding.
- **Deliberately not done:** `BACKLOG.md` on `main` still carries the `operator.admin` entry in its
  pre-10-02 version, which recommends asserting the identity *only for the host* — retracted, because
  it would break the recovery path #15 exists to provide. The corrected entry is on #15's branch and
  **its merge is what should carry the fix.** Editing `main`'s copy as well would put the same block
  on two branches with different content, which is the defect above.

### Two measurements that corrected published figures, 2026-10-10

Both were mine, and they went opposite ways — which is the point.

- **The `/m2` seed figure was wrong.** `exit=0, 3 s, 47 jars` was real and taken on the wrong subject:
  against the skeleton `build.sh` generates, the arrangement fails on plugin **version** resolution. A
  local repository is not a remote repository — Maven writes `maven-metadata-central.xml` and never
  the unqualified `maven-metadata.xml` a `file://` remote is looked up for (5 against 0, measured).
- **The `723 pass / 4 fail over 727` on #10 was right.** It was suspected after the worktree damage
  below and **re-measured instead of withdrawn**: identical, over 143 files, where a run missing the
  six lost test files would have given 698 over 137. Suspecting a number is a reason to measure it
  again, not to retract it. The retraction had already been drafted.

## Where it stands, 2026-10-02

**The git integration is merged.** #9 was approved and merged on 2026-09-30 and released as **0.7.0**.
`main` is `fc03344` plus what has landed since. Everything else is open, based on `main`, and conflict
free.

**Every open PR has an unanswered review from 2026-10-01.** That is the single most important fact on
this page. The work below is not "finish the last thing"; it is five review rounds in parallel, 48
findings in all.

| PR | Branch | Findings open | State |
|---|---|---|---|
| ~~#9~~ | `feature/git-integration` | — | **merged, 0.7.0** |
| #10 | `feature/liquid-java-extensions` | **12** (3 blocking) | review of 10-01 **unanswered** |
| #15 | `feature/openclaw-pairing-recovery` | **11** (A1–A5 before merge) | review of 10-01 **unanswered** |
| #17 | `feature/test-mutation-control` | **8** (A1–A3 before merge) | review of 10-01 **unanswered** |
| #18 | `feature/mutation-registry` | **10** (2 before merge) | third re-review of 10-01 **unanswered**; verdict *merge after fixes* |
| #19 | `fix/fixture-names-per-run` | **7** | A1, A2, B1–B4 built in `2dbb523`; **no reply posted yet** |
| #20 | `fix/bind-address` | — | opened 10-02, awaiting first review |
| #21 | `fix/manifest-atomic-write` | — | opened 10-03, off `main`; **reviewed 2026-10-16**, changes requested and answered, awaiting the re-read |

**#17 must not merge before #18.** #17 carried its own older copy of the mutation runner; both branches
add the same four files, so `git merge-tree` gives add/add conflicts on all of them and a resolution
toward #17 would silently restore every defect #18 fixed. #17 holds the registry alone now.

### Getting the reviews back

They are long and they are the actual specification of the remaining work. Do not work from this
summary:

```bash
gh pr view <N> --json reviews --jq '[.reviews[] | select(.author.login=="iztiev")] | last | .body'
gh pr view <N> --json comments --jq '.comments[] | "\(.createdAt) \(.author.login)"'   # what has been answered
```

A review is unanswered when its `submittedAt` is later than the last `cdilcher` comment.

> **That rule is false for #16 as of 2026-10-12, and the exception is the useful part.** A merge
> comment was posted there on 2026-10-12, later than the review of 2026-09-28, so the rule now reports
> that review as answered. It is not: the comment says so in its own body, and none of its findings has
> been addressed. The rule measures *any* comment where what matters is *a reply to that review*, and
> nothing in the data distinguishes them. So treat it as a first pass and read the last comment before
> believing it — or, better, give each reply a line naming the review it answers, which is the computed
> form this project would normally insist on and does not yet have.

### The agreed next three, in order

Decided with the operator on 2026-10-02. Everything else waits.

1. ~~**A16-11, and a sweep for the same shape**~~ — **done 2026-10-02**, and the sweep found three
   more: A15-1's `Bun.sleep(700)`, A16-27 passing over a `git.sh` with no wait at all, and five cases
   running the start script in bun's default 5s budget. The six of them are the *"Waiting on the clock"*
   entry below. One further thing came out of it, and **half of it is now repaired.** Eight case ids
   used in the A16 tests — A16-21, 22, 24, 25, 26, 27, 28, 29 — appeared in no row of the test
   specification; #23 gave them rows, and `TR-1` passes 4 of 4, so that half is closed.
   **`A16-20` still names two different cases**: the test specification's row for it describes a NUL
   unit check, while `m-a16.lock-identity.test.ts:177` carries it on a stale-foreign-lock integration
   case. `TR-1` cannot see this — it asks whether an id in a test title has *a* row, not whether the
   row describes that case — so nothing will go red over it. The review of #21 suggested closing this
   note entirely on the strength of #23; checked on 2026-10-16, and the collision is still there, so
   the note stays narrowed to it. Renumbering one of the two is a decision for the reviewer.
   What it was: `m-a16.lock-identity.test.ts:142` did `await Bun.sleep(900)` and then read
   `volumes/_git-secrets/locks/<slug>/pid`, which is empty under load — the case passed 5 of 5 alone
   and failed 8 of 8 with eight starts at once. It waits on the holder landing now, and the fourth
   instance was found on purpose, as this entry asked.
2. ~~**The `operator.admin` entry moves to #15.**~~ — **done 2026-10-02**, `3177cc2`, and the note is
   on #15 as `issuecomment-5956095152`. It was not a move: the entry existed on **both** branches, and
   #15's copy was the version from *before* the decision of 2026-09-30. That copy proposed setting
   `X-Forwarded-User` only for host requests, or not routing the agents to the `openclaw.localhost`
   vhost at all — which would break the recovery path #15 exists to provide, since
   `openclaw-pairing.sh` runs its CLI inside that network and through that vhost. **#15's own backlog
   recommended removing what #15 adds.** Two things were measured on the branch rather than taken from
   the review: the helper really has no `--ip`, and the pool guarantee is *enforced* —
   `lu_ip_in_cidr` refuses a `SYSTEM_PROXY_IP` inside `SYSTEM_NETWORK_POOL` before `down.sh` runs,
   held by four cases in `m-oc.env-reads`. Re-review was **not** requested: #15's eleven findings are
   untouched. What it said to do:
2b. **The `operator.admin` entry moves to #15.** It is out of #19 already (B5: approving a harness fix
   must not also sign off a security direction). Write it on #15 with the distinction the operator and
   the reviewer between them established:
   - The **agents** are what the finding is about, and the decision of 2026-09-30 answers it: nginx
     asserts `X-Forwarded-User` for the host and one named stack-network address. An agent arrives from
     a container address and no longer gets it.
   - The **LAN** side is a different thing and is **not** part of that decision. It was a promise
     README.md broke, and #20 repairs it. Say so, so nobody reads the identity rule as doing more than
     it does.
   - Three omissions the reviewer named, all to be written in: the pairing helper has **no** fixed
     address today (`docker run --network` with no `--ip`), so a key, a template variable and an `--ip`
     are new — "introduces nothing to keep" was false; two concurrent helper runs on a pinned address
     collide with *address already in use*; an orphaned helper holds the address. In its favour and
     unsaid: `ip_range: 10.99.0.128/25` in `compose.yml` keeps a pinned address below `.128` out of the
     pool.
   - And drop "name them by address" as if an address were a principal. It is a position.
3. ~~**The manifest write in `git.sh`**~~ — **done 2026-10-03**, `c926797` on
   `fix/manifest-atomic-write`, **PR #21** against `main`, Timur requested. It was bigger than this
   entry said: measured against the unfixed script, 88,365 reads over six runs gave **893 empty** and
   **30 unparseable**, the longest 5,274 bytes ending mid-entry. Not one bad read was a *plausible*
   document — always empty or unparseable, never valid JSON with the wrong contents — which is why
   nothing downstream ever reported anything false and why it survived nine milestones.
   `seed_known_hosts` was repaired with it: its temporary came from `mktemp` with no argument, and
   `mv` copies across filesystems, so the guarantee depended on where `$TMPDIR` points. Four cases,
   A12-3 to A12-6; 3 of 7 red against the unfixed script, measured on two trees (118 empty reads on
   the first, 891 on the second — the count is the machine's, the signal is not). What it said to do:
   Line ~562 is `} > "$MANIFEST"`, which truncates and fills. Any reader can see a half-written file:
   `m-a12.manifest-while-waiting.test.ts` caught `SyntaxError: JSON Parse error: Unexpected EOF` at
   load time in a full run. The dashboard and `git-repo-info` read the same file, so this is a product
   defect, not a test one. The same script already does it correctly for `known_hosts` (`mv "$scanned"
   "$KNOWN_HOSTS"`) — write beside and rename. It also explains the reviewer's #18 finding 6, which he
   saw once in twenty runs and could not reproduce.

### Why #10's security finding comes after those three, not before

#10's B1 — build-time code runs as root with write access to every clone, the shared Maven cache and
the drop directory — is the most serious-sounding item in the whole round, and it was deliberately not
pulled forward. The reason is a measurement, not a preference:

| | in `main`, and therefore in 0.7.0? |
|---|---|
| #10 B1, build-time code as root | **no** — `config/nar_builder` and `narcheck.py` are not in `main` |
| step 3, `} > "$MANIFEST"` | **yes**, `config/scripts/start/git.sh:562` |
| step 1, A16-11 | **yes** |

**Urgency follows exposure, not the word "security".** B1 is in code nobody has: the builder exists on
the branch only, so it cannot do anything to anybody today. Step 3 is in the version running on the
operator's machine and can hand the dashboard and the agents a half-written manifest.

Three further reasons, in order:

- **B1 needs a decision from the operator** about what a build may do on their machine, and a
  trust-boundary decision taken at a context boundary is taken badly.
- **It is large.** The repair reaches the builder image, `compose.yml`, the mounts and probably the
  check itself. It is a round of its own with its own measurements, not an insert before three small
  things.
- **#10 carries eleven more findings**, among them B3, two cases that hang for ever on Linux in the
  default tier. Taking B1 alone means touching #10 twice and asking the reviewer to read it twice.

So: the three, then #10 whole, with B1 first inside it and the decision put to the operator before
anything is built.

**The three are done as of 2026-10-03** — `d645c9c` on #19, `3177cc2` on #15, `c926797` as #21. #10 is
next, whole, and B1's decision goes to the operator before anything is built.

**One thing the three cost, and it is a lesson about this machine rather than about the code.** The
work for step 3 sat uncommitted in a worktree under the session scratchpad overnight. The machine
rebooted, and `/private/tmp` and `/tmp` went with it: the worktree, the reproduction harness and the
drafted PR text were all gone, and every worktree showed as `prunable`. Steps 1 and 2 lost nothing,
because they were committed and pushed. Rebuilding step 3 took about twenty minutes and the
measurements had to be earned again, which is how the 118-versus-891 difference came to light. Two
rules out of it: **a worktree under the scratchpad is a working surface, not storage** — commit before
stopping — and PR text belongs in `.pr-drafts/`, which is inside the repository and gitignored, rather
than in the scratchpad.

**The cause is found, 2026-10-10, and it was never git.** This document recorded the earlier loss as
a reboot taking `/private/tmp` with it, and a later one as cause unknown. Both were
**`/usr/libexec/tmp_cleaner`**, a macOS launchd job that runs **daily at midnight**
(`com.apple.tmp_cleaner.plist`, `StartCalendarInterval Hour 0`) and whose arguments are in the binary:

```
daily_clean_tmps_dirs="/tmp"
daily_clean_tmps_days="3"
args="-atime +3 -mtime +3 -ctime +3"      # files
dargs="-empty -mtime +3"                  # directories, once empty
```

**And reading a file does not protect it.** Measured: `cat` on `wt-10/.env.example` left its atime at
`2026-10-06 04:17`, unchanged, so this filesystem does not refresh atime on reads. Only *writing*
moves any of the three. The predicate therefore selects **every file checked out more than three days
ago and not written since** — which, in a git worktree, is almost all of it.

Three observations it predicts rather than merely fits. `wt-manifest` holds **zero files and its
directory skeleton only**, every directory stamped `Oct 8 00:00` — the midnight run. `wt-10` lost
**eleven** tracked files, six of them test files, in the first cohort to cross three days. And when
asked today, the cleaner's own predicate still selected **640 further files in `wt-10`**, due that
night; after `touch` on the tree it selects none, the worktree is clean, and it is identical to
`origin`.

The eleven surfaced only because `git diff --stat` for an unrelated one-file edit printed eleven
deletions beside it.

**The rules out of it.** A worktree under the scratchpad has a **three-day clock per file**, and the
machine does not have to reboot for it to run — so commit and push, and treat a worktree older than
that as suspect rather than as a place to measure in. **Check it with `git status`, never by opening
the files you came for**: a selective checkout restores what you name and is silent about the rest,
and six test files holding **29 green tests** were gone with nothing turning red, because absent tests
do not fail. `touch` on the tree buys another three days where recreating it would cost a
`bun install`.

**And the first conclusion drawn from it was wrong, which is the other half.** The reading was that
this had corrupted the `723 pass / 4 fail over 727` published on #10 the day before. It had not: with
everything restored the tier gives exactly that figure again, over 143 files, and a run missing those
six would have reported 698 across 137. So the damage postdates the measurement. **The exposure was
real and the check was cheap** — twenty minutes of re-running against a day of a reviewer reading a
retraction that was not warranted. Suspecting a number is a reason to re-measure it, not to withdraw
it.

### Decisions, and whose they are

- **Settled 2026-09-30, operator:** nginx asserts the identity for the host and one named address.
- **Settled 2026-10-02, operator:** the proxy binds to `127.0.0.1` by default with `SYSTEM_BIND_ADDRESS`
  to open it. #20.
- **Waiting on the reviewer, #18:** the wire format gained a `kind` column rather than overloading
  `all` to carry `"exempt"`; and a run stopped by its budget is **refused** rather than
  failed-by-timeout, because `failed` there means the named test passed. Both are stated in the reply
  on #18 as deviations from what he proposed.
- **Waiting on the operator, #15, as of 2026-10-10:** the real nginx rule for the identity. **Two of
  the four measurements are in, and they are the diagonal** — Linux/rootless (the reviewer,
  `10.231.7.1` for both loopback and LAN) and macOS/rootful on Docker Desktop (`192.168.65.1` for
  loopback, LAN, IPv6 loopback, the hostname, and a container on an unrelated network reaching the
  published port two ways — six readings, one address). Host against **container** separates on both,
  which is the half the rule rests on; host against **LAN** separates on neither. So #20 is a hard
  precondition, and the coupling nobody had named is that #20 makes the binding a *variable*: open the
  port for pgAdmin and the identity rule hands `operator.admin` to the LAN. The recommendation on #15
  is a guard that refuses the combination, in the shape of `lu_ip_in_cidr`. Not built.

### The worktrees in use

They are outside the repository, under the session scratchpad, and they are where the work happens:

| Path | Branch |
|---|---|
| `/Users/christof/repos/liquidupstart` | the main checkout |
| `…/scratchpad/wt-10` | `feature/liquid-java-extensions` |
| `…/scratchpad/wt-15` | `feature/openclaw-pairing-recovery` |
| `…/scratchpad/wt-17` | `feature/test-mutation-control` |
| `…/scratchpad/wt-18b` | `feature/mutation-registry` |
| `…/scratchpad/wt-names` | `fix/fixture-names-per-run` (#19) — **this file lives here** |
| `…/scratchpad/wt-bind` | `fix/bind-address` (#20) |

`git worktree list` is the authority. Each needs `cd dashboard && bun install --frozen-lockfile` once,
or the component tier cannot resolve svelte.

## What is being built

**Three features and two repairs**, on five branches.

**The git integration** (#9) gives the agent harnesses OpenClaw and OpenCode version control:
repositories declared in the configuration, cloned into a shared workspace, each with its own deploy
key, guardrails on what an agent may push, and one sanctioned command through which work leaves the
stack. The operator's own words for the need are in §1.1 of `docs/FEATURE-git-integration.md`.

**The Java extensions** (#10) let an agent write a NiFi processor and get it into Liquid. They
*consume* the git integration and contribute nothing back to it, which is why they have their own
documents since 2026-09-03.

**The OpenClaw 2026.9.1 migration** (#13) moves the stack off the version #11 pinned it to, and makes
the version something the stack reads rather than assumes. Started and largely finished on
2026-09-06, reviewed and **merged into `fix/openclaw-2026-9-1` on 2026-09-08** — which is #11, not
`main`.

**The two repairs** are #11 (the pin, after a floating tag moved) and #12 (`bun_runner`'s health
check, which asked whether the runner had been used rather than whether it works).

All of it doubles as a **trial of test-driven AI development** — the working method is under
evaluation alongside the code, by developers and by people from the business. That is why the
documentation is heavier than the features alone would justify, and why failures are recorded rather
than tidied away.

## Where things live

| File | What it is |
|---|---|
| `docs/FEATURE-git-integration.md` | Use cases, working modes, permission model, requirements, milestones, process log, every goal as posed |
| `docs/TEST-SPEC-git-integration.md` | Every git case: overview row plus detail block, and the verification procedure per milestone |
| `docs/FEATURE-liquid-java-extensions.md` | The same, for the Java extensions. Numbering continues from the git document — U9, FR21 upward |
| `docs/TEST-SPEC-liquid-java-extensions.md` | The Java cases |
| `docs/FEATURE-openclaw-2026-9-1.md` | The migration analysis, in the three-part view: how each part worked, what changed, what had to be adapted |
| `docs/TEST-SPEC-openclaw-2026-9-1.md` | 31 migration cases, OC-1 to OC-31 |
| `docs/PROCEDURE-cold-start.md` | The cold start, **version-neutral**: it reads the pin out of the Dockerfile rather than naming a version, so one document serves 2026.7.1, 2026.9.1 and whatever is pinned next |
| `scripts/linux/image-digests.sh` | `before` / `after`: what every image tag resolves to, so a later difference can be told apart from an upstream move |
| `docs/verification/` | The records, with the raw transcripts. Promoted from `.pr-drafts/` when finished |
| `CLAUDE.md` § Development rules | The commandments this project works to |
| `BACKLOG.md` | What was deliberately deferred, each with why. **Exists only on the feature branches** |
| `.pr-drafts/` | Scratch. Untracked, and **not gitignored on the `main`-based branches** — stage by name, never `git add -A` |

**Documents live on the branch they belong to.** *Corrected 2026-10-03:* this said `docs/` does not
exist on `main` at all, which stopped being true when #9 merged — `main` carries
`FEATURE-git-integration.md` and `TEST-SPEC-git-integration.md`, and #21 edits them there. The
migration documents are on `feature/openclaw-2026-9-1`; the git and Java documents on their own
branches.

## The branches, and how they relate

*Rewritten 2026-09-30.* The paragraph here described 2026-09-08, when nothing had reached `main` and
#11 was the only door to it. Both are now false: #11 merged, and #9 merged on 2026-09-30 as 0.7.0.
The four open branches are based on `main`.

Do not take a number from this document; it moves every time something lands. Ask:

```bash
git fetch -q origin && for b in liquid-java-extensions openclaw-pairing-recovery \
  test-mutation-control mutation-registry; do
  printf '%-28s %s ahead\n' "$b" "$(git rev-list --count origin/main..origin/feature/$b)"
done
```

The table below is the shape of the tree, not its state; the dated table at the top is the state.

| Branch | PR | Base | Holds |
|---|---|---|---|
| `feature/git-integration` | **#9**, open | `main` | M-A0 to M-A8 |
| `feature/liquid-java-extensions` | **#10**, open | `feature/git-integration` | M-B1 to M-B3 |
| `fix/openclaw-2026-9-1` | **#11**, open | `main` | The pin to 2026.7.1 — **and now the migration and #12 with it** |
| ~~`fix/openclaw-start-stdin`~~ | ~~#14~~ | — | **Merged 2026-09-08** into `fix/openclaw-2026-9-1`. The `SIGTTIN` hang the migration's own verification found |
| ~~`fix/bun-runner-health`~~ | ~~#12~~ | — | **Merged** into #13. The branch exists only locally now; the remote one is gone |
| ~~`feature/openclaw-2026-9-1`~~ | ~~#13~~ | — | **Merged 2026-09-08** into `fix/openclaw-2026-9-1`, remote branch deleted |
| `integration/oc-2026-9-1` | — | — | **Not a merge candidate.** #13 + #9 + #10 in one place, so the compatibility cases can be *executed* rather than asserted |

Cutting a branch from another is how each PR shows only its own diff. GitHub retargets a stacked PR
by itself once its base lands, so **the open ones can be reviewed in any order and nothing waits.**

**A merged branch is not a landed change.** #12 and #13 are merged and neither is in `main`; they sit
inside #11, and reading their PRs as "done" would misstate what production carries. The same will be
true of #14 the moment it lands.

**#9 must be merged with a merge commit, not squashed.** GitHub retargets #10 by itself, but only
cleanly if the commits it already carries survive — and the individual messages are part of what this
work exists to demonstrate.

**#10 was 28 commits behind #9 and was merged forward on 2026-09-07.** It is level now.

**`integration/oc-2026-9-1` is deliberately behind**, by one commit each on #9 and #10 and nine on
#13 as of 2026-09-07 evening. All eleven are documents plus `scripts/linux/image-digests.sh`; not one
test and not one line of stack code changed, so **Suite 2's 424 stand** — that was measured, not
assumed. Bringing it level is three merges, of which two are clean and one conflicts in
`docs/verification/README.md`, where both sides rewrote the same paragraph.

**The rule, decided 2026-09-07: nothing reaches `main` without Timur's review. Merging forward
inside the stack is fine** — #12 and #13 into `fix/openclaw-2026-9-1`, #9 into #10, the three into
the integration branch — and is how each branch stays reviewable against what it actually builds on.
Whoever runs anything on the integration branch must merge the open ones forward *first*, or they are
measuring a stand that no longer exists. The rule held today: two PRs merged and `main` is untouched.

## One working copy, one stack

`docker compose` reads the `compose.yml` of the checkout at the moment `start.sh` runs, so the
containers keep the mounts, services and images **that branch** declared, no matter what is checked
out afterwards. This cost time three times on 2026-09-05.

**After switching to a branch whose `compose.yml` differs, run `./scripts/linux/start.sh` before
trusting a test run.** One line tells the two shapes apart:

```bash
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'
```

Silence means the running stack predates the git integration, and the red tests describe the
containers rather than the code.

**Each branch has its own discriminator, because each adds something to the stack.** Naming the
branch a milestone lives on is not enough: the containers are the previous branch's until something
rebuilds them, and a suite run against them measures the containers.

| Working on | Check the running stack with | Absent means |
|---|---|---|
| `feature/git-integration` | `docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'` | The stack predates the git integration |
| `feature/liquid-java-extensions` | `docker compose exec -T opencode sh -lc 'command -v nar-build'` | The stack has no `nar_builder`, and every M-B case is red for that reason alone |
| `fix/openclaw-2026-9-1` or `fix/openclaw-start-stdin` | `docker compose exec -T openclaw-gateway openclaw --version` | Anything but `2026.9.1` means the gateway is not the migrated one |

**And an image is not built just because a service is declared.** `feature/liquid-java-extensions`
adds `nar_builder`, whose image `liquidupstart/nar-builder:latest` exists on no host that has not
built it — `./config/scripts/build/nar-builder.sh` — and changes `config/liquid/entrypoint.sh`, which
is `COPY`ed into `liquidupstart/liquid:latest` rather than mounted, so that image has to be rebuilt
too. §4 check 3b of the Java test specification compares the entrypoint the container runs against
the file on disk, and it exists because a green test over a container running something else is
indistinguishable from a fix that works.

## State

**The stack runs OpenClaw 2026.9.1**, rebuilt from `fix/openclaw-start-stdin` on 2026-09-08 evening
and migrated from a state 2026.7.1 had written — the path a real installation takes, not a cold
start. Nineteen services, every healthcheck green. It ran 2026.7.1 for most of that day, for M-A8 and
M-B3, and was moved forward only to verify the migration; images live on the host and not in the
branch, which is what *"A locally built image can belong to another branch"* below is about and what
cost two hangs before it was understood.

**`volumes/_openclaw` now holds a 2026.9.1 state, so the way back is not a checkout.** 2026.7.1
refuses it — OC-21's one-way door. Returning to #9 or #10 means clearing that directory and
restoring `_openclaw.bak-2026.7.1`.

**The git integration is complete.** M-A0 to M-A8 built, each verified independently and posted to
#9. All four manual cases observed, including the three that failed.

**M-A8 is complete, including its three manual cases.** Built 2026-09-07 as the launchpad card, the
retry and the configuration round trip nothing had ever run — fourteen cases. It is **twenty-six**
now, 65 tests across 14 files, and the twelve that were added came from walking the manual ones. See
*"What 2026-09-08 cost and bought"* below: the card was right from the first screenshot, and
everything around it was not.

A8-15 passed. A8-16 passed on its **fifth** attempt. A8-17 was walked and answered the question it
exists for, in the worst way available: **a start that leaves a repository broken read as success**,
and the operator confirmed they could have walked away without noticing. A8-26 is the answer.

**The Java extensions are complete.** M-B1, M-B2 and M-B3 built and verified — M-B3 on 2026-09-08,
with §4's load checks run by the operator, which is the half that answers the question. **Every
milestone in this project is now built.** What remains is review.

**The migration is verified.** 42 automated cases on the branch itself; **Suite 2 — 424 cases, 0
failures** — on `integration/oc-2026-9-1`, proving it breaks neither feature in flight; and **OC-20**,
the cold start on 2026.9.1, passed manually including the browser half: on a state directory twenty
minutes old the Control UI loaded with no pairing prompt and a turn returned its probe string in five
seconds. Records in `docs/verification/`.

Nothing in the migration is open. OC-3 was **replaced** by a contract case — assert the guard, not
the hazard — and the reasons are in the test specification.

### What 2026-09-08 cost and bought

Three manual cases, five attempts at one of them, and **six defects none of the 334 automated cases
could see** — because every one of them lived on a path no case had ever walked: the operator's.

| | What it was |
|---|---|
| **A8-19** | `config/toolbox/Dockerfile` carried no `git` and no `openssh`, and the dashboard's **Start** button runs the start script inside the toolbox. `git.sh` died at line 17 with `ssh-keygen: command not found`. The button brought up no stack at all, and had not since the git integration was cut |
| **A8-21** | `start.sh` runs `down.sh` on **line 16** and reaches the git step on 139 under `set -euo pipefail`. One malformed declaration removed every container and aborted a hundred lines before anything came back — and did it again on every retry. The declaration is now judged before the teardown |
| **A8-23** | The parser took everything after the colon as the repository path. A URL pasted twice parsed, GitHub answered *"is not a valid repository name"* — a message about the remote, for a mistake in `.env` — and the slug, the key directory and the key's comment were all built from the doubled string |
| **A8-24** | Bun loads the repository's `.env` into `process.env`, `sh()` forwarded it, and `git.sh` prefers the variable over the file. **Every fixture-based case had been reading the operator's live declaration since M-A1.** Invisible while it was valid; a malformed one turned five cases red in milestones nobody had touched |
| **A8-22** | Nothing asserted the retry's control is drawn. Found by the operator asking where the Test button was — correctly absent, because both repositories were cloned. The same shape as the defect this milestone was built for: `/git-auth` complete and called by nothing |
| **A8-26** | The start printed its warning and then 250 lines of certificates and containers, ending in URLs, passwords and `[start succeeded]`. `.install-result` said `start_ok=1`. Exactly the shape U11 forbids |

**None of them was about the card.** It was right in the first screenshot taken of it: both
repositories named, the per-access instruction, the key, the fingerprint matching GitHub's. Five
attempts were spent on everything between the operator and it.

Two things worth carrying beyond this milestone. **The retry produces a *governed* clone** — its own
key selected, `core.hooksPath` set — because it runs `git.sh` with `GIT_REPOSITORIES` narrowed to one
entry rather than calling `git clone` itself. That is what reusing the mechanism buys, observed
rather than argued. And **the stack keeps no start log**: the toolbox runs with `--rm`, and
`.install-result` holds a verdict rather than output. A8-26 exists because the operator pasted the
log by hand.

### A locally built image can belong to another branch

Met twice on 2026-09-08 before it was understood, and written up in `BACKLOG.md`. This branch pins
`ghcr.io/openclaw/openclaw:2026.7.1`; `liquidupstart/openclaw:latest` on the machine was **2026.9.1**,
built from the migration branch. The start wrote a `cliBackends` key, the newer binary rejected it,
and under a pty it asked `Run "openclaw doctor --fix" now? [Y/n]` in a container with no stdin. **The
only symptom was a container that did not come back.**

Repaired by `./scripts/linux/build.sh`, and the state directory had to go with it — `2026.7.1`
refuses a state written by `2026.9.1`, which is OC-21's one-way door. Archived as
`_openclaw.was-2026.9.1.tar` first. The Claude login lives in `volumes/_openclaw-claude`, a different
directory, and survived.

**Why `volumes/_openclaw` will not delete is still unexplained, and the explanation this document
carried was wrong.** It said `openclaw-gateway`'s nested bind mounts hold `workspace` and `skills`,
and that they release shortly after the container is gone. Retested on 2026-09-09 while restoring a
2026.7.1 state, and it does not hold:

- `rm -rf` was retried every five seconds for **200 seconds** with the whole stack down. `workspace`
  and `skills` survived; everything else in the directory was deleted.
- No container existed at all — not one from the compose project, and not `liquidupstart-dashboard`,
  which mounts the whole repository and was stopped as a test. Both `rmdir` calls still returned
  `Permission denied`.
- `df` puts them on the same filesystem as their parent, so they are **not mount points**. Owner is
  `501:20`, the parent is writable, and `ls -lO` shows no file flags.
- **`mv` on the parent worked immediately.** The directory entry is free; the two children are not.

**What works is moving it aside, not deleting it**: `mv volumes/_openclaw volumes/_openclaw.stuck`,
then restore. Whatever holds those two paths survives every container that could plausibly hold them,
which is the part no hypothesis so far explains. `BACKLOG.md` records
`volumes/_openclaw-claude/skills` as the same shape, and it stays unexplained too — the difference is
that it is now unexplained *on purpose* rather than by an answer that sounded right.

### A mismatched NAR loads, and then tells the operator the wrong thing

**M-B3's answer, and it is not the one five milestones had been written around.** FR23 and FR27 both
said a NAR compiled against an API Liquid does not provide is *silently never loaded* and the
processor *never appears*. Measured on 2026-09-08 against a fixture built for it: the bundle **loads**,
the processor **is listed** in the API's catalogue, and `nifi-app.log` says nothing at all. The
mismatch was proven real first — `org.apache.nifi.controller.NodeConnectionState`, the only class
`nifi-api` 2.11.0 holds that the loaded 2.10.0 jar does not, 437 against 436, absent from the built
class's references by `javap`.

**That is worse than never appearing.** A processor that does not show up is annoying and visible the
moment an operator looks for it. One that shows up, drags onto a canvas and breaks when a flow runs
is exactly the silent failure this feature exists to remove. The requirements stand; their reason is
stronger than the one they carried, and every statement of the old mechanism was corrected —
including the refusal `nar-build` prints to an agent, which would have carried the error onward.

**Triggered on 2026-09-09, and the inference was wrong about when.** It does not wait for a flow. The
processor is catalogued and selectable, and **adding it from the canvas fails**:
`POST /nifi-api/process-groups/<id>/processors` answers **500** with
`java.lang.NoClassDefFoundError: org/apache/nifi/controller/NodeConnectionState`. The predicted error
was right; the predicted moment was not. It never reaches the canvas, so it never runs.

**Two things came out of that which are worse than the original finding.**

The error is written to **`nifi-user.log`**, not `nifi-app.log` — zero occurrences in the one every
check in this repository reads, four in the one none of them did. *"The framework says nothing"* was
a conclusion drawn from a single log, not an observation. Both §4 and `tests/verify/m-b3.sh` now read
both.

And **what the operator is told is false**. The UI turns the 500 into `/nifi/#/error`: *"Your session
has expired. Please click on the Home button to renew the session."* It has not. The message sends
them to authenticate again and retry, which reproduces the failure exactly. An operator meeting this
has no path from what they are shown to what is wrong.

**The control ran beside it and was flawless**: the same processor built against the resolved 2.10.0
was added, started, and reached **4,114,541 invocations in five minutes** with no error and no
bulletin. The two differ in one class.

What stays open is a check at deployment time — the entrypoint already walks every `*.nar` into
`lib/`, and the `javap` comparison §4 performs would turn a 500 with a misleading message into a
refusal where an operator can act on it. It is in `BACKLOG.md`, along with the fact that nothing in
the stack notices a NAR of this kind arriving by hand.

**And the check that was supposed to prove this could not.** B3-2 was written as B3-1's control — the
run that shows the check can fail. It cannot be, because it comes back listing its processor exactly
as the positive case does. The control is the third check, which removes both NARs and requires the
type to disappear. It ran, and it is what earns the positive result.

### The verification path had never been run, and it cost more than the milestone

**Seven defects on 2026-09-08, all in `tests/verify/m-b*.sh` and the block they mirror, none in the
product.** `./tests/verify/m-b3.sh` was executed for the first time and did not reach its first check.
Five runs were needed to reach the milestone's question.

| | |
|---|---|
| `mapfile` | A bash 4 builtin; macOS ships 3.2. The scripts run without `set -e` on purpose, so it was noise rather than an abort — `DROP_BEFORE` stayed unset and the restore step deleted **every** file in the drop directory instead of protecting what was there. `M-B1-verification.md` opens by promising the opposite |
| `trap … INT` | Ran the handler and then **resumed**, with `EXIT` running it again at the end. Since restore may restart Liquid and wait, `Ctrl-C` looked like nothing happening. The goal that commissioned `m-b2.sh` asked for "everything restored including on Ctrl-C"; it had never been tried |
| Port 8443 | NiFi's default, not this stack's 8833 — hardcoded two lines below a `SYSTEM_HTTPS_PORT` the script had just read from `.env` |
| `127.0.0.1` | An IP sends no TLS server name, so Jetty answers `400 Invalid SNI`. The token came back as an HTML error page and **every count was zero** |
| Readiness | Taken from Jetty answering (`405` the moment it binds), then from a token being issued — both proxies. NiFi issues tokens before its extensions finish loading |
| Credentials | Read with `sed`, so `.env`'s quotes went into the password. The rejection *"The supplied username and password are not valid"* is not HTML, so the guard passed it into an `Authorization` header |
| A8-13, on #9 | The manifest carried git's **German** error text: the dashboard spawned the script with the operator's locale. It hid because this host has two gits — `/usr/bin/git` without message catalogues and `/opt/homebrew/bin/git` with them, and only the operator's `PATH` finds the second first |

**Two of those produced findings that were false rather than errors that were obvious.** A check
reported *"Liquid does not list our processor"* over a NAR that was byte-identical in `lib/` by
SHA-256. That is the dangerous shape: a broken measurement that answers instead of failing.

**The repair that mattered was none of the seven.** It was giving the checks a control: they now count
`GenerateFlowFile` — a processor every NiFi ships — before drawing any conclusion, and refuse to
conclude when it is absent. The check that most needed it was the one asserting a type is **gone**,
which a broken query satisfies perfectly.

### Tomorrow's first question: Liquid autoloads, and M-B4 guards the other path

**The largest open question this project has, found on 2026-09-09 by a check that refused to be
explained.** `nifi.nar.library.autoload.directory` points at `nar_extensions`, so NiFi loads a NAR
**out of the drop directory, at runtime, without a restart and without `lib/`**. Measured: a NAR built
there and otherwise left alone was listed by the API after **20 seconds**, container `StartedAt`
unchanged, file not in `lib/`. And the catalogue was already carrying `ProbeA` and `ProbeB` —
B3-3's fixtures, which the suite writes there and deletes, which were never in `lib/`, and which
no restart followed. NiFi loads them and never unloads them.

**What is in question, and none of it is settled:**

| | |
|---|---|
| **FR36 / M-B4** | Built, 32 cases green — and it refuses to copy into `lib/` while NiFi loads from the drop directory anyway. It guards a path that does not load |
| **FR29** | The restart it makes the operator's is not required |
| **`nar-build`'s own words** | *"Liquid loads NARs from /nar_extensions at startup only. Ask the operator to restart it"* — printed to every agent, and false |
| **FR30** | The copy into `lib/` holds and looks redundant |
| **M-B3 check 3** | Established that Liquid lists what we build; never separated which path did it |
| **Where the setting lives** | `volumes/liquid/conf/nifi.properties:37` — local state. The stock image says `./extensions`, and nothing in the repository sets it, so **a fresh installation may behave differently and no branch carries the difference** |

**Deliberately not repaired.** Two explanations for the red check were offered and withdrawn the same
day — a leftover unpacked bundle, and an answer from the instance being replaced. Both were wrong,
both were tested, and the second was tested *before* being written down. The third rests on a
configuration value read out of the running container. What the deployment path should be is a
decision to take with a clear head, not a guard to adjust until a check goes green.

**M-B4 is otherwise finished**: `narcheck.py` parses the constant pool properly, 487 + 27 green, and
§4's checks 0, 1, 2, 4 and 5 pass. Check 3 is the one that found this.

### Things on disk that matter

`/Users/christof/repos/liquidupstart-backups/` — **outside the repository on purpose**, because the
root `./cleanup.sh` deletes `volumes/` wholesale and a backup kept inside it dies with the original:

| | |
|---|---|
| `.env.bak` | The 252-line configuration. `cleanup.sh` deletes `.env` too |
| `_git-secrets.bak` | The deploy keys registered with GitHub for both declared repositories |
| `_openclaw-claude.bak` | A Claude Code login (stale — see below) |
| `_openclaw.bak-2026.7.1` | The state the 2026-09-05 baseline left. **This is what OC-28 replays** |
| `_openclaw.working-2026.9.1` | The migrated state, before the upgrade test replayed it |
| `digests-{before,after}.txt` | Registry digests of every image, so a later difference can be told from an upstream move |
| `pr-drafts-2026-09-05/` | The scratch directory before its records were promoted into `docs/verification/` |
| `_openclaw.was-2026.9.1.tar` | The state directory 2026.9.1 left, archived before the rebuild to 2026.7.1 |
| `.env.before-a8`, `.env.before-a8-repair`, `.env.before-a8-repair2` | The declaration before A8-15 touched it, and twice after a malformed entry had to be taken out |

`volumes/repos/csv-columns` is a leftover from the A2-5 observation. **Leave it**: A4-16 uses it as a
clone the feature did not create.

### The Claude login expires, and a long-lived token does not help

Four interactive sign-ins in two days. The login lives only in `volumes/_openclaw-claude` and does
not survive a reset.

**A long-lived `CLAUDE_CODE_OAUTH_TOKEN` was measured and refused.** With the file login set aside and
the token in the process environment a turn still fails `Not logged in`; the same token in the same
empty directory is accepted by the Claude CLI. The in-process Agent SDK — which is what serves turns
on 2026.9.1 — does not authenticate from it. Leaving it in `.env` would be **actively harmful**:
`start.sh` branches on it and skips the sign-in, so an expired login would stop prompting and turns
would fail silently. The full measurement is in `verification/RESULT-openclaw-2026-9-1.md`.

Still open, and now in `BACKLOG.md`: the CLI *does* accept the token, so a CLI call made with it
might materialise a `.credentials.json` the SDK then reads. Nobody has measured that.

### Docker Hub's quota, because it is invisible until it bites

**100 manifest requests per hour, per public IP**, when nobody is signed in — measured from Docker
Hub's own header. Every pull and every digest lookup counts. One cold start fits; a digest snapshot
costs about fifteen lookups, so six exhaust an hour, and the count is keyed to the IP, so colleagues
on one network share it. `docker login` raises it and belongs to the **host's** Docker — nothing goes
into `.env` or the repository. Not an installation requirement; a development-loop one.

## How work proceeds

The cycle is in §7 of `docs/FEATURE-git-integration.md`. In short: write the test cases → **the
operator reviews and signs them off before anything is built** → write the goal → run it **in a fresh
session** → check the evidence is really in the transcript → review the diff against what the cases
meant → update the documents and the process log.

**Execution runs in a fresh session; design and review do not.** The best decisions came out of an
accumulating conversation; executing them is better served by a clean context and the documents.

**A task outside the goal mechanism writes its result to a file**, not only to the chat. A result
that exists only in a transcript has to be carried by hand, and that is where it is lost.

## What the failures taught

**A test that writes into the checkout it runs from can destroy work, and nothing goes red.**
`OC-74` on #15 needed to run a fragment of a shell script, so its first form wrote a small bash
runner into the directory under test and named it **`run.sh`** — and one of its scenarios passes
`repoRoot`, because the point of that scenario is to run against the file this repository ships. It
overwrote the project's launcher: 183 lines, gone. The suite stayed green, because nothing in it
reads `run.sh`. `git status` caught it and `git show HEAD:run.sh` restored it.

This is the **third** time this shape has cost something here — after the two `git checkout`
accidents above — and the first where the destroyer was a test rather than a command typed by hand.
The rule that follows is narrower than "be careful": **a fixture writes only into a directory it
created**, and a path it was handed is for reading. `mkdtemp` per scenario costs nothing; the runner
is now `ask.sh` inside one. And the general half, which the other two cases already said in their own
way: *the thing that causes this kind of damage is never the thing that reports it* — so after any
run that writes, `git status` is the check, not the test result.

**Look in the log the failure belongs to, not the one you know.** For a day this project recorded
that a mismatched NAR is reported nowhere. It is reported — in `nifi-user.log`, by the web layer that
refused the request, while `nifi-app.log` holds nothing. Every check here read `docker compose logs`
and concluded silence, which is a claim about where we looked dressed up as a claim about the system.
The same trap as *a suite is green about the paths it walks*, one layer over: **a log is quiet about
the failures it does not receive.**

**An explanation that fits every observation is not the cause.** On 2026-09-08 this document
recorded, with confidence and a mechanism, why `volumes/_openclaw` would not delete: nested bind
mounts, released shortly after the container. It fit everything seen — the refusal, the paths
involved, the fact that it worked later. On 2026-09-09 it took four measurements to break: the whole
stack down, every container gone including the one that mounts the repository, `df` showing no mount
point, and `mv` succeeding on the same directory `rmdir` refused. The wrong answer had survived a day
of being believed because nobody had tried to disprove it — only to explain what had already
happened. A cause is what survives an attempt to break it, not what accounts for the evidence you
happen to hold.

**A tool that has never been run is not a tool.** The verification scripts were written to make
verification trustworthy, were reviewed, were recorded as passing, and carried seven defects between
them — one of which made them delete the directory they promised to protect. Every one surfaced on
the first actual execution, and the milestone they were meant to check took less effort than they
did. The suite has the same property but hides it better: a case nobody runs is a claim, and the
whole point of this project is the difference between the two.

**A count of zero is not a result until something that must be there is counted.** Twice on
2026-09-08 a check answered *"Liquid does not list our processor"* over a NAR that was byte-identical
in `lib/` — once because the request went to an IP that Jetty refuses, once because the catalogue had
not finished loading. Neither failed; both **answered**. A negative reading needs a positive control
in the same breath, and the check that needed it most was the one asserting something is absent,
which any broken query satisfies.

**Readiness is not a proxy you like the look of.** Four criteria were tried in one afternoon: the
container being up, Jetty answering, a token being issued, and finally the catalogue containing a
processor every NiFi ships. Each was closer and each was still standing in for the thing the check
actually reads. The last one is not clever — it is simply the same question the check asks.

**A machine can hold two of the same tool.** A8-13 was green in every session and red in the
operator's, on the same commit, because `/usr/bin/git` has no message catalogues and
`/opt/homebrew/bin/git` has German ones. Nothing about the code differed; the `PATH` did. Anything
whose output is parsed must be pinned to `C`, which `tests/lib/shell.ts` had done since M-A1 and the
dashboard had not.

**And it happened twice the same day, by a different mechanism.** The start hung silently for five
minutes at the state migration, because GNU `timeout` — present only where Homebrew put it — runs its
command in its own process group, `docker compose run` then reads a terminal it no longer owns, and
the kernel stops it with `SIGTTIN`. The call was *bounded*, which is what OC-3 requires, and the
bound did not save it. Both defects are the same lesson at two levels: **what is installed on the
operator's machine is part of the system under test**, and neither `PATH` nor locale is a detail a
suite can leave to chance. Neither would ever have surfaced on CI.

**A suite is green about the paths it walks.** 334 cases passed while the dashboard's Start button
could not bring up a stack, a malformed declaration destroyed a running installation, and a start
that left a repository broken ended in the word *succeeded*. Nothing was wrong with the cases. They
had simply never been on that path, because until M-A8 no case asked what an **operator** does — and
the milestone that finally did found six defects in three sittings. The lesson is not "write more
tests"; it is that coverage is a claim about *routes*, and this suite's routes were an agent's.

**A test that reads only stdout cannot tell silence from failure.** A8-26's own helper joined a shell
function to its call with a semicolon, which put one at the start of a line. `bash` refused the whole
script, stdout came back empty — and empty is exactly what *"nothing needs attention"* looks like.
The helper now asserts the child's exit status. The same day, five unrelated cases went red because
`sh()` forwarded the operator's `.env`; both are the harness being wrong in a way no assertion was
watching.

**Assert the property, not the circumstance.** Tests were green and wrong the same way: they encoded
what had *not* been done. The newest instance is from 2026-09-06 and was written that same morning —
OC-22 asserted that `claude-opus-5` was present with its 1M context window, and passed while the
model could not be selected at all, because 2026.9.1's model policy did not allow `claude-cli/*`.
**Being catalogued is not being usable.**

**Facts are computed, conduct is taught.** Where a question has a determinable answer, give the agent
a way to ask. This is now also how the stack configures itself: the start script reads
`openclaw --version` from the built image and `meta.lastTouchedVersion` from the state, rather than
inferring either from the Dockerfile's pin. A pin plus a comment goes false the moment someone
changes the pin.

**Pin what you depend on.** A floating tag moved on 2026-09-05 and broke four things in a stack whose
own code had not changed since June. And a pin is not one line: three helper containers in the start
script still ran on `:latest` for another day, configuring a gateway running something else.

**Measure before you build.** On 2026-09-06 a coherent chain of reasoning — the wrapper is bypassed,
so its environment is not injected, so authentication fails — was wrong. The cause was an expired
login. The operator asked what exactly was being proposed instead of letting it be built, and one
message of measuring replaced a change against a problem that did not exist.

**A payload is not a page.** M-A8's whole point was that the route had been correct and unread for
four milestones, so its case had to assert the *served page*. SvelteKit embeds the page data in the
HTML for hydration — so `html.includes(publicKey)` is green on a page that ships the key and draws
nothing, which is the same defect one layer out. The assertion strips `<script>` blocks first, and
the control that proves it can fail was run: with the key file removed the label still renders and
the key is gone.

**A green suite says nothing about a path nobody walks.** Two whole classes of defect surfaced only
when someone tried to *use* the thing: the upgrade path (every existing installation's situation, and
no cold start can reach it, because it deletes the state first) and sending an actual message (which
found the model allowlist and the in-process SDK).

**A criterion that depends on when you look is not a criterion.** The service sweep this project used
since A7-5 reported "all running, none unhealthy" while the gateway was on its tenth restart:
`docker compose ps` shows a crash-looping container as `running` with health `starting` between two
crashes. `tests/lib/health.ts` reads status, `RestartCount` and health per container instead.

**A block needed in two places belongs in neither.** The cold-start procedure told the operator to
reuse another step's block "with a run-specific name", and the name was pasted literally as
`<this run>` — the third placeholder inside a runnable block in one week, and this one was introduced
while fixing the previous one. The block became `scripts/linux/image-digests.sh`, which owns the
naming so nothing has to be filled in. Its first run found that `:latest` had moved again — and that
the two images report the *same version and commit* with different digests, so **a version string does
not identify an image**.

**A check that cries wolf is worse than no check.** That same script, run once too often, hit Docker
Hub's rate limit and reported every image as unreadable — which, diffed against a good snapshot, reads
as though every tag had moved at once. Failures are now excluded from both sides, incomplete snapshots
are named so they cannot become a later reference, and the verdict says what was actually compared.

**An `if` condition is where `errexit` goes to die.** `if ! emit > "$OUT.partial"` reads like a guard
and is not one: bash suspends `set -e` for everything the condition calls, so a failed
`docker compose config | jq` ran on, the later stages produced their lines, and `emit` returned the
status of its last loop. The result was a stub snapshot *stamped as the reference* — the exact
poisoning the temporary file had been added to prevent, one layer up. A stage whose failure must
count has to be read into a variable and checked, or the guard is decoration. Sibling of *a bound
that cannot bind*: both looked right in the diff and did nothing when run.

**"I cannot reproduce it" is a statement about the attempt, not about the system.** Timur suggested
`timeout -k` on the bounded docker runs; it went into the backlog because the situation justifying it
could not be produced on demand. Two days later a suite run hung fifteen minutes on the very case
that asserts the bound works, and in that window three of four attempts needed a SIGKILL rather than
the signal. An hour later it was gone — four of four ended at SIGTERM, same host, same stack — so the
rate belongs to the window and not to the system, and the cause was never established. The deferral
had been reasoned from one lucky measurement on 2026-09-11, rc 124 after 16s, written into the case
header as a property. **One observation of an intermittent mechanism is not a property**, in either
direction: it was wrong to call the bound reliable then, and it would be wrong to call it broken now.
What is measurable is that it can fail to return, and that the flag which makes that impossible cost
one line.

**A pin is only as good as the range it pins to.** Pinning the subnet fixed a real defect — a gateway
trusting a range no container was in — and chose the one value guaranteed to collide: 172.18.0.0/16
is what docker hands out first, so it is what every leftover network on the host already holds. The
fix and the collision came from the same fact about docker, read once and used in only one
direction. Ask what else knows the number you just wrote down.

**`grep` under `pipefail` has now cost three findings.** It exits 1 when nothing matches, which is
not an error but is indistinguishable from one: it aborted a start for an `.env` predating a key,
truncated a script that searched for an absent line, and ends `image-digests.sh show` for a stack
whose images are all built locally. `awk` filters without an opinion about emptiness, and where
`grep` is the right tool the exit has to be handled where it happens.

**Do not let a document exist twice.** Promoting the cold-start procedure from `.pr-drafts/` to
`docs/` left two copies; every repair went into one while the operator worked from the other, so a
fix that had been reported as done was hit again. It is the same failure the tests are explicitly
built to avoid — they read the thing under test out of its real file rather than carrying a copy.

**The manual cases earn their place.** Six observed by 2026-09-05, three failed, and two of those
failures were the *case* being wrong rather than the agent. On 2026-09-06 OC-8 and OC-9 turned out
not to be automatable at all: with and without the setting the stack answers identically on every
route, and the pairing decision happens only after a browser signs a challenge.

## Next

**The live list is at the top of this file**, under *Where it stands* — the agreed next three, and the
table of what each PR still owes. What is here is the standing material: how a failure on your machine
differs from a failure in the product, and the struck-through entries, which are kept because they
record what was walked and what it found.

*Rewritten 2026-09-30, and again 2026-10-02.* The 09-30 version said "wait on Timur, all four PRs are
answered". That was true for about twenty hours. It also carried the `operator.admin` direction as if
the `127.0.0.1` binding were an unsettled precondition of it; both halves of that are now resolved and
separated — see the top of the file, and #20.

Still open and not in the live list, because it is small and nobody is waiting on it: **the toolbox
image only changes when something removes it.** `update.sh` removes it and the start refuses before the
teardown when its tools are missing, but the durable form is a label carrying a hash of its Dockerfile.
`BACKLOG.md`.

### If a test fails on your machine and passed on the one it was written on

Four shapes have cost real time. The last one is not an instance but a habit, and it is the one to
watch for:

- **A contract check against an installed stack.** A3-3, A4-16 and A1-4 read `volumes/`. In a git
  worktree there is none, so they fail there and pass in the main checkout. **Not addressed** — they
  have no fixture and no skip, so in a worktree they are simply red. Not a regression, and not a
  thing to spend a morning rediscovering.
- **Docker objects shared between checkouts.** Container names, image tags, networks and the two
  subnets in `m-oc.subnet-preflight` are per-run since 2026-10-02, for everything that goes through
  `tests/lib/dashboardserver.ts`. Before that, two runs on one host removed each other's containers.
  Objects the helpers create carry `lu-test=1`, and a run sweeps stale ones at its start — because
  the run that leaks is the run that did not reach its own cleanup. Anything that names a docker
  object without those helpers is still shared; `grep -rn "docker.*--name" tests/` is the check.
- **A host write the container has not seen yet.** The project is a bind mount and Docker Desktop
  propagates with a delay. Fetching a page straight after writing a fixture file failed **2 of 3 runs
  on an idle machine**. `awaitFileInContainer` waits until `docker exec cat` returns the bytes that were
  written.

- **Waiting on the clock instead of on the condition.** Six instances in one day, 2026-10-02, all
  repaired. Three were found by accident and three by looking:
  1. the page fetched straight after a host write (above);
  2. the first repair for it, which polled the **page** until it said what the case expected — worse
     than the flake, because a product change then becomes one `(unnamed)` timeout and no test runs at
     all, where before it was a named failure beside nine passes;
  3. `m-a16.lock-identity.test.ts`, `Bun.sleep(900)` and then read the lock file, empty under load.
     Measured: the holder lands after about 250ms on an idle host and 1047 to 1342ms with eight starts
     at once, so eight of eight concurrent runs were red;
  4. `m-a15.clone-lock.test.ts`, `Bun.sleep(700)` and then ask whether the lock exists — the same
     mechanism, governing two assertions;
  5. `m-a16.lock-wait.test.ts`, which released a lock after 3000ms and asserted that 3000ms had
     passed. **That one could pass over the defect it exists to catch**: with the wait removed from
     `git.sh` altogether and the release brought forward, all four cases in the file passed. A flake
     costs a rerun; this costs the guard;
  6. and five cases in `m-a16.lock-identity.test.ts` that ran the start script inside bun's **default
     5s budget**, one of which timed out at 6055ms in eight of eight. A budget is a wait too.

  The rule they give: **wait on the thing you are diagnosing, never on the clock, and never on a
  sentence the product renders.** A predicate about the product turns a product defect into a timeout.
  A fixed sleep is a guess that holds until the machine is busy. Both report on the host instead of on
  the subject, which is what makes them worse than no wait at all.

  **How to look for the next one**, since three of these were found on purpose: `grep -rn "Bun.sleep"
  tests/` and read every hit — a sleep inside a polling loop is a poll interval and fine, a sleep
  followed by a read is the defect. Then find the cases that run something slow without a budget:
  a `test()` whose body spawns the start script, docker or the dashboard and whose closing is `});`
  rather than `}, BUDGET);`. Eight copies of the same file at once is what makes any of it visible —
  `for i in $(seq 8); do bun test <files> > /tmp/load-$i.txt 2>&1 & done; wait`.

  **One is reported and not repaired:** `tests/system/m-oc.proxy-attribution.test.ts:135` calls
  `docker compose logs` in the default 5s. It is in the opt-in `--system` tier, it has never been seen
  to time out, and verifying a change there needs a running stack — so it is named on #19 rather than
  changed blind.

0. ~~**A8-15, A8-16 and A8-17**~~ — walked 2026-09-08. Step 3 of A8-17 answered yes, which is the
   finding, not the pass.
0. ~~**Timur's two reviews of #11**~~ — answered 2026-09-10 (F1–F10) and 2026-09-11 (N1–N10), every
   finding reproduced before it was touched and every fix carried by a case run against its control.
   Two of the fixes were the interesting ones. The bound on every `docker run` was decorative:
   coreutils `timeout` reaches the docker *client*, and a node PID 1 without a handler ignores the
   SIGTERM it forwards — `--init` is what makes a bound a bound. And `if ! emit` cannot see a failing
   pipeline stage, because bash suspends `errexit` for the condition of an `if`; the F10 repair had
   turned a rejected snapshot into an accepted stub. Three of my own came out of the same work,
   including `grep -v` under `pipefail` for the third time: it exits 1 when nothing is left, which
   ends `image-digests.sh show` for a stack that pulls no images. `awk` has no such opinion.

   Both replies are posted; `fix/openclaw-2026-9-1` is pushed through `b9a64fb`.

   **A third review followed on 2026-09-14** and marked N1–N10 resolved, with four new findings. The
   one that mattered: pinning the subnet to 172.18.0.0/16 pinned it to the range docker hands out
   first, which is the range `main`'s start script takes for a network nothing joins and nothing
   removes. Any host that had ever run `main` would have failed the start — after `down.sh` had
   emptied the stack, because the create had no error handling. The default is 10.99.0.0/24 now, the
   check runs before anything is stopped, and the pre-created network is gone entirely: `openclaw.sh`
   reads the range from `.env`, which is what compose declares as ipam, so the ordering dependency
   between the two scripts no longer exists. Verified by starting: compose created the network on
   10.99.0.0/24, `trustedProxies` names it, and the gateway answers from 10.99.0.3.
0. **The autoload finding** — see *"Tomorrow's first question"* above. Nothing else in this list
   matters until it is decided, because M-B4 and part of M-B2 rest on it.
1. ~~**M-B3**~~ — built and verified 2026-09-08. Its negative control did not do what it was written
   for, and that is the milestone's result rather than a defect in it: see *"A mismatched NAR loads,
   and nothing says so"* below. The stack on this machine is now `feature/liquid-java-extensions`-shaped
   and its Maven cache is warm again; the four commands that got it there are in the branch table's
   discriminators above.

   ~~**Nobody has triggered a mismatched processor.**~~ — triggered 2026-09-09. It fails at
   *instantiation*, not at trigger; the error lands in `nifi-user.log` where nothing looked; and the
   operator is told their session expired. See *"A mismatched NAR loads, and then tells the operator
   the wrong thing"* above.
3. ~~**The repaired migration path had never been executed.**~~ — run 2026-09-09. A 2026.7.1 state
   was restored from `_openclaw.bak-2026.7.1` and `./scripts/linux/start.sh` migrated it with GNU
   `timeout` on `PATH`, which is the condition that produces the hang: `state migrated.` inside a
   minute, no `SIGCONT`, no stall. The whole upgrade path came with it — `deviceAutoApprove` written
   into a state that had never carried it, `plugins.entries.codex` removed as a key 2026.9.1 refuses,
   and the config shape moved to 2026.9. `tests/run.sh oc` then ran **50 pass, 0 fail** against a
   state that had just been migrated rather than one already on 2026.9.1.
2. **Timur's reviews.** #12, #13 and #14 were reviewed and merged on 2026-09-08; **#9, #10 and #11
   are open**, and #11 is next — it is on his list for 2026-09-09. They run in parallel and block
   nothing, which is what the stacking is for, with one exception: **#11 is the only door to `main`**,
   and it has stopped being a one-line pin. The whole migration, #12 and #14 sit inside it. Reviewing
   it as though its title were still accurate would be reviewing the wrong thing.

   The working copy is currently on `fix/openclaw-start-stdin` and the stack is 2026.9.1-shaped.
   `volumes/_openclaw` holds a state 2026.9.1 has written, so **going back to #9 or #10 means
   clearing it and restoring `_openclaw.bak-2026.7.1`** — OC-21's one-way door, and the discriminators
   above say which stack is running.
3. **The repaired migration path has never been executed.** #14 fixes the `SIGTTIN` hang, the case
   asserts it at the text level and its control was run — but the start that verified it *skipped*
   `openclaw_migrate_state`, because the state was already 2026.9.1 by then. Running it in anger
   needs a 2026.7.1 state restored first, which is OC-28's replay. After a day in which eight of nine
   defects sat in code nobody had ever run, this is the obvious loose end.
4. ~~`BACKLOG.md`~~ — done 2026-09-07. All three feature branches carry one; the migration branch
   was the one without, and its file holds the four things 2026.9.1 deferred plus the `bun_runner`
   entrypoint alternative that #12 had nowhere to record. Two entries on #9 and #10 are answered
   rather than open — the Claude CLI install, fixed 2026-09-05, and `bun_runner` reporting unhealthy
   with no app, fixed by #12.

~~**The working copy is `main`-shaped and its `volumes/` was destroyed by OC-20.**~~ **Repaired
2026-09-07 while running M-A8**, because the second gate cannot pass without it. Three things had to
happen, and the next person switching branches will need the same three:

1. `tar -xf ../liquidupstart-backups/_git-secrets.tar -C volumes/` — the archived keys are the ones
   registered with GitHub, and both declared repositories cloned on the first attempt with them.
2. `./scripts/linux/start.sh` — the containers were still the `main`-shaped ones. The discriminator
   in "One working copy, one stack" above is what says so; it now answers
   `/usr/local/bin/git-repo-info`.
3. `./config/scripts/build/opencode.sh`, then `docker compose up -d opencode`. **OC-20 rebuilt all
   four images from a `main`-shaped checkout**, so `liquidupstart/opencode:latest` had no `ssh` and
   A3-7 failed on it — the same gap M-A3 fixed in the templates months ago, reintroduced by building
   from a branch that does not carry the fix. The other three images were not rebuilt and did not
   need to be, but **any image built during OC-20 is suspect on a feature branch** and the check is
   one line: `docker compose exec -T <service> sh -lc 'command -v ssh git'`.

Both gates then passed: `./tests/run.sh m-a8` 35/35, and `./tests/run.sh` 312/312 plus the 27
dashboard tests.
