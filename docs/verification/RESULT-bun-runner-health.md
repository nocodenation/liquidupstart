# Result — `bun_runner` health check

Branch `fix/bun-runner-health`, cut from `main` at `d5f7b66`. Cases signed off by the operator
before the change was made; procedure and detail blocks in `CASES-bun-runner-health.md`.

## What was found

`bun_runner` reported `unhealthy` with `FailingStreak: 112`, every entry the same line:

```
bash: line 1: /dev/tcp/127.0.0.1/3000: Connection refused
```

Cause: the container is a **deployment target**. Its entrypoint waits for an application in
`volumes/bun_app/` and only then serves on port 3000. That directory is empty on this machine and on
every fresh installation, so the container was doing exactly what it was built to do while the check
asked whether an application had been deployed and was answering.

The service definition is byte-identical to `main` — a defect of the released stack, not of the
feature branches.

## What was changed

One line in `compose.yml`:

```diff
-      test: ["CMD-SHELL", "bash -c '> /dev/tcp/127.0.0.1/3000'"]
+      test: ["CMD-SHELL", "[ ! -f /bun_app/package.json ] || bash -c '> /dev/tcp/127.0.0.1/3000'"]
```

Configuration only — image, entrypoint and timings untouched, so no rebuild is needed to adopt it.

## What was verified

Run **before** the change, deliberately, so the pair BR-1/BR-4 reads as before-and-after rather than
as an assertion about the present:

```
BR-1 (FAIL) expected pass, exit=1 | /dev/tcp/127.0.0.1/3000: Connection refused
BR-2 (pass) exit=0
BR-3 (pass) exit=1
BR-4 (pass) exit=1
```

Run **after** the change:

```
expression under test: [ ! -f /bun_app/package.json ] || bash -c '> /dev/tcp/127.0.0.1/3000'
BR-1 (pass) exit=0
BR-2 (pass) exit=0
BR-3 (pass) exit=1 | bash: connect: Connection refused
BR-4 (pass) exit=1 | bash: connect: Connection refused
```

BR-1 is the defect, reproduced and then removed. BR-2 green in both runs is what shows the change
did not cost the case the old check got right. BR-3 green in both runs is what shows the guard still
bites — without it this would be indistinguishable from switching the check off. BR-4 is the
historical witness and holds the old expression as a literal, because after the change it no longer
exists in `compose.yml` to be read from.

BR-5, after `./scripts/linux/start.sh` from this branch (`EXIT=0`):

```
checks run: 3
BR-5 status=healthy streak=0
last probes: exit=0 out=""
BR-5 (pass) every service running, none unhealthy or restarting
```

Nineteen services, all `running`, `bun_runner` `Up (healthy)`. This is the first time in this
project's record that *"every service running and none unhealthy"* has been true — which is the
point of the branch: the criterion the OpenClaw cold-start verification depends on now means
something.

Two things about the stack it was measured on, stated so nobody reads more into it than it says:

- It is **`main`-shaped** — no git integration, no `nar_builder`. Confirmed rather than assumed:
  `command -v git-repo-info` inside `openclaw-gateway` returns nothing, which is the check
  `HANDOFF.md` prescribes for telling the two stack shapes apart.
- `liquidupstart/openclaw:latest` was **not rebuilt for this branch**; the local image is the one
  built earlier from `feature/liquid-java-extensions` and reports `OpenClaw 2026.7.1`. Irrelevant to
  BR-5, which concerns `bun_runner`, and stated because the health of the other eighteen services is
  reported above and one of them came from elsewhere.

## What was deliberately left

The faithful fix is for the entrypoint to publish its own state (`waiting` / `building` / `serving`)
for the check to read — a computed fact rather than an inference, and the project's own idiom. It
touches the entrypoint and therefore the image, on a repair whose value is being reviewable in two
minutes. **Carry it into `BACKLOG.md` when this lands**; that file exists only on the feature
branches, so it could not be recorded here.

The same alternative would close the one gap left: during `bun install && bun run build` the
`package.json` exists and nothing listens yet, so the check fails. Bounded — `retries: 10` at
`interval: 30s` means unhealthy only after five consecutive minutes, and `start_period: 5m` covers
the first build. A rebuild under five minutes never surfaces; a longer one reports unhealthy while
it runs and recovers by itself.

## Notes for whoever continues

- `.pr-drafts/` and `scratch.md` are **untracked and not gitignored on `main`**. Stage by name.
  `git add -A` on this branch would commit eight thousand lines of other branches' review notes —
  it already happened once, on `fix/openclaw-2026-9-1`.
- `main` carries no `docs/` and no `tests/`. The cases live in `.pr-drafts/` and the record lives in
  the commit message, which is the pattern `fix/openclaw-2026-9-1` established.
- Backups taken before this branch was cut, protecting the return path to the feature branches:
  `volumes/_openclaw.bak-2026.7.1` (OpenClaw refuses to start on state written by a newer version)
  and `volumes/_git-secrets.bak` (the registered deploy keys; the root `./cleanup.sh` removes
  `volumes/` entirely, `scripts/linux/cleanup.sh` does not).
