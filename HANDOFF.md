# Handover — 2026-09-09 (evening)

Read this first. It is the map and the current state; the specifications are the documents in
`docs/`. Everything here was true at the end of 2026-09-08.

## What is being built

**Three features and two repairs**, on five branches.

**The git integration** (#9) gives the agent harnesses OpenClaw and OpenCode version control:
repositories declared in the configuration, cloned into a shared workspace, each with its own deploy
key, guardrails on what an agent may push, and one sanctioned command through which work leaves the
stack. The operator's own words for the need are in §1.1 of `docs/FEATURE-git-integration.md`.

**The Java extensions** (#10) let an agent write a NiFi processor and get it into Liquid. They
*consume* the git integration and contribute nothing back to it, which is why they have their own
documents since 2026-09-03.

**The OpenClaw 2026.9.1 migration** (#13) moves the stack off the version #11 pinned it to, and makes
the version something the stack reads rather than assumes. Started and largely finished on
2026-09-06, reviewed and **merged into `fix/openclaw-2026-9-1` on 2026-09-08** — which is #11, not
`main`.

**The two repairs** are #11 (the pin, after a floating tag moved) and #12 (`bun_runner`'s health
check, which asked whether the runner had been used rather than whether it works).

All of it doubles as a **trial of test-driven AI development** — the working method is under
evaluation alongside the code, by developers and by people from the business. That is why the
documentation is heavier than the features alone would justify, and why failures are recorded rather
than tidied away.

## Where things live

| File | What it is |
|---|---|
| `docs/FEATURE-git-integration.md` | Use cases, working modes, permission model, requirements, milestones, process log, every goal as posed |
| `docs/TEST-SPEC-git-integration.md` | Every git case: overview row plus detail block, and the verification procedure per milestone |
| `docs/FEATURE-liquid-java-extensions.md` | The same, for the Java extensions. Numbering continues from the git document — U9, FR21 upward |
| `docs/TEST-SPEC-liquid-java-extensions.md` | The Java cases |
| `docs/FEATURE-openclaw-2026-9-1.md` | The migration analysis, in the three-part view: how each part worked, what changed, what had to be adapted |
| `docs/TEST-SPEC-openclaw-2026-9-1.md` | 31 migration cases, OC-1 to OC-31 |
| `docs/PROCEDURE-cold-start.md` | The cold start, **version-neutral**: it reads the pin out of the Dockerfile rather than naming a version, so one document serves 2026.7.1, 2026.9.1 and whatever is pinned next |
| `scripts/linux/image-digests.sh` | `before` / `after`: what every image tag resolves to, so a later difference can be told apart from an upstream move |
| `docs/verification/` | The records, with the raw transcripts. Promoted from `.pr-drafts/` when finished |
| `CLAUDE.md` § Development rules | The commandments this project works to |
| `BACKLOG.md` | What was deliberately deferred, each with why. **Exists only on the feature branches** |
| `.pr-drafts/` | Scratch. Untracked, and **not gitignored on the `main`-based branches** — stage by name, never `git add -A` |

**Documents live on the branch they belong to.** `docs/` does not exist on `main` at all. The
migration documents are on `feature/openclaw-2026-9-1`; the git and Java documents on their own
branches.

## The branches, and how they relate

Current as of 2026-09-08 evening, after #12, #13 and #14 landed. **Nothing has reached `main` yet**:
all three merged into `fix/openclaw-2026-9-1`, which is #11 — so #11 is now the only door to `main`,
and it carries far more than the one-line pin its title suggests. Do not take a number from this
document; it moves every time something lands. Ask:

```bash
git fetch -q origin && git rev-list --count origin/main..origin/fix/openclaw-2026-9-1
```

It answered **39** on the evening of 2026-09-08, having answered 36 two hours earlier.

| Branch | PR | Base | Holds |
|---|---|---|---|
| `feature/git-integration` | **#9**, open | `main` | M-A0 to M-A8 |
| `feature/liquid-java-extensions` | **#10**, open | `feature/git-integration` | M-B1 to M-B3 |
| `fix/openclaw-2026-9-1` | **#11**, open | `main` | The pin to 2026.7.1 — **and now the migration and #12 with it** |
| ~~`fix/openclaw-start-stdin`~~ | ~~#14~~ | — | **Merged 2026-09-08** into `fix/openclaw-2026-9-1`. The `SIGTTIN` hang the migration's own verification found |
| ~~`fix/bun-runner-health`~~ | ~~#12~~ | — | **Merged** into #13. The branch exists only locally now; the remote one is gone |
| ~~`feature/openclaw-2026-9-1`~~ | ~~#13~~ | — | **Merged 2026-09-08** into `fix/openclaw-2026-9-1`, remote branch deleted |
| `integration/oc-2026-9-1` | — | — | **Not a merge candidate.** #13 + #9 + #10 in one place, so the compatibility cases can be *executed* rather than asserted |

Cutting a branch from another is how each PR shows only its own diff. GitHub retargets a stacked PR
by itself once its base lands, so **the open ones can be reviewed in any order and nothing waits.**

**A merged branch is not a landed change.** #12 and #13 are merged and neither is in `main`; they sit
inside #11, and reading their PRs as "done" would misstate what production carries. The same will be
true of #14 the moment it lands.

**#9 must be merged with a merge commit, not squashed.** GitHub retargets #10 by itself, but only
cleanly if the commits it already carries survive — and the individual messages are part of what this
work exists to demonstrate.

**#10 was 28 commits behind #9 and was merged forward on 2026-09-07.** It is level now.

**`integration/oc-2026-9-1` is deliberately behind**, by one commit each on #9 and #10 and nine on
#13 as of 2026-09-07 evening. All eleven are documents plus `scripts/linux/image-digests.sh`; not one
test and not one line of stack code changed, so **Suite 2's 424 stand** — that was measured, not
assumed. Bringing it level is three merges, of which two are clean and one conflicts in
`docs/verification/README.md`, where both sides rewrote the same paragraph.

**The rule, decided 2026-09-07: nothing reaches `main` without Timur's review. Merging forward
inside the stack is fine** — #12 and #13 into `fix/openclaw-2026-9-1`, #9 into #10, the three into
the integration branch — and is how each branch stays reviewable against what it actually builds on.
Whoever runs anything on the integration branch must merge the open ones forward *first*, or they are
measuring a stand that no longer exists. The rule held today: two PRs merged and `main` is untouched.

## One working copy, one stack

`docker compose` reads the `compose.yml` of the checkout at the moment `start.sh` runs, so the
containers keep the mounts, services and images **that branch** declared, no matter what is checked
out afterwards. This cost time three times on 2026-09-05.

**After switching to a branch whose `compose.yml` differs, run `./scripts/linux/start.sh` before
trusting a test run.** One line tells the two shapes apart:

```bash
docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'
```

Silence means the running stack predates the git integration, and the red tests describe the
containers rather than the code.

**Each branch has its own discriminator, because each adds something to the stack.** Naming the
branch a milestone lives on is not enough: the containers are the previous branch's until something
rebuilds them, and a suite run against them measures the containers.

| Working on | Check the running stack with | Absent means |
|---|---|---|
| `feature/git-integration` | `docker compose exec -T openclaw-gateway sh -lc 'command -v git-repo-info'` | The stack predates the git integration |
| `feature/liquid-java-extensions` | `docker compose exec -T opencode sh -lc 'command -v nar-build'` | The stack has no `nar_builder`, and every M-B case is red for that reason alone |
| `fix/openclaw-2026-9-1` or `fix/openclaw-start-stdin` | `docker compose exec -T openclaw-gateway openclaw --version` | Anything but `2026.9.1` means the gateway is not the migrated one |

**And an image is not built just because a service is declared.** `feature/liquid-java-extensions`
adds `nar_builder`, whose image `liquidupstart/nar-builder:latest` exists on no host that has not
built it — `./config/scripts/build/nar-builder.sh` — and changes `config/liquid/entrypoint.sh`, which
is `COPY`ed into `liquidupstart/liquid:latest` rather than mounted, so that image has to be rebuilt
too. §4 check 3b of the Java test specification compares the entrypoint the container runs against
the file on disk, and it exists because a green test over a container running something else is
indistinguishable from a fix that works.

## State

**The stack runs OpenClaw 2026.9.1**, rebuilt from `fix/openclaw-start-stdin` on 2026-09-08 evening
and migrated from a state 2026.7.1 had written — the path a real installation takes, not a cold
start. Nineteen services, every healthcheck green. It ran 2026.7.1 for most of that day, for M-A8 and
M-B3, and was moved forward only to verify the migration; images live on the host and not in the
branch, which is what *"A locally built image can belong to another branch"* below is about and what
cost two hangs before it was understood.

**`volumes/_openclaw` now holds a 2026.9.1 state, so the way back is not a checkout.** 2026.7.1
refuses it — OC-21's one-way door. Returning to #9 or #10 means clearing that directory and
restoring `_openclaw.bak-2026.7.1`.

**The git integration is complete.** M-A0 to M-A8 built, each verified independently and posted to
#9. All four manual cases observed, including the three that failed.

**M-A8 is complete, including its three manual cases.** Built 2026-09-07 as the launchpad card, the
retry and the configuration round trip nothing had ever run — fourteen cases. It is **twenty-six**
now, 65 tests across 14 files, and the twelve that were added came from walking the manual ones. See
*"What 2026-09-08 cost and bought"* below: the card was right from the first screenshot, and
everything around it was not.

A8-15 passed. A8-16 passed on its **fifth** attempt. A8-17 was walked and answered the question it
exists for, in the worst way available: **a start that leaves a repository broken read as success**,
and the operator confirmed they could have walked away without noticing. A8-26 is the answer.

**The Java extensions are complete.** M-B1, M-B2 and M-B3 built and verified — M-B3 on 2026-09-08,
with §4's load checks run by the operator, which is the half that answers the question. **Every
milestone in this project is now built.** What remains is review.

**The migration is verified.** 42 automated cases on the branch itself; **Suite 2 — 424 cases, 0
failures** — on `integration/oc-2026-9-1`, proving it breaks neither feature in flight; and **OC-20**,
the cold start on 2026.9.1, passed manually including the browser half: on a state directory twenty
minutes old the Control UI loaded with no pairing prompt and a turn returned its probe string in five
seconds. Records in `docs/verification/`.

Nothing in the migration is open. OC-3 was **replaced** by a contract case — assert the guard, not
the hazard — and the reasons are in the test specification.

### What 2026-09-08 cost and bought

Three manual cases, five attempts at one of them, and **six defects none of the 334 automated cases
could see** — because every one of them lived on a path no case had ever walked: the operator's.

| | What it was |
|---|---|
| **A8-19** | `config/toolbox/Dockerfile` carried no `git` and no `openssh`, and the dashboard's **Start** button runs the start script inside the toolbox. `git.sh` died at line 17 with `ssh-keygen: command not found`. The button brought up no stack at all, and had not since the git integration was cut |
| **A8-21** | `start.sh` runs `down.sh` on **line 16** and reaches the git step on 139 under `set -euo pipefail`. One malformed declaration removed every container and aborted a hundred lines before anything came back — and did it again on every retry. The declaration is now judged before the teardown |
| **A8-23** | The parser took everything after the colon as the repository path. A URL pasted twice parsed, GitHub answered *"is not a valid repository name"* — a message about the remote, for a mistake in `.env` — and the slug, the key directory and the key's comment were all built from the doubled string |
| **A8-24** | Bun loads the repository's `.env` into `process.env`, `sh()` forwarded it, and `git.sh` prefers the variable over the file. **Every fixture-based case had been reading the operator's live declaration since M-A1.** Invisible while it was valid; a malformed one turned five cases red in milestones nobody had touched |
| **A8-22** | Nothing asserted the retry's control is drawn. Found by the operator asking where the Test button was — correctly absent, because both repositories were cloned. The same shape as the defect this milestone was built for: `/git-auth` complete and called by nothing |
| **A8-26** | The start printed its warning and then 250 lines of certificates and containers, ending in URLs, passwords and `[start succeeded]`. `.install-result` said `start_ok=1`. Exactly the shape U11 forbids |

**None of them was about the card.** It was right in the first screenshot taken of it: both
repositories named, the per-access instruction, the key, the fingerprint matching GitHub's. Five
attempts were spent on everything between the operator and it.

Two things worth carrying beyond this milestone. **The retry produces a *governed* clone** — its own
key selected, `core.hooksPath` set — because it runs `git.sh` with `GIT_REPOSITORIES` narrowed to one
entry rather than calling `git clone` itself. That is what reusing the mechanism buys, observed
rather than argued. And **the stack keeps no start log**: the toolbox runs with `--rm`, and
`.install-result` holds a verdict rather than output. A8-26 exists because the operator pasted the
log by hand.

### A locally built image can belong to another branch

Met twice on 2026-09-08 before it was understood, and written up in `BACKLOG.md`. This branch pins
`ghcr.io/openclaw/openclaw:2026.7.1`; `liquidupstart/openclaw:latest` on the machine was **2026.9.1**,
built from the migration branch. The start wrote a `cliBackends` key, the newer binary rejected it,
and under a pty it asked `Run "openclaw doctor --fix" now? [Y/n]` in a container with no stdin. **The
only symptom was a container that did not come back.**

Repaired by `./scripts/linux/build.sh`, and the state directory had to go with it — `2026.7.1`
refuses a state written by `2026.9.1`, which is OC-21's one-way door. Archived as
`_openclaw.was-2026.9.1.tar` first. The Claude login lives in `volumes/_openclaw-claude`, a different
directory, and survived.

**Why `volumes/_openclaw` will not delete is still unexplained, and the explanation this document
carried was wrong.** It said `openclaw-gateway`'s nested bind mounts hold `workspace` and `skills`,
and that they release shortly after the container is gone. Retested on 2026-09-09 while restoring a
2026.7.1 state, and it does not hold:

- `rm -rf` was retried every five seconds for **200 seconds** with the whole stack down. `workspace`
  and `skills` survived; everything else in the directory was deleted.
- No container existed at all — not one from the compose project, and not `liquidupstart-dashboard`,
  which mounts the whole repository and was stopped as a test. Both `rmdir` calls still returned
  `Permission denied`.
- `df` puts them on the same filesystem as their parent, so they are **not mount points**. Owner is
  `501:20`, the parent is writable, and `ls -lO` shows no file flags.
- **`mv` on the parent worked immediately.** The directory entry is free; the two children are not.

**What works is moving it aside, not deleting it**: `mv volumes/_openclaw volumes/_openclaw.stuck`,
then restore. Whatever holds those two paths survives every container that could plausibly hold them,
which is the part no hypothesis so far explains. `BACKLOG.md` records
`volumes/_openclaw-claude/skills` as the same shape, and it stays unexplained too — the difference is
that it is now unexplained *on purpose* rather than by an answer that sounded right.

### A mismatched NAR loads, and then tells the operator the wrong thing

**M-B3's answer, and it is not the one five milestones had been written around.** FR23 and FR27 both
said a NAR compiled against an API Liquid does not provide is *silently never loaded* and the
processor *never appears*. Measured on 2026-09-08 against a fixture built for it: the bundle **loads**,
the processor **is listed** in the API's catalogue, and `nifi-app.log` says nothing at all. The
mismatch was proven real first — `org.apache.nifi.controller.NodeConnectionState`, the only class
`nifi-api` 2.11.0 holds that the loaded 2.10.0 jar does not, 437 against 436, absent from the built
class's references by `javap`.

**That is worse than never appearing.** A processor that does not show up is annoying and visible the
moment an operator looks for it. One that shows up, drags onto a canvas and breaks when a flow runs
is exactly the silent failure this feature exists to remove. The requirements stand; their reason is
stronger than the one they carried, and every statement of the old mechanism was corrected —
including the refusal `nar-build` prints to an agent, which would have carried the error onward.

**Triggered on 2026-09-09, and the inference was wrong about when.** It does not wait for a flow. The
processor is catalogued and selectable, and **adding it from the canvas fails**:
`POST /nifi-api/process-groups/<id>/processors` answers **500** with
`java.lang.NoClassDefFoundError: org/apache/nifi/controller/NodeConnectionState`. The predicted error
was right; the predicted moment was not. It never reaches the canvas, so it never runs.

**Two things came out of that which are worse than the original finding.**

The error is written to **`nifi-user.log`**, not `nifi-app.log` — zero occurrences in the one every
check in this repository reads, four in the one none of them did. *"The framework says nothing"* was
a conclusion drawn from a single log, not an observation. Both §4 and `tests/verify/m-b3.sh` now read
both.

And **what the operator is told is false**. The UI turns the 500 into `/nifi/#/error`: *"Your session
has expired. Please click on the Home button to renew the session."* It has not. The message sends
them to authenticate again and retry, which reproduces the failure exactly. An operator meeting this
has no path from what they are shown to what is wrong.

**The control ran beside it and was flawless**: the same processor built against the resolved 2.10.0
was added, started, and reached **4,114,541 invocations in five minutes** with no error and no
bulletin. The two differ in one class.

What stays open is a check at deployment time — the entrypoint already walks every `*.nar` into
`lib/`, and the `javap` comparison §4 performs would turn a 500 with a misleading message into a
refusal where an operator can act on it. It is in `BACKLOG.md`, along with the fact that nothing in
the stack notices a NAR of this kind arriving by hand.

**And the check that was supposed to prove this could not.** B3-2 was written as B3-1's control — the
run that shows the check can fail. It cannot be, because it comes back listing its processor exactly
as the positive case does. The control is the third check, which removes both NARs and requires the
type to disappear. It ran, and it is what earns the positive result.

### The verification path had never been run, and it cost more than the milestone

**Seven defects on 2026-09-08, all in `tests/verify/m-b*.sh` and the block they mirror, none in the
product.** `./tests/verify/m-b3.sh` was executed for the first time and did not reach its first check.
Five runs were needed to reach the milestone's question.

| | |
|---|---|
| `mapfile` | A bash 4 builtin; macOS ships 3.2. The scripts run without `set -e` on purpose, so it was noise rather than an abort — `DROP_BEFORE` stayed unset and the restore step deleted **every** file in the drop directory instead of protecting what was there. `M-B1-verification.md` opens by promising the opposite |
| `trap … INT` | Ran the handler and then **resumed**, with `EXIT` running it again at the end. Since restore may restart Liquid and wait, `Ctrl-C` looked like nothing happening. The goal that commissioned `m-b2.sh` asked for "everything restored including on Ctrl-C"; it had never been tried |
| Port 8443 | NiFi's default, not this stack's 8833 — hardcoded two lines below a `SYSTEM_HTTPS_PORT` the script had just read from `.env` |
| `127.0.0.1` | An IP sends no TLS server name, so Jetty answers `400 Invalid SNI`. The token came back as an HTML error page and **every count was zero** |
| Readiness | Taken from Jetty answering (`405` the moment it binds), then from a token being issued — both proxies. NiFi issues tokens before its extensions finish loading |
| Credentials | Read with `sed`, so `.env`'s quotes went into the password. The rejection *"The supplied username and password are not valid"* is not HTML, so the guard passed it into an `Authorization` header |
| A8-13, on #9 | The manifest carried git's **German** error text: the dashboard spawned the script with the operator's locale. It hid because this host has two gits — `/usr/bin/git` without message catalogues and `/opt/homebrew/bin/git` with them, and only the operator's `PATH` finds the second first |

**Two of those produced findings that were false rather than errors that were obvious.** A check
reported *"Liquid does not list our processor"* over a NAR that was byte-identical in `lib/` by
SHA-256. That is the dangerous shape: a broken measurement that answers instead of failing.

**The repair that mattered was none of the seven.** It was giving the checks a control: they now count
`GenerateFlowFile` — a processor every NiFi ships — before drawing any conclusion, and refuse to
conclude when it is absent. The check that most needed it was the one asserting a type is **gone**,
which a broken query satisfies perfectly.

### Tomorrow's first question: Liquid autoloads, and M-B4 guards the other path

**The largest open question this project has, found on 2026-09-09 by a check that refused to be
explained.** `nifi.nar.library.autoload.directory` points at `nar_extensions`, so NiFi loads a NAR
**out of the drop directory, at runtime, without a restart and without `lib/`**. Measured: a NAR built
there and otherwise left alone was listed by the API after **20 seconds**, container `StartedAt`
unchanged, file not in `lib/`. And the catalogue was already carrying `ProbeA` and `ProbeB` —
B3-3's fixtures, which the suite writes there and deletes, which were never in `lib/`, and which
no restart followed. NiFi loads them and never unloads them.

**What is in question, and none of it is settled:**

| | |
|---|---|
| **FR36 / M-B4** | Built, 32 cases green — and it refuses to copy into `lib/` while NiFi loads from the drop directory anyway. It guards a path that does not load |
| **FR29** | The restart it makes the operator's is not required |
| **`nar-build`'s own words** | *"Liquid loads NARs from /nar_extensions at startup only. Ask the operator to restart it"* — printed to every agent, and false |
| **FR30** | The copy into `lib/` holds and looks redundant |
| **M-B3 check 3** | Established that Liquid lists what we build; never separated which path did it |
| **Where the setting lives** | `volumes/liquid/conf/nifi.properties:37` — local state. The stock image says `./extensions`, and nothing in the repository sets it, so **a fresh installation may behave differently and no branch carries the difference** |

**Deliberately not repaired.** Two explanations for the red check were offered and withdrawn the same
day — a leftover unpacked bundle, and an answer from the instance being replaced. Both were wrong,
both were tested, and the second was tested *before* being written down. The third rests on a
configuration value read out of the running container. What the deployment path should be is a
decision to take with a clear head, not a guard to adjust until a check goes green.

**M-B4 is otherwise finished**: `narcheck.py` parses the constant pool properly, 487 + 27 green, and
§4's checks 0, 1, 2, 4 and 5 pass. Check 3 is the one that found this.

### Things on disk that matter

`/Users/christof/repos/liquidupstart-backups/` — **outside the repository on purpose**, because the
root `./cleanup.sh` deletes `volumes/` wholesale and a backup kept inside it dies with the original:

| | |
|---|---|
| `.env.bak` | The 252-line configuration. `cleanup.sh` deletes `.env` too |
| `_git-secrets.bak` | The deploy keys registered with GitHub for both declared repositories |
| `_openclaw-claude.bak` | A Claude Code login (stale — see below) |
| `_openclaw.bak-2026.7.1` | The state the 2026-09-05 baseline left. **This is what OC-28 replays** |
| `_openclaw.working-2026.9.1` | The migrated state, before the upgrade test replayed it |
| `digests-{before,after}.txt` | Registry digests of every image, so a later difference can be told from an upstream move |
| `pr-drafts-2026-09-05/` | The scratch directory before its records were promoted into `docs/verification/` |
| `_openclaw.was-2026.9.1.tar` | The state directory 2026.9.1 left, archived before the rebuild to 2026.7.1 |
| `.env.before-a8`, `.env.before-a8-repair`, `.env.before-a8-repair2` | The declaration before A8-15 touched it, and twice after a malformed entry had to be taken out |

`volumes/repos/csv-columns` is a leftover from the A2-5 observation. **Leave it**: A4-16 uses it as a
clone the feature did not create.

### The Claude login expires, and a long-lived token does not help

Four interactive sign-ins in two days. The login lives only in `volumes/_openclaw-claude` and does
not survive a reset.

**A long-lived `CLAUDE_CODE_OAUTH_TOKEN` was measured and refused.** With the file login set aside and
the token in the process environment a turn still fails `Not logged in`; the same token in the same
empty directory is accepted by the Claude CLI. The in-process Agent SDK — which is what serves turns
on 2026.9.1 — does not authenticate from it. Leaving it in `.env` would be **actively harmful**:
`start.sh` branches on it and skips the sign-in, so an expired login would stop prompting and turns
would fail silently. The full measurement is in `verification/RESULT-openclaw-2026-9-1.md`.

Still open, and now in `BACKLOG.md`: the CLI *does* accept the token, so a CLI call made with it
might materialise a `.credentials.json` the SDK then reads. Nobody has measured that.

### Docker Hub's quota, because it is invisible until it bites

**100 manifest requests per hour, per public IP**, when nobody is signed in — measured from Docker
Hub's own header. Every pull and every digest lookup counts. One cold start fits; a digest snapshot
costs about fifteen lookups, so six exhaust an hour, and the count is keyed to the IP, so colleagues
on one network share it. `docker login` raises it and belongs to the **host's** Docker — nothing goes
into `.env` or the repository. Not an installation requirement; a development-loop one.

## How work proceeds

The cycle is in §7 of `docs/FEATURE-git-integration.md`. In short: write the test cases → **the
operator reviews and signs them off before anything is built** → write the goal → run it **in a fresh
session** → check the evidence is really in the transcript → review the diff against what the cases
meant → update the documents and the process log.

**Execution runs in a fresh session; design and review do not.** The best decisions came out of an
accumulating conversation; executing them is better served by a clean context and the documents.

**A task outside the goal mechanism writes its result to a file**, not only to the chat. A result
that exists only in a transcript has to be carried by hand, and that is where it is lost.

## What the failures taught

**Look in the log the failure belongs to, not the one you know.** For a day this project recorded
that a mismatched NAR is reported nowhere. It is reported — in `nifi-user.log`, by the web layer that
refused the request, while `nifi-app.log` holds nothing. Every check here read `docker compose logs`
and concluded silence, which is a claim about where we looked dressed up as a claim about the system.
The same trap as *a suite is green about the paths it walks*, one layer over: **a log is quiet about
the failures it does not receive.**

**An explanation that fits every observation is not the cause.** On 2026-09-08 this document
recorded, with confidence and a mechanism, why `volumes/_openclaw` would not delete: nested bind
mounts, released shortly after the container. It fit everything seen — the refusal, the paths
involved, the fact that it worked later. On 2026-09-09 it took four measurements to break: the whole
stack down, every container gone including the one that mounts the repository, `df` showing no mount
point, and `mv` succeeding on the same directory `rmdir` refused. The wrong answer had survived a day
of being believed because nobody had tried to disprove it — only to explain what had already
happened. A cause is what survives an attempt to break it, not what accounts for the evidence you
happen to hold.

**A tool that has never been run is not a tool.** The verification scripts were written to make
verification trustworthy, were reviewed, were recorded as passing, and carried seven defects between
them — one of which made them delete the directory they promised to protect. Every one surfaced on
the first actual execution, and the milestone they were meant to check took less effort than they
did. The suite has the same property but hides it better: a case nobody runs is a claim, and the
whole point of this project is the difference between the two.

**A count of zero is not a result until something that must be there is counted.** Twice on
2026-09-08 a check answered *"Liquid does not list our processor"* over a NAR that was byte-identical
in `lib/` — once because the request went to an IP that Jetty refuses, once because the catalogue had
not finished loading. Neither failed; both **answered**. A negative reading needs a positive control
in the same breath, and the check that needed it most was the one asserting something is absent,
which any broken query satisfies.

**Readiness is not a proxy you like the look of.** Four criteria were tried in one afternoon: the
container being up, Jetty answering, a token being issued, and finally the catalogue containing a
processor every NiFi ships. Each was closer and each was still standing in for the thing the check
actually reads. The last one is not clever — it is simply the same question the check asks.

**A machine can hold two of the same tool.** A8-13 was green in every session and red in the
operator's, on the same commit, because `/usr/bin/git` has no message catalogues and
`/opt/homebrew/bin/git` has German ones. Nothing about the code differed; the `PATH` did. Anything
whose output is parsed must be pinned to `C`, which `tests/lib/shell.ts` had done since M-A1 and the
dashboard had not.

**And it happened twice the same day, by a different mechanism.** The start hung silently for five
minutes at the state migration, because GNU `timeout` — present only where Homebrew put it — runs its
command in its own process group, `docker compose run` then reads a terminal it no longer owns, and
the kernel stops it with `SIGTTIN`. The call was *bounded*, which is what OC-3 requires, and the
bound did not save it. Both defects are the same lesson at two levels: **what is installed on the
operator's machine is part of the system under test**, and neither `PATH` nor locale is a detail a
suite can leave to chance. Neither would ever have surfaced on CI.

**A suite is green about the paths it walks.** 334 cases passed while the dashboard's Start button
could not bring up a stack, a malformed declaration destroyed a running installation, and a start
that left a repository broken ended in the word *succeeded*. Nothing was wrong with the cases. They
had simply never been on that path, because until M-A8 no case asked what an **operator** does — and
the milestone that finally did found six defects in three sittings. The lesson is not "write more
tests"; it is that coverage is a claim about *routes*, and this suite's routes were an agent's.

**A test that reads only stdout cannot tell silence from failure.** A8-26's own helper joined a shell
function to its call with a semicolon, which put one at the start of a line. `bash` refused the whole
script, stdout came back empty — and empty is exactly what *"nothing needs attention"* looks like.
The helper now asserts the child's exit status. The same day, five unrelated cases went red because
`sh()` forwarded the operator's `.env`; both are the harness being wrong in a way no assertion was
watching.

**Assert the property, not the circumstance.** Tests were green and wrong the same way: they encoded
what had *not* been done. The newest instance is from 2026-09-06 and was written that same morning —
OC-22 asserted that `claude-opus-5` was present with its 1M context window, and passed while the
model could not be selected at all, because 2026.9.1's model policy did not allow `claude-cli/*`.
**Being catalogued is not being usable.**

**Facts are computed, conduct is taught.** Where a question has a determinable answer, give the agent
a way to ask. This is now also how the stack configures itself: the start script reads
`openclaw --version` from the built image and `meta.lastTouchedVersion` from the state, rather than
inferring either from the Dockerfile's pin. A pin plus a comment goes false the moment someone
changes the pin.

**Pin what you depend on.** A floating tag moved on 2026-09-05 and broke four things in a stack whose
own code had not changed since June. And a pin is not one line: three helper containers in the start
script still ran on `:latest` for another day, configuring a gateway running something else.

**Measure before you build.** On 2026-09-06 a coherent chain of reasoning — the wrapper is bypassed,
so its environment is not injected, so authentication fails — was wrong. The cause was an expired
login. The operator asked what exactly was being proposed instead of letting it be built, and one
message of measuring replaced a change against a problem that did not exist.

**A payload is not a page.** M-A8's whole point was that the route had been correct and unread for
four milestones, so its case had to assert the *served page*. SvelteKit embeds the page data in the
HTML for hydration — so `html.includes(publicKey)` is green on a page that ships the key and draws
nothing, which is the same defect one layer out. The assertion strips `<script>` blocks first, and
the control that proves it can fail was run: with the key file removed the label still renders and
the key is gone.

**A green suite says nothing about a path nobody walks.** Two whole classes of defect surfaced only
when someone tried to *use* the thing: the upgrade path (every existing installation's situation, and
no cold start can reach it, because it deletes the state first) and sending an actual message (which
found the model allowlist and the in-process SDK).

**A criterion that depends on when you look is not a criterion.** The service sweep this project used
since A7-5 reported "all running, none unhealthy" while the gateway was on its tenth restart:
`docker compose ps` shows a crash-looping container as `running` with health `starting` between two
crashes. `tests/lib/health.ts` reads status, `RestartCount` and health per container instead.

**A block needed in two places belongs in neither.** The cold-start procedure told the operator to
reuse another step's block "with a run-specific name", and the name was pasted literally as
`<this run>` — the third placeholder inside a runnable block in one week, and this one was introduced
while fixing the previous one. The block became `scripts/linux/image-digests.sh`, which owns the
naming so nothing has to be filled in. Its first run found that `:latest` had moved again — and that
the two images report the *same version and commit* with different digests, so **a version string does
not identify an image**.

**A check that cries wolf is worse than no check.** That same script, run once too often, hit Docker
Hub's rate limit and reported every image as unreadable — which, diffed against a good snapshot, reads
as though every tag had moved at once. Failures are now excluded from both sides, incomplete snapshots
are named so they cannot become a later reference, and the verdict says what was actually compared.

**An `if` condition is where `errexit` goes to die.** `if ! emit > "$OUT.partial"` reads like a guard
and is not one: bash suspends `set -e` for everything the condition calls, so a failed
`docker compose config | jq` ran on, the later stages produced their lines, and `emit` returned the
status of its last loop. The result was a stub snapshot *stamped as the reference* — the exact
poisoning the temporary file had been added to prevent, one layer up. A stage whose failure must
count has to be read into a variable and checked, or the guard is decoration. Sibling of *a bound
that cannot bind*: both looked right in the diff and did nothing when run.

**`grep` under `pipefail` has now cost three findings.** It exits 1 when nothing matches, which is
not an error but is indistinguishable from one: it aborted a start for an `.env` predating a key,
truncated a script that searched for an absent line, and ends `image-digests.sh show` for a stack
whose images are all built locally. `awk` filters without an opinion about emptiness, and where
`grep` is the right tool the exit has to be handled where it happens.

**Do not let a document exist twice.** Promoting the cold-start procedure from `.pr-drafts/` to
`docs/` left two copies; every repair went into one while the operator worked from the other, so a
fix that had been reported as done was hit again. It is the same failure the tests are explicitly
built to avoid — they read the thing under test out of its real file rather than carrying a copy.

**The manual cases earn their place.** Six observed by 2026-09-05, three failed, and two of those
failures were the *case* being wrong rather than the agent. On 2026-09-06 OC-8 and OC-9 turned out
not to be automatable at all: with and without the setting the stack answers identically on every
route, and the pairing decision happens only after a browser signs a challenge.

## Next

0. ~~**A8-15, A8-16 and A8-17**~~ — walked 2026-09-08. Step 3 of A8-17 answered yes, which is the
   finding, not the pass.
0. ~~**Timur's two reviews of #11**~~ — answered 2026-09-10 (F1–F10) and 2026-09-11 (N1–N10), every
   finding reproduced before it was touched and every fix carried by a case run against its control.
   Two of the fixes were the interesting ones. The bound on every `docker run` was decorative:
   coreutils `timeout` reaches the docker *client*, and a node PID 1 without a handler ignores the
   SIGTERM it forwards — `--init` is what makes a bound a bound. And `if ! emit` cannot see a failing
   pipeline stage, because bash suspends `errexit` for the condition of an `if`; the F10 repair had
   turned a rejected snapshot into an accepted stub. Three of my own came out of the same work,
   including `grep -v` under `pipefail` for the third time: it exits 1 when nothing is left, which
   ends `image-digests.sh show` for a stack that pulls no images. `awk` has no such opinion.

   **The reply to the second review is not posted and the branch is not pushed.**
0. **The autoload finding** — see *"Tomorrow's first question"* above. Nothing else in this list
   matters until it is decided, because M-B4 and part of M-B2 rest on it.
1. ~~**M-B3**~~ — built and verified 2026-09-08. Its negative control did not do what it was written
   for, and that is the milestone's result rather than a defect in it: see *"A mismatched NAR loads,
   and nothing says so"* below. The stack on this machine is now `feature/liquid-java-extensions`-shaped
   and its Maven cache is warm again; the four commands that got it there are in the branch table's
   discriminators above.

   ~~**Nobody has triggered a mismatched processor.**~~ — triggered 2026-09-09. It fails at
   *instantiation*, not at trigger; the error lands in `nifi-user.log` where nothing looked; and the
   operator is told their session expired. See *"A mismatched NAR loads, and then tells the operator
   the wrong thing"* above.
3. ~~**The repaired migration path had never been executed.**~~ — run 2026-09-09. A 2026.7.1 state
   was restored from `_openclaw.bak-2026.7.1` and `./scripts/linux/start.sh` migrated it with GNU
   `timeout` on `PATH`, which is the condition that produces the hang: `state migrated.` inside a
   minute, no `SIGCONT`, no stall. The whole upgrade path came with it — `deviceAutoApprove` written
   into a state that had never carried it, `plugins.entries.codex` removed as a key 2026.9.1 refuses,
   and the config shape moved to 2026.9. `tests/run.sh oc` then ran **50 pass, 0 fail** against a
   state that had just been migrated rather than one already on 2026.9.1.
2. **Timur's reviews.** #12, #13 and #14 were reviewed and merged on 2026-09-08; **#9, #10 and #11
   are open**, and #11 is next — it is on his list for 2026-09-09. They run in parallel and block
   nothing, which is what the stacking is for, with one exception: **#11 is the only door to `main`**,
   and it has stopped being a one-line pin. The whole migration, #12 and #14 sit inside it. Reviewing
   it as though its title were still accurate would be reviewing the wrong thing.

   The working copy is currently on `fix/openclaw-start-stdin` and the stack is 2026.9.1-shaped.
   `volumes/_openclaw` holds a state 2026.9.1 has written, so **going back to #9 or #10 means
   clearing it and restoring `_openclaw.bak-2026.7.1`** — OC-21's one-way door, and the discriminators
   above say which stack is running.
3. **The repaired migration path has never been executed.** #14 fixes the `SIGTTIN` hang, the case
   asserts it at the text level and its control was run — but the start that verified it *skipped*
   `openclaw_migrate_state`, because the state was already 2026.9.1 by then. Running it in anger
   needs a 2026.7.1 state restored first, which is OC-28's replay. After a day in which eight of nine
   defects sat in code nobody had ever run, this is the obvious loose end.
4. ~~`BACKLOG.md`~~ — done 2026-09-07. All three feature branches carry one; the migration branch
   was the one without, and its file holds the four things 2026.9.1 deferred plus the `bun_runner`
   entrypoint alternative that #12 had nowhere to record. Two entries on #9 and #10 are answered
   rather than open — the Claude CLI install, fixed 2026-09-05, and `bun_runner` reporting unhealthy
   with no app, fixed by #12.

~~**The working copy is `main`-shaped and its `volumes/` was destroyed by OC-20.**~~ **Repaired
2026-09-07 while running M-A8**, because the second gate cannot pass without it. Three things had to
happen, and the next person switching branches will need the same three:

1. `tar -xf ../liquidupstart-backups/_git-secrets.tar -C volumes/` — the archived keys are the ones
   registered with GitHub, and both declared repositories cloned on the first attempt with them.
2. `./scripts/linux/start.sh` — the containers were still the `main`-shaped ones. The discriminator
   in "One working copy, one stack" above is what says so; it now answers
   `/usr/local/bin/git-repo-info`.
3. `./config/scripts/build/opencode.sh`, then `docker compose up -d opencode`. **OC-20 rebuilt all
   four images from a `main`-shaped checkout**, so `liquidupstart/opencode:latest` had no `ssh` and
   A3-7 failed on it — the same gap M-A3 fixed in the templates months ago, reintroduced by building
   from a branch that does not carry the fix. The other three images were not rebuilt and did not
   need to be, but **any image built during OC-20 is suspect on a feature branch** and the check is
   one line: `docker compose exec -T <service> sh -lc 'command -v ssh git'`.

Both gates then passed: `./tests/run.sh m-a8` 35/35, and `./tests/run.sh` 312/312 plus the 27
dashboard tests.
