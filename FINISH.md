# The finishing list

**One list, worked from the top. When it is empty, nothing is open on our side and the only thing
left is review.** Written 2026-10-17, because the question *"why is there always something new?"*
has a structural answer and this file is it. **Checked against the tree on 2026-10-26**, from `main` at
`4224ff9`, when no pull request of ours was open, with items 1 and 2 answered on top of it. Items 3 to 8
and the first half of 9 were answered by pull requests merged before. Items 11 to 13 were added that day
and are answered on #49.

## Why this file exists

`BACKLOG.md` is a **log, not a queue.** On 2026-10-17 it held thirty-one entries across its three
sections, of which twenty-three read as open — and they are four different things, with nothing in
the file telling them apart:

| Kind | Example | Work? |
|---|---|---|
| An intention | N6's streaming residual | **yes** |
| A decision against doing something | `S3`'s trust boundary; the shared-header-secret option | no, it is settled |
| A record of what happened | *"Not fixed here on purpose"*, measurements, the reasoning behind a choice | no, it is memory |
| Already done, never struck | `M2`, the two `/m2` entries — closed by merges, still reading as open | no, housekeeping |

So every reading of that file produces a fresh "open list". Two other causes, and only one of them is
nobody's fault: the method is **built** to produce findings — each measurement is supposed to find
something, and on 2026-10-16 three of them found three real defects. And in every review round the
author did *"three things the review did not ask for"*. Each was defensible; together they are why
the pile never shrank.

## The cut line, decided by the operator on 2026-10-17

**In scope: anything where code, a test or a document claims something false, or touches something
that is not its own.** Everything else is recorded once, with its reason, and **not raised again**.

That is the whole rule. A new item joins this list only if it meets it.

## The list

