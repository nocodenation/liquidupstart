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

### M-A3 — Credentials and remote access

**Structural note, decided while writing these cases.** The success path — cloning a private
repository — cannot be automated. A deploy key only grants access once a human has pasted the public
key into that repository's settings, and that friction is the security property, not an oversight.
So the suite covers everything up to the network boundary and every failure path across it, while
the successful clone becomes a manual case, as A2-5 is. This is the honest split: an automated test
that needed a human to arrange GitHub state first would be red until someone acted, and a suite that
is red for procedural reasons teaches everyone to ignore red.

**Signed off 2026-08-29** — reviewed before implementation. The structural decision above was put to
the operator explicitly, including its consequence that M-A3 is the second milestone after M-A2
whose core is verified by hand, and accepted.

**Carried over from M-A2.** The stack guard becomes a *named* test rather than a bare `beforeAll`:
an aborted `beforeAll` is counted once per file and the tests inside vanish from the total, which
reads as a shrinking count instead of a failure.

| # | Level | Case | Expectation |
|---|---|---|---|
| A3-1 | Unit | The key generation script is run | An ed25519 keypair appears under `volumes/_git-secrets`; the private key is mode 600, the public key is readable |
| A3-2 | Unit | The script is run a second time | The existing key is left untouched — regenerating silently would revoke access the operator has already registered |
| A3-3 | Contract | `known_hosts` is pre-seeded | It contains GitHub's host keys and matches the fingerprints GitHub publishes |
| A3-4 | Contract | The repository is searched for `StrictHostKeyChecking=no` | Absent everywhere. Disabling host key verification would make the pre-seeded `known_hosts` decorative |
| A3-5 | Contract | The secrets directory and the ssh configuration reach the agents | `volumes/_git-secrets` is mounted into all three agent services, and the ssh command they use names both the key and the pre-seeded `known_hosts` |
| A3-6 | Component | The dashboard `git-auth` route is rendered | The public key is shown with copy support; the private key appears nowhere in the response |
| A3-7 | System | `ssh -T git@github.com` from inside both harnesses | Returns GitHub's authenticated-or-denied answer within a bounded time — no host key prompt, no hang |
| A3-8 | System **unhappy** | A key GitHub does not know is used | Fails with `Permission denied (publickey)` inside the time bound, rather than hanging or prompting for a password |
| A3-9 | System **unhappy** | A host absent from `known_hosts` is contacted | Refused rather than silently trusted, and the message says why |
| A3-10 | System **unhappy** | Private key material is searched for outside the secrets directory | It appears in no rendered configuration, no log file and no dashboard response |
| A3-11 | **Manual** | The operator registers the deploy key on `nocodenation/agent-skills`, then an agent is asked to clone it | The repository lands under `/repos`, a `pull` succeeds, and no key material is copied out of the secrets directory. Recorded in the process log |

A3-2 deserves the emphasis it gets. A generation script that overwrites an existing key on every
start would silently break access that the operator had already arranged with GitHub, and the
failure would surface much later as a confusing permission error.

A3-7 to A3-9 all carry a time bound because the characteristic failure of misconfigured SSH is not
an error but a hang: a host key prompt or a password prompt waiting on a terminal that is not there.
A test that waits forever is worse than one that fails.

### M-A3b — addendum forced by the A3-11 failure

A3-11 showed that M-A3's plumbing works and cannot be found from where an agent stands. The agent
tried an HTTPS URL, hit a credential prompt, and — worse — answered from third-party web pages
without saying it had changed sources. This addendum closes both halves in the skill, and is
scheduled before M-A4 because M-A4's guardrails assume agents can reach remotes at all.

**An implementation gap, not an open question.** M-A3 generated **one** key for the whole stack and
named it in `GIT_SSH_COMMAND`, while §2 of the feature document and FR3 both say *one deploy key per
repository*. GitHub refuses the same deploy key on a second repository, so the stack currently
reaches exactly one private repository. The decision was never in doubt; M-A3 simply did not carry
it out, and nothing caught that because there is only one private repository so far. It is closed by
**M-A3c**, not by amending the decision. Note that the limit applies to *private* repositories only:
public ones are reachable over HTTPS with no key at all.

