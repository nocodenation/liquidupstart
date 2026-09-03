# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

## Documentation

**Move `M-B1 to M-B2 — outlines` out from between M-A5 and M-A6.**
`docs/TEST-SPEC-git-integration.md` — the Track B outline sits between two Track A milestone
sections, so a reader following Track A in order walks through NiFi material to reach M-A6. The
feature document orders the same milestones correctly; only the test specification is affected. A
move, not a rewrite. Noted 2026-09-03 when M-A6 was specified, and deferred so it can be batched with
other tidying rather than interleaved with milestone work.

## Open findings

**One unreproduced intermittent failure in the full suite.**
Recorded in the amendment to A5-3's detail block. The M-A5 fixture failed to build once during the
operator's second verification run and has not reproduced since — four consecutive runs, the
aside-and-restore sequence repeated by hand, and the setup executed by hand in the container were all
green. No cause is claimed. Two changes narrowed its surface: the probe directory is now unique per
run, and the setup's output is asserted before its exit code, so the next occurrence will say what
git said instead of only `received: 1`.

**The `git config` error in the A5-9 transcript is inferred, not observed.**
OpenClaw showed `Bash failed: run git config` and the exact argument list is not in the screenshots.
The reading — a `git config --get` on an unset key, which exits 1 — follows from the clone carrying
no local `user.name` or `user.email` and the identity coming from the environment. Expanding the
`Tool error Bash` row in OpenClaw would confirm or refute it. Low value, recorded so the inference is
not later read as an observation.
