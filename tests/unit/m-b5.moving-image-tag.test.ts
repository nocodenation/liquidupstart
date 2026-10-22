/**
 * M-B5 · Unit · An upstream release is not a defect in the code under test
 *
 * Purpose:  S9 of the 2026-10-01 review, second half. Nine test files named
 *           `ghcr.io/nocodenation/liquid-nifi:latest` themselves — a moving tag —
 *           and six of them also pinned what that tag happened to contain: NiFi
 *           2.11.0 and the API 2.10.0, in assertions and in fixture text. So an
 *           upstream release turned those cases red, and the red was about
 *           somebody else's work.
 *
 *           Pinning by digest was the obvious repair. The operator weighed it and
 *           chose the other trade: keep the moving tag, so the suite goes on
 *           testing what the stack actually runs, and make an upgrade **legible**
 *           instead. `tests/lib/liquidimage.ts` reads the versions out of the
 *           image, `tests/run.sh` says so once before the run, and the cases that
 *           pin them skip rather than fail, each on the reading it pins. B5-34
 *           runs them against a moved image.
 * Given:    `movedMessage`, `movedOn` and `preflightLine`, pure functions of two
 *           readings -- the lesson of B6-40 applied before it could repeat; and
 *           `pinnedLiterals`, the scan of the test tree for literals that name the
 *           image's contents. The pure scenarios need nothing; the import and one
 *           scenario run the image.
 * When:     They are given a matching reading, one differing in NiFi, in the API
 *           or in Java alone, and one that could not be read — against the pin as
 *           it stands and against a re-pin, so following the message's own
 *           instruction cannot turn this file red
 * Then:     Only the differences produce a message, and a difference in one
 *           reading sets that reading's flag alone; the message names both readings
 *           and the one place to re-pin; an unreadable image is neither a move nor a
 *           match, sets no flag, and the runner says so in words of its own; every
 *           literal in the tree that names the image agrees with the pin; and the
 *           runner only asks when a selected file reads the image
 * Covers:   B5-33, SP-FR1
 * Negative: The three differing readings; a literal one minor off the pin; a
 *           runner line for an image that was never read; and the contract that
 *           no test file names the tag directly any more.
 * Counterpart: The matching reading and the unreadable one. Without the first, a
 *           function that always reported "moved" would pass the negatives and
 *           skip the whole of M-B5 for ever; without the second, an image that
 *           cannot be pulled would read as an upgrade. The scan's premise — it
 *           finds the literals the six files do carry — so a scan matching nothing
 *           cannot pass the agreement case.
 *
 * Not asserted, deliberately: that the image agrees with `WRITTEN_AGAINST`. That
 *           agreement *is* the question, and asserting it would make an upstream
 *           release red — the defect this case exists to remove. What is asserted
 *           is that the versions can be read out of the image, and that the runner
 *           still carries the line that says which state holds.
 */

import { test, expect, describe, afterAll } from 'bun:test';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { repoRoot } from '../lib/paths';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';
import {
  LIQUID_IMAGE,
  WRITTEN_AGAINST,
  movedMessage,
  movedOn,
  preflightLine,
  liquidImageVersions,
  pinnedLiterals,
  productLiquidImage,
  type Versions
} from '../lib/liquidimage';

// One minor up: 2.11.0 → 2.12.0.
const bump = (v: string) => v.replace(/^(\d+)\.(\d+)\./, (_, a, b) => `${a}.${Number(b) + 1}.`);

const UNREAD: Versions = { nifi: null, api: null, java: null };

// The first version of this file asserted `movedMessage(WRITTEN_AGAINST, …)` against
// literals, so re-pinning WRITTEN_AGAINST — the step the message itself prescribes —
// turned it red. Every reading below is derived from the pin it is run against, and
// it is run against two.
const PINS: Array<[string, Versions]> = [
  ['as pinned', { ...WRITTEN_AGAINST }],
  ['after a re-pin', { nifi: bump(WRITTEN_AGAINST.nifi), api: bump(WRITTEN_AGAINST.api), java: WRITTEN_AGAINST.java }]
];

