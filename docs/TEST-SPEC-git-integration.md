# Test Specification: Git Integration

Companion to `FEATURE-git-integration.md`. Defines how each milestone is proven done.
Status: **draft for review**

---

## 1. Why tests are the gate

A milestone is complete when its tests are green — not when a one-off probe command printed the
right thing once. The difference matters because these milestones build on each other: M-A3 edits
the `compose.yml` that M-A1 set up, and M-A4 installs hooks into the clones M-A3 creates. Throwaway
probes cannot catch a later milestone silently breaking an earlier one. An accumulating suite can,
and that regression protection is the point.

This also sharpens the goal condition. Instead of four hand-written probe commands, a milestone's
`/goal` reads:

```
Done when `./tests/run.sh m-a1` prints PASS and exits 0.
```

which is exactly the transcript-provable form the loop evaluator needs. The caveat from the loop
guidance still applies: the evaluator reads the transcript, it does not re-run anything. A printed
`PASS` is evidence, not proof — which is why the runner must be trustworthy (§4.1).

---

## 2. Adopted rules, and where they are adapted

Philipp's commandments for AI development are adopted as project rules (recorded in `CLAUDE.md`),
with two deliberate adaptations.

**Adopted as written:** specify first; document use cases; document data structures and APIs; stick
to the specification and raise issues rather than silently deviating; document every implemented
feature in its own Markdown file; cover happy *and* unhappy cases; document every test in a
human-readable header; test at unit, component, integration and system level.

**Adapted — coverage.** "100% coverage, cover all branches" is written for application code. This
feature is roughly ninety percent configuration, shell and Markdown: volume mounts, an
`.env.example` section, a skill document, a few lines of start script. Branch coverage of a YAML
mount is a category error, and demanding it produces ceremony rather than safety. The rule is
therefore applied **where it bites**, declared per milestone in §6. Exactly one artifact in this
feature earns full branch coverage: the `pre-push` hook in M-A4, which has real decision logic with
real unhappy paths.

**Adapted — behavioural tests.** Whether an agent *follows* a skill is model behaviour: it is
non-deterministic and cannot be asserted without flakiness. Automating it would poison the suite
with intermittent failures and train everyone to ignore red. Such checks are specified as
**documented manual acceptance steps** instead, with the expected observation written down so the
result is still recorded rather than felt.

---

## 3. Test levels

| Level | Definition here | Needs a running stack |
|---|---|---|
| **Unit** | One function or script in isolation, no Docker, no network | No |
| **Component** | One artifact against a real but isolated dependency — e.g. the new `.env.example` section parsed by the dashboard's own env parser | No |
| **Contract** | An assertion that a declaration appears in every place the configuration contract requires | No |
| **Integration** | Several parts together on the host — start script, rendered config, directory state | No |
| **System** | The running stack, driven through `docker compose exec` | Yes |

The **contract** level is not in Philipp's list but is added deliberately: the project's own
`.env.example` contract ("a start script injects a key only if the service template declares it") is
the rule most easily broken by an edit that looks harmless. The privacy-proxy branch already
established this pattern in `test_env_contract.py`, including deliberately position-dependent
parsing as a tripwire. FR10 is enforced this way.

---

## 4. Harness (built by M-A0)

**Runner: `bun test`.** The project already uses it for the dashboard (`bun test src`, 27 tests
across 2 files), so this adds no toolchain. Tests are TypeScript, which gives real header
documentation, and Bun can drive shell commands and `docker compose` for the integration and
system levels.

```
tests/
  lib/          helpers: sh(), compose(), stackUp(), fixture loading
  unit/
  component/
  contract/
  integration/
  system/
  run.sh        entry point
```

Dashboard tests stay where they are; `run.sh` runs both so one command covers the repository.

```bash
./tests/run.sh              # everything, dashboard suite included
./tests/run.sh m-a1         # one milestone (bare `a1` also accepted)
./tests/run.sh --no-system  # skip everything needing the stack
./tests/run.sh --list       # print what would run, run nothing
./tests/run.sh --dashboard  # dashboard suite only
./tests/run.sh --root DIR   # discover under DIR instead of tests/
```

Milestone selection is by filename convention: `m-a1.<subject>.test.ts`.

**Deviation from the first draft, recorded per the "raise issues" rule.** `--list` and `--root` were
not in the original design and were added during M-A0 because the harness's own tests could not be
written without them: a test that verifies "run.sh discovers files" by executing a full run would
recurse into itself, and "system tests only, with --no-system" cannot be staged against the real
tree while no system tests exist yet. `--root` lets those cases run against a throwaway fixture
tree; `--list` separates discovery from execution. Both are needed by any later milestone that
wants to assert runner behaviour.

### 4.1 The runner must be able to fail

