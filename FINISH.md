# The finishing list

**One list, worked from the top. When it is empty, nothing is open on our side and the only thing
left is review.** Written 2026-10-17, because the question *"why is there always something new?"*
has a structural answer and this file is it.

## Why this file exists

`BACKLOG.md` is a **log, not a queue.** Thirty-one entries across its three sections, of which
twenty-three read as open — and they are four different things, with nothing in the file telling them
apart:

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
| 1 | Mark every `BACKLOG.md` entry `OPEN` / `SETTLED` / `RECORD` / `DONE-ON-#N`, so the file becomes the queue it is read as | `BACKLOG.md` | **deferred to last**: nine open pull requests touch that file, and marking every entry now buys nine conflicts. Done when the queue has drained. |
| 2 | Strike what open branches already closed, so `main`'s copy stops reading as open | `BACKLOG.md` | with 1, same reason |
| 3 | `m-a5.nested-clone` writes into `volumes/repos` from the **default tier** — `git init` into the checkout it was started from, which `tests/run.sh:18-23` calls the stack tier's privilege | `tests/contract/m-a5.nested-clone.test.ts:44-51` | **next** |
| 4 | A test run leaked a **container**, not only an image: `festive_wescoff` held `nar-builder:run-47099-xoirn1` for two days. The sweep built on #18 reclaims images; a container that outlives its run pins one and is not swept | `tests/lib/builderimage.ts` | open |
| 5 | `down.sh` leaves behind every container the current branch does not declare — verify it still holds on `main`, then repair or record it as settled | `scripts/linux/down.sh` | open, verify first |
| 6 | Two `:latest` fallbacks in the `ingest-pdf` plugin build scripts: the same moving-tag class as `S9`, and the pattern for it now exists | `config/agents/.../ingest-pdf` | open |
| 7 | ~~`OC-15`/`OC-16` load-dependent, and `startDashboard` asking `docker port` once~~ | `tests/lib/shell.ts`, `tests/lib/dashboardserver.ts`, the two cases | **done 2026-10-17**, `SP-5`, beside #24's `SP-3`: a budget, a build timeout inside it, and a cut-off run that says so. `SP-3` is the precondition for a machine with no registry. The figure, 600 s here and 180 s there, is the reviewer's |
| 8 | ~~N6's residual: stream the class parse in `narcheck.py`~~ | — | **settled 2026-10-17**, see the table below. Measured against the cut line, not against appetite: nothing claims anything false |
| 9 | Split `HANDOFF.md` into the map and the log. It is itself a backlog entry, and it is why that file grows every day | `HANDOFF.md` | open |
| 10 | Closing sweep: every pull request carries a message newer than its head, every branch merges clean, no entry left unmarked | — | last |

## Settled, with the reason, and not raised again

Named rather than restated — `BACKLOG.md` holds the reasoning, and two copies of one record is the
defect `A1` on #17 was.

| Entry | Why it is settled rather than open |
|---|---|
| `S3` — the builder's port trusts any container on the stack network | A trust boundary, not a defect. It needs the operator's decision and it belongs with the pairing work on #15 |
| The `operator.admin` direction | Lives on #15's branch, where it is specified and under review. Not ours to move while it is being read |
| A row that describes a different case than the test carrying its id — the third id class | Needs a convention before it can be checked at all; recorded on #28. Judging whether two prose descriptions mean the same thing is a manual check by `CLAUDE.md`'s own rule |
| Docker Desktop on macOS, Windows and WSL2 | Needs machines this host is not. Recorded in two specifications as deliberately unverified |
| #10's controls into the mutation registry | The registry is on #18 and awaiting a re-read. Blocked, not deferred |
| The Claude login expiry; the OpenClaw CLI's gateway token; `volumes/_openclaw-claude/skills` not removable | Carried over from the 2026.9.1 migration. None of them makes anything claim something false |
| The deploy-key wait handling one key at a time | A design preference, with the reasoning recorded |
| A run killed mid-clone leaves a clone the next run adopts | Narrow window, never observed, and the record says so |
| The toolbox image not following its own Dockerfile | Raised by the reviewer as *"not asked for"*; the durable form is a label and it touches the dashboard's build path |
| `A16-19` naming two cases | #24 renumbers it to `A16-30`. Already someone's work |
| N6's residual: 764 MB from a 1.7 KB bundle | Moved here from the work list on 2026-10-17, against the cut line: `docs/FEATURE-liquid-java-extensions.md` §3 already states it, so nothing claims anything false. The reasoning is in `BACKLOG.md`. Raise it by asking |

## What finishing means

When items 3 to 10 are done: twelve pull requests waiting on review, nothing waiting on us. Review
comments then arrive, are worked in, and that is the end of development. **This file is the only
place a new item may be added, and only if it meets the cut line above.**
