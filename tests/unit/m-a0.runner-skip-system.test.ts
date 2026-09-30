/**
 * M-A0 · Unit · Skipped system tests are reported as skipped, never as passed
 *
 * Purpose:  With --no-system and nothing but stack-dependent tests selected,
 *           the run must not look like a success that proved something. It
 *           exits 0 so the flag stays usable in environments without Docker,
 *           but it says plainly that the tests were skipped.
 * Given:    A fixture tree whose only test files live under the two levels that
 *           need the stack, system/ and e2e/.
 * When:     run.sh runs that tree with --no-system.
 * Then:     Exit code 0, the output contains SKIPPED and no pass count.
 * Covers:   A0-4
 * Unhappy:  Without the flag the same tree runs both files normally.
 *
 *           Amended 2026-09-04 for M-A7. The e2e level needs the stack for the
 *           same reason system does, so --no-system has to drop it too; a level
 *           the flag did not know about would fail on a machine with no Docker
 *           and the flag would be reported as broken rather than the level.
 *
 *           Amended 2026-09-17 for M-A11, which reversed the default. These
 *           levels write into volumes/ and restart containers on the machine the
 *           suite runs on, and they ran unless someone remembered --no-system;
 *           on 2026-09-17 one forgotten flag left the operator's gateway exited
 *           127 and its configuration short of a key. So --system asks for them,
 *           --no-system now describes the default, and the case below that
 *           asserted "without the flag both are selected" asserts the opposite
 *           — same subject, reversed expectation, and the reason is here rather
 *           than in a commit nobody will read again.
 */
import { test, expect, afterAll } from 'bun:test';
import { runner } from '../lib/shell';
import { makeTree, dropTree, PASSING } from '../lib/fixtures';

const systemOnly = makeTree({
  'system/m-fx.stack.test.ts': PASSING,
  'e2e/m-fx.chain.test.ts': PASSING
});
const mixed = makeTree({
  'system/m-fx.stack.test.ts': PASSING,
  'e2e/m-fx.chain.test.ts': PASSING,
  'unit/m-fx.plain.test.ts': PASSING
});
afterAll(() => {
  dropTree(systemOnly);
  dropTree(mixed);
});

test('A0-4 system-only selection with --no-system reports SKIPPED', () => {
  const r = runner(['--root', systemOnly, '--no-system']);
  expect(r.code).toBe(0);
  expect(r.output).toContain('SKIPPED');
  expect(r.output).not.toContain('1 pass');
});

test('A0-4 --no-system drops only the stack-level files from a mixed tree', () => {
  const r = runner(['--root', mixed, '--no-system', '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('m-fx.plain.test.ts');
  expect(r.stdout).not.toContain('m-fx.stack.test.ts');
  expect(r.stdout).not.toContain('m-fx.chain.test.ts');
});

test('A0-4 without the flag neither stack-level file is selected', () => {
  const r = runner(['--root', systemOnly, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).not.toContain('m-fx.stack.test.ts');
  expect(r.stdout).not.toContain('m-fx.chain.test.ts');
  // And it says so, rather than leaving a tree that produced nothing looking
  // like a tree that held nothing.
  expect(r.output).toContain('SKIPPED');
});

test('A0-4 --system selects both stack-level files', () => {
  // The counterpart to the reversal: the flag has to reach them, or the tier is
  // unreachable and the suite has stopped testing the running product.
  const r = runner(['--root', systemOnly, '--system', '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('m-fx.stack.test.ts');
  expect(r.stdout).toContain('m-fx.chain.test.ts');
});