A runner that reports green because nothing ran is worse than no runner, so M-A0's own tests assert
the negative cases: a deliberately failing fixture test makes `run.sh` exit non-zero; a milestone
filter matching no files is an error, not a pass; and with the stack down, system tests fail fast
with a clear message instead of being silently skipped.

### 4.2 Test header format

Every test file opens with a block that a human can read without opening the implementation.

```ts
/**
 * M-A1 · Integration · The workspace mount round-trips to the host
 *
 * Purpose:  Prove that a repository an agent creates inside the container is
 *           visible and browsable on the host, as FR1 requires.
 * Given:    The stack is running and volumes/repos exists.
 * When:     A git repository is initialised at /repos inside openclaw-gateway.
 * Then:     volumes/repos/<name>/.git/HEAD exists on the host.
 * Covers:   FR1, NFR3
 * Unhappy:  Host directory removed while the container runs — see sibling test.
 */
```

`Covers:` feeds the traceability matrix in §7.

---

## 5. Detailed test cases

### M-A0 — Harness

| # | Level | Case | Expectation |
|---|---|---|---|
| A0-1 | Unit | `run.sh --list` discovers files across level directories | Exit 0, every file listed |
| A0-2 | Unit | A fixture test that deliberately fails | `run.sh` exits non-zero |
| A0-3 | Unit | Milestone filter matching no file | Exit non-zero with "no tests matched" |
| A0-4 | Unit | `--no-system` with only system tests present | Exit 0, reports "skipped", never "passed" |
| A0-5 | Integration | System-level helper with the stack down | Fails fast, message names the missing stack |
| A0-6 | Integration | Dashboard tests still run via `run.sh` | The existing suite executes with at least one pass and no failures |

### M-A1 — Workspace and identity

**Signed off 2026-08-29** — reviewed before implementation, per step 2 of the per-milestone cycle.
Four points were put to the operator and confirmed: M-A1 must work with no entry in `.env` at all,
so A1-9 stands as written; A1-10 is kept as documentation of a non-guarantee rather than dropped as
noise; coupling A1-1 and A1-2 to the dashboard's own env parser is accepted; and the two adaptations
in §2 stand.

| # | Level | Case | Expectation |
|---|---|---|---|
| A1-1 | Component | `.env.example` §10 parsed by `parseExample` | Section recognised, `GIT_USER_NAME` and `GIT_USER_EMAIL` listed with help text |
| A1-2 | Component | `sectionModeFromTitle` on the new section title | Mode `normal` — the section is shown in the dashboard |
| A1-3 | Contract | Each `GIT_*` key present in `.env.example` **and** in the `compose.yml` environment block of all three services | Missing anywhere → fail, naming the place |
| A1-4 | Integration | Start script run twice | `volumes/repos` exists with the same permissions as the sibling volume dirs; second run is a no-op, not an error |
| A1-5 | Integration | `volumes/repos` deleted, start script re-run | Directory recreated |
| A1-6 | System | `git init` + `commit` at `/repos` in `openclaw-gateway` | Exit 0; author and committer match the configured identity |
| A1-7 | System | Same in `opencode` | Identical identity, despite `HOME` differing (`/home/node` vs `/root`) |
| A1-8 | System | Host sees the repository | `volumes/repos/<name>/.git/HEAD` readable on the host |
| A1-9 | System **unhappy** | `GIT_USER_NAME` absent from `.env` | Commit still succeeds using the compose default — proves the feature does not depend on editing `.env` |
| A1-10 | System **unhappy** | Write to a path outside `/repos`, e.g. `/` | Not asserted as blocked; documents that M-A1 adds no confinement, so nobody later mistakes it for one |

A1-7 is the case worth keeping in view: the two harnesses have different `HOME`, so an identity
mechanism based on `git config --global` must run per container, while one based on `GIT_AUTHOR_*`
and `GIT_COMMITTER_*` environment variables sidesteps the difference. The test asserts the outcome
and lets the implementation choose.

### M-A2 — Git skill

**Signed off 2026-08-29** — reviewed before implementation. Two cases were corrected during the
review rather than after: A2-4 as originally written required removing a mount from a running
container, which is not possible without rebuilding the stack mid-suite, so it now tests the
guard's error message against a path that cannot exist — the same shape as A0-5. A2-2's description
was overstating what it does and has been made literal.

**Corrected during implementation.** A2-1 originally demanded a "TRIGGER clause, matching the
sibling skills". Only one of the ten sibling skills (`liquid`) uses that literal word: four say
"Use whenever" and five carry no such clause at all, so requiring it verbatim would have encoded an
outlier as the convention. The case now asks for a trigger clause in either accepted phrasing. The
skill itself uses `TRIGGER when`, which satisfies the strictest reading as well.

