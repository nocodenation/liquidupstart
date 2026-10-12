# Test specification — every case a test carries is a case somebody signed

A test labelled with an id that no specification declares is invisible twice over. `mutate.sh --gaps`
reads ids out of `TEST-SPEC-*.md`, so it can neither count the case nor report it missing; and a
reviewer signing the milestone off never sees it.

**Measured across `main`, 2026-10-09**, before anything was written: 243 ids in test titles, 279 in
specification rows, and **13 tested ids that no row declared** — `A8-27`, `A14-7`, `A14-8`, `A16-21`,
`A16-22`, `A16-24` to `A16-29`, `OC-40` and `OC-42`. None of them was wrong. They were written after
the rows around them, during the rounds of review that followed, and nothing brought the document
along. The thirteen are documented now, gathered in sections of their own rather than interleaved,
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

## Traceability

| Requirement | Covered by |
|---|---|
| TR-FR1 a case id in a test title is declared by a specification row | TR-1 |
| TR-FR2 the comparison is shown to be over a non-empty reading of both artefacts | TR-2 |
