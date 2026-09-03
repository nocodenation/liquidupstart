# Test specification — Java extensions for Liquid

Cases for `FEATURE-liquid-java-extensions.md`. Separated from `TEST-SPEC-git-integration.md` on
2026-09-03, at the same time as the feature was, and for the same reason: this feature consumes the
git integration and contributes nothing to it.

**The suite is not split.** Every case here lives in `tests/` alongside the git integration's, is run
by `./tests/run.sh`, and is selected by milestone in the usual way (`./tests/run.sh m-b1`). Two
specification documents, one harness. The conventions the harness expects — the levels, the file
naming, the header block every test file opens with — are in §4 of `TEST-SPEC-git-integration.md` and
are not restated here, because two copies of a convention are two copies to drift.

**Numbering.** Requirements are FR21 upward and use cases U9 and U10, continuing the git
integration's sequence rather than restarting. `FEATURE-liquid-java-extensions.md` says why: two
documents in one repository each owning a "U1" would make every `Covers:` row ambiguous.

---

## 1. Coverage policy

| Milestone | Level of rigour | Rationale |
|---|---|---|
| M-B1 | Unit for the two decisions it makes, integration for the builds, contract for the mounts | The tool has exactly two branches worth the name — is the version readable, does the source carry a pom — and both have a case on each side. Full branch coverage is not demanded: this is a compiler front end, not a guardrail, and the standard is reserved for logic that decides what leaves the stack |
| M-B2 | System, with a documented manual restart | Restart is deliberately human |

---

## 2. Traceability

Filled in as tests are written; a requirement with no test is a gap, and the gap is visible here.

| Requirement | Covered by |
|---|---|
| FR21 Building is one command | B1-2, B1-5, B1-10 |
| FR22 The answer is synchronous and determinate | B1-5, B1-7, B1-11 |
| FR23 The target version is computed | B1-3, B1-4 |
| FR24 A failed build leaves no artifact | B1-4, B1-7, B1-8 |
| FR25 The builder holds no credentials | B1-1, B1-12 |
| FR26 The dependency cache lives under `volumes/` | B1-9 |
| NFR7 The build's trust surface is stated | B1-1, B1-12, and §3.2 itself |

---

## 3. Detailed test cases

### M-B1 — the NAR builder

The missing first step. §6.4 of the `liquid` skill documents how to deploy a NAR — drop it in
`volumes/nar_extensions`, restart Liquid — and begins *"1. Build the NAR(s)"*, which nothing in the
stack can do: there is no JDK and no Maven anywhere in it. Python processors work end to end today,
so the gap is Java's alone. M-B1 closes it with a service that compiles and a command that asks it to.

**Decisions taken while writing these cases:**

*The agent calls a command; it does not drop files and hope.* `bun_runner`'s shape — write into a
shared directory, the service reacts — suits a server and not a build. FR22 requires the outcome to
reach the caller, and a watched directory can neither say when it finished nor hand back the
compiler's error, so an agent would report a success it never saw. `nar-build` sits on the `PATH`
beside `git-repo-info` and `git-publish` and reaches the builder through the `proxy` with a `Host:`
header, as every container-to-container call here does.

*The build synthesises the Maven project, unless the source carries one.* A NiFi NAR needs a
two-module Maven layout — a processors jar, then a `nar`-packaged module that wraps it — and hand
writing that is exactly the error-prone step FR21 exists to remove. So `nar-build` generates the
`pom.xml` from what it finds and from the computed version. **If the source directory already holds a
`pom.xml`, that one is used unchanged**, because a processor with real dependencies must be able to
declare them, and a synthesiser that cannot be overridden becomes a ceiling. Both paths are positive
cases; a milestone with only the generated path would ship a tool that silently ignores the pom an
author wrote.

*The target version is read from the running Liquid, never declared.* Liquid is NiFi 2.11.0 on
OpenJDK 21 today. A NAR compiled against a different `nifi-api` does not fail loudly: it is never
loaded, the processor never appears, and nothing says why. That is the silent-failure class this
feature has spent six milestones refusing, so the version is computed and a build that cannot read it
stops rather than guessing.

*A refused build says what to do next.* FR20 was written for the git guardrail and its reasoning is
not git-specific: a message arriving at the moment of need does not have to be found first, which
M-A3b to M-A3e took four milestones to learn. The same property is asserted here.

