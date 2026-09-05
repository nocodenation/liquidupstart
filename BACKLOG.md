# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

## Open findings

**nginx appends to `X-Forwarded-For` instead of overwriting it.**
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` has been in this repository since
2026-06-01, arriving with the original webdb-playground base, and appears seventeen times: sixteen in
`config/nginx/templates/nginx.conf` and once in the generator that emits the hundred Liquid ingress
blocks. It preserves whatever the client sent and appends the real address, so a request arriving with
its own `X-Forwarded-For` has that value passed downstream as the first hop.

**Not a defect anyone has demonstrated.** It surfaced on 2026-09-05 while repairing OpenClaw's
`proxy_attribution_required`, and was changed to `$remote_addr` on the assumption it was part of that
fix. It was not: measured afterwards, appending with a narrow `gateway.trustedProxies` answers HTTP
200 exactly as overwriting does. The change was reverted, because a hotfix for a released stack
should carry only what the break requires.

What would settle it: whether anything downstream reads the first entry and trusts it — NextCloud,
OpenProject and pgAdmin all have their own trusted-proxy handling, and none has been checked. Against
that stands a real cost: overwriting discards the true client address for an operator who puts their
own reverse proxy in front of this stack. Decide it on those two facts, not on the tidiness of the
directive.

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
