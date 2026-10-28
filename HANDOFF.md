# Handover — 2026-10-28

> **Committed on `main` since 2026-10-10.** It used to be kept staged-and-uncommitted here while the
> committed copy lived on #19. There is one copy now and it is this one. #19 carried an older version
> on its branch, and its merge on 2026-10-21 left `main`'s copy as it was. Two copies of
> one document with different content is the defect `A1` on #17 was — twelve rows specified twice,
> disagreeing in four places, and nobody could tell which they were holding.

Read this first. It is the map and the current state; the specifications are the documents in `docs/`.

**The state below is dated per section, and the current state is the first one.** *Where it stands,
2026-10-28* has the live picture, *2026-10-27, later* under it, *2026-10-27, morning* under that, *2026-10-26, later* under that, *2026-10-26, morning* under that, *2026-10-25* under that, *2026-10-23* under that, then *2026-10-22, late*, *…evening*, the six rounds, and *2026-10-22*, the morning; *2026-10-21, evening* under that is round one of #45, and *…the end of
the review series* below that gathers what the series found. The sections under those are the
series' other sessions, each as it ended, and *2026-10-20* under them is the day it began. Read the
first eleven and the review bodies they point to; the rest of this file is the map and the lessons.

Everything after *What is being built* was written on 2026-09-09 and describes the end of 2026-09-08,
unless a paragraph carries its own later date. It still says "three features and two repairs, on five
branches"; `./scripts/state.sh` on #43 gives the count of ours that are open. **Where an older section makes a claim about the present,
believe the dated one.**

## Where it stands, 2026-10-28: #52's first round answered, and the update to 0.8.0 next

