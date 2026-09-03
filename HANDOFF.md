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

## State on 2026-09-03

- Branch `feature/git-integration`, PR #9 still a **draft** on purpose: it goes to Timur for review
  only when the whole feature is done.
- **M-A0 to M-A4 are complete**, each verified independently by the operator. A4-15 was observed
  twice and failed; its question is carried into A5-10.
- **M-A5 ran on 2026-09-03**: both gates green, uncommitted at the time of writing. Five test files
  and one paragraph in the git skill. Its independent verification, the process-log row, and the
  two manual cases A5-9 and A5-10 are still to be done by the operator.
- The stack is up, `.env` declares `nocodenation/agent-skills` as `read|protected`, its deploy key is
  registered on GitHub, and the clone sits at `volumes/repos/agent-skills`. **No write-capable
  repository is declared yet** — the automated M-A5 cases prove the write path against local bare
  repositories, and declaring the real `liquidupstart` is A5-9, the operator's step.
- `volumes/repos/csv-columns` is a leftover from the A2-5 observation. Leave it: A4-16 uses it as a
  clone the feature did not create.

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

1. M-A5: verify independently (§9 of the test specification), fill the process log row, commit.
2. **A5-9**, manual: declare `liquidupstart` as `write|protected`, register the key with write
   access, have an agent push `agent/probe`, delete the branch afterwards.
3. **A5-10**, manual: the A4-15 question asked where the hook itself refuses. The last open question
   from §3.1.
4. **Track B** — `nar_builder` for Java processors, independent of all the above.

Open questions are §6 of the feature document. O1 (gating push on the privacy profile) becomes real
only when `feature/privacy-gateway` merges.