| # | Item | Where | State |
|---|---|---|---|
| 1 | ~~Mark every `BACKLOG.md` entry `OPEN` / `SETTLED` / `RECORD` / `DONE-ON-#N`, so the file becomes the queue it is read as~~ | `BACKLOG.md` | **done 2026-10-26**, once #47, the last of the three, had merged. Each of the 76 entries opens with its state, and ``grep -n '^`OPEN' BACKLOG.md`` lists the queue. On that day it held six: two ours, `45-1` (item 11) and the OpenClaw gateway token's key (item 13); `45-26` Timur's; and three the operator's, `45-30` (item 12), `S3` and the `operator.admin` rule. 37 were `DONE-ON-#N`, 31 `SETTLED`, 2 `RECORD`. Fourteen entries that read as open got a dated note saying why they are settled, and six whose reason is in the table below point there |
| 2 | ~~Strike what open branches already closed, so `main`'s copy stops reading as open~~ | `BACKLOG.md` | **done 2026-10-26**, with 1: `main` struck what #44 and #46 answered, #42 the two #46 entries its own diff edits, and #47 and #48 struck their own. Four more were done and never struck, and are struck now: the `A16-19` entry closed on #23 and #24, the toolbox's missing `git` on #9, the Claude CLI install on #11 and the harness's second precondition on #22 |
| 3 | ~~`m-a5.nested-clone` writes into `volumes/repos` from the **default tier**~~ | `tests/contract/m-a5.nested-clone.test.ts` | **done on #39 (`fecc9ff`), corrected 2026-10-20**, measured both ways with a watcher on the path during the run. The review of 2026-10-22 found two more default-tier files writing there through `chainFixture`'s host view, which roots in a temporary directory since 2026-10-22 |
| 4 | ~~A test run leaked a **container**, not only an image~~ | `tests/lib/builderimage.ts` | **done on #40, 2026-10-22**, `B6-41`. Shown against docker by `m-b6.builder-sweep`: a running labelled container another run abandoned, and its image, are removed in one sweep; the run in flight's are kept; no other container or image disappears. *Corrected 2026-10-22: this said done on 2026-10-17, measured with `rm -f`, which the branch had since dropped, so no real container was removed. The review of #40* |
| 5 | ~~`down.sh` leaves behind every container the current branch does not declare~~ | `scripts/linux/down.sh` | **done 2026-10-17**, `A11-11`. It still held: identical on 17 of 18 branches, and `update.sh` had already drifted to the flag. Measured against real compose |
| 6 | ~~Two `:latest` fallbacks in the `ingest-pdf` plugin build scripts~~ | — | **settled 2026-10-17**, moved to the table below. It does not meet the cut line: nothing invokes those scripts and nothing claims anything false. Measured, and the finding is sharper than the entry said — see there |
| 7 | ~~`OC-15`/`OC-16` load-dependent, and `startDashboard` asking `docker port` once~~ | `tests/lib/shell.ts`, `tests/lib/dashboardserver.ts`, the two cases | **done on #42 (`1df4128`), 2026-10-21**, `SP-5`, beside #24's `SP-3`: a budget of 600 s, a build timeout inside it, and a cut-off run that says so; and `startDashboard` waits for the published port by the container's id, against a clock, and says how the last ask ended. `SP-3` is the precondition for a machine with no registry |
| 8 | ~~N6's residual: stream the class parse in `narcheck.py`~~ | — | **settled 2026-10-17**, see the table below. Measured against the cut line, not against appetite: nothing claims anything false |
| 9 | Split `HANDOFF.md` into the map and the log — **the half that ages is gone** | `scripts/state.sh`, `HANDOFF.md` | **half done 2026-10-17**, `A17-1`, `A17-2`. The state is a command now, because the narrated copy was wrong twice in two days — once raised by the reviewer as `F4`. The file split stays deferred, as `BACKLOG.md` says: four documents cite the handover, and #19 carries an older copy |
| 10 | Closing sweep: every pull request carries a message newer than its head, every branch merges clean, no entry left unmarked | — | last, after 11 to 13. On 2026-10-26 no pull request of ours is open and every entry is marked |
| 11 | ~~`m-oc.allow-scripts` builds under the fixed tags `lu-oc15-with` and `lu-oc16-without`, and its `afterAll` removes both by name, whichever checkout built them~~ | `tests/component/m-oc.allow-scripts.test.ts` | **done on #49, 2026-10-26**: per-run tags with labels, and `A8-36` reads every removal in the tree. Added 2026-10-26 from `BACKLOG.md` `45-1`. It waited for #42, which changed that file and merged on 2026-10-25 with the tags as they were. It meets the cut line: it touches what is not its own |
| 12 | ~~FR30 and the `liquid` skill say everything in the inbox is judged before anything is loaded, and the start judges the inbox file and then copies a second read of it~~ | `config/liquid/entrypoint.sh`, `docs/FEATURE-liquid-java-extensions.md`, the `liquid` skill | **done on #49, 2026-10-26**: the start judges its own copy, `B2-13`. Added 2026-10-26 from `BACKLOG.md` `45-30`: a narrow race, and a security one. The operator chose the repair the same day, the shape `nar-watch.sh` already has: copy, judge the copy, rename it into place. It meets the cut line: a document claims something false |
| 13 | ~~`.env.example` declares `OPENCLAW_GATEWAY_TOKEN`, and nothing reads it~~ | `.env.example` | **done on #49, 2026-10-26**: the key is removed, and `OC-79` holds that every key has a reader; it found the four `LIQUID_*` image settings unread as well, and `liquid.sh` reads them now. Added 2026-10-26 from the carried-over `BACKLOG.md` entry on the OpenClaw CLI, which calls a declared key nothing consumes a promise the contract does not keep. That meets the cut line, and the table below had settled it on 2026-10-17 with two other entries. The operator chose the same day to remove the key; giving the gateway a token would change its authentication model |

## Settled, with the reason, and not raised again

