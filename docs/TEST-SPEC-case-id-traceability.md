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
> *No id is carried by two test files unless that is on record* carries what is still open.

The thirteen are documented now, gathered in sections of their own rather than interleaved, because
interleaving them would imply they were signed off with their neighbours.

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
| **TR-4** | **negative** | No id is carried by two test files without that being on record: **one** detail block names every file carrying it, or a reviewed entry names that **exact** file set — on this tree |
| **TR-4** | positive | …and on this tree a real level split is **accepted** by its own block — `OC-68`; the list route's witness is on stated data below |
| **TR-4** | **negative** | …and every reason is a reason rather than a placeholder, and every entry names at least two **distinct** files |
| **TR-4** | **negative** | …and on this tree the list does not outlive what it exempts — no entry is stale, redundant, or names a file that no longer carries its id |
| **TR-4** | positive + **negative** | On stated data: a heading claims the cases its leading list names, ranges expanded, and **never** one its prose mentions — not after a dash either — *the local review of 2026-10-21, findings 2 and 7, and the second pass* |
| **TR-4** | **negative** + positive | …a file a block's row says holds **other** cases does not claim this one, while one it says holds this case does — *the second pass* |
| **TR-4** | **negative** | …two blocks that each claim part of an id's files do not add up to a claim — *finding 1* |
| **TR-4** | positive | …while one block naming every file is a claim |
| **TR-4** | **negative** | …a file the entry does not name is reported by name — the theft the entry's file set exists against |
| **TR-4** | positive | …while the exact file set on the list is accepted |
| **TR-4** | **negative** | …an entry the block has made unnecessary is reported, even when it names a file that does not carry the id — *finding 3* |
| **TR-4** | **negative** | …an entry naming a file that no longer carries the id says which — *finding 4* |
| **TR-4** | **negative** | …an entry whose id spans no files any more is stale |
| **TR-4** | **negative** | …an id listed twice is reported, and accepted by neither entry — *finding 6, and the second pass* |

## Detail

### TR-1 — the drift, and the direction that is an error

