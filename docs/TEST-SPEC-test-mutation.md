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

## 2. The MU cases are specified in `TEST-SPEC-mutation-runner.md`, and only there

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
`docs/TEST-SPEC-mutation-runner.md`**, which is where the runner's cases live — on `main` since #18
merged on 2026-10-21 — and this file keeps only what is about *this* branch: the levels above, the
omissions below, and a pointer to the requirements.

The test data those blocks named went with them, and it had drifted too: MU-1 named OC-44 and
`OpenClawPairing.svelte`, and #18's suite uses a throwaway repository and contains neither; MU-8 named
`TEST-SPEC-liquid-java-extensions.md`, which on 2026-10-09 was on none of `main`, this branch or #18.

*Brought up to date 2026-10-21, N3 of that day's re-review.* `TEST-SPEC-liquid-java-extensions.md` is
on `main` since #10 merged on 2026-10-16. And the MU-5 row above no longer describes a disagreement:
`main`'s MU-5 is *"a mutation that reddens every test is refused as a broken file"* — the rule this
file's row stood for, of which a whole-file syntax error is the instance — and the multi-line case is
MU-56. The table stays as the record of what A1 found.

## 4. Deliberate omissions

**No case asserts that a mutation is the *right* mutation.** That is a judgement — whether
`requestId: 'latest'` is the rule OC-44 exists to protect — and judgements belong to the reviewer. A
machine can check that the experiment was run; only a reader can check that it was the experiment
worth running.

*Corrected 2026-10-21, N3 of that day's re-review.* This said the reviewer can challenge the mutation
because §7 of the feature document puts it in the detail block. §7 is not built: for most entries the
mutation is in `tests/mutations.json` only, which the reviewer reads in the pull request's diff, and
three detail blocks carry theirs by hand (§7's note has which). So the omission rests on the reviewer
reading the registry, and nothing makes them.

**No case measures how long the full backfill takes.** M-MU2 will produce that number by running,
and a predicted number would be the kind of claim this project has stopped making.

## 5. Traceability

**The requirements are defined in §8 of `docs/FEATURE-test-mutation.md`, and only there.** Which
case covers which requirement is the table in `docs/TEST-SPEC-mutation-runner.md` §*Traceability*,
next to the cases.

*Shortened 2026-10-21, R1 of that day's re-review.* This section restated MU-FR1 to MU-NFR3 in a
corrected wording — corrections made on 2026-10-09 here and not in §8, so the two documents defined
five requirements differently: MU-FR3, MU-FR6, MU-FR7, MU-NFR1 and MU-NFR2. It was A1's double
specification moved from the case rows to the requirements. The corrections are in §8 now, each
dated where it was made, and this file names no requirement of its own.
