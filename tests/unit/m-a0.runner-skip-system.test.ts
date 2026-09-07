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

test('A0-4 without the flag both stack-level files are selected', () => {
  const r = runner(['--root', systemOnly, '--list']);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('m-fx.stack.test.ts');
  expect(r.stdout).toContain('m-fx.chain.test.ts');
});
