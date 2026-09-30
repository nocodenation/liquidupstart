/**
 * M-B1 · Unit · unhappy · A build that cannot read the target version stops
 *
 * Purpose:  The counterpart to B1-3, and the case that decides whether FR23 is a
 *           guarantee or a hope. Guessing produces an artifact that looks built
 *           and is never loaded, which is the silent-failure class this feature
 *           exists to refuse.
 * Given:    The B1-5 fixture at volumes/repos/.b1-noversion — ProbeProcessor.java
 *           and its SPI descriptor, a source that compiles — with the version
 *           resolution pointed at the container name liquid-absent, which no
 *           service in this stack declares, so the failure under test is the
 *           unreadable version and not a broken fixture.
 * When:     nar-build is run against it inside opencode.
 * Then:     Non-zero exit; the message says the target version could not be read
 *           and names what to do; the drop directory is byte-for-byte the
 *           listing it was before.
 * Covers:   B1-4, FR23, FR24, FR20's property
 * Unhappy:  This is the negative case. Its positive counterparts are B1-3 (the
 *           same resolution, answered) and B1-5 (the same fixture, built).
 */
import { test, expect } from 'bun:test';
import { stackGuard } from '../lib/guard';
import { seedSource, dropFixture, narBuild, dropContents } from '../lib/narfixture';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b1-noversion');
const before = dropContents();
const run = narBuild('opencode', fx.container, { NAR_BUILD_LIQUID_HOST: 'liquid-absent' });
const after = dropContents();
dropFixture(fx);

test('B1-4 the build refuses', () => {
  expect(run.code).not.toBe(0);
});

test('B1-4 it says the target version could not be read', () => {
  expect(run.output.toLowerCase()).toContain('target version');
  expect(run.output).toMatch(/could not be read|not be read/);
});

test('B1-4 it names what to do next', () => {
  expect(run.output).toMatch(/start\.sh|docker compose (start|restart|up)/);
});

test('B1-4 it never names a version it guessed', () => {
  expect(run.output).not.toMatch(/nifi_version\s+\d/);
});

test('B1-4 the drop directory is unchanged', () => {
  expect(after).toEqual(before);
});
