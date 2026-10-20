# Test specification — every case a test carries is a case somebody signed

A test labelled with an id that no specification declares is invisible twice over. `mutate.sh --gaps`
reads ids out of `TEST-SPEC-*.md`, so it can neither count the case nor report it missing; and a
reviewer signing the milestone off never sees it.

**Measured across `main`, 2026-10-09**, before anything was written: 243 ids in test titles, 279 in
specification rows, and **13 tested ids that no row declared** — `A8-27`, `A14-7`, `A14-8`, `A16-21`,
`A16-22`, `A16-24` to `A16-29`, `OC-40` and `OC-42`. None of them was wrong. They were written after
the rows around them, during the rounds of review that followed, and nothing brought the document
along.

> **The two `OC-` ids in that list are `OC-63` and `OC-64` since 2026-10-12, and they are left as
> `OC-40` and `OC-42` here on purpose.** This paragraph is a measurement taken on a given day, and the
> ids it names are part of what was measured; rewriting them would make the record describe a
> measurement nobody took. What happened afterwards is that #15 turned out to have specified `OC-40`
> and `OC-42` on 2026-09-19 for two entirely different cases, so these two were renumbered — see the
> note under their rows in `TEST-SPEC-openclaw-2026-9-1.md`. **And it is worth noting what this check
> did and did not catch.** `TR-1` compares tested ids against declared ids; it has nothing to say about
> two cases sharing one id, which is why the collision survived until a merge surfaced it. *A
> uniqueness check was the obvious next case and was not written when this was recorded on
> 2026-10-09;* `TR-4` is that check for the test-file half of the question since 2026-10-13, and
> **What this check still does not do** carries what is still open. The thirteen are documented now, gathered in sections of their own rather than interleaved,
because interleaving them would imply they were signed off with their neighbours.

**Level.** Contract. The two artefacts are read as text, which is the only level at which "the
document and the code agree" is a property rather than an intention.

**Rigour.** Both directions of the comparison are exercised, and the floor on each set's size is the
case that carries the weight — see TR-2.

**Why it is weaker than `MU-59`.** That case, on `feature/mutation-registry`, compares a generated
**scenario** table against test titles, so a reworded test name reddens it. This one compares **ids**
across the whole repository. A per-scenario table for 241 ids is a far larger document and is not yet
earned; the id-level check is what found the real drift, and it is the one that can be applied to
every milestone at once.

## Overview

| # | Sign | Scenario |
|---|---|---|
| **TR-1** | **negative** | No test carries a case id that no `TEST-SPEC-*.md` row declares |
| **TR-2** | positive | The comparison is over something: both sets are read and both are large, so two empty reads cannot satisfy TR-1 |
| **TR-1** | positive | A declared id with no test is reported and not failed, and the case asserts that such ids exist |
| **TR-3** | positive + **negative** | The reader sees a case wherever the file puts it: a top-level `describe` after a blank line **and** one after `});`, because the first passing is what hid the second |
| **TR-4** | **negative** | No id is carried by two test files without that being on record: its detail block names **every** file carrying it, or a reviewed entry names that **exact** file set |
| **TR-4** | positive | …and a real level split on record is **accepted**, by either route — `OC-17` through the list, `OC-68` through its own block | 
| **TR-4** | **negative** | …and every reason is a reason rather than a placeholder, because a list whose entries say nothing is a list nobody reviewed |
| **TR-4** | **negative** | …and the list does not outlive what it exempts: an entry is stale when its id no longer spans files, **and redundant when its block has come to claim every file** |

## Detail

### TR-1 — the drift, and the direction that is an error

| | |
|---|---|
| **Premise** | Thirteen ids, measured above. The mechanism that produced them is ordinary: a review asks for a case, the case is written, the specification is not touched. Nothing in the repository noticed. |
| **Component** | Every `*.test.ts` under `tests/`, and every `docs/TEST-SPEC-*.md`, read as text. |
| **Steps** | Collect the ids at the start of a `test(` or `describe(` title, including one behind a modifier such as `.skipIf(...)`. Collect the ids in the first cell of a specification row, bolded or not. Subtract. |
| **Test data** | The repository itself. The title pattern is anchored to the line's indentation, so a fixture spec written inside a template literal — which starts at column 0 — is not read as a case of this suite; `m-mu.runner` and `m-a16.result-line` both contain such specs, which is what makes the anchor necessary rather than tidy. |
| **Expected** | An empty list, with each offender named with its file when it is not. |
| **What it found** | Thirteen, listed above, and one collision it deliberately leaves standing: `A16-19` names two unrelated cases, in `m-a16.skip-panel` and `m-a16.text-only`. Renumbering a signed-off id is the operator's decision, and `mutate.sh` refuses a `mustFail` resolving to more than one test, so the collision surfaces as a refusal rather than a wrong answer. In `BACKLOG.md`. |
| **The other direction is not an error** | A declared id with no test is `--gaps`' *missing* count, and it is the ordinary state of a specification written **before** the work — which this project requires. Failing on it would make "specify first" impossible. The third scenario asserts that such ids exist at all: if every declared id had a test, this project would not be writing specifications first. |
| **Implemented by** | `tests/contract/m-tr.case-ids.test.ts`. |
| **Covers** | TR-FR1, TR-FR2. |

