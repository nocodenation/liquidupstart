## M-B3 — independent verification

Run on the host with `./tests/verify/m-b3.sh` on 2026-09-08 17:04 CEST, following §4 of
`docs/TEST-SPEC-liquid-java-extensions.md`. The script performs the same checks the section lists
for hand execution, judges each one, and restores everything it moved — including on `Ctrl-C`:
both hand-built fixtures, the artifacts they wrote into `volumes/nar_extensions`, and the copies Liquid loaded
into `/opt/nifi/nifi-current/lib`. Anything that was in `volumes/nar_extensions` beforehand is left alone. **Checks 3, 4 and 5
restart Liquid**, which interrupts every running flow — that is why they live here and not in the
suite.

| Check | What it proves | Result |
|---|---|---|
| 0 | the builder runs the script on disk | **PASS** — /opt/builder/build.sh is byte-identical to config/nar_builder/build.sh |
| 1 | milestone suite green | **PASS** — EXIT=0 |
| 2 | no regression across everything before it | **PASS** — EXIT=0 |
| 3 | Liquid loads what we build | **PASS** — org.nocodenation.probe.ProbeProcessor is listed, and /opt/nifi/nifi-current/lib/b3-hand-nar-1.0.0.nar is this build's artifact by SHA-256 |
| 4 | a NAR built against an API Liquid does not provide is not loaded | **FAIL** — Liquid lists org.nocodenation.probe.MismatchProcessor despite the mismatch — a finding about FR23, not a broken check: record it |
| 5 | the type is listed because the NAR is loaded, and the suite is green again | **PASS** — org.nocodenation.probe.ProbeProcessor gone with the NAR, EXIT=0 |

**On check 4's FAIL, added after the run.** It is the milestone's finding, not a defect in the code
and not a broken check. Check 4 predicted that a NAR built against an API Liquid does not provide
would be absent from the catalogue and that the framework log would name a failure. Neither happened:
the mismatch was proven real before the restart — `NodeConnectionState` **ABSENT** from the
`nifi-api-2.10.0.jar` Liquid loads, `ComponentLog` and `AbstractProcessor` present — and the bundle
loaded anyway, with `org.nocodenation.probe.MismatchProcessor` listed among the processor types and
nothing in `nifi-app.log`. Check 3's probe was listed at the same moment, so the restart worked and
the catalogue was read.

That makes check 4 unusable as check 3's control, and **check 5 is the control instead**: with both
NARs removed from `lib/` the type disappeared and the suite came back green. Check 3's PASS is
earned by that, not by check 4.

FR23 and FR27 were rewritten the same day, in every place that stated the old mechanism — including
the refusal `nar-build` prints to an agent. The case's expectation in
`docs/TEST-SPEC-liquid-java-extensions.md` now records what happens rather than predicting what does
not, and `tests/verify/m-b3.sh` asserts the observed behaviour: it goes red if Liquid ever *does*
refuse such a bundle, because that would change what FR23 defends against. The verdict table below is
left exactly as the run produced it.

**A confirming run followed at 17:35, after the corrections, and came back 6/6.** Same system, same
observation: `NodeConnectionState` absent from the jar Liquid loads, `MismatchProcessor` listed
regardless, nothing in the log — check 4 now asserts that rather than predicting against it, and
checks 3 and 5 stayed green, which is what shows the new verdict does not simply wave everything
through. It also ran `get_env`, the tightened token guard, the catalogue-based readiness wait and the
de-noised log filter for the first time; none of those had been executed in the form this repository
now carries. **This record is kept as the run that produced the finding**, verdicts untouched, rather
than being replaced by the tidier one.

**What is not established:** why it loads. The missing class sits in a method signature and the JVM
resolves those on first use, which predicts a `NoClassDefFoundError` when the processor is triggered.
Nobody has triggered one. It is in `BACKLOG.md` as an open finding rather than as an explanation.

### Output

<details><summary>Check 0 — the builder runs the script on disk</summary>

