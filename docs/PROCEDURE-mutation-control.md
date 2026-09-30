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

**`"all": true`** says every occurrence of `from` is meant, and only then is a second one allowed. It
is a declaration rather than a loosening: the reason a second occurrence is usually a mistake is that
the author had one site in mind, and this is where they say otherwise. A3c-8 needs it — the same mount
line appears in `compose.yml` once per agent service, and the case requires all three. Without it, a
`from` occurring twice is refused and the message names the flag.

**`"exempt": "<reason>"`** registers a decision instead of a mutation: this case cannot have one, and
here is why.

```json
{ "case": "A3-3", "exempt": "it reads volumes/_git-secrets/known_hosts, written days ago by a keyscan" }
```

The line §6 draws is what the assertion is about. Decision logic needs a mutation. An assertion about
an artefact that already exists on disk cannot have one, because changing the code that produced the
file does not change the file. An exempt entry carries nothing else — an entry holding both is an
error, not an exemption, because silently honouring one of them is how a mutation stops running with
nobody deciding that. `--gaps` counts exemptions separately and prints each with its reason, since the
reason is the only thing a reader can disagree with.

**The run is bounded.** `--timeout` is bun's per-test limit; `MUTATE_RUN_BUDGET_MS` (five minutes by
default) bounds the whole spec run. A mutation that turns a loop condition into `while (true) {}` never
yields, so no per-test timeout can end it, and an async hang came back **validated** because bun
reddened the test and the run carried on. A run the budget had to stop is **refused**: it did not
finish, so it measured nothing. The subject is restored either way.

## The four outcomes, and why there are four

| | |
|---|---|
| **validated** | the named test failed and at least one test still passed |
| **failed** | the named test passed — the entry does not protect what it claims |
| **refused** | the mutation could not be applied, **every** test failed — a broken file rather than a control — or the run did not finish inside its budget |
| **unresolved** | nothing went red at all |

There is a fifth line in the tally, **exempt**, and it is not an outcome: nothing was run. It is
counted and printed so a reader can tell "no mutation was possible here, for this stated reason" from
"no entry exists".

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

## How the runner came to be shaped this way

**Moved here from `tests/mutate.sh` on 2026-09-23**, on point 8 of the review of 2026-09-22. The
test applied: *does the comment change what the next edit to those lines may do?* If yes it stays in
the file; if it is how we came to know, it belongs here. The script keeps the rule and a pointer;
this section keeps the account. Comment lines in the runner went from 111 to 67.

### The wire format

Entries reach the loop as tab-separated records, and `from`/`to` travel base64-encoded because a
mutation may legitimately span lines — the first version refused any value carrying a newline, which
made a multi-line mutation impossible, and a rule spanning two lines is exactly the kind worth
breaking. Found by MU-5, whose fixture empties a whole file.

**Every field carries a leading dot.** Tab is IFS whitespace and bash collapses a run of it into one
delimiter, so an empty `to` — a deletion mutation, the most natural shape there is — shifted every
later field left by one. `must` became empty, and an empty needle matches any failing line, so the
entry read VALIDATED over a mutation that had tested nothing. Finding 1 of 2026-09-22; MU-19 holds
it.

### What the 2026-09-19 sample measured

Ten entries written and validated by hand. **A green run read as "no case protects this rule" four
times out of thirteen and was wrong every time** — the mutation was too narrow, landed at the wrong
site, or replaced one of two occurrences. That is why a green run is `unresolved` rather than a
finding, and why it needs a second mutation of a different shape before anybody concludes anything.

### Things the first real run found about bun

**bun names a test on the line only when it FAILS.** Passing ones appear solely in the tally at the
end, so the first version counted `(pass)` lines, found zero survivors for every entry, and
classified each one as a broken file.

**And the name has to be matched as a whole.** The `mustFail` needle was searched inside the
`(fail)` line, so a sibling whose name merely contained it stood in for the named test —
`field A is carried` satisfied by `field A is carried on restart` while the named test stayed green.
Finding 4 of 2026-09-22.

**A tally of zero and zero is not silence.** bun absent, bun crashing, a filter matching no file, or
a spec the mutation broke at load time all produce it, and the runner read it as "nothing went red"
and exited 0. Finding 2 of 2026-09-22.

### The survivor rule, and where it does not apply

