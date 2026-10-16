/**
 * M-B6 · Unit · Silence is not consent, in the one mode that said it was
 *
 * Purpose:  S4 of the 2026-10-01 review. `check` builds its judged set from the
 *           packages declared by the nifi-api jars in the library it is given.
 *           With no such jar the set is empty, every reference is skipped by the
 *           package filter, and the bundle is permitted -- for having been judged
 *           against nothing. The reviewer measured it on a real bundle: a stock
 *           NAR with its parent stripped is refused against the full lib, and
 *           permitted against the same lib with the nifi-api jar removed, and
 *           permitted against `/does/not/exist`.
 *
 *           `index` mode already refused that condition. `check` is the mode
 *           `nar-build` reaches through the builder, so the permissive one sat in
 *           the path of a deployment.
 *
 *           It survived because its own positive control could not see it:
 *           B4-3's lib was empty, so "the control is permitted" and "the control
 *           was judged against nothing" were one observation. That fixture is
 *           corrected in the same change.
 * Given:    One readable archive, b6-plain.nar, carrying a single entry
 *           notes.txt holding `probe` -- the same shape as B4-3's control. Three
 *           libraries: one holding `nifi-api-0.0.0-probe.jar` which declares
 *           org/apache/nifi/controller, one holding only
 *           `nifi-utils-0.0.0-probe.jar` so the directory is not empty and the
 *           only thing absent is what decides which packages may be judged, and
 *           a path that does not exist.
 * When:     narcheck.py check is run against each.
 * Then:     The first permits it. The other two refuse, and the reason they give
 *           is that there is nothing to judge against.
 *
 *           The bundle's contents are deliberately beside the point: the finding
 *           is that the check never looks, so the case holds that the refusal
 *           comes from the library rather than from the bundle. That a genuinely
 *           unsound bundle is caught is B4-5 and B4-6, against real NARs built by
 *           Maven -- this file does not duplicate them, and does not hand-make a
 *           constant pool, which M-B4 decided against.
 * Covers:   B6-10, B6-11, FR36, NFR3
 * Unhappy:  B6-10's two refusals are the finding. B6-11 is the counterpart and it
 *           has to come first: without it the case is met by a check that refuses
 *           everything, which the feature documents call worse than no check.
 */
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  guard, fakeApiJar, narWithEntries, scratch, discardScratch, MISSING_CLASS
} from '../lib/narcheckfixture';

const work = join(scratch(), 'b6-10');
mkdirSync(work, { recursive: true });
afterAll(() => discardScratch());

const judgedLib = join(work, 'judged-lib');
const noApiLib = join(work, 'no-api-lib');
fakeApiJar(judgedLib, 'nifi-api-0.0.0-probe.jar', [`${MISSING_CLASS}.class`]);
fakeApiJar(noApiLib, 'nifi-utils-0.0.0-probe.jar', ['org/apache/nifi/util/Something.class']);
const absentLib = join(work, 'does-not-exist');

const plain = narWithEntries(join(work, 'b6-plain.nar'), { 'notes.txt': 'probe' });

const withApi = guard(plain, judgedLib);
const withoutApi = guard(plain, noApiLib);
const withAbsent = guard(plain, absentLib);

describe('B6-11 the counterpart, and it comes first: a library that can judge permits', () => {
  test('B6-11 a readable bundle against a library with a nifi-api jar is permitted', () => {
    expect({ code: withApi.code, output: withApi.output }).toEqual({ code: 0, output: '' });
  });
});

describe('B6-10 a library with nothing to judge against is refused, not permitted', () => {
  test('B6-10 a library holding no nifi-api jar is refused', () => {
    // Measured before the fix: exit 0 and no output, for any bundle at all.
    expect(withoutApi.code).toBe(1);
    expect(withoutApi.output).toMatch(/no nifi-api/);
  });

  test('B6-10 and a library that is not there is refused too', () => {
    expect(withAbsent.code).toBe(1);
    expect(withAbsent.output).toMatch(/no nifi-api/);
  });

  test('B6-10 the refusal says what it could not do, and claims no finding', () => {
    // The A8-26 shape: a check that cannot judge must not report something it
    // never established. Neither refusal may name a class.
    for (const r of [withoutApi, withAbsent]) {
      expect(r.output).not.toContain(MISSING_CLASS.replace(/\//g, '.'));
      expect(r.output).toMatch(/not deployed|nothing/i);
    }
  });
});
