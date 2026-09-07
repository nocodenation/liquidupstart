# Verification records

Evidence that the milestones were actually verified, not only declared verified.

**A reviewer does not need to read this directory.** The findings are already folded into the three
test specifications in `docs/`, in each case's *"What it found"* row. What lives here is the material
behind those rows.

This branch is an **integration vehicle, not something to merge**: it carries the git integration
(#9), the Java extensions (#10) and the OpenClaw 2026.9.1 migration (#13) together, so the
compatibility cases OC-23 to OC-27 can be *executed* rather than asserted. All three sets of records
are therefore here.

| | |
|---|---|
| `M-A*-verification.*` | The git integration, M-A5 to M-A7 |
| `M-B*-verification.*` | The Java extensions, M-B1 and M-B2 |
| `RESULT-*.md` | The migration: the 2026.7.1 baseline cold start, the `bun_runner` health check, and the migration itself |
| `A6-13.md` | An operator procedure, kept because the case it belongs to is manual and the steps are the test |
| `schema-keys-*.txt` | The flattened OpenClaw config schemas the migration analysis was computed from |

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
