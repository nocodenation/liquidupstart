/**
 * M-B1 · Integration · unhappy · A failed build does not disturb the artifact already there
 *
 * Purpose:  The drop directory is what Liquid loads on the next restart. A
 *           partial file there, or an old one left looking current after a
 *           failure the operator did not notice, is worse than an empty
 *           directory: it deploys silently. FR24 is therefore about the
 *           directory's state, not only about the build's exit code, and this
 *           case compares the artifact's SHA-256 across the failed build rather
 *           than counting files — a stale NAR is invisible to a check that only
 *           counts.
 * Given:    volumes/repos/.b1-stale, built once from the B1-5 source so a
 *           known-good .nar exists and its SHA-256 is recorded; then the same
 *           directory with B1-7's broken line — int probe = "probe"; — so the
 *           second build fails into the same place.
 * When:     nar-build is run twice against that one directory.
 * Then:     The first build succeeds; the second fails; the existing .nar has
 *           the SHA-256 it had before; and no other file — partial, temporary
 *           or otherwise — is left in the directory.
 * Covers:   B1-8, FR24
 * Unhappy:  The failing half is the case. The passing half is its own control:
 *           if the first build did not produce an artifact there would be
 *           nothing to leave stale, and the test says so rather than passing.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuild,
  dropContents,
  sha256,
  BROKEN_SOURCE,
  PROBE_PACKAGE,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b1-stale');
const before = dropContents();
let good: Result;
let bad: Result;
let artifact = '';
let shaBefore = '';
let shaAfter = '';
let listingBefore: string[] = [];
let listingAfter: string[] = [];

afterAll(() => {
  dropFixture(fx);
  if (artifact) rmSync(join(DROP_HOST, artifact), { force: true });
});

test('B1-8 a known-good NAR is in place first', () => {
  good = narBuild('opencode', fx.container);
  expect(good.code).toBe(0);
  const produced = dropContents().filter((f) => !before.includes(f));
  expect(produced.length).toBe(1);
  artifact = produced[0];
  shaBefore = sha256(join(DROP_HOST, artifact));
  listingBefore = dropContents();
  expect(shaBefore).toMatch(/^[0-9a-f]{64}$/);
}, 1_200_000);

test('B1-8 the second build, of a source that does not compile, fails', () => {
  writeFileSync(
    join(fx.host, 'src/main/java', ...PROBE_PACKAGE.split('.'), 'ProbeProcessor.java'),
    BROKEN_SOURCE
  );
  bad = narBuild('opencode', fx.container);
  listingAfter = dropContents();
  shaAfter = sha256(join(DROP_HOST, artifact));
  expect(bad.code).not.toBe(0);
  expect(bad.output).toContain('incompatible types');
}, 1_200_000);

test('B1-8 the earlier artifact is byte-identical', () => {
  expect(shaAfter).toBe(shaBefore);
});

test('B1-8 no partial or temporary file was left beside it', () => {
  expect(listingAfter).toEqual(listingBefore);
});
