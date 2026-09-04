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
  running Liquid, not from `.env`. A NAR built against the wrong `nifi-api` loads silently as nothing
  at all, which is the failure class this feature has spent six milestones removing. If the version
  cannot be read, the build refuses rather than guesses.
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
2.11.0 on OpenJDK 21 today, and a NAR compiled against a different `nifi-api` does not fail loudly —
it is simply never loaded, and the processor never appears. That is precisely the silent failure this
feature has spent six milestones learning to refuse, so the version is computed at build time and a
build that cannot read it stops.

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

---

## 5. Process log

Filled in at step 7 of each milestone cycle, in the form `FEATURE-git-integration.md` §8 uses, so the
two features' runs stay comparable. Wall clock is local time.

| Milestone | Turns used / bound | Wall clock | Files touched | Evaluator passed something untrue? | Manual rework after the goal | Plan changed? | Had to be reconstructed? |
|---|---|---|---|---|---|---|---|
| M-B1 | 55 / 45 | 2026-09-03 18:16–19:16 (local), 1h00 | 20: `compose.yml`, `config/nar_builder/{Dockerfile,build.sh,BuildServer.java,entrypoint.sh}`, `config/agents/bin/nar-build.sh`, `config/scripts/build/nar-builder.sh`, `scripts/linux/build.sh`, `config/nginx/templates/nginx.conf`, `CLAUDE.md`, 12 test files + `tests/lib/narfixture.ts`, `tests/verify/m-b1.sh`, this document, the test specification | No — the suite was run in the transcript and the two defects it found are recorded in B1-5 and B1-9 | Not yet run by the operator | No — the four fixed decisions held; one addition, the read-only `volumes/liquid/logs` mount, is declared in §3.2 | No |
| M-B2 | ~70 / 50 — over, and the bound was set at where M-B1 landed | 2026-09-03 21:57–22:47 (local), 0h50 | 21: `config/nar_builder/{build.sh,BuildServer.java}`, `config/agents/bin/nar-build.sh`, `config/liquid/entrypoint.sh`, `config/agents/skills/liquid/SKILL.md`, 9 test files + `tests/lib/{entrypointfixture.ts,narfixture.ts,shell.ts}`, `tests/verify/m-b2.sh`, this document, the test specification | No — the suite was run in the transcript, and the two things it could have passed over were caught before the run: a contract test green over an entrypoint the container does not execute (§4 check 3b), and a negative control reading the artifact the previous check had left in `lib/` (§4 check 5) | Not yet run by the operator; B2-10 is still to be observed | No — the three things the goal named were built as posed, and the one decision it left open (whether Liquid starts after a failed copy) was taken and written down | No |

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
wrong nifi-api is not rejected by Liquid, it is silently never loaded.

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
