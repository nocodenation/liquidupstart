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

## Where the rest of it is written

The reasoning, the measured sample and the decisions behind it: `docs/FEATURE-test-mutation.md` and
`docs/TEST-SPEC-test-mutation.md`, on `feature/test-mutation-control`.
