# Test cases for review — `bun_runner` health check

Branch `fix/bun-runner-health`, cut from `main`. **Nothing is implemented yet.** These cases are
written for sign-off first, as the cycle in `docs/FEATURE-git-integration.md` §7 requires.

---

## 1. The defect

`bun_runner` is a **deployment target**, not a service. Its entrypoint
(`config/bun_runner/entrypoint.sh`) waits for an operator to place an application into
`volumes/bun_app/`, then installs it, builds it, and serves it on port 3000:

```sh
while [ ! -f /bun_app/package.json ]; do
  sleep 5s
done
```

`volumes/bun_app/` is empty on every stack where nobody has deployed anything — including a fresh
installation. The container therefore does exactly what it was built to do: it waits.

The health check in `compose.yml` asks a different question:

```yaml
test: ["CMD-SHELL", "bash -c '> /dev/tcp/127.0.0.1/3000'"]
```

Nothing listens on 3000, because there is nothing to serve. Observed on 2026-09-05:

```
"Status": "unhealthy", "FailingStreak": 112
"Output": "bash: line 1: /dev/tcp/127.0.0.1/3000: Connection refused"
```

The check asserts **the circumstance** — an application has been deployed and is serving — where it
should assert **the property**: the runner is available. This is the same failure mode recorded in
`HANDOFF.md` under *"Assert the property, not the circumstance"*, inverted: instead of a test that
passes because something was never done, a check that fails because something was never done.

**Scope.** The service definition is byte-identical to `main`, so this is a defect of the released
stack, and it is repaired on a branch cut from `main` rather than inside a feature branch.

**Impact today is a lying status, not an outage.** `compose.yml` gives the proxy
`bun_runner: condition: service_started`, not `service_healthy`, so nothing waits on it. What it
does damage is acceptance: *"every service running and none unhealthy"* is worthless as a criterion
while one service is red for no reason. That criterion is exactly what the cold-start verification
of the pinned OpenClaw stand depends on.

---

## 2. The proposed change

One line in `compose.yml`. The check runs only when there is something to check:

```yaml
test: ["CMD-SHELL", "[ ! -f /bun_app/package.json ] || bash -c '> /dev/tcp/127.0.0.1/3000'"]
```

Nothing else changes — not the entrypoint, not the image, not `interval`, `timeout`, `retries` or
`start_period`.

### Alternatives considered

**Remove the health check entirely.** Rejected: it would also discard the signal in the case where
the check is meaningful — an application that *was* deployed and has stopped serving would then
report healthy. Making a guard silent is not the same as making it correct.

**Have the entrypoint publish its own state** (`waiting` / `building` / `serving` to a file the
check reads). This is the more faithful answer, and it is the project's own idiom — a computed fact
rather than an inference. Rejected **for this branch**: it changes the entrypoint and therefore the
image, on a repair of the released stack whose value lies in being small enough to review in two
minutes. Recorded in `BACKLOG.md` instead.

### A limitation this change does not remove, stated with numbers

While an application is being installed and built, `package.json` exists and nothing listens yet, so
the check fails. That is a false negative of the same family, only narrower.

It is bounded: `retries: 10` at `interval: 30s` means the container is marked unhealthy only after
**10 consecutive failures — five minutes**, and the first build is additionally covered by
`start_period: 5m`. A rebuild shorter than five minutes never surfaces. A rebuild longer than five
minutes reports unhealthy while it runs, and recovers by itself.

This is accepted rather than fixed here, and it is the case the entrypoint-state alternative above
would resolve. It is named so the gap reads as a decision.

---

## 3. Overview

| ID | Level | Sign | Case | Why it is here |
|---|---|---|---|---|
| BR-1 | component | **positive** | Empty app directory → the check passes | The property: an idle runner is available, and available is healthy |
| BR-2 | component | **positive** | Application deployed and serving → the check passes | The change must not break the case the old check got right |
| BR-3 | component | **negative** | Application deployed, nothing serving → the check fails | The guard must still bite; without this the fix is indistinguishable from switching the check off |
| BR-4 | component | **negative — regression witness** | The *old* expression against an empty app directory → fails | Proves the defect was real and that this change is what removes it |
| BR-5 | system | **positive** | The running stack reports `bun_runner` healthy with `volumes/bun_app/` empty | Component cases prove the expression; only this proves the deployed stack |

BR-1 to BR-4 need **no stack and no host files**. They run the health-check expression inside a
throwaway `liquidupstart/bun-runner:latest` container, which is the same environment Docker runs it
in. BR-5 needs the stack up.

**The expression under test is read out of `compose.yml`, not retyped.** A test that carries its own
copy of the configuration stops testing the configuration the moment the two drift apart:

