/**
 * M-B4 · Unit · A name in a string is not a reference · NEGATIVE
 *
 * Purpose:  The decision that the check parses the constant pool rather than
 *           scanning the bytes for strings, made assertable. A scan finds this
 *           class name and refuses a bundle that is entirely correct, and a
 *           false refusal breaks a deployment that was working -- worse, here,
 *           than admitting a broken one. This is one of the two cases that
 *           decide whether the milestone is worth having.
 * Given:    A processor whose onTrigger body is
 *           getLogger().debug("org/apache/nifi/controller/NodeConnectionState");
 *           -- the literal, in the only place that makes the two methods
 *           disagree -- compiled by nar-build into b4-literal-nar-1.0.0.nar, so
 *           the constant pool is real rather than hand-made.
 * When:     narcheck.py refs is run against LiteralProcessor.class.
 * Then:     The name is in the file's bytes, so a scan would report it; the
 *           parser does not. The class's genuine references are reported, so
 *           the case cannot pass by returning nothing.
 * Covers:   B4-2, FR36
 * Unhappy:  B4-1 is the positive counterpart -- the same parser on a class
 *           whose references are real, where every one of them must appear.
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
  LITERAL_SOURCE,
  MISSING_CLASS
} from '../lib/narcheckfixture';

const CLASS = 'org/nocodenation/probe/LiteralProcessor';
const GENUINE = [
  'org/apache/nifi/logging/ComponentLog',
  'org/apache/nifi/processor/AbstractProcessor'
];

const built = buildNar('.b4-literal', 'LiteralProcessor', LITERAL_SOURCE, 'b4-literal-nar-1.0.0.nar');
let classFile = '';

afterAll(() => discardScratch());

test('B4-2 nar-build produced the bundle the case reads', () => {
  requireBuilt(built);
  classFile = classFromNar(built.nar, CLASS, join(scratch(), 'literal-open'));
});

test('B4-2 a text scan over the class would find the name', () => {
  expect(readFileSync(classFile).toString('latin1')).toContain(MISSING_CLASS);
});

test('B4-2 the parser does not report it', () => {
  expect(referenceSet(classFile)).not.toContain(MISSING_CLASS);
});

test('B4-2 and it does report what the class genuinely references', () => {
  expect(referenceSet(classFile)).toEqual(GENUINE);
});
