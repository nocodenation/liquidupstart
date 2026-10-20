/**
 * M-B5 · Integration · A real move, end to end
 *
 * Purpose:  B5-33 proves the detector. This proves the claim the detector was
 *           built for: that an upstream release turns the version-pinning cases
 *           into skips with a reason, and nothing red. The branch first measured it
 *           by moving `WRITTEN_AGAINST` and leaving the image alone, which cannot
 *           show it — every bundle the cases name was still there, so setup that ran
 *           despite the skips succeeded. The review of 2026-10-20 found what that
 *           hid: `m-b5.hand-drop`'s file-level `beforeAll` runs on a move (measured,
 *           bun 1.4.3: a file-level hook runs when every case is skipped, and a throw
 *           in it is `1 fail`), finds no bundle to rewrite, and throws. It also
 *           found the opposite defect: B5-4, B5-15 to B5-17, B5-27, B6-24's fixture
 *           cases, B6-25 and B6-26 pin nothing of the image and skipped anyway, so a
 *           release that broke them would have shipped green.
 * Given:    An image built `FROM` the product's Liquid image with what a release
 *           changes for these files: `lib/nifi-api-<api>.jar` and every bundle the
 *           pinned literals name renamed one minor up, so the names the cases carry
 *           are gone. Both are computed from
 *           `pinnedLiterals` and `WRITTEN_AGAINST`, so the image moves when they do.
 * When:     Every test file that imports `tests/lib/liquidimage.ts`, less B5-33 and
 *           this one, runs in a child `bun test` with `LU_TEST_LIQUID_IMAGE`
 *           pointing at that image and a JUnit report written
 * Then:     No case fails; every case that pins the image skips; every case that
 *           pins nothing of it runs and passes, including all of the three M-B6
 *           files that read every version out of the image
 * Covers:   B5-34, FR21, FR23
 * Negative: The pinned cases skip. A detector that never fired would run them
 *           against bundles that are not there.
 * Counterpart: The unpinned cases pass. Over-skipping, the first version's other
 *           defect, shows here as a skip where a pass is required.
 *
 * Not done, deliberately: renaming the other bundles and the NiFi directory, which
 *           a release would. The cases only see the files they name, and the others
 *           are found by glob; renaming 116 more bundles or the distribution
 *           directory copies them into a layer for nothing. So the NiFi reading stays
 *           and the move is read from the API — still a move, which B5-33 holds.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { WRITTEN_AGAINST, pinnedLiterals, productLiquidImage } from '../lib/liquidimage';

const SELF = 'tests/integration/m-b5.image-moved.test.ts';
const DETECTOR = 'tests/unit/m-b5.moving-image-tag.test.ts';
const LIB = '/opt/nifi/nifi-current/lib';

const bump = (v: string) => v.replace(/^(\d+)\.(\d+)\./, (_, a, b) => `${a}.${Number(b) + 1}.`);

const named = pinnedLiterals().filter((p) => p.file !== DETECTOR);
const moved = [...new Set(named.filter((p) => p.key === 'nifi' && p.name).map((p) => p.name!))].sort();
const { nifi, api } = WRITTEN_AGAINST;

// Renamed, not removed: a release renames its bundles, and B6-12 globs
// `nifi-kafka-nar-*.nar` — removing it made that case red over the fixture, which
// the first run of this file measured. `mv` without -f: a bundle the literals name
// and the image does not have is a premise that no longer holds, and the build says
// so instead of moving on.
const RECIPE = [
  `FROM ${productLiquidImage()}`,
  'USER root',
  `RUN cd ${LIB} && mv nifi-api-${api}.jar nifi-api-${bump(api)}.jar` +
    moved.map((b) => ` && mv ${b} ${b.replace(`-${nifi}.nar`, `-${bump(nifi)}.nar`)}`).join(''),
  'USER nifi:nifi'
].join('\n');

// Named by its recipe, as the builder image is by its context, and removed after:
// this file is its only user, so the reason `dropBuilderImage` gives against an
// `afterAll` does not apply, and a leftover would hold the old base's layers.
const TAG = `liquidupstart/liquid-moved:${createHash('sha256').update(RECIPE).digest('hex').slice(0, 12)}`;

// Every file that reads the image, found the way the runner finds them.
const consumers = ['unit', 'component', 'contract', 'integration', 'system', 'e2e']
  .flatMap((tier) => {
    const dir = join(repoRoot, 'tests', tier);
    return existsSync(dir) ? readdirSync(dir).map((n) => `tests/${tier}/${n}`) : [];
  })
  .filter((f) => f.endsWith('.test.ts') && f !== SELF && f !== DETECTOR)
  .filter((f) => readFileSync(join(repoRoot, f), 'utf8').includes("from '../lib/liquidimage'"))
  .sort();

type Case = { file: string; name: string; status: 'pass' | 'skip' | 'fail' };

const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function readJunit(xml: string): Case[] {
  const cases: Case[] = [];
  // Attributes read one by one: a failing hook is reported as a testcase too, and
  // a pattern that insisted on every attribute could step over it.
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attr = (k: string) => m[1].match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? '';
    const body = m[3] ?? '';
    const status = /<(failure|error)\b/.test(body) ? 'fail' : /<skipped\b/.test(body) ? 'skip' : 'pass';
    cases.push({ file: attr('file'), name: unescape(attr('name')), status });
  }
  return cases;
}

const work = mkdtempSync(join(tmpdir(), 'b5-34-'));
let built = { code: -1, output: '' };
let run = { code: -1, output: '' };
let cases: Case[] = [];

beforeAll(() => {
  writeFileSync(join(work, 'Dockerfile'), RECIPE);
  built = sh(['docker', 'build', '-q', '-t', TAG, work]);
  if (built.code !== 0) return;
  const junit = join(work, 'junit.xml');
  run = sh(
    [process.execPath, 'test', '--timeout', '900000', '--reporter=junit', `--reporter-outfile=${junit}`,
      ...consumers.map((f) => `./${f}`)],
    repoRoot,
    { LU_TEST_LIQUID_IMAGE: TAG }
  );
  if (existsSync(junit)) cases = readJunit(readFileSync(junit, 'utf8'));
}, 1_800_000);

afterAll(() => {
  sh(['docker', 'rmi', '-f', TAG]);
  rmSync(work, { recursive: true, force: true });
});

// The cases that name something inside the image by its version, by id, and the
// two that share an id with a case that does not.
const PINNED_IDS = ['B5-5', 'B5-6', 'B5-7', 'B5-8', 'B5-9', 'B5-25', 'B5-26', 'B5-28', 'B5-29', 'B5-30'];
const PINNED_NAMES = [
  'B5-18 it names the versions the startup line carries',
  'B6-24 the counterpart: the largest bundle the image ships still passes'
];
// And the ones in the same files that do not, each of which skipped on the first
// version of this branch.
const UNPINNED_NAMES = [
  'B5-4 every NAR the image ships passes',
  'B5-15 the versions are read with every nifi-app log gone',
  'B5-15 and it says which source it read',
  'B5-16 the counterpart: the startup line is still read',
  'B5-17 the build refuses and names both sources',
  'B5-18 and the start says so, so a missing record is visible',
  'B5-27 nothing is left in /tmp',
  'B6-24 the fixture declares far more than it costs',
  'B6-24 it is refused, and the message names the limit',
  'B6-25 the premise: curl reads a leading @ as a file with --data-binary',
  'B6-25 and nar-build uses the one that does not',
  'B6-26 NAR_BUILDER_TEST_HOOKS is in .env.example as well as compose.yml',
  'B6-26 and it is kept out of the configuration view'
];
const READS_EVERY_VERSION = [
  'tests/integration/m-b6.judged-is-loaded.test.ts',
  'tests/integration/m-b6.shared-index.test.ts',
  'tests/integration/m-b6.two-sides-agree.test.ts'
];

const named_ = (name: string) => cases.filter((c) => c.name === name);
const isPinned = (c: Case) => PINNED_IDS.some((id) => c.name.startsWith(`${id} `)) || PINNED_NAMES.includes(c.name);

describe('B5-34 an upstream release is skips with a reason, and nothing red', () => {
  test('B5-34 the premise: the moved image was built, and the files ran against it', () => {
    expect(built.code, built.output).toBe(0);
    expect(moved.length, 'the scan named no bundle to move').toBeGreaterThan(0);
    expect(consumers).toContain('tests/system/m-b5.hand-drop.test.ts');
    expect(cases.length, run.output.slice(-2000)).toBeGreaterThan(0);
    // And the image really carries the move the cases are meant to see.
    const seen = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', TAG, '-c', `ls ${LIB}/nifi-api-*.jar`]);
    expect(seen.stdout).toContain(`nifi-api-${bump(api)}.jar`);
  });

  test('B5-34 no case fails, file-level setup included', () => {
    // Named rather than counted. A hook that throws appears as "(unnamed)".
    const failed = cases.filter((c) => c.status === 'fail').map((c) => `${c.file}: ${c.name}`);
    expect(failed.join('\n')).toBe('');
    expect(run.code, run.output.slice(-2000)).toBe(0);
  });

  test('B5-34 the negative: every case that pins the image skips', () => {
    const pinned = cases.filter(isPinned);
    expect(pinned.length).toBeGreaterThanOrEqual(PINNED_IDS.length + PINNED_NAMES.length);
    expect(pinned.filter((c) => c.status !== 'skip').map((c) => `${c.status}: ${c.name}`).join('\n')).toBe('');
  });

  test('B5-34 the counterpart: every case that pins nothing of it runs and passes', () => {
    const wrong = UNPINNED_NAMES.flatMap((n) => {
      const found = named_(n);
      return found.length === 0 ? [`missing: ${n}`] : found.filter((c) => c.status !== 'pass').map((c) => `${c.status}: ${n}`);
    });
    expect(wrong.join('\n')).toBe('');
  });

  test('B5-34 and the files that read every version out of the image pass whole', () => {
    // Their own comments claim an upstream release does not redden them.
    const wrong = READS_EVERY_VERSION.flatMap((f) => {
      const inFile = cases.filter((c) => c.file.endsWith(f.replace(/^tests\/[a-z]+\//, '')));
      return inFile.length === 0 ? [`no cases from ${f}`] : inFile.filter((c) => c.status !== 'pass').map((c) => `${c.status}: ${c.name}`);
    });
    expect(wrong.join('\n')).toBe('');
  });
});
