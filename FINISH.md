# The finishing list

**One list, worked from the top. When it is empty, nothing is open on our side and the only thing
left is review.** Written 2026-10-17, because the question *"why is there always something new?"*
has a structural answer and this file is it. **Checked against the tree on 2026-10-21**, with `main`
at `8476389`. Rows 3 to 10 are left as `main` has them: the branches that answer them carry their
own update of each row, and a second copy here would be a conflict with each of them.

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
| 1 | Mark every `BACKLOG.md` entry `OPEN` / `SETTLED` / `RECORD` / `DONE-ON-#N`, so the file becomes the queue it is read as | `BACKLOG.md` | **deferred to last, still**: on 2026-10-22 **nine** of our eleven open pull requests touch that file — #37, #38, #39, #40, #41, #42, #43, #45 and #47; #44 and #46 do not — so marking every entry now buys nine conflicts. It said nine on 2026-10-17 and eight on 2026-10-21. #45 carries a dated note on each entry it records, saying where that entry stands, which is the queue this item asks for until it can be done on `main`. Done when those have merged. |
| 2 | Strike what open branches already closed, so `main`'s copy stops reading as open | `BACKLOG.md` | with 1, same reason |
| 3 | ~~`m-a5.nested-clone` writes into `volumes/repos` from the **default tier**~~ | `tests/contract/m-a5.nested-clone.test.ts` | **done on #39 (`fecc9ff`), corrected 2026-10-20**, measured both ways with a watcher on the path during the run. The review of 2026-10-22 found two more default-tier files writing there through `chainFixture`'s host view, which roots in a temporary directory since |
| 4 | A test run leaked a **container**, not only an image: `festive_wescoff` held `nar-builder:run-47099-xoirn1` for two days. The sweep built on #18 reclaims images; a container that outlives its run pins one and is not swept | `tests/lib/builderimage.ts` | open |
| 5 | ~~`down.sh` leaves behind every container the current branch does not declare~~ | `scripts/linux/down.sh` | **done 2026-10-17**, `A11-11`. It still held: identical on 17 of 18 branches, and `update.sh` had already drifted to the flag. Measured against real compose |
| 6 | ~~Two `:latest` fallbacks in the `ingest-pdf` plugin build scripts~~ | — | **settled 2026-10-17**, moved to the table below. It does not meet the cut line: nothing invokes those scripts and nothing claims anything false. Measured, and the finding is sharper than the entry said — see there |
| 7 | `OC-15` and `OC-16` depend on what else the machine is doing — the class that produced thirteen phantom failures on 2026-10-16 | the two cases | open |
| 8 | N6's residual: `narcheck.py` holds each class's bytes, so judging a bundle can still cost 256 MiB of jar plus 512 MiB of classes. Stream the parse instead | `config/liquid/narcheck.py` | open, the one real product item |
| 9 | Split `HANDOFF.md` into the map and the log — **the half that ages is gone** | `scripts/state.sh`, `HANDOFF.md` | **half done 2026-10-17**, `A17-1`, `A17-2`. The state is a command now, because the narrated copy was wrong twice in two days — once raised by the reviewer as `F4`. The file split stays deferred, as `BACKLOG.md` says: four documents cite the handover, and #19 carries an older copy |
| 10 | Closing sweep: every pull request carries a message newer than its head, every branch merges clean, no entry left unmarked | — | last |

## Settled, with the reason, and not raised again

Named rather than restated — `BACKLOG.md` holds the reasoning, and two copies of one record is the
defect `A1` on #17 was.

| Entry | Why it is settled rather than open |
|---|---|
| `S3` — the builder's port trusts any container on the stack network | A trust boundary, not a defect. It needs the operator's decision. It was to go with the pairing work on #15, which merged on 2026-10-20 without it, so it waits on that decision alone |
| The `operator.admin` direction | Specified and reviewed on #15, which merged on 2026-10-20 |
| A row that describes a different case than the test carrying its id — the third id class | Needs a convention before it can be checked at all; recorded on #28. Judging whether two prose descriptions mean the same thing is a manual check by `CLAUDE.md`'s own rule |
| Docker Desktop on macOS, Windows and WSL2 | Needs machines this host is not. Recorded in two specifications as deliberately unverified |
| #10's controls into the mutation registry | It was blocked on #18, which merged on 2026-10-21; the runner is on `main` with an empty registry, and #17 fills it. Unblocked now, and still outside the cut line: nothing claims something false while they are unregistered, and `mutate.sh --gaps` lists them as missing, which is the true statement |
| The Claude login expiry; the OpenClaw CLI's gateway token; `volumes/_openclaw-claude/skills` not removable | Carried over from the 2026.9.1 migration. None of them makes anything claim something false |
| The deploy-key wait handling one key at a time | A design preference, with the reasoning recorded |
| A run killed mid-clone leaves a clone the next run adopts | Narrow window, never observed, and the record says so |
| The toolbox image not following its own Dockerfile | Raised by the reviewer as *"not asked for"*; the durable form is a label and it touches the dashboard's build path |
| `A16-19` naming two cases | #24 renumbers it to `A16-30`. Already someone's work |
| Two `:latest` fallbacks in the `ingest-pdf` build scripts | **Added to this table on 2026-10-17, from the work list.** Measured: nothing in the repository invokes either script, the bundles are checked in, and the fallback does not meet the cut line — it claims nothing and touches nothing of anyone else's. The measurement did sharpen the finding, and it is in `BACKLOG.md`: the stack's gateway is built `FROM …openclaw:2026.9.1`, pinned, so a hand-run build with the variable unset builds against **a different OpenClaw than the stack runs**. The remedy is one line per script — `${OPENCLAW_IMAGE:?…}` instead of a default — for whoever next edits them |

## What finishing means

When items 3 to 10 are done: every pull request of ours waiting on review, nothing waiting on us.
Review comments then arrive, are worked in, and that is the end of development. *On 2026-10-21, nine
pull requests of ours are open, and items 3 to 9 are answered on five of them, each of which updates
its own row here when it merges: 3 on #39, 4 on #40, 5 and 6 on #41, 7 and 8 on #42 — #40 adds to
row 7 as well — and the first half of 9 on #43. The five conflict with each other here in
neighbouring rows, though each merges clean into `main`, so whichever lands second keeps both rows.
6 and 8 are answered by settling them, which the operator accepted that day. 1 and 2 wait for the
eight that touch `BACKLOG.md`. Of 10, two thirds held that day: every open pull request of ours
carried a comment of ours newer than its head, compared in UTC, and every branch of ours merged
clean. It said "twelve pull requests" on 2026-10-17, when the twelve were different ones; the count
is the forge's to give, and `./scripts/state.sh` on #43, `feature/computed-state`, gives it.* **This
file is the only place a new item may be added, and only if it meets the cut line above.**