| | |
|---|---|
| **Premise** | Thirteen ids, measured above. The mechanism that produced them is ordinary: a review asks for a case, the case is written, the specification is not touched. Nothing in the repository noticed. |
| **Component** | Every `*.test.ts` under `tests/`, and every `docs/TEST-SPEC-*.md`, read as text. |
| **Steps** | Collect the ids at the start of a `test(` or `describe(` title, including one behind a modifier such as `.skipIf(...)`. Collect the ids in the first cell of a specification row, bolded or not. Subtract. |
| **Test data** | The repository itself. The title pattern was anchored to the line's indentation, so that a fixture spec written inside a template literal — which starts at column 0 — would not be read as a case of this suite; `m-mu.runner` and `m-a16.result-line` both contain such specs. *(Since 2026-10-12 the anchor is `^[ \t]*` — see TR-3 — so such a line **is** read; one is, `A10-14` in `m-mu.runner`, and TR-4 carries it. Corrected 2026-10-21.)* |
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
| **Component** | `idsInTests()`, `ownIds()`, `blocksOf()` and `judge()` in `tests/contract/m-tr.case-ids.test.ts`, and the reviewed `SPANS_FILES` beside them. *(Until 2026-10-21 `namedByBlock()` in place of the middle three.)* |
| **Steps** | Compute every id carried by more than one test file, with those files. For each, find the detail blocks whose heading's **own** list names that id, and accept the id if **one** of them names **every** carrying file by full path in its *Implemented by* rows. Failing that, accept it if `SPANS_FILES` holds an entry whose `files` **equal** the carrying set. Then: the counterpart, that a known level split, `OC-68`, is accepted by its block; that every entry's reason is a reason and its files distinct; and that no entry is stale or redundant. The list route's witness is on stated data, because any live one would break as the list drains — which is what it is meant to do. And the stated-data scenarios below. |
| **Two routes, and why the computed one comes first** | `CLAUDE.md`: *prefer a computed answer to a rule an agent has to remember.* The *Implemented by* convention already records which files implement a case, in the place a reviewer reads, so for a block that follows it the question is **determinable** and no list entry is needed. The list is what is left: blocks that predate the convention. An entry **leaves** when its block catches up — the *does not outlive* scenario reports it as redundant, so bringing a block up to the convention forces the entry out with it. Nothing stops an entry being **added**; that is a reviewed change like any other. *(This said the list "can only shrink". Finding 9 of the local review of 2026-10-21.)* |
| **Why a list is still needed at all, measured rather than argued** | Two shapes look identical from outside: one case tested at two levels, which this project asks for, and two unrelated cases wearing one id. **Measured 2026-10-13: 11 ids span files and nine are the first shape**, so "one id, one file" would fail nine correct things. **Re-measured 2026-10-20 on the tree with `main` merged: 15 ids span files, and the computed rule accepts 3** — `OC-68`, `OC-69`, `OC-70`, which came in with #15 and whose blocks name both of their files each. A fourth, `OC-45`, had a block with **no *Implemented by* row at all**, so one row was added there rather than an entry here; that is the shape of how this list is meant to drain. The remaining 11 are listed. *(Since 2026-10-21 twelve, and the twelfth is a third shape, neither a level split nor a collision: fixture data the reader cannot tell from a title — `A10-14`, below.)* |
| **A path, not a basename** | `m-oc.pairing-card` exists twice — `tests/contract/` reads the card as text, `tests/component/` mounts it — so a basename match would accept the wrong file silently. The computed rule matches `tests/…/x.test.ts` in full. |
| **What the computed rule cannot distinguish, stated because it is its one weakness** | A block whose heading names several ids — `OC-43 / OC-44 / OC-45` — claims its files for all of them together, so **within such a block the rule cannot say which id a file belongs to**. What it still catches is a set of files that no **single** block naming the id claims, which is the shape a stolen id takes. Three rows on the tree say which file holds which case — `` `tests/unit/m-b6.nothing-to-judge.test.ts` (B6-10, B6-11) `` — and since 2026-10-21 such a file is claimed for those cases only; two of the three sit under a heading that names the cases, the third under *Detail per case*, which claims nothing. *(This said a tighter rule "would need per-id Implemented by rows, which the house style does not have"; three blocks have them. The second pass over the 2026-10-21 repair.)* *(And it said "no block mentioning the id", and both words were wider than they should have been: the files were pooled across blocks, and a heading's prose counted as mentioning. Findings 1 and 2 of the local review of 2026-10-21, below.)* |
| **Test data, both sides, stated** | **Accepted by the computed rule:** `OC-68` (`tests/component/m-oc.pairing-card.test.ts` + `tests/integration/m-oc.pairing-budget.test.ts`), `OC-69` (component card + `tests/unit/m-oc.pairing-env.test.ts`), `OC-70` (integration budget + component card), and `OC-45` since its row was added (`tests/contract/m-oc.pairing-card.test.ts` + `tests/unit/m-oc.pairing-env.test.ts`). **Accepted by the list,** each with its exact pair: `A3c-8` (contract `m-a3c.ssh-isolation` + system `m-a3c.clone-identity`), `A6-12` (contract `m-a6.command-mounted` + system `m-a6.publish-in-container`), `A8-20` (component `m-a8.declaration-drift` + integration `m-a8.served-card`), `A8-21` (unit `m-a8.declaration-preflight` + contract `m-a8.preflight-order`), `OC-12` (component `m-oc.config-shape` + system `m-oc.device-scopes`), `OC-17`/`OC-18`/`OC-19` (unit `m-oc.version-probe` + integration `m-oc.version-probe-images`), `OC-31` (component `m-oc.config-shape` + system `m-oc.codex-plugin`), and `SP-2` with **four** files — unit `m-sp.preconditions` plus component `m-a16.result-line`, `m-a16.skip-panel` and `m-oc.pairing-card`. **Also accepted by the list since 2026-10-21:** `A10-14` (unit `m-a10.scan-paths` + `m-mu.runner`, where it is fixture data — see the row *After #18 reached `main`*). **What must not be accepted:** a seventeenth id appearing with no block row and no entry; a **third** file carrying a listed id, measured below; a reason failing `length > 40` or matching `/^(todo|tbd|see above|n\/a)/i`; an id failing `/^[A-Z][A-Za-z0-9]*-[A-Za-z0-9]+$/`; an entry naming fewer than two files or a path failing `/^tests\/[A-Za-z0-9._/-]+\.test\.ts$/`. And one entry is a **collision rather than an exception** — `A16-19`, where `m-a16.text-only` is about git tracking test files and `m-a16.skip-panel` about the skip-all wording. Its reason says so and says it goes when #24 merges, so the list records a known defect instead of blessing it. |
| **Expected** | No unjudged id, `OC-68` accepted by its block, every reason a reason, no stale or redundant entry; and on stated data, exactly the verdicts in *Expected on the stated side*. |
| **What it found** | Green, 3 scenarios on the branch — after `TR-1` immediately failed on `TR-4` itself for having no row, which is the second time that has happened while adding a case to this file. **And then two things on review, 2026-10-20, both of which it had to be rebuilt for.** First, it was **red on the merged tree**: #15's four ids span files by design and nothing claimed them, which is the semantic half of a merge that `git merge-tree` calls clean. Second, and worse, **the exemption could be stolen**: the check asked only whether a spanning id was *in* the list, so once `OC-17` was listed, a third file could carry `OC-17` for an unrelated case and the suite stayed green — the reviewer measured 7 pass / 0 fail against exactly that. It had already happened harmlessly on `main`, where `SP-2` grew from three carrying files to four with #15 and the reason in the list quietly became false. Entries name their file set now, and the match is equality. |
| **Controls** | Seven, each reddening the scenario it names. *Of the original three:* a legitimate entry removed (`OC-17`) → the first scenario; an entry added for an id that spans one file (`TR-1`) → the stale scenario; `TODO: ` prefixed to a reason → the reason scenario, on the regex rather than the length. *Of 2026-10-20:* an unrelated `OC-17` case appended to `tests/contract/m-a6.command-mounted.test.ts` → the first scenario **and** the counterpart, where before the rebuild it was 7 pass / 0 fail; `OC-45`'s new *Implemented by* row removed → the first scenario, reporting `OC-45` by its two files; `SP-2`'s entry cut back to its old three files → the first scenario, naming the surplus file; and the four `OC` ids left unclaimed on the merged tree → the first scenario, which is the state the review found. |
| **Widened 2026-10-21 for the local review** | A local `/code-review` of this branch found five ways the computed route and the list accepted what they should not, and each was **staged on a copy of this tree** before anything was changed: (1) the files were pooled over every block naming an id, so `describe('OC-70 an unrelated case …')` appended to `m-a6.command-mounted` plus a new block `OC-70 — an unrelated case` claiming that file gave **8 pass / 0 fail**; (2) the heading search matched an id anywhere in the heading, so `#### B6-17 — the build budget, and what B5-14 could not see` claimed its file for `B5-14`, and a `B5-14` case added to `m-b6.budget-stops-the-build` was **accepted**; (3) the redundancy check asked whether the entry's files were all named rather than whether the block accepts what is carried, so an `OC-45` entry naming a non-carrying file beside its two real ones stood **unreported**; (4) an entry naming a file that no longer carries its id was reported as a surplus with **an empty list**, and the stale scenario stayed silent; (6) a second entry for one id silently replaced the first in a `Map` — **8 / 0** with a third file accepted. And (7) a range heading such as `B6-10 to B6-13` claimed nothing for `B6-11` and `B6-12`. All of that sat in branches that ran only against the live tree, which is green (10). The decision is one function, `judge()`, over the spanning ids, the blocks and the list, so the live tree and stated data go through the same code. **The five stagings re-run against the repair are each red**, each with a message that names its cause. On this tree nothing moved: 15 ids span files, 4 accepted by their block, 11 by the list, as before. |
| **Test data on the stated side** | Ids `ZZ-…`, which no specification here declares, and paths `tests/unit/zz.alpha.test.ts`, `tests/integration/zz.beta.test.ts`, `tests/contract/zz.gamma.test.ts`, which name no file that exists — so nothing in them can be read as a real case. Headings: `ZZ-17 — … what ZZ-14 could not see` → `ZZ-17` only; `ZZ-43 / ZZ-44 / ZZ-45`; `ZZ-10 to ZZ-13` → four; `ZZ-14, ZZ-15, ZZ-20 to ZZ-22` → five; `ZZ-5 and ZZ-7`; `The write itself — ZZ-3 to ZZ-6, added …` → **none**, and `The build budget — ZZ-14 could not see it` → none, because a heading that does not start with a case claims nothing; `ZZ-M1 — a manual case` → `ZZ-M1`; `ZZ-1, tightened 2026-10-14 — prose naming ZZ-2` → `ZZ-1` only; `Overview` → none. A block `ZZ-10 to ZZ-13` whose row says alpha holds `(ZZ-10, ZZ-11)` and beta `(ZZ-12, ZZ-13)`, with `ZZ-12` carried by both (refused); and the same block saying beta holds `(ZZ-11 to ZZ-13)`, with `ZZ-11` carried by both (accepted). Decisions: `ZZ-70` carried by alpha and gamma, claimed by two blocks of one file each (refused) and by one block of both (accepted); `ZZ-17` carried by all three, listed with two (refused, gamma named) and carried by two, listed with those two (accepted); `ZZ-45` claimed by its block, listed with a third file (redundant); `ZZ-31` carried by two, listed with three (stale, gamma named); `ZZ-19` listed, carried by none (stale); `ZZ-31` listed twice (refused). |
| **Expected on the stated side** | Exactly the messages above: `ZZ-70 (alpha, gamma)`; `ZZ-17 carried by a file its entry does not name: gamma`; `ZZ-45 is claimed by its own block now, so this entry is redundant`; `ZZ-31 names a file that no longer carries it: gamma`; `ZZ-19 no longer spans files`; `ZZ-31 is listed twice, and only one entry can be read`, with `ZZ-31` accepted by neither route. **Every verdict is compared whole**, refusals included, so a decision that refused and accepted at once — the second pass found `judge()` doing exactly that for a doubled id — cannot pass. |
| **Controls, 2026-10-21** | Each repair reverted on its own against the final code, the file run, the file restored byte for byte. The file holds 18 tests. Files pooled over blocks again → *two blocks … do not add up* red alone. The heading searched for any id → *a heading claims …* red, and *a file a block says holds other cases …* with it, because the row's annotation is read by the same parser. Ranges not expanded → the same two. Redundancy asked of the entry's files → *an entry the block has made unnecessary …* red alone. The no-longer-carried report removed → *an entry naming a file that no longer carries …* red alone. The double-entry report removed → *an id listed twice …* red alone. |
| **The second pass over that repair** | Run at `medium` before committing; nine findings, all held, and these changed the code. A heading was read past its dash, so `The build budget — B5-14 could not see it` would still have claimed `B5-14` — only the part before the dash is read now. The id pattern required a numeric suffix, so `A16-M1` could never be claimed — it takes what `idsInTests` takes, and only a numeric pair makes a range. A range block pooled its files for every case in it, so a `B6-12` case added to the unit file of `B6-10 to B6-13` would have been accepted — a file's own `(…)` annotation now restricts it. A doubled id was refused **and** accepted through the last entry — it is accepted by neither now. The live counterpart's list witness would have broken as the list drains; it is gone, and the stated scenario is the witness. Refusal scenarios compared one field — every verdict is compared whole. *Controls:* the dash reading restored → *a heading claims …* red alone; the numeric-only suffix restored → the same, alone; the annotation ignored → *a file a block says holds other cases …* red alone; a doubled id accepted again → *an id listed twice …* red alone. On this tree, after all of it: 15 ids span files, 4 accepted by their block, 11 by the list — unchanged. |
| **Not repaired, and why** | The `A16-19` entry makes this branch and #24 fail `TR-4` together, whichever lands second, until that one entry is deleted. That is a decision taken already — the stale scenario names it, and nothing is built for it. And `namedByBlock()`'s re-reading of every document per id is gone with it: the documents are read once per scenario now. |
| **After #18 reached `main`, 2026-10-21** | `main` was merged in at `8bc4428`, and `TR-4` went red on the merged tree with one id, `A10-14`, in `m-mu.runner` and `m-a10.scan-paths`. Not a collision: MU-42's fixture spec sits in a template literal whose column-0 line is `describe('A10-14 a checked-in template is not a credential', …)`, because it reproduces the real case's shape, and `idsInTests` reads such a line as a title — the case its own comment had named as possible and absent. Blanking template contents first was **measured and rejected**: every `*.test.ts` under `tests/` on this merged tree, read with this file's title pattern once as written and once through `withoutTemplates` from `tests/scenario-table.ts`, gave **1267** ids against **1233**, and of the 34 lost only one was fixture data — `A10-14` in `m-mu.runner`. The other 33 are real titles: `TR-1` to `TR-4` in this very file, `A3c-8` and `A3c-9` in `m-a3c.clone-identity`, `A6-12` in `m-a6.publish-in-container`, `OC-58`, `OC-74`, `A8-12`, `A3e-3`, `A3e-6`, `A3e-7`, `A3d-4`, `A3-7` and `A3b-3`, some more than once — because that scanner misreads backticks and regex literals in code. A silent loss in `TR-1` in exchange for a visible entry here. The cleaner repair is at the fixture, which is `main`'s and is recorded on #45; when it lands, the entry is reported as no longer spanning files and leaves. So `A10-14` is **listed**, with the reason above. On this tree: 16 ids span files, 4 accepted by their block, 12 by the list. *Control:* the entry removed → the first scenario red, naming `A10-14` and both files. |
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