**Signed off 2026-08-30** — reviewed before implementation.

| # | Level | Case | Expectation |
|---|---|---|---|
| A3b-1 | Contract | The skill is searched for the URL form | It states that private repositories of this stack are reached at `git@github.com:owner/repo.git`, and that HTTPS asks for credentials which do not exist here |
| A3b-2 | Contract | The skill is searched for the source rule | It requires reporting a repository that cannot be reached, and forbids answering about it from another source without saying so |
| A3b-3 | System | Both harnesses are asked for the skill text | Both see the added rules, at their own mount paths |
| A3b-4 | **Manual** | The A3-11 prompt is repeated verbatim, in a fresh session | The agent clones over SSH into `/repos`, or reports that it cannot — either is a pass. Answering from a substitute source without saying so is a fail, whatever the answer contains |

A3b-4 is the only case that decides whether the addendum worked. A3b-1 to A3b-3 assert that the
words are present and reachable; they cannot assert that they are followed. That limit is the same
one §2 records for behavioural testing, and A3-11 is the reason it is taken seriously here: the
previous milestone had every automated case green and still failed the only question that mattered.

**Note the deliberate breadth of A3b-4.** A refusal counts as success. The failure being corrected
is not "did not clone" — it is "did not clone, did not say so, and answered anyway".

### M-A3c — declared repositories, their keys, and their clones

The core of the feature as §1.1 describes it. The configuration gains a repository list (FR11), the
start scripts give each declared repository its own key and clone it into the workspace (FR12), and
the dashboard shows one public key per repository to register. It also carries out the credential
decision from §2 that M-A3 did not implement.

The clone-on-start half is what makes U5 — reading a repository — a matter of opening a directory
rather than an errand an agent has to work out. Two milestones went into that errand before the use
cases were written.

**Signed off 2026-08-31** — reviewed before implementation, after the declaration was made
host-agnostic and the branch policy pulled forward at the operator's request.

**Decisions taken while writing these cases**, so they can be challenged rather than discovered
later:

*The list is comma-separated, as the project already does elsewhere, and each entry is a full SSH
URL with two fields after it.* `SYSTEM_DEPENDENCIES` established the comma convention, so the list
follows it:

```
GIT_REPOSITORIES="git@github.com:nocodenation/agent-skills.git|read|protected"
```

*The URL is written out, not abbreviated to `owner/repo`.* An `owner/repo` shorthand would silently
assume github.com and GitHub's two-level naming, which contradicts NFR2 and would not survive the
move to Forgejo that §2 already anticipates. GitLab's nested groups do not fit two levels either.
The full SSH URL costs a few characters and works for any host that speaks git over SSH. It also
states the transport, which matters here: the stack's credentials are SSH-only, and an `https://`
entry is rejected rather than quietly rewritten — silently repairing that is how A3-11's confusion
was created in the first place.

*The separator is `|`, not `:`.* An SSH URL contains a colon of its own (`git@host:path`), so a
colon separator would be ambiguous. A pipe appears in neither URLs nor ref names.

*Branch policy is in from the start*, at the operator's request. The third field says whether the
repository's default branch may be written directly: `protected` means work goes on a feature
branch, `direct` means the default branch may be committed to, as content mode expects. M-A4's hook
reads it; M-A3c only has to parse, store and expose it. This deliberately reverses an earlier
decision to defer it — deferring would have meant M-A4 designing a field that belongs to the
repository declaration.

*A failed clone must not stop the stack.* A declared repository whose key the operator has not yet
registered is the normal state right after adding one. The start reports it and carries on; it does
not hold the whole stack hostage to a GitHub setting.

*Migration is manual, and small.* The single key from M-A3 is registered on `agent-skills`. Per
repository keys are new ones, so the operator registers the new key and may delete the old. There is
no automatic migration, because the script cannot know which repository the legacy key belongs to.

