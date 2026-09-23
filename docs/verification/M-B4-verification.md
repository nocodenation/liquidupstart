## M-B4 — independent verification

Run on the host with `./tests/verify/m-b4.sh` on 2026-09-15 07:26 CEST, following §4 of
`docs/TEST-SPEC-liquid-java-extensions.md`. The script performs the same checks the section lists
for hand execution, judges each one, and restores everything it moved — including on `Ctrl-C`:
both fixtures, the artifacts they wrote into `volumes/nar_extensions`, and the copies that reached `/opt/nifi/nifi-current/lib`.
Anything that was in `volumes/nar_extensions` beforehand is left alone. **Checks 3, 4 and 5 restart Liquid**,
which interrupts every running flow — that is why they live here and not in the suite.

**This is the second run of the day, and the first one is part of the record.** At 07:0x check 4
reported FAIL with the words *"MismatchProcessor is absent even with the NAR in
/opt/nifi/nifi-current/lib, so check 3's absence was never caused by the refusal — something else is
keeping this bundle out, and M-B3's finding that a mismatched NAR loads has changed."* That was a
claim about the system, and it was false. The check stages the bundle into `lib/` by hand from the
drop directory, and the change being verified had just moved a refused bundle out of there into
`refused/`; the copy silently failed, because it was written `>/dev/null 2>&1`. The control was
measuring its own broken precondition and reporting it as a finding about NiFi.

Two things changed before this run: the check reads from `refused/`, and a copy it cannot perform
now says *"this control never ran and says nothing about check 3"* instead of producing a verdict.
A negative control that cannot establish its own precondition must not be able to look like a result.

| Check | What it proves | Result |
|---|---|---|
| 0 | the container runs the files on disk | **PASS** — /opt/nifi/scripts/{entrypoint.sh,narcheck.py} are byte-identical to config/liquid/ |
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across everything before it | **PASS** — EXIT=0 |
| 3 | the mismatch is refused where the operator can see it, and the good NAR still deploys | **PASS** — org.nocodenation.probe.ProbeProcessor listed, org.nocodenation.probe.MismatchProcessor not, the refusal names org.apache.nifi.controller.NodeConnectionState, and probe-mismatch-1.0.0.nar is set aside in volumes/nar_extensions/refused |
| 4 | the type is absent because the guard refused it, not because it cannot load | **PASS** — org.nocodenation.probe.MismatchProcessor is listed the moment the same NAR is put into /opt/nifi/nifi-current/lib by hand |
| 5 | both types are listed because their NARs are loaded, and the suite is green again | **PASS** — both gone with the NARs, EXIT=0 |

### Output

<details><summary>Check 0 — the container runs the files on disk</summary>

```
diff entrypoint.sh:
(identical)
diff narcheck.py:
(identical)
```
</details>

<details><summary>Check 1 — the milestone suite</summary>

```
(pass) B4-4 Liquid is launched anyway, with the good NAR already in lib/ [0.05ms]

tests/integration/m-b4.placement-check.test.ts:
(pass) the stack is running [63.21ms]
(pass) B4-9 a bundle that cannot link never enters the drop directory > nar-build refuses it, naming the bundle and the class [0.08ms]
(pass) B4-9 a bundle that cannot link never enters the drop directory > and says where the bundle itself is, outside the load path [0.08ms]
(pass) B4-9 a bundle that cannot link never enters the drop directory > and the drop directory never held it [0.05ms]
(pass) B4-10 a sound bundle is deployed and loaded without a restart > nar-build writes it into the drop directory [0.04ms]
(pass) B4-10 a sound bundle is deployed and loaded without a restart > and does not ask for a restart, because none is needed [0.06ms]
(pass) B4-11 the builder and Liquid reach the same verdict > the index the builder reads holds what lib/ holds [163.26ms]
(pass) B4-11 the builder and Liquid reach the same verdict > and liquid refuses the same bundle the builder refused [149.51ms]

tests/integration/m-b4.unjudged-reference.test.ts:
(pass) B4-6 the fixtures built and the lib/ of the running distribution is staged [0.35ms]
(pass) B4-6 the reference is a class constant, not a string [61.31ms]
(pass) B4-6 the class is absent from the nifi-api jar Liquid loads [53.88ms]
(pass) B4-6 the bundle is not refused on account of that reference [46.45ms]
(pass) B4-6 and the reason is that a jar in lib/ carries the class [45.46ms]
(pass) B4-6 a reference whose package the API jar does not provide is not judged [46.84ms]
(pass) B4-6 the same NAR against the real lib/ is refused, which is what makes that a decision [96.10ms]

 40 pass
 0 fail
 70 expect() calls
Ran 40 tests across 7 files. [51.04s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF [0.04ms]
(pass) formatValue > quotes when needed [0.02ms]
(pass) env-meta > classifies build-affecting keys [0.05ms]
(pass) env-meta > picks input widgets [0.07ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.02ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.14ms]
(pass) env-meta > strips marker suffixes from display titles [0.03ms]
(pass) real .env.example > round-trips byte-identically [0.40ms]
(pass) real .env.example > finds the marked sections with their fields [0.46ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.36ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir [0.18ms]
(pass) app password > reads null when the file does not exist [0.06ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.42ms]
(pass) app password > creates the directory when it is missing [0.32ms]
(pass) app password > reads back the trimmed value [0.10ms]
(pass) app password > reads null when the file holds only whitespace [0.07ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.24ms]
(pass) app password > an in-place rewrite replaces the previous value [0.19ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [25.00ms]
```
</details>

