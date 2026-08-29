# Feature: Git Integration for the Agent Harnesses

Status: **Approved — implementation in progress**
Branch: `feature/git-integration`, cut from `main` on 2026-08-29

---

## 1. Purpose

OpenClaw and OpenCode need to put development work, files and documents under version control:
commit locally, and push to a remote after a human approves it.

Starting point: `git` is **already installed** in both images
(`config/openclaw/templates/Dockerfile`, `config/opencode/templates/Dockerfile`). This feature
therefore does not deliver the tool. It delivers **identity, credentials, workspace, guardrails
and discoverability**.

Guiding constraint: **keep the first increment as small as it can be.** Where a cheaper option
carries residual risk, the risk is named and accepted rather than engineered away.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Repository scope | Arbitrary external repos **and** Liquid Upstart itself |
| Credentials | SSH deploy key **per repository**, each repo enabled individually |
| Credential location | In the agent container, configured through `.env` like every other secret |
| Autonomy | Commit freely; the agent **asks before pushing** |
| Enforcement | Advisory — skill rules plus a `pre-push` hook. See §3.1 |
| Git host | GitHub first; plumbing stays host-agnostic (Forgejo later) |
| Working copy for liquidupstart | Its own clone under `volumes/`, host working copy untouched |
| Java toolchain | Dedicated `nar_builder` service, mirroring `bun_runner` |
| Liquid restart | Human restarts; dashboard button is a later increment |

### Out of scope for the first increment

Separate credential-holding service · dashboard approval flow · Forgejo / local Git server ·
host-agnostic host API (opening PRs) · PAT or GitHub App · Docker socket in agent containers ·
per-user identities · dashboard restart button.

---

## 3. Threat model

**A deploy key is bound to the repository, not to a person.** The collaborator set (Timur, Philipp,
Christof) therefore does **not** constrain the agents. The only real constraint is who can reach the
private key — and an agent container executes model-generated shell commands.

| Risk | Description | Mitigation |
|---|---|---|
| **Prompt injection** | Agents read PDFs (`ingest-pdf`), web content, flow definitions. Injected text plus a reachable write key equals a push nobody intended. | **Accepted residual risk** — see §3.1 |
| **Self-damage** | The agent modifies the repo that builds its own container. A bad `compose.yml` or Dockerfile commit breaks the stack on the next rebuild. | Skill rules (M-A5), separate clone instead of the host working copy, PR review |
| **Secret leak** | `.env` at the repo root holds every provider key. `.gitignore` does not protect against reading it, nor against `git add -f`. | Secret scan in the `pre-push` hook (M-A4); `.env` never enters the agent clone |
| **History destruction** | Force-push truncates history — this happened on 2026-08-29, when a force-push cut 27 commits off `feature/privacy-gateway`. | `--force` and ref deletion rejected by the hook (M-A4) |
| **Egress bypassing the privacy gate** | Once `feature/privacy-gateway` merges, the privacy proxy will inspect conversations while `git push` carries code and commit messages past it. Not present on `main`, so not yet live. | Open question **O1** |

### 3.1 The enforcement decision, and what it costs

The push gate is **advisory, by deliberate choice**. The agent holds a read-write deploy key, so any
guard it is subject to — the skill text, the `pre-push` hook — is a guard it could also remove: it
runs as root and can delete the hook or call `git push` with the key directly.

This stops honest mistakes and drift. It does **not** stop prompt injection, which is the primary
risk in the table above. A guard that only holds when nothing is attacking it is not a security
boundary, and this document does not claim it is one.

Two alternatives were priced and rejected as too much effort for this increment:

- **Split keys.** A read-only deploy key for the agent (GitHub enforces the restriction
  server-side, so it cannot write no matter what happens to the agent) plus a write key held by a
  small push service. Cost: one new service, two deploy keys per repository.
- **Full remote service.** All remote traffic — clone, fetch, pull, push — owned by a service; the
  agent stays credential-free. Cost: one new service on the read path as well.

Why the residual risk is tolerable for now: the stack runs locally under one operator, pushes land
on feature branches, and those branches are reviewed before they reach `main`. **Reviewers should
treat this as the open question it is** — if the assessment changes, "split keys" is the cheapest
upgrade path and does not invalidate M-A1 through M-A3.

