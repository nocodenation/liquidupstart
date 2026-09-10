/**
 * M-B1 · Integration · A plain Java source produces a loadable NAR
 *
 * Purpose:  The case the milestone exists for, and the one an agent will hit
 *           first: one processor, no build file, nothing to configure. §6.4 of
 *           the liquid skill opens with "Build the NAR(s)", which nothing in
 *           this stack could do before this milestone.
 * Given:    volumes/repos/.b1-plain holding
 *           src/main/java/org/nocodenation/probe/ProbeProcessor.java — a class
 *           extending AbstractProcessor whose onTrigger body is empty, the
 *           smallest thing that is a real processor and still compiles against
 *           nifi-api — and src/main/resources/META-INF/services/
 *           org.apache.nifi.processor.Processor holding the single line
 *           org.nocodenation.probe.ProbeProcessor, which §6.3 of the skill makes
 *           mandatory. No pom.xml, so the Maven project is synthesised.
 * When:     nar-build is run against that directory inside opencode.
 * Then:     Exit 0, a .nar appears in volumes/nar_extensions, the output names
 *           the file it wrote, and the archive carries the SPI descriptor naming
 *           the processor — the check §6.3 itself prescribes.
 * Covers:   B1-5, U9, FR21, FR22
 * Unhappy:  B1-7 is the counterpart: the same fixture with one line that does
 *           not compile produces no artifact and the compiler's own message.
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
  spiDescriptorInNar,
  PROBE_CLASS,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b1-plain');
const before = dropContents();
let run: Result;
let produced: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B1-5 the build succeeds', () => {
  run = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(run.output).toBeTruthy();
  expect(run.code).toBe(0);
}, 1_200_000);

test('B1-5 exactly one NAR appeared in the drop directory', () => {
  expect(produced.filter((f) => f.endsWith('.nar'))).toEqual(produced);
  expect(produced.length).toBe(1);
});

test('B1-5 the output names the file it wrote', () => {
  expect(run.stdout).toContain(produced[0]);
  expect(run.stdout).toContain('/nar_extensions/');
});

test('B1-5 the NAR carries the SPI descriptor naming the processor', () => {
  const descriptor = spiDescriptorInNar(join(DROP_HOST, produced[0]));
  expect(descriptor.trim()).toBe(PROBE_CLASS);
});