Timur requested changes on #52 at `d0ca7cb`: three to address, six smaller, and #51's closing line.
Answered at **`36b9005`**, one commit, with
[the comment](https://github.com/nocodenation/liquidupstart/pull/52#issuecomment-6466373052) and the
description and title rewritten:

- **The `.env` reader.** It resolves `\$` and, in single quotes, `\'`; what follows a closing quote
  is no part of the value; a quote that does not close on its line is warned of by its key. OC-80
  holds thirty-two shapes measured against compose, values across lines, and four unclosed quotes.
  **Reading across lines was built and taken back**: the settings are lists on one line,
  `render_dockerfile` cuts at the first newline, the scan took minutes on a stray quote, and a key
  named `k` hung the build. Three local `/code-review` passes found that; a fourth, low, found
  nothing.
- **The card** decides itself whether it is drawn, so A8-39 mounts it over `gitCard()` on every run.
  A8-38 pins ten sections, a shared pattern checked on both sides, and hidden sections hidden.
- **The description closes #51**, by the operator's word of 2026-10-28, a deliberate exception to
  CLAUDE.md's rule; GitHub lists exactly #51.

`./tests/run.sh` at `36b9005`, clean: **1452 / 12 / 0**, dashboard 45 / 0, no `oom`. **The earlier
worktree runs counted less than they said:** `../liquidupstart-wt-50` had no `dashboard/node_modules`
until today, so the mounted component cases were among the 28 skipped at `d0ca7cb` and in the
`e622e01` baseline. A feature worktree needs `bun install` in `dashboard/` before its run covers the
component tier; `SP-2`'s voiced skips say so in the output, and nobody read them.

`BACKLOG.md`: one `OPEN` line, the card's result line throws a `TypeError` when a repository is
tested, on `main` too; and the `SETTLED` readers entry now says why compose is no reader as it stands.

**Open, and whose.** Timur's: reviewing #52 again; `45-26`. Ours, once #52 merges: rebuild what reads
`.env`, `./run.sh`, remove the worktree, then #50 with a specification first.

**The update test Timur asked for** waits on the operator's OpenClaw prompt in the installed copy,
`~/.liquidupstart`, at 0.7.0, whose stack is the one running. Read before it runs, 2026-10-28:
`liquidupstart --update` runs the hosted `update.sh`, the same as `scripts/install/update.sh` at
0.8.0, which is `e622e01`. It stops the stack first, prunes the whole build cache of the engine, and
keeps `.env` and `volumes/`. `privacy-proxy` is in neither its image list nor the dashboard's
`builtImages()`, and `build.sh` builds it only when `PRIVACY_PROXY_ENABLE=1` is already set. So the
proxy has to be switched on before Rebuild, or the image from 2026-09-11 that the update leaves runs
instead. That is a candidate issue for Timur once the test has shown it; not raised yet.

## 2026-10-27, later: #52 open, on the operator's word

Timur merged #5, the privacy gateway, at 11:36Z, raised the repositories card from a screenshot, and
opened two issues, #50 and #51. The operator asked for the card, and for what was left lying around to
go in with it, which made one pull request, **#52**, head `d0ca7cb`, and no other:

- **The repositories card** is not drawn when nothing is declared, and keeps the parser's reason
  when a declaration cannot be read. A8-37.
- **#5's `.env` reader** kept a quoted value's comment, so every Liquid, OpenCode and privacy-proxy
  build warned of an unrecognized mode and an `override` behind a comment fell back to `add`. It
  now reads the lines `.env.example` and the dashboard write as docker compose 5.6.1 does, measured
  on twenty shapes, and says what it leaves out. The renderer's `xargs` and `awk -v` rewrote
  commands; both are gone. OC-80.
- **The #51 numbering.** The configuration page numbers what it shows, 1 to 10, and the file keeps
  its numbers, because privacy-proxy's contract test reads `# 7. PRIVACY PROXY` by its exact text.
  Prose names sections by title. A8-38.

`./tests/run.sh` from a clean tree: `main` at `e622e01`, before the branch, 1394 / 28 / 0; `d0ca7cb`,
1410 / 28 / 0; dashboard 45 / 0 both; no `oom`. Five local `/code-review` passes ran before its
commits. One `SETTLED` line in `BACKLOG.md`: `.env` has many readers with their own rules.

**Open, and whose.** Timur's: reviewing #52; the mapping in `45-26`. **#50**, the component switches,
waits until #52 has merged, then a specification first, by the operator's choice; its decision 4
keeps the Git card with a warning when both agents are off, which fits #52 and has to be said there.

## 2026-10-27, morning: #49 merged, and the finishing list is empty

Timur merged #49 on 2026-10-27 at 06:51Z. His review of the 26th stands as written, with its one item
answered at `9501c5d` and no further comment from him. **Nothing in `FINISH.md` is open on our side:**
items 1 to 13 are answered or settled, and 9 is half done, its file split deferred as its row says. No
pull request of ours is open; #5, #7 and #8 are not ours, and each conflicts with `main` in the same
files as before #49. Every one of the 77
`BACKLOG.md` entries carries a state, and ``grep -n '^`OPEN' BACKLOG.md`` returns one: `45-26`,
Timur's mapping.

Liquid was rebuilt from `main` at `47e8bfd` the same morning: `B4-7` 4 / 0 against the running
container, and Liquid answered 200. The build now reads `LIQUID_*` for the image's packages and
commands. The `.env` here sets `LIQUID_SYSTEM_DEPENDENCIES` and `LIQUID_POST_INSTALLATION_COMMANDS`
empty, both modes at `add`, and holds no `NIFI_*` key, so the image installs what it did before and no
warning was printed; what changed in the running container is the entrypoint.

**The rule from 2026-10-26 stands:** a new finding is one line in `BACKLOG.md`, and no new pull request
without the operator's word.

**Housekeeping.** The worktree `../liquidupstart-wt-f` held the merged branch `fix/last-finish-rows`;
removed with the operator's word the same morning.

## 2026-10-26, later: #49 carries the last three rows, and waits on Timur

*Review round 1, the same afternoon.* Timur asked for one thing: a case for the copy that fails before
it is judged, which B2-6 ran without holding. Answered at `9501c5d` with two B2-13 scenarios, and
`./tests/run.sh` from a clean tree **1394 / 28 / 0**, dashboard 32 / 0, no `oom`
([comment](https://github.com/nocodenation/liquidupstart/pull/49#issuecomment-6417580786)). He will
check only that. His note on a guard in `sh()` is one `SETTLED` entry in `BACKLOG.md`, not built,
by the operator's rule of that day: **after #49, a new finding is one BACKLOG line, and no new pull
request without the operator's word.**

**For the merge note.** The rebuild after #49 applies the `LIQUID_*` image settings for the first
time. With `.env.example`'s defaults that changes nothing; an installation whose `.env` set them,
expecting nothing to happen, will now get them installed.

The operator answered one round of questions and chose: repair `45-30`, remove the gateway token's
key, leave `S3` and the `operator.admin` rule unbuilt, and rebuild Liquid. **#49** carries `FINISH.md`
rows 11 to 13 and strikes them, with `45-1`, `45-30` and the token entry in `BACKLOG.md`. Head
`a25af3c`: `./tests/run.sh` from a clean tree **1391 / 28 / 0**, dashboard 32 / 0, no `oom`; it merges
clean into `main`. `main` carries the four decisions about the backlog in `0bb8bfe`; the rebuild is
under *Housekeeping*.

**What it found beyond the rows.** OC-79, every `.env.example` key has a reader, found the four
`LIQUID_*` image settings unread since the rebrand of 2026-06-19, because `liquid.sh` asked for
`NIFI`; #49 reads `LIQUID` and warns about a leftover `NIFI_*` value. The local review of #49 found
B5-34 removing a content-addressed tag every checkout shares, row 11's defect without a literal;
#49 tags it per run. And the B2 cases caught two defects in the row-12 repair before it was
committed: `rm -f` ending the start under `set -e`, which B2-6 caught, and bash 3.2 keeping the
quotes of a replacement that bash 5.2 needs, which two B2-12 cases caught and B2-13 now holds.

**Open, and whose.** Timur's: reviewing and merging #49, and the mapping in `45-26`. Ours: `FINISH.md`
row 10, the closing sweep, once #49 has merged.
Once #49 is on `main`, rebuild Liquid again for its entrypoint:
`./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid`, which B4-7 confirms.

**Housekeeping.** Liquid was rebuilt from `main` at `0bb8bfe` on 2026-10-26, 08:42Z, with the
operator's approval; B4-7 4 / 0 against it, and Liquid answered 200. Its first start under #48's
entrypoint emptied the load path of `b1-noversion-nar-1.0.0.nar`, a bundle that was loaded with no
copy in the inbox. The Docker VM had 17 422 MB free before the suite. No probe container is left.
The worktree `../liquidupstart-wt-f` holds #49's branch.

## 2026-10-26, morning: no pull request of ours is open, and `BACKLOG.md` is a queue

Timur merged #47 on 2026-10-26 at 02:04Z. Every pull request of this series is on `main`, and the
worktrees are removed. The three older pull requests still open are not ours: #5, Timur's privacy
gateway, and #7 and #8, opened from the organisation account by the stack's OpenClaw agent on 2026-08-17.

**`FINISH.md` rows 1 and 2 are done**, on `main`, as documentation only. Every `BACKLOG.md` entry opens
with `OPEN`, `SETTLED`, `RECORD` or `DONE-ON-#N`, checked against `main`'s tree and the merged pull
requests, and ``grep -n '^`OPEN' BACKLOG.md`` lists the queue:

- `45-1`, **ours**: `m-oc.allow-scripts`' fixed image tags, `FINISH.md` row 11. By the 2026-10-22
  section it was to follow #42's merge, and the 2026-10-25 section's *"Ours: nothing"* missed it.
- `45-30`, **ours**: the start-time race, `FINISH.md` row 12, to be repaired.
- **Ours**, from the carried-over entries: `.env.example` declares `OPENCLAW_GATEWAY_TOKEN` and nothing
  reads it, `FINISH.md` row 13, the key to be removed. `FINISH.md` had settled it on 2026-10-17; the
  entry's own words put it inside the cut line.
- `45-26`, **Timur's**: mapping four mutation-runner cases to their requirements.

The operator decided four things the same day: `45-30` is repaired, the key is removed, and `S3` and
the rule for `operator.admin` are not built, both `SETTLED` with that decision.

Fourteen entries that read as open are settled against the cut line, each with a dated note, and six
whose reason is in `FINISH.md`'s settled table point there; `S3` and `operator.admin` joined them by
the operator's decision. One of the fourteen is `45-5`: the two
sweeps keep different floors, but they act on disjoint labels, so no object meets both. Four entries
were done and never struck, and are struck now.

**Housekeeping.** The running `liquid` container runs an image built on 2026-10-09. The entrypoint,
`narcheck.py` and `nar-watch.sh` are baked into it, so every change #10, #36, #46 and #48 made to
`config/liquid/` after that date is missing from the running stack. Rebuilding is the operator's call:
`./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid`. *Rebuilt later that day,
as the section above says.*

## 2026-10-25: #40, #42, #45, #46 and #48 merged; #47 answered and waiting

Timur merged #40, #45 and #46, asked in Slack for #42's merge conflict to be resolved, and reviewed #47 and #48,
each *request changes*. All three were answered and pushed, each with its suite from a clean tree and a
comment per item, and Timur merged #42 and #48 the same evening. **#47 is the last open pull request
of ours.** It merges clean into `main` at `16c7dd2`. On that merge, tried here and not committed or logged,
the cases this round touched, TR-1 to TR-4 and the scenario table were green, 106 / 0.

| PR | What | Head | Suite (clean tree) | Comment |
|---|---|---|---|---|
| #42 | `main` merged in (row 7 of `FINISH.md` is #42's struck row; SP-5 before SP-6); sentences that said #42 was still to come corrected; then `FINISH.md` and `45-13`/`45-18` brought to 2026-10-25 | `93db37d` | 1342 / 28 / 0 at `6393ae9`, no `oom`; the head adds documentation only | [#42](https://github.com/nocodenation/liquidupstart/pull/42#issuecomment-6400981642), merged |
| #48 | item 1: what a restart costs is said in the README and the skill, held by A0-11 and B2-8; A1: a bundle not yet an archive waits for the watcher, keyed on the bundle's own name; A2 to A5; `45-29` struck | `34ccf48` | 1323 / 28 / 0, no `oom` | [#48](https://github.com/nocodenation/liquidupstart/pull/48#issuecomment-6401180075), merged |
| #47 | item 1: OC-78 asks for the name each helper gave docker, sees it up, wants 124 or 137; item 2: OC-61 reads each run's guard, `_mrc` included; A1 to A5; four of its entries struck and four noted as answered in part | `7671c82` | 1332 / 28 / 0, no `oom` | [#47](https://github.com/nocodenation/liquidupstart/pull/47#issuecomment-6401413173) |

`main` also strikes the ten entries #46 answered (`00ff80e`), by the rule in BACKLOG's introduction, which
#46 did not apply because it landed after #45 without carrying the strikes.

**What it found.**

- **A refused replacement used to cost nothing; with the load path rebuilt on every start, it costs the
  loaded bundle at the next restart.** A change that makes a sentence true can make another one
  dangerous, and the reader to protect is the agent who asks for the restart.
- **A test that matches the watcher's text matches more than the watcher meant.** narcheck uses the same
  words for a partial bundle and for a broken jar inside a finished one, so the start keys on the
  bundle's own name.
- **A check that runs once at a fixed time measures the host's speed.** OC-78's "was it up" missed
  every container at one second; a container shows as running about 1.2 s after its `docker run`.
- **Docker Desktop was off for part of the day.** The B6-37 failures in 120 ms were a missing socket,
  not the fixture; check `docker info` before reading a red as a finding.
- **zsh again:** a suite loop with `set -- $pair` ran nothing. The loops are bash scripts now.

**Open, and whose.** Timur's: checking his items on #47, and merging it. Ours: nothing. Once #47 is in,
`FINISH.md` rows 1 and 2 can be done on `main`, since no open branch touches `BACKLOG.md` any more. The
watcher's own broad match on *could not be opened as an archive* is named on #48 and left alone.

**Housekeeping.** Docker Desktop was started for the suites, with the operator's approval; the stack
came up with it. The Docker VM had 19 981 MB free right after, by `df -m` in a container, and 18 609 MB
when the last suite began. No probe container or image from today's runs is left. One older image is:
`liquidupstart/nar-builder:b6c-10699-o4032x`, 1.02 GB, from 2026-10-15, built before the sweep's labels
existed, so no sweep takes it; it is the operator's to remove.

## Where it stands, 2026-10-23: #39, #41, #43 and #44 merged, three conflicts resolved

Timur merged #39, #41, #43 and #44 and said in Slack that he had approved them; on GitHub his last
review of each still reads *changes requested*. In the same messages he asked for the merge conflicts on
#40, #42 and #46 to be resolved. Each of those has `main` (`e9d8f9a`) merged in, with every line both
sides added kept, checked line by line, except where two lines were combined into one or a statement was
corrected; each comment names those. Each then ran a full suite from a clean tree:

| PR | Merge | Conflicts | Suite | Comment |
|---|---|---|---|---|
| #46 | `7daab60` | A10-23's block, kept as this branch's with #39's *Premise*; SP-2's `SPANS_FILES` entry and `dependent` list, which hold #43's `m-a17` and #46's `m-a10.fixture-ceiling` | 1288 / 28 / 0, dashboard 32 / 0, no `oom` | [#46](https://github.com/nocodenation/liquidupstart/pull/46#issuecomment-6360209162) |
| #42 | `ebccdb1` | `FINISH.md`, row by row | 1276 / 27 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0 | [#42](https://github.com/nocodenation/liquidupstart/pull/42#issuecomment-6361004942) |
| #40 | `076b4d7` | `FINISH.md`, row by row | 1266 / 27 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0 | [#40](https://github.com/nocodenation/liquidupstart/pull/40#issuecomment-6361006862) |

#45 has `main` merged in too (`006d31e`). By its own rule it strikes `45-9` and notes `45-12`, because
#44 landed first. #48 was retargeted to `main` by GitHub when #44's branch went. All six open pull
requests merge clean into `main`.

**What it found.** A resolved conflict is not a finished merge: the text around it has to be read
again, with both sides in. SP-2's file counts were stale on #43 already, which had added `m-a17` to the
lists and not to the counts, and #46 counted only its own file; one of the figures is one SP-2's own
block declares historical, which this session had changed the day before. A10-23's text and
`m-a7.overlapping-publish`'s header named a place #39 had moved the fixture from and left them. A
`/code-review` of each resolution before its commit found them. Also, zsh does not
split `set -- $pair` either: a loop of two suites ran neither.

**Between the open branches,** each resolved by keeping both sides, whichever lands second:

- #40 and #42: `FINISH.md` row 7. #42's row, which strikes it, and #40's row 4.
- #42 and #46: SP-5 and SP-6 in `TEST-SPEC-suite-preconditions.md`.
- #46 and #48: FR30/FR31 and B2-11/B2-12 in `TEST-SPEC-liquid-java-extensions.md`.

**Ours, once #40 and #42 have landed:** `FINISH.md`'s header, row 1's count and its closing paragraph
still describe the day before these merges, on `main`. Correct them there. With #40 on `main` there is
one `parseDockerTime`, in `tests/lib/dockertime.ts`. The sections below that speak of two describe the
time before.

## Where it stands, 2026-10-22, late: Timur's first reviews of #45 and #46 answered

The operator asked for both, after the evening section was written, and approved
`docker builder prune`. It freed 21.21 GB: the Docker VM went from 3358 MB free (94%) to 23 553 MB
(58%), by `df -m` in a container right after the prune.

| PR | What | Head | Measured from a clean tree | Comment |
|---|---|---|---|---|
| #46 `fix/false-claims-round-1` | item 1: B6-37's inner jar goes to the container's own `/tmp`, because a tmpfs `tmpdir()` held it in memory and the setup was still killed at 600 MB; A1 A10-23's first case skips on `IN_GIT_REPO` with an `SP-2` voiced skip; A2 B6-46 (3) on a drop directory that fills up, so M11 turns it red; A3 *Dependencies* and *What it found* rows; A4 B2-11 split; A5 the description | `b21fb8b` | 1235 / 26 / 0, dashboard 32 / 0, no `oom` | [#46](https://github.com/nocodenation/liquidupstart/pull/46#issuecomment-6347916196) |
| #45 `docs/suite-fixture-findings` | items 1 and 2: the B6-37 note and the sign count corrected, the count by a stated rule; A1 how an answered entry is closed; A2 labels `45-1` to `45-30`; A3 four locations dated; A4 title and description | `18d72b3` | not run: no test reads `BACKLOG.md`; TR-1 to TR-4 18 / 0 | [#45](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6347921810) |

**What it found.**

- **A fixture that streams to "disk" can stream to RAM.** Bun's `tmpdir()` is a tmpfs on many Linux
  hosts, and a tmpfs page is memory charged to the container that writes it. B6-37's setup fell from
  1.6 GB of RSS to 17 MB and was still killed at 600 MB. This host's `tmpdir()` is not a tmpfs, so it
  was reproduced with `--tmpfs /w`.
- **A read-only mount cannot show that a write cleans up.** `cp` fails before it creates anything, so
  "nothing left" held whether or not the arm removed its `.part`. A tmpfs too small for the file does
  show it. The file has to be larger than a page of any kernel, because Docker rounds a tmpfs up to a
  page: on a 64 KiB-page kernel a 64 KiB bundle would fit, so the bundle is 1 MiB.
- **A count is only as good as its rule, and the rule belongs beside the count.** `45-15` said most
  specifications do not sign their scenarios. A rule that read only one cell shape gave that answer.
  With the rule written down, three of six sign every row.

**Open, and whose.** Timur's: checking his items on #39 to #46, and approving; a first
review of #47 and #48. Whoever lands second of **#46 and #43** keeps both files in SP-2's
`SPANS_FILES` entry and in SP-2's `dependent` list; the other pairs are in the evening section.

`45-N` labels: entries on #45 are named by their label from now on, and the 2026-10-22 morning section
uses them. The sections older than that name entries by position, and each position matches its
label: *entry 8* there is `45-8`.

## Where it stands, 2026-10-22, evening: Timur's six rounds answered, #37 and #38 merged

`./scripts/state.sh` on `feature/computed-state` (`wt-st`) first. It now judges each pull request on
its own head, fetched by number, and says what it does not check.

**#37 and #38 are merged.** Timur's reviews of #39 to #44, submitted on 2026-10-22, each *request
changes*, are answered on their branches. The operator asked to converge. Nothing new was opened,
and only his items were answered, plus what keeping them green needed, each named in its comment.
Each description was rewritten to its head at the push, and everything that touches docker ran
against docker before it was called done. On each of the six he
said he would check only his items and approve.

### What this session did

| PR | What | Head | Measured from a clean tree | Comment |
|---|---|---|---|---|
| #46 `fix/false-claims-round-1` | `main` merged in after #37 and #38; the SP-FR1 conflict kept on both sides | `d8e90fc` | **1233 / 25 / 0**, dashboard 32 / 0, no `oom` | [#46](https://github.com/nocodenation/liquidupstart/pull/46#issuecomment-6341446552) |
| #44 `docs/readme-java-extensions` | A1 "Almost all state"; A2 two A0-11 cases on the named volume (two of the three mutations red; the third is a file compose refuses); A3 the description | `4a4cddd` | 1157 / 25 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#44](https://github.com/nocodenation/liquidupstart/pull/44#issuecomment-6341915521) |
| #48 `fix/load-path-rebuilt`, stacked on #44 | #44's head merged in; the paragraph back to "All state", both volumes rebuilt on every start | `734fcb3` | 1162 / 25 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#48](https://github.com/nocodenation/liquidupstart/pull/48#issuecomment-6343051961) |
| #41 `fix/teardown-orphans` | item 1 Timur's teardown pattern with his fixtures; A1 to A3 | `a6ed039` | 1197 / 25 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#41](https://github.com/nocodenation/liquidupstart/pull/41#issuecomment-6343686527) |
| #39 `fix/default-tier-writes` | item 1 `chainFixture`'s host view in a temporary directory, an A7-3 case, the records; A1 the description and FINISH row 3 | `65d4473` | 1194 / 26 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#39](https://github.com/nocodenation/liquidupstart/pull/39#issuecomment-6344201499) |
| #42 `fix/load-dependent-cases` | item 1 `refuseInterrupted` in `shell.ts` with SP-5 scenarios (2 and 3 red where 0 and 0 were); A1 to A5, the budget one figure, 600 s | `654269c` | 1223 / 25 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0; `m-oc.allow-scripts` alone afterwards 3 / 0 with real builds in 29 s | [#42](https://github.com/nocodenation/liquidupstart/pull/42#issuecomment-6344756243) |
| #43 `feature/computed-state` | items 1 and 2: heads fetched by `refs/pull/<n>/head`, bases every time, the section says what it does not check; A1 the `jq` skip under SP-2; A2, A4, A5 | `0d232f3` | 1222 / 26 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#43](https://github.com/nocodenation/liquidupstart/pull/43#issuecomment-6345277341) |
| #40 `fix/leaked-containers` | items 1 to 3: images read through `inspect`, `rm -f` for what the decision chose, `m-b6.builder-sweep` against docker; A1 to A6, one `parseDockerTime` in `tests/lib/dockertime.ts` | `5bb0671` | 1213 / 25 / 3, all three `B6-37` with an `oom` each; dashboard 32 / 0 | [#40](https://github.com/nocodenation/liquidupstart/pull/40#issuecomment-6345788149) |
| `main` | this section | — | — | — |

### What it found

- **A case that only reads a file's text cannot hold what docker does with it.** On #40 both halves of
  the builder sweep removed nothing real while 24 of 24 stayed green: the `docker images` format has no
  label field, and `docker rm` refuses a running container. An integration case against docker
  replaced the greps, and a local review of the repair found three more defects before the commit:
  `docker rmi` of every tag would have taken a tag someone else gave the image, a killed run of the
  case itself would have leaked, and FINISH and BACKLOG claimed more than the case shows.
- **An image built from `FROM` alone reports its base image's `.Created`.** `FROM alpine:3` gave
  2026-09-17 on 2026-10-22, so age by `.Created` and age by label agreed on the old image, and
  Timur's mutation M5 stayed green until a third, fresh image told them apart.
- **`git fetch origin <name>` does not mean `origin/<name>` is what was fetched.** Outside the
  refspec it writes only `FETCH_HEAD`, and a fork's branch is not origin's. `state.sh` now fetches
  `refs/pull/<n>/head` into refs it owns.
- **A guard is only held when the function that refuses is tested, not its call site.** On #42,
  `refuseInterrupted` could be emptied or inverted with every case green. It is in `tests/lib/shell.ts`
  with scenarios of its own now.
- **zsh does not split an unquoted `$T`.** A mutation loop that passed two test files in one variable
  reported 0 red for every mutant, because `bun test` was given one path that does not exist. Write
  the paths out, or loop in bash.
- **`B6-37` is red, with an `oom`, on every branch without #46.** Expect it until #46 lands.

### Open, and whose

**Ours, and not started:** Timur's first reviews of **#46** (2026-10-22 13:46Z, one blocking item and
five more, among them that B6-37's fixture writes 800 MB to `tmpdir()`, which is RAM on a tmpfs host)
and **#45** (14:15Z, two blocking items and four more). #46's came forty minutes after its comment,
between two suite runs, and #45's during one. Both were seen only in the closing check. They were left
by the operator's end point: the seven pull requests answered, then stop. The bodies are on the pull
requests.

**Timur's:** checking his items on #39 to #44 and approving; first reviews of #47 and #48. His open
question on #43, whether `state.sh` should also merge the open heads pairwise, is noted there and not
taken.

**The operator's:** the start-time race on #45 (a bundle judged at its inbox path and loaded from a
second read) stays parked. Once #48 lands, rebuild Liquid for the running container:
`./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid`.

**Whoever lands second** (each checked with `git merge-tree` between the heads, each kept on both
sides):

- #46 and #42: SP-5 and SP-6 in `docs/TEST-SPEC-suite-preconditions.md`.
- #46 and #48: FR30/FR31 traceability and the B2-11/B2-12 rows in `docs/TEST-SPEC-liquid-java-extensions.md`.
- #46 and #39: the A10-23 *Premise* and *Component* rows in `docs/TEST-SPEC-git-integration.md`.
- `FINISH.md` rows between #39 to #43, as before.

**Ours, when a merge happens:** #44: retarget #48 to `main`.

### Housekeeping

- **The Docker VM is at 94%: 3358 MB free**, from 9761 MiB this morning. `docker system df`: the build
  cache holds 24.9 GB, 21.2 GB of it reclaimable, and images 30.8 GB. Nothing was pruned, because that
  is a deletion and the operator's to approve. `docker builder prune` is the candidate. A full VM turns
  builds red in a way that reads like a product failure.
- No `lu-b641` container and no `b6-41` or `lu-b641` image is left behind, and the `oom` streams are
  stopped.
- Every worktree where the default tier ran holds an empty `volumes/repos`. Two writers make it:
  `m-a10.fixture-ceiling` until #46 lands, and `chainFixture`'s host view (the two `m-a7` files) until
  #39 lands. On #46's own worktree it is the second, on #39's the first.
- `scratch.md` in the main checkout is untracked and not this session's.

## Where it stands, 2026-10-22: #45 settled, and Timur's rounds on #37 and #38 answered

`./scripts/state.sh` on `feature/computed-state` (`wt-st`) first, as before.

**Every entry on #45 now has an answer, and the one new entry waits on the operator.** The operator asked for one more round that runs to the end, and for `FINISH.md`'s cut line of 2026-10-17 to decide what is repaired. Of the entries left open after round one:

- **repaired:** `45-27` and `45-28` on #46, `45-9` and `45-12` in part on #44, and round two on #47 (`45-1` in part, `45-2`, `45-4`, `45-7` in part, `45-14`, `45-15` in part, `45-22` in part, `45-25`);
- **waiting:** on #40 (`45-5`), on #42 (`45-16`, the `sh()` half of `45-18`, and `m-oc.allow-scripts`' image tags from `45-1`), and on Timur (`45-26`);
- **recorded as outside the cut line, and not to be raised again:** `45-3`, `45-17` and `45-21`, and the remaining parts of `45-1`, `45-7`, `45-12`, `45-15` and `45-22`.

Each of those entries on #45 says which of these it is. **Timur's round on #37 is answered**: item 1 and A1 each with a case that goes red when it is taken back, A2 to A5 in the documents they name. **So is his round on #38**, which arrived at 2026-10-21 17:02Z, about an hour after the 2026-10-21 evening section was committed, and was noticed only in this session's closing check: the lock case is `A16-31` now, by his decision, and TR-1 holds it.

### What this session did

| PR | What | Head | Measured from a clean tree | Comment |
|---|---|---|---|---|
| #37 `fix/moving-image-tag` | Timur's round of 2026-10-21 13:23Z: blocking item 1 (a flag per reading, guards by what each case pins, a consistent release, an API move and a Java patch in B5-34), A1 to A5, and two local passes | `acecc10` | 1191 / 25 / 3, the three all `B6-37` with an `oom` each; dashboard 32 / 0 | [#37](https://github.com/nocodenation/liquidupstart/pull/37#issuecomment-6333934587) |
| #46 `fix/false-claims-round-1` | `45-27` (`B6-46`) and `45-28` (`A10-24`); the scrub moved so it no longer meets #42's block | `f172c2b` | 1186 / 25 / 0, dashboard 32 / 0, no `oom`; at `a1fd5fc` 1186 / 25 / 0 | [#46](https://github.com/nocodenation/liquidupstart/pull/46#issuecomment-6334759753) |
| #44 `docs/readme-java-extensions` | `45-9` (the README's named volumes) and `45-12` (`B1-2` and `mountsLive`) | `25abf5f` | 1155 / 25 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0 | [#44](https://github.com/nocodenation/liquidupstart/pull/44#issuecomment-6334216313) |
| #38 `fix/a16-20-row` | Timur's round of 2026-10-21 17:02Z: the lock case renumbered `A16-20` → `A16-31`, retitled and rewritten, A1 to A4, two local passes | `8bc1414` | 1144 / 25 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0 | [#38](https://github.com/nocodenation/liquidupstart/pull/38#issuecomment-6335706209) |
| #47 `fix/false-claims-round-2` | round two: `45-1` in part, `45-2`, `45-4`, `45-7` in part, `45-14`, `45-15` in part, `45-22` in part, `45-25`; new cases `A8-34`, `A8-35`, `A16-32`, `OC-78` | `0b4d83d` | 1164 / 25 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0; at `6173f43` 1166 / 25 / 1, the one `B6-37` with an `oom`; dashboard 32 / 0 | [#47](https://github.com/nocodenation/liquidupstart/pull/47#issuecomment-6336271706) |
| #48 `fix/load-path-rebuilt`, **stacked on #44** | the operator's choice on #45's `CLAUDE.md` entry: every start empties Liquid's load path and refills it from the inbox, so taking a bundle out is the inbox `rm` and a restart; `B2-12`, README, A0-11, the skill, FR30; three local passes | `d368eb8` | 1160 / 25 / 3, all `B6-37` with an `oom` each; dashboard 32 / 0 | [#48](https://github.com/nocodenation/liquidupstart/pull/48) |
| #45 `docs/suite-fixture-findings` | every open entry marked answered, waiting, or outside the cut line; one new entry, `CLAUDE.md`'s `nar_extensions` | `07802b7` | not run: no test reads `BACKLOG.md` | [#45](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6337379328) |
| `main` | this section, and `FINISH.md` row 1's count | — | — | — |

### What it found

- **The cut line answered most of what looked like decisions.** Nineteen entries were open after round one; the operator's rule of 2026-10-17 settled each without asking, with three questions left: #37's round, the scope, and one deletion. Two of my own classifications were wrong and are corrected on #45: entry 21 claims nothing false (TR-4's list says the truth), and entry 22's tables were not a false claim either — repaired anyway because the operator had approved the list.
- **`/code-review` found real defects in every branch again, and in every repair.** The ones that mattered: B5-34's rewrite had lost all its imports; A10-24's first design removed `GIT_DIR` in each helper and left four uncovered; A8-35's sequence ran in JS numbers past 2^53 and repeated; a NiFi guard where the API is pinned was invisible to a release that moves both; the README overstated what survives `docker compose down`; `movedMessage` printed MOVED where no flag was set.
- **A reviewer's decision can take an id before any tree shows it.** Timur gave `A16-31` to #38's lock case on 2026-10-21; #47 took the same id the next morning because no tree carried it, and TR-1 to TR-4 read trees. Read the open reviews before taking the next free id. Caught by a local review of #38; #47's case is `A16-32`.
- **Run the closing check before the handover is written, not after.** #38's review came at 2026-10-21 17:02Z, an hour after that evening's section. This session wrote and pushed the first version of this section (`de23ca7`) before running its own check, so it listed #38 among the pull requests still waiting for a review, fourteen hours after that had stopped being true; the check that followed showed the review.
- **Every scripted text replacement asserts its count.** Three times this session one that did not went wrong: a header rewrite that dropped B5-34's imports, a cut at the first `});` that took the middle of a line, and a conflict resolution that replaced two rows with one. The assertion is what caught the rest.
- **`B6-37` was red today on #37, #38, #44 and #47, and green on #46**: the old fixture's 1.6 GB setup, killed with `oom` while the stack runs, which #46 replaces. Expect it on any branch without #46.
- **Git exports `GIT_DIR` to the hooks it runs in a linked worktree** (git 2.48.1), so a suite started from one bypassed the fixture ceiling. Repaired on #46; worth knowing for anything else run from a hook.
- **Cheap moves of an image:** renaming the 22-byte NiFi symlink and the two jars the entrypoint reads its version from moves NiFi's reading for the probe and the product alike, a `java` shim moves Java's, and bun's `-t '^(?!B5-4 )'` skips a costly block and its hook. B5-34 runs three moves in about seven minutes.
- **`CLAUDE.md` says `nar_extensions` is rewritten on every start; Liquid's load path is only ever added to.** Recorded on #45 for the operator, not edited.

### Open, and whose

**Timur's:** a look at #37's and #38's answers — on both he said he would check only the items of his round and approve; reviews of #39 to #47; and the decisions already listed: 180 s or 600 s on #42, the MU requirements (#45 entry 26), and #46's three (exit 5 as 500, the verdict line, an author pom going on). `A16-20` on #38 is decided.

**The operator's:** the `CLAUDE.md` sentence on `nar_extensions` is decided — the behaviour now matches it, on #48. Open with you: whether the new #45 entry is repaired, that the start-time check judges a bundle at its inbox path and loads a second read of it (the gap `nar-watch.sh` closed for itself under S6); it is a narrow race, and a security one. And once #48 lands, Liquid has to be rebuilt for the running container to have the new entrypoint: `./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid`.

**Whoever lands second:**

- #37 and #46: the traceability table of `docs/TEST-SPEC-suite-preconditions.md`. #37 adds B5-33 and B5-34 to SP-FR1, #46 adds SP-6 to SP-FR1 and SP-FR2 — two adjacent rows in one conflict. Keep all three additions; a merge of every branch of this session on a scratch tree, resolved that way, passed the scenario table, TR-1 to TR-4 and the 52 cases they share.
- #46 and #42: SP-5 and SP-6 at the same place, as before.
- `FINISH.md` rows between #39 to #43, as before.

**Ours, when a merge happens:** #44 — retarget #48 to `main`; #46 — #48's two keep-both conflicts in the Java specification (FR30/FR31 traceability, B2-11/B2-12 rows); #40 — `45-5`; #42 — `45-16`, the `sh()` half of `45-18`, and `m-oc.allow-scripts`' image tags from `45-1`.

### Housekeeping

- New worktree `wt-r2` for #47; the scratch worktree of the combined merge is removed. `wt-r1`'s empty `volumes/` was removed with the operator's agreement, and **today's suite runs made it again**: every checkout where the default tier ran — `wt-r1`, `wt-r2`, `wt-rm`, `wt-tag` — holds an empty `volumes/repos`, because the default tier still writes there until #39 lands (`FINISH.md` row 3). Removing them again would last until the next run.
- No `liquidupstart/liquid-moved`, `oc78-probe` or fixture container left behind; the `oom` streams are stopped.
- Docker VM: 9761 MiB (`df -m` in a container) free at the end. `scratch.md` in the main checkout is untracked and not this session's.

## Where it stands, 2026-10-21, evening: round one of #45

`./scripts/state.sh` on `feature/computed-state` (`wt-st`) first, as before.

After the series, the operator chose to act on #45's entries in rounds. **Round one is #46,
`fix/false-claims-round-1`**: the nine entries where code, a test or a document claimed something
false, which is `FINISH.md`'s cut line, and entry 8, `m-a10.fixture-ceiling`, which the operator
decided should stop writing into the checkout. The specification came first (`0fe75a2`), the code
second (`b63de36`), A10-23 third (`faf91a4`). `/code-review` ran before each commit: three passes
over the first two, two over the third. Ten of ours are open now, #37 to #46.

**And Timur has reviewed #37**, at 13:23:16Z, after the section below was committed at 13:07:44Z:
*changes requested*. So two of that section's sentences stopped being true at 13:23Z: *nothing a
reviewer asked for is open on our side*, and *#37 to #45 have had no first review*. This session
noticed only in its closing `state.sh` and has not started the round.

### What this session did

| PR | What | Head | Measured from a clean tree | Comment |
|---|---|---|---|---|
| #46 `fix/false-claims-round-1` | opened. `45-6`, `45-10`, `45-11`, `45-13`, `45-19`, `45-20`, `45-23` and `45-24`, the preconditions half of `45-18`, and `45-8` the way the operator chose: A10-23 now proves the ceiling in throwaway hosts | `faf91a4` | `b63de36`: 1168 / 25 / 0, dashboard 32 / 0, no `oom` in the streamed events. `faf91a4`: 1173 / 25 / 0, dashboard 32 / 0, no `oom` | [#46](https://github.com/nocodenation/liquidupstart/pull/46#issuecomment-6320258286) |
| #45 `docs/suite-fixture-findings` | ten entries marked *Answered on #46, open*; two new: two installation faults that still answer 422, and an inherited `GIT_DIR` that walks past the ceiling | `4d86c48` | not run: no test reads `BACKLOG.md` | [#45](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6319267461), [then](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6319962772) |
| `main` | `HANDOFF.md` and `FINISH.md` at `a3ef20f`; this section, and `FINISH.md` row 1's count | — | — | — |

### What it found

- **What killed `B6-37` was its own fixture's setup.** `setup.py` held 800 MB of zeros, then the
  jar in a `BytesIO`, then its copy, and peaked at 1.6 GB before narcheck ran. With the stack holding
  most of the VM, that was enough for the kernel to kill it (exit 137, `oom`). It now streams, and it
  was green in `b63de36`'s run with the stack up and no `oom` in the stream. *Corrected 2026-10-22:
  this said it streams to disk and peaks at 16 MB. 16 MB was the RSS, 17 MB as measured since. Where
  `tmpdir()` is a tmpfs, the 800 MB inner jar was memory, and the setup was still killed at 600 MB, so
  #46 writes it to the container's own `/tmp` since `de6d63a`.*
  The series' bullet below, *load-dependent, and when it is red it is OOM*, is right about the event.
  The repair was in the fixture.
- **A gate that reads silence as a verdict deploys on an empty checker.** A 0-byte `narcheck.py`
  and one that exits 0 printing nothing were both deployed as judged, and a truncated one, a
  `SyntaxError` and so exit 1, filed the bundle as refused. The gate now takes an exit status as a
  verdict only together with a line naming the bundle (`JUDGED` / `REFUSED`).
- **A status number can collide.** 503 was the first choice for "nothing could judge it" and is
  already the server's *two builds are running*, which a caller may retry. It is 500.
- **Three places never reached what they were there for.** OC-60 asserted an object equal to
  itself when its image was absent, and bun reports that as a pass. Four `sh()` calls handed over a
  timeout as the environment, which bounds nothing, and no case can tell that from no timeout.
  OC-62's watchdog branch never ran on Linux, because `/usr/bin/timeout` exists there, and it was red
  there.
- **Git exports `GIT_DIR` to hooks in a linked worktree** (git 2.48.1: `pre-commit`, `commit-msg`,
  `post-commit`, `pre-push`, `post-checkout`). A suite started from such a hook would bypass
  `GIT_CEILING_DIRECTORIES` entirely, because git does no discovery once `GIT_DIR` is set, and every
  review checkout here is a linked worktree. Measured, and on #45.
- **Six things were wrong in a draft, each caught before publishing by the local review or by
  measuring.** Two were in A10-23's rewrite: it compared the ceiling with the constant it is taken
  from, and its beneath-check could not fail. Four were claims. The installation-fault entry said
  both arms sit after Maven, and one sits before. The `GIT_DIR` entry said git sets it for every hook,
  and in a plain repository it does not; that every checkout here is a worktree, and the main one is
  not; and it named one helper where six pass the environment on.

### Open, and whose

**Ours: Timur's round on #37**, against `7060506`, [the review](https://github.com/nocodenation/liquidupstart/pull/37#pullrequestreview-5600379683).
One item blocks and five more go into the same push; he will check only those and approve.

- **1, blocking:** `LIQUID_MOVED` is one value, so a move on any one reading skips every pinned case.
  Measured with a Java-only shim image: 15 cases skipped that pass against that image. The fix he
  asks for is a flag per reading (`LIQUID_MOVED_ON`), each case guarded by what it pins, B5-33 with
  one scenario per reading, and B5-34 made consistent (the NiFi directory is a 22-byte symlink, so
  renaming it costs nothing) plus a Java-only move as the over-skip control.
- **A1** B5-34's pass list computed from `isPinned` instead of named by hand; **A2** *Covers* to
  `SP-FR1` instead of FR21, and the premise row labelled; **A3** one sentence that B4-4, B4-6 and
  `m-b4.placement-check` pin the API through the live installation; **A4** the PR body, B5-33's header,
  and `HANDOFF.md`'s paragraph on #37 (in *Where it stands, 2026-10-16*, the one with *27 pass / 17
  skip*; he asks for it to be corrected in #37); **A5** the nine pasted history comments and `tests/run.sh`'s 11-line block.
- It does not touch the operator's decision on finding 13. He calls skipping on a moved tag *the trade
  the operator chose*, and asks for it per reading.

**Timur's:** a review of #46, and three decisions it asks for: exit 5 as 500, the verdict line as a
contract between `check-index` and the gate, and an author pom with an unresolvable API going on to
Maven. #38 to #45 are still unreviewed, and the decisions listed under *the end of the review
series* stand.

**Whoever lands second:**

- #46 and #42 conflict in `docs/TEST-SPEC-suite-preconditions.md`, where SP-5 and SP-6 go in at the
  same place. Keep both.
- #46 and #39: the comment in `tests/lib/preconditions.ts` and SP-1's *Test data* still name
  `m-a10.fixture-ceiling` among the places that create `volumes/repos`. That is false on #46, and #39
  rewrites those lines, so #46 leaves them alone. Once both have landed, only `gitfixture` remains.

**The operator's:** what round two is. Open on #45 and not answered anywhere: entries 1 to 4, 7, 9,
12, 14, 15, 17, 21, 22, 25, 27 and 28 (the `GIT_DIR` entry). Waiting on a merge: 5 waits for #40;
16, the form of a per-test budget, and the `sh()` half of 18 wait for #42. 26 is Timur's question.
Entry numbers are their order in #45's `BACKLOG.md`, as #46's description uses them.

**Also the operator's:** `wt-r1` still has the empty `volumes/repos/` that the old A10-23 left
there. `rmdir volumes/repos volumes` in that checkout removes it, and nothing was deleted without
asking.

### Housekeeping

- `wt-17`, `wt-24` and `wt-hook` are deleted, with the operator's agreement and after the same checks
  as the five before them. Their local branch refs remain. The worktrees standing are the ten open
  branches' and `main`'s.
- `FINISH.md` row 1 now says eight of ten open pull requests touch `BACKLOG.md`. They are the same
  eight as before; #44 and #46 do not touch it. No open branch edits that row.
- Docker VM: 14553 MiB free at the end (`df -m` in a container), against the 2 GB floor. `scratch.md` in the main checkout is untracked and not this
  session's.

## Where it stands, 2026-10-21, the end of the review series

`./scripts/state.sh` on `feature/computed-state` (`wt-st`) first, as before.

**The series is done.** It began on 2026-10-20 with Timur's recommendation and the first three runs,
on #19, #40 and #35, and four sessions then put every other open branch of ours through `/code-review`
before anything was committed: #37, #38, #39 and #41; then #42, #43, #44 and #45; then #18, #24, #28
and #36; and in this one #17. **Nothing a reviewer asked for is open on our
side.** What is left is review, a handful of decisions that are Timur's, and `FINISH.md`'s items 1
and 2, which wait for merges.

**`main` moved six times during this session**: #36 at 08:50Z, #28 at 09:00Z, #19 at 10:07Z, #24 at
12:01Z, #17 at 12:41:20Z and #35 at 12:41:49Z — the last three after this session had pushed them,
all by Timur and none with a new round. It is `5ccaf4e`. **#24's merge put #42 and #38 into conflict
with `main`**, and both were resolved in this session; #38 then took `main` once more for #17 and #35,
cleanly. Nine of ours are open: #37 to #45. #16 had merged at 07:21Z, before this session reached it, so the first of the two
branches in its brief was already done.

### What this session did

| PR | What | Head | Measured from a clean tree | Comment |
|---|---|---|---|---|
| #16 `feature/memory-midterm` | merged by Timur at 07:21Z, approved — nothing to do | — | — | — |
| #17 `feature/test-mutation-control` | Timur's round of **2026-10-21 07:45Z** (R1, N1–N4), and a local `/code-review` in three passes: 10 findings, then 9 over the repair, then 8 over that. **Merged by Timur at 12:41Z**, without a new round | `1e97164` | `./tests/run.sh` 1088 / 25 / 3 at `5682f08`, the three all `B6-37`; registry `validated=32 failed=0 refused=0 unresolved=0 exempt=1`, exit 0; dashboard 32 / 0 | [#17](https://github.com/nocodenation/liquidupstart/pull/17#issuecomment-6314444497) |
| #45 `docs/suite-fixture-findings` | five entries from #17's round, each with its measurement | `c89870e` | not run: no test reads `BACKLOG.md` | [#45](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6314432203) |
| #24 `fix/fourth-precondition` | `main` merged; the `A16-19` entry deleted, because #28 landed first and #24 is therefore second. **Merged by Timur at 12:01Z**, without a new round | `8a56d7b` | 1098 / 25 / 0; dashboard 32 / 0 | [#24](https://github.com/nocodenation/liquidupstart/pull/24#issuecomment-6314732020) |
| #42 `fix/load-dependent-cases` | conflict with `main` after #24 resolved: #24's registry precondition and SP-3 kept, #42's guard, `BUILD_BUDGET_MS` and SP-5 kept; every sentence of #24's that calls 180 s current carries a dated note | `91ac053` | 1125 / 25 / 2, both `B6-37` with an `oom` each; dashboard 32 / 0 | [#42](https://github.com/nocodenation/liquidupstart/pull/42#issuecomment-6315980693) |
| #38 `fix/a16-20-row` | conflict with `main` after #24 resolved: #24's *A16-19 is resolved* paragraph replaces the old one, #38's A16-20 paragraph follows it | `509686b`, `main` merged again after #17 and #35 | 1145 / 25 / 2, both `B6-37` with an `oom` each; 1095 / 25 / 3 on the first merge, `bde85ed`; dashboard 32 / 0 | [#38](https://github.com/nocodenation/liquidupstart/pull/38#issuecomment-6316808854) |
| #40 `fix/leaked-containers` | its conflict with `main` resolved; B6-39's and B6-41's blocks corrected | `dd2f4bf` | 1106 / 25 / 1, the one `B6-37` with an `oom` streamed for it; dashboard 32 / 0 | [#40](https://github.com/nocodenation/liquidupstart/pull/40#issuecomment-6315035376) |

**#17's brief said Timur's round was from 2026-10-12.** It was from this morning, against `main` at
`8bc4428`, which already held #10, #15, #16, #18, #20, #21 and #25; the 2026-10-12 date was my own last
comment. Checked against what merged after it — #36, #28, #19 — and none settled a point.

### What the series found, and it is what to carry

- **`/code-review` before committing is not optional, and one pass is not enough.** The first pass
  found defects in every branch, several of them pushed and reported finished: #36 broke every
  successful build, #40 did not do its job, #35 failed open. **The pass over the repair found defects
  in the repair on every branch it ran on**, and on #17 the third pass still found eight. Budget for
  two passes at least; use `medium` for the second, because `low` skips tests.
- **Check every finding against the real system before acting.** The review agents misreported their
  own measurements in both directions — four times in one session — and on #17 one finding held only
  in part. Checking is the work, and it also catches my own drafts: three times this session a
  sentence about to be published claimed a measurement nobody had taken.
- **A figure is only true of the committed state, and only of the tree it ran on.** Run the suite
  from a clean tree, and **trial-merge with `main` and run the repository-wide checks on the merged
  tree** before calling a branch finished. `state.sh` reports textual conflicts only: #24 merged
  clean and was red on `TR-4` (`A16-19 no longer spans files`) the moment #28 was on `main`.
- **`main` moves under a branch that has just been answered, and a merge on `main` can break two
  others.** Six times today; #24's merge alone put #42 and #38 into conflict. Fetch before every
  commit, merge, check line by line that both sides of every shared file are in the result, and
  trial-merge every open branch again after anything lands.
- **A test that reads text cannot see structure.** On #17, A13-8's guard clause passed a `fi` on the
  guard's own line and an indented `fi`; it now reads the nesting from bash itself
  (`bash -n`, then `eval` into a function and `declare -f`, under `PATH=/nonexistent`). Reusable
  wherever a contract case asserts where something sits in a shell script.
- **A test strengthened, its specification row not** — three times in #17 alone (A4-6, A4-10, A13-8).
  When an assertion changes, the *Expected* row changes in the same commit.
- **`B6-37` is load-dependent on this host, and when it is red it is OOM.** Red in #17's run; then
  alone, with `docker events` streaming, 0 / 3 and three `oom` events for `python:3.12-slim`, exit
  137; then green in #24's run twenty minutes later, stack up, no `oom` in the stream; then red once
  in #40's run, with one `oom` at the minute it ran. **Reading
  `docker events --since` afterwards cannot prove it**: the stack's health checks roll the daemon's
  event buffer over within minutes, and at 10:46Z the earliest event it still held was 10:45:46Z, for
  a case that ran at 10:42Z. Start the stream before the run.
- From the earlier sessions, still true: bun 1.4.3 ends a timed-out case's `spawnSync` child with
  SIGTERM; a simulation that moves the expectation instead of the world measures nothing; a control
  can be weaker than it looks in both directions; `/usr/local/bin/jq` here is a broken x86 build.

### Open, and whose

**Timur's — decisions, each asked on its pull request:**

- 180 s or 600 s for OC-15/16. #24 merged with 180 s; #42 still proposes 600 s. Keeping 180 s means
  three changes on #42, not one: `BUILD_BUDGET_MS`, `BUILD_TIMEOUT_MS` inside it, and `SP-5`'s floor
  of ten minutes in `tests/unit/m-sp.load-dependent.test.ts`.
- #38: which case keeps `A16-20`, and the title the comment suggests.
- The requirement each of MU-5, MU-11, MU-14 and MU-59 serves — on #45, and now about `main`'s
  `TEST-SPEC-mutation-runner.md`.
- And the reviews themselves: #37 to #45 have had no first review.
- *Settled by merging, 2026-10-21:* #35's two questions (`install.sh --check` from outside a
  checkout, the staleness line) went in as #35 had them, and #17's MU-NFR1 went in with both halves.
  #17, #24, #35 and #36 were all merged without a new round after the answer to the last one.

**The operator's — decided 2026-10-21, after the series:**

- **#37's finding 13 stays not taken.** Deriving the version literals from the image would reverse
  the trade of 2026-10-16 and run premises measured on 2.11.0's bundles against bundles nobody
  measured. Something is to be done only if that trade is reversed.
- **The two settlements riding on branches are accepted and stay where they are**: N6 on #42
  (`FINISH.md` item 8, and the `BACKLOG.md` entry marked so, in `5cacaef`, whose message does not
  say it) and the `ingest-pdf` fallbacks on #41 (item 6, which #41's description does say). Noted on
  both pull requests.
- **`HANDOFF.md` and `FINISH.md` go to `main`**, directly, as one commit — done with this section.
- **Deleted**: `ubuntu:22.04`, the seven `lu-a17-2-*` in `$TMPDIR`, and the worktrees of the five
  branches merged today — `wt-16`, `wt-18`, `wt-19`, `wt-nc`, `wt-uniq`, each checked first to have
  its head in `origin/main`, a clean tree and nothing unpushed. Their local branch refs remain.

**Still the operator's:** what on #45 to act on. The two OC-6x entries and the table check are small.

**Ours, when #40 merges** — #45's *Two age-floor sweeps answer one question in one directory,
differently* (`BACKLOG.md:126` there): with #19 on `main` and #40 after it, two `parseDockerTime`s,
two run-id models and two floors stand in `tests/lib/`, and that entry is the one to act on then.

**`FINISH.md`** — items 3 to 9 are each answered on a branch that updates its own row when it merges:
3 on #39, 4 on #40, 5 and 6 on #41, 7 and 8 on #42 — #40 adds to row 7 as well — and the first half
of 9 on #43. 1 and 2 wait for the eight open pull requests that touch `BACKLOG.md` — 2 includes
`main`'s own open entry *Two different cases are both called A16-19*, which #24 closed by merging. **Those five
branches conflict with each other in `FINISH.md`**, though each merges clean into `main`: they edit
neighbouring rows, and `git merge-file` over their copies gives a conflict for #39×#40, #40×#41,
#40×#42, #41×#42 and #42×#43. So whichever lands second needs `main` merged in and both rows kept —
each branch owns its own row — and for row 7, #42's row already carries what #40 adds to it.
`state.sh` cannot show this: it judges each branch alone, against its own base, and never two branches against each other. Today's update leaves rows 3 to 10 as `main` has them,
because a second copy would conflict with those five branches; trial-merged with each, it is clean.
*The first version of this paragraph, and of that update, said 6, 8 and 9 were on no branch. It was
written from `main`'s copy of the file without reading the branches' copies.*

### Housekeeping

- This section and `FINISH.md`'s update went to `main` in one commit, with the operator's agreement,
  on top of the 2026-10-20 commit — the one older sections call `b79af9a`, committed locally that day
  and never pushed until now. Local `main` was rebased onto `origin/main` first, so on `main` that
  commit has a new hash; `HANDOFF.md` had not changed there since its parent.
- The five worktrees of branches merged this morning are gone. Three more belong to branches that
  merged later the same day — `wt-17` (#17), `wt-24` (#24) and `wt-hook` (#35) — and are left
  standing, because the operator's agreement covered the first five; each passes the same checks. `scratch.md` in the main checkout is untracked and not this session's.
- Docker VM: 20.0 GB free at the end, against the 2 GB floor.

## Where it stands, 2026-10-21, the review of #18, #24, #28 and #36

`./scripts/state.sh` on `feature/computed-state` first, as before.

**`main` moved during this session.** #16 and #18 merged; `main` is `8bc4428`. #18 went in at
`c8f6b5c`, which is this session's repair, with no review of it after the round of 2026-10-20.

### What this session did

Four branches, one after another: `/code-review` **before** committing, every finding checked against
the real system, repaired in the branch where it was in the diff, recorded on #45 where it was wider,
a second `/code-review` at `medium` over the repair before committing, **every repair reverted on its
own** to see its case go red, the suite from a clean committed tree, pushed, and one comment per
branch that says the findings come from a local review and not from Timur's.

| PR | First pass | Second pass, over the repair | Head | `./tests/run.sh`, clean tree | Comment |
|---|---|---|---|---|---|
| #18 `feature/mutation-registry` | 15: 12 repaired, 2 to #45, 1 true and immaterial | 9: 7 acted on, 2 not | `c8f6b5c`, **merged** | 996 / 25 / 2, then 998 / 25 / 0 | [#18](https://github.com/nocodenation/liquidupstart/pull/18#issuecomment-6308842874) |
| #24 `fix/fourth-precondition` | 15: 7 repaired, 2 to #45, 1 is #42's, 4 not acted on | 8: 7 repaired, 1 to #45 | `5e62534` | 881 / 25 / 1, then 879 / 25 / 3 | [#24](https://github.com/nocodenation/liquidupstart/pull/24#issuecomment-6309435617) |
| #28 `fix/case-id-uniqueness` | 15: 14 repaired, 1 decided already (`A16-19`) | 9, all repaired | `b7b6217`, `main` merged | 887 / 25 / 2 at `55ac7ab`; 1042 / 25 / 3 at `b7b6217` | [#28](https://github.com/nocodenation/liquidupstart/pull/28#issuecomment-6309867601), with an addendum |
| #36 `fix/narcheck-unavailable` | 15: 11 repaired, 1 to Timur, 2 to #45, 1 held by existing cases | 10, all acted on | `583eded` | 898 / 25 / 3 | [#36](https://github.com/nocodenation/liquidupstart/pull/36#issuecomment-6310807547) |

Dashboard 32 / 0 on each. **Every red in every run is `B6-37`, exit 137** — see below. #45 gained
eight entries, head `1fec494`, [comment](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6311095795).

### What it found that changes how to work

- **A pushed answer had broken every successful build.** #36 at `165188c`, the round reported to Timur
  on 2026-10-20: extracting `judge_and_place` left the old `mv` behind in the caller, so a build that
  succeeded placed the bundle and then exited 1 — a 500 from the server. `B6-18` and `B6-19` would have
  said so; the run reported then was four files, none of which builds through the caller. **When a
  step moves into a function, run a case that goes through the caller before calling it done.**
- **The second pass over a repair found defects in the repair on all four branches.** On #18 it found
  a false `VALIDATED` older than the round (`a > b` and `b` inside `a` were one identity); on #28 my
  heading reader still read past the dash; on #36 my crash handler covered one call of several, and the
  fixture I wrote judged nothing. It is not a formality.
- **A control can be weaker than it looks, in both directions.** One of #18's first controls removed
  one alternative of a `case` pattern and stayed green, because another alternative still caught the
  value — no evidence either way until the whole check was disabled. On #36 a scenario was held by two
  handlers and reddened only with both gone. When a control stays green, find out why before calling
  the repair unheld or held.
- **`B6-37` is red on this host while the stack runs, on `main` too.** Alone, the file was 0 / 3 on #24
  and 0 / 3 on `main`, with OOM events each time; in seven full runs today it was red in six, every time with exit 137. Read
  `docker events --filter event=oom` before reading a diff.
- **Each control on `build.sh` builds a builder image of its own** — a `nar-builder:tree-*`, 141.5 MB
  that is its own. Six took the Docker VM below its 2 GB floor and `run.sh` refused to run. They and
  the build cache were removed with the operator's agreement; 22.8 GB free afterwards.
- **`main` can move under a branch that has just been answered.** #18 merging made #28's `TR-4` red on
  the merged tree: MU-42's fixture source has a column-0 `describe('A10-14 …')`, which the id reader
  reads as a title. Blanking template contents was measured and hides 33 real titles, so `A10-14` is
  listed on #28 and the fixture-side repair is on #45. **Before reporting a branch as finished, fetch,
  trial-merge, and run the repository-wide checks on the merged tree** — an archived tree needs
  `git init && git add -A` before `git grep`-based checks mean anything.

### Open, and whose

- **#36: whether status 1 keeps the link headline for a class narcheck cannot parse is Timur's.**
  Measured, *"constant 1 carries unknown tag 99"* under *"it cannot link"*. Two shapes are in the comment.
- **#24 against #42, 180 s or 600 s, is still Timur's**, and #45 now holds the form question beside it:
  a per-test literal lowers a raised `TEST_TIMEOUT_MS`.
- **`A16-19`**: whichever of #24 and #28 lands second deletes that one entry. Unchanged.
- **#35's two questions** — `install.sh --check` from outside a checkout, and the staleness line —
  have no answer from Timur as of the end of this session.
- **#17 is stacked on #18, which has merged.** Its base will want to become `main`. Not touched.

### Housekeeping

- This section is uncommitted on `main`, above the previous one, which was uncommitted too. Local
  `main` is `b79af9a` and behind `origin/main` (`8bc4428`); it was not pulled, and nothing was pushed
  to `main`.
- #24 and #36 were not merged with the new `main`; both trial-merge clean, and #24's `SP` and `TR`
  files are 27 / 0 on the merged tree.

## Where it stands, 2026-10-21, third session

`./scripts/state.sh` on `feature/computed-state` first. It changed in this session: it shows each
pull request's author, reads a comment-only review as *reviewed, no decision*, judges a stacked
branch against its own base, and says CANNOT TELL where it could not measure.

### What this session did

Four branches, one after another: `/code-review` **before** committing, every finding checked against
the real system, repaired in the branch where it was in the diff, recorded on #45 where it was wider,
suite from a clean committed tree, pushed, commented. `main` was merged into #43 and #44 first.

| PR | Findings | Held | Second pass over the repair | Head | `./tests/run.sh`, clean tree | Comment |
|---|---|---|---|---|---|---|
| #43 `feature/computed-state` | 15 | 15, one with a different measurement | 3, none held | `913079e` | 898 / 25 / 0 | [#43](https://github.com/nocodenation/liquidupstart/pull/43#issuecomment-6302849537) |
| #44 `docs/readme-java-extensions` | 15 | 15 | 10, seven held | `04d5548` | 884 / 25 / 0 | [#44](https://github.com/nocodenation/liquidupstart/pull/44#issuecomment-6303256710) |
| #45 `docs/suite-fixture-findings` | 8 entries re-measured | 3 as written, 5 corrected | — | `08e8d31` | not run: no test reads `BACKLOG.md` | [#45](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6303318873) |
| #42 `fix/load-dependent-cases` | 15 | 13; 1 in part; 1 **did not** | 8, seven held | `1df4128` | 904 / 25 / 0, and OC-15/16 alone 3 / 0 | [#42](https://github.com/nocodenation/liquidupstart/pull/42#issuecomment-6303957301) |

Dashboard 32 / 0 on each. #45 gained five entries: four from #44 (`90cd1f5`) and one from #42
(`08e8d31`). It holds thirteen now. The brief counted seven; by its `---` separators it held eight.

### What it found that changes how to work

- **bun 1.4.3 ends a timed-out case's `spawnSync` child with SIGTERM, and `docker build` then exits
  255 and says nothing.** #42's guard looked for 130, which is what bun 1.3.13 produced on
  2026-10-09, so it would not have fired once. A case that must know its child was cut off gives
  the child a timeout of its own, under the budget. `sh()` takes one on #42. Measured; the table
  is in #42's comment.
- **The review agents' own measurements were wrong four times in this session, in both
  directions.** Ubuntu 22.04's git says `unknown rev --write-tree`, exit 128, where the agent said
  `unknown option`, 129. *"bun cannot interrupt spawnSync"* was the opposite of what bun does.
  *"SIGINT cancels cleanly"* gave the same 255 as SIGTERM. *"The base image ships NARs in the load
  path"*: a fresh container has none. Checking stays the work.
- **A `/code-review` at `low` skips tests and cross-file checks even when the args say they are the
  product.** On #44 it returned nothing and said why. Use `medium` for the pass over a repair.
- **`/usr/local/bin/jq` on this host is an x86_64 build from 2022 with no Rosetta.** zsh silently
  falls through to `/usr/bin/jq`; bash and bun's spawn do not. Anything run from bash that calls `jq`
  meets the broken one first.
- **B6-37 is load-dependent too.** Run alone with the stack up it went 3 of 3 red, four OOM kills,
  while all three full suites that night were green on it. Read `docker events --filter event=oom`
  first, as the previous section says.

### Open, and whose

- **#42 against #24: 600 s or 180 s for OC-15/16 is Timur's.** No answer on either PR as of
  2026-10-21, about 01:00. On #42 it is one constant now, `BUILD_BUDGET_MS`. Whichever he keeps,
  the other branch takes it in one line.
- **#42 carries the N6 settlement, which `5cacaef` never mentioned.** It applies the operator's cut
  line and is left in place. Whether it should ride on that branch is the operator's call.
- **#44's three README sentences on named volumes, `build.sh`'s *"Add a pom.xml"* advice, and FR30's
  removal text** are on #45, each with its measurement. FR30's procedure leaves the inbox copy, and
  the next start loads it again. #44's README already has the corrected procedure.
- Still owed from the earlier list: `/code-review` on #16, #18, #24 and #28.

### Housekeeping

- This section is uncommitted on `main`, on top of `b79af9a`, as the previous one was. Nothing was
  pushed to `main`.
- `ubuntu:22.04` (109 MB) was pulled to measure git 2.34 and is still there. Removing it is a
  deletion, so it is left.
- Seven `lu-a17-2-*` directories in `$TMPDIR` are from the old A17-2 and were not removed. The new
  file cleans up after itself.
- Docker VM: 2.9 GB free at the end, against the 2 GB floor.

## Where it stands, 2026-10-20, second session

`./scripts/state.sh` on `feature/computed-state` first, as below; this says only what it cannot.

### What this session did

The four branches whose first review was still open were each put through `/code-review` **before**
anything was committed, every finding was checked against the real system before it was acted on,
and each was repaired, run from a clean committed tree, pushed and commented. `main` was merged into
each first — #15 and #21 had landed — and every file changed on both sides was checked to carry both.

| PR | Findings | Held | Head | `./tests/run.sh`, clean tree | Comment |
|---|---|---|---|---|---|
| #37 `fix/moving-image-tag` | 15 | 14; 1 left to the operator | `7060506` | 905 / 25 / 0 — a first run 904 / 25 / **1**, `B6-37`, below | [#37](https://github.com/nocodenation/liquidupstart/pull/37#issuecomment-6299700300) |
| #38 `fix/a16-20-row` | 12 | 12 | `767931f` | 875 / 25 / 0 | [#38](https://github.com/nocodenation/liquidupstart/pull/38#issuecomment-6300280362) |
| #39 `fix/default-tier-writes` | 14 | 14 | `fecc9ff` | 877 / 26 / 0 | [#39](https://github.com/nocodenation/liquidupstart/pull/39#issuecomment-6300737742) |
| #41 `fix/teardown-orphans` | 15 | 12; 1 in part; 1 **did not**; 1 is convention | `f5cea6f` | 881 / 25 / 0 | [#41](https://github.com/nocodenation/liquidupstart/pull/41#issuecomment-6301214552) |

Dashboard 32 / 0 on each. Three findings wider than their branch went to #45 — `25c10c4`, `40bb2bd`,
`f5b1458` — with [a comment](https://github.com/nocodenation/liquidupstart/pull/45#issuecomment-6301219427).

### What it found that changes how to work

- **A simulation that moves the expectation instead of the world measures nothing.** #37 had
  simulated an upstream release by moving `WRITTEN_AGAINST` with the image unchanged. Against an image
  whose pinned bundles were really renamed, `m-b5.hand-drop` went **0 pass / 1 fail** — the red the
  branch exists to remove — because bun 1.4.3 runs a file-level `beforeAll` even when every case is
  skipped (measured; `describe.skipIf` skips hooks but still runs the body). `B5-34` now builds that
  image and runs the nine files against it.
- **#38's premise was false, and one command said so.** `git show 2115193` (2026-09-22) carries the
  `A16-20` row the branch said nobody had specified first. The repair was withdrawn rather than
  completed: renumbering is the reviewer's decision.
- **Checking a finding is the work, not a formality.** On #41 one finding did not hold — compose exits
  0 when an orphan's removal fails underneath it, four runs of four — so the proposed defence was not
  built, and one held only in part. On #37 the one design-level finding was left to the operator,
  because it reverses a trade the operator made.
- **A second, low-effort `/code-review` over the repair diff is cheap, and on #39 it found three real
  things** in the repair itself. Its recipe skips test files unless the args say the tests are the
  product; in this repository they are, so say so.
- **Not every red is the branch.** `B6-37` was OOM-killed with no second suite: the running stack holds
  about 5.6 of the VM's 8.2 GB and the case's fixture setup peaks at 1.6 GB. If it is red, read
  `docker events --filter event=oom` before reading the diff.

### Open, and whose

- **#37, the operator's:** derive the version literals from the image instead of skipping on a move
  (finding 13). It reverses the trade of 2026-10-16; the comment gives both sides.
- **#38, Timur's:** which case keeps `A16-20`. The precedent, OC-40 and OC-42, moved the later case —
  here the lock case's three titles. The PR title now says the opposite of the branch; a title is
  suggested in the comment and not set.
- **`B5-34` adds about 220 s to the default tier.** Worth knowing before reading a slower suite as a
  regression.
- **Disk:** 3.4 GB free in the Docker VM at the end, against the 2 GB floor, with about 20 GB of build
  cache reclaimable. Not touched, because reclaiming it is deleting.
- Still owed from the morning's list: `/code-review` on #16, #18, #24, #28, #42 and #43.

### Housekeeping

- Local `main` is one commit ahead of `origin/main` — `b79af9a`, this file's previous update — and
  this section is uncommitted on top of it. Neither is pushed.
- `B5-34`'s moved image, `liquidupstart/liquid-moved:<hash>`, is removed after its file. A killed run
  can leave one: small, but it holds the old base image's layers.

## Where it stands, 2026-10-20

**Do not read the counts in older sections.** `./scripts/state.sh` on `feature/computed-state` prints
`main`'s head, every open pull request with the forge's own review state, whether each branch still
merges, and the worktrees. That exists because this file's prose kept going stale within hours. Run
it first; what follows is only what a command cannot tell you.

### What changed today

Timur reviewed six rounds in one day — #18, #19, #24, #28, #35, #36 — and all six were answered and
pushed. Then he made one recommendation that changed how the rest of the day went:

> *"I'd recommend you to run /code-review in your claude before sending PRs for a review."*

**Take it. It is not optional advice.** Run `/code-review <branch>` **before** committing and
pushing, not after. On its first three runs it found serious defects in three branches that had
already been pushed and reported to him as finished:

| Branch | What it found | Where that left things |
|---|---|---|
| `fix/fixture-names-per-run` (#19) | A network's `{{.Created}}` is a Go `time.Time` **with spaces**, so `split(' ')[1]` kept the bare date: a network **four seconds** old read as **15.14 hours** and was swept. An image's `{{.Created}}` is its config's and a cache hit copies it. `docker ps -aq` prints short ids and `inspect '{{.Id}}'` long ones, so the own-run exemption could never fire | `fe85e1b`, 71 / 0 |
| `fix/leaked-containers` (#40) | **The branch did not do its job.** `c.image !== keep` exempts the content-addressed tag, which is identical on every run — so every killed run's leftover was exempt at any age, and the only shape the sweep reached was a scheme nothing has minted since `B6-39`. Four more tag schemes were invisible; a 1.02 GB leak had sat five days. And `docker ps -a` enumerated the operator's 21 stack containers **in the default tier** | redesigned around a label, `76f8824`, 54 / 0 |
| `feature/commit-message-guard` (#35) | Broke **11** unrelated cases (an install path reaching outside `config/`, which fixture projects do not copy). The scissors cut never matched, because git writes the line with the comment character. My new integration file **had never run green as committed**. And the guard **failed open**: under a UTF-8 locale one invalid byte makes BSD `sed` exit, the body goes empty, and the incident's own sentence commits with rc 0 | `7358c82`, 47 / 0 + 40 / 0 |

### Three lessons from that, and they are the ones to carry

**A figure is only true of the committed state.** Twice today I reported a test result measured
against a dirty working tree — once for a file that could not run at all without my uncommitted
edits. Run it from a clean tree before quoting a number, and check `git status` first.

**A pinned environment hides what depends on it.** `tests/lib/shell.ts` pins `LC_ALL=C`, for its own
good reasons, so no case in the suite could see a guard whose verdict depended on the locale — in
*either* direction. When a decision reads the environment, a case has to set the environment itself.

**Test data decides what a case is worth, and synthetic data can make it worth nothing.** The
own-run exemption passed its scenarios because synthetic ids spell the same on both sides, while real
docker spells them two ways. The age floors passed because every scenario handed them a number it had
computed itself, so no real timestamp ever reached the decision. Both were green and both held
nothing.

### What is open

- **#45 is new** — `docs/suite-fixture-findings`, six `BACKLOG.md` entries for findings wider than
  one branch: fixed container names still in `m-b5.hand-drop` and `m-oc.allow-scripts`; the fixture
  sweep hanging off `buildDashboardImage` instead of the start of a run; `watchOutput` reporting a
  harness fault as the product going silent; `startDashboard`'s readiness `fetch` with no timeout;
  `runSubnets` handing out adjacent /24s while its docstring denies the likelier clash; and two
  age-floor sweeps in `tests/lib/` with different floors and **opposite** boundaries. That last one
  is the one to act on when #19 and #40 are both on `main`: there will be two `parseDockerTime`s, two
  run-id models and two floors answering one question.
- **Five `/code-review` runs are still owed**: #18, #24, #28, #42, #16, #43. On the rate of the first
  three, expect them to find things. Each run is about ten agents and a few minutes.
- **Two questions for Timur are on #35**, asked and not yet answered: whether `install.sh --check`
  should live outside a checkout (it is content of one, so on `main` the command `CLAUDE.md` names
  cannot be run), and whether the staleness line should simply go — it reports a direction it does
  not test and stamps the source rather than the installed file.
- **#42 raises #24's 180 s budget to 600 s**, with the reasoning stated, and that is Timur's call.
  Whichever figure he keeps, the other branch takes it in one line. Two numbers for one budget must
  not stand.
- **#24 and #28 interact**: #24 renumbers `A16-19`, and #28 lists that id. Whichever lands second
  needs that one-line entry deleted — measured, and #28's stale scenario says so itself.

### Housekeeping worth knowing

- The commit-message guard is installed in this clone, from `config/agents/hooks/commit-msg` (it
  moved there today, so that one file serves the operator and the agents and the fixture projects
  carry it). Ask with `./scripts/hooks/install.sh --check`.
- **It refused three of my own commit messages today**, each time for quoting its own test data. The
  right answer is to point at the fixture, never to reach for `ALLOW_CLOSING_KEYWORD=1` — that would
  have closed #18 and #20 for real.
- `wt-15b` and `wt-21` are retired; `wt-bl` is new for #45. Local `main` is behind `origin/main` and
  has only ever been read, not pushed from.
- A review subagent briefly committed `0cf2f45 "probe"` to local `main` and reverted it itself.
  Verified: `main` is at `9637008`, nothing was pushed, the commit lives only in the reflog.

## Where it stands, 2026-10-16

**The review latency broke today: three of ours merged.** `b59d19c` took #10 in at 09:20Z,
`9858651` took #25 within the hour, and `fb6d6ec` took **#20** at 13:02Z — all three by `iztiev`.
The first two came without a comment; #20 came after a full round, answered in `a693411`, and is the
first of ours to be approved rather than simply taken. #25 carried `691dd2e`, the measurement written
this morning, so `B7-5`'s figures below reached `main` the same day they were taken. This section
opened with *"nothing merged today"* when it was written two hours earlier, which is why each claim
here now carries its time.

**Which pull requests are open, whose they are, and where each one stands: `./scripts/state.sh`.** It
prints `main`'s head, every open pull request with its author and the forge's own review state,
whether each branch still merges into its base, and the worktrees. **This paragraph used to carry that list, and it was wrong twice in two days** — on
2026-10-16 the tables below said #21 was *"never reviewed"* while a review of it was being answered,
which the reviewer raised as `F4`; and the sentence that stood here said nine were open when twelve
were, hours after it was written. `CLAUDE.md` asks for a computed answer rather than a remembered one,
and a count of open pull requests is a fact. `A17-1` holds the command, including that it refuses
rather than printing an empty picture when `gh` is absent or the forge does not answer.

**The dated tables further down are history, not state.** They record what was true on their date and
are worth keeping for that; they are not to be read as the present, and from today the present has a
command.

**#21 was reviewed and answered today too**, in `fa23a3e`: one blocking item — the specification
claimed `seed_known_hosts` was exercised by no case, which `m-a10` disproves — plus four follow-ups.
Three things the review had not asked for went with it, and the one worth knowing is that moving the
manifest's temporary to `mktemp` would have blinded the litter check that guards it, because the
filter matched `.tmp` and `mktemp`'s names carry none. A fix that silently disarms its own guard is
the shape worth looking for twice.

**#36 repairs the misreport that this morning's measurement produced**, which is the first thing
today that was neither a review answer nor housekeeping. `build.sh` gated deployment on
`[ -f "$NAR_CHECK" ]`, which stats; with the checker unreadable, python3's non-zero status was read as
a refusal and the operator was told their bundle *"cannot link against the NiFi API the running
Liquid loads"* — a verdict nothing had reached. `narcheck_available` now reads the file, and the
headline no longer asserts one of narcheck's two reasons over the other: it returns 1 both for a
bundle the index refuses and for anything it could not read, which the repair found by reproducing
the second case. `B6-40`, seven scenarios, each shown able to fail. **One of the new assertions was
weak and is written up as such**: it checked that the gate's old inline form was gone, which the
extraction alone achieved, so it stayed green with the fix reverted — an assertion a refactor
satisfies is not guarding anything.

**#37 closes `S9`'s second half, and the operator took the decision the entry had been holding
since 2026-10-08.** Nine test files named `ghcr.io/nocodenation/liquid-nifi:latest` themselves, and
six pinned what that tag happened to contain, so an upstream release reddened them over somebody
else's work. A digest was the obvious repair; it buys a suite that tests an image the stack no longer
runs until a hand re-pins. **The tag stays moving and an upgrade is made legible instead**: NiFi, the
API and Java are each read out of the image, the nine files name the tag through one constant,
`tests/run.sh` says before every run which state the image is in — beside the disk line, because
scattered skips are not a message — and each case that pins a reading skips when that reading moves,
and only then. `B5-33` holds the reading and the flags; `B5-34` builds a release, an API move and a
Java patch and runs the files against each, and reads every guard against what its case pins.
*Corrected 2026-10-22 on #37, as its review asked: this paragraph described the branch's first shape
— eight scenarios, and 27 pass / 17 skip from a simulation that did not survive a real move.*

**What is deliberately not asserted there is the agreement itself** — that the image equals the
pinned pair. That agreement is the question, and asserting it would make an upstream release red,
which is the defect being removed. It is the same distinction the disk guard draws: *cannot measure*
is not *empty*.

**And a mistake of mine worth the line.** The import I inserted into nine files landed inside an
embedded Python heredoc in one of them, because the last line beginning with `import` was
`import http.server, ssl`. Running the file caught it; reading the diff had not. Fixed by matching the
TypeScript form, and the heredoc verified byte-identical against `main` afterwards. **A mechanical
edit across nine files needs a run, not a read.**

**Three backlog entries closed, none of them by that code.** The `M2` decision — *"the decision left
is one the operator has to take"* — was taken and merged as `480455b` with #25, and was still being
read as open today, by me, out loud. Two `/m2` entries describe a mount #25 removed. All three struck
through rather than deleted, so the reasoning stays readable. The lesson is cheap and worth the line:
**a merge closes code, and nothing closes the entry that asked for it.**

**#15 was the only branch #20's merge collided with**, in `scripts/linux/start.sh`, and the collision
was two `source` lines: #15 adds `proxy-identity.sh`, #20 added `bind-address.sh`, both after
`wait-for-operator.sh`. Both kept, both verified present and called. The merge also made a tense true:
`BACKLOG.md`'s `operator.admin` entry said *"#20 repairs it"* and now says *"repaired, merged as
`fb6d6ec`"*, which was the one thing left open from that review's `F3`. Every other open branch
reports clean against `fb6d6ec`.

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
