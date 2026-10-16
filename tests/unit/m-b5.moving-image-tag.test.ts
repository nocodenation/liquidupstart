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
 *           instead. `tests/lib/liquidimage.ts` reads both versions out of the
 *           image, `tests/run.sh` says so once before the run, and the six files
 *           skip rather than fail.
 * Given:    `movedMessage`, a pure function of two readings, so both answers can be
 *           measured without an image and without a network — the lesson of B6-40
 *           applied before it could repeat
 * When:     It is given a matching pair, a NiFi version that differs, an API
 *           version that differs, and a pair that could not be read at all
 * Then:     Only the two differences produce a message; it names both pairs and the
 *           one place to re-pin; and an unreadable image produces nothing, because
 *           "cannot measure" is not "moved" — the rule the disk guard carries
 * Covers:   B5-33, FR21, FR23
 * Negative: The two differing pairs, and the contract that no test file names the
 *           tag directly any more — a tenth copy is how the first nine happened.
 * Counterpart: The matching pair and the unreadable pair. Without the first, a
 *           function that always reported "moved" would pass both negatives and
 *           skip the whole of M-B5 for ever; without the second, an image that
 *           cannot be pulled would read as an upgrade.
 *
 * Not asserted, deliberately: that the image agrees with `WRITTEN_AGAINST`. That
 *           agreement *is* the question, and asserting it would make an upstream
 *           release red — the defect this case exists to remove. What is asserted
 *           is that both versions can be read out of the image, and that the
 *           runner still carries the line that says which state holds.
 */

import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../lib/paths';
import {
  LIQUID_IMAGE,
  WRITTEN_AGAINST,
  movedMessage,
  liquidImageVersions
} from '../lib/liquidimage';

describe('B5-33 a moved image is reported, and only a moved image', () => {
  test('B5-33 the counterpart: the pair the cases were written against says nothing', () => {
    // Without this, "always moved" passes every negative below and skips the whole
    // of M-B5 silently.
    expect(movedMessage(WRITTEN_AGAINST, { nifi: '2.11.0', api: '2.10.0' })).toBeNull();
  });

  test('B5-33 a different NiFi version is a move', () => {
    const m = movedMessage(WRITTEN_AGAINST, { nifi: '2.12.0', api: '2.10.0' });
    expect(m).not.toBeNull();
    expect(m).toContain('2.12.0');
  });

  test('B5-33 and a different API version is a move too', () => {
    // Both are read, and neither is derived from the other: the API ships a minor
    // behind the distribution, and that gap is what B5-15 to B5-18 are about. A
    // check on the NiFi version alone would miss an API-only release.
    const m = movedMessage(WRITTEN_AGAINST, { nifi: '2.11.0', api: '2.11.0' });
    expect(m).not.toBeNull();
    expect(m).toContain('api 2.11.0');
  });

  test('B5-33 while an image that could not be read is not a move', () => {
    // "Cannot measure" is not "moved" — the same rule SP-4 carries for the disk.
    // Without it, an image that cannot be pulled would skip M-B5 and call it an
    // upstream release.
    expect(movedMessage(WRITTEN_AGAINST, { nifi: null, api: null })).toBeNull();
  });

  test('B5-33 the message names both pairs and the one place to re-pin', () => {
    const m = movedMessage(WRITTEN_AGAINST, { nifi: '2.12.0', api: '2.11.0' }) ?? '';
    expect(m).toContain(LIQUID_IMAGE);
    expect(m).toContain(`written against  nifi ${WRITTEN_AGAINST.nifi}, api ${WRITTEN_AGAINST.api}`);
    expect(m).toContain('not a defect in the code under test');
    expect(m).toContain('tests/lib/liquidimage.ts');
  });
});

describe('B5-33 and the reading itself works against the real image', () => {
  test('B5-33 both versions are read out of the image, not told to it', () => {
    // The probe's own control. Whether they *equal* WRITTEN_AGAINST is the
    // question this file refuses to assert; that they can be read is what makes
    // the question answerable at all.
    const v = liquidImageVersions();
    expect(v.nifi, 'no NiFi version read from the image').toMatch(/^\d+\.\d+\.\d+/);
    expect(v.api, 'no API version read from the image').toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('B5-33 the voice cannot be removed by accident', () => {
  test('B5-33 the runner says which state the image is in, before the run', () => {
    const runner = readFileSync(join(repoRoot, 'tests/run.sh'), 'utf8');
    expect({
      readsTheImage: /liquidimage\.ts/.test(runner),
      saysWhenItMoved: /liquid image MOVED/.test(runner),
      saysWhenItDidNot: /as the cases expect/.test(runner)
    }).toEqual({ readsTheImage: true, saysWhenItMoved: true, saysWhenItDidNot: true });
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
