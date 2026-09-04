/**
 * M-A0 · Unit · The runner discovers test files under every level directory
 *
 * Purpose:  Prove that run.sh finds test files across the level directories and
 *           reports them, so a milestone run cannot silently cover less than it
 *           appears to. Discovery is checked via --list rather than by executing
 *           a full run, which would recurse into this very test.
 * Given:    A fixture tree holding one test file under unit/, one under
 *           integration/, one under system/ and one under e2e/.
 * When:     run.sh is invoked against that tree with --list.
 * Then:     Every file is listed, the exit code is 0, and the two levels that
 *           need the running stack are listed last.
 * Covers:   A0-1
 * Unhappy:  A filter matching nothing is covered by m-a0.runner-filter.
 *
 *           Amended 2026-09-04 for M-A7, which adds the e2e level. A level the
 *           runner does not know about is a directory of tests nobody runs, and
 *           nothing would have said so: before this amendment the case asserted
 *           two files and would have passed unchanged with tests/e2e ignored.
 *           The ordering assertion is here rather than in the M-A7 files because
 *           it is a property of the runner: end-to-end tests need the stack, so
 *           they run with the system level and after everything that does not.
 */
import { test, expect, afterAll } from 'bun:test';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';

const tree = makeTree({
  'unit/m-fx.one.test.ts': PASSING,
  'integration/m-fx.two.test.ts': PASSING,
  'system/m-fx.three.test.ts': PASSING,
  'e2e/m-fx.four.test.ts': PASSING
});
afterAll(() => dropTree(tree));

test('A0-1 lists every discovered file and exits 0', () => {
  const r = runner(['--root', tree, '--list']);
  expect(r.code).toBe(0);
  for (const file of ['one', 'two', 'three', 'four']) {
    expect(r.stdout).toContain(`m-fx.${file}.test.ts`);
  }
  expect(r.stdout.trim().split('\n')).toHaveLength(4);
});

test('A0-1 restricts discovery to the milestone filter', () => {
  const r = runner(['fx', '--root', tree, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout.trim().split('\n')).toHaveLength(4);
});

test('A0-1 the levels that need the stack are discovered, and listed last', () => {
  const listed = runner(['--root', tree, '--list']).stdout.trim().split('\n');
  const level = (path: string) => path.split('/').at(-2);
  expect(listed.map(level).slice(0, 2).sort()).toEqual(['integration', 'unit']);
  expect(listed.map(level).slice(2)).toEqual(['system', 'e2e']);
});
