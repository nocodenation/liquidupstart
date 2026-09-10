/**
 * M-B2 · Unit · The resolved API version is printed, not merely used
 *
 * Purpose:  The half of "explicit" the M-B1 run treated as optional. A value
 *           that is computed correctly and never shown cannot be checked by the
 *           person the artifact is for, and the next reader has no way to know
 *           which nifi-api the NAR was built against without repeating the
 *           resolution. FR27 asks for it to be stated; FR22 asks for the answer
 *           to arrive with the build rather than in a log to be fetched.
 * Given:    volumes/repos/.b2-stated holding the B1-5 fixture —
 *           src/main/java/org/nocodenation/probe/ProbeProcessor.java, a class
 *           extending AbstractProcessor with an empty onTrigger body, and
 *           src/main/resources/META-INF/services/org.apache.nifi.processor.Processor
 *           holding the single line org.nocodenation.probe.ProbeProcessor. No
 *           pom.xml, so the project is synthesised and the resolution applies.
 * When:     nar-build is run against it inside opencode.
 * Then:     Exit 0, and the success output names the NiFi version, the Java
 *           version, the resolved nifi-api version and where that last value
 *           came from — org.apache.nifi:nifi-utils at the NiFi version read.
 * Covers:   B2-2, FR27, FR22
 * Unhappy:  B2-3 is the counterpart: when there is no value to state, nothing
 *           is printed and the build refuses instead.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuild,
  dropContents,
  targetField,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b2-stated');
const before = dropContents();
let run: Result;
let produced: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B2-2 the build succeeds', () => {
  run = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(run.output).toBeTruthy();
  expect(run.code).toBe(0);
}, 1_200_000);

test('B2-2 the output names the NiFi and Java versions', () => {
  expect(targetField(run.stdout, 'nifi_version')).toMatch(/^2\.\d+\.\d+$/);
  expect(targetField(run.stdout, 'java_version')).toMatch(/^21\./);
});

test('B2-2 the output names the resolved nifi-api version', () => {
  expect(targetField(run.stdout, 'nifi_api_version')).toMatch(/^\d+\.\d+\.\d+$/);
});

test('B2-2 it says where that version came from', () => {
  const source = targetField(run.stdout, 'nifi_api_source');
  expect(source).toContain('nifi-utils');
  expect(source).toContain(targetField(run.stdout, 'nifi_version'));
});
