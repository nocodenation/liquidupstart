# A cold start, whichever OpenClaw the branch pins · **manual**

The path a new operator takes: a reset checkout, `.env` from the example, build, start. Every other
case in this project runs against a stack that is already up, so anything that only works because of
state an earlier run left behind is invisible to all of them.

**This procedure does not name a version.** It reads the pin out of
`config/openclaw/templates/Dockerfile` and requires the running container to report *that*. Writing
the number into the prose is how a document goes false the moment someone changes the pin — the same
reason the start script reads `openclaw --version` from the image rather than trusting the
Dockerfile's comment.

| Run | Pin | Record |
|---|---|---|
| **OC-BASE**, 2026-09-05 — the baseline the migration is measured against | 2026.7.1 | `verification/RESULT-cold-start-2026.7.1.md` |
| **OC-20** — the same path on the new version | 2026.9.1 | **not yet run**; its record will be `verification/RESULT-cold-start-2026.9.1.md` |

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
| **Component** | The whole stack, from a reset checkout, on whichever branch is checked out. |
| **Shape** | Depends on the branch, and step 5 check 7 reads it rather than assuming: a `main`-shaped branch has **no git integration and no `nar_builder`**, and checking for them would fail a run that succeeded. On a branch that has them, their absence is the failure. |
| **Expected** | `build.sh` and `start.sh` both exit 0; OpenClaw in the container reports **the version the Dockerfile pins**; the Control UI answers **200**, not the 403 that an unattributable proxy gives; `openclaw config validate` reports the live configuration valid; the Claude CLI in the image runs and reports a version; and every service is running, with **zero restarts**, every healthcheck green. |
| **Failure** | Any non-zero exit, a 403 from the Control UI, a service not running or restarting, or any healthcheck that has not reached `healthy`. |

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

### Step 1 — record what the moving tags point at today

A7-5 established that seven of the images a cold start pulls hang on tags that can move. Recording
the digests means that when a later run differs, the cause can be told apart: this repository, or an
upstream move.

**Take it per run**, into a file named for this run — the 2026-09-05 snapshot is in
`digests-before.txt` and must not be overwritten, because comparing a later run against it is the
whole point. Use the block from step 6 with a run-specific output name.

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
script -q /Users/christof/repos/liquidupstart-backups/build-coldstart-$(date +%Y%m%d-%H%M).log \
  ./scripts/linux/build.sh
echo "build.sh EXIT=$?"
```

Expect `EXIT=0`. This pulls whatever `config/openclaw/templates/Dockerfile` pins, and the build ends
in `claude --version`, so an install that produces nothing fails instead of shipping — which is what
it did on 2026-09-05, silently, before that check was added.

### Step 4 — start

```bash
cd /Users/christof/repos/liquidupstart
script -q /Users/christof/repos/liquidupstart-backups/start-coldstart-$(date +%Y%m%d-%H%M).log \
  ./scripts/linux/start.sh
echo "start.sh EXIT=$?"
```

The interactive Claude sign-in appears here. Follow it.

> **`script`, not `| tee` — do not simplify this back.** A pipe makes stdout a pipe, `start.sh`
> tests `[[ -t 0 && -t 1 ]]`, finds no terminal and takes its non-interactive branch: no sign-in URL
> is ever printed, and the run waits fifteen minutes for a login that cannot be given. `script`
> allocates a pty, so the child sees a real terminal *and* the session is written to the log.
> Verified on this machine rather than assumed — `script` also propagates the command's exit status
> (a child exiting 7 makes `script` exit 7), which is why `$?` on the next line is trustworthy where
> `${PIPESTATUS[0]}` was not.
>
> **If the sign-in prompt does not appear anyway**, `start.sh` says to run
> `docker compose exec -it openclaw-gateway …`. **That cannot work at this point**: the sign-in step
> runs *before* `docker compose up` and there is no container yet. Use a throwaway container, which
> is what the script itself does internally:
>
> ```bash
> docker run --rm -it --user 0:0 -e HOME=/home/node \
>   -v /Users/christof/repos/liquidupstart/volumes/_openclaw-claude:/home/node/.claude \
>   --entrypoint /usr/local/bin/openclaw-claude \
>   liquidupstart/openclaw:latest auth login --claudeai
> ```
>
> The waiting run picks the login up by itself. This is a **product defect**, recorded in the result.

**Step 4b — only if the sign-in cannot be completed:**

```bash
cp -a /Users/christof/repos/liquidupstart-backups/_openclaw-claude.bak \
      /Users/christof/repos/liquidupstart/volumes/_openclaw-claude