*Selection is automatable; a second repository's access is not.* Proving that two declared
repositories are genuinely both reachable needs a human to register a second deploy key — the same
wall A3-11 hit. So the suite proves that each repository **offers its own key**, which is observable
from the SSH handshake whether or not access is granted, and the reachability of a second repository
is the manual case.

| # | Level | Case | Expectation |
|---|---|---|---|
| A3c-1 | Component | `.env.example` §10 declares `GIT_REPOSITORIES`, parsed by the dashboard's own parser | The key is listed in the section with help text, as A1-1 checks for the identity keys |
| A3c-2 | Unit | The list is parsed: empty, one entry, several, stray whitespace, a nested GitLab-style path, a non-GitHub host | Each yields the expected URL, access and policy; `read`/`write` and `protected`/`direct` are all understood |
| A3c-3 | Unit **unhappy** | Malformed entries: a missing field, an unknown access or policy word, and an `https://` URL | Each rejected with a message naming the entry and what is wrong. The `https://` case says the stack's credentials are SSH-only rather than rewriting the URL |
| A3c-4 | Unit | Key generation over a declared list | One keypair per repository, each in its own directory, private key mode 600; a second run leaves every existing key untouched, as A3-2 requires |
| A3c-5 | Contract | `compose.yml` is searched for a stack-wide key | No `GIT_SSH_COMMAND` names a single key for all remotes any more. It still carries the host-key policy and the timeouts, because those are stack-wide and M-A3's cases rest on them; only the identity moves to each clone |
| A3c-6 | Integration | Start with a declared repository whose key is registered | It is present in the workspace afterwards; a second start neither re-clones it nor disturbs its working tree |
| A3c-7 | Integration **unhappy** | Start with a declared repository whose key is not registered | The start completes, the failure is reported naming that repository, and the workspace simply does not contain it |
| A3c-8 | System | A clone's own configuration | `core.sshCommand` in its `.git/config` names that repository's key, and the URL stays the plain `git@github.com:owner/repo.git` form |
| A3c-9 | System | Two declared repositories, each with its own key | Each offers **its own** key to GitHub — observable in the SSH handshake — so selection is proven without needing both to be registered |
| A3c-10 | Unit | Two declared repositories whose last path segment is the same, from different hosts | Distinct key directories and distinct clone directories, or a legible refusal — never one silently overwriting the other |
| A3c-11 | Contract | The `insteadOf` rewrites | One per declared repository, and no global rewrite of `https://github.com/` anywhere, which would break public repositories |
| A3c-12 | Component | The dashboard route with several repositories declared | One public key per repository, each labelled with the repository it belongs to; no private key in the response |
| A3c-13 | **Manual** | An agent is asked about a declared repository | It answers from the clone in the workspace. It does not fetch, does not ask about URLs, and does not go to the network — because U5 is now reading a directory |

**Corrected during implementation, recorded rather than absorbed.**

*A3-5 is amended, not broken.* Its second case required `GIT_SSH_COMMAND` to name the key, which is
exactly what A3c-5 removes. The test now requires what remains stack-wide — the mount, the
pre-seeded `known_hosts`, host key checking — plus the per-clone identity, and carries an `Amended:`
line saying why. Nothing else in M-A3 changed.

*Git lets the environment beat the clone.* `GIT_SSH_COMMAND` overrides `core.sshCommand`, so a
stack-wide environment variable would have silently discarded every per-repository key inside the
containers while the host-side clone worked perfectly — the milestone would have passed its own
cases and delivered nothing. The stack-wide command therefore keeps the policy and defers the
identity: it appends `-i` from `liquidupstart.identity`, a value each clone declares for itself.
A3c-9 asserts this twice per repository: once with the clone's own command, once with the command
`compose.yml` ships, so the shipped value is proven rather than assumed.

*The clone path is tested through an ssh stand-in.* A successful clone needs a registered deploy
key, which is the wall §5 records for M-A3. A3c-6, A3c-7 and A3c-11 therefore clone local seed
repositories through an `ssh` stand-in on `PATH`, proving the machinery — including that a second
start leaves a working tree alone and that a refusal is survived — without needing GitHub state.
A3c-9 still crosses the real network, because only a real handshake shows which key is offered.

