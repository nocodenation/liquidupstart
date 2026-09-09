# Feature — Java extensions for Liquid

Custom NiFi processors, written in Java, compiled inside the stack and loaded by Liquid. Python
processors already work end to end; Java has no path at all, because the stack carries no JDK and no
Maven.

**This is not part of the git integration, and it was separated from it on 2026-09-03.** It lived in
`FEATURE-git-integration.md` as "Track B" because that is how the conversation ran, not because it
belonged there. The test is the direction of dependence: this feature *consumes* the agent workspace
that the git integration built, and contributes nothing back to it. Track A was complete and
verified without it.

**It is, however, the best end-to-end test the git integration has.** Every milestone there was
exercised by tests written for it. This is the first real feature to use the workspace, the clones
and the publishing path without having helped design any of them — which is the only way to find out
whether they hold up for work that was not written with them in mind. Findings that turn out to be
about the git integration belong in that document; findings about building and loading NARs belong
here.

**On the numbering.** Use cases start at U9, requirements at FR21, and the milestones keep the names
M-B1 and M-B2. They are not renumbered, because they are already referenced by test cases, commits
and pull request #9, and because two documents in one repository each having a "U1" and an "FR21"
would make every `Covers:` row ambiguous. The gap from U8 is deliberate and this paragraph is why.

**Where this lives.** Branch `feature/liquid-java-extensions`, cut on 2026-09-03 from the tip of
`feature/git-integration` — not from `main`, because this feature consumes the agent workspace and
`main` does not have it yet. Its pull request takes `feature/git-integration` as its base until that
one merges, at which point GitHub retargets it to `main` on its own. That retarget is only clean if
PR #9 is merged with a merge commit rather than squashed; `HANDOFF.md` says why, and it is the kind of
detail that is invisible until it is too late to choose.

**Related documents.** `FEATURE-git-integration.md` for the workspace, the clones and `git-publish`;
`TEST-SPEC-liquid-java-extensions.md` for the cases; `config/agents/skills/liquid/SKILL.md` §6 for
processor development and §6.4 for the deployment path this feature completes.

---

## 1. Use cases

Written before the requirements rather than after. The git integration's own document records that
deriving requirements from capabilities instead of from use cases cost it two milestones; the same
mistake is available here and is cheaper to avoid than to repeat.

- **U9 · Extend Liquid in Java.** An agent writes a custom processor in a repository under the
  workspace and needs it compiled into a NAR that Liquid will actually load. Today the stack has no
  JDK and no Maven, so the agent can write the source and go no further: §6.4 of the `liquid` skill
  documents how to *deploy* a NAR and step 1, "build the NAR", has nowhere to happen. Python
  processors already work end to end (`volumes/python_extensions`), which is why the gap is Java's
  alone.
- **U10 · Get it running.** The built artifact reaches Liquid and the processor appears. The restart
  is the operator's, deliberately — it interrupts every running flow, which is not an agent's call.

---

## 2. Requirements

- **FR21 — Building is one command, from inside the container the agent works in.** `nar-build` on
  the `PATH`, as `git-repo-info` and `git-publish` are. The agent does not assemble a Maven
  invocation, and does not need Docker: NFR4 forbids the socket, and that is not negotiable.
- **FR22 — The answer is synchronous and determinate.** Success names the artifact it produced;
  failure carries the compiler's own words back to the caller. Neither outcome requires reading a log
  file afterwards, because an answer that has to be fetched is one an agent will report without
  having.
- **FR23 — The target version is computed, never declared.** The NiFi and Java versions come from the
  running Liquid, not from `.env`. If the version cannot be read, the build refuses rather than
  guesses. **What a wrong `nifi-api` actually does was measured on 2026-09-08 by B3-2, and it is not
  what this requirement said for five milestones.** The claim was that such a NAR is silently never
  loaded. Observed: it loads, the processor is **listed in the catalogue**, and the framework log says
  nothing. The missing class sits in a method signature, and the JVM resolves those on first use — so
  the artifact is indistinguishable from a working one until a flow runs it. That is worse than never
  appearing, not better: an operator drags a processor onto the canvas and it breaks in production
  rather than at deployment. The requirement stands, and its reason is stronger than the one it
  carried.
- **FR24 — A failed build leaves no artifact.** No partial NAR, and no previous NAR left looking
  current. The drop directory is what Liquid loads on restart, so a stale file there is worse than an
  empty one.
- **FR25 — The builder holds no credentials.** No `_git-secrets`, no deploy keys, no `.env` secrets.
  It compiles source and writes one file.
- **FR26 — The dependency cache lives under `volumes/`.** Like all state (NFR3). Without it every
  build re-downloads the NiFi API and the Maven plugin chain.
- **FR27 — The API compiled against is resolved, not assumed, and is stated.** NiFi versions
  `nifi-api` on its own line: 2.11.0 ships `nifi-api-2.10.0.jar`. The build resolves what the
  distribution was actually built against, writes that version into the project, and prints it. FR23
  asked for the target to be computed; this is the half of it M-B1 got wrong by pinning a version it
  knew was not the one that loads.
- **FR28 — The deployment cycle is documented as one path.** §6.4 of the `liquid` skill opens with
  "Build the NAR(s)" and does not say how. From the source to the processor appearing, in one place,
  naming `nar-build` as the first step.
- **FR29 — The restart is the operator's, and the agent asks for it.** It interrupts every running
  flow. The agent says what it placed and what it needs, and stops there.
- **FR30 — What the drop directory holds reaches Liquid's load path.** The mechanism that makes
  `nar_extensions` mean anything: on start, every `*.nar` in it is copied into `lib/` before Liquid
  launches.
- **FR31 — A deployment step that fails says so.** The copy in the entrypoint currently ends in
  `|| true`, so a failure is swallowed and Liquid starts without the processor with nothing to read.
  A step whose failure is invisible is worse than one that has none.
- **FR34 — What is built is proven loadable, not merely well-formed.** Nothing in M-B1 or M-B2 asks
  Liquid whether it accepted the artifact. B1-5 reads the SPI descriptor inside the archive and B2-5
  asserts the copy into `lib/`; between the copy and a usable processor sits the framework, which has
  never been consulted. The `nifi-api` mismatch M-B2 corrected would have shown itself here and
  nowhere else — the whole argument for the fix was reasoning, never observation.
- **FR35 — Concurrent builds do not corrupt each other.** One builder, one dependency cache, one
  `/repos`. Two builds at once is the ordinary case the moment two agents work, and nothing has ever
  run it.