| # | Level | Case | Expectation |
|---|---|---|---|
| B1-1 | Contract | The service is declared with the mounts it needs and none it does not | `volumes/repos` and `volumes/nar_extensions` present; `_git-secrets` and the `.env` secrets absent |
| B1-2 | Contract | `nar-build` is on the `PATH` of every service that carries `git-repo-info` | The third command in the same row, mounted the same way |
| B1-3 | Unit | The target version is resolved from the running Liquid | It reports NiFi `2.11.0` and Java `21`, read and not declared |
| B1-4 | Unit **unhappy** | The version cannot be read | The build refuses, says the version is unknown, names what to do, and produces nothing |
| B1-5 | Integration | A Java source in the workspace, no `pom.xml` | A `.nar` appears in `nar_extensions`, and it contains the SPI descriptor naming the processor |
| B1-6 | Integration | A source directory carrying its own `pom.xml` | That `pom.xml` is used unchanged — a processor with real dependencies is not capped by the synthesiser |
| B1-7 | Integration **unhappy** | A source that does not compile | Non-zero exit, `javac`'s own message in the output, no `.nar` in the drop directory |
| B1-8 | Integration **unhappy** | A failed build where a NAR from an earlier build is already present | The earlier artifact is untouched and no partial file appears — a stale NAR is what Liquid would load |
| B1-9 | Integration | A second build of the same source | Reuses the dependency cache under `volumes/`; no re-download, and the cache survives the container |
| B1-10 | System | `nar-build` run inside `openclaw-gateway` | Reaches the builder through the proxy and the artifact lands, from the container an agent works in |
| B1-11 | Contract | Every refusal `nar-build` and the builder can emit | Each names a next step; none ends at "failed" |
| B1-12 | Contract | The builder holds no credentials | No deploy key, no `.env` secret, and no path into `_git-secrets` from inside it |

#### Detail per case

**What this milestone is for.** To make Java extension development possible at all. Eleven automated
cases and one that is automated but reads as configuration; no manual case, because nothing here
depends on a model's judgement — this is a compiler, and a compiler either produces the artifact or
says why not.

##### B1-1 — the service carries what it needs and nothing else

| | |
|---|---|
| **Premise** | §3.2 draws the boundary: the builder is a compiler with a drop directory, not a member of the credential-holding set. A mount added later out of convenience would erase that quietly, and no other case would notice. |
| **Component** | `compose.yml`. |
| **Test data** | The `nar_builder` service block: the mounts `./volumes/repos` and `./volumes/nar_extensions`, and the absence of `./volumes/_git-secrets` and of every `.env` key that names a credential. |
| **Positive — present** | Both working mounts are declared. |
| **Negative — absent** | `_git-secrets` appears nowhere in the block, and no secret-bearing environment key is passed. |
| **Covers** | FR25, NFR7, §3.2. |

##### B1-2 — the command is where the agent will look

| | |
|---|---|
| **Premise** | M-A3b to M-A3e spent four milestones on the discovery problem, and the answer that worked was a command on the `PATH`, not a document. `nar-build` inherits that answer rather than re-testing it. |
| **Component** | `compose.yml`. |
| **Test data** | Every service that mounts `git-repo-info` today — three of them — read out of the file rather than listed by hand, so a service added later cannot be forgotten. |
| **Expected** | Each also mounts `nar-build`, read-only, at `/usr/local/bin/nar-build`. |
| **Covers** | FR21. |

##### B1-3 — the version is read, not written down

| | |
|---|---|
| **Premise** | The decision above, made assertable. A declared version drifts the moment the Liquid image is rebuilt, and drift produces a NAR that is never loaded rather than one that fails. |
| **Component** | The version resolution in `nar-build`, against the running Liquid. |
| **Test data** | The running `liquid` container, which today reports `nifi-2.11.0` under `/opt/nifi/` and `openjdk version "21.0.12"`. The case asserts the shape — a NiFi version of the form `2.x.y` and a Java major of `21` — and not the literal `2.11.0`, because pinning the literal would fail on the next image bump for no reason that concerns this tool. |
| **Expected** | The resolved values match what the container reports. Nothing is read from `.env`. |
| **Covers** | FR23. |

##### B1-4 — an unreadable version stops the build

