/**
 * M-A0 · Unit · A milestone filter matching nothing is an error, not a pass
 *
 * Purpose:  The most dangerous green is the one where nothing ran. A typo in a
 *           milestone id must fail loudly instead of reporting success on an
 *           empty set.
 * Given:    A fixture tree whose only test file belongs to milestone "fx".
 * When:     run.sh is invoked with a milestone id that matches no file.
 * Then:     The exit code is non-zero and the message says no tests matched.
 * Covers:   A0-3
 * Unhappy:  Also asserts the positive control — the real id does match.
 */
import { test, expect, afterAll } from 'bun:test';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';

const tree = makeTree({ 'unit/m-fx.only.test.ts': PASSING });
afterAll(() => dropTree(tree));

test('A0-3 an unmatched milestone filter exits non-zero', () => {
  const r = runner(['zz', '--root', tree, '--list']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('no tests matched');
});

test('A0-3 the matching milestone filter still succeeds', () => {
  const r = runner(['fx', '--root', tree, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('m-fx.only.test.ts');
});

test('A0-3 a missing test root exits non-zero', () => {
  const r = runner(['--root', `${tree}-does-not-exist`, '--list']);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('test root not found');
});
