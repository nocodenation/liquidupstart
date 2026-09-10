/**
 * M-B4 · Unit · An unreadable bundle is not a clean bundle · UNHAPPY
 *
 * Purpose:  The failure mode this repository keeps meeting: a check that cannot
 *           read something, finds nothing wrong in the nothing it read, and
 *           treats silence as consent. A8-26 and the mapfile defect are the
 *           same shape. FR36 is a refusal, so the parser failing must refuse
 *           too, and it must say which file it could not read rather than
 *           inventing a missing class.
 * Given:    Two archives written for this case. The unreadable one,
 *           b4-broken.nar, carries a single entry
 *           org/nocodenation/probe/Broken.class holding the bytes
 *           `not a class file`, which do not begin with 0xCAFEBABE. The control,
 *           b4-empty.nar, is a valid archive carrying one entry, notes.txt with
 *           the line `probe`, and no class at all. The lib directory is empty in
 *           both runs, so nothing but readability is being decided.
 * When:     narcheck.py check is run against each.
 * Then:     The broken one is refused, named, and the reason given is that the
 *           class could not be read -- with no missing class named, since none
 *           was established. The control is permitted, which is what makes the
 *           refusal a judgement about the file rather than about archives.
 * Covers:   B4-3, FR36
 * Unhappy:  This is the unhappy case; b4-empty.nar in the same file is its
 *           positive counterpart, and B4-5 is the counterpart on a real NAR.
 */
import { test, expect, afterAll } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { guard, narWithEntries, scratch, discardScratch, MISSING_CLASS } from '../lib/narcheckfixture';
import type { Result } from '../lib/shell';

const BROKEN_ENTRY = 'org/nocodenation/probe/Broken.class';
const BROKEN_BYTES = 'not a class file';
const EMPTY_ENTRY = 'notes.txt';
const EMPTY_BYTES = 'probe';

const work = join(scratch(), 'b4-3');
mkdirSync(work, { recursive: true });
const emptyLib = join(work, 'lib');
mkdirSync(emptyLib, { recursive: true });
const broken = narWithEntries(join(work, 'b4-broken.nar'), { [BROKEN_ENTRY]: BROKEN_BYTES });
const clean = narWithEntries(join(work, 'b4-empty.nar'), { [EMPTY_ENTRY]: EMPTY_BYTES });

let refused: Result;

afterAll(() => discardScratch());

test('B4-3 the bundle carrying an unreadable class is refused', () => {
  refused = guard(broken, emptyLib);
  expect(refused.code).toBe(1);
});

test('B4-3 the refusal names the bundle and the file it could not read', () => {
  expect(refused.output).toContain('b4-broken.nar');
  expect(refused.output).toContain(BROKEN_ENTRY);
});

test('B4-3 it says the class could not be read, and names no missing class', () => {
  expect(refused.output).toContain('0xCAFEBABE');
  expect(refused.output.toLowerCase()).toMatch(/could not be read|does not begin/);
  expect(refused.output).not.toContain(MISSING_CLASS);
  expect(refused.output).not.toContain(MISSING_CLASS.replace(/\//g, '.'));
});

test('B4-3 it names a next step', () => {
  expect(refused.output).toContain('nar-build --target');
});

test('B4-3 an archive it can read, carrying no classes, is permitted', () => {
  const r = guard(clean, emptyLib);
  expect(r.code).toBe(0);
  expect(r.output.trim()).toBe('');
});