```bash
docker compose config --format json | jq -r '.services.bun_runner.healthcheck.test[1]'
```

BR-4 is the exception and holds a literal, because it is a historical value that will no longer
exist in `compose.yml` after the change.

---

## 4. Detail blocks

### BR-1 — an idle runner is healthy · **positive**

| | |
|---|---|
| **Premise** | `bun_runner` with no application deployed is in its designed state, not a broken one. This is the case that is red today, and the one every fresh installation is in. |
| **Component** | The health-check expression from `compose.yml`, run in `liquidupstart/bun-runner:latest`. |
| **Test data** | `/bun_app` exists and is **empty** — specifically, `/bun_app/package.json` is absent. Nothing listens on port 3000. This is the exact state of `volumes/bun_app/` on this machine and on any installation where nobody has deployed an app. |
| **Steps** | 1. Read the expression from `compose.yml`. 2. Run it in a throwaway container with `/bun_app` empty. |
| **Expected** | Exit code **0**. |
| **Failure** | Any non-zero exit — the check would still call an idle runner unhealthy. |

### BR-2 — a deployed application that serves is healthy · **positive**

| | |
|---|---|
| **Premise** | The counterpart to BR-1. The old check was not wrong about everything: when an application is deployed and serving, healthy is the right answer, and the change must keep it. |
| **Component** | As BR-1. |
| **Test data** | `/bun_app/package.json` holding exactly `{"name":"probe","version":"1.0.0"}` — the file's *presence* is what the check reads, so its contents only need to be valid JSON and are stated so the run is reproducible. A listener on port 3000 started with `bun -e 'Bun.serve({port:3000,fetch:()=>new Response("ok")})'`, which is the real runtime from the real image rather than a stand-in. |
| **Steps** | 1. Write the `package.json`. 2. Start the listener, wait until port 3000 accepts. 3. Run the expression. |
| **Expected** | Exit code **0**. |
| **Failure** | Non-zero — the check would call a working deployment unhealthy. |

### BR-3 — a deployed application that does not serve is unhealthy · **negative**

| | |
|---|---|
| **Premise** | The case that decides whether this is a fix or a cover-up. A check that never fails is not a check, and the difference between "correct" and "disabled" is visible in exactly one place: an application is present and is *not* answering. |
| **Component** | As BR-1. |
| **Test data** | `/bun_app/package.json` holding exactly `{"name":"probe","version":"1.0.0"}`. **No** listener on port 3000 — nothing is started, so the port is closed. |
| **Steps** | 1. Write the `package.json`. 2. Run the expression without starting anything. |
| **Expected** | Exit code **non-zero**. |
| **Failure** | Exit 0 — the guard would have been switched off rather than corrected, and a dead deployment would report healthy. |

### BR-4 — the old expression fails on an idle runner · **negative, regression witness**

| | |
|---|---|
| **Premise** | Without this case, nothing shows that a defect existed. A green suite after a change proves the new state is good; it does not prove the change is what made it good. This case asserts the old behaviour so that the pair BR-1/BR-4 reads as *before and after* rather than as an assertion of the present. |
| **Component** | The expression this repository carried from its introduction until this branch, run in the same container. |
| **Test data** | The literal `bash -c '> /dev/tcp/127.0.0.1/3000'` — deliberately hardcoded, because after the change it no longer exists in `compose.yml` and cannot be read from it. `/bun_app` empty; nothing listening. |
| **Steps** | 1. Run the literal expression with `/bun_app` empty. |
| **Expected** | Exit code **non-zero**, and the message `/dev/tcp/127.0.0.1/3000: Connection refused` — the same text `docker inspect` recorded 112 times. |
| **Failure** | Exit 0. That would mean the observed unhealthy status had some other cause and this change does not address it — the whole branch would need rethinking rather than merging. |

### BR-5 — the running stack reports the runner healthy · **positive, system**

| | |
|---|---|
| **Premise** | BR-1 to BR-4 prove the expression. They do not prove that `compose.yml` delivers it to Docker, that Docker evaluates it as written, or that the container reaches `healthy` rather than sitting in `starting`. Only the running stack shows that. |
| **Component** | The whole stack, started with `./scripts/linux/start.sh`. |
| **Test data** | `volumes/bun_app/` **empty** — the state of this machine, and the state of a fresh installation. |
| **Steps** | 1. Start the stack. 2. Wait for the health check to run at least once (`interval: 30s`). 3. Read the status. |
| **Expected** | `docker inspect bun_runner --format '{{.State.Health.Status}}'` reports `healthy`, and `FailingStreak` is `0`. Additionally: `docker compose ps` shows **no** service that is not running and none marked `unhealthy` or `Restarting` — the criterion the OpenClaw cold-start verification will depend on. |
| **Failure** | `unhealthy`, or a container stuck in `starting` past the first interval. |