```
diff <in-container /opt/builder/build.sh> <on-disk config/nar_builder/build.sh>:
(identical)
```
</details>

<details><summary>Check 1 — the milestone suite</summary>

```
bun test v1.3.13 (bf2e2cec)

tests/integration/m-b3.concurrent-different-sources.test.ts:
(pass) the stack is running [93.86ms]
(pass) B3-3 the cache was already warm, so the pair measures the collision [0.77ms]
(pass) B3-3 the two builds were in flight at the same instant [0.37ms]
(pass) B3-3 both builds exit 0 [0.10ms]
(pass) B3-3 both artifacts are in the drop directory [0.02ms]
(pass) B3-3 each NAR carries its own processor and not the other one [24.87ms]
(pass) B3-3 the cache survived the pair: a third build downloads nothing [0.32ms]

tests/integration/m-b3.concurrent-same-source.test.ts:
(pass) the stack is running [92.22ms]
(pass) B3-4 the cache was already warm, so the pair measures the write [0.07ms]
(pass) B3-4 both builds were in flight against the same source at one instant [0.16ms]
(pass) B3-4 both invocations reported an outcome, and at least one succeeded [0.05ms]
(pass) B3-4 an invocation that did not succeed refused in words [0.04ms]
(pass) B3-4 exactly one artifact is in the drop directory [0.02ms]
(pass) B3-4 no temporary file was left beside it [0.10ms]
(pass) B3-4 the artifact opens: every entry passes its own check [19.83ms]

 15 pass
 0 fail
 25 expect() calls
Ran 15 tests across 2 files. [21.13s]
```
</details>

<details><summary>Check 2 — the whole suite</summary>

```
(pass) renderEnv > substitutes values into a CRLF example and emits LF [0.07ms]
(pass) formatValue > quotes when needed [0.03ms]
(pass) env-meta > classifies build-affecting keys [0.05ms]
(pass) env-meta > picks input widgets [0.06ms]
(pass) env-meta > collapse defaults: no collapsed sections; PER-IMAGE OVERRIDES subheading collapses [0.02ms]
(pass) env-meta > section descriptions: keyword match with first-sentence fallback [0.19ms]
(pass) env-meta > strips marker suffixes from display titles [0.04ms]
(pass) real .env.example > round-trips byte-identically [0.42ms]
(pass) real .env.example > finds the marked sections with their fields [0.37ms]
(pass) real .env.example > finds every KEY= line of the file as a field [0.34ms]

src/lib/server/project.test.ts:
(pass) app password > paths resolve under the project volumes dir [0.04ms]
(pass) app password > reads null when the file does not exist [0.09ms]
(pass) app password > writes the trimmed value with a trailing newline at mode 0600 [0.50ms]
(pass) app password > creates the directory when it is missing [0.47ms]
(pass) app password > reads back the trimmed value [0.10ms]
(pass) app password > reads null when the file holds only whitespace [0.08ms]
(pass) app password > reads null instead of throwing when the path is a directory [0.29ms]
(pass) app password > an in-place rewrite replaces the previous value [0.25ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [28.00ms]
```
</details>

<details><summary>Check 3 — Liquid lists the processor</summary>

```
BUILD EXIT=0
nifi_version 2.11.0
nifi_api_version 2.10.0
built b3-hand-nar-1.0.0.nar
wrote /nar_extensions/b3-hand-nar-1.0.0.nar
downloads 0
sha256 volumes/nar_extensions/b3-hand-nar-1.0.0.nar: cef882d21ae9bfeaea729fd9d0378a9479836f79ad35033681e39338847b4857
sha256 /opt/nifi/nifi-current/lib/b3-hand-nar-1.0.0.nar: cef882d21ae9bfeaea729fd9d0378a9479836f79ad35033681e39338847b4857
occurrences of org.apache.nifi.processors.standard.GenerateFlowFile (the control): 1
occurrences of org.nocodenation.probe.ProbeProcessor in /nifi-api/flow/processor-types: 1
what the API answered, first 300 characters:
{"processorTypes":[{"type":"org.apache.nifi.processors.stateful.analysis.AttributeRollingWindow","bundle":{"group":"org.apache.nifi","artifact":"nifi-stateful-analysis-nar","version":"2.11.0"},"description":"Track a Rolling Window based on evaluating an Expression Language expression on each FlowFil
```
</details>