### TR-2 — the guard that carries the weight

| | |
|---|---|
| **Premise** | `[] ⊆ anything` holds. A reader that silently matched nothing — a changed title format, a moved directory, a regex that stopped working — would make TR-1 green for ever, and this is exactly the shape of the `'' === ''` leftover the 2026-10-01 review of #10 found in B1-8, where both hashes stayed empty and the case passed. |
| **Steps** | Assert a floor on each set's size rather than an exact count. |
| **Test data** | 200 and 200, against 241 and 290 measured. Floors, so that a milestone adding cases does not turn this red while one that loses two hundred does. |
| **Expected** | Both above the floor. |
| **Implemented by** | `tests/contract/m-tr.case-ids.test.ts`. |
| **Covers** | TR-FR2. |

### TR-3 — the reader, which nothing held until it was wrong

| | |
|---|---|
| **Premise** | `TR-1` is only as good as the set of ids it reads, and nothing checked that set. The reader was anchored `^\s+` — "indented" — so that a fixture spec inside a template literal, which starts at column 0, is not read as a case of this suite. But `\s` includes the newline, so under the `m` flag the anchor could reach back over a **blank line** and match a top-level `describe(` after all, while the same call preceded by `});` stayed invisible. Whether a case was checked depended on the blank line above it. |
| **Component** | `idsInTests()` in `tests/contract/m-tr.case-ids.test.ts`. |
| **Steps** | Ask the reader for the ids it finds in this tree, and look for one of each shape: a column-0 `describe` after a blank line, and a column-0 `describe` after `});`. |
| **Test data, and why these two** | `OC-63` in `m-oc.bound-arguments.test.ts` is preceded by a blank line — the shape that **was** seen. `OC-64` in `m-oc.env-reads.test.ts` is preceded by `});` — the shape that was **not**. Both are real cases on this tree rather than fixtures, so the data cannot drift out from under the case without a test file changing. |
| **Expected** | Both ids present. |
| **What it found** | The defect was found sideways, by a control: renumbering `OC-40` to `OC-63` turned `TR-1` red as it should, and renumbering `OC-42` to `OC-64` turned nothing red at all. One control working and its twin not working is what exposed the reader. **Measured before the correction: 253 id/file pairs seen against 260 when anchored to columns — 7 invisible**, being `A13-9`, `A14-8`, `A9-11`, `A9-12`, `OC-64` and `SP-2` in two files. Every one of those six ids turned out to be declared, so `TR-1` was giving the right answer for the wrong reason; a count of zero is not a result until something that must be there is counted. And with the reader corrected, `TR-1` immediately reported one genuinely undeclared id: **`TR-3`, this case**, which had no row yet. |
| **Implemented by** | `tests/contract/m-tr.case-ids.test.ts`. |
| **Covers** | TR-3, TR-FR1. |

### TR-4 — two cases with one id, which TR-1 cannot see

