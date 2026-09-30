/**
 * M-B2 · Unit · unhappy · An unresolvable nifi-api refuses, and names the way out
 *
 * Purpose:  The failure the M-B1 run anticipated: a NiFi whose nifi-utils is not
 *           on Central at the version read, so nothing can say which nifi-api
 *           the distribution was built against. It fails loudly, which is good,
 *           but a loud failure without a next step is still a dead end — FR20's
 *           property, asserted once per tool since A6-11. The refusal must also
 *           leave the drop directory alone (FR24): a build that half-happened is
 *           the stale artifact Liquid would load on the next restart.
 * Given:    volumes/repos/.b2-unresolvable holding the B1-5 fixture —
 *           ProbeProcessor.java with an empty onTrigger body and the SPI
 *           descriptor naming org.nocodenation.probe.ProbeProcessor, a source
 *           that compiles, so the failure under test is the resolution and not a
 *           broken fixture. The resolution is pointed at NiFi 99.99.99 through
 *           NAR_BUILD_API_PROBE_VERSION, a version no release can supply by
 *           accident, which makes org.apache.nifi:nifi-utils:99.99.99
 *           unresolvable on Central.
 * When:     nar-build is run against it inside opencode with that lever set.
 * Then:     Non-zero exit; the message says the nifi-api version could not be
 *           resolved and names the escape hatch B1-6 already proves — a pom.xml
 *           in the source directory, used unchanged; no version is printed as if
 *           it had been resolved; and the drop directory's listing is what it was
 *           before.
 * Covers:   B2-3, FR27, FR24, FR20's property
 * Unhappy:  This is the negative case. Its positive counterparts are B2-1 (the
 *           same resolution, answered) and B2-2 (the same fixture, built).
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
  API_PROBE_LEVER,
  UNRESOLVABLE_VERSION,
  DROP_HOST
} from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b2-unresolvable');
const before = dropContents();
const run = narBuild('opencode', fx.container, { [API_PROBE_LEVER]: UNRESOLVABLE_VERSION });
const after = dropContents();
dropFixture(fx);

afterAll(() => {
  for (const f of after.filter((f) => !before.includes(f))) rmSync(join(DROP_HOST, f), { force: true });
});

test('B2-3 the build refuses', () => {
  expect(run.code).not.toBe(0);
}, 600_000);

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
  expect(after).toEqual(before);
});
