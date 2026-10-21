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
> two cases sharing one id, which is why the collision survived until a merge surfaced it. A uniqueness
> check is the obvious next case and is not written. The thirteen are documented now, gathered in sections of their own rather than interleaved,
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

## Detail

### TR-1 — the drift, and the direction that is an error

| | |
|---|---|
| **Premise** | Thirteen ids, measured above. The mechanism that produced them is ordinary: a review asks for a case, the case is written, the specification is not touched. Nothing in the repository noticed. |
| **Component** | Every `*.test.ts` under `tests/`, and every `docs/TEST-SPEC-*.md`, read as text. |
| **Steps** | Collect the ids at the start of a `test(` or `describe(` title, including one behind a modifier such as `.skipIf(...)`. Collect the ids in the first cell of a specification row, bolded or not. Subtract. |
| **Test data** | The repository itself. The title pattern is anchored to the line's indentation, so a fixture spec written inside a template literal — which starts at column 0 — is not read as a case of this suite; `m-mu.runner` and `m-a16.result-line` both contain such specs, which is what makes the anchor necessary rather than tidy. |
| **Expected** | An empty list, with each offender named with its file when it is not. |
| **What it found** | Thirteen, listed above, and one collision it deliberately leaves standing: `A16-19` names two unrelated cases, in `m-a16.skip-panel` and `m-a16.text-only`. Renumbering a signed-off id is the operator's decision, and `mutate.sh` refuses a `mustFail` resolving to more than one test, so the collision surfaces as a refusal rather than a wrong answer. In `BACKLOG.md`. *Resolved 2026-10-10 on the operator's word: `m-a16.skip-panel`'s case is `A16-30` now, and `text-only`'s two `A16-19` tests are a premise and its assertion, not a collision. And the reason given for leaving it standing was false — `mutate.sh` reads one spec file per entry, so a second file carrying the same id never meets the first; measured 2026-10-21 and recorded on #45. Finding 10 of the local review of 2026-10-21.* |
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

## What this check still does not do

**It does not check that an id is used once.** `TR-1` compares tested ids against declared ids in both
directions and has nothing to say about two different cases sharing one id. That is not hypothetical:
`OC-40` and `OC-42` were specified on #15 on 2026-09-19 and assigned again here on 2026-10-09 for
different cases, and the collision survived both branches' suites until a merge surfaced it — which is
why those two were renumbered to `OC-63` and `OC-64` on 2026-10-12. A uniqueness check is the obvious
next case and is **not written**; it is recorded in `BACKLOG.md` rather than left implied.

## Traceability

| Requirement | Covered by |
|---|---|
| TR-FR1 a case id in a test title is declared by a specification row | TR-1 |
| TR-FR2 the comparison is shown to be over a non-empty reading of both artefacts | TR-2 |