| | |
|---|---|
| **Premise** | `TR-1` compares tested ids against declared ids in both directions and says nothing about **two cases sharing one id**. That is not hypothetical: it has happened twice, and both times a green suite on each branch. `OC-40` and `OC-42` were specified on #15 on 2026-09-19 and assigned again on `main` on 2026-10-09 for different cases, surfacing as a merge conflict rather than a test failure (renumbered on #26). And `m-a8.toolbox-tools` was using `A8-24`, `A8-25` and `A8-26`, all three belonging to other cases, with no row of its own — found by accident while chasing an unrelated red (renumbered on #27). A stolen id *is* declared, by the case it was taken from, so `TR-1` passes throughout. |
| **Component** | `idsInTests()` and `namedByBlock()` in `tests/contract/m-tr.case-ids.test.ts`, and the reviewed `SPANS_FILES` beside them. |
| **Steps** | Compute every id carried by more than one test file, with those files. For each, read the *Implemented by* rows of every detail block whose heading names that id, and accept the id if those rows name **every** carrying file by full path. Failing that, accept it if `SPANS_FILES` holds an entry whose `files` **equal** the carrying set. Then: the counterpart, that two known level splits are in fact accepted, one by each route; that every entry's reason is a reason; and that no entry is stale or redundant. |
| **Two routes, and why the computed one comes first** | `CLAUDE.md`: *prefer a computed answer to a rule an agent has to remember.* The *Implemented by* convention already records which files implement a case, in the place a reviewer reads, so for a block that follows it the question is **determinable** and no list entry is needed. The list is what is left: blocks that predate the convention. It can therefore only shrink, and the fourth scenario makes that true rather than hoped for — an entry whose block has come to claim every file is reported as redundant, so bringing a block up to the convention forces the entry out with it. |
| **Why a list is still needed at all, measured rather than argued** | Two shapes look identical from outside: one case tested at two levels, which this project asks for, and two unrelated cases wearing one id. **Measured 2026-10-13: 11 ids span files and nine are the first shape**, so "one id, one file" would fail nine correct things. **Re-measured 2026-10-20 on the tree with `main` merged: 15 ids span files, and the computed rule accepts 3** — `OC-68`, `OC-69`, `OC-70`, which came in with #15 and whose blocks name both of their files each. A fourth, `OC-45`, had a block with **no *Implemented by* row at all**, so one row was added there rather than an entry here; that is the shape of how this list is meant to drain. The remaining 11 are listed. |
| **A path, not a basename** | `m-oc.pairing-card` exists twice — `tests/contract/` reads the card as text, `tests/component/` mounts it — so a basename match would accept the wrong file silently. The computed rule matches `tests/…/x.test.ts` in full. |
| **What the computed rule cannot distinguish, stated because it is its one weakness** | A block whose heading names several ids — `OC-43 / OC-44 / OC-45` — claims its files for all of them together, so **within such a block the rule cannot say which id a file belongs to**. What it still catches is a file that no block mentioning the id claims, which is the shape a stolen id takes. A tighter rule would need per-id *Implemented by* rows, which the house style does not have. |
| **Test data, both sides, stated** | **Accepted by the computed rule:** `OC-68` (`tests/component/m-oc.pairing-card.test.ts` + `tests/integration/m-oc.pairing-budget.test.ts`), `OC-69` (component card + `tests/unit/m-oc.pairing-env.test.ts`), `OC-70` (integration budget + component card), and `OC-45` since its row was added (`tests/contract/m-oc.pairing-card.test.ts` + `tests/unit/m-oc.pairing-env.test.ts`). **Accepted by the list,** each with its exact pair: `A3c-8` (contract `m-a3c.ssh-isolation` + system `m-a3c.clone-identity`), `A6-12` (contract `m-a6.command-mounted` + system `m-a6.publish-in-container`), `A8-20` (component `m-a8.declaration-drift` + integration `m-a8.served-card`), `A8-21` (unit `m-a8.declaration-preflight` + contract `m-a8.preflight-order`), `OC-12` (component `m-oc.config-shape` + system `m-oc.device-scopes`), `OC-17`/`OC-18`/`OC-19` (unit `m-oc.version-probe` + integration `m-oc.version-probe-images`), `OC-31` (component `m-oc.config-shape` + system `m-oc.codex-plugin`), and `SP-2` with **four** files — unit `m-sp.preconditions` plus component `m-a16.result-line`, `m-a16.skip-panel` and `m-oc.pairing-card`. **What must not be accepted:** a sixteenth id appearing with no block row and no entry; a **third** file carrying a listed id, measured below; a reason failing `length > 40` or matching `/^(todo|tbd|see above|n\/a)/i`; an id failing `/^[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+$/`; an entry naming fewer than two files or a path failing `/^tests\/[A-Za-z0-9._/-]+\.test\.ts$/`. And one entry is a **collision rather than an exception** — `A16-19`, where `m-a16.text-only` is about git tracking test files and `m-a16.skip-panel` about the skip-all wording. Its reason says so and says it goes when #24 merges, so the list records a known defect instead of blessing it. |
| **Expected** | No unjudged id, both counterpart splits accepted, every reason a reason, no stale or redundant entry. |
| **What it found** | Green, 3 scenarios on the branch — after `TR-1` immediately failed on `TR-4` itself for having no row, which is the second time that has happened while adding a case to this file. **And then two things on review, 2026-10-20, both of which it had to be rebuilt for.** First, it was **red on the merged tree**: #15's four ids span files by design and nothing claimed them, which is the semantic half of a merge that `git merge-tree` calls clean. Second, and worse, **the exemption could be stolen**: the check asked only whether a spanning id was *in* the list, so once `OC-17` was listed, a third file could carry `OC-17` for an unrelated case and the suite stayed green — the reviewer measured 7 pass / 0 fail against exactly that. It had already happened harmlessly on `main`, where `SP-2` grew from three carrying files to four with #15 and the reason in the list quietly became false. Entries name their file set now, and the match is equality. |
| **Controls** | Seven, each reddening the scenario it names. *Of the original three:* a legitimate entry removed (`OC-17`) → the first scenario; an entry added for an id that spans one file (`TR-1`) → the stale scenario; `TODO: ` prefixed to a reason → the reason scenario, on the regex rather than the length. *Of 2026-10-20:* an unrelated `OC-17` case appended to `tests/contract/m-a6.command-mounted.test.ts` → the first scenario **and** the counterpart, where before the rebuild it was 7 pass / 0 fail; `OC-45`'s new *Implemented by* row removed → the first scenario, reporting `OC-45` by its two files; `SP-2`'s entry cut back to its old three files → the first scenario, naming the surplus file; and the four `OC` ids left unclaimed on the merged tree → the first scenario, which is the state the review found. |
| **Implemented by** | `tests/contract/m-tr.case-ids.test.ts`. |
| **Covers** | TR-4, **TR-FR3**. |

