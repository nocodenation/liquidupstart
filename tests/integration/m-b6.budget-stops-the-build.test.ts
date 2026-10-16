/**
 * M-B6 · Integration · A build that is stopped is really stopped
 *
 * Purpose:  S2 of the 2026-10-01 review. `process.destroyForcibly()` reaches the
 *           shell and nothing under it. Measured with
 *           NAR_BUILDER_BUILD_TIMEOUT=3 and a stub mvn that sleeps: the client
 *           got its 504 while `su`, the stub and its `sleep` were still running
 *           with PPID 1, and the work directory was left in /tmp. The semaphore
 *           slot is released with the 504, so the two-at-a-time cap did not hold
 *           either -- four concurrent Maven runs were measured under a two-slot
 *           semaphore -- and an author pom could still write a bundle after the
 *           operator had been told the build was stopped.
 *
 *           **B5-14 is the case that should have caught it.** It asserts the HTTP
 *           code, and the code was 504 either way. Measured on both trees in one
 *           sitting: `code=504 survivors=1 workdirs=1` before,
 *           `code=504 survivors=0 workdirs=0` after. A case that reads only the
 *           answer cannot see what is still running behind it.
 *
 *           Three things decide the repair and all three were measured, not
 *           reasoned. The descendants are collected **before** the parent dies,
 *           because once the shell is gone `descendants()` comes back empty.
 *           TERM goes first and KILL only after a grace, because build.sh has a
 *           TERM trap that removes its work directory -- going straight to
 *           destroyForcibly stops everything and still leaves /tmp/tmp.XXXX. And
 *           it is not a process-group kill: `su` has already moved Maven into a
 *           session of its own, so the group no longer contains the process that
 *           is still building. That last one is new since 1527c86, which put
 *           Maven behind `su`; the reviewer could not have known it.
 * Given:    The builder image built from `config/nar_builder` in this run and
 *           tagged per run, with `BuildServer.java` compiled inside it from the
 *           file under review. A stub `mvn` that answers the api probe and then
 *           sleeps 60s on `package`; a stub `curl` for the reachability probe,
 *           with the real one kept aside as /realcurl because the probe needs a
 *           client; one source at /repos/demo carrying its own pom.xml; and
 *           NAR_BUILDER_BUILD_TIMEOUT=3.
 * When:     A build is posted and allowed to pass its budget.
 * Then:     The client is told 504, nothing of the build is still running eight
 *           seconds later, and no work directory is left in /tmp.
 * Covers:   B6-17, FR24, NFR2
 * Unhappy:  This is the unhappy path -- a build that does not finish. Its
 *           counterpart is every case that builds something successfully, which
 *           would fail at once if the kill reached too far: B6-6 to B6-9 run two
 *           builds to completion in the same image.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';

const RUN = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const IMAGE = `liquidupstart/nar-builder:b6s2-${RUN}`;

const work = mkdtempSync(join(tmpdir(), 'm-b6-timeout-'));
const probe = join(work, 'timeout.sh');

// Plain string literals, not a template literal.
const PROBE =
  [
    "#!/bin/sh",
    "set -u",
    "mkdir -p /liquid/api /repos/demo /tmp/cls",
    "printf \"nifi_version=2.0.0\\njava_version=21.0.1\\n\" > /liquid/api/runtime",
    "printf \"<project><modelVersion>4.0.0</modelVersion><groupId>g</groupId><artifactId>demo</artifactId><version>1.0.0</version></project>\\n\" > /repos/demo/pom.xml",
    "# The real curl is kept aside first: build.sh calls `curl` by name, so the stub",
    "# has to take that name, and this probe needs a working client of its own. The",
    "# first run of this measured code= empty, because the stub answered the probe.",
    "cp \"$(command -v curl)\" /realcurl",
    "printf \"#!/bin/sh\\nexit 0\\n\" > \"$(command -v curl)\"; chmod 755 \"$(command -v curl)\"",
    "cat > \"$(command -v mvn)\" <<\"MVN\"",
    "#!/bin/sh",
    "case \" $* \" in *\" dependency:list \"*) echo \"[INFO]    org.apache.nifi:nifi-api:jar:2.0.0:compile\"; exit 0 ;; esac",
    "sleep 60",
    "MVN",
    "chmod 755 \"$(command -v mvn)\"",
    "javac -d /tmp/cls /opt/builder/BuildServer.java > /tmp/javac.log 2>&1 || { echo \"compile=failed\"; cat /tmp/javac.log; exit 1; }",
    "echo \"compile=ok\"",
    "NAR_BUILDER_BUILD_TIMEOUT=3 java -cp /tmp/cls BuildServer > /tmp/srv.log 2>&1 &",
    "srv=$!",
    "sleep 2",
    "echo \"code=$(/realcurl -s -o /tmp/body -w \"%{http_code}\" -X POST -H \"X-Liquid-Agent: 1\" --data-raw demo http://127.0.0.1:8770/build)\"",
    "# Eight seconds out: past the 3s budget and past the 5s grace the kill allows",
    "# build.sh for its TERM trap, so nothing here is waiting on a guess.",
    "sleep 8",
    "echo \"survivors=$(ps -eo args | grep -c \"[s]leep 60\")\"",
    "echo \"workdirs=$(ls -Ad /tmp/tmp.* 2>/dev/null | wc -l | tr -d \" \")\"",
    "kill $srv 2>/dev/null",
  ].join('\n') + '\n';

writeFileSync(probe, PROBE, { mode: 0o755 });

let out = '';
beforeAll(() => {
  const built = sh(['docker', 'build', '-q', '-t', IMAGE, join(repoRoot, 'config/nar_builder')]);
  if (built.code !== 0) throw new Error(`the builder image did not build:\n${built.output}`);
  const r = sh([
    'docker', 'run', '--rm', '-v', `${probe}:/timeout.sh:ro`,
    '--entrypoint', 'sh', IMAGE, '/timeout.sh'
  ]);
  out = r.output;
  if (!out.includes('workdirs=')) {
    throw new Error(`the probe did not finish (exit ${r.code}):\n${out}`);
  }
}, 900_000);

afterAll(() => {
  sh(['docker', 'rmi', '-f', IMAGE]);
  rmSync(work, { recursive: true, force: true });
});

const field = (name) => (out.match(new RegExp(`${name}=([^\\n]*)`)) ?? [, ''])[1];

describe('B6-17 the budget stops the build, not just the shell', () => {
  test('B6-17 the premise: BuildServer.java compiles as it stands', () => {
    // The probe compiles the file under review inside the image rather than
    // trusting the image's own class files, so a syntax error here is a syntax
    // error in the reviewed source and not a stale build.
    expect(field('compile')).toBe('ok');
  });

  test('B6-17 the client is told the build was stopped', () => {
    // True before the repair as well. It is here as the premise for the two
    // assertions below, which are what B5-14 was missing.
    expect(field('code')).toBe('504');
  });

  test('B6-17 and nothing of it is still running', () => {
    // Before: `survivors=1` -- su, the stub and its sleep, reparented to PID 1.
    expect(field('survivors')).toBe('0');
  });

  test('B6-17 and its work directory is gone', () => {
    // Before: `workdirs=1`. This is what TERM-before-KILL buys: build.sh's own
    // trap runs and cleans up, which a straight destroyForcibly does not allow.
    expect(field('workdirs')).toBe('0');
  });
});