for (const [when, pin] of PINS) {
  describe(`B5-33 a moved image is reported, and only a moved image (${when})`, () => {
    test(`B5-33 the counterpart: the pin itself says nothing (${when})`, () => {
      // Without this, "always moved" passes every negative below and skips the whole
      // of M-B5 silently.
      expect(movedMessage(pin, { ...pin })).toBeNull();
    });

    test(`B5-33 a different NiFi version is a move (${when})`, () => {
      const found = { ...pin, nifi: bump(pin.nifi!) };
      expect(movedMessage(pin, found)).toContain(`nifi ${found.nifi}`);
    });

    test(`B5-33 and a different API version is a move too (${when})`, () => {
      // Both are read, and neither is derived from the other: the API ships a minor
      // behind the distribution, and that gap is what B5-15 to B5-18 are about. A
      // check on the NiFi version alone would miss an API-only release.
      const found = { ...pin, api: bump(pin.api!) };
      expect(movedMessage(pin, found)).toContain(`api ${found.api}`);
    });

    test(`B5-33 and so is a different Java under the same NiFi (${when})`, () => {
      // B5-18 compares the runtime record with a startup line that names Java, so a
      // base-image patch under an unchanged NiFi would turn it red unannounced.
      const found = { ...pin, java: '21.0.99+1-LTS' };
      expect(movedMessage(pin, found)).toContain('java 21.0.99+1-LTS');
    });

    // Per reading, so a case skips only on what it pins: one flag for all three
    // skipped every bundle case on a Java patch under an unchanged NiFi.
    const ALONE: Array<[keyof Versions, string]> = [
      ['nifi', bump(pin.nifi!)],
      ['api', bump(pin.api!)],
      ['java', '21.0.99+1-LTS']
    ];
    for (const [key, value] of ALONE) {
      test(`B5-33 a move on ${key} alone sets the ${key} flag and no other (${when})`, () => {
        expect(movedOn(pin, { ...pin, [key]: value })).toEqual({
          nifi: key === 'nifi',
          api: key === 'api',
          java: key === 'java'
        });
      });
    }

    test(`B5-33 the counterpart: the pin itself, and an image that could not be read, set none (${when})`, () => {
      const none = { nifi: false, api: false, java: false };
      expect({ pinned: movedOn(pin, { ...pin }), unread: movedOn(pin, UNREAD) }).toEqual({ pinned: none, unread: none });
    });

    test(`B5-33 while an image that could not be read is not a move (${when})`, () => {
      // "Cannot measure" is not "moved" — the same rule SP-4 carries for the disk.
      // Without it, an image that cannot be pulled would skip M-B5 and call it an
      // upstream release.
      expect(movedMessage(pin, UNREAD)).toBeNull();
    });

    test(`B5-33 the message names both readings and the one place to re-pin (${when})`, () => {
      const found = { ...pin, nifi: bump(pin.nifi!), api: bump(pin.api!) };
      const m = movedMessage(pin, found) ?? '';
      expect(m).toContain(LIQUID_IMAGE);
      expect(m).toContain(`written against  nifi ${pin.nifi}, api ${pin.api}, java ${pin.java}`);
      expect(m).toContain(`now in the image nifi ${found.nifi}, api ${found.api}, java ${found.java}`);
      expect(m).toContain('not a defect in the code under test');
      expect(m).toContain('tests/lib/liquidimage.ts');
    });
  });
}

describe('B5-33 the runner line says which of three states holds', () => {
  test('B5-33 an image that could not be read is said to be unread, not to match', () => {
    // It used to print the pinned pair followed by "as the cases expect" with the
    // daemon down — measured 2026-10-20 with DOCKER_HOST at a socket that does not
    // exist — because `null` meant both "matches" and "could not ask".
    const line = preflightLine(WRITTEN_AGAINST, UNREAD);
    expect(line).toContain('could not be read');
    expect(line).not.toContain('as the cases expect');
    expect(line).not.toContain('MOVED');
  });

  test('B5-33 the counterpart: a matching image is said to match', () => {
    expect(preflightLine(WRITTEN_AGAINST, { ...WRITTEN_AGAINST })).toContain(
      `nifi ${WRITTEN_AGAINST.nifi}, api ${WRITTEN_AGAINST.api}, java ${WRITTEN_AGAINST.java}, as the cases expect`
    );
  });

  test('B5-33 an image read in part is not a move, and the line names what could not be read', () => {
    // The message and the flags used to disagree here: a Java that could not be
    // read made the runner print MOVED while no case skipped.
    const found = { ...WRITTEN_AGAINST, java: null };
    const line = preflightLine(WRITTEN_AGAINST, found);
    expect({
      message: movedMessage(WRITTEN_AGAINST, found),
      flags: movedOn(WRITTEN_AGAINST, found),
      named: line.includes('java could not be read and is not counted as moved'),
      moved: line.includes('MOVED'),
      matched: line.includes('as the cases expect')
    }).toEqual({ message: null, flags: { nifi: false, api: false, java: false }, named: true, moved: false, matched: false });
  });

  test('B5-33 and a moved one is said to have moved', () => {
    const line = preflightLine(WRITTEN_AGAINST, { ...WRITTEN_AGAINST, api: bump(WRITTEN_AGAINST.api) });
    expect(line).toContain('liquid image MOVED');
    expect(line).not.toContain('as the cases expect');
  });
});