| # | Level | Case | Expectation |
|---|---|---|---|
| A2-1 | Unit | `SKILL.md` frontmatter | Frontmatter parses, `name` matches the directory, and the description carries a clause saying when to use the skill (`TRIGGER when` or `Use whenever`) |
| A2-2 | Contract | Skill text still contains its load-bearing terms | The workspace path, the forbidden operations and the push etiquette each appear literally. This is a presence check, not a judgement of whether the rules are good or complete: it catches the file being thinned out or a rule being dropped, and nothing beyond that |
| A2-3 | System | Skill file visible inside both harnesses | Readable at the skill mount paths in `openclaw-gateway` and `opencode` |
| A2-4 | Integration **unhappy** | The skill guard is given a mount path that cannot exist | It fails with a message naming the missing path, rather than passing or hanging — the shape A0-5 uses for the stack guard, because a mount cannot be removed from a running container mid-suite |
| A2-5 | **Manual** | An agent asked to commit work follows the skill | Documented observation: uses `/repos`, does not push unasked. Recorded in the process log, not automated — see §2 |

### M-A3 to M-B2 — outlines

Detailed cases are written at the start of each milestone's cycle, because they depend on decisions
that milestone has not made yet. What is already fixed:

**M-A3 — Credentials and remote access.** Unit: key generation produces a valid keypair with correct
permissions, and is idempotent. Contract: `known_hosts` contains GitHub's host keys; no
`StrictHostKeyChecking=no` anywhere in the repository. System: clone `nocodenation/agent-skills` (a
genuinely private repository the stack needs) into the workspace, then pull. Unhappy: wrong key,
unknown host key, network unreachable — each must fail with a legible message rather than hang.

**M-A4 — Hook guardrails.** This is where full branch coverage applies. Unit, all paths: protected
branch rejected; feature branch allowed; `--force` rejected; ref deletion rejected; diff containing
`.env` rejected; diff containing key material rejected; clean diff allowed. System: the hook is
present in a freshly created clone, not only where it was installed by hand.

**M-A5 — Self-development.** System: commit to a Liquid Upstart feature branch inside the workspace
clone. Contract: the host working copy at `/Users/christof/repos/liquidupstart` is untouched.
Unhappy: an attempt to commit `.env` is rejected by M-A4's hook.

**M-B1 — `nar_builder`.** Integration: Java sources in the workspace produce a NAR in
`nar_extensions`. Unhappy: a source that does not compile fails the build with the compiler error
surfaced, and leaves no partial artifact.

**M-B2 — Deployment cycle.** System: a built NAR is present in Liquid's load path after restart.
The restart itself stays manual, so this is a two-part check with a documented manual step.

---

## 6. Coverage policy per milestone

| Milestone | Level of rigour | Rationale |
|---|---|---|
| M-A0 | Full, including the runner's own failure modes | Everything downstream trusts it |
| M-A1 | Contract + integration + system; no unit tests | Nothing here is a unit |
| M-A2 | Structural only; behaviour is a manual step | Model behaviour cannot be asserted deterministically |
| M-A3 | Unit for the key script; system for the remote path | Script has logic; the rest is I/O |
| **M-A4** | **100% branch coverage** | The only real decision logic, and it is the guardrail |
| M-A5 | System + contract | Configuration and rules |
| M-B1 | Integration, happy and unhappy | A build either produces the artifact or does not |
| M-B2 | System, with a documented manual restart | Restart is deliberately human |

---

## 7. Traceability

Filled in as tests are written; a requirement with no test is a gap, and the gap is visible here.

| Requirement | Covered by |
|---|---|
| FR1 Repo workspace | A1-4, A1-8 |
| FR2 Git identity | A1-6, A1-7, A1-9 |
| FR3 Key management | M-A3 |
| FR4 Host key verification | M-A3 |
| FR5 Free local operations | A1-6 |
| FR6 Free reads | M-A3 |
| FR7 Push on request | A2-5 (manual), M-A4 |
| FR8 Hook guardrails | M-A4 |
| FR9 Git skill | A2-1, A2-2, A2-3 |
| FR10 Configuration contract | A1-3 |
| NFR1 Credentials via `.env` | A1-9 |
| NFR2 Host-agnostic naming | A1-3, M-A3 |
| NFR3 State under `volumes/` | A1-8 |
| NFR4 No Docker socket | Contract test: `docker.sock` absent from `compose.yml` |
| NFR5 Security posture | Contract test: `cap_drop` and `no-new-privileges` still present |
| NFR6 Reset by deleting `volumes/` | M-A5 |

NFR4 and NFR5 get contract tests of their own precisely because nothing in the feature would
otherwise notice if a later edit removed them.

---

## 8. Decisions taken

All four points originally raised here have been settled; they are kept as a record rather than
deleted, because the reasoning is what a later reviewer needs.

1. **`bun test` is the single runner.** `bats` would be idiomatic for the shell parts but adds a
   dependency. Settled by building M-A0 on Bun and verifying it.
