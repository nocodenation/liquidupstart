# Handover — 2026-09-05

Read this first. It is the map and the current state; the specifications are the four documents in
`docs/`. Everything here was true at the end of 2026-09-05.

## What is being built

**Two features and one repair**, on three branches.

**The git integration** gives the agent harnesses OpenClaw and OpenCode version control:
repositories declared in the configuration, cloned into a shared workspace, each with its own deploy
key, guardrails on what an agent may push, and one sanctioned command through which work leaves the
stack. The operator's own words for the need are in §1.1 of `docs/FEATURE-git-integration.md`.

**The Java extensions** let an agent write a NiFi processor and get it into Liquid. It *consumes* the
git integration and contributes nothing back to it, which is why it has its own documents since
2026-09-03.

**The hotfix** repairs the released stack, which broke on 2026-09-05 when a floating image tag moved.

All of it doubles as a **trial of test-driven AI development** — the working method is under
evaluation alongside the code, by developers and by people from the business. That is why the
documentation is heavier than the features alone would justify, and why failures are recorded rather
than tidied away.

## Where things live

| File | What it is |
|---|---|
| `docs/FEATURE-git-integration.md` | Use cases, working modes, permission model, requirements, milestones, process log, every goal as posed |
| `docs/TEST-SPEC-git-integration.md` | Every git case: overview row plus detail block, and the verification procedure per milestone |
| `docs/FEATURE-liquid-java-extensions.md` *(on `feature/liquid-java-extensions`)* | The same, for the Java extensions. Numbering continues from the git document — U9, FR21 upward — so no `Covers:` row is ambiguous |
| `docs/TEST-SPEC-liquid-java-extensions.md` *(same branch)* | The Java cases. One harness, two specifications: everything runs from `tests/` |
| `CLAUDE.md` § Development rules | The commandments this project works to |
| `BACKLOG.md` | What was deliberately deferred, each with why |
| `.pr-drafts/` | Verification logs and pull-request drafts. Untracked, gitignored on the feature branches. **Never `git add -A`** |

## The three branches, and the merge order

| Branch | PR | Holds |
|---|---|---|
| `feature/git-integration` | **#9** (draft, base `main`) | M-A0 to M-A7 |
| `feature/liquid-java-extensions` | **#10** (draft, base `feature/git-integration`) | M-B1 to M-B3 |
| `fix/openclaw-2026-9-1` | **#11** (base `main`) | The repair of the released stack |

The Java branch is cut from the git branch, not from `main`, because it needs the workspace. #11 is
cut from `main` because the released stack needs it today and must not wait for a review of ninety
commits. **Both feature branches already carry #11 by merge**, so nothing waits on it.

**#9 must be merged with a merge commit, not squashed.** GitHub retargets #10 by itself, but only
cleanly if the commits it already carries survive — and the individual messages are part of what this
work exists to demonstrate.

## One working copy, one stack

`docker compose` reads the `compose.yml` of the checkout at the moment `start.sh` runs, so the
containers keep the mounts, services and images **that branch** declared, no matter what is checked
out afterwards. This cost time three times on 2026-09-05, twice after it had been written down here.

**After switching to a branch whose `compose.yml` differs, run `./scripts/linux/start.sh` before
trusting a test run.** One line tells the two cases apart:

```bash
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'
```

Silence means the running stack predates the git integration, and the red tests describe the
containers rather than the code. The same applies to **images**: `liquidupstart/openclaw:latest`
built on the hotfix branch has no `openssh-client`, because that line lives on the feature branches.

## State

**The git integration is complete.** M-A0 to M-A7 built, each verified independently by the operator
and posted to #9. All four manual cases observed and recorded, including the three that failed.

**The Java extensions:** M-B1 and M-B2 built and verified, B2-10 observed and passed. **M-B3 is
specified and not built** — it asks whether Liquid loads what we build, and its negative control (a
NAR built against the wrong API must *not* load) is the case, not an addition to it.

**The stack** runs OpenClaw **2026.7.1, pinned**. `.env` declares `nocodenation/agent-skills` as
`read|protected` and `nocodenation/liquidupstart` as `write|protected`, both with deploy keys
registered and clones under `volumes/repos/`. A cold start regenerates those keys, so they must be
re-registered afterwards — A7-5's procedure walks it.

`volumes/repos/csv-columns` is a leftover from the A2-5 observation. Leave it: A4-16 uses it as a
clone the feature did not create. `volumes/_openclaw.bak-2026.9.1` is the OpenClaw state from before
the downgrade; it held no sessions and can go once nobody misses it.

## How work proceeds

The cycle is in §7 of `docs/FEATURE-git-integration.md`. In short: write the test cases → **the
operator reviews and signs them off before anything is built** → write the goal → run it **in a fresh
session** → check the evidence is really in the transcript → review the diff against what the cases
meant → update the documents and the process log.

**Execution runs in a fresh session; design and review do not.** The best decisions came out of an
accumulating conversation; executing them is better served by a clean context and the documents.

**The turn bound covers the whole cycle**, not the code, and it has been wrong in the same direction
five times: the build fits and the record the rules require does not. A goal condition is capped at
**4000 characters**.

**A task outside the goal mechanism writes its result to a file**, not only to the chat —
`.pr-drafts/RESULT-<task>.md`. A result that exists only in a transcript has to be carried by hand,
and that is where it is lost.

## What the failures taught

**Assert the property, not the circumstance.** Tests were green and wrong the same way: they encoded
what had *not* been done — a key not registered, `.env` not edited, no other ssh identity present.
Each broke when the feature was used as intended. The same shape in checks: a filter on "what is not
fine" has to enumerate every way a row can be fine, and got it wrong twice in one procedure. Name the
positive conditions instead.

**Facts are computed, conduct is taught.** Three manual observations failed on rules that were
correct, present in the skill and mounted — twice never opened, once quietly false. Where a question
has a determinable answer, give the agent a way to ask: `git-repo-info`, `git-publish`, `nar-build`.

**A green suite says nothing about a path nobody walks.** A7-5, the first real cold start this stack
has ever had, found four product defects and six errors in its own procedure — and every one of the
six was invisible until someone executed the document line by line. The operator found four of them
by asking what a line was for.

**Pin what you depend on.** `ghcr.io/openclaw/openclaw:latest` moved to 2026.9.1 on 2026-09-05 and
broke four things in a stack whose own code had not changed since June. Four symptoms were repaired
before anyone asked why it was broken at all; the answer was a floating tag, and the fix is the pin.
Seven of the seventeen images a cold start pulls still hang on tags that can move — A7-5 lists them.

**Downgrading is never only a tag change.** OpenClaw refuses to start when its state directory was
last written by a newer version.

**The manual cases earn their place.** Six observed, three failed, and two of the failures were the
*case* being wrong rather than the agent: A5-10 could not distinguish complying-in-advance from
routing-around, and B2-10 assumed a restart was required when NiFi auto-loads from the drop directory
while running. Neither could have been caught by any automated case, and B2-10's finding corrected
documentation that had been written the day before.

## Next

1. **M-B3** — the only unbuilt milestone. Its goal is not yet written.
2. **PR #11 to `main`.** The released stack is broken for every new installation without it.
3. **Timur's review of #9**, then the merge — with a merge commit.
4. `BACKLOG.md` — seven entries, none blocking.