<details><summary>Check 3 — B4-8, the catalogue after a restart</summary>

```
GOOD BUILD EXIT=0
BAD BUILD EXIT=1
/tmp/b4good.out:nifi_api_version 2.10.0
/tmp/b4good.out:wrote /nar_extensions/b4-hand-nar-1.0.0.nar
occurrences of org.apache.nifi.processors.standard.GenerateFlowFile (the control): 1
occurrences of org.nocodenation.probe.ProbeProcessor: 1
occurrences of org.nocodenation.probe.MismatchProcessor: 0
what is in /opt/nifi/nifi-current/lib:
ls: cannot access '/opt/nifi/nifi-current/lib/probe-mismatch-1.0.0.nar': No such file or directory
/opt/nifi/nifi-current/lib/b4-hand-nar-1.0.0.nar
volumes/nar_extensions after the restart: b4-hand-nar-1.0.0.nar refused 
what the entrypoint said:
liquid  | NAR DEPLOYMENT FAILED: /opt/nifi/nifi-current/nar_extensions/probe-mismatch-1.0.0.nar did not reach /opt/nifi/nifi-current/lib/
liquid  | REFUSED /opt/nifi/nifi-current/nar_extensions/probe-mismatch-1.0.0.nar
liquid  |   org.nocodenation.probe.MismatchProcessor references org.apache.nifi.controller.NodeConnectionState, which the bundle does not carry and /opt/nifi/nifi-current/lib does not provide.
liquid  | NAR DEPLOYMENT FAILED: 1 of 2 NAR file(s) did not reach /opt/nifi/nifi-current/lib/.
```
</details>

<details><summary>Check 4 — the negative control on check 3</summary>

```
the same NAR placed into /opt/nifi/nifi-current/lib by hand, bypassing the entrypoint's check
occurrences of org.apache.nifi.processors.standard.GenerateFlowFile (the control): 1
occurrences of org.nocodenation.probe.MismatchProcessor: 1
```
</details>

<details><summary>Check 5 — cleanup, and the suite again</summary>

```
volumes/nar_extensions after cleanup: . .. refused 
occurrences of org.apache.nifi.processors.standard.GenerateFlowFile (the control): 1
occurrences of org.nocodenation.probe.ProbeProcessor: 0
occurrences of org.nocodenation.probe.MismatchProcessor: 0
(pass) app password > an in-place rewrite replaces the previous value [0.23ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [28.00ms]
EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-B4-verification.log`.

Check 0 is M-B2's check 3b, extended to the parser. `config/liquid/entrypoint.sh` and
`config/liquid/narcheck.py` are `COPY`ed into `liquidupstart/liquid:latest`, not mounted, so
B4-1 to B4-6 can all be green over a container running the code that preceded them. The remedy is
`./config/scripts/build/liquid.sh && docker compose up -d --no-deps liquid`.

Check 4 is what gives check 3 its meaning. A processor missing from the catalogue is the outcome
of a refusal only if the same bundle would have been listed without one — so the same
`probe-mismatch-1.0.0.nar` is copied into `/opt/nifi/nifi-current/lib` by hand, past the entrypoint, and must appear. That is
M-B3's finding restated as a control: a mismatched NAR loads and says nothing, and FR36 is about
moving that failure to the moment the operator can act on it.
