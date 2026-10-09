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
import { guard, narWithEntries, fakeApiJar, scratch, discardScratch, MISSING_CLASS } from '../lib/narcheckfixture';
import type { Result } from '../lib/shell';

const BROKEN_ENTRY = 'org/nocodenation/probe/Broken.class';
const BROKEN_BYTES = 'not a class file';
const EMPTY_ENTRY = 'notes.txt';
const EMPTY_BYTES = 'probe';

const work = join(scratch(), 'b4-3');
mkdirSync(work, { recursive: true });
// A lib holding one nifi-api jar, and nothing else.
//
// **It was empty until 2026-10-05, and that made the control worthless.** With no
// nifi-api jar there is nothing in `judged`, so every reference is skipped and
// any bundle is permitted -- so "the control is permitted" could not be told
// apart from "the control was judged against nothing". S4 of the 2026-10-01
// review names the product half of that; this is the fixture half, and the two
// were the same oversight. `check` now refuses a lib with no nifi-api jar, which
// turned this case red until the jar was added.
//
// The jar declares one package, which is enough to make `judged` non-empty. The
// bundle under test carries no class at all, so nothing is resolved against it
// either way: what the control still shows is that a readable archive with
// nothing to judge is permitted, which is the counterpart to the refusal.
const judgedLib = join(work, 'lib');
mkdirSync(judgedLib, { recursive: true });
fakeApiJar(judgedLib, 'nifi-api-0.0.0-probe.jar', ['org/apache/nifi/processor/Processor.class']);
const broken = narWithEntries(join(work, 'b4-broken.nar'), { [BROKEN_ENTRY]: BROKEN_BYTES });
const clean = narWithEntries(join(work, 'b4-empty.nar'), { [EMPTY_ENTRY]: EMPTY_BYTES });

let refused: Result;

afterAll(() => discardScratch());

test('B4-3 the bundle carrying an unreadable class is refused', () => {
  refused = guard(broken, judgedLib);
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
  const r = guard(clean, judgedLib);
  expect(r.code).toBe(0);
  expect(r.output.trim()).toBe('');
});