- **FR36 — A bundle that cannot link against the API Liquid loads is refused at deployment.** The
  entrypoint already walks every `*.nar` in the drop directory on its way into `lib/`; before it
  copies one, it reads the classes the bundle carries and refuses any whose `org.apache.nifi`
  references cannot be resolved from the bundle itself or from `${NIFI_HOME}/lib`. Refused means **not
  copied**: the processor never enters the catalogue, and the operator is told which bundle, which
  class, and what to do. Measured on 2026-09-09, this is what the alternative looks like — the bundle
  loads, the type is catalogued, adding it answers `500` with a `NoClassDefFoundError` that goes to
  `nifi-user.log`, and the operator is shown *"Your session has expired."* The failure is real either
  way; the requirement is about **where** it surfaces, and deployment is the only moment at which the
  operator can act on it. The file in the drop directory is left alone — it is the operator's, and
  FR24 governs what the *builder* writes, not what the entrypoint finds.

- **NFR7 — The build's trust surface is stated, not assumed.** A Maven build downloads plugins from
  the internet and executes them. This is a new trust surface in the stack and is treated the way
  §3.1 treated the write key: named, bounded, and decided rather than slipped in. See §3.2.

---

## 3. The build's trust surface

A Maven build resolves plugins and dependencies from the internet and **executes them**. Adding
`nar_builder` therefore adds a way for third-party code to run inside the stack, and it is named here
rather than left implicit, on the same principle as §3.1: a risk that was decided is reviewable, and
one that was assumed is not.

What is exposed: `volumes/repos`, the source the agent is compiling — which the agent already writes
freely — `volumes/nar_extensions`, where the artifact lands, and `volumes/liquid/logs`, **read-only**,
which M-B1 added and this paragraph exists to declare rather than to slip in. What is not:
`volumes/_git-secrets`, the deploy keys, the `.env` values, and every other service's data. The
builder is a compiler with a drop directory, not a member of the stack's credential-holding set
(FR25).

**Why the logs are mounted at all.** FR23 requires the target version to come from the running Liquid,
and there is no credential-free way to ask it over the network: every `/nifi-api` endpoint that names
a version answers `401`, the UI carries none, and `docker exec` is not available to a container that
NFR4 keeps away from the socket. Liquid does record it, once per start, in
`nifi-app*.log`: `Starting NiFi 2.11.0 using Java 21.0.12+10-LTS`. So the builder reads that line, and
requires Liquid to answer on its HTTPS port before it trusts it — a log line alone would still be
readable after Liquid had been stopped, and would then describe something that is not running. The
mount is read-only and holds no credentials; a NiFi log is a record of flows and startups.

To be exact about what the log route is and is not avoiding: `LIQUID_USERNAME`, `LIQUID_PASSWORD` and
`LIQUID_KEYSTORE_PASSWORD` are fixed defaults in `.env` and are not secrets unless an operator changes
them, so the choice was never about protecting a password. It is about moving parts. An authenticated
call would mint a token, carry a credential the builder otherwise has no use for, and go stale the day
someone does change one — and it would return the same two facts the startup line already carries,
NiFi's version and Java's. B1-1 and B1-12 match on key *names* (`PASSWORD`, `SECRET`, `TOKEN`, `_KEY`),
which over-approximates deliberately: it costs nothing while the builder needs none of them, and it is
the guard that would notice a deploy key arriving later.

**One thing the computed version does not settle.** NiFi 2.11.0 ships `nifi-api-2.10.0.jar`: the API
artifact is versioned separately from the distribution, and its bundled version cannot be read from
outside the container at all. The synthesised project therefore compiles against `nifi-api` at the
NiFi version it read, and — this is the part that matters — the parent pom manages `nifi-api` and
`slf4j-api` as `provided`, so **neither is bundled into the NAR** and the framework's own copy is the
one that loads. The first synthesised pom did bundle them, and B1-5 caught it.

**Amended 2026-09-03, on review: two things above are wrong, and the second matters.**

*The bundled version can be read.* Not from the container, but from Maven: `nifi-utils` at the
distribution's version resolves `nifi-api` to whatever NiFi itself was built against. The evidence is
in the cache this milestone created — `volumes/nar_builder/m2/org/apache/nifi/nifi-api/` holds both
`2.10.0` and `2.11.0`, the first pulled transitively through `nifi-utils:2.11.0` and the second by the
explicit pin. So the correct version is computable after all, by resolution rather than by inspection.

*And the exposure is not only the loud one.* The run recorded the case where `nifi-api` at the target
version cannot be resolved, which fails at build time with `Could not resolve dependencies` — loud,
and easy to give a next step. It did not record the other: the version **resolves and is newer than
the one that loads**. A processor calling a method the newer API added then compiles cleanly and dies
at runtime with `NoSuchMethodError`, when someone runs the flow. That is silent at build time, which
is the failure class FR23 exists to prevent, so recording only the loud half understates it.

It is harmless today, and for a reason worth stating rather than trusting: NiFi raises `nifi-api` only
when the API changes, so 2.11.0 shipping `nifi-api-2.10.0` *is* the statement that nothing changed.
The hole opens on the first release where the two move apart and the newer artifact exists.

*What to do, when M-B2 is specified.* The run framed this as a choice between pinning the version
(explicit, but knowably not the one that loads) and taking it transitively (correct, but implicit).
The choice is false: **explicit means stated, not pinned.** The builder can resolve `nifi-api` through
`nifi-utils`, write *that* version into the pom, and print it in the success line. Computed, written
down, correct and reported — all four, with nothing traded. The explicit value stays as the fallback
for a project that does not depend on `nifi-utils`, and B1-6's own-`pom.xml` path remains the escape
hatch for everything else. M-B2's cases should cover both failure modes, not only the loud one.

What remains: a compromised or malicious dependency can read the source being compiled, write
anything into the drop directory, and reach the network. The third of those is inherent to Maven and
would only be removed by pre-seeding the dependency cache and building offline, which is the upgrade
path if the assessment changes. It is not taken now because the stack runs locally under one
operator, the builds are of the operator's own processors, and the artifact is loaded only after a
restart the operator performs deliberately (U10).

**Reviewers should treat this as its own open question,** separate from §3.1. It is not the same
risk: §3.1 is about what an agent may do with a credential, and this is about what a build may do
with a network.

---

## 4. Milestones

Acceptance is defined in `TEST-SPEC-liquid-java-extensions.md`: a milestone is done when its tests
are green, not when a one-off probe printed the right thing once. The tests live in the same suite as
everything else — `tests/`, run by `./tests/run.sh` — and are selected by milestone as usual
(`./tests/run.sh m-b1`). Splitting the specification does not split the suite.

