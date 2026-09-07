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

**Four things must be copied out first**, and out means *outside the repository*: `cleanup.sh`
deletes `volumes/` wholesale, so a backup kept inside it dies with the original. Step 0 makes them.

| What | Why | Restoring it afterwards |
|---|---|---|
| `.env` | `cleanup.sh` deletes it, and it holds every configured value | **Required.** Without it the run measures a default configuration, not yours |
| `volumes/_git-secrets` → `_git-secrets.tar` | The deploy keys registered with the repository host | **A choice** — see below |
| `volumes/_openclaw-claude` → `_openclaw-claude.tar` | The Claude Code login | **A choice** — restoring skips the interactive sign-in |
| `volumes/_openclaw` → `_openclaw-<version>.tar` | OpenClaw's state, tagged with the version that wrote it | Only for the return path: **OpenClaw refuses to start when its state directory was last written by a newer version**, so going back to an older pin needs the matching state. A downgrade is never only a tag change |

**The two choices are the interesting part, and they should be made deliberately.**

Restoring `_git-secrets` and `_openclaw-claude` after the reset saves two registrations and a
browser sign-in — but it also means the run *does not exercise* the path a genuinely new operator
takes. The 2026-09-05 run deliberately did not restore them, and that is how it discovered that a
reset invalidates the deploy keys at all, and that `start.sh`'s own sign-in instructions name a
command that cannot work where they are printed. Both were product defects, and both were invisible
until someone walked the path.

So: **restore them when the run is about something else** (a version change, a rebuild), and **do not
restore them when the run is about the new operator's first hour.** Whichever you choose, record it
in the result — a cold start that skipped the sign-in and one that went through it are different
results.

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

### Step 0 — make the backups, then confirm them

Idempotent, and safe to re-run. **Archives, not directory copies** — see the note below.

```bash
cd /Users/christof/repos/liquidupstart
B=/Users/christof/repos/liquidupstart-backups
mkdir -p "$B"

cp -a .env "$B/.env.bak" && chmod 600 "$B/.env.bak"
[ -d volumes/_git-secrets ]     && tar -cf "$B/_git-secrets.tar"     -C volumes _git-secrets
[ -d volumes/_openclaw-claude ] && tar -cf "$B/_openclaw-claude.tar" -C volumes _openclaw-claude

# OpenClaw's state, tagged with the version that wrote it. Never overwritten: an
# older tagged archive may be the only route back to an older pin.
if [ -f volumes/_openclaw/openclaw.json ]; then
  V="$(docker run --rm --user 0:0 -v "$(pwd)/volumes/_openclaw:/state" --entrypoint node \
        liquidupstart/openclaw:latest -e 'const c=JSON.parse(require("fs").readFileSync("/state/openclaw.json","utf8"));process.stdout.write(String((c.meta&&c.meta.lastTouchedVersion)||"unknown"))' 2>/dev/null)"
  [ -f "$B/_openclaw-$V.tar" ] || tar -cf "$B/_openclaw-$V.tar" -C volumes _openclaw
  echo "OpenClaw state archived as _openclaw-$V.tar"
fi
```

> **Why archives.** The first version of this step copied directory trees and refreshed them with
> `rm -rf`. That fails on this host: `volumes/_openclaw-claude/skills` is an empty directory that
> cannot be removed — not by its owner with a writable parent, not by `rmdir`, and not by `rm` inside
> a privileged container, which answers `Operation not permitted`. It carries no macOS flags and is
> not a mount point, and the cause was not established. It does not need to be: an archive is a
> single file, overwritten rather than deleted, and the whole class of problem disappears. A restore
> extracts into space that `cleanup.sh` has already emptied, so nothing has to be removed there
> either.

Then confirm, and note which branch you are on — the procedure does not care which, but the result
must say, because the branch decides the stack's shape:

```bash
git branch --show-current
ls -A /Users/christof/repos/liquidupstart-backups/ | grep -E '^\.env\.bak$|\.tar$'
```

`ls -A`, not `ls`: **`.env.bak` is a dotfile and a plain `ls` hides it** — the one file that cannot be
reconstructed, invisible in the check meant to confirm it. That was the second defect found by
running this step.

Expect `.env.bak` and at least one `_openclaw-<version>.tar`. `_git-secrets.tar` and
`_openclaw-claude.tar` are absent only if the stack never had them. **If `.env.bak` is missing, stop
here.**

To restore, after the reset:

```bash
B=/Users/christof/repos/liquidupstart-backups
cp -a "$B/.env.bak" .env && chmod 600 .env          # always
tar -xf "$B/_git-secrets.tar"     -C volumes        # optional, see §1
tar -xf "$B/_openclaw-claude.tar" -C volumes        # optional, see §1
# Only to return to an older pin. List what is there, then extract the one you want:
ls "$B"/_openclaw-*.tar
tar -xf "$B/_openclaw-2026.7.1.tar" -C volumes      # a real example, not a placeholder
```

### Step 1 — record what the moving tags point at today

Seven of the images a cold start pulls hang on tags that can move, and one of them moved under this
stack on 2026-09-05 and again on 2026-09-07. Recording what every tag resolves to lets a later
difference be attributed: this repository, or an upstream move.

```bash
cd /Users/christof/repos/liquidupstart
./scripts/linux/image-digests.sh before
```

That is the whole step. The script names the file, remembers the run, and diffs against the previous
snapshot by itself — **nothing has to be filled in**. An earlier version of this step asked the
operator to substitute a run name into a command, and it was pasted literally, because that is what
a copy-paste block invites.

Expect a difference on a `FROM` line whenever the pin has been changed deliberately. **Any other
difference is an upstream move, and worth understanding before you build on top of it.**

If it reports `INCOMPLETE`, the registry refused some lookups — Docker Hub answers **429** to
anonymous manifest requests once a quota is used up. Those images are excluded from both sides
rather than compared, the snapshot is filed as `-incomplete` so it cannot become a later run's
reference, and the verdict says what was actually compared. Wait, or authenticate, and take another.

> **What this caught the first time it ran, on 2026-09-07.**
> `ghcr.io/openclaw/openclaw:latest` had moved again — `sha256:6afe4285…` on 2026-09-05,
> `sha256:a8604855…` two days later. But that image and `:2026.9.1` both report **`OpenClaw 2026.9.1
> (ad6fe23)`**: same version, same commit, different bits. `:latest` had been **rebuilt**, not
> bumped.
>
> **The version string does not identify the image.** A rebuild can change the base layers under an
> unchanged version — which is exactly how npm went from 11 to 12 and shipped an image whose Claude
> CLI had no binary while the build reported success. And **the pin is doing its job**: `:2026.9.1`
> resolves to the digest it had on 2026-09-05, while the floating tag moved twice in three days.

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
./scripts/linux/image-digests.sh after
```

It finds this run's `before` by itself and diffs against it. A difference here means a tag moved
**while the run was in progress** — rare, and worth recording in the result. The interesting
comparison is usually step 1's, against the previous run.

## 5. Where the result goes

Paste the output of steps 3, 4 and 5 into `.pr-drafts/RESULT-cold-start-2026.7.1.md`. A result that
exists only in a terminal has to be carried by hand, and that is where it is lost.

Record what happened either way. A cold start that simply works is worth knowing: A7-5, the only
other one this project has ever run, found four product defects and six errors in its own procedure,
and every one was invisible until someone executed the document line by line.