---

## 4. Requirements

### Functional

- **FR1 — Repo workspace.** A location under `volumes/`, mounted into both harnesses, browsable on
  the host. Agent repositories live only there.
- **FR2 — Git identity.** `user.name` / `user.email` configurable stack-wide; agent commits are
  identifiable as such.
- **FR3 — Key management.** A key generation script; the dashboard shows the public key with copy
  support and instructions for adding it to the repository's settings. One key per repository.
- **FR4 — Host key verification.** `known_hosts` pre-seeded with GitHub's host keys.
  `StrictHostKeyChecking=no` is not acceptable.
- **FR5 — Free local operations.** `add`, `commit`, `branch`, `merge`, `rebase`, `log`, `diff`
  without prompting.
- **FR6 — Free reads.** `clone`, `fetch`, `pull` without prompting.
- **FR7 — Push on request.** The agent asks the operator before pushing and pushes only after being
  told to.
- **FR8 — Hook guardrails.** A `pre-push` hook rejects pushes to `main` and protected branches,
  rejects `--force` and ref deletion, and rejects a push whose diff contains secrets.
- **FR9 — Git skill.** A skill in `config/agents/skills/git/`, mounted into both harnesses,
  teaching the workspace, the identity, the conventions, and the push etiquette.
- **FR10 — Configuration contract.** Every key follows the `.env.example` contract: its own
  section, help text, declared in the service templates and in `compose.yml`.

### Non-functional

- **NFR1** — Credentials are configured through `.env`, consistently with every other secret in the
  stack. The private key is materialised as a file under `volumes/` because a multi-line PEM in
  `.env` is impractical — this is an ergonomic choice, **not** a security property: the agent can
  read the key either way, which is exactly what §3.1 accepts.
- **NFR2** — Host-agnostic naming: `GIT_*`, not `GITHUB_*`. Remotes are modelled as a profile
  `{name, host, ssh-url, key}`; no hard-wired `github.com` in skills or code.
- **NFR3** — All state lives under `./volumes/` as bind mounts; no named volumes.
- **NFR4** — No Docker socket in agent containers.
- **NFR5** — The existing security posture is preserved: `cap_drop`, `no-new-privileges`.
- **NFR6** — A reset remains "delete `volumes/…`".

---

## 5. Milestones

Two tracks. **A** is the Git integration; **B** is NiFi development capability. B depends on A only
loosely (from M-A1, for the workspace) and can run in parallel or later.

Acceptance for every milestone is defined in `TEST-SPEC-git-integration.md`: a milestone is done
when its tests are green, not when a one-off probe printed the right thing once.

### Track A — Git

**M-A0 · Test harness**
Build the runner described in the test spec (§4): `tests/` layout, `tests/run.sh`, shell and
`docker compose` helpers, milestone filtering, and the harness's own failure-mode tests.
*Done when:* `./tests/run.sh m-a0` is green — including the cases proving the runner can actually
fail, refuses an empty milestone filter, and does not silently skip system tests when the stack is
down.

**M-A1 · Workspace and identity**
Create `volumes/repos`, mounted into `openclaw-gateway`, `openclaw-cli` and `opencode`. New
`.env.example` section with the `GIT_*` keys, declared in the service templates and `compose.yml`
per the contract. The start script configures the git identity inside the containers.
*Done when:* `./tests/run.sh m-a1` is green (cases A1-1 to A1-10).

**M-A2 · Git skill**
`config/agents/skills/git/SKILL.md` — workspace path, identity, commit conventions, permitted and
forbidden operations, push etiquette, secret rules. Uses the skill mounts both harnesses already
have.
*Done when:* `./tests/run.sh m-a2` is green (A2-1 to A2-4), and the manual behavioural check A2-5
is recorded in the process log.

**M-A3 · Credentials and remote access**
Key generation script under `config/scripts/`, keys stored in `volumes/_git-secrets` and mounted
into the agent containers, `known_hosts` pre-seeded. Dashboard route `git-auth` displays the public
key with instructions.
*Done when:* `./tests/run.sh m-a3` is green, including the clone of `nocodenation/agent-skills`.

