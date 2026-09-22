# Proving a test can fail

A green test says the assertion held. It does not say the assertion **could have failed** — and a
case that would pass over any implementation is indistinguishable, from the outside, from one that
protects something.

`tests/mutate.sh` is how that difference is measured. For each registered case it makes the smallest
edit to the **subject** that should break the rule the case protects, runs only the test file that
owns the case, and requires the named test to go red. The subject is restored however the run ends.

```bash
./tests/mutate.sh                 # every entry
./tests/mutate.sh --case A4-7     # one
./tests/mutate.sh --gaps          # which specified cases have no entry yet
```

## The registry

`tests/mutations.json`, one object per case:

```json
{
  "case": "A4-7",
  "file": "config/agents/hooks/pre-push",
  "spec": "tests/unit/m-a4.secret-scan.test.ts",
  "from": "-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----",
  "to": "-----BEGIN NEVER MATCHES PRIVATE KEY-----",
  "mustFail": "A4-7 a commit adding a private key is refused, and the file is named"
}
```

`from` must occur **exactly once** in `file`. It may span several lines. `file` may never be a test:
a tool that can rewrite the assertions can make anything pass.

## The four outcomes, and why there are four

| | |
|---|---|
| **validated** | the named test failed and at least one test still passed |
| **failed** | the named test passed — the entry does not protect what it claims |
| **refused** | the mutation could not be applied, or **every** test failed, which is a broken file rather than a control |
| **unresolved** | nothing went red at all |

**`unresolved` is the one that matters.** A green run reads as *"no case protects this rule"*, which
is exactly the discovery this tool exists to make — and when ten cases were mutated by hand on
2026-09-19, that reading was wrong **four times out of thirteen attempts**: the mutation was too
narrow, landed at the wrong site, replaced one of two occurrences, or never applied at all. Each time
the run was green and each time it looked like a finding.

So a green run is never reported as one. It is a question, and it needs a second mutation of a
different shape before anybody concludes anything from it.

## What it refuses to do quietly

Each of these is an error or a stated sentence rather than a silent pass, because a check that cannot
run otherwise looks exactly like a check that ran:

- a `from` that is **not** in the subject — the subject moved, and the entry describes an experiment
  that no longer exists
- a `from` that occurs **more than once** — nobody can say which occurrence carried the rule
- **every** test failing — a syntax error would otherwise validate every entry in the registry at once
- an **empty registry** — it says so, rather than printing four zeros that read like health
- a `--case` that **matches nothing** — that one exits non-zero, because it answers a direct question
  with a reassuring silence

## Where it applies

`CLAUDE.md` already draws the line and this does not move it: real decision logic, not configuration,
mounts or Markdown, where the mutation and the assertion would be the same edit. Behaviour that
depends on a model stays a documented manual check.

Cost is the reason for the line: one entry costs one test-file run. Ten entries took three and a half
minutes to write and validate by hand.

## Where the tool is not, and what stands in for it

**Decided 2026-09-22, on M-A16.** The rule is that a case without a registered mutation blocks its
milestone. It was taken while the tool was needed nowhere yet, and the first milestone to meet it
could not obey it: `tests/mutate.sh` and `tests/mutations.json` live on this branch and on
`feature/mutation-registry`, and M-A16 was built on `feature/git-integration`, which carries
neither. Branches do not see each other, so the rule was unreachable rather than skipped.

**What stands in for it there: the same question, asked against the real defect.** A mutation
invents a fault and requires the case to notice. M-A16's twenty cases were run against the code as
it stood *before* each finding was repaired — the fault the reviewer actually found, not one made up
to resemble it. **Eighteen failed and nine passed**, and the nine are the positive counterparts and
the tier's own control, which have to hold on both sides or they are not counterparts.

That is stricter than a mutation on the point that matters, and weaker on one that does not:

| | A mutation | A run against the unfixed code |
|---|---|---|
| The fault | invented, and chosen to be noticeable | the one that shipped |
| Repeatable later by anyone | yes — the registry re-runs it | no — the unfixed code is gone once it is committed |
| Shows the case can fail | yes | yes |

**So this is a substitute for one milestone, not a relaxation of the rule.** The moment
`feature/mutation-registry` reaches `main`, every branch cut from it carries the runner and the
reason M-A16 had gives out. Its cases are registered then, like any others. Until then the evidence
sits in `docs/TEST-SPEC-git-integration.md` under M-A16, which records the eighteen and the nine and
names which nine they were.

**What this cost, written down because it is the argument for finishing the registry.** The evidence
above cannot be re-run. Anyone reviewing M-A16 in a month has the number and this paragraph and no
way to reproduce either — which is the difference between a claim and a case, and the difference
this procedure exists to remove.

## Where the rest of it is written

The reasoning, the measured sample and the decisions behind it: `docs/FEATURE-test-mutation.md` and
`docs/TEST-SPEC-test-mutation.md`, on `feature/test-mutation-control`.
