# OC-BASE — the verified baseline · **manual**

Branch `feature/openclaw-2026-9-1`, at its base point: `main` + the OpenClaw pin (#11) + the
`bun_runner` health check (#12), and nothing else. This is the stand the migration to OpenClaw
2026.9.1 will be measured against, so it is established by a **cold start** rather than asserted
from a stack that has been running for weeks.

Written to be run by the operator, in one sitting, from this checkout. It is **destructive** — read
§1 before starting.

---

## 1. What this destroys, and what was saved from it

`./cleanup.sh` at the project root is a **full reset**. It is more thorough than most people expect:

| It removes | Consequence |
|---|---|
| `docker compose down --volumes --remove-orphans` | Every container |
| `volumes/` entirely, with a `sudo` fallback | All state: databases, NextCloud, OpenProject, the OpenClaw config and its Claude login |
| **`.env`** | Every configured value — passwords, `ENABLE_*` flags, tokens |
| The rendered files under `config/` | nginx, pgadmin, nextcloud, liquid, openclaw |
| Every `liquidupstart/*` image and every image named in `compose.yml` | A full re-pull and rebuild |

It also asks for a `sudo` password partway through, because `volumes/` contains files owned by
subordinate UIDs the host user cannot remove directly. That prompt is expected; it is not an error.

**Saved beforehand, outside the repository** — `cleanup.sh` deletes `volumes/` wholesale, so a
backup kept *inside* `volumes/` would go with it:

```
/Users/christof/repos/liquidupstart-backups/
  .env.bak                     the 252-line configuration
  _git-secrets.bak             the deploy keys registered with GitHub for
                               nocodenation/agent-skills and nocodenation/liquidupstart
  _openclaw-claude.bak         the Claude Code login
  _openclaw.bak-2026.7.1       OpenClaw state, so the feature branches can be returned to
  _openclaw.bak-2026.9.1       the state from the failed 2026.9.1 attempt, kept as evidence
```

`_openclaw.bak-2026.7.1` is the one that matters most later: **OpenClaw refuses to start when its
state directory was last written by a newer version.** A downgrade is never only a tag change.

---

## 2. What is being established

| | |
|---|---|
| **Premise** | The migration needs something to be measured against, and "it works today" is not it — this stack has been running for weeks and carries state no fresh installation has. Every claim about what 2026.9.1 costs is a difference from *this* run. |
| **Component** | The whole stack, from a reset checkout, on branch `feature/openclaw-2026-9-1` at its base point. |
| **Shape** | `main`-shaped: **no git integration, no `nar_builder`**. Those live on the other branches and are absent here by design. Checking for them would fail a run that succeeded. |
| **Expected** | `build.sh` and `start.sh` both exit 0; OpenClaw in the container reports **2026.7.1**; the Control UI answers **200**, not the 403 that 2026.9.1 gave; `openclaw config validate` reports the live configuration valid; the Claude CLI in the image runs and reports a version; and every service is running with none unhealthy or restarting. |
| **Failure** | Any non-zero exit, a 403 from the Control UI, a service not running, or any service reported unhealthy or restarting. |

**The health criterion is only meaningful because of #12.** Until this afternoon `bun_runner`
reported unhealthy on every stack that had ever existed, so "none unhealthy" could not be asked.

---

## 3. Two decisions before you start

**The Claude sign-in.** `.env` has no `CLAUDE_CODE_OAUTH_TOKEN`, so the login lives only in
`volumes/_openclaw-claude`, which the reset destroys. `start.sh` will therefore open an interactive
Claude Code sign-in: it prints a URL, you authorize in the browser, and paste the code back.

Recommended: **let it happen.** It is what a new operator with `ENABLE_ANTHROPIC_CLAUDE_CODE=1`
actually faces, you are at the keyboard for the `sudo` prompt anyway, and how much friction that
path carries is worth knowing. If it turns into a fight, step 4b restores the saved login instead.

**`.env`.** Step 2b puts the saved one back. That is deliberate: what is being verified is the
pinned stack, not the configuration choices. Regenerating `.env` from `.env.example` would reset
`ENABLE_ANTHROPIC_CLAUDE_CODE` to `0` and quietly change what the run even tests.

---

## 4. The procedure

### Step 0 — confirm the backups exist before anything is destroyed

```bash
cd /Users/christof/repos/liquidupstart
git branch --show-current    # expect: feature/openclaw-2026-9-1
ls -la /Users/christof/repos/liquidupstart-backups/
```

Expect `.env.bak`, `_git-secrets.bak`, `_openclaw-claude.bak`, `_openclaw.bak-2026.7.1`,
`_openclaw.bak-2026.9.1`. **If any is missing, stop here.**

### Step 1 — record what the moving tags point at today · **already done**

A7-5 established that seven of the images a cold start pulls hang on tags that can move. Recording
the digests means that when a later run differs, the cause can be told apart: this repository, or an
upstream move.

> **Nothing to run in this step.** The snapshot was taken at `2026-09-05T17:55:11Z`, into
> `/Users/christof/repos/liquidupstart-backups/digests-before.txt`. Go to step 2.

Eleven pulled service images, seven build base images, and the three OpenClaw tags. Digests are read
from the **registry** rather than from local images — `docker buildx imagetools inspect NAME:TAG
--format '{{.Manifest.Digest}}'` — so a base image that BuildKit pulled without ever tagging it
locally is covered too. The full form is in step 6, which runs the same snapshot again afterwards.

The snapshot already produced one result worth keeping:

```
ghcr.io/openclaw/openclaw:2026.9.1   sha256:6afe42854c87471188b9c4f8dce6bbc14005a48d8e1592846548b32508754f84
ghcr.io/openclaw/openclaw:latest     sha256:6afe42854c87471188b9c4f8dce6bbc14005a48d8e1592846548b32508754f84
ghcr.io/openclaw/openclaw:2026.7.1   sha256:6a31d44b2944e7adcd2b582bf6fb463111264ebca97a0201795b799135bd102c
```

`:latest` and `:2026.9.1` are **bit-identical**. That `:latest` now serves 2026.9.1 was the
inference #11 rests on; it is a measurement now. The third line is what the pin holds, and the first
is the migration's target.

### Step 2 — the reset

```bash
cd /Users/christof/repos/liquidupstart
./cleanup.sh
```

It will ask for your `sudo` password partway through. Expected.

**Step 2b — put the configuration back:**

```bash
B=/Users/christof/repos/liquidupstart-backups
cp -a "$B/.env.bak" /Users/christof/repos/liquidupstart/.env
chmod 600 /Users/christof/repos/liquidupstart/.env
diff -q /Users/christof/repos/liquidupstart/.env "$B/.env.bak" \
  && echo "restored, identical to the backup" || echo "FAIL: .env differs from the backup"
```

**Step 2c — let git say whether the reset actually worked.** The script vouching for itself is
weaker than an independent check. The three exclusions are what we put back or keep on purpose:
`.env` from step 2b, and `.pr-drafts` and `scratch.md`, which are the scratch area:

```bash
cd /Users/christof/repos/liquidupstart
git clean -nffdx -e .env -e .pr-drafts -e scratch.md
```

Expect **nothing** but possibly `volumes/`. Any rendered file still listed under `config/` means the
reset missed it, and the run would then be measuring leftovers.

### Step 3 — build

```bash
cd /Users/christof/repos/liquidupstart
{ ./scripts/linux/build.sh 2>&1; echo "build.sh EXIT=$?"; } \
  | tee /Users/christof/repos/liquidupstart-backups/build-baseline.log
```

Expect `EXIT=0`. This pulls `ghcr.io/openclaw/openclaw:2026.7.1` — the pin from #11 — and the build
ends in `claude --version`, so an install that produces nothing fails instead of shipping.

### Step 4 — start

```bash
cd /Users/christof/repos/liquidupstart
{ ./scripts/linux/start.sh 2>&1; echo "start.sh EXIT=$?"; } \
  | tee /Users/christof/repos/liquidupstart-backups/start-baseline.log
```

The interactive Claude sign-in appears here. Follow it.

**Step 4b — only if the sign-in cannot be completed:**

```bash
cp -a /Users/christof/repos/liquidupstart-backups/_openclaw-claude.bak \
      /Users/christof/repos/liquidupstart/volumes/_openclaw-claude
./scripts/linux/start.sh
```

Note in the record that this was used, because it means the sign-in path was not exercised.

### Step 5 — the acceptance, in one block

```bash
cd /Users/christof/repos/liquidupstart
echo "=== OC-BASE acceptance ==="

echo "-- 1. OpenClaw version (expect 2026.7.1, the pin)"
docker compose exec -T openclaw-gateway openclaw --version

echo "-- 2. Control UI (expect 200; 2026.9.1 answered 403 proxy_attribution_required)"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -H 'Host: openclaw.localhost' \
  "http://127.0.0.1:$(grep -E '^SYSTEM_HTTP_PORT=' .env | cut -d= -f2- | tr -d '"')/"

echo "-- 3. Live configuration valid"
docker compose exec -T openclaw-gateway openclaw config validate

echo "-- 4. Claude CLI in the image runs (the npm --allow-scripts repair)"
docker compose exec -T openclaw-gateway claude --version

echo "-- 5. bun_runner specifically (BR-5)"
docker inspect bun_runner --format 'status={{.State.Health.Status}} streak={{.State.Health.FailingStreak}}'

echo "-- 6. every service running, none unhealthy or restarting"
docker compose ps --format '{{.Service}}\t{{.State}}\t{{.Status}}' \
  | awk -F'\t' '$2 != "running" || $3 ~ /unhealthy|Restarting/' \
  | grep . && echo "FAIL: the services above" || echo "pass: all running, none unhealthy"

echo "-- 7. main-shaped, as this branch should be (expect no output)"
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info' || echo "(absent, correct)"
```

Expected: `OpenClaw 2026.7.1` · `HTTP 200` · configuration valid · a Claude version · `status=healthy
streak=0` · `pass: all running, none unhealthy` · `(absent, correct)`.

### Step 6 — record the digests the run actually assembled

```bash
cd /Users/christof/repos/liquidupstart
B=/Users/christof/repos/liquidupstart-backups
{
  echo "# Registry digests, recorded $(date -u +%Y-%m-%dT%H:%M:%SZ) on branch $(git branch --show-current)"
  echo "# Service images (compose.yml)"
  docker compose config --format json | jq -r '.services[].image' | sort -u | grep -v '^liquidupstart/' \
    | while read -r img; do printf '%s\t%s\n' "$img" "$(docker buildx imagetools inspect "$img" --format '{{.Manifest.Digest}}' 2>/dev/null || echo '(lookup failed)')"; done
  echo "# Base images of the local builds"
  for f in config/*/Dockerfile config/*/templates/Dockerfile; do
    [ -f "$f" ] || continue
    b="$(grep -m1 '^FROM ' "$f" | awk '{print $2}')"
    [ -n "$b" ] && printf '%s\t%s\t%s\n' "$f" "$b" "$(docker buildx imagetools inspect "$b" --format '{{.Manifest.Digest}}' 2>/dev/null || echo '(lookup failed)')"
  done
  echo "# The two OpenClaw tags side by side — the move this work exists because of"
  for t in 2026.7.1 2026.9.1 latest; do
    printf 'ghcr.io/openclaw/openclaw:%s\t%s\n' "$t" "$(docker buildx imagetools inspect "ghcr.io/openclaw/openclaw:$t" --format '{{.Manifest.Digest}}' 2>/dev/null || echo '(lookup failed)')"
  done
} > "$B/digests-after.txt"

diff <(grep -v '^#' "$B/digests-before.txt") <(grep -v '^#' "$B/digests-after.txt") \
  && echo "no tag moved during this run" || echo "the differences above are what moved"
```

---

## 5. Where the result goes

Paste the output of steps 3, 4 and 5 into `.pr-drafts/RESULT-baseline-cold-start.md`. A result that
exists only in a terminal has to be carried by hand, and that is where it is lost.

Record what happened either way. A cold start that simply works is worth knowing: A7-5, the only
other one this project has ever run, found four product defects and six errors in its own procedure,
and every one was invisible until someone executed the document line by line.