2. **A2-5 stays a manual, recorded step.** The alternative is an automated behavioural test that
   will be flaky, and a flaky suite trains everyone to ignore red.
3. **A1-10 is kept as documentation.** It asserts nothing about confinement because there is none;
   writing the non-guarantee down stops a later reader mistaking a missing check for a guarantee.
4. **M-A0 stood as its own milestone.** It cost one cycle and its process-log row measures the
   harness rather than the feature — accepted deliberately, and it paid for itself by catching two
   runner defects before any milestone depended on them.

---

## 9. Independent verification

A green suite reported by whoever wrote it is weak evidence. Each milestone therefore also has a
short procedure the **operator** runs by hand, and whose output is posted to the pull request. The
procedures are recorded here rather than only in those comments, so a later reader can re-run them
without archaeology.

Two kinds of check earn their place. One **bypasses the suite entirely** and exercises the feature
directly, which catches a suite that measures the wrong thing. The other is a **negative control**
that proves the tests can fail — for system tests, that they genuinely touch the running stack
rather than passing regardless.

### M-A0 — harness

```bash
cd /Users/christof/repos/liquidupstart

# 1. The suite runs. Expect: 13 pass, 0 fail, EXIT=0
./tests/run.sh m-a0; echo "EXIT=$?"

# 2. What actually runs. Expect: 6 files
./tests/run.sh --list

# 3. Negative control -- does the runner notice a real failure? Expect: EXIT=1
D=$(mktemp -d); mkdir -p "$D/unit"
printf "import { test, expect } from 'bun:test';\ntest('x', () => expect(1).toBe(2));\n" > "$D/unit/m-x.probe.test.ts"
./tests/run.sh --root "$D"; echo "EXIT=$?"; rm -rf "$D"

# 4. A mistyped milestone id must fail, not pass silently. Expect: EXIT=2
./tests/run.sh m-a9; echo "EXIT=$?"
```

Verified by the operator on 2026-08-29; output in PR #9. Check 3 is the one that matters: without
it, every later milestone gate would rest on an unverified runner.

### M-A1 — workspace and identity

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: 17 pass, 0 fail, EXIT=0
./tests/run.sh m-a1; echo "EXIT=$?"

# 2. No regression -- M-A0 must stay green.
#    Expect: 30 stack tests plus 27 dashboard tests, EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. The feature by hand, bypassing the suite. Expect:
#    "Liquid Upstart Agent <agent@liquidupstart.local>" twice,
#    then "a.txt" and "hallo" -- the commit is on the host.
docker compose exec -T openclaw-gateway sh -lc 'cd /repos && rm -rf handcheck && git init -q handcheck && cd handcheck && echo hallo > a.txt && git add a.txt && git -c core.pager=cat commit -q -m "hand check" && git log -1 --format="%an <%ae> / %cn <%ce>"'
ls volumes/repos/handcheck/ && cat volumes/repos/handcheck/a.txt
rm -rf volumes/repos/handcheck

# 4. Works with no entry in .env -- that is the claim of A1-9. Expect: 0
grep -c '^GIT_' .env

# 5. Negative control: are the system tests real?
#    Expect EXIT=1 with "stack not running: container(s) opencode are not up",
#    then EXIT=0 again once the container is back.
docker compose stop opencode
./tests/run.sh m-a1; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a1; echo "EXIT=$?"
```

Verified by the operator on 2026-08-29; output in PR #9. Check 5 answers the question every system
test raises: does it touch the stack at all, or would it pass just as happily with nothing running?

### M-A2 — git skill

Verified by the operator on 2026-08-29; output in PR #9.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: 10 pass, 0 fail, EXIT=0
./tests/run.sh m-a2; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. The skill by hand, bypassing the suite -- read it from inside both
#    harnesses. Expect: the frontmatter name line in each.
docker compose exec -T openclaw-gateway sh -lc 'head -4 ~/.claude/skills/git/SKILL.md'
docker compose exec -T opencode sh -lc 'head -4 ~/.config/opencode/skills/git/SKILL.md'

# 4. Negative control: are the system tests real?
#    Expect EXIT=1 naming the stopped container, then EXIT=0 once it is back.
docker compose stop opencode
./tests/run.sh m-a2; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a2; echo "EXIT=$?"
```

**A2-5 is manual and has no command.** Ask an agent in either harness to put some work under version
control and observe what it does. The expected observation: it works inside `/repos`, it does not
push, and it does not invent a location of its own. Record what actually happened in the process
log — including a partial or wrong result, which is the outcome worth knowing about.

Carried out 2026-08-29 on `openai/gpt-5.4`; passed on all four points. The evidence is filesystem
state, not the agent's own account of itself: the repository under `volumes/repos/`, the absence of
a local `user.*` override, and the absence of any configured remote. Full record in the feature
document's appendix.

