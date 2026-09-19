/**
 * M-B3 · Integration · Two builds at once, one source — the sharper half
 *
 * Purpose:  Two invocations of nar-build against the same directory produce the
 *           same artifact name, and before this milestone they also produced the
 *           same temporary path: build.sh copied into ${DROP}/.${base}.part,
 *           derived from the artifact name and nothing else, and its INT/TERM
 *           trap removed that path — which by then could belong to the other
 *           build. Two writers in one file leave a torn archive, and a torn
 *           archive does not fail the build: Liquid's entrypoint copies whatever
 *           it finds in the drop directory into lib/ on the next restart, so the
 *           failure lands on a deployment nobody connects to it. FR35, and FR24
 *           in the direction it never covered — it protects the directory
 *           against a failed build, not against two successful ones.
 * Given:    volumes/repos/.b3-same, the B1-5 fixture with one processor:
 *           src/main/java/org/nocodenation/probe/ProbeSame.java, a class
 *           extending AbstractProcessor with an empty onTrigger, and
 *           src/main/resources/META-INF/services/org.apache.nifi.processor.Processor
 *           holding the single line org.nocodenation.probe.ProbeSame. No
 *           pom.xml, so the project is synthesised and build.sh names the
 *           artifact b3-same-nar-1.0.0.nar from the directory — the same name
 *           for both invocations, which is the collision. The cache is warm
 *           before the pair runs, asserted rather than assumed.
 * When:     Two nar-build invocations are started against that one directory
 *           from opencode, both before either returns.
 * Then:     At least one succeeds, and every invocation that did not exit 0 said
 *           `refused` and named what to do — the two outcomes the specification
 *           admits. Exactly one b3-same-nar-1.0.0.nar is in the drop directory
 *           and it opens: `unzip -t` passes over every entry, the archive lists
 *           entries, and its SPI descriptor reads back as
 *           org.nocodenation.probe.ProbeSame. Nothing named .part is left beside
 *           it, and no dotfile of any kind.
 * Covers:   B3-4, FR35, FR24
 * Unhappy:  This is the unhappy half of the milestone's concurrency pair; B3-3
 *           is the positive counterpart, two builds of different sources.
 * Overlap:  Established, not assumed, in the same way as B3-3: the builder's
 *           /proc is sampled every 150 ms while the pair runs, and the case
 *           requires a sample holding two distinct process ids, both running
 *           `/opt/builder/build.sh build .b3-same` and both started by the
 *           BuildServer itself. Both halves of that matter here: the two builds
 *           carry the same source path, so only the process ids tell them apart,
 *           and build.sh's own $(...) sub-shell inherits the cmdline, so a
 *           sample counted by matching lines alone would show one build as two.
 *           BuildServer's thread pool holds two, so a serialised pair would look
 *           identical from the outside and would be measuring the queue.
 * Note:     Which of the two admissible outcomes occurs is deliberately not
 *           asserted. The decision taken for this milestone gives each build a
 *           temporary path of its own, ${DROP}/.${base}.$$.part, and leaves the
 *           final placement a single mv — rename(2) on the shared bind mount,
 *           and therefore atomic, so a reader sees the previous artifact or the
 *           complete new one and never a partial. Under that decision both
 *           builds succeed; asserting that here would pin the implementation
 *           rather than the rule.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync, readdirSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuildAsync,
  observeBuilds,
  dropContents,
  narEntries,
  narIntegrity,
  spiDescriptorInNar,
  cacheIsPopulated,
  DROP_HOST
} from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b3-same', { className: 'ProbeSame' });
const before = dropContents();
const cacheWarmBefore = cacheIsPopulated();

const observer = observeBuilds();
const pair = await Promise.all([
  narBuildAsync('opencode', fx.container),
  narBuildAsync('opencode', fx.container)
]);
const observation = await observer.stop();

const produced = dropContents().filter((f) => !before.includes(f));
const artifact = join(DROP_HOST, fx.artifact);

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B3-4 the cache was already warm, so the pair measures the write', () => {
  expect(cacheWarmBefore).toBe(true);
});

test('B3-4 both builds were in flight against the same source at one instant', () => {
  const together = observation.samples.filter(
    (s) =>
      s.filter((p) => p.source === fx.name).length > 1 &&
      new Set(s.map((p) => p.pid)).size > 1
  );
  expect({
    samples: observation.samples.length > 0,
    together: together.length > 0,
    seen: observation.concurrent[0] ?? []
  }).toEqual({ samples: true, together: true, seen: observation.concurrent[0] ?? [] });
  expect(together.length).toBeGreaterThan(0);
});

test('B3-4 both invocations reported an outcome, and at least one succeeded', () => {
  for (const r of pair) expect(r.output.trim().length).toBeGreaterThan(0);
  expect(pair.some((r) => r.code === 0)).toBe(true);
});

test('B3-4 an invocation that did not succeed refused in words', () => {
  for (const r of pair.filter((x) => x.code !== 0)) {
    expect(r.output).toContain('nar-build refused:');
    expect(r.output).toMatch(/run nar-build again|Ask the operator/);
  }
});

test('B3-4 exactly one artifact is in the drop directory', () => {
  expect(produced).toEqual([fx.artifact]);
});

test('B3-4 no temporary file was left beside it', () => {
  expect(readdirSync(DROP_HOST).filter((f) => f.startsWith('.') || f.endsWith('.part'))).toEqual([]);
});

test('B3-4 the artifact opens: every entry passes its own check', () => {
  const check = narIntegrity(artifact);
  expect({ code: check.code, said: check.output.trim().slice(-300) }).toEqual({
    code: 0,
    said: check.output.trim().slice(-300)
  });
  expect(narEntries(artifact).length).toBeGreaterThan(0);
  expect(spiDescriptorInNar(artifact).trim()).toBe(fx.processor);
});