<details><summary>Check 4 — the control: the mismatched NAR</summary>

```
BUILD EXIT=0
built probe-mismatch-1.0.0.nar
wrote /nar_extensions/probe-mismatch-1.0.0.nar
pom author
downloads 0

Liquid loads NARs from /nar_extensions at startup only. Ask the operator to restart it:
docker compose restart liquid
the jar Liquid loads: /opt/nifi/nifi-current/lib/nifi-api-2.10.0.jar
ABSENT   org/apache/nifi/controller/NodeConnectionState
present  org/apache/nifi/logging/ComponentLog
present  org/apache/nifi/processor/AbstractProcessor
occurrences of org.nocodenation.probe.MismatchProcessor: 1
occurrences of org.nocodenation.probe.ProbeProcessor (still from check 3): 1
what the framework log said:
liquid  | 2026-09-08 15:00:27,428 INFO [main] o.e.jetty.server.handler.ContextHandler Started oeje11w.WebAppContext@130cfc47{/nifi-standard-content-viewer-2.11.0,/nifi-standard-content-viewer-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-standard-content-viewer-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@6c9a3661{STARTED}}{./work/nar/extensions/nifi-standard-content-viewer-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-standard-content-viewer-2.11.0.war}
liquid  | 2026-09-08 15:00:27,792 INFO [main] o.e.j.ee11.servlet.ServletContextHandler Started oeje11w.WebAppContext@130cfc47{/nifi-standard-content-viewer-2.11.0,/nifi-standard-content-viewer-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-standard-content-viewer-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@6c9a3661{STARTED}}{./work/nar/extensions/nifi-standard-content-viewer-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-standard-content-viewer-2.11.0.war}
liquid  | 2026-09-08 15:00:28,216 INFO [main] o.e.jetty.server.handler.ContextHandler Started oeje11w.WebAppContext@49d42faf{/nifi-update-attribute-ui-2.11.0,/nifi-update-attribute-ui-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-update-attribute-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@377dbc50{STARTED}}{./work/nar/extensions/nifi-update-attribute-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-update-attribute-ui-2.11.0.war}
liquid  | 2026-09-08 15:00:28,220 INFO [main] o.e.j.ee11.servlet.ServletContextHandler Started oeje11w.WebAppContext@49d42faf{/nifi-update-attribute-ui-2.11.0,/nifi-update-attribute-ui-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-update-attribute-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@377dbc50{STARTED}}{./work/nar/extensions/nifi-update-attribute-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-update-attribute-ui-2.11.0.war}
liquid  | 2026-09-08 15:00:28,529 INFO [main] o.e.jetty.server.handler.ContextHandler Started oeje11w.WebAppContext@9dc782d{/nifi-jolt-transform-json-ui-2.11.0,/nifi-jolt-transform-json-ui-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-jolt-transform-json-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@1131aead{STARTED}}{./work/nar/extensions/nifi-jolt-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-jolt-transform-json-ui-2.11.0.war}
liquid  | 2026-09-08 15:00:28,532 INFO [main] o.e.j.ee11.servlet.ServletContextHandler Started oeje11w.WebAppContext@9dc782d{/nifi-jolt-transform-json-ui-2.11.0,/nifi-jolt-transform-json-ui-2.11.0,b=file:///opt/nifi/nifi-current/work/jetty/nifi-jolt-transform-json-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@1131aead{STARTED}}{./work/nar/extensions/nifi-jolt-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-jolt-transform-json-ui-2.11.0.war}
liquid  | 2026-09-08 15:00:28,844 INFO [main] o.e.jetty.server.handler.ContextHandler Started oeje11w.WebAppContext@70592729{nifi-api,/nifi-api,b=file:///opt/nifi/nifi-current/work/jetty/nifi-web-api-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@34bddf43{STARTED}}{./work/nar/extensions/nifi-server-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-web-api-2.11.0.war}
liquid  | 2026-09-08 15:00:42,493 INFO [main] o.e.j.ee11.servlet.ServletContextHandler Started oeje11w.WebAppContext@70592729{nifi-api,/nifi-api,b=file:///opt/nifi/nifi-current/work/jetty/nifi-web-api-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@34bddf43{STARTED}}{./work/nar/extensions/nifi-server-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-web-api-2.11.0.war}
liquid  | 2026-09-08 15:00:42,729 INFO [main] o.e.jetty.server.handler.ContextHandler Started oeje11w.WebAppContext@6c5ebad{/nifi,/nifi,b=file:///opt/nifi/nifi-current/work/jetty/nifi-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@3e7aa2c9{STARTED}}{./work/nar/extensions/nifi-server-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-ui-2.11.0.war}
liquid  | 2026-09-08 15:00:42,731 INFO [main] o.e.j.ee11.servlet.ServletContextHandler Started oeje11w.WebAppContext@6c5ebad{/nifi,/nifi,b=file:///opt/nifi/nifi-current/work/jetty/nifi-ui-2.11.0.war/webapp/,a=AVAILABLE,h=oeje11s.SessionHandler@3e7aa2c9{STARTED}}{./work/nar/extensions/nifi-server-nar-2.11.0.nar-unpacked/NAR-INF/bundled-dependencies/nifi-ui-2.11.0.war}
```
</details>

