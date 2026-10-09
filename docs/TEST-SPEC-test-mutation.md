# Test specification — proving a test can fail

For review and sign-off **before** implementation. Cases derive from `FEATURE-test-mutation.md`;
every rule there has at least one positive case and one negative counterpart, because a rule that
only refuses is as useless as one that only permits.

The subject here is a validator, so the cases are recursive by necessity: **the runner must be shown
to fail when it cannot run.** A mutation runner that silently skips is the **fifth** instance of the
defect this milestone was commissioned to remove -- *corrected 2026-09-30, it read "fourth" here and
"fifth" further down*, and it would be the worst one, because it would be
wearing the uniform of the cure.

---

## 1. Levels and rigour

| Component | Level | Rigour |
|---|---|---|
| The registry format | unit | Both outcomes: a well-formed entry and each way of being malformed |
| The runner's decision logic | unit / component | **100% branch coverage.** It decides whether a case counts as validated, and a wrong answer is worse than no answer |
| The runner end to end | integration | Against a real test file and a real subject, not a mocked one |
| The report | contract | Read as text: the shape a reader relies on |
| Backfill coverage | contract | Which specified cases have an entry, computed rather than counted by hand |

## 2. The MU cases are specified on #18, and only there

*Rewritten 2026-10-09, A1 of the 2026-10-01 re-review, on the operator's decision to delete rather
than to cross-reference.*

This section held an overview of MU-1 to MU-12 and §3 held seven detail blocks for them. They were
written before the work, signed off, and then the runner moved to `feature/mutation-registry` (#18)
and took its cases with it. From that point the same twelve ids were specified in two documents, and
the two disagreed:

| | here | `TEST-SPEC-mutation-runner.md` on #18 |
|---|---|---|
| the row for **MU-5** | a whole-file syntax error is refused (negative) | a mutation may span several lines (positive) |
| the rows for **MU-7** and **MU-9** | the runner "exits non-zero before touching anything" | only the affected entry is refused, and a run agrees: `REFUSED P-test-subject`, then `VALIDATED A4-6`, exit 1 |
| the row for **MU-8** | "the report" lists the gap, and unresolved entries separately | `--gaps` lists the gap; it runs no mutation, so it cannot list unresolved entries |
| the row for **MU-10** | existed here, as "built as MU-37" | no row — it has no test, and MU-37's two scenarios stand in its place |

Two documents specifying one id with different meanings is worse than one of them being wrong,
because a reader cannot tell which they are holding. So **every MU id is specified in
`docs/TEST-SPEC-mutation-runner.md` on #18**, which is where the runner and its 91 scenarios live,
and this file keeps only what is about *this* branch: the levels above, the omissions below, and the
requirement traceability.

The test data those blocks named went with them, and it had drifted too: MU-1 named OC-44 and
`OpenClawPairing.svelte`, and #18's suite uses a throwaway repository and contains neither; MU-8 named
`TEST-SPEC-liquid-java-extensions.md`, which is on none of `main`, this branch or #18.

## 4. Deliberate omissions

**No case asserts that a mutation is the *right* mutation.** That is a judgement — whether
`requestId: 'latest'` is the rule OC-44 exists to protect — and judgements belong to the reviewer,
which is why §7 of the feature document puts the mutation in the detail block where it can be
challenged. A machine can check that the experiment was run; only a reader can check that it was the
experiment worth running.

**No case measures how long the full backfill takes.** M-MU2 will produce that number by running,
and a predicted number would be the kind of claim this project has stopped making.

## 5. Traceability

The cases are on #18, so the authoritative table is
`docs/TEST-SPEC-mutation-runner.md` §*Traceability*. This one records which requirement each of this
branch's own concerns answers to, and the wording is the corrected wording — four of these said
something the runner does not do, which is the other half of A1:

| Requirement | Covered by, on #18 | Corrected 2026-10-09 |
|---|---|---|
| MU-FR1 the entry format | MU-1, MU-19, MU-32 | — |
| MU-FR2 one entry, one file, restored | MU-1, MU-6, MU-31 | — |
| MU-FR3 a `from` that does not occur exactly once fails, **unless `"all": true` declares that every occurrence is meant** | MU-2, MU-3, MU-35 | said "exactly once" with no exception, while MU-35 is that exception |
| MU-FR4 the named test, and one survivor | MU-4, MU-12, MU-14, MU-22, MU-24, MU-27, MU-30, MU-40 to MU-42, MU-46, MU-47, MU-52, MU-54 | — |
| MU-FR5 restored however it ends | MU-6, MU-23, MU-25, MU-26, MU-33, MU-37, MU-39, MU-43, MU-49, MU-51 | — |
| MU-FR6 it refuses **the entry** whose subject has uncommitted changes, and carries on with the rest | MU-7 | said "refuses to start", which §5 of the feature document already contradicted |
| MU-FR7 the report lists each entry and its outcome, and **the gap on every run** | MU-8, MU-13, MU-20, MU-29, MU-34, MU-36, MU-60 | said it lists "the mutation" per entry; it prints the case and `mustFail`. The gap is on every run since MU-60 |
| MU-NFR1 the gap is computed, not counted | MU-8, MU-36 | said "a tool that is run in the milestone cycle", which is about *when* and not about *what* |
| MU-NFR2 the run is bounded, and an entry that does not finish is **refused** | MU-37, MU-38, MU-39, MU-48 | said such an entry "fails". `failed` means the named test passed; a run that did not finish measured nothing. The reviewer confirmed `refused` |
| MU-NFR3 never edits a test | MU-9, MU-21, MU-28, MU-53 | — |
