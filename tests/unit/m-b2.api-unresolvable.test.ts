/**
 * M-B2 · Unit · unhappy · A build whose nifi-api version will not resolve stops
 *
 * Purpose:  The counterpart to B2-1, for the half that cannot be guessed. A NAR
 *           compiled against an API Liquid does not load is accepted, listed and
 *           then fails when a flow runs, so a build that cannot establish the API
 *           version has to stop rather than choose one.
 *
 *           **Rebuilt 2026-10-07, for the reason B1-4 carries in full.** It ran
 *           `nar-build` in the opencode container with
 *           `NAR_BUILD_API_PROBE_VERSION=99.99.99`, which the agent script sends
 *           as `X-Nifi-Api-Probe-Version` -- honoured only under
 *           `NAR_BUILDER_TEST_HOOKS=1`, which is off by default and deliberately
 *           so. The case therefore required an installation configured less
 *           safely than a real one, and on the operator's stack it did not pass.
 *           `build.sh` reads the variable itself, so a throwaway container sets
 *           the same condition with no hook and no server.
 * Given:    The builder image built from `config/nar_builder` in this run; a
 *           source that compiles, mounted read-only at /repos/probe; an empty
 *           drop directory; `/liquid/api/runtime` holding NiFi 2.11.0 and Java
 *           21.0.12+10-LTS so the target resolves; a stub `curl` written over the
 *           real one so the reachability gate passes and the subject is the api
 *           resolution alone; and the probe pinned to 99.99.99, a version
 *           org.apache.nifi:nifi-utils has never published.
 * When:     build.sh builds that source.
 * Then:     Non-zero exit; the message says the nifi-api version could not be
 *           resolved and names the escape hatch B1-6 proves -- a pom.xml in the
 *           source directory, used unchanged; no version is printed as if it had
 *           been resolved; and nothing reached the drop directory.
 * Covers:   B2-3, B2-11, FR27, FR24, FR20's property
 * Unhappy:  B2-3 is the negative case. Its positive counterparts are B2-1 and
 *           B2-2, which still run against the stack. B2-11 is a positive half, and
 *           its negative is `resolve_target synthesised`, still refused with 3.
 *
 * B2-11, added 2026-10-21: the way out B2-3 names was not open. The same source
 * with its own `pom.xml` got the same refusal and the same advice, because the
 * resolution ran before the pom was looked at -- measured on main at a3ef20f.
 * Given the same fixture plus a `pom.xml` holding the line `this is not xml`,
 * deliberately not XML so that a build that gets past the target is stopped by
 * Maven and deploys nothing into a running Liquid; Then no refusal for the API
 * and no advice to add a pom, but the notice that the project's own pom declares
 * its version, then Maven's `Non-parseable POM` and the build's own refusal,
 * exit 2 rather than the target's 3, and nothing in the drop directory.
 *
 * And `resolve_target` alone, evaluated out of the shipped script on the host
 * with a runtime record naming NiFi 2.11.0 and Java 21.0.12+10-LTS, `curl` and
 * `run_maven` stubbed, and the probe at the same unresolvable version: for
 * `author` it prints `nifi_api_version not resolved` and the notice and returns
 * 0; for `synthesised`, the negative, it returns 3 with the advice to add a pom.
 */
import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { builderImage } from '../lib/builderimage';

const IMAGE = builderImage();
const BUILD = join(repoRoot, 'config/nar_builder/build.sh');
const UNRESOLVABLE = '99.99.99';

