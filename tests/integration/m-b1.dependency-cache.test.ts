/**
 * M-B1 · Integration · No cache is shared between builds, and the seed is why that is affordable
 *
 * Purpose:  **Rewritten 2026-10-11, and the case it replaces asserted the
 *           opposite.** It was *"The dependency cache is state, and lives where
 *           state lives"*, and it held that `volumes/nar_builder/m2` existed on
 *           the host and that the second build downloaded nothing from it. That
 *           mount was B1's fourth leg, 2026-10-01 review: build-time code could
 *           plant an artifact there that every later build resolved. FR26 is
 *           rewritten and the mount is gone, so the signed assertion became the
 *           defect.
 *
 *           What survives is the half that was worth having. A build still has
 *           to download nothing, because re-resolving the NiFi API and the whole
 *           plugin chain per build is slow and is a fresh trust exposure each
 *           time (§3.2). It is now achieved by copying a seed out of the image
 *           instead of sharing a directory, so the same `downloads 0` reading
 *           means something stronger: nothing was shared **and** nothing was
 *           fetched.
 * Given:    volumes/repos/.b1-cache holding the B1-5 fixture, and the installed
 *           stack's nar_builder carrying the seed at /opt/builder/m2-seed.
 * When:     The same source is built twice in a row.
 * Then:     Both builds succeed; each reports a repository under its own work
 *           directory rather than a shared `/m2`; that directory is gone from
 *           the container afterwards; the second build reports no downloads; and
 *           the build names the seed it matched (FR40).
 * Covers:   B1-9, FR26, FR37, FR38, FR40
 * Needs:     the installed builder image to carry the seed. It is computed, not
 *            assumed -- `docker exec nar_builder test -d /opt/builder/m2-seed`
 *            -- because this case drives the running stack, and an installation
 *            whose image predates 2026-10-11 has no seed and would fail here for
 *            the wrong reason. #22's lesson: a case that depends on its
 *            environment asks, and a skip is never silent.
 * Unhappy:  Three negatives, and they are the point of the rewrite. A `cache`
 *           line, or a repository path outside the work directory, means a
 *           shared cache has come back. A repository that still exists after the
 *           build means it was not discarded, so one build's artifacts can reach
 *           the next. And a non-zero download count on the second build means
 *           the seed is not doing the job the removed mount used to do.
 */
import { test, expect, afterAll } from 'bun:test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { stackGuard } from '../lib/guard';
import { seedSource, dropFixture, narBuild, dropContents, DROP_HOST } from '../lib/narfixture';
import { sh } from '../lib/shell';
import type { Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

/**
 * Does the installed builder carry the seed?
 *
 * Computed rather than remembered. This case asserts properties of the image
 * built from this branch; against an older image every assertion is false for a
 * reason that has nothing to do with the code, which is the failure mode #22
 * exists against.
 */
const SEEDED_IMAGE =
  sh(['docker', 'exec', 'nar_builder', 'test', '-d', '/opt/builder/m2-seed']).code === 0;

const fx = seedSource('.b1-cache');
const before = dropContents();
let first: Result;
let second: Result;
let produced: string[] = [];

/** The repository path the build reported, out of its own output. */
const reportedRepo = (out: string) => out.match(/^repository\s+(\S+?),/m)?.[1];

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test.skipIf(!SEEDED_IMAGE)('B1-9 the first build succeeds and resolves into its own repository', () => {
  first = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(first.code).toBe(0);
  // Under the build's own work directory, which is where it is discarded from.
  const repo = reportedRepo(first.stdout);
  expect(repo).toMatch(/^\/tmp\/[^/]+\/m2$/);
  // And seeded from the image rather than from a mount.
  expect(first.stdout).toMatch(/^repository\s+\S+, seeded from \/opt\/builder\/m2-seed$/m);
  // The line the old arrangement printed is gone, by name.
  expect(first.stdout).not.toMatch(/^cache\s/m);
}, 1_200_000);

test.skipIf(!SEEDED_IMAGE)('B1-9 and that repository does not survive the build', () => {
  // The whole of the fourth leg: if it survived, an artifact one build wrote
  // would be there for the next one to resolve.
  const repo = reportedRepo(first.stdout)!;
  expect(repo).toBeTruthy();
  const probe = sh(['docker', 'exec', 'nar_builder', 'test', '-e', repo]);
  expect(probe.code).not.toBe(0);
});

test.skipIf(!SEEDED_IMAGE)('B1-9 the second build succeeds without downloading anything', () => {
  second = narBuild('opencode', fx.container);
  expect(second.code).toBe(0);
  expect(second.stdout).toMatch(/^downloads\s+0$/m);
  // A different repository from the first, so the zero is not a shared cache
  // wearing the seed's clothes.
  expect(reportedRepo(second.stdout)).not.toBe(reportedRepo(first.stdout));
}, 1_200_000);

test.skipIf(!SEEDED_IMAGE)('B1-9 and the build says which seed it matched', () => {
  // FR40. The reading that matters is the mismatch, and it earned itself: the
  // seeding step once took the nifi-api version as an argument defaulted to the
  // NiFi version, 2.11.0 ships nifi-api 2.10.0, and this line is what reported
  // that the seed was serving almost nothing.
  expect(first.stdout).toMatch(/^seed\s+\S+, matching this build$/m);
});

test.skipIf(SEEDED_IMAGE)('B1-9 the installed builder image has no seed, so this file is skipped', () => {
  // Not a label: it reads the absence, so a run in this state says why four
  // cases are missing instead of leaving a silent gap. Rebuild with
  // ./scripts/linux/build.sh and restart the builder to run them.
  expect(sh(['docker', 'exec', 'nar_builder', 'test', '-d', '/opt/builder/m2-seed']).code).not.toBe(0);
});