| | |
|---|---|
| **Premise** | The counterpart, and the one that decides whether FR23 is a guarantee or a hope. Guessing produces an artifact that looks built and never loads. |
| **Component** | `nar-build` with the version source unavailable. |
| **Test data** | The same source as B1-5, with the resolution pointed at a container name that does not exist — `liquid-absent` — so the failure is the one under test and not a broken fixture. |
| **Expected** | Non-zero exit. The message says the target version could not be read and names what to do — start the stack — and `nar_extensions` is unchanged. |
| **Covers** | FR23, FR24, FR20's property. |

##### B1-5 — a plain source produces a loadable NAR

| | |
|---|---|
| **Premise** | The case the milestone exists for, and the one an agent will hit first: a single processor, no build file, nothing to configure. |
| **Component** | `nar-build` against a source tree in the workspace. |
| **Test data** | Under `volumes/repos/<fixture>/src/main/java/org/nocodenation/probe/ProbeProcessor.java`: a class `ProbeProcessor extends AbstractProcessor` whose `onTrigger` body is empty — the smallest thing that is a real processor and still compiles against `nifi-api`. Alongside it, `src/main/resources/META-INF/services/org.apache.nifi.processor.Processor` holding the single line `org.nocodenation.probe.ProbeProcessor`, which §6.3 of the `liquid` skill makes mandatory. No `pom.xml`. |
| **Expected** | Exit 0. A `.nar` appears in `volumes/nar_extensions`, and unzipping it shows the SPI descriptor with that class name — the check §6.3 itself prescribes. The output names the file it wrote. |
| **Covers** | U9, FR21, FR22. |

##### B1-6 — an author's own `pom.xml` is used, not overwritten

| | |
|---|---|
| **Premise** | The synthesiser must not become a ceiling. A processor needing a real dependency — an SSL context service API, a client library — can only declare it in a pom, and a tool that silently regenerates over it would be unusable for exactly the work it is meant to enable. This is a positive counterpart, not an edge case. |
| **Component** | `nar-build` against a source tree that carries a build file. |
| **Test data** | The B1-5 fixture plus a `pom.xml` whose artifactId is `probe-with-pom`, distinguishable from anything the synthesiser would produce, and carrying one dependency the synthesised form would not add. |
| **Expected** | Exit 0, the artifact named from that pom rather than from the generated one, and the declared dependency present in the build. |
| **Covers** | U9, FR21. |

##### B1-7 — a source that does not compile fails with the compiler's own words

| | |
|---|---|
| **Premise** | The unhappy path the outline named from the start, and the reason the invocation is a command rather than a watched directory: this message has to reach the caller, not a log file. |
| **Component** | `nar-build` against a source that will not compile. |
| **Test data** | The B1-5 fixture with one line added to `onTrigger`: `int probe = "probe";`, which `javac` rejects as *incompatible types: String cannot be converted to int* — a deterministic, well-known message, chosen over a syntax error because it proves compilation was actually attempted rather than parsing abandoned early. |
| **Expected** | Non-zero exit. The output contains `incompatible types` and the file and line. `volumes/nar_extensions` gains nothing. |
| **Covers** | FR22, FR24. |

##### B1-8 — a failed build does not disturb the artifact already there

| | |
|---|---|
| **Premise** | The drop directory is what Liquid loads on restart. A partial file there, or an old one left looking current after a failure the operator did not notice, is worse than an empty directory: it deploys silently. FR24 is about the directory's state, not only about the build's exit code. |
| **Component** | `nar-build`, run twice against the same fixture. |
| **Test data** | B1-5 run first, so a known-good `.nar` exists and its SHA-256 is recorded; then B1-7's broken source built into the same place. |
| **Expected** | The second build fails, the existing `.nar` has the same SHA-256 as before, and no other file — partial, temporary or otherwise — is left in the directory. |
| **Covers** | FR24. |

##### B1-9 — the dependency cache is state, and lives where state lives

| | |
|---|---|
| **Premise** | NFR3 says all state lives under `volumes/`, browsable and resettable by deleting a directory. A Maven build without a persistent `~/.m2` re-downloads the NiFi API and the whole plugin chain every time, which is both slow and a fresh trust exposure per build (§3.2). |
| **Component** | `nar_builder`'s cache directory. |
| **Test data** | Two consecutive builds of the B1-5 fixture, with `volumes/nar_builder/m2` inspected between them. |
| **Expected** | The cache directory exists on the host and is non-empty after the first build; the second build succeeds without re-resolving what the first one fetched. |
| **Covers** | FR26, NFR3. |