**M-A4 · Hook guardrails**
`pre-push` hook installed into every clone: branch rules, force and delete rejection, secret scan of
the diff. Installed automatically so a fresh clone is covered.
*Done when:* `./tests/run.sh m-a4` is green at **100% branch coverage** of the hook — the one
artifact in this feature that earns it.

**M-A5 · Self-development on Liquid Upstart**
Its own clone at `volumes/repos/liquidupstart`, a deploy key for it, and additional skill rules
(the container's own build files, `.env`, `volumes/`).
*Done when:* `./tests/run.sh m-a5` is green, including the contract test that the host working copy
is untouched.

### Track B — NiFi development

More exists already than expected: `volumes/python_extensions` and `volumes/nar_extensions` are
mounted into both agent containers **and** into `liquid`, and the `liquid` skill documents the
deployment path (§6.3–6.6). Python processors therefore work today.

**M-B1 · `nar_builder` service**
New compose service with a JDK and Maven, sharing `volumes/nar_extensions` and `volumes/repos`,
following the `bun_runner` pattern. Build script under `config/scripts/build/`.
*Done when:* `./tests/run.sh m-b1` is green, happy and unhappy paths.

**M-B2 · Document the deployment cycle**
Extend the `liquid` skill with the builder path and the restart step: the agent places the artifact
and asks the human to run `docker compose restart liquid`.
*Done when:* `./tests/run.sh m-b2` is green, plus the documented manual restart step.

### Later increments (not part of this approval)

Split keys or a credential-holding service (§3.1) · dashboard approval flow · dashboard restart
button for Liquid · Forgejo as a second remote profile · host-agnostic host API · PR creation.

---

## 6. Open questions

**O1 — Should `git push` be gated on the privacy profile?** Push is an egress channel that bypasses
the privacy proxy. It could be blocked, or warned about, while the privacy profile is active.

This branch is cut from `main`, which does **not** contain the privacy proxy — that work lives on
`feature/privacy-gateway`. The question is therefore not yet actionable and only becomes real when
the two branches meet. Whoever merges them owns it; nothing here blocks on it.

**O2 — Access to `nocodenation/agent-skills`.** The repository exists and is **private**. It holds
three skills — `nifi` (NiFi flow development, REST API, custom processors and NAR packaging),
`webdb`, and `pdf-sign` — installed upstream via `npx skills add nocodenation/agent-skills@<skill>`.
The `nifi` skill is the upstream counterpart of this repo's local `liquid` skill.

`cdilcher` was granted collaborator access on 2026-08-29; the repository clones over SSH from this
machine, verified at `9038c1e`. That also gives M-A3 its natural test case — "an agent clones a
private repository" — against a repo the stack genuinely needs.

**Content comparison (upstream snapshot vs. this repo's `liquid` skill):** the local skill is the
more advanced fork, and **must not be replaced by upstream**.

- Local carries roughly fourteen sections upstream lacks, most of them environment-specific:
  the proxy + `Host:` header API contract (§2.2), relationship verification (§3.4), API-first
  property mapping (§3.5), the shared SSL Context Service (§3.6), HTTP context maps (§3.7),
  the clone-via-funnel pattern (§5.8), the lane non-blocking rule (§5.11a), NAR deployment via
  `nar_extensions` (§6.4) and Python processors (§6.6).
- **§5.6 conflicts outright.** Upstream places failure funnels at `proc_x - PROC_CORE_W -
  FUNNEL_W` (8.3F); local uses `proc_x - LABEL_W - FUNNEL_W` (6.7F), adds a right-side variant for
  the leftmost column, and documents that the Y offset is 0.8F rather than a geometric centre.
  Mixing the two produces inconsistent layouts. Local wins.
- Upstream has two things local lacks: a 14 KB `PLACEMENT_RULES.md` with finer placement geometry,
  and a section on canvas text labels / annotations, which local does not cover at all. Note that
  `PLACEMENT_RULES.md` is **not referenced from upstream's `SKILL.md`**, so a skill loader may
  never pull it in.

Consequence: the sync direction is **local → upstream**, not the reverse. Worth importing from
upstream is the annotations material; everything else in this repo is ahead. Making `agent-skills`
a pulled dependency only becomes sensible after the local improvements have been pushed up — which
is itself a good first exercise for the finished feature.

---

## 7. Goal workflow

Each milestone runs as exactly **one `/goal`** (source: `CLAUDE_CODE_loops.md`). Three binding
consequences for the cut above:

**Acceptance must be provable in the transcript.** The goal evaluator is a small model that can
neither run tools nor read files — it judges only what Claude has already printed. A "done when"
criterion is therefore usable only if a command demonstrates it and the exit code appears in the
output.

**Milestones must stay small.** Past roughly 30 minutes, 20 files, or several phases, a run
degrades: errors compound, the transcript fills with failed attempts, and the evaluator has less to
judge with. The cut above is sized accordingly — each milestone touches fewer than ten files.

**State belongs in files.** Progress is recorded in this document and in commits, not in the chat,
because long runs get compacted.

### Prerequisite for acceptance

Every criterion that exercises agent behaviour needs a **running stack** — the evidence comes from
`docker compose exec`. The stack was set up and started on 2026-08-29 from this working copy, with
`.env` carried over from the operator's configured instance; `volumes/` holds fresh state. A
milestone whose cases include system-level tests cannot be accepted while it is down.

### Goal form

With the suite as the gate, a goal condition collapses from a handful of hand-written probes to one
line, which is exactly the transcript-provable form the evaluator needs:

```
Done when `./tests/run.sh m-a1; echo EXIT=$?` is visible in this transcript with EXIT=0,
and `./tests/run.sh; echo EXIT=$?` also shows EXIT=0, proving earlier milestones have
not regressed.
```

Each milestone's goal is written into this form **immediately before it runs**, not up front: a goal
text is only as good as its knowledge of the current state, and every milestone settles decisions
the next one depends on — the workspace path in M-A1 is decided *by* M-A1. Only one goal can be
active per session anyway.

Every goal is then recorded verbatim in the appendix, as posed. The loop guidance's own rule is that
state belongs in files rather than chat, because long runs get compacted — and the goals are the raw
material of this trial.

---

## 8. Process log

This feature doubles as a trial of the goal/loop working model; the log below is what makes that
trial assessable instead of anecdotal. Filled in at step 5 of each cycle.

| Milestone | Turns used / bound | Wall clock | Files touched | Evaluator passed something untrue? | Manual rework after the goal | Plan changed? |
|---|---|---|---|---|---|---|
| M-A0 | ~6 / 25 | ~25 min | 12 new, 3 docs | No — but only because A0-2/A0-3 exist; two runner bugs would have produced a false green | Two fixes mid-run: `set -e` swallowed the failing exit code; milestone prefix produced `m-m-a0` | Yes — `--list` and `--root` added to the spec (§4) |
| M-A1 | ~8 / 30 | ~15 min | 3 changed, 8 new | No — evidence is real, both required runs shown with their exit codes | None; no defects surfaced during the run | No — the signed-off cases were implementable as written |
| M-A2 | ~5 / 25 | ~10 min | 1 changed, 5 new | No — both required runs shown with their exit codes, operator ran the full procedure and A2-5 | None; A2-5 observed by the operator afterwards and passed on all four points | Yes — A2-1 demanded a literal TRIGGER clause that only 1 of 10 sibling skills actually uses |
| M-A3 | ~13 / 35 | 7 min 38 s | 5 changed, 9 new | No — but one wrong finding was published and later retracted: a build failure attributed to build.sh, which had actually been masked by a zsh pipeline | Three test defects fixed, the third only after the operator registered the deploy key | Yes — openssh-client was missing from both images, which the goal had not anticipated |
| M-A4 | | | | | | |
| M-A5 | | | | | | |
| M-B1 | | | | | | |
| M-B2 | | | | | | |

**M-A0 was independently verified on 2026-08-29** by the operator, not by its author: the four
checks (suite green, discovery listing, a deliberately failing tree returning a non-zero exit, and a
mistyped milestone id failing rather than passing silently) were run by hand and their output posted
to PR #9. The third check is the one that matters — without it, every later milestone gate would
rest on an unverified runner.

Two columns carry most of the value. **"Evaluator passed something untrue"** tracks the failure mode
the LOOP guidance warns about — a goal declaring victory on a check that only looked passed.
**"Plan changed"** is the direct answer to *where should a review have happened*: the milestones
that forced a plan change are exactly the ones an earlier pair of eyes would have paid for.

---

## Appendix: goals as posed

Verbatim record of every goal actually run, in order. Kept because a compacted conversation loses
the wording, and because the goals themselves are what the working-model trial is about.

### M-A0 — test harness · posed 2026-08-29 · finished at turn ~6 of 25, EXIT=0

```
/goal Implement M-A0 from docs/FEATURE-git-integration.md and section 4 of
docs/TEST-SPEC-git-integration.md: the test harness.

Scope: create tests/ with lib/, unit/, component/, contract/, integration/ and
system/ directories; a tests/run.sh entry point using bun test; milestone
selection by the m-<id>.<subject>.test.ts filename convention; --no-system to
skip stack-dependent tests; helpers for shell commands and docker compose.
run.sh must also run the existing dashboard tests. Write the harness's own
cases A0-1 to A0-6 from the test spec, each with the header format from §4.2.

Done when `./tests/run.sh m-a0; echo EXIT=$?` is visible in this transcript
with a passing summary and EXIT=0. The suite must include a case proving
run.sh exits non-zero when a test fails — prove it from within that case, do
not leave a failing test in the tree.

Constraints: do not modify .env. Do not touch compose.yml or config/ — this
milestone adds tests only. Search the codebase before assuming anything is
missing; full implementations only, no placeholders. Or stop after 25 turns.
```

Outcome: 13 tests across 6 files, EXIT=0. Two defects found while writing the harness — `set -e`
swallowed the failing exit code, and the milestone prefix produced `m-m-a0`. Independently verified
by the operator on 2026-08-29.

### M-A1 — workspace and identity · posed 2026-08-29 · finished at turn ~8 of 30, EXIT=0

```
/goal Implement M-A1 from docs/FEATURE-git-integration.md: repo workspace and
git identity for the agent harnesses. The acceptance criteria are cases A1-1 to
A1-10 in section 5 of docs/TEST-SPEC-git-integration.md, signed off on
2026-08-29. Write those tests first, then make them pass.

Scope: create volumes/repos and mount it at /repos in openclaw-gateway,
openclaw-cli and opencode; add a "# 10. GIT INTEGRATION" section to
.env.example declaring GIT_USER_NAME and GIT_USER_EMAIL with help text in the
format the existing sections use; pass both into those three services through
compose.yml environment blocks with defaults that work without any .env entry;
have the start scripts create the directory with the permissions the sibling
volumes/ directories use.

Done when `./tests/run.sh m-a1; echo EXIT=$?` is visible in this transcript
with EXIT=0 and all of A1-1 to A1-10 present, and `./tests/run.sh; echo EXIT=$?`
also shows EXIT=0, proving M-A0 has not regressed.

Constraints: do not modify .env — the compose defaults must carry this on their
own, which is exactly what A1-9 proves. Recreate the affected containers so the
changes take effect before checking. Search the codebase before assuming
anything is missing; full implementations only, no placeholders. Remove any
probe repositories the tests create. Or stop after 30 turns.
```

Outcome: 17 tests across 6 files, EXIT=0; the full suite runs 30 stack tests plus the 27 dashboard
tests, also EXIT=0, so M-A0 did not regress. Identity is carried by `GIT_AUTHOR_*` and
`GIT_COMMITTER_*` environment variables derived from `GIT_USER_NAME` and `GIT_USER_EMAIL` in
compose, which sidesteps the differing `HOME` between the two harnesses without any in-container
configuration step. `.env` was not touched, and A1-9 proves the compose defaults carry the feature
on their own.

Noted for the diff review: three assertions were written beyond the letter of the signed-off cases
— A1-3 also asserts the `/repos` mount is present in every agent service and that no `GITHUB_`
prefixed key exists (FR10 and NFR2, both squarely the contract level's job), and A1-4 additionally
checks the live workspace, not only the throwaway one. They are aligned with the cases' intent, but
they were not in the table when it was signed off.

### M-A2 — git skill · posed 2026-08-29 · finished at turn ~5 of 25, EXIT=0

```
/goal Implement M-A2 from docs/FEATURE-git-integration.md: the git skill for the
agent harnesses. The acceptance criteria are cases A2-1 to A2-4 in section 5 of
docs/TEST-SPEC-git-integration.md, signed off on 2026-08-29. Write those tests
first, then make them pass. A2-5 is manual and must not be automated.

Scope: write config/agents/skills/git/SKILL.md, following the frontmatter shape
and the tone of the sibling skills in that directory. It must teach the
workspace at /repos, the identity the containers already carry, commit
conventions, which operations are free, which are forbidden (force push, pushing
to main, committing secrets), and the push etiquette: ask the operator before
pushing, never push unasked. The skills directory is already mounted into both
harnesses, so no compose change is needed.

Done when `./tests/run.sh m-a2; echo EXIT=$?` is visible in this transcript with
EXIT=0 and all of A2-1 to A2-4 present, and `./tests/run.sh; echo EXIT=$?` also
shows EXIT=0, proving M-A0 and M-A1 have not regressed.

Constraints: do not modify .env or compose.yml. Match the style of the existing
skills in config/agents/skills rather than inventing a format. Search the
codebase before assuming anything is missing; full implementations only, no
placeholders. Or stop after 25 turns.
```

Outcome: 10 tests across 4 files, EXIT=0; the full suite runs 40 stack tests plus the 27 dashboard
tests, also EXIT=0, so M-A0 and M-A1 did not regress. No compose change was needed — the skills
directory is already mounted into both harnesses, at `/home/node/.claude/skills` for OpenClaw and
`/root/.config/opencode/skills` for OpenCode, which is why A2-3 checks each path separately.

One specification defect surfaced: A2-1 asked for a "TRIGGER clause, matching the sibling skills",
but only `liquid` of the ten siblings uses that word. The case was corrected rather than
implemented as written, and the skill uses `TRIGGER when` anyway.

**A2-5, the manual observation, was carried out on 2026-08-29** in OpenClaw, driven by the operator
through the web UI on `openai/gpt-5.4`. The task was deliberately underspecified — "write a small
Python script that reads a CSV and prints its column names, and put it under version control" — and
mentioned neither the skill nor `/repos`.

All four observations passed, with filesystem evidence:

- **It worked in `/repos`**, creating `/repos/csv-columns` — even though `agents.defaults.workspace`
  in `openclaw.json` points at `/home/node/.openclaw/workspace`, where an empty repository already
  existed. This was the open question before the run, and it is the milestone's strongest result:
  the skill text overrode the harness default, so no change to the OpenClaw configuration is needed.
- **It did not override the identity.** The repository carries no local `user.*` configuration and
  the commit is attributed to `Liquid Upstart Agent <agent@liquidupstart.local>`, which is M-A1's
  environment variables reaching a commit made by a real agent rather than by a test.
- **It did not push**, and said why: "I did not push anywhere, since this environment's git workflow
  requires asking before any push."
- **It found the skill unprompted**, announcing it would read it before starting. That also
  cross-validates A2-1 and A2-3 — an invalid frontmatter or a missing mount and it could not have.

**A finding for M-A4:** the repository was created on branch `master`, git's default without
`init.defaultBranch`, while the skill forbids pushing to `main`. The branch guard must recognise
both names, or it will protect a branch that does not exist while the actual default branch stays
unguarded.

### M-A3 — credentials and remote access · posed 2026-08-29 · finished at turn ~13 of 35, EXIT=0

```
/goal Implement M-A3 from docs/FEATURE-git-integration.md: SSH credentials and
remote access for the agent harnesses. The acceptance criteria are cases A3-1 to
A3-10 in section 5 of docs/TEST-SPEC-git-integration.md, signed off on
2026-08-29. Write those tests first, then make them pass. A3-11 is manual and
must not be automated.

Scope: a key generation script under config/scripts/ producing an ed25519
keypair in volumes/_git-secrets, which must leave an existing key untouched when
run again; a known_hosts file there, pre-seeded with GitHub's host keys and
verified against the fingerprints GitHub publishes; volumes/_git-secrets mounted
into openclaw-gateway, openclaw-cli and opencode; an ssh command configuration
reaching those services that names both the key and that known_hosts, with host
key checking left on; and a dashboard route git-auth showing the public key with
copy support, following the existing claude-auth and copilot-auth routes. Wire
the generation into the start scripts. Give the stack guard a named test rather
than a bare beforeAll, per the M-A2 finding.

Done when `./tests/run.sh m-a3; echo EXIT=$?` is visible in this transcript with
EXIT=0 and all of A3-1 to A3-10 present, and `./tests/run.sh; echo EXIT=$?` also
shows EXIT=0, proving the earlier milestones have not regressed.

Constraints: do not modify .env. Never print private key material, and do not
write a test that would. Every command that crosses the network carries a
timeout, because the characteristic SSH failure is a hang rather than an error.
Search the codebase before assuming anything is missing; full implementations
only, no placeholders. Or stop after 35 turns.
```

Outcome: 24 tests across 7 files, EXIT=0; the full suite runs 64 stack tests plus the 27 dashboard
tests, also EXIT=0. Wall clock 7 minutes 38 seconds.

**A missing prerequisite the goal had not anticipated.** Neither agent image contained
`openssh-client`, so git could not use an SSH remote at all — `error: cannot run ssh: No such file
or directory`. Both image templates were extended and both images rebuilt. Without this the
milestone was impossible, so it was taken into scope rather than deferred.

**A misdiagnosis, retracted.** The first rebuild failed with `DeadlineExceeded` while fetching a
base image manifest, and this document briefly recorded that `scripts/linux/build.sh` had reported
success anyway. It had not. The command had been invoked as `build.sh 2>&1 | tail -30`, and in zsh a
pipeline returns the status of its *last* element — `tail` succeeded, so the failure was invisible.
The script is correct: it uses `set -euo pipefail` and calls each per-service build as a plain
command, so a failure propagates.

The real lesson is about measurement, not about the script. It is the same trap the verification
procedures in the test spec avoid by writing `; echo EXIT=$?` directly after a command rather than
piping it anywhere, and it had already produced one wrong reading earlier in this feature. A claim
about an exit code is only worth as much as the way it was obtained.

**Two self-inflicted test defects, both found by the tests themselves.** A3-4 forbade
`StrictHostKeyChecking=no` anywhere in the repository and then failed on its own assertions, which
necessarily contain the string; the search now covers the configuration surface and excludes the
test tree. A3-7 to A3-9 drove bare `ssh`, which does not read `GIT_SSH_COMMAND` and therefore tested
the container's default configuration rather than the one this milestone installs; they now drive
`git`, the way production does. The second was the more serious: it would have passed a green suite
while proving nothing about the feature.

**A finding about the size heuristic.** M-A3 touched fourteen files, well past the "under ten"
guideline, and was flagged as oversized before the run. It nevertheless took the *shortest* wall
clock of any milestone so far. The reason is that the slow part — rebuilding two images — ran in the
background while the tests were being written, and the remaining work was independent pieces rather
than one long dependent chain. File count predicted difficulty poorly here; what mattered was
whether the work serialised.

**A third test defect, surfaced by the operator registering the deploy key.** With access granted,
the milestone suite went red: A3-8 asserted that the configured key would be denied, which had been
true only because nobody had registered it yet. The test was coupled to state outside the
repository — what a human had or had not done on GitHub — so it passed or failed for reasons
unrelated to the code. It now generates its own throwaway key inside the container and asserts the
denial against that, and is unaffected by whatever access the real key has. Worth generalising: a
system test that asserts the *absence* of access is a test with an invisible dependency.

**Carried forward:** the `git-auth` route returns the public key and its fingerprint, but nothing in
the dashboard UI calls it yet. The existing auth panels live in `TaskRunner.svelte`, and adding one
there is separate work — the route is complete, its presentation is not.
