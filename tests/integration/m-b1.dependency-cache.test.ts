/**
 * M-B1 · Integration · The dependency cache is state, and lives where state lives
 *
 * Purpose:  NFR3 says all state lives under volumes/, browsable and resettable
 *           by deleting a directory. A Maven build without a persistent
 *           repository re-downloads the NiFi API and the whole plugin chain on
 *           every build, which is both slow and a fresh trust exposure per build
 *           (§3.2).
 * Given:    volumes/repos/.b1-cache holding the B1-5 fixture, and
 *           volumes/nar_builder/m2 on the host — the cache the builder mounts at
 *           /m2. The first build populates it; the assertion is made against
 *           org/apache/nifi/nifi-api inside it, an artifact this build must
 *           resolve.
 * When:     The same source is built twice in a row.
 * Then:     The cache directory exists on the host and holds the NiFi API after
 *           the first build, and the second build reports no downloads at all —
 *           it resolved everything from the cache, which survives the container
 *           because it is a bind mount.
 * Covers:   B1-9, FR26, NFR3
 * Unhappy:  A cache that is not reused fails the second assertion: the download
 *           count would be non-zero for a build that resolves the same tree.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import {
  seedSource,
  dropFixture,
  narBuild,
  dropContents,
  cacheIsPopulated,
  CACHE_HOST,
  DROP_HOST
} from '../lib/narfixture';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const fx = seedSource('.b1-cache');
const before = dropContents();
let first: Result;
let second: Result;
let produced: string[] = [];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test('B1-9 the first build succeeds and fills the cache', () => {
  first = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(first.code).toBe(0);
  expect(existsSync(CACHE_HOST)).toBe(true);
  expect(cacheIsPopulated()).toBe(true);
}, 1_200_000);

test('B1-9 the second build succeeds without downloading anything again', () => {
  second = narBuild('opencode', fx.container);
  expect(second.code).toBe(0);
  expect(second.stdout).toMatch(/^downloads\s+0$/m);
}, 1_200_000);

test('B1-9 the cache the builds used is the one under volumes/', () => {
  expect(first.stdout).toMatch(/^cache\s+\/m2$/m);
  const api = join(CACHE_HOST, 'org/apache/nifi/nifi-api');
  expect(existsSync(api)).toBe(true);
  expect(readdirSync(api).length).toBeGreaterThan(0);
});
