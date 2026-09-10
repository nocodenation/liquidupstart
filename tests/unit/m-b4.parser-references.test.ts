/**
 * M-B4 · Unit · The parser reads what the class actually references
 *
 * Purpose:  FR36 rests entirely on this list being right. Too small and a
 *           mismatched bundle ships; too large and a correct deployment is
 *           refused at the door. The case reads a class nar-build compiled, out
 *           of the archive nar-build wrote, so it cannot drift from the builder.
 * Given:    The B1-5 source with the body §4 uses -- an AbstractProcessor whose
 *           onTrigger is getLogger().debug("probe alive") -- built by nar-build
 *           into b4-probe-nar-1.0.0.nar, and ProbeProcessor.class taken out of
 *           the jar the nar-maven-plugin bundles under NAR-INF.
 * When:     narcheck.py refs is run against that class file.
 * Then:     Exactly org/apache/nifi/logging/ComponentLog and
 *           org/apache/nifi/processor/AbstractProcessor, and no other
 *           org/apache/nifi name. The specification predicted four, adding
 *           ProcessContext and ProcessSession; the class file does not carry
 *           them as class constants, because a parameter type lives in the
 *           method descriptor, which is a Utf8 constant. The case asserts that
 *           difference rather than papering over it: the descriptor text is in
 *           the file, and the parser does not report it.
 * Covers:   B4-1, FR36
 * Unhappy:  B4-3 is the counterpart on a file that cannot be parsed at all.
 */
import { test, expect, afterAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildNar,
  classFromNar,
  referenceSet,
  scratch,
  discardScratch,
  requireBuilt,
  PROBE_ALIVE_SOURCE
} from '../lib/narcheckfixture';

const CLASS = 'org/nocodenation/probe/ProbeProcessor';
const EXPECTED = [
  'org/apache/nifi/logging/ComponentLog',
  'org/apache/nifi/processor/AbstractProcessor'
];
const DESCRIPTOR_ONLY = [
  'org/apache/nifi/processor/ProcessContext',
  'org/apache/nifi/processor/ProcessSession'
];

const built = buildNar('.b4-probe', 'ProbeProcessor', PROBE_ALIVE_SOURCE, 'b4-probe-nar-1.0.0.nar');
let classFile = '';

afterAll(() => discardScratch());

test('B4-1 nar-build produced the bundle the case reads', () => {
  requireBuilt(built);
  classFile = classFromNar(built.nar, CLASS, join(scratch(), 'probe-open'));
});

test('B4-1 the parser reports exactly the org/apache/nifi classes the source uses', () => {
  expect(referenceSet(classFile)).toEqual(EXPECTED);
});

test('B4-1 a parameter type is in the file but is not a class reference', () => {
  const bytes = readFileSync(classFile).toString('latin1');
  for (const name of DESCRIPTOR_ONLY) {
    expect(bytes).toContain(name);
    expect(referenceSet(classFile)).not.toContain(name);
  }
});
