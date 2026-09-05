## M-B1 — independent verification

Run on the host with `./tests/verify/m-b1.sh` on 2026-09-03 19:45 CEST, following §4 of
`docs/TEST-SPEC-liquid-java-extensions.md`. The script performs the same eight checks the section
lists for hand execution, judges each one, and restores everything it moved — including on
`Ctrl-C`. It removes only the artifacts this run created; anything that was in `volumes/nar_extensions`
beforehand is left alone.

| Check | What it proves | Result |
|---|---|---|
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across earlier milestones | **PASS** — EXIT=0 |
| 3 | a hand build from the agent's container produces a loadable NAR | **PASS** — exit 0, b1-hand-nar-1.0.0.nar, descriptor names ProbeProcessor |
| 4 | a failed build leaves the drop directory byte-for-byte as it was | **PASS** — non-zero exit, 'incompatible types' in the output, same SHA-256 and same listing |
| 5 | the build cases are decided by nar-build | **PASS** — stub in place: B1-10 B1-11 B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 red, EXIT=1; content restored: EXIT=0 |
| 6 | the build cases genuinely need the builder | **PASS** — red at EXIT=1, green again at EXIT=0 |
| 7 | the builder holds no credentials | **PASS** — no /git-secrets, no key file, no credential in the environment |
| 8 | the suite is green again with the fixtures gone | **PASS** — EXIT=0 |

**One note on check 6, added after the run.** Its verdict line above does not name the cases it saw,
because the script printed them only for check 5 at the time. The log records them:
`B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 B1-10 B1-12` went red with `nar_builder` stopped, and
`B1-1 B1-2 B1-11` stayed green — which is the set the sources predict. `B1-4` was the one case left
out of the required list beforehand, on the grounds that its behaviour without the builder was not
determinable; reading its assertions settles it (it requires `target version` and `could not be read`
in the output, and an unreachable builder produces neither), so it is required now and check 6's
verdict names its cases like check 5's does. Neither change alters this run's outcome; both are in
the commit.

### Output

<details><summary>Check 1 — the milestone suite</summary>

```

tests/integration/m-b1.plain-source.test.ts:
(pass) the stack is running [86.18ms]
(pass) B1-5 the build succeeds [4341.12ms]
(pass) B1-5 exactly one NAR appeared in the drop directory [0.10ms]
(pass) B1-5 the output names the file it wrote [0.05ms]
(pass) B1-5 the NAR carries the SPI descriptor naming the processor [11.16ms]

tests/integration/m-b1.stale-artifact.test.ts:
(pass) the stack is running [83.25ms]
(pass) B1-8 a known-good NAR is in place first [4351.76ms]
(pass) B1-8 the second build, of a source that does not compile, fails [2484.03ms]
(pass) B1-8 the earlier artifact is byte-identical [0.07ms]
(pass) B1-8 no partial or temporary file was left beside it [0.01ms]

tests/system/m-b1.build-in-container.test.ts:
(pass) the stack is running [88.22ms]
(pass) B1-10 the command is on the bare PATH in the container an agent works in [132.99ms]
(pass) B1-10 a build run from inside that container lands the artifact [4349.31ms]
(pass) B1-10 the answer named the artifact it wrote [0.02ms]

 55 pass
 0 fail
 77 expect() calls
Ran 55 tests across 12 files. [31.33s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF [0.04ms]
(pass) formatValue > quotes when needed [0.06ms]
(pass) env-meta > classifies build-affecting keys [0.04ms]
(pass) env-meta > picks input widgets [0.07ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.02ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.14ms]
(pass) env-meta > strips marker suffixes from display titles [0.03ms]
(pass) real .env.example > round-trips byte-identically [0.44ms]
(pass) real .env.example > finds the marked sections with their fields [0.41ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.41ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir [0.41ms]
(pass) app password > reads null when the file does not exist [0.05ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.75ms]
(pass) app password > creates the directory when it is missing [0.35ms]
(pass) app password > reads back the trimmed value [0.10ms]
(pass) app password > reads null when the file holds only whitespace [0.08ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.22ms]
(pass) app password > an in-place rewrite replaces the previous value [0.19ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [23.00ms]
```
</details>

<details><summary>Check 3 — a build by hand from the agent's container</summary>