##### B1-10 — it works from where the agent actually is

| | |
|---|---|
| **Premise** | Every case above proves the mechanism; this proves it is reachable from the container an agent works in, over the path the stack requires — the `proxy` with a `Host:` header, because `X.localhost` names do not resolve inside a container. That constraint has caught this project before. |
| **Component** | `openclaw-gateway`. |
| **Test data** | The B1-5 fixture, with `nar-build` invoked from inside the container as an agent would, with no path spelled out. |
| **Expected** | Exit 0, the artifact in `volumes/nar_extensions`, and the command reachable on the bare `PATH`. |
| **Covers** | U9, FR21. |

##### B1-11 — every refusal names a next step

| | |
|---|---|
| **Premise** | A6-11's property, applied to a second tool. The reasoning was never git-specific: a refusal that arrives with the way forward does not have to be found first. Asserting it once per tool is what stops it decaying into a habit of whoever wrote the newest message. |
| **Component** | `nar-build` and the builder, read as text. |
| **Test data** | Every refusal in either source, enumerated by reading the files rather than from a list kept by hand, exactly as A6-11 does — so a message added later cannot escape the case. |
| **Expected** | Each names a command, a file to fix, or an action. None ends at the refusal. |
| **Covers** | FR20's property, FR22. |

##### B1-12 — the builder cannot reach the credentials

| | |
|---|---|
| **Premise** | B1-1 asserts the declaration; this asserts the result. A mount can be absent from `compose.yml` and the path still reachable another way — an inherited environment variable, a shared parent directory. §3.2 claims a boundary, so the boundary is checked from inside. |
| **Component** | The running `nar_builder`. |
| **Test data** | From inside the container: the existence of `/git-secrets` and of any path containing a deploy key, and the environment read for the keys `.env` marks as credentials. |
| **Expected** | No such path exists and no such value is present. |
| **Covers** | FR25, §3.2. |

---

There is no manual case in M-B1, and that is a decision rather than an omission. Every other milestone
in this feature has one because it turns on what an agent chooses to do. A compiler does not choose:
it produces the artifact or it says why not, and both are assertable. M-B2 is where judgement returns,
because the restart is deliberately the operator's.

### M-B2 — outline

Detailed cases are written at the start of that milestone's cycle. What is fixed: a built NAR is
present in Liquid's load path after a restart, and the restart itself stays manual, so this is a
two-part check with a documented manual step. It carries U10.

---

---

## 4. Independent verification

The form is the one established by M-A5 and M-A6 in the git integration: the checks in copy-and-paste
form, run by the operator rather than by the session that wrote the code, with the negative controls
carrying the weight. A milestone's executable equivalent, `./tests/verify/m-b1.sh`, is written with
the milestone and does not replace the block — it is written by the same hand as the tests it checks.

### M-B1 — the NAR builder

Run at the project root with the stack up. Checks 5 and 6 move something and put it back, and each
says what it restores.

