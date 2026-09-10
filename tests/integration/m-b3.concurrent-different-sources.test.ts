/**
 * M-B3 · Integration · Two builds at once, different sources
 *
 * Purpose:  One builder, one Maven local repository at volumes/nar_builder/m2,
 *           one /repos. Two agents building at the same time is the ordinary
 *           situation and nothing in this stack has ever run two builds
 *           together, so the concurrency safety of the shared cache and the
 *           shared drop directory has never been established. FR35.
 * Given:    volumes/repos/.b3-a and volumes/repos/.b3-b, each the B1-5 fixture
 *           with a processor of its own — .b3-a holds
 *           src/main/java/org/nocodenation/probe/ProbeA.java and an SPI
 *           descriptor whose single line is org.nocodenation.probe.ProbeA;
 *           .b3-b the same with ProbeB. Neither carries a pom.xml, so both
 *           projects are synthesised, and build.sh takes the artifact name from
 *           the directory: b3-a-nar-1.0.0.nar and b3-b-nar-1.0.0.nar. The cache
 *           is warm before the pair runs — B1-9 filled it — and the case asserts
 *           that rather than assuming it, because a cold cache would turn this
 *           into a measurement of two download storms instead of the collision.
 * When:     Both nar-build invocations are started from opencode before either
 *           returns, and a third build of .b3-a is run after both have.
 * Then:     Both exit 0. Both artifacts are in volumes/nar_extensions. Each NAR
 *           carries its own processor in the SPI descriptor and not the other's.
 *           The cache is intact afterwards: the third build resolves everything
 *           from it and reports `downloads 0`, the same line B1-9 asserts.
 * Covers:   B3-3, FR35, FR26
 * Unhappy:  B3-4 is the counterpart — the same pair aimed at one source
 *           directory, where the two builds contend for a single artifact name.
 * Overlap:  Established, not assumed. BuildServer serves on
 *           Executors.newFixedThreadPool(2), so two requests fit and a third
 *           queues — a pair that happened to serialise would pass a test that
 *           checked only that both succeeded, and would be measuring the queue.
 *           While the two builds run, the builder's /proc is sampled every 150 ms
 *           for `/opt/builder/build.sh build <source>` processes started by the
 *           BuildServer itself, and the case requires at least one sample holding
 *           two distinct process ids, one building .b3-a and one building .b3-b.
 *           Parentage matters: build.sh calls resolve_target through $(...) and
 *           the sub-shell inherits the cmdline, so counting matching lines would
 *           make one build look like two.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuild,
  narBuildAsync,
  observeBuilds,
  dropContents,
  spiDescriptorInNar,
  cacheIsPopulated,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const a = seedSource('.b3-a', { className: 'ProbeA' });
const b = seedSource('.b3-b', { className: 'ProbeB' });
const before = dropContents();
const cacheWarmBefore = cacheIsPopulated();

const observer = observeBuilds();
const pair = await Promise.all([
  narBuildAsync('opencode', a.container),
  narBuildAsync('opencode', b.container)
]);
const observation = await observer.stop();
const third: Result = narBuild('opencode', a.container);

const produced = dropContents().filter((f) => !before.includes(f));

afterAll(() => {
  dropFixture(a);
  dropFixture(b);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B3-3 the cache was already warm, so the pair measures the collision', () => {
  expect(cacheWarmBefore).toBe(true);
});

test('B3-3 the two builds were in flight at the same instant', () => {
  const together = observation.samples.filter(
    (s) =>
      s.some((p) => p.source === a.name) &&
      s.some((p) => p.source === b.name) &&
      new Set(s.map((p) => p.pid)).size > 1
  );
  expect({
    samples: observation.samples.length > 0,
    together: together.length > 0,
    seen: observation.concurrent[0] ?? []
  }).toEqual({ samples: true, together: true, seen: observation.concurrent[0] ?? [] });
  expect(together.length).toBeGreaterThan(0);
});

test('B3-3 both builds exit 0', () => {
  for (const r of pair) {
    expect({ code: r.code, said: r.output.trim().slice(-400) }).toEqual({
      code: 0,
      said: r.output.trim().slice(-400)
    });
  }
  expect(pair.every((r) => r.output.length > 0)).toBe(true);
});

test('B3-3 both artifacts are in the drop directory', () => {
  expect(produced.sort()).toEqual([a.artifact, b.artifact].sort());
});

test('B3-3 each NAR carries its own processor and not the other one', () => {
  const inA = spiDescriptorInNar(join(DROP_HOST, a.artifact)).trim();
  const inB = spiDescriptorInNar(join(DROP_HOST, b.artifact)).trim();
  expect(inA).toBe(a.processor);
  expect(inB).toBe(b.processor);
  expect(inA).not.toContain(b.processor);
  expect(inB).not.toContain(a.processor);
});

test('B3-3 the cache survived the pair: a third build downloads nothing', () => {
  expect(third.code).toBe(0);
  expect(third.stdout).toMatch(/^downloads\s+0$/m);
  expect(cacheIsPopulated()).toBe(true);
});