## No id is carried by two test files unless that is on record — and what is still unchecked

That sentence is what `TR-4` does, and saying it exactly matters, because this section used to claim
both that an id *is* checked for being used once and that such a check was *not written*. Both
cannot be true, and neither was: `TR-4` covers **one** of the three halves the backlog entry
sketched, and the other two are open. What `TR-1` on its own still cannot see is the stolen id —
it compares tested ids against declared ids, and a stolen one is declared by the case it was taken
from. That is not hypothetical: `OC-40` and `OC-42` were specified on #15 on 2026-09-19 and assigned
again here on 2026-10-09 for different cases, surviving both branches' suites until a merge surfaced
it, which is why they were renumbered to `OC-63` and `OC-64` on 2026-10-12.

**Still unchecked, each with what it would find today (measured 2026-10-20, on this tree with `main`
merged).**

| What | Where it would bite | Measured |
|---|---|---|
| **One file, one id, a row that is not its case.** `A16-20` is the instance: row `docs/TEST-SPEC-git-integration.md:3274` is a **unit** check on a NUL byte, while `tests/integration/m-a16.lock-identity.test.ts:177` is a stale-foreign-lock case. Both `TR-1` and `TR-4` pass — the id is declared, and it is carried by one file | The whole class `TR-4` cannot reach, because it compares *files* | Found while working #28 on 2026-10-16 and recorded here rather than left in a pull request thread. One option, noted rather than taken: several spec tables carry a level column, and comparing it with the test's directory would flag this one mechanically — row `Unit`, file under `tests/integration/` |
| **One id declared twice inside one document** | A duplicate row, as against a second scenario row | **Not buildable as stated.** The project's own rule is one row per *scenario*, so an id legitimately carries several rows: of **459** id/document pairs, **50** carry more than one row. A plain duplicate check would report all 50. It needs a notion of which rows belong to one case, which the documents do not currently carry |
| **One id declared by two documents** | A case specified in two places, where only one of them is read | **Finds exactly one: `SP-2`**, in `TEST-SPEC-suite-preconditions.md` and `TEST-SPEC-openclaw-2026-9-1.md` — and that one is by design, because `SP-2` is the rule that every file needing a precondition says so, and the OpenClaw document declares the instance its own card file carries. So the check is cheap to build and would need this exemption on its first run |

All three remain in `BACKLOG.md`, with the entry now recording which one was built and what the other
two would cost.

## Traceability

| Requirement | Covered by |
|---|---|
| TR-FR1 a case id in a test title is declared by a specification row | TR-1 |
| TR-FR2 the comparison is shown to be over a non-empty reading of both artefacts | TR-2 |
| **TR-FR3 an id carried by more than one test file is one case, judged on record** | **TR-4** |
