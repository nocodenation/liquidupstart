# Backlog

Small things worth doing that are deliberately not being done now, so that deferring them stays a
decision rather than an omission. Each entry says what, where, and why it was left.

The same file exists on `feature/git-integration` and `feature/liquid-java-extensions` with those
features' findings, and nothing here repeats them. This one holds what the OpenClaw 2026.9.1
migration deferred, plus the one alternative the `bun_runner` repair (#12) had nowhere to record —
that branch is cut from `main`, where no backlog file exists.

## Open findings

**The Claude login expires, and the one idea that might remove the expiry is unmeasured.**
The login lives only in `volumes/_openclaw-claude` and does not survive a reset; the migration cost
four interactive sign-ins in two days. A long-lived `CLAUDE_CODE_OAUTH_TOKEN` was measured and
**refused** — the in-process Agent SDK that serves turns on 2026.9.1 does not authenticate from it,
and leaving it in `.env` would make `start.sh` skip the sign-in, trading a loud failure for a silent
one. That measurement is final and is recorded in `docs/verification/RESULT-openclaw-2026-9-1.md`
§11.

What remains is an idea, stated as an idea: the Claude **CLI** does accept the token, so a CLI call
made with it might materialise a `.credentials.json` that the SDK then reads — which would give the
start an unattended path to valid credentials. Nobody has measured that, and the last two coherent
inferences about this bundle were both wrong. Measure before building: one command in a throwaway
container decides it.

**The `bun_runner` entrypoint should publish its own state instead of being inferred.**
*The finding itself is not here.* It is on `feature/git-integration` and
`feature/liquid-java-extensions` as *"`bun_runner` reports unhealthy with no app, and says nothing
about it"*, found by A7-5 on 2026-09-05 — and **#12 has since fixed the half that made a healthy
stack look broken**: the check no longer probes port 3000 when `/bun_app/package.json` is absent.
This entry is only what #12 deliberately did not do, recorded here because #12 is cut from `main` and
had no backlog to write into.

The check now answers "is something listening on 3000, if an app is deployed?" and infers the rest.
The faithful answer is for the entrypoint to write `waiting` / `building` / `serving` to a file the
check reads — a computed fact rather than an inference, and this project's own idiom. Rejected **for
that branch only**: it changes the entrypoint and therefore the image, on a repair of the released
stack whose whole value is being reviewable in two minutes.

It would also close the gap #12 leaves and states in numbers: while `bun install && bun run build`
runs, `package.json` exists and nothing listens yet, so the check fails. Bounded by `retries: 10` at
`interval: 30s` — a false negative of the same family, only narrower. And the empty log the original
finding named is still empty; one line on startup would settle what the state means either way.

**The OpenClaw CLI cannot reach its own gateway here, and `OPENCLAW_GATEWAY_TOKEN` is a dangling
contract key.** Triggering a turn from inside the container fails both ways: without `--local` the
gateway answers `unauthorized`, and with `--local` it refuses because a gateway is already running
for the same state directory. The cause is the same one behind the September `openclaw devices
approve` failure — `gateway.auth.mode` is `trusted-proxy`, there is no `gateway.auth.token`, and the
CLI sends no identity header. `openclaw doctor` names it: *"Gateway identity-header auth has no
configured token/password path for machine clients."*

Worked around by stopping the gateway and running `--local` in a throwaway container. Not fixed:
giving the gateway a token changes the authentication model, which is not what a version migration
should carry. `.env.example` line 53 already declares `OPENCLAW_GATEWAY_TOKEN` and **nothing reads
it** — the obvious place to start if this is taken up, and worth removing if it is not, because a
declared key nothing consumes is a promise the contract does not keep.

**`volumes/_openclaw-claude/skills` cannot be removed, and the cause was not established.**
An empty directory that resists deletion by its owner with a writable parent, by `rmdir`, and by `rm`
inside a privileged container, which answers `Operation not permitted`. It carries no macOS flags and
is not a mount point.

Sidestepped rather than solved: `docs/PROCEDURE-cold-start.md` §1 archives state with `tar` instead
of copying trees and refreshing them with `rm -rf`, so an archive is one file that gets overwritten
and the whole class of problem disappears. That is the right shape regardless of the cause, which is
why establishing the cause is worth little — recorded so that the next person to meet it does not
spend an hour on it as this run did.

**Two `:latest` fallbacks remain in the `ingest-pdf` plugin build scripts.**
`${OPENCLAW_IMAGE:-ghcr.io/openclaw/openclaw:latest}`, in scripts neither `build.sh` nor `start.sh`
invokes. The plugin's bundle is checked in, so rebuilding it to remove a papercut carries more risk
than the papercut warrants. Every fallback on a path the stack actually walks was removed during the
migration; these two are what is left.
