# Handover — agent git integration

Read this first, then `docs/FEATURE-git-integration.md`. This file is the map and the current state;
that one is the specification.

## What is being built

Version control for the agent harnesses OpenClaw and OpenCode: repositories declared in the
configuration, cloned into a shared workspace, each with its own deploy key, and guardrails on what
an agent may push. The operator's own words for the need are in §1.1 of the feature document.

The feature is also a **trial of test-driven AI development** — the working method is under
evaluation alongside the code, by developers and by people from the business. That is why the
documentation is heavier than the feature alone would justify, and why failures are recorded rather
than tidied away.

## Where things live

| File | What it is |
|---|---|
| `docs/FEATURE-git-integration.md` | Use cases, working modes, permission model, requirements, milestones, process log, and every goal as posed |
| `docs/TEST-SPEC-git-integration.md` | Every test case: overview table plus a detail block per case, and the verification procedure per milestone |
| `CLAUDE.md` § Development rules | The commandments this project works to, and the conventions derived from them |
| PR #9 (draft) | The review vehicle. The operator's independent verification of each milestone is posted there as comments |

## State on 2026-09-04

- Branch `feature/git-integration`, PR #9 still a **draft** on purpose: it goes to Timur for review
  only when the whole feature is done.
- **M-A0 to M-A4 are complete**, each verified independently by the operator. A4-15 was observed
  twice and failed; its question is carried into A5-10.
- **M-A5 ran on 2026-09-03**: both gates green. A5-9 was done — `liquidupstart` is declared
  `write|protected` with a write-enabled key — and A5-10 then failed for the third time and is
  **closed and superseded by A6-13**: over the branch rule a well-behaved agent complies before the
  hook can run, so there is nothing left to observe.
- **M-A6 ran on 2026-09-03**: both gates green, uncommitted at the time of writing, and
  `./tests/verify/m-a6.sh` green on all seven checks. Publishing is now narrowed to one command,
  `git-publish` (`config/agents/bin/git-publish.sh`, mounted at `/usr/local/bin/git-publish` in the
  three agent services); `pre-push` gained one rule, evaluated **last**, refusing any push that did
  not come through it. The proof of passage is a single-use file, `.git/liquidupstart-publish`,
  written by the command and consumed by the hook — forgeable by root, and the specification says so.
  **A raw `git push` inside a container is now refused, in every repository the containers see**,
  including scratch ones an agent makes itself; two earlier system fixtures had to seed their bare
  remote by cloning because of it. **Both are now closed.** The operator's independent verification
  ran all seven §9 checks green on 2026-09-03 and is posted to PR #9, and **A6-13 passed**: the first
  time in this feature that this stack's own guardrail refused an agent — A4-15 was refused by GitHub
  and A5-10 never attempted the push. It complied without routing around it and, having already kept
  the private key out of the commit, met the token rule rather than the secret scan. It did not report
  the refusal, which the skill now covers.
- **M-A7 ran on 2026-09-04**: both gates green and `./tests/verify/m-a7.sh` green on all eight §9
  checks. It adds a sixth test level, `tests/e2e/`, which `tests/run.sh` groups with `system` for
  ordering and for `--no-system`, and M-A0's own cases now assert it. Four cases: the whole chain in
  the container (A7-1) and the same chain refused on the protected default branch (A7-2), plus the
  concurrency pair on the host (A7-3, A7-4). All four run against a throwaway declaration and local
  bare remotes under `volumes/repos/.a7-*`; `.env` and GitHub are untouched. **The joins held** —
  nothing in the product had to be repaired. What it found is in `BACKLOG.md`: the proof of passage is
  one path per clone rather than one per publication, so two publications in one clone can take each
  other's permission. It fails closed and no requirement is violated, so it is recorded, not fixed.
  **A7-5, the manual cold start, is still open** and is the operator's: it tears the stack down.
- The stack is up and `.env` declares two repositories: `nocodenation/agent-skills` as
  `read|protected` and, since A5-9, `nocodenation/liquidupstart` as `write|protected`, each with its
  deploy key registered on GitHub and its clone under `volumes/repos/`. The write-capable declaration
  is what makes A6-13 runnable against a real remote; the automated cases still use local bare
  repositories and reach nothing outside the machine.
- `volumes/repos/csv-columns` is a leftover from the A2-5 observation. Leave it: A4-16 uses it as a
  clone the feature did not create.

## Branches, and one thing that costs an hour if nobody says it

