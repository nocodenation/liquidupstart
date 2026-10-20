/**
 * M-B7 · Contract · The builder shares no dependency cache, and the seed is declared where it is read
 *
 * Purpose:  B1's fourth leg, 2026-10-01 review: `volumes/nar_builder/m2` was
 *           mounted read-write and build-time code could plant an artifact there
 *           that every later build resolved. It is closed by there being no
 *           shared cache at all — each build resolves into its own repository,
 *           copied from a seed baked into the image (FR26, FR37, FR38).
 *
 *           These are the declarations rather than the behaviour. The behaviour
 *           was measured end-to-end on 2026-10-11 and is recorded in §3.2: 7 s
 *           and **0 downloads** against the shared cache's 67 s and 665
 *           downloads cold, and 9 s warm. What a case can hold cheaply and
 *           for ever is that the mount has not come back, that the pins are
 *           where both readers look, and that the files parse — which is not
 *           rhetorical: `settings.xml` was rejected by Maven with
 *           *Non-parseable settings* because an XML comment contained `--`,
 *           and nothing but a parse would have caught it.
 * Given:    compose.yml, config/nar_builder/{Dockerfile,build.sh,seed.sh,
 *           lifecycle-pins.xml} and config/scripts/start/nar-builder.sh.
 * When:     Each is read as text, and the pins file is parsed as XML.
 * Then:     No /m2 mount is declared anywhere; the seeding step is invoked by
 *           the image build with one version argument; build.sh copies the seed
 *           per build and splices the pins; and the pins name every plugin the
 *           default lifecycle binds.
 * Covers:   B7-1, B7-2, B7-3, B7-4, FR26, FR37, FR38, FR39
 * Unhappy:  B7-1's negative half is the mount coming back, by any spelling.
 *           B7-3's is a pins file that parses but has lost a plugin, which is
 *           how the first attempt failed: with resources, compiler, jar and
 *           surefire pinned a build still refused on maven-install-plugin,
 *           whose goal `package` never reaches.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import { sh } from '../lib/shell';

const read = (p: string) => readFileSync(join(repoRoot, p), 'utf8');
/**
 * The script with its comment lines removed.
 *
 * Asserting that a shell script does *not* contain something has to be done
 * against the code, because the comment explaining why it is not there contains
 * it. `cp -al` is exactly that: `repo_for`'s comment says a hardlink farm would
 * reopen the write path, so a naive `not.toContain` matched the explanation and
 * failed. The same shape as the `refused:` reader in m-b1.refusal-next-step.
 */
const code = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
const compose = read('compose.yml');
const dockerfile = read('config/nar_builder/Dockerfile');
const buildSh = read('config/nar_builder/build.sh');
const seedSh = read('config/nar_builder/seed.sh');
const pinsPath = 'config/nar_builder/lifecycle-pins.xml';
const pins = read(pinsPath);

test('B7-1 no shared Maven cache is mounted into any service, by any spelling', () => {
  // Matched on the container side of the mount rather than on the host path, so
  // moving the host directory does not let the mount back in unnoticed.
  const mounts = compose
    .split('\n')
    .filter((l) => /^\s*-\s+\S+:\S/.test(l))
    .filter((l) => /:\/m2(:|\s*$)/.test(l));
  expect(mounts).toEqual([]);
  // And the image does not create the directory either, so a stray mount would
  // not land on a prepared path.
  expect(code('config/nar_builder/Dockerfile')).not.toMatch(/mkdir[^\n]*\s\/m2(\s|\\|$)/m);
});

test('B7-1 and each build resolves into its own repository, copied from the seed', () => {
  // The three things that make it per-build: the repository lives under the
  // build's own work directory, it starts as a copy of the seed, and nothing
  // names a shared path.
  expect(buildSh).toContain('d="${1}/m2"');
  expect(buildSh).toContain('cp -a "$SEED" "$d"');
  expect(code('config/nar_builder/build.sh')).not.toContain('CACHE=/m2');
  // A hardlink farm would share inodes with the seed and reopen the write path
  // the whole change exists to close.
  expect(code('config/nar_builder/build.sh')).not.toMatch(/cp\s+-al\b/);
});

