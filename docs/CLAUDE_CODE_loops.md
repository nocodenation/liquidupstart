# Working with Loops in Claude Code

A practical guide to running Claude Code autonomously with `/goal` (and `/loop`).
For the cross-tool overview (Codex, OpenClaw, Ralph), see [LOOPS_quickstart.md](../google_task_sheet/LOOPS_quickstart.md).

> Version-pinned, fast-moving area. `/goal` requires **Claude Code v2.1.139+** (shipped week of May 12, 2026). Behavior may have changed since.

---

## The idea in one line
Normally you prompt → wait → check → re-prompt — **you** are the loop. `/goal` flips it: you write a
**completion condition once**, and Claude keeps working turn after turn until that condition holds — or you stop it.

## How `/goal` actually works (so you write good conditions)
- `/goal` is a wrapper around a **session-scoped Stop hook**. After each turn, a **small fast model (defaults to Haiku)** checks whether your condition holds. Not met → Claude starts another turn instead of handing control back. Met → the goal clears automatically.
- **The evaluator cannot run tools or read files.** It only judges **what Claude already put in the transcript**. So the proof must *appear in the chat*: Claude runs the tests, the `PASS`/exit code shows up, and the evaluator reads it.
- Practical consequence: phrase the finish line as something Claude's own output demonstrates — `npm test exits 0`, `git status is clean` — not `"the code is good"`.

## Writing an effective condition
Three parts:
1. **One measurable end state** — a test result, build exit code, file/queue count, ticked checklist.
2. **A stated check** — *how* Claude proves it (`npm test exits 0`, `npm run build succeeds`, `git status is clean`).
3. **Constraints that must not change** — e.g. "don't touch unrelated files."

Conditions can be up to **4,000 characters**. Always append a **bound** so a stuck loop can't spin forever:
`... or stop after 20 turns`.

```
/goal Add input validation across src/ and keep working until `npm test` exits 0
and `npm run build` succeeds. Don't touch unrelated files. If blocked, stop and tell me why.
Or stop after 25 turns.
```

```
/goal All tests in test/auth pass (npm test exits 0) and lint is clean — or stop after 20 turns.
```

## Controls
- `/goal` — show current goal / status
- `/goal clear` — cancel the active goal
- **One goal active per session.** Extra objectives go into your plan file, not a second goal.
- `/loop 5m <task>` — repeat a task on a timer (distinct from `/goal`; use for polling/scheduled-style repeats, not run-until-done).

## Running it unattended
- **`claude -p "/goal ..."`** runs the loop to completion in a single non-interactive invocation — ideal inside a sandbox or CI box.
- **Auto mode is complementary:** auto mode removes per-*tool* prompts; `/goal` removes per-*turn* prompts. Turn on both for truly hands-off runs.
- Caveat: on `--resume`/`--continue` the condition carries over, but turn/time counters reset.

## Keep state in files, not chat
Context gets compacted on long runs. Anything that must survive goes in files Claude re-reads each turn:
- `PLAN.md` / `specs/` / a TODO checklist — the work and its order
- progress notes and `git` commits — what's done
Then the condition can be "every box in `specs/001-*.md` is ticked and `npm run verify` is green."

## Dos & don'ts
| ✅ Do | ❌ Don't |
|------|---------|
| Machine-checkable finish line that shows up in the transcript | "Make it better" / anything unprovable |
| One goal at a time; bound it with `or stop after N turns` | Multiple objectives in one goal, unbounded |
| State in files (plan/specs/progress/git) | Rely on chat memory across compaction |
| Sandbox + auto mode for full-auto runs; keep inside your token budget | Full-auto on untrusted code / unbounded budget |
| **Review the diff** — loops produce confident slop | Auto-merge unreviewed work |
| Tell it to **search first (don't assume)** and write **full, not placeholder** implementations | Let it conclude code is missing and stub it out |

## Watch out for
- **Confident slop** is the #1 failure mode: the agent decides something isn't implemented and writes a placeholder. Counter it in the goal text: *"search the codebase before assuming; full implementations only."*
- **"Done" is model-judged.** The Haiku evaluator only sees the transcript — it doesn't re-run your tests. A loop can declare victory on a check that *looks* passed. Make Claude print real exit codes, and review before merging.
- **Budget/context.** Long goals burn tokens and fill context (auto-compacts when full). Bound the turns and keep tasks tight.

## Curb loop-driven bloat
Loops tend to over-build (more code → more context → worse loop). Add a few leanness rules to `CLAUDE.md`:
*prefer functionality over completeness; YAGNI; reuse → stdlib → one line → minimum code; no new dependency without asking.*
(Ponytail is installed in this environment as exactly this kind of leanness mode.)

## 10-minute try
Green baseline first (`npm run verify`), then:
```
/goal Implement the next unchecked item in specs/001-*.md, run `npm run verify`, tick the box.
Finish when all boxes are ticked and verify is green. Or stop after 30 turns.
```
Watch it loop. Review the diff before keeping anything.
