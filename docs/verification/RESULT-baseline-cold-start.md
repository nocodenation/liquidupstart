# Result — OC-BASE, the verified baseline

Run 2026-09-05 by the operator on `feature/openclaw-2026-9-1` at its base point: `main` + the
OpenClaw pin (#11) + the `bun_runner` health check (#12). Procedure: `../PROCEDURE-baseline-cold-start.md`.

**Passed.** This is the stand the migration to OpenClaw 2026.9.1 is measured against.

## Acceptance

| # | Check | Result |
|---|---|---|
| 1 | OpenClaw version in the container | `OpenClaw 2026.7.1` — the pin holds |
| 2 | Control UI through the proxy | `HTTP 200` — where 2026.9.1 answered 403 `proxy_attribution_required` |
| 3 | Live configuration | `Config valid: $OPENCLAW_HOME/.openclaw/openclaw.json` |
| 4 | Claude CLI in the image | `2.1.261 (Claude Code)` |
| 5 | `bun_runner` | `status=healthy streak=0` |
| 6 | Every service running, none unhealthy or restarting | **pass** — 19 services |
| 7 | `main`-shaped (no `git-repo-info`) | absent, correct |

`build.sh EXIT=0`, `start.sh EXIT=0`. Logs in
`/Users/christof/repos/liquidupstart-backups/{build,start}-baseline.log`.

Check 6 has never passed before in this project's record. It could not: `bun_runner` reported
unhealthy on every stack that had ever existed until #12 was written this afternoon.

## The build was genuinely cold

`cleanup.sh` runs `docker builder prune --force`, and the log contains **zero** `CACHED` steps.
Nothing was inherited from the warm machine.

The pin is confirmed by digest rather than by tag name:

```
#5 [1/7] FROM ghcr.io/openclaw/openclaw:2026.7.1@sha256:6a31d44b2944e7adcd2b582bf6fb463111264ebca97a0201795b799135bd102c
```

identical to the snapshot taken before the run. And the step #11 exists to protect ran and proved
itself:

```
#7 [3/7] RUN npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code && claude --version
#7 3.173 2.1.261 (Claude Code)
```

Step 6 compared the registry digests before and after: **no tag moved during this run.**

## A finding for the migration

The build log carries a line that matters for 2026.9.1:

```
npm warn Unknown cli config "--allow-scripts". This will stop working in the next major version of npm.
npm notice New major version of npm available! 11.13.0 -> 12.0.2
```

**2026.7.1 ships npm 11**, where `--allow-scripts` does not exist and the flag is inert. **npm 12
arrives with 2026.9.1**, and there it is load-bearing: without it the `@anthropic-ai/claude-code`
postinstall is blocked and the image ships a launcher with no binary. #11 kept the flag through the
downgrade on the argument that it costs nothing on the older npm; this run measured that — a warning
and a working CLI.

It is also the first entry for the migration's change analysis: **npm 11 → 12 is part of what moving
to 2026.9.1 brings**, independent of anything OpenClaw itself changed.

## What this run found

### One defect in the product

**`start.sh`'s sign-in instructions name a command that cannot work where it is printed.** When no
terminal is attached, the run prints:

```
docker compose exec -it openclaw-gateway openclaw-claude auth login --claudeai
```

The sign-in step runs *before* `docker compose up`. At that moment `docker compose ps -a` returns
nothing — there is no container to exec into. The script knows better than its own message: fifteen
lines above, `claude_cli()` is defined as a throwaway `docker run` with the credential directory
mounted, commented *"no gateway needed"*.

The working command, used here:

```bash
docker run --rm -it --user 0:0 -e HOME=/home/node \
  -v /Users/christof/repos/liquidupstart/volumes/_openclaw-claude:/home/node/.claude \
  --entrypoint /usr/local/bin/openclaw-claude \
  liquidupstart/openclaw:latest auth login --claudeai
```

The waiting run picked the login up by itself and continued.

**Why it survived until now:** the message is printed *only* when no terminal is attached — which is
exactly when nobody is watching. A new operator following it is stuck, with a fifteen-minute clock
running and an instruction that leads nowhere.

Not fixed here. It is a defect of the released stack and belongs in a repair cut from `main`, not in
the baseline that is meant to establish what the released stack does.

### Six defects in the procedure, all found by executing it

1. **A placeholder inside a runnable block.** Step 1 showed `docker buildx imagetools inspect <image>
   …` in a fenced block; the operator pasted it and got `zsh: no such file or directory: image`. The
   step is also headed *already done*, so the block was both unrunnable and unnecessary.
2. **`${PIPESTATUS[0]}` is bash-only.** The operator's shell is zsh, where it is empty — so the build
   reported `build.sh EXIT=` and *read as success*. A failed build would have looked identical. This
   is the worst of the six: it does not complain, it lies quietly.
3. **The fix for (2) broke the sign-in.** Capturing the log with `| tee` makes stdout a pipe;
   `start.sh` tests `[[ -t 0 && -t 1 ]]`, finds no terminal, and takes its non-interactive branch. No
   URL is printed and the run waits fifteen minutes for a login that cannot be given. Both steps now
   use `script`, which allocates a pty *and* writes the log *and* propagates the exit status —
   measured on this machine (a child exiting 7 makes `script` exit 7), not assumed.
4. **Step 2c's prose named exclusions the command did not have** (`-e volumes` in the text,
   `.env .pr-drafts scratch.md` in the command).
5. **Step 2b's own check could not fail correctly.** It compared `grep -c .` (212 non-empty lines)
   against a number taken from `wc -l` (252 total), so it would have called a perfectly restored file
   wrong and a truncated one fine. It compares against the backup itself now.
6. **The document existed twice.** Promoting it from `.pr-drafts/` to `docs/` left two copies, and
   every repair went into one of them while the operator worked from the other — which is why (2)
   was hit *after* it had been reported fixed. The duplicate is deleted; there is one copy.

Defect 6 is the one worth keeping in view. It is the same failure the `bun_runner` cases were
deliberately built to avoid — BR-1 to BR-4 read the health-check expression out of `compose.yml`
rather than carrying their own copy, precisely so the test cannot drift from the thing it tests. The
rule was written in the morning and broken in the afternoon, in the next document.

**A caveat on (2) and (3):** the fixes are verified in isolation — `script` propagates the exit
status and gives the child a tty, both measured — but this run was executed with the broken `| tee`
form. The corrected step 4 has not itself been run end to end. The next cold start is its first.

## What this run proves that nothing else could

That a new operator's first path works at all on this branch; that the pinned image and the sixteen
others still exist and still work together, since all of them were re-pulled; and that everything
under `config/` which the stack generates is genuinely generated rather than inherited — the reset
removed it and `git clean -nffdx` confirmed it was gone before the build.

On a warm machine none of the three is observable.

## Backups still held

Outside the repository, in `/Users/christof/repos/liquidupstart-backups/`: `.env.bak`,
`_git-secrets.bak` (the registered deploy keys), `_openclaw-claude.bak`, `_openclaw.bak-2026.7.1`
and `_openclaw.bak-2026.9.1`, plus `digests-{before,after}.txt` and the two run logs.

`_openclaw.bak-2026.7.1` is the return path: **OpenClaw refuses to start when its state directory
was last written by a newer version.** The migration will write 2026.9.1 into `volumes/_openclaw`,
and getting back to the feature branches means putting that backup in place.