./scripts/linux/start.sh
```

Note in the record that this was used, because it means the sign-in path was not exercised.

**Step 4c — the deploy keys, on a branch that carries the git integration.**

`./cleanup.sh` deleted `volumes/`, and `git.sh` generates a fresh key pair when it finds none — so
after a reset the keys are new and the repository host does not know them. A `main`-shaped branch has
no clones to make and can skip this.

`git-repo-info` reports it plainly rather than failing silently, and that message is the feature
working rather than a fault:

```
clone status   not cloned — git@github.com: Permission denied (publickey)
```

Print the public halves, register each with its repository, then start again so the clones are made:

```bash
cd /Users/christof/repos/liquidupstart
for d in volumes/_git-secrets/repos/*/; do
  echo "=== ${d} ==="; cat "${d}id_ed25519.pub"
done
# register each at https://github.com/<owner>/<repo>/settings/keys/new
# write access only where .env declares |write|, then:
./scripts/linux/start.sh
ls volumes/repos            # expect one directory per declared repository
```

Confirm the clones before running any suite, so a red run is never mistaken for a broken feature.
On 2026-09-07 four cases failed for exactly this reason and were briefly taken for a compatibility
defect of the OpenClaw migration.

### Step 5 — the acceptance, in one block

```bash
cd /Users/christof/repos/liquidupstart
PINNED="$(grep -m1 '^FROM ' config/openclaw/templates/Dockerfile | sed 's|.*openclaw:||')"
echo "=== acceptance, against the pin this branch carries: ${PINNED} ==="

echo "-- 1. OpenClaw version (must equal the pin, read above, not typed here)"
docker compose exec -T openclaw-gateway openclaw --version | grep -q "$PINNED" \
  && echo "   matches ${PINNED}" || echo "   FAIL: container does not report ${PINNED}"

echo "-- 2. Control UI (expect 200; an unattributable proxy gives 403 proxy_attribution_required)"
curl -s -o /dev/null -w '   HTTP %{http_code}\n' -H 'Host: openclaw.localhost' \
  "http://127.0.0.1:$(grep -E '^SYSTEM_HTTP_PORT=' .env | cut -d= -f2- | tr -d '"')/"

echo "-- 3. Live configuration valid"
docker compose exec -T openclaw-gateway openclaw config validate

echo "-- 4. Claude CLI in the image runs (the npm --allow-scripts repair)"
docker compose exec -T openclaw-gateway claude --version

echo "-- 5. bun_runner specifically (BR-5)"
docker inspect bun_runner --format '   status={{.State.Health.Status}} streak={{.State.Health.FailingStreak}}'

echo "-- 6. every service: running, zero restarts, every healthcheck green"
docker inspect $(docker compose ps -q) \
  --format '{{.Name}}\t{{.State.Status}}\trestarts={{.RestartCount}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' \
  | sed 's|^/||' \
  | awk -F'\t' '$2 != "running" || $3 != "restarts=0" || ($4 != "healthy" && $4 != "no-healthcheck")' \
  | grep . && echo "   FAIL: the services above" || echo "   pass: all running, zero restarts, all healthy"

echo "-- 7. the branch's own shape (git integration present or absent, as it should be)"
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info' 2>/dev/null \
  || echo "   git-repo-info absent — correct on a main-shaped branch, a FAILURE on a feature branch"
```

Expected: the version matches the pin · `HTTP 200` · configuration valid · a Claude version ·
`status=healthy streak=0` · `pass: all running, zero restarts, all healthy` · and check 7 matching
the branch.

> **Check 6 is not the one this project used until 2026-09-06, and the difference matters.** The old
> sweep filtered `docker compose ps` for `unhealthy|Restarting`. A container in a restart loop reads
> as `running` with health `starting` in the window between two crashes, so a single sample can call
> a crash-looping stack sound — which is exactly what it did while the OpenClaw gateway was on its
> tenth restart, and the result was reported as "all running, none unhealthy". A criterion that
> depends on when you look is not a criterion. This one names three positive conditions instead: the
> container runs, it has not restarted, and if it declares a healthcheck it has reached `healthy`
> rather than sitting in `starting`.

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

Paste the output of steps 3, 4 and 5 into `.pr-drafts/RESULT-cold-start-2026.7.1.md`. A result that
exists only in a terminal has to be carried by hand, and that is where it is lost.

Record what happened either way. A cold start that simply works is worth knowing: A7-5, the only
other one this project has ever run, found four product defects and six errors in its own procedure,
and every one was invisible until someone executed the document line by line.