*The manifest is the interface to the dashboard.* The start script writes what it actually produced
to `volumes/_git-secrets/repositories.json`; the route reads that rather than parsing the
declaration again in TypeScript.

A3c-13 is the case that decides whether the re-cut was right. If an agent still goes looking for the
repository on the network when a clone of it is sitting in the workspace, then pre-cloning did not
remove the problem and M-A3d becomes necessary rather than optional.

A3c-2 and A3c-3 carry the host-agnostic claim. Neither needs a second host to exist: parsing a
Forgejo-shaped and a GitLab-shaped entry proves the declaration does not assume GitHub, which is all
that can be proven before such a host is actually in use.

A3c-7 deserves its emphasis. Adding a repository to the list and registering its key are two
separate acts by a human, and the gap between them is a normal state, not an error. A start that
failed there would make the stack unusable for as long as that gap lasts.

### M-A3d — making the workspace discoverable

Three manual observations have now failed the same way. A3-11 and A3b-4 went to the network; A3c-13,
with the repository already cloned into `/repos`, searched the agent's own home directory instead
and never looked there. Each time the git skill held the answer and was never opened.

The skill's trigger enumerates domain verbs — version, commit, branch, track changes — while the
other nine skills in the directory enumerate what a user actually says: "make me a table", "list
tickets", "what files are in the system". Nobody asks an agent to *version* something; they ask what
is in a repository. That sentence matches nothing in the trigger.

**Two changes, and the second is the cheap insurance.** The description gains read-side occasions in
the vocabulary a user would use. It also gains the workspace path itself — `/repos` — so that the
catalogue entry alone locates the workspace even when the skill is never opened. A description is
read by the model in order to decide whether to open the skill; putting the one fact that matters
into that sentence costs nothing and does not depend on the decision going the right way.

**Where an answer may live.** Not in `config/agents/instructions.md`, obvious though it looks: it
reaches OpenCode by a mount and OpenClaw's `claude-cli` backend by a copy, while OpenClaw on an
OpenAI model — the configuration all three failures happened under — receives neither. The skill
reaches all three; A2-5 ran on `openai/gpt-5.4` and the agent read the skill and followed it.

**Signed off 2026-08-31** — reviewed before implementation.

**Decided before implementing, so a fourth failure is not re-litigated.** If A3d-5 fails again, the
conclusion is that a skill does not reliably carry this use case, and locating a repository becomes
something the operator states in the prompt. It would not then be retried with further wording.

| # | Level | Case | Expectation |
|---|---|---|---|
| A3d-1 | Contract | The description is searched for read-side occasions | It names fetching, cloning and looking inside a repository, in the vocabulary a user would use, alongside the versioning occasions it already carries |
| A3d-2 | Contract | The description is searched for the workspace path | `/repos` appears in the description itself, not only in the body, so the catalogue entry locates the workspace without the skill being opened |
| A3d-3 | Contract | The skill body is unchanged | Every rule from M-A2 and M-A3b is still present — this milestone touches the description only, and a regression here would be invisible otherwise |
| A3d-4 | System | Both harnesses see the new description | Identical in each, at its own mount path |
| A3d-5 | **Manual** | A fresh session is asked, verbatim: **“Which skills are in the agent-skills repository?”** — named as a repository, its location not given | The agent answers from `/repos/agent-skills` and names all three: `nifi`, `webdb`, `pdf-sign`. Saying plainly that it cannot find it is also a pass. Answering from elsewhere, or listing the stack's own installed skills, is a fail |

A3d-1 to A3d-4 can only assert that words are present and reachable as text. Whether the description
causes the skill to open is a model decision, and A3d-5 is the only case that measures it.

**The prompt is sharpened, deliberately.** A3c-13 asked "What skills does agent-skills contain?",
which reads just as well as "the skills of the agent" — and that is roughly what came back. Naming
it as a repository removes that ambiguity without revealing the location, which is the thing under
test.

### M-A4 to M-B2 — outlines

Detailed cases are written at the start of each milestone's cycle, because they depend on decisions
that milestone has not made yet. What is already fixed:

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