<details><summary>Check 5 — cleanup, the negative control on check 3, and the suite again</summary>

```
volumes/nar_extensions after cleanup: . .. 
occurrences of org.apache.nifi.processors.standard.GenerateFlowFile (the control): 1
occurrences of org.nocodenation.probe.ProbeProcessor once both NARs are gone: 0
what the API answered, first 300 characters:
{"processorTypes":[{"type":"org.apache.nifi.processors.stateful.analysis.AttributeRollingWindow","bundle":{"group":"org.apache.nifi","artifact":"nifi-stateful-analysis-nar","version":"2.11.0"},"description":"Track a Rolling Window based on evaluating an Expression Language expression on each FlowFil
(pass) app password > an in-place rewrite replaces the previous value [0.31ms]

 27 pass
 0 fail
 71 expect() calls
Ran 27 tests across 2 files. [33.00ms]
EXIT=0
```
</details>

The full log of this run is in `.pr-drafts/M-B3-verification.log`.

Check 0 is the `nar_builder` counterpart of M-B2's check 3b, and exists for the same reason.
`config/nar_builder/build.sh` is `COPY`ed into `liquidupstart/nar-builder:latest`, not mounted,
so B3-4 can be green over a container running the code that preceded the fix. The remedy is
`./config/scripts/build/nar-builder.sh && docker compose up -d --no-deps nar_builder`, which does
not touch Liquid.

Checks 3, 4 and 5 are one argument in three parts. Check 3 shows the processor listed; check 4
shows that a NAR whose compiled class references `org/apache/nifi/controller/NodeConnectionState` — the only class present in
`nifi-api` 2.11.0 and absent from the 2.10.0 jar in `/opt/nifi/nifi-current/lib` — is **not** listed, while the
correct one from check 3 still is, so the restart is not simply failing; check 5 removes both
NARs and requires the type to disappear, which is what makes check 3 a measurement rather than a
reading of whatever `lib/` happened to accumulate.

The mismatch is proven at build time and not inferred from a version number. `javap` lists what
the compiled class references, and each referenced `org.apache.nifi` type is looked up in the
`nifi-api` jar Liquid actually loads. A NAR built against 2.11.0 that referenced nothing new
would load perfectly well and would prove nothing.
