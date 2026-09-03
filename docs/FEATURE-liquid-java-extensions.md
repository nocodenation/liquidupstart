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
freely — and `volumes/nar_extensions`, where the artifact lands. What is not: `volumes/_git-secrets`,
the deploy keys, the `.env` values, and every other service's data. The builder is a compiler with a
drop directory, not a member of the stack's credential-holding set (FR25).

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

**M-B2 · Document the deployment cycle**
Extend the `liquid` skill with the builder path and the restart step: the agent places the artifact
and asks the human to run `docker compose restart liquid`.
*Done when:* `./tests/run.sh m-b2` is green, plus the documented manual restart step.

---

## 5. Process log

Filled in at step 7 of each milestone cycle, in the form `FEATURE-git-integration.md` §8 uses, so the
two features' runs stay comparable. Wall clock is local time.

| Milestone | Turns used / bound | Wall clock | Files touched | Evaluator passed something untrue? | Manual rework after the goal | Plan changed? | Had to be reconstructed? |
|---|---|---|---|---|---|---|---|
| M-B1 | | | | | | | |
| M-B2 | | | | | | | |

---

## 6. How work proceeds

The same cycle as the git integration, described in §7 of its document: specify the cases, review
them, pose the goal in a fresh session, verify independently, record what was found. That cycle is
not restated here — it belongs to the working method rather than to either feature, and duplicating
it would guarantee the two copies drift.
