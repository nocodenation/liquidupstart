/**
 * M-B5 · Integration · A real move, end to end, and a move on one reading only
 *
 * Purpose:  B5-33 proves the detector. This proves the claim the detector was
 *           built for: that an upstream release turns the version-pinning cases
 *           into skips with a reason, and nothing red -- and that a move on one
 *           reading skips only the cases that pin that reading. The branch first
 *           measured it by moving `WRITTEN_AGAINST` and leaving the image alone,
 *           which cannot show it. The review of 2026-10-20 found what that hid:
 *           `m-b5.hand-drop`'s file-level `beforeAll` runs on a move (measured,
 *           bun 1.4.3: a file-level hook runs when every case is skipped, and a
 *           throw in it is `1 fail`), finds no bundle to rewrite, and throws. It
 *           also found the opposite defect, cases that pin nothing of the image
 *           skipping anyway. And the review of 2026-10-21 found it one level down:
 *           one flag for all three readings, so an image that differed in its Java
 *           build alone skipped fifteen cases that pass against it.
 * Given:    Three images built `FROM` the product's Liquid image. A release: the
 *           NiFi directory, the two jars the entrypoint reads NiFi's version from,
 *           `lib/nifi-api-<api>.jar` and every bundle the pinned literals name,
 *           renamed one minor up -- computed from `pinnedLiterals` and
 *           `WRITTEN_AGAINST`, so the image moves when they do. An API move: the
 *           API jar alone. A Java patch: a shim over the `java` binary that
 *           answers `-version` with the next build and runs the real JDK for
 *           everything else.
 * When:     The files that import `tests/lib/liquidimage.ts`, less B5-33 and this
 *           one, run in a child `bun test` with `LU_TEST_LIQUID_IMAGE` at the
 *           release. The files that carry a guard, less the system tier's
 *           `m-b5.hand-drop`, run again at the API move and at the Java patch,
 *           less B5-4's loop over every bundle, which carries no guard. Each run
 *           writes a JUnit report. And every guard in those files is read.
 * Then:     In each run no case fails; every case that pins a reading that moved
 *           skips; and every other case runs and passes, computed from what each
 *           pinned case pins rather than listed by hand. Every guard reads the
 *           readings its case pins, `m-b5.hand-drop`'s included.
 * Covers:   B5-34, SP-FR1
 * Negative: The pinned cases skip. A detector that never fired would run them
 *           against bundles that are not there.
 * Counterpart: Everything else passes. Over-skipping, the defect of the first
 *           version and of the single flag, shows here as a skip where a pass is
 *           required -- for a case added later as well, since nothing names them.
 *
 * Not renamed, deliberately: the other 116 bundles, which the cases find by glob
 *           and never by name. Renaming them copies them into a layer for nothing.
 *           The NiFi directory is renamed: it is a 22-byte symlink to
 *           `nifi-current`, so the rename costs nothing and the NiFi reading moves
 *           with the bundles, as in a release.
 *
 * Not run, deliberately: `m-b5.hand-drop` at the API move and the Java patch.
 *           It holds bundle cases alone and boots Liquid twice; its guards are
 *           held by the reading of every guard instead.
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sh, type Result } from '../lib/shell';
import { repoRoot } from '../lib/paths';
import { WRITTEN_AGAINST, pinnedLiterals, productLiquidImage, type Versions } from '../lib/liquidimage';

const SELF = 'tests/integration/m-b5.image-moved.test.ts';
const DETECTOR = 'tests/unit/m-b5.moving-image-tag.test.ts';
const HAND_DROP = 'tests/system/m-b5.hand-drop.test.ts';
const LIB = '/opt/nifi/nifi-current/lib';

const bump = (v: string) => v.replace(/^(\d+)\.(\d+)\./, (_, a, b) => `${a}.${Number(b) + 1}.`);
const nextBuild = (v: string) => v.replace(/^(\d+)\.(\d+)\.(\d+)/, (_, a, b, c) => `${a}.${b}.${Number(c) + 1}`);

const named = pinnedLiterals().filter((p) => p.file !== DETECTOR);
const moved = [...new Set(named.filter((p) => p.key === 'nifi' && p.name).map((p) => p.name!))].sort();
const { nifi, api, java } = WRITTEN_AGAINST;

// Renamed, not removed: a release renames its bundles, and B6-12 globs
// `nifi-kafka-nar-*.nar` -- removing it made that case red over the fixture, which
// the first run of this file measured. `mv` without -f: a bundle the literals name
// and the image does not have is a premise that no longer holds, and the build says
// so instead of moving on.
const RELEASE = [
  `FROM ${productLiquidImage()}`,
  'USER root',
  `RUN cd /opt/nifi && mv nifi-${nifi} nifi-${bump(nifi)} && cd ${LIB}` +
    ['nifi-runtime', 'nifi-framework-api'].map((j) => ` && mv ${j}-${nifi}.jar ${j}-${bump(nifi)}.jar`).join('') +
    ` && mv nifi-api-${api}.jar nifi-api-${bump(api)}.jar` +
    moved.map((b) => ` && mv ${b} ${b.replace(`-${nifi}.nar`, `-${bump(nifi)}.nar`)}`).join(''),
  'USER nifi:nifi'
].join('\n');

// The API alone, which is what B5-6 and B5-7 pin and nothing else does.
const API_MOVE = [
  `FROM ${productLiquidImage()}`,
  'USER root',
  `RUN cd ${LIB} && mv nifi-api-${api}.jar nifi-api-${bump(api)}.jar`,
  'USER nifi:nifi'
].join('\n');

// What a base-image patch changes under an unchanged NiFi. The entrypoint and the
// probe both read `java -version`, and NiFi runs the binary for everything else.
const JAVA_PATCH = [
  `FROM ${productLiquidImage()}`,
  'USER root',
  'RUN J="$(command -v java)" && mv "$J" "$J.real" && printf \'#!/bin/sh\\nif [ "$1" = -version ]; then "%s.real" -version 2>&1 | ' +
    `sed "s/build ${java}/build ${nextBuild(java)}/g" >&2; exit 0; fi\\nexec "%s.real" "$@"\\n' "$J" "$J" > "$J" && chmod 755 "$J"`,
  'USER nifi:nifi'
].join('\n');

// Named by its recipe, as the builder image is by its context, and removed after:
// this file is its only user, so the reason `dropBuilderImage` gives against an
// `afterAll` does not apply, and a leftover would hold the old base's layers.
const tagOf = (recipe: string) => `liquidupstart/liquid-moved:${createHash('sha256').update(recipe).digest('hex').slice(0, 12)}`;

// Every file that reads the image, found the way the runner finds them.
const consumers = ['unit', 'component', 'contract', 'integration', 'system', 'e2e']
  .flatMap((tier) => {
    const dir = join(repoRoot, 'tests', tier);
    return existsSync(dir) ? readdirSync(dir).map((n) => `tests/${tier}/${n}`) : [];
  })
  .filter((f) => f.endsWith('.test.ts') && f !== SELF && f !== DETECTOR)
  .filter((f) => readFileSync(join(repoRoot, f), 'utf8').includes("from '../lib/liquidimage'"))
  .sort();
// A guard, as the files write them: on a case or a block, or a file-level hook
// that returns.
const GUARD = /(?:(describe|test)\.skipIf\(([^)]*)\)\(\s*'([^']+)'|if \(([^)]*LIQUID_MOVED_ON[^)]*)\) return;)/g;
const source = (f: string) => readFileSync(join(repoRoot, f), 'utf8');
// The two narrower moves run the files that carry a guard, less the system tier's
// hand drop: it holds bundle cases alone, and under an unchanged NiFi it would boot
// Liquid twice. And less B5-4, which carries no guard and spends most of a run
// over every bundle; bun skips its hook as well, and reports it skipped.
const guarded = consumers.filter((f) => f !== HAND_DROP && [...source(f).matchAll(GUARD)].length > 0);
const FILTER = '^(?!B5-4 )';
const filtered = (c: { name: string; block: string }) => c.name.startsWith('B5-4 ') || c.block.startsWith('B5-4 ');

type Case = { file: string; name: string; block: string; status: 'pass' | 'skip' | 'fail' };

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
    cases.push({ file: attr('file'), name: unescape(attr('name')), block: unescape(attr('classname')), status });
  }
  return cases;
}

// What each pinned case pins, as its guard reads it. An id ending in a space is
// every case and block of that id; a full name is that case alone.
const PINS: Array<[string, Array<keyof Versions>]> = [
  ['B5-5 ', ['nifi']],
  ['B5-6 ', ['api']],
  ['B5-7 ', ['api']],
  ['B5-8 ', ['nifi']],
  ['B5-9 ', ['nifi']],
  ['B5-25 ', ['nifi']],
  ['B5-26 ', ['nifi']],
  ['B5-28 ', ['nifi']],
  ['B5-29 ', ['nifi']],
  ['B5-30 ', ['nifi']],
  ['B5-18 it names the versions the startup line carries', ['nifi', 'java']],
  ['B6-24 the counterpart: the largest bundle the image ships still passes', ['nifi']]
];
// A skipped block's hook is reported as `(unnamed)` under the block's name, and
// pins what the block pins.
const pinsOf = (c: Case): Array<keyof Versions> => {
  const name = c.name === '(unnamed)' ? c.block : c.name;
  return PINS.find(([p]) => (p.endsWith(' ') ? name.startsWith(p) : name === p))?.[1] ?? [];
};
const isPinned = (c: Case, on: Array<keyof Versions>) => pinsOf(c).some((k) => on.includes(k));

const flagsIn = (expr: string) => [...new Set([...expr.matchAll(/LIQUID_MOVED_ON\.(nifi|api|java)/g)].map((m) => m[1]))].sort();

type Move = { built: Result; run: Result; cases: Case[]; seen: Result };
const work = mkdtempSync(join(tmpdir(), 'b5-34-'));
const blank: Result = { code: -1, stdout: '', stderr: '', output: '' };

function move(label: string, recipe: string, files: string[], probe: string, filter?: string): Move {
  const dir = join(work, label);
  mkdirSync(dir);
  writeFileSync(join(dir, 'Dockerfile'), recipe);
  const tag = tagOf(recipe);
  const built = sh(['docker', 'build', '-q', '-t', tag, dir]);
  if (built.code !== 0) return { built, run: blank, cases: [], seen: blank };
  const junit = join(dir, 'junit.xml');
  const run = sh(
    [process.execPath, 'test', '--timeout', '900000', '--reporter=junit', `--reporter-outfile=${junit}`,
      ...(filter ? ['-t', filter] : []), ...files.map((f) => `./${f}`)],
    repoRoot,
    { LU_TEST_LIQUID_IMAGE: tag }
  );
  const seen = sh(['docker', 'run', '--rm', '--entrypoint', 'sh', tag, '-c', probe]);
  return { built, run, cases: existsSync(junit) ? readJunit(readFileSync(junit, 'utf8')) : [], seen };
}

let release: Move;
let apiMove: Move;
let patch: Move;

const failed = (m: Move) => m.cases.filter((c) => c.status === 'fail').map((c) => `${c.file}: ${c.name}`);
const pinnedNotSkipped = (m: Move, on: Array<keyof Versions>) =>
  m.cases.filter((c) => isPinned(c, on) && c.status !== 'skip').map((c) => `${c.status}: ${c.name} (${c.block})`);
const otherNotPassed = (m: Move, on: Array<keyof Versions>) =>
  m.cases
    .filter((c) => !isPinned(c, on) && !(m !== release && filtered(c)) && c.status !== 'pass')
    .map((c) => `${c.status}: ${c.file}: ${c.name} (${c.block})`);

// Their own comments claim an upstream release does not redden them. The computed
// counterpart holds whatever runs; this holds that they ran.
const READS_EVERY_VERSION = [
  'tests/integration/m-b6.judged-is-loaded.test.ts',
  'tests/integration/m-b6.shared-index.test.ts',
  'tests/integration/m-b6.two-sides-agree.test.ts'
];

// The three moves share their hooks, so the reading of the guards below builds no
// image and removes none.
describe('B5-34 three moves of the image', () => {
  afterAll(() => {
    for (const recipe of [RELEASE, API_MOVE, JAVA_PATCH]) sh(['docker', 'rmi', '-f', tagOf(recipe)]);
    rmSync(work, { recursive: true, force: true });
  });

  beforeAll(() => {
    release = move('release', RELEASE, consumers, `ls -d /opt/nifi/nifi-[0-9]*; ls ${LIB}/nifi-api-*.jar ${LIB}/nifi-runtime-*.jar ${LIB}/nifi-framework-api-*.jar`);
    apiMove = move('api', API_MOVE, guarded, `ls -d /opt/nifi/nifi-[0-9]*; ls ${LIB}/nifi-api-*.jar`, FILTER);
    patch = move('java', JAVA_PATCH, guarded, 'java -version 2>&1', FILTER);
  }, 2_700_000);

  describe('B5-34 an upstream release is skips with a reason, and nothing red', () => {
    const ON: Array<keyof Versions> = ['nifi', 'api'];

    test('B5-34 the premise: the release was built, carries the move, and the files ran against it', () => {
      expect(release.built.code, release.built.output).toBe(0);
      expect(moved.length, 'the scan named no bundle to move').toBeGreaterThan(0);
      expect(consumers).toContain(HAND_DROP);
      expect(release.cases.length, release.run.output.slice(-2000)).toBeGreaterThan(0);
      expect(release.seen.stdout).toContain(`/opt/nifi/nifi-${bump(nifi)}`);
      expect(release.seen.stdout).toContain(`nifi-api-${bump(api)}.jar`);
    expect(release.seen.stdout).toContain(`nifi-runtime-${bump(nifi)}.jar`);
    expect(release.seen.stdout).toContain(`nifi-framework-api-${bump(nifi)}.jar`);
      const ran = READS_EVERY_VERSION.filter((f) => !release.cases.some((c) => c.file.endsWith(f.split('/').pop()!)));
      expect(ran.join('\n')).toBe('');
    });

    test('B5-34 no case fails, file-level setup included', () => {
      // Named rather than counted. A hook that throws appears as "(unnamed)".
      expect(failed(release).join('\n')).toBe('');
      expect(release.run.code, release.run.output.slice(-2000)).toBe(0);
    });

    test('B5-34 the negative: every case that pins NiFi or the API skips', () => {
      expect(release.cases.filter((c) => isPinned(c, ON) && c.name !== '(unnamed)').length).toBeGreaterThanOrEqual(PINS.length);
      expect(pinnedNotSkipped(release, ON).join('\n')).toBe('');
    });

    test('B5-34 the counterpart: every other case runs and passes', () => {
      expect(otherNotPassed(release, ON).join('\n')).toBe('');
    });
  });

  describe('B5-34 an API move under the same NiFi skips only what pins the API', () => {
    const ON: Array<keyof Versions> = ['api'];

    test('B5-34 the premise: the API move was built, carries it alone, and the guarded files ran against it', () => {
      expect(apiMove.built.code, apiMove.built.output).toBe(0);
      expect(apiMove.seen.stdout).toContain(`/opt/nifi/nifi-${nifi}`);
      expect(apiMove.seen.stdout).toContain(`nifi-api-${bump(api)}.jar`);
      expect(apiMove.cases.length, apiMove.run.output.slice(-2000)).toBeGreaterThan(0);
    });

    test('B5-34 no case fails under the API move', () => {
      expect(failed(apiMove).join('\n')).toBe('');
      expect(apiMove.run.code, apiMove.run.output.slice(-2000)).toBe(0);
    });

    test('B5-34 the negative: the cases that pin the API skip', () => {
      expect(apiMove.cases.filter((c) => isPinned(c, ON) && c.name !== '(unnamed)').length).toBeGreaterThanOrEqual(2);
      expect(pinnedNotSkipped(apiMove, ON).join('\n')).toBe('');
    });

    test('B5-34 the counterpart: every other case runs and passes, the bundle cases included', () => {
      expect(otherNotPassed(apiMove, ON).join('\n')).toBe('');
    });
  });

  describe('B5-34 a Java patch under the same NiFi skips only what pins Java', () => {
    const ON: Array<keyof Versions> = ['java'];

    test('B5-34 the premise: the patch was built, reads as the next build, and the guarded files ran against it', () => {
      expect(patch.built.code, patch.built.output).toBe(0);
      expect(patch.seen.stdout).toContain(`build ${nextBuild(java)}`);
      expect(guarded).not.toContain(HAND_DROP);
      expect(guarded).toContain('tests/integration/m-b5.target-versions.test.ts');
      expect(patch.cases.length, patch.run.output.slice(-2000)).toBeGreaterThan(0);
    });

    test('B5-34 no case fails under the Java patch', () => {
      expect(failed(patch).join('\n')).toBe('');
      expect(patch.run.code, patch.run.output.slice(-2000)).toBe(0);
    });

    test('B5-34 the negative: the case that pins Java skips', () => {
      expect(patch.cases.filter((c) => isPinned(c, ON)).map((c) => `${c.status}: ${c.name}`)).toEqual([
        'skip: B5-18 it names the versions the startup line carries'
      ]);
    });

    test('B5-34 the counterpart: every other case runs and passes, bundle and API cases included', () => {
      expect(patch.cases.filter((c) => pinsOf(c).length > 0 && !isPinned(c, ON)).length).toBeGreaterThan(0);
      expect(otherNotPassed(patch, ON).join('\n')).toBe('');
    });
  });
});

describe('B5-34 every guard reads what its case pins', () => {
  // The moves above see behaviour; this sees the guards a move does not reach:
  // a NiFi guard where the API is pinned skips under a release either way, and
  // m-b5.hand-drop runs under the release alone.
  test('B5-34 each guard in the files that read the image matches the pin table, hand-drop\'s hook included', () => {
    const wrong: string[] = [];
    let seen = 0;
    let used = 0;
    const matched = new Set<string>();
    for (const f of consumers) {
      // Every code line that reads a flag has to be a guard this reads, so one
      // written in a shape the pattern misses is red rather than unchecked.
      used += source(f).split('\n').filter((l) => /LIQUID_MOVED_ON\./.test(l) && !/^\s*(\*|\/\/)/.test(l)).length;
      for (const m of source(f).matchAll(GUARD)) {
        if (m[4] !== undefined) {
          // A file-level hook stands for its file's cases. Only the hand drop has
          // one, and its cases, B5-28 to B5-30, pin what B5-28 pins.
          seen++;
          const want = f === HAND_DROP ? pinsOf({ file: f, name: 'B5-28 ', block: '', status: 'skip' }) : ['none'];
          if (flagsIn(m[4]).join() !== [...want].sort().join()) wrong.push(`${f}: file-level guard reads ${flagsIn(m[4]).join('+')}`);
          continue;
        }
        if (!/LIQUID_MOVED_ON/.test(m[2])) continue;
        seen++;
        const want = [...pinsOf({ file: f, name: m[3], block: m[3], status: 'skip' })].sort();
        for (const [prefix] of PINS) if (prefix.endsWith(' ') ? m[3].startsWith(prefix) : m[3] === prefix) matched.add(prefix);
        if (flagsIn(m[2]).join() !== want.join()) wrong.push(`${f}: '${m[3]}' reads ${flagsIn(m[2]).join('+') || 'nothing'}, pins ${want.join('+') || 'nothing'}`);
      }
    }
    // B5-7 has no guard of its own: it sits in B5-6's block.
    expect({ unread: used - seen, unguarded: PINS.map(([p]) => p).filter((p) => !matched.has(p) && p !== 'B5-7 ') }).toEqual({
      unread: 0,
      unguarded: []
    });
    expect(wrong.join('\n')).toBe('');
  });
});