Three branches since 2026-09-05. `feature/git-integration` is PR #9 and holds M-A0 to M-A7.
`feature/liquid-java-extensions` is PR #10, cut from it, and holds M-B1 to M-B3 — it must branch from
here rather than from `main`, because it consumes the agent workspace. `fix/openclaw-2026-9-1` is
PR #11, cut from **`main`**, and repairs the released stack; both feature branches already carry it
by merge, so nothing waits on that review. **PR #9 must be merged with a merge commit, not squashed**
— GitHub retargets #10 by itself, but only cleanly if the commits it already carries survive, and the
individual messages are part of what this work exists to demonstrate.

**One working copy, one stack — and the stack belongs to whichever branch last started it.**
`docker compose` reads the `compose.yml` of the checkout at the moment `start.sh` runs, so the
containers keep the mounts, services and images that branch declared, no matter what is checked out
afterwards. On 2026-09-05 a hotfix session started the stack from `fix/openclaw-2026-9-1`, which is
cut from `main` and contains no git integration; back here the suite reported 42 failures, every one
of them the missing `/git-secrets` mounts and the three commands that branch never mounted. Nothing
was broken, and nothing in the repository said so.

**After switching to a branch whose `compose.yml` differs, run `./scripts/linux/start.sh` before
trusting a test run.** One line tells the two cases apart:

```bash
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'
```

Silence means the running stack predates the git integration, and the red tests are describing the
containers rather than the code.

## How work proceeds

The cycle is in §7 of the feature document. In short: write the test cases → **the operator reviews
and signs them off before anything is built** → write the goal text → run it **in a fresh session** →
check the evidence is really in the transcript → review the diff against what the cases meant →
update the documents and the process log.

Two rules that are easy to get wrong:

**Execution runs in a fresh session; design and review do not.** The best decisions in this feature
came out of an accumulating conversation. The execution of them is better served by a clean context
and the documents alone.

**The turn bound covers the whole cycle**, not the code. M-A3e reached both required runs at turn 25
of 25 and needed eleven more for the documentation the rules require. Nothing enforces the bound — it
is a sentence the evaluator weighs.

## What the failures taught

Four findings are worth knowing before touching anything, because each cost a milestone:

**Assert the property, not the circumstance.** Four tests were green and wrong the same way: they
encoded what had *not* been done — a key not yet registered, `.env` not yet edited, no other ssh
identity present, the identity still at its default. Every one broke when the operator used the
feature as intended.

**Facts are computed, conduct is taught.** Three manual observations failed on rules that were
correct, present in the skill and mounted in both harnesses — twice the skill was never opened, once
the rule had quietly become false. Where a question has a determinable answer, give the agent a way
to ask: `config/agents/bin/git-repo-info.sh` is the result.

**A green suite says nothing about usability.** All 24 automated M-A3 cases passed while an agent
could not reach a repository at all, because every case had the SSH URL written into it.

**The manual cases earn their place.** Five of them, three failed, and none of the failures could
have been caught by any of the 78 automated cases.

## Backlog

`BACKLOG.md` holds the small things deliberately deferred — a documentation ordering fix, one
unreproduced intermittent test failure, and one inference that was never confirmed. Nothing there
blocks a milestone; it exists so that deferring stays a decision rather than an omission.

## Next

**The git integration is complete through M-A7**, verified and with M-A6's manual cases closed. One
manual case is open: **A7-5, the cold start** — it rebuilds the stack from a clean checkout, so it is
run when the operator is willing to lose the volumes. The procedure is in §9 of the test
specification.

1. **Java extensions for Liquid** — its own feature since 2026-09-03, in
   `docs/FEATURE-liquid-java-extensions.md` and `docs/TEST-SPEC-liquid-java-extensions.md`. It was
   "Track B" in the git documents until it became clear that it consumes this feature and contributes
   nothing to it. M-B1 is specified and awaiting review; M-B2 is an outline. It is also the best
   end-to-end exercise the git integration will get: the first real work to use the workspace, the
   clones and `git-publish` without having helped design them.
2. **Timur's review**, before `feature/git-integration` merges to `main`. That was the plan from the
   outset: implement the feature, review once, merge.
3. `BACKLOG.md` — three deferred items, none blocking: a documentation ordering fix in the test
   specification, one unreproduced intermittent test failure, and one inference that was never
   confirmed.

Open questions are §6 of the feature document. O1 (gating push on the privacy profile) becomes real
only when `feature/privacy-gateway` merges.