```bash
cd /Users/christof/repos/liquidupstart

# 1. The milestone suite. Expect: EXIT=0
./tests/run.sh m-b1; echo "EXIT=$?"

# 2. No regression across the earlier milestones. Expect: EXIT=0
./tests/run.sh; echo "EXIT=$?"

# 3. A build by hand, bypassing the suite, from the container an agent works in.
#    Expect: BUILD EXIT=0 and a .nar naming the processor in its SPI descriptor.
docker compose exec -T openclaw-gateway sh -lc '
set -e
P=/repos/.b1-hand/src/main/java/org/nocodenation/probe
R=/repos/.b1-hand/src/main/resources/META-INF/services
rm -rf /repos/.b1-hand; mkdir -p "$P" "$R"
cat > "$P/ProbeProcessor.java" <<EOF
package org.nocodenation.probe;

import org.apache.nifi.processor.AbstractProcessor;
import org.apache.nifi.processor.ProcessContext;
import org.apache.nifi.processor.ProcessSession;

public class ProbeProcessor extends AbstractProcessor {
    @Override
    public void onTrigger(ProcessContext context, ProcessSession session) { }
}
EOF
echo org.nocodenation.probe.ProbeProcessor > "$R/org.apache.nifi.processor.Processor"
cd /repos/.b1-hand
set +e
nar-build > /tmp/build.out 2>&1; echo "BUILD EXIT=$?"; tail -5 /tmp/build.out'
ls -l volumes/nar_extensions/
unzip -p volumes/nar_extensions/*.nar 2>/dev/null | strings | grep -m1 ProbeProcessor \
  || echo "(inspect the NAR by hand if this finds nothing)"

# 4. The unhappy path by hand. Expect: a non-zero EXIT, "incompatible types" in the
#    output, and nar_extensions unchanged from what check 3 left.
before=$(shasum -a 256 volumes/nar_extensions/*.nar 2>/dev/null | awk '{print $1}')
docker compose exec -T openclaw-gateway sh -lc '
cd /repos/.b1-hand
sed -i "s|public void onTrigger(ProcessContext context, ProcessSession session) { }|public void onTrigger(ProcessContext context, ProcessSession session) { int probe = \"probe\"; }|" \
  src/main/java/org/nocodenation/probe/ProbeProcessor.java
set +e
nar-build > /tmp/bad.out 2>&1; echo "BUILD EXIT=$?"; grep -m2 "incompatible types" /tmp/bad.out'
after=$(shasum -a 256 volumes/nar_extensions/*.nar 2>/dev/null | awk '{print $1}')
[ "$before" = "$after" ] && echo "ARTIFACT UNCHANGED: yes" || echo "ARTIFACT UNCHANGED: NO -- FR24 violated"
ls volumes/nar_extensions/

# 5. Negative control: does the builder decide? Replace the command's CONTENT with
#    a stub -- do not rename it: nar-build is bind-mounted as a single file, and a
#    single-file mount follows the inode, so mv on the host leaves the container
#    seeing the old file and the control would prove the opposite of its claim.
cp config/agents/bin/nar-build.sh /tmp/nar-build.sh.bak
printf '#!/bin/sh\nexit 90\n' > config/agents/bin/nar-build.sh
./tests/run.sh m-b1; echo "EXIT=$?"
cat /tmp/nar-build.sh.bak > config/agents/bin/nar-build.sh
./tests/run.sh m-b1; echo "EXIT=$?"

# 6. Negative control: do the build cases genuinely need the builder?
#    Expect the build cases red with it stopped, green once it is back.
docker compose stop nar_builder
./tests/run.sh m-b1; echo "EXIT=$?"
docker compose start nar_builder
./tests/run.sh m-b1; echo "EXIT=$?"

# 7. The credential boundary, checked from inside rather than from compose.yml.
#    Expect: no /git-secrets, no key file, no credential in the environment.
docker compose exec -T nar_builder sh -lc '
ls /git-secrets 2>&1 | head -1
find / -name "id_ed25519" -not -path "/proc/*" 2>/dev/null | head -3
env | grep -Ei "KEY|SECRET|PASSWORD|TOKEN" | cut -d= -f1
echo "(nothing above is the expected result)"'

# 8. Clean up the fixture check 3 created, and confirm. Expect EXIT=0.
docker compose exec -T openclaw-gateway sh -c 'rm -rf /repos/.b1-hand'
rm -f volumes/nar_extensions/*.nar
./tests/run.sh; echo "EXIT=$?"
```

Checks 3 and 4 are the pair that matters, and they belong together: one proves a NAR is produced, the
other that a failure produces nothing and disturbs nothing. Check 4 compares the artifact's SHA-256
across the failed build rather than merely looking for a new file, because the failure FR24 guards
against is a **stale** NAR that Liquid would load on the next restart, and a stale file is invisible
to a check that only counts.

Check 7 is asserted from inside the container on purpose. B1-1 reads `compose.yml`, which says what
was declared; only this says what is reachable, and §3.2 makes a claim about reachability.

All eight are also available as one command once the milestone is built: `./tests/verify/m-b1.sh`, in
the form M-A5 and M-A6 established — the checks in order, each judged, everything it moves restored
including on `Ctrl-C`, and a log plus a pull-request comment written to `.pr-drafts/`. It does not
replace the block above: it is written by the same hand as the tests it checks, so its worth rests on
checks 5 and 6, and where a check is in doubt the copyable form is the one to run.