Verified by the operator on 2026-08-29; output in PR #9, together with the A2-5 observation.

**A reporting subtlety the negative control exposed.** With `opencode` stopped the run reports "Ran 7 tests across 4 files", 5 pass and 2 fail — not 10. `beforeAll(() => requireStack())` throws in the two files that need the stack, Bun counts that as one failure per *file*, and the five tests inside them never run and drop out of the count silently. The outcome is right (EXIT=1, and the message names the missing container) but the presentation is poor: the failure shows as `(unnamed)`, and a reviewer reading only the totals could mistake a shrinking count for a different problem. From M-A3 onwards the stack guard should be a named test rather than a bare `beforeAll`, so that a missing stack reads as a named failure instead of a gap.

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

### M-A3 — credentials and remote access

Verified by the operator on 2026-08-29; output in PR #9. The negative control confirms the fix
carried over from M-A2: with a container stopped the run reports "Ran 24 tests across 7 files" with
four *named* failures, where M-A2 had collapsed to "Ran 7 tests across 4 files" with `(unnamed)`
failures and five tests vanishing from the count. None of these commands
print private key material, and none should be changed so that they do.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: 24 pass, 0 fail, EXIT=0
./tests/run.sh m-a3; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. Reaching GitHub by hand from inside a harness, bypassing the suite.
#    git is driven rather than ssh: only git reads GIT_SSH_COMMAND, so a bare
#    ssh call would test the container's default configuration instead of the
#    one this milestone installs.
#    Expect: commit hashes within seconds once the deploy key is registered,
#    or "Permission denied (publickey)" before that. Neither a host key prompt
#    nor a hang is acceptable.
docker compose exec -T openclaw-gateway sh -lc 'cd /tmp && timeout 20 git ls-remote git@github.com:nocodenation/agent-skills.git | head -2'; echo "EXIT=$?"

# 3b. The same repository over HTTPS, to show why A3-11 failed.
#     Expect: "could not read Username" -- the credentials are SSH-only, and
#     nothing yet tells an agent which URL form to use.
docker compose exec -T openclaw-gateway sh -lc 'cd /tmp && timeout 20 git ls-remote https://github.com/nocodenation/agent-skills.git 2>&1 | head -2'; echo "EXIT=$?"

# 4. The private key stays where it belongs. Expect: mode 600, and no copy
#    anywhere else in the workspace or the rendered configuration.
docker compose exec -T openclaw-gateway sh -lc 'ls -l /git-secrets/ | grep -v total'
grep -rl 'BEGIN OPENSSH PRIVATE KEY' volumes/repos config 2>/dev/null; echo "matches above (none expected)"

# 5. Negative control: are the system tests real?
#    Expect EXIT=1 naming the stopped container, then EXIT=0 once it is back.
docker compose stop opencode
./tests/run.sh m-a3; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a3; echo "EXIT=$?"
```

**A3-11 was carried out on 2026-08-29 and failed** — the agent never reached the repository and
answered from third-party web pages instead, incompletely. The full record is in the feature
document's appendix. The automated cases all passed and none of them could have caught it, because
each has the SSH URL written into it.

**A3-11 is manual and has no command here**, because it depends on GitHub state only a human can
arrange. Register the public key from the dashboard's `git-auth` page as a deploy key on
`nocodenation/agent-skills`, then ask an agent — without naming the path or the skill — to fetch that
repository and look at it. The expected observation: the clone lands under `/repos`, a `pull`
afterwards succeeds, the agent does not copy the key anywhere, and it does not attempt a push.
Record what actually happened, a partial result included.

### M-A3b — skill addendum

To be run after implementation; the pass count is filled in once known.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The addendum suite. Expect: 0 fail, EXIT=0
./tests/run.sh m-a3b; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. The added rules by hand, from inside both harnesses, bypassing the suite.
#    Expect: the SSH URL form and the source rule in each.
docker compose exec -T openclaw-gateway sh -lc 'grep -c "git@github.com" ~/.claude/skills/git/SKILL.md'
docker compose exec -T opencode sh -lc 'grep -c "git@github.com" ~/.config/opencode/skills/git/SKILL.md'

# 4. Negative control: are the system tests real?
#    Expect EXIT=1 with named failures, then EXIT=0 once the container is back.
docker compose stop opencode
./tests/run.sh m-a3b; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a3b; echo "EXIT=$?"
```

