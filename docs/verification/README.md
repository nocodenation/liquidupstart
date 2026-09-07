# Verification records

Evidence that the milestones were actually verified, not only declared verified.

**A reviewer does not need to read this directory.** The findings are already folded into
`docs/TEST-SPEC-git-integration.md` and `docs/TEST-SPEC-liquid-java-extensions.md`, in each case's
*"What it found"* row. What lives here is the material behind those rows.

Since `feature/git-integration` was merged forward into this branch on 2026-09-07, both sets are
here: **M-A5 to M-A7** for the git integration and **M-B1 to M-B2** for the Java extensions. The
earlier version of this file said they would arrive when that merge happened; they have.

| | |
|---|---|
| `M-*-verification.md` | The record: what was run, what it produced, what it found, what was left. English, written to be read. |
| `M-*-verification.log` | The raw terminal transcript of that run. Not written to be read — it is what the record is checkable against. |
| `A6-13.md` | An operator procedure, kept because the case it belongs to is manual and the steps are the test. |

## Why the logs are here

A verification that exists only in a chat transcript has to be carried by hand, and that is where it
gets lost. Worse, without the transcript a record is a claim: a test that never caught anything and
one that caught a defect before it shipped read identically in a summary. The logs are what makes
the difference checkable by someone who was not there.

This project is a trial of a working method as much as a feature, evaluated by people who did not
watch it happen. That is the whole reason to keep the evidence rather than the conclusion.

## What is not here

Drafts. `.pr-drafts/` stays gitignored and is the scratch area; a record is **promoted** here when
it is finished. The distinction is deliberate — everything in this directory is final.

M-B3 has no record because it is not built.

The OpenClaw 2026.9.1 migration keeps its records on `feature/openclaw-2026-9-1`, with the
specification they belong to.