Named rather than restated — `BACKLOG.md` holds the reasoning, and two copies of one record is the
defect `A1` on #17 was.

| Entry | Why it is settled rather than open |
|---|---|
| A row that describes a different case than the test carrying its id — the third id class | Needs a convention before it can be checked at all; recorded on #28. Judging whether two prose descriptions mean the same thing is a manual check by `CLAUDE.md`'s own rule |
| Docker Desktop on macOS, Windows and WSL2 | Needs machines this host is not. Recorded in two specifications as deliberately unverified |
| #10's controls into the mutation registry | It was blocked on #18, which merged on 2026-10-21; the runner is on `main` with an empty registry, and #17 fills it. Unblocked now, and still outside the cut line: nothing claims something false while they are unregistered, and `mutate.sh --gaps` lists them as missing, which is the true statement |
| The Claude login expiry; `volumes/_openclaw-claude/skills` not removable | Carried over from the 2026.9.1 migration. Neither makes anything claim something false. *The OpenClaw CLI's gateway token stood here too until 2026-10-26; its key is item 13.* |
| The deploy-key wait handling one key at a time | A design preference, with the reasoning recorded |
| A run killed mid-clone leaves a clone the next run adopts | Narrow window, never observed, and the record says so |
| The toolbox image not following its own Dockerfile | Raised by the reviewer as *"not asked for"*; the durable form is a label and it touches the dashboard's build path |
| `A16-19` naming two cases | #24 renumbered it to `A16-30`, on `main` since 2026-10-21 |
| `S3` — the builder's port trusts any container on the stack network | **Decided by the operator on 2026-10-26: not built.** A trust boundary, not a defect, and `BACKLOG.md` keeps the honest statement that any container on the stack can trigger a build |
| The `operator.admin` rule | **Decided by the operator on 2026-10-26: not built.** The direction is specified and reviewed on #15, merged 2026-10-20, and `BACKLOG.md` keeps what building the rule would take |
| Two `:latest` fallbacks in the `ingest-pdf` build scripts | **Added to this table on 2026-10-17, from the work list.** Measured: nothing in the repository invokes either script, the bundles are checked in, and the fallback does not meet the cut line — it claims nothing and touches nothing of anyone else's. The measurement did sharpen the finding, and it is in `BACKLOG.md`: the stack's gateway is built `FROM …openclaw:2026.9.1`, pinned, so a hand-run build with the variable unset builds against **a different OpenClaw than the stack runs**. The remedy is one line per script — `${OPENCLAW_IMAGE:?…}` instead of a default — for whoever next edits them |
| N6's residual: 764 MB from a 1.7 KB bundle | Moved here from the work list on 2026-10-17, against the cut line: `docs/FEATURE-liquid-java-extensions.md` §2, FR36, already states it, so nothing claims anything false. The reasoning is in `BACKLOG.md`. Raise it by asking |

## Waiting on someone else, with nothing of ours open

Each waits on someone else's decision or work, so it is `OPEN` in `BACKLOG.md`, and nothing of ours is
open on it until that is done. `S3` and the `operator.admin` rule stood here for part of 2026-10-26, until the
operator decided both.

| Entry | Whose | What it waits on |
|---|---|---|
| `45-26` — four mutation-runner cases trace to no requirement | Timur's | The mapping is the reviewer's, made case by case on #18 |

## What finishing means

When items 3 to 13 are done: every pull request of ours waiting on review, nothing waiting on us.
Review comments then arrive, are worked in, and that is the end of development. *On 2026-10-26 no pull
request of ours is open, and items 1 to 8 and the first half of 9 are answered on `main`. Items 11 to
13 are answered on #49, the operator having chosen for 12 and 13 on 2026-10-26. Open, once #49 is
merged: the one entry in the table above, Timur's. How many pull requests are open is the forge's to say, and
`./scripts/state.sh` asks it.* **This
file is the only place a new item may be added, and only if it meets the cut line above.**