**A3b-4 is manual and repeats A3-11 verbatim**, in a fresh session so the earlier failure is not in
context: *"Fetch the nocodenation/agent-skills repository and tell me what skills it contains."* The
repository contains three skills — `nifi`, `webdb` and `pdf-sign` — which is the yardstick for a
complete answer. A clone into `/repos` over SSH is a pass. An explicit "I cannot reach it" is also a
pass. An answer assembled from elsewhere without saying so is a fail, however plausible it reads.

### M-A3c — declared repositories, their keys, and their clones

To be run after implementation; the pass count is filled in once known. None of these commands print
private key material.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: 0 fail, EXIT=0
./tests/run.sh m-a3c; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. What the stack was told to work with, and what it produced.
#    Expect: one key directory per declared repository, private keys mode 600.
grep '^GIT_REPOSITORIES=' .env.example
ls -l volumes/_git-secrets/*/ | grep -v '^total'

# 4. The declared repository is simply there, bypassing the suite.
#    Expect: a working tree, and a remote in the plain git@github.com: form.
docker compose exec -T openclaw-gateway sh -lc 'ls /repos/ && cd /repos/agent-skills && git remote -v && git log --oneline -1'

# 5. Each clone selects its own key. Expect: core.sshCommand naming a key
#    under that repository's own directory.
docker compose exec -T openclaw-gateway sh -lc 'cd /repos/agent-skills && git config --local core.sshCommand'

# 6. Negative control: are the system tests real?
#    Expect EXIT=1 with named failures, then EXIT=0 once the container is back.
docker compose stop opencode
./tests/run.sh m-a3c; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a3c; echo "EXIT=$?"
```

**A3c-13 is manual.** In a fresh session, ask about a repository the stack has already cloned —
*"What skills does agent-skills contain?"* — without naming `/repos` or the skill. The three skills
are `nifi`, `webdb` and `pdf-sign`. A pass is an answer drawn from the clone. Going to the network,
asking about URLs, or answering from a catalogue is a fail, and would mean pre-cloning did not remove
the problem after all.

### M-A3d — making the workspace discoverable

Verified by the operator on 2026-08-31; output in PR #9. The negative control still reports the full
count with named failures — 8 pass and 3 fail of 11 — where M-A2 had collapsed to a smaller number.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: 11 pass, 0 fail, EXIT=0
./tests/run.sh m-a3d; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. What the catalogue entry alone says, bypassing the suite.
#    Expect: read-side wording and the workspace path, in one sentence.
sed -n '/^description:/p' config/agents/skills/git/SKILL.md

# 4. The same, as the harnesses see it.
docker compose exec -T openclaw-gateway sh -lc 'sed -n "/^description:/p" ~/.claude/skills/git/SKILL.md'
docker compose exec -T opencode sh -lc 'sed -n "/^description:/p" ~/.config/opencode/skills/git/SKILL.md'

# 5. Negative control: are the system tests real?
#    Expect EXIT=1 with named failures, then EXIT=0 once the container is back.
docker compose stop opencode
./tests/run.sh m-a3d; echo "EXIT=$?"
docker compose start opencode
./tests/run.sh m-a3d; echo "EXIT=$?"
```

**A3d-5 was carried out on 2026-08-31 and passed** — the agent went straight to
`/repos/agent-skills` and named all three skills, citing the repository's own README. Full record in
the feature document's appendix.

**A3d-5 is manual.** In a fresh session, and after a `docker compose exec proxy nginx -s reload` if
any container was recreated: *"Which skills are in the agent-skills repository?"* The repository is
named as a repository; its location is not. The clone sits at `/repos/agent-skills` and holds
`nifi`, `webdb` and `pdf-sign`. Listing the stack's own installed skills instead is the failure
A3c-13 produced and is what this is watching for.