describe('B5-33 and the reading itself works against the real image', () => {
  test('B5-33 all three versions are read out of the image, not told to it', () => {
    // The probe's own control. Whether they *equal* WRITTEN_AGAINST is the
    // question this file refuses to assert; that they can be read is what makes
    // the question answerable at all.
    const v = liquidImageVersions();
    expect(v.nifi, 'no NiFi version read from the image').toMatch(/^\d+\.\d+\.\d+/);
    expect(v.api, 'no API version read from the image').toMatch(/^\d+\.\d+\.\d+/);
    expect(v.java, 'no Java version read from the image').toMatch(/^\d+\.\d+\.\d+/);
  });

  test('B5-33 with no docker on PATH it reads as unread, rather than failing every import', () => {
    // Bun.spawnSync throws on a missing executable instead of returning a code, and
    // LIQUID_MOVED_ON is computed at import, so the throw used to take every file that
    // imports this module down at load — the docker-free cases in m-b6.minors too.
    const r = Bun.spawnSync(
      [process.execPath, '-e',
        `const m = await import(${JSON.stringify(join(repoRoot, 'tests/lib/liquidimage.ts'))});` +
        'console.log(JSON.stringify(m.liquidImageVersions()));'],
      { env: { ...process.env, PATH: '/nonexistent' }, stdout: 'pipe', stderr: 'pipe' }
    );
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(JSON.parse(r.stdout.toString())).toEqual(UNREAD);
  });

  test('B5-33 the image is the one the stack builds Liquid from', () => {
    // Read out of the product's recipe, so pinning the Dockerfile to anything else
    // moves the cases with it rather than leaving them probing `:latest`.
    const dir = mkdtempSync(join(tmpdir(), 'b5-33-from-'));
    try {
      writeFileSync(join(dir, 'Dockerfile'), 'FROM example.invalid/liquid@sha256:0123abcd\nUSER root\n');
      expect(productLiquidImage(join(dir, 'Dockerfile'))).toBe('example.invalid/liquid@sha256:0123abcd');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    if (!process.env.LU_TEST_LIQUID_IMAGE) expect(LIQUID_IMAGE).toBe(productLiquidImage());
  });
});

describe('B5-33 every literal that names the image agrees with the pin', () => {
  // Nothing tied WRITTEN_AGAINST to the literals before, so moving the literals and
  // forgetting the pin skipped every pinned case for good, green, and moving the pin
  // alone left nobody told which files to change. This is that list, computed.
  // Less this file, whose negative below carries such literals as its fixture —
  // excluded by name, as the tag search at the end excludes it.
  const pinned = pinnedLiterals().filter((p) => p.file !== 'tests/unit/m-b5.moving-image-tag.test.ts');

  test('B5-33 the premise: the scan finds the literals the six files carry', () => {
    const files = new Set(pinned.map((p) => p.file));
    for (const f of [
      'tests/integration/m-b5.narcheck-resolution.test.ts',
      'tests/integration/m-b5.minors.test.ts',
      'tests/integration/m-b5.refused-quarantine.test.ts',
      'tests/integration/m-b5.target-versions.test.ts',
      'tests/system/m-b5.hand-drop.test.ts',
      'tests/unit/m-b6.minors.test.ts'
    ]) {
      expect(files.has(f), `${f} not found by the scan`).toBe(true);
    }
    expect(new Set(pinned.map((p) => p.key))).toEqual(new Set(['nifi', 'api', 'java']));
  });

  test('B5-33 none of them disagrees with WRITTEN_AGAINST', () => {
    const off = pinned
      .filter((p) => p.version !== WRITTEN_AGAINST[p.key])
      .map((p) => `${p.file}:${p.line} ${p.key} ${p.version}, pinned ${WRITTEN_AGAINST[p.key]}`);
    expect(off.join('\n')).toBe('');
  });

  test('B5-33 the negative: the scan holds code lines naming the image, and nothing else', () => {
    // `9.9.9` so no real image can supply it; the comment and the `/w/lib` jar are the
    // two shapes the tree really carries that must not count — header prose, and a
    // hand-made fixture that is not the image.
    const dir = mkdtempSync(join(tmpdir(), 'b5-33-scan-'));
    try {
      mkdirSync(join(dir, 'integration'));
      writeFileSync(
        join(dir, 'integration', 'm-zz.probe.test.ts'),
        [
          ' *           `/opt/nifi/nifi-current/lib/nifi-kafka-nar-8.8.8.nar` in a header',
          "const K = '/opt/nifi/nifi-current/lib/nifi-kafka-nar-9.9.9.nar';",
          "const F = '/w/lib/nifi-api-7.7.7.jar';"
        ].join('\n')
      );
      expect(pinnedLiterals(dir)).toEqual([
        { file: 'tests/integration/m-zz.probe.test.ts', line: 2, key: 'nifi', version: '9.9.9', name: 'nifi-kafka-nar-9.9.9.nar' }
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('B5-33 the voice cannot be removed by accident', () => {
  test('B5-33 the runner says which state the image is in, before the run', () => {
    const runnerText = readFileSync(join(repoRoot, 'tests/run.sh'), 'utf8');
    expect({
      readsTheImage: /liquidimage\.ts/.test(runnerText),
      printsTheLine: /preflightLine\(/.test(runnerText)
    }).toEqual({ readsTheImage: true, printsTheLine: true });
  });

  describe('B5-33 and asks only when a selected file reads the image', () => {
    // A tree of its own, run through the real runner. The marker is the import path,
    // carried here in a comment so the fixture needs no image to pass.
    const reads = makeTree({ 'unit/m-fx.reads.test.ts': `// imports ../lib/liquidimage\n${PASSING}` });
    const ignores = makeTree({ 'unit/m-fx.ignores.test.ts': PASSING });
    afterAll(() => {
      dropTree(reads);
      dropTree(ignores);
    });

    test('B5-33 a selection that never reads it is not made to pull it', () => {
      // `m-oc` on a fresh machine used to pull several GB of Liquid first.
      const r = runner(['--root', ignores]);
      expect(r.code, r.output).toBe(0);
      expect(r.output).not.toContain('liquid image');
    });

    test('B5-33 the counterpart: a selection that does is told the state', () => {
      const r = runner(['--root', reads]);
      expect(r.code, r.output).toBe(0);
      expect(r.output).toMatch(/liquid image( MOVED|:)/);
    });
  });

  test('B5-33 the negative: no test file names the moving tag itself', () => {
    // Nine files did, which is how six of them came to pin its contents. A tenth
    // copy would reintroduce exactly that, and nothing would notice until the
    // next upstream release.
    const tag = 'ghcr.io/nocodenation/liquid-nifi';
    const offenders: string[] = [];
    for (const tier of ['unit', 'component', 'contract', 'integration', 'system', 'e2e']) {
      let names: string[] = [];
      try {
        names = readdirSync(join(repoRoot, 'tests', tier));
      } catch {
        continue;
      }
      // This file is the exception, by necessity: it has to carry the string to
      // search for it. Named explicitly rather than skipped by a clever
      // construction, so the exception is visible to a reader.
      const SEARCHER = 'm-b5.moving-image-tag.test.ts';
      for (const name of names.filter((n) => n.endsWith('.test.ts') && n !== SEARCHER)) {
        const body = readFileSync(join(repoRoot, 'tests', tier, name), 'utf8');
        // Header prose may name it; a code line may not.
        const inCode = body
          .split('\n')
          .filter((l) => l.includes(tag) && !/^\s*(\*|\/\/|\/\*)/.test(l));
        if (inCode.length) offenders.push(`${tier}/${name}`);
      }
    }
    // Named rather than counted: a failure saying "+3" sends the reader looking,
    // which is the shape A1 of the 2026-10-01 review objected to one layer out.
    expect(offenders.join(' ')).toBe('');
  });
});
