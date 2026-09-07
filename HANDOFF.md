# Handover — 2026-09-07

Read this first. It is the map and the current state; the specifications are the six documents in
`docs/`. Everything here was true at the end of 2026-09-06.

## What is being built

**Three features and two repairs**, on five branches.

**The git integration** (#9) gives the agent harnesses OpenClaw and OpenCode version control:
repositories declared in the configuration, cloned into a shared workspace, each with its own deploy
key, guardrails on what an agent may push, and one sanctioned command through which work leaves the
stack. The operator's own words for the need are in §1.1 of `docs/FEATURE-git-integration.md`.

**The Java extensions** (#10) let an agent write a NiFi processor and get it into Liquid. They
*consume* the git integration and contribute nothing back to it, which is why they have their own
documents since 2026-09-03.

**The OpenClaw 2026.9.1 migration** (#13) moves the stack off the version #11 pinned it to, and makes
the version something the stack reads rather than assumes. Started and largely finished on
2026-09-06.

**The two repairs** are #11 (the pin, after a floating tag moved) and #12 (`bun_runner`'s health
check, which asked whether the runner had been used rather than whether it works).

All of it doubles as a **trial of test-driven AI development** — the working method is under
evaluation alongside the code, by developers and by people from the business. That is why the
documentation is heavier than the features alone would justify, and why failures are recorded rather
than tidied away.

## Where things live

| File | What it is |
|---|---|
| `docs/FEATURE-git-integration.md` | Use cases, working modes, permission model, requirements, milestones, process log, every goal as posed |
| `docs/TEST-SPEC-git-integration.md` | Every git case: overview row plus detail block, and the verification procedure per milestone |
| `docs/FEATURE-liquid-java-extensions.md` | The same, for the Java extensions. Numbering continues from the git document — U9, FR21 upward |
| `docs/TEST-SPEC-liquid-java-extensions.md` | The Java cases |
| `docs/FEATURE-openclaw-2026-9-1.md` | The migration analysis, in the three-part view: how each part worked, what changed, what had to be adapted |
| `docs/TEST-SPEC-openclaw-2026-9-1.md` | 31 migration cases, OC-1 to OC-31 |
| `docs/PROCEDURE-baseline-cold-start.md` | OC-BASE, the cold start that established the 2026.7.1 baseline |
| `docs/verification/` | The records, with the raw transcripts. Promoted from `.pr-drafts/` when finished |
| `CLAUDE.md` § Development rules | The commandments this project works to |
| `BACKLOG.md` | What was deliberately deferred, each with why. **Exists only on the feature branches** |
| `.pr-drafts/` | Scratch. Untracked, and **not gitignored on the `main`-based branches** — stage by name, never `git add -A` |

**Documents live on the branch they belong to.** `docs/` does not exist on `main` at all. The
migration documents are on `feature/openclaw-2026-9-1`; the git and Java documents on their own
branches.

## The five branches, and how they relate

| Branch | PR | Base | Holds |
|---|---|---|---|
| `feature/git-integration` | **#9** (draft) | `main` | M-A0 to M-A7 |
| `feature/liquid-java-extensions` | **#10** (draft) | `feature/git-integration` | M-B1 to M-B3 |
| `fix/openclaw-2026-9-1` | **#11** | `main` | The pin to 2026.7.1 |
| `fix/bun-runner-health` | **#12** | `main` | One line: the health check |
| `feature/openclaw-2026-9-1` | **#13** | `fix/openclaw-2026-9-1` | The migration, with #12 merged |

Cutting a branch from another is how each PR shows only its own diff. GitHub retargets a stacked PR
by itself once its base lands, so **Timur can review the four in any order and nothing waits.**

**#9 must be merged with a merge commit, not squashed.** GitHub retargets #10 by itself, but only
cleanly if the commits it already carries survive — and the individual messages are part of what this
work exists to demonstrate.

**#10 is 28 commits behind #9.** It is being reviewed against a stale base. The merge-forward is due
and is the first step of the Suite 2 work below.

## One working copy, one stack

`docker compose` reads the `compose.yml` of the checkout at the moment `start.sh` runs, so the
containers keep the mounts, services and images **that branch** declared, no matter what is checked
out afterwards. This cost time three times on 2026-09-05.

**After switching to a branch whose `compose.yml` differs, run `./scripts/linux/start.sh` before
trusting a test run.** One line tells the two shapes apart:

```bash
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'
```

Silence means the running stack predates the git integration, and the red tests describe the
containers rather than the code.

## State

**The stack runs OpenClaw 2026.9.1.** Every service running, zero restarts, every healthcheck green.
Control UI answering 200 with no pairing prompt, configuration valid, Claude CLI 2.1.263, and a full
agent turn verified end to end through the subscription route.

**The git integration is complete.** M-A0 to M-A7 built, each verified independently and posted to
#9. All four manual cases observed, including the three that failed.

**The Java extensions:** M-B1 and M-B2 built and verified. **M-B3 is specified and not built.**

**The migration:** 42 automated cases pass. Open: OC-3, OC-16, OC-20, and the whole of Suite 2.

### Things on disk that matter

`/Users/christof/repos/liquidupstart-backups/` — **outside the repository on purpose**, because the
root `./cleanup.sh` deletes `volumes/` wholesale and a backup kept inside it dies with the original:

| | |
|---|---|
| `.env.bak` | The 252-line configuration. `cleanup.sh` deletes `.env` too |
| `_git-secrets.bak` | The deploy keys registered with GitHub for both declared repositories |
| `_openclaw-claude.bak` | A Claude Code login (stale — see below) |
| `_openclaw.bak-2026.7.1` | The state the 2026-09-05 baseline left. **This is what OC-28 replays** |
| `_openclaw.working-2026.9.1` | The migrated state, before the upgrade test replayed it |
| `digests-{before,after}.txt` | Registry digests of every image, so a later difference can be told from an upstream move |
| `pr-drafts-2026-09-05/` | The scratch directory before its records were promoted into `docs/verification/` |

`volumes/repos/csv-columns` is a leftover from the A2-5 observation. **Leave it**: A4-16 uses it as a
clone the feature did not create.

### The Claude login expires, twice a day so far

The operator had to sign in interactively twice on 2026-09-06. `.env` carries no
`CLAUDE_CODE_OAUTH_TOKEN`, so the login lives only in `volumes/_openclaw-claude` and does not survive
a reset. A long-lived token via `openclaw-claude setup-token` would be stabler — **and is still the
subscription, not an API key.** Not decided; it is an operating choice, not part of the migration.

## How work proceeds

The cycle is in §7 of `docs/FEATURE-git-integration.md`. In short: write the test cases → **the
operator reviews and signs them off before anything is built** → write the goal → run it **in a fresh
session** → check the evidence is really in the transcript → review the diff against what the cases
meant → update the documents and the process log.

**Execution runs in a fresh session; design and review do not.** The best decisions came out of an
accumulating conversation; executing them is better served by a clean context and the documents.

**A task outside the goal mechanism writes its result to a file**, not only to the chat. A result
that exists only in a transcript has to be carried by hand, and that is where it is lost.

## What the failures taught

**Assert the property, not the circumstance.** Tests were green and wrong the same way: they encoded
what had *not* been done. The newest instance is from 2026-09-06 and was written that same morning —
OC-22 asserted that `claude-opus-5` was present with its 1M context window, and passed while the
model could not be selected at all, because 2026.9.1's model policy did not allow `claude-cli/*`.
**Being catalogued is not being usable.**

**Facts are computed, conduct is taught.** Where a question has a determinable answer, give the agent
a way to ask. This is now also how the stack configures itself: the start script reads
`openclaw --version` from the built image and `meta.lastTouchedVersion` from the state, rather than
inferring either from the Dockerfile's pin. A pin plus a comment goes false the moment someone
changes the pin.

**Pin what you depend on.** A floating tag moved on 2026-09-05 and broke four things in a stack whose
own code had not changed since June. And a pin is not one line: three helper containers in the start
script still ran on `:latest` for another day, configuring a gateway running something else.

**Measure before you build.** On 2026-09-06 a coherent chain of reasoning — the wrapper is bypassed,
so its environment is not injected, so authentication fails — was wrong. The cause was an expired
login. The operator asked what exactly was being proposed instead of letting it be built, and one
message of measuring replaced a change against a problem that did not exist.

**A green suite says nothing about a path nobody walks.** Two whole classes of defect surfaced only
when someone tried to *use* the thing: the upgrade path (every existing installation's situation, and
no cold start can reach it, because it deletes the state first) and sending an actual message (which
found the model allowlist and the in-process SDK).

**A criterion that depends on when you look is not a criterion.** The service sweep this project used
since A7-5 reported "all running, none unhealthy" while the gateway was on its tenth restart:
`docker compose ps` shows a crash-looping container as `running` with health `starting` between two
crashes. `tests/lib/health.ts` reads status, `RestartCount` and health per container instead.

**Do not let a document exist twice.** Promoting the cold-start procedure from `.pr-drafts/` to
`docs/` left two copies; every repair went into one while the operator worked from the other, so a
fix that had been reported as done was hit again. It is the same failure the tests are explicitly
built to avoid — they read the thing under test out of its real file rather than carrying a copy.

**The manual cases earn their place.** Six observed by 2026-09-05, three failed, and two of those
failures were the *case* being wrong rather than the agent. On 2026-09-06 OC-8 and OC-9 turned out
not to be automatable at all: with and without the setting the stack answers identically on every
route, and the pairing decision happens only after a browser signs a challenge.

## Next

In this order, and the reasons are in the thread rather than invented here:

1. **OC-16 and OC-3** — the two cheap open cases, closing the last negative counterparts. OC-16
   builds the image *without* `--allow-scripts` on npm 12 and requires it to fail; OC-3 reproduces
   the `doctor --fix? [Y/n]` hang under a pty.
2. **Suite 2** — an integration branch carrying #13 + #9 + #10, so the claim that the migration does
   not break the two features in flight is executed rather than asserted. Forces the #10 merge-forward,
   which is due anyway. This is the substantive one.
3. **OC-20** — the cold start on 2026.9.1, destructive and manual, with the operator at the keyboard.
   Last, because it wipes the state and exercises the fresh-install branch of the upgrade guard.
4. **M-B3** — still the only unbuilt milestone.

**Not in this order, on purpose:** Timur's reviews run in parallel and block nothing. The long-lived
Claude token and a gateway token for the CLI are both decisions about operation and the
authentication model, not migration work — `BACKLOG.md`, not #13.
