## M-B2 — independent verification

Run on the host with `./tests/verify/m-b2.sh` on 2026-09-05 16:01 CEST, following §4 of
`docs/TEST-SPEC-liquid-java-extensions.md`. The script performs the same checks the section lists
for hand execution, judges each one, and restores everything it moved — including on `Ctrl-C`:
the command's content, the hand-built fixture, the artifacts it wrote into `volumes/nar_extensions`, and the
copy of the NAR it caused Liquid to load into `/opt/nifi/nifi-current/lib`. Anything that was in `volumes/nar_extensions`
beforehand is left alone. **Checks 4, 5 and 7 restart Liquid**, which interrupts every running
flow — that is why they live here and not in the suite.

| Check | What it proves | Result |
|---|---|---|
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across everything before it | **PASS** — EXIT=0 |
| 3 | the API is resolved, stated, and not bundled | **PASS** — NiFi 2.11.0, nifi-api 2.10.0 through nifi-utils, neither API inside the NAR |
| 3b | the container runs the entrypoint B2-5 and B2-6 assert | **PASS** — /opt/nifi/scripts/entrypoint.sh is byte-identical to config/liquid/entrypoint.sh |
| 4 | the drop directory reaches Liquid's load path | **PASS** — the NAR is in /opt/nifi/nifi-current/lib and the entrypoint named the copy |
| 5 | the NAR arrives because the drop directory holds it | **PASS** — empty drop directory, nothing named b2-hand in /opt/nifi/nifi-current/lib |
| 6 | the API cases are decided by nar-build | **PASS** — stub in place: B2-1 B2-2 B2-3 B2-4 red, EXIT=1; content restored: EXIT=0 |
| 7 | the suite is green again with the fixtures gone | **PASS** — EXIT=0 |

### Output

<details><summary>Check 1 — the milestone suite</summary>

```
(pass) B2-7 the three steps appear in the order they are taken [0.24ms]
(pass) B2-7 the build step is no longer an unnamed "build the NAR" [0.03ms]

tests/contract/m-b2.skill-restart.test.ts:
(pass) B2-8 the restart step states whose it is and why
(pass) B2-8 the section does not instruct the agent to restart Liquid itself [0.49ms]

tests/integration/m-b2.nar-bundles-neither.test.ts:
(pass) the stack is running [103.20ms]
(pass) B2-4 the build succeeds and writes one NAR [6215.21ms]
(pass) B2-4 the archive was read and carries the processors jar [0.20ms]
(pass) B2-4 no nifi-api jar is bundled [0.03ms]
(pass) B2-4 no slf4j-api jar is bundled [0.02ms]

tests/system/m-b2.no-restart-path.test.ts:
(pass) the stack is running [32.32ms]
(pass) B2-9 the probe ran to completion inside the container [0.06ms]
(pass) B2-9 there is no Docker socket in the agent container [0.13ms]
(pass) B2-9 no Docker daemon is reachable from it [0.04ms]
(pass) B2-9 no service in compose.yml mounts the socket [1.18ms]

 43 pass
 0 fail
 58 expect() calls
Ran 43 tests across 9 files. [18.91s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF [0.05ms]
(pass) formatValue > quotes when needed [0.05ms]
(pass) env-meta > classifies build-affecting keys [0.02ms]
(pass) env-meta > picks input widgets [0.04ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.07ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.03ms]
(pass) env-meta > strips marker suffixes from display titles [0.12ms]
(pass) real .env.example > round-trips byte-identically [0.03ms]
(pass) real .env.example > finds the marked sections with their fields [0.85ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.33ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir [0.02ms]
(pass) app password > reads null when the file does not exist [0.15ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.33ms]
(pass) app password > creates the directory when it is missing [0.42ms]
(pass) app password > reads back the trimmed value [0.11ms]
(pass) app password > reads null when the file holds only whitespace [0.10ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.19ms]
(pass) app password > an in-place rewrite replaces the previous value [0.21ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [25.00ms]
```
</details>

<details><summary>Check 3 — the resolved API by hand</summary>

```
BUILD EXIT=0
nifi_version 2.11.0
nifi_api_version 2.10.0
nifi_api_source org.apache.nifi:nifi-utils:2.11.0, which is what the distribution was built against
java_version 21.0.12+10-LTS
built b2-hand-nar-1.0.0.nar
wrote /nar_extensions/b2-hand-nar-1.0.0.nar

Liquid loads NARs from /nar_extensions at startup only. Ask the operator to restart it:
docker compose restart liquid
NAR: volumes/nar_extensions/b2-hand-nar-1.0.0.nar
BUNDLED APIS: none
```
</details>