A mutation that reddens every test in a file has broken the file rather than controlled it. But a
file holding a **single** test reddens entirely when that test reddens, so the rule would refuse
every honest entry against it — found while backfilling A4-6, whose spec has exactly one test.

### Restoring, and what a trap does not do by itself

`EXIT` alone is not enough: bash runs an `INT` handler and then carries on. That is how
`tests/verify/m-b2.sh` promised restoration on Ctrl-C and never delivered it. Each signal restores
and then exits.

**And the backup has to exist before the mutation does.** There is no `set -e` in the runner on
purpose, so a failed `mktemp` left the backup path empty, `cp` failed, the subject was recorded
anyway — and `restore()` requires a backup, so the operator's tracked file stayed mutated with
nothing to put back. Finding 5 of 2026-09-22.

**The backup takes an explicit `mktemp` template.** A bare `mktemp` on macOS ignores `TMPDIR`, which
put the backup where no case could look — so MU-6, which asserts the backup is cleaned up, passed
whether or not the cleanup ran. Deleting `rm -f "$BACKUP"` left it green. Item 6 of 2026-09-22, and
it could not be fixed in the case alone.

### The subject may not be an assertion, and the rule is not a prefix

A tool that can rewrite the tests can make anything pass. The first version matched the literal
prefix `tests/`, which was wrong in both directions: `./tests/…`, `tests/../tests/…` and
`dashboard/src/*.test.ts` — the suite `CLAUDE.md` runs with `bun test src` — walked straight past it,
while `tests/run.sh`, a subject in its own right, was refused as though it were an assertion. A0-4
was the entry that surfaced the second half. Finding 3 of 2026-09-22.

### The empty registry

Four zeros and exit 0 is indistinguishable from a healthy run — the exact shape this tool exists to
remove. It was written into MU-2's block as a hazard and then shipped anyway, and found on the first
run against a main-based branch whose registry is legitimately empty.

## Where the tool is not, and what stands in for it

**Decided 2026-09-22, on M-A16.** The rule is that a case without a registered mutation blocks its
milestone. It was taken while the tool was needed nowhere yet, and the first milestone to meet it could
not obey it: the runner lived on two feature branches, and M-A16 was built on a third that carried
neither. Branches do not see each other, so the rule was unreachable rather than skipped. Putting the
runner on `main` -- which is what this branch is for -- is what ends that.

**What stood in for it there: the same question, asked against the real defect.** A mutation invents a
fault and requires the case to notice. M-A16's cases were run against the code as it stood *before*
each finding was repaired -- the fault the reviewer actually found, not one made up to resemble it. Of
the **27 tests** those cases carried on 2026-09-22, **18 failed and 9 passed**, and the 9 are the
positive counterparts and the tier's own control, which have to hold on both sides or they are not
counterparts.

*Corrected 2026-09-30.* This said "M-A16's twenty cases ... eighteen failed and nine passed", which
adds up to 27 and therefore counted tests while naming cases. A reviewer noticed. There are 20 cases
and they carried 27 tests then; the files carry 40 now, the later ones from the two reviews that
followed.

That is stricter than a mutation on the point that matters, and weaker on one that does not:

| | A mutation | A run against the unfixed code |
|---|---|---|
| The fault | invented, and chosen to be noticeable | the one that shipped |
| Repeatable later by anyone | yes -- the registry re-runs it | no -- the unfixed code is gone once it is committed |
| Shows the case can fail | yes | yes |

**So it was a substitute for one milestone, not a relaxation of the rule.** Once this branch reaches
`main`, every branch cut from it carries the runner and the reason M-A16 had gives out; its cases are
registered then, like any others. The evidence for the walk sits under M-A16 in
`docs/TEST-SPEC-git-integration.md`, which records the 18 and the 9 and names which 9 they were -- that
file arrives on `main` with the git integration, so until both are merged it is reachable only on that
branch. Said here because a pointer to a file the reader cannot open is worse than no pointer.

**What it cost, written down because it is the argument for finishing the registry.** That evidence
cannot be re-run. Anyone reviewing M-A16 in a month has the number and this paragraph and no way to
reproduce either -- which is the difference between a claim and a case, and the difference this
procedure exists to remove.

## Where the rest of it is written

The reasoning, the measured sample and the decisions behind it: `docs/FEATURE-test-mutation.md` and
`docs/TEST-SPEC-test-mutation.md`, on `feature/test-mutation-control`.
