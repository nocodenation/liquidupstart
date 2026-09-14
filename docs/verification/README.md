# Verification records

Evidence that something was actually verified, not only declared verified.

**A reviewer does not need to read this directory.** The findings are already folded into
`docs/TEST-SPEC-git-integration.md`, `docs/TEST-SPEC-liquid-java-extensions.md` and
`docs/TEST-SPEC-openclaw-2026-9-1.md`, in each case's *"What it found"* row. What lives here is the
material behind those rows.

Three sets of records share the directory, because this branch sits at the end of the stack:
**M-A5 to M-A7** for the git integration, **M-B1 to M-B2** for the Java extensions, and — since #11
merged into `main` on 2026-09-14 and `main` was merged forward from there — the OpenClaw 2026.9.1
migration, the cold starts and the `bun_runner` health check. The two naming conventions are what
that history looks like on disk:

| | |
|---|---|
| `M-*-verification.md` | The record for a milestone of this stack's features: what was run, what it produced, what it found, what was left. |
| `M-*-verification.log` | The raw terminal transcript of that run. Not written to be read — it is what the record is checkable against. |
| `RESULT-*.md` | The same thing for the work that arrived through `main`. |
| `A6-13.md` | An operator procedure, kept because the case it belongs to is manual and the steps are the test. |

Specifications live one level up, in `docs/`, and are written and signed off **before** the work they
describe — `../CASES-bun-runner-health.md` and `../PROCEDURE-cold-start.md` are the two that came
with the merge.

## Why the logs are here

A verification that exists only in a chat transcript has to be carried by hand, and that is where it
gets lost. Worse, without the transcript a record is a claim: a test that never caught anything and
one that caught a defect before it shipped read identically in a summary. The logs are what makes
the difference checkable by someone who was not there.

This project is a trial of a working method as much as a feature, evaluated by people who did not
watch it happen. That is the whole reason to keep the evidence rather than the conclusion.

## What is not here

Drafts. Everything in this directory is **final**; a record is promoted here when the run it
describes has happened, and `.pr-drafts/` stays the scratch area. On this branch that directory is
gitignored; on `main` it is **not**, so work there stages files by name and never `git add -A`.
