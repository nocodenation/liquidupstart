/**
 * M-B7 · Integration · An author pom naming something the seed has never held
 *
 * Purpose:  The seed is built from what the **synthesiser's** pom needs, so every
 *           case that exercises it resolves out of it and reads `downloads 0`.
 *           That is the warm path, and it is the only one measured. The ordinary
 *           reason to write a pom at all is to name a dependency the synthesiser
 *           would never add — an SSL context service API, a client library, a
 *           JSON mapper — and nothing says what happens then.
 *
 *           Two ways it could be wrong, and they fail in opposite directions. A
 *           seed treated as a **whitelist** would refuse the build, which would
 *           make the fourth leg of B1 a ceiling on the feature `B1-6` exists to
 *           protect. A seed that quietly **persisted** what a build downloaded
 *           would put the fourth leg back where it started: an artifact one
 *           build fetched, there for the next one to resolve.
 * Given:    `volumes/repos/.b7-unseeded`: the B1-5 fixture with a pom whose
 *           artifactId is `probe-unseeded`, declaring
 *           `com.fasterxml.jackson.core:jackson-databind:2.18.2` and
 *           `com.google.guava:guava:33.4.0-jre` — neither of which is in the
 *           seed, which the first scenario reads rather than assumes. Its
 *           nifi-api version and compiler release come from `nar-build --target`,
 *           so the fixture bends to the running Liquid.
 * When:     `nar-build` is run against it, twice.
 * Then:     The seed holds neither dependency; the build succeeds; `downloads` is
 *           greater than zero and the bundle carries both jars; the build's own
 *           repository is gone afterwards; and a second build downloads them
 *           again rather than finding them where the first one left them.
 * Covers:   B7-5, B1-6, FR37, FR38
 * Unhappy:  A seed used as a whitelist fails scenario 2. A seed that kept what a
 *           build downloaded fails scenario 5 — and that one is the counterpart
 *           to `B1-9`'s `downloads 0`: between them they say the per-build
 *           repository starts from the seed and from nothing else.
 * Precondition: the installed builder image carries `/opt/builder/m2-seed`,
 *           computed by `docker exec` rather than remembered. Against an older
 *           image every assertion here is false for a reason that has nothing to
 *           do with the code, and the skip says so out loud.
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
  narEntries,
  unseededPom,
  target,
  targetField,
  UNSEEDED_ARTIFACT,
  UNSEEDED_DEPENDENCIES,
  UNSEEDED_JARS,
  DROP_HOST
} from '../lib/narfixture';
import { sh, type Result } from '../lib/shell';

stackGuard(['liquid', 'nar_builder', 'opencode']);

const SEEDED_IMAGE =
  sh(['docker', 'exec', 'nar_builder', 'test', '-d', '/opt/builder/m2-seed']).code === 0;

const resolved = target();
const fx = seedSource('.b7-unseeded', {
  pom: unseededPom(
    targetField(resolved.stdout, 'nifi_api_version') || targetField(resolved.stdout, 'nifi_version'),
    targetField(resolved.stdout, 'java_major')
  )
});
const before = dropContents();
let first: Result;
let second: Result;
let produced: string[] = [];

const reportedRepo = (out: string) => out.match(/^repository\s+(\S+?),/m)?.[1];
const downloads = (out: string) => Number(out.match(/^downloads\s+(\d+)$/m)?.[1] ?? NaN);

afterAll(() => {
  dropFixture(fx);
  for (const f of produced) rmSync(join(DROP_HOST, f), { force: true });
});

test.skipIf(!SEEDED_IMAGE)('B7-5 the seed holds neither dependency, which is what makes this case mean anything', () => {
  // Read, not assumed. If a later change seeded jackson for its own reasons,
  // every assertion below would still pass and would be measuring the warm path
  // again -- the case would quietly stop being about what it says it is about.
  for (const d of UNSEEDED_DEPENDENCIES) {
    const path = `/opt/builder/m2-seed/${d.groupId.replace(/\./g, '/')}/${d.artifactId}`;
    const probe = sh(['docker', 'exec', 'nar_builder', 'test', '-e', path]);
    expect(probe.code, `${d.groupId}:${d.artifactId} is in the seed`).not.toBe(0);
  }
});

test.skipIf(!SEEDED_IMAGE)('B7-5 the build succeeds, so the seed is a starting point and not a whitelist', () => {
  first = narBuild('opencode', fx.container);
  produced = dropContents().filter((f) => !before.includes(f));
  expect(first.code).toBe(0);
  // Named from the author's pom, which is B1-6's property reaching this far.
  expect(produced).toContain(`${UNSEEDED_ARTIFACT}-1.0.0.nar`);
}, 1_200_000);

test.skipIf(!SEEDED_IMAGE)('B7-5 and it downloaded them, with both inside the bundle', () => {
  // `downloads 0` is what B1-9 asserts about the warm path. The reading here is
  // its opposite, and it has to be, or the two dependencies came from somewhere
  // they should not have.
  expect(downloads(first.stdout)).toBeGreaterThan(0);
  const entries = narEntries(join(DROP_HOST, `${UNSEEDED_ARTIFACT}-1.0.0.nar`));
  for (const jar of UNSEEDED_JARS) {
    expect(entries.some((e) => e.endsWith(jar)), `${jar} is not in the bundle`).toBe(true);
  }
});

test.skipIf(!SEEDED_IMAGE)('B7-5 and the repository it downloaded into does not survive', () => {
  const repo = reportedRepo(first.stdout)!;
  expect(repo).toBeTruthy();
  expect(sh(['docker', 'exec', 'nar_builder', 'test', '-e', repo]).code).not.toBe(0);
});

test.skipIf(!SEEDED_IMAGE)('B7-5 so a second build downloads them again rather than finding them', () => {
  // **The counterpart to B1-9's zero, and the point of the whole leg.** B1-9
  // says a second build of a seeded project downloads nothing; this says a
  // second build of an *unseeded* one downloads again. If this read 0, what the
  // first build fetched had outlived it -- which is exactly the shared cache the
  // fourth leg removed, reappearing as a side effect of the seed.
  second = narBuild('opencode', fx.container);
  expect(second.code).toBe(0);
  expect(downloads(second.stdout)).toBeGreaterThan(0);
  expect(reportedRepo(second.stdout)).not.toBe(reportedRepo(first.stdout));
}, 1_200_000);

test.skipIf(SEEDED_IMAGE)('B7-5 the installed builder image has no seed, so this file is skipped', () => {
  // Not a label: it reads the absence, so a run in this state says why five
  // cases are missing instead of leaving a silent gap. Rebuild with
  // ./scripts/linux/build.sh and restart the builder to run them.
  expect(sh(['docker', 'exec', 'nar_builder', 'test', '-d', '/opt/builder/m2-seed']).code).not.toBe(0);
});