const work = mkdtempSync(join(tmpdir(), 'm-b2-unresolvable-'));
const src = join(work, 'repos', 'probe');
const drop = join(work, 'nar_extensions');
mkdirSync(join(src, 'src/main/java/p'), { recursive: true });
mkdirSync(join(src, 'src/main/resources/META-INF/services'), { recursive: true });
mkdirSync(drop, { recursive: true });
writeFileSync(join(src, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
writeFileSync(
  join(src, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
  'p.C\n'
);
afterAll(() => rmSync(work, { recursive: true, force: true }));

// B2-11's source: the same files, plus an author pom that is not XML.
const authorSrc = join(work, 'repos', 'authored');
mkdirSync(join(authorSrc, 'src/main/java/p'), { recursive: true });
mkdirSync(join(authorSrc, 'src/main/resources/META-INF/services'), { recursive: true });
writeFileSync(join(authorSrc, 'src/main/java/p/C.java'), 'package p;\npublic class C {}\n');
writeFileSync(
  join(authorSrc, 'src/main/resources/META-INF/services/org.apache.nifi.processor.Processor'),
  'p.C\n'
);
writeFileSync(join(authorSrc, 'pom.xml'), 'this is not xml\n');

// Plain string literals, not a template literal.
const PROBE =
  [
    "set -u",
    "mkdir -p /liquid/api /liquid/logs",
    "printf \"nifi_version=2.11.0\\njava_version=21.0.12+10-LTS\\n\" > /liquid/api/runtime",
    "# A stub curl so the reachability gate passes and the subject is the api",
    "# resolution. Written OVER the real one, because run_maven goes through su and",
    "# su resets PATH -- a stub elsewhere on PATH is never found.",
    "printf \"#!/bin/sh\\nexit 0\\n\" > \"$(command -v curl)\"",
    "chmod 755 \"$(command -v curl)\"",
    "sh /probe/build.sh build \"$1\" 2>&1",
    "echo \"exit=$?\"",
  ].join('\n') + '\n';

let run = { code: -1, output: '' };
let after: string[] = [];
let authored = { code: -1, output: '' };
let authoredAfter: string[] = [];

function build(source: string): { code: number; output: string } {
  const script = join(work, 'probe.sh');
  writeFileSync(script, PROBE, { mode: 0o755 });
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${join(work, 'repos')}:/repos:ro`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${script}:/probe.sh:ro`,
    '--env', `NAR_BUILD_API_PROBE_VERSION=${UNRESOLVABLE}`,
    '--entrypoint', 'sh', IMAGE, '/probe.sh', source
  ]);
  const m = r.output.match(/exit=(\d+)\s*$/);
  return { code: m ? Number(m[1]) : -1, output: r.output };
}

beforeAll(() => {
  run = build('probe');
  after = readdirSync(drop).sort();
  authored = build('authored');
  authoredAfter = readdirSync(drop).sort();
}, 900_000);

describe('B2-3 a build whose nifi-api version will not resolve stops', () => {
  test('B2-3 the build refuses', () => {
    expect(run.code).not.toBe(0);
  });

  test('B2-3 it says the nifi-api version could not be resolved', () => {
    expect(run.output).toContain('nifi-api');
    expect(run.output.toLowerCase()).toMatch(/could not be resolved|not be resolved/);
  });

  test('B2-3 it names the escape hatch: a pom.xml in the source directory', () => {
    expect(run.output).toContain('pom.xml');
    expect(run.output).toMatch(/(add|create|put)\b/i);
  });

  test('B2-3 it never states a version it did not resolve', () => {
    expect(run.output).not.toMatch(/^nifi_api_version\s+\S+/m);
  });

  test('B2-3 nothing reached the drop directory', () => {
    expect(after).toEqual([]);
  });
});

describe('B2-11 with its own pom, an unresolvable API does not stop the build', () => {
  test('B2-11 it is not refused for the API, and not told to add the pom it has', () => {
    // The refusal's own headline, not its wording, which the notice below shares.
    expect(authored.output).not.toContain('nar-build refused: the nifi-api version could not be resolved');
    expect(authored.output).not.toContain('Add a pom.xml');
  });

  test('B2-11 it says the version was not resolved, and why it goes on', () => {
    expect(authored.output).toContain('nar-build: the nifi-api version could not be resolved through');
    expect(authored.output).toContain('This project has its own pom.xml');
  });

  test('B2-11 and it reaches Maven, which refuses the pom for being no pom', () => {
    // The observable that the resolution no longer stopped it: the build ran.
    expect(authored.output).toContain('Non-parseable POM');
    expect(authored.output).toContain('the build of /repos/authored failed');
    expect(authored.code).toBe(2);
  });

  test('B2-11 and nothing reached the drop directory', () => {
    expect(authoredAfter).toEqual([]);
  });

  describe('B2-11 resolve_target alone', () => {
    // The report a successful author build prints, which the Maven refusal above
    // never reaches. `resolve_target` is evaluated out of the shipped script, as
    // B6-42 does with judge_and_place, with curl answering and Maven failing:
    // the resolution fails for both, and only the source of the pom differs.
    let idx = '';
    const got: Record<'author' | 'synthesised', { stdout: string; stderr: string }> = {
      author: { stdout: '', stderr: '' },
      synthesised: { stdout: '', stderr: '' }
    };
    beforeAll(() => {
      idx = mkdtempSync(join(tmpdir(), 'lu-b2-11-'));
      writeFileSync(join(idx, 'runtime'), 'nifi_version=2.11.0\njava_version=21.0.12+10-LTS\n');
      for (const source of ['author', 'synthesised'] as const) {
        got[source] = sh([
          'bash',
          '-c',
          [
            'set -u',
            `eval "$(sed -n '/^out() {/p;/^resolve_api_version() {/,/^}/p;/^resolve_target() {/,/^}/p' ${JSON.stringify(BUILD)})"`,
            'curl() { return 0; }',
            'run_maven() { return 1; }',
            'work_dir_for_build() { mktemp -d; }',
            'repo_for() { echo /nonexistent; }',
            `LIQUID_HOST=liquid LIQUID_PORT=8833 LIQUID_INDEX=${JSON.stringify(idx)} LIQUID_LOGS=/nonexistent DROP=/nonexistent`,
            `NAR_BUILD_API_PROBE_VERSION=${UNRESOLVABLE}`,
            `resolve_target ${source}; echo "rc=$?"`
          ].join('\n')
        ]);
      }
    });
    afterAll(() => idx && rmSync(idx, { recursive: true, force: true }));

    test('B2-11 for an author pom it reports the API as not resolved, and goes on', () => {
      expect({
        rc: got.author.stdout.match(/rc=(\d+)/)?.[1],
        reported: got.author.stdout.includes('nifi_api_version not resolved\n'),
        noticed: got.author.stderr.includes('This project has its own pom.xml')
      }).toEqual({ rc: '0', reported: true, noticed: true });
    });

    test('B2-11 the negative: a synthesised project still stops with 3, and the advice', () => {
      expect({
        rc: got.synthesised.stdout.match(/rc=(\d+)/)?.[1],
        advice: got.synthesised.stdout.includes('Add a pom.xml to the source directory')
      }).toEqual({ rc: '3', advice: true });
    });
  });
});