**M-B1 · `nar_builder` service**
The missing first step of §6.4 of the `liquid` skill. A compose service carrying a JDK and Maven,
sharing `volumes/repos` (the source) and `volumes/nar_extensions` (the drop directory), built by a
script under `config/scripts/build/` in the manner of `bun-runner.sh`. In front of it, `nar-build` on
the agents' `PATH` — the third command in the row `git-repo-info` and `git-publish` began: one
invocation, one determinate answer, the mechanism behind it not the agent's concern.

*Three decisions, taken 2026-09-03 before any case was written:*

**The agent calls a command, it does not drop files and wait.** `bun_runner`'s shape — write into a
shared directory and the service reacts — does not fit a build. A build has an outcome, and FR22
requires that outcome to come back to the caller: a watched directory cannot say when it finished or
hand back the compiler's error, so the agent would report success it never saw. The command reaches
the builder through the `proxy` with a `Host:` header, as every container-to-container call in this
stack does.

**The target version is read from the running Liquid, not written in `.env` (FR23).** Liquid is NiFi
2.11.0 on OpenJDK 21 today, and a NAR compiled against a different `nifi-api` does not fail loudly.
*How* it fails was assumed here and measured only in M-B3: not "never loaded", but loaded, listed and
broken on first use — see FR23, rewritten 2026-09-08 against B3-2's observation. The conclusion is
unchanged and the reason is sharper, so the version is computed at build time and a build that cannot
read it stops.

**The trust surface is §3.2, not a footnote.** The builder holds no credentials (FR25) and its
dependency cache lives under `volumes/` like all other state (FR26).

*Done when:* `./tests/run.sh m-b1` is green — a Java source in the workspace producing a loadable NAR
in `nar_extensions`, a source that does not compile failing with the compiler's own error and leaving
no artifact behind, and a build refusing rather than guessing when the target version cannot be
read.

**M-B2 · The deployment cycle, and the API it is built against**
Three things, and only the first is what the outline anticipated.

*The cycle, documented as one path.* §6.4 of the `liquid` skill tells an agent how to deploy a NAR and
opens with "Build the NAR(s)" — which, since M-B1, is `nar-build`. From source to the processor
appearing, in one place, with the restart named as the operator's and the reason given: it interrupts
every running flow.

*The API the build compiles against.* M-B1 pins `nifi-api` to the distribution's version and Liquid
loads a different one — 2.11.0 ships `nifi-api-2.10.0.jar`. It is harmless today only because NiFi
raises that artifact solely when the API changes. §3 records both exposures, and the second is the
one M-B1 missed: a version that resolves and is *newer* than the one that loads compiles cleanly and
fails at runtime. The fix dissolves the choice the M-B1 run posed between pinned and implicit —
**explicit means stated, not pinned**: resolve `nifi-api` through `nifi-utils` at the distribution's
version, write *that* into the project, and print it.

*The swallowed failure at the end of the path.* Liquid's entrypoint copies every `*.nar` from
`nar_extensions` into `lib/` and ends the copy with `|| true`. A failure there is invisible: Liquid
starts, the processor is absent, and nothing in the log says why. That is the failure class this work
has spent seven milestones removing, sitting in the last step of the very path M-B2 documents.

*Done when:* `./tests/run.sh m-b2` is green, and the one manual case has been observed — an agent
asked to deploy a processor end to end, which is where judgement returns after M-B1 had none to
measure.

**M-B3 · Does Liquid load what we build**
The question this feature has never asked. `nar-build` produces an artifact, the entrypoint copies it
into `lib/`, and there the evidence stops: no case has ever established that NiFi accepts it and the
processor becomes available. That is not a small remainder — it is the only place the `nifi-api`
version can be observed to matter, and M-B2's correction rests entirely on argument because there was
nowhere to look.

*And the negative control is the case that gives it worth.* A NAR deliberately built against the wrong
API must **not** load. Without that, "the processor appeared" proves only that something appeared;
with it, the check has a failure mode and therefore a meaning.

*Also here: two builds at once.* One builder, one cache, one `/repos`. Two agents is the ordinary
situation, and the collision surface has never been touched.

*Done when:* `./tests/run.sh m-b3` is green, and §4's load checks — which restart Liquid, and so live
there rather than in the suite — have been run.

**M-B4 · A mismatch is refused where the operator can see it**
The requirement M-B3's observation produced. `nar-build` already prevents this for everything it
builds — FR27 resolves the API through `nifi-utils` — so the gap is exactly the path §6.4 of the
`liquid` skill documents and nobody here had walked: **a NAR built elsewhere and dropped into
`volumes/nar_extensions` by hand.** For that NAR nothing in the stack looks, and what the operator
eventually meets is a `500` labelled as an expired session.

*Three decisions, taken 2026-09-09 before any case was written:*

**It refuses rather than warns.** A warning leaves the bundle in `lib/`, the type in the catalogue,
and the misleading `500` waiting. Refusing means the processor never appears, which is what the
operator can act on — and it is the same shape as B2-6's decision: the failure is reported, the other
extensions still deploy, and Liquid still starts.

**It parses the constant pool, it does not scan for strings.** A text scan is shorter and reports a
class name that appears in a string literal, which would refuse a **good** bundle. A false refusal is
worse here than a missed mismatch, because it breaks a deployment that was correct. B4-2 is that
case, and it is the reason the decision is not free.

**It starts at `nifi-api`.** A reference is judged only when its package is one the loaded
`nifi-api-*.jar` provides. That catches the measured case — `org.apache.nifi.controller` exists in
2.10.0, `NodeConnectionState` does not — without pronouncing on classes that reach a NAR through a
parent bundle, which this check cannot see. B4-6 holds that line.

*Done when:* `./tests/run.sh m-b4` is green, and §4's deployment checks have been run — a
hand-dropped mismatched NAR refused and named, a good one still deployed, and the catalogue
unchanged by the refused one.

---

## 5. Process log

Filled in at step 7 of each milestone cycle, in the form `FEATURE-git-integration.md` §8 uses, so the
two features' runs stay comparable. Wall clock is local time.