<details><summary>Check 3b — the entrypoint in the container against the one on disk</summary>

```
diff <in-container /opt/nifi/scripts/entrypoint.sh> <on-disk config/liquid/entrypoint.sh>:
(identical)
```
</details>

<details><summary>Check 4 — the artifact arrives</summary>

```
entrypoint on the log:
liquid  | Found 1 NAR file(s) in nar_extensions directory
liquid  | Copying NARs to lib directory...
liquid  | NAR deployment complete: 1 file(s) copied to /opt/nifi/nifi-current/lib/
the NAR in /opt/nifi/nifi-current/lib: /opt/nifi/nifi-current/lib/b2-hand-nar-1.0.0.nar 
```
</details>

<details><summary>Check 5 — negative control: it fails to arrive when nothing is dropped</summary>

```
with volumes/nar_extensions emptied and the artifact removed from /opt/nifi/nifi-current/lib first:
liquid  | Found 1 NAR file(s) in nar_extensions directory
liquid  | Copying NARs to lib directory...
liquid  | NAR deployment complete: 1 file(s) copied to /opt/nifi/nifi-current/lib/
liquid  | No NAR files found in nar_extensions directory
copies of the hand-built NAR now in /opt/nifi/nifi-current/lib: 0
```
</details>

<details><summary>Check 6 — negative control: the command</summary>

```
with the command truncated in place: EXIT=1, cases red: B2-1 B2-2 B2-3 B2-4 
(fail) B2-1 the resolution answers, and nifi-utils resolves an API version [2.09ms]
(fail) B2-2 the build succeeds [128.19ms]
(fail) B2-2 the output names the NiFi and Java versions [0.89ms]
(fail) B2-2 the output names the resolved nifi-api version [0.13ms]
(fail) B2-2 it says where that version came from [0.08ms]
(fail) B2-3 it says the nifi-api version could not be resolved [0.18ms]
(fail) B2-3 it names the escape hatch: a pom.xml in the source directory [0.06ms]
tests/contract/m-b2.copy-failure-reported.test.ts:
(pass) B2-6 the failure is named, with the file it concerns [0.26ms]
(pass) B2-6 nothing in the entrypoint discards a failure with || true

with its content restored: EXIT=0
```
</details>

<details><summary>Check 7 — cleanup, and the suite again</summary>

```
volumes/nar_extensions after cleanup: . .. 
(pass) app password > an in-place rewrite replaces the previous value [0.25ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [27.00ms]
EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-B2-verification.log`.

Checks 4 and 5 are a pair and neither means much alone. Check 4 shows the NAR reaching
`/opt/nifi/nifi-current/lib`; only check 5 shows that it got there **because the drop directory held it** — the
drop directory is emptied, the copy check 4 caused is removed from `/opt/nifi/nifi-current/lib` as well, and after
the restart the file must be *absent* rather than merely unchanged. Removing it from `/opt/nifi/nifi-current/lib`
too is what makes the control a control: a restart never deletes from `lib/`, so without that
step check 5 would be reading the file check 4 put there and would pass whatever the drop
directory did.

Check 3b exists because `config/liquid/entrypoint.sh` is `COPY`ed into
`liquidupstart/liquid:latest`, not mounted: B2-5 and B2-6 read that file as text and run it in a
sandbox, so they would stay green over a file the running container does not execute. The check
reads the entrypoint out of the container and diffs it against the one the tests assert.

Check 6 replaces the command's **content** — truncated in place, never renamed, because
`nar-build` is bind-mounted as a single file and a single-file mount follows the inode; a rename
would leave the container reading the old file and the control would prove the opposite of its
claim. Its two lists come from reading the sources rather than from watching a run: B2-1 calls
`nar-build --target`, and B2-2, B2-3 and B2-4 each call `nar-build` against a fixture, so all
four must go red. B2-5 and B2-6 execute `config/liquid/entrypoint.sh` in a temporary directory
on the host, B2-7 and B2-8 read `config/agents/skills/liquid/SKILL.md`, and B2-9 scans
`openclaw-gateway` and `compose.yml` — none of the five touches the command, so all five must
stay green. A case outside both lists is the finding.