test('B7-2 the image build owns the seeding step, with the api version resolved rather than passed', () => {
  expect(dockerfile).toMatch(/RUN\s+\/opt\/builder\/seed\.sh/);
  // One version argument. Two was a defect: NiFi 2.11.0 ships nifi-api 2.10.0
  // (FR27), the Dockerfile defaulted the api version to the NiFi version, and
  // the build then deployed while the seed served almost none of it.
  expect(dockerfile).toContain('ARG SEED_NIFI_VERSION');
  expect(dockerfile).not.toContain('ARG SEED_NIFI_API_VERSION');
  expect(seedSh).toContain('nifi-api:jar');
  // The seed must not be writable by the build user, so it is not chowned to it.
  expect(code('config/nar_builder/Dockerfile')).not.toMatch(/chown[^\n]*builder[^\n]*m2-seed/);
});

test('B7-3 the pins file parses, and names every plugin the default lifecycle binds', () => {
  // It parses: `settings.xml` once did not, because an XML comment held `--`,
  // and Maven answered `Non-parseable settings`. A `.xml` file nobody parses is
  // a file nobody has checked.
  // A real parse, by a real parser, rather than a regex that would agree with
  // the file whatever is in it.
  const parsed = sh([
    'python3',
    '-c',
    'import sys,xml.etree.ElementTree as ET; ET.parse(sys.argv[1])',
    join(repoRoot, pinsPath)
  ]);
  expect(parsed.code).toBe(0);
  expect(parsed.stderr).toBe('');

  // Every plugin `package` causes a version to be resolved for -- including the
  // goals it never executes, which is the half that was missed first.
  for (const plugin of [
    'maven-resources-plugin',
    'maven-compiler-plugin',
    'maven-jar-plugin',
    'maven-surefire-plugin',
    'maven-install-plugin',
    'maven-deploy-plugin',
    'maven-clean-plugin',
    'maven-site-plugin'
  ]) {
    expect(pins).toContain(`<artifactId>${plugin}</artifactId>`);
  }
  // Each one pinned to an actual version rather than left to resolution.
  const pinned = [...pins.matchAll(/<artifactId>maven-[a-z]+-plugin<\/artifactId><version>([^<]+)</g)];
  expect(pinned.length).toBeGreaterThanOrEqual(8);
  for (const [, version] of pinned) expect(version).toMatch(/^\d+\.\d+/);
});

test('B7-3 and both readers take the pins from this one file', () => {
  // One declaration, two readers: if the seeding step and the build could pin
  // differently, the seed would be the closure of a build that never runs.
  expect(seedSh).toContain('lifecycle-pins.xml');
  expect(buildSh).toContain('PINS=/opt/builder/lifecycle-pins.xml');
  expect(buildSh).toContain('${pins}');
  expect(dockerfile).toContain('COPY lifecycle-pins.xml');
});

test('B7-4 the stale host directory is named once and not deleted', () => {
  const notice = read('config/scripts/start/nar-builder.sh');
  // Named, so an installation that ran before the move is told the directory is
  // dead rather than left to wonder.
  expect(notice).toContain('volumes/nar_builder/m2');
  expect(notice).toMatch(/you can delete it/);
  // And not deleted: removing a directory the operator may have copied
  // something into is not a start script's call. Same shape as liquid.sh's
  // notice about volumes/liquid/api.
  expect(notice).not.toMatch(/\brm\s+-rf?\b/);
  // It only speaks when there is something to speak about.
  expect(notice).toMatch(/if \[ -d "\$STALE" \]/);
  expect(read('scripts/linux/start.sh')).toContain('start/nar-builder.sh');
});
