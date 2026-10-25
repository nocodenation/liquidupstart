# The finishing list

**One list, worked from the top. When it is empty, nothing is open on our side and the only thing
left is review.** Written 2026-10-17, because the question *"why is there always something new?"*
has a structural answer and this file is it. **Checked against the tree on 2026-10-25**, on #42 with `main`
at `dc35763` merged in; `main`'s later documentation commit `00ff80e` merges clean with it. Items 3 to 6
and the first half of 9 were answered by pull requests now on `main`, 7 and 8 on #42. The branches
still open, #42, #47 and #48, each carry their own updates.

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
| 1 | Mark every `BACKLOG.md` entry `OPEN` / `SETTLED` / `RECORD` / `DONE-ON-#N`, so the file becomes the queue it is read as | `BACKLOG.md` | **deferred to last, still**: on 2026-10-25 the three open pull requests of ours, #42, #47 and #48, all touch that file, so marking every entry now buys three conflicts. It said nine on 2026-10-22. The thirty entries #45 recorded carry a label and a status each on `main` since 2026-10-25, which is most of what this item asks. Done when those three have merged. |
| 2 | Strike what open branches already closed, so `main`'s copy stops reading as open | `BACKLOG.md` | **in part, 2026-10-25**: `main` strikes what #44 and #46 answered, #42 the two #46 entries its own diff edits, and #47 and #48 strike their own. The rest with 1 |
| 3 | ~~`m-a5.nested-clone` writes into `volumes/repos` from the **default tier**~~ | `tests/contract/m-a5.nested-clone.test.ts` | **done on #39 (`fecc9ff`), corrected 2026-10-20**, measured both ways with a watcher on the path during the run. The review of 2026-10-22 found two more default-tier files writing there through `chainFixture`'s host view, which roots in a temporary directory since 2026-10-22 |
| 4 | ~~A test run leaked a **container**, not only an image~~ | `tests/lib/builderimage.ts` | **done on #40, 2026-10-22**, `B6-41`. Shown against docker by `m-b6.builder-sweep`: a running labelled container another run abandoned, and its image, are removed in one sweep; the run in flight's are kept; no other container or image disappears. *Corrected 2026-10-22: this said done on 2026-10-17, measured with `rm -f`, which the branch had since dropped, so no real container was removed. The review of #40* |
| 5 | ~~`down.sh` leaves behind every container the current branch does not declare~~ | `scripts/linux/down.sh` | **done 2026-10-17**, `A11-11`. It still held: identical on 17 of 18 branches, and `update.sh` had already drifted to the flag. Measured against real compose |
| 6 | ~~Two `:latest` fallbacks in the `ingest-pdf` plugin build scripts~~ | — | **settled 2026-10-17**, moved to the table below. It does not meet the cut line: nothing invokes those scripts and nothing claims anything false. Measured, and the finding is sharper than the entry said — see there |
| 7 | ~~`OC-15`/`OC-16` load-dependent, and `startDashboard` asking `docker port` once~~ | `tests/lib/shell.ts`, `tests/lib/dashboardserver.ts`, the two cases | **done on #42 (`1df4128`), 2026-10-21**, `SP-5`, beside #24's `SP-3`: a budget of 600 s, a build timeout inside it, and a cut-off run that says so; and `startDashboard` waits for the published port by the container's id, against a clock, and says how the last ask ended. `SP-3` is the precondition for a machine with no registry |
| 8 | ~~N6's residual: stream the class parse in `narcheck.py`~~ | — | **settled 2026-10-17**, see the table below. Measured against the cut line, not against appetite: nothing claims anything false |
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
| N6's residual: 764 MB from a 1.7 KB bundle | Moved here from the work list on 2026-10-17, against the cut line: `docs/FEATURE-liquid-java-extensions.md` §2, FR36, already states it, so nothing claims anything false. The reasoning is in `BACKLOG.md`. Raise it by asking |

## What finishing means

When items 3 to 10 are done: every pull request of ours waiting on review, nothing waiting on us.
Review comments then arrive, are worked in, and that is the end of development. *On 2026-10-25, three pull
requests of ours are open, #42, #47 and #48. Items 3 to 9 are answered: 3 to 6 and the first half of 9
on `main`, 7 and 8 on #42. Of 10: each of the three, as pushed on 2026-10-25, merges clean into `main`
and with the other two, checked with `git merge-tree` between the heads. Whether each carries a comment newer than its head,
and how many are open, is the forge's to say, and `./scripts/state.sh` asks it.* **This
file is the only place a new item may be added, and only if it meets the cut line above.**