```
BUILD EXIT=0
wrote /nar_extensions/b1-hand-nar-1.0.0.nar
source /repos/.b1-hand
pom synthesised
downloads 0
cache /m2

Liquid loads NARs from /nar_extensions at startup only. Ask the operator to restart it:
docker compose restart liquid
NAR: volumes/nar_extensions/b1-hand-nar-1.0.0.nar
SPI DESCRIPTOR: org.nocodenation.probe.ProbeProcessor
```
</details>

<details><summary>Check 4 — the unhappy path, and the artifact already there</summary>

```
BUILD EXIT=1
[ERROR] /tmp/tmp.Fy8lBJo7gQ/project/processors/src/main/java/org/nocodenation/probe/ProbeProcessor.java:[9,89] incompatible types: java.lang.String cannot be converted to int
[ERROR] /tmp/tmp.Fy8lBJo7gQ/project/processors/src/main/java/org/nocodenation/probe/ProbeProcessor.java:[9,89] incompatible types: java.lang.String cannot be converted to int
ARTIFACT SHA BEFORE: 4dbe001e628ab4fd62d4a84e25418db40f336191498e0bd091c18f3fc2b920d9 
ARTIFACT SHA AFTER:  4dbe001e628ab4fd62d4a84e25418db40f336191498e0bd091c18f3fc2b920d9 
DIRECTORY BEFORE: . .. b1-hand-nar-1.0.0.nar 
DIRECTORY AFTER:  . .. b1-hand-nar-1.0.0.nar 
```
</details>

<details><summary>Check 5 — negative control: the command</summary>

```
with the command truncated in place: EXIT=1, cases red: B1-10 B1-11 B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 
(fail) B1-3 the resolution answers at all [0.28ms]
(fail) B1-3 the NiFi version has the shape of a NiFi 2 release [1.59ms]
(fail) B1-3 the Java major is the one Liquid runs on [1.20ms]
(fail) B1-3 it says where it read them [0.27ms]
(fail) B1-4 it says the target version could not be read [0.13ms]
(fail) B1-4 it names what to do next [0.04ms]
(fail) B1-11 both sources are read and each contributes refusals [0.07ms]
35 | test('B1-7 the build fails', () => {
(fail) B1-7 the build fails [126.39ms]
(fail) B1-7 javac's own message reaches the caller [0.09ms]

with its content restored: EXIT=0
```
</details>

<details><summary>Check 6 — negative control: the builder</summary>

```
with nar_builder stopped: EXIT=1, cases red: B1-10 B1-12 B1-3 B1-4 B1-5 B1-6 B1-7 B1-8 B1-9 
15 |       `stack not running: container(s) ${missing.join(', ')} are not up. ` +
error: stack not running: container(s) nar_builder are not up. Start the stack with ./scripts/linux/start.sh before running system tests.
(fail) the stack is running [92.44ms]
(fail) B1-3 the resolution answers at all [0.08ms]
(fail) B1-3 the NiFi version has the shape of a NiFi 2 release [0.37ms]
(fail) B1-3 the Java major is the one Liquid runs on [0.12ms]
(fail) B1-3 it says where it read them [0.06ms]
15 |       `stack not running: container(s) ${missing.join(', ')} are not up. ` +
error: stack not running: container(s) nar_builder are not up. Start the stack with ./scripts/linux/start.sh before running system tests.
(fail) the stack is running [103.08ms]

with it running again: EXIT=0
```
</details>

<details><summary>Check 7 — the credential boundary from inside</summary>

```
PATHS:
ENV KEYS:
END
```
</details>

<details><summary>Check 8 — cleanup, and the suite again</summary>

```
volumes/nar_extensions after cleanup: . .. 
(pass) app password > an in-place rewrite replaces the previous value [0.26ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [26.00ms]
EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-B1-verification.log`.

Checks 3 and 4 are the pair that matters and they belong together: one proves a NAR is produced
from the container an agent actually works in, the other that a failure produces nothing and
**disturbs nothing**. Check 4 compares the artifact's SHA-256 across the failed build rather than
counting files, because the failure FR24 guards against is a *stale* NAR that Liquid would load on
the next restart, and a stale file is invisible to a check that only counts.

Check 5 replaces the command's **content** — truncated in place, never renamed, because
`nar-build` is bind-mounted as a single file and a single-file mount follows the inode; a
rename would leave the container reading the old file and the control would prove the opposite
of its claim. Check 7 is asserted from inside the container on purpose: B1-1 reads
`compose.yml`, which says what was *declared*, and only this says what is *reachable*.