---

## 5. Procedure — copy and paste, one block

Self-contained. BR-1 to BR-4 need only Docker, the `liquidupstart/bun-runner:latest` image and this
checkout; **the stack does not have to be running.** BR-5 is separate and needs the stack up.

```bash
cd /Users/christof/repos/liquidupstart

# The expression actually configured, read from compose.yml so the test cannot
# drift away from the configuration it is meant to check.
EXPR="$(docker compose config --format json | jq -r '.services.bun_runner.healthcheck.test[1]')"
OLD="bash -c '> /dev/tcp/127.0.0.1/3000'"
IMG=liquidupstart/bun-runner:latest
echo "expression under test: $EXPR"

run_case() {  # run_case <id> <expected: pass|fail> <expression> <setup>
  local id="$1" want="$2" expr="$3" setup="$4" out rc
  out="$(docker run --rm -e E="$expr" -e S="$setup" --entrypoint bash "$IMG" -c '
      rm -f /bun_app/package.json
      eval "$S"
      sh -c "$E"
    ' 2>&1)"; rc=$?
  if { [ "$want" = pass ] && [ $rc -eq 0 ]; } || { [ "$want" = fail ] && [ $rc -ne 0 ]; }; then
    echo "$id (pass) exit=$rc ${out:+| $out}"
  else
    echo "$id (FAIL) expected $want, exit=$rc ${out:+| $out}"
  fi
}

SERVE='bun -e "Bun.serve({port:3000,fetch:()=>new Response(\"ok\")})" & \
       for i in $(seq 1 40); do bash -c "> /dev/tcp/127.0.0.1/3000" 2>/dev/null && break; sleep 0.25; done'
DEPLOY='printf "%s" "{\"name\":\"probe\",\"version\":\"1.0.0\"}" > /bun_app/package.json'

echo "--- component cases (no stack needed)"
run_case BR-1 pass "$EXPR" ':'
run_case BR-2 pass "$EXPR" "$DEPLOY; $SERVE"
run_case BR-3 fail "$EXPR" "$DEPLOY"
run_case BR-4 fail "$OLD"  ':'
```

Expected output once the change is in:

```
BR-1 (pass) exit=0
BR-2 (pass) exit=0
BR-3 (pass) exit=1 | bash: connect: Connection refused ...
BR-4 (pass) exit=1 | bash: connect: Connection refused ...
```

**Before** the change, BR-1 reports `(FAIL) expected pass, exit=1`. Running the block on the current
`main` first is worth the thirty seconds: it is what makes BR-4 mean something.

BR-5, after `./scripts/linux/start.sh`:

```bash
cd /Users/christof/repos/liquidupstart
sleep 35   # one health-check interval

docker inspect bun_runner --format 'BR-5 status={{.State.Health.Status}} streak={{.State.Health.FailingStreak}}'

docker compose ps --format '{{.Service}}\t{{.State}}\t{{.Status}}' \
  | awk -F'\t' '$2 != "running" || $3 ~ /unhealthy|Restarting/' \
  | grep . && echo "BR-5 (FAIL) services above are not running or not healthy" \
           || echo "BR-5 (pass) every service running, none unhealthy or restarting"
```

---

## 6. Requirements this branch is measured against

`main` carries no requirement register — `docs/` does not exist there. Stated here so the cases have
something to be traced to, and so the branch can be reviewed without the feature branches:

| | |
|---|---|
| **BR-FR1** | A service's health status reflects whether the service is available, not whether an operator has used it. |
| **BR-FR2** | A deployed application that has stopped answering is still reported unhealthy. |
| **BR-NFR1** | The repair changes configuration only. The image, the entrypoint and the health-check timings are untouched, so no rebuild is required to adopt it. |

| Requirement | Covered by |
|---|---|
| BR-FR1 | BR-1, BR-4, BR-5 |
| BR-FR2 | BR-3 |
| BR-NFR1 | The diff: `compose.yml`, one line |

---

## 7. What is not covered, and why

**The build window** (§2) is not asserted. Making it deterministic means controlling how long
`bun install && bun run build` takes, which is a property of whatever application is deployed, not
of this stack. The bound is stated in numbers instead, and the alternative that would remove it goes
to `BACKLOG.md`.

**No case deploys a real application through the entrypoint's own watch loop.** BR-2 and BR-3 place
the `package.json` and the listener directly, because what is under test is the health check, not the
entrypoint. An end-to-end deployment case belongs to whatever specification eventually covers
`bun_runner` as a feature; there is none today, and inventing one here would widen a repair into a
project.
