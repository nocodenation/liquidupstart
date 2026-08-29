/**
 * M-A0 · Unit · The runner discovers test files under every level directory
 *
 * Purpose:  Prove that run.sh finds test files across the level directories and
 *           reports them, so a milestone run cannot silently cover less than it
 *           appears to. Discovery is checked via --list rather than by executing
 *           a full run, which would recurse into this very test.
 * Given:    A fixture tree holding one test file under unit/ and one under
 *           integration/.
 * When:     run.sh is invoked against that tree with --list.
 * Then:     Both files are listed and the exit code is 0.
 * Covers:   A0-1
 * Unhappy:  A filter matching nothing is covered by m-a0.runner-filter.
 */
import { test, expect, afterAll } from 'bun:test';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';

const tree = makeTree({
  'unit/m-fx.one.test.ts': PASSING,
  'integration/m-fx.two.test.ts': PASSING
});
afterAll(() => dropTree(tree));

test('A0-1 lists every discovered file and exits 0', () => {
  const r = runner(['--root', tree, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('m-fx.one.test.ts');
  expect(r.stdout).toContain('m-fx.two.test.ts');
  expect(r.stdout.trim().split('\n')).toHaveLength(2);
});

test('A0-1 restricts discovery to the milestone filter', () => {
  const r = runner(['fx', '--root', tree, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout.trim().split('\n')).toHaveLength(2);
});
