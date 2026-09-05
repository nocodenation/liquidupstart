/**
 * M-A0 · Unit · The runner reports failure when a test fails
 *
 * Purpose:  A runner that always exits 0 is worse than no runner, because every
 *           downstream milestone gate would be meaningless. This proves the
 *           negative path really propagates.
 * Given:    A fixture tree containing one deliberately failing test, created in
 *           a temporary directory so no failing test is left in the repository.
 * When:     run.sh executes that tree.
 * Then:     The exit code is non-zero and the output names the failure.
 * Covers:   A0-2
 * Unhappy:  This test *is* the unhappy path; the passing counterpart is A0-1.
 */
import { test, expect, afterAll } from 'bun:test';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING, FAILING } from '../lib/fixtures';

const tree = makeTree({
  'unit/m-fx.good.test.ts': PASSING,
  'unit/m-fx.bad.test.ts': FAILING
});
afterAll(() => dropTree(tree));

test('A0-2 a failing test makes the runner exit non-zero', () => {
  const r = runner(['--root', tree]);
  expect(r.code).not.toBe(0);
  expect(r.output).toContain('fixture fails on purpose');
});

test('A0-2 a tree of only passing tests exits 0', () => {
  const good = makeTree({ 'unit/m-fx.good.test.ts': PASSING });
  try {
    const r = runner(['--root', good]);
    expect(r.code).toBe(0);
  } finally {
    dropTree(good);
  }
});
