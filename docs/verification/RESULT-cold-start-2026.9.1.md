# Result — OC-20, a cold start on OpenClaw 2026.9.1

Run 2026-09-07 by the operator on `feature/openclaw-2026-9-1`, following `../PROCEDURE-cold-start.md`.
The counterpart to `RESULT-cold-start-2026.7.1.md`, which established the baseline on 2026-09-05.

**Passed, including the browser half.** This is the last unrun case of the migration.

## What was run, and what was chosen

`main`-shaped branch: no git integration, no `nar_builder`, so step 4c did not apply and check 7
expects `git-repo-info` to be **absent**.

**The Claude sign-in was exercised rather than restored** — the choice §1 asks for. `_openclaw-claude.tar`
was available and deliberately not used, so the run walked the path a new operator walks. That
choice is why the 2026-09-05 run found two product defects, and it is recorded here because a cold
start that skipped the sign-in and one that went through it are different results.

## Acceptance

| # | Check | Result |
|---|---|---|
| 1 | Version equals the pin | `OpenClaw 2026.9.1 (ad6fe23)` — the pin read from the Dockerfile, not typed |
| 2 | Control UI through the proxy | `HTTP 200` |
| 3 | Live configuration | `Config valid` |
| 4 | Claude CLI in the image | `2.1.263 (Claude Code)` |
| 5 | `bun_runner` | `status=healthy streak=0` |
| 6 | Every service running, zero restarts, every healthcheck green | **pass** |
| 7 | `git-repo-info` absent | correct for this branch |

`build.sh EXIT=0`, `start.sh EXIT=0`. `doctor`: **0** critical findings, **0** legacy config keys,
**0** codex plugin errors. Step 6: no tag moved during the run.

The configuration the migration writes, on an installation created from nothing:

```json
deviceAutoApprove: { enabled: true, scopes: [operator.read, operator.write, operator.talk,
                                             operator.pairing, operator.approvals, operator.questions] }
cliBackends: absent   dangerouslyDisableDeviceAuth: absent   plugins.entries.codex: absent
modelPolicy.allow: ["openai/*", "anthropic/*", "claude-cli/*"]
trustedProxies: ["127.0.0.1/32", "172.18.0.0/16"]
```

## The browser half — OC-8, asked again and properly

The earlier confirmation of "no pairing prompt", on 2026-09-06, ran against a **migrated** state,
where a device could already have been known. Here the state directory was created twenty minutes
earlier and had never seen a browser. The question was therefore genuinely open again.

Observed by the operator, screenshots in `ScreenCaps/Stills/OC-20`:

- **The Control UI loaded with no pairing prompt.**
- The model **could be set**: the composer shows `Claude Opus 5 (Claude CLI) · claude-cli`. On
  2026-09-07 morning the same action answered `Failed to set model: model not allowed:
  claude-cli/claude-opus-5`, which is what led to the `modelPolicy.allow` fix.
- A full turn completed: the probe asked for the exact string `oc20-probe` and got it back, *"Done
  in 5 seconds"*.

That last one is the whole migration in one line. The blocker that stopped this in September —
browsers demanding a device pairing whose approval path is unreachable in this deployment — does not
occur on a brand-new installation, and a Claude turn runs through the subscription route to
completion.

## What the run proves that nothing else could

That a new operator's first hour works on 2026.9.1: reset, build, start, sign in, open the interface,
send a message. Every automated case runs against a stack that is already up and a state that earlier
runs left behind.

And that the seventeen images still exist and still work together, since all of them were re-pulled.
The build was genuinely cold: `cleanup.sh` reclaimed 9.8 GB of images and build cache, and the log
shows **52 completed steps and one `CACHED`** — that one being the `FROM` layer, after its digest was
resolved from the registry in the same run. Everything the stack itself builds ran fresh.

The base image resolved to `sha256:6afe42854c87…`, identical to the pin recorded on 2026-09-05.

## Two things worth noting rather than glossing

**The corrected step 4 ran for the first time, and worked.** The procedure had said so: the `script`
form that replaced `| tee` had never been executed. The sign-in prompt appeared in the run itself and
was completed there — `Claude CLI: not authenticated — starting interactive Claude Code sign-in` …
`login complete`. Every earlier attempt needed a second terminal, because a pipe leaves the child
without a terminal and `start.sh` takes its non-interactive branch.

**The model picker lists ten `claude-cli` models where an earlier observation counted nine** — the
new one is `claude-cli/claude-haiku-4-5`. That list is the provider's own catalogue, which is wider
than the six models this stack pins context windows for. Nothing here changed it and no case depends
on it; recorded because the two observations differ and a reader would otherwise have to wonder.

## The state this leaves behind

A `main`-shaped stack on 2026.9.1 with a fresh state directory and a fresh Claude login. The deploy
keys under `volumes/_git-secrets` were destroyed with `volumes/` and **not** restored, because this
branch has no git integration to use them. Anything that needs them — the compatibility suite on
`integration/oc-2026-9-1`, or the feature branches — must restore `_git-secrets.tar`, whose archived
keys are the ones registered with GitHub, or register new ones.
