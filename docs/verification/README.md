# Verification records

Evidence that something was actually verified, not only declared verified.

| | |
|---|---|
| `RESULT-*.md` | The record: what was run, what it produced, what it found, what was deliberately left. |

Everything in this directory is **final**. A record is promoted here when the run it describes has
happened; `.pr-drafts/` stays the scratch area, and on this branch it is untracked and **not
gitignored** — stage files by name, never `git add -A`.

Specifications live one level up, in `docs/`, and are written and signed off **before** the work
they describe:

| | |
|---|---|
| `../CASES-bun-runner-health.md` | The five cases for the `bun_runner` health check, signed off before the one-line change was made. Its record is here. |
| `../PROCEDURE-baseline-cold-start.md` | OC-BASE, the cold start that establishes the stand the OpenClaw 2026.9.1 migration is measured against. Run 2026-09-05; its record is `RESULT-baseline-cold-start.md`. |

## Why a record and a transcript, not just a summary

Without the raw output a record is a claim. A test that never caught anything and one that caught a
defect before it shipped read identically in a summary. This work is a trial of a working method as
much as it is a change to the stack, judged by people who did not watch it happen — so the evidence
is worth more to them than the conclusion.

The same directory exists on `feature/git-integration` and `feature/liquid-java-extensions`, holding
the records for M-A5 to M-A7 and M-B1 to M-B2 with their full transcripts.
