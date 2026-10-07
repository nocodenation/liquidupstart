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
 * Covers:   B2-3, FR27, FR24, FR20's property
 * Unhappy:  This is the negative case. Its positive counterparts are B2-1 and
 *           B2-2, which still run against the stack.
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
    "sh /probe/build.sh build probe 2>&1",
    "echo \"exit=$?\"",
  ].join('\n') + '\n';

let run = { code: -1, output: '' };
let after: string[] = [];

beforeAll(() => {
  const script = join(work, 'probe.sh');
  writeFileSync(script, PROBE, { mode: 0o755 });
  const r = sh([
    'docker', 'run', '--rm',
    '-v', `${BUILD}:/probe/build.sh:ro`,
    '-v', `${join(work, 'repos')}:/repos:ro`,
    '-v', `${drop}:/deploy/nar_extensions`,
    '-v', `${script}:/probe.sh:ro`,
    '--env', `NAR_BUILD_API_PROBE_VERSION=${UNRESOLVABLE}`,
    '--entrypoint', 'sh', IMAGE, '/probe.sh'
  ]);
  const m = r.output.match(/exit=(\d+)\s*$/);
  run = { code: m ? Number(m[1]) : -1, output: r.output };
  after = readdirSync(drop).sort();
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