| Milestone | Turns used / bound | Wall clock | Files touched | Evaluator passed something untrue? | Manual rework after the goal | Plan changed? | Had to be reconstructed? |
|---|---|---|---|---|---|---|---|
| M-B1 | 55 / 45 | 2026-09-03 18:16–19:16 (local), 1h00 | 20: `compose.yml`, `config/nar_builder/{Dockerfile,build.sh,BuildServer.java,entrypoint.sh}`, `config/agents/bin/nar-build.sh`, `config/scripts/build/nar-builder.sh`, `scripts/linux/build.sh`, `config/nginx/templates/nginx.conf`, `CLAUDE.md`, 12 test files + `tests/lib/narfixture.ts`, `tests/verify/m-b1.sh`, this document, the test specification | No — the suite was run in the transcript and the two defects it found are recorded in B1-5 and B1-9 | None. The operator's verification ran 2026-09-03 19:45, all eight checks PASS — `verification/M-B1-verification.md` | No — the four fixed decisions held; one addition, the read-only `volumes/liquid/logs` mount, is declared in §3.2 | No |
| M-B2 | ~70 / 50 — over, and the bound was set at where M-B1 landed | 2026-09-03 21:57–22:47 (local), 0h50 | 21: `config/nar_builder/{build.sh,BuildServer.java}`, `config/agents/bin/nar-build.sh`, `config/liquid/entrypoint.sh`, `config/agents/skills/liquid/SKILL.md`, 9 test files + `tests/lib/{entrypointfixture.ts,narfixture.ts,shell.ts}`, `tests/verify/m-b2.sh`, this document, the test specification | No — the suite was run in the transcript, and the two things it could have passed over were caught before the run: a contract test green over an entrypoint the container does not execute (§4 check 3b), and a negative control reading the artifact the previous check had left in `lib/` (§4 check 5) | None. Verified 2026-09-05 16:01, every check PASS — `verification/M-B2-verification.md`. B2-10 was observed the same day and passed, and its failure criterion was corrected in the process | No — the three things the goal named were built as posed, and the one decision it left open (whether Liquid starts after a failed copy) was taken and written down | No |
| M-B3 | 33 / 50 | 2026-09-08 10:14–10:43 (local), 0h29 | 8: `config/nar_builder/build.sh`, `tests/lib/{shell.ts,narfixture.ts}`, 2 test files, `tests/verify/m-b3.sh`, this document, the test specification | No — but it came close twice, and both were caught inside the run: the overlap sample would have been satisfied by a single build (`build.sh`'s own `$(...)` sub-shell inherits the cmdline), and §4's check 4 could not have produced a mismatch at all, because the version it named refuses | Yes, and it took five runs to reach the milestone's question. `tests/verify/m-b3.sh` was executed for the first time on 2026-09-08 and exposed seven defects in the verification path, none of them in the product: `mapfile` (bash 4, so the restore step deleted the whole drop directory rather than protecting it), a `trap` that resumed instead of exiting, a hardcoded 8443 beside a `SYSTEM_HTTPS_PORT` it had just read, an IP address that Jetty answers with `400 Invalid SNI`, readiness taken from Jetty answering and then from a token being issued rather than from the catalogue, credentials read with `sed` so `.env`'s quotes went into the password, and a token guard that rejected HTML but accepted *"The supplied username and password are not valid"*. Two of those produced **false findings** rather than errors. Plus A8-13 on #9: the manifest carried git's German error text, because the dashboard spawned the script with the operator's locale | No — the three things the goal named were built as posed, and the one decision it left open (how the drop-directory write is made safe) was taken and written down | No |

---

## 6. How work proceeds

The same cycle as the git integration, described in §7 of its document: specify the cases, review
them, pose the goal in a fresh session, verify independently, record what was found. That cycle is
not restated here — it belongs to the working method rather than to either feature, and duplicating
it would guarantee the two copies drift.

---

## Appendix: goals as posed

### M-B1 — outcome

`./tests/run.sh m-b1` is green at 55 tests across 12 files, and `./tests/run.sh` at 306 + 27, so
nothing in the git integration regressed. `./tests/verify/m-b1.sh` passes all eight checks of §4,
including both negative controls: with `nar-build` truncated in place the build cases go red, and with
`nar_builder` stopped they go red again. Built: the `nar_builder` service on
`liquidupstart/nar-builder:latest` (a JDK 21 and Maven image from `config/nar_builder/`, the fifth
image this stack builds), `nar-build` on the `PATH` of every service that carries `git-repo-info`, and
an `nginx` block at `nar-builder.localhost` so the command reaches the builder through the `proxy`
with a `Host:` header. Nothing was added to `.env`.

**The four fixed decisions all held, and one thing had to be added.** There is no credential-free way
to ask a running NiFi for its version — every `/nifi-api` route that names one answers `401` — so the
builder mounts `volumes/liquid/logs` read-only and reads the line Liquid writes when it starts,
`Starting NiFi 2.11.0 using Java 21.0.12+10-LTS`, having first required Liquid to answer on its HTTPS
port so the line describes something that is running. That mount is declared in §3.2 rather than left
implicit, which is what NFR7 asks for.

**Two defects the cases caught, both of the kind this feature is about.** The first synthesised pom
bundled `nifi-api-2.10.0.jar` and `slf4j-api` into the NAR, dragged in transitively by `nifi-utils`:
a NAR carrying its own copy of the API the framework provides is exactly the silently-broken artifact
FR23 exists to prevent. B1-5 found it by looking inside the archive; the parent pom now manages both
as `provided`. The second was in a case rather than in the code: B1-9 counted Maven's downloads with
`grep -c '^Downloading from'` while Maven prints `[INFO] Downloading from `, so the count was always
zero and the cache assertion proved nothing. It was found by deleting one artifact from the cache and
watching the count stay at zero — the check a green test cannot make for itself.

**What is not done here, deliberately.** §6.4 of the `liquid` skill still opens with "Build the
NAR(s)" and does not mention `nar-build`; documenting the deployment cycle, and the restart that
belongs to the operator, is M-B2. NiFi ships `nifi-api` on its own version line — 2.11.0 bundles
`nifi-api-2.10.0.jar` — and that bundled version cannot be read from outside the container, so the
build compiles against `nifi-api` at the NiFi version it read. It is never bundled, so the framework's
copy is the one that loads; §3.2 says so and it is the one open question this milestone leaves.

### M-B1 — the NAR builder · posed 2026-09-03

```
/goal Implement M-B1 from docs/FEATURE-liquid-java-extensions.md: the NAR
builder. The acceptance criteria are cases B1-1 to B1-12 in section 3 of
docs/TEST-SPEC-liquid-java-extensions.md, signed off on 2026-09-03. Write those
tests first, then make them pass. There is no manual case in this milestone.

Note the wall-clock time before your first action, and report elapsed time and
turn count when the goal completes.

Why this exists: section 6.4 of config/agents/skills/liquid/SKILL.md documents
how to deploy a NAR and opens with "1. Build the NAR(s)", which nothing in this
stack can do -- there is no JDK and no Maven in it. Python processors work end to
end; Java has no path at all.

Build three things. A compose service nar_builder carrying a JDK and Maven,
image liquidupstart/nar-builder:latest, from a Dockerfile under
config/nar_builder/ in the manner of config/bun_runner/. A build script
config/scripts/build/nar-builder.sh following config/scripts/build/bun-runner.sh,
called from scripts/linux/build.sh. And config/agents/bin/nar-build.sh, POSIX sh
like git-repo-info.sh and git-publish.sh, mounted read-only at
/usr/local/bin/nar-build in every service that mounts git-repo-info today.

Four decisions are taken and are not open:

The agent calls a command; it does not drop files into a watched directory. A
build has an outcome and FR22 requires it to reach the caller. nar-build reaches
the builder through the proxy with a Host header -- X.localhost names do not
resolve inside a container, which has caught this project before.

The target version is read from the running Liquid, never declared. It is NiFi
2.11.0 on OpenJDK 21 today. Assert the shape -- a 2.x.y NiFi version, Java major
21 -- and not the literal, so the next image bump does not fail the suite for a
reason that has nothing to do with this tool. A build that cannot read the
version stops and says so; it never guesses, because a NAR compiled against the
wrong nifi-api is not rejected by Liquid -- B3-2 observed it loading and being
listed, with nothing in the log, and failing only when the processor runs.

The build synthesises the Maven project, unless the source directory already
holds a pom.xml, in which case that one is used unchanged. Both are positive
cases, B1-5 and B1-6: a synthesiser that cannot be overridden is a ceiling for
any processor with real dependencies.

Every refusal from nar-build or the builder names a next step -- a command, a
file to fix, an action. B1-11 enumerates them by reading the sources, not from a
list kept by hand.

FR24 is about the drop directory's state, not the exit code. B1-8 records the
SHA-256 of an existing NAR, runs a failing build, and requires the artifact to be
byte-identical afterwards with no partial file beside it. The failure it guards
against is a stale NAR that Liquid loads on the next restart, which a check that
only counts files cannot see.

The builder holds no credentials (FR25) and B1-12 checks that from inside the
running container, not from compose.yml: a mount can be absent from the
declaration and the path reachable another way. Its dependency cache lives at
volumes/nar_builder/m2 (FR26, NFR3).

Add nothing to .env. If something appears to need a key there, stop and say so
rather than adding one -- .env.example is the contract.

Two files count images and must learn about the fifth: scripts/linux/build.sh
and the line in CLAUDE.md that says four are built locally. Add a start script
under config/scripts/start/ only if the service actually needs one.

One trap, documented in section 4 of the test specification: nar-build is
bind-mounted as a single file, and a single-file mount follows the inode. Any
test or check that disables it must truncate the host file in place and never
rename it -- a rename leaves the container seeing the old file, and the check
would pass for the wrong reason.

Also write tests/verify/m-b1.sh in the form of tests/verify/m-a6.sh: the checks
of section 4 in order, each judged, everything it moves restored including on
Ctrl-C, and a log plus a pull-request comment written to .pr-drafts/.

Record the outcome where the next session will find it, not only in this chat:
the process log row in section 5 of the feature document, an outcome paragraph in
this appendix, and each case's "What it found" block.

The first build will download the NiFi API and the Maven plugin chain. That is
expected and is why the cache exists; do not work around a slow first build by
skipping the cache.

Search the codebase before assuming anything is missing; full implementations
only, no placeholders.

Done when `./tests/run.sh m-b1; echo EXIT=$?` is visible in this transcript with
EXIT=0, and `./tests/run.sh; echo EXIT=$?` also shows EXIT=0, proving the git
integration's milestones have not regressed. Or stop after 45 turns -- that bound
covers the documentation the development rules require, not the code alone.
```

### M-B2 — outcome

`./tests/run.sh m-b2` is green at 43 tests across 9 files, and `./tests/run.sh` at 349 + 27, so nothing
in the git integration or in M-B1 regressed. Built: `nifi-api` resolved rather than pinned, Liquid's
entrypoint made to report the failure it used to discard, and §6.4 of the `liquid` skill rewritten as
one path from source to processor. Nothing was added to `.env`, and nothing needed to be.

**The API is now resolved, stated and correct — all three.** `nar-build --target` answers
`nifi_version 2.11.0`, `nifi_api_version 2.10.0` and
`nifi_api_source org.apache.nifi:nifi-utils:2.11.0, which is what the distribution was built against`.
The resolution is a `dependency:list` over a probe pom depending only on `nifi-utils` at the NiFi
version read from Liquid, run against the same cache under `volumes/nar_builder/m2`; the value is
written into the synthesised project as its own property, `nifi.api.version`, beside `nifi.version`,
which is what lets `nifi-utils` stay at the distribution's version while `nifi-api` sits at the version
the distribution was built against. M-B1 pinned 2.11.0 and Liquid loads 2.10.0; the pin is gone.

**The fallback and the refusal are different branches, and the distinction is the point.** When
`nifi-utils` resolves but declares no `nifi-api` — a project that does not depend on it — the NiFi
version read from Liquid stands, and the source line says that is what happened. When `nifi-utils`
cannot be resolved at all, the build refuses and names the `pom.xml` escape hatch B1-6 proves. A
resolution with nothing to answer about is a fallback; one that cannot answer is a refusal. B2-3 forces
the second with `NAR_BUILD_API_PROBE_VERSION=99.99.99`, carried to the builder over the same header
path as `X-Liquid-Host` — the lever changes what is *resolved*, never what is *declared*, which is why
it does not put a version back into configuration and FR23 still holds.

**The decision B2-6 left open, taken: the copy reports its failure and Liquid starts anyway.** `|| true`
is gone; every file that fails to reach `lib/` is named on stderr with the destination it did not
reach, a summary line counts them, and the next step is given. Liquid still launches, because it hosts
every other running flow and refusing to start over one unreadable extension would take all of them
down — and under `restart: unless-stopped` it would loop the container fast enough to scroll away the
message the operator needs. FR31 asks for the failure to be *visible*, not for it to be fatal, and the
operator is reading `docker compose logs liquid` at exactly that moment because §6.4 tells them the
restart is theirs.

**Two things this milestone caught that a green suite could not have caught for itself.** The
entrypoint is `COPY`ed into `liquidupstart/liquid:latest`, not mounted, so B2-5 and B2-6 would have
been green while the container still executed the old script: the image was rebuilt, the container
recreated, and §4 gained check 3b, which reads the entrypoint out of the running container and diffs
it against the file the cases assert. And §4's check 5 emptied the drop directory and restarted,
expecting the NAR to be gone — but a restart never deletes from `lib/`, so it would have been reading
the copy check 4 caused. It now removes the artifact from `lib/` as well, which is what makes it a
control rather than a second reading of check 4.

**`./tests/verify/m-b2.sh` passes all eight checks, and it found two defects in itself first — both
of the kind a green suite cannot find for itself.** Its readiness check waited for
`docker compose exec liquid ls lib` to succeed, which it does the moment the container is up and long
before NiFi is listening; the negative control then ran against a Liquid that could not yet report its
version, and four cases went red for a reason that had nothing to do with the control. It now waits for
Liquid to answer on its HTTPS port from inside `nar_builder` — the same condition `build.sh` itself
requires before it trusts the log line. The second: check 4 looked for the entrypoint's own report in
`docker compose logs liquid` with a grep that also matched NiFi's `NarAutoLoader` lines, and `tail -8`
pushed the entrypoint's lines out of the window — a check reading the framework's log while believing
it was reading the entrypoint's. It now matches the entrypoint's own vocabulary only.

**One observation worth keeping.** NiFi's own `NarAutoLoader` also watches `nar_extensions`, and on the
restart it says `Found existing bundle with coordinate org.nocodenation.liquid:b2-hand-nar:1.0.0, will
not load` — because the entrypoint had already put that NAR into `lib/`. The autoload directory is not
the supported path in this stack (§6.4 of the skill says so), and this is the log line that shows why
it does not matter: `lib/` wins, and the copy is what loads.

**A stack detail the next session will hit.** Recreating `nar_builder` gives it a new address, and the
`proxy` holds the old one until it is told otherwise: `nar-build` answered `502 Bad Gateway` until
`docker compose exec proxy nginx -s reload`. Nothing in this feature caused it — it is how every
container-to-container call in this stack reaches its target — but it looks exactly like a broken
builder to anyone who has just rebuilt one.

**What is not done here.** B2-10, the manual case, has not been observed: it is the agent's judgement
— whether it asks for the restart or reports the processor as deployed before one has happened — and
its procedure is in §4 of the test specification, self-contained and safe to run on a machine where
M-B1's checks already have. `./tests/verify/m-b2.sh` has been written but is the operator's to run,
because checks 4, 5 and 7 restart Liquid.

### M-B2 — the deployment cycle · posed 2026-09-03

```
/goal Implement M-B2 from docs/FEATURE-liquid-java-extensions.md. Acceptance is
cases B2-1 to B2-9 in section 3 of docs/TEST-SPEC-liquid-java-extensions.md,
signed off 2026-09-03. Write those tests first, then make them pass. B2-10 is
manual and must not be automated.

Note the wall-clock time before your first action, and report elapsed time and
turn count when the goal completes.

Three things.

1. M-B1 compiles against the wrong nifi-api: it reads NiFi 2.11.0 from Liquid and
pins nifi-api to 2.11.0, while the distribution ships and loads 2.10.0. Resolve
nifi-api through org.apache.nifi:nifi-utils at the NiFi version read, write that
into the generated project, and print it beside the NiFi and Java versions.
Explicit means stated, not pinned -- that decision is not open. The read version
stays as the fallback when nifi-utils is absent; B1-6's own-pom.xml path remains
the escape hatch. The resolution demonstrably works: M-B1's cache already holds
nifi-api 2.10.0 and 2.11.0, the first pulled transitively.

2. config/liquid/entrypoint.sh copies every *.nar from nar_extensions into lib/
and ends the copy with `|| true`, so a failure is discarded and Liquid starts
without the processor with nothing to read. Make the failure reported. Whether
Liquid should then start anyway is a decision B2-6 leaves to you: take it and
write it down with the reason, rather than letting it fall out of the code.

That file is COPYed into the image, not mounted. B2-5 and B2-6 read it as text,
so they pass while the container still runs the old script. So also rebuild
liquidupstart/liquid:latest (config/scripts/build/liquid.sh) and recreate the
container, and have the section 4 procedure read the entrypoint from inside the
running container and compare. A green test over a file the container does not
run is the failure this feature exists to remove.

3. Section 6.4 of config/agents/skills/liquid/SKILL.md opens with "1. Build the
NAR(s)" and never says how. Make it one path: nar-build, the drop directory, the
restart. Say the restart is the operator's and why -- it interrupts every running
flow. A rule without its reason is one an agent may decide does not apply.
Additive to that section; change nothing else in the skill.

Do not put the restart in the suite; it belongs in section 4 because it
interrupts running flows. Add nothing to .env -- if something seems to need a key
there, stop and say so.

Write tests/verify/m-b2.sh in the form of tests/verify/m-b1.sh: checks in order,
each judged, everything restored including on Ctrl-C, a log and a pull-request
comment in .pr-drafts/. Its negative controls must name the cases that go red and
the cases that stay green, derived from the sources rather than from a run.
Checks 4 and 5 are a pair -- one shows the NAR reaching lib/, the other shows it
failing to arrive when the drop directory is empty -- and neither means anything
alone.

Record the outcome where the next session will find it, not only in this chat:
the process log row in section 5, an outcome paragraph in the appendix, and each
case's "What it found" block.

Search the codebase before assuming anything is missing; full implementations
only, no placeholders.

Done when `./tests/run.sh m-b2; echo EXIT=$?` shows EXIT=0 in this transcript and
`./tests/run.sh; echo EXIT=$?` does too. Or stop after 50 turns -- a bound set
where M-B1 landed, having been exceeded three times in the same direction.
```

### M-B3 — outcome

`./tests/run.sh m-b3` is green at 15 tests across 2 files, and `./tests/run.sh` at **455 + 27** against
the 440 + 27 the branch stood at, so nothing regressed. Built: the two concurrency cases B3-3 and B3-4,
a fix to the drop-directory write they found, a concurrent path through the existing test harness
rather than beside it, and §4's load checks written out so they run top to bottom. The load checks
themselves were not run — they restart Liquid, and the restart is the operator's.

**The write at the end of `build_command` was broken, and the case found it rather than confirming
it.** It copied into `${DROP}/.${base}.part`, a name derived from the artifact name and nothing else,
and the artifact name comes from the source directory — so two builds of one directory copied into one
file at the same time, and the `INT`/`TERM` trap removed a path that by then could belong to the other
build. The consequence is the shape this feature keeps meeting: a torn NAR does not fail the build,
because Liquid's entrypoint copies whatever it finds into `lib/` on the next restart. It fails a
deployment, later, on a restart nobody connects to it.

**The decision, and why it was that one.** The temporary path is now private to the build process —
`${DROP}/.${base}.$$.part` — and the final placement stays a single `mv`, which is `rename(2)` on the
shared bind mount and therefore atomic: a reader, Liquid's entrypoint included, sees either the
previous artifact or the complete new one, never a partial. The two builds are of the same source, so
which one wins the rename does not matter. The alternatives were a lock on the drop path and a lock in
`BuildServer` keyed by the source; both were rejected for the same reason. They convert a case that can
simply succeed into one that refuses, which means a refusal message to write, an agent that has to
handle it, and legitimate concurrent work serialised — to buy a property `rename(2)` already provides.
FR24 and FR25 do not move: a failed build still writes nothing, and the builder still holds no
credentials.

**Establishing the overlap was the harder half, and the first attempt was nearly worthless.**
`BuildServer` serves on `Executors.newFixedThreadPool(2)`, so two requests fit and a third queues: a
pair that happened to serialise would still both exit 0, and a case checking only that would be
measuring the queue rather than the collision. The overlap is therefore sampled, not assumed — the
builder's `/proc` is read every 150 ms while the pair runs. The first version matched cmdlines against
`/opt/builder/build.sh build <source>` and required more than one, and it would have passed with a
single build running: `build.sh` calls `resolve_target` through `$(...)`, the sub-shell inherits its
parent's cmdline verbatim, and in B3-4 both builds carry the *same* source path anyway, so one build
alone showed up as **four** matching lines. The sample now carries the process id and the parent and
counts only the `build.sh` processes `BuildServer` itself started. The observed pair is two distinct
pids — 13120 and 13121 — present together in 23 of 24 samples across a 7.5 s build.

**What §4 check 4 could not have done, and what replaced it.** The block set
`NAR_BUILD_API_PROBE_VERSION=99.99.99` and admitted it might refuse. It does: that is B2-3's
unresolvable version, `resolve_api_version` fails, the build stops with exit 3 and no NAR is written,
so the check would have produced FR23 working rather than a control. The mismatch is produced instead
through the escape hatch B1-6 keeps — a source directory carrying its own `pom.xml`, used unchanged,
naming `nifi-api` **2.11.0** while Liquid loads **2.10.0**. A version difference alone would prove
nothing, because NiFi raises `nifi-api` only when the API changes:
`org.apache.nifi.controller.NodeConnectionState` is the **only** class present in 2.11.0 and absent
from 2.10.0, 437 against 436, established by listing both jars. The fixture's processor references it,
and the built NAR was inspected rather than argued about — `javap` on `MismatchProcessor.class` names
`org/apache/nifi/controller/NodeConnectionState`, `org/apache/nifi/logging/ComponentLog` and
`org/apache/nifi/processor/AbstractProcessor`, and against
`/opt/nifi/nifi-current/lib/nifi-api-2.10.0.jar` the first is ABSENT and the other two present. That
build reports `pom author` and `downloads 8`, because `nifi-api` 2.11.0 was not in the cache and came
from Maven Central — which is the cache confirming it holds only what the resolution asks for.

**`nar_builder` has M-B2's check 3b problem, and now has M-B2's check 3b.** `config/nar_builder/build.sh`
is `COPY`ed into the image, not mounted, so B3-4 would have been green over a container still running
the write that preceded the fix. `tests/verify/m-b3.sh` opens by diffing `/opt/builder/build.sh` out of
the running container against the file on disk, and names the remedy —
`./config/scripts/build/nar-builder.sh && docker compose up -d --no-deps nar_builder`, which does not
touch Liquid. The image was rebuilt on this branch before B3-4 was run, so the case asserts the fix.

**What remains is the operator's, and it is the milestone's point.** §4 checks 3, 4 and 5 restart
Liquid. They are written out with the fixture, the build, the build-time proof of the mismatch, the API
query and the cleanup, and `tests/verify/m-b3.sh` performs and judges the same sequence. Until they
run, FR34 is specified and not observed, and the sentence M-B2 could only argue — that a NAR built
against an API Liquid does not provide is silently never loaded — is still an argument. **They ran on
2026-09-08, and it turned out to be false.** FR34 is observed: Liquid lists what `nar-build` produces.
And the mismatch does not refuse to load; it loads and says nothing. The argument was right about the
danger and wrong about its shape.

**§4 ran on 2026-09-08 at 17:04 and answered the milestone's question in both directions.** Check 3:
**Liquid loads what we build.** The processor `nar-build` produced is listed by the API, and the NAR
in `lib/` is that build's artifact by SHA-256. FR34 is observed rather than argued, for the first
time in this feature. Check 5 is what earns it: with both NARs removed the type disappears and the
suite is green again.

**Check 4 overturned the reason FR23 and FR27 were written.** Both said a NAR built against an API
Liquid does not provide is silently never loaded and the processor never appears. It is not: the
bundle **loads**, the processor **is listed**, and the log says nothing — with the mismatch proven
real beforehand, `NodeConnectionState` absent from the `nifi-api-2.10.0.jar` Liquid loads. The
requirements stand and their reason is stronger: an artifact that never appears is visible the moment
an operator looks, while one that appears and fails on first use is the silent failure this feature
exists to remove. Every statement of the old mechanism was corrected, including the refusal
`nar-build` prints to an agent, and the record is `verification/M-B3-verification.md`.

**Reaching that answer took five runs of `tests/verify/m-b3.sh` and cost more than building the
milestone did.** The script had never been executed; neither had `m-b1.sh`'s and `m-b2.sh`'s shared
line. Seven defects came out of it, all in the verification path and none in the product, and two of
them produced **findings that were false rather than errors that were obvious** — a check reporting
"Liquid does not list our processor" over a NAR that was byte-identical in `lib/`. §4 of the test
specification records each one. The repair that mattered was not any of the seven: it was giving the
checks a control, so that a count of zero cannot be read as a result until something that must be
listed is listed.

**What is not established:** why a mismatched bundle loads. Lazy resolution of method signatures
predicts a `NoClassDefFoundError` at trigger time; nobody has triggered one. `BACKLOG.md` carries it,
together with the observation that nothing in the stack would notice such a NAR arriving by hand.

### M-B3 — does Liquid load what we build · posed 2026-09-08

The outcome paragraph belongs above this one and is the run's to write, in the form M-B1's and
M-B2's take. Unlike those two, this goal was written into the document **before** the run rather
than after it: a goal that exists only in a chat until step 7 is one nobody can read while it is
being executed, and this feature's whole argument is against records that live in transcripts.

**The state it was posed against, measured rather than assumed.** The working copy was on
`feature/liquid-java-extensions` with the stack rebuilt from it — `liquidupstart/nar-builder:latest`
built for the first time on this host, `liquidupstart/liquid:latest` rebuilt.

| Checked | Answer |
|---|---|
| `docker compose exec -T opencode sh -lc 'command -v nar-build'` | `/usr/local/bin/nar-build` |
| the entrypoint the `liquid` container runs, against `config/liquid/entrypoint.sh` | identical — **38 lines apart** before the rebuild, the container still carrying the `\|\| true` M-B2 removed |
| `docker compose ps` | twenty containers, `nar_builder` healthy |
| `docker compose exec -T openclaw-gateway openclaw --version` | `OpenClaw 2026.7.1`, matching this branch's pin |
| `./tests/run.sh` | **440 pass, 0 fail** across 105 files in 285s, plus 27 dashboard tests |
| `volumes/nar_builder/m2` | 85 MB, refilled by B1-9 after OC-20 destroyed it — holding `nifi-api` **2.10.0 only**, since M-B2 stopped pulling 2.11.0 transitively |

That §4 check 3b would have caught the entrypoint is not hypothetical here: it was 38 lines wrong at
the moment the branch was checked out, and `B2-5` and `B2-6` read the file rather than the container,
so both would have been green over it.

```
/goal Implement M-B3 from docs/FEATURE-liquid-java-extensions.md. Acceptance is
cases B3-3 and B3-4 in section 3 of docs/TEST-SPEC-liquid-java-extensions.md,
specified 2026-09-04 and signed off with M-A7's. Write those tests first, then
make them pass.

B3-1 and B3-2 are section 4 checks and are NOT this run's acceptance: they
restart Liquid, which interrupts every running flow, and the restart is the
operator's. Do not automate them, and run no `docker compose restart liquid` at
any point.

Note the wall-clock time before your first action, and report elapsed time and
turn count when the goal completes. Bound: 50 turns.

Four things.

1. Two builds at once, different sources -- B3-3. Nothing in this stack has ever
run two builds together. What is shared is /m2, one Maven local repository, whose
concurrency safety is the thing in question, and /nar_extensions. What is not
shared is the project: config/nar_builder/build.sh gives each build its own
mktemp -d. Both must exit 0, both artifacts must be in the drop directory, each
must hold its own processor and not the other's, and a third build afterwards
must resolve everything from the cache -- the `downloads 0` line B1-9 already
asserts.

2. Two builds at once, one source -- B3-4, and the sharper half. Read the write
at the end of build_command in config/nar_builder/build.sh: it copies to
part="${DROP}/.${base}.part" and then moves it into place. That temp name comes
from the artifact base name and nothing else, and the artifact name comes from
basename of the source directory -- so two builds of the SAME directory copy into
the SAME temp path at the same time, and the trap on INT/TERM removes that path,
which by then may belong to the other build. Either both builds succeed and what
lands in the drop directory is a readable archive, or one refuses and says what
to do about it. What must NOT happen is a partial or unreadable .nar, or a
leftover .part beside it: the entrypoint copies whatever it finds into lib/ on
the next restart, so a torn NAR does not fail the build -- it fails the
deployment later, on a restart nobody connects to it. Assert it by opening the
archive, not by counting files.

How the write is made safe is yours to decide -- a temp name that cannot collide,
a lock on the drop path, a lock in BuildServer keyed by the source. Take the
decision and write it down with the reason rather than letting it fall out of the
code. FR24 and FR25 do not move: a failed build still leaves no artifact, and the
builder still holds no credentials.

3. The harness cannot yet run two builds at once. sh() in tests/lib/shell.ts is
synchronous and narBuild() in tests/lib/narfixture.ts goes through it. Extend
those rather than building a second path beside them -- B1's integration cases
use seedSource, narBuild, dropContents and cacheIsPopulated, and two copies of a
fixture helper are two copies to drift.

Two things the new helper must do. It must surface BOTH children's exit status,
not only their output: on 2026-09-08 a helper in this repository read stdout
alone, bash refused the script it ran, empty came back -- and empty is exactly
what "nothing to report" looks like. And the test must establish that the two
builds actually OVERLAPPED, rather than assuming it. BuildServer.java serves on
Executors.newFixedThreadPool(2): two fit and a third queues, so a pair that
happened to serialise would pass a test that checks only that both succeeded, and
would be measuring the queue instead of the collision. Say in the test header how
you established overlap.

4. Section 4 of the test specification is provisional in one place and must stop
being. Its check 4 sets NAR_BUILD_API_PROBE_VERSION=99.99.99, which is B2-3's
unresolvable version: resolve_api_version fails, the build refuses with exit 3,
and no mismatched NAR is ever produced. The block itself says so -- "If that
refuses, the mismatch has to be produced another way". Produce it. Establish by
building, not by reasoning, a fixture whose NAR links against a nifi-api the
running Liquid does not provide; the pom.xml escape hatch B1-6 keeps is the
obvious lever, and the running Liquid is NiFi 2.11.0 on Java 21 loading nifi-api
2.10.0. Prove at build time that the mismatch is real -- what the built classes
reference, against what the jar in Liquid's lib/ actually holds -- because
whether it then fails to load is the operator's observation, and that observation
is the whole point of B3-2. Write the fixture and the commands into the section 4
block so it runs top to bottom with nothing to fill in, and write
tests/verify/m-b3.sh as its executable equivalent in the shape of
tests/verify/m-b2.sh. Run neither: both restart Liquid.

The cache is warm: the branch's full suite ran green before this goal was posed
and B1-9 filled volumes/nar_builder/m2, 85 MB of it. So a concurrent pair
measures the collision the cases name rather than a download storm -- but assert
that rather than trusting this sentence, because it is the difference between the
two. It holds nifi-api 2.10.0 and nothing else: a build aimed at a different API
goes to Maven Central. B1's build tests carry 1_200_000 ms timeouts and two at
once are not faster.

Leave the evidence on disk, not only in this transcript. Write
.pr-drafts/M-B3-run.md as you finish, holding: elapsed time and turn count; the
final lines of `./tests/run.sh m-b3` and `./tests/run.sh` verbatim with their EXIT
status; the decision you took on the drop-directory write and the reason for it;
how you established that the two builds actually overlapped; and what the B3-2
fixture turned out to be, including whichever nifi-api version produced a real
mismatch. A result that exists only in a transcript has to be carried by hand,
and that is where it is lost -- on 2026-09-08 the operator pasted a start log
into a chat because the stack keeps none, and the case that came out of it exists
only because they bothered.

Record the outcome where the next session will find it, not only in this chat:
the process log row in section 5, an outcome paragraph in the appendix above this
goal, section 2's traceability rows, and each case's "What it found" block.

Search the codebase before assuming anything is missing; full implementations
only, no placeholders.

Done when `./tests/run.sh m-b3; echo EXIT=$?` shows EXIT=0 in this transcript and
`./tests/run.sh; echo EXIT=$?` does too -- the branch stood at 440 pass, 0 fail
before this goal was posed. Or stop after 50 turns.
```
